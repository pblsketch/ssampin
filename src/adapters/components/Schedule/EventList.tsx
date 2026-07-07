import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { SchoolEvent, CategoryItem } from '@domain/entities/SchoolEvent';
import { sortByDate } from '@domain/rules/eventRules';
import { calculateDDay } from '@domain/rules/ddayRules';
import { getCategoryInfo, getColorsForCategory } from '@adapters/presenters/categoryPresenter';
import { type HolidayInfo, getKoreanHolidays } from '@domain/rules/holidayRules';
import { GoogleBadge } from '@adapters/components/Calendar/GoogleBadge';
import { getGradeBadgeText } from '@domain/entities/NeisSchedule';
import { periodToLabel } from '@adapters/presenters/periodPresenter';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { ScrollRow } from '@adapters/components/common/ScrollRow';

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** 주 퀵점프 칩을 노출할 최소 항목 수 — 이보다 적으면 스크롤 부담이 없어 칩을 숨긴다 */
const WEEK_JUMP_MIN_ITEMS = 8;

/** 이벤트/공휴일을 날짜순으로 섞은 목록의 한 항목 */
type MergedItem = { type: 'event'; data: SchoolEvent } | { type: 'holiday'; data: HolidayInfo };

/** Date → "YYYY-MM-DD" (event.date와 같은 zero-padded 형식, 문자열 비교 가능) */
function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface EventListProps {
  events: readonly SchoolEvent[];
  categories: readonly CategoryItem[];
  holidays: readonly HolidayInfo[];
  allEvents?: readonly SchoolEvent[];
  allHolidays?: readonly HolidayInfo[];
  year?: number;
  /** 0-based 표시 월 — 이번 달 판별(지난 일정 접기)과 주 퀵점프에 사용. 미지정 시 두 기능 비활성 */
  month?: number;
  hideTitle?: boolean;
  onEdit: (event: SchoolEvent) => void;
  onDelete: (id: string) => void;
  isSelectMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onSkipDate?: (eventId: string, date: string) => void;
  currentDate?: string; // "YYYY-MM-DD" — the date context for this event list
  /** 각 이벤트 카드를 감싸는 래퍼 (드래그앤드롭 등) */
  renderWrapper?: (id: string, children: React.ReactNode) => React.ReactNode;
}

function formatEventDate(dateStr: string, showYear?: boolean): string {
  const parts = dateStr.split('-');
  const y = parseInt(parts[0] ?? '0', 10);
  const m = parseInt(parts[1] ?? '1', 10);
  const d = parseInt(parts[2] ?? '1', 10);
  const date = new Date(y, m - 1, d);
  const dayName = DAY_NAMES[date.getDay()];
  if (showYear) {
    return `${y}년 ${m}월 ${d}일 (${dayName})`;
  }
  return `${m}월 ${d}일 (${dayName})`;
}

interface EventCardProps {
  event: SchoolEvent;
  categories: readonly CategoryItem[];
  showYear?: boolean;
  onEdit: (event: SchoolEvent) => void;
  onDelete: (id: string) => void;
  isSelectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onSkipDate?: (eventId: string, date: string) => void;
  currentDate?: string;
}

