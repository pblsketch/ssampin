import { useState } from 'react';
import { toLocalDateString } from '@shared/utils/localDate';
import { cellKey } from '@domain/rules/progressCalendarRules';
import { canDropProgressCell } from '@domain/rules/progressMove';
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
  /**
   * 진도를 끌어다 다른 칸에 놓았을 때. 넘기지 않으면 드래그 자체가 꺼진다
   * (모바일·읽기 전용 화면에서 이 격자를 재사용할 때를 위해 선택 사항으로 둔다).
   */
  onMoveCell?: (source: WeeklyProgressCell, target: WeeklyProgressCell) => void;
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
  onMoveCell,
}: ProgressCalendarGridProps) {
  const todayStr = toLocalDateString(new Date());

  // 끌고 있는 칸 / 커서가 올라간 칸. 격자 안에서만 쓰는 화면 상태라 부모로 올리지 않는다.
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const dragSource = dragKey ? (grid.get(dragKey) ?? null) : null;

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
          {/*
           * table-fixed 필수 — 기본값(auto)에서는 칸 안의 긴 단원·차시 텍스트가 열 폭을 정하기
           * 때문에, 진도 글이 길어지면 표가 창보다 넓어지고 그 넘침이 조상 flex(min-width:auto)를
           * 타고 올라가 body의 overflow-x:hidden에 잘린다 → 목·금이 화면 밖으로 사라짐(F-1 신고).
           * colgroup으로 폭을 먼저 못박아야 셀 안의 truncate/line-clamp가 비로소 동작한다.
           * (같은 골격을 attendance/shared/AttendanceGridView 가 이미 쓴다.)
           */}
          <table className="w-full min-w-[720px] table-fixed border-collapse">
            <colgroup>
              <col className="w-16" />
              {dayLabels.map((label, dayIndex) => (
                <col
                  key={`col-${dayIndex}-${label}`}
                  style={{ width: `${100 / dayLabels.length}%` }}
                />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b border-sp-border bg-sp-surface">
                <th className="border-r border-sp-border px-2 py-3 text-center text-sm font-bold text-sp-text">
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
                    const key = cellKey(dayIndex, period);
                    const cell = grid.get(key);
                    const canDropHere = Boolean(
                      dragSource && cell && canDropProgressCell(dragSource, cell).ok,
                    );
                    return (
                      <td
                        key={`${dayIndex}-${period}`}
                        className="border-r border-sp-border p-1.5 align-top last:border-r-0"
                        onDragOver={(e) => {
                          if (!canDropHere) return;
                          // preventDefault 를 해야만 브라우저가 이 칸을 놓을 수 있는 곳으로 인정한다
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          if (hoverKey !== key) setHoverKey(key);
                        }}
                        onDrop={(e) => {
                          if (!canDropHere || !cell || !dragSource) return;
                          e.preventDefault();
                          onMoveCell?.(dragSource, cell);
                          setHoverKey(null);
                        }}
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
                            draggable={Boolean(onMoveCell) && cell.entries.length > 0}
                            isDragging={dragKey === key}
                            isDropTarget={canDropHere}
                            isDropHover={canDropHere && hoverKey === key}
                            isDimmed={Boolean(dragSource) && !canDropHere && dragKey !== key}
                            onDragStart={(e) => {
                              e.dataTransfer.effectAllowed = 'move';
                              // 일부 브라우저는 데이터가 없으면 드래그를 시작조차 하지 않는다
                              e.dataTransfer.setData('text/plain', key);
                              setDragKey(key);
                            }}
                            onDragEnd={() => {
                              setDragKey(null);
                              setHoverKey(null);
                            }}
                          />
                        ) : (
                          <div className="flex min-h-[104px] w-full items-center justify-center rounded-lg bg-black/5 text-xs text-sp-muted dark:bg-white/10">
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
