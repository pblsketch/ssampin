import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  RECORD_AREA_LABELS,
  areasForContext,
  type RecordArea,
  type SchoolLevel,
} from '@domain/entities/RecordDraft';
import { EVIDENCE_SOURCE_LABELS, type RecordEvidence } from '@domain/entities/RecordEvidence';
import { detectProhibitedTerms, summarizeProhibited } from '@domain/rules/prohibitedRecordTerms';
import {
  countUnclassified,
  isClassified,
  suggestEvidenceForThread,
  suggestThreadsForEvidence,
} from '@domain/rules/threadSuggest';
import { topicMatchKeywords } from '@domain/rules/topicKeywordSources';
import {
  useRecordEvidenceStore,
  type RecordEvidenceAddInput,
} from '@adapters/stores/useRecordEvidenceStore';
import { useInquiryThreadStore } from '@adapters/stores/useInquiryThreadStore';
import {
  DraggableEvidence,
  InquiryThreadChips,
  parseEvidenceDragId,
  parseThreadDropId,
  THREAD_ALL,
  THREAD_UNCLASSIFIED,
  type ActiveThread,
} from '@adapters/components/RecordDraft/InquiryThreadChips';
import { InquiryThreadCreate } from '@adapters/components/RecordDraft/InquiryThreadCreate';
import { InquiryThreadPanel } from '@adapters/components/RecordDraft/InquiryThreadPanel';
import { trackEventSafely } from '@adapters/analytics/trackEventSafely';
import { useObservationStore } from '@adapters/stores/useObservationStore';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useRubricStore } from '@adapters/stores/useRubricStore';
import { useGradeAnalysisStore } from '@adapters/stores/useGradeAnalysisStore';
import { useObservationAttachmentStore } from '@adapters/stores/useObservationAttachmentStore';
import { useAssignmentStore } from '@adapters/stores/useAssignmentStore';
import {
  attachmentToEvidence,
  gradeToEvidence,
  rubricGradingToEvidence,
  semesterGradeToEvidence,
  submissionToEvidence,
  type ImportedEvidence,
} from '@usecases/studentRecords/evidenceImport';
import {
  mapExcelEvidenceRows,
  type EvidenceImportError,
} from '@usecases/studentRecords/importEvidenceFromExcel';
import {
  exportEvidenceTemplateToExcel,
  parseEvidenceFromExcel,
  ExcelReadError,
} from '@infrastructure/export/EvidenceExcel';

/** 작성주체(담임/교과) — 노출 영역 집합과 끌어오기 출처를 결정. */
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

interface RecordEvidenceViewProps {
  readonly context: RecordContext;
  readonly level: SchoolLevel;
  readonly students: readonly EvidenceStudentRow[];
  readonly classId?: string;
  readonly className?: string;
  /** 수업반 과목명 — 역량 키워드 예시 문구에 쓴다(담임이면 없음). */
  readonly classSubject?: string;
  /** true 면 자체 상단 바를 숨긴다(부모가 모드 토글 바를 제공할 때). */
  readonly headless?: boolean;
}

/** area 탭 + '미분류' 가상 탭. */
const UNCLASSIFIED = '__unclassified__';
type ActiveTab = RecordArea | typeof UNCLASSIFIED;

/** 끌어오기 출처 종류. */
type ImportSource =
  | 'observation'
  | 'studentRecord'
  | 'rubric'
  | 'grade'
  | 'attachment'
  | 'submission';

const SOURCES_BY_CONTEXT: Readonly<
  Record<RecordContext, readonly { id: ImportSource; label: string }[]>
> = {
  homeroom: [
    { id: 'studentRecord', label: '누가기록' },
    { id: 'submission', label: '과제물' },
  ],
  teaching: [
    { id: 'observation', label: '관찰기록' },
    { id: 'rubric', label: '수행평가' },
    { id: 'grade', label: '성적' },
    { id: 'attachment', label: '첨부파일' },
    { id: 'submission', label: '과제물' },
  ],
};

/** 끌어오기 후보 — 출처별 변환 결과를 공통 형태로. */
interface ImportCandidate {
  readonly sourceId: string;
  readonly label: string;
  readonly preview: string;
  readonly date?: string;
  readonly evidence: ImportedEvidence;
}

/** 폼 상태 — id=null 이면 신규 등록, 값이 있으면 해당 근거 수정. */
interface EvidenceForm {
  readonly id: string | null;
  content: string;
  areas: RecordArea[];
  date: string;
}

