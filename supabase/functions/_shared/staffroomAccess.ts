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

// ══════════════════════════════════════════════════════════════════
// 자료실 (M3)
//
// 계획서 §8-C(새 버전) · §10.6(200MB 상한) · §3.4-나(내려받기 권한)
// `src/domain/rules/staffRoomLibraryRules.ts` 와 같은 규칙이다.
// 한쪽만 고치면 화면과 서버가 어긋나므로 둘을 함께 고칠 것.
// ══════════════════════════════════════════════════════════════════

/**
 * 파일 하나의 크기 상한 — 200MB (§10.6 오너 결정).
 * 화면(`StaffRoomLibrary.ts`)과 **같은 값이어야 한다.**
 *
 * 화면에서 이미 막지만 서버가 다시 본다 — 화면 검사는 방어가 아니다.
 * 누구나 anon key 로 staffroom-library 를 직접 부를 수 있다.
 */
export const LIBRARY_FILE_MAX_BYTES = 200 * 1024 * 1024;

/** 파일 이름 최대 길이 — 화면과 같은 값 */
export const LIBRARY_FILE_NAME_MAX_LENGTH = 200;

/** 파일을 올릴 수 있는가 — 멤버면 누구나(§10.6: 업로드 승인 절차를 두지 않는다) */
export function canUploadFile(members: readonly AccessMember[], email: string): AccessResult {
  return requireMember(members, email);
}

/** 파일을 지울 수 있는가 — 올린 사람 본인 또는 관리자 */
export function canDeleteFile(
  members: readonly AccessMember[],
  viewerEmail: string,
  uploaderEmail: string,
): AccessResult {
  const found = requireMember(members, viewerEmail);
  if (!found.ok) return found;
  if (found.member.role === 'admin') return found;
  if (norm(viewerEmail) === norm(uploaderEmail)) return found;
  return { ok: false, reason: 'not_author' };
}

/** 올리기 입력 검사 결과 */
export type UploadCheck =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly message: string };

/**
 * 올릴 파일의 이름·크기를 검사한다.
 *
 * ★ 이 검사가 서버에도 있어야 하는 이유 — 파일 바이트가 서버를 지나지 않으므로
 *   (ADR-065) 서버는 "실제로 무엇이 올라갔는지"를 나중에야 안다. 그래서 세션을
 *   내주기 **전에** 여기서 걸러야 200MB 짜리가 관리자 드라이브에 들어갔다 나오는
 *   일을 막을 수 있다. 커밋 때 드라이브에 되물어 한 번 더 대조한다.
 */
export function checkUploadInput(name: unknown, size: unknown): UploadCheck {
  if (typeof name !== 'string' || name.trim().length === 0) {
    return { ok: false, message: '파일 이름이 없습니다.' };
  }
  const trimmed = name.trim();
  if (trimmed.length > LIBRARY_FILE_NAME_MAX_LENGTH) {
    return {
      ok: false,
      message: `파일 이름은 ${LIBRARY_FILE_NAME_MAX_LENGTH}자까지 쓸 수 있습니다.`,
    };
  }
  if (trimmed.includes('/') || trimmed.includes('\\')) {
    return { ok: false, message: '파일 이름에 / 나 \\ 는 쓸 수 없습니다.' };
  }
  if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) {
    return { ok: false, message: '파일 크기를 알 수 없습니다.' };
  }
  if (size > LIBRARY_FILE_MAX_BYTES) {
    return { ok: false, message: '파일 하나는 200MB까지 올릴 수 있습니다.' };
  }
  return { ok: true, name: trimmed };
}

/**
 * 올라온 파일이 표(ticket)와 맞는가 — 커밋 때 대조 (ADR-065).
 *
 * ★ 멤버가 "다 올렸습니다" 하며 보내는 드라이브 파일 id 를 그대로 믿으면 안 된다.
 *   관리자 드라이브의 **아무 파일 id** 나 보내면 그 파일이 자료실에 등록되고,
 *   그 순간 부서 멤버 전원이 그 파일을 열 수 있게 된다(§3.4-나 가 권한을 주므로).
 *   관리자 선생님의 개인 파일이 새어 나가는 길이다.
 *
 * 그래서 세 가지를 본다: 부서 폴더 안에 있는가 · 이름이 같은가 · 크기가 같은가.
 */
