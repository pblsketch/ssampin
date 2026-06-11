/**
 * sig-get-public — 서명 세션 공개 메타 조회
 *
 * 요청: POST { sessionId } 또는 { shortLinkCode }
 * 응답: { title, headerText, columns, members:[{memberRef,name,affiliation}], trustMode }
 *
 * 보안: admin_key·access_code_hash·PII 추가필드 절대 미포함.
 * 세션 status='active'인 경우에만 반환.
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  corsHeaders,
  jsonResponse,
  errorResponse,
  internalErrorResponse,
} from '../_shared/cors.ts';
import { checkRateLimit, clientIpFrom } from '../_shared/rateLimit.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHORT_CODE_PATTERN = /^[A-Za-z0-9]{6,12}$/;

// ── 멤버 공개 필드만 추출 ────────────────────────────────────────────────────
interface MemberPublic {
  memberRef: string;
  name: string;
  affiliation?: string;
}

function sanitizeMembers(rawMembers: unknown[]): MemberPublic[] {
  return rawMembers.map((m) => {
    const member = m as Record<string, unknown>;
    return {
      memberRef: String(member['memberRef'] ?? member['member_ref'] ?? ''),
      name: String(member['name'] ?? ''),
      affiliation: member['affiliation'] ? String(member['affiliation']) : undefined,
    };
  });
}

// ── 핸들러 ──────────────────────────────────────────────────────────────────
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

    const { sessionId, shortLinkCode } = body as {
      sessionId?: unknown;
      shortLinkCode?: unknown;
    };

    if (!sessionId && !shortLinkCode) {
      return errorResponse('sessionId 또는 shortLinkCode 중 하나가 필요합니다', 400);
    }

    if (
      sessionId !== undefined &&
      (typeof sessionId !== 'string' || !UUID_PATTERN.test(sessionId))
    ) {
      return errorResponse('sessionId 형식이 올바르지 않습니다', 400);
    }

    if (
      shortLinkCode !== undefined &&
      (typeof shortLinkCode !== 'string' || !SHORT_CODE_PATTERN.test(shortLinkCode))
    ) {
      return errorResponse('shortLinkCode 형식이 올바르지 않습니다', 400);
    }

    // ── 서비스롤 클라이언트 ──
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── Rate limit: IP당 분당 60회 (폴링 허용) ──
    const clientIP = clientIpFrom(req);
    const isLimited = await checkRateLimit(supabase, 'sig-get-public', [
      { identifier: clientIP, windowMs: 60_000, max: 60 },
    ]);
    if (isLimited) {
      return errorResponse('잠시 후 다시 시도해 주세요. 요청이 너무 많습니다.', 429);
    }

    // ── DB 조회 — 민감 컬럼 선택 제외 ──
    // admin_key, access_code_hash 는 SELECT 목록에서 명시적으로 제외
    let query = supabase
      .from('sigv2_sessions')
      .select('id, title, header_text, columns, roster_snapshot, trust_mode, status')
      .eq('status', 'active');

    if (typeof sessionId === 'string') {
      query = query.eq('id', sessionId);
    } else {
      query = query.eq('short_link_code', shortLinkCode as string);
    }

    const { data: session, error: dbError } = await query.single();

    if (dbError || !session) {
      return errorResponse('세션을 찾을 수 없거나 이미 마감되었습니다', 404);
    }

    // ── roster_snapshot 에서 공개 멤버 목록 추출 ──
    const snapshot = session.roster_snapshot as Record<string, unknown>;
    const rawMembers = Array.isArray(snapshot['members']) ? snapshot['members'] : [];
    const members = sanitizeMembers(rawMembers as unknown[]);

    // ── trustMode 에서 민감 정보 제외 후 반환 ──
    const tm = session.trust_mode as Record<string, unknown>;
    const publicTrustMode = {
      dedupLock: Boolean(tm['dedupLock']),
      accessCodeEnabled: Boolean(tm['accessCodeEnabled']),
    };

    return jsonResponse({
      sessionId: session.id,
      title: session.title,
      headerText: session.header_text ?? null,
      columns: session.columns,
      members,
      trustMode: publicTrustMode,
    });
  } catch (err) {
    return internalErrorResponse('sig-get-public', err);
  }
});
