import { useState, useRef, useEffect, useMemo } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';

interface DatePopoverProps {
  /** 시작일 (dueDate) */
  date: string;
  /** 종료일 (dueDate when startDate is set) — undefined if single-day */
  endDate?: string;
  /** 기한 없음 */
  noDueDate?: boolean;
  onDateChange: (date: string) => void;
  onEndDateChange: (endDate: string | undefined) => void;
  onNoDueDateChange?: (noDueDate: boolean) => void;
  /** 트리거 요소 (children) */
  children: React.ReactNode;
}

const DAY_NAMES_MONDAY = ['월', '화', '수', '목', '금', '토', '일'];
const DAY_NAMES_SUNDAY = ['일', '월', '화', '수', '목', '금', '토'];

function getMonthDays(year: number, month: number, sundayStart: boolean) {
  const firstDay = new Date(year, month, 1);
  let startDow: number;
  if (sundayStart) {
    // Sunday-based: 0=Sun, 6=Sat
    startDow = firstDay.getDay();
  } else {
    // Monday-based: 0=Mon, 6=Sun
    startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6;
  }
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells: { day: number; month: number; year: number; isCurrentMonth: boolean }[] = [];

  // Previous month fill
  for (let i = startDow - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, month: month - 1, year: month === 0 ? year - 1 : year, isCurrentMonth: false });
  }
  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, month, year, isCurrentMonth: true });
  }
  // Next month fill (up to 42 cells = 6 rows)
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    cells.push({ day: d, month: month + 1, year: month === 11 ? year + 1 : year, isCurrentMonth: false });
  }
  return cells;
}

function toYMD(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseYMD(s: string): { year: number; month: number; day: number } {
  const parts = s.split('-').map(Number);
  return { year: parts[0]!, month: parts[1]! - 1, day: parts[2]! };
}

export function DatePopover({
  date,
  endDate,
  noDueDate,
  onDateChange,
  onEndDateChange,
  onNoDueDateChange,
  children,
}: DatePopoverProps) {
  const [open, setOpen] = useState(false);
  const [hasEndDate, setHasEndDate] = useState(!!endDate);
  const ref = useRef<HTMLDivElement>(null);

  const parsed = useMemo(() => date ? parseYMD(date) : { year: new Date().getFullYear(), month: new Date().getMonth(), day: new Date().getDate() }, [date]);
  const [viewYear, setViewYear] = useState(parsed.year);
  const [viewMonth, setViewMonth] = useState(parsed.month);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Sync view when date changes externally
  useEffect(() => {
    if (date) {
      const p = parseYMD(date);
      setViewYear(p.year);
      setViewMonth(p.month);
    }
  }, [date]);

  const sundayStart = (useSettingsStore((s) => s.settings.weekdayStart) ?? 'sunday') === 'sunday';
  const dayNames = sundayStart ? DAY_NAMES_SUNDAY : DAY_NAMES_MONDAY;
  const cells = useMemo(() => getMonthDays(viewYear, viewMonth, sundayStart), [viewYear, viewMonth, sundayStart]);

  const todayStr = useMemo(() => {
    const t = new Date();
    return toYMD(t.getFullYear(), t.getMonth(), t.getDate());
  }, []);

  const handlePrevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };
  const handleNextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };
  const handleToday = () => {
    const t = new Date();
    setViewYear(t.getFullYear());
    setViewMonth(t.getMonth());
  };

  const handleDayClick = (cell: { day: number; month: number; year: number }) => {
    const ymd = toYMD(cell.year, cell.month, cell.day);
    if (hasEndDate && date && !endDate) {
      // Setting end date (second click)
      if (ymd >= date) {
        onEndDateChange(ymd);
      } else {
        // Clicked before start → swap
        onEndDateChange(date);
        onDateChange(ymd);
      }
    } else {
      onDateChange(ymd);
      if (hasEndDate) {
        onEndDateChange(undefined); // Reset end date for re-selection
      }
    }
  };

  const handleEndDateToggle = (enabled: boolean) => {
    setHasEndDate(enabled);
    if (!enabled) {
      onEndDateChange(undefined);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen(!open)} className="cursor-pointer">
        {children}
      </div>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white rounded-xl shadow-xl border border-gray-200 p-4 w-72">
          {/* 월 네비게이션 */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-gray-800">
              {viewYear}년 {viewMonth + 1}월
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleToday}
                className="text-xs text-blue-500 hover:text-blue-700 px-2 py-0.5 rounded hover:bg-blue-50 transition-colors"
              >
                오늘
              </button>
              <button type="button" onClick={handlePrevMonth} className="p-1 text-gray-400 hover:text-gray-700 transition-colors">
                <span className="material-symbols-outlined text-icon">chevron_left</span>
              </button>
              <button type="button" onClick={handleNextMonth} className="p-1 text-gray-400 hover:text-gray-700 transition-colors">
                <span className="material-symbols-outlined text-icon">chevron_right</span>
              </button>
            </div>
          </div>

          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {dayNames.map(d => (
              <div key={d} className="text-center text-[10px] font-medium text-gray-400 py-1">
                {d}
              </div>
            ))}
          </div>

          {/* 날짜 그리드 */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((cell, i) => {
              const ymd = toYMD(cell.year, cell.month, cell.day);
              const isToday = ymd === todayStr;
              const isSelected = ymd === date;
              const isEndSelected = ymd === endDate;
              const isInRange = hasEndDate && date && endDate && ymd > date && ymd < endDate;

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleDayClick(cell)}
                  className={`text-xs h-7 w-full rounded-md transition-colors ${
                    !cell.isCurrentMonth ? 'text-gray-300' : ''
                  } ${
                    isSelected || isEndSelected
                      ? 'bg-blue-500 text-white font-bold'
                      : isToday
                        ? 'bg-blue-100 text-blue-700 font-bold'
                        : isInRange
                          ? 'bg-blue-50 text-blue-600'
                          : cell.isCurrentMonth
                            ? 'text-gray-700 hover:bg-gray-100'
                            : 'hover:bg-gray-50'
                  }`}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          {/* 옵션 */}
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
            {/* 종료일 토글 */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600">종료일</span>
              <button
                type="button"
                onClick={() => handleEndDateToggle(!hasEndDate)}
                className={`w-9 h-5 rounded-full transition-colors relative ${
                  hasEndDate ? 'bg-blue-500' : 'bg-gray-200'
                }`}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  hasEndDate ? 'translate-x-4' : 'translate-x-0.5'
                }`} />
              </button>
            </div>

            {/* 기한 없음 (새 할 일 추가 시에만) */}
            {onNoDueDateChange && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">기한 없음</span>
                <button
                  type="button"
                  onClick={() => {
                    onNoDueDateChange(!noDueDate);
                    setOpen(false);
                  }}
                  className={`w-9 h-5 rounded-full transition-colors relative ${
                    noDueDate ? 'bg-blue-500' : 'bg-gray-200'
                  }`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                    noDueDate ? 'translate-x-4' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>
            )}

            {/* 선택된 날짜 표시 */}
            {date && !noDueDate && (
              <div className="text-[10px] text-gray-400 text-center pt-1">
                {date}{hasEndDate && endDate ? ` → ${endDate}` : hasEndDate ? ' → (종료일 클릭)' : ''}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
