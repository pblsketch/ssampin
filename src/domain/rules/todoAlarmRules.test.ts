import { describe, it, expect } from 'vitest';
import type { Todo } from '@domain/entities/Todo';
import type { TodoSettings } from '@domain/entities/TodoSettings';
import { DEFAULT_TODO_SETTINGS } from '@domain/entities/TodoSettings';
import {
  buildTodoAlarmSchedule,
  DEFAULT_ALARM_GRACE_MS,
  TODO_ALARM_TITLE,
} from '@domain/rules/todoAlarmRules';

/**
 * 할 일 알람 규칙 — 무엇을 언제 울릴지.
 *
 * 시간대는 전부 KST(+540)로 못 박는다. 이 규칙은 시계를 직접 읽지 않으므로 CI(UTC)에서도
 * 같은 결과가 나온다 — 그게 이 설계의 목적이다.
 */

const KST = 540;
/** 2026-08-22 09:00 KST */
const NOW = Date.UTC(2026, 7, 22, 0, 0) as number;

const at = (dateStr: string, timeStr: string): number => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  return Date.UTC(y!, m! - 1, d!, hh!, mm!) - KST * 60_000;
};

const todo = (over: Partial<Todo> = {}): Todo => ({
  id: 't1',
  text: '김민호 학부모 상담 회신',
  completed: false,
  createdAt: '2026-08-01T00:00:00.000Z',
  ...over,
});

const settings = (over: Partial<TodoSettings> = {}): TodoSettings => ({
  ...DEFAULT_TODO_SETTINGS,
  ...over,
});

describe('buildTodoAlarmSchedule — 무엇이 후보가 되는가', () => {
  it('마감일이 있으면 그 날 예약된다', () => {
    const items = buildTodoAlarmSchedule([todo({ dueDate: '2026-08-25' })], settings(), NOW, KST);
    expect(items).toHaveLength(1);
    expect(items[0]!.fireAt).toBe(at('2026-08-25', '09:00'));
  });

  it('점검 날짜(다시 확인할 날)도 따로 예약된다', () => {
    const items = buildTodoAlarmSchedule(
      [todo({ dueDate: '2026-08-25', checkAt: '2026-08-27' })],
      settings(),
      NOW,
      KST,
    );
    expect(items.map((i) => i.fireAt)).toEqual([
      at('2026-08-25', '09:00'),
      at('2026-08-27', '09:00'),
    ]);
  });

  it('마감일과 점검 날짜가 같으면 한 번만 울린다', () => {
    const items = buildTodoAlarmSchedule(
      [todo({ dueDate: '2026-08-25', checkAt: '2026-08-25' })],
      settings(),
      NOW,
      KST,
    );
    expect(items).toHaveLength(1);
  });

  it('시각을 적었으면 그 시각, 없으면 기본 시각을 쓴다', () => {
    const withTime = buildTodoAlarmSchedule(
      [todo({ dueDate: '2026-08-25', time: '14:30' })],
      settings(),
      NOW,
      KST,
    );
    expect(withTime[0]!.fireAt).toBe(at('2026-08-25', '14:30'));

    const custom = buildTodoAlarmSchedule(
      [todo({ dueDate: '2026-08-25' })],
      settings({ alarmDefaultTime: '17:00' }),
      NOW,
      KST,
    );
    expect(custom[0]!.fireAt).toBe(at('2026-08-25', '17:00'));
  });

  it('완료·보관된 일과 날짜 없는 일은 울리지 않는다', () => {
    const items = buildTodoAlarmSchedule(
      [
        todo({ id: 'a', dueDate: '2026-08-25', completed: true }),
        todo({ id: 'b', dueDate: '2026-08-25', archivedAt: '2026-08-21T00:00:00.000Z' }),
        todo({ id: 'c' }),
      ],
      settings(),
      NOW,
      KST,
    );
    expect(items).toEqual([]);
  });

  it('이미 지난 시각은 예약하지 않는다', () => {
    const items = buildTodoAlarmSchedule([todo({ dueDate: '2026-08-20' })], settings(), NOW, KST);
    expect(items).toEqual([]);
  });

  it('날짜 형식이 어긋나면 조용히 건너뛴다', () => {
    const items = buildTodoAlarmSchedule(
      [todo({ dueDate: '2026-13-45' }), todo({ id: 't2', dueDate: '2026-08-25' })],
      settings(),
      NOW,
      KST,
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.reminderId).toContain('t2');
  });
});

describe('미리 알림 · 유예 창', () => {
  it('미리 알림 분만큼 앞당겨 울린다', () => {
    const items = buildTodoAlarmSchedule(
      [todo({ dueDate: '2026-08-25', time: '14:00' })],
      settings({ alarmLeadMinutes: 30 }),
      NOW,
      KST,
    );
    expect(items[0]!.fireAt).toBe(at('2026-08-25', '13:30'));
  });

  it('expiresAt 은 fireAt + 유예 창이다', () => {
    const items = buildTodoAlarmSchedule([todo({ dueDate: '2026-08-25' })], settings(), NOW, KST);
    expect(items[0]!.expiresAt).toBe(items[0]!.fireAt + DEFAULT_ALARM_GRACE_MS);

    const custom = buildTodoAlarmSchedule(
      [todo({ dueDate: '2026-08-25' })],
      settings(),
      NOW,
      KST,
      60_000,
    );
    expect(custom[0]!.expiresAt).toBe(custom[0]!.fireAt + 60_000);
  });
});

