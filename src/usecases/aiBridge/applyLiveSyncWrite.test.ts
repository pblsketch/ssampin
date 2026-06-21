import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyLiveSyncWrite, type LiveSyncWriteDeps } from './applyLiveSyncWrite';

let deps: LiveSyncWriteDeps;
let calls: { fn: string; args: unknown[] }[];

beforeEach(() => {
  calls = [];
  const rec =
    (fn: string) =>
    (...args: unknown[]) => {
      calls.push({ fn, args });
      return Promise.resolve();
    };
  deps = {
    todos: {
      add: rec('todos.add') as LiveSyncWriteDeps['todos']['add'],
      update: rec('todos.update') as LiveSyncWriteDeps['todos']['update'],
      delete: rec('todos.delete') as LiveSyncWriteDeps['todos']['delete'],
      exists: vi.fn((id: string) => id === 'todo-1'),
    },
    events: {
      add: rec('events.add') as LiveSyncWriteDeps['events']['add'],
      update: rec('events.update') as LiveSyncWriteDeps['events']['update'],
      delete: rec('events.delete') as LiveSyncWriteDeps['events']['delete'],
      exists: vi.fn((id: string) => id === 'ev-1'),
    },
    recordDrafts: {
      upsert: rec('recordDrafts.upsert') as LiveSyncWriteDeps['recordDrafts']['upsert'],
    },
  };
});

describe('applyLiveSyncWrite — todos', () => {
  it('create → todos.add(text, opts), ok+ref(멱등키)', async () => {
    const r = await applyLiveSyncWrite(
      {
        domain: 'todos',
        op: 'create',
        idempotencyKey: 'k1',
        data: { text: '시험지 인쇄', dueDate: '2026-06-25', priority: 'high' },
      },
      deps,
    );
    expect(r).toEqual({ ok: true, ref: 'k1' });
    expect(calls[0]).toEqual({
      fn: 'todos.add',
      args: ['시험지 인쇄', { dueDate: '2026-06-25', priority: 'high' }],
    });
  });

  it('create without text → 400, 액션 미호출', async () => {
    const r = await applyLiveSyncWrite(
      { domain: 'todos', op: 'create', idempotencyKey: 'k', data: {} },
      deps,
    );
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(calls).toHaveLength(0);
  });

  it('complete → update(id,{completed,status}), 없는 id → 404', async () => {
    const r = await applyLiveSyncWrite(
      { domain: 'todos', op: 'complete', idempotencyKey: 'k', data: { id: 'todo-1' } },
      deps,
    );
    expect(r.ok).toBe(true);
    expect(calls[0]).toEqual({
      fn: 'todos.update',
      args: ['todo-1', { completed: true, status: 'done' }],
    });
    const miss = await applyLiveSyncWrite(
      { domain: 'todos', op: 'complete', idempotencyKey: 'k', data: { id: 'nope' } },
      deps,
    );
    expect(miss).toMatchObject({ ok: false, status: 404 });
  });

  it('delete → todos.delete(id)', async () => {
    const r = await applyLiveSyncWrite(
      { domain: 'todos', op: 'delete', idempotencyKey: 'k', data: { id: 'todo-1' } },
      deps,
    );
    expect(r.ok).toBe(true);
    expect(calls[0]).toEqual({ fn: 'todos.delete', args: ['todo-1'] });
  });

  it('update → 안전 필드만 통과', async () => {
    const r = await applyLiveSyncWrite(
      {
        domain: 'todos',
        op: 'update',
        idempotencyKey: 'k',
        data: { id: 'todo-1', priority: 'low', evil: 'x', text: '수정됨' },
      },
      deps,
    );
    expect(r.ok).toBe(true);
    expect(calls[0]?.args[1]).toEqual({ priority: 'low', text: '수정됨' }); // 'evil' 제외
  });
});

