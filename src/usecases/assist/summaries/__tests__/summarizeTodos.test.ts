import { describe, expect, it } from 'vitest';
import { summarizeTodos } from '../summarizeTodos';
import type { TodoLike } from '../summarizeTodos';

describe('summarizeTodos', () => {
  it('기본값은 미완료 할 일만 포함하며 title을 가공 없이 보존한다', () => {
    const todos: TodoLike[] = [
      { text: '김민준 상담 준비', dueDate: '2026-08-22', completed: false },
      { text: '시험지 출제', completed: true },
    ];

    const result = summarizeTodos(todos);

    expect(result.items).toEqual([
      { title: '김민준 상담 준비', due: '2026-08-22', done: false, overdue: false },
    ]);
    expect(result.undone).toBe(1);
  });

  it('includeCompleted:true면 완료 건도 포함한다', () => {
    const todos: TodoLike[] = [
      { text: 'A', completed: false },
      { text: 'B', completed: true },
    ];

    const result = summarizeTodos(todos, { includeCompleted: true });

    expect(result.items).toHaveLength(2);
  });

  it('dueDate가 없으면 due는 null이다', () => {
    const result = summarizeTodos([{ text: 'A', completed: false }]);

    expect(result.items[0]).toEqual({ title: 'A', due: null, done: false, overdue: false });
  });

  it('빈 배열이면 예외 없이 빈 items를 반환한다', () => {
    const result = summarizeTodos([]);

    expect(result).toEqual({ items: [], undone: 0 });
  });

  it('반환 객체와 각 항목에 스키마 밖 키가 없다', () => {
    const result = summarizeTodos([{ text: 'A', dueDate: '2026-08-22', completed: false }]);

    expect(Object.keys(result).sort()).toEqual(['items', 'undone'].sort());
    expect(Object.keys(result.items[0]!).sort()).toEqual(
      ['done', 'due', 'overdue', 'title'].sort(),
    );
  });

  it('today를 주면 기한이 앞인 미완료 건에 overdue가 붙는다', () => {
    // 실제 신고 상황: 오늘이 8/23인데 8/19 기한을 "남아 있다"고 답했다.
    const todos: TodoLike[] = [
      { text: '밀린 일', dueDate: '2026-08-19', completed: false },
      { text: '오늘까지', dueDate: '2026-08-23', completed: false },
      { text: '기한 없음', completed: false },
    ];

    const result = summarizeTodos(todos, { today: '2026-08-23' });

    expect(result.items.map((t) => t.overdue)).toEqual([true, false, false]);
  });

  it('today가 없으면 overdue를 판단하지 않는다 (전부 false)', () => {
    const result = summarizeTodos([{ text: 'A', dueDate: '2000-01-01', completed: false }]);

    expect(result.items[0]?.overdue).toBe(false);
  });
});
