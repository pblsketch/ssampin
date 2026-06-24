import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  RECORD_AREA_LABELS,
  areasForContext,
  type RecordArea,
  type SchoolLevel,
} from '@domain/entities/RecordDraft';
import { EVIDENCE_SOURCE_LABELS, type RecordEvidence } from '@domain/entities/RecordEvidence';
import {
  useRecordEvidenceStore,
  type RecordEvidenceAddInput,
} from '@adapters/stores/useRecordEvidenceStore';
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

export function RecordEvidenceView({
  context,
  level,
  students,
  classId,
  className,
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

  const [activeTab, setActiveTab] = useState<ActiveTab>(areas[0] ?? 'autonomy');
  const [selectedRef, setSelectedRef] = useState<string>(students[0]?.studentRef ?? '');
  const [form, setForm] = useState<EvidenceForm | null>(null);
  const [importSource, setImportSource] = useState<ImportSource | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [excelMsg, setExcelMsg] = useState<string | null>(null);
  const [excelErrors, setExcelErrors] = useState<readonly EvidenceImportError[]>([]);
  const excelFileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void load();
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

  const selected = students.find((s) => s.studentRef === selectedRef);
  const activeArea: RecordArea | null = activeTab === UNCLASSIFIED ? null : activeTab;

  const studentEvidence = useMemo(
    () => records.filter((r) => r.studentRef === selectedRef),
    [records, selectedRef],
  );
  const tabEvidence = useMemo(
    () =>
      activeArea === null
        ? studentEvidence.filter((r) => r.areas.length === 0)
        : studentEvidence.filter((r) => r.areas.includes(activeArea)),
    [studentEvidence, activeArea],
  );

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
    } catch {
      setExcelMsg('엑셀을 읽는 중 오류가 발생했습니다(.xlsx 파일인지 확인하세요).');
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

  return (
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
                      <span className="material-symbols-outlined text-sm">group_add</span>학급 전체
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
                  <div
                    key={ev.id}
                    className="flex flex-col gap-2 rounded-lg border border-sp-border px-3 py-2.5"
                  >
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-sp-text">
                      {ev.content}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {ev.date ? (
                        <span className="text-[0.65rem] text-sp-muted">{shortDate(ev.date)}</span>
                      ) : null}
                      <span className="rounded bg-sp-surface px-1.5 py-0.5 text-[0.6rem] text-sp-muted">
                        {EVIDENCE_SOURCE_LABELS[ev.sourceType ?? 'manual']}
                      </span>
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
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
