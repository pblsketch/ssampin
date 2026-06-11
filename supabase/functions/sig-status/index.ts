/**
 * sig-status — 서명 현황 조회 (교사 폴링용)
 *
 * 요청: POST { sessionId, adminKey }
 * 응답: { members: SignatureStatusRow[] }
 *   SignatureStatusRow: { memberRef, name, affiliation?, signed, signedAt? }
 *
 * - adminKey 검증 후 roster_snapshot 전원 × sigv2_entries 조인
 * - 가볍게 설계: 폴링 빈도를 고려해 rate limit 여유롭게 설정
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

interface SignatureStatusRow {
  memberRef: string;
  name: string;
  affiliation?: string;
  signed: boolean;
  signedAt?: string;
  /** 서명 이미지 공개 URL (서명 완료자만). 시트/Excel 서명 셀 주입 대상. */
  signaturePublicUrl?: string;
}

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

    // ── Rate limit: IP당 분당 120회 (폴링 허용), 세션당 분당 60회 ──
    const clientIP = clientIpFrom(req);
    const isLimited = await checkRateLimit(supabase, 'sig-status', [
      { identifier: clientIP, windowMs: 60_000, max: 120 },
      { identifier: `session:${sessionId}`, windowMs: 60_000, max: 60 },
    ]);
    if (isLimited) {
      return errorResponse('잠시 후 다시 시도해 주세요. 요청이 너무 많습니다.', 429);
    }

    // ── 세션 조회 (adminKey 포함) ──
    const { data: session, error: sessionError } = await supabase
      .from('sigv2_sessions')
      .select('id, admin_key, roster_snapshot, status')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return errorResponse('세션을 찾을 수 없습니다', 404);
    }

    // ── adminKey 검증 (상수 시간 비교) ──
    if (!timingSafeEqual(adminKey, session.admin_key)) {
      return errorResponse('관리 키가 올바르지 않습니다', 403);
    }

    // ── sigv2_entries 조회 (signature_public_url 포함 — 교사 시트/Excel 서명 셀 주입용) ──
    const { data: entries, error: entriesError } = await supabase
      .from('sigv2_entries')
      .select('member_ref, signed_at, signature_public_url')
      .eq('session_id', sessionId);

    if (entriesError) {
      return internalErrorResponse(
        'sig-status',
        entriesError,
        '서명 현황 조회 중 오류가 발생했습니다',
      );
    }

    // ── 제출 맵 구성 (서명 시각 + 공개 URL) ──
    const signedMap = new Map<string, { signedAt: string; signaturePublicUrl: string }>();
    for (const entry of entries ?? []) {
      signedMap.set(entry.member_ref, {
        signedAt: entry.signed_at,
        signaturePublicUrl: entry.signature_public_url ?? '',
      });
    }

    // ── roster_snapshot에서 전원 목록 추출 후 조인 ──
    const snapshot = session.roster_snapshot as Record<string, unknown>;
    const rawMembers = Array.isArray(snapshot['members'])
      ? (snapshot['members'] as Record<string, unknown>[])
      : [];

    const statusRows: SignatureStatusRow[] = rawMembers.map((m) => {
      const ref = String(m['memberRef'] ?? m['member_ref'] ?? '');
      const submission = signedMap.get(ref);
      return {
        memberRef: ref,
        name: String(m['name'] ?? ''),
        affiliation: m['affiliation'] ? String(m['affiliation']) : undefined,
        signed: signedMap.has(ref),
        signedAt: submission?.signedAt ?? undefined,
        // 서명 완료자만 공개 URL 노출 (빈 문자열이면 undefined로 정규화).
        signaturePublicUrl: submission?.signaturePublicUrl || undefined,
      };
    });

    const signedCount = statusRows.filter((r) => r.signed).length;

    return jsonResponse({
      sessionId,
      status: session.status,
      totalCount: rawMembers.length,
      signedCount,
      members: statusRows,
    });
  } catch (err) {
    return internalErrorResponse('sig-status', err);
  }
});
