/**
 * 근거 정리 보드 — 한 학생의 근거를 **열(미분류 · 주제들 · + 새 주제)** 로 펼쳐 놓고 고른 카드를 열로 보낸다
 * (ADR-085 §6, 설계서 §6-1~6-3).
 *
 * 왜 보드인가: 목록 화면은 "주제로 묶는 길"이 셋(끌어놓기·체크 후 묶기·이것도 이 주제?)이라 헷갈렸고, 카드
 * 하나에 조작이 10개쯤 붙어 있었다. 이제 **카드 클릭 = 선택, 하단 바 = 보내기**가 정석(키보드 경로)이고,
 * **끌어다 놓기**는 마우스 지름길이다(ADR-085 보강 2 R3 — 3차의 "끌어놓기 제거"를 오너가 뒤집었다). 둘 다 **같은 함수**
 * (`sendTo`·`sendToUnclassified`·새 주제 팽오버)를 부른다 — 저장 경로는 하나다.
 * "이것도 이 주제?"(문자열 겹침)와 AI 분류 제안은 **보조**다 — 둘 다 같은 저장 관문을 지난다.
 *
 * 지키는 선:
 *  - 학생·영역은 부모(`RecordDraftView`)가 정한다 — `selectedStudentRef`·`initialArea` 를 props 로 받고,
 *    여기서 `students[0]` 로 시작하지 않는다.
 *  - ★학생이 바뀌면 선택·폼·서랍·AI 제안을 전부 비운다(ADR-072 회고 — 앞 학생의 선택이 다음 학생에게 붙던 사고).
 *  - 저장 관문은 스토어의 `moveToThread`·`moveToNewThread`·`unclassify` — 남의 학생 근거는 거기서 한 번 더 걸린다.
 *    걸린 건수(`skippedIds`)는 조용히 넘기지 않고 화면에 말한다.
 *  - ★AI 분류 제안은 **적용 전에 아무것도 저장하지 않는다.** 제안은 이 컴포넌트 메모리에만 있고, 고스트(점선)
 *    카드로만 보인다. [적용]이 곧 위 저장 관문 호출이다.
 *  - 영역 필터는 카드를 숨길 뿐 열은 그대로다(주제는 영역을 모른다). 영역이 하나뿐인 컨텍스트에서는 필터 줄·칩을
 *    그리지 않는다(값은 그 영역으로 고정).
 *  - 상태 문구는 화면 하단 가운데 토스트다(도구줄이 밀리지 않게). 카드 [삭제]는 같은 토스트의 [되돌리기]로 5초 안에
 *    복구한다(메모리에만 들고 있다가 `restoreRemoved` 로 **있던 모습 그대로** 다시 넣는다).
 *  - 원본에서 온 근거는 지금 원본과 다르면 카드에 [비교하기]가 뜬다. 실제 반영은 비교창의 2단계 확인을 지나고,
 *    쓰기 직전 재검증까지 통과해야 한다(계획 §5.3 · ADR-086 결정 5).
 *  - 카드는 `EvidenceCard`, 열은 `EvidenceColumn` 이 그린다. 둘 다 스토어를 모른다.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { FocusTrap } from 'focus-trap-react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  RECORD_AREA_LABELS,
  areasForContext,
  type RecordArea,
  type SchoolLevel,
} from '@domain/entities/RecordDraft';
import {
  EVIDENCE_SOURCE_LABELS,
  evidenceInArea,
  type RecordEvidence,
} from '@domain/entities/RecordEvidence';
import type { InquiryThread } from '@domain/entities/InquiryThread';
import { NARRATIVE_SCENE_MAX, sortThreadsForDisplay } from '@domain/entities/InquiryThread';
import type { OwnAiErrorKind } from '@domain/entities/OwnAiProvider';
import type { RecordMapScaffoldSnapshot } from '@domain/entities/RecordMapProposal';
import {
  buildThreadTimeline,
  emptyLinkHints,
  isClassified,
  suggestThreadsForEvidence,
} from '@domain/rules/threadSuggest';
import { VIRTUAL_EVALUATION_SCENE_ID, chainOf, scenesOf } from '@domain/rules/narrativeScenes';
import {
  FRAME_SLOTS,
  defaultModuleFor,
  builtInScaffolds,
  defaultScaffoldScenes,
  frameForArea,
  frameRoleLabel,
  sceneHeadParts,
  type NarrativeFrameId,
  type RecordScaffold,
} from '@domain/rules/narrativeFrames';
import { RECORD_MODULES } from '@domain/rules/recordStyleCatalog';
import type { RecordModuleId } from '@domain/entities/RecordWritingStyle';
import {
  parseNarrativeDropId,
  sceneDropId,
  unplacedDropId,
} from '@adapters/components/RecordDraft/narrativeFlowDrop';
import type { NarrativeLaneModel } from '@adapters/components/RecordDraft/narrativeLaneModel';
import { ScaffoldPicker } from '@adapters/components/RecordDraft/ScaffoldPicker';
import { scaffoldChoices } from '@domain/rules/recordScaffoldStore';
import { NarrativeSuggestGhost } from '@adapters/components/RecordDraft/NarrativeSuggestGhost';
import { buildNarrativeSuggestPack } from '@domain/services/narrativeSuggestPack';
import {
  NARRATIVE_SUGGEST_FAILURE_LABELS,
  parseNarrativeSuggestion,
  type NarrativeSceneSuggestion,
} from '@domain/rules/narrativeSuggestionParser';
import { useScaffoldMigration } from '@adapters/hooks/useScaffoldMigration';
import { UnplacedEvidencePanel } from './UnplacedEvidencePanel';
import { Notice } from '@adapters/components/common/Notice';
import { topicMatchKeywords } from '@domain/rules/topicKeywordSources';
import { rosterFromAll } from '@domain/rules/redactOutbound';
import { OWN_AI_ERROR_MESSAGES } from '@domain/rules/ownAiCliRules';
import {
  parseThreadSuggestions,
  THREAD_SUGGEST_FAILURE_LABELS,
  type ThreadSuggestFailure,
  type ThreadSuggestion,
} from '@domain/rules/threadSuggestionParser';
import { buildThreadSuggestPack } from '@domain/services/threadSuggestPack';
import { summarizeExclusions } from '@domain/services/recordDraftPack';
import {
  useRecordEvidenceStore,
  type EvidenceMoveResult,
  type RecordEvidenceAddInput,
} from '@adapters/stores/useRecordEvidenceStore';
import { useInquiryThreadStore } from '@adapters/stores/useInquiryThreadStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import {
  applyNarrativeSuggestion,
  placeEvidenceInScene,
} from '@adapters/stores/placeEvidenceInScenes';
import { useRubricStore } from '@adapters/stores/useRubricStore';
import { useGradeAnalysisStore } from '@adapters/stores/useGradeAnalysisStore';
import { useAssignmentStore } from '@adapters/stores/useAssignmentStore';
import { useAssistStore } from '@adapters/stores/useAssistStore';
import { useConnectedOwnAiProviders } from '@adapters/stores/useOwnAiStatusStore';
import { askOnce, runApi } from '@adapters/components/RecordDraft/ownAiRun';
import { InquiryThreadCreate } from '@adapters/components/RecordDraft/InquiryThreadCreate';
import { InquiryThreadPanel } from '@adapters/components/RecordDraft/InquiryThreadPanel';
import { EvidenceDrawer } from '@adapters/components/RecordDraft/EvidenceDrawer';
import { EvidenceCard } from '@adapters/components/RecordDraft/EvidenceCard';
import {
  createRecordFlowIntent,
  type RecordFlowIntent,
} from '@adapters/components/RecordDraft/recordFlowIntent';
import type { WriteDraftRequest } from '@adapters/components/RecordDraft/recordDraftTypes';
import {
  EvidenceMapView,
  type EvidenceMapGroupModel,
  type MapColumnModel,
} from '@adapters/components/RecordDraft/EvidenceMapView';
import {
  EvidenceMapSidePanel,
  type EvidenceMapSideContent,
} from '@adapters/components/RecordDraft/EvidenceMapSidePanel';
import { useEvidenceEditHistory } from '@adapters/hooks/useEvidenceEditHistory';
import { useEvidenceMapPositions } from '@adapters/hooks/useEvidenceMapPositions';
import {
  EvidenceColumn,
  UNCLASSIFIED_DROP_ID,
  threadDropId,
} from '@adapters/components/RecordDraft/EvidenceColumn';
import {
  boardBtn as btn,
  boardChip as chip,
  shortDate,
} from '@adapters/components/RecordDraft/evidenceBoardStyles';
import { RecordEvidenceImportDrawer } from '@adapters/components/RecordDraft/RecordEvidenceImportDrawer';
import { EvidenceSourceComparisonDialog } from '@adapters/components/RecordDraft/EvidenceSourceComparisonDialog';
import { useEvidenceCandidates } from '@adapters/hooks/useEvidenceCandidates';
import { useEvidenceSourceState } from '@adapters/hooks/useEvidenceSourceState';
import { isSameAsSource } from '@domain/rules/evidenceSourceComparison';
import type { EvidenceCandidate } from '@usecases/studentRecords/collectEvidenceCandidates';
import { hasProhibitedTerms } from '@domain/rules/prohibitedRecordTerms';
import { trackEventSafely } from '@adapters/analytics/trackEventSafely';
import { DND_KO_ACCESSIBILITY } from '@adapters/components/common/dndAccessibility';
import { RecordMapBatchPanel } from '@adapters/components/RecordDraft/RecordMapBatchPanel';
import { useRecordMapRunStore } from '@adapters/stores/useRecordMapRunStore';

/** 작성주체(담임/교과) — 노출 영역 집합을 결정. */
type RecordContext = 'homeroom' | 'teaching';

/** RecordDraftView 의 학생 행과 구조적으로 호환되는 최소 형태(순환 import 회피용 로컬 정의). */
export interface EvidenceStudentRow {
  readonly studentRef: string;
  readonly number: number;
  readonly name: string;
  /** 담임 학생 id. */
  readonly studentId?: string;
  /** 수업반 학생 번호 키. */
  readonly studentKey?: string;
}

export interface RecordEvidenceBoardProps {
  readonly context: RecordContext;
  readonly level: SchoolLevel;
  readonly students: readonly EvidenceStudentRow[];
  readonly classId?: string;
  readonly className?: string;
  /** 수업반 과목명 — 주제 서랍의 역량 키워드 예시 문구에 쓴다(담임이면 없음). */
  readonly classSubject?: string;
  /** 고른 학생 — 부모가 들고 있다. */
  readonly selectedStudentRef: string | null;
  onSelectStudent: (studentRef: string) => void;
  /** 어느 영역에서 왔는지 — 영역 필터 초기값. 없으면 전체. */
  readonly initialArea?: RecordArea | null;
  /**
   * 보드에서 입력·원본으로 되돌아가는 요청(계획 §4.3).
   * 상위 화면이 이동을 결정한다 - 보드가 직접 탭을 바꾸지 않는다.
   */
  readonly onRequestFlow?: (intent: RecordFlowIntent) => void | Promise<void>;
  /**
   * 저장 직후 넘어온 "이걸 찾아 줘" 요청(계획 §4.3). 대상 카드를 찾아 필터를 풀고 스크롤·포커스한다.
   * 대상이 지금 영역 필터 밖이면 **'전체'로 바꾸고 그 사실을 말한다** - 조용히 못 찾으면
   * 교사는 저장이 안 된 줄 안다.
   */
  readonly focusRequest?: RecordFlowIntent | null;
  /** 요청을 처리했다고 상위에 알린다. 같은 요청을 다시 처리하지 않게. */
  readonly onFocusRequestHandled?: () => void;
  /**
   * [이 흐름으로 초안 쓰기]·[이어진 흐름 전체로] — 초안 화면으로 넘어가 이 주제(또는 이어진 주제 전체)로
   * AI 초안을 쓰게 한다. ★예전에는 "관찰 이어 쓰기"용 이동 신호(`compose`)를 보내 수업 기록의 **입력** 탭으로
   * 갔고, 두 단추가 똑같이 동작했다(오너 제보 2026-09-11).
   */
  readonly onWriteDraft?: (request: WriteDraftRequest) => void;
  /**
   * 초안 화면에서 돌아올 때 되살릴 선택(ADR-106 후속). 부모가 학생이 같을 때만 넘긴다.
   * ★첫 렌더에만 쓴다 — 그 뒤 선택은 이 화면이 스스로 관리한다.
   */
  readonly initialSelectedIds?: readonly string[];
  /** 선택이 바뀔 때마다 부모에게 알린다 — 초안 화면으로 갔다 와도 고른 카드가 남게. */
  readonly onSelectionChange?: (ids: readonly string[]) => void;
}

/** 폼 상태 — id=null 이면 신규 등록, 값이 있으면 해당 근거 수정. */
interface EvidenceForm {
  readonly id: string | null;
  content: string;
  areas: RecordArea[];
  date: string;
}

/** 엑셀 서랍 — 「양식 받기」는 열자마자 내려받는다. */
interface ImportState {
  readonly downloadOnOpen: boolean;
}

/**
 * 거울 카드의 선택 id. 저장 카드의 uuid 와 섞이지 않게 접두어를 붙인다.
 * 거울은 저장되기 전까지 id 가 없으므로 원본의 sourceId 로 가리킨다.
 */
const MIRROR_PREFIX = 'mirror:';
const mirrorId = (sourceId: string): string => `${MIRROR_PREFIX}${sourceId}`;
const isMirrorId = (id: string): boolean => id.startsWith(MIRROR_PREFIX);

/**
 * 거울을 카드가 그릴 수 있는 모양으로. ★저장된 것이 아니다 — 화면에만 있는 값이다.
 * 기재 금지 어휘가 있으면 "AI 제외" 켜진 모습으로 보인다(저장하면 스토어가 같은 판정을 하므로 일관).
 */
function mirrorToEvidence(studentRef: string, c: EvidenceCandidate): RecordEvidence {
  return {
    id: mirrorId(c.sourceId),
    studentRef,
    areas: [],
    content: c.content,
    sourceType: c.sourceType,
    sourceId: c.sourceId,
    ...(c.date !== undefined ? { date: c.date } : {}),
    ...(c.slots !== undefined ? { slots: c.slots } : {}),
    ...(hasProhibitedTerms(c.content) ? { excludedFromAi: true } : {}),
    createdAt: 0,
    updatedAt: 0,
  };
}

/** 미분류 열 정렬 — 날짜 내림차순, 날짜 없는 것은 뒤로, 같으면 id 순(렌더마다 흔들리지 않게). */
function byDateDesc(a: RecordEvidence, b: RecordEvidence): number {
  if (a.date !== b.date) {
    if (a.date === undefined) return 1;
    if (b.date === undefined) return -1;
    return b.date.localeCompare(a.date);
  }
  return a.id.localeCompare(b.id);
}

/** 하단 토스트 — 문구와, 있으면 단추 하나([되돌리기]). */
interface ToastState {
  readonly text: string;
  readonly action?: { readonly label: string; readonly onClick: () => void };
}

/** 근거가 놓기 직전에 있던 자리 — [되돌리기]의 목적지. */

/** 새 주제 만들기 팽오버 — 어느 단추 위에 띄울지(`anchor`). `forSelection` 이면 만들자마자 고른 근거를 그 주제로 보낸다. */
interface CreatingState {
  readonly forSelection: boolean;
  readonly anchor: DOMRect | null;
  /** 끌어다 놓아 열렸으면 그때 끌린 카드들. 없으면 지금 선택. */
  readonly ids?: readonly string[];
}

/** 하단 바에 바로 보이는 주제 단추 수. 넘치면 [주제 더 보기 ▾] 로 접는다. */
const BAR_THREAD_LIMIT = 5;

/** [+ 새 주제] 칸의 놓는 곳 id. */
const NEW_THREAD_DROP_ID = 'drop:new';

/** 끌고 있는 것 — 미리보기(`DragOverlay`)용. 저장과는 무관하다(놓을 때 선택에서 다시 계산한다). */
interface DragState {
  readonly lead: RecordEvidence;
  readonly count: number;
}

/** [+ 새 주제] 칸 — 놓으면 이름 팽오버가 열린다. 위에 있는 동안만 테두리가 강조색. */
function NewThreadDropZone({
  children,
  anchorRef,
}: {
  readonly children: ReactNode;
  /** 놓았을 때 이름 팽오버를 띄울 자리. */
  readonly anchorRef: { current: HTMLElement | null };
}): ReactElement {
  const { setNodeRef, isOver } = useDroppable({ id: NEW_THREAD_DROP_ID });
  return (
    <section
      ref={(el) => {
        setNodeRef(el);
        anchorRef.current = el;
      }}
      aria-label="새 주제 열"
      data-drop-over={isOver ? '' : undefined}
      className={`flex w-72 shrink-0 flex-col gap-2 rounded-xl ${isOver ? 'ring-2 ring-sp-accent' : ''}`}
    >
      {children}
    </section>
  );
}

/**
 * AI 분류 제안 상태 — **메모리에만** 있다. 저장은 [적용]이 위 저장 관문을 부를 때뿐이다.
 * `excluded` 는 꾸러미에서 빠진 근거 요약("제외됨 N건 (사유)").
 */
type SuggestState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running' }
  | {
      readonly kind: 'ready';
      readonly suggestions: readonly ThreadSuggestion[];
      readonly excluded: string;
    }
  | {
      readonly kind: 'notice';
      readonly message: string;
      /** 파서 실패 갈래 — 있으면 화면이 갈래별로 다음 행동을 보여 준다(설계서 §4-6). */
      readonly failure?: ThreadSuggestFailure;
      /** `none` 일 때 AI 가 덧붙인 이유. */
      readonly reason?: string;
      /** 답 원문 — **별칭 상태 그대로**(실명 없음). 못 읽었을 때 [답 원문 보기]로 진단한다. */
      readonly answer?: string;
    };

