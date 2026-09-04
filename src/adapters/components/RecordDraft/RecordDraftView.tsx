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
import { recordDraftFlagLabel } from '@domain/rules/recordDraftFlagLabels';
import { useRecordEvidenceStore } from '@adapters/stores/useRecordEvidenceStore';
import { useInquiryThreadStore } from '@adapters/stores/useInquiryThreadStore';
import { useRubricStore } from '@adapters/stores/useRubricStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useCurriculumStandards } from '@adapters/hooks/useCurriculumStandards';
import { standardKeywords, standardsForCodes } from '@domain/rules/curriculumStandardRules';
import { isClassified } from '@domain/rules/threadSuggest';
import type { ObservationRecord } from '@domain/entities/Observation';
import { RecordDraftExportModal } from '@adapters/components/Homeroom/Records/RecordDraftExportModal';
import { RecordEvidenceView } from '@adapters/components/RecordDraft/RecordEvidenceView';
import {
  RecordDraftAiButton,
  type DraftTarget,
} from '@adapters/components/RecordDraft/RecordDraftAiButton';
import { useAssistStore } from '@adapters/stores/useAssistStore';

/**
 * AI 에게 학생을 가리킬 때 쓰는 **별칭**. 실명은 나가지 않는다.
 *
 * ★한 번에 한 학생분만 보내므로 모두 같은 별칭이어도 헷갈리지 않는다 — 오히려 여러 학생을
 * 이어 만들 때 **학생끼리 이어 붙는 것을 막는다**(누가 누구인지 모델이 짝지을 수 없다).
 * 되돌리기는 `RecordDraftAiButton` 이 [반영] 직전에 한다.
 */
