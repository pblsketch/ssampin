/**
 * 온라인 교무실 — 토론방·회의록·일정·업무·모듈 규칙 (M4)
 *
 * 계획서 §6 · §8-B · §8-C · §8-E
 *
 * 여기 있는 것은 전부 **순수 판정**이다. 서버(`_shared/staffroomAccess.ts`)에 같은 판정이
 * 한 벌 더 있다 — 화면에서 버튼을 숨기는 것은 방어가 아니기 때문이다.
 * **한쪽만 고치면 어긋나므로 둘을 함께 고칠 것.**
 *
 * domain 레이어이므로 외부 의존성을 import 하지 않는다.
 */
import {
  STAFFROOM_MAX_MODULES,
  STAFFROOM_MODULE_DEFAULT_NAMES,
  STAFFROOM_MODULE_NAME_MAX_LENGTH,
  STAFFROOM_ROOM_TITLE_MAX_LENGTH,
  STAFFROOM_VOTE_COMMENT_MAX_LENGTH,
  type StaffRoomStance,
  type StaffRoomTally,
} from '@domain/entities/StaffRoomRooms';
import type { StaffRoomRole } from '@domain/entities/StaffRoom';
import {
  STAFFROOM_SUBMISSION_GUIDE_MAX_LENGTH,
  STAFFROOM_SUBMISSION_TARGET_MAX,
  STAFFROOM_SUBMISSION_TITLE_MAX_LENGTH,
  type StaffRoomSubmissionDueState,
} from '@domain/entities/StaffRoomSubmission';

/** 지메일 비교용 정규화 */
function norm(email: string): string {
  return email.trim().toLowerCase();
}

// ══════════════════════════════════════════════════════════════════
// 1) 모듈 (§6 — 종류를 고르고 이름을 자유롭게 붙인다)
// ══════════════════════════════════════════════════════════════════

/** 검사 결과 */
export type TextCheck =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly message: string };

/** 모듈 이름을 다듬고 검사한다 */
export function checkModuleName(raw: unknown): TextCheck {
  if (typeof raw !== 'string') return { ok: false, message: '이름을 입력해주세요.' };
  const value = raw.trim();
  if (value.length === 0) return { ok: false, message: '이름을 입력해주세요.' };
  if (value.length > STAFFROOM_MODULE_NAME_MAX_LENGTH) {
    return {
      ok: false,
      message: `이름은 ${STAFFROOM_MODULE_NAME_MAX_LENGTH}자까지 쓸 수 있습니다.`,
    };
  }
  return { ok: true, value };
}

/** 이 종류의 기본 이름 */
export function defaultModuleName(kind: string): string {
  return STAFFROOM_MODULE_DEFAULT_NAMES[kind] ?? '새 공간';
}

/**
 * 모듈을 더 만들 수 있는가.
 *
 * 개수를 막는 이유는 저장 용량이 아니라 **화면**이다. 탭이 열두 개를 넘으면
 * 줄바꿈으로 넘쳐서 무엇이 있는지 한눈에 안 들어온다.
 */
export function canAddModule(currentCount: number): TextCheck {
  if (currentCount >= STAFFROOM_MAX_MODULES) {
    return {
      ok: false,
      message: `공간은 ${STAFFROOM_MAX_MODULES}개까지 만들 수 있습니다. 쓰지 않는 공간을 먼저 지워주세요.`,
    };
  }
  return { ok: true, value: '' };
}

/**
 * 이 모듈을 지울 수 있는가.
 *
 * ★ 게시판과 자료실은 **마지막 하나를 지울 수 없다.** 부서를 만들 때 기본으로 깔아주는
 *   두 가지고(§6), 없으면 공지도 자료도 둘 곳이 사라진다. 실수로 지웠을 때
 *   "다시 만들면 되지"가 아니라 **그 안에 있던 글이 함께 사라진다.**
 */
