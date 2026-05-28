import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  corsHeaders,
  errorResponse,
  internalErrorResponse,
  jsonResponse,
} from '../_shared/cors.ts';
import { checkRateLimit, clientIpFrom } from '../_shared/rateLimit.ts';
import { sha256Hex } from '../_shared/hash.ts';
import { isValidRegionId, isValidTemplateStoragePath } from '../_shared/validators.ts';

interface PublishParticipantPayload {
  readonly clientId: string;
  readonly displayName: string;
  readonly role: string;
  readonly studentNumber?: number;
  readonly className?: string;
  readonly requiredSignatureKinds: readonly string[];
  readonly uniqueLinkToken?: string;
  readonly pin?: string;
}

interface PublishPdfTemplatePayload {
  readonly storagePath: string;
  readonly pageCount: number;
  readonly fileSize: number;
  readonly uploadedAt: string;
}

interface PublishRegionPayload {
  readonly id: string;
  readonly pageIndex: number;
  readonly rect: { x: number; y: number; w: number; h: number };
  readonly participantId: string;
  readonly signatureKind: string;
  readonly autoReplicateRowSourceId?: string;
}

interface PublishBody {
  readonly title?: string;
  readonly description?: string;
  readonly templateKind?: string;
  readonly templateSource?: { type?: string; url?: string };
  readonly mapping?: unknown;
  readonly access?: { uniqueLinksEnabled?: boolean; pinEnabled?: boolean };
  readonly participants?: readonly PublishParticipantPayload[];
  readonly teacherId?: string;
  /** Phase 2C v2: teacher-uploaded PDF metadata (migration 030 columns). */
  readonly pdfTemplate?: PublishPdfTemplatePayload;
  /** Phase 2C v2: signature regions in normalized 0~1 coordinates. */
  readonly regions?: readonly PublishRegionPayload[];
  /** Phase 2C v2: region revision counter for pre-render cache-bust. */
  readonly regionVersion?: number;
}

const ALLOWED_TEMPLATE_KINDS = new Set([
  'general-register',
  'training-register',
  'absence-form',
  'notice-form',
  'custom',
]);

const ALLOWED_ROLES = new Set(['teacher', 'student', 'parent', 'guardian', 'staff', 'custom']);

const ALLOWED_SIGNATURE_KINDS = new Set(['recipient', 'student', 'parent', 'guardian', 'teacher']);

const MAX_REGIONS = 1000;
const MAX_PDF_PAGE_COUNT = 50;

