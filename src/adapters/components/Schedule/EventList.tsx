import { useMemo } from 'react';
import type { SchoolEvent, CategoryItem } from '@domain/entities/SchoolEvent';
import { sortByDate } from '@domain/rules/eventRules';
import { calculateDDay } from '@domain/rules/ddayRules';
import { getCategoryInfo, getColorsForCategory } from '@adapters/presenters/categoryPresenter';
import type { HolidayInfo } from '@domain/rules/holidayRules';
import { GoogleBadge } from '@adapters/components/Calendar/GoogleBadge';
import { getGradeBadgeText } from '@domain/entities/NeisSchedule';
import { periodToLabel } from '@adapters/presenters/periodPresenter';

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'] as const;

interface EventListProps {
  events: readonly SchoolEvent[];
  categories: readonly CategoryItem[];
  holidays: readonly HolidayInfo[];
  hideTitle?: boolean;
  onEdit: (event: SchoolEvent) => void;
  onDelete: (id: string) => void;
}

function formatEventDate(dateStr: string): string {
  const parts = dateStr.split('-');
  const y = parseInt(parts[0] ?? '0', 10);
  const m = parseInt(parts[1] ?? '1', 10);
  const d = parseInt(parts[2] ?? '1', 10);
  const date = new Date(y, m - 1, d);
  const dayName = DAY_NAMES[date.getDay()];
  return `${m}월 ${d}일 (${dayName})`;
}

interface EventCardProps {
  event: SchoolEvent;
  categories: readonly CategoryItem[];
  onEdit: (event: SchoolEvent) => void;
  onDelete: (id: string) => void;
}

