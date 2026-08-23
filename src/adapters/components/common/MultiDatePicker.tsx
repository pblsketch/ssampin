/**
 * MultiDatePicker — single / range / multi 3-mode 통합 날짜 픽커
 *
 * Spec: `docs/02-design/features/multi-date-attendance.design.md`
 *
 * - `mode='single'` : 단일 날짜 (CalendarPicker 호환)
 * - `mode='range'`  : 시작-종료 두 번 클릭 + 호버 미리보기
 * - `mode='multi'`  : 임의 N개 토글 + 프리셋 + 칩 리스트 + 30일 가드
 *
 * 무외부 헤드리스 정책 — `react-day-picker` 등 외부 라이브러리 미사용.
 * ARIA `role="grid"` 적용 + 화살표 키 네비게이션 + Esc 닫기.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  DAY_LABELS,
  DEFAULT_MAX_COUNT,
  formatDateStr,
  parseDateStr,
  isSameDay,
  getCalendarDays,
  enumerateRange,
  getThisWeekDates,
  getNextWeekDates,
  formatDateChip,
} from './calendarUtils';

/* ──────────────────────── Types ──────────────────────── */

export type DatePickerMode = 'single' | 'range' | 'multi';

export interface AccentColor {
  text: string; // e.g. 'text-yellow-300'
  bg: string; // e.g. 'bg-yellow-500/20'
  bgSolid: string; // e.g. 'bg-yellow-400'
}

export interface MultiDatePickerProps {
  /** 선택 모드 */
  mode: DatePickerMode;

  // ----- single 모드 -----
  /** single 모드 현재 값 "YYYY-MM-DD" */
  singleValue?: string;
  onSingleChange?: (date: string) => void;

  // ----- range 모드 -----
  /** range 모드 시작 날짜 */
  rangeStart?: string;
  /** range 모드 종료 날짜 */
  rangeEnd?: string;
  onRangeChange?: (start: string, end: string) => void;

  // ----- multi 모드 -----
  /** multi 모드 선택된 날짜 Set<"YYYY-MM-DD"> */
  multiValues?: ReadonlySet<string>;
  onMultiChange?: (dates: ReadonlySet<string>) => void;

  // ----- 공통 옵션 -----
  /** 수업이 있는 요일 강조 (JS getDay: 0=일, 1=월, ..., 6=토) */
  lessonDays?: readonly number[];
  /** 선택 상한 (기본 30) — range/multi 모드에만 적용 */
  maxCount?: number;
  /** 커스텀 강조 색상 (과목 색상 등). 미지정 시 기본 sp-accent */
  accentColor?: AccentColor;
  /** Portal 모드 — 모달·드로어 안에서 클리핑 방지 */
  portal?: boolean;
  /** 컴팩트 트리거 (좁은 공간) */
  compact?: boolean;
  /** 외부 클래스 추가 */
  className?: string;
  /** 모바일 Bottom Sheet 전용 레이아웃 */
  mobileSheet?: boolean;
  /** 달력 직접 노출 (트리거 없이 인라인 임베드) */
  inline?: boolean;
  /** 트리거 라벨 prefix (예: "여러 날짜 선택") */
  triggerLabel?: string;
  /** 토스트 콜백 — 30일 초과 등 (없으면 alert 폴백) */
  onToast?: (message: string, type: 'info' | 'error' | 'success') => void;
}

/* ──────────────────────── 순수 분기 함수 (테스트 가능) ──────────────────────── */

/** range 모드 클릭 결과 */
export type RangeClickResult =
  | { kind: 'new-range'; start: string; end: string }
  | { kind: 'swap'; start: string; end: string }
  | { kind: 'extend'; start: string; end: string }
  | { kind: 'over-cap'; total: number };

/**
 * range 모드 셀 클릭의 결과를 결정한다.
 *
 * 의사결정 우선순위:
 *   1. start 미설정 → new-range (start=end=iso)
 *   2. 완료된 range (start < end) → new-range (재시작)
 *   3. start === end (단일 임시) 또는 start 만 설정 → 종료 결정
 *     - iso < start  → swap
 *     - 범위 길이 > maxCount → over-cap
 *     - 그 외 → extend
 */
