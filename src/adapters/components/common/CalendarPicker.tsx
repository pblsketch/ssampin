import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface CalendarPickerProps {
  value: string;                    // "2026-03-24"
  onChange: (date: string) => void;
  /** 수업이 있는 요일 (JS getDay: 0=일, 1=월, ..., 6=토) */
  lessonDays?: readonly number[];
  className?: string;
  /** 컴팩트 모드 (import 모달 등 좁은 공간용) */
  compact?: boolean;
  /** Portal 모드: overflow 클리핑을 피하기 위해 document.body에 드롭다운을 렌더링 */
  portal?: boolean;
  /** 커스텀 강조 색상 (과목 색상 등). 미지정 시 기본 sp-accent 사용 */
  accentColor?: {
    text: string;      // e.g. 'text-yellow-300'
    bg: string;        // e.g. 'bg-yellow-500/20'
    bgSolid: string;   // e.g. 'bg-yellow-400'
  };
}

/* ── 유틸 ── */

function formatDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDateStr(s: string): Date {
  return new Date(s + 'T00:00:00');
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

function getCalendarDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay(); // 0=일

  const days: Date[] = [];
  // 이전 달 빈칸
  for (let i = startOffset - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i));
  }
  // 이번 달
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(new Date(year, month, d));
  }
  // 다음 달 (6줄 채우기)
  const remaining = 42 - days.length;
  for (let d = 1; d <= remaining; d++) {
    days.push(new Date(year, month + 1, d));
  }
  return days;
}

/* ── Portal 드롭다운 위치 계산 ── */

interface DropdownStyle {
  top: number;
  left: number;
}

function calcDropdownStyle(trigger: HTMLElement): DropdownStyle {
  const DROPDOWN_HEIGHT = 320; // 대략적인 드롭다운 높이
  const DROPDOWN_WIDTH = 280;
  const MARGIN = 4;

  const rect = trigger.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;

  // 아래에 공간이 충분한지 확인, 부족하면 위로 뒤집기
  const spaceBelow = viewportHeight - rect.bottom;
  const spaceAbove = rect.top;
  let top: number;
  if (spaceBelow >= DROPDOWN_HEIGHT || spaceBelow >= spaceAbove) {
    top = rect.bottom + MARGIN;
  } else {
    top = rect.top - DROPDOWN_HEIGHT - MARGIN;
  }

  // 오른쪽으로 넘치지 않게 조정
  let left = rect.left;
  if (left + DROPDOWN_WIDTH > viewportWidth) {
    left = viewportWidth - DROPDOWN_WIDTH - MARGIN;
  }
  if (left < MARGIN) left = MARGIN;

  return { top, left };
}

/* ── 컴포넌트 ── */

