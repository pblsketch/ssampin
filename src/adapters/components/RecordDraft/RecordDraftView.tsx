import { useEffect, useMemo, useRef, useState } from 'react';
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
  useRecordDraftsStore,
  type RecordDraftUpsertInput,
} from '@adapters/stores/useRecordDraftsStore';
import { RecordDraftExportModal } from '@adapters/components/Homeroom/Records/RecordDraftExportModal';

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
}: RecordDraftViewProps) {
  const author = context === 'homeroom' ? 'homeroom' : 'teaching';
  const areas = useMemo(() => areasForContext(level, author), [level, author]);
  const records = useRecordDraftsStore((s) => s.records);
  const load = useRecordDraftsStore((s) => s.load);
  const getDraft = useRecordDraftsStore((s) => s.getDraft);

  const [activeArea, setActiveArea] = useState<RecordArea>(areas[0] ?? 'autonomy');
  const [filter, setFilter] = useState<DraftFilter>('all');
  const [showExport, setShowExport] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  // 영역 집합이 바뀌면(학교급 변경 등) 활성 탭을 유효 범위로 보정.
  useEffect(() => {
    if (!areas.includes(activeArea)) setActiveArea(areas[0] ?? 'autonomy');
  }, [areas, activeArea]);

  const subject = areaSubject(activeArea, classSubject);
  const limit = resolveAreaLimit(activeArea, level);

  const draftFor = (studentRef: string): RecordDraft | undefined =>
    getDraft(activeArea, studentRef, subject);

  const writtenCount = students.filter(
    (s) => (draftFor(s.studentRef)?.content ?? '').trim().length > 0,
  ).length;

  const visibleStudents = students.filter((s) => {
    if (filter === 'all') return true;
    const d = draftFor(s.studentRef);
    if (filter === 'unwritten') return (d?.content ?? '').trim().length === 0;
    return d === undefined || d.status !== 'confirmed'; // unreviewed
  });

  const ctxChip =
    context === 'homeroom'
      ? { label: '🧑‍🏫 담임 작성 영역', cls: 'bg-sky-500/10 text-sky-500 ring-sky-500/20' }
      : { label: '📘 교과 작성 영역', cls: 'bg-violet-500/10 text-violet-500 ring-violet-500/20' };

  return (
    <div className="h-full flex flex-col rounded-xl bg-sp-card ring-1 ring-sp-border overflow-hidden">
      {/* 상단 바 — breadcrumb + 내보내기 + 컨텍스트 칩 */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-sp-border">
        <div className="text-sm text-sp-muted truncate">
          {className ? <span className="font-semibold text-sp-text">{className}</span> : null}
          <span className="mx-1.5">›</span>생활기록부 초안
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setShowExport(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-sp-muted ring-1 ring-sp-border hover:text-sp-text hover:bg-sp-surface transition-all"
        >
          <span className="material-symbols-outlined text-base">download</span>내보내기
        </button>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${ctxChip.cls}`}
        >
          {ctxChip.label}
        </span>
      </div>

      {/* 유형(영역) 탭 */}
      <div
        className="flex gap-1 px-3 border-b border-sp-border overflow-x-auto"
        role="tablist"
        aria-label="생활기록부 영역"
      >
        {areas.map((area) => {
          const cnt = students.filter(
            (s) =>
              (getDraft(area, s.studentRef, areaSubject(area, classSubject))?.content ?? '').trim()
                .length > 0,
          ).length;
          const on = area === activeArea;
          return (
            <button
              key={area}
              role="tab"
              aria-selected={on}
              onClick={() => setActiveArea(area)}
              className={`relative -mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm transition-colors ${
                on
                  ? 'border-sp-accent font-bold text-sp-text'
                  : 'border-transparent font-medium text-sp-muted hover:text-sp-text'
              }`}
            >
              {RECORD_AREA_LABELS[area]}
              {area === 'career' && (
                <span className="text-[0.65rem] font-semibold text-amber-500">700자</span>
              )}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold ${on ? 'bg-sp-accent/15 text-sp-accent' : 'bg-sp-surface text-sp-muted'}`}
              >
                {cnt}
              </span>
            </button>
          );
        })}
      </div>

      {/* 영역 정보 바 */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-sp-surface/50 border-b border-sp-border text-xs text-sp-muted">
        <span>
          📘 <b className="text-sp-text">{RECORD_AREA_LABELS[activeArea]}</b>
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
        <div className="ml-auto inline-flex overflow-hidden rounded-full ring-1 ring-sp-border text-[0.7rem] font-medium">
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

      {/* 학생 세로 스크롤 리스트 */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {visibleStudents.length === 0 ? (
          <p className="py-10 text-center text-sm text-sp-muted">표시할 학생이 없습니다.</p>
        ) : (
          visibleStudents.map((s) => (
            <RecordDraftRow
              key={`${s.studentRef}:${activeArea}:${subject ?? ''}`}
              student={s}
              area={activeArea}
              level={level}
              subject={subject}
              classId={classId}
              draft={draftFor(s.studentRef)}
            />
          ))
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
}: {
  student: RecordDraftStudentRow;
  area: RecordArea;
  level: SchoolLevel;
  subject?: string;
  classId?: string;
  draft?: RecordDraft;
}) {
  const upsert = useRecordDraftsStore((s) => s.upsert);
  const setStatus = useRecordDraftsStore((s) => s.setStatus);

  const [text, setText] = useState(draft?.content ?? '');
  const [focused, setFocused] = useState(false);
  const [showBasis, setShowBasis] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 외부(AI loopback)로 초안이 갱신되면 편집 중이 아닐 때 반영(자동 입력).
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

  const persist = (value: string): void => {
    const input: RecordDraftUpsertInput = {
      area,
      studentRef: student.studentRef,
      content: value,
      ...(classId !== undefined ? { classId } : {}),
      ...(student.studentKey !== undefined ? { studentKey: student.studentKey } : {}),
      ...(student.studentId !== undefined ? { studentId: student.studentId } : {}),
      ...(subject !== undefined ? { subject } : {}),
    };
    void upsert(input);
  };

  const onChange = (value: string): void => {
    setText(value);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persist(value), 700);
  };

  const flush = (): void => {
    setFocused(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (taRef.current) {
      try {
        localStorage.setItem(HEIGHT_KEY(student.studentRef, area), taRef.current.style.height);
      } catch {
        /* localStorage 불가 — 무시 */
      }
    }
    if (text.trim().length > 0 && text !== (draft?.content ?? '')) persist(text);
  };

  const status: RecordDraftStatus | null = draft?.status ?? null;
  const flags = draft?.groundingFlags ?? [];
  const hasRisk = flags.some((f) => f === 'unverified_high_risk_term' || f === 'pii_leak');

  const copyNeis = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* 클립보드 불가 — 무시 */
    }
  };

  return (
    <div className="grid grid-cols-[140px_1fr_128px] gap-3 border-b border-sp-border px-4 py-3">
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
            className={`w-fit rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${STATUS_META[status].cls}`}
            title="클릭하여 상태 변경 (작성 중 → 검토 중 → 검토 완료)"
          >
            {STATUS_META[status].label}
          </button>
        ) : (
          <span className="w-fit rounded-full bg-sp-surface px-2 py-0.5 text-[0.65rem] font-semibold text-sp-muted/70">
            초안 없음
          </span>
        )}
        {draft && draft.basisObservationIds.length > 0 && (
          <button
            type="button"
            onClick={() => setShowBasis((v) => !v)}
            className="flex w-fit items-center gap-1 text-[0.65rem] text-sp-muted"
          >
            🔗 근거{' '}
            <span className="font-semibold text-sp-accent">
              {draft.basisObservationIds.length}건
            </span>
            <span>{showBasis ? '▾' : '▸'}</span>
          </button>
        )}
      </div>

      {/* 입력창 + 근거/플래그 */}
      <div className="flex flex-col gap-1.5">
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={flush}
          placeholder="AI에게 초안을 요청하면 자동 입력됩니다 — 또는 직접 작성하세요"
          className="min-h-[48px] w-full resize-y rounded-lg border border-sp-border bg-sp-card px-3 py-2 text-sm leading-relaxed text-sp-text focus:border-sp-accent focus:outline-none focus:ring-2 focus:ring-sp-accent/30"
        />
        <p className="flex items-center gap-1 text-[0.65rem] text-sp-muted/70">
          입력창 우하단을 끌어 크기를 조절할 수 있습니다{' '}
          <span className="font-bold text-sp-accent">⤡</span>
        </p>
        {showBasis && draft && draft.basisObservationIds.length > 0 && (
          <div className="flex flex-wrap gap-1.5 text-[0.65rem] text-sp-muted">
            {draft.basisObservationIds.map((id) => (
              <span key={id} className="rounded-md bg-sp-surface px-2 py-1 ring-1 ring-sp-border">
                {id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id}
              </span>
            ))}
          </div>
        )}
        {flags.length > 0 && (
          <div
            className={`rounded-lg px-2.5 py-1.5 text-[0.7rem] leading-snug ring-1 ${
              hasRisk
                ? 'bg-red-500/5 text-red-500 ring-red-500/20'
                : 'bg-amber-500/5 text-amber-600 ring-amber-500/20'
            }`}
          >
            ⚠ 검토 필요 · {flags.join(', ')} — 모든 문장은 교사가 사실을 직접 확인해야 합니다.
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
          className="rounded-lg bg-sp-accent/10 px-3 py-1.5 text-xs font-medium text-sp-accent ring-1 ring-sp-accent/20 transition-colors hover:bg-sp-accent/20 disabled:opacity-40"
        >
          📋 복사
        </button>
      </div>
    </div>
  );
}
