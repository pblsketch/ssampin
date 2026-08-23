/**
 * 쌤핀 AI — 주간 요약 (브릿지 동등화 Phase 1 슬라이스 2)
 *
 * ★이 요약이 지켜야 할 단 하나: **따로 물었을 때와 같은 답**이어야 한다.
 * 주간 요약이 자기만의 셈을 갖는 순간 "주간 요약은 3개라는데 일정을 물으면 4개"가 된다.
 *
 * ★그리고 결과가 **한 단계 중첩까지만** 이어야 한다. 재구성(그물 ②)은 깊이 1 까지만
 * 화이트리스트를 적용하므로, `days[].events[]` 처럼 두 단계면 그 안쪽이 걸러지지 않고 나간다.
 */
import { describe, expect, it } from 'vitest';

import type { SchoolEvent } from '@domain/entities/SchoolEvent';
import type { TeacherPeriod } from '@domain/entities/Timetable';
import { summarizeEvents } from '../summarizeEvents';
import { summarizeWeek } from '../summarizeWeek';

const SCHEDULE: Readonly<Record<string, readonly (TeacherPeriod | null)[]>> = {
  '2026-08-24': [{ subject: '수학', classroom: '3-2' }, null, { subject: '과학', classroom: '' }],
  '2026-08-25': [{ subject: '수학', classroom: '2-1' }],
};
const getDaySchedule = (date: string): readonly (TeacherPeriod | null)[] => SCHEDULE[date] ?? [];

const EVENTS: readonly SchoolEvent[] = [
  { id: 'e1', title: '학부모 총회', date: '2026-08-25', category: 'school', time: '14:00' },
  { id: 'e2', title: '학년 회의', date: '2026-08-25', category: 'school' },
];

const BASE = {
  from: '2026-08-24',
  to: '2026-08-26',
  today: '2026-08-24',
  meals: [
    {
      date: '20260824',
      mealType: '중식',
      dishes: [{ name: '차조밥' }, { name: '콩나물국' }],
      calorie: '690 Kcal',
    },
  ],
  events: EVENTS,
  ddays: [{ title: '체육대회', targetDate: '2026-08-26', pinned: false }],
  todos: [
    { text: '결재 올리기', dueDate: '2026-08-25', completed: false },
    { text: '채점', dueDate: '2026-08-20', completed: true },
  ],
  getDaySchedule,
};

describe('summarizeWeek', () => {
  it('날짜별로 수업 교시 수·급식·일정·디데이를 한 줄씩 접는다', () => {
    const out = summarizeWeek(BASE);

    expect(out.days.map((d) => [d.date, d.day, d.lessons])).toEqual([
      ['2026-08-24', '월', 2],
      ['2026-08-25', '화', 1],
      ['2026-08-26', '수', 0],
    ]);
    expect(out.days[0]?.meal).toBe('중식 차조밥, 콩나물국');
    expect(out.days[1]?.events).toBe('학부모 총회, 학년 회의');
    expect(out.days[2]?.ddays).toBe('체육대회');
    expect(out.period).toBe('2026-08-24 ~ 2026-08-26');
  });

  it('★일정 건수가 따로 물었을 때와 같다 — 두 정본이 생기면 답이 갈린다', () => {
    const alone = summarizeEvents(EVENTS, { from: '2026-08-24', to: '2026-08-26' });
    const week = summarizeWeek(BASE);
    const inWeek = week.days.flatMap((d) => (d.events ? d.events.split(', ') : []));

    expect(inWeek).toHaveLength(alone.items.length);
    expect(inWeek.sort()).toEqual(alone.items.map((e) => e.title).sort());
  });

  it('미완료 할 일 수를 함께 준다 (완료분은 세지 않는다)', () => {
    expect(summarizeWeek(BASE).todoUndone).toBe(1);
  });

  it('★결과가 한 단계 중첩까지만이다 — 그물 ②가 깊이 1 까지만 거른다', () => {
    for (const day of summarizeWeek(BASE).days) {
      for (const value of Object.values(day)) {
        expect(typeof value === 'string' || typeof value === 'number').toBe(true);
      }
    }
  });

  it('일정이 없는 날은 빈 문자열이다 — null 이 아니라', () => {
    expect(summarizeWeek(BASE).days[0]?.events).toBe('');
  });

  it('날 수 상한을 넘기면 truncated 로 드러낸다', () => {
    const out = summarizeWeek({ ...BASE, to: '2026-12-31', maxDays: 2 });
    expect(out.days).toHaveLength(2);
    expect(out.truncated).toBe(true);
  });

  it('한 칸이 너무 길면 자른다 — 서버 상한(4,000자)을 지키기 위해서다', () => {
    const many: readonly SchoolEvent[] = Array.from({ length: 30 }, (_, i) => ({
      id: `x${i}`,
      title: `아주 긴 일정 제목 ${i}`,
      date: '2026-08-24',
      category: 'school',
    }));
    const out = summarizeWeek({ ...BASE, events: many, maxCellChars: 20 });
    expect(out.days[0]?.events.length).toBeLessThanOrEqual(21);
  });
});
