/**
 * 작성 방식 카탈로그 — 초점 10종과 그 구성 요소(순수).
 *
 * ★출처: `docs/03-analysis/record-draft-template-library-v2-research-20260909.md` §4~§5.
 *   각 요소의 `purpose`·`needs`·`forbid` 는 그 문서의 "기본 구성 / 필요 근거 / AI 지시 / 생략" 을 옮긴 것이다.
 *   대학 가이드북·연수자료를 읽고 만든 **쌤핀의 제안**이지 공식 지정 양식이 아니다.
 *
 * ★형광펜 어휘는 늘리지 않는다. 요소가 40여 개여도 색은 `평가·동기·과정·결과` 넷뿐이라
 *   옛 초안의 `roleMarks`·파서·범례가 그대로 산다. 바뀌는 것은 **순서**뿐이다(ADR-099).
 *
 * ★`teacherJudgement`(교사 판단)는 어느 초점의 본문 목록에도 없다. 자리는 **시작 방식**이 정한다
 *   (앞이면 '~하는 학생임.' 어미까지, 아니면 맨 뒤). 그래서 평가가 두 번 나오지 않는다(ADR-094 §4 유지).
 *
 * ★이 파일은 도메인이다. 외부 의존성 import 금지.
 */
import {
  RECORD_FOCUS_ALIASES,
  type RecordFocusId,
  type RecordFocusIdLegacy,
  type RecordGrouping,
  type RecordModuleId,
  type RecordOpening,
} from '../entities/RecordWritingStyle';
import type { NarrativeRole } from './narrativeParagraphs';

/** 구성 요소 하나. 문장 틀이 아니라 "무엇을 근거로 무엇을 쓸지"의 단위다. */
export interface RecordModule {
  readonly id: RecordModuleId;
  /** 화면·지시문에 쓰는 이름. */
  readonly label: string;
  /** 형광펜 4색 중 하나. */
  readonly role: NarrativeRole;
  /** 무엇을 쓰는 자리인가 — 지시문 본문. */
  readonly purpose: string;
  /** 이 자리를 쓰려면 어떤 근거가 있어야 하는가. */
  readonly needs: string;
  /** 이 자리에서 하면 안 되는 추론. */
  readonly forbid?: string;
  /** 근거가 없으면 건너뛰어도 되는 요소인가(기본 구성에 들어 있어도 선택일 수 있다). */
  readonly optional?: boolean;
}

/** 초점 하나. */
export interface RecordFocus {
  readonly id: RecordFocusId;
  readonly label: string;
  /** 언제 고르는가 — 화면 설명문. */
  readonly whenToUse: string;
  /** 교사 판단을 뺀 본문 요소, 기본 순서. */
  readonly body: readonly RecordModuleId[];
  /** 더 넣을 수 있는 요소(기본에는 없음). */
  readonly extras: readonly RecordModuleId[];
  /** 이 초점을 쓰려면 근거가 최소 몇 건이어야 하는가(경고용, 막지는 않는다). */
  readonly minEvidence: number;
  /**
   * 이 초점이 어울리는 영역. 비면 어디든(기본형만). `RecordArea` 값을 문자열로 둔다(도메인 순환 import 회피).
   * ★2026-09-09: 고르개가 "이 영역에 맞음"을 이 값으로 표시하므로 기본형 말고는 전부 적는다.
   */
  readonly preferredAreas?: readonly string[];
}

