/**
 * 온라인 교무실 — 서버 인가 판정 (순수 함수)
 *
 * 계획서 §11: "탈퇴·강퇴한 멤버의 접근 차단 시점 — 서버가 대신 읽어주는 구조라,
 * 멤버 자격 확인이 곧 접근 통제다."
 *
 * 화면에서 버튼을 숨기는 것은 방어가 아니다. 클라이언트가 들고 있는 것은
 * 앱 번들에 들어 있는 공개 anon key 뿐이라, 누구나 staffroom-* 함수를 직접 부를 수 있다.
 * 그래서 모든 함수가 응답 직전에 이 파일의 판정을 거친다.
 *
 * **이 파일에는 Deno 전역·URL import 를 두지 않는다.** 순수 TypeScript 로 유지해야
 * `src/infrastructure/supabase/__tests__/staffroomServerAccess.test.ts` 가
 * 상대경로로 불러와 CI 에서 검증할 수 있다. (supabase/ 아래 테스트는 vitest
 * include 밖이라 돌지 않는다 — vitest.config.ts 참고.)
 *
 * 판정 규칙은 `src/domain/rules/staffRoomPermission.ts` 와 같은 내용이다.
 * 한쪽만 고치면 화면과 서버가 어긋나므로 둘을 함께 고칠 것.
 */

/** 부서 안에서의 권한 — 관리자 / 일반 2단계 */
export type StaffRoomRole = 'admin' | 'member';

/** 인가 판정에 필요한 최소한의 멤버 정보 */
export interface AccessMember {
  readonly id: string;
  readonly email: string;
  readonly role: StaffRoomRole;
}

/** 거절 사유 — 클라이언트 도메인 규칙과 같은 값을 쓴다 */
export type AccessDenialReason =
  | 'not_member'
  | 'not_admin'
  | 'not_author'
  | 'last_admin'
  | 'invite_revoked'
  | 'invite_expired'
  | 'invite_full'
  | 'already_member';

/** 거절 사유별 한국어 안내 + HTTP 상태 */
const DENIAL_TABLE: Readonly<
  Record<AccessDenialReason, { readonly message: string; readonly status: number }>
> = {
  not_member: { message: '이 부서의 멤버가 아니라 볼 수 없습니다.', status: 403 },
  not_admin: { message: '부서 관리자만 할 수 있습니다.', status: 403 },
  not_author: { message: '글을 쓴 분이나 부서 관리자만 할 수 있습니다.', status: 403 },
  last_admin: {
    message: '부서에 관리자가 한 분뿐이라 바꿀 수 없습니다. 다른 분을 먼저 관리자로 올려주세요.',
    status: 409,
  },
  invite_revoked: {
    message: '해지된 초대 코드입니다. 관리자 선생님께 새 코드를 요청해주세요.',
    status: 410,
  },
  invite_expired: {
    message: '기한이 지난 초대 코드입니다. 관리자 선생님께 새 코드를 요청해주세요.',
    status: 410,
  },
  invite_full: { message: '이 초대 코드로 들어올 수 있는 인원이 모두 찼습니다.', status: 409 },
  already_member: { message: '이미 이 부서의 멤버입니다.', status: 409 },
};

/** 거절 사유 → 한국어 문구 */
export function denialMessage(reason: AccessDenialReason): string {
  return DENIAL_TABLE[reason].message;
}

/** 거절 사유 → HTTP 상태 코드 */
export function denialStatus(reason: AccessDenialReason): number {
  return DENIAL_TABLE[reason].status;
}

/** 판정 결과 */
export type AccessResult =
  | { readonly ok: true; readonly member: AccessMember }
  | { readonly ok: false; readonly reason: AccessDenialReason };

/** 지메일 비교용 정규화 */
function norm(email: string): string {
  return email.trim().toLowerCase();
}

/** 멤버 목록에서 이 지메일의 멤버를 찾는다 */
export function findMember(members: readonly AccessMember[], email: string): AccessMember | null {
  const target = norm(email);
  return members.find((m) => norm(m.email) === target) ?? null;
}

/**
 * 이 부서의 멤버인가 — 읽기 조작의 최소 조건.
 * 멤버가 아니면 부서가 존재하는지조차 알려주지 않는다(403 으로 통일).
 */
export function requireMember(members: readonly AccessMember[], email: string): AccessResult {
  const member = findMember(members, email);
  if (!member) return { ok: false, reason: 'not_member' };
  return { ok: true, member };
}

/** 이 부서의 관리자인가 — 초대 발급·멤버 관리의 조건 */
export function requireAdmin(members: readonly AccessMember[], email: string): AccessResult {
  const found = requireMember(members, email);
  if (!found.ok) return found;
  if (found.member.role !== 'admin') return { ok: false, reason: 'not_admin' };
  return found;
}

/** 부서 안의 관리자 수 */
export function countAdmins(members: readonly AccessMember[]): number {
  return members.filter((m) => m.role === 'admin').length;
}

