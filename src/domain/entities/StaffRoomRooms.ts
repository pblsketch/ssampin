/**
 * 온라인 교무실 — 토론방 · 갤러리 · 회의록 · 배너 · 부서 일정 · 업무 분담 (M4)
 *
 * 계획서: §6(화면 구성·모듈 이름) · §8-B(일정·업무 분담) · §8-C(회의록) · §9(M4)
 *
 * ★ §8-E — **활동 포인트·랭킹·출석도장은 넣지 않는다.** 쌤핀의 명시적 금지 규칙이고
 *   선생님 대상이면 더 부담스럽다. 그래서 이 파일 어디에도 "사람별 누적 점수"를
 *   담는 자리가 없다. 세는 것은 **안건 하나의 찬반**뿐이고, 업무의 `doneAt` 은
 *   그 일이 끝났는지를 말할 뿐 사람에게 붙는 값이 아니다.
 *
 * domain 레이어이므로 외부 의존성을 import 하지 않는다.
 */

// ══════════════════════════════════════════════════════════════════
// 배너 (§6)
// ══════════════════════════════════════════════════════════════════

/**
 * 배너 종류.
 *  - `color`  고른 색. **기본값** — 아무것도 안 골라도 부서마다 달라 보인다.
 *  - `preset` 쌤핀이 준비한 그림
 *  - `photo`  올린 사진. 값은 드라이브 파일 id 다(§3.4 — 그림도 서버에 쌓지 않는다)
 */
export type StaffRoomBannerKind = 'color' | 'preset' | 'photo';

export interface StaffRoomBanner {
  readonly kind: StaffRoomBannerKind;
  /** color 면 토큰 이름, preset 이면 그림 이름, photo 면 드라이브 파일 id */
  readonly value: string;
}

/**
 * 고를 수 있는 배너 색.
 *
 * 하드코딩 HEX 를 쓰지 않는다 — 화면이 `sp-*` 토큰으로 바꿔 쓴다.
 * 다크 모드에서 함께 어두워져야 하기 때문이다.
 */
export const STAFFROOM_BANNER_COLORS = ['accent', 'highlight', 'success', 'info', 'muted'] as const;

export type StaffRoomBannerColor = (typeof STAFFROOM_BANNER_COLORS)[number];

// ══════════════════════════════════════════════════════════════════
// 토론방 (§6)
// ══════════════════════════════════════════════════════════════════

/**
 * 한 사람의 뜻.
 *
 * `abstain`(기권)을 둔 이유 — "읽었지만 판단을 미룬다"를 말할 자리가 없으면
 * 그 사람은 아무것도 누르지 않고, 그러면 **안 본 사람과 구분되지 않는다.**
 */
export type StaffRoomStance = 'agree' | 'disagree' | 'abstain';

/** 토론방 안건 */
export interface StaffRoomDiscussion {
  readonly id: string;
  readonly moduleId: string;
  readonly departmentId: string;
  readonly title: string;
  readonly body: string;
  readonly authorEmail: string;
  readonly authorName: string | null;
  /** 마감했으면 그 시각. 마감하면 더 투표할 수 없고 집계가 굳는다 */
  readonly closedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** 안건 하나의 찬반 수. **사람별 누적이 아니다**(§8-E) */
  readonly tally: StaffRoomTally;
  /** 내가 낸 뜻. 아직 안 냈으면 null */
  readonly myVote: StaffRoomVote | null;
}

/** 안건 하나의 집계 */
export interface StaffRoomTally {
  readonly agree: number;
  readonly disagree: number;
  readonly abstain: number;
}

/** 한 사람이 낸 뜻과 의견 */
export interface StaffRoomVote {
  readonly memberEmail: string;
  readonly memberName: string | null;
  readonly stance: StaffRoomStance;
  /** 왜 그렇게 생각하는지. 비워도 된다 — 강제하면 투표 자체를 안 한다 */
  readonly comment: string;
  readonly updatedAt: string;
}

// ══════════════════════════════════════════════════════════════════
// 회의록 (§8-C)
// ══════════════════════════════════════════════════════════════════

/**
 * 회의록.
 *
 * 안건 → 논의 → 결정사항을 **따로 받는다.** 한 덩어리 글로 두면
 * "그래서 뭘 정했나"가 문단 속에 묻힌다. 나중에 찾을 때 필요한 건 결정사항이다.
 */
