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
 *    복구한다(메모리에만 들고 있다가 `add` 로 다시 넣는다).
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
import { EVIDENCE_SOURCE_LABELS, type RecordEvidence } from '@domain/entities/RecordEvidence';
import type { InquiryThread } from '@domain/entities/InquiryThread';
import type { OwnAiErrorKind } from '@domain/entities/OwnAiProvider';
import { isClassified, suggestThreadsForEvidence } from '@domain/rules/threadSuggest';
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
import { useEvidenceCandidates } from '@adapters/hooks/useEvidenceCandidates';
import type { EvidenceCandidate } from '@usecases/studentRecords/collectEvidenceCandidates';
import { hasProhibitedTerms } from '@domain/rules/prohibitedRecordTerms';
import { trackEventSafely } from '@adapters/analytics/trackEventSafely';

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
}: RecordEvidenceBoardProps) {
  const author = context === 'homeroom' ? 'homeroom' : 'teaching';
  const areas = useMemo(() => areasForContext(level, author), [level, author]);
  /** 영역이 하나뿐이면 고를 것이 없다 — 필터 줄·카드 칩·폼 칩을 그리지 않고 값은 그 영역으로 고정한다. */
  const singleArea = areas.length === 1 ? (areas[0] ?? null) : null;

  const records = useRecordEvidenceStore((s) => s.records);
  const loadEvidence = useRecordEvidenceStore((s) => s.load);
  const addEvidence = useRecordEvidenceStore((s) => s.add);
  const addManyEvidence = useRecordEvidenceStore((s) => s.addMany);
  const updateEvidence = useRecordEvidenceStore((s) => s.update);
  const removeEvidence = useRecordEvidenceStore((s) => s.remove);
  const setExcludedFromAi = useRecordEvidenceStore((s) => s.setExcludedFromAi);
  const setExcludedFromAiMany = useRecordEvidenceStore((s) => s.setExcludedFromAiMany);
  const setThread = useRecordEvidenceStore((s) => s.setThread);
  const moveToThread = useRecordEvidenceStore((s) => s.moveToThread);
  const moveToNewThread = useRecordEvidenceStore((s) => s.moveToNewThread);
  const unclassify = useRecordEvidenceStore((s) => s.unclassify);

  const threads = useInquiryThreadStore((s) => s.records);
  const loadThreads = useInquiryThreadStore((s) => s.load);
  const addThread = useInquiryThreadStore((s) => s.add);
  const updateThread = useInquiryThreadStore((s) => s.update);
  const removeThread = useInquiryThreadStore((s) => s.remove);

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
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [form, setForm] = useState<EvidenceForm | null>(null);
  /** 새 주제 만들기 팽오버(포털). */
  const [creating, setCreating] = useState<CreatingState | null>(null);
  /** 옆 서랍에 펼친 주제(시간순 줄기·키워드·다음 메모). */
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  /** 가져오기 서랍. */
  const [importing, setImporting] = useState<ImportState | null>(null);
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
  const newZoneRef = useRef<HTMLElement | null>(null);
  // ★포인터가 6px 이상 움직여야 끌기다 — 그 안이면 클릭(선택). 이 제약이 없으면 고르려다 옮긴다. 키보드 센서는 붙이지 않는다.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

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
  useEffect(() => {
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
  }, [selectedStudentRef]);
  // 화면을 떠나면 토스트 타이머도 같이 정리한다.
  useEffect(
    () => () => {
      if (toastTimer.current !== null) clearTimeout(toastTimer.current);
    },
    [],
  );
  // 영역 필터가 바뀌어도 선택은 비운다 — 안 보이는 카드가 골라진 채 딸려 가면 안 된다.
  useEffect(() => {
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

  const student = students.find((s) => s.studentRef === selectedStudentRef) ?? null;
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
        : studentEvidence.filter((r) => r.areas.includes(areaFilter)),
    [studentEvidence, areaFilter],
  );
  /** 실재하는 주제 id 집합 — 고아 threadId(동기화 시차)는 미분류로 보인다. */
  const threadIdSet = useMemo(() => new Set(threads.map((t) => t.id)), [threads]);
  /** 이 학생의 주제만, open 먼저 · closed 뒤. 다른 학생 주제는 여기서 잘라 손에 잡히지 않게 한다. */
  const studentThreads = useMemo(() => {
    const mine = student ? threads.filter((t) => t.studentRef === student.studentRef) : [];
    return [...mine].sort((a, b) => (a.status === b.status ? 0 : a.status === 'open' ? -1 : 1));
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
  const goStudent = (delta: number): void => {
    if (studentIndex < 0) return;
    const next = students[studentIndex + delta];
    if (next) onSelectStudent(next.studentRef);
  };

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
   * 주제로 보내기. 거울은 `add(threadId)`/`addMany` 로 **주제에 바로 저장**(한 번의 쓰기)하고,
   * 저장 카드는 관문 `moveToThread` 를 지난다. 새 저장 경로는 없다.
   */
  const sendTo = async (threadId: string, ids: readonly string[] = selectedIds): Promise<void> => {
    if (!student || ids.length === 0) return;
    const { savedIds, mirrorCands } = splitSelection(ids);
    const title = studentThreads.find((t) => t.id === threadId)?.title ?? '주제';
    try {
      let added = 0;
      if (mirrorCands.length === 1) {
        await addEvidence(mirrorAddInput(mirrorCands[0]!, { threadId }));
        added = 1;
      } else if (mirrorCands.length > 1) {
        added = await addManyEvidence(mirrorCands.map((c) => mirrorAddInput(c, { threadId })));
      }
      const r =
        savedIds.length > 0
          ? await moveToThread({ studentRef: student.studentRef, evidenceIds: savedIds, threadId })
          : { movedIds: [], skippedIds: [] };
      setSelectedIds((prev) => prev.filter((x) => !ids.includes(x)));
      report(r, `‘${title}’로 보냈습니다`, added);
    } catch (err) {
      fail(err);
    }
  };

  /**
   * 하단 바 [AI 제외]/[AI 제외 해제] — 고른 카드 전부를 한 번의 저장으로 바꾼다.
   * 선택은 이 학생의 카드에서만 나오고(학생이 바뀌면 비운다) 보드는 다른 학생 카드를 그리지 않으므로, 여기에 남의 학생 근거가 섞일 길은 없다.
   */
  const setSelectedExcluded = async (excluded: boolean): Promise<void> => {
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
  };

  /** 카드 [AI 제외] 토글 — 거울이면 그 순간 저장한다(켜기 = `add(excludedFromAi)` 한 번). */
  const setCardExcluded = async (ev: RecordEvidence, excluded: boolean): Promise<void> => {
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
  };

  /** [미분류로] — 저장 카드는 관문 `unclassify`, 거울은 미분류 그대로 저장(처음 손대는 것). */
  const sendToUnclassified = async (ids: readonly string[] = selectedIds): Promise<void> => {
    if (!student || ids.length === 0) return;
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
      report(r, '미분류로 되돌렸습니다', added);
    } catch (err) {
      fail(err);
    }
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
    if (overId === null || !student) return;
    const ids = draggedIds(String(e.active.id));
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
    const target = studentThreads.find((t) => threadDropId(t.id) === overId);
    if (!target || target.status === 'closed') return;
    void sendTo(target.id, ids);
  };

  /**
   * 주제 삭제 — 근거의 threadId 는 스토어가 안 지운다. 여기서 미분류로 풀고 지운다.
   * 부르는 곳은 주제 서랍(`InquiryThreadPanel.onRemove`, 두 번 누르기)뿐이다 — 열 머리에는 없다(설계서 §5-c).
   */
  const deleteThread = async (threadId: string): Promise<void> => {
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
  };
  const applyAllGhosts = async (): Promise<void> => {
    for (const key of [...ghosts.keys()]) await applyGhost(key);
    setSuggest({ kind: 'idle' });
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
  };
  /** 카드의 유형 토글 — 수정 모드 없이 즉시 반영. 마지막 하나는 뻔 수 없다(근거는 영역이 1개 이상). */
  const toggleEvidenceArea = (ev: RecordEvidence, area: RecordArea): void => {
    const next = ev.areas.includes(area) ? ev.areas.filter((a) => a !== area) : [...ev.areas, area];
    if (next.length === 0) return;
    void updateEvidence(ev.id, { areas: next });
  };

  /**
   * 카드 [삭제] — 바로 지우되, 5초 동안 토스트의 [되돌리기]로 복구할 수 있다(설계서 §5-a).
   * 지운 근거는 이 클로저가 들고 있다가 `add` 로 다시 넣는다 — 같은 내용·영역·날짜·출처·주제. id 는 새로 받는다.
   */
  const removeCard = async (ev: RecordEvidence): Promise<void> => {
    try {
      await removeEvidence(ev.id);
      setSelectedIds((prev) => prev.filter((x) => x !== ev.id));
      flash('근거 1건을 지웠습니다', {
        label: '되돌리기',
        onClick: () => {
          closeToast();
          void addEvidence({
            studentRef: ev.studentRef,
            areas: ev.areas,
            content: ev.content,
            ...(ev.date !== undefined ? { date: ev.date } : {}),
            ...(ev.sourceType !== undefined ? { sourceType: ev.sourceType } : {}),
            ...(ev.sourceId !== undefined ? { sourceId: ev.sourceId } : {}),
            ...(ev.classId !== undefined ? { classId: ev.classId } : {}),
            ...(ev.slots !== undefined ? { slots: ev.slots } : {}),
            ...(ev.threadId !== undefined ? { threadId: ev.threadId } : {}),
          })
            .then(() => flash('지운 근거를 되돌렸습니다'))
            .catch(fail);
        },
      });
    } catch (err) {
      fail(err);
    }
  };

  // ── 렌더 ───────────────────────────────────────────────────
  const renderCard = (ev: RecordEvidence, inUnclassified: boolean): ReactElement => (
    <EvidenceCard
      key={ev.id}
      evidence={ev}
      selected={selectedIds.includes(ev.id)}
      areas={areas}
      // "이것도 이 주제?" — 미분류 카드에만, 주제 키워드가 본문에 있을 때만(문자열 검사, AI 없음). 칩 1~2개.
      alsoHits={inUnclassified ? suggestThreadsForEvidence(ev, studentThreads).slice(0, 2) : []}
      onToggleSelect={() => toggleSelect(ev.id)}
      mirror={isMirrorId(ev.id)}
      onToggleArea={(area) => toggleEvidenceArea(ev, area)}
      onEdit={() => openEdit(ev)}
      onRemove={() => void removeCard(ev)}
      onSetExcludedFromAi={(excluded) => void setCardExcluded(ev, excluded)}
      onSendTo={(threadId) => void sendTo(threadId, [ev.id])}
    />
  );

  const renderGhosts = (key: string): ReactElement | null => {
    const g = ghosts.get(key);
    if (!g) return null;
    return (
      <div
        className="flex flex-col gap-1.5 rounded-xl p-1.5 ring-1 ring-dashed ring-blue-500/40"
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
    const style =
      a === null
        ? { left, bottom: 16 }
        : { left, bottom: Math.max(8, window.innerHeight - a.top + 8) };
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
      </div>,
      document.body,
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
        className="fixed bottom-6 left-1/2 z-sp-dropdown flex -translate-x-1/2 items-center gap-3 rounded-xl border border-sp-border bg-sp-card px-4 py-2 text-xs font-medium text-sp-text shadow-xl"
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
      document.body,
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
        aria-label="엑셀"
        className="fixed z-sp-dropdown min-w-[180px] rounded-xl border border-sp-border bg-sp-card py-1 shadow-xl"
        style={{ top: rect.bottom + 4, left: rect.left }}
      >
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
      document.body,
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 상단 — 학생 선택 · 영역 필터 · 가져오기 · 근거 직접 입력 · AI 분류 제안 */}
      <div className="flex flex-wrap items-center gap-2 border-b border-sp-border px-4 py-2">
        <button
          type="button"
          onClick={() => goStudent(-1)}
          disabled={studentIndex <= 0}
          aria-label="이전 학생"
          className="rounded-lg p-1 text-sp-muted ring-1 ring-sp-border hover:text-sp-text disabled:opacity-40"
        >
          <span className="material-symbols-outlined text-base">chevron_left</span>
        </button>
        <select
          aria-label="학생 선택"
          value={student?.studentRef ?? ''}
          onChange={(e) => onSelectStudent(e.target.value)}
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
                className={chip(areaFilter === a)}
              >
                {RECORD_AREA_LABELS[a]}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1" />
        <button
          ref={importBtnRef}
          type="button"
          onClick={() => setImportMenuOpen((v) => !v)}
          disabled={!student}
          aria-haspopup="menu"
          aria-expanded={importMenuOpen}
          className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-sp-muted ring-1 ring-sp-border transition-colors hover:bg-sp-surface hover:text-sp-text disabled:opacity-40"
        >
          <span className="material-symbols-outlined text-sm">table</span>엑셀
          <span className="material-symbols-outlined text-sm">arrow_drop_down</span>
        </button>
        <button
          type="button"
          onClick={openAdd}
          disabled={!student}
          className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-sp-muted ring-1 ring-sp-border transition-colors hover:bg-sp-surface hover:text-sp-text disabled:opacity-40"
        >
          <span className="material-symbols-outlined text-sm">add</span>근거 직접 입력
        </button>
        {runProvider !== null && (
          <button
            type="button"
            onClick={() => void runSuggest()}
            disabled={!student || suggest.kind === 'running'}
            title="미분류 근거를 AI 에게 보내 '이렇게 묶으면 어떨까요'를 받습니다. 적용을 누르기 전에는 아무것도 저장되지 않습니다."
            className="flex items-center gap-1 rounded-lg bg-sp-accent px-3 py-1.5 text-xs font-semibold text-sp-accent-fg transition-colors hover:opacity-90 disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-sm">auto_awesome</span>
            {suggest.kind === 'running' ? '제안 받는 중…' : 'AI 분류 제안'}
          </button>
        )}
      </div>

      {/* AI 제안 안내 줄 — 실행 중 / 제안 있음([전체 적용]·[무시]) / 못 읽었으면 이유 한 줄 */}
      {suggest.kind === 'running' && (
        <div className="flex items-center gap-2 border-b border-sp-border bg-sp-surface px-4 py-1.5">
          <span className="material-symbols-outlined animate-spin text-sm text-sp-accent">
            progress_activity
          </span>
          <span
            role="status"
            aria-live="polite"
            aria-label="AI 분류 제안 안내"
            className="text-xs text-sp-muted"
          >
            AI 가 미분류 근거를 읽고 있습니다… 답이 오면 점선 카드로 보여 드립니다(저장되지
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
              aria-label="AI 분류 제안 안내"
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
            aria-label="AI 분류 제안 안내"
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
          sensors={sensors}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setDragging(null)}
        >
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
                  className="flex w-72 shrink-0 flex-col rounded-xl ring-1 ring-dashed ring-blue-500/40"
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
                  <b className="text-sp-text">+ 새 주제로</b> 를 누르거나, 아래 단추로 빈 주제를
                  먼저 만들 수 있습니다.
                </p>
              )}
              <button
                type="button"
                onClick={(e) => openCreate(selectedIds.length > 0, e.currentTarget)}
                aria-expanded={creating !== null}
                className="flex items-center justify-center gap-1 rounded-xl px-3 py-4 text-sm font-medium text-sp-muted ring-1 ring-dashed ring-sp-border transition-colors hover:bg-sp-surface hover:text-sp-text"
              >
                <span className="material-symbols-outlined text-base">add</span>새 주제
              </button>
            </NewThreadDropZone>
          </div>
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
            document.body,
          )}
        </DndContext>
      )}

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
            className="rounded-lg px-2.5 py-1 text-xs font-medium text-sp-accent ring-1 ring-dashed ring-blue-500/40 transition-colors hover:bg-blue-500/10"
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

      {/* 엑셀 서랍 */}
      {importing && student && (
        <RecordEvidenceImportDrawer
          students={students}
          student={student}
          downloadOnOpen={importing.downloadOnOpen}
          {...(classId !== undefined ? { classId } : {})}
          {...(className !== undefined ? { className } : {})}
          onClose={() => setImporting(null)}
        />
      )}
    </div>
  );
}
