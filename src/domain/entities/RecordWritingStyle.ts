/**
 * 생기부 **작성 방식** — 선생님이 "이 기록을 어떤 관점으로 쓸지" 고른 것(순수).
 *
 * ★왜 필요한가: 지금까지는 모든 학생·모든 수업·모든 영역이 같은 골격 하나(교사 평가 → 동기 →
 *   과정 → 결과, 하나의 탐구 흐름)로 나왔다. 수업이 다르고 남은 근거가 다른데 글의 뼈대가 같으면
 *   학생의 차이가 아니라 뼈대가 먼저 읽힌다(ADR-099).
 *
 * ★세 가지를 **따로** 고른다. 초점(무엇을 중심에 둘지)·시작 방식(무엇으로 글을 열지)·묶는
 *   방식(근거 여러 건을 어떻게 잇는지)은 서로 독립이다. 예전 결정(ADR-094)의 "교사 평가가 맨 앞"은
 *   사라지지 않고 **기본값**이 된다.
 *
 * ★기본값은 `legacyInquiry`(기존형)다. 고르지 않은 선생님에게는 **오늘과 글자 하나까지 같은**
 *   요청서가 나간다 — 이 파일이 생겼다고 기존 초안 품질이 달라지면 안 된다.
 *
 * ★이 파일은 도메인이다. 외부 의존성 import 금지, 순수 타입·상수만 둔다.
 */

/**
 * 기록의 초점 **7종**. `legacyInquiry` 가 기존형이자 기본값이다.
 *
 * ★처음 제안은 10종이었다. 실제 모델로 같은 근거를 여러 초점에 돌려 보니
 *   **성취·수행 / 질문·검증 / 개념 적용** 셋이 기존형과 구조가 거의 겹쳤다(오너 판단 2026-09-09).
 *   고를 것이 많으면 선생님이 고르지 못한다 — 겹치는 것은 기존형으로 합치고, 그 셋이 갖고 있던
 *   쓸모(사용한 개념·적용 한계·남은 물음)는 **기존형의 "더 넣을 수 있는 요소"** 로 살렸다.
 * ★없어진 세 값은 `RecordFocusIdLegacy` 로 남는다 — 이미 저장된 설정·「내 작성 방식」이 있기 때문이다.
 */
export type RecordFocusId =
  | 'legacyInquiry'
  | 'compareJudge'
  | 'feedbackRevise'
  | 'designCreate'
  | 'collaborate'
  | 'interestExplore'
  | 'lifeRelation';

/** 2026-09-09 에 기존형으로 합쳐진 옛 초점 값. 저장된 설정을 읽을 때만 만난다. */
export type RecordFocusIdLegacy = 'achievement' | 'conceptApply' | 'questionVerify';

/**
 * 옛 값 → 지금 값. **조용히 기본값으로 떨어뜨리지 않고 여기서 명시적으로 옮긴다** —
 * 어디로 갔는지 모르면 선생님이 저장해 둔 방식이 소리 없이 달라진 것처럼 보인다.
 */
export const RECORD_FOCUS_ALIASES: Readonly<Record<RecordFocusIdLegacy, RecordFocusId>> = {
  achievement: 'legacyInquiry',
  conceptApply: 'legacyInquiry',
  questionVerify: 'legacyInquiry',
};

/** 글을 여는 방식. `evaluation` 일 때만 첫 문장 어미('~하는 학생임.')를 요구한다. */
export type RecordOpening = 'evaluation' | 'performance' | 'question';

/** 근거 여러 건을 묶는 방식. 시간 순서만으로 인과관계를 만들지 않는다는 조건은 셋 모두에 붙는다. */
export type RecordGrouping = 'single' | 'connected' | 'byAchievement';

/**
 * 구성 요소(모듈) 식별자.
 *
 * ★요소는 문장 틀이 아니다. "무엇을 근거로 무엇을 쓸지" 정하는 단위다. 그래서 요소 하나가
 *   반드시 문단 하나가 되지도 않는다(모델이 근거에 맞춰 붙이거나 건너뛴다).
 */
export type RecordModuleId =
  // 공통
  | 'teacherJudgement'
  | 'lessonContext'
  // 기존형
  | 'legacyMotive'
  | 'legacyProcess'
  | 'legacyResult'
  // 기존형에 더 넣을 수 있는 것(합쳐진 세 초점에서 살린 것)
  | 'conceptUsed'
  | 'applyLimit'
  | 'limitNext'
  // 근거 비교·판단
  | 'issueQuestion'
  | 'compareCriteria'
  | 'evidenceUsed'
  | 'validityJudgement'
  | 'ownConclusion'
  | 'counterReview'
  // 피드백·수정
  | 'firstAttempt'
  | 'feedbackReceived'
  | 'chosenRevision'
  | 'revisedPerformance'
  // 설계·창작·문제 해결
  | 'purposeConstraint'
  | 'strategyChoice'
  | 'makingExecution'
  | 'artifactTrait'
  | 'reviewImprove'
  // 협업·기여
  | 'sharedTask'
  | 'individualAction'
  | 'interaction'
  | 'contribution'
  // 관심 탐색·선택
  | 'confirmedInterest'
  | 'exploreExperience'
  | 'learnedCondition'
  | 'choiceOrRethink'
  | 'nextExplore'
  // 생활·관계 종합(행동특성 및 종합의견)
  | 'repeatedTrait'
  | 'lifeScenes'
  | 'selfAndRelation';