export function canDeleteModule(
  modules: readonly { readonly id: string; readonly kind: string }[],
  moduleId: string,
): TextCheck {
  const target = modules.find((m) => m.id === moduleId);
  if (!target) return { ok: false, message: '지울 공간을 찾을 수 없습니다.' };

  if (target.kind === 'board' || target.kind === 'archive') {
    const sameKind = modules.filter((m) => m.kind === target.kind).length;
    if (sameKind <= 1) {
      const label = defaultModuleName(target.kind);
      return {
        ok: false,
        message: `${label}은(는) 부서에 하나는 있어야 해서 지울 수 없습니다. 이름은 바꿀 수 있습니다.`,
      };
    }
  }
  return { ok: true, value: '' };
}

/** 모듈을 만들고 이름을 바꾸고 지우는 것은 관리자만 (§6 — 부서 설정) */
export function canManageModules(role: StaffRoomRole | null): boolean {
  return role === 'admin';
}

// ══════════════════════════════════════════════════════════════════
// 2) 토론방 (§6)
// ══════════════════════════════════════════════════════════════════

/** 안건·회의록 제목 검사 */
export function checkRoomTitle(raw: unknown): TextCheck {
  if (typeof raw !== 'string') return { ok: false, message: '제목을 입력해주세요.' };
  const value = raw.trim();
  if (value.length === 0) return { ok: false, message: '제목을 입력해주세요.' };
  if (value.length > STAFFROOM_ROOM_TITLE_MAX_LENGTH) {
    return {
      ok: false,
      message: `제목은 ${STAFFROOM_ROOM_TITLE_MAX_LENGTH}자까지 쓸 수 있습니다.`,
    };
  }
  return { ok: true, value };
}

/** 투표에 붙이는 의견 검사 — 비워도 된다 */
export function checkVoteComment(raw: unknown): TextCheck {
  if (raw === null || raw === undefined) return { ok: true, value: '' };
  if (typeof raw !== 'string') return { ok: false, message: '의견을 다시 입력해주세요.' };
  const value = raw.trim();
  if (value.length > STAFFROOM_VOTE_COMMENT_MAX_LENGTH) {
    return {
      ok: false,
      message: `의견은 ${STAFFROOM_VOTE_COMMENT_MAX_LENGTH}자까지 쓸 수 있습니다.`,
    };
  }
  return { ok: true, value };
}

/** 낼 수 있는 뜻인가 */
export function isStance(raw: unknown): raw is StaffRoomStance {
  return raw === 'agree' || raw === 'disagree' || raw === 'abstain';
}

/**
 * 지금 투표할 수 있는가.
 *
 * 마감한 안건에는 못 낸다 — 집계를 보고 뒤늦게 뒤집는 걸 막기 위해서다.
 */
export function canVote(closedAt: string | null): boolean {
  return closedAt === null;
}

/**
 * 안건을 마감할 수 있는가 — 낸 사람 또는 관리자.
 * 게시판 글을 고치는 기준과 같다.
 */
export function canCloseDiscussion(
  viewerEmail: string,
  viewerRole: StaffRoomRole | null,
  authorEmail: string,
): boolean {
  if (viewerRole === 'admin') return true;
  if (viewerRole === null) return false;
  return norm(viewerEmail) === norm(authorEmail);
}

/** 안건·회의록을 고치거나 지울 수 있는가 — 쓴 사람 또는 관리자 */
export function canEditRoomItem(
  viewerEmail: string,
  viewerRole: StaffRoomRole | null,
  authorEmail: string,
): boolean {
  return canCloseDiscussion(viewerEmail, viewerRole, authorEmail);
}

/** 집계에 참여한 사람 수 */
export function tallyTotal(tally: StaffRoomTally): number {
  return tally.agree + tally.disagree + tally.abstain;
}

