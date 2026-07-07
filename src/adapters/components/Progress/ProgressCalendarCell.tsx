import { getCellStyle } from '@adapters/presenters/timetablePresenter';
import type { WeeklyProgressCell } from '@domain/rules/progressCalendarRules';
import type { SubjectColorMap } from '@domain/valueObjects/SubjectColor';
import { ProgressCellOverlay } from './ProgressCellOverlay';

/**
 * 진도 캘린더(B안)의 한 칸.
 * 시간표와 동일한 색상 카드(getCellStyle) 위에 과목명 + 반 칩을 얹고,
 * 하단에 ProgressCellOverlay(정적 흐름)로 진도 상태를 표시한다.
 */
export interface ProgressCalendarCellProps {
  cell: WeeklyProgressCell;
  colorBy: 'subject' | 'classroom';
  subjectColors?: SubjectColorMap;
  classroomColors?: SubjectColorMap;
  classSummary?: { completed: number; total: number; percent: number };
  onAddClick?: () => void;
  onEntryClick?: () => void;
}

export function ProgressCalendarCell({
  cell,
  colorBy,
  subjectColors,
  classroomColors,
  classSummary,
  onAddClick,
  onEntryClick,
}: ProgressCalendarCellProps) {
  const { slot, matchedClass } = cell;

  if (!slot) {
    // 공강 — 옅은 빈 칸
    return (
      <div className="flex min-h-[84px] w-full items-center justify-center rounded-lg bg-black/5 text-xs text-sp-muted dark:bg-white/10">
        —
      </div>
    );
  }

  const style = getCellStyle(slot.subject, slot.classroom, colorBy, subjectColors, classroomColors);

  return (
    <div
      className={`relative flex min-h-[84px] w-full flex-col gap-1.5 rounded-lg border p-2 ${style.bg} ${style.border}`}
    >
      <div className="flex items-start justify-between gap-1">
        <span className={`truncate text-sm font-bold ${style.text}`}>{slot.subject}</span>
        {matchedClass && (
          <span className="shrink-0 rounded-full bg-black/10 px-1.5 py-0.5 text-micro font-semibold text-sp-muted dark:bg-white/10">
            {matchedClass.name}
          </span>
        )}
      </div>
      <div className="mt-auto">
        <ProgressCellOverlay
          cell={cell}
          classSummary={classSummary}
          onAddClick={onAddClick}
          onEntryClick={onEntryClick}
          asOverlay={false}
        />
      </div>
    </div>
  );
}