/** 요소 사전. 키가 곧 id 다. */
export const RECORD_MODULES: Readonly<Record<RecordModuleId, RecordModule>> = {
  // ── 공통 ──────────────────────────────────────────────────────────────────
  teacherJudgement: {
    id: 'teacherJudgement',
    label: '교사 판단',
    role: 'evaluation',
    purpose:
      '이 학생을 어떤 사람으로 보았는지 한 문장으로 씁니다. 한 일을 묘사만 하지 말고, 그 행동이 ' +
      '드러내는 강점이나 역량을 낱말로 함께 적습니다(예: 근거를 다시 재는 태도 → "근거 검증에 엄격한"). ' +
      '나머지 서술이 그 판단의 근거입니다.',
    needs: '뒤따르는 수행 전체',
    forbid:
      '근거 없는 칭찬을 쓰지 않습니다. 역량은 반드시 분야와 함께 씁니다("탐구심이 뛰어남"만으로는 안 됩니다). ' +
      '무엇을 했는지만 길게 풀어 놓고 끝내면 평가 문장이 아닙니다.',
  },
  lessonContext: {
    id: 'lessonContext',
    label: '수업 맥락',
    role: 'process',
    purpose:
      '무엇을 배우는 수업이었고 어떤 과제·방법으로 확인했는지를 한 문장 안에서 짧게 짚습니다.',
    needs: '수업·과제·평가 방법에 대한 설명',
    forbid:
      '수업 목표나 과제 안내를 학생이 해낸 일로 바꾸지 않습니다. 이 자리에는 학생의 성취를 쓰지 않습니다.',
    optional: true,
  },

  // ── 기존형 ────────────────────────────────────────────────────────────────
  legacyMotive: {
    id: 'legacyMotive',
    label: '동기·질문',
    role: 'motive',
    purpose:
      '탐구가 어디에서 출발했는지: 수업 장면에서 생긴 호기심, 학생이 던진 질문, 맡은 문제를 씁니다.',
    needs: '근거에 남은 학생의 질문·되묻기·관심 표현, 또는 학생이 맡은 과제',
    forbid:
      '교사가 제시한 질문을 학생이 스스로 만든 질문으로 바꾸지 않습니다. 동기가 근거에 없으면 지어내지 말고 이 자리를 건너뜁니다.',
  },
  legacyProcess: {
    id: 'legacyProcess',
    label: '탐구 과정',
    role: 'process',
    purpose:
      '무엇에 막혔고 어떻게 넘었는지, 어떤 자료·방법·개념을 실제로 어떻게 썼는지 과정을 씁니다.',
    needs: '학생이 실제로 한 탐색·시도·수정·적용',
    forbid:
      '개념 이름이나 전문용어의 개수를 늘려 쓰지 않습니다. 개념은 이름보다 쓰인 방법이 드러나야 합니다. 조사·실험·증명을 섞어 쓰지 않고, 제안만 한 것과 실행한 것을 구별합니다.',
  },
  legacyResult: {
    id: 'legacyResult',
    label: '결과·적용',
    role: 'result',
    purpose:
      '도달한 설명·산출물·적용한 곳과, 그 수행에서 무엇을 어느 정도까지 할 수 있었는지를 씁니다. 남은 물음이 있으면 그것도 씁니다.',
    needs: '결과물 또는 학생이 내린 결론',
    forbid:
      '결론의 강도를 실제 자료 수준보다 세게 쓰지 않습니다. 성취기준 문구를 학생의 성취 사실로 그대로 옮기지 않고, 참여했다는 사실만으로 이해나 숙달을 단정하지 않습니다.',
  },

  // ── 기존형에 더 넣을 수 있는 요소(2026-09-09 합쳐진 세 초점에서 살린 것) ────
  conceptUsed: {
    id: 'conceptUsed',
    label: '사용한 개념',
    role: 'process',
    purpose: '어떤 개념·원리를 어디에 적용했는지 따로 드러냅니다.',
    needs: '근거에 등장하는 개념과 학생이 그 개념으로 한 일',
    forbid:
      '개념 이름이나 전문용어의 개수를 늘려 쓰지 않습니다. 서로 다른 교과가 등장했다는 이유만으로 융합 역량을 선언하지 않습니다.',
    optional: true,
  },
  applyLimit: {
    id: 'applyLimit',
    label: '적용 범위·한계',
    role: 'result',
    purpose: '어디까지 적용되고 어디부터는 안 되는지 학생이 짚은 경계를 씁니다.',
    needs: '학생이 실제로 말한 한계나 조건',
    optional: true,
  },
  limitNext: {
    id: 'limitNext',
    label: '한계·추가 검토',
    role: 'result',
    purpose: '아직 못 밝힌 지점이 있으면 그대로 씁니다.',
    needs: '학생이 남긴 미해결 지점',
    forbid: '앞으로 하겠다는 계획을 이미 한 일처럼 쓰지 않습니다.',
    optional: true,
  },

  // ── 근거 비교·판단 ────────────────────────────────────────────────────────
  issueQuestion: {
    id: 'issueQuestion',
    label: '쟁점·해석 문제',
    role: 'motive',
    purpose: '무엇을 두고 견주거나 판단해야 했는지를 씁니다.',
    needs: '비교 대상 또는 검토한 주장',
  },
  compareCriteria: {
    id: 'compareCriteria',
    label: '비교 기준',
    role: 'process',
    purpose: '무엇을 기준으로 견주었는지 씁니다.',
    needs: '학생이 세운 기준',
    forbid: '토론에 참여했다는 사실을 비판적 사고로 자동 해석하지 않습니다.',
  },
  evidenceUsed: {
    id: 'evidenceUsed',
    label: '사용한 근거',
    role: 'process',
    purpose: '자료나 작품의 어느 대목을 근거로 삼았는지 구체적으로 씁니다.',
    needs: '학생이 실제로 인용·지목한 부분',
    forbid: '자료가 하나뿐이면 여러 자료를 견준 것처럼 쓰지 않습니다.',
  },
  validityJudgement: {
    id: 'validityJudgement',
    label: '타당성 판단',
    role: 'result',
    purpose: '관점의 차이나 주장의 타당성을 어떻게 평가했는지 씁니다.',
    needs: '학생의 판단',
    forbid: '학생의 생각과 교사의 판단을 섞지 않습니다.',
  },
  ownConclusion: {
    id: 'ownConclusion',
    label: '자신의 결론',
    role: 'result',
    purpose: '학생이 최종적으로 어떤 자리에 섰는지 씁니다.',
    needs: '학생이 밝힌 결론',
  },
  counterReview: {
    id: 'counterReview',
    label: '반론 검토·관점 변화',
    role: 'process',
    purpose: '반대 의견을 살피거나 생각이 바뀐 과정이 있으면 씁니다.',
    needs: '실제로 확인되는 반론 검토나 관점 변화',
    optional: true,
  },

  // ── 피드백·수정 ───────────────────────────────────────────────────────────
  firstAttempt: {
    id: 'firstAttempt',
    label: '첫 수행의 특징',
    role: 'process',
    purpose: '처음 낸 글·발표·풀이·작품이 어떤 모습이었는지 씁니다.',
    needs: '수정 전 수행',
    forbid: '처음 상태를 결핍으로 꾸미지 않습니다.',
  },
  feedbackReceived: {
    id: 'feedbackReceived',
    label: '받은 의견·자기 점검',
    role: 'process',
    purpose: '교사나 동료의 어떤 의견을 받았는지, 스스로 무엇을 점검했는지 씁니다.',
    needs: '피드백 기록 또는 학생의 자기 점검 기록',
  },
  chosenRevision: {
    id: 'chosenRevision',
    label: '학생이 고른 수정',
    role: 'process',
    purpose: '받은 의견 가운데 무엇을 받아들여 어떻게 고쳤는지 씁니다.',
    needs: '학생의 수정 행동',
    forbid: '교사가 고쳐 준 것을 학생이 스스로 해결한 것으로 바꾸지 않습니다.',
  },
  revisedPerformance: {
    id: 'revisedPerformance',
    label: '달라진 수행',
    role: 'result',
    purpose: '고친 뒤의 글·발표·작품이 무엇이 어떻게 달라졌는지 씁니다.',
    needs: '수정 후 수행',
    forbid:
      '"성장함"으로 맺지 말고 무엇이 어떻게 달라졌는지 씁니다. 전후 근거가 없으면 이 자리를 건너뜁니다.',
  },

  // ── 설계·창작·문제 해결 ───────────────────────────────────────────────────
  purposeConstraint: {
    id: 'purposeConstraint',
    label: '목적·조건',
    role: 'motive',
    purpose: '무엇을 만들려 했고 어떤 조건이 있었는지 씁니다.',
    needs: '과제의 목적과 제약',
  },
  strategyChoice: {
    id: 'strategyChoice',
    label: '선택한 전략·표현',
    role: 'process',
    purpose: '학생이 고른 방식·표현·구조를 씁니다. 다른 학생과 갈리는 지점이 여기입니다.',
    needs: '학생 고유의 선택',
  },
  makingExecution: {
    id: 'makingExecution',
    label: '제작·실행',
    role: 'process',
    purpose: '실제로 만들고 실행한 과정을 씁니다.',
    needs: '제작·실행 기록',
    forbid: '계획·제작·실행·효과 검증을 구별합니다. 제안서만 있으면 실행 성과를 쓰지 않습니다.',
  },
  artifactTrait: {
    id: 'artifactTrait',
    label: '산출물의 특징',
    role: 'result',
    purpose: '완성한 것이 무엇이고 어떤 점이 그 학생답게 다른지 씁니다.',
    needs: '실제 산출물',
    forbid: '기능·수혜 인원·만족도 같은 수치를 만들어 넣지 않습니다.',
  },
  reviewImprove: {
    id: 'reviewImprove',
    label: '검토·개선',
    role: 'process',
    purpose: '만든 뒤 다시 보고 고친 것이 있으면 씁니다.',
    needs: '실제 검토·개선 기록',
    optional: true,
  },

  // ── 협업·기여 ─────────────────────────────────────────────────────────────
  sharedTask: {
    id: 'sharedTask',
    label: '공동 과제',
    role: 'motive',
    purpose: '모둠이 무엇을 맡았는지 한 문장으로 짚습니다.',
    needs: '공동 과제의 내용',
    forbid: '팀의 성과를 이 학생의 성과로 바꾸지 않습니다.',
  },
  individualAction: {
    id: 'individualAction',
    label: '개인의 행동',
    role: 'process',
    purpose: '이 학생이 실제로 한 일을 씁니다.',
    needs: '학생 개인에게 귀속되는 행동',
    forbid:
      '직책·역할 이름만으로는 부족합니다. 조용한 지원과 꾸준한 역할 수행도 근거가 있으면 씁니다.',
  },
  interaction: {
    id: 'interaction',
    label: '의견 교환·조정·지원',
    role: 'process',
    purpose: '누가 누구에게 어떤 도움을 주었고 어떻게 의견을 맞췄는지 씁니다.',
    needs: '상호작용 장면',
    forbid: '갈등이 없었다면 갈등 해결 이야기를 넣지 않습니다.',
  },
  contribution: {
    id: 'contribution',
    label: '공동 작업에 대한 기여',
    role: 'result',
    purpose: '그 행동이 공동 작업에 어떻게 보탬이 되었는지 씁니다.',
    needs: '기여가 확인되는 근거',
    forbid: '결과에 미친 영향이 확인되지 않으면 행동까지만 쓰고 멈춥니다.',
  },

  // ── 관심 탐색·선택 ────────────────────────────────────────────────────────
  confirmedInterest: {
    id: 'confirmedInterest',
    label: '확인된 관심',
    role: 'motive',
    purpose: '어떤 분야나 물음에 관심을 보였는지 씁니다.',
    needs: '학교 교육활동에서 확인된 관심',
    forbid: '관심 동기가 근거에 없으면 활동부터 씁니다.',
  },
  exploreExperience: {
    id: 'exploreExperience',
    label: '탐색 경험',
    role: 'process',
    purpose: '무엇을 찾아보고 누구를 만나고 무엇을 해 보았는지 씁니다.',
    needs: '실제 탐색 활동',
    forbid: '상담이나 자기평가에 적힌 학생의 말을 교사가 직접 본 사실처럼 바꾸지 않습니다.',
  },
  learnedCondition: {
    id: 'learnedCondition',
    label: '알게 된 조건·특성',
    role: 'result',
    purpose: '탐색을 통해 그 분야의 무엇을 알게 되었는지 씁니다.',
    needs: '학생이 말한 이해',
  },
  choiceOrRethink: {
    id: 'choiceOrRethink',
    label: '선택 또는 재고',
    role: 'result',
    purpose: '그래서 어떤 판단을 했는지 씁니다. 관심을 바꾼 것도 그대로 씁니다.',
    needs: '학생의 실제 판단',
    forbid:
      '진로역량을 희망 직업의 반복으로 쓰지 않습니다. 특정 직업명을 모든 결론에 붙이지 않습니다.',
  },
  nextExplore: {
    id: 'nextExplore',
    label: '다음 탐색',
    role: 'result',
    purpose: '이어서 무엇을 더 알아보려 하는지 근거가 있으면 씁니다.',
    needs: '학생이 밝힌 다음 계획',
    optional: true,
  },

  // ── 생활·관계 종합(행동특성 및 종합의견) ──────────────────────────────────
  repeatedTrait: {
    id: 'repeatedTrait',
    label: '반복 관찰된 특성',
    role: 'process',
    purpose: '한 해 동안 되풀이해 보인 모습을 씁니다.',
    needs: '일정 기간에 걸친 반복 관찰',
    forbid: '단일 사건으로 성격 전체를 단정하지 않습니다.',
  },
  lifeScenes: {
    id: 'lifeScenes',
    label: '대표 생활 장면',
    role: 'process',
    purpose:
      '그렇게 본 근거가 되는 구체적 장면을 씁니다. 주어진 장면 근거는 빠짐없이 살펴 쓰고, 서로 다른 축을 보여 주는 장면이면 각각 남깁니다.',
    needs: '실제 생활 장면 기록',
    forbid:
      '장면 개수를 채우려고 없는 장면을 만들지 않습니다. 반대로 근거에 있는 장면을 이유 없이 빠뜨리지도 않습니다. 한 장면을 여러 문단으로 나누어 늘리지 않습니다.',
  },
  selfAndRelation: {
    id: 'selfAndRelation',
    label: '자기관리·관계·책임',
    role: 'process',
    purpose: '근거가 있는 축만 골라 씁니다. 셋을 다 채울 필요는 없습니다.',
    needs: '해당 축의 관찰 기록',
    forbid: '근거 없는 조건부 제언("~한다면 더욱 성장할 것으로 기대됨")을 붙이지 않습니다.',
  },
};