/** 추가 지시 상한. 넘치면 화면이 자른다 — 요청서 전체가 명령줄 길이 제한에 실려 가기 때문. */
export const RECORD_STYLE_INSTRUCTION_MAX = 500;

/** 내 작성 방식 저장 개수 상한. */
export const RECORD_STYLE_PRESET_MAX = 30;

/**
 * 이 구성이 나가려면 서버 규정(1층)이 최소 몇 판본이어야 하는가.
 *
 * ★판본 2 규정은 "첫 문장은 교사 평가", "이 순서를 바꾸지 마십시오"를 못 박는다. 그 규정과
 *   다른 구성을 요청서에 실으면 **서로 어긋난 두 지시**를 보내는 셈이고, 모델은 대개 1층을 따른다.
 *   그래서 판본이 모자라면 새 구성을 아예 안 쓰고 기존형으로 되돌린다(그리고 그렇게 말한다).
 */
export const RECORD_STYLE_MIN_PROMPT_VERSION = 3;

/**
 * 카탈로그 판본. 요소 목록·기본 구성이 바뀌면 올린다.
 * - 1: 초판(초점 10종).
 * - 2: 초점 7종으로 줄이고(겹치는 3종을 기존형에 합침) 평가·행특 지시를 보강(2026-09-09).
 * 판(`RecordAiDraft.style`)에 남아 "무엇으로 쓴 초안인가"를 나중에 되짚는 데 쓴다.
 */
export const RECORD_STYLE_CATALOG_VERSION = 2;

/** 선생님이 고른 작성 방식. 전부 저장 가능한 값이고 학생 자료는 하나도 들어가지 않는다. */
export interface RecordWritingStyle {
  readonly focus: RecordFocusId;
  readonly opening: RecordOpening;
  readonly grouping: RecordGrouping;
  /** 기본 구성에서 뺀 요소. 없으면 전부 쓴다(근거가 없으면 모델이 건너뛴다). */
  readonly disabledModules?: readonly RecordModuleId[];
  /** 그 초점이 허락한 "더 넣을 수 있는 요소" 중 더한 것. */
  readonly extraModules?: readonly RecordModuleId[];
  /** 선생님이 자유롭게 적는 지시. 공통 규정·기재 금지·마스킹은 이 칸으로 끌 수 없다. */
  readonly instruction?: string;
}

/** 기본값 = 기존형. 이 값이면 요청서가 오늘과 완전히 같다. */
export const DEFAULT_RECORD_WRITING_STYLE: RecordWritingStyle = {
  focus: 'legacyInquiry',
  opening: 'evaluation',
  grouping: 'connected',
};

/** 「내 작성 방식」 — 이름 붙여 저장한 구성. 설정에 보관하며 학생 원문은 담지 않는다. */
export interface RecordStylePreset {
  readonly id: string;
  readonly name: string;
  readonly style: RecordWritingStyle;
  /** 만든 시점의 카탈로그 판본. */
  readonly catalogVersion: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/**
 * 판에 남기는 재현 정보. **추가 지시 본문은 넣지 않는다** — 판 파일은 Drive 로 동기화되고,
 * 지시문에는 선생님이 학생 이름을 적었을 수 있다(보낼 때만 가려진다).
 */
export interface RecordDraftStyleStamp {
  readonly focus: RecordFocusId;
  readonly opening: RecordOpening;
  readonly grouping: RecordGrouping;
  readonly moduleIds: readonly RecordModuleId[];
  readonly catalogVersion: number;
  readonly hadInstruction: boolean;
  /** 내 작성 방식으로 만들었으면 그 이름. 그 방식을 나중에 지워도 이 값은 남는다. */
  readonly presetName?: string;
}

/** 두 방식이 실제로 같은가(요소 순서까지 본다). 화면이 "저장된 방식과 같음"을 표시할 때 쓴다. */
export function sameWritingStyle(a: RecordWritingStyle, b: RecordWritingStyle): boolean {
  const sameList = (
    x: readonly RecordModuleId[] | undefined,
    y: readonly RecordModuleId[] | undefined,
  ): boolean => {
    const xs = x ?? [];
    const ys = y ?? [];
    return xs.length === ys.length && xs.every((v, i) => v === ys[i]);
  };
  return (
    a.focus === b.focus &&
    a.opening === b.opening &&
    a.grouping === b.grouping &&
    sameList(a.disabledModules, b.disabledModules) &&
    sameList(a.extraModules, b.extraModules) &&
    (a.instruction ?? '').trim() === (b.instruction ?? '').trim()
  );
}