export function decideRangeClick(
  iso: string,
  rangeStart: string | undefined,
  rangeEnd: string | undefined,
  maxCount: number,
): RangeClickResult {
  // 1. 시작 미설정 → 새 범위 시작
  if (!rangeStart) {
    return { kind: 'new-range', start: iso, end: iso };
  }
  // 2. 완료된 range (start < end) → 재시작
  if (rangeEnd && rangeStart < rangeEnd) {
    return { kind: 'new-range', start: iso, end: iso };
  }
  // 3. start === end 또는 start 만 설정 → 종료 결정
  if (iso < rangeStart) {
    return { kind: 'swap', start: iso, end: rangeStart };
  }
  const total = enumerateRange(rangeStart, iso).length;
  if (total > maxCount) {
    return { kind: 'over-cap', total };
  }
  return { kind: 'extend', start: rangeStart, end: iso };
}

/** multi 모드 클릭 결과 */
export type MultiClickResult =
  | { kind: 'add'; iso: string }
  | { kind: 'remove'; iso: string }
  | { kind: 'over-cap'; size: number };

/**
 * multi 모드 셀 클릭의 결과를 결정한다.
 *
 * - 이미 선택됨 → remove
 * - 상한 도달 → over-cap (no-op)
 * - 그 외 → add
 */
export function decideMultiClick(
  iso: string,
  current: ReadonlySet<string>,
  maxCount: number,
): MultiClickResult {
  if (current.has(iso)) return { kind: 'remove', iso };
  if (current.size >= maxCount) return { kind: 'over-cap', size: current.size };
  return { kind: 'add', iso };
}

/* ──────────────────────── Portal 위치 계산 ──────────────────────── */

interface DropdownStyle {
  top: number;
  left: number;
}

function calcDropdownStyle(
  trigger: HTMLElement,
  panelWidth: number,
  panelHeight: number,
): DropdownStyle {
  const MARGIN = 4;
  const rect = trigger.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;

  const spaceBelow = viewportHeight - rect.bottom;
  const spaceAbove = rect.top;
  let top: number;
  if (spaceBelow >= panelHeight || spaceBelow >= spaceAbove) {
    top = rect.bottom + MARGIN;
  } else {
    top = rect.top - panelHeight - MARGIN;
  }

  let left = rect.left;
  if (left + panelWidth > viewportWidth) {
    left = viewportWidth - panelWidth - MARGIN;
  }
  if (left < MARGIN) left = MARGIN;

  return { top, left };
}

/* ──────────────────────── 메인 컴포넌트 ──────────────────────── */