export const DRAFT_STUDENT_ALIAS = '［이름1］';

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
}: RecordDraftViewProps) {
  const author = context === 'homeroom' ? 'homeroom' : 'teaching';
  const areas = useMemo(() => areasForContext(level, author), [level, author]);
  const records = useRecordDraftsStore((s) => s.records);
  const load = useRecordDraftsStore((s) => s.load);
  const getDraft = useRecordDraftsStore((s) => s.getDraft);
  const upsertDraft = useRecordDraftsStore((s) => s.upsert);
  const observations = useObservationStore((s) => s.records);
  const loadObservations = useObservationStore((s) => s.load);
  const loadEvidence = useRecordEvidenceStore((s) => s.load);
  const loadThreads = useInquiryThreadStore((s) => s.load);

  const [activeArea, setActiveArea] = useState<RecordArea>(areas[0] ?? 'autonomy');
  const [filter, setFilter] = useState<DraftFilter>('all');
  const [showExport, setShowExport] = useState(false);
  /** 서브페이지 모드 — '초안'(기존) ↔ '근거 자료'(신규). */
  const [viewMode, setViewMode] = useState<'draft' | 'evidence'>('draft');

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

  const subject = areaSubject(activeArea, classSubject);
  const limit = resolveAreaLimit(activeArea, level);

  /**
   * 성취기준 복사 검사(K1)의 재료 — **이 수업반이 실제로 가르친 성취기준의 원문**.
   *
   * T4 가 만든 `checkStandardCopy` 는 초안이 성취기준 문장을 옮겨 적었는지 어절 겹침으로 본다.
   * 그런데 그 재료를 넘겨줄 자리가 이 화면이라, 지금까지 검사는 `skipped` 로만 보고돼 왔다
   * (계획서 §6 T4 항목). 코드는 T3 가 루브릭·진도에 심어 뒀으니 여기서 원문으로 풀어 넘긴다.
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

  const { data: standardsData } = useCurriculumStandards(level, standardCodes.length > 0);
  const standardTexts = useMemo(() => {
    if (!standardsData || standardCodes.length === 0) return undefined;
    const texts = standardsForCodes(standardsData.index, standardCodes).map((s) => s.text);
    return texts.length > 0 ? texts : undefined;
  }, [standardsData, standardCodes]);

  /**
   * AI 로 나가는 쪽 — **키워드만.** 위의 `standardTexts`(원문)와 이름이 비슷하지만 하는 일이
   * 정반대다: 원문은 앱 안 복사 검사용이고, 이쪽만 밖으로 나간다. 섞으면 모델이 성취기준
   * 문장을 그대로 옮겨 적는다(분석 §4-1, 실측 C 사례).
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
   *
   * ★이미 쓴 초안을 덮지 않는다. 눌러 놓고 자리를 뜨는 기능이라, 덮어쓰면 선생님이 손으로 쓴
   *   글이 소리 없이 사라진다.
   */
  const unwrittenStudents = useMemo(
    () => students.filter((s) => (draftFor(s.studentRef)?.content ?? '').trim().length === 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- draftFor 는 매 렌더 새로 만들어진다. 실제 의존은 아래 둘이다.
    [students, records, activeArea, subject],
  );

  /**
   * AI 가 쓴 초안을 저장한다. **어느 학생 칸인지 `studentRef` 로만 찾는다.**
   *
   * ★목록 위치(index)로 찾으면 안 된다 — 필터가 걸려 있으면 화면 순서와 명단 순서가 다르고,
   *   그러면 남의 학생 칸에 저장된다(같은 실수를 상담예약에서 한 적이 있다).
   */
  const applyAiDraft = async (studentRef: string, content: string): Promise<void> => {
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
      level,
    });
  };

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
          {...(classSubject !== undefined ? { classSubject } : {})}
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
                  {...(standardTexts !== undefined ? { standardTexts } : {})}
                  {...(standardKeywordList !== undefined
                    ? { standardKeywords: standardKeywordList }
                    : {})}
                  unwrittenStudents={unwrittenStudents}
                  onAiApply={applyAiDraft}
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
  standardTexts,
  standardKeywords: standardKeywordList,
  unwrittenStudents,
  onAiApply,
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
  /** 이 수업반이 가르친 성취기준 원문 — 복사 검사에만 쓴다(AI 에는 안 간다). */
  standardTexts?: readonly string[];
  /** 성취기준 **키워드** — 이쪽만 AI 로 나간다. 위의 원문과 헷갈리지 말 것. */
  standardKeywords?: readonly string[];
  /** 이 영역에 아직 초안이 없는 학생들("남은 학생 모두"의 대상). */
  unwrittenStudents: readonly RecordDraftStudentRow[];
  /** AI 가 쓴 초안을 저장한다. 저장 자리는 부모가 안다(다른 학생 칸도 여기로 간다). */
  onAiApply: (studentRef: string, content: string) => Promise<void>;
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
      // 성취기준 복사 검사용. 없으면 칸을 만들지 않는다 — T4 는 부재를 'skipped' 로 정직히 보고한다.
      ...(standardTexts !== undefined && standardTexts.length > 0 ? { standardTexts } : {}),
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

  /**
   * "이 주제로" — 이 학생의 탐구 흐름 중 하나를 골라 **그 주제의 근거만** 보게 한다.
   *
   * ★고른 값을 초안에 저장하지는 않는다(오너 결정 2026-09-04 — `RecordDraft` 엔티티와 초안 저장
   *   관문은 다른 작업이 쓰는 중이라 이번엔 건드리지 않는다. 계획서 §6 요청).
   *   AI 는 `get_inquiry_threads` → `get_record_evidence(threadId)` 로 주제를 직접 읽으므로
   *   주제별 초안 자체는 이 칸 없이도 된다. 여기서는 **교사가 무엇을 보고 쓰는지**를 맞춘다.
   * ★행 컴포넌트는 `studentRef:area:subject` 로 key 가 걸려 학생이 바뀌면 통째로 새로 만들어진다 —
   *   앞 학생의 주제 선택이 따라붙을 길이 없다.
   */
  const allThreads = useInquiryThreadStore((s) => s.records);
  const threadIdSet = useMemo(() => new Set(allThreads.map((t) => t.id)), [allThreads]);
  const studentThreads = useMemo(
    () => allThreads.filter((t) => t.studentRef === student.studentRef),
    [allThreads, student.studentRef],
  );
  const [pickedThreadId, setPickedThreadId] = useState<string>('');
  const pickedThread = studentThreads.find((t) => t.id === pickedThreadId) ?? null;
  const threadEvidenceCount = useMemo(
    () =>
      pickedThread === null
        ? 0
        : evidenceRecords.filter(
            (e) => e.studentRef === student.studentRef && e.threadId === pickedThread.id,
          ).length,
    [evidenceRecords, student.studentRef, pickedThread],
  );
  const unclassifiedCount = useMemo(
    () =>
      evidenceRecords.filter(
        (e) => e.studentRef === student.studentRef && !isClassified(e, threadIdSet),
      ).length,
    [evidenceRecords, student.studentRef, threadIdSet],
  );

  /**
   * AI 에게 "이 주제로 써 달라"고 말할 문장 — **다른 AI 앱에 붙여 넣어 쓰는 길**이다.
   *
   * 구독을 연결한 선생님은 아래 [AI로 초안 쓰기]로 앱 안에서 바로 만들 수 있다(T6).
   * 이 복사 버튼은 AI 브릿지로 클로드·GPT 를 따로 쓰는 선생님을 위해 그대로 둔다.
   */
  const copyThreadPrompt = async (): Promise<void> => {
    if (!pickedThread) return;
    const text = `'${pickedThread.title}' 주제로 ${RECORD_AREA_LABELS[area]} 초안을 써 주세요. 그 주제의 근거만 보고, 활동을 나열하지 말고 하나의 탐구 흐름으로 써 주세요.`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* 클립보드 불가 — 무시 */
    }
  };
  /**
   * [AI로 초안 쓰기]에 넘길 재료.
   *
   * ★실명은 넣지 않는다 — 학생은 별칭으로만 간다. 되돌리기는 [반영] 직전에 한다.
   * ★주제를 골랐으면 **그 주제의 근거만** 보낸다. 안 골랐으면 이 영역 전체.
   * ★"AI 에 보내지 않기"로 표시한 근거와 기재 금지 항목이 든 근거는 꾸러미를 만드는
   *   `recordDraftPack` 이 뺀다 — 여기서 거르지 않는다(거르는 자리를 한 곳에 둔다).
   */
  const ownAiEnabled = useAssistStore((s) => s.ownAiEnabled);

  const aiTarget = useMemo<DraftTarget>(() => {
    const picked = pickedThreadId
      ? evidenceRecords.filter(
          (e) => e.studentRef === student.studentRef && e.threadId === pickedThreadId,
        )
      : evidenceForArea;
    return {
      studentRef: student.studentRef,
      studentAlias: DRAFT_STUDENT_ALIAS,
      displayName: student.name,
      evidences: picked,
      ...(standardKeywordList !== undefined ? { standardKeywords: standardKeywordList } : {}),
      ...(text.trim().length > 0 ? { existingText: text } : {}),
    };
  }, [
    pickedThreadId,
    evidenceRecords,
    evidenceForArea,
    student.studentRef,
    student.name,
    standardKeywordList,
    text,
  ]);

  /**
   * "남은 학생 모두" 대상. 자기 자신은 뺀다(이미 `target` 으로 먼저 간다).
   *
   * ★여기서는 주제를 걸지 않는다 — 주제 고르기는 이 행의 선택이라, 남의 학생에게
   *   같은 주제를 씌우면 엉뚱한 근거로 쓰게 된다. 각자 영역 전체 근거를 본다.
   */
  const aiRemaining = useMemo<readonly DraftTarget[]>(
    () =>
      unwrittenStudents
        .filter((s) => s.studentRef !== student.studentRef)
        .map((s) => ({
          studentRef: s.studentRef,
          studentAlias: DRAFT_STUDENT_ALIAS,
          displayName: s.name,
          evidences: evidenceRecords.filter(
            (e) => e.studentRef === s.studentRef && e.areas.includes(area),
          ),
          ...(standardKeywordList !== undefined ? { standardKeywords: standardKeywordList } : {}),
        })),
    [unwrittenStudents, student.studentRef, evidenceRecords, area, standardKeywordList],
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
        {/* 이 주제로 — 주제가 하나라도 있을 때만 보인다(흐름을 안 쓰면 화면이 그대로다). */}
        {studentThreads.length > 0 && (
          <div className="flex flex-col gap-1">
            <select
              value={pickedThreadId}
              onChange={(e) => setPickedThreadId(e.target.value)}
              aria-label={`${student.name} 초안에 쓸 주제 고르기`}
              className="w-full rounded-md border border-sp-border bg-sp-surface px-1.5 py-0.5 text-[0.6rem] text-sp-text focus:border-sp-accent focus:outline-none"
            >
              <option value="">이 주제로… (전체 근거)</option>
              {studentThreads.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.status === 'closed' ? `${t.title} (닫힘)` : t.title}
                </option>
              ))}
            </select>
            {pickedThread && (
              <button
                type="button"
                onClick={() => void copyThreadPrompt()}
                title="AI에게 이 주제로 써 달라고 할 문장을 복사합니다."
                className="flex w-fit items-center gap-0.5 rounded-md bg-sp-accent/10 px-1.5 py-0.5 text-[0.55rem] font-medium text-sp-accent ring-1 ring-sp-accent/20 hover:bg-sp-accent/20"
              >
                <span className="material-symbols-outlined text-[0.7rem]">content_copy</span>
                주제 근거 {threadEvidenceCount}건 · 요청문 복사
              </button>
            )}
          </div>
        )}
        {unclassifiedCount > 0 && (
          <span
            title="아직 주제로 묶지 않은 근거입니다. ‘근거 자료’ 탭에서 묶을 수 있습니다."
            className="w-fit rounded-full bg-sp-surface px-1.5 py-0.5 text-[0.55rem] font-medium text-sp-muted"
          >
            미분류 {unclassifiedCount}건
          </span>
        )}
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
        {/* [AI로 초안 쓰기] — 실험실 스위치를 켠 선생님에게만 보인다.
            꺼져 있으면 화면은 예전 그대로다. */}
        {ownAiEnabled && (
          <RecordDraftAiButton
            areaLabel={RECORD_AREA_LABELS[area]}
            {...(pickedThread ? { threadTitle: pickedThread.title } : {})}
            target={aiTarget}
            remaining={aiRemaining}
            onApply={onAiApply}
          />
        )}
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
