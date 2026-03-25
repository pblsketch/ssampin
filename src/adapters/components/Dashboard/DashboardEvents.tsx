import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useWidgetRefresh } from '@widgets/hooks/useWidgetRefresh';
import { calculateDDay } from '@domain/rules/ddayRules';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';
import { getCategoryInfo, getColorsForCategory } from '@adapters/presenters/categoryPresenter';
import { GoogleBadge } from '@adapters/components/Calendar/GoogleBadge';
import { isUrlLike } from '@domain/rules/eventRules';

const MAX_VISIBLE = 6;
const RANGE_PRESETS = [7, 14, 30, 60, 90, 365] as const;

/** "YYYY-MM-DD" → Date (로컬 자정 기준) */
function parseDate(dateStr: string): Date {
  const parts = dateStr.split('-');
  const y = parseInt(parts[0] ?? '0', 10);
  const m = parseInt(parts[1] ?? '1', 10);
  const d = parseInt(parts[2] ?? '1', 10);
  return new Date(y, m - 1, d);
}

/** Date → "MM/DD" */
function formatMMDD(date: Date): string {
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const dy = String(date.getDate()).padStart(2, '0');
  return `${mo}/${dy}`;
}

/** 오늘 자정 기준 Date */
function todayStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

interface EventItemProps {
  event: SchoolEvent;
  today: Date;
  categories: readonly import('@domain/entities/SchoolEvent').CategoryItem[];
}

function EventItem({ event, today, categories }: EventItemProps) {
  const dday = calculateDDay(event.date, today);

  // D-Day 이벤트: dday <= 0이고 endDate가 아직 지나지 않은 경우
  const endDate = event.endDate ? parseDate(event.endDate) : null;
  const todayMs = today.getTime();
  const isOngoing = dday <= 0 && (endDate === null ? dday === 0 : endDate.getTime() >= todayMs);

  const colors = getColorsForCategory(event.category, categories);
  const categoryInfo = getCategoryInfo(event.category, categories);
  const dateStr = formatMMDD(parseDate(event.date));

  let ddayBadge: string | null = null;
  if (isOngoing) {
    ddayBadge = dday === 0 ? 'D-0' : `D${dday}`;
  } else if (dday > 0) {
    ddayBadge = `D-${dday}`;
  }

  return (
    <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-sp-surface/50 transition-colors">
      {/* 카테고리 도트 */}
      <span className={`h-2 w-2 shrink-0 rounded-full ${colors.dot}`} />

      {/* 날짜 */}
      <span className="w-10 shrink-0 text-xs text-sp-muted">{dateStr}</span>

      {/* 제목 */}
      <span className="flex-1 truncate text-sm text-sp-text">
        {isUrlLike(event.title) ? '(제목 없음)' : event.title}
        {event.source === 'google' && <GoogleBadge className="ml-1" />}
      </span>

      {/* D-Day 배지 */}
      {ddayBadge !== null && (
        <span className="shrink-0 text-xs font-semibold text-sp-highlight">
          {ddayBadge}
        </span>
      )}

      {/* 카테고리 라벨 */}
      <span className="shrink-0 rounded px-1.5 py-0.5 text-xs text-sp-muted bg-sp-surface max-w-[80px] truncate">
        {categoryInfo.name}
      </span>
    </div>
  );
}

type EventDisplayMode = 'upcoming' | 'today';