export function MultiDatePicker(props: MultiDatePickerProps) {
  const {
    mode,
    singleValue,
    onSingleChange,
    rangeStart,
    rangeEnd,
    onRangeChange,
    multiValues,
    onMultiChange,
    lessonDays,
    maxCount = DEFAULT_MAX_COUNT,
    accentColor,
    portal = false,
    compact = false,
    className = '',
    mobileSheet = false,
    inline = false,
    triggerLabel,
    onToast,
  } = props;

  const textColor = accentColor?.text ?? 'text-sp-accent';
  const bgColor = accentColor?.bg ?? 'bg-sp-accent/20';
  const bgSolidColor = accentColor?.bgSolid ?? 'bg-sp-accent';

  // 열림 상태 (inline 모드는 항상 열림)
  const [open, setOpen] = useState(inline);

  // 현재 보기 월/년
  const initialView = useMemo(() => {
    const seed =
      (mode === 'single' && singleValue) ||
      (mode === 'range' && (rangeStart || rangeEnd)) ||
      (mode === 'multi' && multiValues && multiValues.size > 0
        ? Array.from(multiValues).sort()[0]
        : undefined);
    return seed ? parseDateStr(seed) : new Date();
  }, [mode, singleValue, rangeStart, rangeEnd, multiValues]);

  const [viewYear, setViewYear] = useState(initialView.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialView.getMonth());

  // range 모드: 호버 시 점선 미리보기
  const [rangeHoverDate, setRangeHoverDate] = useState<string | null>(null);

  // refs
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<DropdownStyle>({ top: 0, left: 0 });

  const today = useMemo(() => new Date(), []);

  const lessonDaySet = useMemo(() => new Set(lessonDays ?? []), [lessonDays]);

  // value 변경 시 보기 월 동기화 (single)
  useEffect(() => {
    if (mode === 'single' && singleValue) {
      const d = parseDateStr(singleValue);
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }, [mode, singleValue]);

  /* ── Portal 위치 ── */
  const PANEL_WIDTH = mobileSheet ? 320 : 280;
  const PANEL_HEIGHT = mobileSheet ? 480 : 380;

  const updatePosition = useCallback(() => {
    if (portal && triggerRef.current) {
      setDropdownStyle(calcDropdownStyle(triggerRef.current, PANEL_WIDTH, PANEL_HEIGHT));
    }
  }, [portal, PANEL_WIDTH, PANEL_HEIGHT]);

  useEffect(() => {
    if (!open || !portal || inline) return;
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, portal, inline, updatePosition]);

  /* ── 외부 클릭 닫기 (inline 모드는 비활성) ── */
  useEffect(() => {
    if (!open || inline) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current && containerRef.current.contains(target)) return;
      if (portal && dropdownRef.current && dropdownRef.current.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, portal, inline]);

  /* ── 월 네비게이션 ── */
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

  /* ── 토스트 헬퍼 ── */
  const notify = useCallback(
    (msg: string, type: 'info' | 'error' | 'success' = 'info') => {
      if (onToast) onToast(msg, type);
    },
    [onToast],
  );

  /* ── 셀 클릭 핸들러 (모드별 분기) ── */
  const handleCellClick = useCallback(
    (d: Date) => {
      const iso = formatDateStr(d);

      if (mode === 'single') {
        onSingleChange?.(iso);
        if (!inline) setOpen(false);
        return;
      }

      if (mode === 'range') {
        const result = decideRangeClick(iso, rangeStart, rangeEnd, maxCount);
        if (result.kind === 'over-cap') {
          notify(`최대 ${maxCount}일까지 선택 가능합니다`, 'error');
          return;
        }
        onRangeChange?.(result.start, result.end);
        return;
      }

      // multi 모드
      const current = multiValues ?? new Set<string>();
      const result = decideMultiClick(iso, current, maxCount);
      if (result.kind === 'over-cap') {
        notify(`최대 ${maxCount}일까지 선택 가능합니다`, 'error');
        return;
      }
      const next = new Set(current);
      if (result.kind === 'add') next.add(result.iso);
      else next.delete(result.iso);
      onMultiChange?.(next);
    },
    [
      mode,
      onSingleChange,
      rangeStart,
      rangeEnd,
      onRangeChange,
      multiValues,
      onMultiChange,
      maxCount,
      inline,
      notify,
    ],
  );

  /* ── 프리셋 적용 (multi 모드 전용) ── */
  const applyPreset = useCallback(
    (dates: string[], label: string) => {
      if (mode !== 'multi') return;
      const valid = dates.slice(0, maxCount);
      if (valid.length < dates.length) {
        notify(`${label}은 최대 ${maxCount}일까지만 적용됩니다`, 'info');
      }
      onMultiChange?.(new Set(valid));
    },
    [mode, maxCount, onMultiChange, notify],
  );

  const handleClearMulti = useCallback(() => {
    if (mode !== 'multi') return;
    onMultiChange?.(new Set());
  }, [mode, onMultiChange]);

  /* ── 키보드 네비게이션 ── */
  const handleGridKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, d: Date) => {
      // 현재 포커스된 셀 day index 추출
      let nextDate: Date | null = null;
      switch (e.key) {
        case 'ArrowLeft':
          nextDate = new Date(d);
          nextDate.setDate(d.getDate() - 1);
          break;
        case 'ArrowRight':
          nextDate = new Date(d);
          nextDate.setDate(d.getDate() + 1);
          break;
        case 'ArrowUp':
          nextDate = new Date(d);
          nextDate.setDate(d.getDate() - 7);
          break;
        case 'ArrowDown':
          nextDate = new Date(d);
          nextDate.setDate(d.getDate() + 7);
          break;
        case 'Home':
          nextDate = new Date(d);
          nextDate.setDate(d.getDate() - d.getDay());
          break;
        case 'End':
          nextDate = new Date(d);
          nextDate.setDate(d.getDate() + (6 - d.getDay()));
          break;
        case 'PageUp':
          nextDate = new Date(d);
          nextDate.setMonth(d.getMonth() - 1);
          break;
        case 'PageDown':
          nextDate = new Date(d);
          nextDate.setMonth(d.getMonth() + 1);
          break;
        case ' ':
        case 'Enter':
          e.preventDefault();
          handleCellClick(d);
          return;
        case 'Escape':
          if (!inline) {
            setOpen(false);
            triggerRef.current?.focus();
          }
          e.preventDefault();
          return;
        default:
          return;
      }
      if (!nextDate) return;
      e.preventDefault();
      // 보기 월 갱신 후 다음 tick에 포커스 이동
      setViewYear(nextDate.getFullYear());
      setViewMonth(nextDate.getMonth());
      const targetIso = formatDateStr(nextDate);
      // 다음 렌더 후 셀에 포커스
      requestAnimationFrame(() => {
        const btn = gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${targetIso}"]`);
        btn?.focus();
      });
    },
    [handleCellClick, inline],
  );

  /* ── 트리거 라벨 ── */
  const triggerText = useMemo(() => {
    if (mode === 'single') {
      return singleValue || triggerLabel || '날짜 선택';
    }
    if (mode === 'range') {
      if (rangeStart && rangeEnd) {
        return rangeStart === rangeEnd ? rangeStart : `${rangeStart} ~ ${rangeEnd}`;
      }
      return rangeStart || triggerLabel || '범위 선택';
    }
    const count = multiValues?.size ?? 0;
    return count > 0 ? `${count}일 선택됨` : triggerLabel || '여러 날짜 선택';
  }, [mode, singleValue, rangeStart, rangeEnd, multiValues, triggerLabel]);

  /* ── 셀 상태 판정 ── */
  const cellState = useCallback(
    (d: Date) => {
      const iso = formatDateStr(d);
      const isCurrentMonth = d.getMonth() === viewMonth;
      const isToday = isSameDay(d, today);
      const isLessonDay = lessonDaySet.has(d.getDay());

      let isSelected = false;
      let isRangeStart = false;
      let isRangeEnd = false;
      let isRangeInner = false;
      let isHoverPreview = false;

      if (mode === 'single') {
        isSelected = singleValue === iso;
      } else if (mode === 'range') {
        // start=end 또는 start만 설정된 경우는 "단일 임시" 상태로 간주
        const hasCompletedRange = !!(rangeStart && rangeEnd && rangeStart < rangeEnd);
        if (hasCompletedRange) {
          isRangeStart = iso === rangeStart;
          isRangeEnd = iso === rangeEnd;
          isRangeInner = iso > rangeStart! && iso < rangeEnd!;
          isSelected = isRangeStart || isRangeEnd || isRangeInner;
        } else if (rangeStart) {
          // start만 설정 또는 start=end → 단일 임시
          isRangeStart = iso === rangeStart;
          isSelected = isRangeStart;
        }
        // 호버 미리보기 (단일 임시 상태에서 호버 중)
        if (
          !hasCompletedRange &&
          rangeStart &&
          rangeHoverDate &&
          iso > rangeStart &&
          iso <= rangeHoverDate
        ) {
          isHoverPreview = true;
        }
      } else {
        // multi
        isSelected = multiValues?.has(iso) ?? false;
      }

      // 30일 초과 disabled (multi)
      const isOverCap = mode === 'multi' && !isSelected && (multiValues?.size ?? 0) >= maxCount;

      return {
        iso,
        isCurrentMonth,
        isToday,
        isLessonDay,
        isSelected,
        isRangeStart,
        isRangeEnd,
        isRangeInner,
        isHoverPreview,
        isOverCap,
      };
    },
    [
      mode,
      viewMonth,
      today,
      lessonDaySet,
      singleValue,
      rangeStart,
      rangeEnd,
      rangeHoverDate,
      multiValues,
      maxCount,
    ],
  );

  /* ── 그리드 ── */
  const days = useMemo(() => getCalendarDays(viewYear, viewMonth), [viewYear, viewMonth]);

  const selectedCount =
    mode === 'multi'
      ? (multiValues?.size ?? 0)
      : mode === 'range' && rangeStart && rangeEnd && rangeStart <= rangeEnd
        ? enumerateRange(rangeStart, rangeEnd).length
        : mode === 'range' && rangeStart
          ? 1
          : 0;

  /* ── multi 모드 칩 리스트 ── */
  const sortedMultiValues = useMemo(() => {
    if (!multiValues) return [];
    return Array.from(multiValues).sort();
  }, [multiValues]);

  const removeMultiDate = useCallback(
    (iso: string) => {
      const next = new Set(multiValues ?? []);
      next.delete(iso);
      onMultiChange?.(next);
    },
    [multiValues, onMultiChange],
  );

  /* ── 패널 JSX ── */
  const panel = (
    <div
      ref={dropdownRef}
      role={mobileSheet ? 'dialog' : undefined}
      aria-modal={mobileSheet ? 'true' : undefined}
      aria-label={
        mode === 'multi' ? '여러 날짜 선택' : mode === 'range' ? '날짜 범위 선택' : '날짜 선택'
      }
      /* 떠 있을 때만 표시한다 — inline·모바일 시트는 면 위에 얹힌 면이라 예외가 아니다. */
      data-sp-floating={inline || mobileSheet ? undefined : true}
      className={
        inline && !mobileSheet
          ? 'bg-sp-card border border-sp-border rounded-xl shadow-xl p-3 select-none w-[280px]'
          : mobileSheet
            ? 'bg-sp-card border border-sp-border rounded-xl shadow-xl p-3 select-none w-full'
            : portal
              ? 'fixed z-[9999] bg-sp-card border border-sp-border rounded-xl shadow-xl p-3 w-[280px] select-none'
              : 'absolute top-full left-0 mt-1 z-50 bg-sp-card border border-sp-border rounded-xl shadow-xl p-3 w-[280px] select-none'
      }
      style={
        portal && !inline && !mobileSheet
          ? { top: dropdownStyle.top, left: dropdownStyle.left }
          : undefined
      }
    >
      {/* 헤더: 월 네비게이션 */}
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => navigateMonth(-1)}
          aria-label="이전 달"
          className="p-1 rounded-lg hover:bg-sp-text/10 transition-colors focus-visible:ring-2 focus-visible:ring-sp-accent focus-visible:ring-offset-1 focus-visible:ring-offset-sp-card focus-visible:outline-none"
        >
          <span className="material-symbols-outlined text-sp-muted text-lg">chevron_left</span>
        </button>
        <span className="text-sm font-medium text-sp-text" aria-live="polite">
          {viewYear}년 {viewMonth + 1}월
        </span>
        <button
          type="button"
          onClick={() => navigateMonth(1)}
          aria-label="다음 달"
          className="p-1 rounded-lg hover:bg-sp-text/10 transition-colors focus-visible:ring-2 focus-visible:ring-sp-accent focus-visible:ring-offset-1 focus-visible:ring-offset-sp-card focus-visible:outline-none"
        >
          <span className="material-symbols-outlined text-sp-muted text-lg">chevron_right</span>
        </button>
      </div>

      {/* 그리드 컨테이너 */}
      <div
        ref={gridRef}
        role="grid"
        aria-multiselectable={mode !== 'single'}
        aria-label="날짜 선택"
      >
        {/* 요일 헤더 */}
        <div role="row" className="grid grid-cols-7 mb-1">
          {DAY_LABELS.map((label, idx) => (
            <div
              key={label}
              role="columnheader"
              aria-label={`${label}요일`}
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

        {/* 날짜 그리드 — 6 rows × 7 cols */}
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <div role="row" key={row} className="grid grid-cols-7">
            {days.slice(row * 7, row * 7 + 7).map((d, colIdx) => {
              const state = cellState(d);
              const day = d.getDay();
              const isSunday = day === 0;
              const isSaturday = day === 6;

              // 셀 클래스
              let cellClass =
                'relative flex flex-col items-center justify-center h-8 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent focus-visible:ring-offset-1 focus-visible:ring-offset-sp-card';

              if (!state.isCurrentMonth) {
                cellClass += ' opacity-30 text-sp-muted rounded-lg';
              } else if (state.isOverCap) {
                cellClass += ' opacity-40 text-sp-muted cursor-not-allowed rounded-lg';
              } else if (state.isRangeInner) {
                cellClass += ` ${bgColor} ${textColor} rounded-none`;
              } else if (state.isHoverPreview) {
                cellClass += ` ${bgColor} ${textColor} rounded-none border-dashed`;
              } else if (state.isSelected) {
                cellClass += ` ${bgSolidColor} text-white font-bold`;
                if (mode === 'range') {
                  if (state.isRangeStart && state.isRangeEnd) {
                    cellClass += ' rounded-lg';
                  } else if (state.isRangeStart) {
                    cellClass += ' rounded-l-lg rounded-r-none';
                  } else if (state.isRangeEnd) {
                    cellClass += ' rounded-r-lg rounded-l-none';
                  } else {
                    cellClass += ' rounded-lg';
                  }
                } else {
                  cellClass += ' rounded-lg';
                }
              } else if (state.isToday) {
                cellClass += ` ${bgColor} ${textColor} font-medium rounded-lg`;
              } else {
                cellClass += ' hover:bg-sp-text/10 rounded-lg';
                if (isSunday) cellClass += ' text-red-400';
                else if (isSaturday) cellClass += ' text-blue-400';
                else cellClass += ' text-sp-text';
              }

              return (
                <button
                  key={`${row}-${colIdx}`}
                  type="button"
                  role="gridcell"
                  data-date={state.iso}
                  aria-label={`${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`}
                  aria-selected={state.isSelected}
                  aria-disabled={state.isOverCap || !state.isCurrentMonth}
                  tabIndex={state.isCurrentMonth && !state.isOverCap ? 0 : -1}
                  onClick={() => {
                    if (!state.isCurrentMonth) {
                      // 비현재월 셀은 월 이동만
                      setViewYear(d.getFullYear());
                      setViewMonth(d.getMonth());
                      return;
                    }
                    if (state.isOverCap) {
                      notify(`최대 ${maxCount}일까지 선택 가능합니다`, 'error');
                      return;
                    }
                    handleCellClick(d);
                  }}
                  onMouseEnter={() => {
                    if (mode === 'range' && rangeStart && !rangeEnd) {
                      setRangeHoverDate(state.iso);
                    }
                  }}
                  onMouseLeave={() => {
                    if (mode === 'range') setRangeHoverDate(null);
                  }}
                  onKeyDown={(e) => handleGridKeyDown(e, d)}
                  className={cellClass}
                >
                  {d.getDate()}
                  {state.isLessonDay && state.isCurrentMonth && !state.isSelected && (
                    <span className={`absolute bottom-0.5 w-1 h-1 rounded-full ${bgSolidColor}`} />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* 프리셋 (multi 모드만) */}
      {mode === 'multi' && (
        <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-sp-border">
          <button
            type="button"
            onClick={() => applyPreset(getThisWeekDates(today, false), '이번 주')}
            className="px-2 py-1 rounded-lg bg-sp-text/8 text-sp-muted hover:bg-sp-text/15 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-sp-accent focus-visible:outline-none"
            aria-label="이번 주 선택"
          >
            이번 주
          </button>
          <button
            type="button"
            onClick={() => applyPreset(getThisWeekDates(today, true), '이번 주 평일')}
            className="px-2 py-1 rounded-lg bg-sp-text/8 text-sp-muted hover:bg-sp-text/15 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-sp-accent focus-visible:outline-none"
            aria-label="이번 주 평일 선택"
          >
            이번 주 평일
          </button>
          <button
            type="button"
            onClick={() => applyPreset(getNextWeekDates(today, false), '다음 주')}
            className="px-2 py-1 rounded-lg bg-sp-text/8 text-sp-muted hover:bg-sp-text/15 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-sp-accent focus-visible:outline-none"
            aria-label="다음 주 선택"
          >
            다음 주
          </button>
          <button
            type="button"
            onClick={handleClearMulti}
            disabled={selectedCount === 0}
            className="px-2 py-1 rounded-lg bg-sp-text/8 text-sp-muted hover:bg-sp-text/15 text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-sp-accent focus-visible:outline-none"
            aria-label="선택 초기화"
          >
            초기화
          </button>
        </div>
      )}

      {/* 칩 리스트 (multi 모드, 선택 1개 이상) */}
      {mode === 'multi' && sortedMultiValues.length > 0 && (
        <div className="mt-2 pt-2 border-t border-sp-border">
          <div
            role="list"
            aria-label="선택된 날짜"
            className="flex gap-1 overflow-x-auto pb-1"
            style={{ scrollbarWidth: 'thin' }}
          >
            {sortedMultiValues.map((iso) => (
              <button
                key={iso}
                type="button"
                role="listitem"
                onClick={() => removeMultiDate(iso)}
                aria-label={`${iso} 선택 해제`}
                className={`shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-lg ${bgColor} ${textColor} text-xs font-medium hover:opacity-80 transition-opacity focus-visible:ring-2 focus-visible:ring-sp-accent focus-visible:outline-none`}
              >
                {formatDateChip(iso)}
                <span className="material-symbols-outlined text-xs">close</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 푸터 */}
      <div className="flex justify-between items-center mt-2 pt-2 border-t border-sp-border">
        <button
          type="button"
          onClick={() => {
            const todayIso = formatDateStr(today);
            setViewYear(today.getFullYear());
            setViewMonth(today.getMonth());
            if (mode === 'single') {
              onSingleChange?.(todayIso);
              if (!inline) setOpen(false);
            }
          }}
          className={`text-xs ${textColor} hover:opacity-80 transition-colors focus-visible:ring-2 focus-visible:ring-sp-accent focus-visible:outline-none rounded`}
        >
          오늘
        </button>
        {mode !== 'single' && (
          <span
            className={`text-xs ${
              selectedCount >= maxCount ? 'text-sp-highlight font-medium' : 'text-sp-muted'
            }`}
          >
            {selectedCount}일 선택됨
            {selectedCount >= maxCount && ` (최대 ${maxCount}일)`}
          </span>
        )}
        {lessonDays && lessonDays.length > 0 && mode === 'single' && (
          <span className="text-xs text-sp-muted flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${bgSolidColor} inline-block`} />
            수업일
          </span>
        )}
      </div>
    </div>
  );

  /* ── inline 모드: 트리거 없이 패널만 ── */
  if (inline) {
    return <div className={className}>{panel}</div>;
  }

  /* ── 트리거 + 드롭다운 ── */
  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`w-full flex items-center gap-2 bg-sp-card border border-sp-border rounded-lg
                    text-sp-text text-sm focus:outline-none focus:border-sp-accent transition-colors
                    hover:border-sp-accent/50 ${compact ? 'px-2 py-0.5 text-xs' : 'px-3 py-1.5'}`}
      >
        <span className="flex-1 text-left truncate">{triggerText}</span>
        <span className="material-symbols-outlined text-sp-muted text-base shrink-0">
          calendar_today
        </span>
      </button>

      {open && (portal ? createPortal(panel, document.body) : panel)}
    </div>
  );
}