function todayStr(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** YYYY-MM-DD → 'M/D'. */
function shortDate(date?: string): string {
  if (!date) return '';
  const [, mm, dd] = date.split('-');
  return mm && dd ? `${Number(mm)}/${Number(dd)}` : date;
}

/** AI 제외 칩의 안내 문구 — 왜 빠졌는지(갈래)를 함께 알려 준다. */
function exclusionTitle(evidence: RecordEvidence): string {
  if (!evidence.excludedFromAi) return '이 근거를 AI에게 보내지 않도록 합니다.';
  const why = summarizeProhibited(detectProhibitedTerms(evidence.content));
  const reason = why.length > 0 ? ` — ${why.join(', ')}가 들어 있습니다` : '';
  return `이 근거는 AI에게 보내지 않습니다${reason}. 눌러서 보내도록 바꿉니다.`;
}

export function RecordEvidenceView({
  context,
  level,
  students,
  classId,
  className,
  classSubject,
  headless,
}: RecordEvidenceViewProps) {
  const author = context === 'homeroom' ? 'homeroom' : 'teaching';
  const areas = useMemo(() => areasForContext(level, author), [level, author]);
  const sources = SOURCES_BY_CONTEXT[context];

  const records = useRecordEvidenceStore((s) => s.records);
  const load = useRecordEvidenceStore((s) => s.load);
  const add = useRecordEvidenceStore((s) => s.add);
  const addMany = useRecordEvidenceStore((s) => s.addMany);
  const update = useRecordEvidenceStore((s) => s.update);
  const remove = useRecordEvidenceStore((s) => s.remove);
  const setExcludedFromAi = useRecordEvidenceStore((s) => s.setExcludedFromAi);

  // 끌어오기 출처 store
  const observations = useObservationStore((s) => s.records);
  const loadObservations = useObservationStore((s) => s.load);
  const studentRecords = useStudentRecordsStore((s) => s.records);
  const loadStudentRecords = useStudentRecordsStore((s) => s.load);
  const rubrics = useRubricStore((s) => s.rubrics);
  const gradings = useRubricStore((s) => s.gradings);
  const loadRubrics = useRubricStore((s) => s.load);
  const plans = useGradeAnalysisStore((s) => s.plans);
  const performanceResults = useGradeAnalysisStore((s) => s.performanceResults);
  const semesterResults = useGradeAnalysisStore((s) => s.semesterResults);
  const loadGrades = useGradeAnalysisStore((s) => s.load);
  const attachments = useObservationAttachmentStore((s) => s.attachments);
  const loadAttachments = useObservationAttachmentStore((s) => s.load);
  const submissions = useAssignmentStore((s) => s.submissions);
  const assignments = useAssignmentStore((s) => s.assignments);

  // ── 주제(탐구 흐름) 축 ──────────────────────────────────────
  const threads = useInquiryThreadStore((s) => s.records);
  const loadThreads = useInquiryThreadStore((s) => s.load);
  const addThread = useInquiryThreadStore((s) => s.add);
  const updateThread = useInquiryThreadStore((s) => s.update);
  const removeThread = useInquiryThreadStore((s) => s.remove);
  const setThread = useRecordEvidenceStore((s) => s.setThread);

  const [activeTab, setActiveTab] = useState<ActiveTab>(areas[0] ?? 'autonomy');
  const [selectedRef, setSelectedRef] = useState<string>(students[0]?.studentRef ?? '');
  const [form, setForm] = useState<EvidenceForm | null>(null);
  const [importSource, setImportSource] = useState<ImportSource | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [activeThread, setActiveThread] = useState<ActiveThread>(THREAD_ALL);
  /** 체크해서 한 번에 묶을 근거들. 학생·탭이 바뀌면 반드시 비운다(남의 학생 근거 오염 방지). */
  const [checked, setChecked] = useState<readonly string[]>([]);
  const [creatingThread, setCreatingThread] = useState(false);
  const [excelMsg, setExcelMsg] = useState<string | null>(null);
  const [excelErrors, setExcelErrors] = useState<readonly EvidenceImportError[]>([]);
  const excelFileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void load();
    void loadThreads();
    // 근거 창고를 열었다는 사실만 센다(값 없음) — "재료를 모으는 단계"가 실제로 쓰이는지 알기 위해.
    trackEventSafely('record_evidence_open', { context });
    if (context === 'teaching') {
      void loadObservations();
      void loadRubrics();
      void loadGrades();
      void loadAttachments();
    } else {
      void loadStudentRecords();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context]);

  // 영역 집합·학생 목록이 바뀌면 활성 선택을 유효 범위로 보정.
  useEffect(() => {
    if (activeTab !== UNCLASSIFIED && !areas.includes(activeTab)) {
      setActiveTab(areas[0] ?? 'autonomy');
    }
  }, [areas, activeTab]);
  useEffect(() => {
    if (!students.some((s) => s.studentRef === selectedRef)) {
      setSelectedRef(students[0]?.studentRef ?? '');
    }
  }, [students, selectedRef]);

  /**
   * ★학생이 바뀌면 주제 선택·체크를 **반드시** 비운다.
   *
   * Phase 2 에서 "고른 슬롯이 다음 학생에게 그대로 옮겨 붙은" 사고가 실제로 있었다. 주제는 학생마다
   * 다른 것이므로 앞 학생의 주제 id 가 남아 있으면 목록이 비거나(운 좋을 때) 남의 주제를 가리킨다.
   * 학생 목록 단추의 onClick 에서만 비우면 동기화·명단 변경으로 학생이 바뀌는 길을 놓친다 —
   * selectedRef 를 지켜보는 이 자리가 전수 방어선이다.
   */
  useEffect(() => {
    setActiveThread(THREAD_ALL);
    setChecked([]);
    setCreatingThread(false);
  }, [selectedRef]);

  // 영역 탭이 바뀌어도 체크는 비운다 — 안 보이는 근거가 체크된 채 "주제로 묶기"에 딸려 나가면 안 된다.
  useEffect(() => {
    setChecked([]);
  }, [activeTab]);

  const selected = students.find((s) => s.studentRef === selectedRef);
  const activeArea: RecordArea | null = activeTab === UNCLASSIFIED ? null : activeTab;

  const studentEvidence = useMemo(
    () => records.filter((r) => r.studentRef === selectedRef),
    [records, selectedRef],
  );
  const areaEvidence = useMemo(
    () =>
      activeArea === null
        ? studentEvidence.filter((r) => r.areas.length === 0)
        : studentEvidence.filter((r) => r.areas.includes(activeArea)),
    [studentEvidence, activeArea],
  );

  // ── 주제 축 파생값 ──────────────────────────────────────────
  /** 이 학생의 주제만. 다른 학생 주제는 애초에 손에 잡히지 않게 여기서 자른다. */
  const studentThreads = useMemo(
    () => threads.filter((t) => t.studentRef === selectedRef),
    [threads, selectedRef],
  );
  /** 실재하는 주제 id 집합 — 고아 threadId(동기화 시차)를 미분류로 보기 위한 것. */
  const threadIdSet = useMemo(() => new Set(threads.map((t) => t.id)), [threads]);

  const currentThread = useMemo(
    () => studentThreads.find((t) => t.id === activeThread) ?? null,
    [studentThreads, activeThread],
  );

  /** 주제 칩에 붙는 건수 — 현재 영역 안에서만 센다(탭을 옮기면 숫자도 그 탭의 것이 된다). */
  const countByThread = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of areaEvidence) {
      if (!isClassified(e, threadIdSet)) continue;
      const id = e.threadId!;
      m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  }, [areaEvidence, threadIdSet]);

  const areaUnclassifiedCount = useMemo(
    () => areaEvidence.filter((e) => !isClassified(e, threadIdSet)).length,
    [areaEvidence, threadIdSet],
  );

  /** 학생 전체(영역 무관) 미분류 건수 — 학생 목록·안내 배지가 쓴다. */
  const studentUnclassifiedCount = useMemo(
    () => countUnclassified(records, selectedRef, threadIdSet),
    [records, selectedRef, threadIdSet],
  );

  const tabEvidence = useMemo(() => {
    if (activeThread === THREAD_ALL) return areaEvidence;
    if (activeThread === THREAD_UNCLASSIFIED) {
      return areaEvidence.filter((e) => !isClassified(e, threadIdSet));
    }
    return areaEvidence.filter((e) => e.threadId === activeThread);
  }, [areaEvidence, activeThread, threadIdSet]);

  /** 현재 주제의 근거 — 흐름 화면의 줄기(영역 탭과 무관하게 그 주제 전부를 본다). */
  const currentThreadEvidence = useMemo(
    () => (currentThread ? studentEvidence.filter((e) => e.threadId === currentThread.id) : []),
    [studentEvidence, currentThread],
  );

  /**
   * "이것도 이 주제?" — 현재 주제의 키워드가 든 **미분류** 근거.
   * 키워드가 겹칠 때만 뜬다(AI 없음, 문자열 포함 검사). 이미 이 목록에 보이는 것은 뺀다.
   */
  const alsoThisTopic = useMemo(() => {
    if (!currentThread) return [];
    const shown = new Set(tabEvidence.map((e) => e.id));
    return suggestEvidenceForThread(currentThread, studentEvidence, threadIdSet)
      .filter((m) => !shown.has(m.evidenceId))
      .map((m) => {
        const ev = studentEvidence.find((e) => e.id === m.evidenceId);
        return ev ? { evidence: ev, matched: m.matched } : null;
      })
      .filter((x): x is { evidence: RecordEvidence; matched: readonly string[] } => x !== null);
  }, [currentThread, studentEvidence, threadIdSet, tabEvidence]);

  const countForTab = (tab: ActiveTab, ref: string): number =>
    records.filter(
      (r) =>
        r.studentRef === ref &&
        (tab === UNCLASSIFIED ? r.areas.length === 0 : r.areas.includes(tab)),
    ).length;

  // ── 끌어오기 후보 (출처 × 학생) ──────────────────────────────
  const candidatesFor = useMemo(
    () =>
      (student: EvidenceStudentRow, source: ImportSource): ImportCandidate[] => {
        if (source === 'studentRecord') {
          if (!student.studentId) return [];
          return studentRecords
            .filter((r) => r.studentId === student.studentId)
            .map((r) => ({
              sourceId: r.id,
              label: r.subcategory || r.category,
              preview: r.content,
              ...(r.date ? { date: r.date } : {}),
              evidence: {
                content: r.content,
                sourceType: 'studentRecord' as const,
                sourceId: r.id,
                ...(r.date ? { date: r.date } : {}),
                // 원본 슬롯을 이어받는다 — 창고에서 사라지면 AI 가 근거의 갈래를 잃는다.
                ...(r.slots && r.slots.length > 0 ? { slots: [...r.slots] } : {}),
              },
            }));
        }
        if (source === 'observation') {
          if (!student.studentKey || !classId) return [];
          return observations
            .filter((o) => o.studentId === student.studentKey && o.classId === classId)
            .map((o) => ({
              sourceId: o.id,
              label: o.tags.join(', ') || '관찰',
              preview: o.content,
              ...(o.date ? { date: o.date } : {}),
              evidence: {
                content: o.content,
                sourceType: 'observation' as const,
                sourceId: o.id,
                ...(o.date ? { date: o.date } : {}),
                ...(o.slots && o.slots.length > 0 ? { slots: [...o.slots] } : {}),
              },
            }));
        }
        if (source === 'rubric') {
          if (!student.studentKey || !classId) return [];
          return gradings
            .filter((g) => g.studentId === student.studentKey && g.classId === classId)
            .map((g) => {
              const rubric = rubrics.find((r) => r.id === g.rubricId);
              const ev = rubricGradingToEvidence(g, rubric);
              return {
                sourceId: g.id,
                label: rubric?.title ?? '수행평가',
                preview: ev.content,
                ...(ev.date ? { date: ev.date } : {}),
                evidence: ev,
              };
            });
        }
        if (source === 'grade') {
          if (!student.studentKey) return [];
          // 수행평가 결과의 교사 서술(점수 제외)
          const perfCands: ImportCandidate[] = performanceResults
            .filter(
              (p) =>
                p.studentKey === student.studentKey && (p.evidenceNote?.trim() || p.memo?.trim()),
            )
            .map((p) => {
              const plan = plans.find((pl) => pl.id === p.assessmentId);
              const ev = gradeToEvidence(p, plan);
              return {
                sourceId: p.id,
                label: plan?.subject ?? '평가',
                preview: ev.content,
                ...(ev.date ? { date: ev.date } : {}),
                evidence: ev,
              };
            });
          // 학기 성적의 성취도(A~E) — 점수·석차 숫자는 제외(transform 보장)
          const levelCands: ImportCandidate[] = semesterResults
            .filter(
              (r) =>
                r.studentKey === student.studentKey && (!classId || r.teachingClassId === classId),
            )
            .map((r) => semesterGradeToEvidence(r))
            .filter((ev): ev is NonNullable<typeof ev> => ev !== null)
            .map((ev) => ({
              sourceId: ev.sourceId,
              label: '성취도',
              preview: ev.content,
              evidence: ev,
            }));
          return [...perfCands, ...levelCands];
        }
        if (source === 'attachment') {
          if (!student.studentKey || !classId) return [];
          const obsIds = new Set(
            observations
              .filter((o) => o.studentId === student.studentKey && o.classId === classId)
              .map((o) => o.id),
          );
          return attachments
            .filter((a) => obsIds.has(a.observationId))
            .map((a) => {
              const ev = attachmentToEvidence(a);
              return {
                sourceId: a.id,
                label: a.source === 'student' ? '학생 제출물' : '교사 자료',
                preview: ev.content,
                ...(ev.date ? { date: ev.date } : {}),
                evidence: ev,
              };
            });
        }
        // submission — 과제 수합(Supabase) 로 불러온 in-memory 제출물에서 매칭.
        return submissions
          .filter(
            (sd) =>
              sd.submission &&
              (student.studentId
                ? sd.studentId === student.studentId
                : sd.studentNumber === student.number),
          )
          .map((sd) => {
            const sub = sd.submission!;
            const assignment = assignments.find((x) => x.id === sub.assignmentId);
            const ev = submissionToEvidence(sub, assignment);
            return {
              sourceId: sub.id,
              label: assignment?.title ?? '과제',
              preview: ev.content,
              ...(ev.date ? { date: ev.date } : {}),
              evidence: ev,
            };
          });
      },
    [
      studentRecords,
      observations,
      gradings,
      rubrics,
      performanceResults,
      semesterResults,
      plans,
      attachments,
      submissions,
      assignments,
      classId,
    ],
  );

  const candidates = useMemo(
    () => (selected && importSource ? candidatesFor(selected, importSource) : []),
    [selected, importSource, candidatesFor],
  );

  const importedSourceIds = useMemo(
    () => new Set(studentEvidence.map((e) => e.sourceId).filter((x): x is string => !!x)),
    [studentEvidence],
  );

  const flash = (text: string): void => {
    setMsg(text);
    setTimeout(() => setMsg(null), 2500);
  };

  // ── 주제 묶기 ───────────────────────────────────────────────
  /**
   * 근거를 주제로 묶거나 미분류로 되돌린다.
   *
   * ★**남의 학생 근거는 절대 묶이지 않는다.** 화면이 선택 학생 근거만 넘기지만, 여기서 한 번 더
   *   거른다(이중 방어). 도메인 순수 함수도 학생 경계를 보지만, 저장 관문 바로 앞이 마지막 문이다.
   */
  const linkToThread = async (evidenceIds: readonly string[], threadId: string | null) => {
    const mine = new Set(studentEvidence.map((e) => e.id));
    const safe = evidenceIds.filter((id) => mine.has(id));
    if (safe.length === 0) return;
    if (threadId !== null) {
      const target = studentThreads.find((t) => t.id === threadId);
      if (!target) return; // 이 학생의 주제가 아니면 아무것도 하지 않는다.
    }
    await setThread(safe, threadId);
    setChecked([]);
    flash(
      threadId === null
        ? `${safe.length}건을 미분류로 되돌렸습니다`
        : `${safe.length}건을 주제로 묶었습니다`,
    );
  };

  const onDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over) return;
    const evidenceId = parseEvidenceDragId(String(active.id));
    const dropTarget = parseThreadDropId(String(over.id));
    if (evidenceId === null || dropTarget === null) return;
    if (dropTarget === THREAD_ALL) return; // '전체'는 과녁이 아니다.
    // 체크된 것이 있고 끌린 카드도 그 안에 있으면 체크된 것을 한꺼번에 옮긴다.
    const ids = checked.includes(evidenceId) ? checked : [evidenceId];
    void linkToThread(ids, dropTarget === THREAD_UNCLASSIFIED ? null : dropTarget);
  };

  const createThread = async (title: string): Promise<void> => {
    if (!selected) return;
    // 매칭 키워드 초기값 — 루브릭 **요소** 이름이 주제 이름과 겹칠 때 자동으로 실어 준다.
    // ★요소 이름은 주제 이름이 아니라 매칭용이다(분석 §5-3-c 2).
    const criterionNames = rubrics
      .filter((r) => (classId ? r.classId === classId : true) && r.title === title)
      .flatMap((r) => r.criteria.map((c) => c.name));
    const id = await addThread({
      studentRef: selected.studentRef,
      title,
      keywords: topicMatchKeywords({ rubricCriterionNames: criterionNames }),
      ...(classId !== undefined ? { classId } : {}),
    });
    setCreatingThread(false);
    setActiveThread(id);
    // 체크해 둔 근거가 있으면 새 주제로 바로 묶는다(고르고 → 만들고 → 또 고르기를 없앤다).
    if (checked.length > 0) await linkToThread(checked, id);
  };

  /** 흐름 삭제 — 근거의 threadId 는 스토어가 안 지운다. 여기서 미분류로 풀고 지운다. */
  const deleteThread = async (threadId: string): Promise<void> => {
    const linked = studentEvidence.filter((e) => e.threadId === threadId).map((e) => e.id);
    if (linked.length > 0) await setThread(linked, null);
    await removeThread(threadId);
    setActiveThread(THREAD_ALL);
    flash(
      linked.length > 0
        ? `주제를 지우고 근거 ${linked.length}건을 미분류로 되돌렸습니다`
        : '주제를 지웠습니다',
    );
  };

  const toggleChecked = (id: string): void => {
    setChecked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  // ── 액션 ────────────────────────────────────────────────────
  const openAdd = (): void => {
    setForm({ id: null, content: '', areas: activeArea ? [activeArea] : [], date: todayStr() });
    setImportSource(null);
  };
  const openEdit = (ev: RecordEvidence): void => {
    setForm({ id: ev.id, content: ev.content, areas: [...ev.areas], date: ev.date ?? '' });
    setImportSource(null);
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
    if (!form || !selected) return;
    const content = form.content.trim();
    if (content.length === 0 || form.areas.length === 0) return;
    if (form.id === null) {
      await add({
        studentRef: selected.studentRef,
        areas: form.areas,
        content,
        sourceType: 'manual',
        ...(form.date ? { date: form.date } : {}),
        ...(classId !== undefined ? { classId } : {}),
      });
    } else {
      await update(form.id, { areas: form.areas, content, date: form.date });
    }
    setForm(null);
  };

  /** 근거 행에서 area 인라인 토글(수정 모드 없이 즉시 반영). */
  const toggleEvidenceArea = (ev: RecordEvidence, area: RecordArea): void => {
    const next = ev.areas.includes(area) ? ev.areas.filter((a) => a !== area) : [...ev.areas, area];
    void update(ev.id, { areas: next });
  };

  const importOne = async (c: ImportCandidate): Promise<void> => {
    if (!selected || !activeArea) return;
    await add({
      studentRef: selected.studentRef,
      areas: [activeArea],
      ...c.evidence,
      ...(classId !== undefined ? { classId } : {}),
    });
  };

  /** 현재 출처를 학급 전체 학생에 일괄 추가(중복 sourceId 제외). */
  const importWholeClass = async (): Promise<void> => {
    if (!activeArea || !importSource) return;
    const inputs: RecordEvidenceAddInput[] = [];
    for (const st of students) {
      const existing = new Set(
        records
          .filter((r) => r.studentRef === st.studentRef)
          .map((r) => r.sourceId)
          .filter((x): x is string => !!x),
      );
      for (const c of candidatesFor(st, importSource)) {
        if (existing.has(c.sourceId)) continue;
        inputs.push({
          studentRef: st.studentRef,
          areas: [activeArea],
          ...c.evidence,
          ...(classId !== undefined ? { classId } : {}),
        });
      }
    }
    const n = await addMany(inputs);
    flash(n > 0 ? `${n}건을 학급 전체에 추가했습니다` : '추가할 새 항목이 없습니다');
  };

  /** 관찰 기록 입력용 엑셀 양식 다운로드(명단 사전 채움). */
  const downloadTemplate = async (): Promise<void> => {
    try {
      const tplStudents = students.map((s) => ({
        studentRef: s.studentRef,
        number: s.number,
        name: s.name,
      }));
      const data = await exportEvidenceTemplateToExcel(tplStudents, className);
      const fileName = `근거자료_양식${className ? `_${className}` : ''}.xlsx`;
      if (window.electronAPI) {
        const saved = await window.electronAPI.showSaveDialog({
          title: '근거 자료 양식 내보내기',
          defaultPath: fileName,
          filters: [{ name: 'Excel 파일', extensions: ['xlsx'] }],
        });
        if (saved) {
          await window.electronAPI.writeFile(saved.handle, data);
          setExcelMsg('양식이 저장되었습니다');
        }
      } else {
        const blob = new Blob([data], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        setExcelMsg('양식이 다운로드되었습니다');
      }
      setExcelErrors([]);
    } catch {
      setExcelMsg('양식 생성 중 오류가 발생했습니다');
    }
  };

  /** 엑셀 업로드 → 파싱 → 매핑 → 미분류 근거로 일괄 등록. */
  const uploadExcel = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.name.endsWith('.xls') && !file.name.endsWith('.xlsx')) {
      setExcelMsg('구형 엑셀(.xls)은 지원되지 않습니다. .xlsx로 저장해 주세요.');
      setExcelErrors([]);
      e.target.value = '';
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      const rows = await parseEvidenceFromExcel(buffer);
      const { items, errors } = mapExcelEvidenceRows(rows, students);
      setExcelErrors(errors);
      if (items.length === 0) {
        setExcelMsg(
          errors.length > 0
            ? `등록된 근거 0건 · 오류 ${errors.length}건`
            : '등록할 관찰 내용이 없습니다(내용을 입력했는지 확인하세요).',
        );
        e.target.value = '';
        return;
      }
      const inputs: RecordEvidenceAddInput[] = items.map((it) => ({
        studentRef: it.studentRef,
        areas: [],
        content: it.content,
        sourceType: 'manual',
        ...(it.date ? { date: it.date } : {}),
        ...(classId !== undefined ? { classId } : {}),
      }));
      const n = await addMany(inputs);
      setExcelMsg(
        `${n}건을 미분류로 등록했습니다${errors.length > 0 ? ` · 오류 ${errors.length}건` : ''}. ‘미분류’ 탭에서 유형을 지정하세요.`,
      );
      setActiveTab(UNCLASSIFIED);
    } catch (err) {
      // 실제 예외를 콘솔에 표면화(차후 신고 시 즉시 진단 — 기존엔 통째로 삼켜 원인 추적 불가했음).
      console.error('[RecordEvidence] 엑셀 업로드 실패:', err);
      if (err instanceof ExcelReadError && err.kind === 'not-xlsx') {
        setExcelMsg(
          '유효한 .xlsx 파일이 아닙니다. Excel에서 ‘다른 이름으로 저장 → Excel 통합 문서(.xlsx)’로 다시 저장한 뒤 업로드하세요(구형 .xls·CSV·웹에서 받은 파일은 안 됩니다).',
        );
      } else {
        setExcelMsg('엑셀을 읽는 중 오류가 발생했습니다(.xlsx 파일인지 확인하세요).');
      }
      setExcelErrors([]);
    }
    e.target.value = '';
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

  const sourceLabel = sources.find((s) => s.id === importSource)?.label ?? '';

  // 카드 안의 단추(수정·삭제·체크)를 누를 때 드래그가 시작되지 않도록 5px 이동을 요구한다.
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  /**
   * 새 주제 이름 후보의 원천 — **수행평가 이름이 1순위**(오너 결정 2026-09-04).
   * 교사가 평가계획서에 이미 정해 둔 이름이라 학기 내내 같은 말로 부른다.
   * 성취기준 키워드는 T3 가 채우는 자리이며, 지금 없으면 그냥 후보에 안 뜬다.
   */
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

  return (
    <DndContext sensors={dndSensors} onDragEnd={onDragEnd}>
      <div className="flex h-full flex-col overflow-hidden rounded-xl bg-sp-card ring-1 ring-sp-border">
        {!headless && (
          <div className="flex items-center gap-3 border-b border-sp-border px-4 py-3">
            <div className="flex items-center gap-1.5 truncate">
              {className ? <span className="text-sm text-sp-muted">{className}</span> : null}
              {className ? <span className="text-sm text-sp-muted">›</span> : null}
              <h2 className="text-base font-bold text-sp-text">근거 자료</h2>
            </div>
            <div className="flex-1" />
            <span
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${ctxChip.cls}`}
            >
              <span className="material-symbols-outlined text-sm">{ctxChip.icon}</span>
              {ctxChip.label}
            </span>
          </div>
        )}

        {/* 영역(유형) 탭 + 미분류 */}
        <div
          className="flex gap-1 overflow-x-auto border-b border-sp-border px-3"
          role="tablist"
          aria-label="생활기록부 영역"
        >
          {[...areas, UNCLASSIFIED as ActiveTab].map((tab) => {
            const on = tab === activeTab;
            const cnt = selected ? countForTab(tab, selected.studentRef) : 0;
            const label = tab === UNCLASSIFIED ? '미분류' : RECORD_AREA_LABELS[tab];
            if (tab === UNCLASSIFIED && cnt === 0 && activeTab !== UNCLASSIFIED) return null; // 비어있으면 숨김
            return (
              <button
                key={tab}
                role="tab"
                aria-selected={on}
                onClick={() => {
                  setActiveTab(tab);
                  setForm(null);
                  setImportSource(null);
                }}
                className={`relative -mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm transition-colors ${
                  on
                    ? 'border-sp-accent font-bold text-sp-text'
                    : 'border-transparent font-medium text-sp-muted hover:text-sp-text'
                }`}
              >
                {label}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold ${on ? 'bg-sp-accent/15 text-sp-accent' : 'bg-sp-surface text-sp-muted'}`}
                >
                  {cnt}
                </span>
              </button>
            );
          })}
        </div>

        {/* 엑셀 일괄 등록 툴바 */}
        <div className="flex flex-wrap items-center gap-2 border-b border-sp-border px-4 py-2">
          <span className="material-symbols-outlined text-sm text-sp-muted">table_view</span>
          <span className="text-[0.7rem] text-sp-muted">엑셀로 관찰 기록 일괄 등록</span>
          {excelMsg ? (
            <span role="status" aria-live="polite" className="text-xs font-medium text-emerald-500">
              {excelMsg}
            </span>
          ) : null}
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => void downloadTemplate()}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-sp-muted ring-1 ring-sp-border transition-colors hover:bg-sp-surface hover:text-sp-text"
          >
            <span className="material-symbols-outlined text-sm">download</span>양식 다운로드
          </button>
          <button
            type="button"
            onClick={() => excelFileRef.current?.click()}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-sp-muted ring-1 ring-sp-border transition-colors hover:bg-sp-surface hover:text-sp-text"
          >
            <span className="material-symbols-outlined text-sm">upload_file</span>엑셀 업로드
          </button>
          <input
            ref={excelFileRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => void uploadExcel(e)}
          />
        </div>

        {/* 업로드 오류 상세 */}
        {excelErrors.length > 0 && (
          <div className="border-b border-sp-border bg-red-500/5 px-4 py-2">
            <p className="text-[0.7rem] font-semibold text-red-500">
              등록되지 않은 행 {excelErrors.length}건
            </p>
            <ul className="mt-1 max-h-24 overflow-y-auto">
              {excelErrors.slice(0, 20).map((err) => (
                <li key={err.rowNumber} className="text-[0.65rem] text-sp-muted">
                  {err.rowNumber}행: {err.reason}
                </li>
              ))}
              {excelErrors.length > 20 ? (
                <li className="text-[0.65rem] text-sp-muted">… 외 {excelErrors.length - 20}건</li>
              ) : null}
            </ul>
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          {/* 학생 목록 */}
          <div className="w-44 shrink-0 overflow-y-auto border-r border-sp-border">
            {students.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-sp-muted">학생이 없습니다.</p>
            ) : (
              students.map((s) => {
                const on = s.studentRef === selectedRef;
                const cnt = countForTab(activeTab, s.studentRef);
                return (
                  <button
                    key={s.studentRef}
                    type="button"
                    onClick={() => {
                      setSelectedRef(s.studentRef);
                      setForm(null);
                      setImportSource(null);
                    }}
                    className={`flex w-full items-center gap-2 border-b border-sp-border px-3 py-2.5 text-left text-sm transition-colors ${
                      on
                        ? 'bg-sp-accent/10 font-semibold text-sp-text'
                        : 'text-sp-muted hover:bg-sp-surface'
                    }`}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-sp-surface text-xs text-sp-muted">
                      {s.number}
                    </span>
                    <span className="truncate">{s.name}</span>
                    {cnt > 0 && (
                      <span className="ml-auto rounded-full bg-sp-accent/15 px-1.5 py-0.5 text-[0.65rem] font-semibold text-sp-accent">
                        {cnt}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* 선택 학생 근거 패널 */}
          <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
            {!selected ? (
              <p className="py-10 text-center text-sm text-sp-muted">학생을 선택하세요.</p>
            ) : (
              <div className="flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-sp-text">
                    {selected.name} · {activeArea ? RECORD_AREA_LABELS[activeArea] : '미분류'} 근거
                  </h3>
                  <span className="text-xs text-sp-muted">{tabEvidence.length}건</span>
                  {studentUnclassifiedCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveThread(THREAD_UNCLASSIFIED)}
                      title="아직 주제로 묶지 않은 근거입니다. 눌러서 모아 봅니다."
                      className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[0.65rem] font-semibold text-amber-600 ring-1 ring-amber-500/20 transition-colors hover:bg-amber-500/20"
                    >
                      미분류 {studentUnclassifiedCount}건
                    </button>
                  )}
                  {msg ? (
                    <span
                      role="status"
                      aria-live="polite"
                      className="text-xs font-medium text-emerald-500"
                    >
                      {msg}
                    </span>
                  ) : null}
                  <div className="flex-1" />
                  {activeArea && (
                    <button
                      type="button"
                      onClick={openAdd}
                      className="flex items-center gap-1 rounded-lg bg-sp-accent px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-sp-accent/90"
                    >
                      <span className="material-symbols-outlined text-sm">add</span>근거 등록
                    </button>
                  )}
                </div>

                {/* 주제(탐구 흐름) 축 — 영역 탭 안의 두 번째 축. 칩이 곧 끌어다 놓는 과녁이다. */}
                <InquiryThreadChips
                  threads={studentThreads}
                  active={activeThread}
                  totalCount={areaEvidence.length}
                  unclassifiedCount={areaUnclassifiedCount}
                  countByThread={countByThread}
                  onSelect={(next) => {
                    setActiveThread(next);
                    setCreatingThread(false);
                  }}
                  onNewThread={() => setCreatingThread(true)}
                />

                {creatingThread && (
                  <InquiryThreadCreate
                    sources={titleSources}
                    existingTitles={studentThreads.map((t) => t.title)}
                    onCreate={(title) => void createThread(title)}
                    onCancel={() => setCreatingThread(false)}
                  />
                )}

                {/* 고른 주제의 시간순 줄기 — 근거 목록 위에 펼친다(모달 아님). */}
                {currentThread && (
                  <InquiryThreadPanel
                    thread={currentThread}
                    evidence={currentThreadEvidence}
                    {...(classSubject !== undefined ? { subject: classSubject } : {})}
                    onPatch={(patch) => void updateThread(currentThread.id, patch)}
                    onRemove={() => void deleteThread(currentThread.id)}
                    onUnlink={(evidenceId) => void linkToThread([evidenceId], null)}
                  />
                )}

                {/* "이것도 이 주제?" — 키워드가 겹치는 미분류 근거만 (문자열 검사, AI 없음) */}
                {currentThread && alsoThisTopic.length > 0 && (
                  <div className="flex flex-col gap-1.5 rounded-lg bg-sp-card p-2.5 ring-1 ring-dashed ring-sp-accent/30">
                    <p className="text-[0.7rem] text-sp-muted">
                      <b className="text-sp-text">이것도 이 주제?</b> — ‘{currentThread.title}’의
                      키워드가 들어 있는 미분류 근거 {alsoThisTopic.length}건
                    </p>
                    {alsoThisTopic.slice(0, 5).map(({ evidence: ev, matched }) => (
                      <div
                        key={ev.id}
                        className="flex items-center gap-2 rounded-md bg-sp-surface px-2.5 py-1.5"
                      >
                        <span className="shrink-0 text-[0.6rem] text-sp-muted">
                          {shortDate(ev.date)}
                        </span>
                        {matched.map((k) => (
                          <span
                            key={k}
                            className="shrink-0 rounded bg-sp-accent/10 px-1.5 py-0.5 text-[0.6rem] font-medium text-sp-accent"
                          >
                            {k}
                          </span>
                        ))}
                        <span
                          className="min-w-0 flex-1 truncate text-xs text-sp-text"
                          title={ev.content}
                        >
                          {ev.content}
                        </span>
                        <button
                          type="button"
                          onClick={() => void linkToThread([ev.id], currentThread.id)}
                          className="shrink-0 rounded-md bg-sp-accent/10 px-2 py-1 text-[0.65rem] font-medium text-sp-accent ring-1 ring-sp-accent/20 transition-colors hover:bg-sp-accent/20"
                        >
                          이 주제로
                        </button>
                      </div>
                    ))}
                    {alsoThisTopic.length > 5 && (
                      <p className="text-[0.6rem] text-sp-muted">
                        … 외 {alsoThisTopic.length - 5}건 (‘미분류’ 칩에서 모두 볼 수 있습니다)
                      </p>
                    )}
                  </div>
                )}

                {/* 체크한 근거를 한 번에 묶기 */}
                {checked.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg bg-sp-accent/10 px-3 py-2 ring-1 ring-sp-accent/20">
                    <span className="text-xs font-semibold text-sp-accent">
                      {checked.length}건 선택됨
                    </span>
                    <span className="text-[0.65rem] text-sp-muted">주제로 묶기:</span>
                    {studentThreads
                      .filter((t) => t.status === 'open')
                      .map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => void linkToThread(checked, t.id)}
                          className="rounded-full bg-sp-card px-2.5 py-1 text-[0.7rem] font-medium text-sp-text ring-1 ring-sp-border transition-colors hover:bg-sp-accent/10 hover:text-sp-accent"
                        >
                          {t.title}
                        </button>
                      ))}
                    <button
                      type="button"
                      onClick={() => setCreatingThread(true)}
                      className="rounded-full px-2.5 py-1 text-[0.7rem] font-medium text-sp-accent ring-1 ring-dashed ring-sp-accent/40 transition-colors hover:bg-sp-accent/10"
                    >
                      + 새 주제로
                    </button>
                    <div className="flex-1" />
                    <button
                      type="button"
                      onClick={() => void linkToThread(checked, null)}
                      className="rounded-md px-2 py-1 text-[0.65rem] font-medium text-sp-muted ring-1 ring-sp-border hover:text-sp-text"
                    >
                      미분류로
                    </button>
                    <button
                      type="button"
                      onClick={() => setChecked([])}
                      className="rounded-md px-2 py-1 text-[0.65rem] font-medium text-sp-muted hover:text-sp-text"
                    >
                      선택 해제
                    </button>
                  </div>
                )}

                {/* 끌어오기 출처 선택 (미분류 탭에서는 숨김 — 분류 영역 필요) */}
                {activeArea && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-sp-muted">끌어오기:</span>
                    {sources.map((src) => (
                      <button
                        key={src.id}
                        type="button"
                        onClick={() => {
                          setImportSource((v) => (v === src.id ? null : src.id));
                          setForm(null);
                        }}
                        className={`rounded-full px-2.5 py-1 text-[0.7rem] font-medium ring-1 transition-colors ${
                          importSource === src.id
                            ? 'bg-sp-accent/15 text-sp-accent ring-sp-accent/30'
                            : 'text-sp-muted ring-sp-border hover:text-sp-text'
                        }`}
                      >
                        {src.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* 등록/수정 폼 */}
                {form && (
                  <div className="flex flex-col gap-2 rounded-lg bg-sp-surface p-3 ring-1 ring-sp-border">
                    <textarea
                      value={form.content}
                      onChange={(e) => setForm((f) => (f ? { ...f, content: e.target.value } : f))}
                      placeholder="이 학생의 생기부 작성 근거가 될 사실·활동·관찰을 적으세요."
                      className="min-h-[64px] w-full resize-y rounded-lg border border-sp-border bg-sp-card px-3 py-2 text-sm leading-relaxed text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none focus:ring-2 focus:ring-sp-accent/30"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-sp-muted">유형 분류</span>
                      {areas.map((area) => (
                        <button
                          key={area}
                          type="button"
                          onClick={() => toggleFormArea(area)}
                          className={`rounded-full px-2.5 py-1 text-[0.7rem] font-medium ring-1 transition-colors ${
                            form.areas.includes(area)
                              ? 'bg-sp-accent/15 text-sp-accent ring-sp-accent/30'
                              : 'text-sp-muted ring-sp-border hover:text-sp-text'
                          }`}
                        >
                          {RECORD_AREA_LABELS[area]}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={form.date}
                        onChange={(e) => setForm((f) => (f ? { ...f, date: e.target.value } : f))}
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
                        className="rounded-lg bg-sp-accent px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-sp-accent/90 disabled:opacity-40"
                      >
                        저장
                      </button>
                    </div>
                  </div>
                )}

                {/* 끌어오기 후보 패널 */}
                {importSource && activeArea && (
                  <div className="flex flex-col gap-1.5 rounded-lg bg-sp-surface p-3 ring-1 ring-sp-border">
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-sp-muted">
                        {sourceLabel}을(를){' '}
                        <b className="text-sp-text">{RECORD_AREA_LABELS[activeArea]}</b> 근거로 추가
                        (점수·성적 숫자는 제외됩니다)
                      </p>
                      <div className="flex-1" />
                      <button
                        type="button"
                        onClick={() => void importWholeClass()}
                        title="현재 출처를 학급 전체 학생에게 일괄 추가"
                        className="flex items-center gap-1 rounded-md bg-sp-accent/10 px-2 py-1 text-[0.65rem] font-medium text-sp-accent ring-1 ring-sp-accent/20 hover:bg-sp-accent/20"
                      >
                        <span className="material-symbols-outlined text-sm">group_add</span>학급
                        전체
                      </button>
                    </div>
                    {candidates.length === 0 ? (
                      <p className="py-3 text-center text-xs text-sp-muted">
                        {importSource === 'submission'
                          ? '불러온 제출물이 없습니다 — 과제 수합 탭에서 과제를 연 뒤 다시 시도하세요.'
                          : '끌어올 항목이 없습니다.'}
                      </p>
                    ) : (
                      candidates.map((c) => {
                        const already = importedSourceIds.has(c.sourceId);
                        return (
                          <div
                            key={c.sourceId}
                            className="flex items-center gap-2 rounded-md bg-sp-card px-2.5 py-1.5 ring-1 ring-sp-border"
                          >
                            <span className="shrink-0 text-[0.65rem] text-sp-muted">
                              {shortDate(c.date)}
                            </span>
                            {c.label ? (
                              <span className="shrink-0 rounded bg-sp-surface px-1.5 py-0.5 text-[0.6rem] text-sp-muted">
                                {c.label}
                              </span>
                            ) : null}
                            <span
                              className="min-w-0 flex-1 truncate text-xs text-sp-text"
                              title={c.preview}
                            >
                              {c.preview}
                            </span>
                            <button
                              type="button"
                              disabled={already}
                              onClick={() => void importOne(c)}
                              className="shrink-0 rounded-md bg-sp-accent/10 px-2 py-1 text-[0.65rem] font-medium text-sp-accent ring-1 ring-sp-accent/20 transition-colors hover:bg-sp-accent/20 disabled:opacity-40"
                            >
                              {already ? '추가됨' : '근거로 추가'}
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* 근거 목록 */}
                {tabEvidence.length === 0 && !form ? (
                  <p className="py-8 text-center text-sm text-sp-muted">
                    {activeArea
                      ? '이 영역의 근거가 아직 없습니다. ‘근거 등록’ 또는 ‘끌어오기’로 추가하세요.'
                      : '미분류 근거가 없습니다.'}
                  </p>
                ) : (
                  tabEvidence.map((ev) => (
                    <DraggableEvidence key={ev.id} evidenceId={ev.id}>
                      <div
                        className={`flex flex-col gap-2 rounded-lg border px-3 py-2.5 transition-colors ${
                          checked.includes(ev.id)
                            ? 'border-sp-accent bg-sp-accent/5'
                            : 'border-sp-border'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={checked.includes(ev.id)}
                            onChange={() => toggleChecked(ev.id)}
                            aria-label={`${ev.content.slice(0, 20)} 근거 선택`}
                            title="여러 건을 골라 한 번에 주제로 묶습니다. 카드를 주제 칩으로 끌어다 놓아도 됩니다."
                            className="mt-1 h-3.5 w-3.5 shrink-0 rounded accent-current text-sp-accent"
                          />
                          <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm leading-relaxed text-sp-text">
                            {ev.content}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {ev.date ? (
                            <span className="text-[0.65rem] text-sp-muted">
                              {shortDate(ev.date)}
                            </span>
                          ) : null}
                          {/* 어느 주제에 묶였는지 — 고아(없는 주제)는 미분류로 보인다. */}
                          {isClassified(ev, threadIdSet) && activeThread === THREAD_ALL && (
                            <button
                              type="button"
                              onClick={() => setActiveThread(ev.threadId!)}
                              className="rounded bg-sp-accent/10 px-1.5 py-0.5 text-[0.6rem] font-medium text-sp-accent"
                            >
                              {studentThreads.find((t) => t.id === ev.threadId)?.title ?? '주제'}
                            </button>
                          )}
                          <span className="rounded bg-sp-surface px-1.5 py-0.5 text-[0.6rem] text-sp-muted">
                            {EVIDENCE_SOURCE_LABELS[ev.sourceType ?? 'manual']}
                          </span>
                          {/* AI 전송 제외 — 기재 금지 항목이 섞이면 저장 시 자동으로 켜지고,
                          자동 판정은 오탐이 나므로 눌러서 되돌릴 수 있다(ADR-072 결정 5). */}
                          <button
                            type="button"
                            onClick={() => void setExcludedFromAi(ev.id, !ev.excludedFromAi)}
                            title={exclusionTitle(ev)}
                            className={`rounded px-1.5 py-0.5 text-[0.6rem] transition-colors ${
                              ev.excludedFromAi
                                ? 'bg-amber-500/15 text-amber-600'
                                : 'bg-sp-surface text-sp-muted hover:text-sp-text'
                            }`}
                          >
                            {ev.excludedFromAi ? 'AI 제외' : 'AI 전송'}
                          </button>
                          <div className="flex-1" />
                          <button
                            type="button"
                            onClick={() => openEdit(ev)}
                            className="rounded-md px-2 py-1 text-[0.65rem] font-medium text-sp-muted ring-1 ring-sp-border hover:text-sp-text"
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => void remove(ev.id)}
                            className="rounded-md px-2 py-1 text-[0.65rem] font-medium text-red-500 ring-1 ring-red-500/20 hover:bg-red-500/5"
                          >
                            삭제
                          </button>
                        </div>
                        {/* 주제 제안 — 미분류 근거에만. 주제 키워드가 본문에 있을 때만 뜬다(AI 없음). */}
                        {!isClassified(ev, threadIdSet) &&
                          (() => {
                            const hits = suggestThreadsForEvidence(ev, studentThreads);
                            if (hits.length === 0) return null;
                            return (
                              <div className="flex flex-wrap items-center gap-1.5 border-t border-dashed border-sp-accent/30 pt-2">
                                <span className="text-[0.6rem] text-sp-muted">이것도 이 주제?</span>
                                {hits.slice(0, 3).map((h) => (
                                  <button
                                    key={h.threadId}
                                    type="button"
                                    onClick={() => void linkToThread([ev.id], h.threadId)}
                                    title={`겹친 낱말: ${h.matched.join(', ')}`}
                                    className="rounded-full bg-sp-accent/10 px-2 py-0.5 text-[0.6rem] font-medium text-sp-accent ring-1 ring-sp-accent/20 transition-colors hover:bg-sp-accent/20"
                                  >
                                    {h.title}
                                    <span className="ml-1 text-sp-muted">{h.matched[0]}</span>
                                  </button>
                                ))}
                              </div>
                            );
                          })()}

                        {/* 유형 인라인 토글 (수정 모드 없이) */}
                        <div className="flex flex-wrap items-center gap-1.5 border-t border-sp-border pt-2">
                          <span className="text-[0.6rem] text-sp-muted">유형</span>
                          {areas.map((area) => {
                            const on = ev.areas.includes(area);
                            return (
                              <button
                                key={area}
                                type="button"
                                onClick={() => toggleEvidenceArea(ev, area)}
                                aria-pressed={on}
                                className={`rounded-full px-2 py-0.5 text-[0.6rem] font-medium ring-1 transition-colors ${
                                  on
                                    ? 'bg-sp-accent/15 text-sp-accent ring-sp-accent/30'
                                    : 'text-sp-muted ring-sp-border hover:text-sp-text'
                                }`}
                              >
                                {RECORD_AREA_LABELS[area]}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </DraggableEvidence>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </DndContext>
  );
}
