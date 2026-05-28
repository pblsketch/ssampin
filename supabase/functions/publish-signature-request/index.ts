import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  corsHeaders,
  errorResponse,
  internalErrorResponse,
  jsonResponse,
} from '../_shared/cors.ts';
import { checkRateLimit, clientIpFrom } from '../_shared/rateLimit.ts';

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
  if (
    typeof payload.storagePath !== 'string' ||
    !payload.storagePath.startsWith('signature-templates/')
  ) {
    return 'pdfTemplate.storagePath 가 signature-templates/ 로 시작해야 합니다.';
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
    if (!region || typeof region.id !== 'string' || region.id.length === 0) {
      return 'region.id 가 누락되었습니다.';
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

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
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
      status: 'active',
      pdf_template: body.pdfTemplate ?? null,
      regions: remappedRegions,
      region_version: regionVersion,
    });

    if (insertRequestError) {
      return internalErrorResponse('publish-signature-request request', insertRequestError);
    }

    const participantRows: Array<{
      id: string;
      clientId: string;
      displayName: string;
      studentNumber?: number;
    }> = [];

    for (const participant of body.participants) {
      const trimmedName = participant.displayName?.trim() ?? '';
      if (!trimmedName) {
        return errorResponse('명단에 빈 이름이 포함되었습니다.', 400);
      }
      const role = ALLOWED_ROLES.has(participant.role) ? participant.role : 'staff';
      const tokenHash = participant.uniqueLinkToken
        ? await sha256Hex(participant.uniqueLinkToken)
        : null;
      const pinHash =
        access.pinEnabled && participant.pin ? await sha256Hex(participant.pin) : null;
      const participantId = clientIdToServerId.get(participant.clientId) ?? crypto.randomUUID();

      const { error: insertParticipantError } = await supabase
        .from('signature_participants')
        .insert({
          id: participantId,
          request_id: requestId,
          display_name: trimmedName,
          role,
          student_number: participant.studentNumber ?? null,
          class_name: participant.className ?? null,
          required_signature_kinds: participant.requiredSignatureKinds ?? ['recipient'],
          unique_link_token_hash: tokenHash,
          pin_hash: pinHash,
        });
      if (insertParticipantError) {
        return internalErrorResponse(
          'publish-signature-request participant',
          insertParticipantError,
        );
      }
      participantRows.push({
        id: participantId,
        clientId: participant.clientId,
        displayName: trimmedName,
        studentNumber: participant.studentNumber,
      });
    }

    return jsonResponse({
      requestId,
      adminKey,
      participants: participantRows,
    });
  } catch (err) {
    return internalErrorResponse('publish-signature-request', err);
  }
});
