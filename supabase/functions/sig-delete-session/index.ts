/**
 * sig-delete-session — 서명 세션 삭제
 *
 * 요청: POST { sessionId, adminKey }
 * 응답: { ok: true }
 *
 * 처리 순서:
 * 1) adminKey 검증
 * 2) sigv2-signatures/{sessionId}/ prefix 객체 일괄 list + remove
 * 3) sigv2_sessions 삭제 (entries CASCADE)
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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADMIN_KEY_PATTERN = /^[0-9a-f]{64}$/i;
const STORAGE_LIST_LIMIT = 1000; // 한 번에 list할 최대 객체 수

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── 입력 파싱 ──
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errorResponse('요청 본문이 올바른 JSON이 아닙니다', 400);
    }

    const { sessionId, adminKey } = body as {
      sessionId?: unknown;
      adminKey?: unknown;
    };

    if (!sessionId || typeof sessionId !== 'string' || !UUID_PATTERN.test(sessionId)) {
      return errorResponse('sessionId 형식이 올바르지 않습니다', 400);
    }
    if (!adminKey || typeof adminKey !== 'string' || !ADMIN_KEY_PATTERN.test(adminKey)) {
      return errorResponse('adminKey 형식이 올바르지 않습니다', 400);
    }

    // ── 서비스롤 클라이언트 ──
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── Rate limit: IP당 분당 10회 (삭제는 엄격하게) ──
    const clientIP = clientIpFrom(req);
    const isLimited = await checkRateLimit(supabase, 'sig-delete-session', [
      { identifier: clientIP, windowMs: 60_000, max: 10 },
    ]);
    if (isLimited) {
      return errorResponse('잠시 후 다시 시도해 주세요. 요청이 너무 많습니다.', 429);
    }

    // ── 세션 조회 (adminKey 검증용) ──
    const { data: session, error: sessionError } = await supabase
      .from('sigv2_sessions')
      .select('id, admin_key')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return errorResponse('세션을 찾을 수 없습니다', 404);
    }

    // ── adminKey 검증 (상수 시간 비교) ──
    if (!timingSafeEqual(adminKey, session.admin_key)) {
      return errorResponse('관리 키가 올바르지 않습니다', 403);
    }

    // ── sigv2-signatures/{sessionId}/ prefix 객체 일괄 삭제 ──
    // 1000개 초과 시 페이지 반복
    let removedCount = 0;
    let hasMore = true;
    while (hasMore) {
      const { data: objects, error: listError } = await supabase.storage
        .from('sigv2-signatures')
        .list(sessionId, { limit: STORAGE_LIST_LIMIT });

      if (listError) {
        // 스토리지 오류는 로그하되 DB 삭제는 계속 진행 (고아 객체보다 세션 삭제 우선)
        console.error(`[sig-delete-session] storage list error:`, listError);
        break;
      }

      if (!objects || objects.length === 0) {
        hasMore = false;
        break;
      }

      const keys = objects.map((obj) => `${sessionId}/${obj.name}`);
      const { error: removeError } = await supabase.storage.from('sigv2-signatures').remove(keys);

      if (removeError) {
        console.error(`[sig-delete-session] storage remove error:`, removeError);
        // 일부 삭제 실패해도 계속 진행
      } else {
        removedCount += keys.length;
      }

      // 조회 결과가 limit보다 적으면 마지막 페이지
      hasMore = objects.length === STORAGE_LIST_LIMIT;
    }

    // ── sigv2_sessions 삭제 (entries CASCADE) ──
    const { error: deleteError } = await supabase
      .from('sigv2_sessions')
      .delete()
      .eq('id', sessionId);

    if (deleteError) {
      return internalErrorResponse(
        'sig-delete-session',
        deleteError,
        '세션 삭제 중 오류가 발생했습니다',
      );
    }

    return jsonResponse({
      ok: true,
      removedStorageObjects: removedCount,
    });
  } catch (err) {
    return internalErrorResponse('sig-delete-session', err);
  }
});
