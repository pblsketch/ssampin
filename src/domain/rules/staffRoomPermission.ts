/**
 * 온라인 교무실 — 권한 판정 규칙 (M1)
 *
 * 계획서: docs/01-plan/features/online-staffroom.plan.md §2(권한 단계 2단계) · §7(초대 흐름)
 *
 * 이 파일은 "누가 무엇을 할 수 있는가"만 판정한다. 화면도 서버도 이 판정을 따른다.
 * 서버(Deno Edge Function)는 같은 규칙을 `supabase/functions/_shared/staffroomAccess.ts`
 * 에 두고 쓴다 — 화면에서 버튼을 숨기는 것은 방어가 아니기 때문이다.
 *
 * domain 레이어이므로 외부 의존성을 import 하지 않는다.
 */
import type { StaffRoomInvite, StaffRoomMember, StaffRoomRole } from '@domain/entities/StaffRoom';

/** 거절 사유 — 화면과 서버가 같은 값을 쓴다 */
export type StaffRoomDenialReason =
  | 'not_member'
  | 'not_admin'
  | 'last_admin'
  | 'invite_revoked'
  | 'invite_expired'
  | 'invite_full'
  | 'already_member';

/** 판정 결과 — 막았으면 왜 막았는지 항상 함께 돌려준다 */
export interface StaffRoomPermissionResult {
  readonly allowed: boolean;
  readonly reason: StaffRoomDenialReason | null;
}

const ALLOW: StaffRoomPermissionResult = { allowed: true, reason: null };

function deny(reason: StaffRoomDenialReason): StaffRoomPermissionResult {
  return { allowed: false, reason };
}

/** 거절 사유의 한국어 안내 문구 — 조용히 실패하지 않기 위한 단일 출처 */
export const STAFFROOM_DENIAL_MESSAGES: Readonly<Record<StaffRoomDenialReason, string>> = {
  not_member: '이 부서의 멤버가 아니라 볼 수 없습니다.',
  not_admin: '부서 관리자만 할 수 있습니다.',
  last_admin: '부서에 관리자가 한 분뿐이라 바꿀 수 없습니다. 다른 분을 먼저 관리자로 올려주세요.',
  invite_revoked: '해지된 초대 코드입니다. 관리자 선생님께 새 코드를 요청해주세요.',
  invite_expired: '기한이 지난 초대 코드입니다. 관리자 선생님께 새 코드를 요청해주세요.',
  invite_full: '이 초대 코드로 들어올 수 있는 인원이 모두 찼습니다.',
  already_member: '이미 이 부서의 멤버입니다.',
};

/** 거절 사유 → 한국어 문구 */
export function staffRoomDenialMessage(reason: StaffRoomDenialReason): string {
  return STAFFROOM_DENIAL_MESSAGES[reason];
}

/** 부서 관리자인가 */
export function isDepartmentAdmin(role: StaffRoomRole | null): boolean {
  return role === 'admin';
}

/** 멤버 목록·부서 내용을 볼 수 있는가 — 멤버이기만 하면 된다 */
export function canViewDepartment(role: StaffRoomRole | null): StaffRoomPermissionResult {
  if (role === null) return deny('not_member');
  return ALLOW;
}

/** 멤버를 관리(권한 변경·내보내기)할 수 있는가 */
export function canManageMembers(role: StaffRoomRole | null): StaffRoomPermissionResult {
  if (role === null) return deny('not_member');
  if (!isDepartmentAdmin(role)) return deny('not_admin');
  return ALLOW;
}

/** 초대를 발급·해지할 수 있는가 */
export function canIssueInvite(role: StaffRoomRole | null): StaffRoomPermissionResult {
  if (role === null) return deny('not_member');
  if (!isDepartmentAdmin(role)) return deny('not_admin');
  return ALLOW;
}

/** 부서 안의 관리자 수 */
export function countAdmins(members: readonly StaffRoomMember[]): number {
  return members.filter((m) => m.role === 'admin').length;
}

/**
 * 마지막 관리자인가 — 이 사람을 강등하거나 내보내면 부서에 관리자가 없어진다.
 *
 * 관리자가 없어지면 초대도 멤버 관리도 아무도 못 한다. 계획서 §10.1 의
 * "관리자가 떠나면 부서가 멈춘다"가 실수 한 번으로 즉시 일어나는 경로라서 막는다.
 */
export function isLastAdmin(members: readonly StaffRoomMember[], targetMemberId: string): boolean {
  const target = members.find((m) => m.id === targetMemberId);
  if (!target || target.role !== 'admin') return false;
  return countAdmins(members) <= 1;
}

/** 대상 멤버의 권한을 바꿀 수 있는가 */
export function canChangeRole(
  actorRole: StaffRoomRole | null,
  members: readonly StaffRoomMember[],
  targetMemberId: string,
  nextRole: StaffRoomRole,
): StaffRoomPermissionResult {
  const manage = canManageMembers(actorRole);
  if (!manage.allowed) return manage;
  // 관리자 → 일반으로 내리는 경우에만 마지막 관리자 보호가 걸린다
  if (nextRole !== 'admin' && isLastAdmin(members, targetMemberId)) return deny('last_admin');
  return ALLOW;
}

/** 대상 멤버를 내보낼 수 있는가 */
export function canRemoveMember(
  actorRole: StaffRoomRole | null,
  members: readonly StaffRoomMember[],
  targetMemberId: string,
): StaffRoomPermissionResult {
  const manage = canManageMembers(actorRole);
  if (!manage.allowed) return manage;
  if (isLastAdmin(members, targetMemberId)) return deny('last_admin');
  return ALLOW;
}

/**
 * 이 초대로 지금 들어갈 수 있는가.
 *
 * 링크·코드는 초대장일 뿐 열쇠가 아니므로(§7), 여기서 통과하더라도
 * 실제 입장은 구글 로그인으로 확인한 지메일이 있어야 이뤄진다.
 */
export function isInviteAcceptable(
  invite: Pick<StaffRoomInvite, 'expiresAt' | 'revokedAt' | 'maxUses' | 'useCount'>,
  nowMs: number,
): StaffRoomPermissionResult {
  if (invite.revokedAt !== null) return deny('invite_revoked');
  if (invite.expiresAt !== null && new Date(invite.expiresAt).getTime() <= nowMs) {
    return deny('invite_expired');
  }
  if (invite.maxUses !== null && invite.useCount >= invite.maxUses) return deny('invite_full');
  return ALLOW;
}

/**
 * 이 지메일이 초대를 수락할 수 있는가 — 이미 멤버면 다시 넣지 않는다.
 * 이메일 비교는 대소문자를 무시한다(구글은 대소문자를 구분하지 않는다).
 */
export function canAcceptInvite(
  invite: Pick<StaffRoomInvite, 'expiresAt' | 'revokedAt' | 'maxUses' | 'useCount'>,
  members: readonly Pick<StaffRoomMember, 'email'>[],
  email: string,
  nowMs: number,
): StaffRoomPermissionResult {
  const usable = isInviteAcceptable(invite, nowMs);
  if (!usable.allowed) return usable;
  const normalized = email.trim().toLowerCase();
  if (members.some((m) => m.email.trim().toLowerCase() === normalized)) {
    return deny('already_member');
  }
  return ALLOW;
}