function isFiniteFraction(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function validatePdfTemplate(payload: PublishPdfTemplatePayload | undefined): string | null {
  if (!payload) return null;
  if (!isValidTemplateStoragePath(payload.storagePath)) {
    return 'pdfTemplate.storagePath 형식이 올바르지 않습니다 (signature-templates/{owner}/{filename}.pdf).';
  }
  if (
    typeof payload.pageCount !== 'number' ||
    !Number.isInteger(payload.pageCount) ||
    payload.pageCount < 1 ||
    payload.pageCount > MAX_PDF_PAGE_COUNT
  ) {
    return `pdfTemplate.pageCount 가 1~${MAX_PDF_PAGE_COUNT} 사이여야 합니다.`;
  }
  if (typeof payload.fileSize !== 'number' || payload.fileSize <= 0) {
    return 'pdfTemplate.fileSize 가 양수여야 합니다.';
  }
  if (typeof payload.uploadedAt !== 'string' || payload.uploadedAt.length === 0) {
    return 'pdfTemplate.uploadedAt 누락.';
  }
  return null;
}

function validateRegions(
  regions: readonly PublishRegionPayload[] | undefined,
  participantClientIds: ReadonlySet<string>,
  pageCount: number | undefined,
): string | null {
  if (!regions) return null;
  if (!Array.isArray(regions)) return 'regions 가 배열이 아닙니다.';
  if (regions.length > MAX_REGIONS) return `regions 가 너무 많습니다 (>${MAX_REGIONS}).`;
  const seenIds = new Set<string>();
  for (const region of regions) {
    if (!region || !isValidRegionId(region.id)) {
      return 'region.id 가 누락되었거나 형식이 잘못되었습니다 (영숫자/_-, 80자 이하).';
    }
    if (seenIds.has(region.id)) return `region.id 중복: ${region.id}`;
    seenIds.add(region.id);
    if (typeof region.pageIndex !== 'number' || region.pageIndex < 0) {
      return `region(${region.id}).pageIndex 가 잘못되었습니다.`;
    }
    if (pageCount !== undefined && region.pageIndex >= pageCount) {
      return `region(${region.id}).pageIndex 가 pageCount(${pageCount}) 를 초과합니다.`;
    }
    if (
      !region.rect ||
      !isFiniteFraction(region.rect.x) ||
      !isFiniteFraction(region.rect.y) ||
      !isFiniteFraction(region.rect.w) ||
      !isFiniteFraction(region.rect.h)
    ) {
      return `region(${region.id}).rect 좌표가 0~1 범위를 벗어났습니다.`;
    }
    if (region.rect.x + region.rect.w > 1.0001 || region.rect.y + region.rect.h > 1.0001) {
      return `region(${region.id}) 가 페이지 경계를 벗어납니다.`;
    }
    if (
      typeof region.participantId !== 'string' ||
      !participantClientIds.has(region.participantId)
    ) {
      return `region(${region.id}).participantId 가 명단에 없습니다.`;
    }
    if (!ALLOWED_SIGNATURE_KINDS.has(region.signatureKind)) {
      return `region(${region.id}).signatureKind 가 허용되지 않았습니다.`;
    }
  }
  return null;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return errorResponse('POST only', 405);
  }

  try {
    const body = (await req.json()) as PublishBody;

    if (!body.title || body.title.trim().length === 0) {
      return errorResponse('title이 필요합니다.', 400);
    }
    if (body.title.trim().length > 200) {
      return errorResponse('title이 너무 깁니다.', 400);
    }
    if (!body.templateKind || !ALLOWED_TEMPLATE_KINDS.has(body.templateKind)) {
      return errorResponse('지원하지 않는 templateKind입니다.', 400);
    }
    if (!body.templateSource?.type || !body.templateSource.url) {
      return errorResponse('templateSource가 누락되었습니다.', 400);
    }
    if (!Array.isArray(body.participants) || body.participants.length === 0) {
      return errorResponse('participants가 비어 있습니다.', 400);
    }
    if (body.participants.length > 500) {
      return errorResponse('명단 인원이 너무 많습니다.', 400);
    }
    if (!body.access || typeof body.access.uniqueLinksEnabled !== 'boolean') {
      return errorResponse('access 옵션이 누락되었습니다.', 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const clientIP = clientIpFrom(req);
    const isLimited = await checkRateLimit(supabase, 'publish-signature-request', [
      { identifier: clientIP, windowMs: 3_600_000, max: 30 },
    ]);
    if (isLimited) {
      return errorResponse('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', 429);
    }

    const requestId = crypto.randomUUID();
    const adminKey = crypto.randomUUID();
    const teacherId = body.teacherId?.trim() || `anon-${await sha256Hex(clientIP)}`;
    const access = {
      uniqueLinksEnabled: Boolean(body.access.uniqueLinksEnabled),
      pinEnabled: Boolean(body.access.pinEnabled),
    };

    // pdfTemplate / regions / regionVersion 검증 (Phase 2C v2 migration 030 컬럼)
    const pdfTemplateError = validatePdfTemplate(body.pdfTemplate);
    if (pdfTemplateError) {
      return errorResponse(pdfTemplateError, 400);
    }
    const participantClientIds = new Set<string>(
      body.participants.map((p) => p.clientId).filter((id): id is string => typeof id === 'string'),
    );
    const regionsError = validateRegions(
      body.regions,
      participantClientIds,
      body.pdfTemplate?.pageCount,
    );
    if (regionsError) {
      return errorResponse(regionsError, 400);
    }
    const regionVersion = body.regionVersion ?? 0;
    if (
      typeof regionVersion !== 'number' ||
      !Number.isInteger(regionVersion) ||
      regionVersion < 0
    ) {
      return errorResponse('regionVersion 이 0 이상의 정수여야 합니다.', 400);
    }

    // 참여자 server UUID 사전 발급 → regions 매핑 용도
    const clientIdToServerId = new Map<string, string>();
    for (const participant of body.participants) {
      if (typeof participant.clientId === 'string' && participant.clientId.length > 0) {
        clientIdToServerId.set(participant.clientId, crypto.randomUUID());
      }
    }
    // regions 의 participantId 를 server UUID 로 remap (clientId → serverId)
    const remappedRegions =
      body.regions?.map((region) => ({
        id: region.id,
        pageIndex: region.pageIndex,
        rect: region.rect,
        participantId: clientIdToServerId.get(region.participantId) ?? region.participantId,
        signatureKind: region.signatureKind,
        autoReplicateRowSourceId: region.autoReplicateRowSourceId,
      })) ?? [];

    // UltraQA Q4: 트랜잭션 패턴 — request 'draft' INSERT → bulk participants INSERT →
    // request status='active' UPDATE. 어떤 단계라도 실패 시 cleanup 으로 orphan 방지.
    // Supabase JS 클라이언트는 multi-statement transaction 미지원 → 단계별 보상 패턴 사용.
    // signature_requests 가 'draft' 상태이면 get-signature-request-public 의 .in(['active','closed'])
    // 필터에 막혀 공개 노출되지 않음 (안전한 transient state).
    const { error: insertRequestError } = await supabase.from('signature_requests').insert({
      id: requestId,
      teacher_id: teacherId,
      admin_key: adminKey,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      template_kind: body.templateKind,
      template_source: body.templateSource,
      mapping: body.mapping ?? { textFields: [], signatureSlots: [] },
      access,
      scope: { legalEffect: 'none', automaticReminders: false, strongIdentityRequired: false },
      status: 'draft',
      pdf_template: body.pdfTemplate ?? null,
      regions: remappedRegions,
      region_version: regionVersion,
    });

    if (insertRequestError) {
      return internalErrorResponse('publish-signature-request request', insertRequestError);
    }

    // cleanup helper — 어느 단계에서든 실패 시 transient 'draft' row 삭제 후 에러 반환.
    const rollbackAndError = async (
      context: string,
      err: unknown,
      status = 500,
    ): Promise<Response> => {
      try {
        await supabase
          .from('signature_requests')
          .delete()
          .eq('id', requestId)
          .eq('status', 'draft');
      } catch (cleanupErr) {
        console.error(`[publish-signature-request] cleanup failed (${context}):`, cleanupErr);
      }
      if (status === 500) {
        return internalErrorResponse(context, err);
      }
      return errorResponse(typeof err === 'string' ? err : `${context} 실패`, status);
    };

    // 1) 참여자 행 + token/PIN 해시를 모두 병렬 사전 계산.
    const participantInputs: Array<{
      trimmedName: string;
      role: string;
      input: PublishParticipantPayload;
      id: string;
    }> = [];
    for (const participant of body.participants) {
      const trimmedName = participant.displayName?.trim() ?? '';
      if (!trimmedName) {
        return rollbackAndError(
          '명단에 빈 이름이 포함되었습니다',
          '명단에 빈 이름이 포함되었습니다.',
          400,
        );
      }
      const role = ALLOWED_ROLES.has(participant.role) ? participant.role : 'staff';
      const participantId = clientIdToServerId.get(participant.clientId) ?? crypto.randomUUID();
      participantInputs.push({ trimmedName, role, input: participant, id: participantId });
    }

    const hashedRows = await Promise.all(
      participantInputs.map(async (entry) => {
        const tokenHash = entry.input.uniqueLinkToken
          ? await sha256Hex(entry.input.uniqueLinkToken, 'no-pepper')
          : null;
        const pinHash =
          access.pinEnabled && entry.input.pin
            ? await sha256Hex(entry.input.pin, 'no-pepper')
            : null;
        return {
          id: entry.id,
          request_id: requestId,
          display_name: entry.trimmedName,
          role: entry.role,
          student_number: entry.input.studentNumber ?? null,
          class_name: entry.input.className ?? null,
          required_signature_kinds: entry.input.requiredSignatureKinds ?? ['recipient'],
          unique_link_token_hash: tokenHash,
          pin_hash: pinHash,
        };
      }),
    );

    // 2) 단일 bulk INSERT — 부분 실패 시 Postgres 가 전체 rollback (single statement).
    if (hashedRows.length > 0) {
      const { error: bulkInsertErr } = await supabase
        .from('signature_participants')
        .insert(hashedRows);
      if (bulkInsertErr) {
        return rollbackAndError('publish-signature-request participants', bulkInsertErr);
      }
    }

    // 3) request status='draft' → 'active' UPDATE (트랜잭션 commit 신호).
    const { error: activateErr } = await supabase
      .from('signature_requests')
      .update({ status: 'active' })
      .eq('id', requestId)
      .eq('status', 'draft');
    if (activateErr) {
      return rollbackAndError('publish-signature-request activate', activateErr);
    }

    const participantRows = participantInputs.map((entry) => ({
      id: entry.id,
      clientId: entry.input.clientId,
      displayName: entry.trimmedName,
      studentNumber: entry.input.studentNumber,
    }));

    return jsonResponse({
      requestId,
      adminKey,
      participants: participantRows,
    });
  } catch (err) {
    return internalErrorResponse('publish-signature-request', err);
  }
});
