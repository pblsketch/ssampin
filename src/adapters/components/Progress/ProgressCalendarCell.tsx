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
  /** 진도가 있는 칸만 끌 수 있다 — 빈 칸은 옮길 것이 없다 */
  draggable?: boolean;
  /** 지금 끌고 있는 칸(원본) — 흐리게 */
  isDragging?: boolean;
  /** 끌고 있는 진도를 놓을 수 있는 칸 — 점선으로 밝힘 */
  isDropTarget?: boolean;
  /** 커서가 지금 이 칸 위에 있음 — 점선보다 더 뚜렷하게 */
  isDropHover?: boolean;
  /** 끌고 있는 중인데 여기엔 놓을 수 없음 — 뒤로 물린다 */
  isDimmed?: boolean;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
}

export function ProgressCalendarCell({
  cell,
  colorBy,
  subjectColors,
  classroomColors,
  classSummary,
  onAddClick,
  onEntryClick,
  draggable = false,
  isDragging = false,
  isDropTarget = false,
  isDropHover = false,
  isDimmed = false,
  onDragStart,
  onDragEnd,
}: ProgressCalendarCellProps) {
  const { slot, matchedClass } = cell;

  if (!slot) {
    // 공강 — 옅은 빈 칸
    return (
      <div className="flex min-h-[104px] w-full items-center justify-center rounded-lg bg-black/5 text-xs text-sp-muted dark:bg-white/10">
        —
      </div>
    );
  }

  const style = getCellStyle(slot.subject, slot.classroom, colorBy, subjectColors, classroomColors);

  /*
   * 놓을 수 있는 칸을 눈으로 알려 준다. 이게 없으면 선생님은 아무 데나 끌어 보고 튕겨야
   * 규칙을 알게 된다 — 다른 반 칸에 놓으면 캘린더에서 사라지는 조작이라 더 그렇다.
   *
   * ★ 점선 테두리만으로는 약하다. 빈 칸마다 '진도 추가' 점선 버튼이 이미 들어 있어서
   *   점선끼리 경쟁하기 때문이다(실화면에서 확인). 그래서 세 가지를 함께 쓴다 —
   *   놓을 수 있는 칸은 링으로 띄우고, 놓을 수 없는 칸은 뒤로 물리고, 커서가 올라간
   *   칸만 실선으로 한 단계 더 올린다.
   */
  const dropRing = isDropHover
    ? 'border-sp-accent ring-2 ring-sp-accent'
    : isDropTarget
      ? 'border-dashed border-sp-accent ring-1 ring-sp-accent/30'
      : style.border;

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`relative flex min-h-[104px] w-full min-w-0 flex-col gap-1 rounded-lg border p-2 transition-all duration-sp-quick ease-sp-out ${style.bg} ${dropRing} ${
        draggable ? 'cursor-grab active:cursor-grabbing' : ''
      } ${isDragging ? 'opacity-40' : ''} ${isDimmed ? 'opacity-50 saturate-50' : ''}`}
    >
      <div className="flex min-w-0 items-start justify-between gap-1">
        <span className={`min-w-0 truncate text-sm font-bold ${style.text}`}>{slot.subject}</span>
        {matchedClass && (
          <span className="shrink-0 rounded-full bg-black/10 px-1.5 py-0.5 text-micro font-semibold text-sp-muted dark:bg-white/10">
            {matchedClass.name}
          </span>
        )}
      </div>
      <div className="mt-auto min-w-0">
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
