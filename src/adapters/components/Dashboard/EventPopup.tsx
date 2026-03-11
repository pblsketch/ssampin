import { useEffect } from 'react';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { getCategoryInfo, getColorsForCategory } from '@adapters/presenters/categoryPresenter';

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** 카테고리별 아이콘 매핑 (기본 카테고리용) */
const CATEGORY_ICONS: Record<string, string> = {
  school: 'verified_user',
  class: 'diversity_3',
  exam: 'edit_note',
  holiday: 'forest',
  department: 'business_center',
  treeSchool: 'park',
  etc: 'event',
};

function getCategoryIcon(categoryId: string): string {
  return CATEGORY_ICONS[categoryId] ?? 'event';
}

function formatDate(today: Date): string {
  const month = today.getMonth() + 1;
  const date = today.getDate();
  const dayName = DAY_NAMES[today.getDay()];
  return `${month}월 ${date}일 (${dayName})`;
}

function formatShortDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  if (!m || !d) return dateStr;
  return `${Number(m)}/${Number(d)}`;
}

interface DDayBadgeProps {
  readonly dday: number;
}

function DDayBadge({ dday }: DDayBadgeProps) {
  const isUrgent = dday <= 3;
  const bgClass = isUrgent
    ? 'bg-red-900/30 text-red-300 ring-red-400/20'
    : 'bg-orange-900/30 text-orange-300 ring-orange-400/20';

  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${bgClass}`}
    >
      D-{dday}
    </span>
  );
}

interface EventItemProps {
  readonly event: SchoolEvent;
  readonly categories: readonly import('@domain/entities/SchoolEvent').CategoryItem[];
}

function EventItem({ event, categories }: EventItemProps) {
  const colors = getColorsForCategory(event.category, categories);
  const categoryInfo = getCategoryInfo(event.category, categories);
  const icon = getCategoryIcon(event.category);

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-sp-bg/50 hover:bg-sp-bg transition-colors">
      <div className="flex items-center justify-center shrink-0 mt-0.5">
        <span className={`material-symbols-outlined ${colors.text} text-[24px]`}>
          {icon}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-base font-medium text-sp-text truncate">
          {event.title}{' '}
          <span className="text-sp-muted text-sm font-normal max-w-[100px] truncate inline-block align-bottom">[{categoryInfo.name}]</span>
        </p>
        {event.time && (
          <div className="flex items-center gap-1.5 mt-1 text-sm text-sp-muted">
            <span className="material-symbols-outlined text-[16px]">schedule</span>
            <span>{event.time}</span>
          </div>
        )}
        {event.location && (
          <div className="flex items-center gap-1.5 mt-0.5 text-sm text-sp-muted">
            <span className="material-symbols-outlined text-[16px]">location_on</span>
            <span>{event.location}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function EventPopup() {
  const { alertResult, showPopup, categories, checkAlerts, dismissPopup, snoozePopup } =
    useEventsStore();

  useEffect(() => {
    void checkAlerts();
  }, [checkAlerts]);

  if (!showPopup || !alertResult) return null;

  const today = new Date();

  return (
    <>
      {/* 오버레이 */}
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />

      {/* 모달 */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-[480px] bg-sp-card rounded-2xl border border-sp-border shadow-2xl overflow-hidden flex flex-col">
          {/* 헤더 */}
          <div className="p-6 pb-2">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-3xl">🔔</span>
              <h2 className="text-2xl font-bold tracking-tight text-white">
                오늘 행사 알림!
              </h2>
            </div>
          </div>

          {/* 스크롤 콘텐츠 */}
          <div className="px-6 py-2 overflow-y-auto max-h-[70vh]">
            {/* 날짜 */}
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">📅</span>
              <h3 className="text-lg font-semibold text-sp-text">
                {formatDate(today)}
              </h3>
            </div>

            <div className="h-px bg-sp-border mb-4 w-full" />

            {/* 오늘 행사 리스트 */}
            {alertResult.todayEvents.length > 0 && (
              <div className="space-y-3 mb-6">
                {alertResult.todayEvents.map((event) => (
                  <EventItem key={event.id} event={event} categories={categories} />
                ))}
              </div>
            )}

            {/* 다가오는 행사 */}
            {alertResult.upcomingEvents.length > 0 && (
              <>
                <div className="h-px bg-sp-border mb-4 w-full" />
                <div className="mb-2">
                  <h4 className="text-xs font-bold text-sp-muted uppercase tracking-wider mb-3 ml-1">
                    Upcoming
                  </h4>
                  <div className="space-y-2">
                    {alertResult.upcomingEvents.map(({ event, dday }) => (
                      <div
                        key={event.id}
                        className="flex items-center justify-between p-2.5 rounded-lg border border-sp-border bg-sp-bg/20"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`flex h-2 w-2 rounded-full ${
                              dday <= 3 ? 'bg-red-500' : 'bg-orange-500'
                            }`}
                          />
                          <span className="text-sm font-medium text-sp-text">
                            {event.title}
                          </span>
                          <span className="text-xs text-sp-muted">
                            ({formatShortDate(event.date)})
                          </span>
                        </div>
                        <DDayBadge dday={dday} />
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* 하단 버튼 */}
          <div className="p-6 pt-4 mt-auto flex gap-3">
            <button
              type="button"
              onClick={snoozePopup}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-sp-border px-4 py-2.5 text-sm font-semibold text-sp-muted hover:bg-sp-surface transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">snooze</span>
              다시 알림 (1시간 후)
            </button>
            <button
              type="button"
              onClick={dismissPopup}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-sp-accent hover:bg-blue-600 text-white px-4 py-2.5 text-sm font-semibold shadow-sm transition-all"
            >
              확인
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
