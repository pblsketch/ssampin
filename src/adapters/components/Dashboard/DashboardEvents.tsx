import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useWidgetRefresh } from '@widgets/hooks/useWidgetRefresh';
import { calculateDDay } from '@domain/rules/ddayRules';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';
import { getCategoryInfo, getColorsForCategory } from '@adapters/presenters/categoryPresenter';
import { GoogleBadge } from '@adapters/components/Calendar/GoogleBadge';
import { isUrlLike } from '@domain/rules/eventRules';

const MAX_VISIBLE = 6;

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

export function DashboardEvents() {
  const { events, categories, load } = useEventsStore();
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  useWidgetRefresh(load, { intervalMs: 5 * 60 * 1000 });

  const today = useMemo(() => todayStart(), []);

  const filtered = useMemo(() => {
    const todayMs = today.getTime();
    const limitMs = todayMs + 14 * 24 * 60 * 60 * 1000; // today + 14일

    return [...events]
      .filter((event) => !event.isHidden)
      .filter((event) => {
        const eventMs = parseDate(event.date).getTime();
        // 멀티데이 이벤트는 endDate 기준으로도 포함
        const endMs = event.endDate ? parseDate(event.endDate).getTime() : eventMs;
        // 이벤트가 범위와 겹치면 포함 (시작일이 limit 이전, 종료일이 today 이후)
        return eventMs <= limitMs && endMs >= todayMs;
      })
      .sort((a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime());
  }, [events, today]);

  const visible = filtered.slice(0, MAX_VISIBLE);
  const remaining = filtered.length - visible.length;

  return (
    <>
      <div className="rounded-xl bg-sp-card p-4 h-full flex flex-col">
        {/* 헤더 */}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-sp-text flex items-center gap-1.5"><span>📆</span>다가오는 일정</h3>
        </div>

        {/* 콘텐츠 */}
        <div className="flex-1 min-h-0 overflow-auto">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-sp-muted">
              등록된 일정이 없습니다
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
              <h2 className="text-sm font-bold text-sp-text">다가오는 일정</h2>
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
