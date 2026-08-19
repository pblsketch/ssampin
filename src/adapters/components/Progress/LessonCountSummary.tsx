/**
 * 진도 관리 탭 맨 위 한 줄 — "이번 학기 예상 몇 차시".
 *
 * ## 디자인 원칙 세 가지
 *
 * 1. **숫자가 주인공이되 '예상'이 숫자에 붙어 다닌다.** 큰 숫자 옆에 붙은 작은 칩이 그 역할을
 *    한다. 문장 속에 '예상'을 흘려 넣으면 숫자만 눈에 남고, 선생님은 확정된 값으로 읽는다.
 * 2. **못 세는 상태를 0으로 위장하지 않는다.** 시간표가 없거나 학기 끝을 모르면 숫자 자리를
 *    비우고 무엇을 하면 되는지만 말한다. "예상 0차시"는 고장으로 읽힌다.
 * 3. **진도율 두 개를 나란히 두되 무게를 다르게 준다.** 기존 '입력 기준'은 테두리만 있는 옅은
 *    막대, 새 '학기 기준'은 채워진 막대. 숫자가 크게 달라도 어느 쪽이 무엇인지 헷갈리지 않는다.
 *
 * 기존 진도율은 **계산을 옮기지 않고 그대로 받아쓴다**(`entryStats`). 이 화면이 만들어졌다고
 * 어제까지 보던 숫자가 달라지면 선생님은 고장으로 읽는다.
 */

import { useCallback } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { formatTermKo } from '@domain/rules/academicCalendar';
import type { LessonCountView } from '@adapters/hooks/useLessonCountEstimate';

export interface EntryBasedStats {
  readonly total: number;
  readonly completed: number;
  readonly percent: number;
}

interface LessonCountSummaryProps {
  readonly view: LessonCountView;
  /** 기존 '입력 기준' 진도율 — ProgressTab이 이미 계산한 값을 그대로 넘긴다. */
  readonly entryStats: EntryBasedStats;
  /** 근거 패널 열기/닫기 */
  readonly onToggleDetails: () => void;
  readonly detailsOpen: boolean;
}

/** 못 세는 상태별 안내 문구와 아이콘. */
const BLOCKED_MESSAGE: Record<string, { icon: string; text: string }> = {
  noTimetable: {
    icon: 'calendar_add_on',
    text: '시간표를 먼저 등록하면 이번 학기 차시를 세어드려요.',
  },
  archivedClass: { icon: 'inventory_2', text: '보관된 반이라 차시를 세지 않아요.' },
  invalidTerm: { icon: 'event_repeat', text: '학기 시작일과 마지막 수업일을 확인해 주세요.' },
  classNotFound: { icon: 'help', text: '반 정보를 찾지 못했어요.' },
};