export function matchesTicket(
  ticket: { readonly name: string; readonly size: number; readonly folderId: string },
  actual: {
    readonly name: string;
    readonly size: number;
    readonly parents: readonly string[];
    readonly trashed: boolean;
  },
): { readonly ok: true } | { readonly ok: false; readonly message: string } {
  if (actual.trashed) {
    return { ok: false, message: '올라간 파일을 찾을 수 없습니다. 다시 올려주세요.' };
  }
  if (!actual.parents.includes(ticket.folderId)) {
    return { ok: false, message: '이 부서 자료실에 올라간 파일이 아닙니다.' };
  }
  if (actual.name !== ticket.name) {
    return { ok: false, message: '올린 파일의 이름이 처음 알린 것과 다릅니다.' };
  }
  if (actual.size !== ticket.size) {
    return { ok: false, message: '올린 파일의 크기가 처음 알린 것과 다릅니다.' };
  }
  return { ok: true };
}

/** 올리기 표의 유효 시간 — 하루 지나면 못 쓴다 */
export const UPLOAD_TICKET_TTL_MS = 24 * 60 * 60 * 1000;

/** 이 표를 아직 쓸 수 있는가 */
export function isTicketUsable(
  ticket: {
    readonly uploaderEmail: string;
    readonly createdAt: string;
    readonly consumedAt: string | null;
  },
  email: string,
  nowMs: number,
): { readonly ok: true } | { readonly ok: false; readonly message: string } {
  if (ticket.consumedAt) {
    return { ok: false, message: '이미 등록된 파일입니다.' };
  }
  if (norm(ticket.uploaderEmail) !== norm(email)) {
    return { ok: false, message: '이 파일을 올린 분만 등록할 수 있습니다.' };
  }
  const created = new Date(ticket.createdAt).getTime();
  if (!Number.isFinite(created) || nowMs - created > UPLOAD_TICKET_TTL_MS) {
    return { ok: false, message: '올리기 시간이 지났습니다. 다시 올려주세요.' };
  }
  return { ok: true };
}

// ══════════════════════════════════════════════════════════════════
// 토론방 · 회의록 · 부서 일정 · 업무 분담 (M4)
//
// 계획서 §6 · §8-B · §8-C · §8-E
// `src/domain/rules/staffRoomRoomRules.ts` 와 같은 규칙이다.
// 한쪽만 고치면 화면과 서버가 어긋나므로 둘을 함께 고칠 것.
// ══════════════════════════════════════════════════════════════════

/** 공간(모듈)을 만들고 이름을 바꾸고 지우는 것은 관리자만 (§6 — 부서 설정) */
export function canManageModules(members: readonly AccessMember[], email: string): AccessResult {
  return requireAdmin(members, email);
}

/** 부서 하나가 가질 수 있는 공간 수 — 화면(StaffRoomRooms.ts)과 같은 값 */
export const MAX_MODULES = 12;

/** 공간 이름 최대 길이 — 화면과 같은 값 */
export const MODULE_NAME_MAX_LENGTH = 20;

/** 안건·회의록 제목 최대 길이 — 화면과 같은 값 */
export const ROOM_TITLE_MAX_LENGTH = 100;

/** 만들 수 있는 공간 종류 */
export const MODULE_KINDS = ['board', 'archive', 'discussion', 'gallery', 'minutes'] as const;

/** 낼 수 있는 뜻 */
export const STANCES = ['agree', 'disagree', 'abstain'] as const;

/** 글자 검사 결과 */
export type TextCheck =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly message: string };

