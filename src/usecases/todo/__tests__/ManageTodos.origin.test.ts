/**
 * 할 일의 출처 표시(ADR-136) — 쌤핀에서 만든 할 일은 구글에 올라가도 쌤핀 AI 가 볼 수 있다.
 *
 * ★ 단언 대상은 저장소에 실제로 넘어간 배열이다(메모리 상태만 보면 거짓 초록불이 된다).
 */
import { describe, it, expect, vi } from 'vitest';
import type { Todo, TodosData } from '@domain/entities/Todo';
import type { ITodoRepository } from '@domain/repositories/ITodoRepository';
import { isGoogleSourcedTodo } from '@domain/rules/googleSourcedData';
import { ManageTodos } from '../ManageTodos';

function makeRepo(initial: readonly Todo[]) {
  let saved: TodosData | null = null;
  const repo: ITodoRepository = {
    getTodos: vi.fn(async () => ({ todos: initial, categories: undefined }) as TodosData),
    saveTodos: vi.fn(async (data: TodosData) => {
      saved = data;
    }),
  } as unknown as ITodoRepository;
  return { repo, savedAll: (): readonly Todo[] => saved?.todos ?? [] };
}

const weekly = {
  type: 'weekly' as const,
  interval: 1,
};

describe('ManageTodos — 출처 표시', () => {
  it('새로 만든 할 일은 쌤핀 것으로 표시된다', async () => {
    const ctx = makeRepo([]);
    await new ManageTodos(ctx.repo).add({
      id: 'n1',
      text: '공문 회신',
      completed: false,
      createdAt: '2026-09-23T00:00:00.000Z',
    });
    const saved = ctx.savedAll()[0];
    expect(saved?.origin).toBe('ssampin');
    // 구글에 올라가 연결이 붙어도 쌤핀 AI 가 본다
    expect(isGoogleSourcedTodo({ ...saved, googleTaskId: 'g1' })).toBe(false);
  });

  it('구글에서 온 반복 할 일의 다음 회차는 구글 자료로 남는다', async () => {
    const ctx = makeRepo([
      {
        id: 'r1',
        text: '주간 보고',
        completed: false,
        createdAt: '2026-09-01T00:00:00.000Z',
        dueDate: '2026-09-23',
        recurrence: weekly,
        googleTaskId: 'g1',
        origin: 'google',
      },
    ]);
    const next = await new ManageTodos(ctx.repo).toggleTodo('r1');
    expect(next?.origin).toBe('google');
  });

  it('쌤핀에서 만든 반복 할 일의 다음 회차는 쌤핀 것이다', async () => {
    const ctx = makeRepo([
      {
        id: 'r2',
        text: '주간 보고',
        completed: false,
        createdAt: '2026-09-01T00:00:00.000Z',
        dueDate: '2026-09-23',
        recurrence: weekly,
        origin: 'ssampin',
      },
    ]);
    const next = await new ManageTodos(ctx.repo).toggleTodo('r2');
    expect(next?.origin).toBe('ssampin');
  });
});
