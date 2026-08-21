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

    expect(result.items).toEqual([{ title: '김민준 상담 준비', due: '2026-08-22', done: false }]);
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

    expect(result.items[0]).toEqual({ title: 'A', due: null, done: false });
  });

  it('빈 배열이면 예외 없이 빈 items를 반환한다', () => {
    const result = summarizeTodos([]);

    expect(result).toEqual({ items: [] });
  });

  it('반환 객체와 각 항목에 스키마 밖 키가 없다', () => {
    const result = summarizeTodos([{ text: 'A', dueDate: '2026-08-22', completed: false }]);

    expect(Object.keys(result).sort()).toEqual(['items'].sort());
    expect(Object.keys(result.items[0]!).sort()).toEqual(['done', 'due', 'title'].sort());
  });
});