export function CalendarPicker({
  value,
  onChange,
  lessonDays,
  className = '',
  compact = false,
  portal = false,
  accentColor,
}: CalendarPickerProps) {
  const textColor = accentColor?.text ?? 'text-sp-accent';
  const bgColor = accentColor?.bg ?? 'bg-sp-accent/20';
  const bgSolidColor = accentColor?.bgSolid ?? 'bg-sp-accent';
  const [open, setOpen] = useState(false);
  const selected = value ? parseDateStr(value) : new Date();
  const [viewYear, setViewYear] = useState(selected.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected.getMonth());
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<DropdownStyle>({ top: 0, left: 0 });
  const today = new Date();

  const lessonDaySet = new Set(lessonDays ?? []);

  // value 변경 시 뷰 동기화
  useEffect(() => {
    if (value) {
      const d = parseDateStr(value);
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }, [value]);

  // Portal 모드: 드롭다운 위치 계산
  const updatePosition = useCallback(() => {
    if (portal && triggerRef.current) {
      setDropdownStyle(calcDropdownStyle(triggerRef.current));
    }
  }, [portal]);

  // Portal 모드: 열릴 때 위치 계산 + 스크롤/리사이즈 시 재계산
  useEffect(() => {
    if (!open || !portal) return;
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, portal, updatePosition]);

  // 외부 클릭 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      // containerRef (트리거 포함 래퍼) 내부 클릭이면 무시
      if (containerRef.current && containerRef.current.contains(target)) return;
      // portal 모드: 드롭다운 내부 클릭이면 무시
      if (portal && dropdownRef.current && dropdownRef.current.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, portal]);

  const navigateMonth = useCallback((delta: number) => {
    setViewMonth((prev) => {
      const next = prev + delta;
      if (next < 0) {
        setViewYear((y) => y - 1);
        return 11;
      }
      if (next > 11) {
        setViewYear((y) => y + 1);
        return 0;
      }
      return next;
    });
  }, []);

  const handleSelect = useCallback((d: Date) => {
    onChange(formatDateStr(d));
    setOpen(false);
  }, [onChange]);

  const handleToday = useCallback(() => {
    onChange(formatDateStr(today));
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setOpen(false);
  }, [onChange, today]);

  const days = getCalendarDays(viewYear, viewMonth);
  const dayOfWeekStr = value ? DAY_LABELS[parseDateStr(value).getDay()] : '';

  /* ── 드롭다운 JSX ── */
  const dropdownContent = (
    <div
      ref={dropdownRef}
      className={
        portal
          ? 'fixed z-[9999] bg-sp-card border border-sp-border rounded-xl shadow-xl p-3 w-[280px] select-none'
          : 'absolute top-full left-0 mt-1 z-50 bg-sp-card border border-sp-border rounded-xl shadow-xl p-3 w-[280px] select-none'
      }
      style={portal ? { top: dropdownStyle.top, left: dropdownStyle.left } : undefined}
    >
      {/* 헤더: 월 네비게이션 */}
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => navigateMonth(-1)}
          className="p-1 rounded-lg hover:bg-sp-text/10 transition-colors"
        >
          <span className="material-symbols-outlined text-sp-muted text-lg">chevron_left</span>
        </button>
        <span className="text-sm font-medium text-sp-text">
          {viewYear}년 {viewMonth + 1}월
        </span>
        <button
          type="button"
          onClick={() => navigateMonth(1)}
          className="p-1 rounded-lg hover:bg-sp-text/10 transition-colors"
        >
          <span className="material-symbols-outlined text-sp-muted text-lg">chevron_right</span>
        </button>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_LABELS.map((label, idx) => (
          <div
            key={label}
            className={`text-center text-xs py-1 font-medium ${
              lessonDaySet.has(idx) ? textColor : 'text-sp-muted'
            } ${idx === 0 ? 'text-red-400' : idx === 6 ? 'text-blue-400' : ''}`}
          >
            {label}
            {lessonDaySet.has(idx) && (
              <span className={`block w-1 h-1 rounded-full ${bgSolidColor} mx-auto mt-0.5`} />
            )}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const isCurrentMonth = d.getMonth() === viewMonth;
          const isToday = isSameDay(d, today);
          const isSelected = value ? isSameDay(d, selected) : false;
          const isLessonDay = lessonDaySet.has(d.getDay());
          const isSunday = d.getDay() === 0;
          const isSaturday = d.getDay() === 6;

          return (
            <button
              key={i}
              type="button"
              onClick={() => handleSelect(d)}
              className={`relative flex flex-col items-center justify-center h-8 rounded-lg
                         text-xs transition-colors
                ${isSelected
                  ? `${bgSolidColor} text-white font-bold`
                  : isToday
                    ? `${bgColor} ${textColor} font-medium`
                    : isCurrentMonth
                      ? 'hover:bg-sp-text/10'
                      : 'opacity-30'
                }
                ${!isSelected && isCurrentMonth && isSunday ? 'text-red-400' : ''}
                ${!isSelected && isCurrentMonth && isSaturday ? 'text-blue-400' : ''}
                ${!isSelected && isCurrentMonth && !isSunday && !isSaturday ? 'text-sp-text' : ''}
              `}
            >
              {d.getDate()}
              {/* 수업 요일 표시 도트 */}
              {isLessonDay && isCurrentMonth && !isSelected && (
                <span className={`absolute bottom-0.5 w-1 h-1 rounded-full ${bgSolidColor}`} />
              )}
            </button>
          );
        })}
      </div>

      {/* 하단 바로가기 */}
      <div className="flex justify-between mt-2 pt-2 border-t border-sp-border">
        <button
          type="button"
          onClick={handleToday}
          className={`text-xs ${textColor} hover:opacity-80 transition-colors`}
        >
          오늘
        </button>
        {lessonDays && lessonDays.length > 0 && (
          <span className="text-xs text-sp-muted flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${bgSolidColor} inline-block`} />
            수업일
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* ── 트리거 버튼 ── */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-2 bg-sp-card border border-sp-border rounded-lg
                    text-sp-text text-sm focus:outline-none focus:border-sp-accent transition-colors
                    hover:border-sp-accent/50 ${compact ? 'px-2 py-0.5 text-xs' : 'px-3 py-1.5'}`}
      >
        <span className="flex-1 text-left">
          {value || '날짜 선택'}
          {dayOfWeekStr && (
            <span className="text-sp-muted ml-1">({dayOfWeekStr})</span>
          )}
        </span>
        <span className="material-symbols-outlined text-sp-muted text-base shrink-0">calendar_today</span>
      </button>

      {/* ── 드롭다운 달력 ── */}
      {open && (
        portal
          ? createPortal(dropdownContent, document.body)
          : dropdownContent
      )}
    </div>
  );
}
