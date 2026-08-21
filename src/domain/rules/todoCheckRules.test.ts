import { describe, it, expect } from 'vitest';
import type { Todo } from '@domain/entities/Todo';
import {
  isDateString,
  parseCheckAt,
  isCheckDue,
  nextTouchDate,
  compareByNextTouch,
} from './todoCheckRules';

const todo = (over: Partial<Todo> = {}): Todo => ({
  id: 't1',
  text: '공문 회신 확인',
  completed: false,
  createdAt: '2026-08-01T00:00:00.000Z',
  ...over,
});

const TODAY = '2026-08-21';

describe('isDateString', () => {
  it('YYYY-MM-DD 만 인정한다', () => {
    expect(isDateString('2026-08-21')).toBe(true);
    expect(isDateString('2026-8-21')).toBe(false);
    expect(isDateString('20260821')).toBe(false);
    expect(isDateString(undefined)).toBe(false);
  });
});

describe('parseCheckAt', () => {
  it('점검 날짜를 꺼낸다', () => {
    expect(parseCheckAt(todo({ checkAt: '2026-08-21' }))).toBe('2026-08-21');
  });

  it('없으면 null', () => {
    expect(parseCheckAt(todo())).toBeNull();
  });

  it('형식이 깨진 값은 없는 것으로 본다', () => {
    expect(parseCheckAt(todo({ checkAt: '내일' }))).toBeNull();
  });
});

describe('isCheckDue', () => {
  it('점검 날짜가 오늘이면 확인 대상', () => {
    expect(isCheckDue(todo({ checkAt: TODAY }), TODAY)).toBe(true);
  });

  it('지난 점검 날짜도 확인 대상 — 조용히 사라지면 안 된다', () => {
    expect(isCheckDue(todo({ checkAt: '2026-08-19' }), TODAY)).toBe(true);
  });

  it('앞으로 올 점검 날짜는 아직 아니다', () => {
    expect(isCheckDue(todo({ checkAt: '2026-08-22' }), TODAY)).toBe(false);
  });

  it('점검 날짜가 없으면 대상이 아니다', () => {
    expect(isCheckDue(todo(), TODAY)).toBe(false);
  });

  it('완료된 할 일은 대상이 아니다', () => {
    expect(isCheckDue(todo({ checkAt: TODAY, completed: true }), TODAY)).toBe(false);
  });

  it('보관된 할 일은 대상이 아니다', () => {
    expect(
      isCheckDue(todo({ checkAt: TODAY, archivedAt: '2026-08-20T00:00:00.000Z' }), TODAY),
    ).toBe(false);
  });

  it('마감일만 있고 점검 날짜가 없으면 대상이 아니다 — 둘은 다른 개념이다', () => {
    expect(isCheckDue(todo({ dueDate: TODAY }), TODAY)).toBe(false);
  });

  it('해가 바뀌어도 문자열 비교가 시간순과 일치한다', () => {
    expect(isCheckDue(todo({ checkAt: '2025-12-31' }), '2026-01-01')).toBe(true);
    expect(isCheckDue(todo({ checkAt: '2026-01-02' }), '2026-01-01')).toBe(false);
  });
});

describe('nextTouchDate', () => {
  it('점검 날짜가 마감보다 이르면 점검 날짜', () => {
    expect(nextTouchDate(todo({ checkAt: '2026-08-21', dueDate: '2026-08-28' }))).toBe(
      '2026-08-21',
    );
  });

  it('마감이 더 이르면 마감', () => {
    expect(nextTouchDate(todo({ checkAt: '2026-08-28', dueDate: '2026-08-21' }))).toBe(
      '2026-08-21',
    );
  });

  it('같으면 그 날짜', () => {
    expect(nextTouchDate(todo({ checkAt: TODAY, dueDate: TODAY }))).toBe(TODAY);
  });

  it('하나만 있으면 그것', () => {
    expect(nextTouchDate(todo({ checkAt: TODAY }))).toBe(TODAY);
    expect(nextTouchDate(todo({ dueDate: TODAY }))).toBe(TODAY);
  });

  it('둘 다 없으면 null', () => {
    expect(nextTouchDate(todo())).toBeNull();
  });

  it('깨진 값은 없는 것으로 본다', () => {
    expect(nextTouchDate(todo({ checkAt: '없음', dueDate: '2026-08-21' }))).toBe('2026-08-21');
  });
});

describe('compareByNextTouch', () => {
  it('이른 날짜가 앞으로 온다', () => {
    const list = [
      todo({ id: 'c', dueDate: '2026-08-28' }),
      todo({ id: 'a', checkAt: '2026-08-21' }),
      todo({ id: 'b', dueDate: '2026-08-25' }),
    ];
    expect([...list].sort(compareByNextTouch).map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });

  it('날짜 없는 항목은 뒤로 간다 — 언제 해도 되는 일이 맨 위를 차지하면 안 된다', () => {
    const list = [todo({ id: 'none' }), todo({ id: 'dated', checkAt: '2026-08-21' })];
    expect([...list].sort(compareByNextTouch).map((t) => t.id)).toEqual(['dated', 'none']);
  });

  it('둘 다 날짜가 없으면 순서를 바꾸지 않는다', () => {
    expect(compareByNextTouch(todo({ id: 'a' }), todo({ id: 'b' }))).toBe(0);
  });
});