/**
 * 집계를 한 줄로 읽어 준다.
 *
 * ★ "1등"이나 "우세" 같은 말을 쓰지 않는다. 부서 안의 뜻을 모으는 자리지
 *   이기고 지는 자리가 아니다. 숫자를 그대로 보여주고 판단은 사람이 한다.
 */
export function tallyLabel(tally: StaffRoomTally, memberCount: number): string {
  const voted = tallyTotal(tally);
  if (voted === 0) return '아직 아무도 뜻을 내지 않았습니다.';
  const rest = Math.max(0, memberCount - voted);
  const base = `찬성 ${tally.agree} · 반대 ${tally.disagree} · 기권 ${tally.abstain}`;
  return rest > 0 ? `${base} (아직 ${rest}분이 안 내셨습니다)` : base;
}

// ══════════════════════════════════════════════════════════════════
// 3) 부서 일정 (§8-B)
// ══════════════════════════════════════════════════════════════════

/**
 * YYYY-MM-DD 인가.
 *
 * ★ 반드시 **UTC 로 따진다.** `new Date('2026-08-21T00:00:00')` 은 그 PC 의 현지 시각으로
 *   읽히는데, 한국(UTC+9)에서 그걸 다시 ISO 로 되돌리면 **전날**이 나온다.
 *   그대로 두면 멀쩡한 날짜가 전부 거부된다.
 *
 * 형식만 보지 않고 되돌려 맞춰 보는 이유는 2026-02-31 같은 **없는 날**을 걸러내기
 * 위해서다. Date 는 그런 날을 3월로 조용히 굴려 버린다.
 */
export function isDateString(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!matched) return false;

  const [, year, month, day] = matched;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === raw;
}

/** "14:30" 인가 */
export function isTimeString(raw: unknown): raw is string {
  return typeof raw === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw);
}

/** 일정 입력 검사 결과 */
export type EventCheck = { readonly ok: true } | { readonly ok: false; readonly message: string };

/** 부서 일정을 저장해도 되는가 */
export function checkEvent(input: {
  readonly title: unknown;
  readonly startsOn: unknown;
  readonly endsOn: unknown;
  readonly startTime: unknown;
}): EventCheck {
  const title = checkRoomTitle(input.title);
  if (!title.ok) return { ok: false, message: title.message };

  if (!isDateString(input.startsOn)) {
    return { ok: false, message: '날짜를 올바르게 골라주세요.' };
  }
  if (input.endsOn !== null && input.endsOn !== undefined && input.endsOn !== '') {
    if (!isDateString(input.endsOn)) {
      return { ok: false, message: '마지막 날을 올바르게 골라주세요.' };
    }
    if (input.endsOn < input.startsOn) {
      return { ok: false, message: '마지막 날이 시작 날보다 앞설 수 없습니다.' };
    }
  }
  if (input.startTime !== null && input.startTime !== undefined && input.startTime !== '') {
    if (!isTimeString(input.startTime)) {
      return { ok: false, message: '시각을 올바르게 입력해주세요. (예: 14:30)' };
    }
  }
  return { ok: true };
}

/**
 * 이 날짜에 걸리는 일정인가 — 내 달력 위에 겹쳐 보여줄 때 쓴다.
 *
 * 여러 날 걸친 일정은 중간 날에도 떠야 한다. `endsOn` 이 없으면 하루짜리다.
 */
export function eventCoversDate(
  event: { readonly startsOn: string; readonly endsOn: string | null },
  date: string,
): boolean {
  if (event.endsOn === null) return event.startsOn === date;
  return event.startsOn <= date && date <= event.endsOn;
}

/** 일정을 고치거나 지울 수 있는가 — 만든 사람 또는 관리자 */
export function canEditEvent(
  viewerEmail: string,
  viewerRole: StaffRoomRole | null,
  authorEmail: string,
): boolean {
  return canEditRoomItem(viewerEmail, viewerRole, authorEmail);
}

// ══════════════════════════════════════════════════════════════════
// 4) 업무 분담 (§8-B)
// ══════════════════════════════════════════════════════════════════

