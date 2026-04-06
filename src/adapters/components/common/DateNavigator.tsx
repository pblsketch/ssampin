import { useCallback } from 'react';

const DAY_KO: Record<number, string> = {
  0: '일', 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토',
};

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDate(date: Date): string {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dow = DAY_KO[date.getDay()] ?? '';
  return `${month}/${day} (${dow})`;
}

interface DateNavigatorProps {
  /** 현재 표시 중인 날짜 */
  date: Date;
  /** 날짜 변경 콜백 */
  onDateChange: (date: Date) => void;
  /** 추가 className (루트 div) */
  className?: string;
}

/**
 * 날짜 탐색 컴포넌트 — 이전/다음 버튼 + 날짜 표시 + "오늘" 복귀 버튼
 * 오늘 날짜를 보고 있을 때는 오늘 복귀 버튼이 숨겨진다.
 */
export function DateNavigator({ date, onDateChange, className = '' }: DateNavigatorProps) {
  const today = new Date();
  const isToday = isSameDay(date, today);

  const goPrev = useCallback(() => {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    onDateChange(d);
  }, [date, onDateChange]);

  const goNext = useCallback(() => {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    onDateChange(d);
  }, [date, onDateChange]);

  const goToday = useCallback(() => {
    onDateChange(new Date());
  }, [onDateChange]);

  const isFuture = date > today && !isToday;
  const dayOfWeek = date.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  return (
    <div className={`flex items-center gap-0.5 ${className}`}>
      {/* 오늘 복귀 버튼 — 오늘이 아닐 때만 표시 */}
      {!isToday && (
        <button
          onClick={goToday}
          title="오늘로 이동"
          className="
            mr-1 px-1.5 py-0.5 rounded
            text-[10px] font-semibold leading-none
            text-sp-accent border border-sp-accent/40
            hover:bg-sp-accent/15 hover:border-sp-accent/70
            transition-colors duration-150
          "
        >
          오늘
        </button>
      )}

      {/* 이전 버튼 */}
      <button
        onClick={goPrev}
        title="이전 날"
        className="
          w-5 h-5 flex items-center justify-center rounded
          text-sp-muted hover:text-sp-text hover:bg-sp-surface
          transition-colors duration-150
        "
        aria-label="이전 날"
      >
        <ChevronLeftIcon />
      </button>

      {/* 날짜 표시 */}
      <span
        className={`
          min-w-[72px] text-center text-xs font-medium select-none
          ${isToday
            ? 'text-sp-text'
            : isWeekend
              ? isFuture ? 'text-sp-muted/70' : 'text-sp-muted/70'
              : 'text-sp-muted'
          }
        `}
      >
        {isToday ? (
          <span className="text-sp-text font-semibold">
            오늘 <span className="text-sp-muted font-normal">({DAY_KO[dayOfWeek]})</span>
          </span>
        ) : (
          <span className={isWeekend ? 'text-sp-muted/60' : ''}>
            {formatDate(date)}
          </span>
        )}
      </span>

      {/* 다음 버튼 */}
      <button
        onClick={goNext}
        title="다음 날"
        className="
          w-5 h-5 flex items-center justify-center rounded
          text-sp-muted hover:text-sp-text hover:bg-sp-surface
          transition-colors duration-150
        "
        aria-label="다음 날"
      >
        <ChevronRightIcon />
      </button>
    </div>
  );
}

/* ─── 아이콘 ─── */

function ChevronLeftIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="7.5,2 4,6 7.5,10" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="4.5,2 8,6 4.5,10" />
    </svg>
  );
}

/* ─── 유틸 재export ─── */
export { isSameDay };
