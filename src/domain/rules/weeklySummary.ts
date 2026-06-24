/**
 * 위클리 요약 — 순수 집계(WS5a). 외부 AI·런타임 LLM 0. 신규 저장 데이터 0.
 *
 * 기존 Todo 필드(completed/archivedAt/updatedAt/dueDate/createdAt/category)에서만 계산한다.
 * ⚠️ 누적 보상 게이미피케이션 금지 — 스트릭·배지·랭킹·포인트 없음. 순수 정보 제공만.
 */
import type { Todo } from '@domain/entities/Todo';

export interface WeekRange {
  /** "YYYY-MM-DD" (포함) */
  readonly start: string;
  /** "YYYY-MM-DD" (포함) */
  readonly end: string;
}

export interface CategoryCount {
  readonly categoryId: string;
  readonly count: number;
}

export interface WeeklySummary {
  readonly range: WeekRange;
  /** 이번 주 완료(완료 표시 + 완료 추정시각이 주 범위 내). */
  readonly completedCount: number;
  /** 이번 주 생성(createdAt 이 주 범위 내). */
  readonly createdCount: number;
  /** 이번 주 마감 예정(미완료). */
  readonly dueThisWeekOpen: number;
  /** 지난 마감인데 아직 미완료(= 미룬 항목). */
  readonly overdueOpen: number;
  /** 오늘부터 SOON_DAYS 이내 마감 미완료(마감 임박). */
  readonly upcomingSoon: number;
  /** 활성(미아카이브) 총 개수. */
  readonly activeTotal: number;
  /** 활성 미완료 항목의 카테고리 분포(많은 순). 미분류는 '미분류'. */
  readonly categoryDistribution: readonly CategoryCount[];
}

/** 마감 임박 기준일수(오늘 포함 D-3). */
export const SOON_DAYS = 3;
const UNCATEGORIZED = '미분류';

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** ISO/날짜 문자열 → "YYYY-MM-DD"(앞 10자). */
function dateOnly(s: string | undefined): string | undefined {
  return s ? s.slice(0, 10) : undefined;
}

function inRange(date: string | undefined, range: WeekRange): boolean {
  if (!date) return false;
  return date >= range.start && date <= range.end;
}

/** 주어진 날짜가 속한 주(월~일) 범위. */
export function weekRange(today: Date = new Date()): WeekRange {
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const backToMon = (base.getDay() + 6) % 7; // 월=0 … 일=6
  const start = new Date(base);
  start.setDate(start.getDate() - backToMon);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start: ymd(start), end: ymd(end) };
}

/** 완료 추정 시각(완료 표시 항목) — archivedAt → updatedAt → createdAt 순. */
function completedAtProxy(t: Todo): string | undefined {
  return dateOnly(t.archivedAt) ?? dateOnly(t.updatedAt) ?? dateOnly(t.createdAt);
}

/**
 * 주간 요약 집계. today 는 마감 임박/지난 마감 판정 기준(기본 오늘).
 * range 외 항목도 활성 분포·임박 계산에는 포함될 수 있다(range 는 완료/생성 집계 창).
 */
export function computeWeeklySummary(
  todos: readonly Todo[],
  range: WeekRange,
  today: Date = new Date(),
): WeeklySummary {
  const todayStr = ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const soon = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  soon.setDate(soon.getDate() + SOON_DAYS);
  const soonStr = ymd(soon);

  let completedCount = 0;
  let createdCount = 0;
  let dueThisWeekOpen = 0;
  let overdueOpen = 0;
  let upcomingSoon = 0;
  let activeTotal = 0;
  const catMap = new Map<string, number>();

  for (const t of todos) {
    const active = !t.archivedAt;
    if (active) activeTotal += 1;

    if (inRange(dateOnly(t.createdAt), range)) createdCount += 1;
    if (t.completed && inRange(completedAtProxy(t), range)) completedCount += 1;

    const due = dateOnly(t.dueDate);
    if (!t.completed && active && due) {
      if (inRange(due, range)) dueThisWeekOpen += 1;
      if (due < todayStr) overdueOpen += 1;
      if (due >= todayStr && due <= soonStr) upcomingSoon += 1;
    }

    if (active && !t.completed) {
      const cat = t.category && t.category.trim() ? t.category : UNCATEGORIZED;
      catMap.set(cat, (catMap.get(cat) ?? 0) + 1);
    }
  }

  const categoryDistribution: CategoryCount[] = [...catMap.entries()]
    .map(([categoryId, count]) => ({ categoryId, count }))
    .sort((a, b) => b.count - a.count || a.categoryId.localeCompare(b.categoryId));

  return {
    range,
    completedCount,
    createdCount,
    dueThisWeekOpen,
    overdueOpen,
    upcomingSoon,
    activeTotal,
    categoryDistribution,
  };
}
