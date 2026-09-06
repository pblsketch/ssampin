import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  RECORD_AREA_LABELS,
  areasForContext,
  neisByteLength,
  resolveAreaLimit,
  isAreaLimitVerified,
  type RecordArea,
  type RecordDraft,
  type RecordDraftStatus,
  type SchoolLevel,
} from '@domain/entities/RecordDraft';
import {
  RecordDraftLimitError,
  useRecordDraftsStore,
  type RecordDraftUpsertInput,
} from '@adapters/stores/useRecordDraftsStore';
import { useObservationStore } from '@adapters/stores/useObservationStore';
import { registerDraftFlush } from '@adapters/components/RecordDraft/draftFlushRegistry';
import { useToastStore } from '@adapters/components/common/Toast';
import {
  resolveRecordFlowIntent,
  type RecordFlowIntent,
} from '@adapters/components/RecordDraft/recordFlowIntent';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { detectProhibitedTerms, summarizeProhibited } from '@domain/rules/prohibitedRecordTerms';
import { recordDraftFlagLabel } from '@domain/rules/recordDraftFlagLabels';
import { useRecordEvidenceStore } from '@adapters/stores/useRecordEvidenceStore';
import { useInquiryThreadStore } from '@adapters/stores/useInquiryThreadStore';
import { useRubricStore } from '@adapters/stores/useRubricStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useCurriculumStandards } from '@adapters/hooks/useCurriculumStandards';
import { standardKeywords, standardsForCodes } from '@domain/rules/curriculumStandardRules';
import { isClassified } from '@domain/rules/threadSuggest';
import type { ObservationRecord } from '@domain/entities/Observation';
import {
  NARRATIVE_ROLES,
  NARRATIVE_ROLE_LABELS,
  type RoleMark,
} from '@domain/rules/narrativeParagraphs';
import { RecordDraftExportModal } from '@adapters/components/Homeroom/Records/RecordDraftExportModal';
import { RecordEvidenceBoard } from '@adapters/components/RecordDraft/RecordEvidenceBoard';
import {
  useEvidenceCandidateCounts,
  useEvidenceCandidates,
} from '@adapters/hooks/useEvidenceCandidates';
import {
  RecordDraftAiPanel,
  type DraftTarget,
} from '@adapters/components/RecordDraft/RecordDraftAiPanel';
import {
  RecordDraftSidePanel,
  type SidePanelTab,
} from '@adapters/components/RecordDraft/RecordDraftSidePanel';
import {
  DRAFT_TEXT_METRICS,
  RoleHighlightLayer,
} from '@adapters/components/RecordDraft/RoleHighlightLayer';
import { ROLE_DOT } from '@adapters/components/RecordDraft/narrativeRoleStyles';
import { useAssistStore } from '@adapters/stores/useAssistStore';

import { rosterFromAll } from '@domain/rules/redactOutbound';

/** 작성주체(담임/교과) — 노출 영역 집합과 작성주체 결속을 결정. */
type RecordContext = 'homeroom' | 'teaching';

export interface RecordDraftStudentRow {
  /** 학생 신원 키(담임=Student.id / 수업반='tc:{classId}:{studentKey}'). */
  readonly studentRef: string;
  readonly number: number;
  readonly name: string;
  /** 담임 학생 id. */
  readonly studentId?: string;
  /** 수업반 학생 번호 키. */
  readonly studentKey?: string;
}

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
  /** 명단이 실제로 로드됐는지. false 면 요청 판정을 미룬다(없는 학생으로 단정하지 않는다). */
  readonly rosterLoaded?: boolean;
}

type DraftFilter = 'all' | 'unwritten' | 'unreviewed';

const FILTERS: { id: DraftFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'unwritten', label: '미작성' },
  { id: 'unreviewed', label: '검토 전' },
];

const STATUS_META: Record<RecordDraftStatus, { label: string; cls: string }> = {
  draft: { label: '작성 중', cls: 'bg-sp-surface text-sp-muted' },
  reviewing: { label: '검토 중', cls: 'bg-amber-500/15 text-amber-500' },
  confirmed: { label: '검토 완료', cls: 'bg-emerald-500/15 text-emerald-500' },
};

const NEXT_STATUS: Record<RecordDraftStatus, RecordDraftStatus> = {
  draft: 'reviewing',
  reviewing: 'confirmed',
  confirmed: 'draft',
};

