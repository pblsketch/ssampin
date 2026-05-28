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

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return errorResponse('POST only', 405);
  }

  try {
    const { requestId, token } = await req.json();
    if (!requestId || typeof requestId !== 'string') {
      return errorResponse('requestId is required', 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const clientIP = clientIpFrom(req);
    const isLimited = await checkRateLimit(supabase, 'get-signature-request-public', [
      { identifier: clientIP, windowMs: 3_600_000, max: 120 },
      { identifier: `${requestId}:${clientIP}`, windowMs: 3_600_000, max: 120 },
    ]);
    if (isLimited) {
      return errorResponse('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', 429);
    }

    const { data: request, error: requestError } = await supabase
      .from('signature_requests')
      .select('id,title,description,status,access,due_at,pdf_template,regions,region_version')
      .eq('id', requestId)
      .in('status', ['active', 'closed'])
      .single();

    if (requestError || !request) {
      return errorResponse('서명 요청을 찾을 수 없습니다.', 404);
    }

    let participantQuery = supabase
      .from('signature_participants')
      .select('id,display_name,required_signature_kinds')
      .eq('request_id', requestId)
      .order('student_number', { ascending: true, nullsFirst: false })
      .order('display_name', { ascending: true });

    let resolvedParticipantId: string | undefined;
    if (token && typeof token === 'string') {
      // 호환: 기존 DB token hash 는 pepper 미적용 (publish 시 동일하게).
      const tokenHash = await sha256Hex(token, 'no-pepper');
      participantQuery = participantQuery.eq('unique_link_token_hash', tokenHash);
    }

    const { data: participants, error: participantError } = await participantQuery;
    if (participantError) {
      return internalErrorResponse('get-signature-request-public participants', participantError);
    }
    if (token && participants?.length === 0) {
      return errorResponse('개인 링크가 유효하지 않습니다.', 403);
    }
    if (token && participants?.[0]?.id) {
      resolvedParticipantId = participants[0].id;
    }

    // Phase 2C v2: PDF 양식이 있고 region_version 이 유효하면 signature-previews bucket 의
    // 페이지 PNG + region cutout PNG publicUrls 를 계산해 함께 응답한다.
    // 토큰 로그인 (개인 링크) 일 때는 본인 region 만 노출 — 다른 참여자 region 은 정보 누설 방지.
    const pdfTemplate = request.pdf_template as { storagePath?: string; pageCount?: number } | null;
    const regions = Array.isArray(request.regions)
      ? (request.regions as Array<{
          id: string;
          pageIndex: number;
          rect: { x: number; y: number; w: number; h: number };
          participantId: string;
          signatureKind: string;
        }>)
      : [];
    const regionVersion =
      typeof request.region_version === 'number' && request.region_version >= 0
        ? request.region_version
        : 0;

    let pagePreviewUrls: ReadonlyArray<{ pageIndex: number; publicUrl: string }> | undefined;
    let regionPreviewUrls: ReadonlyArray<{ regionId: string; publicUrl: string }> | undefined;
    let visibleRegions: typeof regions = [];

    if (pdfTemplate && typeof pdfTemplate.pageCount === 'number' && pdfTemplate.pageCount > 0) {
      // UltraQA Q6: anon enumeration 방지.
      // - 토큰 기반: 본인 region 만 노출 (메타 + cutout PNG).
      // - 명단 기반: region 메타는 전체 노출 (학생이 본인 칸 위치 확인 가능),
      //   단 region cutout publicUrl 은 응답하지 않음 → cutout 에 다른 학생 PII (이름/학번) 가
      //   인쇄돼 있을 가능성 차단. 학생은 페이지 PNG + 좌표 overlay 로 본인 칸 위치 확인 가능.
      const isTokenAccess = Boolean(token && resolvedParticipantId);
      const allowedParticipantIds = new Set(
        isTokenAccess ? [resolvedParticipantId as string] : (participants ?? []).map((p) => p.id),
      );
      visibleRegions = regions.filter((region) => allowedParticipantIds.has(region.participantId));

      const pages: { pageIndex: number; publicUrl: string }[] = [];
      for (let i = 0; i < pdfTemplate.pageCount; i++) {
        const fileName = `page-${String(i).padStart(3, '0')}.png`;
        const path = `${requestId}/v${regionVersion}/${fileName}`;
        const { data: urlData } = supabase.storage.from('signature-previews').getPublicUrl(path);
        pages.push({ pageIndex: i, publicUrl: urlData.publicUrl });
      }
      pagePreviewUrls = pages;

      // 명단 모드는 cutout PNG URL 미제공 — 학생 페이지가 페이지 PNG + 좌표 overlay 로 폴백.
      regionPreviewUrls = isTokenAccess
        ? visibleRegions.map((region) => {
            const fileName = `region-${region.id}.png`;
            const path = `${requestId}/v${regionVersion}/${fileName}`;
            const { data: urlData } = supabase.storage
              .from('signature-previews')
              .getPublicUrl(path);
            return { regionId: region.id, publicUrl: urlData.publicUrl };
          })
        : [];
    }

    return jsonResponse({
      id: request.id,
      title: request.title,
      description: request.description,
      status: request.status,
      dueAt: request.due_at,
      pinEnabled: Boolean((request.access as { pinEnabled?: boolean } | null)?.pinEnabled),
      uniqueLinksEnabled: Boolean(
        (request.access as { uniqueLinksEnabled?: boolean } | null)?.uniqueLinksEnabled,
      ),
      participants: (participants ?? []).map((participant) => ({
        id: participant.id,
        displayName: participant.display_name,
        requiredSignatureKinds: participant.required_signature_kinds ?? ['recipient'],
      })),
      resolvedParticipantId,
      // Phase 2C v2: PDF 오버레이 + pre-render 결과
      pdfTemplate:
        pdfTemplate && typeof pdfTemplate.pageCount === 'number'
          ? { pageCount: pdfTemplate.pageCount }
          : undefined,
      regions: visibleRegions.map((region) => ({
        id: region.id,
        pageIndex: region.pageIndex,
        rect: region.rect,
        participantId: region.participantId,
        signatureKind: region.signatureKind,
      })),
      pagePreviewUrls,
      regionPreviewUrls,
      regionVersion: pdfTemplate ? regionVersion : undefined,
    });
  } catch (err) {
    return internalErrorResponse('get-signature-request-public', err);
  }
});
