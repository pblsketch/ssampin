import { describe, it, expect } from 'vitest';
import type { Todo, TodoPriority } from '@domain/entities/Todo';
import {
  classifyQuadrant,
  daysUntilDue,
  isUrgent,
  groupByQuadrant,
  quadrantTargetChanges,
  URGENT_DAYS,
} from './eisenhowerMatrix';

const TODAY = new Date(2026, 5, 24); // 2026-06-24

function todo(priority: TodoPriority | undefined, dueDate?: string): Todo {
  return {
    id: `t-${priority}-${dueDate ?? 'none'}`,
    text: 'x',
    completed: false,
    createdAt: '2026-06-01T00:00:00.000Z',
    ...(priority ? { priority } : {}),
    ...(dueDate ? { dueDate } : {}),
  };
}

describe('daysUntilDue / isUrgent', () => {
  it('남은 일수 — 오늘 0, 지난 마감 음수, 없으면 null', () => {
    expect(daysUntilDue(todo('high', '2026-06-24'), TODAY)).toBe(0);
    expect(daysUntilDue(todo('high', '2026-06-20'), TODAY)).toBe(-4);
    expect(daysUntilDue(todo('high', '2026-06-30'), TODAY)).toBe(6);
    expect(daysUntilDue(todo('high'), TODAY)).toBeNull();
  });

  it('긴급 — D-3 이내(지난 마감 포함), D-4 이상은 비긴급', () => {
    expect(isUrgent(todo('low', '2026-06-24'), TODAY)).toBe(true); // 0
    expect(isUrgent(todo('low', `2026-06-${24 + URGENT_DAYS}`), TODAY)).toBe(true); // +3
    expect(isUrgent(todo('low', '2026-06-28'), TODAY)).toBe(false); // +4
    expect(isUrgent(todo('low', '2026-06-20'), TODAY)).toBe(true); // overdue
    expect(isUrgent(todo('low'), TODAY)).toBe(false); // no dueDate
  });
});

describe('classifyQuadrant', () => {
  it('q1 긴급+중요 — high & 임박', () => {
    expect(classifyQuadrant(todo('high', '2026-06-25'), TODAY)).toBe('q1');
    expect(classifyQuadrant(todo('high', '2026-06-20'), TODAY)).toBe('q1'); // overdue high
  });
  it('q2 중요(여유) — high & 비임박 또는 마감없음', () => {
    expect(classifyQuadrant(todo('high', '2026-07-10'), TODAY)).toBe('q2');
    expect(classifyQuadrant(todo('high'), TODAY)).toBe('q2');
  });
  it('q3 긴급(저우선) — non-high & 임박', () => {
    expect(classifyQuadrant(todo('medium', '2026-06-25'), TODAY)).toBe('q3');
    expect(classifyQuadrant(todo('low', '2026-06-24'), TODAY)).toBe('q3');
    expect(classifyQuadrant(todo('none', '2026-06-26'), TODAY)).toBe('q3');
  });
  it('q4 그 외 — non-high & 비임박/마감없음', () => {
    expect(classifyQuadrant(todo('medium', '2026-07-10'), TODAY)).toBe('q4');
    expect(classifyQuadrant(todo('low'), TODAY)).toBe('q4');
    expect(classifyQuadrant(todo(undefined), TODAY)).toBe('q4');
  });
});

describe('groupByQuadrant', () => {
  it('분면별로 분배(입력 순서 보존)', () => {
    const todos = [
      todo('high', '2026-06-24'), // q1
      todo('high', '2026-07-10'), // q2
      todo('low', '2026-06-25'), // q3
      todo('none'), // q4
      todo('high', '2026-06-26'), // q1
    ];
    const g = groupByQuadrant(todos, TODAY);
    expect(g.q1).toHaveLength(2);
    expect(g.q2).toHaveLength(1);
    expect(g.q3).toHaveLength(1);
    expect(g.q4).toHaveLength(1);
  });
});

describe('quadrantTargetChanges — 드래그 시 적용 변경', () => {
  it('중요 축(high/medium) + 긴급 축(오늘/여유) 조합', () => {
    expect(quadrantTargetChanges('q1', TODAY)).toEqual({ priority: 'high', dueDate: '2026-06-24' });
    expect(quadrantTargetChanges('q2', TODAY)).toEqual({ priority: 'high', dueDate: '2026-07-01' });
    expect(quadrantTargetChanges('q3', TODAY)).toEqual({
      priority: 'medium',
      dueDate: '2026-06-24',
    });
    expect(quadrantTargetChanges('q4', TODAY)).toEqual({
      priority: 'medium',
      dueDate: '2026-07-01',
    });
  });

  it('드래그 변경 결과가 그 분면으로 재분류된다(왕복 일관성)', () => {
    for (const q of ['q1', 'q2', 'q3', 'q4'] as const) {
      const changes = quadrantTargetChanges(q, TODAY);
      const moved = todo(changes.priority, changes.dueDate);
      expect(classifyQuadrant(moved, TODAY)).toBe(q);
    }
  });
});