function EventCard({
  event,
  categories,
  showYear,
  onEdit,
  onDelete,
  isSelectMode,
  isSelected,
  onToggleSelect,
  onSkipDate,
  currentDate,
}: EventCardProps) {
  const isExternal = event.id.startsWith('ext:');
  const isNeis = event.source === 'neis';
  const isNeisHoliday = isNeis && event.neis?.subtractDayType === '공휴일';
  const today = useMemo(() => new Date(), []);
  const dday = calculateDDay(event.date, today);
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const categoryInfo = getCategoryInfo(event.category, categories);
  const colors = getColorsForCategory(event.category, categories);
  const schoolLevel = useSettingsStore((s) => s.settings.schoolLevel);

  // 오늘 이벤트인지 확인
  const eventDate = new Date(
    parseInt(event.date.split('-')[0] ?? '0', 10),
    parseInt(event.date.split('-')[1] ?? '1', 10) - 1,
    parseInt(event.date.split('-')[2] ?? '1', 10),
  );
  const isToday = eventDate.getTime() === todayStart.getTime();

  // 멀티데이 이벤트 범위 표시
  const isMultiDay = event.endDate !== undefined;

  // NEIS 학년 배지 텍스트
  const gradeBadge =
    isNeis && event.neis?.gradeYn ? getGradeBadgeText(event.neis.gradeYn, schoolLevel) : '';

  return (
    <div
      className={`rounded-xl px-4 pt-4 pb-5 border-l-4 ${colors.border} transition-all duration-sp-base ease-sp-out shadow-sp-sm group relative shrink-0 ${
        isToday
          ? 'bg-[var(--sp-today-bg)] ring-2 ring-sp-accent/40 shadow-sp-md'
          : `bg-sp-card hover:border-sp-accent/30 hover:bg-sp-card/50 hover:shadow-sp-md`
      } ${isSelected ? 'ring-2 ring-sp-accent/60' : ''}`}
    >
      {/* TODAY 배지 */}
      {isToday && (
        <div className="absolute right-0 top-0 p-1 bg-sp-accent text-white text-tiny font-bold rounded-bl-lg">
          TODAY
        </div>
      )}

      <div className="flex items-start justify-between mb-2">
        {/* 선택 모드 체크박스 */}
        {isSelectMode && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect?.(event.id);
            }}
            className="mt-0.5 mr-2.5 flex-shrink-0"
          >
            <span
              className={`material-symbols-outlined text-lg ${
                isSelected ? 'text-sp-accent' : 'text-sp-muted/50'
              }`}
            >
              {isSelected ? 'check_circle' : 'radio_button_unchecked'}
            </span>
          </button>
        )}
        <div className="flex flex-col">
          <span className={`text-xs font-semibold ${colors.text} mb-0.5`}>
            {formatEventDate(event.date, showYear)}
          </span>
          <h4
            className={`text-base font-bold transition-colors ${
              isNeisHoliday ? 'text-red-400' : 'text-sp-text'
            } group-hover:${colors.text}`}
          >
            {event.title}
            {isNeisHoliday && (
              <span className="inline-block ml-1 text-red-400 text-sm align-middle">●</span>
            )}
          </h4>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {/* D-Day 배지 */}
          {event.isDDay && dday > 0 && (
            <span
              className={`text-caption px-2 py-0.5 rounded-md font-bold ${
                dday <= 7
                  ? 'bg-red-900/50 text-red-300 border border-red-700/50'
                  : 'bg-blue-900/50 text-blue-300 border border-blue-700/50'
              } ${dday <= 7 ? 'animate-pulse' : ''}`}
            >
              D-{dday}
            </span>
          )}
          {/* NEIS 출처 배지 */}
          {isNeis && (
            <span className="text-tiny text-purple-300 bg-purple-500/15 px-1.5 py-0.5 rounded font-medium border border-purple-500/20">
              NEIS
            </span>
          )}
          {/* NEIS 학년 배지 */}
          {isNeis && gradeBadge && (
            <span className="text-tiny text-sp-muted bg-sp-surface/40 px-1.5 py-0.5 rounded font-medium">
              {gradeBadge}
            </span>
          )}
          {/* 카테고리 배지 */}
          <span className="bg-sp-surface text-sp-muted text-caption px-2 py-1 rounded-md font-medium max-w-[80px] truncate">
            {categoryInfo.name}
          </span>
          {/* 구글 배지 */}
          {event.source === 'google' && <GoogleBadge />}
          {/* 편집/삭제 (호버 시) 또는 외부 배지 */}
          {isExternal ? (
            <span className="text-caption text-sp-muted bg-sp-surface px-1.5 py-0.5 rounded">
              외부
            </span>
          ) : (
            <div className="hidden group-hover:flex items-center gap-1">
              {event.recurrence && onSkipDate && currentDate && (
                <button
                  type="button"
                  onClick={() => onSkipDate(event.id, currentDate)}
                  className="p-1 hover:bg-amber-900/50 rounded transition-colors text-sp-muted hover:text-amber-400"
                  title="이 날짜만 건너뛰기"
                >
                  <span className="material-symbols-outlined text-icon">event_busy</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => onEdit(event)}
                className="p-1 hover:bg-sp-surface rounded transition-colors text-sp-muted hover:text-sp-text"
              >
                <span className="material-symbols-outlined text-icon">edit</span>
              </button>
              <button
                type="button"
                onClick={() => onDelete(event.id)}
                className="p-1 hover:bg-red-900/50 rounded transition-colors text-sp-muted hover:text-red-400"
              >
                <span className="material-symbols-outlined text-icon">delete</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 교시 / 시간 / 장소 / 멀티데이 */}
      <div className="flex items-center gap-4 text-xs text-sp-muted">
        {event.period && (
          <div className="flex items-center gap-1">
            <span className="material-symbols-outlined text-icon-sm">class</span>
            {periodToLabel(event.period, event.periodEnd)}
          </div>
        )}
        {event.time && (
          <div className="flex items-center gap-1">
            <span className="material-symbols-outlined text-icon-sm">schedule</span>
            {event.time}
          </div>
        )}
        {event.location && (
          <div className="flex items-center gap-1">
            <span className="material-symbols-outlined text-icon-sm">location_on</span>
            {event.location}
          </div>
        )}
        {isMultiDay && (
          <div className="flex items-center gap-1">
            <span className="material-symbols-outlined text-icon-sm">date_range</span>
            {event.date.split('-').slice(1).map(Number).join('/')} ~{' '}
            {event.endDate!.split('-').slice(1).map(Number).join('/')}
          </div>
        )}
        {event.recurrence && (
          <div className="flex items-center gap-1">
            <span className="material-symbols-outlined text-icon-sm">repeat</span>
            {event.recurrence === 'weekly'
              ? '매주'
              : event.recurrence === 'monthly'
                ? '매월'
                : '매년'}
          </div>
        )}
      </div>
    </div>
  );
}