describe('applyLiveSyncWrite — events', () => {
  it('create → events.add({title,date})', async () => {
    const r = await applyLiveSyncWrite(
      {
        domain: 'events',
        op: 'create',
        idempotencyKey: 'k',
        data: { title: '체육대회', date: '2026-06-25' },
      },
      deps,
    );
    expect(r.ok).toBe(true);
    expect(calls[0]).toEqual({
      fn: 'events.add',
      args: [{ title: '체육대회', date: '2026-06-25' }],
    });
  });
  it('create without date → 400', async () => {
    expect(
      (
        await applyLiveSyncWrite(
          { domain: 'events', op: 'create', idempotencyKey: 'k', data: { title: 'x' } },
          deps,
        )
      ).status,
    ).toBe(400);
  });
  it('delete → events.delete, complete → 400(미지원)', async () => {
    expect(
      (
        await applyLiveSyncWrite(
          { domain: 'events', op: 'delete', idempotencyKey: 'k', data: { id: 'ev-1' } },
          deps,
        )
      ).ok,
    ).toBe(true);
    expect(
      (
        await applyLiveSyncWrite(
          { domain: 'events', op: 'complete', idempotencyKey: 'k', data: { id: 'ev-1' } },
          deps,
        )
      ).ok,
    ).toBe(false);
  });
});

describe('applyLiveSyncWrite — recordDrafts', () => {
  it('create → recordDrafts.upsert(안전 필드), ok+ref(멱등키)', async () => {
    const r = await applyLiveSyncWrite(
      {
        domain: 'recordDrafts',
        op: 'create',
        idempotencyKey: 'rd1',
        data: {
          area: 'career',
          studentRef: 's1',
          studentId: 's1',
          content: '진로 탐색 활동에 적극 참여함',
          byteLength: 36,
          basisObservationIds: ['o1', 'o2'],
          groundingFlags: ['low_overlap'],
          status: 'reviewing',
          requiresTeacherReview: true,
        },
      },
      deps,
    );
    expect(r).toEqual({ ok: true, ref: 'rd1' });
    expect(calls[0]).toMatchObject({
      fn: 'recordDrafts.upsert',
      args: [
        {
          area: 'career',
          studentRef: 's1',
          studentId: 's1',
          content: '진로 탐색 활동에 적극 참여함',
          basisObservationIds: ['o1', 'o2'],
          groundingFlags: ['low_overlap'],
          status: 'reviewing',
        },
      ],
    });
  });

  it('teaching: classId+studentKey+subject 전달', async () => {
    await applyLiveSyncWrite(
      {
        domain: 'recordDrafts',
        op: 'create',
        idempotencyKey: 'rd2',
        data: {
          area: 'subject',
          studentRef: 'tc:c1:5',
          classId: 'c1',
          studentKey: '5',
          subject: '통합사회',
          content: '수업 활동에서 통찰을 보임',
        },
      },
      deps,
    );
    expect(calls[0]?.args[0]).toMatchObject({
      area: 'subject',
      studentRef: 'tc:c1:5',
      classId: 'c1',
      studentKey: '5',
      subject: '통합사회',
    });
  });

  it('잘못된 area / studentRef·content 누락 → 400, 액션 미호출', async () => {
    expect(
      (
        await applyLiveSyncWrite(
          {
            domain: 'recordDrafts',
            op: 'create',
            idempotencyKey: 'k',
            data: { area: 'bogus', studentRef: 's', content: 'x' },
          },
          deps,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await applyLiveSyncWrite(
          {
            domain: 'recordDrafts',
            op: 'create',
            idempotencyKey: 'k',
            data: { area: 'career', content: 'x' },
          },
          deps,
        )
      ).status,
    ).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('update/delete 는 미지원(400)', async () => {
    expect(
      (
        await applyLiveSyncWrite(
          {
            domain: 'recordDrafts',
            op: 'update',
            idempotencyKey: 'k',
            data: { area: 'career', studentRef: 's', content: 'x' },
          },
          deps,
        )
      ).status,
    ).toBe(400);
  });
});

describe('applyLiveSyncWrite — 방어', () => {
  it('store 액션이 throw 하면 500', async () => {
    const throwingDeps: LiveSyncWriteDeps = {
      ...deps,
      todos: { ...deps.todos, add: () => Promise.reject(new Error('boom')) },
    };
    const r = await applyLiveSyncWrite(
      { domain: 'todos', op: 'create', idempotencyKey: 'k', data: { text: 'x' } },
      throwingDeps,
    );
    expect(r).toMatchObject({ ok: false, status: 500 });
  });
});
