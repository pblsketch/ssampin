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
 *   remove  { departmentId, memberId, deleteUploads? }
 *
 * M3 부터 `remove` 는 자료실 몫까지 함께 한다 — 내준 드라이브 읽기 권한을 거두고(§3.4-나),
 * 관리자가 고르면 그분이 올린 파일도 정리한다(§10.6, 기본값은 남기기).
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
  checkDisplayName,
  denialMessage,
  denialStatus,
  requireMember,
} from '../_shared/staffroomAccess.ts';
import {
  serviceClient,
  loadMembers,
  toAccessMembers,
  toMemberResponse,
  type Db,
} from '../_shared/staffroomDb.ts';
import {
  AdminTokenError,
  adminAccessToken,
  revokePermission,
  trashDriveFile,
} from '../_shared/staffroomDrive.ts';

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

    // ── 내 이름 정하기 (본인만) ────────────────────────────────────
    //
    // 구글이 이름을 주지 않는다 — 쌤핀은 이메일 권한만 받고 `profile` 권한을
    // 요청하지 않는다(새 권한을 더하면 OAuth 재심사 대상이다). 그래서 멤버가 직접 적는다.
    //
    // ★ 대상 멤버를 body 로 받지 않는다. 요청자 본인 행만 고친다 —
    //   관리자라도 남의 이름을 바꿀 수 없다.
    if (action === 'setMyName') {
      const viewer = requireMember(access, identity.email);
      if (!viewer.ok) {
        return errorResponse(denialMessage(viewer.reason), denialStatus(viewer.reason));
      }

      const checked = checkDisplayName(body?.displayName);
      if (!checked.ok) return errorResponse(checked.message, 400);

      const { data, error } = await db
        .from('staffroom_members')
        .update({ display_name: checked.value })
        .eq('department_id', departmentId)
        .eq('member_email', identity.email)
        .select('id, department_id, member_email, display_name, role, joined_at')
        .single();

      if (error || !data) {
        return internalErrorResponse(
          'staffroom-members.setMyName',
          error,
          '이름을 저장하지 못했습니다',
        );
      }

      return jsonResponse({ member: toMemberResponse(data) });
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

      // 지우기 전에 지메일을 확보한다 — 지운 뒤에는 누구의 권한을 거둘지 알 수 없다
      const target = members.find((m) => m.id === memberId);
      if (!target) return errorResponse('내보낼 분을 찾을 수 없습니다', 404);

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

      // ★ 내보내기는 명단에서 지우는 것으로 끝나지 않는다 (M3 · 계획서 §3.4-나 · §10.6).
      //
      // 자료실 내려받기는 서버가 바이트를 나르는 대신 **그 분 지메일에 드라이브
      // 읽기 권한을 줘서** 푼다. 명단만 지우고 권한을 그대로 두면 부서에서 나간 뒤에도
      // 이미 한 번 열어본 파일은 계속 열린다 — 내보낸 것이 아니게 된다.
      const removedEmail = target.member_email.trim().toLowerCase();
      const revoked = await revokeAllGrants(db, departmentId, removedEmail);

      // 올린 파일을 함께 지울지는 관리자가 고른다. **기본값은 남기기** —
      // 부서 자료는 보통 개인 것이 아니라 업무 산출물이다(§10.6 오너 결정).
      let removedFileCount = 0;
      if (body?.deleteUploads === true) {
        removedFileCount = await deleteUploadsOf(db, departmentId, removedEmail);
      }

      return jsonResponse({ removedMemberId: memberId, revokedGrants: revoked, removedFileCount });
    }

    return errorResponse('알 수 없는 요청입니다', 400);
  } catch (err) {
    return internalErrorResponse('staffroom-members', err);
  }
});

/**
 * 내보낸 분에게 내줬던 드라이브 읽기 권한을 전부 거둔다 (계획서 §3.4-나 · §10.6).
 *
 * ★ 관리자 연결이 끊겨 있어도 **명단에서 지우는 일은 이미 끝났다.** 여기서 던지면
 *   "내보내기가 실패했다"고 보이지만 사실 나간 상태라 화면과 실제가 어긋난다.
 *   그래서 권한 회수 실패는 경고만 남기고 넘어가고, 몇 건을 거뒀는지 돌려준다.
 *   (남은 권한은 관리자가 구글 연결을 되살린 뒤 다시 내보내면 정리된다.)
 */
async function revokeAllGrants(db: Db, departmentId: string, email: string): Promise<number> {
  const { data, error } = await db
    .from('staffroom_file_grants')
    .select('id, drive_file_id, permission_id')
    .eq('department_id', departmentId)
    .eq('member_email', email);

  if (error) {
    console.error('[staffroom-members] 권한 목록 조회 실패:', error.message);
    return 0;
  }

  const grants = (data ?? []) as Array<{
    id: string;
    drive_file_id: string;
    permission_id: string;
  }>;
  if (grants.length === 0) return 0;

  let token: string;
  try {
    token = await adminAccessToken(db, departmentId);
  } catch (err) {
    if (!(err instanceof AdminTokenError)) throw err;
    console.warn('[staffroom-members] 관리자 연결이 끊겨 드라이브 권한을 못 거뒀습니다');
    return 0;
  }

  let revoked = 0;
  for (const grant of grants) {
    try {
      await revokePermission(token, grant.drive_file_id, grant.permission_id);
      await db.from('staffroom_file_grants').delete().eq('id', grant.id);
      revoked += 1;
    } catch {
      // 한 건이 실패해도 나머지는 계속 거둔다
      console.warn('[staffroom-members] 권한 회수 건너뜀:', grant.drive_file_id);
    }
  }
  return revoked;
}

/**
 * 내보낸 분이 올린 파일을 함께 지운다 — **관리자가 고를 때만** (§10.6).
 *
 * 기본값이 "남기기"인 이유: 부서 자료는 보통 개인 것이 아니라 업무 산출물이다.
 * 담당이 바뀌었다고 작년 계획서가 사라지면 그게 더 큰 사고다.
 * 드라이브에서는 휴지통으로만 보내므로 관리자가 되돌릴 수 있다.
 */
async function deleteUploadsOf(db: Db, departmentId: string, email: string): Promise<number> {
  const { data, error } = await db
    .from('staffroom_files')
    .select('id, drive_file_id, preview_file_id')
    .eq('department_id', departmentId)
    .eq('uploader_email', email);

  if (error) {
    console.error('[staffroom-members] 파일 목록 조회 실패:', error.message);
    return 0;
  }

  const files = (data ?? []) as Array<{
    id: string;
    drive_file_id: string;
    preview_file_id: string | null;
  }>;
  if (files.length === 0) return 0;

  let token: string | null = null;
  try {
    token = await adminAccessToken(db, departmentId);
  } catch (err) {
    if (!(err instanceof AdminTokenError)) throw err;
    console.warn('[staffroom-members] 관리자 연결이 끊겨 드라이브 파일을 못 지웠습니다');
  }

  for (const file of files) {
    if (token) {
      try {
        await trashDriveFile(token, file.drive_file_id);
        if (file.preview_file_id) await trashDriveFile(token, file.preview_file_id);
      } catch {
        console.warn('[staffroom-members] 드라이브 삭제 건너뜀:', file.drive_file_id);
      }
    }
    await db.from('staffroom_files').delete().eq('id', file.id).eq('department_id', departmentId);
  }
  return files.length;
}