/** 초점 사전. 화면의 드롭다운 순서가 이 순서다(기존형이 맨 위). */
/**
 * 초점 사전 **7종**. 화면 드롭다운 순서가 이 순서다(기존형이 맨 위).
 *
 * ★10종에서 줄였다(2026-09-09). 실제 모델로 같은 근거를 돌려 보니 「성취·수행」·「질문·검증」·
 *   「개념 적용」이 기존형과 거의 같은 글을 냈다. 겹치는 것을 남겨 두면 선생님은 고르는 데
 *   시간을 쓰고도 같은 결과를 받는다. 그 셋의 쓸모는 기존형의 `extras` 로 살렸다.
 */
export const RECORD_FOCUSES: readonly RecordFocus[] = [
  {
    id: 'legacyInquiry',
    label: '질문에서 출발한 탐구 흐름 (기본)',
    whenToUse:
      '학생의 질문이나 문제에서 시작해 탐구가 이어진 기록입니다. 탐구가 뚜렷하지 않은 일상 수업의 수행과 성취도 이 방식으로 씁니다. 지금까지 쓰던 기본 방식입니다.',
    body: ['legacyMotive', 'legacyProcess', 'legacyResult'],
    extras: ['lessonContext', 'conceptUsed', 'applyLimit', 'limitNext'],
    minEvidence: 1,
  },
  {
    id: 'compareJudge',
    label: '자료를 견주어 판단한 과정',
    whenToUse: '독서·문학·토론·자료 분석·역사 해석·매체 비평.',
    body: [
      'issueQuestion',
      'compareCriteria',
      'evidenceUsed',
      'validityJudgement',
      'ownConclusion',
    ],
    extras: ['counterReview', 'lessonContext'],
    minEvidence: 2,
    preferredAreas: ['subject', 'individualSubject', 'subjectDev', 'club'],
  },
  {
    id: 'feedbackRevise',
    label: '피드백을 받아 고쳐 쓴 과정',
    whenToUse: '글쓰기·발표·실기·풀이·제작에서 고치기 전후가 남아 있을 때.',
    body: ['firstAttempt', 'feedbackReceived', 'chosenRevision', 'revisedPerformance'],
    extras: ['lessonContext'],
    minEvidence: 2,
    preferredAreas: ['subject', 'individualSubject', 'subjectDev', 'club'],
  },
  {
    id: 'designCreate',
    label: '직접 설계하고 만든 과정',
    whenToUse: '작품·제품·프로그램·정책 대안·캠페인을 설계하고 만든 활동.',
    body: ['purposeConstraint', 'strategyChoice', 'makingExecution', 'artifactTrait'],
    extras: ['reviewImprove', 'lessonContext'],
    minEvidence: 1,
    preferredAreas: ['subject', 'individualSubject', 'subjectDev', 'club', 'autonomy'],
  },
  {
    id: 'collaborate',
    label: '함께한 일에서 맡은 몫',
    whenToUse: '모둠 수업, 동아리, 공동 제작, 자율·자치활동.',
    body: ['sharedTask', 'individualAction', 'interaction', 'contribution'],
    extras: ['lessonContext'],
    minEvidence: 1,
    preferredAreas: ['autonomy', 'club', 'subject', 'individualSubject', 'subjectDev'],
  },
  {
    id: 'interestExplore',
    label: '관심 분야를 넓혀 간 탐색',
    whenToUse: '진로활동, 그리고 관심 분야를 실제로 견주어 본 수업.',
    body: ['confirmedInterest', 'exploreExperience', 'learnedCondition', 'choiceOrRethink'],
    extras: ['nextExplore', 'lessonContext'],
    minEvidence: 1,
    preferredAreas: ['career', 'autonomy', 'club', 'subject', 'individualSubject', 'subjectDev'],
  },
  {
    id: 'lifeRelation',
    label: '한 해 생활과 관계 종합 (행동특성)',
    whenToUse: '담임이 한 해 동안 본 학생을 종합해 쓰는 자리.',
    body: ['repeatedTrait', 'lifeScenes', 'selfAndRelation'],
    extras: ['contribution', 'revisedPerformance'],
    minEvidence: 1,
    preferredAreas: ['behavior'],
  },
];

