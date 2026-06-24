import { useMemo, useState } from 'react';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import { computeWeeklySummary, weekRange } from '@domain/rules/weeklySummary';

/**
 * 위클리 요약 KPI 카드(WS5a) — 규칙 기반 순수 집계 표시. 외부 AI 0, 신규 저장 0.
 * 누적 보상 게이미피케이션 없음(스트릭·배지·랭킹·포인트 미사용) — 순수 정보 제공.
 */
export function WeeklyReviewCard(): JSX.Element {
  const { todos, categories } = useTodoStore();
  const [open, setOpen] = useState(false);

  const summary = useMemo(() => {
    const today = new Date();
    return computeWeeklySummary(todos, weekRange(today), today);
  }, [todos]);

  const categoryName = (id: string): string =>
    id === '미분류' ? '미분류' : (categories.find((c) => c.id === id)?.name ?? id);

  // 톤: 행동이 필요한 지표(임박·지남)와 성취(완료)만 색으로 강조하고 나머지는 차분하게 둔다.
  // 값이 0이면 톤과 무관하게 묵음 처리해 "지금 신경 쓸 것"만 눈에 들어오게 한다(정보 우선).
  const tiles: { label: string; value: number; icon: string; tone: Tone }[] = [
    { label: '완료', value: summary.completedCount, icon: 'task_alt', tone: 'success' },
    { label: '진행 중', value: summary.activeTotal, icon: 'pending_actions', tone: 'accent' },
    {
      label: '이번 주 마감',
      value: summary.dueThisWeekOpen,
      icon: 'event_upcoming',
      tone: 'neutral',
    },
    { label: '마감 임박', value: summary.upcomingSoon, icon: 'alarm', tone: 'warning' },
    { label: '지난 마감', value: summary.overdueOpen, icon: 'error', tone: 'danger' },
    { label: '새로 추가', value: summary.createdCount, icon: 'add_task', tone: 'neutral' },
  ];

  const maxCat = summary.categoryDistribution[0]?.count ?? 0;

  return (
    <div className="bg-sp-card rounded-xl ring-1 ring-sp-border overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-sp-surface transition-colors"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-bold text-sp-text">
          <span className="material-symbols-outlined text-icon text-sp-muted">calendar_month</span>
          이번 주 한눈에
          <span className="text-xs font-normal text-sp-muted">
            {summary.range.start.slice(5).replace('-', '/')}~
            {summary.range.end.slice(5).replace('-', '/')}
          </span>
        </span>
        <span className="flex items-center gap-3 text-xs text-sp-muted">
          <span>완료 {summary.completedCount}</span>
          {summary.upcomingSoon > 0 && (
            <span className="text-amber-400">임박 {summary.upcomingSoon}</span>
          )}
          <span className="material-symbols-outlined text-icon">
            {open ? 'expand_less' : 'expand_more'}
          </span>
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 flex flex-col gap-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {tiles.map((t) => {
              const active = t.value > 0;
              const c = toneClasses(t.tone, active);
              return (
                <div
                  key={t.label}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 ring-1 transition-colors ${c.tile}`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${c.chip}`}
                    aria-hidden="true"
                  >
                    <span className="material-symbols-outlined text-[18px] leading-none">
                      {t.icon}
                    </span>
                  </span>
                  <div className="flex min-w-0 flex-col gap-0.5 leading-none">
                    <span className={`text-lg font-bold leading-none ${c.num}`}>{t.value}</span>
                    <span className="text-caption text-sp-muted truncate">{t.label}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {summary.categoryDistribution.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-sp-muted">진행 중 분포(카테고리)</span>
              {summary.categoryDistribution.slice(0, 6).map((c) => (
                <div key={c.categoryId} className="flex items-center gap-2 text-xs">
                  <span className="w-20 shrink-0 truncate text-sp-text">
                    {categoryName(c.categoryId)}
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-sp-surface overflow-hidden">
                    <div
                      className="h-full bg-sp-accent/70 rounded-full"
                      style={{ width: maxCat > 0 ? `${(c.count / maxCat) * 100}%` : '0%' }}
                    />
                  </div>
                  <span className="w-6 text-right text-sp-muted">{c.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent';

/**
 * 톤 → 타일 클래스. 색은 "행동이 필요한 지표"에만, 그것도 값이 있을 때(active)만 입힌다.
 * 의미색은 작은 아이콘 칩과 옅은 배경 틴트에만 쓰고, 숫자는 항상 sp-text로 둬서
 * 라이트/다크 테마에 자동 적응한다(과한 네온 회피 — impeccable: 깔끔한·따뜻한).
 */
function toneClasses(tone: Tone, active: boolean): { tile: string; chip: string; num: string } {
  if (!active) {
    return {
      tile: 'bg-sp-surface ring-sp-border',
      chip: 'bg-sp-card text-sp-muted',
      num: 'text-sp-muted',
    };
  }
  switch (tone) {
    case 'success':
      return {
        tile: 'bg-emerald-500/[0.07] ring-emerald-500/25',
        chip: 'bg-emerald-500/15 text-emerald-500',
        num: 'text-sp-text',
      };
    case 'warning':
      return {
        tile: 'bg-amber-500/[0.08] ring-amber-500/30',
        chip: 'bg-amber-500/15 text-amber-500',
        num: 'text-sp-text',
      };
    case 'danger':
      return {
        tile: 'bg-red-500/[0.08] ring-red-500/30',
        chip: 'bg-red-500/15 text-red-500',
        num: 'text-sp-text',
      };
    case 'accent':
      // sp-accent는 CSS 변수라 불투명도 적용(/NN)이 깨져 틴트가 투명해진다.
      // sp-accent와 사실상 동색인 Tailwind blue-500으로 배경 틴트를 쓰되, 아이콘은
      // 테마 적응을 위해 text-sp-accent 유지.
      return {
        tile: 'bg-blue-500/[0.07] ring-blue-500/25',
        chip: 'bg-blue-500/15 text-sp-accent',
        num: 'text-sp-text',
      };
    case 'neutral':
    default:
      return {
        tile: 'bg-sp-surface ring-sp-border',
        chip: 'bg-sp-card text-sp-muted',
        num: 'text-sp-text',
      };
  }
}