export interface StaffRoomMinutes {
  readonly id: string;
  readonly moduleId: string;
  readonly departmentId: string;
  readonly title: string;
  /** 회의한 날. 만든 날과 다를 수 있다(보통 회의 뒤에 적는다) */
  readonly metOn: string;
  /** 참석자를 글자로. 멤버 명단과 잇지 않는 이유 — 외부 참석자도 오고, 빠진 멤버도 있다 */
  readonly attendees: string;
  readonly agenda: string;
  readonly discussion: string;
  readonly decisions: string;
  /** 토론방 안건에서 굳힌 것이면 그 안건 id */
  readonly fromDiscussionId: string | null;
  readonly authorEmail: string;
  readonly authorName: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** 회의록 입력 */
export interface WriteStaffRoomMinutesInput {
  readonly title: string;
  /** YYYY-MM-DD */
  readonly metOn: string;
  readonly attendees: string;
  readonly agenda: string;
  readonly discussion: string;
  readonly decisions: string;
  /** 토론방 안건에서 굳힌 것이면 그 안건 id */
  readonly fromDiscussionId: string | null;
}

// ══════════════════════════════════════════════════════════════════
// 부서 일정 (§8-B)
// ══════════════════════════════════════════════════════════════════

/**
 * 부서 일정.
 *
 * ★ 개인 일정으로 **복사하지 않는다.** 부서 일정은 부서가 주인이라 멤버가 바뀌어도
 *   남아야 하고 부서를 나가면 안 보여야 한다. 복사해 넣으면 나간 뒤에도 남고,
 *   부서에서 고쳐도 이미 복사된 것은 안 바뀐다. 앱은 이걸 **읽어서 겹쳐 보여줄 뿐**이다.
 */
export interface StaffRoomEvent {
  readonly id: string;
  readonly departmentId: string;
  /** 어느 부서 것인지 화면에 함께 띄운다 — 내 달력에 여러 부서가 겹쳐 뜨므로 */
  readonly departmentName: string;
  readonly title: string;
  /** YYYY-MM-DD */
  readonly startsOn: string;
  /** 여러 날 걸치면 마지막 날. 하루짜리면 null */
  readonly endsOn: string | null;
  /** "14:30". 종일 일정이면 null */
  readonly startTime: string | null;
  readonly place: string;
  readonly memo: string;
  readonly authorEmail: string;
  readonly authorName: string | null;
}

/** 부서 일정 입력 */
export interface WriteStaffRoomEventInput {
  readonly title: string;
  readonly startsOn: string;
  readonly endsOn: string | null;
  readonly startTime: string | null;
  readonly place: string;
  readonly memo: string;
}

// ══════════════════════════════════════════════════════════════════
// 업무 분담 (§8-B)
// ══════════════════════════════════════════════════════════════════

/**
 * 부서 업무.
 *
 * ★ "누가 뭘 맡았는지"를 적는 곳이지 **누가 얼마나 했는지를 세는 곳이 아니다.**
 *   `doneAt` 은 그 일이 끝났는지를 말할 뿐 사람에게 붙는 점수가 아니다(§8-E).
 */
export interface StaffRoomTask {
  readonly id: string;
  readonly departmentId: string;
  readonly departmentName: string;
  readonly title: string;
  /** 맡은 사람. 아직 안 정했으면 null — "누가 할까요"를 적어 둘 자리가 필요하다 */
  readonly assigneeEmail: string | null;
  readonly assigneeName: string | null;
  /** YYYY-MM-DD. 기한이 없으면 null */
  readonly dueOn: string | null;
  readonly memo: string;
  /** 끝난 시각. 안 끝났으면 null */
  readonly doneAt: string | null;
  readonly authorEmail: string;
}

/** 업무 입력 */
export interface WriteStaffRoomTaskInput {
  readonly title: string;
  readonly assigneeEmail: string | null;
  readonly dueOn: string | null;
  readonly memo: string;
}

// ══════════════════════════════════════════════════════════════════
// 모듈 이름 붙이기 (§6)
// ══════════════════════════════════════════════════════════════════

/** 모듈 종류별 기본 이름 — 관리자가 바꾸기 전까지 쓰는 값 */
export const STAFFROOM_MODULE_DEFAULT_NAMES: Readonly<Record<string, string>> = {
  board: '게시판',
  archive: '자료실',
  discussion: '토론방',
  gallery: '갤러리',
  minutes: '회의록',
};

/** 모듈 종류별 아이콘 (Material Symbols) */
export const STAFFROOM_MODULE_ICONS: Readonly<Record<string, string>> = {
  board: 'forum',
  archive: 'folder',
  discussion: 'how_to_vote',
  gallery: 'photo_library',
  minutes: 'gavel',
};

/** 모듈 이름 최대 길이 */
export const STAFFROOM_MODULE_NAME_MAX_LENGTH = 20;

/** 안건·회의록 제목 최대 길이 — 게시판 글과 같은 값 */
export const STAFFROOM_ROOM_TITLE_MAX_LENGTH = 100;

/** 투표에 붙이는 의견 최대 길이 */
export const STAFFROOM_VOTE_COMMENT_MAX_LENGTH = 1_000;

/** 부서 하나가 가질 수 있는 모듈 수 — 탭이 줄바꿈으로 넘치지 않는 선 */
export const STAFFROOM_MAX_MODULES = 12;