/** 업무 입력 검사 */
export function checkTask(input: { readonly title: unknown; readonly dueOn: unknown }): EventCheck {
  const title = checkRoomTitle(input.title);
  if (!title.ok) return { ok: false, message: title.message };
  if (input.dueOn !== null && input.dueOn !== undefined && input.dueOn !== '') {
    if (!isDateString(input.dueOn)) {
      return { ok: false, message: '기한을 올바르게 골라주세요.' };
    }
  }
  return { ok: true };
}

/**
 * 이 업무를 끝냈다고 표시할 수 있는가.
 *
 * **맡은 본인**과 관리자다. 남의 일을 끝났다고 표시하면 실제로는 안 끝난 일이
 * 목록에서 사라진다. 아직 아무도 안 맡은 일은 멤버 누구나 집어 갈 수 있다.
 */
export function canToggleTaskDone(
  viewerEmail: string,
  viewerRole: StaffRoomRole | null,
  assigneeEmail: string | null,
): boolean {
  if (viewerRole === null) return false;
  if (viewerRole === 'admin') return true;
  if (assigneeEmail === null) return true;
  return norm(viewerEmail) === norm(assigneeEmail);
}

/** 업무를 고치거나 지울 수 있는가 — 만든 사람 또는 관리자 */
export function canEditTask(
  viewerEmail: string,
  viewerRole: StaffRoomRole | null,
  authorEmail: string,
): boolean {
  return canEditRoomItem(viewerEmail, viewerRole, authorEmail);
}

// ═════════════════════════════════════════════════════════════════
// 제출 과제 (계획서 D2 · R8)
//
// ★ 서버에도 같은 판정이 있다 — supabase/functions/_shared/staffroomSubmissions.ts
//   Deno 는 src/ 를 import 할 수 없어 일부러 두 벌이다. 어긋나면 화면은 막는데
//   서버는 통과하거나 그 반대가 되므로, 두 테스트가 **같은 케이스 표 한 벌**을
//   함께 돌린다 — src/domain/rules/__tests__/fixtures/submissionAuthzCases.ts
// ═════════════════════════════════════════════════════════════════

/**
 * "냈음" 표시를 켜고 끌 수 있는가 — **본인 · 만든 사람(취합자) · 관리자**.
 *
 * 취합자가 들어가는 이유: 종이나 메신저로 받은 것을 대신 체크할 수 있어야
 * 현황판이 실제와 맞는다. 그 밖의 멤버는 남의 칸을 건드릴 수 없다.
 */
export function canToggleSubmissionDone(
  viewerEmail: string,
  viewerRole: StaffRoomRole | null,
  targetEmail: string,
  authorEmail: string,
): boolean {
  if (viewerRole === null) return false;
  if (viewerRole === 'admin') return true;
  if (norm(viewerEmail) === norm(targetEmail)) return true;
  return norm(viewerEmail) === norm(authorEmail);
}

/**
 * "누가 안 냈는지" 명단을 볼 수 있는가 — **만든 사람과 관리자뿐**.
 *
 * 일반 멤버에게는 진행률 숫자와 자기 상태만 보인다.
 * ★ 화면이 단추를 감추는 것과 별개로 **서버가 명단을 안 보낸다.**
 */
export function canSeeUnsubmittedList(
  viewerEmail: string,
  viewerRole: StaffRoomRole | null,
  authorEmail: string,
): boolean {
  if (viewerRole === null) return false;
  if (viewerRole === 'admin') return true;
  return norm(viewerEmail) === norm(authorEmail);
}

/**
 * 제출 과제 만들기·고치기 입력 검사.
 *
 * 만들기는 멤버 누구나 할 수 있다(취합이 부장만의 일이 아니라서) — 그래서 여기는
 * `viewerRole` 을 받지 않는다. 누가 할 수 있는지는 화면이 "만들기" 단추를 항상 보여주는
 * 것으로 이미 표현돼 있다.
 */
