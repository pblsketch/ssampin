import { useCallback, useRef } from 'react';

interface DateNavigatorProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  /**
   * true 이면 선택 날짜가 오늘보다 과거일 때 "(과거)" 배지를 표시한다.
   * 다른 사용처(기존 누가기록 등)에 영향을 주지 않도록 기본값은 false.
   */
  pastBadge?: boolean;
}

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateFull(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const dayName = DAY_NAMES[d.getDay()];
  return `${year}년 ${month}월 ${day}일 (${dayName})`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function DateNavigator({
  selectedDate,
  onDateChange,
  pastBadge = false,
}: DateNavigatorProps) {
  const dateInputRef = useRef<HTMLInputElement>(null);
  const today = todayString();
  const isToday = selectedDate === today;
  const isPast = selectedDate < today;

  const handlePrev = useCallback(() => {
    onDateChange(addDays(selectedDate, -1));
  }, [selectedDate, onDateChange]);

  const handleNext = useCallback(() => {
    onDateChange(addDays(selectedDate, 1));
  }, [selectedDate, onDateChange]);

  const handleToday = useCallback(() => {
    onDateChange(todayString());
  }, [onDateChange]);

  const handleDateClick = useCallback(() => {
    dateInputRef.current?.showPicker();
  }, []);

  return (
    <div className="flex items-center gap-2 mb-4">
      <button
        onClick={handlePrev}
        className="w-8 h-8 flex items-center justify-center rounded-lg bg-sp-surface text-sp-muted hover:text-sp-text hover:bg-sp-surface/80 transition-all"
        title="이전 날짜"
      >
        <span className="material-symbols-outlined text-lg">chevron_left</span>
      </button>

      <button
        onClick={handleDateClick}
        className={`relative px-4 py-2 rounded-lg text-sm font-medium transition-all ${
          isToday ? 'bg-sp-surface text-sp-text' : 'bg-sp-accent/10 text-sp-accent'
        } hover:bg-sp-surface/80`}
      >
        {formatDateFull(selectedDate)}
        <input
          ref={dateInputRef}
          type="date"
          value={selectedDate}
          onChange={(e) => {
            if (e.target.value) onDateChange(e.target.value);
          }}
          className="absolute inset-0 opacity-0 cursor-pointer"
          tabIndex={-1}
        />
      </button>

      <button
        onClick={handleNext}
        className="w-8 h-8 flex items-center justify-center rounded-lg bg-sp-surface text-sp-muted hover:text-sp-text hover:bg-sp-surface/80 transition-all"
        title="다음 날짜"
      >
        <span className="material-symbols-outlined text-lg">chevron_right</span>
      </button>

      {!isToday && (
        <button
          onClick={handleToday}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-sp-accent/10 text-sp-accent hover:bg-sp-accent/20 transition-all"
        >
          오늘
        </button>
      )}

      {pastBadge && isPast && (
        <span className="px-2 py-1 rounded-md text-xs font-semibold bg-amber-500/15 text-amber-500">
          과거
        </span>
      )}
    </div>
  );
}