function HolidayCard({ holiday, showYear }: { holiday: HolidayInfo; showYear?: boolean }) {
  const parts = holiday.date.split('-');
  const m = parseInt(parts[1] ?? '1', 10);
  const d = parseInt(parts[2] ?? '1', 10);
  const y = parseInt(parts[0] ?? '0', 10);
  const date = new Date(y, m - 1, d);
  const dayName = DAY_NAMES[date.getDay()];

  return (
    <div className="rounded-xl px-4 pt-3 pb-3 border-l-4 border-red-500/60 bg-red-950/20 shadow-sp-sm shrink-0 transition-all duration-sp-base ease-sp-out hover:shadow-sp-md hover:border-red-400/50">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-red-400/80 mb-0.5">
            {showYear ? `${y}년 ` : ''}
            {m}월 {d}일 ({dayName})
          </span>
          <h4 className="text-sm font-bold text-red-300">{holiday.name}</h4>
        </div>
        <span className="bg-red-900/40 text-red-300 text-caption px-2 py-1 rounded-md font-medium border border-red-800/30">
          공휴일
        </span>
      </div>
    </div>
  );
}

export function EventList({
  events,
  categories,
  holidays,
  allEvents,
  allHolidays,
  year,
  month,
  hideTitle,
  onEdit,
  onDelete,
  isSelectMode,
  selectedIds,
  onToggleSelect,
  onSkipDate,
  currentDate,
  renderWrapper,
}: EventListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchYear, setSearchYear] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isSearching = searchQuery.trim().length > 0;

  const currentYear = year ?? new Date().getFullYear();
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

  // 숨긴 NEIS 일정 필터링
  const visibleEvents = useMemo(() => events.filter((e) => !e.isHidden), [events]);
  const sortedEvents = useMemo(() => sortByDate(visibleEvents), [visibleEvents]);

  // 이벤트와 공휴일을 날짜순으로 통합 (NEIS 공휴일과 하드코딩 공휴일 중복 제거)
  const mergedItems = useMemo(() => {
    const items: MergedItem[] = [];

    for (const e of sortedEvents) {
      items.push({ type: 'event', data: e });
    }

    const neisHolidayDates = new Set(
      sortedEvents
        .filter((e) => e.source === 'neis' && e.neis?.subtractDayType === '공휴일')
        .map((e) => e.date),
    );
    for (const h of holidays) {
      if (!neisHolidayDates.has(h.date)) {
        items.push({ type: 'holiday', data: h });
      }
    }

    items.sort((a, b) => {
      const dateA = a.type === 'event' ? a.data.date : a.data.date;
      const dateB = b.type === 'event' ? b.data.date : b.data.date;
      const dateCompare = dateA.localeCompare(dateB);
      if (dateCompare !== 0) return dateCompare;
      // 같은 날짜: 이벤트의 sortOrder 비교 (공휴일은 이벤트 뒤에)
      const orderA = a.type === 'event' ? (a.data.sortOrder ?? 0) : 9999;
      const orderB = b.type === 'event' ? (b.data.sortOrder ?? 0) : 9999;
      return orderA - orderB;
    });

    return items;
  }, [sortedEvents, holidays]);

  // 검색 결과 (전체 이벤트 + 공휴일에서 검색, 연도 필터 적용)
  const searchResults = useMemo(() => {
    if (!isSearching) return null;
    const query = searchQuery.trim().toLowerCase();
    const filterYear = searchYear !== null ? String(searchYear) : null;

    const sourceEvents = allEvents ?? events;
    // 연도 필터가 있으면 해당 연도의 공휴일 생성, 없으면 전달받은 공휴일 사용
    const sourceHolidays = filterYear
      ? getKoreanHolidays(parseInt(filterYear, 10))
      : (allHolidays ?? holidays);

    const items: MergedItem[] = [];

    const matchedEvents = sourceEvents.filter(
      (e) =>
        !e.isHidden &&
        e.title.toLowerCase().includes(query) &&
        (!filterYear || e.date.startsWith(filterYear)),
    );
    const sortedMatched = sortByDate(matchedEvents);
    for (const e of sortedMatched) {
      items.push({ type: 'event', data: e });
    }

    const neisHolidayDates = new Set(
      sortedMatched
        .filter((e) => e.source === 'neis' && e.neis?.subtractDayType === '공휴일')
        .map((e) => e.date),
    );
    for (const h of sourceHolidays) {
      if (h.name.toLowerCase().includes(query) && !neisHolidayDates.has(h.date)) {
        items.push({ type: 'holiday', data: h });
      }
    }

    items.sort((a, b) => {
      const dateA = a.type === 'event' ? a.data.date : a.data.date;
      const dateB = b.type === 'event' ? b.data.date : b.data.date;
      const dateCompare = dateA.localeCompare(dateB);
      if (dateCompare !== 0) return dateCompare;
      const orderA = a.type === 'event' ? (a.data.sortOrder ?? 0) : 9999;
      const orderB = b.type === 'event' ? (b.data.sortOrder ?? 0) : 9999;
      return orderA - orderB;
    });

    return items;
  }, [isSearching, searchQuery, searchYear, allEvents, events, allHolidays, holidays]);

  const displayItems = searchResults ?? mergedItems;

  // ── 이번 달 한정 UX: 지난 일정 접기 + 주 퀵점프 ──
  // (검색 중이거나 hideTitle(모달·드래그정렬) 사용처에서는 비활성)
  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => toDateKey(today), [today]);
  const displayYear = year ?? today.getFullYear();
  const hasMonthContext = !hideTitle && month !== undefined && !isSearching;
  const isCurrentMonth =
    hasMonthContext && displayYear === today.getFullYear() && month === today.getMonth();

  // 오늘 기준 지난/다가오는 일정 분리 (이번 달일 때만; 그 외엔 전부 upcoming)
  const { pastItems, upcomingItems } = useMemo(() => {
    if (!isCurrentMonth) {
      return { pastItems: [] as MergedItem[], upcomingItems: displayItems };
    }
    const past: MergedItem[] = [];
    const upcoming: MergedItem[] = [];
    for (const it of displayItems) {
      if (it.data.date < todayKey) past.push(it);
      else upcoming.push(it);
    }
    return { pastItems: past, upcomingItems: upcoming };
  }, [isCurrentMonth, displayItems, todayKey]);

  // 지난 일정 펼침 상태 — 월 이동/검색 전환 시 접힌 상태로 초기화
  const [showPast, setShowPast] = useState(false);
  useEffect(() => {
    setShowPast(false);
  }, [displayYear, month, isSearching]);

  // 주 퀵점프 칩 (캘린더와 동일하게 일요일 시작 주) — 지난 주도 포함해 노출
  const weekChips = useMemo(() => {
    if (!hasMonthContext || month === undefined) return [];
    if (displayItems.length < WEEK_JUMP_MIN_ITEMS) return [];

    const firstOfMonth = new Date(displayYear, month, 1);
    const lastKey = toDateKey(new Date(displayYear, month + 1, 0));
    const cursor = new Date(firstOfMonth);
    cursor.setDate(firstOfMonth.getDate() - firstOfMonth.getDay()); // 그 주 일요일로 이동

    const chips: Array<{
      key: string;
      label: string;
      jumpKey: string;
      isCurrent: boolean;
      isPast: boolean;
      rangeLabel: string;
    }> = [];
    let idx = 0;
    while (toDateKey(cursor) <= lastKey) {
      idx += 1;
      const weekStartKey = toDateKey(cursor);
      const weekEnd = new Date(cursor);
      weekEnd.setDate(cursor.getDate() + 6);
      const weekEndKey = toDateKey(weekEnd);
      const isCurrentWeek = isCurrentMonth && weekStartKey <= todayKey && todayKey <= weekEndKey;
      const isPastWeek = isCurrentMonth && weekEndKey < todayKey;
      chips.push({
        key: `${idx}-${weekStartKey}`,
        label: isCurrentWeek ? '이번 주' : `${idx}주`,
        // 이번 주는 오늘 이후 첫 일정으로 점프(그 주 앞부분은 지난 일정으로 접혀 있음)
        jumpKey: isCurrentWeek ? todayKey : weekStartKey,
        isCurrent: isCurrentWeek,
        isPast: isPastWeek,
        rangeLabel: `${Number(weekStartKey.slice(5, 7))}/${Number(weekStartKey.slice(8, 10))} ~ ${Number(weekEndKey.slice(5, 7))}/${Number(weekEndKey.slice(8, 10))}`,
      });
      cursor.setDate(cursor.getDate() + 7);
    }
    return chips.length >= 2 ? chips : [];
  }, [hasMonthContext, month, displayYear, isCurrentMonth, displayItems, todayKey]);

  // 주 칩 클릭 → 목록에서 해당 주 시작(이후) 첫 카드로 부드럽게 스크롤
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingJumpRef = useRef<string | null>(null);

  const performScroll = useCallback((jumpKey: string) => {
    const container = scrollRef.current;
    if (!container) return;
    const anchors = Array.from(container.querySelectorAll<HTMLElement>('[data-datekey]'));
    const target = anchors.find((el) => (el.dataset.datekey ?? '') >= jumpKey);
    if (!target) return;
    const cRect = container.getBoundingClientRect();
    const tRect = target.getBoundingClientRect();
    container.scrollTo({ top: container.scrollTop + (tRect.top - cRect.top), behavior: 'smooth' });
  }, []);

  const jumpToWeek = useCallback(
    (jumpKey: string) => {
      // 접혀 있는 지난 주로 점프하면 먼저 펼친 뒤(다음 렌더에서) 스크롤
      if (isCurrentMonth && jumpKey < todayKey && !showPast) {
        pendingJumpRef.current = jumpKey;
        setShowPast(true);
        return;
      }
      performScroll(jumpKey);
    },
    [isCurrentMonth, todayKey, showPast, performScroll],
  );

  // 지난 일정 펼침이 DOM에 반영된 뒤 대기 중인 점프 실행
  useEffect(() => {
    if (showPast && pendingJumpRef.current) {
      const key = pendingJumpRef.current;
      pendingJumpRef.current = null;
      requestAnimationFrame(() => performScroll(key));
    }
  }, [showPast, performScroll]);

  const useEnhancedBody =
    hasMonthContext && displayItems.length > 0 && (isCurrentMonth || weekChips.length > 0);

  const anchorKey = (item: MergedItem) =>
    item.type === 'event' ? item.data.id : `holiday-${item.data.date}`;

  const renderItem = (item: MergedItem) => {
    if (item.type === 'event') {
      const card = (
        <EventCard
          key={item.data.id}
          event={item.data}
          categories={categories}
          showYear={isSearching}
          onEdit={onEdit}
          onDelete={onDelete}
          isSelectMode={isSelectMode}
          isSelected={selectedIds?.has(item.data.id)}
          onToggleSelect={onToggleSelect}
          onSkipDate={onSkipDate}
          currentDate={currentDate}
        />
      );
      return renderWrapper ? renderWrapper(item.data.id, card) : card;
    }
    return (
      <HolidayCard key={`holiday-${item.data.date}`} holiday={item.data} showYear={isSearching} />
    );
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {!hideTitle && (
        <div className="shrink-0 flex flex-col gap-2 mb-3 px-2">
          <h3 className="text-xs font-sp-semibold text-sp-muted uppercase tracking-wider">
            {isSearching ? `검색 결과 (${displayItems.length}건)` : '이번 달 일정'}
          </h3>
          {/* 검색 입력 */}
          <div className="relative">
            <span className="material-symbols-outlined text-icon-md text-sp-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
              search
            </span>
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="일정 검색 (예: 재량 휴업일)"
              className="w-full bg-sp-surface border border-sp-border rounded-xl pl-9 pr-8 py-2 text-sm text-sp-text placeholder:text-sp-muted/60 focus:outline-none focus:ring-1 focus:ring-sp-accent/50 focus:border-sp-accent/50 transition-colors"
            />
            {isSearching && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  inputRef.current?.focus();
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-sp-border/50 text-sp-muted hover:text-sp-text transition-colors"
              >
                <span className="material-symbols-outlined text-icon">close</span>
              </button>
            )}
          </div>
          {/* 연도 필터 (검색 시 표시) */}
          {isSearching && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSearchYear(null)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  searchYear === null
                    ? 'bg-sp-accent text-white'
                    : 'bg-sp-surface text-sp-muted hover:text-sp-text border border-sp-border'
                }`}
              >
                전체
              </button>
              {yearOptions.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setSearchYear(y)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    searchYear === y
                      ? 'bg-sp-accent text-white'
                      : 'bg-sp-surface text-sp-muted hover:text-sp-text border border-sp-border'
                  }`}
                >
                  {y}년
                </button>
              ))}
            </div>
          )}
          {/* 주 퀵점프 칩 (검색 아닐 때, 항목이 많을 때만) */}
          {!isSearching && weekChips.length > 0 && (
            <ScrollRow className="gap-1.5" aria-label="주 이동">
              {weekChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => jumpToWeek(chip.jumpKey)}
                  title={`${chip.rangeLabel}${chip.isPast ? ' 지난 일정' : ''} 보기`}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    chip.isCurrent
                      ? 'bg-sp-accent text-white'
                      : `bg-sp-surface text-sp-muted hover:text-sp-text border border-sp-border ${chip.isPast ? 'opacity-70 hover:opacity-100' : ''}`
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </ScrollRow>
          )}
        </div>
      )}

      <div
        ref={scrollRef}
        className={`flex flex-col gap-4 overflow-y-auto pr-2 pb-10 ${hideTitle ? 'h-full' : 'flex-1 min-h-0'}`}
      >
        {displayItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-sp-muted">
            <span className="material-symbols-outlined text-5xl mb-4">
              {isSearching ? 'search_off' : 'event_busy'}
            </span>
            <p className="text-sm">
              {isSearching
                ? `'${searchQuery}'에 대한 검색 결과가 없습니다`
                : '등록된 일정이 없습니다'}
            </p>
          </div>
        ) : useEnhancedBody ? (
          <>
            {/* 지난 일정 접기 (이번 달 한정) */}
            {isCurrentMonth && pastItems.length > 0 && (
              <button
                type="button"
                onClick={() => setShowPast((v) => !v)}
                className="shrink-0 flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl bg-sp-surface border border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-card transition-colors"
              >
                <span className="flex items-center gap-1.5 text-xs font-semibold">
                  <span className="material-symbols-outlined text-icon">history</span>
                  지난 일정 {pastItems.length}건
                </span>
                <span className="material-symbols-outlined text-icon-md">
                  {showPast ? 'expand_less' : 'expand_more'}
                </span>
              </button>
            )}
            {isCurrentMonth &&
              showPast &&
              pastItems.map((item) => (
                <div key={anchorKey(item)} data-datekey={item.data.date} className="shrink-0">
                  {renderItem(item)}
                </div>
              ))}
            {upcomingItems.map((item) => (
              <div key={anchorKey(item)} data-datekey={item.data.date} className="shrink-0">
                {renderItem(item)}
              </div>
            ))}
            {isCurrentMonth && upcomingItems.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-sp-muted">
                <span className="material-symbols-outlined text-4xl mb-3">event_available</span>
                <p className="text-sm">이번 주 이후 남은 일정이 없어요</p>
              </div>
            )}
          </>
        ) : (
          displayItems.map(renderItem)
        )}
      </div>
    </div>
  );
}