export function LessonCountSummary({
  view,
  entryStats,
  onToggleDetails,
  detailsOpen,
}: LessonCountSummaryProps) {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.update);

  /** "나중에"로 넘겼던 종료일 질문을 다시 띄운다. */
  const handleAskTermEnd = useCallback(() => {
    void updateSettings({ termEndPromptSkipped: '' });
  }, [updateSettings]);

  const termLabel = formatTermKo(view.term);

  // ── 학기 마지막 수업일을 아직 모른다 ──
  if (view.needsTermEnd) {
    return (
      <div className="rounded-xl border border-dashed border-sp-border bg-sp-surface px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span aria-hidden className="material-symbols-outlined text-xl text-sp-accent">
            event_busy
          </span>
          <p className="flex-1 text-sm text-sp-text">
            {termLabel} 마지막 수업일을 알려주시면 <b className="font-semibold">이번 학기 차시</b>를
            세어드려요.
          </p>
          <button
            type="button"
            onClick={handleAskTermEnd}
            className="rounded-lg bg-sp-accent px-3 py-1.5 text-xs font-semibold text-sp-accent-fg transition-all duration-sp-base ease-sp-out hover:brightness-110 active:scale-95"
          >
            알려주기
          </button>
        </div>
        {settings.termEndPromptSkipped === view.term && (
          <p className="mt-1.5 pl-8 text-xs text-sp-muted">
            방학 날짜는 학교마다 달라서 쌤핀이 혼자 정하지 않아요.
          </p>
        )}
      </div>
    );
  }

  // ── 셀 수 없는 상태 ──
  if (view.status !== 'ok') {
    const msg = BLOCKED_MESSAGE[view.status] ?? BLOCKED_MESSAGE.classNotFound!;
    return (
      <div className="rounded-xl border border-dashed border-sp-border bg-sp-surface px-4 py-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="material-symbols-outlined text-xl text-sp-muted">
            {msg.icon}
          </span>
          <p className="text-sm text-sp-muted">{msg.text}</p>
        </div>
      </div>
    );
  }

  // ── 정상 ──
  const semesterPercent =
    view.totalPeriods === 0 ? 0 : Math.round((entryStats.completed / view.totalPeriods) * 100);
  const excludedCount = view.excludedDays.length;
  const uncertainCount = view.lessonDays.filter((d) => d.matchStage !== 1).length;

  return (
    <div className="rounded-xl border border-sp-border bg-sp-surface px-4 py-3">
      {/* 숫자 줄 */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-xs font-sp-medium text-sp-muted">{termLabel}</span>

        <span className="flex items-baseline gap-1.5">
          <span className="text-2xl font-bold leading-none text-sp-text tabular-nums">
            {view.totalPeriods}
          </span>
          <span className="text-sm text-sp-muted">차시</span>
          {/* 숫자에 붙어 다니는 '예상' — 문장 속에 흘리면 숫자만 기억에 남는다 */}
          <span className="rounded-lg border border-sp-border px-1.5 py-0.5 text-[10px] font-sp-medium leading-none text-sp-muted">
            예상
          </span>
        </span>

        <span aria-hidden className="text-sp-border">
          ·
        </span>
        <span className="text-sm text-sp-muted">
          완료 <b className="font-semibold text-sp-text tabular-nums">{entryStats.completed}</b>
        </span>
        <span className="text-sm text-sp-muted">
          남은 <b className="font-semibold text-sp-text tabular-nums">{view.remainingPeriods}</b>
        </span>

        <button
          type="button"
          onClick={onToggleDetails}
          aria-expanded={detailsOpen}
          className="ml-auto flex items-center gap-1 rounded-lg border border-sp-border px-2.5 py-1 text-xs font-sp-medium text-sp-muted transition-all duration-sp-base ease-sp-out hover:text-sp-text active:scale-95"
        >
          <span aria-hidden className="material-symbols-outlined text-sm">
            {detailsOpen ? 'expand_less' : 'expand_more'}
          </span>
          어떻게 셌는지
          {(excludedCount > 0 || uncertainCount > 0) && (
            <span className="tabular-nums">({excludedCount + uncertainCount})</span>
          )}
        </button>
      </div>

      {/* 진도율 두 개 — 무게를 다르게 줘서 헷갈리지 않게 한다 */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-xs text-sp-muted">입력 기준</span>
            <span className="text-xs font-semibold text-sp-text tabular-nums">
              {entryStats.percent}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-lg border border-sp-border">
            <div
              className="h-full rounded-lg bg-sp-muted opacity-40 transition-all duration-sp-base ease-sp-out"
              style={{ width: `${Math.min(100, entryStats.percent)}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] leading-tight text-sp-muted">
            적어 두신 {entryStats.total}개 중 완료한 비율
          </p>
        </div>

        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-xs text-sp-muted">학기 기준(예상)</span>
            <span className="text-xs font-semibold text-sp-text tabular-nums">
              {semesterPercent}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-lg bg-sp-card">
            <div
              className="h-full rounded-lg bg-sp-accent transition-all duration-sp-base ease-sp-out"
              style={{ width: `${Math.min(100, semesterPercent)}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] leading-tight text-sp-muted">
            학기 전체 {view.totalPeriods}차시 중 완료한 비율
          </p>
        </div>
      </div>

      {view.hasFutureEstimate && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-tight text-sp-muted">
          <span aria-hidden className="material-symbols-outlined text-sm">
            info
          </span>
          <span>앞으로의 수업은 지금 시간표 기준이에요. 결·보강이 생기면 숫자가 달라져요.</span>
        </p>
      )}
    </div>
  );
}
