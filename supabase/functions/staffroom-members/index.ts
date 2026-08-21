/**
 * 온라인 교무실 — 멤버 (목록 · 권한 변경 · 내보내기)
 *
 * 계획서 §2: 권한은 관리자 / 일반 2단계뿐이다.
 * 계획서 §11: "멤버 자격 확인이 곧 접근 통제다" — 목록 조회도 멤버만 가능하다.
 *
 * 마지막 관리자를 강등하거나 내보내는 것은 서버에서 막는다. 화면에서 버튼을
 * 숨기는 것은 방어가 아니고, 관리자가 없어진 부서는 아무도 손댈 수 없게 된다(§10.1).
 *
 * action:
 *   list    { departmentId }
 *   setRole { departmentId, memberId, role }
 *   remove  { departmentId, memberId }
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  corsHeaders,
  jsonResponse,
  errorResponse,
  internalErrorResponse,
} from '../_shared/cors.ts';
import { verifyGoogleIdentity } from '../_shared/googleIdentity.ts';
import {
  canChangeRole,
  canRemoveMember,
  denialMessage,
  denialStatus,
  requireMember,
} from '../_shared/staffroomAccess.ts';
import {
  serviceClient,
  loadMembers,
  toAccessMembers,
  toMemberResponse,
} from '../_shared/staffroomDb.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const action: unknown = body?.action;
    const googleAccessToken: unknown = body?.googleAccessToken;
    const departmentId = typeof body?.departmentId === 'string' ? body.departmentId : '';

    if (typeof googleAccessToken !== 'string' || !googleAccessToken) {
      return errorResponse('구글 로그인이 필요합니다', 401);
    }
    if (!departmentId) return errorResponse('부서를 찾을 수 없습니다', 400);

    const identity = await verifyGoogleIdentity(googleAccessToken);
    if (!identity) {
      return errorResponse('구글 계정 확인에 실패했습니다. 다시 로그인해주세요', 401);
    }

    const db = serviceClient();
    const members = await loadMembers(db, departmentId);
    const access = toAccessMembers(members);

    // ── 멤버 목록 (멤버 누구나) ────────────────────────────────────
    if (action === 'list') {
      const viewer = requireMember(access, identity.email);
      if (!viewer.ok) {
        return errorResponse(denialMessage(viewer.reason), denialStatus(viewer.reason));
      }
      return jsonResponse({ members: members.map(toMemberResponse) });
    }

    const memberId = typeof body?.memberId === 'string' ? body.memberId : '';
    if (!memberId) return errorResponse('대상 멤버를 찾을 수 없습니다', 400);
    if (!members.some((m) => m.id === memberId)) {
      return errorResponse('이 부서에 없는 멤버입니다', 404);
    }

    // ── 권한 변경 (관리자만) ───────────────────────────────────────
    if (action === 'setRole') {
      const role: unknown = body?.role;
      if (role !== 'admin' && role !== 'member') {
        return errorResponse('권한은 관리자 또는 일반만 고를 수 있습니다', 400);
      }

      const decision = canChangeRole(access, identity.email, memberId, role);
      if (!decision.ok) {
        return errorResponse(denialMessage(decision.reason), denialStatus(decision.reason));
      }

      const { data, error } = await db
        .from('staffroom_members')
        .update({ role })
        .eq('id', memberId)
        .eq('department_id', departmentId)
        .select('id, department_id, member_email, display_name, role, joined_at')
        .single();

      if (error || !data) {
        return internalErrorResponse(
          'staffroom-members.setRole',
          error,
          '권한을 바꾸지 못했습니다',
        );
      }

      return jsonResponse({ member: toMemberResponse(data) });
    }

    // ── 내보내기 (관리자만) ────────────────────────────────────────
    if (action === 'remove') {
      const decision = canRemoveMember(access, identity.email, memberId);
      if (!decision.ok) {
        return errorResponse(denialMessage(decision.reason), denialStatus(decision.reason));
      }

      const { error } = await db
        .from('staffroom_members')
        .delete()
        .eq('id', memberId)
        .eq('department_id', departmentId);

      if (error) {
        return internalErrorResponse(
          'staffroom-members.remove',
          error,
          '멤버를 내보내지 못했습니다',
        );
      }

      // M1 은 부서와 사람만 다룬다. 내보낸 분이 올린 파일 정리(계획서 §10.6)는
      // 자료실이 생기는 M3 의 몫이다.
      return jsonResponse({ removedMemberId: memberId });
    }

    return errorResponse('알 수 없는 요청입니다', 400);
  } catch (err) {
    return internalErrorResponse('staffroom-members', err);
  }
});
