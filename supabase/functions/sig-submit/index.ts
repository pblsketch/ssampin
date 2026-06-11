/**
 * sig-submit — 서명 제출 처리
 *
 * 요청: POST { sessionId, memberRef, signerName, rowData, signaturePngBase64, accessCode? }
 * 응답: { entryId, signaturePublicUrl, signedAt }
 *
 * 처리 순서:
 * 1) 입력 검증 (필수 필드·형식)
 * 2) Rate limit (IP당 분당 5회)
 * 3) 세션 active 확인
 * 4) accessCodeEnabled면 accessCode 해시 비교
 * 5) 멤버 존재 확인 (memberRef roster_snapshot 매칭)
 * 6) 중복 잠금 (dedupLock=true면 이미 제출된 memberRef → 409)
 * 7) PNG 디코드 (≤256KB, image/png 가드)
 * 8) sigv2-signatures 버킷 업로드
 * 9) sigv2_entries INSERT (ip_hash, ua_hash — raw IP/UA 저장 금지)
 *
 * 주의: 이 서비스는 행정·법적 절차를 위한 전자서명을 제공하지 않습니다.
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  corsHeaders,
  jsonResponse,
  errorResponse,
  internalErrorResponse,
} from '../_shared/cors.ts';
import { sha256Hex, timingSafeEqual } from '../_shared/hash.ts';
import { checkRateLimit, clientIpFrom } from '../_shared/rateLimit.ts';

// ─── 상수 ──────────────────────────────────────────────────────────────────
const MAX_PNG_BYTES = 256 * 1024; // 256 KB
const MAX_SIGNER_NAME_LEN = 100;
const MAX_MEMBER_REF_LEN = 200;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── PNG 검증 헬퍼 ──────────────────────────────────────────────────────────

/** base64 → Uint8Array 변환. 실패 시 null 반환. */
function decodeBase64(b64: string): Uint8Array | null {
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

/** PNG 매직 바이트 확인 (첫 8바이트: 89 50 4E 47 0D 0A 1A 0A) */
function isPngMagic(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  const magic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return magic.every((v, i) => bytes[i] === v);
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

    const { sessionId, memberRef, signerName, rowData, signaturePngBase64, accessCode } = body as {
      sessionId?: unknown;
      memberRef?: unknown;
      signerName?: unknown;
      rowData?: unknown;
      signaturePngBase64?: unknown;
      accessCode?: unknown;
    };

    // ── 필수 필드 검증 ──
    if (!sessionId || typeof sessionId !== 'string' || !UUID_PATTERN.test(sessionId)) {
      return errorResponse('sessionId 형식이 올바르지 않습니다', 400);
    }
    if (!memberRef || typeof memberRef !== 'string' || memberRef.trim() === '') {
      return errorResponse('memberRef는 필수입니다', 400);
    }
    if (memberRef.length > MAX_MEMBER_REF_LEN) {
      return errorResponse(`memberRef는 ${MAX_MEMBER_REF_LEN}자 이하여야 합니다`, 400);
    }
    if (!signerName || typeof signerName !== 'string' || signerName.trim() === '') {
      return errorResponse('signerName은 필수입니다', 400);
    }
    if (signerName.length > MAX_SIGNER_NAME_LEN) {
      return errorResponse(`signerName은 ${MAX_SIGNER_NAME_LEN}자 이하여야 합니다`, 400);
    }
    if (
      rowData === undefined ||
      rowData === null ||
      typeof rowData !== 'object' ||
      Array.isArray(rowData)
    ) {
      return errorResponse('rowData는 객체여야 합니다', 400);
    }
    if (!signaturePngBase64 || typeof signaturePngBase64 !== 'string') {
      return errorResponse('signaturePngBase64는 필수입니다', 400);
    }

    // ── PNG 디코드 및 검증 ──
    // data:image/png;base64, 접두사 제거
    const rawB64 = signaturePngBase64.replace(/^data:image\/png;base64,/, '').trim();
    const pngBytes = decodeBase64(rawB64);
    if (!pngBytes) {
      return errorResponse('서명 이미지 base64 디코드에 실패했습니다', 400);
    }
    if (!isPngMagic(pngBytes)) {
      return errorResponse('서명 이미지는 PNG 형식이어야 합니다', 400);
    }
    if (pngBytes.length > MAX_PNG_BYTES) {
      return errorResponse(
        `서명 이미지 크기는 256KB 이하여야 합니다 (현재: ${Math.ceil(pngBytes.length / 1024)}KB)`,
        400,
      );
    }

    // ── 서비스롤 클라이언트 ──
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── Rate limit: IP당 분당 5회 ──
    const clientIP = clientIpFrom(req);
    const isLimited = await checkRateLimit(supabase, 'sig-submit', [
      { identifier: clientIP, windowMs: 60_000, max: 5 },
      { identifier: `session:${sessionId}:${clientIP}`, windowMs: 3_600_000, max: 20 },
    ]);
    if (isLimited) {
      return errorResponse('잠시 후 다시 시도해 주세요. 제출 요청이 너무 많습니다.', 429);
    }

    // ── 세션 조회 ──
    const { data: session, error: sessionError } = await supabase
      .from('sigv2_sessions')
      .select('id, status, trust_mode, access_code_hash, roster_snapshot')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return errorResponse('세션을 찾을 수 없습니다', 404);
    }
    if (session.status !== 'active') {
      return errorResponse('이미 마감된 세션입니다', 403);
    }

    const trustMode = session.trust_mode as Record<string, unknown>;

    // ── accessCode 검증 ──
    if (trustMode['accessCodeEnabled']) {
      if (!accessCode || typeof accessCode !== 'string' || accessCode.trim() === '') {
        return errorResponse('접근 코드가 필요합니다', 403);
      }
      const inputHash = await sha256Hex(accessCode.trim());
      const storedHash = (session.access_code_hash as string) ?? '';
      if (!timingSafeEqual(inputHash, storedHash)) {
        return errorResponse('접근 코드가 올바르지 않습니다', 403);
      }
    }

    // ── roster_snapshot에서 memberRef 존재 확인 ──
    const snapshot = session.roster_snapshot as Record<string, unknown>;
    const rawMembers = Array.isArray(snapshot['members'])
      ? (snapshot['members'] as Record<string, unknown>[])
      : [];
    const memberRefTrimmed = memberRef.trim();
    const matchedMember = rawMembers.find(
      (m) => String(m['memberRef'] ?? m['member_ref'] ?? '') === memberRefTrimmed,
    );
    if (!matchedMember) {
      return errorResponse('명단에서 해당 구성원을 찾을 수 없습니다', 404);
    }

    // ── 중복 잠금 (dedupLock) ──
    // dedupLock=true: 동일 member_ref 재제출을 409로 차단 (사전 확인 + DB UNIQUE 이중 방어).
    // dedupLock=false: 재서명 허용 — 기존 행을 새 서명으로 덮어쓴다(아래 INSERT 충돌 시 UPDATE).
    // 주의: UNIQUE(session_id, member_ref)는 무조건이므로, false여도 그냥 INSERT하면
    //       항상 23505로 실패해 토글이 무의미해진다. 따라서 false는 명시적으로 upsert 처리한다.
    const dedupLock = Boolean(trustMode['dedupLock']);
    if (dedupLock) {
      const { data: existing } = await supabase
        .from('sigv2_entries')
        .select('id')
        .eq('session_id', sessionId)
        .eq('member_ref', memberRefTrimmed)
        .maybeSingle();

      if (existing) {
        return errorResponse('이미 서명이 제출되었습니다. 중복 제출은 허용되지 않습니다.', 409);
      }
    }

    // ── 버킷 업로드 ──
    const objectKey = `${sessionId}/${crypto.randomUUID()}.png`;
    const { error: uploadError } = await supabase.storage
      .from('sigv2-signatures')
      .upload(objectKey, pngBytes, {
        contentType: 'image/png',
        upsert: false,
      });

    if (uploadError) {
      return internalErrorResponse(
        'sig-submit',
        uploadError,
        '서명 이미지 업로드 중 오류가 발생했습니다',
      );
    }

    // ── 공개 URL 구성 ──
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const signaturePublicUrl = `${supabaseUrl}/storage/v1/object/public/sigv2-signatures/${objectKey}`;

    // ── IP/UA 해시 (raw 저장 금지) ──
    const ua = req.headers.get('user-agent') ?? 'unknown';
    const ipHash = await sha256Hex(clientIP);
    const uaHash = await sha256Hex(ua);

    // ── sigv2_entries INSERT ──
    const { data: entry, error: entryError } = await supabase
      .from('sigv2_entries')
      .insert({
        session_id: sessionId,
        member_ref: memberRefTrimmed,
        row_data: rowData,
        signer_name: signerName.trim(),
        signature_object_key: objectKey,
        signature_public_url: signaturePublicUrl,
        ip_hash: ipHash,
        ua_hash: uaHash,
      })
      .select('id, signed_at')
      .single();

    if (entryError || !entry) {
      // UNIQUE(session_id, member_ref) 위반 — race condition 또는 재제출.
      if (entryError && entryError.code === '23505') {
        if (dedupLock) {
          // 중복 잠금 ON: 재제출 차단. 방금 업로드한 객체는 정리(고아 방지).
          await supabase.storage.from('sigv2-signatures').remove([objectKey]);
          return errorResponse('이미 서명이 제출되었습니다. 중복 제출은 허용되지 않습니다.', 409);
        }
        // 중복 잠금 OFF: 재서명 허용 → 기존 행을 새 서명으로 덮어쓴다(최신 서명 우선).
        // 기존 storage 객체는 UPDATE 성공 후 정리한다.
        const { data: prior } = await supabase
          .from('sigv2_entries')
          .select('id, signature_object_key')
          .eq('session_id', sessionId)
          .eq('member_ref', memberRefTrimmed)
          .single();

        const { data: updated, error: updateError } = await supabase
          .from('sigv2_entries')
          .update({
            row_data: rowData,
            signer_name: signerName.trim(),
            signature_object_key: objectKey,
            signature_public_url: signaturePublicUrl,
            ip_hash: ipHash,
            ua_hash: uaHash,
            signed_at: new Date().toISOString(),
          })
          .eq('session_id', sessionId)
          .eq('member_ref', memberRefTrimmed)
          .select('id, signed_at')
          .single();

        if (updateError || !updated) {
          // 덮어쓰기 실패: 방금 업로드한 새 객체를 정리하고 오류 반환.
          await supabase.storage.from('sigv2-signatures').remove([objectKey]);
          return internalErrorResponse(
            'sig-submit',
            updateError,
            '서명 저장 중 오류가 발생했습니다',
          );
        }

        // 이전 서명 객체 정리 (best-effort — 키가 다를 때만).
        const priorKey = prior?.signature_object_key as string | undefined;
        if (priorKey && priorKey !== objectKey) {
          await supabase.storage.from('sigv2-signatures').remove([priorKey]);
        }

        return jsonResponse({
          entryId: updated.id,
          signaturePublicUrl,
          signedAt: updated.signed_at,
        });
      }
      // 그 외 오류: 업로드된 이미지 정리 (best-effort)
      await supabase.storage.from('sigv2-signatures').remove([objectKey]);
      return internalErrorResponse('sig-submit', entryError, '서명 저장 중 오류가 발생했습니다');
    }

    return jsonResponse({
      entryId: entry.id,
      signaturePublicUrl,
      signedAt: entry.signed_at,
    });
  } catch (err) {
    return internalErrorResponse('sig-submit', err);
  }
});
