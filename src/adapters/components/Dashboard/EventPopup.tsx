import { useEffect } from 'react';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { getCategoryInfo, getColorsForCategory } from '@adapters/presenters/categoryPresenter';
import { Modal } from '@adapters/components/common/Modal';
import { useRegisterModal } from '@adapters/hooks/useRegisterModal';

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
  /*
    받침이 다크 전용이었다(`bg-red-900/30`). 라이트 테마에서는 짙은 빨강 위에 라이트
    보정으로 어두워진 글씨가 얹혀 거의 읽히지 않았다(실측 대비 1.5:1 수준).
    받침만 옅은 틴트로 바꾸면 글자색은 기존 라이트 보정 규칙이 그대로 처리한다.

    실측(크로뮴 getComputedStyle + WCAG 계산, 라이트/다크 카드 위):
      red-300   4.91 / 6.47   ← 채택
      orange-300 4.11 / 6.80  ← 라이트에서 AA(4.5) 미달이라 200 단계로
      orange-200 7.43 / 8.48  ← 채택
    `text-sp-error`(3.66/4.44)도 재봤지만 둘 다 AA 를 못 넘겨 쓰지 않았다.
  */
  const bgClass = isUrgent
    ? 'bg-red-500/15 text-red-300 ring-red-500/30'
    : 'bg-orange-500/15 text-orange-200 ring-orange-500/30';

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md px-2 py-1 text-xs font-bold tabular-nums ring-1 ring-inset ${bgClass}`}
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
    // `bg-sp-bg/50` 이었다 — sp-* 토큰은 투명도 수식이 무효라 클래스가 아예 만들어지지
    // 않고 조용히 투명으로 렌더됐다. 받침 없이 글자만 떠 있던 상태.
    <div className="flex items-start gap-3 p-3 rounded-lg bg-sp-bg border border-sp-border hover:bg-sp-surface transition-colors">
      <div className="flex items-center justify-center shrink-0 mt-0.5">
        <span className={`material-symbols-outlined ${colors.text} text-icon-xl`}>{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-base font-medium text-sp-text truncate">
          {event.title}{' '}
          <span className="text-sp-muted text-sm font-normal max-w-[100px] truncate inline-block align-bottom">
            [{categoryInfo.name}]
          </span>
        </p>
        {event.time && (
          <div className="flex items-center gap-1.5 mt-1 text-sm text-sp-muted">
            <span className="material-symbols-outlined text-icon">schedule</span>
            <span>{event.time}</span>
          </div>
        )}
        {event.location && (
          <div className="flex items-center gap-1.5 mt-0.5 text-sm text-sp-muted">
            <span className="material-symbols-outlined text-icon">location_on</span>
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

  // Phase 3: ModalCoordinator 큐 등록 — 자기가 head일 때만 렌더
  const isHead = useRegisterModal('EVENT_ALERT', showPopup && !!alertResult);
  if (!showPopup || !alertResult || !isHead) return null;

  const today = new Date();

  return (
    <Modal
      isOpen
      onClose={dismissPopup}
      title="오늘 행사 알림"
      srOnlyTitle
      size="sm"
      panelClassName="!w-[min(480px,calc(100vw-32px))] rounded-2xl shadow-2xl ring-0"
    >
      {/* 헤더 — Modal이 sr-only h2를 제공하므로 시각 헤더는 h3로 격하 */}
      <div className="p-6 pb-2 shrink-0">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-3xl shrink-0">🔔</span>
            <h3 className="text-2xl font-bold tracking-tight text-sp-text truncate">
              오늘 행사 알림!
            </h3>
          </div>
          {/* 닫기 X 버튼 (Phase 0 핫픽스 유지) */}
          <button
            type="button"
            onClick={dismissPopup}
            aria-label="닫기"
            className="shrink-0 -mt-1 -mr-1 p-1 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-surface transition-colors"
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">
              close
            </span>
          </button>
        </div>
      </div>

      {/* 스크롤 콘텐츠 — flex-1 min-h-0 (modal-scroll-overflow-fix 패턴) */}
      <div className="px-6 py-2 overflow-y-auto max-h-[70vh] flex-1 min-h-0">
        {/* 날짜 */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">📅</span>
          <h4 className="text-lg font-semibold text-sp-text">{formatDate(today)}</h4>
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
              {/* 영문 라벨 'Upcoming' 이었다 — UI 텍스트는 한국어(CLAUDE.md 규칙 4). */}
              <h5 className="text-sm font-bold text-sp-text mb-3 ml-1">다가오는 행사</h5>
              <div className="space-y-2">
                {alertResult.upcomingEvents.map(({ event, dday }) => (
                  <div
                    key={event.id}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-sp-border bg-sp-bg"
                  >
                    {/* 제목이 길면 두 줄로 흐르는데, 그때 D-Day 배지가 눌려
                        "D-" 와 "3" 이 세로로 쪼개졌다. 제목 쪽만 늘어나게 하고
                        배지는 shrink-0 으로 지킨다. */}
                    <div className="flex min-w-0 flex-1 items-start gap-2">
                      <span
                        className={`mt-1.5 flex h-2 w-2 shrink-0 rounded-full ${
                          dday <= 3 ? 'bg-red-500' : 'bg-orange-500'
                        }`}
                      />
                      <span className="min-w-0 text-sm font-medium leading-snug text-sp-text break-keep">
                        {event.title}{' '}
                        <span className="text-xs font-normal text-sp-muted whitespace-nowrap">
                          ({formatShortDate(event.date)})
                        </span>
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
      <div className="p-6 pt-4 flex gap-3 shrink-0">
        <button
          type="button"
          onClick={snoozePopup}
          className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-sp-border bg-sp-bg px-4 py-2.5 text-sm font-semibold text-sp-text hover:bg-sp-surface transition-all"
        >
          <span className="material-symbols-outlined text-icon-md">snooze</span>
          다시 알림 (1시간 후)
        </button>
        <button
          type="button"
          onClick={dismissPopup}
          className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-sp-accent hover:brightness-110 text-sp-accent-fg px-4 py-2.5 text-sm font-semibold shadow-sm transition-all"
        >
          확인
        </button>
      </div>
    </Modal>
  );
}