const FOCUS_BY_ID: Readonly<Record<RecordFocusId, RecordFocus>> = Object.fromEntries(
  RECORD_FOCUSES.map((f) => [f.id, f]),
) as Record<RecordFocusId, RecordFocus>;

/**
 * 초점 하나 꺼내기.
 *
 * ★없어진 옛 값(`achievement`·`conceptApply`·`questionVerify`)은 **별칭 표를 거쳐** 기존형이 된다.
 *   저장된 설정·「내 작성 방식」에 그 값이 남아 있기 때문이다.
 * ★그 밖의 모르는 값도 기존형으로 본다 — 모르는 초점으로 조용히 다른 글을 만들지 않는다.
 */
export function focusById(id: string): RecordFocus {
  const mapped = RECORD_FOCUS_ALIASES[id as RecordFocusIdLegacy] ?? (id as RecordFocusId);
  return FOCUS_BY_ID[mapped] ?? FOCUS_BY_ID.legacyInquiry;
}

/** 모든 요소 id — 카탈로그에 없는 옛 요소를 걸러 낼 때 쓴다. */
const MODULE_IDS: ReadonlySet<string> = new Set(Object.keys(RECORD_MODULES));

export function isKnownModuleId(id: string): id is RecordModuleId {
  return MODULE_IDS.has(id);
}

