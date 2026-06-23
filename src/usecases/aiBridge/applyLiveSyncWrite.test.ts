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
    memos: {
      add: rec('memos.add') as LiveSyncWriteDeps['memos']['add'],
      update: rec('memos.update') as LiveSyncWriteDeps['memos']['update'],
      delete: rec('memos.delete') as LiveSyncWriteDeps['memos']['delete'],
      exists: vi.fn((id: string) => id === 'memo-1'),
    },
    bookmarks: {
      addBookmark: rec('bookmarks.addBookmark') as LiveSyncWriteDeps['bookmarks']['addBookmark'],
      addGroup: rec('bookmarks.addGroup') as LiveSyncWriteDeps['bookmarks']['addGroup'],
      update: rec('bookmarks.update') as LiveSyncWriteDeps['bookmarks']['update'],
      delete: rec('bookmarks.delete') as LiveSyncWriteDeps['bookmarks']['delete'],
      exists: vi.fn((id: string) => id === 'bm-1'),
      groupExists: vi.fn((id: string) => id === 'g-1'),
    },
    notes: {
      createNotebook: rec('notes.createNotebook') as LiveSyncWriteDeps['notes']['createNotebook'],
      createSection: rec('notes.createSection') as LiveSyncWriteDeps['notes']['createSection'],
      createPage: rec('notes.createPage') as LiveSyncWriteDeps['notes']['createPage'],
      updatePage: rec('notes.updatePage') as LiveSyncWriteDeps['notes']['updatePage'],
      deletePage: rec('notes.deletePage') as LiveSyncWriteDeps['notes']['deletePage'],
      notebookExists: vi.fn((id: string) => id === 'nb-1'),
      sectionExists: vi.fn((id: string) => id === 'sec-1'),
      pageExists: vi.fn((id: string) => id === 'pg-1'),
    },
    attendance: {
      save: rec('attendance.save') as LiveSyncWriteDeps['attendance']['save'],
    },
    homeroomAttendance: {
      regularPeriodCount: 7,
      save: rec('homeroomAttendance.save') as LiveSyncWriteDeps['homeroomAttendance']['save'],
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

describe('applyLiveSyncWrite — memos', () => {
  it('create → memos.add(content, color), ok+ref(멱등키)', async () => {
    const r = await applyLiveSyncWrite(
      {
        domain: 'memos',
        op: 'create',
        idempotencyKey: 'm1',
        data: { content: '교무회의 자료', color: 'green' },
      },
      deps,
    );
    expect(r).toEqual({ ok: true, ref: 'm1' });
    expect(calls[0]).toEqual({ fn: 'memos.add', args: ['교무회의 자료', 'green'] });
  });

  it('create without content → 400, 액션 미호출', async () => {
    const r = await applyLiveSyncWrite(
      { domain: 'memos', op: 'create', idempotencyKey: 'k', data: {} },
      deps,
    );
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(calls).toHaveLength(0);
  });

  it('update → memos.update(id, 변경분만), 없는 id → 404', async () => {
    const r = await applyLiveSyncWrite(
      {
        domain: 'memos',
        op: 'update',
        idempotencyKey: 'k',
        data: { id: 'memo-1', content: '수정', archived: true },
      },
      deps,
    );
    expect(r.ok).toBe(true);
    expect(calls[0]).toEqual({
      fn: 'memos.update',
      args: ['memo-1', { content: '수정', archived: true }],
    });
    const miss = await applyLiveSyncWrite(
      { domain: 'memos', op: 'update', idempotencyKey: 'k', data: { id: 'nope', content: 'x' } },
      deps,
    );
    expect(miss).toMatchObject({ ok: false, status: 404 });
  });

  it('delete → memos.delete(id)', async () => {
    const r = await applyLiveSyncWrite(
      { domain: 'memos', op: 'delete', idempotencyKey: 'k', data: { id: 'memo-1' } },
      deps,
    );
    expect(r.ok).toBe(true);
    expect(calls[0]).toEqual({ fn: 'memos.delete', args: ['memo-1'] });
  });

  it('complete → 400(미지원)', async () => {
    const r = await applyLiveSyncWrite(
      { domain: 'memos', op: 'complete', idempotencyKey: 'k', data: { id: 'memo-1' } },
      deps,
    );
    expect(r.ok).toBe(false);
  });

  it('update without changes → 400', async () => {
    const r = await applyLiveSyncWrite(
      { domain: 'memos', op: 'update', idempotencyKey: 'k', data: { id: 'memo-1' } },
      deps,
    );
    expect(r).toMatchObject({ ok: false, status: 400 });
  });
});

describe('applyLiveSyncWrite — bookmarks', () => {
  it('create kind=group → addGroup({name,emoji})', async () => {
    const r = await applyLiveSyncWrite(
      {
        domain: 'bookmarks',
        op: 'create',
        idempotencyKey: 'b1',
        data: { kind: 'group', name: '수업도구', emoji: '🛠️' },
      },
      deps,
    );
    expect(r).toEqual({ ok: true, ref: 'b1' });
    expect(calls[0]).toEqual({
      fn: 'bookmarks.addGroup',
      args: [{ name: '수업도구', emoji: '🛠️' }],
    });
  });

  it('create kind=bookmark → 그룹 존재 시 addBookmark', async () => {
    const r = await applyLiveSyncWrite(
      {
        domain: 'bookmarks',
        op: 'create',
        idempotencyKey: 'b2',
        data: { kind: 'bookmark', name: 'EBS', url: 'https://ebs.co.kr', groupId: 'g-1' },
      },
      deps,
    );
    expect(r.ok).toBe(true);
    expect(calls[0]).toEqual({
      fn: 'bookmarks.addBookmark',
      args: [{ name: 'EBS', url: 'https://ebs.co.kr', groupId: 'g-1' }],
    });
  });

  it('create kind=bookmark: 없는 그룹 → 404', async () => {
    const r = await applyLiveSyncWrite(
      {
        domain: 'bookmarks',
        op: 'create',
        idempotencyKey: 'k',
        data: { kind: 'bookmark', name: 'x', url: 'https://x.com', groupId: 'nope' },
      },
      deps,
    );
    expect(r).toMatchObject({ ok: false, status: 404 });
    expect(calls).toHaveLength(0);
  });

  it('create: kind 누락 → 400', async () => {
    const r = await applyLiveSyncWrite(
      {
        domain: 'bookmarks',
        op: 'create',
        idempotencyKey: 'k',
        data: { name: 'x', url: 'https://x.com', groupId: 'g-1' },
      },
      deps,
    );
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it('update → bookmarks.update(id, {name,url}), 없는 id → 404', async () => {
    const r = await applyLiveSyncWrite(
      {
        domain: 'bookmarks',
        op: 'update',
        idempotencyKey: 'k',
        data: { id: 'bm-1', name: '새이름' },
      },
      deps,
    );
    expect(r.ok).toBe(true);
    expect(calls[0]).toEqual({ fn: 'bookmarks.update', args: ['bm-1', { name: '새이름' }] });
    const miss = await applyLiveSyncWrite(
      { domain: 'bookmarks', op: 'update', idempotencyKey: 'k', data: { id: 'nope', name: 'x' } },
      deps,
    );
    expect(miss).toMatchObject({ ok: false, status: 404 });
  });

  it('delete → bookmarks.delete(id)', async () => {
    const r = await applyLiveSyncWrite(
      { domain: 'bookmarks', op: 'delete', idempotencyKey: 'k', data: { id: 'bm-1' } },
      deps,
    );
    expect(r.ok).toBe(true);
    expect(calls[0]).toEqual({ fn: 'bookmarks.delete', args: ['bm-1'] });
  });

  it('complete → 400(미지원)', async () => {
    const r = await applyLiveSyncWrite(
      { domain: 'bookmarks', op: 'complete', idempotencyKey: 'k', data: { id: 'bm-1' } },
      deps,
    );
    expect(r.ok).toBe(false);
  });
});

describe('applyLiveSyncWrite — notes', () => {
  it('create kind=notebook → createNotebook(title)', async () => {
    const r = await applyLiveSyncWrite(
      {
        domain: 'notes',
        op: 'create',
        idempotencyKey: 'n1',
        data: { kind: 'notebook', title: '상담일지' },
      },
      deps,
    );
    expect(r).toEqual({ ok: true, ref: 'n1' });
    expect(calls[0]).toEqual({ fn: 'notes.createNotebook', args: ['상담일지'] });
  });

  it('create kind=section → 노트북 존재 시 createSection(notebookId,title)', async () => {
    const r = await applyLiveSyncWrite(
      {
        domain: 'notes',
        op: 'create',
        idempotencyKey: 'k',
        data: { kind: 'section', notebookId: 'nb-1', title: '6월' },
      },
      deps,
    );
    expect(r.ok).toBe(true);
    expect(calls[0]).toEqual({ fn: 'notes.createSection', args: ['nb-1', '6월'] });
  });

  it('create kind=section: 없는 노트북 → 404', async () => {
    const r = await applyLiveSyncWrite(
      {
        domain: 'notes',
        op: 'create',
        idempotencyKey: 'k',
        data: { kind: 'section', notebookId: 'nope', title: 'x' },
      },
      deps,
    );
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it('create kind=page → 섹션 존재 시 createPage(sectionId,title,bodyText)', async () => {
    const r = await applyLiveSyncWrite(
      {
        domain: 'notes',
        op: 'create',
        idempotencyKey: 'k',
        data: { kind: 'page', sectionId: 'sec-1', title: '오늘', body: '상담 내용' },
      },
      deps,
    );
    expect(r.ok).toBe(true);
    expect(calls[0]).toEqual({ fn: 'notes.createPage', args: ['sec-1', '오늘', '상담 내용'] });
  });

  it('create kind=page: 없는 섹션 → 404', async () => {
    const r = await applyLiveSyncWrite(
      {
        domain: 'notes',
        op: 'create',
        idempotencyKey: 'k',
        data: { kind: 'page', sectionId: 'nope', title: 'x' },
      },
      deps,
    );
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it('update → updatePage(id, 변경분), 없는 페이지 → 404', async () => {
    const r = await applyLiveSyncWrite(
      {
        domain: 'notes',
        op: 'update',
        idempotencyKey: 'k',
        data: { id: 'pg-1', title: '제목변경', pinned: true },
      },
      deps,
    );
    expect(r.ok).toBe(true);
    expect(calls[0]).toEqual({
      fn: 'notes.updatePage',
      args: ['pg-1', { title: '제목변경', pinned: true }],
    });
    const miss = await applyLiveSyncWrite(
      { domain: 'notes', op: 'update', idempotencyKey: 'k', data: { id: 'nope', title: 'x' } },
      deps,
    );
    expect(miss).toMatchObject({ ok: false, status: 404 });
  });

  it('update: body 빈 문자열도 변경으로 인정(본문 비우기)', async () => {
    const r = await applyLiveSyncWrite(
      { domain: 'notes', op: 'update', idempotencyKey: 'k', data: { id: 'pg-1', body: '' } },
      deps,
    );
    expect(r.ok).toBe(true);
    expect(calls[0]).toEqual({ fn: 'notes.updatePage', args: ['pg-1', { bodyText: '' }] });
  });

  it('delete → deletePage(id)', async () => {
    const r = await applyLiveSyncWrite(
      { domain: 'notes', op: 'delete', idempotencyKey: 'k', data: { id: 'pg-1' } },
      deps,
    );
    expect(r.ok).toBe(true);
    expect(calls[0]).toEqual({ fn: 'notes.deletePage', args: ['pg-1'] });
  });

  it('complete → 400(미지원)', async () => {
    const r = await applyLiveSyncWrite(
      { domain: 'notes', op: 'complete', idempotencyKey: 'k', data: { id: 'pg-1' } },
      deps,
    );
    expect(r.ok).toBe(false);
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

describe('applyLiveSyncWrite — 멱등 가드(#2/#7)', () => {
  function memIdem(): NonNullable<LiveSyncWriteDeps['idempotency']> {
    const committed = new Set<string>();
    const live = new Set<string>();
    const ck = (k: string, f: string): string => `${k}:${f}`;
    return {
      reserve: (k, f) =>
        committed.has(ck(k, f)) || live.has(ck(k, f))
          ? 'duplicate'
          : (live.add(ck(k, f)), 'proceed'),
      settle: (k, f, ok) => {
        live.delete(ck(k, f));
        if (ok) committed.add(ck(k, f));
      },
    };
  }
  function addCount(): number {
    return calls.filter((c) => c.fn === 'todos.add').length;
  }

  it('#2 같은 키+같은 내용 재적용 → 두 번째는 add 안 함(타임아웃 후 재시도 중복 차단)', async () => {
    const d: LiveSyncWriteDeps = { ...deps, idempotency: memIdem() };
    const req = {
      domain: 'todos',
      op: 'create',
      idempotencyKey: 'k',
      data: { text: '시험지' },
    } as const;
    const r1 = await applyLiveSyncWrite(req, d);
    const r2 = await applyLiveSyncWrite(req, d);
    expect(r1).toEqual({ ok: true, ref: 'k' });
    expect(r2).toEqual({ ok: true, ref: 'k' }); // ok 지만 재적용은 안 함
    expect(addCount()).toBe(1); // 레코드 1개
  });

  it('#7 같은 키 + 다른 내용 → 두 번째도 적용(삼키지 않음)', async () => {
    const d: LiveSyncWriteDeps = { ...deps, idempotency: memIdem() };
    await applyLiveSyncWrite(
      { domain: 'todos', op: 'create', idempotencyKey: 'k', data: { text: 'A' } },
      d,
    );
    await applyLiveSyncWrite(
      { domain: 'todos', op: 'create', idempotencyKey: 'k', data: { text: 'B' } },
      d,
    );
    expect(addCount()).toBe(2); // 내용이 다르므로 둘 다 적용됨
  });

  it('실패한 적용은 기록하지 않음 — 재시도가 새로 적용됨', async () => {
    let failFirst = true;
    const d: LiveSyncWriteDeps = {
      ...deps,
      idempotency: memIdem(),
      todos: {
        ...deps.todos,
        add: () => {
          if (failFirst) {
            failFirst = false;
            return Promise.reject(new Error('boom'));
          }
          return Promise.resolve();
        },
      },
    };
    const req = {
      domain: 'todos',
      op: 'create',
      idempotencyKey: 'k',
      data: { text: 'x' },
    } as const;
    const r1 = await applyLiveSyncWrite(req, d); // 실패(500) → 멱등 미기록
    const r2 = await applyLiveSyncWrite(req, d); // 재시도 → 정상 적용
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(true);
  });

  it('#2 in-flight 동시 재시도도 1회만 적용(첫 적용 진행 중 중복 차단)', async () => {
    // add 를 수동 resolve 로 느리게 만들어, 첫 적용이 끝나기 전에 같은 키 재시도가 들어오게 한다(타임아웃 상황).
    let release!: () => void;
    const slow = new Promise<void>((r) => {
      release = r;
    });
    const d: LiveSyncWriteDeps = {
      ...deps,
      idempotency: memIdem(),
      todos: {
        ...deps.todos,
        add: ((...args: unknown[]) => {
          calls.push({ fn: 'todos.add', args });
          return slow;
        }) as LiveSyncWriteDeps['todos']['add'],
      },
    };
    const req = {
      domain: 'todos',
      op: 'create',
      idempotencyKey: 'k',
      data: { text: 'x' },
    } as const;
    const p1 = applyLiveSyncWrite(req, d); // in-flight (add 미완료)
    const r2 = await applyLiveSyncWrite(req, d); // 진행 중 동시 재시도 → reserve='duplicate' → 즉시 ok
    expect(r2).toEqual({ ok: true, ref: 'k' });
    expect(addCount()).toBe(1); // 재시도는 add 안 함
    release();
    await p1;
    expect(addCount()).toBe(1); // 첫 적용만 반영
  });
});

describe('applyLiveSyncWrite — #5 update 필드 정렬(브리지 스키마)', () => {
  it('completed(todos)·description(events)는 적용되지 않음', async () => {
    await applyLiveSyncWrite(
      {
        domain: 'todos',
        op: 'update',
        idempotencyKey: 'k',
        data: { id: 'todo-1', completed: true, text: 't' },
      },
      deps,
    );
    expect(calls[0]?.args[1]).toEqual({ text: 't' }); // completed 제외(complete op 전용)
    calls.length = 0;
    await applyLiveSyncWrite(
      {
        domain: 'events',
        op: 'update',
        idempotencyKey: 'k',
        data: { id: 'ev-1', description: 'd', title: 'T' },
      },
      deps,
    );
    expect(calls[0]?.args[1]).toEqual({ title: 'T' }); // description 제외(브리지에 없음)
  });
});

describe('applyLiveSyncWrite — attendance(교과반)', () => {
  it('create → attendance.save(classId,date,period,students), ok+ref', async () => {
    const r = await applyLiveSyncWrite(
      {
        domain: 'attendance',
        op: 'create',
        idempotencyKey: 'a1',
        data: {
          classId: 'c-1',
          date: '2026-06-02',
          period: 3,
          students: [{ number: 5, status: 'late', reason: '미인정' }],
        },
      },
      deps,
    );
    expect(r).toEqual({ ok: true, ref: 'a1' });
    expect(calls[0]?.fn).toBe('attendance.save');
    const arg = calls[0]?.args[0] as {
      classId: string;
      period: number;
      students: { number: number; status: string; reason?: string }[];
    };
    expect(arg.classId).toBe('c-1');
    expect(arg.period).toBe(3);
    expect(arg.students).toEqual([{ number: 5, status: 'late', reason: '미인정' }]);
  });

  it('delete → attendance.save 에 students:[] (해당 교시 출결 비움)', async () => {
    const r = await applyLiveSyncWrite(
      {
        domain: 'attendance',
        op: 'delete',
        idempotencyKey: 'a2',
        data: { classId: 'c-1', date: '2026-06-02', period: 3 },
      },
      deps,
    );
    expect(r.ok).toBe(true);
    const arg = calls[0]?.args[0] as { students: unknown[] };
    expect(arg.students).toEqual([]);
  });
});

describe('applyLiveSyncWrite — homeroomAttendance(담임)', () => {
  it('periods 지정 → 지정 교시만 recordsByPeriod 에 반영', async () => {
    const r = await applyLiveSyncWrite(
      {
        domain: 'homeroomAttendance',
        op: 'create',
        idempotencyKey: 'h1',
        data: {
          date: '2026-06-02',
          students: [{ number: 13, periods: [{ period: 0, status: 'late', reason: '미인정' }] }],
        },
      },
      deps,
    );
    expect(r).toEqual({ ok: true, ref: 'h1' });
    expect(calls[0]?.fn).toBe('homeroomAttendance.save');
    const arg = calls[0]?.args[0] as {
      date: string;
      recordsByPeriod: Map<number, { number: number; status: string; reason?: string }[]>;
      studentNumbers: number[];
    };
    expect(arg.date).toBe('2026-06-02');
    expect(arg.studentNumbers).toEqual([13]);
    expect([...arg.recordsByPeriod.keys()]).toEqual([0]);
    expect(arg.recordsByPeriod.get(0)).toEqual([{ number: 13, status: 'late', reason: '미인정' }]);
  });

  it('allDay → 조회0+정규1~7+종례9 전부 펼침', async () => {
    const r = await applyLiveSyncWrite(
      {
        domain: 'homeroomAttendance',
        op: 'create',
        idempotencyKey: 'h2',
        data: {
          date: '2026-06-01',
          students: [{ number: 1, allDay: { status: 'absent', reason: '질병' } }],
        },
      },
      deps,
    );
    expect(r.ok).toBe(true);
    const arg = calls[0]?.args[0] as {
      recordsByPeriod: Map<number, { number: number; status: string; reason?: string }[]>;
    };
    expect([...arg.recordsByPeriod.keys()].sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 9,
    ]);
    expect(arg.recordsByPeriod.get(0)).toEqual([{ number: 1, status: 'absent', reason: '질병' }]);
    expect(arg.recordsByPeriod.get(9)).toEqual([{ number: 1, status: 'absent', reason: '질병' }]);
  });

  it('교외체험학습(absent+인정+memo)도 allDay 펼침에 반영', async () => {
    await applyLiveSyncWrite(
      {
        domain: 'homeroomAttendance',
        op: 'create',
        idempotencyKey: 'h3',
        data: {
          date: '2026-06-08',
          students: [
            { number: 7, allDay: { status: 'absent', reason: '인정', memo: '현장체험학습' } },
          ],
        },
      },
      deps,
    );
    const arg = calls[0]?.args[0] as {
      recordsByPeriod: Map<
        number,
        { number: number; status: string; reason?: string; memo?: string }[]
      >;
    };
    expect(arg.recordsByPeriod.get(1)).toEqual([
      { number: 7, status: 'absent', reason: '인정', memo: '현장체험학습' },
    ]);
  });
});