describe('예약 지평 — 1년치를 매번 보내지 않는다', () => {
  it('기본 14일 밖의 할 일은 배열에 들어가지 않는다', () => {
    const items = buildTodoAlarmSchedule(
      [todo({ id: 'near', dueDate: '2026-09-04' }), todo({ id: 'far', dueDate: '2026-09-06' })],
      settings(),
      NOW,
      KST,
    );
    expect(items.map((i) => i.reminderId.split(':')[1])).toEqual(['near']);
  });

  it('지평을 늘리면 멀리 있는 것도 들어온다', () => {
    const items = buildTodoAlarmSchedule(
      [todo({ id: 'far', dueDate: '2026-09-06' })],
      settings({ alarmHorizonDays: 30 }),
      NOW,
      KST,
    );
    expect(items).toHaveLength(1);
  });
});

describe('하루 상한 — 울리는 날짜별로 센다', () => {
  it('이틀 × 각 10건 → 각 날 8건씩, 합계 16건', () => {
    const todos: Todo[] = [];
    for (let i = 0; i < 10; i++) {
      todos.push(todo({ id: `a${i}`, dueDate: '2026-08-25', time: `1${i % 10}:00` }));
      todos.push(todo({ id: `b${i}`, dueDate: '2026-08-26', time: `1${i % 10}:00` }));
    }
    const items = buildTodoAlarmSchedule(todos, settings(), NOW, KST);
    expect(items).toHaveLength(16);

    const day25 = items.filter((i) => i.studentDedupKey.endsWith('2026-08-25'));
    const day26 = items.filter((i) => i.studentDedupKey.endsWith('2026-08-26'));
    expect(day25).toHaveLength(8);
    expect(day26).toHaveLength(8);
  });

  it('자정 직전·직후는 서로 다른 날로 센다 (현지 시간대 기준)', () => {
    const items = buildTodoAlarmSchedule(
      [
        todo({ id: 'late', dueDate: '2026-08-25', time: '23:30' }),
        todo({ id: 'early', dueDate: '2026-08-26', time: '00:30' }),
      ],
      settings({ alarmDailyCap: 1 }),
      NOW,
      KST,
    );
    // 상한이 1이어도 서로 다른 날이므로 둘 다 살아남는다.
    expect(items).toHaveLength(2);
  });

  it('같은 시각이면 급한 것부터 남는다', () => {
    const items = buildTodoAlarmSchedule(
      [
        todo({ id: 'z', dueDate: '2026-08-25', priority: 'low' }),
        todo({ id: 'a', dueDate: '2026-08-25', priority: 'high' }),
      ],
      settings({ alarmDailyCap: 1 }),
      NOW,
      KST,
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.reminderId).toContain(':a:');
  });
});

describe('알림 문구 — 기본은 옆 사람이 못 읽는다', () => {
  it('기본값이면 할 일 내용이 문구에 들어가지 않는다', () => {
    const items = buildTodoAlarmSchedule([todo({ dueDate: '2026-08-25' })], settings(), NOW, KST);
    expect(items[0]!.title).toBe(TODO_ALARM_TITLE);
    expect(items[0]!.body).toBe('확인할 일이 1건 있습니다');
    expect(items[0]!.body).not.toContain('김민호');
  });

  it("'full' 로 켜야 내용이 보인다. 제목은 그래도 고정이다", () => {
    const items = buildTodoAlarmSchedule(
      [todo({ dueDate: '2026-08-25' })],
      settings({ alarmTextExposure: 'full' }),
      NOW,
      KST,
    );
    expect(items[0]!.body).toBe('김민호 학부모 상담 회신');
    expect(items[0]!.title).toBe(TODO_ALARM_TITLE);
  });
});

describe('식별자 규약 — main 이 정본을 되찾을 수 있어야 한다', () => {
  it('reminderId 는 todo:<할일id>:<발화시각ms> 다', () => {
    const items = buildTodoAlarmSchedule(
      [todo({ id: 'abc', dueDate: '2026-08-25' })],
      settings(),
      NOW,
      KST,
    );
    const parts = items[0]!.reminderId.split(':');
    expect(parts[0]).toBe('todo');
    expect(parts[1]).toBe('abc');
    expect(Number(parts[2])).toBe(items[0]!.fireAt);
  });

  it('중복 방지 키는 "그 날 그 할 일" 단위다', () => {
    const items = buildTodoAlarmSchedule(
      [todo({ id: 'abc', dueDate: '2026-08-25', checkAt: '2026-08-27' })],
      settings(),
      NOW,
      KST,
    );
    expect(items.map((i) => i.studentDedupKey)).toEqual([
      'todo:abc:2026-08-25',
      'todo:abc:2026-08-27',
    ]);
  });
});