/** 길이가 정해진 글자를 다듬고 검사한다 */
export function checkText(raw: unknown, max: number, label: string): TextCheck {
  if (typeof raw !== 'string') return { ok: false, message: `${label}을(를) 입력해주세요.` };
  const value = raw.trim();
  if (value.length === 0) return { ok: false, message: `${label}을(를) 입력해주세요.` };
  if (value.length > max) {
    return { ok: false, message: `${label}은(는) ${max}자까지 쓸 수 있습니다.` };
  }
  return { ok: true, value };
}

/**
 * 이 공간을 지울 수 있는가.
 *
 * ★ 게시판과 자료실은 **마지막 하나를 지울 수 없다.** 부서를 만들 때 기본으로 깔아주는
 *   둘이고(§6), 지우면 그 안에 있던 글·자료가 함께 사라진다.
 */
export function canDeleteModule(
  modules: readonly { readonly id: string; readonly kind: string }[],
  moduleId: string,
): { readonly ok: true } | { readonly ok: false; readonly message: string } {
  const target = modules.find((m) => m.id === moduleId);
  if (!target) return { ok: false, message: '지울 공간을 찾을 수 없습니다.' };
  if (target.kind === 'board' || target.kind === 'archive') {
    const sameKind = modules.filter((m) => m.kind === target.kind).length;
    if (sameKind <= 1) {
      const label = target.kind === 'board' ? '게시판' : '자료실';
      return { ok: false, message: `${label}은(는) 부서에 하나는 있어야 해서 지울 수 없습니다.` };
    }
  }
  return { ok: true };
}

/** 안건을 마감하거나 안건·회의록을 고치고 지울 수 있는가 — 쓴 사람 또는 관리자 */
export function canEditRoomItem(
  members: readonly AccessMember[],
  viewerEmail: string,
  authorEmail: string,
): AccessResult {
  const found = requireMember(members, viewerEmail);
  if (!found.ok) return found;
  if (found.member.role === 'admin') return found;
  if (norm(viewerEmail) === norm(authorEmail)) return found;
  return { ok: false, reason: 'not_author' };
}

/**
 * 이 업무를 끝냈다고 표시할 수 있는가.
 *
 * **맡은 본인**과 관리자다. 남의 일을 끝났다고 표시하면 실제로는 안 끝난 일이
 * 목록에서 사라진다. 아직 아무도 안 맡은 일은 멤버 누구나 집어 갈 수 있다.
 */
export function canToggleTaskDone(
  members: readonly AccessMember[],
  viewerEmail: string,
  assigneeEmail: string | null,
): AccessResult {
  const found = requireMember(members, viewerEmail);
  if (!found.ok) return found;
  if (found.member.role === 'admin') return found;
  if (assigneeEmail === null) return found;
  if (norm(viewerEmail) === norm(assigneeEmail)) return found;
  return { ok: false, reason: 'not_author' };
}

/** 담당자로 지정할 수 있는 사람인가 — 이 부서 멤버만 */
export function normalizeAssignee(members: readonly AccessMember[], raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  const target = norm(raw);
  const found = members.find((m) => norm(m.email) === target);
  return found ? norm(found.email) : null;
}

/**
 * YYYY-MM-DD 인가.
 *
 * ★ **UTC 로 따진다.** 현지 시각으로 읽으면 한국(UTC+9)에서 되돌릴 때 전날이 나와
 *   멀쩡한 날짜가 전부 거부된다. 형식만 보지 않고 되돌려 맞추는 이유는
 *   2026-02-31 같은 없는 날을 걸러내기 위해서다.
 */
export function isDateString(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!matched) return false;
  const parsed = new Date(Date.UTC(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3])));
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === raw;
}

/** "14:30" 인가 */
export function isTimeString(raw: unknown): raw is string {
  return typeof raw === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw);
}

/** 비어 있으면 null 로 (화면 입력칸이 비면 빈 문자열로 온다) */
export function emptyToNull(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  return value.length === 0 ? null : value;
}