function todayStr(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function RecordEvidenceBoard({
  context,
  level,
  students,
  classId,
  className,
  classSubject,
  selectedStudentRef,
  onSelectStudent,
  initialArea,
  onRequestFlow,
  focusRequest,
  onFocusRequestHandled,
  onWriteDraft,
  initialSelectedIds,
  onSelectionChange,
}: RecordEvidenceBoardProps) {
  const author = context === 'homeroom' ? 'homeroom' : 'teaching';
  const areas = useMemo(() => areasForContext(level, author), [level, author]);
  /** 영역이 하나뿐이면 고를 것이 없다 — 필터 줄·카드 칩·폼 칩을 그리지 않고 값은 그 영역으로 고정한다. */
  const singleArea = areas.length === 1 ? (areas[0] ?? null) : null;

  const student = students.find((s) => s.studentRef === selectedStudentRef) ?? null;
  const mapPositions = useEvidenceMapPositions(student?.studentRef ?? null);
  const { history, wrap, importRun } = useEvidenceEditHistory(
    `${context}:${classId ?? ''}:${selectedStudentRef ?? ''}`,
    student?.studentRef ?? null,
    mapPositions,
  );
  const records = useRecordEvidenceStore((s) => s.records);
  const loadEvidence = useRecordEvidenceStore((s) => s.load);
  const evidenceLoaded = useRecordEvidenceStore((s) => s.loaded);
  const addEvidence = wrap(
    useRecordEvidenceStore((s) => s.add),
    '근거 편집',
  );
  const addManyEvidence = wrap(
    useRecordEvidenceStore((s) => s.addMany),
    '근거 편집',
  );
  const updateEvidence = wrap(
    useRecordEvidenceStore((s) => s.update),
    '근거 편집',
  );
  const applySourceFields = wrap(
    useRecordEvidenceStore((s) => s.applySourceFields),
    '근거 편집',
  );
  const setExcludedFromAi = wrap(
    useRecordEvidenceStore((s) => s.setExcludedFromAi),
    '근거 편집',
  );
  const setExcludedFromAiMany = wrap(
    useRecordEvidenceStore((s) => s.setExcludedFromAiMany),
    '근거 편집',
  );
  const setThread = wrap(
    useRecordEvidenceStore((s) => s.setThread),
    '주제 편집',
  );
  const moveToThread = wrap(
    useRecordEvidenceStore((s) => s.moveToThread),
    '주제 편집',
  );
  const moveToNewThread = wrap(
    useRecordEvidenceStore((s) => s.moveToNewThread),
    '주제 편집',
  );
  const unclassify = wrap(
    useRecordEvidenceStore((s) => s.unclassify),
    '근거 편집',
  );

  const threads = useInquiryThreadStore((s) => s.records);
  const loadThreads = useInquiryThreadStore((s) => s.load);
  const addThread = wrap(
    useInquiryThreadStore((s) => s.add),
    '주제 편집',
  );
  // 장면 다루기(ADR-103). 소유는 근거 파일이 먼저 쓰고, 장면은 그 뒤에 쓴다.
  const addScene = wrap(
    useInquiryThreadStore((s) => s.addScene),
    '장면 편집',
  );
  const removeScene = wrap(
    useInquiryThreadStore((s) => s.removeScene),
    '장면 편집',
  );
  const moveScene = wrap(
    useInquiryThreadStore((s) => s.moveScene),
    '장면 편집',
  );
  const setSceneNote = wrap(
    useInquiryThreadStore((s) => s.setSceneNote),
    '장면 편집',
  );
  const setSceneLeadIn = wrap(
    useInquiryThreadStore((s) => s.setSceneLeadIn),
    '장면 편집',
  );
  const setSceneCategory = wrap(
    useInquiryThreadStore((s) => s.setSceneCategory),
    '장면 편집',
  );
  const setLink = wrap(
    useInquiryThreadStore((s) => s.setLink),
    '근거 편집',
  );
  const reorderThreads = wrap(
    useInquiryThreadStore((s) => s.reorderThreads),
    '주제 편집',
  );
  const applyScaffold = wrap(
    useInquiryThreadStore((s) => s.applyScaffold),
    '근거 편집',
  );

  const detachFromScenes = wrap(
    useInquiryThreadStore((s) => s.detachFromScenes),
    '장면 편집',
  );
  const setEvidenceNote = wrap(
    useRecordEvidenceStore((s) => s.setNote),
    '근거 편집',
  );
  const updateThread = wrap(
    useInquiryThreadStore((s) => s.update),
    '주제 편집',
  );
  const removeThread = wrap(
    useInquiryThreadStore((s) => s.remove),
    '주제 편집',
  );

  // 새 주제 이름 후보(수행평가 1순위 — 오너 결정 2026-09-04)와 매칭 키워드의 원천.
  const rubrics = useRubricStore((s) => s.rubrics);
  const loadRubrics = useRubricStore((s) => s.load);
  const plans = useGradeAnalysisStore((s) => s.plans);
  const loadGrades = useGradeAnalysisStore((s) => s.load);
  const assignments = useAssignmentStore((s) => s.assignments);

  // 구독 AI 연결 판정 — AI 초안 패널과 같은 기준(실험실 스위치 + 연결된 CLI + 고른 공급자).
  const ownAiEnabled = useAssistStore((s) => s.ownAiEnabled);
  const provider = useAssistStore((s) => s.provider);
  const connected = useConnectedOwnAiProviders();
  const runProvider = useMemo(() => {
    if (!ownAiEnabled || connected.length === 0) return null;
    if (provider !== 'ssampin' && connected.includes(provider)) return provider;
    return connected[0] ?? null;
  }, [ownAiEnabled, connected, provider]);

  /**
   * ★영역이 하나뿐이면 필터를 **걸지 않는다**(null). 필터 줄을 안 그리므로 값이 걸려 있으면 교사가 끌 길이 없고,
   * 그 영역이 아닌 근거(옛 데이터·다른 학교급에서 넘어온 분류)가 통째로 사라진다 — 주제 열이 0건으로 보였던 원인.
   * 새로 넣을 때 쓸 영역은 `singleArea` 가 따로 들고 있다.
   */
  const [areaFilter, setAreaFilter] = useState<RecordArea | null>(
    singleArea !== null ? null : (initialArea ?? null),
  );
  const [selectedIds, setSelectedIds] = useState<readonly string[]>(() => initialSelectedIds ?? []);
  useEffect(() => {
    onSelectionChange?.(selectedIds);
    // ★부모 콜백은 렌더마다 새로 만들어질 수 있어 의존성에 넣지 않는다 — 선택이 바뀔 때만 알리면 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds]);
  const [form, setForm] = useState<EvidenceForm | null>(null);
  /** 새 주제 만들기 팽오버(포털). */
  const [creating, setCreating] = useState<CreatingState | null>(null);
  /** 옆 서랍에 펼친 주제(시간순 줄기·키워드·다음 메모). */
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  /** 가져오기 서랍. */
  const [importing, setImporting] = useState<ImportState | null>(null);
  /** 원본 비교 대화상자를 연 근거의 id. 근거 자체는 항상 스토어의 최신값에서 다시 찾는다. */
  const [comparingId, setComparingId] = useState<string | null>(null);
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const importBtnRef = useRef<HTMLButtonElement | null>(null);
  /** 접힌(닫힌) 주제 열 가운데 펼쳐 둔 것. */
  const [expandedClosed, setExpandedClosed] = useState<readonly string[]>([]);
  const [suggest, setSuggest] = useState<SuggestState>({ kind: 'idle' });
  /** [답 원문 보기] 펼침 — 못 읽은 답을 진단할 때만. */
  const [answerOpen, setAnswerOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 하단 바의 주제 단추를 다 펼쳐 둔 상태(단추가 5개를 넘을 때). */
  const [barExpanded, setBarExpanded] = useState(false);
  /** 끌고 있는 카드(미리보기용). */
  const [dragging, setDragging] = useState<DragState | null>(null);
  // ── 근거 지도(ADR-106) ─────────────────────────────────────
  /** 오른쪽 상세가 보고 있는 카드. 선택(`selectedIds`)과 다르다 — 선택은 여럿, 상세는 하나. */
  const placingRef = useRef(false);
  const [placing, setPlacing] = useState(false);
  const [unplacedOpen, setUnplacedOpen] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  /** 오른쪽에 연 장면·장면 이음·주제·주제 이음(ADR-107·108). 카드 상세와 **교대**로 든다(보조 공간은 하나). */
  const [mapPick, setMapPick] = useState<
    | { readonly kind: 'scene'; readonly threadId: string; readonly sceneId: string }
    | { readonly kind: 'sceneLink'; readonly threadId: string; readonly sceneId: string }
    | { readonly kind: 'thread'; readonly threadId: string }
    | { readonly kind: 'threadLink'; readonly threadId: string }
    | null
  >(null);
  /** [AI로 정리 제안 ▾] 메뉴. */
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const batchPanelOpen = useRecordMapRunStore((state) => state.open);
  const openBatchPanel = useRecordMapRunStore((state) => state.openFor);
  const closeBatchPanel = useRecordMapRunStore((state) => state.close);
  const organizeBtnRef = useRef<HTMLButtonElement | null>(null);
  const [mapZoom, setMapZoom] = useState(1);

  // ── 보기 모드(ADR-103 D1) ────────────────────────────────────────
  /**
   * 지도와 보드는 **단계가 아니라 보기 모드**다. 기본은 지도(ADR-106)이고, 고른 값은 설정에 남는다.
   * ★설정을 못 읽었을 때도 지도다 — 기본값을 화면마다 다르게 두면 같은 앱이 다르게 열린다.
   * ★옛 `flow`(흐름 보기, ADR-107 에서 지도에 합쳐짐)는 지도로 읽는다 — 설정 파일을 고치지 않고도 같은 화면이 열린다.
   */
  const savedViewMode = useSettingsStore((st) => st.settings.recordEvidenceViewMode);
  const savedScaffolds = useSettingsStore((st) => st.settings.recordScaffolds);
  const savedAreaScaffolds = useSettingsStore((st) => st.settings.recordAreaScaffolds);
  const updateSettings = useSettingsStore((st) => st.update);
  const viewMode: 'map' | 'board' = savedViewMode === 'board' ? 'board' : 'map';
  const setViewMode = (next: 'map' | 'board'): void => {
    void updateSettings({ recordEvidenceViewMode: next });
  };
  /** 옛 작성 방식 → 뼈대 옮기기(한 번). 결과는 안내 줄로 말한다. */
  const scaffoldMigration = useScaffoldMigration();
  const [expandedWorkspace, setExpandedWorkspace] = useState(true);
  /** 접어 둔 줄기. */
  const [collapsedLanes, setCollapsedLanes] = useState<readonly string[]>([]);
  /** [뼈대 고르기] 펼침 — 팝오버가 아니라 도구줄 아래 인라인 칸이다(유리 모드 대응). */
  const [scaffoldOpen, setScaffoldOpen] = useState(false);
  const [scaffoldThreadId, setScaffoldThreadId] = useState<string | null>(null);
  /** 어느 줄기의 [앞 줄기 잇기]를 열었나. */
  const [linkPickerFor, setLinkPickerFor] = useState<string | null>(null);
  /** 어느 장면의 [바꾸기]를 열었나. */
  const [sceneEditFor, setSceneEditFor] = useState<{
    readonly threadId: string;
    readonly sceneId: string;
  } | null>(null);
  /**
   * AI 서사 초안 — **메모리에만** 있다. 저장은 [이 서사 적용]을 누를 때 한 번뿐이다.
   * ★`threadId` 를 함께 들고 있어야 제안이 다른 줄기에 붙지 않는다(학생을 바꿔도 따라가지 않게).
   */
  const [narrativeSuggest, setNarrativeSuggest] = useState<
    | { readonly kind: 'idle' }
    | { readonly kind: 'running'; readonly threadId: string }
    | { readonly kind: 'notice'; readonly message: string }
    | {
        readonly kind: 'ready';
        readonly threadId: string;
        readonly scenes: readonly NarrativeSceneSuggestion[];
        readonly linkNote?: string;
      }
    | { readonly kind: 'applying'; readonly threadId: string }
  >({ kind: 'idle' });
  const narrativeRequestRef = useRef(0);
  const narrativeBaselineRef = useRef('');
  const narrativeFingerprint = (threadId: string): string =>
    JSON.stringify({
      thread: useInquiryThreadStore.getState().records.find((t) => t.id === threadId),
      evidence: useRecordEvidenceStore.getState().records.filter((e) => e.threadId === threadId),
    });
  /** 어느 장면의 [+ 근거]를 열었나. */
  const [sceneAddFor, setSceneAddFor] = useState<{
    readonly threadId: string;
    readonly sceneId: string;
  } | null>(null);
  const newZoneRef = useRef<HTMLElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  /** 이미 처리한 이동 요청. 리렌더마다 다시 스크롤하지 않게. */
  const handledFocusRef = useRef<string | null>(null);
  // ★포인터가 6px 이상 움직여야 끌기다 — 그 안이면 클릭(선택). 이 제약이 없으면 고르려다 옮긴다. 키보드 센서는 붙이지 않는다.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // ★[넓게 보기]는 Esc 와 뒷막 클릭으로 돌아온다 — 공용 `Modal` 과 같은 약속. 단, 입력칸 안의 Esc(메모·이름
  //   그만두기)와 열려 있는 메뉴·대화상자의 Esc 는 그쪽 몫이라 건드리지 않는다.
  useEffect(() => {
    if (!expandedWorkspace) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (
        e.target instanceof Element &&
        e.target.closest('input, textarea, [contenteditable="true"]')
      )
        return;
      if (document.querySelector('[role="menu"], [role="dialog"], [role="alertdialog"]')) return;
      setExpandedWorkspace(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expandedWorkspace]);

  useEffect(() => {
    void loadEvidence();
    void loadThreads();
    trackEventSafely('record_evidence_open', { context });
    if (context === 'teaching') {
      void loadRubrics();
      void loadGrades();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context]);

  // 부모가 다른 영역에서 열면 필터도 그 영역으로. 단 영역이 하나뿐인 화면에서는 걸지 않는다(위 주석).
  useEffect(() => {
    setAreaFilter(singleArea !== null ? null : (initialArea ?? null));
  }, [initialArea, singleArea]);
  useEffect(() => {
    if (areaFilter !== null && (singleArea !== null || !areas.includes(areaFilter))) {
      setAreaFilter(null);
    }
  }, [areas, areaFilter, singleArea]);

  /**
   * ★학생이 바뀌면 선택·폼·서랍·확인·AI 제안을 **반드시** 비운다. 학생 단추의 onClick 에서만 비우면 동기화·명단
   * 변경으로 학생이 바뀌는 길을 놓친다 — `selectedStudentRef` 를 지켜보는 이 자리가 전수 방어선이다.
   */
  const studentResetSkipRef = useRef(true);
  useEffect(() => {
    // ★첫 렌더에는 비우지 않는다 — 초안 화면에서 돌아올 때 되살린 선택(`initialSelectedIds`)이 여기서 지워지면 안 된다.
    if (studentResetSkipRef.current) {
      studentResetSkipRef.current = false;
      return;
    }
    setSelectedIds([]);
    setForm(null);
    setCreating(null);
    setOpenThreadId(null);
    setImporting(null);
    setImportMenuOpen(false);
    setBarExpanded(false);
    setDragging(null);
    setSuggest({ kind: 'idle' });
    setAnswerOpen(false);
    setComparingId(null);
    setUnplacedOpen(false);
    setFocusedId(null);
    setMapPick(null);
    setOrganizeOpen(false);
  }, [selectedStudentRef]);
  // 화면을 떠나면 토스트 타이머도 같이 정리한다.
  useEffect(
    () => () => {
      if (toastTimer.current !== null) clearTimeout(toastTimer.current);
    },
    [],
  );
  // ★학생을 바꾸면 서사 제안을 버린다 — 남의 학생 줄기에 붙으면 사고다.
  useEffect(() => {
    narrativeRequestRef.current += 1;
    setNarrativeSuggest({ kind: 'idle' });
    return () => {
      narrativeRequestRef.current += 1;
    };
  }, [selectedStudentRef, context, classId]);

  // 영역 필터가 바뀌어도 선택은 비운다 — 안 보이는 카드가 골라진 채 딸려 가면 안 된다. (첫 렌더는 제외 — 되살린 선택 보존)
  const areaResetSkipRef = useRef(true);
  useEffect(() => {
    if (areaResetSkipRef.current) {
      areaResetSkipRef.current = false;
      return;
    }
    setSelectedIds([]);
  }, [areaFilter]);

  // 가져오기 메뉴 — 바깥 클릭·Esc 로 닫고, 닫히면 열었던 단추로 포커스를 되돌린다. ↑↓·Home·End 로 항목 사이를 움직인다.
  useEffect(() => {
    if (!importMenuOpen) return;
    const opener = importBtnRef.current;
    const items = (): HTMLElement[] =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-import-menu] [role="menuitem"]'));
    items()[0]?.focus();
    const onDown = (e: MouseEvent): void => {
      const t = e.target;
      if (t instanceof Node && importBtnRef.current?.contains(t)) return;
      if (t instanceof Element && t.closest('[data-import-menu]')) return;
      setImportMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setImportMenuOpen(false);
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
      const list = items();
      if (list.length === 0) return;
      e.preventDefault();
      const at = list.findIndex((el) => el === document.activeElement);
      const next =
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? list.length - 1
            : e.key === 'ArrowDown'
              ? (at + 1) % list.length
              : (at - 1 + list.length) % list.length;
      list[next]?.focus();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, [importMenuOpen]);

  // 새 주제 팽오버 — 바깥 클릭으로 닫는다(Esc 는 팽오버 자체가 받는다).
  useEffect(() => {
    if (creating === null) return;
    const onDown = (e: MouseEvent): void => {
      const t = e.target;
      if (t instanceof Element && t.closest('[data-create-popover]')) return;
      setCreating(null);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [creating]);

  const studentIndex = student ? students.indexOf(student) : -1;

  // ── 파생값 ─────────────────────────────────────────────────
  const studentEvidence = useMemo(
    () => (student ? records.filter((r) => r.studentRef === student.studentRef) : []),
    [records, student],
  );
  const visibleEvidence = useMemo(
    () =>
      areaFilter === null
        ? studentEvidence
        : studentEvidence.filter((r) => evidenceInArea(r, areaFilter)),
    [studentEvidence, areaFilter],
  );
  /** 실재하는 주제 id 집합 — 고아 threadId(동기화 시차)는 미분류로 보인다. */
  const threadIdSet = useMemo(() => new Set(threads.map((t) => t.id)), [threads]);
  /** 이 학생의 주제만, open 먼저 · closed 뒤, 그 안에서는 선생님이 ↑↓ 로 정한 차례. 다른 학생 주제는 여기서 잘라 손에 잡히지 않게 한다. */
  const studentThreads = useMemo(() => {
    const mine = student ? threads.filter((t) => t.studentRef === student.studentRef) : [];
    return sortThreadsForDisplay(mine);
  }, [threads, student]);
  const openThreads = useMemo(
    () => studentThreads.filter((t) => t.status === 'open'),
    [studentThreads],
  );
  /**
   * 거울 카드 후보 — 이 학생의 아직 근거로 안 넣은 원본 기록. ★보기만 해서는 아무것도 저장하지 않는다.
   * 영역이 아직 없으므로 어느 영역 필터에서도 미분류에 보인다(미분류는 받은편지함이다).
   */
  const mirrors = useEvidenceCandidates({
    student,
    context,
    ...(classId !== undefined ? { classId } : {}),
  });
  const mirrorBySourceId = useMemo(
    () => new Map(mirrors.map((c) => [c.sourceId, c] as const)),
    [mirrors],
  );
  /**
   * 저장된 근거의 **원본이 지금 어떤 상태인가**(계획 §5.3). 거울 후보와 달리 여기는
   * 이미 근거가 된 원본까지 본다 - 후보에서 빠졌다는 이유로 '원본 없음'이라고 하면 오진이다.
   */
  const sourceState = useEvidenceSourceState({
    student: student ?? null,
    context,
    ...(classId !== undefined ? { classId } : {}),
  });
  /**
   * 이 근거가 지금 원본과 다른가. **확인된 경우에만 참**이다 -
   * 확인 중·확인 실패·원본 없음은 모두 거짓이다. 모르는 것을 "다르다"고 말하지 않는다.
   */
  /**
   * 비교창이 보고 있는 근거. **id 로 매번 다시 찾는다** - 반영·동기화로 값이 바뀌면
   * 열려 있는 창도 새 값을 봐야 한다. 지워졌으면 `undefined` 라 창이 저절로 닫힌다.
   */
  const comparing = useMemo(
    () => (comparingId === null ? undefined : studentEvidence.find((r) => r.id === comparingId)),
    [comparingId, studentEvidence],
  );

  const differsFromSource = useCallback(
    (ev: RecordEvidence): boolean => {
      if (isMirrorId(ev.id)) return false;
      const got = sourceState.lookup(ev.sourceId, ev.sourceType);
      if (got.state !== 'found') return false;
      return !isSameAsSource(got.source, {
        content: ev.content,
        ...(ev.date !== undefined ? { date: ev.date } : {}),
        ...(ev.slots !== undefined ? { slots: ev.slots } : {}),
      });
    },
    [sourceState],
  );
  const mirrorCards = useMemo(
    () => (student ? mirrors.map((c) => mirrorToEvidence(student.studentRef, c)) : []),
    [mirrors, student],
  );
  /** 미분류 열 = 저장 미분류(영역 필터 따름) + 거울(필터 무관), 날짜순으로 섞어서. */
  const unclassified = useMemo(
    () =>
      [...visibleEvidence.filter((e) => !isClassified(e, threadIdSet)), ...mirrorCards].sort(
        byDateDesc,
      ),
    [visibleEvidence, threadIdSet, mirrorCards],
  );
  const byThread = useMemo(() => {
    const m = new Map<string, RecordEvidence[]>();
    for (const e of visibleEvidence) {
      if (!isClassified(e, threadIdSet)) continue;
      const id = e.threadId!;
      const list = m.get(id);
      if (list) list.push(e);
      else m.set(id, [e]);
    }
    return m;
  }, [visibleEvidence, threadIdSet]);
  const openThread = useMemo(
    () => studentThreads.find((t) => t.id === openThreadId) ?? null,
    [studentThreads, openThreadId],
  );
  // ── 근거 지도 파생값(ADR-106) ───────────────────────────────
  /** 카드 위치(장면이 없는 묶음에서 손으로 민 값) — 기기별. */
  // ── 장면 열 파생값(ADR-103 · 지도에 통합 ADR-107) ─────────────────
  /**
   * 어느 틀로 볼 것인가 — **영역이 정한다.** 행동특성은 생활 틀(특성·장면·성장·평가), 나머지는 탐구 틀.
   * ★고른 영역이 없으면 이 화면의 영역 하나(있으면)를, 그것도 없으면 탐구 틀로 본다.
   */
  const frame: NarrativeFrameId = useMemo(
    // ★영역 **필터**는 보지 않는다. 필터는 카드를 잠깐 가리는 장치인데, 이 값으로 틀을 정하면
    //   행특 주제를 보는 중에 칩 하나를 누르는 것만으로 틀이 탐구로 뒤집혀 **탐구 카테고리가
    //   행특 주제에 저장된다.** 나중에 초안 패널은 같은 주제를 생활 틀로 풀기 때문에
    //   요청서에 어긋난 지침이 실린다. 틀은 이 화면이 다루는 영역이 정한다.
    () => frameForArea(singleArea ?? initialArea ?? 'subject'),
    [singleArea, initialArea],
  );

  /**
   * 줄기 목록 — **이어진 줄기가 앞 줄기 바로 다음에 오도록** 늘어놓는다.
   * ★고리(A→B→A)가 있어도 방문 집합으로 끊는다. 못 붙인 줄기는 뒤에 독립으로 붙여 **하나도 잃지 않는다**.
   */
  const lanes = useMemo((): readonly NarrativeLaneModel[] => {
    const mineIds = new Set(studentThreads.map((t) => t.id));
    const childrenOf = new Map<string, string[]>();
    for (const t of studentThreads) {
      const from = t.link?.fromThreadId;
      if (from === undefined || !mineIds.has(from)) continue;
      const list = childrenOf.get(from);
      if (list) list.push(t.id);
      else childrenOf.set(from, [t.id]);
    }
    const byId = new Map(studentThreads.map((t) => [t.id, t] as const));
    const placed = new Set<string>();
    const order: string[] = [];
    const walk = (id: string): void => {
      if (placed.has(id)) return;
      placed.add(id);
      order.push(id);
      for (const child of childrenOf.get(id) ?? []) walk(child);
    };
    for (const t of studentThreads) {
      const from = t.link?.fromThreadId;
      if (from === undefined || !mineIds.has(from)) walk(t.id);
    }
    // 고리에 갇혀 뿌리를 못 찾은 줄기도 빠뜨리지 않는다.
    for (const t of studentThreads) walk(t.id);

    // ↑↓ — 이어진 묶음의 맨 앞 주제(앞 주제가 이 학생에게 없는 주제)만, 같은 상태(열림/닫힘)끼리 옮긴다.
    const isRoot = (id: string): boolean => {
      const from = byId.get(id)?.link?.fromThreadId;
      return from === undefined || !mineIds.has(from);
    };
    const roots = order.filter(isRoot);
    const blockSize = new Map<string, number>();
    let head: string | null = null;
    for (const id of order) {
      if (isRoot(id)) head = id;
      if (head !== null) blockSize.set(head, (blockSize.get(head) ?? 0) + 1);
    }
    const moveOf = (id: string): NarrativeLaneModel['move'] => {
      if (!isRoot(id)) return undefined;
      const status = byId.get(id)?.status;
      const peers = roots.filter((r) => byId.get(r)?.status === status);
      const i = peers.indexOf(id);
      if (peers.length < 2 || i < 0) return undefined;
      return { up: i > 0, down: i < peers.length - 1, groupSize: blockSize.get(id) ?? 1 };
    };

    return order.flatMap((id) => {
      const thread = byId.get(id);
      if (thread === undefined) return [];
      // ★장면은 영역 필터를 타지 않는다. 필터로 가린 근거가 장면에서 사라지면
      //   "놓아 둔 자리가 없어졌다"고 읽힌다(끌 수 없는 필터 사고와 같은 모양).
      const mine = studentEvidence.filter((e) => e.threadId === id);
      const resolved = scenesOf(thread, studentEvidence, frame);
      const parentId = thread.link?.fromThreadId;
      const parent = parentId === undefined ? undefined : byId.get(parentId);
      return [
        {
          thread,
          resolved,
          ...(parent === undefined
            ? {}
            : {
                linkFrom: {
                  thread: parent,
                  ...(thread.link?.note === undefined ? {} : { note: thread.link.note }),
                },
              }),
          hints: emptyLinkHints(buildThreadTimeline(mine)),
          chainLength: chainOf(studentThreads, id).length,
          collapsed: collapsedLanes.includes(id),
          ...((): { move?: NonNullable<NarrativeLaneModel['move']> } => {
            const move = moveOf(id);
            return move === undefined ? {} : { move };
          })(),
        } satisfies NarrativeLaneModel,
      ];
    });
  }, [studentThreads, studentEvidence, frame, collapsedLanes]);
  // ★차례·접기·↑↓·장면 풀이는 줄기 모델(`lanes`)에서 온다 — 지도 묶음과 초안 화면이 같은 차례·같은 규칙을 봐야 한다.
  // ★장면이 있는 주제는 **장면 열**(ADR-107): 열 = 글 순서, 마지막 열은 「자리 미정」. 열 안 카드 차례는 장면에 적힌 순서.
  //   장면 배열은 영역 필터를 타지 않으므로(`lanes` 주석) 열의 카드는 `resolved` 것을 그대로 쓴다.
  const mapGroups = useMemo((): readonly EvidenceMapGroupModel[] => {
    const threadGroups: EvidenceMapGroupModel[] = lanes.map((lane) => {
      const t = lane.thread;
      const hasScenes = (t.scenes?.length ?? 0) > 0;
      const columns: MapColumnModel[] | undefined = hasScenes
        ? [
            ...lane.resolved.scenes.map((rs): MapColumnModel => {
              const { slot, detail } = sceneHeadParts(frame, rs.scene);
              return {
                key: `${t.id}:${rs.scene.id}`,
                kind: 'scene',
                scene: rs.scene,
                ...(rs.virtual === true ? { virtual: true } : {}),
                role: rs.scene.role,
                slot,
                detail,
                ...(rs.scene.note === undefined ? {} : { note: rs.scene.note }),
                ...(rs.scene.leadIn === undefined ? {} : { leadIn: rs.scene.leadIn }),
                dropId: sceneDropId(t.id, rs.scene.id),
                items: rs.evidences.filter((e) => rs.ownIds.has(e.id)),
                linkedEvidenceCount: rs.evidences.length,
              };
            }),
            {
              key: `${t.id}:unplaced`,
              kind: 'unplaced',
              slot: '자리 미정',
              detail: null,
              dropId: unplacedDropId(t.id),
              items: lane.resolved.unplaced,
            },
          ]
        : undefined;
      return {
        key: t.id,
        thread: t,
        title: t.title,
        items: hasScenes
          ? [
              ...lane.resolved.scenes.flatMap((rs) =>
                rs.evidences.filter((e) => rs.ownIds.has(e.id)),
              ),
              ...lane.resolved.unplaced,
            ]
          : (byThread.get(t.id) ?? []),
        dropId: threadDropId(t.id),
        ...(t.status === 'closed' ? { closed: true } : {}),
        ...(lane.collapsed ? { collapsed: true } : {}),
        ...(lane.move === undefined ? {} : { move: lane.move }),
        ...(columns === undefined ? {} : { columns }),
        ...(lane.linkFrom === undefined
          ? {}
          : {
              linkFrom: {
                threadId: lane.linkFrom.thread.id,
                title: lane.linkFrom.thread.title,
                ...(lane.linkFrom.note === undefined ? {} : { note: lane.linkFrom.note }),
              },
            }),
      };
    });
    return [
      ...threadGroups,
      {
        key: 'unclassified',
        title: '미분류 근거',
        items: unclassified,
        dropId: UNCLASSIFIED_DROP_ID,
      },
    ];
  }, [lanes, byThread, unclassified, frame]);
  const unplacedItems = [
    ...unclassified.map((evidence) => ({ evidence, group: '미분류' })),
    ...lanes.flatMap((lane) =>
      lane.resolved.unplaced.map((evidence) => ({
        evidence,
        group: `${lane.thread.title} · 자리 미정`,
      })),
    ),
  ];
  const openLanes = lanes.filter((lane) => lane.thread.status === 'open');
  const scaffoldLane =
    openLanes.find((lane) => lane.thread.id === scaffoldThreadId) ?? openLanes[0];

  /** 이 선생님이 최근에 쓴 이음말 — 화살표의 지름길 칩에 붙는다. */
  const recentLinkNotes = useMemo(() => {
    const seen: string[] = [];
    for (const t of threads) {
      const n = t.link?.note?.trim() ?? '';
      if (n.length > 0 && !seen.includes(n)) seen.push(n);
    }
    return seen.slice(0, 3);
  }, [threads]);

  /** 이 선생님이 최근에 쓴 장면 이음말 — 장면 이음 칸의 지름길 칩. */
  const recentSceneLeadIns = useMemo(() => {
    const seen: string[] = [];
    for (const t of threads) {
      for (const sc of t.scenes ?? []) {
        const n = sc.leadIn?.trim() ?? '';
        if (n.length > 0 && !seen.includes(n)) seen.push(n);
      }
    }
    return seen.slice(0, 3);
  }, [threads]);

  /** 이 영역에서 마지막으로 깐 뼈대. 목록에서 표시만 한다. */
  // ★틀과 **같은 식**으로 고른다. 예전에는 이 키만 `areaFilter` 를 봐서, 영역 칩을 [전체]로
  //   바꾸면 생활 뼈대 id 가 교과 자리에 저장돼 표시가 엉뚱한 곳을 가리켰다.
  const scaffoldAreaKey = singleArea ?? initialArea ?? 'subject';
  const selectedScaffoldId = savedAreaScaffolds?.[scaffoldAreaKey];
  const mapScaffoldConfigurationForArea = useCallback(
    (
      area: RecordArea,
    ): {
      readonly candidates: readonly RecordMapScaffoldSnapshot[];
      readonly defaultScaffold: RecordMapScaffoldSnapshot;
    } => {
      const areaFrame = frameForArea(area);
      const candidates = scaffoldChoices(builtInScaffolds(), savedScaffolds ?? [], areaFrame).map(
        (scaffold) => ({
          id: scaffold.id,
          name: scaffold.name,
          frame: scaffold.frame,
          scenes: scaffold.scenes,
          ...(scaffold.builtIn === undefined ? {} : { builtIn: scaffold.builtIn }),
        }),
      );
      const defaultScaffold =
        candidates.find((scaffold) => scaffold.id === savedAreaScaffolds?.[area]) ?? candidates[0];
      if (defaultScaffold === undefined)
        throw new Error('현재 영역에서 사용할 뼈대를 찾을 수 없습니다.');
      return { candidates, defaultScaffold };
    },
    [savedAreaScaffolds, savedScaffolds],
  );
  /** 서랍의 줄기 — 영역 필터와 무관하게 그 주제 전부. */
  const openThreadEvidence = useMemo(
    () => (openThread ? studentEvidence.filter((e) => e.threadId === openThread.id) : []),
    [studentEvidence, openThread],
  );
  const titleSources = useMemo(
    () => ({
      assessmentTitles: [
        ...plans
          .filter((p) => (classId ? p.teachingClassId === classId : true))
          .map((p) => p.title),
        ...rubrics.filter((r) => (classId ? r.classId === classId : true)).map((r) => r.title),
      ],
      assignmentTitles: assignments.map((a) => a.title),
    }),
    [plans, rubrics, assignments, classId],
  );
  /** 실명·학번 가림 명단 — AI 초안 패널과 같은 것. */
  const roster = useMemo(
    () =>
      rosterFromAll(
        students.map((s) => ({ name: s.name, studentNumber: s.number })),
        [],
      ),
    [students],
  );

  /**
   * 고스트 카드 — 제안 가운데 **아직 미분류이고 이 학생 것인** 근거만. 손으로 먼저 옮겼거나 지운 근거는 빠진다.
   * 키: 기존 주제 id 또는 `new:제목`.
   */
  const ghosts = useMemo(() => {
    const m = new Map<string, { suggestion: ThreadSuggestion; items: RecordEvidence[] }>();
    if (suggest.kind !== 'ready') return m;
    // 거울도 제안 입력이었으므로 고스트에도 거울이 온다. 적용하면 `sendTo`/`sendToNew` 가 거울을 add(threadId) 로 저장한다.
    const unclassifiedById = new Map(
      [...studentEvidence.filter((e) => !isClassified(e, threadIdSet)), ...mirrorCards].map(
        (e) => [e.id, e] as const,
      ),
    );
    for (const s of suggest.suggestions) {
      const items = s.evidenceIds
        .map((id) => unclassifiedById.get(id))
        .filter((e): e is RecordEvidence => e !== undefined);
      if (items.length === 0) continue;
      m.set(s.threadId ?? `new:${s.title}`, { suggestion: s, items });
    }
    return m;
  }, [suggest, studentEvidence, threadIdSet, mirrorCards]);
  const ghostCount = useMemo(
    () => [...ghosts.values()].reduce((n, g) => n + g.items.length, 0),
    [ghosts],
  );

  /**
   * 하단 토스트. 기본 3초. 단추([되돌리기])를 실으면 5초 — 누를 시간을 준다.
   * 새 토스트가 오면 앞 것을 바로 바꾼다(타이머도 새로).
   */
  const flash = useCallback((text: string, action?: ToastState['action']): void => {
    if (toastTimer.current !== null) clearTimeout(toastTimer.current);
    setToast(action ? { text, action } : { text });
    toastTimer.current = setTimeout(
      () => {
        setToast(null);
        toastTimer.current = null;
      },
      action ? 5000 : 3000,
    );
  }, []);
  const closeToast = useCallback((): void => {
    if (toastTimer.current !== null) clearTimeout(toastTimer.current);
    toastTimer.current = null;
    setToast(null);
  }, []);

  /**
   * 저장 직후 [근거 보드에서 보기] 로 넘어온 대상을 찾아 준다(계획 §4.3, AC-10).
   *
   * 순서가 중요하다: **먼저 필터를 풀고**(다음 렌더에서 카드가 그려진다) 그다음에 스크롤·포커스한다.
   * ★못 찾으면 조용히 넘어가지 않는다. 교사는 방금 저장한 것이 없어졌다고 읽는다.
   */
  useEffect(() => {
    if (!focusRequest || !student) return;
    if (handledFocusRef.current === focusRequest.requestId) return;
    // 어느 보기로 오라는 요청인지 먼저 맞춘다. 지도에 있는데 보드 카드를 찾으면 못 찾는다.
    // ★설정은 스토어에서 **그때 값을 직접 읽는다.** 이 효과의 의존성으로 걸면 보기를 바꿀 때마다
    //   효과가 다시 돌아 스크롤을 되풀이한다.
    // ★`flow`(옛 흐름 보기 요청)는 지도다 — 저장 직후 [근거 정리에서 보기]가 보내는 값이 아직 이 이름이다.
    const st = useSettingsStore.getState();
    const current = st.settings.recordEvidenceViewMode === 'board' ? 'board' : 'map';
    const want =
      focusRequest.mode === 'board' ? 'board' : focusRequest.mode === 'flow' ? 'map' : null;
    if (want !== null && current !== want) {
      void st.update({ recordEvidenceViewMode: want });
    }
    const targetId =
      focusRequest.evidenceId !== undefined &&
      studentEvidence.some((r) => r.id === focusRequest.evidenceId)
        ? focusRequest.evidenceId
        : focusRequest.sourceId !== undefined
          ? (studentEvidence.find((r) => r.sourceId === focusRequest.sourceId)?.id ??
            (mirrorBySourceId.has(focusRequest.sourceId)
              ? mirrorId(focusRequest.sourceId)
              : undefined))
          : undefined;
    if (targetId === undefined) {
      // 아직 목록이 안 왔을 수 있다. 근거가 로드되기 전에는 판정하지 않는다.
      if (!evidenceLoaded) return;
      handledFocusRef.current = focusRequest.requestId;
      onFocusRequestHandled?.();
      flash('방금 저장한 근거를 보드에서 찾지 못했습니다');
      return;
    }
    // 영역 필터에 가려 안 보이면 먼저 푼다. 못 찾은 것이 아니라 가려진 것이다.
    const hidden =
      areaFilter !== null &&
      !isMirrorId(targetId) &&
      !studentEvidence.some((r) => r.id === targetId && evidenceInArea(r, areaFilter));
    if (hidden) {
      setAreaFilter(null);
      flash('전체 유형으로 바꿔서 방금 저장한 근거를 보여 드립니다');
      return; // 다음 렌더에서 카드가 그려지면 이 effect 가 다시 돌아 스크롤한다.
    }
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-evidence-id="${targetId}"]`);
    if (!el) return; // 아직 안 그려졌다. 다음 렌더에 다시 시도한다.
    handledFocusRef.current = focusRequest.requestId;
    onFocusRequestHandled?.();
    // 스크롤은 있으면 좋은 것이고 포커스가 본질이다 - 스크롤 API 가 없다고 포커스까지 놓치지 않는다.
    el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    el.focus();
    // 마친 주제 열은 접혀 있다 - 대상이 그 안이면 펼쳐 준다.
    const t = studentEvidence.find((r) => r.id === targetId)?.threadId;
    if (t !== undefined) setExpandedClosed((prev) => (prev.includes(t) ? prev : [...prev, t]));
  }, [
    focusRequest,
    student,
    studentEvidence,
    mirrorBySourceId,
    areaFilter,
    evidenceLoaded,
    onFocusRequestHandled,
    flash,
  ]);

  /** 이동 결과를 한 줄로 — 건너뛴 건이 있으면 반드시 말한다. `addedMirrors` = 관문 밖에서 주제로 바로 저장한 거울 수. */
  const report = (r: EvidenceMoveResult, done: string, addedMirrors = 0): void => {
    const skipped =
      r.skippedIds.length > 0
        ? ` · ${r.skippedIds.length}건은 이 학생 근거가 아니라 묶지 않았습니다`
        : '';
    flash(`${r.movedIds.length + addedMirrors}건을 ${done}${skipped}`);
  };
  const fail = (err: unknown): void => {
    flash(err instanceof Error ? err.message : '저장하지 못했습니다. 다시 시도해 주세요.');
  };

  // ── 학생 이동 ───────────────────────────────────────────────
  /** 지금 열려 있는 장면 메모 입력칸(장면 id). 학생을 바꾸면 칸이 통째로 사라지므로, 비어 있지 않으면 먼저 묻는다. */
  const editingScenesRef = useRef<Set<string>>(new Set());
  const canLeaveMapEditor = (): boolean => {
    if (editingScenesRef.current.size === 0) return true;
    if (!window.confirm('저장하지 않은 메모가 있습니다. 수정한 내용을 버리고 이동할까요?'))
      return false;
    editingScenesRef.current.clear();
    return true;
  };
  const travelHistory = async (direction: 'undo' | 'redo'): Promise<void> => {
    if (!canLeaveMapEditor()) return;
    try {
      if (!(await history.travel(direction))) return;
      setSelectedIds([]);
      setFocusedId(null);
      setMapPick(null);
      setSceneAddFor(null);
      setSceneEditFor(null);
      flash(
        direction === 'undo'
          ? '마지막 작업을 실행 취소했습니다'
          : '취소한 작업을 다시 실행했습니다',
      );
    } catch (error) {
      fail(error);
    }
  };
  const historyActiveRef = useRef(false);
  const historyKeyRef = useRef(travelHistory);
  historyKeyRef.current = travelHistory;
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.repeat ||
        !event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        event.metaKey
      )
        return;
      const key =
        event.code === 'KeyZ' ? 'z' : event.code === 'KeyX' ? 'x' : event.key.toLowerCase();
      if (key !== 'z' && key !== 'x') return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
        )
      )
        return;
      if (
        !(target instanceof Node) ||
        (!rootRef.current?.contains(target) &&
          !(target === document.body && historyActiveRef.current))
      )
        return;
      if (
        target === document.body &&
        document.querySelector('[role="dialog"], [role="alertdialog"]')
      )
        return;
      if (target instanceof Element && target.closest('[role="dialog"], [role="alertdialog"]'))
        return;
      event.preventDefault();
      void historyKeyRef.current(key === 'z' ? 'undo' : 'redo');
    };
    const onPointer = (event: PointerEvent): void => {
      historyActiveRef.current =
        event.target instanceof Node && !!rootRef.current?.contains(event.target);
    };
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer, true);
    };
  }, []);
  const selectStudentSafely = (studentRef: string): void => {
    if (
      editingScenesRef.current.size > 0 &&
      !window.confirm(
        '저장하지 않은 장면 메모가 있습니다. 학생을 바꾸면 그 메모는 사라집니다. 그래도 바꿀까요?',
      )
    ) {
      return;
    }
    editingScenesRef.current.clear();
    onSelectStudent(studentRef);
  };
  const goStudent = (delta: number): void => {
    if (studentIndex < 0) return;
    const next = students[studentIndex + delta];
    if (next) selectStudentSafely(next.studentRef);
  };
  const goStudentRef = useRef(goStudent);
  goStudentRef.current = goStudent;
  // Alt+←/→ 로 학생을 넘긴다(100명을 마우스로 넘기지 않게). 입력칸 안에서는 글자 이동이므로 건드리지 않는다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      if (
        e.target instanceof Element &&
        e.target.closest('input, textarea, select, [contenteditable="true"]')
      ) {
        return;
      }
      e.preventDefault();
      goStudentRef.current(e.key === 'ArrowLeft' ? -1 : 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── 거울 → 저장 (첫 손댄 = 저장) ─────────────────────────────
  /** 거울이 저장될 때 받는 영역: 컨텍스트 영역이 1개면 그것 · 여러 개면 보드의 필터 · "전체"면 빈 배열(엑셀 업로드와 같은 유형 미지정). */
  const mirrorAreas = (): RecordArea[] => {
    const a = singleArea ?? areaFilter;
    return a ? [a] : [];
  };
  /** 거울 하나를 `add`/`addMany` 입력으로. 주제로 바로 저장하면 `threadId` 까지 한 번의 쓰기다. */
  const mirrorAddInput = (
    c: EvidenceCandidate,
    extra: { threadId?: string; excludedFromAi?: boolean } = {},
  ): RecordEvidenceAddInput => ({
    studentRef: student?.studentRef ?? '',
    areas: mirrorAreas(),
    content: c.content,
    sourceType: c.sourceType,
    sourceId: c.sourceId,
    ...(c.date !== undefined ? { date: c.date } : {}),
    ...(c.slots !== undefined ? { slots: c.slots } : {}),
    ...(classId !== undefined ? { classId } : {}),
    ...(extra.threadId !== undefined ? { threadId: extra.threadId } : {}),
    ...(extra.excludedFromAi === true ? { excludedFromAi: true } : {}),
  });
  /** 선택 id 목록을 저장 카드 id 와 거울 후보로 가른다. 이미 사라진 거울(그사이 저장됨)은 버린다. */
  const splitSelection = (
    ids: readonly string[],
  ): { savedIds: string[]; mirrorCands: EvidenceCandidate[] } => {
    const savedIds: string[] = [];
    const mirrorCands: EvidenceCandidate[] = [];
    for (const id of ids) {
      if (!isMirrorId(id)) {
        savedIds.push(id);
        continue;
      }
      const c = mirrorBySourceId.get(id.slice(MIRROR_PREFIX.length));
      if (c) mirrorCands.push(c);
    }
    return { savedIds, mirrorCands };
  };

  // ── 선택 · 보내기 ───────────────────────────────────────────
  const toggleSelect = (id: string): void => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  /**
   * 원본의 저장 결과 ID를 사용하므로 중복 방지로 기존 근거를 돌려받아도 요청한 주제로 보낸다.
   */
  const sendTo = async (
    threadId: string,
    ids: readonly string[] = selectedIds,
  ): Promise<boolean> => {
    return history.run('주제로 보내기', async () => {
      if (!student || ids.length === 0) return false;
      const { savedIds, mirrorCands } = splitSelection(ids);
      try {
        const resolvedIds = [...savedIds];
        for (const candidate of mirrorCands)
          resolvedIds.push(await addEvidence(mirrorAddInput(candidate, { threadId })));
        if (resolvedIds.length === 0) return false;
        const r = await moveToThread({
          studentRef: student.studentRef,
          evidenceIds: [...new Set(resolvedIds)],
          threadId,
        });
        setSelectedIds((prev) => prev.filter((x) => !ids.includes(x)));
        report(
          r,
          `‘${studentThreads.find((t) => t.id === threadId)?.title ?? '주제'}’로 보냈습니다`,
        );
        return r.skippedIds.length === 0 && r.movedIds.length > 0;
      } catch (err) {
        fail(err);
        return false;
      }
    });
  };

  /**
   * 하단 바 [AI 제외]/[AI 제외 해제] — 고른 카드 전부를 한 번의 저장으로 바꾼다.
   * 선택은 이 학생의 카드에서만 나오고(학생이 바뀌면 비운다) 보드는 다른 학생 카드를 그리지 않으므로, 여기에 남의 학생 근거가 섞일 길은 없다.
   */
  const setSelectedExcluded = async (excluded: boolean): Promise<void> => {
    return history.run('AI 제외 변경', async () => {
      const ids = selectedIds;
      if (!student || ids.length === 0) return;
      const { savedIds, mirrorCands } = splitSelection(ids);
      try {
        let touched = savedIds.length;
        if (excluded) {
          // 거울은 "AI 제외"로 저장하는 것이 곷 첫 손댄 — 한 번의 쓰기.
          if (mirrorCands.length > 0) {
            touched += await addManyEvidence(
              mirrorCands.map((c) => mirrorAddInput(c, { excludedFromAi: true })),
            );
          }
          if (savedIds.length > 0) await setExcludedFromAiMany(savedIds, true);
        } else {
          // 해제: 거울 가운데 자동 판정으로 켜져 보이던 것만 저장해 실제 id 를 받고 함께 푸는다.
          const flagged = mirrorCands.filter((c) => hasProhibitedTerms(c.content));
          const newIds: string[] = [];
          for (const c of flagged) newIds.push(await addEvidence(mirrorAddInput(c)));
          const all = [...savedIds, ...newIds];
          if (all.length > 0) await setExcludedFromAiMany(all, false);
          touched = all.length;
        }
        setSelectedIds((prev) => prev.filter((x) => !isMirrorId(x)));
        flash(`${touched}건을 ${excluded ? 'AI 제외로 바꿨습니다' : 'AI 제외에서 풀었습니다'}`);
      } catch (err) {
        fail(err);
      }
    });
  };

  /** 카드 [AI 제외] 토글 — 거울이면 그 순간 저장한다(켜기 = `add(excludedFromAi)` 한 번). */
  const setCardExcluded = async (ev: RecordEvidence, excluded: boolean): Promise<void> => {
    return history.run('AI 제외 변경', async () => {
      if (!isMirrorId(ev.id)) {
        await setExcludedFromAi(ev.id, excluded);
        return;
      }
      const c = mirrorBySourceId.get(ev.id.slice(MIRROR_PREFIX.length));
      if (!c) return;
      try {
        if (excluded) {
          await addEvidence(mirrorAddInput(c, { excludedFromAi: true }));
        } else {
          // 자동 판정으로 켜져 보이던 거울을 푸는 것 — 저장하면 스토어가 다시 켜므로 저장 뒤 풀어야 한다.
          const id = await addEvidence(mirrorAddInput(c));
          await setExcludedFromAi(id, false);
        }
        setSelectedIds((prev) => prev.filter((x) => x !== ev.id));
      } catch (err) {
        fail(err);
      }
    });
  };

  /** [미분류로] — 저장 카드는 관문 `unclassify`, 거울은 미분류 그대로 저장(처음 손대는 것). */
  const sendToUnclassified = async (ids: readonly string[] = selectedIds): Promise<boolean> => {
    return history.run('미분류로 돌리기', async () => {
      if (!student || ids.length === 0) return false;
      const { savedIds, mirrorCands } = splitSelection(ids);
      try {
        const added =
          mirrorCands.length > 0
            ? await addManyEvidence(mirrorCands.map((c) => mirrorAddInput(c)))
            : 0;
        const r =
          savedIds.length > 0
            ? await unclassify({ studentRef: student.studentRef, evidenceIds: savedIds })
            : { movedIds: [], skippedIds: [] };
        setSelectedIds((prev) => prev.filter((x) => !ids.includes(x)));
        report(r, '미분류로 되돌렸습니다. 근거 내용과 원본 기록은 보존됩니다', added);
        const ok = r.skippedIds.length === 0 && r.movedIds.length + added > 0;
        if (ok) setUnplacedOpen(true);
        return ok;
      } catch (err) {
        fail(err);
        return false;
      }
    });
  };

  /** 매칭 키워드 초기값 — 루브릭 **요소** 이름이 주제 이름과 겹칠 때 자동으로 실어 준다(이름이 아니라 매칭용). */
  const keywordsForTitle = (title: string): string[] => {
    const criterionNames = rubrics
      .filter((r) => (classId ? r.classId === classId : true) && r.title === title)
      .flatMap((r) => r.criteria.map((c) => c.name));
    return topicMatchKeywords({ rubricCriterionNames: criterionNames });
  };

  /** 새 주제를 만들며 보낸다(한 동작). 반환 = 만든 주제 id(옮길 게 없으면 null). */
  const sendToNew = async (title: string, ids: readonly string[]): Promise<string | null> => {
    return history.run('새 주제로 보내기', async () => {
      if (!student) return null;
      // 거울은 먼저 저장해 실제 id 를 받고, 저장 카드 id 와 합쳤 관문(주제 생성 + 이동이 한 동작)을 부른다.
      const { savedIds, mirrorCands } = splitSelection(ids);
      const newIds: string[] = [];
      for (const c of mirrorCands) newIds.push(await addEvidence(mirrorAddInput(c)));
      const r = await moveToNewThread({
        studentRef: student.studentRef,
        evidenceIds: [...savedIds, ...newIds],
        title,
        keywords: keywordsForTitle(title),
        ...(classId !== undefined ? { classId } : {}),
      });
      setSelectedIds((prev) => prev.filter((x) => !ids.includes(x)));
      report(r, `새 주제 ‘${title}’로 보냈습니다`);
      return r.threadId;
    });
  };

  /** 새 주제 팽오버를 연다 — 누른 단추(또는 놓은 칸) 위에 띄운다. `ids` 는 끌어다 놓았을 때만. */
  const openCreate = (
    forSelection: boolean,
    anchorEl: Element | null,
    ids?: readonly string[],
  ): void => {
    setForm(null);
    setCreating({
      forSelection,
      anchor: anchorEl?.getBoundingClientRect() ?? null,
      ...(ids !== undefined ? { ids } : {}),
    });
  };

  /** [+ 새 주제] — 고른(또는 끌어 놓은) 근거가 있으면 만들며 보내고, 없으면 빈 주제만 만든다. */
  const createThread = async (title: string): Promise<void> => {
    return history.run('주제 추가', async () => {
      if (!student) return;
      const ids = creating?.ids ?? selectedIds;
      const forSelection = creating?.forSelection === true && ids.length > 0;
      setCreating(null);
      try {
        if (forSelection) {
          await sendToNew(title, ids);
        } else {
          await addThread({
            studentRef: student.studentRef,
            title,
            keywords: keywordsForTitle(title),
            ...(classId !== undefined ? { classId } : {}),
          });
          flash(`주제 ‘${title}’를 만들었습니다`);
        }
      } catch (err) {
        fail(err);
      }
    });
  };

  // ── 끌어다 놓기 — 하단 바와 같은 함수를 부른다(저장 경로 하나) ────────────────
  /** 끌리는 카드가 선택된 상태면 선택 전체가 같이 간다. 선택 안 된 카드를 끌면 그 한 장만(선택은 안 바뀜다). */
  const draggedIds = (activeId: string): readonly string[] =>
    selectedIds.includes(activeId) ? selectedIds : [activeId];

  const onDragStart = (e: DragStartEvent): void => {
    const id = String(e.active.id);
    const lead = unclassified.find((x) => x.id === id) ?? studentEvidence.find((x) => x.id === id);
    if (!lead) return;
    setDragging({ lead, count: draggedIds(id).length });
  };

  /**
   * 놓았다. 열린 주제 열 → `sendTo` · 미분류 열 → `sendToUnclassified` · [+ 새 주제] → 이름 팽오버(확정 시 `sendToNew`).
   * ★닫힌 주제 열은 droppable 이 꺼져 있어 `over` 가 오지 않고, 혹시 와도 여기서 한 번 더 거른다 — 저장 0회.
   */
  const onDragEnd = (e: DragEndEvent): void => {
    setDragging(null);
    const overId = e.over ? String(e.over.id) : null;
    if (!student) return;
    const ids = draggedIds(String(e.active.id));
    if (overId?.startsWith('drop:before:')) {
      const beforeId = overId.slice('drop:before:'.length);
      if (ids.includes(beforeId)) return;
      const lane = lanes.find((l) =>
        l.resolved.scenes.some((s) => s.evidences.some((ev) => ev.id === beforeId)),
      );
      const scene = lane?.resolved.scenes.find((s) => s.evidences.some((ev) => ev.id === beforeId));
      if (lane && scene && lane.thread.status === 'open') {
        const index = scene.scene.evidenceIds.filter((id) => !ids.includes(id)).indexOf(beforeId);
        void placeInScene(lane.thread.id, scene.scene.id, ids, Math.max(0, index));
      } else if (!scene) {
        const target = studentEvidence.find((ev) => ev.id === beforeId);
        const owner = studentThreads.find((t) => t.id === target?.threadId);
        if (owner?.status === 'closed') return;
        if (owner && owner.scenes?.length) {
          void detachToUnplaced(owner.id, ids);
        } else if (owner) {
          void sendTo(owner.id, ids);
        } else if (target) {
          void sendToUnclassified(ids);
        }
      }
      return;
    }
    // 지도: 같은 묶음 안(또는 빈 자리)에 놓으면 옮기기가 아니라 **자리 밀기**다(저장 0회, 기기별 위치만).
    //   다른 묶음에 놓으면 아래 옮기기(주제 소유 변경)로 간다 — 이름표가 보드와 같아 같은 길을 탄다.
    if (viewMode === 'map') {
      const lead = studentEvidence.find((x) => x.id === String(e.active.id));
      const home =
        lead === undefined || !isClassified(lead, threadIdSet)
          ? UNCLASSIFIED_DROP_ID
          : threadDropId(lead.threadId ?? '');
      if (overId === null || overId === home) {
        // 장면 열이 있는 묶음은 열이 자리를 정하므로 밀지 않는다 — 열 사이에 놓으면 아무 일도 없다.
        const homeGroup = mapGroups.find((g) => g.dropId === home);
        if (lead !== undefined && homeGroup?.columns === undefined) {
          void history.run('카드 위치 이동', async () => {
            mapPositions.move(lead.id, e.delta.x / mapZoom, e.delta.y / mapZoom);
          });
        }
        return;
      }
    }
    if (overId === null) return;
    if (overId === UNCLASSIFIED_DROP_ID) {
      // 이미 미분류인 저장 카드만 끌었으면 할 일이 없다(거울은 놓으면 저장된다 — 처음 손대는 것).
      const moving = ids.filter((id) => isMirrorId(id) || !unclassified.some((x) => x.id === id));
      if (moving.length > 0) void sendToUnclassified(moving);
      return;
    }
    if (overId === NEW_THREAD_DROP_ID) {
      openCreate(true, newZoneRef.current, ids);
      return;
    }
    // 지도의 장면 열 둘 — 장면과 「자리 미정」. 보드에는 없는 자리다.
    const narrative = parseNarrativeDropId(overId);
    if (narrative !== null) {
      const owner = studentThreads.find((t) => t.id === narrative.threadId);
      if (!owner || owner.status === 'closed') return;
      if (narrative.kind === 'scene') {
        void placeInScene(narrative.threadId, narrative.sceneId, ids);
      } else {
        void detachToUnplaced(narrative.threadId, ids);
      }
      return;
    }
    const target = studentThreads.find((t) => threadDropId(t.id) === overId);
    if (!target || target.status === 'closed') return;
    void sendTo(target.id, ids);
  };

  /**
   * 주제 삭제 — 근거의 threadId 는 스토어가 안 지운다. 여기서 미분류로 풀고 지운다.
   * 부르는 곳은 주제 서랍(`InquiryThreadPanel.onRemove`, 두 번 누르기)뿐이다 — 열 머리에는 없다(설계서 §5-c).
   */
  const deleteThread = async (threadId: string): Promise<void> => {
    return history.run('주제 삭제', async () => {
      const linked = studentEvidence.filter((e) => e.threadId === threadId).map((e) => e.id);
      try {
        if (linked.length > 0) await setThread(linked, null);
        await removeThread(threadId);
        if (openThreadId === threadId) setOpenThreadId(null);
        flash(
          linked.length > 0
            ? `주제를 지우고 근거 ${linked.length}건을 미분류로 되돌렸습니다`
            : '주제를 지웠습니다',
        );
      } catch (err) {
        fail(err);
      }
    });
  };

  // ── 장면 동작(ADR-103 · 지도에 통합 ADR-107) ───────────────────
  /**
   * 가상 평가 자리에 무엇을 적거나 놓으려 할 때, **진짜 자리를 먼저 세운다**.
   *
   * ★`scenesOf` 는 평가 장면이 없는 주제에 가상 칸을 끼워 보여 준다(저장하지 않는다). 그 칸은
   *   "이 학생에 대한 내 판단을 적어 두세요"라고 권하는 자리라 선생님이 실제로 적는다.
   *   자리를 안 세우면 그 글은 갈 곳이 없어 조용히 버려진다(적대 검토 2026-09-10 치명 1건).
   * 세우지 못하면 `null` 을 돌려주고 부르는 쪽은 아무 일도 하지 않는다.
   */
  const materializeScene = async (threadId: string, sceneId: string): Promise<string | null> => {
    if (sceneId !== VIRTUAL_EVALUATION_SCENE_ID) return sceneId;
    try {
      // 평가 자리는 맨 앞이 기본이다(ADR-094 가 기본값으로 남았다).
      const made = await addScene(
        threadId,
        { role: 'evaluation', moduleId: defaultModuleFor(frame, 'evaluation') },
        0,
      );
      if (made !== null) return made;
      // ★못 세웠다면 그 사이에 누군가 세운 것이다(빠르게 두 번 누르기·다른 세션). 그 자리를 쓴다 —
      //   여기서 포기하면 선생님이 방금 쓴 글이 또 갈 곳을 잃는다.
      const now = useInquiryThreadStore.getState().records.find((t) => t.id === threadId);
      const existing = now?.scenes?.find((sc) => sc.role === 'evaluation')?.id;
      if (existing !== undefined) return existing;
      // 여기까지 오면 상한에 닿은 것이다. 조용히 끝내면 방금 쓴 글이 어디로 갔는지 알 수 없다.
      flash(
        `장면이 ${NARRATIVE_SCENE_MAX}개라 평가 자리를 만들지 못했습니다. 장면을 하나 지워 주세요`,
      );
      return null;
    } catch (err) {
      fail(err);
      return null;
    }
  };

  /**
   * 카드를 장면에 놓기 — **근거 먼저, 장면 나중**. 소유를 못 얻은 카드는 장면에 넣지 않고 말한다.
   * ★거울 카드(아직 저장 안 된 원본)는 먼저 근거로 만들어야 한다. 그 길은 보드와 같은 `sendTo` 다.
   */
  const placeInScene = async (
    threadId: string,
    rawSceneId: string,
    ids: readonly string[],
    index?: number,
  ): Promise<boolean> => {
    return history.run('장면에 근거 놓기', async () => {
      if (!student || placingRef.current) return false;
      placingRef.current = true;
      setPlacing(true);
      try {
        const sceneId = await materializeScene(threadId, rawSceneId);
        if (sceneId === null) return false;
        const { savedIds, mirrorCands } = splitSelection(ids);
        const resolvedIds = [...savedIds];
        for (const candidate of mirrorCands)
          resolvedIds.push(await addEvidence(mirrorAddInput(candidate)));
        ids = [...new Set(resolvedIds)];
        if (ids.length === 0) return false;

        const r = await placeEvidenceInScene({
          threadId,
          studentRef: student.studentRef,
          sceneId,
          evidenceIds: ids,
          ...(index === undefined ? {} : { index }),
        });
        setSelectedIds([]);
        if (r.skippedIds.length > 0) {
          flash(`근거 ${r.skippedIds.length}건은 옮기지 못했습니다. 새로 고친 뒤 다시 해 주세요`);
          return false;
        }
        const placedIds = r.placedIds;
        flash(`근거 ${placedIds.length}건을 장면에 놓았습니다`);
        return placedIds.length > 0;
      } catch (err) {
        fail(err);
        return false;
      } finally {
        placingRef.current = false;
        setPlacing(false);
      }
    });
  };

  /** 근거 하나가 놓기 직전에 있던 자리. `lanes` 는 이 학생의 주제 전부를 들고 있다. */

  /** 놓은 근거를 원래 자리로 — 같은 자리끼리 묶어 저장 횟수를 줄인다. */

  /** 장면에서만 빼기 — 주제 소속은 그대로 둔다("아직 안 놓음"으로). */
  const detachToUnplaced = async (threadId: string, ids: readonly string[]): Promise<void> => {
    return history.run('장면 배치 해제', async () => {
      const real = ids.filter((id) => !isMirrorId(id));
      if (real.length === 0) return;
      await detachFromScenes(threadId, real);
      setUnplacedOpen(true);
      setSelectedIds([]);
      flash(`근거 ${real.length}건을 장면에서 뺐습니다. 주제에는 그대로 있습니다`);
    });
  };

  /** 뼈대 깔기 — 놓여 있던 근거는 "아직 안 놓음"으로 돌아간다(지워지지 않는다). */
  const layScaffold = async (threadId: string, scaffold: RecordScaffold): Promise<void> => {
    return history.run('뼈대 적용', async () => {
      // ★깔기 직전 장면 배열을 찍어 둔다 — 메모·배치·id 그대로. [되돌리기]가 이것을 통째로 돌려놓는다.

      try {
        await applyScaffold(threadId, scaffold);
        await updateSettings({
          recordAreaScaffolds: { ...(savedAreaScaffolds ?? {}), [scaffoldAreaKey]: scaffold.id },
        });
        setScaffoldOpen(false);
        flash(`「${scaffold.name}」 뼈대를 깔았습니다. 놓여 있던 근거는 '자리 미정'에 있습니다`);
      } catch (err) {
        fail(err);
      }
    });
  };

  /**
   * [날짜순으로 줄기 하나 만들기] — 새 주제 + 기본 뼈대 + 안 엮인 근거를 **날짜순 그대로** 깐다.
   * ★요청서와의 차이는 주제 줄·주제 정보 줄뿐이다(§5-2). 자리를 손으로 하나도 안 옮겨도 초안이 나온다.
   */
  const createThreadFromDates = async (): Promise<void> => {
    return history.run('날짜순 정리', async () => {
      if (!student) return;
      const ids = unclassified.filter((e) => !isMirrorId(e.id)).map((e) => e.id);
      if (ids.length === 0) {
        flash('주제 미정 근거가 없습니다');
        return;
      }
      try {
        const title = `${student.name} 학생의 흐름`;
        const threadId = await addThread({
          studentRef: student.studentRef,
          title,
          keywords: [],
          ...(classId !== undefined ? { classId } : {}),
        });
        // 뼈대는 이 영역에서 **마지막으로 고른 것** — 학생마다 다시 깔지 않게(100명 × 3클릭). 고른 적이 없으면 기본.
        const remembered = scaffoldChoices(builtInScaffolds(), savedScaffolds ?? [], frame).find(
          (sc) => sc.id === selectedScaffoldId,
        );
        await applyScaffold(
          threadId,
          remembered ?? {
            id: 'builtin:legacyInquiry',
            name: '기본',
            frame,
            scenes: defaultScaffoldScenes(),
            builtIn: true,
          },
        );
        // 근거는 주제로만 보낸다 — 어느 장면에 놓을지는 선생님이 정한다("아직 안 놓음"에서 시작).
        await sendTo(threadId, ids);
        flash(`주제를 만들고 근거 ${ids.length}건을 날짜순으로 담았습니다`);
      } catch (err) {
        fail(err);
      }
    });
  };

  /** 줄기 하나가 쓰는 동작 묶음. 줄기마다 새로 만든다(부모가 id 를 알고 있어야 하므로). */
  /**
   * 주제 차례 ↑↓ — 이어진 묶음은 맨 앞 주제를 옮기면 뒤 주제들이 따라온다(뒤 주제는 앞 주제 바로 아래에 붙으므로).
   * 같은 상태(열림/닫힘)의 맨 앞 주제끼리 자리를 바꾸고, 이 학생의 맨 앞 주제 전부에 차례를 새로 적는다.
   * ★옮긴 뒤 포커스를 옮겨진 주제의 같은 단추에 둔다 — 키보드로 계속 누를 수 있게. 끝에 닿아 잠겼으면 반대 단추로.
   */
  const moveLane = (threadId: string, dir: -1 | 1): void => {
    const roots = lanes.filter((l) => l.linkFrom === undefined).map((l) => l.thread);
    const me = roots.find((t) => t.id === threadId);
    if (me === undefined) return;
    const peers = roots.filter((t) => t.status === me.status);
    const i = peers.findIndex((t) => t.id === threadId);
    const j = i + dir;
    const a = peers[i];
    const b = peers[j];
    if (a === undefined || b === undefined) return;
    const swapped = [...peers];
    swapped[i] = b;
    swapped[j] = a;
    const others = roots.filter((t) => t.status !== me.status);
    const ids = (me.status === 'open' ? [...swapped, ...others] : [...others, ...swapped]).map(
      (t) => t.id,
    );
    reorderThreads(ids)
      .then(() => {
        requestAnimationFrame(() => {
          const pick = (d: 'up' | 'down') =>
            document.querySelector<HTMLButtonElement>(
              `[data-thread-id="${threadId}"] [data-lane-move="${d}"]`,
            );
          const same = pick(dir < 0 ? 'up' : 'down');
          const target = same !== null && !same.disabled ? same : pick(dir < 0 ? 'down' : 'up');
          target?.focus({ preventScroll: true });
          target?.closest('section')?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
        });
      })
      .catch(fail);
  };

  // ── 근거 지도 동작(ADR-106) ────────────────────────────────
  /** 카드를 눌렀다 — 선택을 토글하고 오른쪽 상세를 이 카드로. 장면·주제 편집은 닫힌다(보조 공간은 하나). */
  const selectMapNode = (id: string): void => {
    if (focusedId !== id && !canLeaveMapEditor()) return;
    setUnplacedOpen(false);
    setFocusedId(id);
    setMapPick(null);
  };
  /** 장면 열 머리·장면 이음 라벨·주제 제목·주제 이음 라벨을 눌렀다 — 같은 것을 다시 누르면 닫힌다(토글). */
  const pickOnMap = (next: NonNullable<typeof mapPick>): void => {
    if (!canLeaveMapEditor()) return;
    setUnplacedOpen(false);
    setMapPick((prev) =>
      prev !== null &&
      prev.kind === next.kind &&
      prev.threadId === next.threadId &&
      ('sceneId' in prev ? prev.sceneId : null) === ('sceneId' in next ? next.sceneId : null)
        ? null
        : next,
    );
    setFocusedId(null);
  };
  /** 묶음 머리 [뼈대 깔기]·주제 상세 [뼈대 고르기] — 도구줄 아래 인라인 뼈대 칸을 그 주제로 연다. */
  const openScaffoldFor = (threadId: string): void => {
    setScaffoldThreadId(threadId);
    setScaffoldOpen(true);
  };
  /** [고른 근거 N건으로 초안 쓰기]의 재료 — 저장된 카드만(거울은 아직 근거가 아니다). */
  const pickedForDraft = selectedIds.filter((id) => !isMirrorId(id));
  const writeDraftFromMap = (): void => {
    if (onWriteDraft === undefined) return;
    if (pickedForDraft.length > 0) {
      const mirrors = selectedIds.length - pickedForDraft.length;
      if (mirrors > 0) flash(`아직 근거로 저장되지 않은 원본 ${mirrors}건은 빼고 보냅니다`);
      onWriteDraft({ kind: 'selection', evidenceIds: pickedForDraft });
      return;
    }
    onWriteDraft({ kind: 'all' });
  };
  /** 오른쪽 보조 공간에 들 것 — 연결이 골라져 있으면 연결, 아니면 상세 카드, 둘 다 없으면 닫힘. */
  const mapSideContent = (): EvidenceMapSideContent | null => {
    if (viewMode !== 'map' || !student) return null;
    if (mapPick !== null) {
      const lane = lanes.find((l) => l.thread.id === mapPick.threadId);
      if (lane !== undefined) {
        const t = lane.thread;
        const locked = t.status === 'closed';
        if (mapPick.kind === 'sceneLink') {
          const index = lane.resolved.scenes.findIndex((x) => x.scene.id === mapPick.sceneId);
          const rs = lane.resolved.scenes[index];
          const prev = index > 0 ? lane.resolved.scenes[index - 1] : undefined;
          if (rs !== undefined && prev !== undefined) {
            const from = sceneHeadParts(frame, prev.scene);
            const to = sceneHeadParts(frame, rs.scene);
            return {
              kind: 'sceneLink',
              threadId: t.id,
              scene: rs.scene,
              fromHead: from.detail === null ? from.slot : `${from.slot}: ${from.detail}`,
              toHead: to.detail === null ? to.slot : `${to.slot}: ${to.detail}`,
              leadIn: rs.scene.leadIn ?? '',
              locked,
            };
          }
        } else if (mapPick.kind === 'scene') {
          const index = lane.resolved.scenes.findIndex((x) => x.scene.id === mapPick.sceneId);
          const rs = lane.resolved.scenes[index];
          if (rs !== undefined) {
            const { slot, detail } = sceneHeadParts(frame, rs.scene);
            return {
              kind: 'scene',
              threadId: t.id,
              threadTitle: t.title,
              scene: rs.scene,
              virtual: rs.virtual === true,
              slot,
              detail,
              index,
              count: lane.resolved.scenes.length,
              items: rs.evidences,
              unplaced: lane.resolved.unplaced,
              locked,
            };
          }
        } else if (mapPick.kind === 'thread') {
          return {
            kind: 'thread',
            thread: t,
            evidenceCount: lane.resolved.placedCount + lane.resolved.unplaced.length,
            sceneCount: lane.resolved.scenes.filter((x) => x.virtual !== true).length,
            unplacedCount: lane.resolved.unplaced.length,
            others: studentThreads
              .filter((o) => o.id !== t.id)
              .map((o) => ({ id: o.id, title: o.title })),
            chainLength: lane.chainLength,
            locked,
          };
        } else if (lane.linkFrom !== undefined) {
          return {
            kind: 'threadLink',
            thread: t,
            fromTitle: lane.linkFrom.thread.title,
            note: lane.linkFrom.note ?? '',
          };
        }
      }
    }
    if (focusedId !== null) {
      const ev =
        studentEvidence.find((e) => e.id === focusedId) ??
        mirrorCards.find((e) => e.id === focusedId);
      if (ev !== undefined) {
        return {
          kind: 'node',
          evidenceId: ev.id,
          card: renderCard(ev, !isClassified(ev, threadIdSet), false),
          mirror: isMirrorId(ev.id),
        };
      }
    }
    return null;
  };
  /** [AI로 정리 제안 ▾] — 묶기·배치를 한 입구에서. 추가 요청은 주제 상세(제목 누르기)의 [AI 장면 배치 제안] 옆 칸에 있다. */
  const organizeMenu = (): ReactElement | null => {
    if (!organizeOpen || !organizeBtnRef.current) return null;
    const rect = organizeBtnRef.current.getBoundingClientRect();
    const item =
      'flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-xs text-sp-text hover:bg-sp-surface disabled:opacity-40';
    const pending = unclassified.length;
    return createPortal(
      <div
        data-sp-floating
        role="menu"
        aria-label="AI로 정리 제안"
        className="fixed z-sp-dropdown w-72 rounded-xl border border-sp-border bg-sp-card py-1 shadow-xl"
        style={{ top: rect.bottom + 4, left: Math.max(8, rect.right - 288) }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOrganizeOpen(false);
        }}
      >
        <button
          type="button"
          role="menuitem"
          disabled={pending === 0}
          onClick={() => {
            setOrganizeOpen(false);
            void runSuggest();
          }}
          className={item}
        >
          <span className="font-medium">주제 미정 근거 {pending}건을 주제로 묶기</span>
          <span className="text-sp-muted">
            어느 주제에 넣을지 점선으로 제안합니다. 적용 전에는 저장되지 않아요.
          </span>
        </button>
        {/* 주제마다 장면 배치 — 내 AI 가 연결돼 있고 근거가 있는 열린 주제만. 추가 요청은 주제 상세(제목 누르기)에 있다. */}
        {runProvider !== null && openLanes.length > 0 && (
          <div role="separator" className="my-1 border-t border-sp-border" />
        )}
        {runProvider !== null &&
          openLanes.map((lane) => {
            const n = lane.resolved.placedCount + lane.resolved.unplaced.length;
            return (
              <button
                key={lane.thread.id}
                type="button"
                role="menuitem"
                disabled={n === 0}
                onClick={() => {
                  setOrganizeOpen(false);
                  void runNarrativeSuggest(lane.thread.id);
                }}
                className={item}
              >
                <span className="font-medium">‘{lane.thread.title}’의 장면 배치 제안</span>
                <span className="text-sp-muted">
                  근거 {n}건을 읽고 어느 장면에 놓을지 점선으로 제안합니다. 적용 전에는 저장되지
                  않아요.
                </span>
              </button>
            );
          })}
        {runProvider === null && (
          <p className="px-3 py-2 text-xs text-sp-muted">
            장면 배치 제안은 설정 &gt; AI 연결에서 내 AI 를 연결하면 쓸 수 있습니다.
          </p>
        )}
        {runProvider !== null && (
          <>
            <div role="separator" className="my-1 border-t border-sp-border" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOrganizeOpen(false);
                openBatchPanel(
                  `${context}:${classId ?? 'homeroom'}:${singleArea ?? areaFilter ?? 'all'}`,
                  student?.studentRef ?? null,
                  singleArea ?? areaFilter,
                );
              }}
              className={item}
            >
              <span className="font-medium">여러 학생의 지도 제안…</span>
              <span className="text-sp-muted">
                대상 학생, 확인 간격, 뼈대를 고르고 차례대로 제안받습니다.
              </span>
            </button>
          </>
        )}
      </div>,
      rootRef.current ?? document.body,
    );
  };

  const laneHandlers = (threadId: string) => ({
    onToggleCollapsed: () =>
      setCollapsedLanes((prev) =>
        prev.includes(threadId) ? prev.filter((x) => x !== threadId) : [...prev, threadId],
      ),
    onSceneEditingChange: (sceneId: string, editing: boolean) => {
      if (editing) editingScenesRef.current.add(sceneId);
      else editingScenesRef.current.delete(sceneId);
    },
    onRename: (title: string) => {
      updateThread(threadId, { title })
        .then(() => flash(`주제 이름을 ‘${title}’로 바꿨습니다`))
        .catch(fail);
    },
    onOpenLinkPicker: () => setLinkPickerFor(threadId),
    onDraftFromThread: () => onWriteDraft?.({ kind: 'thread', threadId, chain: false }),
    onDraftFromChain: () => onWriteDraft?.({ kind: 'thread', threadId, chain: true }),
    onOpenMore: () => setOpenThreadId(threadId),
    onMoveLane: (dir: -1 | 1) => moveLane(threadId, dir),
    ...(runProvider === null
      ? {}
      : {
          onSuggestNarrative: (instruction?: string) =>
            void runNarrativeSuggest(threadId, instruction),
        }),
    onAddScene: (at?: number) => {
      // 새 장면의 기본 자리는 과정이다 — 가장 많이 쓰는 자리이고, 바로 [바꾸기]로 고칠 수 있다.
      addScene(threadId, { role: 'process', moduleId: FRAME_SLOTS[frame].process[0] }, at)
        .then((sceneId) => {
          if (sceneId === null) {
            flash(`장면을 추가하지 못했습니다. 최대 ${NARRATIVE_SCENE_MAX}개까지 만들 수 있습니다`);
            return;
          }
          pickOnMap({ kind: 'scene', threadId, sceneId });
          setSceneEditFor({ threadId, sceneId });
          flash(
            at === undefined
              ? '장면을 더했습니다. 이름과 카테고리를 정해 주세요'
              : '장면을 사이에 끼웠습니다. 이름과 카테고리를 정해 주세요',
          );
        })
        .catch(fail);
    },
    onEditScene: (sceneId: string) => {
      void materializeScene(threadId, sceneId).then((real) => {
        if (real !== null) setSceneEditFor({ threadId, sceneId: real });
      });
    },
    onRemoveScene: (sceneId: string) => {
      removeScene(threadId, sceneId)
        .then(() => flash("장면을 지웠습니다. 놓여 있던 근거는 '자리 미정'에 있습니다"))
        .catch(fail);
    },
    onMoveScene: (sceneId: string, dir: -1 | 1) => {
      moveScene(threadId, sceneId, dir)
        .then(() => flash('장면을 옮겼습니다'))
        .catch(fail);
    },
    onChangeSceneNote: async (sceneId: string, note: string): Promise<void> => {
      return history.run('장면 메모 저장', async () => {
        const real = await materializeScene(threadId, sceneId);
        if (real === null) throw new Error('메모를 저장할 장면을 만들지 못했습니다');
        await setSceneNote(threadId, real, note);
      });
    },
    onAddEvidenceToScene: (sceneId: string) => {
      void materializeScene(threadId, sceneId).then((real) => {
        if (real !== null) setSceneAddFor({ threadId, sceneId: real });
      });
    },
  });

  // ── AI 서사 초안(ADR-103 §5-5) ────────────────────────────────
  /** CLI 1회 → 파서. ★여기서는 저장하지 않는다 — 결과는 화면 상태(메모리)뿐이다. */
  const runNarrativeSuggest = async (threadId: string, instruction?: string): Promise<void> => {
    if (!student || runProvider === null) return;
    const request = ++narrativeRequestRef.current;
    const api = runApi();
    if (api === null) {
      setNarrativeSuggest({ kind: 'notice', message: OWN_AI_ERROR_MESSAGES.crashed.draft });
      return;
    }
    const target = studentThreads.find((t) => t.id === threadId);
    if (target === undefined) return;
    // 장면 배열은 영역 필터를 타지 않는다 — 가려진 근거를 빼고 서사를 세우면 자리가 어긋난다.
    const mine = studentEvidence.filter((e) => e.threadId === threadId);
    if (mine.length === 0) {
      setNarrativeSuggest({
        kind: 'notice',
        message: '이 주제에 묶인 근거가 없어 세울 흐름이 없습니다.',
      });
      return;
    }
    const parentId = target.link?.fromThreadId;
    const parent =
      parentId === undefined ? undefined : studentThreads.find((t) => t.id === parentId);
    const pack = buildNarrativeSuggestPack({
      studentName: student.name,
      roster,
      frame,
      threadTitle: target.title,
      ...(target.scenes ? { currentScenes: target.scenes } : {}),
      evidences: mine.map((e) => ({
        id: e.id,
        content: e.content,
        ...(e.date !== undefined ? { date: e.date } : {}),
        ...(e.note !== undefined ? { note: e.note } : {}),
        ...(e.excludedFromAi !== undefined ? { excludedFromAi: e.excludedFromAi } : {}),
        createdAt: e.createdAt,
      })),
      ...(parent === undefined ? {} : { previousThreadTitle: parent.title }),
      ...(instruction !== undefined && instruction.trim().length > 0 ? { instruction } : {}),
    });
    if (pack.includedCount === 0) {
      setNarrativeSuggest({
        kind: 'notice',
        message: `보낼 수 있는 근거가 없습니다. ${summarizeExclusions(pack.exclusions)}`.trim(),
      });
      return;
    }
    setNarrativeSuggest({ kind: 'running', threadId });
    narrativeBaselineRef.current = narrativeFingerprint(threadId);
    try {
      const answer = await askOnce(api, runProvider, pack.text);
      if (request !== narrativeRequestRef.current) return;
      const parsed = parseNarrativeSuggestion(answer, {
        frame,
        numbered: pack.numbered,
        mappings: pack.mappings,
      });
      if (parsed.failure !== null) {
        setNarrativeSuggest({
          kind: 'notice',
          message: parsed.reason ?? NARRATIVE_SUGGEST_FAILURE_LABELS[parsed.failure],
        });
        return;
      }
      setNarrativeSuggest({
        kind: 'ready',
        threadId,
        scenes: parsed.scenes,
        ...(parsed.linkNote === undefined ? {} : { linkNote: parsed.linkNote }),
      });
    } catch {
      if (request !== narrativeRequestRef.current) return;
      setNarrativeSuggest({ kind: 'notice', message: OWN_AI_ERROR_MESSAGES.crashed.draft });
    }
  };

  /**
   * [이 서사 적용] — 근거 파일 1회 + 주제 파일 1회. 이유 문장은 장면 메모로 저장된다.
   * ★이음말은 **앞 주제가 있을 때만** 저장한다. 없는 연결에 말만 붙일 수는 없다.
   */
  const applyNarrativeSuggest = async (): Promise<void> => {
    return history.run('AI 장면 적용', async () => {
      if (narrativeSuggest.kind !== 'ready' || !student) return;
      const { threadId, scenes, linkNote } = narrativeSuggest;
      const target = studentThreads.find((t) => t.id === threadId);
      if (target === undefined || target.status === 'closed') return;
      if (narrativeBaselineRef.current !== narrativeFingerprint(threadId)) {
        setNarrativeSuggest({
          kind: 'notice',
          message:
            '제안을 만든 뒤 근거나 장면이 바뀌었습니다. 현재 내용을 기준으로 다시 제안받아 주세요.',
        });
        return;
      }
      const request = ++narrativeRequestRef.current;
      const from = target?.link?.fromThreadId;

      setNarrativeSuggest({ kind: 'applying', threadId });
      try {
        const r = await applyNarrativeSuggestion({
          threadId,
          studentRef: student.studentRef,
          frame,
          scenes: scenes.map((sc) => ({
            role: sc.role,
            ...(sc.moduleId === undefined ? {} : { moduleId: sc.moduleId }),
            ...(sc.note === undefined ? {} : { note: sc.note }),
            ...(sc.leadIn === undefined ? {} : { leadIn: sc.leadIn }),
            evidenceIds: sc.evidenceIds,
          })),
          ...(linkNote !== undefined && from !== undefined
            ? { link: { fromThreadId: from, note: linkNote } }
            : {}),
        });
        if (request !== narrativeRequestRef.current) return;
        if (!r.applied) {
          // ★아무것도 저장되지 않았다. **제안을 지우지 않는다** — 지우면 CLI 를 한 번 더 돌려야 한다.
          setNarrativeSuggest({
            kind: 'ready',
            threadId,
            scenes,
            ...(linkNote === undefined ? {} : { linkNote }),
          });
          flash(
            '근거를 하나도 옮기지 못해 배치를 적용하지 않았습니다. 새로 고친 뒤 다시 해 주세요',
          );
          return;
        }
        setNarrativeSuggest({ kind: 'idle' });
        const skipped =
          r.skippedIds.length > 0 ? ` · ${r.skippedIds.length}건은 놓지 못했습니다` : '';
        flash(`장면을 이 배치대로 정리했습니다. 근거 ${r.placedIds.length}건${skipped}`);
      } catch (err) {
        if (request !== narrativeRequestRef.current) return;
        setNarrativeSuggest({
          kind: 'ready',
          threadId,
          scenes,
          ...(linkNote === undefined ? {} : { linkNote }),
        });
        fail(err);
      }
    });
  };

  // ── AI 분류 제안 ─────────────────────────────────────────────
  /** CLI 1회 → 파서. ★여기서는 저장하지 않는다 — 결과는 `suggest` 상태(메모리)뿐. */
  const runSuggest = async (): Promise<void> => {
    if (!student || runProvider === null) return;
    const api = runApi();
    if (api === null) {
      setSuggest({ kind: 'notice', message: OWN_AI_ERROR_MESSAGES.crashed.draft });
      return;
    }
    // 미분류 전체가 입력이다 — 저장 미분류 + 거울(영역 필터 무관). 거울은 여기서도 저장되지 않는다.
    const pending = [
      ...studentEvidence.filter((e) => !isClassified(e, threadIdSet)),
      ...mirrorCards,
    ];
    if (pending.length === 0) {
      setSuggest({ kind: 'notice', message: '미분류 근거가 없어 제안할 것이 없습니다.' });
      return;
    }
    setSuggest({ kind: 'running' });
    /** 태그 — 거울 가운데 관찰기록의 태그·누가기록의 세부 분류만(후보의 label 이 그것이다). 저장 카드는 태그를 모른다. */
    const tagsOf = (e: RecordEvidence): readonly string[] => {
      if (!isMirrorId(e.id)) return [];
      const c = mirrorBySourceId.get(e.id.slice(MIRROR_PREFIX.length));
      return c && (c.source === 'observation' || c.source === 'studentRecord') && c.label
        ? [c.label]
        : [];
    };
    const pack = buildThreadSuggestPack({
      studentName: student.name,
      roster,
      evidences: pending.map((e) => {
        const tags = tagsOf(e);
        return {
          id: e.id,
          content: e.content,
          sourceLabel: EVIDENCE_SOURCE_LABELS[e.sourceType ?? 'manual'],
          ...(tags.length > 0 ? { tags } : {}),
          ...(e.date !== undefined ? { date: e.date } : {}),
          ...(e.excludedFromAi !== undefined ? { excludedFromAi: e.excludedFromAi } : {}),
        };
      }),
      threads: openThreads.map((t) => ({ id: t.id, title: t.title, keywords: t.keywords })),
    });
    if (pack.includedCount === 0) {
      setSuggest({
        kind: 'notice',
        message: `보낼 수 있는 근거가 없습니다. ${summarizeExclusions(pack.exclusions)}`.trim(),
      });
      return;
    }
    try {
      const answer = await askOnce(api, runProvider, pack.text);
      // 답 원문은 별칭 상태다(실명 없음). 실기기에서 "왜 못 읽었나"를 볼 유일한 길이라 콘솔에도 남긴다.
      console.debug('[threadSuggest] answer', answer);
      const parsed = parseThreadSuggestions(answer, {
        numbered: pack.numbered,
        threads: openThreads,
        mappings: pack.mappings,
      });
      if (parsed.failure !== null) {
        setSuggest({
          kind: 'notice',
          message: THREAD_SUGGEST_FAILURE_LABELS[parsed.failure],
          failure: parsed.failure,
          ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
          answer,
        });
        return;
      }
      setSuggest({
        kind: 'ready',
        suggestions: parsed.suggestions,
        excluded: summarizeExclusions(pack.exclusions),
      });
    } catch (kind) {
      const k = (typeof kind === 'string' ? kind : 'crashed') as OwnAiErrorKind;
      setSuggest({ kind: 'notice', message: OWN_AI_ERROR_MESSAGES[k].draft });
    }
  };

  /** 제안 한 열 적용 — 곧 저장 관문 호출. 적용한 제안은 목록에서 뺀다. */
  const applyGhost = async (key: string): Promise<void> => {
    return history.run('AI 주제 적용', async () => {
      const g = ghosts.get(key);
      if (!g) return;
      const ids = g.items.map((e) => e.id);
      try {
        if (g.suggestion.threadId !== null) await sendTo(g.suggestion.threadId, ids);
        else await sendToNew(g.suggestion.title, ids);
        setSuggest((s) =>
          s.kind === 'ready'
            ? { ...s, suggestions: s.suggestions.filter((x) => x !== g.suggestion) }
            : s,
        );
      } catch (err) {
        fail(err);
      }
    });
  };
  const applyAllGhosts = async (): Promise<void> => {
    return history.run('AI 주제 전체 적용', async () => {
      for (const key of [...ghosts.keys()]) await applyGhost(key);
      setSuggest({ kind: 'idle' });
    });
  };

  // ── 카드 등록 · 수정 ────────────────────────────────────────
  const openAdd = (): void => {
    setCreating(null);
    const preset = singleArea ?? areaFilter;
    setForm({ id: null, content: '', areas: preset ? [preset] : [], date: todayStr() });
  };
  const openEdit = (ev: RecordEvidence): void => {
    setCreating(null);
    // 거울은 아직 영역이 없다 — 저장될 때 받을 영역을 미리 채워 둔다("전체" 필터면 폼에서 고른다).
    const areasPreset = isMirrorId(ev.id) ? mirrorAreas() : [...ev.areas];
    setForm({ id: ev.id, content: ev.content, areas: areasPreset, date: ev.date ?? '' });
  };
  const toggleFormArea = (area: RecordArea): void => {
    setForm((f) =>
      f
        ? {
            ...f,
            areas: f.areas.includes(area) ? f.areas.filter((a) => a !== area) : [...f.areas, area],
          }
        : f,
    );
  };
  const saveForm = async (): Promise<void> => {
    return history.run('근거 저장', async () => {
      if (!form || !student) return;
      const content = form.content.trim();
      if (content.length === 0 || form.areas.length === 0) return;
      try {
        if (form.id === null) {
          await addEvidence({
            studentRef: student.studentRef,
            areas: form.areas,
            content,
            sourceType: 'manual',
            ...(form.date ? { date: form.date } : {}),
            ...(classId !== undefined ? { classId } : {}),
          });
        } else if (isMirrorId(form.id)) {
          // 거울 수정 저장 = 첫 손댄 — 고친 내용으로 그 순간 근거가 된다(`add` 한 번).
          const c = mirrorBySourceId.get(form.id.slice(MIRROR_PREFIX.length));
          if (!c) return;
          await addEvidence({
            ...mirrorAddInput(c),
            areas: form.areas,
            content,
            ...(form.date ? { date: form.date } : {}),
          });
          setSelectedIds((prev) => prev.filter((x) => x !== form.id));
        } else {
          await updateEvidence(form.id, { areas: form.areas, content, date: form.date });
        }
        setForm(null);
      } catch (err) {
        fail(err);
      }
    });
  };
  /** 카드의 유형 토글 — 수정 모드 없이 즉시 반영. 마지막 하나는 뻔 수 없다(근거는 영역이 1개 이상). */
  const toggleEvidenceArea = (ev: RecordEvidence, area: RecordArea): void => {
    const next = ev.areas.includes(area) ? ev.areas.filter((a) => a !== area) : [...ev.areas, area];
    if (next.length === 0) return;
    void updateEvidence(ev.id, { areas: next });
  };

  /** 원문과 편집한 근거를 보존하고 주제·장면 배치만 해제한다. */
  const removeCard = async (ev: RecordEvidence): Promise<void> => {
    if (!canLeaveMapEditor()) return;
    if (!(await sendToUnclassified([ev.id]))) return;
    setComparingId(null);
    setFocusedId(null);
    setMapPick(null);
    setUnplacedOpen(true);
  };

  // ── 렌더 ───────────────────────────────────────────────────
  /**
   * [수정] 상세의 원본 상태 줄 — 카드보다 **더 많이** 말한다(계획 §5.3 "원본과 동일한 저장 근거").
   *
   * 카드에는 '다름'만 띄운다. 목록에 '같음'이 줄줄이 붙으면 정작 봐야 할 '다름'이 묻히기 때문이다.
   * 상세는 한 건만 보는 자리라 확인 중·실패·없음·같음까지 다 말해도 시끄럽지 않다.
   */
  const sourceStatusRow = (evidenceId: string | null): ReactElement | null => {
    if (evidenceId === null || isMirrorId(evidenceId)) return null;
    const ev = studentEvidence.find((r) => r.id === evidenceId);
    if (!ev || ev.sourceId === undefined) return null;
    const got = sourceState.lookup(ev.sourceId, ev.sourceType);
    if (got.state === 'out-of-scope') return null;
    const line = (text: string, action?: ReactElement, tone = 'text-sp-muted'): ReactElement => (
      <p
        role="status"
        aria-live="polite"
        className={`flex flex-wrap items-center gap-1.5 text-xs ${tone}`}
      >
        {text}
        {action}
      </p>
    );
    const smallBtn = (label: string, onClick: () => void, tone: string): ReactElement => (
      <button type="button" onClick={onClick} className={`${btn} ${tone}`}>
        {label}
      </button>
    );
    if (got.state === 'loading') return line('원본 확인 중');
    if (got.state === 'error') {
      return line(
        '원본을 불러오지 못했습니다',
        smallBtn('다시 시도', sourceState.retry, 'text-sp-accent'),
      );
    }
    if (got.state === 'missing') return line('원본을 찾을 수 없습니다');
    const openSource = (): void => {
      if (onRequestFlow === undefined || selectedStudentRef === null) return;
      void onRequestFlow(
        createRecordFlowIntent({
          context,
          ...(classId !== undefined ? { classId } : {}),
          studentRef: selectedStudentRef,
          mode: 'source',
          sourceId: ev.sourceId as string,
          evidenceId: ev.id,
        }),
      );
    };
    // 원본이 비었거나 출결이면 비교가 의미 없다. 원본을 직접 보라고 안내한다.
    if (got.source.blank || got.source.attendance) {
      return line(
        got.source.attendance ? '원본이 출결 기록으로 바뀌었습니다' : '원본 본문이 비어 있습니다',
        onRequestFlow !== undefined
          ? smallBtn('원본 보기', openSource, 'text-sp-muted hover:text-sp-text')
          : undefined,
        'text-amber-600',
      );
    }
    if (differsFromSource(ev)) {
      return line(
        '원본과 내용이 달라요',
        smallBtn('비교하기', () => setComparingId(ev.id), 'text-amber-600'),
        'text-amber-600',
      );
    }
    return line('원본과 내용 같음');
  };

  const renderCard = (
    ev: RecordEvidence,
    inUnclassified: boolean,
    compact = false,
  ): ReactElement => (
    <EvidenceCard
      key={ev.id}
      evidence={ev}
      selected={selectedIds.includes(ev.id)}
      showActions={viewMode === 'map' && focusedId === ev.id}
      onNoteEditingChange={(editing) => {
        const key = `evidence:${ev.id}`;
        if (editing) editingScenesRef.current.add(key);
        else editingScenesRef.current.delete(key);
      }}
      areas={areas}
      compact={compact}
      // 거울 카드는 아직 저장된 근거가 아니라 메모를 붙일 자리가 없다(붙일 곳은 원본이 아니다).
      {...(isMirrorId(ev.id)
        ? {}
        : {
            onChangeNote: async (note: string) => {
              await setEvidenceNote(ev.id, note);
              flash(note.length > 0 ? '메모를 남겼습니다' : '메모를 지웠습니다');
            },
          })}
      // "이것도 이 주제?" — 미분류 카드에만, 주제 키워드가 본문에 있을 때만(문자열 검사, AI 없음). 칩 1~2개.
      alsoHits={inUnclassified ? suggestThreadsForEvidence(ev, studentThreads).slice(0, 2) : []}
      onToggleSelect={() => toggleSelect(ev.id)}
      mirror={isMirrorId(ev.id)}
      onToggleArea={(area) => toggleEvidenceArea(ev, area)}
      onEdit={() => openEdit(ev)}
      onRemove={() => void removeCard(ev)}
      onSetExcludedFromAi={(excluded) => void setCardExcluded(ev, excluded)}
      onSendTo={(threadId) => void sendTo(threadId, [ev.id])}
      // 다를 때만 배지가 뜬다. '같음'은 카드가 아니라 [수정] 상세에서만 말한다(계획 §5.3).
      differsFromSource={differsFromSource(ev)}
      onCompareSource={() => setComparingId(ev.id)}
      {...(onRequestFlow !== undefined && ev.sourceId !== undefined && selectedStudentRef !== null
        ? {
            onOpenSource: () => {
              void onRequestFlow(
                createRecordFlowIntent({
                  context,
                  ...(classId !== undefined ? { classId } : {}),
                  studentRef: selectedStudentRef,
                  mode: 'source',
                  sourceId: ev.sourceId as string,
                  evidenceId: ev.id,
                }),
              );
            },
          }
        : {})}
    />
  );

  /** 지도의 오른쪽 보조 공간 내용 — `renderCard` 뒤에서 계산한다(카드를 그려 넣으므로). */
  const mapSide = mapSideContent();

  /** AI 장면 배치 제안(점선) — 흐름·지도가 같은 것을 그린다. 적용 전에는 저장되지 않는다. */
  const renderNarrativeGhost = (threadId: string): ReactElement | null => {
    if (narrativeSuggest.kind === 'running' && narrativeSuggest.threadId === threadId) {
      return (
        <p role="status" aria-live="polite" className="px-1 py-2 text-xs text-sp-muted">
          AI 가 이 주제의 근거를 읽고 있습니다… 답이 오면 점선으로 보여 드립니다(저장되지 않습니다).
        </p>
      );
    }
    const ready =
      (narrativeSuggest.kind === 'ready' || narrativeSuggest.kind === 'applying') &&
      narrativeSuggest.threadId === threadId
        ? narrativeSuggest
        : null;
    if (ready === null) return null;
    if (ready.kind === 'applying') {
      return (
        <p role="status" className="px-1 py-2 text-xs text-sp-muted">
          적용하는 중…
        </p>
      );
    }
    const title = studentThreads.find((t) => t.id === threadId)?.title ?? '주제';
    return (
      <NarrativeSuggestGhost
        frame={frame}
        threadTitle={title}
        scenes={ready.scenes}
        {...(ready.linkNote === undefined ? {} : { linkNote: ready.linkNote })}
        contentOf={(id) =>
          studentEvidence.find((e) => e.id === id)?.content ?? '(찾을 수 없는 근거)'
        }
        onApply={() => void applyNarrativeSuggest()}
        onDismiss={() => setNarrativeSuggest({ kind: 'idle' })}
      />
    );
  };

  const renderGhosts = (key: string): ReactElement | null => {
    const g = ghosts.get(key);
    if (!g) return null;
    return (
      <div
        className="flex flex-col gap-1.5 rounded-xl p-1.5 outline-dashed outline-1 outline-blue-500/40"
        aria-label={`AI 제안 ${g.items.length}건`}
      >
        <div className="flex items-center gap-1 px-1">
          <span className="material-symbols-outlined text-sm text-sp-accent">auto_awesome</span>
          <span className="text-xs font-semibold text-sp-accent">AI 제안 {g.items.length}건</span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => void applyGhost(key)}
            className="rounded-lg bg-sp-accent px-2 py-0.5 text-xs font-semibold text-sp-accent-fg hover:opacity-90"
          >
            이 열 적용
          </button>
        </div>
        {g.items.map((e) => (
          <div
            key={e.id}
            className="rounded-xl border border-dashed border-sp-border bg-sp-card px-3 py-2 opacity-80"
          >
            <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed text-sp-text">
              {e.content}
            </p>
            <p className="mt-1 text-xs text-sp-muted">{shortDate(e.date)}</p>
          </div>
        ))}
      </div>
    );
  };

  const renderColumn = (
    key: string,
    title: string,
    items: readonly RecordEvidence[],
    empty: ReactNode,
    thread?: InquiryThread,
  ): ReactElement => (
    <EvidenceColumn
      key={key}
      title={title}
      items={items}
      empty={empty}
      {...(thread !== undefined ? { thread } : {})}
      wide={thread === undefined}
      collapsed={thread !== undefined && !expandedClosed.includes(thread.id)}
      ghost={thread ? renderGhosts(thread.id) : null}
      renderCard={(e) => renderCard(e, thread === undefined)}
      onToggleCollapsed={() => {
        if (!thread) return;
        setExpandedClosed((prev) =>
          prev.includes(thread.id) ? prev.filter((x) => x !== thread.id) : [...prev, thread.id],
        );
      }}
      onOpenThread={() => {
        if (thread) setOpenThreadId(thread.id);
      }}
      onToggleStatus={() => {
        if (thread)
          void updateThread(thread.id, { status: thread.status === 'closed' ? 'open' : 'closed' });
      }}
      onRename={(title) => {
        if (!thread) return;
        updateThread(thread.id, { title })
          .then(() => flash(`주제 이름을 ‘${title}’로 바꿨습니다`))
          .catch(fail);
      }}
      {...(onRequestFlow !== undefined && thread !== undefined && selectedStudentRef !== null
        ? {
            onComposeObservation: () => {
              // 빈 본문으로 연다. 기존 글을 복사하지 않는다(계획 §4.3).
              void onRequestFlow(
                createRecordFlowIntent({
                  context,
                  ...(classId !== undefined ? { classId } : {}),
                  studentRef: selectedStudentRef,
                  mode: 'compose',
                  threadId: thread.id,
                }),
              );
            },
          }
        : {})}
    />
  );

  /** 미분류 빈 열 — 안내가 아니라 초대. 문장 하나, 단추 둘(설계서 §5-f). */
  const unclassifiedEmpty: ReactNode =
    areaFilter === null ? (
      <>
        <p className="leading-relaxed">
          아직 기록이 없습니다. 관찰 기록을 남기면 여기에 저절로 모입니다.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <button type="button" onClick={openAdd} className={`${btn} bg-sp-card text-sp-text`}>
            근거 직접 입력
          </button>
          <button
            type="button"
            onClick={() => setImporting({ downloadOnOpen: false })}
            className={`${btn} bg-sp-card text-sp-text`}
          >
            엑셀로 한 번에
          </button>
        </div>
      </>
    ) : (
      '이 영역의 미분류 근거가 없습니다.'
    );

  /** 새 주제 고스트 열 — 기존 주제와 이름이 다른 제안. */
  const newGhostKeys = [...ghosts.keys()].filter((k) => k.startsWith('new:'));

  /**
   * 새 주제 이름 입력 팽오버(포털) — 누른 단추 위에 뜸다(설계서 §5-e).
   * 예전에는 맨 오른쪽 열 안에서 열려 주제가 4개 이상이면 화면 밖이었다. 유리 패널 대비로 body 에 붙인다.
   */
  const createPopover = (): ReactElement | null => {
    if (!creating || !student) return null;
    const a = creating.anchor;
    const width = 384;
    const left =
      a === null
        ? Math.max(8, (window.innerWidth - width) / 2)
        : Math.max(8, Math.min(a.left, window.innerWidth - width - 8));
    // 화면 위쪽 단추(도구 줄의 [+ 주제])에서 열면 아래로, 아래쪽(하단 바·보드 열 끝)에서 열면 위로 띄운다.
    const style =
      a === null
        ? { left, bottom: 16 }
        : a.top < window.innerHeight / 2
          ? { left, top: a.bottom + 8 }
          : { left, bottom: Math.max(8, window.innerHeight - a.top + 8) };
    const datable = unclassified.filter((e) => !isMirrorId(e.id)).length;
    return createPortal(
      <div
        data-sp-floating
        data-create-popover
        role="dialog"
        aria-label={creating.forSelection ? '고른 근거를 보낼 새 주제' : '새 주제'}
        className="fixed z-sp-dropdown w-96 max-w-[calc(100vw-1rem)] rounded-xl border border-sp-border bg-sp-card p-2 shadow-xl"
        style={style}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setCreating(null);
        }}
      >
        <InquiryThreadCreate
          sources={titleSources}
          existingTitles={studentThreads.map((t) => t.title)}
          onCreate={(title) => void createThread(title)}
          onCancel={() => setCreating(null)}
        />
        {/* 빈 주제 대신 — 주제 미정 근거를 날짜순으로 담은 주제 하나를 바로 만든다(뼈대는 이 영역에서 마지막에 고른 것). */}
        {!creating.forSelection && viewMode !== 'board' && datable > 0 && (
          <div className="mt-2 border-t border-sp-border pt-2">
            <button
              type="button"
              onClick={() => {
                setCreating(null);
                void createThreadFromDates();
              }}
              className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-sp-text hover:bg-sp-surface"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-sm text-sp-muted">
                event_note
              </span>
              주제 미정 근거 {datable}건을 날짜순으로 담아 새 주제 만들기
            </button>
          </div>
        )}
      </div>,
      rootRef.current ?? document.body,
    );
  };

  /** 하단 가운데 토스트(포털) — 도구줄에 끼어들지 않는다(설계서 §5-d). [되돌리기] 같은 단추 하나를 실을 수 있다. */
  const toastView = (): ReactElement | null => {
    if (toast === null) return null;
    return createPortal(
      <div
        data-sp-floating
        role="status"
        aria-live="polite"
        aria-label="알림"
        className="fixed bottom-6 left-1/2 z-sp-toast flex -translate-x-1/2 items-center gap-3 rounded-xl border border-sp-border bg-sp-card px-4 py-2 text-xs font-medium text-sp-text shadow-xl"
      >
        <span>{toast.text}</span>
        {toast.action && (
          <button
            type="button"
            onClick={toast.action.onClick}
            className="rounded-lg px-2 py-0.5 text-xs font-semibold text-sp-accent ring-1 ring-blue-500/30 transition-colors hover:bg-blue-500/10"
          >
            {toast.action.label}
          </button>
        )}
        <button
          type="button"
          onClick={closeToast}
          aria-label="알림 닫기"
          className="rounded-lg p-0.5 text-sp-muted hover:text-sp-text"
        >
          <span className="material-symbols-outlined text-sm">close</span>
        </button>
      </div>,
      rootRef.current ?? document.body,
    );
  };

  /**
   * 엑셀 메뉴(포털) — 유리 패널 안에서 띄우면 배경이 지워지므로 body 에 붙인다.
   * 예전의 출처 5종 메뉴는 없다 — 그 기록들은 거울 카드로 미분류에 저절로 보인다(설계서 §4-1).
   */
  const importMenu = (): ReactElement | null => {
    if (!importMenuOpen || !importBtnRef.current) return null;
    const rect = importBtnRef.current.getBoundingClientRect();
    const item =
      'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-medium text-sp-text hover:bg-sp-surface';
    return createPortal(
      <div
        data-sp-floating
        data-import-menu
        role="menu"
        aria-label="근거 더하기"
        className="fixed z-sp-dropdown min-w-[180px] rounded-xl border border-sp-border bg-sp-card py-1 shadow-xl"
        style={{ top: rect.bottom + 4, left: rect.left }}
      >
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setImportMenuOpen(false);
            openAdd();
          }}
          className={item}
        >
          <span className="material-symbols-outlined text-sm text-sp-muted">edit</span>직접 입력
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setImporting({ downloadOnOpen: true });
            setImportMenuOpen(false);
          }}
          className={item}
        >
          <span className="material-symbols-outlined text-sm text-sp-muted">download</span>엑셀 양식
          받기
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setImporting({ downloadOnOpen: false });
            setImportMenuOpen(false);
          }}
          className={item}
        >
          <span className="material-symbols-outlined text-sm text-sp-muted">upload_file</span>엑셀
          업로드
        </button>
      </div>,
      rootRef.current ?? document.body,
    );
  };

  /**
   * 장면 열의 작은 고르개 셋 — 앞 주제 잇기 · 장면 카테고리 · 장면에 근거 넣기.
   *
   * ★`createPortal` 로 **body 에** 붙인다. 유리 패널 안에서 띄우면 `backdrop-filter` 가
   *   화면 고정 요소를 가둬 판이 패널 안에 갇힌다(실제 사고).
   */
  const renderFlowPickers = (): ReactNode => {
    if (!student) return null;
    const shell = (title: string, close: () => void, body: ReactNode): ReactElement =>
      createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            data-sp-floating
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="flex max-h-[70vh] w-full max-w-md flex-col gap-2 rounded-xl bg-sp-card p-4 shadow-xl ring-1 ring-sp-border"
          >
            <div className="flex items-center gap-2">
              <h3 className="flex-1 text-sm font-bold text-sp-text">{title}</h3>
              <button
                type="button"
                onClick={close}
                aria-label="닫기"
                className="rounded-lg p-1 text-sp-muted hover:bg-sp-surface hover:text-sp-text"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-base">
                  close
                </span>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
          </div>
        </div>,
        rootRef.current ?? document.body,
      );

    if (linkPickerFor !== null) {
      const me = studentThreads.find((t) => t.id === linkPickerFor);
      const others = studentThreads.filter((t) => t.id !== linkPickerFor);
      return shell(
        '앞 주제와 잇기',
        () => setLinkPickerFor(null),
        <div className="flex flex-col gap-1.5">
          <p className="text-xs leading-relaxed text-sp-muted">
            이 주제가 어느 주제에서 이어졌는지 고릅니다. 이음말은 화살표에서 자유롭게 적습니다.
          </p>
          {others.length === 0 ? (
            <p className="py-4 text-center text-xs text-sp-muted">이을 다른 주제가 없습니다.</p>
          ) : (
            others.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setLink(linkPickerFor, { fromThreadId: t.id })
                    .then(() => {
                      setLinkPickerFor(null);
                      flash(`‘${t.title}’에서 이어지는 주제로 두었습니다`);
                    })
                    .catch(() =>
                      flash('서로를 가리키는 연결은 만들 수 없습니다. 다른 주제를 골라 주세요'),
                    );
                }}
                className={`rounded-lg px-3 py-2 text-left text-sm ring-1 transition-colors hover:bg-sp-surface ${
                  me?.link?.fromThreadId === t.id
                    ? 'bg-sp-surface text-sp-text ring-sp-accent'
                    : 'text-sp-text ring-sp-border'
                }`}
              >
                {t.title}
              </button>
            ))
          )}
          {me?.link !== undefined && (
            <button
              type="button"
              onClick={() => {
                setLink(linkPickerFor, null)
                  .then(() => {
                    setLinkPickerFor(null);
                    flash('연결을 끊었습니다');
                  })
                  .catch(fail);
              }}
              className="mt-1 self-start rounded-lg px-2.5 py-1 text-xs font-medium text-red-500 ring-1 ring-red-500/20 hover:bg-red-500/10"
            >
              연결 끊기
            </button>
          )}
        </div>,
      );
    }

    if (sceneEditFor !== null) {
      const lane = lanes.find((l) => l.thread.id === sceneEditFor.threadId);
      const found = lane?.resolved.scenes.find((x) => x.scene.id === sceneEditFor.sceneId);
      if (found === undefined) return null;
      const scene = found.scene;
      const choices: readonly RecordModuleId[] = FRAME_SLOTS[frame][scene.role];
      const close = (): void => setSceneEditFor(null);
      return shell(
        `${frameRoleLabel(frame, scene.role)} 장면 바꾸기`,
        close,
        <div className="flex flex-col gap-1.5">
          <p className="text-xs leading-relaxed text-sp-muted">
            이 자리에 놓을 수 있는 세부 카테고리입니다. 자리(색)는 바뀌지 않습니다.
          </p>
          {choices.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setSceneCategory(sceneEditFor.threadId, sceneEditFor.sceneId, {
                  moduleId: id,
                  label: null,
                })
                  .then(() => {
                    close();
                    flash(`장면을 ‘${RECORD_MODULES[id].label}’로 바꿨습니다`);
                  })
                  .catch(fail);
              }}
              className={`rounded-lg px-3 py-2 text-left ring-1 transition-colors hover:bg-sp-surface ${
                scene.moduleId === id ? 'bg-sp-surface ring-sp-accent' : 'ring-sp-border'
              }`}
            >
              <span className="text-sm font-semibold text-sp-text">{RECORD_MODULES[id].label}</span>
              <span className="mt-0.5 block text-xs leading-snug text-sp-muted">
                {RECORD_MODULES[id].purpose}
              </span>
            </button>
          ))}
          <label className="mt-2 flex flex-col gap-1 border-t border-sp-border pt-2">
            <span className="text-xs font-semibold text-sp-text">직접 이름 붙이기</span>
            <input
              defaultValue={scene.label ?? ''}
              placeholder="예: 처음 세운 가설"
              aria-label="장면 이름"
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                const v = e.currentTarget.value.trim();
                setSceneCategory(sceneEditFor.threadId, sceneEditFor.sceneId, {
                  label: v.length > 0 ? v : null,
                })
                  .then(close)
                  .catch(fail);
              }}
              className="rounded-lg border border-sp-border bg-sp-surface px-2 py-1.5 text-sm text-sp-text focus:border-sp-accent focus:outline-none"
            />
            <span className="text-xs text-sp-muted">
              적고 엔터를 누르면 그 이름이 카테고리 이름을 대신합니다.
            </span>
          </label>
        </div>,
      );
    }

    if (sceneAddFor !== null) {
      const lane = lanes.find((l) => l.thread.id === sceneAddFor.threadId);
      const close = (): void => setSceneAddFor(null);
      const pool = [...(lane?.resolved.unplaced ?? []), ...unclassified];
      return shell(
        '이 장면에 넣을 근거',
        close,
        <div className="flex flex-col gap-1.5">
          {pool.length === 0 ? (
            <p className="py-4 text-center text-xs text-sp-muted">
              미분류와 이 주제의 자리 미정에 넣을 근거가 없습니다. 지도 위 [미분류·자리 미정]에서
              전체 목록을 확인하거나 [+ 근거]로 추가하세요.
            </p>
          ) : (
            pool.map((e) => (
              <button
                key={e.id}
                disabled={placing}
                type="button"
                onClick={() => {
                  void placeInScene(sceneAddFor.threadId, sceneAddFor.sceneId, [e.id]).then(
                    (ok) => {
                      if (ok) close();
                    },
                  );
                }}
                className="rounded-lg px-3 py-2 text-left text-sm text-sp-text ring-1 ring-sp-border transition-colors hover:bg-sp-surface"
              >
                <span className="line-clamp-2">{e.content}</span>
                {e.date !== undefined && (
                  <span className="mt-0.5 block text-xs text-sp-muted">{shortDate(e.date)}</span>
                )}
              </button>
            ))
          )}
        </div>,
      );
    }
    return null;
  };
  return (
    <>
      {/* 뒷막 — 넓게 보기가 오버레이임을 눈으로 말한다. 누르면 돌아온다. */}
      {expandedWorkspace && (
        <div
          aria-hidden="true"
          data-testid="evidence-workspace-backdrop"
          onClick={() => setExpandedWorkspace(false)}
          className="fixed inset-0 z-sp-modal bg-black/60 backdrop-blur-sm"
        />
      )}
      <FocusTrap
        active={expandedWorkspace}
        focusTrapOptions={{
          escapeDeactivates: false,
          allowOutsideClick: true,
          fallbackFocus: () => rootRef.current ?? document.body,
        }}
      >
        <div
          ref={rootRef}
          aria-busy={history.busy}
          onFocusCapture={() => {
            historyActiveRef.current = true;
          }}
          onKeyDownCapture={(event) => {
            if (history.busy && event.key === 'Enter') {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
          onClickCapture={(event) => {
            if (history.busy) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
          onChangeCapture={(event) => {
            if (history.busy) event.stopPropagation();
          }}
          onPointerDownCapture={(event) => {
            if (history.busy) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
          tabIndex={-1}
          data-sp-overlay-surface={expandedWorkspace ? '' : undefined}
          data-sp-workspace-expanded={expandedWorkspace ? '' : undefined}
          className={
            expandedWorkspace
              ? 'fixed inset-4 z-sp-modal flex min-h-0 flex-col overflow-hidden rounded-xl border border-sp-border bg-sp-bg shadow-sp-lg'
              : 'flex min-h-0 min-w-0 flex-1 flex-col'
          }
        >
          {/* 상단 — 학생 선택 · 영역 필터 · [+ 근거 ▾](직접 입력·엑셀) · AI 분류 제안 */}
          {expandedWorkspace && viewMode === 'map' && (
            <div className="flex items-center justify-between border-b border-sp-border px-4 py-1.5 text-xs text-sp-muted">
              <span>
                {context === 'teaching' ? '수업 관리' : '학급 운영'} · 생기부 초안 · 근거 정리
              </span>
              <button
                type="button"
                onClick={() => setExpandedWorkspace(false)}
                className="rounded px-2 py-1 hover:bg-sp-surface hover:text-sp-text"
              >
                원래 화면으로
              </button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 border-b border-sp-border px-4 py-2">
            <button
              type="button"
              onClick={() => goStudent(-1)}
              disabled={studentIndex <= 0}
              aria-label="이전 학생"
              title="이전 학생 (Alt+←)"
              className="rounded-lg p-1 text-sp-muted ring-1 ring-sp-border hover:text-sp-text disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-base">chevron_left</span>
            </button>
            <select
              aria-label="학생 선택"
              value={student?.studentRef ?? ''}
              onChange={(e) => selectStudentSafely(e.target.value)}
              className="rounded-lg border border-sp-border bg-sp-card px-2 py-1 text-sm font-semibold text-sp-text focus:border-sp-accent focus:outline-none"
            >
              {students.length === 0 && <option value="">학생이 없습니다</option>}
              {students.map((s) => (
                <option key={s.studentRef} value={s.studentRef}>
                  {s.number}. {s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => goStudent(1)}
              disabled={studentIndex < 0 || studentIndex >= students.length - 1}
              aria-label="다음 학생"
              title="다음 학생 (Alt+→)"
              className="rounded-lg p-1 text-sp-muted ring-1 ring-sp-border hover:text-sp-text disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-base">chevron_right</span>
            </button>

            {/* 영역이 하나뿐이면 고를 것이 없으므로 줄 자체를 그리지 않는다(설계서 §5-b). */}
            {singleArea === null && (
              <div
                role="group"
                aria-label="영역 필터"
                className="ml-2 flex flex-wrap items-center gap-1"
              >
                <span className="text-xs text-sp-muted">영역</span>
                <button
                  type="button"
                  onClick={() => setAreaFilter(null)}
                  aria-pressed={areaFilter === null}
                  className={chip(areaFilter === null)}
                >
                  전체
                </button>
                {areas.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAreaFilter(a)}
                    aria-pressed={areaFilter === a}
                    aria-label={RECORD_AREA_LABELS[a]}
                    title={RECORD_AREA_LABELS[a]}
                    className={chip(areaFilter === a)}
                  >
                    {/* 보이는 글자는 짧게 — 긴 공식 이름 셋이 도구 줄을 두 줄로 밀었다. 접근 이름·툴팁은 전체 이름. */}
                    {RECORD_AREA_LABELS[a].replace(' 세부능력 및 특기사항', ' 세특')}
                  </button>
                ))}
              </div>
            )}

            {/* 보기 전환 — 지도·보드는 같은 자료의 두 보기다(ADR-106 · ADR-107). 흐름 보기는 지도에 합쳐졌다. */}
            <div role="group" aria-label="보기" className="ml-2 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setViewMode('map')}
                aria-pressed={viewMode === 'map'}
                title="근거 카드를 연결해 관계를 봅니다"
                className={chip(viewMode === 'map')}
              >
                지도
              </button>
              <button
                type="button"
                onClick={() => setViewMode('board')}
                aria-pressed={viewMode === 'board'}
                className={chip(viewMode === 'board')}
              >
                보드
              </button>
            </div>

            <div className="flex-1" />
            {viewMode !== 'map' && (
              <button
                type="button"
                aria-pressed={expandedWorkspace}
                onClick={() => setExpandedWorkspace((value) => !value)}
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-sp-text ring-1 ring-sp-border hover:bg-sp-surface"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-sm">
                  {expandedWorkspace ? 'close_fullscreen' : 'open_in_full'}
                </span>
                {expandedWorkspace ? '원래 크기로' : '넓게 보기'}
              </button>
            )}
            {viewMode === 'map' && (
              <button
                type="button"
                aria-expanded={unplacedOpen}
                onClick={() => {
                  if (canLeaveMapEditor()) setUnplacedOpen((value) => !value);
                }}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-sp-text ring-1 ring-sp-border hover:bg-sp-surface"
              >
                미분류·자리 미정 {unplacedItems.length}건
              </button>
            )}
            <div role="group" aria-label="편집 되돌리기" className="flex gap-1">
              <button
                type="button"
                disabled={!history.canUndo}
                title={`실행 취소 (Ctrl+Z)${history.undoLabel ? `: ${history.undoLabel}` : ''}`}
                onClick={() => void travelHistory('undo')}
                className="rounded-lg px-2 py-1.5 text-xs text-sp-text ring-1 ring-sp-border disabled:opacity-40"
              >
                실행 취소
              </button>
              <button
                type="button"
                disabled={!history.canRedo}
                title={`다시 실행 (Ctrl+X)${history.redoLabel ? `: ${history.redoLabel}` : ''}`}
                onClick={() => void travelHistory('redo')}
                className="rounded-lg px-2 py-1.5 text-xs text-sp-text ring-1 ring-sp-border disabled:opacity-40"
              >
                다시 실행
              </button>
            </div>
            <button
              ref={importBtnRef}
              type="button"
              onClick={() => setImportMenuOpen((v) => !v)}
              disabled={!student}
              aria-haspopup="menu"
              aria-expanded={importMenuOpen}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-sp-muted ring-1 ring-sp-border transition-colors hover:bg-sp-surface hover:text-sp-text disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-sm">add</span>근거
              <span className="material-symbols-outlined text-sm">arrow_drop_down</span>
            </button>
            {runProvider !== null && viewMode !== 'map' && (
              <button
                type="button"
                onClick={() => void runSuggest()}
                disabled={!student || suggest.kind === 'running'}
                title="주제 미정 근거를 AI 에게 보내 '이렇게 주제로 묶으면 어떨까요'를 받습니다. 적용을 누르기 전에는 아무것도 저장되지 않습니다."
                className="flex items-center gap-1 rounded-lg bg-sp-accent px-3 py-1.5 text-xs font-semibold text-sp-accent-fg transition-colors hover:opacity-90 disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-sm">auto_awesome</span>
                {suggest.kind === 'running' ? '묶는 중…' : 'AI로 주제 묶기'}
              </button>
            )}
            {/* 지도의 작업 단추는 셋뿐이다(ADR-106): [+ 근거 ▾] · [AI로 정리 제안 ▾] · [… 초안 쓰기]. 강조는 마지막 하나. */}
            {viewMode === 'map' && (
              <button
                ref={organizeBtnRef}
                type="button"
                onClick={() => setOrganizeOpen((v) => !v)}
                disabled={!student || runProvider === null || suggest.kind === 'running'}
                aria-haspopup="menu"
                aria-expanded={organizeOpen}
                title="고른 범위의 근거를 AI 에게 보내 주제 묶기·장면 배치를 제안받습니다. 적용하기 전에는 바뀌지 않아요."
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-sp-muted ring-1 ring-sp-border transition-colors hover:bg-sp-surface hover:text-sp-text disabled:opacity-40"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-sm">
                  auto_awesome
                </span>
                {suggest.kind === 'running' ? '제안 받는 중…' : 'AI로 정리 제안'}
                <span aria-hidden="true" className="material-symbols-outlined text-sm">
                  arrow_drop_down
                </span>
              </button>
            )}
            {viewMode === 'map' && onWriteDraft !== undefined && (
              <button
                type="button"
                onClick={writeDraftFromMap}
                disabled={!student || (pickedForDraft.length === 0 && visibleEvidence.length === 0)}
                title={
                  pickedForDraft.length > 0
                    ? '고른 근거만 초안 재료로 보냅니다. 초안 화면의 AI 패널이 열립니다.'
                    : '지금 보이는 근거 전부를 재료로 초안 화면의 AI 패널을 엽니다. 연결·주제를 정리하지 않아도 됩니다.'
                }
                className="flex items-center gap-1 rounded-lg bg-sp-accent px-3 py-1.5 text-xs font-semibold text-sp-accent-fg transition-colors hover:opacity-90 disabled:opacity-40"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-sm">
                  edit_note
                </span>
                {pickedForDraft.length > 0
                  ? `고른 ${pickedForDraft.length}건으로 초안 쓰기`
                  : `근거 ${visibleEvidence.length}건으로 초안 쓰기`}
              </button>
            )}
          </div>

          {/* 옛 작성 방식 → 뼈대 옮기기 결과 — 한 번만. 조용히 바꾸지 않는다. */}
          {scaffoldMigration.notices.length > 0 && (
            <div className="border-b border-sp-border px-4 py-2">
              <Notice variant="info" title="작성 방식을 뼈대로 옮겼습니다">
                <ul className="flex list-disc flex-col gap-1 pl-4">
                  {scaffoldMigration.notices.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={scaffoldMigration.dismiss}
                  className={`${btn} mt-1 text-sp-muted hover:text-sp-text`}
                >
                  알겠습니다
                </button>
              </Notice>
            </div>
          )}

          {/* 뼈대 고르기 — 팝오버가 아니라 인라인 칸이다(유리 모드가 화면 고정 요소를 가둔다). */}
          {viewMode === 'map' && scaffoldOpen && student && (
            <section
              aria-label="뼈대 고르기"
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.stopPropagation();
                  setScaffoldOpen(false);
                }
              }}
              className="max-h-80 shrink-0 overflow-y-auto border-b border-sp-border bg-sp-surface px-4 pb-3"
            >
              <div className="sticky top-0 z-10 flex items-center justify-between bg-sp-surface py-2">
                <h3 className="text-sm font-semibold text-sp-text">뼈대 고르기</h3>
                <button
                  type="button"
                  aria-label="뼈대 고르기 닫기"
                  onClick={() => setScaffoldOpen(false)}
                  className={`${btn} text-sp-muted hover:text-sp-text`}
                >
                  닫기 ×
                </button>
              </div>
              {/* 열린 주제가 둘 이상일 때만 고른다. 하나뿐이면 고를 것이 없으니 어디에 깔리는지만 적는다. */}
              {openLanes.length > 1 ? (
                <label className="mb-3 flex items-center gap-2 text-xs text-sp-text">
                  뼈대를 적용할 주제
                  <select
                    aria-label="뼈대를 적용할 주제"
                    value={scaffoldLane?.thread.id ?? ''}
                    onChange={(event) => setScaffoldThreadId(event.target.value)}
                    className="min-w-0 flex-1 rounded-lg bg-sp-card px-3 py-2 text-sp-text ring-1 ring-sp-border"
                  >
                    {openLanes.map((lane) => (
                      <option key={lane.thread.id} value={lane.thread.id}>
                        {lane.thread.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                scaffoldLane !== undefined && (
                  <p className="mb-3 text-xs text-sp-muted">
                    뼈대를 적용할 주제:{' '}
                    <span className="font-semibold text-sp-text">{scaffoldLane.thread.title}</span>
                  </p>
                )
              )}
              <ScaffoldPicker
                key={scaffoldLane?.thread.id ?? 'empty'}
                disabled={scaffoldLane === undefined}
                frame={frame}
                scaffolds={savedScaffolds ?? []}
                onScaffoldsChange={async (next) => {
                  const previous = useSettingsStore.getState().settings.recordScaffolds;
                  try {
                    await updateSettings({ recordScaffolds: next });
                  } catch (error) {
                    const current = useSettingsStore.getState().settings;
                    if (current.recordScaffolds === next) {
                      useSettingsStore.setState({
                        settings: { ...current, recordScaffolds: previous ?? [] },
                      });
                    }
                    throw error;
                  }
                }}
                {...(selectedScaffoldId === undefined ? {} : { selectedId: selectedScaffoldId })}
                {...(scaffoldLane === undefined
                  ? {}
                  : {
                      currentScenes: scaffoldLane.resolved.scenes.map((x) => ({
                        role: x.scene.role,
                        ...(x.scene.moduleId === undefined ? {} : { moduleId: x.scene.moduleId }),
                        ...(x.scene.label === undefined ? {} : { label: x.scene.label }),
                      })),
                    })}
                onApply={(sc) => {
                  const target = scaffoldLane?.thread.id;
                  if (target === undefined) {
                    flash('뼈대를 깔 주제가 없습니다. 주제를 먼저 만들어 주세요');
                    return;
                  }
                  void layScaffold(target, sc);
                }}
              />
            </section>
          )}

          {/* AI 서사 초안 안내 — 못 읽었거나 보낼 근거가 없을 때만. 성공하면 점선이 말한다. */}
          {narrativeSuggest.kind === 'notice' && (
            <div className="flex items-center gap-2 border-b border-sp-border bg-sp-surface px-4 py-1.5">
              <span role="status" aria-live="polite" className="flex-1 text-xs text-sp-muted">
                {narrativeSuggest.message}
              </span>
              <button
                type="button"
                onClick={() => setNarrativeSuggest({ kind: 'idle' })}
                className={`${btn} text-sp-muted hover:text-sp-text`}
              >
                닫기
              </button>
            </div>
          )}

          {/* AI 제안 안내 줄 — 실행 중 / 제안 있음([전체 적용]·[무시]) / 못 읽었으면 이유 한 줄 */}
          {suggest.kind === 'running' && (
            <div className="flex items-center gap-2 border-b border-sp-border bg-sp-surface px-4 py-1.5">
              <span className="material-symbols-outlined animate-spin text-sm text-sp-accent">
                progress_activity
              </span>
              <span
                role="status"
                aria-live="polite"
                aria-label="AI 주제 묶기 안내"
                className="text-xs text-sp-muted"
              >
                AI 가 주제 미정 근거를 읽고 있습니다… 답이 오면 점선 카드로 보여 드립니다(저장되지
                않습니다).
              </span>
            </div>
          )}
          {suggest.kind === 'notice' && (
            <div className="flex flex-col gap-1.5 border-b border-sp-border bg-sp-surface px-4 py-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  role="status"
                  aria-live="polite"
                  aria-label="AI 주제 묶기 안내"
                  className="text-xs text-sp-muted"
                >
                  {suggest.failure === 'none'
                    ? `AI 판단: ${suggest.reason ?? '묶을 만한 기록을 찾지 못했습니다'}. 카드를 끌어 주제로 옮기거나 [+ 새 주제로]를 눌러 직접 묶을 수 있습니다.`
                    : suggest.message}
                </span>
                <div className="flex-1" />
                {suggest.failure === 'none' && (
                  <button
                    type="button"
                    onClick={() => void runSuggest()}
                    className={`${btn} text-sp-accent hover:bg-blue-500/10`}
                  >
                    다시 제안 받기
                  </button>
                )}
                {(suggest.failure === 'no-format' || suggest.failure === 'no-valid-numbers') &&
                  suggest.answer !== undefined && (
                    <button
                      type="button"
                      onClick={() => setAnswerOpen((v) => !v)}
                      aria-expanded={answerOpen}
                      className={`${btn} text-sp-muted hover:text-sp-text`}
                    >
                      {answerOpen ? '답 원문 닫기' : '답 원문 보기'}
                    </button>
                  )}
                <button
                  type="button"
                  onClick={() => setSuggest({ kind: 'idle' })}
                  className={`${btn} text-sp-muted`}
                >
                  닫기
                </button>
              </div>
              {/* 답 원문 — 별칭 상태 그대로(［이름1］). 실명은 없다. */}
              {answerOpen && suggest.answer !== undefined && (
                <pre
                  aria-label="AI 답 원문"
                  className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-sp-card px-3 py-2 text-xs leading-relaxed text-sp-text ring-1 ring-sp-border"
                >
                  {suggest.answer}
                </pre>
              )}
            </div>
          )}
          {suggest.kind === 'ready' && (
            <div className="flex flex-wrap items-center gap-2 border-b border-sp-border bg-blue-500/10 px-4 py-1.5">
              <span className="material-symbols-outlined text-sm text-sp-accent">auto_awesome</span>
              <span
                role="status"
                aria-live="polite"
                aria-label="AI 주제 묶기 안내"
                className="text-xs font-medium text-sp-text"
              >
                {ghostCount > 0
                  ? `AI 가 ${ghostCount}건을 ${ghosts.size}개 주제로 묶자고 제안했습니다. 점선 카드는 아직 저장된 것이 아닙니다.`
                  : '제안한 근거가 모두 정리되었습니다.'}
                {suggest.excluded ? ` · ${suggest.excluded}` : ''}
              </span>
              <div className="flex-1" />
              {ghostCount > 0 && (
                <button
                  type="button"
                  onClick={() => void applyAllGhosts()}
                  className="rounded-lg bg-sp-accent px-2.5 py-1 text-xs font-semibold text-sp-accent-fg hover:opacity-90"
                >
                  전체 적용
                </button>
              )}
              <button
                type="button"
                onClick={() => setSuggest({ kind: 'idle' })}
                className={`${btn} text-sp-muted`}
              >
                무시
              </button>
            </div>
          )}

          {/* 등록/수정 폼 */}
          {form && student && (
            <div className="flex flex-col gap-2 border-b border-sp-border bg-sp-surface px-4 py-3">
              <p className="text-xs font-semibold text-sp-text">
                {form.id === null ? `${student.name} 근거 직접 입력` : '근거 수정'}
              </p>
              <textarea
                value={form.content}
                onChange={(e) => setForm((f) => (f ? { ...f, content: e.target.value } : f))}
                placeholder="이 학생의 생기부 작성 근거가 될 사실·활동·관찰을 적으세요."
                aria-label="근거 내용"
                className="min-h-[64px] w-full resize-y rounded-lg border border-sp-border bg-sp-card px-3 py-2 text-sm leading-relaxed text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none"
              />
              {sourceStatusRow(form.id)}
              <div className="flex flex-wrap items-center gap-2">
                {singleArea === null && (
                  <>
                    <span className="text-xs text-sp-muted">유형</span>
                    {areas.map((area) => (
                      <button
                        key={area}
                        type="button"
                        onClick={() => toggleFormArea(area)}
                        aria-pressed={form.areas.includes(area)}
                        className={chip(form.areas.includes(area))}
                      >
                        {RECORD_AREA_LABELS[area]}
                      </button>
                    ))}
                  </>
                )}
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => (f ? { ...f, date: e.target.value } : f))}
                  aria-label="근거 일자"
                  className="rounded-lg border border-sp-border bg-sp-card px-2 py-1 text-xs text-sp-text focus:border-sp-accent focus:outline-none"
                />
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => setForm(null)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-sp-muted hover:text-sp-text"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => void saveForm()}
                  disabled={form.content.trim().length === 0 || form.areas.length === 0}
                  className="rounded-lg bg-sp-accent px-3 py-1.5 text-xs font-semibold text-sp-accent-fg transition-colors hover:opacity-90 disabled:opacity-40"
                >
                  저장
                </button>
              </div>
            </div>
          )}

          {/* 열 — DndContext 안에서 카드를 끌어 열에 놓는다. 놓으면 하단 바와 같은 함수로 간다. */}
          {!student ? (
            <p className="py-10 text-center text-sm text-sp-muted">학생을 선택하세요.</p>
          ) : (
            <DndContext
              accessibility={DND_KO_ACCESSIBILITY}
              sensors={sensors}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragCancel={() => setDragging(null)}
            >
              {viewMode === 'map' ? (
                <div className="flex min-h-0 min-w-0 flex-1">
                  <EvidenceMapView
                    studentName={student.name}
                    scopeKey={`${context}:${classId ?? 'homeroom'}:${student.studentRef}:${areaFilter ?? 'all'}`}
                    onToggleNodeSelected={toggleSelect}
                    groups={mapGroups}
                    onConnectionEditingChange={(editing) => {
                      if (editing) editingScenesRef.current.add('connection');
                      else editingScenesRef.current.delete('connection');
                    }}
                    onConnectionChange={async (change) => {
                      return history.run('연결 변경', async () => {
                        if (change.kind !== 'focus' && !canLeaveMapEditor())
                          throw new Error('메모 편집을 유지했습니다.');
                        const store = useInquiryThreadStore.getState();
                        const target = store.records.find((t) => t.id === change.threadId);
                        if (
                          !target ||
                          target.status !== 'open' ||
                          target.studentRef !== selectedStudentRef
                        )
                          throw new Error('현재 학생의 열린 주제에서만 연결할 수 있습니다.');

                        if (
                          change.kind === 'order' &&
                          (await store.placeSceneAfter(
                            change.threadId,
                            change.anchorId,
                            change.sceneId,
                          )) === null
                        )
                          throw new Error('이미 바로 다음 장면입니다. 순서를 유지했습니다.');
                        if (change.kind === 'attach') {
                          const added = await store.attachEvidenceToScene(
                            change.threadId,
                            change.sceneId,
                            [change.evidenceId],
                          );
                          if (!added.length)
                            throw new Error('이미 연결되어 있거나 이 주제의 근거가 아닙니다.');
                        }
                        if (change.kind === 'move')
                          await store.changeEvidenceConnection(
                            change.threadId,
                            change.fromSceneId,
                            change.sceneId,
                            change.evidenceId,
                          );
                        if (change.kind === 'detach')
                          await store.detachEvidenceFromScene(change.threadId, change.sceneId, [
                            change.evidenceId,
                          ]);
                        if (change.kind === 'focus')
                          await store.setSceneEvidenceFocus(
                            change.threadId,
                            change.sceneId,
                            change.evidenceId,
                            change.note,
                          );
                        flash('연결을 저장했습니다. 바뀐 이음말은 확인해 주세요.');
                      });
                    }}
                    selectedIds={selectedIds}
                    focusedId={focusedId}
                    offsets={mapPositions.offsets}
                    zoom={mapZoom}
                    hasCustomPositions={mapPositions.hasCustom}
                    expanded={expandedWorkspace}
                    isMirror={isMirrorId}
                    differsFromSource={differsFromSource}
                    selectedSceneKey={
                      mapPick?.kind === 'scene' ? `${mapPick.threadId}:${mapPick.sceneId}` : null
                    }
                    selectedSceneLinkKey={
                      mapPick?.kind === 'sceneLink'
                        ? `${mapPick.threadId}:${mapPick.sceneId}`
                        : null
                    }
                    selectedThreadId={mapPick?.kind === 'thread' ? mapPick.threadId : null}
                    selectedThreadLinkId={mapPick?.kind === 'threadLink' ? mapPick.threadId : null}
                    onSelectNode={selectMapNode}
                    onSelectScene={(threadId, sceneId) =>
                      pickOnMap({ kind: 'scene', threadId, sceneId })
                    }
                    onSelectSceneLink={(threadId, sceneId) =>
                      pickOnMap({ kind: 'sceneLink', threadId, sceneId })
                    }
                    onSelectThread={(threadId) => pickOnMap({ kind: 'thread', threadId })}
                    onSelectThreadLink={(threadId) => pickOnMap({ kind: 'threadLink', threadId })}
                    onLayScaffold={openScaffoldFor}
                    onAddScene={(threadId) => laneHandlers(threadId).onAddScene()}
                    onOpenThread={(threadId) => setOpenThreadId(threadId)}
                    onMoveGroup={moveLane}
                    onToggleGroupCollapsed={(threadId) =>
                      setCollapsedLanes((prev) =>
                        prev.includes(threadId)
                          ? prev.filter((x) => x !== threadId)
                          : [...prev, threadId],
                      )
                    }
                    onZoom={setMapZoom}
                    onResetPositions={() => {
                      void history.run('카드 위치 정돈', async () => mapPositions.reset());
                      flash('카드 위치를 자동 배치로 되돌렸습니다');
                    }}
                    onToggleExpanded={() => setExpandedWorkspace((value) => !value)}
                    renderGhost={(key) => {
                      if (key !== 'unclassified') {
                        const grouping = renderGhosts(key);
                        const scenes = renderNarrativeGhost(key);
                        if (grouping === null && scenes === null) return null;
                        return (
                          <div className="flex flex-col gap-2">
                            {grouping}
                            {scenes}
                          </div>
                        );
                      }
                      if (newGhostKeys.length === 0) return null;
                      return (
                        <div className="flex flex-col gap-2">
                          {newGhostKeys.map((k) => (
                            <div key={k} className="flex flex-col gap-1">
                              <p className="text-xs font-semibold text-sp-accent">
                                새 주제 제안: {ghosts.get(k)!.suggestion.title}
                              </p>
                              {renderGhosts(k)}
                            </div>
                          ))}
                        </div>
                      );
                    }}
                    newThreadZone={
                      <NewThreadDropZone anchorRef={newZoneRef}>
                        <button
                          type="button"
                          onClick={(e) => openCreate(selectedIds.length > 0, e.currentTarget)}
                          aria-expanded={creating !== null}
                          className="flex w-full items-center justify-center gap-1 rounded-xl px-3 py-3 text-sm font-medium text-sp-muted outline-dashed outline-1 outline-sp-border transition-colors hover:bg-sp-surface hover:text-sp-text"
                        >
                          <span aria-hidden="true" className="material-symbols-outlined text-base">
                            add
                          </span>
                          주제
                        </button>
                      </NewThreadDropZone>
                    }
                  />
                  {unplacedOpen && (
                    <UnplacedEvidencePanel
                      key={`${student.studentRef}:${areaFilter}`}
                      items={unplacedItems}
                      targets={openLanes.map((lane) => ({
                        id: lane.thread.id,
                        title: lane.thread.title,
                        scenes: lane.resolved.scenes.map((rs, index) => ({
                          id: rs.scene.id,
                          label: `${index + 1}. ${rs.scene.label || { evaluation: '평가', motive: '동기', process: '과정', result: '결과' }[rs.scene.role]}`,
                        })),
                      }))}
                      onPlace={(id, threadId, sceneId) =>
                        sceneId ? placeInScene(threadId, sceneId, [id]) : sendTo(threadId, [id])
                      }
                      onSelect={selectMapNode}
                      onClose={() => setUnplacedOpen(false)}
                    />
                  )}
                  {!unplacedOpen && mapSide !== null && (
                    <EvidenceMapSidePanel
                      content={mapSide}
                      onClose={() => {
                        if (!canLeaveMapEditor()) return;
                        setFocusedId(null);
                        setMapPick(null);
                      }}
                      onSelectNode={selectMapNode}
                      onReorderEvidence={(threadId, sceneId, evidenceId, dir) => {
                        const scene = studentThreads
                          .find((t) => t.id === threadId)
                          ?.scenes?.find((s) => s.id === sceneId);
                        const index = scene?.evidenceIds.indexOf(evidenceId) ?? -1;
                        if (index >= 0)
                          void placeInScene(
                            threadId,
                            sceneId,
                            [evidenceId],
                            Math.max(0, index + dir),
                          );
                      }}
                      recentLinkNotes={recentLinkNotes}
                      recentSceneLeadIns={recentSceneLeadIns}
                      onSaveSceneLeadIn={async (threadId, sceneId, leadIn) => {
                        return history.run('장면 메모 저장', async () => {
                          await setSceneLeadIn(threadId, sceneId, leadIn);
                          flash(leadIn.length > 0 ? '이음말을 남겼습니다' : '이음말을 지웠습니다');
                        });
                      }}
                      onSceneNoteEditingChange={(threadId, sceneId, editing) =>
                        laneHandlers(threadId).onSceneEditingChange(sceneId, editing)
                      }
                      onEditSceneCategory={(threadId, sceneId) =>
                        laneHandlers(threadId).onEditScene(sceneId)
                      }
                      onSaveSceneNote={(threadId, sceneId, note) =>
                        laneHandlers(threadId).onChangeSceneNote(sceneId, note)
                      }
                      onMoveScene={(threadId, sceneId, dir) =>
                        laneHandlers(threadId).onMoveScene(sceneId, dir)
                      }
                      onRemoveScene={(threadId, sceneId) => {
                        if (!canLeaveMapEditor()) return;
                        laneHandlers(threadId).onRemoveScene(sceneId);
                      }}
                      onAddSceneAfter={(threadId, at) => laneHandlers(threadId).onAddScene(at)}
                      onPlaceInScene={(threadId, sceneId, ids) =>
                        void placeInScene(threadId, sceneId, ids)
                      }
                      onDetachConnection={(threadId, sceneId, evidenceId) => {
                        const store = useInquiryThreadStore.getState();

                        void history
                          .run('연결 해제', () =>
                            store.detachEvidenceFromScene(threadId, sceneId, [evidenceId]),
                          )
                          .then(() => {
                            setUnplacedOpen(true);
                            flash(
                              '이 장면의 연결을 해제했습니다. 다른 연결은 유지되며, 마지막 연결이면 자리 미정에서 찾을 수 있습니다',
                            );
                          })
                          .catch(fail);
                      }}
                      onDetachFromScene={(threadId, ids) => void detachToUnplaced(threadId, ids)}
                      onPickEvidenceForScene={(threadId, sceneId) =>
                        laneHandlers(threadId).onAddEvidenceToScene(sceneId)
                      }
                      onRenameThread={(threadId, title) => laneHandlers(threadId).onRename(title)}
                      onSetThreadLink={(threadId, fromThreadId) => {
                        setLink(threadId, fromThreadId === null ? null : { fromThreadId })
                          .then(() => {
                            if (fromThreadId === null) {
                              flash('연결을 끊었습니다');
                              return;
                            }
                            const from =
                              studentThreads.find((t) => t.id === fromThreadId)?.title ?? '앞 주제';
                            setMapPick({ kind: 'threadLink', threadId });
                            flash(
                              `‘${from}’에서 이어지는 주제로 두었습니다. 이음말은 오른쪽에서 적을 수 있어요`,
                            );
                          })
                          .catch(() =>
                            flash(
                              '서로를 가리키는 연결은 만들 수 없습니다. 다른 주제를 골라 주세요',
                            ),
                          );
                      }}
                      onLayScaffold={openScaffoldFor}
                      {...(runProvider === null
                        ? {}
                        : {
                            onSuggestScenes: (threadId, instruction) =>
                              void runNarrativeSuggest(threadId, instruction),
                          })}
                      {...(onWriteDraft === undefined
                        ? {}
                        : {
                            onDraftFromThread: (threadId, chain) =>
                              onWriteDraft({ kind: 'thread', threadId, chain }),
                          })}
                      onOpenThread={(threadId) => setOpenThreadId(threadId)}
                      onSaveThreadLinkNote={async (threadId, note) => {
                        const from = studentThreads.find((t) => t.id === threadId)?.link
                          ?.fromThreadId;
                        if (from === undefined) return;
                        await setLink(threadId, {
                          fromThreadId: from,
                          ...(note.length > 0 ? { note } : {}),
                        });
                        flash(note.length > 0 ? '이음말을 남겼습니다' : '이음말을 지웠습니다');
                      }}
                      onUnlinkThread={(threadId) => {
                        setLink(threadId, null)
                          .then(() => {
                            setMapPick(null);
                            flash('연결을 끊었습니다');
                          })
                          .catch(fail);
                      }}
                    />
                  )}
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4">
                  {renderColumn('unclassified', '미분류', unclassified, unclassifiedEmpty)}
                  {studentThreads.map((t) =>
                    renderColumn(
                      t.id,
                      t.title,
                      byThread.get(t.id) ?? [],
                      '아직 묶인 근거가 없습니다.',
                      t,
                    ),
                  )}
                  {/* 새 주제 고스트 열 — AI 가 새 이름을 제안한 것. 적용하면 주제를 만들며 보낸다. */}
                  {newGhostKeys.map((key) => {
                    const g = ghosts.get(key)!;
                    return (
                      <section
                        key={key}
                        aria-label={`${g.suggestion.title} 제안 열`}
                        className="flex w-72 shrink-0 flex-col rounded-xl outline-dashed outline-1 outline-blue-500/40"
                      >
                        <header className="flex items-start gap-2 border-b border-dashed border-sp-border px-3 py-2">
                          <span className="material-symbols-outlined text-sm text-sp-accent">
                            auto_awesome
                          </span>
                          <h4
                            className="min-w-0 flex-1 line-clamp-2 break-keep text-sm font-semibold leading-snug text-sp-text"
                            title={g.suggestion.title}
                          >
                            {g.suggestion.title}
                          </h4>
                          <span className="shrink-0 text-xs text-sp-muted">새 주제 제안</span>
                        </header>
                        <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
                          {renderGhosts(key)}
                        </div>
                      </section>
                    );
                  })}
                  {/* + 새 주제 — 카드를 여기 놓아도 된다(이름 팽오버가 열린다). */}
                  <NewThreadDropZone anchorRef={newZoneRef}>
                    {studentThreads.length === 0 && !creating && (
                      <p className="rounded-xl bg-sp-surface px-3 py-2 text-xs leading-relaxed text-sp-muted ring-1 ring-sp-border">
                        아직 주제가 없습니다. 카드를 고른 뒤 하단의{' '}
                        <b className="text-sp-text">+ 새 주제로</b> 를 누르거나, 아래 단추로 빈
                        주제를 먼저 만들 수 있습니다.
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={(e) => openCreate(selectedIds.length > 0, e.currentTarget)}
                      aria-expanded={creating !== null}
                      className="flex items-center justify-center gap-1 rounded-xl px-3 py-4 text-sm font-medium text-sp-muted outline-dashed outline-1 outline-sp-border transition-colors hover:bg-sp-surface hover:text-sp-text"
                    >
                      <span className="material-symbols-outlined text-base">add</span>새 주제
                    </button>
                  </NewThreadDropZone>
                </div>
              )}
              {/* 끌기 미리보기 — 본문 2줄 압축 카드. 놓을 때 애니메이션은 없다(움직임은 동작에 답할 때만). 유리 패널 대비로 body 에 붙인다. */}
              {createPortal(
                <DragOverlay dropAnimation={null}>
                  {dragging && (
                    <div
                      data-sp-floating
                      className="w-72 cursor-grabbing rounded-xl bg-sp-card px-3 py-2 ring-2 ring-sp-accent shadow-xl"
                    >
                      <p className="line-clamp-2 whitespace-pre-wrap text-sm leading-relaxed text-sp-text">
                        {dragging.lead.content}
                      </p>
                      {dragging.count > 1 && (
                        <span className="mt-1 inline-block rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-semibold text-sp-accent">
                          {dragging.count}건
                        </span>
                      )}
                    </div>
                  )}
                </DragOverlay>,
                rootRef.current ?? document.body,
              )}
            </DndContext>
          )}

          {viewMode === 'map' && renderFlowPickers()}

          {/* 하단 바 — 선택이 있을 때만 */}
          {student && selectedIds.length > 0 && (
            <div
              role="toolbar"
              aria-label="선택한 근거 보내기"
              className="flex flex-wrap items-center gap-2 border-t border-sp-border bg-sp-surface px-4 py-2"
            >
              <span className="text-xs font-semibold text-sp-accent">
                선택 {selectedIds.length}건 →
              </span>
              {/* 주제 단추 — 긴 이름은 한 줄로 자르고(전체는 title), 5개를 넘으면 접는다(설계서 §4-2). */}
              {(barExpanded ? openThreads : openThreads.slice(0, BAR_THREAD_LIMIT)).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => void sendTo(t.id)}
                  title={t.title}
                  className={`${btn} max-w-[14rem] truncate bg-sp-card text-sp-text`}
                >
                  {t.title}
                </button>
              ))}
              {openThreads.length > BAR_THREAD_LIMIT && (
                <button
                  type="button"
                  onClick={() => setBarExpanded((v) => !v)}
                  aria-expanded={barExpanded}
                  className={`${btn} text-sp-muted hover:text-sp-text`}
                >
                  {barExpanded
                    ? '주제 접기 ▴'
                    : `주제 더 보기 ▾ (${openThreads.length - BAR_THREAD_LIMIT})`}
                </button>
              )}
              <button
                type="button"
                onClick={(e) => openCreate(true, e.currentTarget)}
                aria-expanded={creating !== null}
                className="rounded-lg px-2.5 py-1 text-xs font-medium text-sp-accent outline-dashed outline-1 outline-blue-500/40 transition-colors hover:bg-blue-500/10"
              >
                + 새 주제로
              </button>
              <button
                type="button"
                onClick={() => void sendToUnclassified()}
                className={`${btn} text-sp-muted hover:text-sp-text`}
              >
                미분류로
              </button>
              <span aria-hidden="true" className="mx-1 h-4 w-px bg-sp-border" />
              <button
                type="button"
                onClick={() => void setSelectedExcluded(true)}
                title="고른 근거를 AI에게 보내지 않도록 합니다."
                className={`${btn} text-amber-600 hover:bg-amber-500/10`}
              >
                AI 제외
              </button>
              <button
                type="button"
                onClick={() => void setSelectedExcluded(false)}
                title="고른 근거를 다시 AI에게 보내도록 합니다."
                className={`${btn} text-sp-muted hover:text-sp-text`}
              >
                AI 제외 해제
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="rounded-lg px-2.5 py-1 text-xs font-medium text-sp-muted hover:text-sp-text"
              >
                선택 해제
              </button>
            </div>
          )}

          {importMenu()}
          {organizeMenu()}
          {createPopover()}
          {toastView()}

          {/* 주제 서랍 */}
          {openThread && student && (
            <EvidenceDrawer
              title={openThread.title}
              caption={student.name}
              onClose={() => setOpenThreadId(null)}
            >
              <InquiryThreadPanel
                thread={openThread}
                evidence={openThreadEvidence}
                {...(classSubject !== undefined ? { subject: classSubject } : {})}
                onPatch={(patch) => void updateThread(openThread.id, patch)}
                onRemove={() => void deleteThread(openThread.id)}
                onUnlink={(evidenceId) => void sendToUnclassified([evidenceId])}
              />
            </EvidenceDrawer>
          )}

          {/* 원본 비교 대화상자 — 근거는 스토어의 최신값에서 다시 찾는다(반영·동기화로 바뀌었을 수 있다). */}
          {comparing !== undefined && (
            <EvidenceSourceComparisonDialog
              // ★근거가 바뀌면 창을 새로 만든다. 캡처·미리보기 상태가 앞 근거의 것으로 남지 않게.
              key={comparing.id}
              evidence={comparing}
              lookup={sourceState.lookup(comparing.sourceId, comparing.sourceType)}
              onRetrySource={sourceState.retry}
              onApply={(capture, fields) =>
                applySourceFields({
                  evidenceId: comparing.id,
                  studentRef: comparing.studentRef,
                  capture,
                  fields,
                  readLatestSource: sourceState.readLatestSource(
                    capture.sourceId,
                    comparing.sourceType,
                  ),
                })
              }
              onDeleteEvidence={() => {
                void removeCard(comparing);
              }}
              onClose={() => setComparingId(null)}
            />
          )}

          {/* 엑셀 서랍 */}
          {importing && student && (
            <RecordEvidenceImportDrawer
              onImport={(inputs) =>
                importRun(
                  inputs.map((input) => input.studentRef),
                  () => addManyEvidence(inputs),
                )
              }
              students={students}
              student={student}
              downloadOnOpen={importing.downloadOnOpen}
              {...(classId !== undefined ? { classId } : {})}
              {...(className !== undefined ? { className } : {})}
              onClose={() => setImporting(null)}
            />
          )}
          {batchPanelOpen && runProvider !== null && (
            <RecordMapBatchPanel
              students={students}
              currentStudentRef={student?.studentRef ?? null}
              {...(classId === undefined ? {} : { classId })}
              {...(className === undefined ? {} : { className })}
              {...(classSubject === undefined ? {} : { classSubject })}
              areas={areas}
              initialArea={singleArea ?? areaFilter}
              provider={runProvider}
              roster={roster}
              scaffoldConfigurationForArea={mapScaffoldConfigurationForArea}
              onClose={closeBatchPanel}
            />
          )}
        </div>
      </FocusTrap>
    </>
  );
}
