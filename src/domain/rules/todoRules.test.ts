import { describe, it, expect } from 'vitest';
import {
  sortTodos,
  filterByDateRange,
  groupByDate,
  isOverdue,
  filterByCategory,
  filterActive,
  filterArchived,
  calculateNextDueDate,
  inferStatus,
  applyStatusChange,
  syncStatusToCompleted,
  formatDate,
} from './todoRules';
import type { Todo } from '@domain/entities/Todo';

let seq = 0;
function todo(extra: Partial<Todo> = {}): Todo {
  return {
    id: `t${seq++}`,
    text: extra.text ?? '할 일',
    completed: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

const TODAY = new Date(2026, 2, 5); // 2026-03-05

describe('formatDate', () => {
  it('Date → YYYY-MM-DD (0 패딩)', () => {
    expect(formatDate(new Date(2026, 0, 3))).toBe('2026-01-03');
    expect(formatDate(new Date(2026, 11, 25))).toBe('2026-12-25');
  });
});

describe('sortTodos', () => {
  it('완료된 항목은 항상 뒤로 간다', () => {
    const done = todo({ text: 'done', completed: true, priority: 'high' });
    const active = todo({ text: 'active', completed: false, priority: 'low' });
    expect(sortTodos([done, active]).map((t) => t.text)).toEqual(['active', 'done']);
  });

  it('priority 모드: sortOrder → 우선순위 → 마감일 순', () => {
    const a = todo({ text: 'a', priority: 'low', sortOrder: 1 });
    const b = todo({ text: 'b', priority: 'high', sortOrder: 0 });
    // sortOrder 가 둘 다 있으면 sortOrder 가 우선
    expect(sortTodos([a, b]).map((t) => t.text)).toEqual(['b', 'a']);

    const high = todo({ text: 'high', priority: 'high' });
    const none = todo({ text: 'none' });
    const medium = todo({ text: 'medium', priority: 'medium' });
    expect(sortTodos([none, medium, high]).map((t) => t.text)).toEqual(['high', 'medium', 'none']);
  });

  it('dueDate 모드: 마감일 빠른 순 → 마감일 없는 항목은 뒤 → 우선순위', () => {
    const d10 = todo({ text: 'd10', dueDate: '2026-03-10' });
    const d05 = todo({ text: 'd05', dueDate: '2026-03-05' });
    const noDue = todo({ text: 'noDue' });
    expect(sortTodos([noDue, d10, d05], 'dueDate').map((t) => t.text)).toEqual([
      'd05',
      'd10',
      'noDue',
    ]);

    const sameDayHigh = todo({ text: 'sameHigh', dueDate: '2026-03-05', priority: 'high' });
    const sameDayLow = todo({ text: 'sameLow', dueDate: '2026-03-05', priority: 'low' });
    expect(sortTodos([sameDayLow, sameDayHigh], 'dueDate').map((t) => t.text)).toEqual([
      'sameHigh',
      'sameLow',
    ]);
  });

  it('원본 배열을 변형하지 않는다', () => {
    const items = [todo({ priority: 'low' }), todo({ priority: 'high' })];
    const copy = [...items];
    sortTodos(items);
    expect(items).toEqual(copy);
  });
});

describe('filterByDateRange', () => {
  const todos = [
    todo({ text: 'today', dueDate: '2026-03-05' }),
    todo({ text: 'tomorrow', dueDate: '2026-03-06' }),
    todo({ text: 'inWeek', dueDate: '2026-03-11' }), // today+6
    todo({ text: 'outWeek', dueDate: '2026-03-12' }),
    todo({ text: 'past', dueDate: '2026-03-01' }),
    todo({ text: 'noDue' }),
  ];

  it("'all' 은 전부 반환", () => {
    expect(filterByDateRange(todos, 'all', TODAY)).toHaveLength(todos.length);
  });

  it("'today' 는 오늘 마감 + 마감일 없는 것", () => {
    expect(
      filterByDateRange(todos, 'today', TODAY)
        .map((t) => t.text)
        .sort(),
    ).toEqual(['noDue', 'today']);
  });

  it("'week' 은 오늘~+6일 범위 + 마감일 없는 것 (과거·범위 밖 제외)", () => {
    expect(
      filterByDateRange(todos, 'week', TODAY)
        .map((t) => t.text)
        .sort(),
    ).toEqual(['inWeek', 'noDue', 'today', 'tomorrow']);
  });
});

describe('groupByDate', () => {
  it('overdue/today/tomorrow/thisWeek/later/noDueDate 로 분류', () => {
    const todos = [
      todo({ text: 'overdue', dueDate: '2026-03-01' }),
      todo({ text: 'today', dueDate: '2026-03-05' }),
      todo({ text: 'tomorrow', dueDate: '2026-03-06' }),
      todo({ text: 'thisWeek', dueDate: '2026-03-10' }),
      todo({ text: 'later', dueDate: '2026-04-01' }),
      todo({ text: 'noDue' }),
    ];
    const g = groupByDate(todos, TODAY);
    expect(g.overdue!.map((t) => t.text)).toEqual(['overdue']);
    expect(g.today!.map((t) => t.text)).toEqual(['today']);
    expect(g.tomorrow!.map((t) => t.text)).toEqual(['tomorrow']);
    expect(g.thisWeek!.map((t) => t.text)).toEqual(['thisWeek']);
    expect(g.later!.map((t) => t.text)).toEqual(['later']);
    expect(g.noDueDate!.map((t) => t.text)).toEqual(['noDue']);
  });

  it('완료된 항목은 마감일이 지났어도 overdue 에 넣지 않는다', () => {
    const g = groupByDate(
      [todo({ text: 'doneOld', dueDate: '2026-03-01', completed: true })],
      TODAY,
    );
    expect(g.overdue!).toHaveLength(0);
  });
});

describe('isOverdue', () => {
  it('마감일 없음·완료됨이면 false, 마감일이 오늘보다 이전이면 true', () => {
    expect(isOverdue(todo({ dueDate: '2026-03-01' }), TODAY)).toBe(true);
    expect(isOverdue(todo({ dueDate: '2026-03-05' }), TODAY)).toBe(false);
    expect(isOverdue(todo({ dueDate: '2026-03-10' }), TODAY)).toBe(false);
    expect(isOverdue(todo({ dueDate: '2026-03-01', completed: true }), TODAY)).toBe(false);
    expect(isOverdue(todo({}), TODAY)).toBe(false);
  });
});

describe('filter 헬퍼', () => {
  it('filterByCategory: null 이면 전부, 아니면 해당 카테고리만', () => {
    const items = [todo({ category: 'work' }), todo({ category: 'home' }), todo({})];
    expect(filterByCategory(items, null)).toHaveLength(3);
    expect(filterByCategory(items, 'work')).toHaveLength(1);
    expect(filterByCategory(items, 'work')[0]!.category).toBe('work');
  });

  it('filterActive / filterArchived: archivedAt 유무로 분리', () => {
    const a = todo({ text: 'active' });
    const b = todo({ text: 'archived', archivedAt: '2026-02-01T00:00:00.000Z' });
    expect(filterActive([a, b]).map((t) => t.text)).toEqual(['active']);
    expect(filterArchived([a, b]).map((t) => t.text)).toEqual(['archived']);
  });
});

describe('calculateNextDueDate', () => {
  it('daily — interval 만큼 일수 추가', () => {
    expect(calculateNextDueDate('2026-03-10', { type: 'daily', interval: 1 })).toBe('2026-03-11');
    expect(calculateNextDueDate('2026-03-10', { type: 'daily', interval: 5 })).toBe('2026-03-15');
  });

  it('weekly — 7*interval 일 추가', () => {
    expect(calculateNextDueDate('2026-03-10', { type: 'weekly', interval: 1 })).toBe('2026-03-17');
    expect(calculateNextDueDate('2026-03-10', { type: 'weekly', interval: 2 })).toBe('2026-03-24');
  });

  it('monthly / yearly — 월·연 추가', () => {
    expect(calculateNextDueDate('2026-03-10', { type: 'monthly', interval: 1 })).toBe('2026-04-10');
    expect(calculateNextDueDate('2026-11-10', { type: 'monthly', interval: 3 })).toBe('2027-02-10');
    expect(calculateNextDueDate('2026-03-10', { type: 'yearly', interval: 1 })).toBe('2027-03-10');
  });

  it('weekdays — 주말을 건너뛴 평일 N개 뒤', () => {
    // 2026-03-09 = 월요일 → 평일 1개 뒤 = 화요일 2026-03-10
    expect(calculateNextDueDate('2026-03-09', { type: 'weekdays', interval: 1 })).toBe(
      '2026-03-10',
    );
    // 2026-03-13 = 금요일 → 평일 1개 뒤 = 다음 월요일 2026-03-16
    expect(calculateNextDueDate('2026-03-13', { type: 'weekdays', interval: 1 })).toBe(
      '2026-03-16',
    );
    // 결과는 항상 평일이어야 한다
    const next = calculateNextDueDate('2026-03-13', { type: 'weekdays', interval: 3 });
    const day = new Date(next + 'T00:00:00').getDay();
    expect(day).not.toBe(0);
    expect(day).not.toBe(6);
  });
});

describe('프로 모드 상태 동기화', () => {
  it('inferStatus: status 가 있으면 그대로, 없으면 completed 로 유추', () => {
    expect(inferStatus(todo({ status: 'inProgress' }))).toBe('inProgress');
    expect(inferStatus(todo({ completed: true }))).toBe('done');
    expect(inferStatus(todo({ completed: false }))).toBe('todo');
  });

  it('applyStatusChange: status·completed·subTasks 를 함께 갱신', () => {
    const t = todo({
      status: 'todo',
      completed: false,
      subTasks: [
        { id: 's1', text: 'a', completed: false },
        { id: 's2', text: 'b', completed: true },
      ],
    });
    const done = applyStatusChange(t, 'done');
    expect(done.status).toBe('done');
    expect(done.completed).toBe(true);
    expect(done.subTasks).toEqual([
      { id: 's1', text: 'a', completed: true },
      { id: 's2', text: 'b', completed: true },
    ]);

    const back = applyStatusChange(t, 'inProgress');
    expect(back.completed).toBe(false);
    expect(back.subTasks?.every((s) => s.completed === false)).toBe(true);
  });

  it('syncStatusToCompleted: done 만 true', () => {
    expect(syncStatusToCompleted('done')).toBe(true);
    expect(syncStatusToCompleted('todo')).toBe(false);
    expect(syncStatusToCompleted('inProgress')).toBe(false);
  });
});
