import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  RECORD_AREA_LABELS,
  areasForContext,
  resolveAreaLimit,
  isAreaLimitVerified,
  type RecordArea,
  type RecordDraft,
  type SchoolLevel,
} from '@domain/entities/RecordDraft';
import { useRecordDraftsStore } from '@adapters/stores/useRecordDraftsStore';
import { useObservationStore } from '@adapters/stores/useObservationStore';
import { useToastStore } from '@adapters/components/common/Toast';
import {
  resolveRecordFlowIntent,
  type RecordFlowIntent,
} from '@adapters/components/RecordDraft/recordFlowIntent';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useRecordEvidenceStore } from '@adapters/stores/useRecordEvidenceStore';
import { useInquiryThreadStore } from '@adapters/stores/useInquiryThreadStore';
import { useRubricStore } from '@adapters/stores/useRubricStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useCurriculumStandards } from '@adapters/hooks/useCurriculumStandards';
import { standardKeywords, standardsForCodes } from '@domain/rules/curriculumStandardRules';
import type { ObservationRecord } from '@domain/entities/Observation';
import type { RoleMark } from '@domain/rules/narrativeParagraphs';
import { RecordDraftExportModal } from '@adapters/components/Homeroom/Records/RecordDraftExportModal';
import { RecordEvidenceBoard } from '@adapters/components/RecordDraft/RecordEvidenceBoard';
import {
  useEvidenceCandidateCounts,
  useEvidenceCandidates,
} from '@adapters/hooks/useEvidenceCandidates';
import { RecordDraftAiPanel } from '@adapters/components/RecordDraft/RecordDraftAiPanel';
import { RecordStyleLegend } from '@adapters/components/RecordDraft/RecordStyleLegend';
import {
  DEFAULT_RECORD_WRITING_STYLE,
  type RecordWritingStyle,
} from '@domain/entities/RecordWritingStyle';
import { normalizeWritingStyle } from '@domain/rules/recordStyleCompose';
import {
  RecordDraftSidePanel,
  type SidePanelPlacement,
  type SidePanelTab,
} from '@adapters/components/RecordDraft/RecordDraftSidePanel';
import {
  activeStudentRefsOf,
  draftRunScope,
  useRecordAiRunStore,
  type DraftRunPhase,
} from '@adapters/stores/useRecordAiRunStore';
import { RecordDraftRow } from '@adapters/components/RecordDraft/RecordDraftRow';
import {
  RecordDraftStudentList,
  type StudentListItem,
} from '@adapters/components/RecordDraft/RecordDraftStudentList';
import type {
  DraftTarget,
  LiveDraftEntry,
  RecordDraftLayout,
  RecordDraftStudentRow,
} from '@adapters/components/RecordDraft/recordDraftTypes';
import { useAssistStore } from '@adapters/stores/useAssistStore';
import { fetchRecordPromptL1 } from '@adapters/di/container';
import { useConnectedOwnAiProviders } from '@adapters/stores/useOwnAiStatusStore';
import { useRecordAiDraftStore } from '@adapters/stores/useRecordAiDraftStore';
import { OWN_AI_ERROR_MESSAGES } from '@domain/rules/ownAiCliRules';
import type { OwnAiErrorKind } from '@domain/entities/OwnAiProvider';
import { goalFloor, type LengthAdjustKind } from '@domain/rules/recordLengthGoal';
import { aiDraftText } from '@domain/entities/RecordAiDraft';
import type { DraftPackEvidence } from '@domain/services/recordDraftPack';
import { runApi } from '@adapters/components/RecordDraft/ownAiRun';
import {
  adjustRecordOf,
  runLengthAdjust,
  type LengthAdjustCandidate,
} from '@adapters/components/RecordDraft/lengthAdjustRun';
import type { LengthAdjustOutcome } from '@adapters/components/RecordDraft/RecordDraftLengthPanel';
import { rosterFromAll } from '@domain/rules/redactOutbound';

/** 왕복 상한 - 이 시간을 넘기면 잠금을 풀어 화면이 영영 잠기지 않게 한다. */
const LENGTH_ADJUST_TIMEOUT_MS = 5 * 60_000;

/** 작성주체(담임/교과) — 노출 영역 집합과 작성주체 결속을 결정. */
type RecordContext = 'homeroom' | 'teaching';

export type { RecordDraftStudentRow } from '@adapters/components/RecordDraft/recordDraftTypes';

interface RecordDraftViewProps {
  readonly context: RecordContext;
  readonly level: SchoolLevel;
  readonly students: readonly RecordDraftStudentRow[];
  /** 수업반 컨텍스트의 TeachingClass.id. */
  readonly classId?: string;
  /** 수업반 과목명 — 과목세특/개인세특/교과학습발달상황의 subject 키. */
  readonly classSubject?: string;
  /** 표시용 학급/수업반 이름(breadcrumb·내보내기). */
  readonly className?: string;
  /**
   * 다른 화면이 보낸 왕복 요청(계획 §4.3). 명단이 준비된 뒤 **한 번만** 소비한다.
   * 저장 직후 [근거 보드에서 보기] 로 들어오는 길이다.
   */
  readonly flowIntent?: RecordFlowIntent | null;
  /** 요청을 처리했다고 상위에 알린다. 상위는 이걸 받고 요청을 비운다. */
  readonly onFlowIntentConsumed?: (requestId: string) => void;
  /** 보드에서 입력·원본으로 되돌아가는 요청을 상위로 올린다(계획 §4.3). */
  readonly onRequestFlow?: (intent: RecordFlowIntent) => void | Promise<void>;
  /** 명단이 실제로 로드됐는지. false 면 요청 판정을 미룬다(없는 학생으로 단정하지 않는다). */
  readonly rosterLoaded?: boolean;
  /**
   * 이 화면이 떠 있는 동안 바깥 틀(수업 관리의 학급 목록)을 접어 달라는 요청(ADR-093 결정 7).
   * 마운트에 `true`, 언마운트에 `false`. 복원 판단은 받는 쪽이 한다.
   */
  readonly onRequestCompactHost?: (compact: boolean) => void;
}

/** 오른쪽 보조 공간의 폭 — 넓은 창 380, 그 아래 320(ADR-092 R-7 의 값을 그대로). */
const PANEL_WIDTH_WIDE = 380;
const PANEL_WIDTH_NARROW = 320;
/** 본문(편집 칸)이 확보해야 하는 최소 폭(설계서 §2-3). 이 아래로 눌리면 배치를 바꾼다. */
const MIN_BODY_WIDTH = 560;
/** 본문 칸의 좌우 안쪽 여백(px-4 × 2). 편집 칸 실제 폭 = 칸 폭 − 이 값. 실측(1440px: 칸 576 → 편집 칸 544)으로 확인. */
const BODY_PADDING = 32;

/**
 * 창 폭에 따른 배치(설계서 §2-3). `width` 는 이 화면 루트의 실제 폭(px). 모르면(`null`, jsdom 등) 넓다고 본다.
 * @returns panelWidth — 나란히 놓일 때의 패널 폭 · placement — 나란히(`side`) / 본문 자리 통째(`sheet`)
 */
export function resolvePanelLayout(width: number | null): {
  readonly panelWidth: number;
  readonly placement: SidePanelPlacement;
} {
  if (width === null) return { panelWidth: PANEL_WIDTH_WIDE, placement: 'side' };
  const panelWidth = width >= 1200 ? PANEL_WIDTH_WIDE : PANEL_WIDTH_NARROW;
  return {
    panelWidth,
    placement: width - panelWidth - BODY_PADDING >= MIN_BODY_WIDTH ? 'side' : 'sheet',
  };
}

/** 실행 없음 — 매 렌더 새 객체를 만들지 않게 모듈 상수로. */
const IDLE_RUN_PHASE: DraftRunPhase = { kind: 'idle' };

/** 집중 보기 학생 목록의 폭(px). */
const STUDENT_LIST_WIDTH = 224;

/**
 * 집중 보기의 학생 목록을 기둥(`list`)으로 둘지 선택기 한 줄(`selector`)로 접을지(설계서 §2-3).
 * 본문이 560px 을 못 확보하면 접는다. 폭을 모르면 기둥.
 */
export function resolveListMode(
  width: number | null,
  sidePanelShown: boolean,
  panelWidth: number,
): 'list' | 'selector' {
  if (width === null) return 'list';
  const body = width - STUDENT_LIST_WIDTH - (sidePanelShown ? panelWidth : 0) - BODY_PADDING;
  return body >= MIN_BODY_WIDTH ? 'list' : 'selector';
}

type DraftFilter = 'all' | 'unwritten' | 'unreviewed';

const FILTERS: { id: DraftFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'unwritten', label: '미작성' },
  { id: 'unreviewed', label: '검토 전' },
];

