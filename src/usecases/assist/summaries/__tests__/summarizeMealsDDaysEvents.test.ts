/**
 * 쌤핀 AI — 급식·디데이·일정 요약 (브릿지 동등화 Phase 1)
 *
 * 계획서: docs/01-plan/features/assist-bridge-parity.plan.md §2
 */
import { describe, expect, it } from 'vitest';

import { summarizeMeals } from '../summarizeMeals';
import { summarizeDDays } from '../summarizeDDays';
import { summarizeEvents } from '../summarizeEvents';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';

describe('summarizeMeals', () => {
  it('나이스 원형(YYYYMMDD)을 대시 형식으로 정규화하고 기간으로 거른다', () => {
    const result = summarizeMeals(
      [
        {
          date: '20260824',
          mealType: '중식',
          dishes: [{ name: '차조밥' }, { name: '콩나물국' }],
          calorie: '690.9 Kcal',
        },
        { date: '20260901', mealType: '중식', dishes: [{ name: '기간 밖' }], calorie: '' },
      ],
      { from: '2026-08-24', to: '2026-08-28' },
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      date: '2026-08-24',
      mealType: '중식',
      dishes: '차조밥, 콩나물국',
      calorie: '690.9 Kcal',
    });
    expect(result.period).toBe('2026-08-24 ~ 2026-08-28');
  });

  it('날짜순으로 정렬한다', () => {
    const result = summarizeMeals(
      [
        { date: '20260826', mealType: '중식', dishes: [], calorie: '' },
        { date: '20260824', mealType: '중식', dishes: [], calorie: '' },
      ],
      { from: '2026-08-24', to: '2026-08-28' },
    );

    expect(result.items.map((m) => m.date)).toEqual(['2026-08-24', '2026-08-26']);
  });
});

describe('summarizeDDays', () => {
  it('★남은 날짜를 앱이 계산한다 — 모델의 날짜 추측 금지(할 일 overdue 와 같은 원칙)', () => {
    const result = summarizeDDays(
      [
        { title: '수능', targetDate: '2026-11-19', pinned: true },
        { title: '지난 행사', targetDate: '2026-08-20', pinned: false },
        { title: '오늘 마감', targetDate: '2026-08-23', pinned: false },
      ],
      { today: '2026-08-23' },
    );

    const byTitle = Object.fromEntries(result.items.map((d) => [d.title, d.daysLeft]));
    expect(byTitle['수능']).toBe(88);
    expect(byTitle['지난 행사']).toBe(-3);
    expect(byTitle['오늘 마감']).toBe(0);
  });

  it('가까운 순 정렬, 지난 것은 뒤로', () => {
    const result = summarizeDDays(
      [
        { title: '먼 미래', targetDate: '2026-12-01', pinned: false },
        { title: '지남', targetDate: '2026-08-01', pinned: false },
        { title: '내일', targetDate: '2026-08-24', pinned: false },
      ],
      { today: '2026-08-23' },
    );

    expect(result.items.map((d) => d.title)).toEqual(['내일', '먼 미래', '지남']);
  });
});

function event(partial: Partial<SchoolEvent> & { title: string; date: string }): SchoolEvent {
  return { id: partial.title, category: 'school', ...partial } as SchoolEvent;
}

describe('summarizeEvents', () => {
  it('기간 안 일정을 날짜별로 편다 — 여러 날 걸친 일정은 날마다 나온다', () => {
    const result = summarizeEvents(
      [
        event({ title: '중간고사', date: '2026-08-25', endDate: '2026-08-26' }),
        event({ title: '기간 밖', date: '2026-09-10' }),
      ],
      { from: '2026-08-24', to: '2026-08-28' },
    );

    expect(result.items.map((e) => `${e.date} ${e.title}`)).toEqual([
      '2026-08-25 중간고사',
      '2026-08-26 중간고사',
    ]);
    expect(result.truncated).toBe(false);
  });

  it('★반복 일정은 domain 규칙(getEventsForDate)으로 전개된다 — 캘린더와 같은 답', () => {
    const weekly = event({
      title: '주간 회의',
      date: '2026-08-03', // 월요일
      recurrence: 'weekly',
    });

    const result = summarizeEvents([weekly], { from: '2026-08-24', to: '2026-08-28' });

    // 2026-08-24 가 월요일이므로 그 주 월요일 한 번
    expect(result.items.some((e) => e.date === '2026-08-24' && e.title === '주간 회의')).toBe(true);
  });

  it('상한(maxDays)을 넘기면 자르되 truncated 로 알린다 — 조용한 절단 금지', () => {
    const daily = event({ title: '매일 조회', date: '2026-01-01', endDate: '2026-12-31' });

    const result = summarizeEvents([daily], {
      from: '2026-01-01',
      to: '2026-12-31',
      maxDays: 10,
    });

    expect(result.items).toHaveLength(10);
    expect(result.truncated).toBe(true);
  });
});
