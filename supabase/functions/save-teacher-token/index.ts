/**
 * 교사 OAuth 토큰 암호화 저장
 * 교사 앱에서 토큰을 전송 → Edge Function에서 AES-256-GCM 암호화 → DB 저장
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  corsHeaders,
  jsonResponse,
  errorResponse,
  internalErrorResponse,
} from '../_shared/cors.ts';
import { encrypt } from '../_shared/crypto.ts';

const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { accessToken, refreshToken, expiresAt } = await req.json();

    if (!accessToken || !refreshToken || !expiresAt) {
      return errorResponse('필수 필드가 누락되었습니다', 400);
    }

    // Google userinfo API로 교사 이메일 검증
    const userInfoRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userInfoRes.ok) {
      // 구글이 "이 토큰은 못 쓴다"고 한 경우(401/403)만 인증 실패로 돌려준다.
      // 구글 쪽 일시 장애(5xx·네트워크)까지 401 로 뭉뚱그리면, 앱이 교사에게
      // "다시 로그인하세요"라고 잘못 안내한다 — 다시 로그인해도 낫지 않는 종류의 실패다.
      // 앱은 이 상태 코드를 보고 "재로그인"과 "잠시 후 재시도"를 갈라 안내한다.
      const isAuthFailure = userInfoRes.status === 401 || userInfoRes.status === 403;
      return isAuthFailure
        ? errorResponse('인증에 실패했습니다', 401)
        : errorResponse('구글 확인이 일시적으로 실패했습니다. 잠시 후 다시 시도해주세요.', 502);
    }

    const userInfo = await userInfoRes.json();
    const teacherId = userInfo.email;

    if (!teacherId) {
      return errorResponse('이메일을 가져올 수 없습니다', 401);
    }

    // AES-256-GCM 암호화 (각 토큰별 별도 IV/tag)
    const encryptionKey = Deno.env.get('ENCRYPTION_KEY')!;
    const encAccess = await encrypt(accessToken, encryptionKey);
    const encRefresh = await encrypt(refreshToken, encryptionKey);

    // DB upsert
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { error } = await supabase.from('teacher_tokens').upsert(
      {
        teacher_id: teacherId,
        encrypted_access_token: encAccess.ciphertext,
        access_iv: encAccess.iv,
        access_tag: encAccess.tag,
        encrypted_refresh_token: encRefresh.ciphertext,
        refresh_iv: encRefresh.iv,
        refresh_tag: encRefresh.tag,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'teacher_id' },
    );

    if (error) {
      return internalErrorResponse('save-teacher-token', error, '토큰 저장 중 오류가 발생했습니다');
    }

    return jsonResponse({ message: '토큰 저장 완료', teacherId });
  } catch (err) {
    return internalErrorResponse('save-teacher-token', err);
  }
});
