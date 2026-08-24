import { useEffect, useMemo, useRef, useState } from 'react';
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
import { detectProhibitedTerms, summarizeProhibited } from '@domain/rules/prohibitedRecordTerms';
import { useRecordEvidenceStore } from '@adapters/stores/useRecordEvidenceStore';
import type { ObservationRecord } from '@domain/entities/Observation';
import { RecordDraftExportModal } from '@adapters/components/Homeroom/Records/RecordDraftExportModal';
import { RecordEvidenceView } from '@adapters/components/RecordDraft/RecordEvidenceView';

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

/** AI 브릿지 검토 플래그 코드 → 교사용 한국어 라벨(현실 언어 일치). 미지값은 일반 라벨로 폴백. */
const FLAG_LABELS: Record<string, string> = {
  // NEIS 에 들어가면 감사 대상이 되는 항목이 본문에 남아 있다는 뜻. 막지는 않는다(오탐 대비) —
  // 대신 가장 눈에 띄게 띄우고 무엇이 걸렸는지 아래에 적어 준다.
  prohibited_item: '생기부에 적으면 안 되는 항목',
  unverified_high_risk_term: '확인되지 않은 고위험 표현',
  pii_leak: '개인정보 노출 우려',
  low_overlap: '근거와 일치도 낮음',
};
const flagLabel = (flag: string): string => FLAG_LABELS[flag] ?? '기타 확인 필요 항목';

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
}: RecordDraftViewProps) {
  const author = context === 'homeroom' ? 'homeroom' : 'teaching';
  const areas = useMemo(() => areasForContext(level, author), [level, author]);
  const records = useRecordDraftsStore((s) => s.records);
  const load = useRecordDraftsStore((s) => s.load);
  const getDraft = useRecordDraftsStore((s) => s.getDraft);
  const observations = useObservationStore((s) => s.records);
  const loadObservations = useObservationStore((s) => s.load);
  const loadEvidence = useRecordEvidenceStore((s) => s.load);

  const [activeArea, setActiveArea] = useState<RecordArea>(areas[0] ?? 'autonomy');
  const [filter, setFilter] = useState<DraftFilter>('all');
  const [showExport, setShowExport] = useState(false);
  /** 서브페이지 모드 — '초안'(기존) ↔ '근거 자료'(신규). */
  const [viewMode, setViewMode] = useState<'draft' | 'evidence'>('draft');

  useEffect(() => {
    void load();
    void loadObservations();
    void loadEvidence();
  }, [load, loadObservations, loadEvidence]);

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
      flashCopyMsg('복사 실패 — 브라우저 권한을 확인하세요', false);
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
      {/* 상단 바 — breadcrumb + 모드 토글 + (초안)복사·내보내기 + 컨텍스트 칩 */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-sp-border">
        <div className="flex items-center gap-1.5 truncate">
          {className ? <span className="text-sm text-sp-muted">{className}</span> : null}
          {className ? <span className="text-sm text-sp-muted">›</span> : null}
          <h2 className="text-base font-bold text-sp-text">
            {viewMode === 'draft' ? '생활기록부 초안' : '근거 자료'}
          </h2>
        </div>
        {/* 초안 ↔ 근거 자료 서브페이지 토글 */}
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
            근거 자료
          </button>
        </div>
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
        <RecordEvidenceView
          context={context}
          level={level}
          students={students}
          {...(classId !== undefined ? { classId } : {})}
          {...(className !== undefined ? { className } : {})}
          headless
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
                  <span className="text-[0.65rem] font-semibold text-sp-muted">
                    {Math.round(resolveAreaLimit(area, level) / 3)}자
                  </span>
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

          {/* 입력창 안내 — 목록 전체에 1회만 노출(행마다 반복 제거) */}
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-1.5 text-[0.7rem] text-sp-muted border-b border-sp-border">
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
                  obsById={obsById}
                  index={i}
                  onJumpNext={() => focusRowTextarea(i + 1)}
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
  obsById,
  index,
  onJumpNext,
}: {
  student: RecordDraftStudentRow;
  area: RecordArea;
  level: SchoolLevel;
  subject?: string;
  classId?: string;
  draft?: RecordDraft;
  obsById: ReadonlyMap<string, ObservationRecord>;
  index: number;
  onJumpNext: () => void;
}) {
  const upsert = useRecordDraftsStore((s) => s.upsert);
  const setStatus = useRecordDraftsStore((s) => s.setStatus);

  const [text, setText] = useState(draft?.content ?? '');
  const [focused, setFocused] = useState(false);
  const [showBasis, setShowBasis] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  /** 저장이 거부된 이유(한도 초과 등). 조용한 실패를 만들지 않기 위한 자리. */
  const [saveError, setSaveError] = useState<string | null>(null);
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
      level,
    };
    setSaveState('saving');
    setSaveError(null);
    upsert(input)
      .then(() => setSaveState('saved'))
      .catch((err: unknown) => {
        setSaveState('idle');
        // 조용히 삼키면 선생님은 저장된 줄 안다. 한도 초과는 이유를 그대로 보여 준다.
        setSaveError(err instanceof RecordDraftLimitError ? err.message : '저장하지 못했습니다.');
      });
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

  // 근거 준비도(US-4) — 현재 영역의 근거 건수·최근 날짜·작성 준비/검토 신호.
  const evidenceRecords = useRecordEvidenceStore((s) => s.records);
  const evidenceForArea = useMemo(
    () =>
      evidenceRecords.filter((e) => e.studentRef === student.studentRef && e.areas.includes(area)),
    [evidenceRecords, student.studentRef, area],
  );
  const evidenceCount = evidenceForArea.length;
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
          <span className="w-fit rounded-full bg-sp-surface px-2 py-0.5 text-[0.65rem] font-semibold text-sp-muted">
            초안 없음
          </span>
        )}
        {/* 근거 준비도(US-4): 근거 건수·최근 날짜 + 작성 준비/검토 신호 */}
        <span className="inline-flex items-center gap-0.5 text-[0.6rem] text-sp-muted">
          <span className="material-symbols-outlined text-xs">inventory_2</span>
          근거{' '}
          <b className={evidenceCount > 0 ? 'text-sp-accent' : 'text-sp-muted'}>
            {evidenceCount}건
          </b>
          {recentEvidenceDate ? ` · 최근 ${formatObsDate(recentEvidenceDate)}` : ''}
        </span>
        {needsReview && (
          <span className="w-fit rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[0.55rem] font-semibold text-amber-600">
            검토 필요
          </span>
        )}
        {draft && draft.basisObservationIds.length > 0 && (
          <button
            type="button"
            onClick={() => setShowBasis((v) => !v)}
            className="flex w-fit items-center gap-1 text-[0.65rem] text-sp-muted"
          >
            <span className="material-symbols-outlined text-xs">link</span>근거{' '}
            <span className="font-semibold text-sp-accent">
              {draft.basisObservationIds.length}건
            </span>
            <span className="material-symbols-outlined text-xs">
              {showBasis ? 'expand_more' : 'chevron_right'}
            </span>
          </button>
        )}
      </div>

      {/* 입력창 + 근거/플래그 */}
      <div className="flex flex-col gap-1.5">
        <textarea
          ref={taRef}
          value={text}
          data-rd-index={index}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={flush}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              onJumpNext(); // 다음 입력창으로 포커스 이동 → 현재 칸 blur+자동저장
            }
          }}
          aria-label={`${student.name} ${RECORD_AREA_LABELS[area]} 초안`}
          placeholder="AI에게 초안을 요청하면 자동 입력됩니다 — 또는 직접 작성하세요"
          className="min-h-[48px] w-full resize-y rounded-lg border border-sp-border bg-sp-surface px-3 py-2 text-sm leading-relaxed text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none focus:ring-2 focus:ring-sp-accent/30"
        />
        {saveError !== null && (
          <div className="flex items-start gap-1 rounded-lg bg-red-500/5 px-2.5 py-1.5 text-[0.7rem] leading-snug text-red-500 ring-1 ring-red-500/20">
            <span className="material-symbols-outlined text-sm">error</span>
            <span>{saveError}</span>
          </div>
        )}
        {saveState !== 'idle' && (
          <span
            className={`flex w-fit items-center gap-1 text-[0.65rem] ${
              saveState === 'saved' ? 'text-emerald-500' : 'text-sp-muted'
            }`}
          >
            <span className="material-symbols-outlined text-xs">
              {saveState === 'saved' ? 'check_circle' : 'sync'}
            </span>
            {saveState === 'saved' ? '저장됨' : '저장 중…'}
          </span>
        )}
        {showBasis && draft && draft.basisObservationIds.length > 0 && (
          <div className="flex flex-wrap gap-1.5 text-[0.65rem] text-sp-muted">
            {draft.basisObservationIds.map((id, i) => {
              const obs = obsById.get(id);
              const snippet = obs
                ? `${formatObsDate(obs.date)} · ${obs.content.slice(0, 18)}${obs.content.length > 18 ? '…' : ''}`
                : `관찰기록 ${i + 1}`;
              return (
                <span
                  key={id}
                  className="rounded-md bg-sp-surface px-2 py-1 ring-1 ring-sp-border"
                  {...(obs ? { title: obs.content } : {})}
                >
                  {snippet}
                </span>
              );
            })}
          </div>
        )}
        {flags.length > 0 && (
          <div
            className={`flex items-start gap-1 rounded-lg px-2.5 py-1.5 text-[0.7rem] leading-snug ring-1 ${
              hasRisk
                ? 'bg-red-500/5 text-red-500 ring-red-500/20'
                : 'bg-amber-500/5 text-amber-600 ring-amber-500/20'
            }`}
          >
            <span className="material-symbols-outlined text-sm">warning</span>
            <span>
              검토 필요 · {flags.map(flagLabel).join(', ')}
              {prohibitedWhy.length > 0 ? ` (${prohibitedWhy.join(', ')})` : ''} — 모든 문장은
              교사가 사실을 직접 확인해야 합니다.
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
          className="flex items-center gap-1 rounded-lg bg-sp-accent/10 px-3 py-1.5 text-xs font-medium text-sp-accent ring-1 ring-sp-accent/20 transition-colors hover:bg-sp-accent/20 disabled:opacity-40"
        >
          <span className="material-symbols-outlined text-sm">content_copy</span>복사
        </button>
      </div>
    </div>
  );
}
