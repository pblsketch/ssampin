/**
 * 한 주를 한눈에 보는 요약(순수 함수).
 *
 * ★새로 세지 않는다. 급식·일정·디데이·시간표 요약을 **그대로 불러다 날짜별로 접는다** —
 * 각각을 따로 물었을 때와 같은 답이 나와야 하기 때문이다. 여기서 다시 세면 "주간 요약은
 * 3개라는데 일정을 물으면 4개"가 되는 두 정본 문제가 생긴다.
 *
 * ★결과는 **한 단계 중첩까지만** 쓴다(`days: [{...}]`). 재구성(그물 ②)이 깊이 1 까지만
 * 화이트리스트를 적용하므로, 여기서 `days[].events[]` 처럼 두 단계로 만들면 그 안쪽은
 * 걸러지지 않고 그대로 나간다. 그래서 그날의 일정·급식은 **한 줄 문자열로 합쳐서** 담는다.
 */
import type { TeacherPeriod } from '@domain/entities/Timetable';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';

import { clip } from './clip';
import { dayName, eachDate } from './dateWalk';
import { summarizeDDays, type DDayLike } from './summarizeDDays';
import { summarizeEvents } from './summarizeEvents';
import { summarizeMeals, type MealLike } from './summarizeMeals';
import { summarizeTimetable } from './summarizeTimetable';
import { summarizeTodos, type TodoLike } from './summarizeTodos';

export interface SummarizeWeekOptions {
  /** YYYY-MM-DD (포함) */
  readonly from: string;
  /** YYYY-MM-DD (포함) */
  readonly to: string;
  /** 오늘(YYYY-MM-DD) — 할 일의 기한 지남 판정 기준 */
  readonly today: string;
  readonly meals: readonly MealLike[];
  readonly events: readonly SchoolEvent[];
  readonly ddays: readonly DDayLike[];
  readonly todos: readonly TodoLike[];
  /** 그날의 유효 시간표(변동 반영). `summarizeTimetable` 과 같은 함수를 넘긴다 */
  readonly getDaySchedule: (date: string) => readonly (TeacherPeriod | null)[];
  /** 담을 날 수의 상한. 기본 7일 */
  readonly maxDays?: number;
  /** 한 칸(급식·일정)의 길이 상한. 기본 200자 */
  readonly maxCellChars?: number;
}

export interface WeekSummary {
  readonly period: string;
  /** 미완료 할 일 건수 — 날짜와 무관한 전체 수치다 */
  readonly todoUndone: number;
  readonly truncated: boolean;
  readonly days: readonly {
    readonly date: string;
    /** '월'~'일' */
    readonly day: string;
    /** 그날 수업 교시 수 */
    readonly lessons: number;
    /** 그날 급식 — "중식 차조밥, 콩나물국" 형태. 없으면 빈 문자열 */
    readonly meal: string;
    /** 그날 일정 제목들을 쉼표로 합친 한 줄 */
    readonly events: string;
    /** 그날이 D-Day 인 항목 제목들 */
    readonly ddays: string;
  }[];
}

export function summarizeWeek(opts: SummarizeWeekOptions): WeekSummary {
  const maxCellChars = opts.maxCellChars ?? 200;
  const maxDays = opts.maxDays ?? 7;
  const { dates, truncated } = eachDate(opts.from, opts.to, maxDays);
  const range = { from: opts.from, to: opts.to };

  const meals = summarizeMeals(opts.meals, range);
  const events = summarizeEvents(opts.events, { ...range, maxDays });
  const timetable = summarizeTimetable(opts.getDaySchedule, {
    ...range,
    maxDays,
    // 주간 요약은 교시 목록이 아니라 **교시 수**만 쓰므로 상한에 걸려선 안 된다.
    maxItems: Number.MAX_SAFE_INTEGER,
  });
  const ddays = summarizeDDays(opts.ddays, { today: opts.today });
  const todos = summarizeTodos(opts.todos, { today: opts.today });

  const days = dates.map((date) => ({
    date,
    day: dayName(date),
    lessons: timetable.items.filter((i) => i.date === date).length,
    meal: clip(
      meals.items
        .filter((m) => m.date === date)
        .map((m) => `${m.mealType} ${m.dishes}`.trim())
        .join(' / '),
      maxCellChars,
    ),
    events: clip(
      events.items
        .filter((e) => e.date === date)
        .map((e) => e.title)
        .join(', '),
      maxCellChars,
    ),
    ddays: clip(
      ddays.items
        .filter((d) => d.date === date)
        .map((d) => d.title)
        .join(', '),
      maxCellChars,
    ),
  }));

  return {
    period: `${opts.from} ~ ${opts.to}`,
    todoUndone: todos.undone,
    truncated: truncated || events.truncated,
    days,
  };
}
