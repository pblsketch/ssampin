/**
 * 생기부 초안 **학생 한 명의 편집 칸**(ADR-093).
 *
 * 두 보기가 같은 로직을 쓴다 — 자동 저장(700ms)·blur flush·한도 오류·검토 플래그·형광펜 거울 레이어·
 * [편집칸에 넣기] 배달(`deliver`)·부모 등록부 기록(`onLiveText`). 다른 것은 **배치**뿐이다:
 *  - `overview`: 30명 목록의 한 행(왼쪽 학생·가운데 칸·오른쪽 바이트).
 *  - `focus`: 고른 학생 한 명을 넓게(머리줄·큰 칸·아래줄).
 *
 * ★행이 다시 만들어질 때(학생·영역·보기 전환) 편집 칸은 저장된 글이 아니라 **부모 등록부의 글**(`initialLiveText`)로
 *   시작한다. 한도를 넘겨 저장이 거부된 글이 화면에서 사라지던 것(P8)을 막는다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  RECORD_AREA_LABELS,
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
import { registerDraftFlush } from '@adapters/components/RecordDraft/draftFlushRegistry';
import { detectProhibitedTerms, summarizeProhibited } from '@domain/rules/prohibitedRecordTerms';
import { recordDraftFlagLabel } from '@domain/rules/recordDraftFlagLabels';
import { useRecordEvidenceStore } from '@adapters/stores/useRecordEvidenceStore';
import { useInquiryThreadStore } from '@adapters/stores/useInquiryThreadStore';
import { isClassified } from '@domain/rules/threadSuggest';
import {
  DRAFT_TEXT_METRICS,
  RoleHighlightLayer,
} from '@adapters/components/RecordDraft/RoleHighlightLayer';
import type {
  RecordDraftLayout,
  RecordDraftStudentRow,
} from '@adapters/components/RecordDraft/recordDraftTypes';

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

const HEIGHT_KEY = (studentRef: string, area: RecordArea): string => `rd-h:${studentRef}:${area}`;

export interface RecordDraftRowProps {
  readonly variant: RecordDraftLayout;
  readonly student: RecordDraftStudentRow;
  readonly area: RecordArea;
  readonly level: SchoolLevel;
  readonly subject?: string;
  readonly classId?: string;
  readonly draft?: RecordDraft;
  /** 목록 안 순번(overview 의 Ctrl+Enter 이동이 `data-rd-index` 로 다음 칸을 찾는다). */
  readonly index: number;
  /** 오른쪽 패널이 보고 있는 학생인가. */
  readonly selected: boolean;
  /** 초안 생성 대상으로 골라 둔 학생인가(체크 상자). */
  readonly checked: boolean;
  /** 거울 카드 수 — 저장 미분류에 더해 [미분류 N건]을 만든다. */
  readonly mirrorCount: number;
  /** 형광펜 스위치 — 켜져 있을 때만 편집 칸 뒤에 거울 레이어를 깐다. */
  readonly highlightOn: boolean;
  /** [AI ▸]/[AI 도움] 버튼 노출 — 실험실 스위치(내 AI로 실행)를 켠 선생님에게만. */
  readonly showAiButton: boolean;
  /** [AI 도움] 단추에 붙는 진행 표시(집중 보기) — 실행 중 / 결과 있음. 없으면 배지 없음. */
  readonly aiBadge?: 'running' | 'result';
  /** 이 수업반이 가르친 성취기준 원문 — 복사 검사에만 쓴다(AI 에는 안 간다). */
  readonly standardTexts?: readonly string[];
  /** 이 행의 3축 마운트 키. 등록부에 기록할 때 쓴다(부모가 만든 것을 그대로 받는다). */
  readonly rowKey: string;
  /**
   * 부모 등록부에 남아 있던 이 칸의 글(있으면). 저장된 글보다 **이것으로** 시작한다 — 한도를 넘겨 저장이
   * 거부된 글이 학생·영역·보기 전환에 화면에서 사라지지 않게(P8).
   */
  readonly initialLiveText?: string;
  /** `initialLiveText` 를 마지막으로 고친 시각. 저장본(`draft.updatedAt`)보다 새로울 때만 그 글로 시작한다. */
  readonly initialLiveAt?: number;
  /** 화면의 현재 입력을 부모 등록부에 **기록만** 한다(ADR-088). 부모는 읽기만 한다. */
  readonly onLiveText: (rowKey: string, value: string) => void;
  /**
   * [편집칸에 넣기] 배달 — 한 번만 배달되는 상자. `token` 이 바뀔 때만 편집 칸에 넣는다.
   * ★부모가 행에 값을 쓰는 **유일한 경로**다. 이 자리에는 §E-2 비교 게이트가 이미 걸려 있다.
   */
  readonly deliver?: { readonly rowKey: string; readonly text: string; readonly token: number };
  /** 집중 보기에서 부모가 "이 칸에 포커스"를 요청하는 번호. 바뀔 때마다 포커스한다. */
  readonly focusToken?: number;
  readonly onSelect: (studentRef: string) => void;
  readonly onToggleChecked: (studentRef: string) => void;
  readonly onOpenAi: (studentRef: string) => void;
  readonly onOpenBoard: (studentRef: string) => void;
  /** [근거 N건] — 오른쪽 보조 공간의 [근거] 탭을 이 학생으로 연다. */
  readonly onOpenEvidence: (studentRef: string) => void;
  /** Ctrl+Enter — 다음 학생 칸으로. */
  readonly onJumpNext: () => void;
  /** 집중 보기의 [이전]/[다음]. 없으면 그리지 않는다. */
  readonly onPrev?: () => void;
  readonly onNext?: () => void;
}

