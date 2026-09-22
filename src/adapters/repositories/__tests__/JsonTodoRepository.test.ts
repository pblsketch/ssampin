/**
 * 할 일 완료 시각은 저장소가 찍는다 — 완료하는 길(화면·모바일·구글 할 일·AI 연결)이
 * 여럿이라 길마다 챙기게 두면 한 곳은 빠진다. 여기서는 실제 쓰는 길 두 가지로 확인한다.
 * - 데스크톱: `ManageTodos` 가 저장소를 읽고 고쳐 저장한다.
 * - 모바일: 메모리에 든 목록을 통째로 저장한다(저장소가 찍은 시각을 모른다).
 */
import { describe, expect, it } from 'vitest';
import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { Todo, TodosData } from '@domain/entities/Todo';
import { ManageTodos } from '@usecases/todo/ManageTodos';
import { JsonTodoRepository } from '../JsonTodoRepository';

const T1 = '2026-09-23T05:00:00.000Z';
const T2 = '2026-09-24T05:00:00.000Z';

/** 메모리 fake storage. 실제 저장처럼 JSON 으로 오가서 undefined 칸은 사라진다. */
function createFakeStorage(initial?: TodosData, failRead = false): IStoragePort {
  const store = new Map<string, string>();
  if (initial) store.set('todos', JSON.stringify(initial));
  return {
    async read<T>(filename: string): Promise<T | null> {
      if (failRead) throw new Error('읽기 실패');
      const v = store.get(filename);
      return v === undefined ? null : (JSON.parse(v) as T);
    },
    async write<T>(filename: string, data: T): Promise<void> {
      store.set(filename, JSON.stringify(data));
    },
    async remove(filename: string): Promise<void> {
      store.delete(filename);
    },
    async readBinary(): Promise<Uint8Array | null> {
      throw new Error('not used');
    },
    async writeBinary(): Promise<void> {
      throw new Error('not used');
    },
    async removeBinary(): Promise<void> {
      throw new Error('not used');
    },
    async listBinary(): Promise<readonly string[]> {
      throw new Error('not used');
    },
  };
}

function todo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 't1',
    text: '공문 회신',
    completed: false,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function clock(...times: string[]): () => string {
  let i = 0;
  return () => times[Math.min(i++, times.length - 1)] as string;
}

async function stored(storage: IStoragePort, id = 't1'): Promise<Todo | undefined> {
  return (await storage.read<TodosData>('todos'))?.todos.find((t) => t.id === id);
}

describe('JsonTodoRepository 완료 시각', () => {
  it('데스크톱에서 완료하면 저장할 때 시각이 찍히고, 완료를 취소하면 지워진다', async () => {
    const storage = createFakeStorage({ todos: [todo()] });
    const manage = new ManageTodos(new JsonTodoRepository(storage, clock(T1, T2)));

    await manage.toggleTodo('t1');
    expect(await stored(storage)).toMatchObject({ completed: true, completedAt: T1 });

    await manage.toggleTodo('t1');
    const undone = await stored(storage);
    expect(undone?.completed).toBe(false);
    expect(undone?.completedAt).toBeUndefined();
  });

  it('반복 할 일은 끝낸 쪽에만 찍히고 새로 생긴 다음 차례는 비어 있다', async () => {
    const storage = createFakeStorage({
      todos: [todo({ dueDate: '2026-09-23', recurrence: { type: 'weekly', interval: 1 } })],
    });
    const manage = new ManageTodos(new JsonTodoRepository(storage, clock(T1)));

    const next = await manage.toggleTodo('t1');
    expect(await stored(storage)).toMatchObject({ completed: true, completedAt: T1 });
    expect(next).not.toBeNull();
    expect((await stored(storage, next?.id))?.completedAt).toBeUndefined();
  });

  it('모바일처럼 시각을 모르는 목록을 통째로 저장해도 처음 끝낸 시각을 지킨다', async () => {
    const storage = createFakeStorage({ todos: [todo()] });
    const repository = new JsonTodoRepository(storage, clock(T1, T2));

    const inMemory = [todo({ completed: true })];
    await repository.saveTodos({ todos: inMemory });
    await repository.saveTodos({ todos: [{ ...inMemory[0]!, text: '공문 회신(고침)' }] });

    expect(await stored(storage)).toMatchObject({ text: '공문 회신(고침)', completedAt: T1 });
  });

  it('이 칸이 생기기 전에 끝낸 일은 다른 칸을 고쳐도 지금 시각을 받지 않는다', async () => {
    const storage = createFakeStorage({ todos: [todo({ completed: true })] });
    const manage = new ManageTodos(new JsonTodoRepository(storage, clock(T1)));

    await manage.updateTodo('t1', { text: '고침' });
    expect((await stored(storage))?.completedAt).toBeUndefined();
  });

  it('직전 저장본을 못 읽어도 저장은 된다', async () => {
    const storage = createFakeStorage(undefined, true);
    const repository = new JsonTodoRepository(storage, clock(T1));

    await expect(
      repository.saveTodos({ todos: [todo({ completed: true })] }),
    ).resolves.toBeUndefined();
  });
});