/** 검토 플래그 라벨은 도메인(`recordDraftFlagLabels.ts`)이 정본 — 점검 규칙이 늘어도 이 파일은 안 바뀐다. */
const flagLabel = recordDraftFlagLabel;

/** 관찰기록 날짜(YYYY-MM-DD) → 'M/D'. */
function formatObsDate(date: string): string {
  const [, mm, dd] = date.split('-');
  return mm && dd ? `${Number(mm)}/${Number(dd)}` : date;
}

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
  rosterLoaded = true,
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

  /** 형광펜 스위치 — 설정에 기억한다. 켰을 때만 색·범례가 보인다. */
  const highlightOn = useSettingsStore((s) => s.settings.recordHighlightOn === true);
  const updateSettings = useSettingsStore((s) => s.update);

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
      consumedIntentsRef.current.add(resolution.intent.requestId);
      setSelectedStudentRef(resolution.intent.studentRef);
      onFlowIntentConsumed?.(resolution.intent.requestId);
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
   */
  const [aiActiveRefs, setAiActiveRefs] = useState<ReadonlySet<string>>(() => new Set());
  const setAiActive = useCallback((refs: readonly string[]) => {
    setAiActiveRefs((prev) => {
      if (prev.size === refs.length && refs.every((r) => prev.has(r))) return prev;
      return new Set(refs);
    });
  }, []);

  const visibleStudents = students.filter((s) => {
    if (filter === 'all') return true;
    if (aiActiveRefs.has(s.studentRef)) return true; // 실행 중인 행은 필터를 무시하고 남긴다
    const d = draftFor(s.studentRef);
    if (filter === 'unwritten') return (d?.content ?? '').trim().length === 0;
    return d === undefined || d.status !== 'confirmed'; // unreviewed
  });

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
  }, []);
  const openAiFor = (studentRef: string): void => {
    setSelectedStudentRef(studentRef);
    setSideTab('ai');
  };
  const openBoardFor = (studentRef: string): void => {
    setSelectedStudentRef(studentRef);
    setViewMode('evidence');
  };

  // ── 파워유저 가속 ─────────────────────────────────────────
  const listRef = useRef<HTMLDivElement | null>(null);
  const tablistRef = useRef<HTMLDivElement | null>(null);
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
    <div className="h-full flex flex-col rounded-xl bg-sp-card ring-1 ring-sp-border overflow-hidden">
      {/* 상단 바 — breadcrumb + 모드 토글 + 형광펜 + (초안)복사·내보내기 + 컨텍스트 칩 */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-sp-border">
        <div className="flex items-center gap-1.5 truncate">
          {className ? <span className="text-sm text-sp-muted">{className}</span> : null}
          {className ? <span className="text-sm text-sp-muted">›</span> : null}
          <h2 className="text-base font-bold text-sp-text">
            {viewMode === 'draft' ? '생활기록부 초안' : '근거 정리'}
          </h2>
        </div>
        {/* 초안 ↔ 근거 정리 서브페이지 토글 */}
        <div className="inline-flex overflow-hidden rounded-full text-xs font-medium ring-1 ring-sp-border">
          <button
            type="button"
            onClick={() => setViewMode('draft')}
            className={`px-3 py-1 transition-colors ${viewMode === 'draft' ? 'bg-sp-accent text-white' : 'text-sp-muted hover:text-sp-text'}`}
          >
            초안
          </button>
          <button
            type="button"
            onClick={() => setViewMode('evidence')}
            className={`px-3 py-1 transition-colors ${viewMode === 'evidence' ? 'bg-sp-accent text-white' : 'text-sp-muted hover:text-sp-text'}`}
          >
            근거 정리
          </button>
        </div>
        {viewMode === 'draft' && (
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-sp-muted">
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-sp-muted ring-1 ring-sp-border hover:text-sp-text hover:bg-sp-surface transition-all"
            >
              <span className="material-symbols-outlined text-base">content_copy</span>영역 전체
              복사
            </button>
            <button
              type="button"
              onClick={() => setShowExport(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-sp-muted ring-1 ring-sp-border hover:text-sp-text hover:bg-sp-surface transition-all"
            >
              <span className="material-symbols-outlined text-base">download</span>내보내기
            </button>
          </>
        )}
        <span
          className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${ctxChip.cls}`}
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
            {/* 형광펜 범례 — 켰을 때만 */}
            {highlightOn && (
              <span className="inline-flex items-center gap-2" aria-label="형광펜 범례">
                {NARRATIVE_ROLES.map((r) => (
                  <span key={r} className="inline-flex items-center gap-1">
                    <span className={`h-2 w-2 rounded-full ${ROLE_DOT[r]}`} />
                    {NARRATIVE_ROLE_LABELS[r]}
                  </span>
                ))}
              </span>
            )}
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

          <div className="flex min-h-0 flex-1">
            <div className="flex min-w-0 flex-1 flex-col">
              {/* 입력창 안내 — 목록 전체에 1회만 노출(행마다 반복 제거) */}
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-1.5 text-xs text-sp-muted border-b border-sp-border">
                <span className="inline-flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">open_in_full</span>
                  입력창 우하단을 끌어 크기를 조절할 수 있습니다.
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">keyboard_return</span>
                  <kbd className="rounded bg-sp-surface px-1 font-semibold text-sp-text">
                    Ctrl+Enter
                  </kbd>
                  로 다음 학생 칸으로 이동합니다.
                </span>
              </p>

              {/* 학생 세로 스크롤 리스트 */}
              <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto">
                {visibleStudents.length === 0 ? (
                  <p className="py-10 text-center text-sm text-sp-muted">표시할 학생이 없습니다.</p>
                ) : (
                  visibleStudents.map((s, i) => (
                    <RecordDraftRow
                      key={`${s.studentRef}:${activeArea}:${subject ?? ''}`}
                      student={s}
                      area={activeArea}
                      level={level}
                      subject={subject}
                      classId={classId}
                      draft={draftFor(s.studentRef)}
                      index={i}
                      selected={s.studentRef === selectedStudentRef}
                      mirrorCount={mirrorCounts.get(s.studentRef) ?? 0}
                      highlightOn={highlightOn}
                      showAiButton={ownAiEnabled}
                      {...(standardTexts !== undefined ? { standardTexts } : {})}
                      onSelect={selectStudent}
                      onOpenAi={openAiFor}
                      onOpenBoard={openBoardFor}
                      onJumpNext={() => focusRowTextarea(i + 1)}
                    />
                  ))
                )}
              </div>
            </div>

            {/* 오른쪽 패널 — 고른 학생의 [AI 초안 | 근거] */}
            <RecordDraftSidePanel
              studentName={selectedStudent?.name ?? null}
              area={activeArea}
              tab={sideTab}
              onTabChange={setSideTab}
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
                    roster={roster}
                    target={aiTarget}
                    threads={selectedThreads}
                    studentEvidences={selectedEvidences}
                    remaining={aiRemaining}
                    draftKey={aiDraftKey}
                    {...(selectedDraft?.roleMarks !== undefined
                      ? { existingRoleMarks: selectedDraft.roleMarks }
                      : {})}
                    highlightOn={highlightOn}
                    onApply={applyAiDraft}
                    onRemark={remarkDraft}
                    onActiveChange={setAiActive}
                    onFocusStudent={selectStudent}
                  />
                ) : null
              }
            />
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

// ───────────────────────── 학생 1행 ─────────────────────────

const HEIGHT_KEY = (studentRef: string, area: RecordArea): string => `rd-h:${studentRef}:${area}`;

function RecordDraftRow({
  student,
  area,
  level,
  subject,
  classId,
  draft,
  index,
  selected,
  mirrorCount,
  highlightOn,
  showAiButton,
  standardTexts,
  onSelect,
  onOpenAi,
  onOpenBoard,
  onJumpNext,
}: {
  student: RecordDraftStudentRow;
  area: RecordArea;
  level: SchoolLevel;
  subject?: string;
  classId?: string;
  draft?: RecordDraft;
  index: number;
  /** 오른쪽 패널이 보고 있는 학생인가. */
  selected: boolean;
  /** 거울 카드 수 — 저장 미분류에 더해 [미분류 N건]을 만든다. */
  mirrorCount: number;
  /** 형광펜 스위치 — 켜져 있을 때만 편집 칸 뒤에 거울 레이어를 깐다. */
  highlightOn: boolean;
  /** [AI ▸] 버튼 노출 — 실험실 스위치(내 AI로 실행)를 켠 선생님에게만. */
  showAiButton: boolean;
  /** 이 수업반이 가르친 성취기준 원문 — 복사 검사에만 쓴다(AI 에는 안 간다). */
  standardTexts?: readonly string[];
  onSelect: (studentRef: string) => void;
  onOpenAi: (studentRef: string) => void;
  onOpenBoard: (studentRef: string) => void;
  onJumpNext: () => void;
}) {
  const upsert = useRecordDraftsStore((s) => s.upsert);
  const setStatus = useRecordDraftsStore((s) => s.setStatus);

  const [text, setText] = useState(draft?.content ?? '');
  const [focused, setFocused] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  /** 저장이 거부된 이유(한도 초과 등). 조용한 실패를 만들지 않기 위한 자리. */
  const [saveError, setSaveError] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 외부(AI 패널·loopback)로 초안이 갱신되면 편집 중이 아닐 때 반영(자동 입력).
  useEffect(() => {
    if (!focused) setText(draft?.content ?? '');
  }, [draft?.content, draft?.updatedAt, focused]);

  // 저장된 입력창 높이 복원.
  useEffect(() => {
    const saved = (() => {
      try {
        return localStorage.getItem(HEIGHT_KEY(student.studentRef, area));
      } catch {
        return null;
      }
    })();
    if (saved && taRef.current) taRef.current.style.height = saved;
  }, [student.studentRef, area]);

  const limit = resolveAreaLimit(area, level);
  const bytes = neisByteLength(text);
  const ratio = limit > 0 ? bytes / limit : 0;
  const verified = isAreaLimitVerified(area, level);
  const byteCls =
    bytes > limit && verified ? 'text-red-500' : ratio > 0.8 ? 'text-amber-500' : 'text-sp-muted';
  const barCls =
    bytes > limit && verified ? 'bg-red-500' : ratio > 0.8 ? 'bg-amber-500' : 'bg-emerald-500';

  const persist = (value: string): Promise<boolean> => {
    const input: RecordDraftUpsertInput = {
      area,
      studentRef: student.studentRef,
      content: value,
      ...(classId !== undefined ? { classId } : {}),
      ...(student.studentKey !== undefined ? { studentKey: student.studentKey } : {}),
      ...(student.studentId !== undefined ? { studentId: student.studentId } : {}),
      ...(subject !== undefined ? { subject } : {}),
      // 성취기준 복사 검사용. 없으면 칸을 만들지 않는다 — T4 는 부재를 'skipped' 로 정직히 보고한다.
      ...(standardTexts !== undefined && standardTexts.length > 0 ? { standardTexts } : {}),
      level,
    };
    setSaveState('saving');
    setSaveError(null);
    // 성공 여부를 돌려준다 - 화면 이동이 이 값을 기다린다(계획 §4.3). 실패하면 이동하지 않는다.
    return upsert(input)
      .then(() => {
        setSaveState('saved');
        return true;
      })
      .catch((err: unknown) => {
        setSaveState('idle');
        // 조용히 삼키면 선생님은 저장된 줄 안다. 한도 초과는 이유를 그대로 보여 준다.
        setSaveError(err instanceof RecordDraftLimitError ? err.message : '저장하지 못했습니다.');
        return false;
      });
  };

  const onChange = (value: string): void => {
    setText(value);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persist(value), 700);
  };

  const flush = (): Promise<boolean> => {
    setFocused(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (taRef.current) {
      try {
        localStorage.setItem(HEIGHT_KEY(student.studentRef, area), taRef.current.style.height);
      } catch {
        /* localStorage 불가 - 무시 */
      }
    }
    // 저장할 것이 없으면 성공으로 본다(대기분 없음).
    if (text.trim().length > 0 && text !== (draft?.content ?? '')) return persist(text);
    return Promise.resolve(true);
  };

  // ★이동 전에 대기분을 밀어 넣을 수 있게 등록한다(계획 §4.3). 등록은 마운트당 한 번이고,
  //   실제로 부를 때는 ref 를 통해 **가장 최신 flush** 를 쓴다 - 매 렌더마다 등록/해제하면
  //   이동이 걸린 순간 등록이 잠깐 비어 저장을 놓친다.
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => registerDraftFlush(() => flushRef.current()), []);

  const status: RecordDraftStatus | null = draft?.status ?? null;
  // ?? [] 는 매 렌더 새 배열을 만든다 — 아래 useMemo 의 의존이 매번 바뀌므로 memo 로 고정한다.
  const flags = useMemo(() => draft?.groundingFlags ?? [], [draft?.groundingFlags]);
  const hasRisk = flags.some(
    (f) => f === 'unverified_high_risk_term' || f === 'pii_leak' || f === 'prohibited_item',
  );
  // 무엇이 걸렸는지까지 보여 준다 — "적으면 안 되는 항목"만으로는 어디를 고쳐야 할지 알 수 없다.
  const prohibitedWhy = useMemo(
    () =>
      flags.includes('prohibited_item') ? summarizeProhibited(detectProhibitedTerms(text)) : [],
    [flags, text],
  );

  // 근거 준비도(US-4) — 현재 영역의 근거 건수·최근 날짜 + 미분류 건수(보드로 가는 버튼).
  const evidenceRecords = useRecordEvidenceStore((s) => s.records);
  const evidenceForArea = useMemo(
    () =>
      evidenceRecords.filter((e) => e.studentRef === student.studentRef && e.areas.includes(area)),
    [evidenceRecords, student.studentRef, area],
  );
  const evidenceCount = evidenceForArea.length;
  const allThreads = useInquiryThreadStore((s) => s.records);
  const threadIdSet = useMemo(() => new Set(allThreads.map((t) => t.id)), [allThreads]);
  // 저장 미분류 + 거울(아직 근거로 안 넣은 원본) — 보드의 미분류 열과 같은 수.
  const unclassifiedCount = useMemo(
    () =>
      evidenceRecords.filter(
        (e) => e.studentRef === student.studentRef && !isClassified(e, threadIdSet),
      ).length + mirrorCount,
    [evidenceRecords, student.studentRef, threadIdSet, mirrorCount],
  );

  const recentEvidenceDate = useMemo(() => {
    let best = '';
    for (const e of evidenceForArea) {
      const d = e.date ?? '';
      if (d > best) best = d;
    }
    return best;
  }, [evidenceForArea]);
  const needsReview = !!draft && (draft.status === 'reviewing' || flags.length > 0);

  const copyNeis = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* 클립보드 불가 — 무시 */
    }
  };

  const showLayer = highlightOn && draft?.roleMarks !== undefined && draft.roleMarks.length > 0;

  return (
    <div
      onClick={() => onSelect(student.studentRef)}
      className={`grid grid-cols-[140px_1fr_128px] gap-3 border-b border-sp-border px-4 py-3 transition-colors ${
        selected ? 'bg-blue-500/5' : ''
      }`}
    >
      {/* 학생 + 상태 + 근거 */}
      <div className="flex flex-col gap-2 pt-0.5">
        <div className="flex items-center gap-2 text-sm font-semibold text-sp-text">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-sp-surface text-xs text-sp-muted">
            {student.number}
          </span>
          {student.name}
        </div>
        {status ? (
          <button
            type="button"
            onClick={() => draft && void setStatus(draft.id, NEXT_STATUS[status])}
            className={`w-fit rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_META[status].cls}`}
            title="클릭하여 상태 변경 (작성 중 → 검토 중 → 검토 완료)"
          >
            {STATUS_META[status].label}
          </button>
        ) : (
          <span className="w-fit rounded-full bg-sp-surface px-2 py-0.5 text-xs font-semibold text-sp-muted">
            초안 없음
          </span>
        )}
        {/* 근거 준비도(US-4): 근거 창고 건수·최근 날짜 — 이 행의 "근거 N건"은 이것 하나뿐이다(P5). */}
        <span className="inline-flex items-center gap-0.5 text-xs text-sp-muted">
          <span className="material-symbols-outlined text-xs">inventory_2</span>
          근거{' '}
          <b className={evidenceCount > 0 ? 'text-sp-accent' : 'text-sp-muted'}>
            {evidenceCount}건
          </b>
          {recentEvidenceDate ? ` · 최근 ${formatObsDate(recentEvidenceDate)}` : ''}
        </span>
        {unclassifiedCount > 0 && (
          <button
            type="button"
            onClick={() => onOpenBoard(student.studentRef)}
            title="아직 주제로 묶지 않은 근거입니다. 눌러서 근거 정리 보드로 갑니다."
            className="w-fit rounded-full bg-sp-surface px-2 py-0.5 text-xs font-medium text-sp-muted ring-1 ring-sp-border hover:text-sp-text"
          >
            미분류 {unclassifiedCount}건
          </button>
        )}
        {needsReview && (
          <span className="w-fit rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-600">
            검토 필요
          </span>
        )}
        {showAiButton && (
          <button
            type="button"
            onClick={() => onOpenAi(student.studentRef)}
            aria-label={`${student.name} AI 초안`}
            className="flex w-fit items-center gap-1 rounded-md bg-sp-card px-2 py-1 text-xs font-medium text-sp-accent ring-1 ring-sp-border hover:bg-sp-surface"
          >
            <span className="material-symbols-outlined text-sm">auto_awesome</span>AI ▸
          </button>
        )}
      </div>

      {/* 입력창 + 플래그 */}
      <div className="flex flex-col gap-1.5">
        <div className="relative">
          {showLayer && <RoleHighlightLayer ref={layerRef} text={text} marks={draft?.roleMarks} />}
          <textarea
            ref={taRef}
            value={text}
            data-rd-index={index}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => {
              setFocused(true);
              onSelect(student.studentRef);
            }}
            onBlur={flush}
            onScroll={(e) => {
              if (layerRef.current) layerRef.current.scrollTop = e.currentTarget.scrollTop;
            }}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                onJumpNext(); // 다음 입력창으로 포커스 이동 → 현재 칸 blur+자동저장
              }
            }}
            aria-label={`${student.name} ${RECORD_AREA_LABELS[area]} 초안`}
            placeholder="AI에게 초안을 요청하면 자동 입력됩니다: 또는 직접 작성하세요"
            className={`relative min-h-[48px] w-full resize-y border-sp-border text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${DRAFT_TEXT_METRICS} ${
              showLayer ? 'bg-transparent' : 'bg-sp-surface'
            }`}
          />
        </div>
        {saveError !== null && (
          <div className="flex items-start gap-1 rounded-lg bg-red-500/5 px-2.5 py-1.5 text-xs leading-snug text-red-500 ring-1 ring-red-500/20">
            <span className="material-symbols-outlined text-sm">error</span>
            <span>{saveError}</span>
          </div>
        )}
        {saveState !== 'idle' && (
          <span
            className={`flex w-fit items-center gap-1 text-xs ${
              saveState === 'saved' ? 'text-emerald-500' : 'text-sp-muted'
            }`}
          >
            <span className="material-symbols-outlined text-xs">
              {saveState === 'saved' ? 'check_circle' : 'sync'}
            </span>
            {saveState === 'saved' ? '저장됨' : '저장 중…'}
          </span>
        )}
        {flags.length > 0 && (
          <div
            className={`flex items-start gap-1 rounded-lg px-2.5 py-1.5 text-xs leading-snug ring-1 ${
              hasRisk
                ? 'bg-red-500/5 text-red-500 ring-red-500/20'
                : 'bg-amber-500/5 text-amber-600 ring-amber-500/20'
            }`}
          >
            <span className="material-symbols-outlined text-sm">warning</span>
            <span>
              검토 필요 · {flags.map(flagLabel).join(', ')}
              {prohibitedWhy.length > 0 ? ` (${prohibitedWhy.join(', ')})` : ''}: 모든 문장은 교사가
              사실을 직접 확인해야 합니다.
            </span>
          </div>
        )}
      </div>

      {/* 바이트 카운터 + 복사 */}
      <div className="flex flex-col items-end gap-2 pt-0.5">
        <span className={`whitespace-nowrap text-xs font-semibold tabular-nums ${byteCls}`}>
          {bytes.toLocaleString()} / {limit.toLocaleString()} B
        </span>
        <span className="h-1 w-full overflow-hidden rounded-full bg-sp-border">
          <span
            className={`block h-full rounded-full ${barCls}`}
            style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
          />
        </span>
        <button
          type="button"
          onClick={() => void copyNeis()}
          disabled={text.trim().length === 0}
          className="flex items-center gap-1 rounded-lg bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-sp-accent ring-1 ring-blue-500/20 transition-colors hover:bg-blue-500/20 disabled:opacity-40"
        >
          <span className="material-symbols-outlined text-sm">content_copy</span>복사
        </button>
      </div>
    </div>
  );
}
