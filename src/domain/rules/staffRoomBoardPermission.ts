/**
 * 온라인 교무실 — 게시판 권한·판정 규칙 (M2)
 *
 * 계획서: §8-A(필독 고정은 관리자만) · §3.5-나(읽음 확인 두 갈래)
 *
 * M1 의 `staffRoomPermission.ts` 와 같은 원칙을 따른다 — 화면에서 버튼을 숨기는 것은
 * 방어가 아니므로, 같은 판정을 서버(`_shared/staffroomAccess.ts`)도 한다.
 *
 * domain 레이어이므로 외부 의존성을 import 하지 않는다.
 */
import type { StaffRoomRole } from '@domain/entities/StaffRoom';
import { STAFFROOM_DISPLAY_NAME_MAX_LENGTH } from '@domain/entities/StaffRoomBoard';

/** 게시판 조작 거절 사유 */
export type BoardDenialReason = 'not_member' | 'not_admin' | 'not_author';

export interface BoardPermissionResult {
  readonly allowed: boolean;
  readonly reason: BoardDenialReason | null;
}

const ALLOW: BoardPermissionResult = { allowed: true, reason: null };

function deny(reason: BoardDenialReason): BoardPermissionResult {
  return { allowed: false, reason };
}

/** 거절 사유의 한국어 안내 — 화면과 서버가 같은 문구를 쓴다 */
export const BOARD_DENIAL_MESSAGES: Readonly<Record<BoardDenialReason, string>> = {
  not_member: '이 부서의 멤버가 아니라 볼 수 없습니다.',
  not_admin: '부서 관리자만 할 수 있습니다.',
  not_author: '글을 쓴 분이나 부서 관리자만 할 수 있습니다.',
};

export function boardDenialMessage(reason: BoardDenialReason): string {
  return BOARD_DENIAL_MESSAGES[reason];
}

/** 지메일 비교 정규화 — 구글은 대소문자를 구분하지 않는다 */
function sameEmail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** 글을 쓸 수 있는가 — 멤버면 누구나 쓴다(읽기 전용 등급을 만들지 않았다) */
export function canWritePost(role: StaffRoomRole | null): BoardPermissionResult {
  if (role === null) return deny('not_member');
  return ALLOW;
}

/** 글을 고칠 수 있는가 — 쓴 사람 본인 또는 관리자 */
export function canEditPost(
  role: StaffRoomRole | null,
  viewerEmail: string,
  postAuthorEmail: string,
): BoardPermissionResult {
  if (role === null) return deny('not_member');
  if (role === 'admin') return ALLOW;
  if (sameEmail(viewerEmail, postAuthorEmail)) return ALLOW;
  return deny('not_author');
}

/** 글을 지울 수 있는가 — 고치기와 같은 기준 */
export function canDeletePost(
  role: StaffRoomRole | null,
  viewerEmail: string,
  postAuthorEmail: string,
): BoardPermissionResult {
  return canEditPost(role, viewerEmail, postAuthorEmail);
}

/**
 * 필독으로 지정할 수 있는가 — **관리자만**(계획서 §8-A).
 *
 * 필독은 목록 맨 위 고정이면서 동시에 "사람별 읽음 기록을 쌓는 글"이라
 * 아무나 지정하면 §3.5-나 의 행 수 설계(15.7만 행)가 무너진다.
 */
export function canSetRequired(role: StaffRoomRole | null): BoardPermissionResult {
  if (role === null) return deny('not_member');
  if (role !== 'admin') return deny('not_admin');
  return ALLOW;
}

/** 댓글을 지울 수 있는가 — 쓴 사람 본인 또는 관리자 */
export function canDeleteComment(
  role: StaffRoomRole | null,
  viewerEmail: string,
  commentAuthorEmail: string,
): BoardPermissionResult {
  return canEditPost(role, viewerEmail, commentAuthorEmail);
}

/**
 * 안 읽은 글인가.
 *
 * 계획서 §3.5-나 — 사람마다 글마다 기록을 남기면 부서 250개에서 375만 행이 된다.
 * 대신 **모듈별 "마지막으로 본 시각" 한 줄**만 두고, 그 시각 이후에 올라온 글을
 * 안 읽은 글로 본다. 250부서 × 30명 = 7,500행이면 끝난다.
 *
 * @param lastSeenAt 이 사람이 이 게시판을 마지막으로 본 시각. 한 번도 안 봤으면 null
 */
export function isPostUnread(postCreatedAt: string, lastSeenAt: string | null): boolean {
  if (lastSeenAt === null) return true;
  const created = new Date(postCreatedAt).getTime();
  const seen = new Date(lastSeenAt).getTime();
  if (Number.isNaN(created) || Number.isNaN(seen)) return false;
  // 같은 시각이면 이미 본 것으로 친다 — 목록을 열면서 시각을 갱신하므로,
  // 그 순간 올라온 글까지 안 읽음으로 세면 열자마자 배지가 다시 켜진다.
  return created > seen;
}

/** 안 읽은 글 수 */
export function countUnread(
  posts: readonly { readonly createdAt: string }[],
  lastSeenAt: string | null,
): number {
  return posts.filter((p) => isPostUnread(p.createdAt, lastSeenAt)).length;
}

/** 표시 이름 검사 결과 */
export type DisplayNameCheck =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly message: string };

/**
 * 부서에서 쓸 표시 이름을 다듬고 검사한다.
 *
 * 구글이 이름을 주지 않아서(쌤핀은 이메일 권한만 받고 `profile` 권한을 요청하지 않는다)
 * 멤버가 직접 적는다. 오히려 "3학년부 김철수"처럼 학교에서 쓰는 호칭을 쓸 수 있다.
 */
export function checkDisplayName(raw: string): DisplayNameCheck {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, message: '이름을 입력해주세요.' };
  }
  if (trimmed.length > STAFFROOM_DISPLAY_NAME_MAX_LENGTH) {
    return {
      ok: false,
      message: `이름은 ${STAFFROOM_DISPLAY_NAME_MAX_LENGTH}자까지 쓸 수 있습니다.`,
    };
  }
  return { ok: true, value: trimmed };
}

/** 화면에 보여줄 이름 — 안 정했으면 지메일을 그대로 쓴다 */
export function displayNameOf(member: {
  readonly email: string;
  readonly displayName: string | null;
}): string {
  const name = member.displayName?.trim();
  return name && name.length > 0 ? name : member.email;
}
