import { describe, it, expect } from 'vitest';
import type { Todo } from '@domain/entities/Todo';
import { computeWeeklySummary, weekRange, SOON_DAYS } from './weeklySummary';

const TODAY = new Date(2026, 5, 24); // 2026-06-24 (수)

function mk(p: Partial<Todo>): Todo {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    text: 'x',
    completed: false,
    createdAt: '2026-06-01T00:00:00.000Z',
    ...p,
  };
}

describe('weekRange', () => {
  it('수요일이면 그 주 월~일(2026-06-22 ~ 2026-06-28)', () => {
    expect(weekRange(TODAY)).toEqual({ start: '2026-06-22', end: '2026-06-28' });
  });
  it('일요일(2026-06-28)도 같은 주 월~일', () => {
    expect(weekRange(new Date(2026, 5, 28))).toEqual({ start: '2026-06-22', end: '2026-06-28' });
  });
  it('월요일(2026-06-22)은 그 날이 시작', () => {
    expect(weekRange(new Date(2026, 5, 22))).toEqual({ start: '2026-06-22', end: '2026-06-28' });
  });
});

describe('computeWeeklySummary', () => {
  const range = weekRange(TODAY);
  const todos: Todo[] = [
    // 1) 이번 주 완료(아카이브) — 지난 마감, 비활성
    mk({
      id: '1',
      completed: true,
      archivedAt: '2026-06-23T10:00:00.000Z',
      dueDate: '2026-06-20',
      category: 'admin',
    }),
    // 2) 이번 주 생성 + 이번 주 마감(임박, 미완료)
    mk({
      id: '2',
      dueDate: '2026-06-25',
      category: 'class',
      createdAt: '2026-06-23T00:00:00.000Z',
    }),
    // 3) 지난 마감 미완료(미룬 항목)
    mk({
      id: '3',
      dueDate: '2026-06-10',
      category: 'class',
      createdAt: '2026-05-01T00:00:00.000Z',
    }),
    // 4) 마감 없음, 미분류
    mk({ id: '4' }),
    // 5) 완료(미아카이브) — 이번 주 변경/생성
    mk({
      id: '5',
      completed: true,
      updatedAt: '2026-06-24T09:00:00.000Z',
      dueDate: '2026-06-22',
      category: 'admin',
      createdAt: '2026-06-22T00:00:00.000Z',
    }),
  ];

  const s = computeWeeklySummary(todos, range, TODAY);

  it('완료/생성 집계', () => {
    expect(s.completedCount).toBe(2); // #1(archivedAt), #5(updatedAt)
    expect(s.createdCount).toBe(2); // #2, #5
  });

  it('마감 관련 집계', () => {
    expect(s.dueThisWeekOpen).toBe(1); // #2
    expect(s.overdueOpen).toBe(1); // #3
    expect(s.upcomingSoon).toBe(1); // #2 (오늘~오늘+3 이내)
  });

  it('활성 총계(아카이브 제외)', () => {
    expect(s.activeTotal).toBe(4); // #2,#3,#4,#5 (#1 아카이브 제외)
  });

  it('카테고리 분포(활성 미완료, 많은 순)', () => {
    expect(s.categoryDistribution).toEqual([
      { categoryId: 'class', count: 2 },
      { categoryId: '미분류', count: 1 },
    ]);
  });

  it('빈 입력 — 모든 집계 0', () => {
    const empty = computeWeeklySummary([], range, TODAY);
    expect(empty.completedCount).toBe(0);
    expect(empty.activeTotal).toBe(0);
    expect(empty.categoryDistribution).toEqual([]);
  });

  it('SOON_DAYS 경계 — 오늘+3 포함, 오늘+4 제외', () => {
    const within = mk({ id: 'a', dueDate: '2026-06-27' }); // +3
    const beyond = mk({ id: 'b', dueDate: '2026-06-28' }); // +4
    const r = computeWeeklySummary([within, beyond], range, TODAY);
    expect(SOON_DAYS).toBe(3);
    expect(r.upcomingSoon).toBe(1);
  });
});
