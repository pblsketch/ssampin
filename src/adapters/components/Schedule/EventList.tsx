import { useState, useMemo, useRef } from 'react';
import type { SchoolEvent, CategoryItem } from '@domain/entities/SchoolEvent';
import { sortByDate } from '@domain/rules/eventRules';
import { calculateDDay } from '@domain/rules/ddayRules';
import { getCategoryInfo, getColorsForCategory } from '@adapters/presenters/categoryPresenter';
import { type HolidayInfo, getKoreanHolidays } from '@domain/rules/holidayRules';
import { GoogleBadge } from '@adapters/components/Calendar/GoogleBadge';
import { getGradeBadgeText } from '@domain/entities/NeisSchedule';
import { periodToLabel } from '@adapters/presenters/periodPresenter';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'] as const;

interface EventListProps {
  events: readonly SchoolEvent[];
  categories: readonly CategoryItem[];
  holidays: readonly HolidayInfo[];
  allEvents?: readonly SchoolEvent[];
  allHolidays?: readonly HolidayInfo[];
  year?: number;
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

function EventCard({ event, categories, showYear, onEdit, onDelete, isSelectMode, isSelected, onToggleSelect, onSkipDate, currentDate }: EventCardProps) {
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
  const gradeBadge = isNeis && event.neis?.gradeYn
    ? getGradeBadgeText(event.neis.gradeYn, schoolLevel)
    : '';

  return (
    <div
      className={`rounded-sp-lg px-4 pt-4 pb-5 border-l-4 ${colors.border} transition-all duration-sp-base ease-sp-out shadow-sp-sm group relative shrink-0 ${isToday
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
            onClick={(e) => { e.stopPropagation(); onToggleSelect?.(event.id); }}
            className="mt-0.5 mr-2.5 flex-shrink-0"
          >
            <span className={`material-symbols-outlined text-lg ${
              isSelected ? 'text-sp-accent' : 'text-sp-muted/50'
            }`}>
              {isSelected ? 'check_circle' : 'radio_button_unchecked'}
            </span>
          </button>
        )}
        <div className="flex flex-col">
          <span className={`text-xs font-semibold ${colors.text} mb-0.5`}>
            {formatEventDate(event.date, showYear)}
          </span>
          <h4 className={`text-base font-bold transition-colors ${
            isNeisHoliday ? 'text-red-400' : 'text-sp-text'
          } group-hover:${colors.text}`}>
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
              className={`text-caption px-2 py-0.5 rounded-md font-bold ${dday <= 7
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
            {event.date.split('-').slice(1).map(Number).join('/')} ~ {event.endDate!.split('-').slice(1).map(Number).join('/')}
          </div>
        )}
        {event.recurrence && (
          <div className="flex items-center gap-1">
            <span className="material-symbols-outlined text-icon-sm">repeat</span>
            {event.recurrence === 'weekly' ? '매주' : event.recurrence === 'monthly' ? '매월' : '매년'}
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
    <div className="rounded-sp-lg px-4 pt-3 pb-3 border-l-4 border-red-500/60 bg-red-950/20 shadow-sp-sm shrink-0 transition-all duration-sp-base ease-sp-out hover:shadow-sp-md hover:border-red-400/50">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-red-400/80 mb-0.5">
            {showYear ? `${y}년 ` : ''}{m}월 {d}일 ({dayName})
          </span>
          <h4 className="text-sm font-bold text-red-300">
            {holiday.name}
          </h4>
        </div>
        <span className="bg-red-900/40 text-red-300 text-caption px-2 py-1 rounded-md font-medium border border-red-800/30">
          공휴일
        </span>
      </div>
    </div>
  );
}

export function EventList({ events, categories, holidays, allEvents, allHolidays, year, hideTitle, onEdit, onDelete, isSelectMode, selectedIds, onToggleSelect, onSkipDate, currentDate, renderWrapper }: EventListProps) {
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
    const items: Array<{ type: 'event'; data: SchoolEvent } | { type: 'holiday'; data: HolidayInfo }> = [];

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

    const items: Array<{ type: 'event'; data: SchoolEvent } | { type: 'holiday'; data: HolidayInfo }> = [];

    const matchedEvents = sourceEvents.filter(
      (e) => !e.isHidden
        && e.title.toLowerCase().includes(query)
        && (!filterYear || e.date.startsWith(filterYear)),
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

  return (
    <div className="flex flex-col gap-4 overflow-y-auto pr-2 pb-10 h-full">
      {!hideTitle && (
        <div className="flex flex-col gap-2 mb-2 px-2">
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
        </div>
      )}

      {displayItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-sp-muted">
          <span className="material-symbols-outlined text-5xl mb-4">
            {isSearching ? 'search_off' : 'event_busy'}
          </span>
          <p className="text-sm">
            {isSearching ? `'${searchQuery}'에 대한 검색 결과가 없습니다` : '등록된 일정이 없습니다'}
          </p>
        </div>
      ) : (
        displayItems.map((item) => {
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
        })
      )}
    </div>
  );
}