/** 시작 방식 라벨·설명. */
export const RECORD_OPENING_LABELS: Readonly<Record<RecordOpening, string>> = {
  evaluation: '교사 판단 먼저',
  performance: '수행·장면 먼저',
  question: '질문·문제 먼저',
};

export const RECORD_OPENING_HINTS: Readonly<Record<RecordOpening, string>> = {
  evaluation: "첫 문장이 교사의 판단이고 어미는 '~하는 학생임.' 입니다. 지금까지의 방식입니다.",
  performance: '학생이 한 일부터 씁니다. 교사 판단은 맨 뒤로 갑니다.',
  question: '학생의 질문이나 문제부터 씁니다. 질문이 근거에 남아 있을 때만 뜻이 있습니다.',
};

/** 묶는 방식 라벨. */
export const RECORD_GROUPING_LABELS: Readonly<Record<RecordGrouping, string>> = {
  single: '대표 장면 하나',
  connected: '실제로 이어진 과정',
  byAchievement: '독립 수행을 성취별로',
};

/** 묶는 방식이 요청서에 나가는 문장. 셋 모두 "시간 순서 = 인과관계" 를 금지한다. */
export const RECORD_GROUPING_INSTRUCTIONS: Readonly<Record<RecordGrouping, string>> = {
  single:
    '근거를 묶는 방식: 가장 잘 드러난 장면 하나를 골라 깊게 씁니다. 나머지는 넣지 않거나 한 마디로만 스칩니다.',
  connected:
    '근거를 묶는 방식: 실제로 이어진 하나의 과정으로 씁니다. 다만 시간 순서만으로 인과관계를 만들지 않습니다. 근거에 연결이 없으면 억지로 잇지 말고 나눠 씁니다.',
  byAchievement:
    '근거를 묶는 방식: 서로 독립된 수행이므로 하나의 이야기로 잇지 않습니다. 각 수행에서 확인된 성취를 중심으로 나누어 씁니다.',
};

/** [바꾸기] 목록의 한 줄 — 지금 영역에 어울리는 방식이 먼저 온다. */
export interface RecordFocusChoice {
  readonly focus: RecordFocus;
  /** 이 영역에 특별히 어울린다고 카탈로그가 말하는가. 표시일 뿐 막지 않는다. */
  readonly fitsArea: boolean;
}

/**
 * 영역에 맞는 방식을 앞에 두고 나머지는 카탈로그 순서 그대로. `preferredAreas` 가 비어 있으면
 * 어디든 어울린다고 보되, 특정 영역용으로 표시된 것보다 앞서지는 않는다.
 * ★기본형(`legacyInquiry`)만 `preferredAreas` 가 없어 언제나 "맞음" 이다 — 기본이니까. 나머지는 전부 적는다.
 */
export function focusChoicesForArea(area: string): readonly RecordFocusChoice[] {
  const tagged = RECORD_FOCUSES.map((focus) => ({
    focus,
    fitsArea: focus.preferredAreas === undefined || focus.preferredAreas.includes(area),
  }));
  return [...tagged.filter((c) => c.fitsArea), ...tagged.filter((c) => !c.fitsArea)];
}
