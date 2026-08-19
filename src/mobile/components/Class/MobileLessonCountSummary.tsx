/**
 * 모바일 진도 탭의 학기 차시 요약 — 데스크톱 `LessonCountSummary`의 좁은 화면 판.
 *
 * 폰에서는 데스크톱처럼 막대 두 개와 긴 목록을 늘어놓을 자리가 없다. 그래서 **보여줄 것을
 * 줄이되 원칙은 그대로 지킨다**:
 *
 * 1. '예상'이 숫자에 붙어 다닌다 — 문장에 흘리면 숫자만 기억에 남는다
 * 2. 못 세는 상태를 0으로 위장하지 않는다
 * 3. 근거를 감추지 않는다 — 접어 두되 한 번 눌러 열 수 있다
 *
 * 데스크톱과 **같은 계산·같은 재료 가공**을 쓴다(`useMobileLessonCountEstimate`).
 * 두 기기가 같은 반에 다른 숫자를 내면 사용자는 숫자 전체를 못 믿게 된다.
 */

import { useState } from 'react';
import { resolvePeriodLabel } from '@domain/rules/periodLabel';
import { formatTermKo } from '@domain/rules/academicCalendar';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';
import type { LessonCountView } from '@mobile/hooks/useMobileLessonCountEstimate';

interface MobileLessonCountSummaryProps {
  readonly view: LessonCountView;
  /** 기존 '입력 기준' 완료 수 — 학기 기준 진도율의 분자로 쓴다. */
  readonly completedCount: number;
  readonly periodTimes?: readonly PeriodTime[];
  /** 그날 수업 여부 정정. */
  readonly onAdjust: (date: string, kind: 'hasLesson' | 'noLesson' | null) => void;
}

const BLOCKED_TEXT: Record<string, string> = {
  noTimetable: '시간표를 등록하면 이번 학기 차시를 세어드려요.',
  archivedClass: '보관된 반이라 차시를 세지 않아요.',
  invalidTerm: '학기 시작일과 마지막 수업일을 확인해 주세요.',
  classNotFound: '반 정보를 찾지 못했어요.',
};

/** '2026-09-07' → '9/7' */
function shortDate(iso: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(iso);
  return m === null ? iso : `${Number(m[1])}/${Number(m[2])}`;
}

export function MobileLessonCountSummary({
  view,
  completedCount,
  periodTimes,
  onAdjust,
}: MobileLessonCountSummaryProps) {
  const [open, setOpen] = useState(false);

  // 학기 마지막 수업일을 모르면 안내만 — 폰에서는 편집을 시키지 않는다(PC에서 답한다).
  if (view.needsTermEnd) {
    return (
      <p className="text-[11px] leading-relaxed text-sp-muted">
        {formatTermKo(view.term)} 마지막 수업일을 PC에서 알려주시면 이번 학기 차시를 세어드려요.
      </p>
    );
  }

  if (view.status !== 'ok') {
    return (
      <p className="text-[11px] leading-relaxed text-sp-muted">
        {BLOCKED_TEXT[view.status] ?? BLOCKED_TEXT.classNotFound}
      </p>
    );
  }

  const semesterPercent =
    view.totalPeriods === 0 ? 0 : Math.round((completedCount / view.totalPeriods) * 100);
  const uncertainCount = view.lessonDays.filter((d) => d.matchStage !== 1).length;
  const detailCount = view.excludedDays.length + uncertainCount;

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs">
        <span className="flex items-baseline gap-1">
          <b className="text-sm font-semibold text-sp-text tabular-nums">{view.totalPeriods}</b>
          <span className="text-sp-muted">차시</span>
          <span className="rounded-lg border border-sp-border px-1 py-px text-[9px] leading-none text-sp-muted">
            예상
          </span>
        </span>
        <span className="text-sp-muted">
          남은 <b className="font-semibold text-sp-text tabular-nums">{view.remainingPeriods}</b>
        </span>
        <span className="text-sp-muted">
          학기 기준 <b className="font-semibold text-sp-text tabular-nums">{semesterPercent}%</b>
        </span>
        {detailCount > 0 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="ml-auto flex items-center gap-0.5 rounded-lg border border-sp-border px-1.5 py-0.5 text-[11px] text-sp-muted active:scale-95 transition-transform"
            style={{ minHeight: 28 }}
          >
            근거 <span className="tabular-nums">{detailCount}</span>
            <span aria-hidden className="material-symbols-outlined text-sm">
              {open ? 'expand_less' : 'expand_more'}
            </span>
          </button>
        )}
      </div>

      {open && (
        <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-sp-border p-2">
          {view.excludedDays.length > 0 && (
            <>
              <p className="mb-1 text-[10px] font-medium text-sp-muted">뺀 날</p>
              <ul className="mb-2 space-y-1">
                {view.excludedDays.map((d) => (
                  <li key={d.date} className="flex items-center gap-2 text-[11px]">
                    <span className="text-sp-text tabular-nums">{shortDate(d.date)}</span>
                    <span className="text-sp-muted">{d.exclusion.label}</span>
                    {d.exclusion.userOverridable && (
                      <button
                        type="button"
                        onClick={() =>
                          onAdjust(
                            d.date,
                            d.exclusion.reason === 'userMarkedNoLesson' ? null : 'hasLesson',
                          )
                        }
                        className="ml-auto rounded-lg border border-sp-border px-1.5 py-0.5 text-[10px] text-sp-muted active:scale-95 transition-transform"
                        style={{ minHeight: 28 }}
                      >
                        {d.exclusion.reason === 'userMarkedNoLesson' ? '되돌리기' : '수업했어요'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {uncertainCount > 0 && (
            <>
              <p className="mb-1 text-[10px] font-medium text-sp-muted">쌤핀이 덜 확신하는 날</p>
              <ul className="space-y-1">
                {view.lessonDays
                  .filter((d) => d.matchStage !== 1)
                  .map((d) => (
                    <li
                      key={d.date}
                      className="flex items-center gap-2 border-l-2 border-dashed border-sp-border pl-2 text-[11px]"
                    >
                      <span className="text-sp-text tabular-nums">{shortDate(d.date)}</span>
                      <span className="text-sp-muted tabular-nums">
                        {d.periods.map((p) => resolvePeriodLabel(p, periodTimes)).join('·')}
                      </span>
                      <span className="text-sp-muted">
                        {d.matchStage === 2 ? '교실 이름만 맞음' : '우리 반 시간표로 추정'}
                      </span>
                    </li>
                  ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
