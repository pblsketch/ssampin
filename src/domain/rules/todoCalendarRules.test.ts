import { describe, it, expect } from 'vitest';
import type { Todo } from '@domain/entities/Todo';
import {
  addDaysToKey,
  canMoveTodoByDrag,
  compareTodoChips,
  daysBetweenKeys,
  getTodoChipsByDate,
  isTodoOnCalendar,
  moveTodoDueDate,
  toTodoCalendarChip,
} from './todoCalendarRules';
import type { TodoCalendarChip } from './todoCalendarRules';

const TODAY = '2026-08-27';

const todo = (over: Partial<Todo> = {}): Todo => ({
  id: 't1',
  text: '공문 회신',
  completed: false,
  createdAt: '2026-08-01T00:00:00.000Z',
  ...over,
});

const chip = (over: Partial<TodoCalendarChip> = {}): TodoCalendarChip => ({
  todoId: 'c1',
  title: '할 일',
  dateKey: TODAY,
  completed: false,
  overdue: false,
  priority: 'none',
  isRecurring: false,
  ...over,
});

describe('날짜 계산', () => {
  it('일수를 더하면 달을 넘어간다', () => {
    expect(addDaysToKey('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDaysToKey('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('두 날짜 사이 일수를 센다', () => {
    expect(daysBetweenKeys('2026-08-27', '2026-08-30')).toBe(3);
    expect(daysBetweenKeys('2026-09-01', '2026-08-31')).toBe(-1);
    expect(daysBetweenKeys('2026-08-27', '2026-08-27')).toBe(0);
  });

  it('윤년 2월을 정확히 넘는다', () => {
    expect(addDaysToKey('2028-02-28', 1)).toBe('2028-02-29');
    expect(daysBetweenKeys('2028-02-28', '2028-03-01')).toBe(2);
    // 100의 배수는 평년, 400의 배수는 윤년
    expect(addDaysToKey('2100-02-28', 1)).toBe('2100-03-01');
    expect(addDaysToKey('2000-02-28', 1)).toBe('2000-02-29');
  });

  it('해를 넘겨 더하고 빼도 왕복이 맞는다', () => {
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToKey('2027-01-01', -1)).toBe('2026-12-31');
    // 1년(365일)을 더한 뒤 그만큼 되돌리면 제자리
    const forward = addDaysToKey('2026-08-27', 365);
    expect(forward).toBe('2027-08-27');
    expect(addDaysToKey(forward, -365)).toBe('2026-08-27');
  });

  it('1년치를 하루씩 밀어도 날짜가 어긋나지 않는다 (Date 안 쓰는 산술의 왕복 검증)', () => {
    let key = '2027-11-15'; // 윤년(2028) 2월을 지나가도록 잡는다
    for (let i = 0; i < 400; i++) {
      const next = addDaysToKey(key, 1);
      expect(daysBetweenKeys(key, next)).toBe(1);
      key = next;
    }
    // 2027-11-15 → 2027 잔여 46일 + 2028년(윤년) 354일 = 400일째가 2028-12-19
    expect(key).toBe('2028-12-19');
    expect(daysBetweenKeys('2027-11-15', key)).toBe(400);
  });
});

describe('isTodoOnCalendar — 달력에 그릴 것 고르기', () => {
  it('마감일이 없으면 그리지 않는다', () => {
    expect(isTodoOnCalendar(todo())).toBe(false);
  });

  it('보관함으로 내린 것은 그리지 않는다', () => {
    const t = todo({ dueDate: TODAY, archivedAt: '2026-08-20T00:00:00.000Z' });
    expect(isTodoOnCalendar(t)).toBe(false);
    // 완료도 함께 보여 달라고 해도 보관한 것은 예외 없이 빠진다
    expect(isTodoOnCalendar(t, { includeCompleted: true })).toBe(false);
  });

  it('완료한 것은 기본으로 숨기고, 옵션을 켜면 보인다', () => {
    const t = todo({ dueDate: TODAY, completed: true });
    expect(isTodoOnCalendar(t)).toBe(false);
    expect(isTodoOnCalendar(t, { includeCompleted: true })).toBe(true);
  });

  it('마감일 형식이 깨진 값은 그리지 않는다', () => {
    expect(isTodoOnCalendar(todo({ dueDate: '2026-8-1' }))).toBe(false);
    expect(isTodoOnCalendar(todo({ dueDate: '' }))).toBe(false);
  });

  it('형식은 맞지만 없는 날짜(2월 31일 등)도 그리지 않는다', () => {
    expect(isTodoOnCalendar(todo({ dueDate: '2026-02-31' }))).toBe(false);
    expect(isTodoOnCalendar(todo({ dueDate: '2026-13-01' }))).toBe(false);
    expect(isTodoOnCalendar(todo({ dueDate: '2026-04-31' }))).toBe(false);
    // 윤년 2월 29일은 있는 날짜다
    expect(isTodoOnCalendar(todo({ dueDate: '2028-02-29' }))).toBe(true);
    expect(isTodoOnCalendar(todo({ dueDate: '2026-02-29' }))).toBe(false);
  });
});

describe('toTodoCalendarChip', () => {
  it('지난 마감인데 안 끝냈으면 overdue', () => {
    const c = toTodoCalendarChip(todo({ dueDate: '2026-08-20' }), TODAY);
    expect(c.overdue).toBe(true);
  });

  it('오늘 마감은 아직 overdue 가 아니다', () => {
    const c = toTodoCalendarChip(todo({ dueDate: TODAY }), TODAY);
    expect(c.overdue).toBe(false);
  });

  it('지난 마감이라도 끝냈으면 overdue 가 아니다', () => {
    const c = toTodoCalendarChip(todo({ dueDate: '2026-08-20', completed: true }), TODAY);
    expect(c.overdue).toBe(false);
  });

  it('반복 할 일임을 표시한다', () => {
    const c = toTodoCalendarChip(
      todo({ dueDate: TODAY, recurrence: { type: 'weekly', interval: 1 } }),
      TODAY,
    );
    expect(c.isRecurring).toBe(true);
  });
});

describe('compareTodoChips — 같은 날 안의 순서', () => {
  it('안 끝낸 것이 완료한 것보다 위', () => {
    const done = chip({ todoId: 'a', completed: true, time: '08:00' });
    const open = chip({ todoId: 'b', completed: false, time: '18:00' });
    expect([done, open].sort(compareTodoChips).map((c) => c.todoId)).toEqual(['b', 'a']);
  });

  it('시각이 이른 것이 위, 시각 없는 것은 아래', () => {
    const noTime = chip({ todoId: 'a' });
    const late = chip({ todoId: 'b', time: '18:00' });
    const early = chip({ todoId: 'c', time: '08:00' });
    expect([noTime, late, early].sort(compareTodoChips).map((c) => c.todoId)).toEqual([
      'c',
      'b',
      'a',
    ]);
  });

  it('시각이 같으면 우선순위 높은 것이 위', () => {
    const low = chip({ todoId: 'a', priority: 'low' });
    const high = chip({ todoId: 'b', priority: 'high' });
    expect([low, high].sort(compareTodoChips).map((c) => c.todoId)).toEqual(['b', 'a']);
  });
});

describe('getTodoChipsByDate', () => {
  it('그 달 마감만 날짜별로 묶는다', () => {
    const todos = [
      todo({ id: 'a', dueDate: '2026-08-27' }),
      todo({ id: 'b', dueDate: '2026-08-27', time: '09:00' }),
      todo({ id: 'c', dueDate: '2026-09-01' }),
      todo({ id: 'd' }), // 마감일 없음
    ];
    const map = getTodoChipsByDate(todos, '2026-08', TODAY);

    expect([...map.keys()]).toEqual(['2026-08-27']);
    expect(map.get('2026-08-27')?.map((c) => c.todoId)).toEqual(['b', 'a']);
  });

  it('완료한 것은 기본으로 빠진다', () => {
    const todos = [
      todo({ id: 'a', dueDate: '2026-08-27', completed: true }),
      todo({ id: 'b', dueDate: '2026-08-27' }),
    ];
    expect(getTodoChipsByDate(todos, '2026-08', TODAY).get('2026-08-27')).toHaveLength(1);
    expect(
      getTodoChipsByDate(todos, '2026-08', TODAY, { includeCompleted: true }).get('2026-08-27'),
    ).toHaveLength(2);
  });

  it('할 일이 하나도 없으면 빈 Map', () => {
    expect(getTodoChipsByDate([], '2026-08', TODAY).size).toBe(0);
  });
});

describe('canMoveTodoByDrag', () => {
  it('마감일이 있으면 옮길 수 있다', () => {
    expect(canMoveTodoByDrag(todo({ dueDate: TODAY })).ok).toBe(true);
  });

  it('반복 할 일도 옮길 수 있다 — 일정과 달리 회차가 함께 밀리지 않는다', () => {
    const t = todo({ dueDate: TODAY, recurrence: { type: 'weekly', interval: 1 } });
    expect(canMoveTodoByDrag(t).ok).toBe(true);
  });

  it('마감일이 없거나 보관한 것은 이유와 함께 막는다', () => {
    const noDue = canMoveTodoByDrag(todo());
    expect(noDue.ok).toBe(false);
    expect(noDue.ok === false && noDue.reason).toContain('마감일');

    const archived = canMoveTodoByDrag(todo({ dueDate: TODAY, archivedAt: '2026-08-01' }));
    expect(archived.ok).toBe(false);
  });
});

describe('moveTodoDueDate', () => {
  it('마감일만 있으면 마감일만 바꾼다', () => {
    const moved = moveTodoDueDate(todo({ dueDate: '2026-08-27' }), '2026-08-30');
    expect(moved).toEqual({ dueDate: '2026-08-30' });
  });

  it('시작일이 있으면 기간 길이를 지킨 채 함께 민다', () => {
    const t = todo({ startDate: '2026-08-25', dueDate: '2026-08-27' });
    const moved = moveTodoDueDate(t, '2026-09-03');
    // 마감이 7일 뒤로 갔으니 시작일도 7일 뒤 — 기간(2일)은 그대로다
    expect(moved).toEqual({ dueDate: '2026-09-03', startDate: '2026-09-01' });
    expect(daysBetweenKeys(moved!.startDate!, moved!.dueDate)).toBe(2);
  });

  it('같은 날에 놓으면 아무것도 하지 않는다', () => {
    expect(moveTodoDueDate(todo({ dueDate: '2026-08-27' }), '2026-08-27')).toBeNull();
  });

  it('옮길 수 없는 할 일이면 null', () => {
    expect(moveTodoDueDate(todo(), '2026-08-30')).toBeNull();
    expect(
      moveTodoDueDate(todo({ dueDate: TODAY, archivedAt: '2026-08-01' }), '2026-08-30'),
    ).toBeNull();
  });

  it('놓은 날짜 형식이 깨졌으면 null', () => {
    expect(moveTodoDueDate(todo({ dueDate: '2026-08-27' }), '2026-8-30')).toBeNull();
  });
});
