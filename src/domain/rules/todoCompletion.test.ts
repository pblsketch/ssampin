import { describe, it, expect } from 'vitest';
import type { Todo } from '@domain/entities/Todo';
import { stampTodoCompletions, completedAtFromRemote } from './todoCompletion';

const NOW = '2026-09-23T05:00:00.000Z';
const EARLIER = '2026-09-20T01:00:00.000Z';

function todo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 't1',
    text: '공문 회신',
    completed: false,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('stampTodoCompletions', () => {
  it('안 끝남 → 끝남으로 바뀌면 지금 시각을 찍는다', () => {
    const [result] = stampTodoCompletions([todo()], [todo({ completed: true })], NOW);
    expect(result?.completedAt).toBe(NOW);
  });

  it('완료를 취소하면 완료 시각을 비운다', () => {
    const [result] = stampTodoCompletions(
      [todo({ completed: true, completedAt: EARLIER })],
      [todo({ completed: false, completedAt: EARLIER })],
      NOW,
    );
    expect(result?.completedAt).toBeUndefined();
  });

  it('다시 완료하면 새 시각을 찍는다', () => {
    const [result] = stampTodoCompletions([todo()], [todo({ completed: true })], NOW);
    expect(result?.completedAt).toBe(NOW);
  });

  it('이미 끝난 일의 다른 칸을 고쳐도 처음 끝낸 시각을 지킨다', () => {
    const [result] = stampTodoCompletions(
      [todo({ completed: true, completedAt: EARLIER })],
      [todo({ completed: true, completedAt: EARLIER, text: '공문 회신(수정)' })],
      NOW,
    );
    expect(result?.completedAt).toBe(EARLIER);
  });

  it('완료 시각을 모른 채 저장해도(모바일 메모리 목록) 직전 저장본의 시각을 이어 붙인다', () => {
    const [result] = stampTodoCompletions(
      [todo({ completed: true, completedAt: EARLIER })],
      [todo({ completed: true })],
      NOW,
    );
    expect(result?.completedAt).toBe(EARLIER);
  });

  it('이 칸이 생기기 전에 끝낸 일은 지금 시각으로 지어내지 않는다', () => {
    const [result] = stampTodoCompletions(
      [todo({ completed: true })],
      [todo({ completed: true, text: '고침' })],
      NOW,
    );
    expect(result?.completedAt).toBeUndefined();
  });

  it('처음 보는 할 일이 완료 상태로 들어오면 비워 둔다', () => {
    const [result] = stampTodoCompletions([], [todo({ completed: true })], NOW);
    expect(result?.completedAt).toBeUndefined();
  });

  it('직전 저장본을 못 읽었으면(null) 새로 찍지 않는다', () => {
    const [result] = stampTodoCompletions(null, [todo({ completed: true })], NOW);
    expect(result?.completedAt).toBeUndefined();
  });

  it('들어온 완료 시각(구글 할 일)은 그대로 둔다', () => {
    const [result] = stampTodoCompletions(
      [todo()],
      [todo({ completed: true, completedAt: EARLIER })],
      NOW,
    );
    expect(result?.completedAt).toBe(EARLIER);
  });

  it('바뀐 것이 없으면 같은 배열을 돌려준다', () => {
    const next = [todo(), todo({ id: 't2', completed: true, completedAt: EARLIER })];
    expect(stampTodoCompletions(next, next, NOW)).toBe(next);
  });

  it('여러 할 일 중 바뀐 것만 찍는다', () => {
    const result = stampTodoCompletions(
      [todo({ id: 'a' }), todo({ id: 'b' })],
      [todo({ id: 'a', completed: true }), todo({ id: 'b' })],
      NOW,
    );
    expect(result.map((t) => t.completedAt)).toEqual([NOW, undefined]);
  });
});

describe('completedAtFromRemote', () => {
  it('원격이 완료가 아니면 없다', () => {
    expect(completedAtFromRemote({ status: 'needsAction', completed: EARLIER })).toBeUndefined();
  });

  it('원격이 적어 준 완료 시각을 ISO 로 맞춰 쓴다', () => {
    expect(
      completedAtFromRemote({ status: 'completed', completed: '2026-09-20T10:00:00+09:00' }),
    ).toBe(EARLIER);
  });

  it('쌤핀 쪽이 이미 끝낸 시각을 갖고 있으면 그것을 쓴다', () => {
    expect(
      completedAtFromRemote(
        { status: 'completed', completed: NOW },
        { completed: true, completedAt: EARLIER },
      ),
    ).toBe(EARLIER);
  });

  it('원격 시각이 없거나 읽을 수 없으면 없다', () => {
    expect(completedAtFromRemote({ status: 'completed' })).toBeUndefined();
    expect(completedAtFromRemote({ status: 'completed', completed: '엉뚱한 값' })).toBeUndefined();
  });
});