export function checkSubmission(input: {
  readonly title: unknown;
  readonly dueOn: unknown;
  readonly guide: unknown;
  readonly docUrl: unknown;
  readonly targetEmails: unknown;
}): EventCheck {
  if (typeof input.title !== 'string' || input.title.trim().length === 0) {
    return { ok: false, message: '제목을 입력해주세요.' };
  }
  if (input.title.length > STAFFROOM_SUBMISSION_TITLE_MAX_LENGTH) {
    return {
      ok: false,
      message: `제목은 ${STAFFROOM_SUBMISSION_TITLE_MAX_LENGTH}자까지 쓸 수 있습니다.`,
    };
  }
  if (input.dueOn !== null && input.dueOn !== undefined && input.dueOn !== '') {
    if (!isDateString(input.dueOn)) {
      return { ok: false, message: '마감일을 올바르게 골라주세요.' };
    }
  }
  if (
    typeof input.guide === 'string' &&
    input.guide.length > STAFFROOM_SUBMISSION_GUIDE_MAX_LENGTH
  ) {
    return {
      ok: false,
      message: `안내 문구는 ${STAFFROOM_SUBMISSION_GUIDE_MAX_LENGTH}자까지 쓸 수 있습니다.`,
    };
  }
  if (typeof input.docUrl !== 'string' || input.docUrl.trim().length === 0) {
    return { ok: false, message: '제출할 문서·시트 주소를 입력해주세요.' };
  }
  if (!/^https?:\/\//i.test(input.docUrl.trim())) {
    return { ok: false, message: '문서 주소는 http:// 또는 https:// 로 시작해야 합니다.' };
  }
  if (
    Array.isArray(input.targetEmails) &&
    input.targetEmails.length > STAFFROOM_SUBMISSION_TARGET_MAX
  ) {
    return {
      ok: false,
      message: `제출 주체는 ${STAFFROOM_SUBMISSION_TARGET_MAX}명까지 걸 수 있습니다.`,
    };
  }
  return { ok: true };
}

/** YYYY-MM-DD 두 날짜 사이의 날 수(UTC 기준) — `to` 가 `from` 보다 미래면 양수 */
function daysBetween(from: string, to: string): number {
  const toUtcDays = (dateStr: string): number => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 0) / 86_400_000;
  };
  return toUtcDays(to) - toUtcDays(from);
}

/** 마감까지 남은 날 수. dueOn 이 today 보다 미래일 때 화면의 "N일 남음" 문구에 쓴다 */
export function daysUntilSubmissionDue(dueOn: string, today: string): number {
  return daysBetween(today, dueOn);
}

/**
 * 마감까지 남은 날로 과제 상태를 가른다 — 화면이 배지 색을 고를 때 쓴다.
 *
 * 넷으로 나눈 이유는 타입 정의(`StaffRoomSubmissionDueState`)에 적어 두었다 —
 * "지났다"와 "오늘까지"는 성격이 다르고(하나는 사고, 하나는 재촉), "내일까지"는
 * 오늘 손대야 하는 것이다. 그보다 멀면 다 같다.
 */
export function submissionDueState(
  dueOn: string | null,
  today: string,
): StaffRoomSubmissionDueState {
  if (dueOn === null) return 'none';
  if (dueOn < today) return 'over';
  if (dueOn === today) return 'today';
  return daysUntilSubmissionDue(dueOn, today) === 1 ? 'tomorrow' : 'later';
}

/**
 * 기한이 지났는가 — 화면이 빨갛게 표시할 때 쓴다.
 * 끝난 일은 기한이 지나도 재촉하지 않는다.
 */
export function isTaskOverdue(
  task: { readonly dueOn: string | null; readonly doneAt: string | null },
  today: string,
): boolean {
  if (task.doneAt !== null) return false;
  if (task.dueOn === null) return false;
  return task.dueOn < today;
}