function EventCard({ event, categories, onEdit, onDelete }: EventCardProps) {
  const isExternal = event.id.startsWith('ext:');
  const isNeis = event.source === 'neis';
  const isNeisHoliday = isNeis && event.neis?.subtractDayType === '공휴일';
  const today = useMemo(() => new Date(), []);
  const dday = calculateDDay(event.date, today);
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const categoryInfo = getCategoryInfo(event.category, categories);
  const colors = getColorsForCategory(event.category, categories);

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
    ? getGradeBadgeText(event.neis.gradeYn)
    : '';

  return (
    <div
      className={`rounded-2xl px-4 pt-4 pb-5 border-l-4 ${colors.border} transition-colors shadow-lg group relative shrink-0 ${isToday
        ? 'bg-[var(--sp-today-bg)] ring-2 ring-sp-accent/40 shadow-xl'
        : 'bg-sp-card hover:bg-sp-surface'
        }`}
    >
      {/* TODAY 배지 */}
      {isToday && (
        <div className="absolute right-0 top-0 p-1 bg-sp-accent text-white text-[9px] font-bold rounded-bl-lg">
          TODAY
        </div>
      )}

      <div className="flex items-start justify-between mb-2">
        <div className="flex flex-col">
          <span className={`text-xs font-semibold ${colors.text} mb-0.5`}>
            {formatEventDate(event.date)}
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
              className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${dday <= 7
                ? 'bg-red-900/50 text-red-300 border border-red-700/50'
                : 'bg-blue-900/50 text-blue-300 border border-blue-700/50'
                } ${dday <= 7 ? 'animate-pulse' : ''}`}
            >
              D-{dday}
            </span>
          )}
          {/* NEIS 출처 배지 */}
          {isNeis && (
            <span className="text-[9px] text-purple-300 bg-purple-500/15 px-1.5 py-0.5 rounded font-medium border border-purple-500/20">
              NEIS
            </span>
          )}
          {/* NEIS 학년 배지 */}
          {isNeis && gradeBadge && (
            <span className="text-[9px] text-slate-300 bg-slate-600/40 px-1.5 py-0.5 rounded font-medium">
              {gradeBadge}
            </span>
          )}
          {/* 카테고리 배지 */}
          <span className="bg-slate-700 text-slate-300 text-[10px] px-2 py-1 rounded-md font-medium max-w-[80px] truncate">
            {categoryInfo.name}
          </span>
          {/* 편집/삭제 (호버 시) 또는 외부/구글 배지 */}
          {event.source === 'google' ? (
            <GoogleBadge />
          ) : isExternal ? (
            <span className="text-[10px] text-sp-muted bg-sp-surface px-1.5 py-0.5 rounded">
              외부
            </span>
          ) : (
            <div className="hidden group-hover:flex items-center gap-1">
              <button
                type="button"
                onClick={() => onEdit(event)}
                className="p-1 hover:bg-slate-600 rounded transition-colors text-slate-400 hover:text-white"
              >
                <span className="material-symbols-outlined text-[16px]">edit</span>
              </button>
              <button
                type="button"
                onClick={() => onDelete(event.id)}
                className="p-1 hover:bg-red-900/50 rounded transition-colors text-slate-400 hover:text-red-400"
              >
                <span className="material-symbols-outlined text-[16px]">delete</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 교시 / 시간 / 장소 / 멀티데이 */}
      <div className="flex items-center gap-4 text-xs text-sp-muted">
        {event.period && (
          <div className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">class</span>
            {periodToLabel(event.period)}
          </div>
        )}
        {event.time && (
          <div className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">schedule</span>
            {event.time}
          </div>
        )}
        {event.location && (
          <div className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">location_on</span>
            {event.location}
          </div>
        )}
        {isMultiDay && (
          <div className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">date_range</span>
            {event.date.split('-').slice(1).map(Number).join('/')} ~ {event.endDate!.split('-').slice(1).map(Number).join('/')}
          </div>
        )}
      </div>
    </div>
  );
}

function HolidayCard({ holiday }: { holiday: HolidayInfo }) {
  const parts = holiday.date.split('-');
  const m = parseInt(parts[1] ?? '1', 10);
  const d = parseInt(parts[2] ?? '1', 10);
  const y = parseInt(parts[0] ?? '0', 10);
  const date = new Date(y, m - 1, d);
  const dayName = DAY_NAMES[date.getDay()];

  return (
    <div className="rounded-2xl px-4 pt-3 pb-3 border-l-4 border-red-500/60 bg-red-950/20 shadow-sm shrink-0">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-red-400/80 mb-0.5">
            {m}월 {d}일 ({dayName})
          </span>
          <h4 className="text-sm font-bold text-red-300">
            {holiday.name}
          </h4>
        </div>
        <span className="bg-red-900/40 text-red-300 text-[10px] px-2 py-1 rounded-md font-medium border border-red-800/30">
          공휴일
        </span>
      </div>
    </div>
  );
}

export function EventList({ events, categories, holidays, hideTitle, onEdit, onDelete }: EventListProps) {
  // 숨긴 NEIS 일정 필터링
  const visibleEvents = useMemo(() => events.filter((e) => !e.isHidden), [events]);
  const sortedEvents = useMemo(() => sortByDate(visibleEvents), [visibleEvents]);

  // 이벤트와 공휴일을 날짜순으로 통합
  const mergedItems = useMemo(() => {
    const items: Array<{ type: 'event'; data: SchoolEvent } | { type: 'holiday'; data: HolidayInfo }> = [];

    for (const e of sortedEvents) {
      items.push({ type: 'event', data: e });
    }
    for (const h of holidays) {
      items.push({ type: 'holiday', data: h });
    }

    items.sort((a, b) => {
      const dateA = a.type === 'event' ? a.data.date : a.data.date;
      const dateB = b.type === 'event' ? b.data.date : b.data.date;
      return dateA.localeCompare(dateB);
    });

    return items;
  }, [sortedEvents, holidays]);

  return (
    <div className="flex flex-col gap-4 overflow-y-auto pr-2 pb-10 h-full">
      {!hideTitle && (
        <div className="flex items-center justify-between mb-2 px-2">
          <h3 className="text-lg font-bold text-sp-text">다가오는 일정</h3>
        </div>
      )}

      {mergedItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-sp-muted">
          <span className="material-symbols-outlined text-[48px] mb-4">event_busy</span>
          <p className="text-sm">등록된 일정이 없습니다</p>
        </div>
      ) : (
        mergedItems.map((item) =>
          item.type === 'event' ? (
            <EventCard
              key={item.data.id}
              event={item.data}
              categories={categories}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ) : (
            <HolidayCard key={`holiday-${item.data.date}`} holiday={item.data} />
          ),
        )
      )}
    </div>
  );
}
