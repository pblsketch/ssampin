/**
 * sig-publish — 서명 세션 생성 (교사 전용)
 *
 * 요청: POST { ownerTeacherId, title, headerText?, columns, members[], trustMode, accessCode? }
 * 응답: { sessionId, adminKey, shortLinkCode }
 *
 * - accessCode 있으면 SHA-256 pepper 해시로 저장 (평문 저장 금지)
 * - admin_key: crypto.getRandomValues 기반 32바이트 hex
 * - short_link_code: 8자리 alphanumeric
 * - 서비스롤 클라이언트 경유 RLS 우회 (service_role 전용 정책)
 * - 법적효력: 이 서비스는 행정·법적 절차를 위한 전자서명을 제공하지 않습니다.
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  corsHeaders,
  jsonResponse,
  errorResponse,
  internalErrorResponse,
} from '../_shared/cors.ts';
import { sha256Hex } from '../_shared/hash.ts';
import { checkRateLimit, clientIpFrom } from '../_shared/rateLimit.ts';

// ─── 상수 ──────────────────────────────────────────────────────────────────
const MAX_TITLE_LEN = 200;
const MAX_HEADER_TEXT_LEN = 1000;
const MAX_MEMBERS = 500;
const MAX_COLUMNS = 30;
const SHORT_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

// ─── 헬퍼 ──────────────────────────────────────────────────────────────────

/** 32바이트 랜덤 hex → admin_key */
function generateAdminKey(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** 8자리 alphanumeric → short_link_code */
function generateShortCode(): string {
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => SHORT_CODE_CHARS[b % SHORT_CODE_CHARS.length])
    .join('');
}

// ─── 핸들러 ─────────────────────────────────────────────────────────────────
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

    const { ownerTeacherId, title, headerText, columns, members, trustMode, accessCode } = body as {
      ownerTeacherId?: unknown;
      title?: unknown;
      headerText?: unknown;
      columns?: unknown;
      members?: unknown;
      trustMode?: unknown;
      accessCode?: unknown;
    };

    // ── 필수 필드 검증 ──
    if (!ownerTeacherId || typeof ownerTeacherId !== 'string' || ownerTeacherId.trim() === '') {
      return errorResponse('ownerTeacherId는 필수입니다 (교사 귀속 세션만 생성 가능)', 400);
    }
    if (!title || typeof title !== 'string' || title.trim() === '') {
      return errorResponse('title은 필수입니다', 400);
    }
    if (title.length > MAX_TITLE_LEN) {
      return errorResponse(`title은 ${MAX_TITLE_LEN}자 이하여야 합니다`, 400);
    }
    if (headerText !== undefined && headerText !== null) {
      if (typeof headerText !== 'string') {
        return errorResponse('headerText는 문자열이어야 합니다', 400);
      }
      if (headerText.length > MAX_HEADER_TEXT_LEN) {
        return errorResponse(`headerText는 ${MAX_HEADER_TEXT_LEN}자 이하여야 합니다`, 400);
      }
    }
    if (!Array.isArray(columns)) {
      return errorResponse('columns는 배열이어야 합니다', 400);
    }
    if (columns.length > MAX_COLUMNS) {
      return errorResponse(`columns는 ${MAX_COLUMNS}개 이하여야 합니다`, 400);
    }
    if (!Array.isArray(members)) {
      return errorResponse('members는 배열이어야 합니다', 400);
    }
    if (members.length === 0) {
      return errorResponse('members에 최소 1명이 있어야 합니다', 400);
    }
    if (members.length > MAX_MEMBERS) {
      return errorResponse(`members는 ${MAX_MEMBERS}명 이하여야 합니다`, 400);
    }
    if (!trustMode || typeof trustMode !== 'object' || Array.isArray(trustMode)) {
      return errorResponse('trustMode 객체가 필요합니다', 400);
    }

    // ── 서비스롤 클라이언트 ──
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── Rate limit: IP당 분당 5회, 교사당 시간당 30회 ──
    const clientIP = clientIpFrom(req);
    const isLimited = await checkRateLimit(supabase, 'sig-publish', [
      { identifier: clientIP, windowMs: 60_000, max: 5 },
      { identifier: `teacher:${ownerTeacherId}`, windowMs: 3_600_000, max: 30 },
    ]);
    if (isLimited) {
      return errorResponse('잠시 후 다시 시도해 주세요. 세션 생성 요청이 너무 많습니다.', 429);
    }

    // ── access_code_hash 생성 (accessCodeEnabled면 필수) ──
    const tm = trustMode as Record<string, unknown>;
    const accessCodeEnabled = Boolean(tm['accessCodeEnabled']);
    let accessCodeHash: string | null = null;

    if (accessCodeEnabled) {
      if (!accessCode || typeof accessCode !== 'string' || accessCode.trim() === '') {
        return errorResponse('accessCodeEnabled=true일 때 accessCode는 필수입니다', 400);
      }
      accessCodeHash = await sha256Hex(accessCode.trim());
    }

    // ── 키 생성 ──
    const adminKey = generateAdminKey();
    const shortLinkCode = generateShortCode();

    // ── roster_snapshot 구성 ──
    const rosterSnapshot = {
      members: members,
      generatedAt: new Date().toISOString(),
    };

    // ── sigv2_sessions INSERT ──
    const { data: session, error: insertError } = await supabase
      .from('sigv2_sessions')
      .insert({
        owner_teacher_id: ownerTeacherId.trim(),
        admin_key: adminKey,
        title: title.trim(),
        header_text: headerText ? (headerText as string).trim() : null,
        trust_mode: trustMode,
        access_code_hash: accessCodeHash,
        columns: columns,
        roster_snapshot: rosterSnapshot,
        short_link_code: shortLinkCode,
        status: 'active',
      })
      .select('id')
      .single();

    if (insertError || !session) {
      return internalErrorResponse('sig-publish', insertError, '세션 생성 중 오류가 발생했습니다');
    }

    return jsonResponse({
      sessionId: session.id,
      adminKey,
      shortLinkCode,
    });
  } catch (err) {
    return internalErrorResponse('sig-publish', err);
  }
});
