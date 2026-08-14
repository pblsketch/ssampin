import { toLocalDateString } from '@shared/utils/localDate';
import { cellKey } from '@domain/rules/progressCalendarRules';
import type { WeeklyProgressCell } from '@domain/rules/progressCalendarRules';
import type { SubjectColorMap } from '@domain/valueObjects/SubjectColor';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';
import { resolvePeriodLabel } from '@domain/rules/periodLabel';
import { ProgressCalendarCell } from './ProgressCalendarCell';

/**
 * 진도 캘린더(B안) — 요일 × 교시 주간 격자 + 주 이동 헤더.
 */
export interface ProgressCalendarGridProps {
  weekDates: readonly string[];
  dayLabels: readonly string[];
  periods: readonly number[];
  /** 교시 이름 표시용 */
  periodTimes?: readonly PeriodTime[];
  grid: Map<string, WeeklyProgressCell>;
  colorBy: 'subject' | 'classroom';
  subjectColors?: SubjectColorMap;
  classroomColors?: SubjectColorMap;
  /** classId → { completed,total,percent } (진도율 칩용). 없으면 칩 숨김 */
  classSummaries?: Map<string, { completed: number; total: number; percent: number }>;
  /** 헤더 주 이동 */
  weekLabel: string;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  /** 빈 칸 클릭(반 매칭 성공·진도 미등록) — cell 전달 */
  onEmptyCellClick: (cell: WeeklyProgressCell) => void;
  /** 진도 있는 칸 클릭 */
  onEntryClick: (cell: WeeklyProgressCell) => void;
}

export function ProgressCalendarGrid({
  weekDates,
  dayLabels,
  periods,
  periodTimes,
  grid,
  colorBy,
  subjectColors,
  classroomColors,
  classSummaries,
  weekLabel,
  onPrevWeek,
  onNextWeek,
  onToday,
  onEmptyCellClick,
  onEntryClick,
}: ProgressCalendarGridProps) {
  const todayStr = toLocalDateString(new Date());

  return (
    <div className="flex flex-col gap-3">
      {/* 주 이동 헤더 */}
      <div className="flex items-center justify-between gap-2 rounded-xl border border-sp-border bg-sp-card px-4 py-3">
        <div className="flex items-center gap-1">
          <button
            onClick={onPrevWeek}
            title="이전 주"
            className="flex items-center justify-center rounded-lg p-1.5 text-sp-muted transition-colors hover:bg-black/5 hover:text-sp-text dark:hover:bg-white/10"
          >
            <span className="material-symbols-outlined text-icon-md">chevron_left</span>
          </button>
          <span className="px-2 text-sm font-bold text-sp-text">{weekLabel}</span>
          <button
            onClick={onNextWeek}
            title="다음 주"
            className="flex items-center justify-center rounded-lg p-1.5 text-sp-muted transition-colors hover:bg-black/5 hover:text-sp-text dark:hover:bg-white/10"
          >
            <span className="material-symbols-outlined text-icon-md">chevron_right</span>
          </button>
        </div>
        <button
          onClick={onToday}
          className="rounded-lg border border-sp-border px-3 py-1.5 text-sm font-semibold text-sp-muted transition-colors hover:border-sp-accent hover:text-sp-accent"
        >
          오늘
        </button>
      </div>

      {/* 요일 × 교시 격자 */}
      <div className="overflow-hidden rounded-2xl border border-sp-border bg-sp-card shadow-2xl shadow-black/20">
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-b border-sp-border bg-sp-surface">
                <th className="w-16 border-r border-sp-border px-2 py-3 text-center text-sm font-bold text-sp-text">
                  교시
                </th>
                {dayLabels.map((label, dayIndex) => {
                  const isToday = weekDates[dayIndex] === todayStr;
                  return (
                    <th
                      key={`${dayIndex}-${label}`}
                      className={`relative border-r border-sp-border px-2 py-3 text-center text-sm font-bold last:border-r-0 ${
                        isToday ? 'bg-black/5 text-sp-accent dark:bg-white/10' : 'text-sp-text'
                      }`}
                      style={{ width: `${100 / dayLabels.length}%` }}
                    >
                      {isToday && <div className="absolute left-0 top-0 h-1 w-full bg-sp-accent" />}
                      {label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {periods.map((period) => (
                <tr key={period} className="border-b border-sp-border last:border-b-0">
                  <td className="border-r border-sp-border bg-sp-card px-2 py-2 text-center text-sm font-medium text-sp-muted">
                    {resolvePeriodLabel(period, periodTimes)}
                  </td>
                  {weekDates.map((_date, dayIndex) => {
                    const cell = grid.get(cellKey(dayIndex, period));
                    return (
                      <td
                        key={`${dayIndex}-${period}`}
                        className="border-r border-sp-border p-1.5 align-top last:border-r-0"
                      >
                        {cell ? (
                          <ProgressCalendarCell
                            cell={cell}
                            colorBy={colorBy}
                            subjectColors={subjectColors}
                            classroomColors={classroomColors}
                            classSummary={
                              cell.matchedClass
                                ? classSummaries?.get(cell.matchedClass.id)
                                : undefined
                            }
                            onAddClick={() => onEmptyCellClick(cell)}
                            onEntryClick={() => onEntryClick(cell)}
                          />
                        ) : (
                          <div className="flex min-h-[84px] w-full items-center justify-center rounded-lg bg-black/5 text-xs text-sp-muted dark:bg-white/10">
                            —
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
