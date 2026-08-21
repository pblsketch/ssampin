/**
 * 쌤핀 전용 항목만 고쳤을 때 구글 쓰기를 예약하지 않는다 — M0 완료 판정 3~5.
 *
 * ★ 단언 대상은 **저장소에 실제로 넘어간 배열**이다. 메모리 상태만 보면
 *   "화면은 통과하는데 `todos.json` 에는 'update' 가 박히는" 거짓 초록불이 된다.
 *   그러면 재시작·드라이브 리로드 뒤에 구글 쓰기가 나간다.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Todo, TodosData } from '@domain/entities/Todo';
import type { ITodoRepository } from '@domain/repositories/ITodoRepository';
import { ManageTodos } from '../ManageTodos';

const base = (over: Partial<Todo> = {}): Todo => ({
  id: 't1',
  text: '공문 회신 확인',
  completed: false,
  createdAt: '2026-08-01T00:00:00.000Z',
  ...over,
});

/** 마지막으로 저장된 데이터를 붙잡아 두는 가짜 저장소. */
function makeRepo(initial: readonly Todo[]) {
  let saved: TodosData | null = null;
  const repo: ITodoRepository = {
    getTodos: vi.fn(async () => ({ todos: initial, categories: undefined }) as TodosData),
    saveTodos: vi.fn(async (data: TodosData) => {
      saved = data;
    }),
  } as unknown as ITodoRepository;
  return {
    repo,
    savedTodo: (id: string): Todo | undefined => saved?.todos.find((t) => t.id === id),
    savedAll: (): readonly Todo[] => saved?.todos ?? [],
  };
}

describe('ManageTodos.updateTodo — 쌤핀 전용 항목', () => {
  let ctx: ReturnType<typeof makeRepo>;

  beforeEach(() => {
    ctx = makeRepo([base({ googleTaskId: 'g1', pendingRemoteOp: undefined })]);
  });

  it('점검 날짜만 고치면 구글 쓰기 예약이 그대로다 (완료 판정 3)', async () => {
    await new ManageTodos(ctx.repo).updateTodo('t1', { checkAt: '2026-08-21' });

    expect(ctx.savedTodo('t1')?.checkAt).toBe('2026-08-21');
    expect(ctx.savedTodo('t1')?.pendingRemoteOp).toBeUndefined();
  });

  it('관련인만 고쳐도 마찬가지다', async () => {
    await new ManageTodos(ctx.repo).updateTodo('t1', {
      relatedStaff: [{ staffId: 's1', nameSnapshot: '김민호' }],
    });

    expect(ctx.savedTodo('t1')?.relatedStaff).toHaveLength(1);
    expect(ctx.savedTodo('t1')?.pendingRemoteOp).toBeUndefined();
  });

  it('이미 예약이 걸려 있으면 그 값을 지우지도 않는다', async () => {
    const c = makeRepo([base({ googleTaskId: 'g1', pendingRemoteOp: 'update' })]);
    await new ManageTodos(c.repo).updateTodo('t1', { checkAt: '2026-08-21' });

    expect(c.savedTodo('t1')?.pendingRemoteOp).toBe('update');
  });

  it('구글 항목과 섞어 고치면 평소대로 예약된다 (완료 판정 4)', async () => {
    await new ManageTodos(ctx.repo).updateTodo('t1', { checkAt: '2026-08-21', text: '새 제목' });

    expect(ctx.savedTodo('t1')?.pendingRemoteOp).toBe('update');
  });

  it('구글 항목만 고치면 평소대로 예약된다', async () => {
    await new ManageTodos(ctx.repo).updateTodo('t1', { text: '새 제목' });

    expect(ctx.savedTodo('t1')?.pendingRemoteOp).toBe('update');
  });

  it('구글에 아직 없는 할 일은 create 로 예약된다', async () => {
    const c = makeRepo([base({ googleTaskId: undefined })]);
    await new ManageTodos(c.repo).updateTodo('t1', { text: '새 제목' });

    expect(c.savedTodo('t1')?.pendingRemoteOp).toBe('create');
  });

  it('쌤핀 전용 항목만 고쳐도 마지막 수정 시각은 갱신한다 — 화면 정렬에 쓰인다', async () => {
    await new ManageTodos(ctx.repo).updateTodo('t1', { checkAt: '2026-08-21' });

    expect(ctx.savedTodo('t1')?.updatedAt).toBeDefined();
  });

  it('빈 변경은 평소 경로를 탄다 — 특례로 새지 않게', async () => {
    await new ManageTodos(ctx.repo).updateTodo('t1', {});

    expect(ctx.savedTodo('t1')?.pendingRemoteOp).toBe('update');
  });
});

describe('ManageTodos — 손대지 않은 경로에 회귀가 없다 (완료 판정 5)', () => {
  it('add 는 create 로 예약된다', async () => {
    const c = makeRepo([]);
    await new ManageTodos(c.repo).add(base({ id: 'new1', text: '새 할일' }));

    const created = c.savedAll();
    expect(created).toHaveLength(1);
    expect(created[0]?.text).toBe('새 할일');
    expect(created[0]?.pendingRemoteOp).toBe('create');
  });

  it('toggleTodo 는 평소대로 예약된다', async () => {
    const c = makeRepo([base({ googleTaskId: 'g1', pendingRemoteOp: undefined })]);
    await new ManageTodos(c.repo).toggleTodo('t1');

    expect(c.savedTodo('t1')?.completed).toBe(true);
    expect(c.savedTodo('t1')?.pendingRemoteOp).toBe('update');
  });
});