/** 이 사람을 강등·제외하면 부서에 관리자가 없어지는가 */
export function isLastAdmin(members: readonly AccessMember[], targetMemberId: string): boolean {
  const target = members.find((m) => m.id === targetMemberId);
  if (!target || target.role !== 'admin') return false;
  return countAdmins(members) <= 1;
}

/** 권한 변경이 가능한가 */
export function canChangeRole(
  members: readonly AccessMember[],
  actorEmail: string,
  targetMemberId: string,
  nextRole: StaffRoomRole,
): AccessResult {
  const admin = requireAdmin(members, actorEmail);
  if (!admin.ok) return admin;
  if (nextRole !== 'admin' && isLastAdmin(members, targetMemberId)) {
    return { ok: false, reason: 'last_admin' };
  }
  return admin;
}

/** 내보내기가 가능한가 */
export function canRemoveMember(
  members: readonly AccessMember[],
  actorEmail: string,
  targetMemberId: string,
): AccessResult {
  const admin = requireAdmin(members, actorEmail);
  if (!admin.ok) return admin;
  if (isLastAdmin(members, targetMemberId)) return { ok: false, reason: 'last_admin' };
  return admin;
}

/** 초대 만료일 계산 — 일수를 받아 ISO 시각으로. null 이면 무기한 */
export function inviteExpiryFromDays(days: number | null, nowMs: number): string | null {
  if (days === null) return null;
  if (!Number.isFinite(days) || days <= 0) return null;
  return new Date(nowMs + days * 24 * 60 * 60 * 1000).toISOString();
}

/** 초대 코드 형식 — 31자 알파벳 6자리 (숫자 6자리가 아니다) */
export const INVITE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const INVITE_CODE_PATTERN = new RegExp(`^[${INVITE_CODE_ALPHABET}]{6}$`);

/** 초대 코드 형식 검증 */
export function isInviteCodeFormat(code: string): boolean {
  return INVITE_CODE_PATTERN.test(code);
}

/** 입력 코드 정리 — 공백·하이픈 제거 후 대문자 */
export function normalizeInviteCode(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

// ══════════════════════════════════════════════════════════════════
// 게시판 (M2)
//
// 계획서 §8-A — 필독 지정은 관리자만. 글·댓글 고치기·지우기는 쓴 사람 또는 관리자.
// `src/domain/rules/staffRoomBoardPermission.ts` 와 같은 규칙이다.
// 한쪽만 고치면 화면과 서버가 어긋나므로 둘을 함께 고칠 것.
// ══════════════════════════════════════════════════════════════════

/** 글을 쓸 수 있는가 — 멤버면 누구나(읽기 전용 등급을 만들지 않았다) */
export function canWritePost(members: readonly AccessMember[], email: string): AccessResult {
  return requireMember(members, email);
}

/** 글을 고칠 수 있는가 — 쓴 사람 본인 또는 관리자 */
export function canEditPost(
  members: readonly AccessMember[],
  viewerEmail: string,
  postAuthorEmail: string,
): AccessResult {
  const found = requireMember(members, viewerEmail);
  if (!found.ok) return found;
  if (found.member.role === 'admin') return found;
  if (norm(viewerEmail) === norm(postAuthorEmail)) return found;
  return { ok: false, reason: 'not_author' };
}

/** 글을 지울 수 있는가 — 고치기와 같은 기준 */
export function canDeletePost(
  members: readonly AccessMember[],
  viewerEmail: string,
  postAuthorEmail: string,
): AccessResult {
  return canEditPost(members, viewerEmail, postAuthorEmail);
}

/** 댓글을 지울 수 있는가 — 쓴 사람 본인 또는 관리자 */
export function canDeleteComment(
  members: readonly AccessMember[],
  viewerEmail: string,
  commentAuthorEmail: string,
): AccessResult {
  return canEditPost(members, viewerEmail, commentAuthorEmail);
}

/**
 * 필독으로 지정할 수 있는가 — **관리자만**.
 * 필독 글에만 사람별 읽음이 쌓이므로(§3.5-나), 아무나 지정하면 행 수 설계가 무너진다.
 */
export function canSetRequired(members: readonly AccessMember[], email: string): AccessResult {
  return requireAdmin(members, email);
}

/** 부서에서 쓰는 표시 이름 최대 길이 — 화면(StaffRoomBoard.ts)과 같은 값 */
export const DISPLAY_NAME_MAX_LENGTH = 20;

/** 표시 이름 검사 결과 */
export type DisplayNameCheck =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly message: string };

/**
 * 표시 이름을 다듬고 검사한다.
 *
 * 구글이 이름을 주지 않는다(쌤핀은 이메일 권한만 받고 `profile` 권한을 요청하지 않는다 —
 * 새 권한을 추가하면 OAuth 재심사 대상이다). 그래서 멤버가 직접 적는다.
 */
export function checkDisplayName(raw: unknown): DisplayNameCheck {
  if (typeof raw !== 'string') return { ok: false, message: '이름을 입력해주세요.' };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, message: '이름을 입력해주세요.' };
  if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
    return { ok: false, message: `이름은 ${DISPLAY_NAME_MAX_LENGTH}자까지 쓸 수 있습니다.` };
  }
  return { ok: true, value: trimmed };
}
