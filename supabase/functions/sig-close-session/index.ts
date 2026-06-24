/**
 * sig-close-session — 교사용 서명 세션 마감
 *
 * 요청: POST { sessionId, adminKey, retentionDays? }
 * 응답: { ok, status, closedAt, signatureRetentionDays, signatureCleanupAfter, signatureImagesDeletedAt }
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  corsHeaders,
  jsonResponse,
  errorResponse,
  internalErrorResponse,
} from '../_shared/cors.ts';
import { timingSafeEqual } from '../_shared/hash.ts';
import { checkRateLimit, clientIpFrom } from '../_shared/rateLimit.ts';
import { buildCloseMetadata, normalizeRetentionDays } from '../_shared/sigRetention.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADMIN_KEY_PATTERN = /^[0-9a-f]{64}$/i;
const SESSION_SELECT =
  'id, admin_key, status, closed_at, signature_retention_days, signature_cleanup_after, signature_images_deleted_at';

interface SigCloseSessionRow {
  id: string;
  admin_key: string;
  status: 'draft' | 'active' | 'closed';
  closed_at: string | null;
  signature_retention_days: number;
  signature_cleanup_after: string | null;
  signature_images_deleted_at: string | null;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errorResponse('요청 본문이 올바른 JSON이 아닙니다', 400);
    }

    const { sessionId, adminKey, retentionDays } = body as {
      sessionId?: unknown;
      adminKey?: unknown;
      retentionDays?: unknown;
    };

    if (!sessionId || typeof sessionId !== 'string' || !UUID_PATTERN.test(sessionId)) {
      return errorResponse('sessionId 형식이 올바르지 않습니다', 400);
    }
    if (!adminKey || typeof adminKey !== 'string' || !ADMIN_KEY_PATTERN.test(adminKey)) {
      return errorResponse('adminKey 형식이 올바르지 않습니다', 400);
    }

    const normalizedRetentionDays = normalizeRetentionDays(retentionDays);
    if (normalizedRetentionDays === null) {
      return errorResponse('보관기간은 1일부터 365일 사이의 정수여야 합니다', 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const clientIP = clientIpFrom(req);
    const isLimited = await checkRateLimit(supabase, 'sig-close-session', [
      { identifier: clientIP, windowMs: 60_000, max: 20 },
    ]);
    if (isLimited) {
      return errorResponse('잠시 후 다시 시도해 주세요. 요청이 너무 많습니다.', 429);
    }

    const { data: session, error: sessionError } = await supabase
      .from('sigv2_sessions')
      .select(SESSION_SELECT)
      .eq('id', sessionId)
      .single<SigCloseSessionRow>();

    if (sessionError || !session) {
      return errorResponse('세션을 찾을 수 없습니다', 404);
    }

    if (!timingSafeEqual(adminKey, session.admin_key)) {
      return errorResponse('관리 키가 올바르지 않습니다', 403);
    }

    if (session.status === 'closed') {
      return jsonResponse(toResponse(session));
    }
    if (session.status !== 'active') {
      return errorResponse('공개된 세션만 마감할 수 있습니다', 409);
    }

    const metadata = buildCloseMetadata(new Date(), normalizedRetentionDays);
    const { data: updated, error: updateError } = await supabase
      .from('sigv2_sessions')
      .update(metadata)
      .eq('id', sessionId)
      .eq('status', 'active')
      .select(SESSION_SELECT)
      .maybeSingle<SigCloseSessionRow>();

    if (updateError) {
      return internalErrorResponse(
        'sig-close-session',
        updateError,
        '세션 마감 중 오류가 발생했습니다',
      );
    }
    if (!updated) {
      const { data: current, error: currentError } = await supabase
        .from('sigv2_sessions')
        .select(SESSION_SELECT)
        .eq('id', sessionId)
        .single<SigCloseSessionRow>();
      if (currentError || !current) {
        return internalErrorResponse(
          'sig-close-session',
          currentError,
          '세션 마감 상태를 확인하지 못했습니다',
        );
      }
      return jsonResponse(toResponse(current));
    }

    return jsonResponse(toResponse(updated));
  } catch (err) {
    return internalErrorResponse('sig-close-session', err);
  }
});

function toResponse(row: SigCloseSessionRow) {
  return {
    ok: true,
    status: row.status,
    closedAt: row.closed_at ?? undefined,
    signatureRetentionDays: row.signature_retention_days,
    signatureCleanupAfter: row.signature_cleanup_after ?? undefined,
    signatureImagesDeletedAt: row.signature_images_deleted_at ?? undefined,
  };
}
