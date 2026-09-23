/**
 * 연결 해제 때 서버가 맡아 둔 선생님 구글 토큰을 지운다 (ADR-136 D4)
 *
 * 서버가 선생님 토큰을 맡는 곳은 둘이다.
 * - `teacher_tokens`        과제 수합 — 학생 파일을 선생님 드라이브에 올릴 때
 * - `staffroom_admin_tokens` 온라인 교무실 — 부서 자료실(관리자 드라이브)을 열 때
 *
 * ★앱은 구글 쪽 폐기(revoke) **전에** 이 함수를 부른다. 폐기한 뒤에는 access token 이
 *   죽어 본인 확인을 할 수 없기 때문이다.
 * ★본인 확인은 `save-teacher-token` 과 같다 — 구글 userinfo 에 되물어 이메일을 얻는다.
 *   요청 본문의 이메일 같은 것은 믿지 않는다. 남의 토큰을 지우게 두면 안 된다.
 * ★교무실 관리자가 연결을 해제하면 그 부서 자료실은 관리자가 다시 연결할 때까지 멈춘다.
 *   구글 폐기만으로도 이미 그렇게 되던 일이라 새로 생기는 불편은 아니다.
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  corsHeaders,
  jsonResponse,
  errorResponse,
  internalErrorResponse,
} from '../_shared/cors.ts';

const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { accessToken } = (await req.json()) as { accessToken?: unknown };
    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      return errorResponse('필수 필드가 누락되었습니다', 400);
    }

    const userInfoRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!userInfoRes.ok) {
      // 401/403 은 "이 토큰으로는 확인할 수 없다", 그 밖(5xx 등)은 일시 장애 — 앱이 안내를 가른다.
      const isAuthFailure = userInfoRes.status === 401 || userInfoRes.status === 403;
      return isAuthFailure
        ? errorResponse('인증에 실패했습니다', 401)
        : errorResponse('구글 확인이 일시적으로 실패했습니다. 잠시 후 다시 시도해주세요.', 502);
    }

    const userInfo = (await userInfoRes.json()) as { email?: string };
    const email = userInfo.email?.trim();
    if (!email) return errorResponse('이메일을 가져올 수 없습니다', 401);

    // 과제 수합은 userinfo 이메일을 그대로, 교무실은 소문자로 저장한다 — 둘 다 지운다.
    const variants = [...new Set([email, email.toLowerCase()])];

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const teacher = await supabase.from('teacher_tokens').delete().in('teacher_id', variants);
    if (teacher.error) {
      return internalErrorResponse(
        'delete-google-tokens',
        teacher.error,
        '삭제 중 오류가 발생했습니다',
      );
    }

    const staffroom = await supabase
      .from('staffroom_admin_tokens')
      .delete()
      .in('admin_email', variants);
    if (staffroom.error) {
      return internalErrorResponse(
        'delete-google-tokens',
        staffroom.error,
        '삭제 중 오류가 발생했습니다',
      );
    }

    return jsonResponse({ message: '삭제 완료' });
  } catch (err) {
    return internalErrorResponse('delete-google-tokens', err);
  }
});