export function RecordDraftRow({
  variant,
  student,
  area,
  level,
  subject,
  classId,
  draft,
  index,
  selected,
  checked,
  mirrorCount,
  highlightOn,
  showAiButton,
  aiBadge,
  standardTexts,
  rowKey,
  initialLiveText,
  initialLiveAt,
  onLiveText,
  deliver,
  focusToken,
  onSelect,
  onToggleChecked,
  onOpenAi,
  onOpenBoard,
  onOpenEvidence,
  onJumpNext,
  onPrev,
  onNext,
}: RecordDraftRowProps) {
  const upsert = useRecordDraftsStore((s) => s.upsert);
  const setStatus = useRecordDraftsStore((s) => s.setStatus);

  /**
   * 등록부에 남은 글이 저장된 글과 다르면 그것이 "화면의 진실"이다 — 그 글로 시작하고 편집 시각 도장을
   * 찍어 아래 되돌리기 효과가 저장된 글로 덮지 못하게 한다.
   */
  const startsFromLive =
    initialLiveText !== undefined &&
    initialLiveText !== (draft?.content ?? '') &&
    (initialLiveAt ?? 0) > (draft?.updatedAt ?? 0);
  const [text, setText] = useState(startsFromLive ? initialLiveText : (draft?.content ?? ''));
  const [focused, setFocused] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  /** 저장이 거부된 이유(한도 초과 등). 조용한 실패를 만들지 않기 위한 자리. */
  const [saveError, setSaveError] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * 선생님이 이 칸을 마지막으로 고친 시각(렌더를 일으키지 않는 기억 상자).
   * 아래 되돌리기 효과가 **저장이 거부된 글을 지우지 못하게** 막는 도장이다.
   */
  const lastEditAtRef = useRef(startsFromLive ? (initialLiveAt ?? Date.now()) : 0);

  // 외부(AI 패널·loopback)로 초안이 갱신되면 편집 중이 아닐 때 반영(자동 입력).
  useEffect(() => {
    if (focused) return;
    // ★내 손글씨가 저장된 것보다 최신이면 되돌리지 않는다.
    //   `focused` 가 의존 목록에 있어 **초점이 빠지는 것만으로** 이 효과가 다시 돈다.
    //   저장이 성공했으면 같은 글이라 티가 안 나지만, **한도 초과로 저장이 거부되면**
    //   `draft.content` 는 옛 글 그대로라 방금 쓴 글이 화면에서 사라진다(붉은 오류만 남는다).
    //   `upsert` 는 성공할 때 `updatedAt` 을 저장 시각으로 찍으므로, 정상 저장·AI 반영·동기화
    //   뒤에는 언제나 `updatedAt > lastEdit` 이 되어 **기존 자동 입력 경로는 그대로 산다.**
    //   ★[편집칸에 넣기] 배달도 이 도장을 찍어야 한다 - 안 찍으면 배달한 글만 되돌아간다.
    if (lastEditAtRef.current > (draft?.updatedAt ?? 0)) return;
    setText(draft?.content ?? '');
  }, [draft?.content, draft?.updatedAt, focused]);

  // 저장된 입력창 높이 복원(전체 훑어보기만 — 집중 보기는 칸이 이미 넓다).
  useEffect(() => {
    if (variant !== 'overview') return;
    const saved = (() => {
      try {
        return localStorage.getItem(HEIGHT_KEY(student.studentRef, area));
      } catch {
        return null;
      }
    })();
    if (saved && taRef.current) taRef.current.style.height = saved;
  }, [student.studentRef, area, variant]);

  // 집중 보기: 부모가 "이 칸에 포커스"를 요청하면(Ctrl+Enter 로 넘어온 뒤) 커서를 끝에 둔다.
  useEffect(() => {
    if (focusToken === undefined || focusToken === 0) return;
    const el = taRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [focusToken]);

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
    // 되돌리기 효과가 이 글을 지우지 못하게 도장을 찍는다(위 lastEditAtRef 주석 참조).
    lastEditAtRef.current = Date.now();
    // 분량 조절이 볼 "화면의 현재 글"을 부모 등록부에 기록한다. 저장이 거부돼도 이건 남는다.
    onLiveText(rowKey, value);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persist(value), 700);
  };

  /**
   * [편집칸에 넣기] 배달 — **선생님이 그 글을 방금 친 것과 완전히 같게 취급한다.**
   *
   * ★배달은 `onChange` 를 타지 않는데, 등록부 기록도 편집 시각 도장도 **둘 다 타이핑에 걸려 있다.**
   *   빼먹으면 두 가지가 한꺼번에 무너진다:
   *   1. 등록부에 조절 전 옛 글이 남아, 넣은 직후 다시 조절하면 옛 글이 대상이 된다.
   *   2. 도장이 안 찍혀 다음 초점 이동·동기화에 **넣은 글이 그대로 되돌아간다.**
   *      C0 (ㄴ)을 완벽히 고쳐도 이 경로만 무너진다.
   */
  const deliveredTokenRef = useRef(0);
  useEffect(() => {
    if (!deliver || deliver.rowKey !== rowKey) return;
    if (deliver.token === deliveredTokenRef.current) return;
    deliveredTokenRef.current = deliver.token;
    setText(deliver.text);
    lastEditAtRef.current = Date.now();
    onLiveText(rowKey, deliver.text);
  }, [deliver, rowKey, onLiveText]);

  const flush = (): Promise<boolean> => {
    setFocused(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (taRef.current && variant === 'overview') {
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

  // ── 공통 조각 ─────────────────────────────────────────────
  const checkbox = (
    <input
      type="checkbox"
      checked={checked}
      onChange={() => onToggleChecked(student.studentRef)}
      onClick={(e) => e.stopPropagation()}
      aria-label={`${student.name} 초안 생성 대상으로 고르기`}
      className="h-3.5 w-3.5 shrink-0 accent-current text-sp-accent"
    />
  );
  const statusBtn = status ? (
    <button
      type="button"
      onClick={() => draft && void setStatus(draft.id, NEXT_STATUS[status])}
      className={`w-fit whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_META[status].cls}`}
      title="클릭하여 상태 변경 (작성 중 → 검토 중 → 검토 완료)"
    >
      {STATUS_META[status].label}
    </button>
  ) : (
    <span className="w-fit whitespace-nowrap rounded-full bg-sp-surface px-2 py-0.5 text-xs font-semibold text-sp-muted">
      초안 없음
    </span>
  );
  const evidenceBtn = (
    <button
      type="button"
      onClick={() => onOpenEvidence(student.studentRef)}
      aria-label={`${student.name} 근거 ${evidenceCount}건 보기`}
      className="inline-flex w-fit items-center gap-0.5 whitespace-nowrap rounded-md text-xs text-sp-muted hover:text-sp-text"
    >
      <span className="material-symbols-outlined text-xs">inventory_2</span>
      근거{' '}
      <b className={evidenceCount > 0 ? 'text-sp-accent' : 'text-sp-muted'}>{evidenceCount}건</b>
      {recentEvidenceDate ? ` · 최근 ${formatObsDate(recentEvidenceDate)}` : ''}
    </button>
  );
  const unclassifiedBtn =
    unclassifiedCount > 0 ? (
      <button
        type="button"
        onClick={() => onOpenBoard(student.studentRef)}
        title="아직 주제로 묶지 않은 근거입니다. 눌러서 근거 정리 보드로 갑니다."
        className="w-fit whitespace-nowrap rounded-full bg-sp-surface px-2 py-0.5 text-xs font-medium text-sp-muted ring-1 ring-sp-border hover:text-sp-text"
      >
        미분류 {unclassifiedCount}건
      </button>
    ) : null;
  const reviewBadge = needsReview ? (
    <span className="w-fit whitespace-nowrap rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-600">
      검토 필요
    </span>
  ) : null;
  const aiBtn = showAiButton ? (
    <button
      type="button"
      onClick={() => onOpenAi(student.studentRef)}
      aria-label={`${student.name} AI 초안`}
      className="relative flex w-fit items-center gap-1 whitespace-nowrap rounded-md bg-sp-card px-2 py-1 text-xs font-medium text-sp-accent ring-1 ring-sp-border hover:bg-sp-surface"
    >
      <span className="material-symbols-outlined text-sm">auto_awesome</span>
      {variant === 'focus' ? 'AI 도움' : 'AI ▸'}
      {/* 진행 표시 — 패널이 닫혀 있어도 실행 중·결과 있음을 알린다(결과 돌아가기). */}
      {aiBadge !== undefined && (
        <span
          aria-label={aiBadge === 'running' ? 'AI 실행 중' : 'AI 결과 있음'}
          className={`ml-0.5 inline-block h-2 w-2 rounded-full ${aiBadge === 'running' ? 'animate-pulse bg-sp-accent' : 'bg-emerald-500'}`}
        />
      )}
    </button>
  ) : null;
  const copyBtn = (
    <button
      type="button"
      onClick={() => void copyNeis()}
      disabled={text.trim().length === 0}
      className="flex items-center gap-1 whitespace-nowrap rounded-lg bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-sp-accent ring-1 ring-blue-500/20 transition-colors hover:bg-blue-500/20 disabled:opacity-40"
    >
      <span className="material-symbols-outlined text-sm">content_copy</span>복사
    </button>
  );
  const editor = (
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
            if (variant === 'focus') {
              // 집중 보기에서는 이 칸이 곧 사라지므로 먼저 저장을 밀어 넣고, **거부되면 머문다** — 그래야 붉은 오류를 볼 수 있다.
              void flush().then((ok) => {
                if (ok) onJumpNext();
              });
              return;
            }
            onJumpNext(); // 다음 입력창으로 포커스 이동 → 현재 칸 blur+자동저장
          }
        }}
        aria-label={`${student.name} ${RECORD_AREA_LABELS[area]} 초안`}
        placeholder="AI에게 초안을 요청하면 자동 입력됩니다: 또는 직접 작성하세요"
        className={`relative w-full resize-y border-sp-border text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${DRAFT_TEXT_METRICS} ${
          variant === 'focus' ? 'min-h-[240px]' : 'min-h-[48px]'
        } ${showLayer ? 'bg-transparent' : 'bg-sp-surface'}`}
      />
    </div>
  );
  const saveLine = (
    <>
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
    </>
  );
  const byteMeter = (
    <>
      <span className={`whitespace-nowrap text-xs font-semibold tabular-nums ${byteCls}`}>
        {bytes.toLocaleString()} / {limit.toLocaleString()} B
      </span>
      <span
        className={`h-1 overflow-hidden rounded-full bg-sp-border ${variant === 'focus' ? 'w-24' : 'w-full'}`}
      >
        <span
          className={`block h-full rounded-full ${barCls}`}
          style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
        />
      </span>
    </>
  );

  // ── 집중 보기 ─────────────────────────────────────────────
  if (variant === 'focus') {
    return (
      <div
        className="flex min-h-0 flex-1 flex-col gap-2 px-4 py-3"
        data-testid="focus-editor"
        data-student={student.studentRef}
      >
        <div className="flex flex-wrap items-center gap-2">
          {showAiButton && checkbox}
          <span className="flex items-center gap-2 text-base font-bold text-sp-text">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-sp-surface text-xs text-sp-muted">
              {student.number}
            </span>
            {student.name}
          </span>
          {statusBtn}
          {reviewBadge}
          <span className="mx-1 h-4 w-px bg-sp-border" aria-hidden="true" />
          {evidenceBtn}
          {unclassifiedBtn}
          <div className="flex-1" />
          {aiBtn}
          {copyBtn}
          {(onPrev !== undefined || onNext !== undefined) && (
            <span className="inline-flex overflow-hidden rounded-lg ring-1 ring-sp-border">
              <button
                type="button"
                onClick={onPrev}
                disabled={onPrev === undefined}
                aria-label="이전 학생"
                className="px-2 py-1 text-sp-muted hover:bg-sp-surface hover:text-sp-text disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-base">chevron_left</span>
              </button>
              <button
                type="button"
                onClick={onNext}
                disabled={onNext === undefined}
                aria-label="다음 학생"
                className="px-2 py-1 text-sp-muted hover:bg-sp-surface hover:text-sp-text disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-base">chevron_right</span>
              </button>
            </span>
          )}
        </div>
        {editor}
        <div className="flex flex-wrap items-center gap-3">
          {byteMeter}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">{saveLine}</div>
        </div>
      </div>
    );
  }

  // ── 전체 훑어보기(예전 목록의 한 행) ────────────────────────
  return (
    <div
      onClick={() => onSelect(student.studentRef)}
      data-rd-student={student.studentRef}
      className={`grid grid-cols-[150px_minmax(260px,1fr)_128px] gap-3 border-b border-sp-border px-4 py-3 transition-colors ${
        selected ? 'bg-blue-500/5' : ''
      }`}
    >
      {/* 학생 + 상태 + 근거 */}
      <div className="flex flex-col gap-2 pt-0.5">
        <div className="flex items-center gap-2 text-sm font-semibold text-sp-text">
          {showAiButton && checkbox}
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-sp-surface text-xs text-sp-muted">
            {student.number}
          </span>
          {student.name}
        </div>
        {statusBtn}
        {/* 근거 준비도(US-4): 근거 창고 건수·최근 날짜 — 이 행의 "근거 N건"은 이것 하나뿐이다(P5). */}
        {evidenceBtn}
        {unclassifiedBtn}
        {reviewBadge}
        {aiBtn}
      </div>

      {/* 입력창 + 플래그 */}
      <div className="flex flex-col gap-1.5">
        {editor}
        {saveLine}
      </div>

      {/* 바이트 카운터 + 복사 */}
      <div className="flex flex-col items-end gap-2 pt-0.5">
        {byteMeter}
        {copyBtn}
      </div>
    </div>
  );
}
