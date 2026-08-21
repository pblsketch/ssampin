/**
 * 온라인 교무실 — 초대 코드로 참여
 *
 * 계획서 §7 의 3~5단계가 여기다.
 *
 * 반드시 지킬 두 가지:
 *  1) **코드만으로 입장시키지 않는다.** 링크·코드는 초대장일 뿐 열쇠가 아니다.
 *     입장은 구글 access token 을 구글에 되물어 확인한 지메일로만 이뤄지고,
 *     그래서 "누가 언제 들어왔는지"가 항상 이름으로 남는다.
 *  2) **rateLimit 을 문다.** 31⁶ ≈ 8.9억이라 경우의 수가 넉넉하지만,
 *     경우의 수만으로 막지 않는다(§7). IP 와 지메일 두 축으로 건다.
 *
 * 두 단계로 나눠 거는 이유 — 먼저 IP 로 짧은 창을 막아 두면, 토큰도 없이
 * 코드만 계속 밀어 넣는 시도가 구글 확인 요청까지 가지 않는다.
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  corsHeaders,
  jsonResponse,
  errorResponse,
  internalErrorResponse,
} from '../_shared/cors.ts';
import { checkRateLimit, clientIpFrom } from '../_shared/rateLimit.ts';
import { verifyGoogleIdentity } from '../_shared/googleIdentity.ts';
import { isInviteCodeFormat, normalizeInviteCode } from '../_shared/staffroomAccess.ts';
import { serviceClient } from '../_shared/staffroomDb.ts';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/** 초대 수락 RPC 의 실패 사유 → 한국어 안내 + HTTP 상태 */
const ACCEPT_ERRORS: Record<string, { message: string; status: number }> = {
  invalid_email: { message: '구글 계정 확인에 실패했습니다. 다시 로그인해주세요', status: 401 },
  invite_not_found: { message: '없는 초대 코드입니다. 코드를 다시 확인해주세요', status: 404 },
  invite_revoked: {
    message: '해지된 초대 코드입니다. 관리자 선생님께 새 코드를 요청해주세요',
    status: 410,
  },
  invite_expired: {
    message: '기한이 지난 초대 코드입니다. 관리자 선생님께 새 코드를 요청해주세요',
    status: 410,
  },
  invite_full: { message: '이 초대 코드로 들어올 수 있는 인원이 모두 찼습니다', status: 409 },
  already_member: { message: '이미 이 부서의 멤버입니다', status: 409 },
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const rawCode: unknown = body?.code;
    const googleAccessToken: unknown = body?.googleAccessToken;

    if (typeof rawCode !== 'string' || !rawCode.trim()) {
      return errorResponse('초대 코드를 입력해주세요', 400);
    }
    if (typeof googleAccessToken !== 'string' || !googleAccessToken) {
      return errorResponse('구글 로그인이 필요합니다', 401);
    }

    const db = serviceClient();
    const ip = clientIpFrom(req);

    // 1단계 — IP 로 먼저 막는다 (구글 확인 요청 이전)
    const ipLimited = await checkRateLimit(db, 'staffroom-join-ip', [
      { identifier: ip, windowMs: MINUTE, max: 10 },
    ]);
    if (ipLimited) {
      return errorResponse('시도가 너무 잦습니다. 잠시 후 다시 시도해주세요', 429);
    }

    const code = normalizeInviteCode(rawCode);
    if (!isInviteCodeFormat(code)) {
      return errorResponse('초대 코드는 영문·숫자 6자리입니다. 다시 확인해주세요', 400);
    }

    // 2단계 — 신원 확인. 코드가 맞아도 여기를 통과하지 못하면 입장은 없다
    const identity = await verifyGoogleIdentity(googleAccessToken);
    if (!identity) {
      return errorResponse('구글 계정 확인에 실패했습니다. 다시 로그인해주세요', 401);
    }

    // 3단계 — IP·지메일 두 축으로 시간당 한도
    const limited = await checkRateLimit(db, 'staffroom-join', [
      { identifier: ip, windowMs: HOUR, max: 30 },
      { identifier: identity.email, windowMs: HOUR, max: 20 },
    ]);
    if (limited) {
      return errorResponse('시도가 너무 잦습니다. 잠시 후 다시 시도해주세요', 429);
    }

    // 4단계 — 코드 확인 → 멤버 등록 → 사용 횟수 증가를 한 트랜잭션으로
    const { data, error } = await db.rpc('staffroom_accept_invite', {
      p_code: code,
      p_email: identity.email,
      p_display_name: identity.name,
    });

    if (error) {
      return internalErrorResponse('staffroom-join.rpc', error, '부서에 들어가지 못했습니다');
    }

    const result = data as {
      success: boolean;
      error?: string;
      memberId?: string;
      departmentId?: string;
      departmentName?: string;
    } | null;

    if (!result) {
      return internalErrorResponse(
        'staffroom-join.rpc',
        new Error('빈 응답'),
        '부서에 들어가지 못했습니다',
      );
    }

    if (!result.success) {
      const mapped = ACCEPT_ERRORS[result.error ?? ''] ?? {
        message: '부서에 들어가지 못했습니다',
        status: 400,
      };
      // 이미 멤버인 경우에는 어느 부서인지 알려줘야 화면이 그 부서로 데려갈 수 있다
      if (result.error === 'already_member' && result.departmentId) {
        return new Response(
          JSON.stringify({
            error: mapped.message,
            departmentId: result.departmentId,
            departmentName: result.departmentName ?? null,
          }),
          {
            status: mapped.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }
      return errorResponse(mapped.message, mapped.status);
    }

    return jsonResponse({
      memberId: result.memberId,
      departmentId: result.departmentId,
      departmentName: result.departmentName ?? null,
      email: identity.email,
    });
  } catch (err) {
    return internalErrorResponse('staffroom-join', err);
  }
});