/** subject 키가 필요한 영역(과목·개인세특·교과학습발달상황). 그 외(담임 영역·동아리)는 과목 없음. */
function areaSubject(area: RecordArea, classSubject?: string): string | undefined {
  return area === 'subject' || area === 'individualSubject' || area === 'subjectDev'
    ? classSubject
    : undefined;
}

export function RecordDraftView({
  context,
  level,
  students,
  classId,
  classSubject,
  className,
  flowIntent,
  onFlowIntentConsumed,
  onRequestFlow,
  rosterLoaded = true,
  onRequestCompactHost,
}: RecordDraftViewProps) {
  const author = context === 'homeroom' ? 'homeroom' : 'teaching';
  const areas = useMemo(() => areasForContext(level, author), [level, author]);
  const records = useRecordDraftsStore((s) => s.records);
  const load = useRecordDraftsStore((s) => s.load);
  const getDraft = useRecordDraftsStore((s) => s.getDraft);
  const upsertDraft = useRecordDraftsStore((s) => s.upsert);
  const observations = useObservationStore((s) => s.records);
  const loadObservations = useObservationStore((s) => s.load);
  const evidenceRecords = useRecordEvidenceStore((s) => s.records);
  const loadEvidence = useRecordEvidenceStore((s) => s.load);
  const allThreads = useInquiryThreadStore((s) => s.records);
  const loadThreads = useInquiryThreadStore((s) => s.load);
  const ownAiEnabled = useAssistStore((s) => s.ownAiEnabled);
  const installId = useAssistStore((s) => s.installId);
  const preferredProvider = useAssistStore((s) => s.provider);
  const ownAiModels = useAssistStore((s) => s.ownAiModels);
  const connectedProviders = useConnectedOwnAiProviders();
  const addAiVersion = useRecordAiDraftStore((s) => s.add);
  /** 조절을 돌릴 공급자 - 패널과 같은 규칙(고른 것이 연결돼 있으면 그것, 아니면 연결된 첫 번째). */
  const runProviderForLength =
    preferredProvider === 'claude' || preferredProvider === 'codex'
      ? connectedProviders.includes(preferredProvider)
        ? preferredProvider
        : (connectedProviders[0] ?? null)
      : (connectedProviders[0] ?? null);

  const [activeArea, setActiveArea] = useState<RecordArea>(areas[0] ?? 'autonomy');
  const [filter, setFilter] = useState<DraftFilter>('all');
  const [showExport, setShowExport] = useState(false);
  /** 서브페이지 모드 — '초안' ↔ '근거 정리'. */
  const [viewMode, setViewMode] = useState<'draft' | 'evidence'>('draft');
  /**
   * 고른 학생(P1). 행 클릭·편집 칸 포커스·[AI ▸] 클릭이 바꾸고, 오른쪽 패널과 보드는 이 값을
   * **props 로 받는다** — 각자 `students[0]` 로 시작하지 않는다.
   */
  const [selectedStudentRef, setSelectedStudentRef] = useState<string | null>(
    students[0]?.studentRef ?? null,
  );
  const [sideTab, setSideTab] = useState<SidePanelTab>('ai');
  /**
   * 오른쪽 보조 공간 열림(ADR-093 결정 2). [AI ▸]·[AI 도움]·[근거 N건]을 눌렀을 때만 열리고 ✕ 로 닫으면 폭이 0 이다.
   * 쌤핀 AI 도크가 열려 있으면(`assistOpen`) 그것도 이 공간의 한 탭이라 함께 보인다.
   */
  const [panelOpen, setPanelOpen] = useState(false);
  const assistOpen = useAssistStore((s) => s.open);
  const setAssistOpen = useAssistStore((s) => s.setOpen);
  const panelVisible = panelOpen;
  const closePanel = useCallback((): void => setPanelOpen(false), []);

  /**
   * 쌤핀 AI 도크(범용 대화)와 이 패널(생기부 초안 전용)은 **둘 중 하나만** 열린다(ADR-093 결정 2, 오너 피드백).
   * 쌤핀 AI 를 이 패널 안의 탭으로 넣어 봤더니 "이 화면의 AI = 초안 쓰기"와 헷갈렸다. 그래서 자리를 합치지 않고
   * 배타적으로 다룬다: 도크가 열리면 이 패널을 닫고([AI ▸]·[근거 N건]은 반대로 도크를 닫는다) 오른쪽엔 늘 하나만 있다.
   */
  useEffect(() => {
    if (assistOpen) setPanelOpen(false);
  }, [assistOpen]);

  /** 바깥 틀(수업 관리 학급 목록) 접기 요청 — 마운트에 켜고 언마운트에 푼다. */
  useEffect(() => {
    if (!onRequestCompactHost) return;
    onRequestCompactHost(true);
    return () => onRequestCompactHost(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트/언마운트에만. 콜백이 바뀌어도 다시 요청하지 않는다.
  }, []);

  /** 이 화면 루트의 실제 폭 — 배치(나란히/시트) 판단에 쓴다. ResizeObserver 가 없으면(jsdom) 모름(=넓다). */
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [rootWidth, setRootWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w !== undefined) setRootWidth(Math.round(w));
    });
    ro.observe(el);
    setRootWidth(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  const layout = resolvePanelLayout(rootWidth);
  /** 패널이 본문 자리를 통째로 차지하는 좁은 배치인가. */
  const sheetMode = panelVisible && layout.placement === 'sheet';
  /**
   * 보드로 넘길 때 "이걸 찾아 줘"라고 함께 보내는 요청(계획 §4.3).
   * 보드가 필터를 풀고 스크롤·포커스한다. 한 번 쓰고 나면 보드가 알려 준다.
   */
  const [boardFocus, setBoardFocus] = useState<RecordFlowIntent | null>(null);

  /**
   * 행이 **지금 화면에 들고 있는 글** 등록부(ADR-088). 행은 여기에 기록만 하고, 부모는 읽기만 한다.
   *
   * ★왜 필요한가: 한도를 넘긴 글은 저장이 거부되므로 디스크에 없다. 그런데 분량 조절이
   *   조절해야 할 것이 바로 그 글이다. 저장소에서 다시 읽으면 조절할 글을 잃는다.
   * ★키는 행의 마운트 키와 **글자 그대로 같다**(`studentRef:area:subject`). 부모는 `activeArea` 가
   *   내부 상태라 영역을 바꿔도 다시 만들어지지 않는다. 키를 학생 하나로만 두면 자율 활동에 쓴
   *   글이 진로 활동 칸의 조절 대상이 되어 **남의 영역 본문이 CLI 로 나간다.**
   * ★언마운트에서 지우지 않는다. 3축 키를 쓰면 섞일 일이 구조적으로 없고, 지우면 영역을 바꿨다
   *   돌아왔을 때 저장이 거부된 글이 화면에서도 등록부에서도 사라져 완전히 소실된다.
   * ★`draftFlushRegistry` 와 **다른 물건**이다. 그건 이동 전에 저장을 밀어 넣는 콜백 등록소이고
   *   언마운트에서 등록이 풀린다. 이건 부모가 든 "키 → 현재 입력 글" 지도다.
   */
  const liveDraftTextRef = useRef(new Map<string, LiveDraftEntry>());
  /**
   * 초안 생성·분량 조절·형광펜 [다시 표시]를 **함께** 막는 잠금과, 늦게 온 결과를 가리는 번호.
   *
   * ★패널이 아니라 여기에 둔다. 패널은 학생·영역을 바꾸면 통째로 새로 만들어져서, 잠금을 패널에
   *   두면 새 인스턴스의 잠금은 초기값이라 CLI 왕복 2건이 동시에 돌고, 옛 인스턴스의 번호는 옛
   *   클로저에 살아 있어 비교가 언제나 통과한다. 부모는 다시 만들어지지 않는다.
   * ★반드시 `finally` 에서 풀고 시간 상한을 둔다. 안 그러면 이 화면의 AI 가 통째로 잠긴다.
   */
  const aiBusyRef = useRef(false);
  const aiRunTokenRef = useRef(0);
  /** 진행 중 분량 조절의 [중단] 손잡이(R-6). 실행마다 새로 만든다. */
  const lengthAbortRef = useRef<AbortController | null>(null);

  /** 행의 마운트 키와 같은 3축 키. 등록부·후보 보관이 모두 이걸 쓴다. */
  const rowKeyOf = useCallback(
    (studentRef: string): string =>
      `${studentRef}:${activeArea}:${areaSubject(activeArea, classSubject) ?? ''}`,
    [activeArea, classSubject],
  );

  const noteLiveText = useCallback((key: string, value: string): void => {
    // 시각을 함께 적는다 — 저장된 글(`updatedAt`)보다 새로울 때만 "화면의 진실"로 인정한다(아래 liveEntryFor).
    liveDraftTextRef.current.set(key, { text: value, at: Date.now() });
  }, []);

  /**
   * [편집칸에 넣기] 배달 상자 — 한 번만 배달된다. 토큰이 바뀔 때만 행이 받는다.
   * ★부모가 행에 값을 쓰는 유일한 자리다(원칙 2의 유일한 예외).
   */
  const [deliverBox, setDeliverBox] = useState<{
    readonly rowKey: string;
    readonly text: string;
    readonly token: number;
  } | null>(null);
  const deliverTokenRef = useRef(0);
  const deliverToEditor = useCallback(
    (studentRef: string, text: string): void => {
      deliverTokenRef.current += 1;
      setDeliverBox({
        rowKey: `${studentRef}:${activeArea}:${areaSubject(activeArea, classSubject) ?? ''}`,
        text,
        token: deliverTokenRef.current,
      });
    },
    [activeArea, classSubject],
  );

  /** 형광펜 스위치 — 설정에 기억한다. 켰을 때만 본문 색과 배지의 색점이 보인다. */
  const highlightOn = useSettingsStore((s) => s.settings.recordHighlightOn === true);
  const updateSettings = useSettingsStore((s) => s.update);

  /**
   * 지금 영역에 적용될 작성 방식(ADR-099). 정보 바의 배지가 이 값을 그대로 비춘다.
   * ★고르는 자리(`RecordDraftAiPanel`)와 **같은 곳을 읽고 같은 함수로 정규화**한다. 둘이 갈리면 배지가 거짓말을 한다.
   */
  const writingStyles = useSettingsStore((s) => s.settings.recordWritingStyles);
  const activeWritingStyle: RecordWritingStyle = useMemo(() => {
    const saved = writingStyles?.[activeArea];
    return saved === undefined ? DEFAULT_RECORD_WRITING_STYLE : normalizeWritingStyle(saved);
  }, [writingStyles, activeArea]);
  /** 배지를 눌렀을 때 작성 방식 고르기를 펴라는 신호. 값이 바뀐 것만으로 뜻이 있다(내용은 없다). */
  const [styleOpenSignal, setStyleOpenSignal] = useState(0);

  useEffect(() => {
    void load();
    void loadObservations();
    void loadEvidence();
    void loadThreads();
  }, [load, loadObservations, loadEvidence, loadThreads]);

  // 근거 ID → 관찰기록(날짜·내용) 역참조 맵. 교사용 표시를 위해 1회 구성.
  const obsById = useMemo(() => {
    const m = new Map<string, ObservationRecord>();
    for (const o of observations) m.set(o.id, o);
    return m;
  }, [observations]);

  // 영역 집합이 바뀌면(학교급 변경 등) 활성 탭을 유효 범위로 보정.
  useEffect(() => {
    if (!areas.includes(activeArea)) setActiveArea(areas[0] ?? 'autonomy');
  }, [areas, activeArea]);

  // 명단이 바뀌어 고른 학생이 사라지면 첫 학생으로.
  useEffect(() => {
    if (selectedStudentRef !== null && !students.some((s) => s.studentRef === selectedStudentRef)) {
      setSelectedStudentRef(students[0]?.studentRef ?? null);
    }
  }, [students, selectedStudentRef]);

  /**
   * 왕복 요청 처리 — 명단이 준비되면 그 학생을 고르고 **요청을 한 번만** 소비한다.
   * ★소비 기록을 ref 에 둔다. state 로 두면 갱신이 비동기라 같은 렌더 흐름에서 두 번 처리된다.
   */
  const consumedIntentsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const resolution = resolveRecordFlowIntent({
      intent: flowIntent ?? null,
      rosterLoaded,
      knownStudentRefs: new Set(students.map((s) => s.studentRef)),
      consumedRequestIds: consumedIntentsRef.current,
    });
    if (resolution.status === 'ready') {
      const { intent } = resolution;
      consumedIntentsRef.current.add(intent.requestId);
      setSelectedStudentRef(intent.studentRef);
      // ★학생만 고르고 끝내면 화면은 초안 목록에 머문다 - 교사가 누른 [근거 보드에서 보기] 가
      //   아무 일도 안 한 것처럼 보인다. 보드로 실제로 넘기고, 대상까지 찾아 준다(계획 §4.3).
      if (intent.mode === 'board') {
        setViewMode('evidence');
        setBoardFocus(intent);
      }
      onFlowIntentConsumed?.(intent.requestId);
      return;
    }
    if (resolution.status === 'student-missing') {
      // 첫 학생에게 묵시적으로 붙이지 않는다. 남의 기록을 열어 주는 사고다(계획 §4.3).
      consumedIntentsRef.current.add(flowIntent?.requestId ?? '');
      useToastStore.getState().show('학생을 찾을 수 없습니다.', 'error');
      if (flowIntent) onFlowIntentConsumed?.(flowIntent.requestId);
    }
  }, [flowIntent, students, rosterLoaded, onFlowIntentConsumed]);

  const subject = areaSubject(activeArea, classSubject);
  const limit = resolveAreaLimit(activeArea, level);

  /**
   * 성취기준 복사 검사(K1)의 재료 — **이 수업반이 실제로 가르친 성취기준의 원문**.
   *
   * ★**원문은 앱 안에만 머문다.** 여기서 나온 문장은 로컬 점검 함수로만 가고 AI 에는 절대
   *   실리지 않는다 — 원문을 모델에 보이면 그대로 옮겨 적어 "성취기준 복사형" 세특이 된다
   *   (분석 §4-1, 실측 C 사례). AI 로 가는 길은 근거 창고이고 거기에는 키워드만 간다.
   * ★자료는 1.5MB 라 **코드가 하나라도 있을 때만** 읽어 들인다(`enabled`).
   */
  const rubrics = useRubricStore((s) => s.rubrics);
  const progressEntries = useTeachingClassStore((s) => s.progressEntries);
  const standardCodes = useMemo(() => {
    if (classId === undefined) return [] as string[];
    const seen = new Set<string>();
    for (const r of rubrics) {
      if (r.classId !== classId) continue;
      for (const c of r.standardCodes ?? []) seen.add(c);
    }
    for (const e of progressEntries) {
      if (e.classId !== classId) continue;
      for (const c of e.standardCodes ?? []) seen.add(c);
    }
    return [...seen];
  }, [rubrics, progressEntries, classId]);

  /**
   * AI 로 나가는 글에서 실명·학번을 찾아 가릴 명단.
   *
   * ★이 화면의 학생만이 아니라 **근거 본문에 적힌 다른 학생**도 가려야 한다 — 관찰 기록에는
   *   "김지훈과 박서연이 모둠에서…" 처럼 여러 이름이 적힌다. 같은 반 학생은 이 목록으로 잡힌다.
   *   (다른 반 학생 이름은 못 잡는다 — 남은 위험으로 적어 둔다.)
   */
  const roster = useMemo(
    () =>
      rosterFromAll(
        students.map((s) => ({ name: s.name, studentNumber: s.number })),
        [],
      ),
    [students],
  );

  const { data: standardsData } = useCurriculumStandards(level, standardCodes.length > 0);
  const standardTexts = useMemo(() => {
    if (!standardsData || standardCodes.length === 0) return undefined;
    const texts = standardsForCodes(standardsData.index, standardCodes).map((s) => s.text);
    return texts.length > 0 ? texts : undefined;
  }, [standardsData, standardCodes]);

  /**
   * AI 로 나가는 쪽 — **키워드만.** 위의 `standardTexts`(원문)와 이름이 비슷하지만 하는 일이
   * 정반대다: 원문은 앱 안 복사 검사용이고, 이쪽만 밖으로 나간다.
   */
  const standardKeywordList = useMemo(() => {
    if (!standardsData || standardCodes.length === 0) return undefined;
    const kws = standardKeywords(standardsData.index, standardCodes);
    return kws.length > 0 ? kws : undefined;
  }, [standardsData, standardCodes]);

  const draftFor = (studentRef: string): RecordDraft | undefined =>
    getDraft(activeArea, studentRef, subject);

  /**
   * 분량 조절이 대상으로 삼을 글 — **화면의 현재 입력이 진실**이다.
   *
   * ★등록부에 항목이 없을 때 `''` 로 두면 빈 글을 조절하게 된다. 행은 글자를 칠 때만 기록하므로
   *   **한 번도 안 친 학생은 항목이 없다.** 그때는 저장된 초안을 쓴다 — 타이핑한 적 없는 학생도
   *   조절할 수 있어야 한다.
   */
  /**
   * 등록부의 글이 **저장된 글보다 새로울 때만** 돌려준다. 타이핑 뒤 AI [반영]·동기화로 저장본이 갱신되면
   * 등록부의 옛 글은 더 이상 진실이 아니다 — 그걸 그대로 쓰면 반영본을 옛 글로 덮는다(리뷰 지적 1).
   * 행의 되돌리기 효과(`lastEditAtRef > draft.updatedAt`)와 같은 기준이다.
   */
  const liveEntryFor = useCallback(
    (studentRef: string): LiveDraftEntry | undefined => {
      const live = liveDraftTextRef.current.get(rowKeyOf(studentRef));
      if (live === undefined) return undefined;
      const savedAt = getDraft(activeArea, studentRef, subject)?.updatedAt ?? 0;
      return live.at > savedAt ? live : undefined;
    },
    [rowKeyOf, getDraft, activeArea, subject],
  );
  const readLiveText = useCallback(
    (studentRef: string): string =>
      liveEntryFor(studentRef)?.text ?? getDraft(activeArea, studentRef, subject)?.content ?? '',
    [liveEntryFor, getDraft, activeArea, subject],
  );

  /**
   * 저장되지 않은 입력이 있는가 — [뒤에 붙이기]를 막을지 판정한다.
   * ★행의 `flush` 가 쓰는 술어를 **통째로** 쓴다. 앞 조건(`trim().length > 0`)을 빼면 칸을
   *   완전히 비운 상태가 영구 미저장으로 판정돼 [뒤에 붙이기]가 계속 막힌다.
   */
  const hasUnsavedInputFor = (studentRef: string): boolean => {
    const live = liveEntryFor(studentRef);
    if (live === undefined) return false;
    return live.text.trim().length > 0 && live.text !== (draftFor(studentRef)?.content ?? '');
  };

  const writtenCount = students.filter(
    (s) => (draftFor(s.studentRef)?.content ?? '').trim().length > 0,
  ).length;

  /**
   * "남은 학생 모두"의 대상 — 이 영역에 아직 초안이 없는 학생.
   * ★이미 쓴 초안을 덮지 않는다. 덮어쓰면 선생님이 손으로 쓴 글이 소리 없이 사라진다.
   */
  const unwrittenStudents = useMemo(
    () => students.filter((s) => (draftFor(s.studentRef)?.content ?? '').trim().length === 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- draftFor 는 매 렌더 새로 만들어진다. 실제 의존은 아래 둘이다.
    [students, records, activeArea, subject],
  );

  /**
   * AI 가 쓴 초안을 저장한다. **어느 학생 칸인지 `studentRef` 로만 찾는다.**
   * ★목록 위치(index)로 찾으면 안 된다 — 필터가 걸려 있으면 화면 순서와 명단 순서가 다르다.
   * roleMarks: 표식(형광펜). null 이면 뗀다, undefined 면 그대로 둔다.
   */
  const applyAiDraft = useCallback(
    async (
      studentRef: string,
      content: string,
      roleMarks?: readonly RoleMark[] | null,
    ): Promise<void> => {
      const row = students.find((s) => s.studentRef === studentRef);
      if (!row) return;
      await upsertDraft({
        area: activeArea,
        studentRef: row.studentRef,
        content,
        ...(classId !== undefined ? { classId } : {}),
        ...(row.studentKey !== undefined ? { studentKey: row.studentKey } : {}),
        ...(row.studentId !== undefined ? { studentId: row.studentId } : {}),
        ...(subject !== undefined ? { subject } : {}),
        ...(standardTexts !== undefined && standardTexts.length > 0 ? { standardTexts } : {}),
        ...(roleMarks !== undefined ? { roleMarks } : {}),
        level,
      });
    },
    [students, upsertDraft, activeArea, classId, subject, standardTexts, level],
  );

  /**
   * 분량 조절 실행 — 부모가 맡는다(ADR-088).
   *
   * ★잠금과 실행 번호를 **부모의 기억 상자**에 둔다. 패널에 두면 학생을 바꿨을 때 새 인스턴스의
   *   잠금은 초기값이라 CLI 왕복 2건이 동시에 돌고, 옛 인스턴스의 번호는 옛 클로저에 살아 있어
   *   "늦게 온 결과 버리기" 비교가 언제나 통과한다.
   * ★`finally` 에서 반드시 풀고 시간 상한을 둔다. 안 풀면 이 화면의 AI 가 통째로 잠긴다.
   */
  const runLengthAdjustFor = useCallback(
    async (
      studentRef: string,
      displayName: string,
      evidences: readonly DraftPackEvidence[],
      threadTitle: string | undefined,
      kind: LengthAdjustKind,
      targetBytes: number,
      // ★조절할 원문은 패널이 정해 넘긴다(R-2). 없으면 편집 칸의 지금 글.
      sourceText: string | undefined,
    ): Promise<LengthAdjustOutcome> => {
      const api = runApi();
      if (!api || !runProviderForLength) throw new Error(OWN_AI_ERROR_MESSAGES.crashed.draft);
      if (aiBusyRef.current) throw new Error('다른 AI 작업이 끝나면 이어서 할 수 있어요.');
      const abort = new AbortController();
      lengthAbortRef.current = abort;

      // ★규정(1층 프롬프트)을 먼저 받는다. 없으면 실행하지 않는다 - 조절도 같은 게이트를 받는다.
      //   ★한도(429)와 그 밖의 실패는 안내가 달라야 한다 — "인터넷을 확인하라"고 하면
      //     선생님이 계속 다시 눌러 요청이 더 몰린다(ADR-089).
      const promptResult = await fetchRecordPromptL1(installId);
      if (!promptResult.ok) {
        const kind: OwnAiErrorKind =
          promptResult.reason === 'rate-limited-minute'
            ? 'prompt-rate-limited-minute'
            : promptResult.reason === 'rate-limited-day'
              ? 'prompt-rate-limited-day'
              : 'prompt-unavailable';
        throw new Error(OWN_AI_ERROR_MESSAGES[kind].draft);
      }
      const systemPrompt = promptResult.prompt;

      aiBusyRef.current = true;
      aiRunTokenRef.current += 1;
      const token = aiRunTokenRef.current;
      const timeout = setTimeout(() => {
        aiBusyRef.current = false;
      }, LENGTH_ADJUST_TIMEOUT_MS);
      try {
        const outcome = await runLengthAdjust({
          api,
          provider: runProviderForLength,
          systemPrompt,
          pack: {
            kind,
            studentName: displayName,
            roster,
            areaLabel: RECORD_AREA_LABELS[activeArea],
            sourceText: sourceText ?? readLiveText(studentRef),
            targetBytes,
            ...(threadTitle !== undefined ? { threadTitle } : {}),
            ...(kind === 'expand' ? { evidences } : {}),
          },
          floorBytes: goalFloor(targetBytes),
          signal: abort.signal,
        });
        // 늦게 온 결과는 버린다 — 그 사이 다른 실행이 시작됐다면 이 결과는 화면의 것이 아니다.
        if (token !== aiRunTokenRef.current)
          throw new Error('다른 작업이 시작되어 결과를 버렸어요.');
        return outcome;
      } finally {
        clearTimeout(timeout);
        aiBusyRef.current = false;
      }
    },
    [runProviderForLength, installId, roster, activeArea, readLiveText],
  );

  /**
   * [이 글로 바꾸기] — 고른 후보를 **판으로 남기고** 초안 칸에 반영한다.
   *
   * ★디스크로 가는 것은 선생님이 고른 하나뿐이다. 자동 재조정의 나머지 후보는 화면(패널 상태)에만
   *   있다가 사라진다 — 판 상한 20개를 두 배로 갉아먹지 않기 위해서다(ADR-088 결정 7).
   * ★`upsert` 가 한도 초과로 던지면 그대로 올려 보낸다. 조용히 삼키면 안 된다(C0 (ㄱ)과 같은 이유).
   */
  const applyLengthAdjust = useCallback(
    async (
      studentRef: string,
      picked: LengthAdjustCandidate,
      outcome: LengthAdjustOutcome,
      kind: LengthAdjustKind,
      targetBytes: number,
      sourceVersionId: string | undefined,
      threadId: string | undefined,
    ): Promise<void> => {
      if (!runProviderForLength) return;
      const text = aiDraftText({ paragraphs: picked.paragraphs });
      await addAiVersion({
        draftKey: {
          area: activeArea,
          studentRef,
          ...(subject !== undefined ? { subject } : {}),
          ...(classId !== undefined ? { classId } : {}),
        },
        provider: runProviderForLength,
        ...(ownAiModels[runProviderForLength] ? { model: ownAiModels[runProviderForLength] } : {}),
        // 주제는 **조절 대상 판**의 것을 물려받는다. 화면의 현재 칩이 아니다.
        ...(threadId !== undefined ? { threadId } : {}),
        paragraphs: picked.paragraphs,
        excluded: picked.excluded,
        adjust: adjustRecordOf({
          kind,
          targetBytes,
          sourceText: outcome.sourceText,
          candidates: outcome.candidates,
          picked,
          ...(sourceVersionId !== undefined ? { sourceVersionId } : {}),
        }),
      });
      await applyAiDraft(
        studentRef,
        text,
        picked.paragraphs.some((p) => p.role !== null)
          ? picked.paragraphs
              .filter((p) => p.text.trim().length > 0)
              .map((p) => ({ role: p.role, text: p.text.trim() }))
          : null,
      );
    },
    [runProviderForLength, addAiVersion, activeArea, subject, classId, ownAiModels, applyAiDraft],
  );

  /** [다시 표시] — 본문은 그대로, 표식만 갱신한다. */
  const remarkDraft = useCallback(
    async (studentRef: string, roleMarks: readonly RoleMark[]): Promise<void> => {
      const current = getDraft(activeArea, studentRef, subject);
      if (!current) return;
      await applyAiDraft(studentRef, current.content, roleMarks);
    },
    [getDraft, activeArea, subject, applyAiDraft],
  );

  /**
   * AI 초안을 만드는 중인 학생 — 필터가 걸려 있어도 **행을 붙들어 둔다.**
   * ★"미작성" 필터에서 "남은 학생 모두"를 누르면 첫 [반영] 순간 그 학생이 필터에서 빠져
   *   행이 사라졌다(UltraQA P1). 실행이 끝날 때까지 붙든다.
   * ★패널 콜백이 아니라 **실행 스토어**에서 읽는다(ADR-093 결정 3) — 패널을 닫아도 붙들림이 풀리지 않는다.
   */
  const runScope = draftRunScope({
    area: activeArea,
    ...(subject !== undefined ? { subject } : {}),
    ...(classId !== undefined ? { classId } : {}),
  });
  const draftRun = useRecordAiRunStore((s) => s.drafts[runScope]);
  const runPhase: DraftRunPhase = draftRun ?? IDLE_RUN_PHASE;
  const aiActiveRefs = useMemo(() => new Set(activeStudentRefsOf(runPhase)), [runPhase]);
  /** 보기 선택은 설정에 기억한다(ADR-093 결정 1). 기본 = 학생별 집중 보기. */
  const draftLayout: RecordDraftLayout = useSettingsStore(
    (s) => s.settings.recordDraftViewMode ?? 'focus',
  );
  /** [AI 도움] 단추의 진행 표시 — 패널이 닫혀 있어도 실행 중·결과 있음을 알린다(결과 돌아가기). */
  const aiBadge: 'running' | 'result' | undefined =
    runPhase.kind === 'running'
      ? 'running'
      : runPhase.kind === 'preview' || (runPhase.kind === 'stopped' && runPhase.message.length > 0)
        ? 'result'
        : undefined;

  const visibleStudents = students.filter((s) => {
    if (filter === 'all') return true;
    if (aiActiveRefs.has(s.studentRef)) return true; // 실행 중인 행은 필터를 무시하고 남긴다
    // 집중 보기에서 쓰고 있는 학생은 붙들어 둔다 — 자동 저장 순간 필터에서 빠져 편집 칸이 사라지면 안 된다(리뷰 지적 5).
    if (draftLayout === 'focus' && s.studentRef === selectedStudentRef) return true;
    const d = draftFor(s.studentRef);
    if (filter === 'unwritten') return (d?.content ?? '').trim().length === 0;
    return d === undefined || d.status !== 'confirmed'; // unreviewed
  });

  // ── 보기(집중/전체)와 학생 목록 ──────────────────────────────
  const setDraftLayout = (next: RecordDraftLayout): void => {
    void updateSettings({ recordDraftViewMode: next });
  };
  /** 집중 보기의 학생 목록 재료 — 필터가 적용된 순서 그대로(매 렌더 계산, 30명이라 가볍다). */
  const listItems: readonly StudentListItem[] = visibleStudents.map((s) => {
    const d = draftFor(s.studentRef);
    return {
      studentRef: s.studentRef,
      number: s.number,
      name: s.name,
      status: d?.status ?? null,
      needsReview: !!d && (d.status === 'reviewing' || (d.groundingFlags ?? []).length > 0),
      written: (d?.content ?? '').trim().length > 0,
    };
  });
  /** 폭이 모자라면 학생 목록을 선택기 한 줄로 접는다(설계서 §2-3). */
  const listMode = resolveListMode(
    rootWidth,
    panelVisible && layout.placement === 'side',
    layout.panelWidth,
  );

  /**
   * 초안 생성 대상으로 골라 둔 학생(오너 요청 2026-09-08: 한 명/전체 말고 몇 명만 직접).
   * 두 보기가 같은 집합을 본다. 명단에서 사라진 학생은 뺀다.
   */
  const [checkedRefs, setCheckedRefs] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    setCheckedRefs((prev) => {
      const alive = new Set(students.map((s) => s.studentRef));
      const next = new Set([...prev].filter((r) => alive.has(r)));
      return next.size === prev.size ? prev : next;
    });
  }, [students]);
  const toggleChecked = useCallback((studentRef: string): void => {
    setCheckedRefs((prev) => {
      const next = new Set(prev);
      if (next.has(studentRef)) next.delete(studentRef);
      else next.add(studentRef);
      return next;
    });
  }, []);
  const clearChecked = useCallback((): void => setCheckedRefs(new Set()), []);
  /** [미작성 전체 고르기] — 목록이 **지금 보여 주는** 학생(검색·필터 뒤) 중 초안이 없는 학생만(리뷰 지적 4). */
  const checkUnwrittenVisible = (shownRefs: readonly string[]): void => {
    const shown = new Set(shownRefs);
    setCheckedRefs(
      new Set(
        visibleStudents
          .filter((s) => shown.has(s.studentRef))
          .filter((s) => (draftFor(s.studentRef)?.content ?? '').trim().length === 0)
          .map((s) => s.studentRef),
      ),
    );
  };

  /** 집중 보기의 [이전]/[다음]·Ctrl+Enter — 보이는 목록 순서로 옮기고, 키보드로 왔으면 새 칸에 포커스한다. */
  const selectedIndex = visibleStudents.findIndex((s) => s.studentRef === selectedStudentRef);
  const [focusRequest, setFocusRequest] = useState<{
    readonly studentRef: string;
    readonly token: number;
  } | null>(null);
  const focusTokenRef = useRef(0);
  const stepStudent = (delta: 1 | -1, focusEditor: boolean): void => {
    const next = visibleStudents[selectedIndex + delta];
    if (!next) return;
    setSelectedStudentRef(next.studentRef);
    if (focusEditor) {
      focusTokenRef.current += 1;
      setFocusRequest({ studentRef: next.studentRef, token: focusTokenRef.current });
    } else {
      setFocusRequest(null);
    }
  };
  /** 행이 다시 만들어질 때 등록부의 글로 시작하게 하는 prop(P8). 저장본보다 새 글이 없으면 아무것도 넘기지 않는다. */
  const liveTextProp = (
    studentRef: string,
  ): { readonly initialLiveText?: string; readonly initialLiveAt?: number } => {
    const live = liveEntryFor(studentRef);
    return live === undefined ? {} : { initialLiveText: live.text, initialLiveAt: live.at };
  };

  // ── 고른 학생의 패널 재료 ─────────────────────────────────
  const selectedStudent = students.find((s) => s.studentRef === selectedStudentRef) ?? null;
  const selectedDraft = selectedStudent ? draftFor(selectedStudent.studentRef) : undefined;
  const selectedEvidences = useMemo(
    () =>
      selectedStudent
        ? evidenceRecords.filter((e) => e.studentRef === selectedStudent.studentRef)
        : [],
    [evidenceRecords, selectedStudent],
  );
  const selectedAreaEvidences = useMemo(
    () => selectedEvidences.filter((e) => e.areas.includes(activeArea)),
    [selectedEvidences, activeArea],
  );
  const selectedThreads = useMemo(
    () =>
      selectedStudent ? allThreads.filter((t) => t.studentRef === selectedStudent.studentRef) : [],
    [allThreads, selectedStudent],
  );
  /**
   * 거울 카드(아직 근거로 안 넣은 원본 기록) — 보드와 같은 계산. 행의 [미분류 N건]과 오른쪽 패널이
   * 저장 미분류에 이것을 더해 보여야 보드와 수가 어긋나지 않는다(설계서 §4-1). ★세기만 하고 저장하지 않는다.
   */
  const mirrorCounts = useEvidenceCandidateCounts({
    students,
    context,
    ...(classId !== undefined ? { classId } : {}),
  });
  const selectedMirrors = useEvidenceCandidates({
    student: selectedStudent,
    context,
    ...(classId !== undefined ? { classId } : {}),
  });
  /**
   * [AI로 초안 쓰기]에 넘길 재료 — 실명은 여기서 가리지 않는다(꾸러미가 한 세션으로 가린다).
   * "AI 에 보내지 않기" 근거와 기재 금지 근거는 `recordDraftPack` 이 뺀다(거르는 자리를 한 곳에 둔다).
   */
  const aiTarget = useMemo<DraftTarget | null>(() => {
    if (!selectedStudent) return null;
    const existing = selectedDraft?.content ?? '';
    return {
      studentRef: selectedStudent.studentRef,
      displayName: selectedStudent.name,
      evidences: selectedAreaEvidences,
      ...(standardKeywordList !== undefined ? { standardKeywords: standardKeywordList } : {}),
      ...(existing.trim().length > 0 ? { existingText: existing } : {}),
    };
  }, [selectedStudent, selectedDraft?.content, selectedAreaEvidences, standardKeywordList]);
  /** "남은 학생 모두" 대상. 자기 자신은 뺀다. 주제는 걸지 않는다 — 각자 영역 전체 근거를 본다. */
  const aiRemaining = useMemo<readonly DraftTarget[]>(
    () =>
      unwrittenStudents
        .filter((s) => s.studentRef !== selectedStudentRef)
        .map((s) => ({
          studentRef: s.studentRef,
          displayName: s.name,
          evidences: evidenceRecords.filter(
            (e) => e.studentRef === s.studentRef && e.areas.includes(activeArea),
          ),
          ...(standardKeywordList !== undefined ? { standardKeywords: standardKeywordList } : {}),
        })),
    [unwrittenStudents, selectedStudentRef, evidenceRecords, activeArea, standardKeywordList],
  );
  /**
   * "고른 N명" 대상 — 체크한 학생 전부(자기 자신 포함, 초안이 있는 학생도 포함). 이미 글이 있는 학생은
   * 미리보기에서 [바꾸기]/[뒤에 붙이기]를 고르게 하므로 `existingText` 를 실어 준다.
   */
  const aiPicked = useMemo<readonly DraftTarget[]>(
    () =>
      students
        .filter((s) => checkedRefs.has(s.studentRef))
        .map((s) => {
          const existing = draftFor(s.studentRef)?.content ?? '';
          return {
            studentRef: s.studentRef,
            displayName: s.name,
            evidences: evidenceRecords.filter(
              (e) => e.studentRef === s.studentRef && e.areas.includes(activeArea),
            ),
            ...(standardKeywordList !== undefined ? { standardKeywords: standardKeywordList } : {}),
            ...(existing.trim().length > 0 ? { existingText: existing } : {}),
          };
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- draftFor 는 매 렌더 새로 만들어진다. 실제 의존은 records.
    [students, checkedRefs, evidenceRecords, activeArea, standardKeywordList, records],
  );
  const aiDraftKey = useMemo(
    () => ({
      area: activeArea,
      studentRef: selectedStudentRef ?? '',
      ...(subject !== undefined ? { subject } : {}),
      ...(classId !== undefined ? { classId } : {}),
    }),
    [activeArea, selectedStudentRef, subject, classId],
  );

  const selectStudent = useCallback((studentRef: string) => {
    setSelectedStudentRef(studentRef);
    // 클릭으로 고른 것은 포커스 요청이 아니다 — 키보드(Ctrl+Enter)로 왔을 때만 새 칸에 커서를 둔다.
    setFocusRequest(null);
  }, []);
  const openAiFor = (studentRef: string): void => {
    setSelectedStudentRef(studentRef);
    setSideTab('ai');
    // 쌤핀 AI 도크가 열려 있었으면 닫는다(오른쪽엔 하나만). 대화는 스토어에 남는다.
    if (useAssistStore.getState().open) setAssistOpen(false);
    setPanelOpen(true);
  };
  /** 정보 바의 작성 방식 배지 → 오른쪽 AI 패널의 작성 방식 고르기. 패널을 새로 만들지 않는다(도크와 배타). */
  const openStylePicker = (): void => {
    setSideTab('ai');
    if (useAssistStore.getState().open) setAssistOpen(false);
    setPanelOpen(true);
    setStyleOpenSignal((v) => v + 1);
  };
  const openEvidenceFor = (studentRef: string): void => {
    setSelectedStudentRef(studentRef);
    setSideTab('evidence');
    if (useAssistStore.getState().open) setAssistOpen(false);
    setPanelOpen(true);
  };
  const openBoardFor = (studentRef: string): void => {
    // ★한도를 넘겨 저장되지 않은 글이 있으면 막지는 않되 **말한다**(R-5, ADR-092). 그 글은 앱을
    //   켜 둔 동안만 남는다 — 이동은 자유지만 잊고 앱을 끄면 사라진다.
    if (hasUnsavedInputFor(studentRef)) {
      flashCopyMsg(
        '저장되지 않은 글이 있어요. 한도를 넘어 저장되지 않았습니다: 앱을 끄기 전에 줄여서 저장하세요.',
        false,
      );
    }
    setSelectedStudentRef(studentRef);
    setViewMode('evidence');
  };

  // ── 파워유저 가속 ─────────────────────────────────────────
  const listRef = useRef<HTMLDivElement | null>(null);
  const tablistRef = useRef<HTMLDivElement | null>(null);
  // 전체 훑어보기로 바꾸면 고른 학생의 행이 보이는 자리로 스크롤한다(위치 보전). jsdom 엔 scrollIntoView 가 없다.
  useEffect(() => {
    if (draftLayout !== 'overview' || selectedStudentRef === null) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-rd-student="${selectedStudentRef}"]`,
    );
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [draftLayout, selectedStudentRef]);
  const [copyMsg, setCopyMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const copyMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyMsgTimer.current) clearTimeout(copyMsgTimer.current);
    },
    [],
  );

  const flashCopyMsg = (text: string, ok: boolean): void => {
    setCopyMsg({ text, ok });
    if (copyMsgTimer.current) clearTimeout(copyMsgTimer.current);
    copyMsgTimer.current = setTimeout(() => setCopyMsg(null), 2500);
  };

  // 현재 영역의 보이는 학생 중 작성된 초안을 표 형식(번호\t이름\t내용)으로 일괄 복사.
  const copyAllVisible = async (): Promise<void> => {
    const rows = visibleStudents
      .map((s) => ({ s, content: (draftFor(s.studentRef)?.content ?? '').trim() }))
      .filter((r) => r.content.length > 0);
    if (rows.length === 0) {
      flashCopyMsg('복사할 초안이 없습니다', false);
      return;
    }
    const tsv = rows.map((r) => `${r.s.number}\t${r.s.name}\t${r.content}`).join('\n');
    try {
      await navigator.clipboard.writeText(tsv);
      flashCopyMsg(`${rows.length}명 복사됨`, true);
    } catch {
      flashCopyMsg('복사 실패: 브라우저 권한을 확인하세요', false);
    }
  };

  // 같은 영역의 i번째 학생 입력창에 포커스(Ctrl+Enter 순차 작성).
  const focusRowTextarea = (i: number): void => {
    const el = listRef.current?.querySelector<HTMLTextAreaElement>(
      `textarea[data-rd-index="${i}"]`,
    );
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  };

  // 탭 키보드 내비게이션(ARIA tab 패턴) — ←/→/Home/End.
  const onTabKeyDown = (e: ReactKeyboardEvent, idx: number): void => {
    let nextIdx = idx;
    if (e.key === 'ArrowRight') nextIdx = (idx + 1) % areas.length;
    else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + areas.length) % areas.length;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = areas.length - 1;
    else return;
    e.preventDefault();
    const nextArea = areas[nextIdx];
    if (!nextArea) return;
    setActiveArea(nextArea);
    requestAnimationFrame(() => {
      tablistRef.current?.querySelector<HTMLButtonElement>(`[data-rd-tab="${nextArea}"]`)?.focus();
    });
  };

  const ctxChip =
    context === 'homeroom'
      ? {
          icon: 'co_present',
          label: '담임 작성 영역',
          cls: 'bg-sky-500/10 text-sky-500 ring-sky-500/20',
        }
      : {
          icon: 'menu_book',
          label: '교과 작성 영역',
          cls: 'bg-violet-500/10 text-violet-500 ring-violet-500/20',
        };

  return (
    <div
      ref={rootRef}
      className="h-full flex flex-col rounded-xl bg-sp-card ring-1 ring-sp-border overflow-hidden"
    >
      {/* 상단 바 — breadcrumb + 모드 토글 + 형광펜 + (초안)복사·내보내기 + 컨텍스트 칩.
          ★좁으면 다음 줄로 내린다(flex-wrap) — 단추 글자가 한 글자씩 세로로 무너지지 않게 각 단추는 nowrap. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 border-b border-sp-border">
        <div className="flex items-center gap-1.5 truncate">
          {className ? <span className="text-sm text-sp-muted">{className}</span> : null}
          {className ? <span className="text-sm text-sp-muted">›</span> : null}
          <h2 className="text-base font-bold text-sp-text">
            {viewMode === 'draft' ? '생활기록부 초안' : '근거 정리'}
          </h2>
        </div>
        {/* 초안 ↔ 근거 정리 서브페이지 토글 */}
        <div className="inline-flex shrink-0 overflow-hidden rounded-full text-xs font-medium ring-1 ring-sp-border">
          <button
            type="button"
            onClick={() => setViewMode('draft')}
            className={`whitespace-nowrap px-3 py-1 transition-colors ${viewMode === 'draft' ? 'bg-sp-accent text-white' : 'text-sp-muted hover:text-sp-text'}`}
          >
            초안
          </button>
          <button
            type="button"
            onClick={() => setViewMode('evidence')}
            className={`whitespace-nowrap px-3 py-1 transition-colors ${viewMode === 'evidence' ? 'bg-sp-accent text-white' : 'text-sp-muted hover:text-sp-text'}`}
          >
            근거 정리
          </button>
        </div>
        {/* 보기: 학생별 집중 보기 ↔ 전체 훑어보기(ADR-093 결정 1). 선택은 설정에 기억한다. */}
        {viewMode === 'draft' && (
          <div
            className="inline-flex shrink-0 overflow-hidden rounded-full text-xs font-medium ring-1 ring-sp-border"
            role="group"
            aria-label="초안 보기"
          >
            <button
              type="button"
              onClick={() => setDraftLayout('focus')}
              aria-pressed={draftLayout === 'focus'}
              title="학생 한 명을 넓게 보며 씁니다"
              className={`whitespace-nowrap px-3 py-1 transition-colors ${draftLayout === 'focus' ? 'bg-sp-surface font-semibold text-sp-text' : 'text-sp-muted hover:text-sp-text'}`}
            >
              집중 보기
            </button>
            <button
              type="button"
              onClick={() => setDraftLayout('overview')}
              aria-pressed={draftLayout === 'overview'}
              title="학생 전체를 한 목록에서 이어서 씁니다"
              className={`whitespace-nowrap px-3 py-1 transition-colors ${draftLayout === 'overview' ? 'bg-sp-surface font-semibold text-sp-text' : 'text-sp-muted hover:text-sp-text'}`}
            >
              전체 훑어보기
            </button>
          </div>
        )}
        {viewMode === 'draft' && (
          <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs font-medium text-sp-muted">
            <input
              type="checkbox"
              role="switch"
              aria-checked={highlightOn}
              checked={highlightOn}
              onChange={(e) => void updateSettings({ recordHighlightOn: e.target.checked })}
              className="h-3.5 w-3.5 accent-current text-sp-accent"
            />
            <span className="material-symbols-outlined text-base">ink_highlighter</span>형광펜
          </label>
        )}
        <div className="flex-1" />
        {viewMode === 'draft' && (
          <>
            {copyMsg ? (
              <span
                role="status"
                aria-live="polite"
                className={`text-xs font-medium ${copyMsg.ok ? 'text-emerald-500' : 'text-sp-muted'}`}
              >
                {copyMsg.text}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => void copyAllVisible()}
              title="현재 영역의 작성된 초안을 한 번에 복사 (번호·이름·내용)"
              className="flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-medium text-sp-muted ring-1 ring-sp-border hover:text-sp-text hover:bg-sp-surface transition-all"
            >
              <span className="material-symbols-outlined text-base">content_copy</span>영역 전체
              복사
            </button>
            <button
              type="button"
              onClick={() => setShowExport(true)}
              className="flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-medium text-sp-muted ring-1 ring-sp-border hover:text-sp-text hover:bg-sp-surface transition-all"
            >
              <span className="material-symbols-outlined text-base">download</span>내보내기
            </button>
          </>
        )}
        <span
          className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ring-1 ${ctxChip.cls}`}
        >
          <span className="material-symbols-outlined text-sm">{ctxChip.icon}</span>
          {ctxChip.label}
        </span>
      </div>

      {viewMode === 'evidence' ? (
        /* 근거 정리 보드 — 고른 학생·현재 영역을 넘긴다. 보드가 학생을 바꾸면 초안 쪽 선택도 같이 바뀐다. */
        <RecordEvidenceBoard
          context={context}
          level={level}
          students={students}
          {...(classId !== undefined ? { classId } : {})}
          {...(className !== undefined ? { className } : {})}
          {...(classSubject !== undefined ? { classSubject } : {})}
          selectedStudentRef={selectedStudentRef}
          onSelectStudent={selectStudent}
          initialArea={activeArea}
          focusRequest={boardFocus}
          onFocusRequestHandled={() => setBoardFocus(null)}
          {...(onRequestFlow !== undefined ? { onRequestFlow } : {})}
        />
      ) : (
        <>
          {/* 유형(영역) 탭 */}
          <div
            ref={tablistRef}
            className="flex gap-1 px-3 border-b border-sp-border overflow-x-auto"
            role="tablist"
            aria-label="생활기록부 영역"
          >
            {areas.map((area, idx) => {
              const cnt = students.filter(
                (s) =>
                  (
                    getDraft(area, s.studentRef, areaSubject(area, classSubject))?.content ?? ''
                  ).trim().length > 0,
              ).length;
              const on = area === activeArea;
              return (
                <button
                  key={area}
                  role="tab"
                  aria-selected={on}
                  tabIndex={on ? 0 : -1}
                  data-rd-tab={area}
                  onClick={() => setActiveArea(area)}
                  onKeyDown={(e) => onTabKeyDown(e, idx)}
                  className={`relative -mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm transition-colors ${
                    on
                      ? 'border-sp-accent font-bold text-sp-text'
                      : 'border-transparent font-medium text-sp-muted hover:text-sp-text'
                  }`}
                >
                  {RECORD_AREA_LABELS[area]}
                  <span className="text-xs font-semibold text-sp-muted">
                    {Math.round(resolveAreaLimit(area, level) / 3)}자
                  </span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${on ? 'bg-blue-500/15 text-sp-accent' : 'bg-sp-surface text-sp-muted'}`}
                  >
                    {cnt}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 영역 정보 바 */}
          <div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-sp-surface border-b border-sp-border text-xs text-sp-muted">
            <span>
              <span className="material-symbols-outlined text-sm align-middle mr-1">
                description
              </span>
              <b className="text-sp-text">{RECORD_AREA_LABELS[activeArea]}</b>
              {subject ? <span className="text-sp-muted"> · {subject}</span> : null} · 한도{' '}
              <b className="text-amber-500">
                {Math.round(limit / 3)}자 / {limit.toLocaleString()}B
              </b>
              {!isAreaLimitVerified(activeArea, level) && (
                <span className="ml-1 text-amber-500/80">(원문 확인 필요)</span>
              )}
            </span>
            <span className="inline-flex items-center gap-2">
              작성 <b className="text-sp-text">{writtenCount}</b>/{students.length}명
              <span className="h-1.5 w-24 overflow-hidden rounded-full bg-sp-border">
                <span
                  className="block h-full rounded-full bg-sp-accent"
                  style={{
                    width: `${students.length ? Math.round((writtenCount / students.length) * 100) : 0}%`,
                  }}
                />
              </span>
            </span>
            {/* 작성 방식 배지 — 이름은 늘, 색점은 형광펜을 켰을 때만. 누르면 고르는 자리로 간다. */}
            <RecordStyleLegend
              style={activeWritingStyle}
              highlightOn={highlightOn}
              {...(aiTarget !== null ? { onOpen: openStylePicker } : {})}
            />
            <div className="ml-auto inline-flex overflow-hidden rounded-full ring-1 ring-sp-border text-xs font-medium">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={`px-3 py-1 transition-colors ${filter === f.id ? 'bg-sp-accent text-white' : 'text-sp-muted hover:text-sp-text'}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* 본문 + 오른쪽 보조 공간. 가로가 모자라도 짓누르지 않는다(R-7) — 배치 규칙은 resolvePanelLayout/resolveListMode. */}
          <div className="flex min-h-0 flex-1 overflow-x-auto">
            {/* 좁은 배치(sheet)에서는 패널이 본문 자리를 통째로 쓴다 — 본문은 잠시 비운다(글은 등록부·저장소에 있다). */}
            {!sheetMode && (
              <div className="flex min-w-[320px] flex-1 flex-col">
                {draftLayout === 'focus' ? (
                  /* ── 학생별 집중 보기(기본, ADR-093 결정 1): 학생 목록 + 고른 학생의 넓은 본문 ── */
                  <div className="flex min-h-0 flex-1" data-testid="focus-layout">
                    {listMode === 'list' && (
                      <RecordDraftStudentList
                        items={listItems}
                        selectedRef={selectedStudentRef}
                        checkedRefs={checkedRefs}
                        showCheckboxes={ownAiEnabled}
                        mode="list"
                        onSelect={selectStudent}
                        onToggleChecked={toggleChecked}
                        onCheckUnwritten={checkUnwrittenVisible}
                        onClearChecked={clearChecked}
                      />
                    )}
                    <div className="flex min-w-0 flex-1 flex-col">
                      {listMode === 'selector' && (
                        <RecordDraftStudentList
                          items={listItems}
                          selectedRef={selectedStudentRef}
                          checkedRefs={checkedRefs}
                          showCheckboxes={ownAiEnabled}
                          mode="selector"
                          onSelect={selectStudent}
                          onToggleChecked={toggleChecked}
                          onCheckUnwritten={checkUnwrittenVisible}
                          onClearChecked={clearChecked}
                        />
                      )}
                      {selectedStudent &&
                      visibleStudents.some((s) => s.studentRef === selectedStudent.studentRef) ? (
                        <RecordDraftRow
                          key={`${selectedStudent.studentRef}:${activeArea}:${subject ?? ''}`}
                          variant="focus"
                          student={selectedStudent}
                          area={activeArea}
                          level={level}
                          subject={subject}
                          classId={classId}
                          draft={selectedDraft}
                          index={0}
                          selected
                          checked={checkedRefs.has(selectedStudent.studentRef)}
                          mirrorCount={mirrorCounts.get(selectedStudent.studentRef) ?? 0}
                          highlightOn={highlightOn}
                          showAiButton={ownAiEnabled}
                          {...(aiBadge !== undefined ? { aiBadge } : {})}
                          {...(standardTexts !== undefined ? { standardTexts } : {})}
                          rowKey={rowKeyOf(selectedStudent.studentRef)}
                          {...liveTextProp(selectedStudent.studentRef)}
                          onLiveText={noteLiveText}
                          {...(deliverBox !== null &&
                          deliverBox.rowKey === rowKeyOf(selectedStudent.studentRef)
                            ? { deliver: deliverBox }
                            : {})}
                          {...(focusRequest !== null &&
                          focusRequest.studentRef === selectedStudent.studentRef
                            ? { focusToken: focusRequest.token }
                            : {})}
                          onSelect={selectStudent}
                          onToggleChecked={toggleChecked}
                          onOpenAi={openAiFor}
                          onOpenBoard={openBoardFor}
                          onOpenEvidence={openEvidenceFor}
                          onJumpNext={() => stepStudent(1, true)}
                          {...(selectedIndex > 0 ? { onPrev: () => stepStudent(-1, false) } : {})}
                          {...(selectedIndex >= 0 && selectedIndex < visibleStudents.length - 1
                            ? { onNext: () => stepStudent(1, false) }
                            : {})}
                        />
                      ) : (
                        <p className="py-10 text-center text-sm text-sp-muted">
                          {visibleStudents.length === 0
                            ? '표시할 학생이 없습니다.'
                            : '왼쪽에서 학생을 고르세요.'}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  /* ── 전체 훑어보기: 30명 행을 세로로(예전 목록 그대로) ── */
                  <>
                    {/* 입력창 안내 — 목록 전체에 1회만 노출(행마다 반복 제거) */}
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-1.5 text-xs text-sp-muted border-b border-sp-border">
                      <span className="inline-flex items-center gap-1 whitespace-nowrap">
                        <span className="material-symbols-outlined text-sm">open_in_full</span>
                        입력창 우하단을 끌어 크기를 조절할 수 있습니다.
                      </span>
                      <span className="inline-flex items-center gap-1 whitespace-nowrap">
                        <span className="material-symbols-outlined text-sm">keyboard_return</span>
                        <kbd className="rounded bg-sp-surface px-1 font-semibold text-sp-text">
                          Ctrl+Enter
                        </kbd>
                        로 다음 학생 칸으로 이동합니다.
                      </span>
                      {ownAiEnabled && checkedRefs.size > 0 && (
                        <span className="ml-auto inline-flex items-center gap-1 whitespace-nowrap font-semibold text-sp-accent">
                          고른 {checkedRefs.size}명
                          <button
                            type="button"
                            onClick={clearChecked}
                            className="rounded-md px-1 font-medium text-sp-muted hover:text-sp-text"
                          >
                            선택 해제
                          </button>
                        </span>
                      )}
                    </p>

                    {/* 학생 세로 스크롤 리스트 */}
                    <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto">
                      {visibleStudents.length === 0 ? (
                        <p className="py-10 text-center text-sm text-sp-muted">
                          표시할 학생이 없습니다.
                        </p>
                      ) : (
                        visibleStudents.map((s, i) => (
                          <RecordDraftRow
                            key={`${s.studentRef}:${activeArea}:${subject ?? ''}`}
                            variant="overview"
                            student={s}
                            area={activeArea}
                            level={level}
                            subject={subject}
                            classId={classId}
                            draft={draftFor(s.studentRef)}
                            index={i}
                            selected={s.studentRef === selectedStudentRef}
                            checked={checkedRefs.has(s.studentRef)}
                            mirrorCount={mirrorCounts.get(s.studentRef) ?? 0}
                            highlightOn={highlightOn}
                            showAiButton={ownAiEnabled}
                            {...(standardTexts !== undefined ? { standardTexts } : {})}
                            rowKey={rowKeyOf(s.studentRef)}
                            {...liveTextProp(s.studentRef)}
                            onLiveText={noteLiveText}
                            {...(deliverBox !== null && deliverBox.rowKey === rowKeyOf(s.studentRef)
                              ? { deliver: deliverBox }
                              : {})}
                            onSelect={selectStudent}
                            onToggleChecked={toggleChecked}
                            onOpenAi={openAiFor}
                            onOpenBoard={openBoardFor}
                            onOpenEvidence={openEvidenceFor}
                            onJumpNext={() => focusRowTextarea(i + 1)}
                          />
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 오른쪽 보조 공간 — 고른 학생의 [AI 초안 | 근거]. 눌렀을 때만 있다. */}
            {panelVisible && (
              <RecordDraftSidePanel
                studentName={selectedStudent?.name ?? null}
                area={activeArea}
                tab={sideTab}
                onTabChange={setSideTab}
                onClose={closePanel}
                placement={layout.placement}
                width={layout.panelWidth}
                evidences={selectedAreaEvidences}
                mirrors={selectedMirrors}
                threads={selectedThreads}
                {...(selectedDraft !== undefined ? { draft: selectedDraft } : {})}
                obsById={obsById}
                onOpenBoard={() => selectedStudent && openBoardFor(selectedStudent.studentRef)}
                aiPanel={
                  aiTarget && selectedStudent ? (
                    <RecordDraftAiPanel
                      key={`${selectedStudent.studentRef}:${activeArea}:${subject ?? ''}`}
                      areaLabel={RECORD_AREA_LABELS[activeArea]}
                      {...(subject !== undefined ? { subject } : {})}
                      roster={roster}
                      target={aiTarget}
                      threads={selectedThreads}
                      studentEvidences={selectedEvidences}
                      remaining={aiRemaining}
                      picked={aiPicked}
                      onClearPicked={clearChecked}
                      draftKey={aiDraftKey}
                      {...(selectedDraft?.roleMarks !== undefined
                        ? { existingRoleMarks: selectedDraft.roleMarks }
                        : {})}
                      highlightOn={highlightOn}
                      openStyleSignal={styleOpenSignal}
                      onApply={applyAiDraft}
                      onRemark={remarkDraft}
                      onFocusStudent={selectStudent}
                      area={activeArea}
                      level={level}
                      getSourceText={() => readLiveText(selectedStudent.studentRef)}
                      onLengthRun={(kind, targetBytes, sourceText) =>
                        runLengthAdjustFor(
                          selectedStudent.studentRef,
                          selectedStudent.name,
                          selectedAreaEvidences,
                          undefined,
                          kind,
                          targetBytes,
                          sourceText,
                        )
                      }
                      onLengthApply={(
                        picked,
                        outcome,
                        kind,
                        targetBytes,
                        sourceVersionId,
                        threadId,
                      ) =>
                        applyLengthAdjust(
                          selectedStudent.studentRef,
                          picked,
                          outcome,
                          kind,
                          targetBytes,
                          sourceVersionId,
                          threadId,
                        )
                      }
                      onLengthCancel={() => lengthAbortRef.current?.abort()}
                      onInsertToEditor={(text) => {
                        deliverToEditor(selectedStudent.studentRef, text);
                        // ★넣기만 했지 저장되지 않았다는 걸 그 자리에서 말한다(R-5). 앱을 껐다 켜면 사라진다.
                        flashCopyMsg(
                          '편집칸에 넣었어요. 한도를 넘어 저장되지 않아요: 줄인 뒤 저장하세요.',
                          false,
                        );
                      }}
                      hasUnsavedInput={hasUnsavedInputFor(selectedStudent.studentRef)}
                    />
                  ) : null
                }
              />
            )}
          </div>

          {showExport && (
            <RecordDraftExportModal
              drafts={records}
              students={students}
              areas={areas}
              level={level}
              {...(className !== undefined ? { className } : {})}
              onClose={() => setShowExport(false)}
            />
          )}
        </>
      )}
    </div>
  );
}
