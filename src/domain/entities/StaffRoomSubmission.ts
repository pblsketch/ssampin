/**
 * 온라인 교무실 — 제출 과제 (066)
 *
 * 계획서: .omc/plans/staffroom-submission-plan.md
 * 명세  : .omc/specs/deep-interview-staffroom-swl.md (딥 인터뷰 10라운드, 결정 R1~R10)
 *
 * ── 부서 업무(StaffRoomTask)와 무엇이 다른가 ────────────────────────
 * 업무는 **한 사람이 1년 내내 도는 일**이다 — "출결 관리".
 * 제출 과제는 **여럿이 각자 내고 다 내면 끝나는 일**이다 — "2학기 수행평가
 * 계획 제출 9/15까지". 학교 업무의 상당수가 뒤쪽인데 담을 자리가 없었다.
 *
 * ── ★ §8-E — 사람별 누적을 보여주지 않는다 ─────────────────────────
 * `doneAt` 은 그 칸이 끝났는지를 말할 뿐 사람에게 붙는 점수가 아니다.
 * 여러 과제를 가로질러 "이 분이 N개 안 냄"으로 세는 자리를 만들지 않는다.
 *
 * domain 레이어이므로 외부 의존성을 import 하지 않는다.
 */

/**
 * 목록에 뜨는 제출 과제 한 줄.
 *
 * ★ **제출 주체의 지메일·이름 칸이 없다.** 진행률은 숫자로만, 내 상태는 내
 *   것만 온다. 서버의 투영 함수도 같은 모양이라, 실수로 담으려 하면 타입이
 *   막는다(계획서 D2). 명단은 `listSubmissionTargets` 로만 따로 받는다.
 */
export interface StaffRoomSubmission {
  readonly id: string;
  readonly moduleId: string;
  readonly title: string;
  /** 마감일 YYYY-MM-DD. 없으면 null 이고 화면은 "기한 없음"으로 그린다 */
  readonly dueOn: string | null;
  /** 안내 문구 — "링크를 열어 과목별 시트에 작성해 주세요" 같은 것 */
  readonly guide: string;
  /** 제출할 구글 문서·시트 주소. http/https 만 서버가 받는다 */
  readonly docUrl: string;
  /**
   * 만든 사람(취합자).
   *
   * ★ 응답에 담기는 **유일한 남의 지메일**이다. 화면이 "내가 만든 과제인가"를
   *   판정해 "안 낸 분 보기" 단추를 그릴지 정해야 해서 예외로 둔다.
   *   이름(authorName)은 담지 않는다.
   */
  readonly authorEmail: string;
  /** 낸 사람 수 — 부서를 나간 사람은 빼고 센다 */
  readonly doneCount: number;
  /** 내야 하는 사람 수 — 부서를 나간 사람은 빼고 센다 */
  readonly totalCount: number;
  /** 내가 낸 시각. 내가 주체가 아니거나 아직 안 냈으면 null */
  readonly myDoneAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** 개인 할 일 화면에 겹쳐 보여줄 때는 어느 부서 것인지 함께 온다 */
export interface StaffRoomMySubmission extends StaffRoomSubmission {
  readonly departmentId: string;
  readonly departmentName: string;
}

/** 명단에 실리는 한 사람 */
export interface StaffRoomSubmissionTarget {
  readonly email: string;
  /** 화면에 보일 이름. 아무도 이름을 안 정했으면 null — 화면이 대신 그린다 */
  readonly name: string | null;
  readonly doneAt: string | null;
}

/**
 * 제출 주체 명단 — 세 구역.
 *
 * `done` 이 필요한 이유: 취합자가 실수로 켠 것을 되돌리려면 **낸 사람이 보여야
 * 한다.** 안 낸 사람만 주면 잘못 체크한 칸을 찾을 길이 없다.
 * `excluded` 가 따로 있는 이유: 부서를 나간 사람은 진행률 분모에서 빠지는데,
 * 왜 빠졌는지 안 보이면 숫자가 갑자기 줄어든 것처럼 보인다.
 */
export interface StaffRoomSubmissionTargets {
  readonly done: readonly StaffRoomSubmissionTarget[];
  readonly pending: readonly StaffRoomSubmissionTarget[];
  readonly excluded: readonly StaffRoomSubmissionTarget[];
}

/** 제출 과제 만들기·고치기 입력 */
export interface WriteStaffRoomSubmissionInput {
  readonly title: string;
  /** YYYY-MM-DD. 기한이 없으면 null */
  readonly dueOn: string | null;
  readonly guide: string;
  readonly docUrl: string;
  /** 제출 주체로 걸 부서 멤버들의 지메일 */
  readonly targetEmails: readonly string[];
}

/**
 * 저장 결과.
 *
 * `droppedTargets` 는 **부서 멤버가 아니라 빠진 사람 수**다. 조용히 버리면
 * 만든이는 B 선생님을 걸었다고 믿는데 B 화면에 아무것도 안 뜨고, 아무도
 * 원인을 모른다(AC-B5 와 같은 원칙 — 조용히 버리지 않는다).
 */
export interface StaffRoomSubmissionSaveResult {
  readonly submission: StaffRoomSubmission;
  readonly droppedTargets: number;
}

/** 과제 이름 최대 길이 — 게시판 글 제목과 같은 값 */
export const STAFFROOM_SUBMISSION_TITLE_MAX_LENGTH = 100;

/** 안내 문구 최대 길이 */
export const STAFFROOM_SUBMISSION_GUIDE_MAX_LENGTH = 500;

/**
 * 한 과제에 걸 수 있는 사람 수.
 *
 * 서버 `staffroomSubmissions.ts` 의 `SUBMISSION_TARGET_MAX` 와 **같은 값이어야
 * 한다.** 어긋나면 화면에서는 걸리는데 저장하면 뒷사람이 조용히 빠진다.
 * `staffroomLimitsDrift.meta.test.ts` 가 두 값을 견준다.
 */
export const STAFFROOM_SUBMISSION_TARGET_MAX = 100;

/**
 * 마감까지 남은 날로 나눈 상태 — 화면이 색을 고를 때 쓴다.
 *
 * 넷으로 나눈 이유: "지났다"와 "오늘까지"는 성격이 다르고(하나는 사고, 하나는
 * 재촉), "내일까지"는 오늘 손대야 하는 것이다. 그보다 멀면 다 같다.
 */
export type StaffRoomSubmissionDueState = 'none' | 'over' | 'today' | 'tomorrow' | 'later';