function RangePicker({
  value,
  onChange,
  onClose,
}: {
  value: number;
  onChange: (v: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1 z-20 bg-sp-card border border-sp-border rounded-lg shadow-xl p-3 w-52"
    >
      <p className="text-xs font-medium text-sp-muted mb-2">표시 기간</p>
      <div className="flex flex-wrap gap-1.5 mb-2.5">
        {RANGE_PRESETS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => { onChange(d); onClose(); }}
            className={`px-2 py-1 text-xs rounded-md transition-colors ${
              value === d
                ? 'bg-sp-accent text-white'
                : 'bg-sp-surface text-sp-muted hover:text-sp-text hover:bg-sp-surface/80'
            }`}
          >
            {d === 365 ? '1년' : `${d}일`}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={365}
          value={value}
          onChange={(e) => {
            const v = Math.max(1, Math.min(365, Number(e.target.value) || 14));
            onChange(v);
          }}
          className="w-14 bg-sp-surface border border-sp-border rounded px-2 py-1 text-xs text-sp-text text-center focus:outline-none focus:border-sp-accent"
        />
        <span className="text-xs text-sp-muted">일</span>
      </div>
    </div>
  );
}

export function DashboardEvents() {
  const { events, categories, load } = useEventsStore();
  const { settings, update } = useSettingsStore();
  const rangeDays = settings.eventWidgetRangeDays ?? 14;
  const [showAll, setShowAll] = useState(false);
  const [showRangePicker, setShowRangePicker] = useState(false);

  const handleRangeChange = useCallback((v: number) => {
    void update({ eventWidgetRangeDays: v });
  }, [update]);

  const [displayMode, setDisplayMode] = useState<EventDisplayMode>(() => {
    try {
      const saved = localStorage.getItem('ssampin:event-widget-mode');
      if (saved === 'today') return 'today';
    } catch { /* ignore */ }
    return 'upcoming';
  });

  const handleToggleMode = () => {
    const next = displayMode === 'upcoming' ? 'today' : 'upcoming';
    setDisplayMode(next);
    try { localStorage.setItem('ssampin:event-widget-mode', next); } catch { /* ignore */ }
  };

  useEffect(() => {
    void load();
  }, [load]);

  useWidgetRefresh(load, { intervalMs: 5 * 60 * 1000 });

  const today = useMemo(() => todayStart(), []);

  const filtered = useMemo(() => {
    const todayMs = today.getTime();

    const sortWithOrder = (a: SchoolEvent, b: SchoolEvent) => {
      const dateCompare = parseDate(a.date).getTime() - parseDate(b.date).getTime();
      if (dateCompare !== 0) return dateCompare;
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    };

    if (displayMode === 'today') {
      return [...events]
        .filter((event) => !event.isHidden)
        .filter((event) => {
          const eventMs = parseDate(event.date).getTime();
          const endMs = event.endDate ? parseDate(event.endDate).getTime() : eventMs;
          return eventMs <= todayMs && endMs >= todayMs;
        })
        .sort(sortWithOrder);
    }

    const limitMs = todayMs + rangeDays * 24 * 60 * 60 * 1000;
    return [...events]
      .filter((event) => !event.isHidden)
      .filter((event) => {
        const eventMs = parseDate(event.date).getTime();
        const endMs = event.endDate ? parseDate(event.endDate).getTime() : eventMs;
        return eventMs <= limitMs && endMs >= todayMs;
      })
      .sort(sortWithOrder);
  }, [events, today, displayMode, rangeDays]);

  const visible = filtered.slice(0, MAX_VISIBLE);
  const remaining = filtered.length - visible.length;

  return (
    <>
      <div className="rounded-xl bg-sp-card p-4 h-full flex flex-col">
        {/* 헤더 */}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-sp-text flex items-center gap-1.5">
            <span>📆</span>
            {displayMode === 'upcoming' ? '다가오는 일정' : '오늘 일정'}
          </h3>
          <div className="flex items-center gap-1 relative">
            <button
              onClick={handleToggleMode}
              className="text-[10px] text-sp-muted hover:text-sp-accent transition-colors px-2 py-0.5 rounded bg-sp-surface/50"
              title={displayMode === 'upcoming' ? '오늘 일정만 보기' : '다가오는 일정 보기'}
            >
              {displayMode === 'upcoming' ? '오늘만' : `${rangeDays}일`}
            </button>
            {displayMode === 'upcoming' && (
              <button
                onClick={() => setShowRangePicker((p) => !p)}
                className="text-sp-muted hover:text-sp-accent transition-colors p-0.5 rounded"
                title="표시 기간 설정"
              >
                <span className="material-symbols-outlined text-[14px]">tune</span>
              </button>
            )}
            {showRangePicker && (
              <RangePicker
                value={rangeDays}
                onChange={handleRangeChange}
                onClose={() => setShowRangePicker(false)}
              />
            )}
          </div>
        </div>

        {/* 콘텐츠 */}
        <div className="flex-1 min-h-0 overflow-auto">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-sp-muted">
              {displayMode === 'today' ? '오늘 일정이 없습니다' : '등록된 일정이 없습니다'}
            </p>
          ) : (
            <div className="space-y-0.5">
              {visible.map((event) => (
                <EventItem key={event.id} event={event} today={today} categories={categories} />
              ))}
              {remaining > 0 && (
                <button
                  type="button"
                  className="mt-2 w-full text-center text-xs text-sp-muted cursor-pointer hover:text-sp-accent transition-colors"
                  onClick={() => setShowAll(true)}
                >
                  +{remaining}개 더보기
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {showAll && createPortal(
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center"
          onClick={() => setShowAll(false)}
        >
          <div
            className="bg-sp-card rounded-xl border border-sp-border shadow-2xl w-full max-w-md max-h-[70vh] flex flex-col mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 팝업 헤더 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-sp-border shrink-0">
              <h2 className="text-sm font-bold text-sp-text">
                {displayMode === 'upcoming' ? '다가오는 일정' : '오늘 일정'}
              </h2>
              <button
                type="button"
                className="text-sp-muted hover:text-sp-text transition-colors text-lg leading-none"
                onClick={() => setShowAll(false)}
                aria-label="닫기"
              >
                ×
              </button>
            </div>

            {/* 팝업 목록 */}
            <div className="overflow-y-auto flex-1 p-3">
              <div className="space-y-0.5">
                {filtered.map((event) => (
                  <EventItem key={event.id} event={event} today={today} categories={categories} />
                ))}
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
