import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyLiveSyncWrite, type LiveSyncWriteDeps } from './applyLiveSyncWrite';
import type { AttendanceData, StudentAttendance } from '@domain/entities/Attendance';
import { studentKey } from '@domain/entities/TeachingClass';
import type { ITeachingClassRepository } from '@domain/repositories/ITeachingClassRepository';
import { createAttendanceRosterMatcher } from '@domain/rules/attendanceStudentMatch';
import { ManageAttendance } from '@usecases/classManagement/ManageAttendance';
import { resetFileWriteLocksForTest } from '@usecases/shared/fileWriteLock';

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
    observations: {
      add: rec('observations.add') as LiveSyncWriteDeps['observations']['add'],
    },
    recordNote: {
      add: rec('recordNote.add') as LiveSyncWriteDeps['recordNote']['add'],
      // 라이브 카테고리(렌더러 store mock) — attendance(빈 subcategories) + 기본 3종 + 커스텀 UUID.
      categories: () => [
        { id: 'attendance', subcategories: [] },
        { id: 'counseling', subcategories: ['학부모상담', '학생상담', '교우관계'] },
        { id: 'life', subcategories: ['건강', '생활지도', '학습', '칭찬'] },
        { id: 'etc', subcategories: ['진로', '가정연락', '기타'] },
        { id: 'custom-uuid-1234', subcategories: ['우리반행사', '봉사'] },
      ],
    },
    progress: {
      add: rec('progress.add') as LiveSyncWriteDeps['progress']['add'],
      update: rec('progress.update') as LiveSyncWriteDeps['progress']['update'],
      delete: rec('progress.delete') as LiveSyncWriteDeps['progress']['delete'],
      exists: vi.fn((id: string) => id === 'prog-1'),
      classExists: vi.fn((classId: string) => classId === 'cls-1' || classId === 'cls-archived'),
      isClassArchived: vi.fn((classId: string) => classId === 'cls-archived'),
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
  it('한도 초과 거부는 이유를 실어 400 으로 내린다 — 일반 500 으로 뭉개지 않는다', async () => {
    // 조용한 실패 금지(US-006). 이유가 사라지면 AI 도 교사도 왜 저장이 안 됐는지 알 수 없다.
    const err = new Error('진로활동 한도를 넘었습니다 — 2,400바이트 / 2,100바이트.');
    err.name = 'RecordDraftLimitError';
    const failing: LiveSyncWriteDeps = {
      ...deps,
      recordDrafts: {
        upsert: (() => Promise.reject(err)) as LiveSyncWriteDeps['recordDrafts']['upsert'],
      },
    };

    const r = await applyLiveSyncWrite(
      {
        domain: 'recordDrafts',
        op: 'create',
        idempotencyKey: 'rd-limit',
        data: { area: 'career', studentRef: 's1', studentId: 's1', content: '가'.repeat(800) },
      },
      failing,
    );
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
    expect(r.error).toContain('한도를 넘었습니다');
  });

  it('그 밖의 예외는 기존대로 일반 500 으로 내린다', async () => {
    const failing: LiveSyncWriteDeps = {
      ...deps,
      recordDrafts: {
        upsert: (() =>
          Promise.reject(new Error('디스크 오류'))) as LiveSyncWriteDeps['recordDrafts']['upsert'],
      },
    };

    const r = await applyLiveSyncWrite(
      {
        domain: 'recordDrafts',
        op: 'create',
        idempotencyKey: 'rd-other',
        data: { area: 'career', studentRef: 's1', studentId: 's1', content: '내용' },
      },
      failing,
    );
    expect(r.status).toBe(500);
    expect(r.error).not.toContain('디스크');
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
  it('F5(M2): 보관된 수업반 출결 쓰기는 create·delete 모두 사용자 언어로 거부한다', async () => {
    for (const op of ['create', 'delete'] as const) {
      const r = await applyLiveSyncWrite(
        {
          domain: 'attendance',
          op,
          idempotencyKey: `guard-${op}`,
          data: {
            classId: 'cls-archived',
            date: '2026-06-02',
            period: 3,
            ...(op === 'create' ? { students: [{ number: 5, status: 'late' }] } : {}),
          },
        },
        deps,
      );
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error).toBe(
          '보관된 수업반이라 새로 기록할 수 없어요. 보관을 해제한 뒤 다시 시도해 주세요.',
        );
      }
    }
    // 저장은 한 번도 호출되지 않는다(조용한 오기록 차단)
    expect(calls.filter((c) => c.fn === 'attendance.save')).toHaveLength(0);
  });

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
    const arg = calls[0]?.args[0] as { students: unknown[]; mode: string };
    expect(arg.students).toEqual([]);
    // 삭제는 그 교시를 통째로 비운다(병합이면 아무것도 안 지워진다).
    expect(arg.mode).toBe('replace');
  });

  it('수업반 출결은 학년·반을 보존한다 — 버리면 저장 키가 "7" 이 돼 명단 키 "2-3-7" 과 어긋난다', async () => {
    const r = await applyLiveSyncWrite(
      {
        domain: 'attendance',
        op: 'create',
        idempotencyKey: 'a3',
        data: {
          classId: 'c-1',
          date: '2026-06-02',
          period: 3,
          students: [
            { number: 7, status: 'absent', reason: '질병', grade: 2, classNum: 3 },
            // 학년·반이 없는 명단(담임 학급 등)은 번호만 온다 — 그대로 번호만 저장한다.
            { number: 9, status: 'late' },
          ],
        },
      },
      deps,
    );
    expect(r).toEqual({ ok: true, ref: 'a3' });
    const arg = calls[0]?.args[0] as { students: StudentAttendance[]; mode: string };
    expect(arg.students).toEqual([
      { number: 7, status: 'absent', reason: '질병', grade: 2, classNum: 3 },
      { number: 9, status: 'late' },
    ]);
    expect(studentKey(arg.students[0]!)).toBe('2-3-7');
    // 등록은 "이번에 든 학생만 갱신"으로 넘긴다.
    expect(arg.mode).toBe('merge');
  });
});

/**
 * 실제 저장 경로(ManageAttendance + 가짜 저장소)에 이어 붙인 검증.
 * 훅(useAiBridgeLiveSync)의 `attendance.save` 는 `mode` 에 따라 store 의 병합/교체 액션을
 * 고르고, 두 액션은 각각 `upsertRecordStudents`/`upsertRecord` 로 내려간다 — 여기서 그 배선을 그대로 흉내 낸다.
 */
describe('applyLiveSyncWrite — attendance(교과반) 저장 결과', () => {
  /** 여러 학급에서 모인 수업반 — 2번이 둘, 7번은 한 명. */
  const roster = [
    { number: 2, name: '도유산', grade: 2, classNum: 1 },
    { number: 2, name: '민서율', grade: 2, classNum: 3 },
    { number: 7, name: '한지후', grade: 2, classNum: 3 },
  ];

  class FakeAttendanceRepo {
    data: AttendanceData | null = null;
    async getAttendance(): Promise<AttendanceData | null> {
      return this.data ? (JSON.parse(JSON.stringify(this.data)) as AttendanceData) : null;
    }
    async saveAttendance(data: AttendanceData): Promise<void> {
      this.data = data;
    }
    async getClasses(): Promise<{ classes: { id: string; students: typeof roster }[] }> {
      return { classes: [{ id: 'tc-1', students: roster }] };
    }
  }

  let repo: FakeAttendanceRepo;

  beforeEach(() => {
    resetFileWriteLocksForTest();
    repo = new FakeAttendanceRepo();
    const manage = new ManageAttendance(repo as unknown as ITeachingClassRepository);
    deps = {
      ...deps,
      attendance: {
        save: async (input) => {
          const { mode, ...record } = input;
          if (mode === 'merge') await manage.upsertRecordStudents(record);
          else await manage.upsertRecord(record);
        },
      },
    };
  });

  const write = (
    idempotencyKey: string,
    students: readonly Record<string, unknown>[],
    period = 3,
  ) =>
    applyLiveSyncWrite(
      {
        domain: 'attendance',
        op: 'create',
        idempotencyKey,
        data: { classId: 'tc-1', date: '2026-11-02', period, students },
      },
      deps,
    );

  const savedStudents = (period = 3): readonly StudentAttendance[] =>
    repo.data?.records.find((r) => r.classId === 'tc-1' && r.period === period)?.students ?? [];

  it('같은 교시에 학생별로 나눠 써도 앞 학생 기록이 남는다', async () => {
    // AI 가 학생마다 따로 호출한다 — 통째 교체였다면 마지막 호출(7번)만 남는다.
    const first = await write('s1', [{ number: 2, status: 'absent', grade: 2, classNum: 1 }]);
    const second = await write('s2', [{ number: 2, status: 'late', grade: 2, classNum: 3 }]);
    const third = await write('s3', [{ number: 7, status: 'earlyLeave', grade: 2, classNum: 3 }]);
    expect([first.ok, second.ok, third.ok]).toEqual([true, true, true]);

    expect(savedStudents().map((s) => [studentKey(s), s.status])).toEqual([
      ['2-1-2', 'absent'],
      ['2-3-2', 'late'],
      ['2-3-7', 'earlyLeave'],
    ]);
  });

  it('같은 학생을 다시 쓰면 그 학생만 바뀐다 — 한 학생이 두 줄이 되지 않는다', async () => {
    await write('s1', [
      { number: 2, status: 'absent', grade: 2, classNum: 1 },
      { number: 7, status: 'absent', grade: 2, classNum: 3 },
    ]);
    await write('s2', [{ number: 7, status: 'late', reason: '질병', grade: 2, classNum: 3 }]);

    expect(savedStudents()).toEqual([
      { number: 2, status: 'absent', grade: 2, classNum: 1 },
      { number: 7, status: 'late', reason: '질병', grade: 2, classNum: 3 },
    ]);
  });

  it('★회귀: 저장된 항목의 studentKey 가 명단 키와 같다 — 통계·조회가 그 학생으로 찾는다', async () => {
    await write('s1', [
      { number: 2, status: 'absent', grade: 2, classNum: 3 },
      { number: 7, status: 'late', grade: 2, classNum: 3 },
    ]);

    const rosterKeys = new Set(roster.map((s) => studentKey(s)));
    const saved = savedStudents();
    expect(saved).toHaveLength(2);
    for (const entry of saved) expect(rosterKeys.has(studentKey(entry))).toBe(true);

    // 화면이 쓰는 읽기 규칙으로도 그 학생에게 붙는다.
    const byStudent = createAttendanceRosterMatcher(roster).indexByStudentKey(saved);
    expect(byStudent.get('2-3-2')?.status).toBe('absent');
    expect(byStudent.get('2-3-7')?.status).toBe('late');
    expect(byStudent.has('2-1-2')).toBe(false);
  });

  it('번호만 저장돼 있던 옛 항목은 새로 쓴 항목으로 바뀐다(나란히 남지 않는다)', async () => {
    repo.data = {
      records: [
        {
          classId: 'tc-1',
          date: '2026-11-02',
          period: 3,
          // 고치기 전 버전이 남긴 모양: 7번은 번호만, 2번은 누구인지 알 수 없다.
          students: [
            { number: 7, status: 'absent' },
            { number: 2, status: 'absent' },
          ],
        },
      ],
    };

    await write('s1', [{ number: 7, status: 'late', grade: 2, classNum: 3 }]);

    expect(savedStudents()).toEqual([
      // 2번은 명단에 둘이라 누구 것인지 못 정한다 → 건드리지 않고 그대로 둔다.
      { number: 2, status: 'absent' },
      { number: 7, status: 'late', grade: 2, classNum: 3 },
    ]);
  });

  it('번호가 겹치는 반에 학년·반 없이 오면 저장하지 않고 이유를 돌려준다', async () => {
    await write('s0', [{ number: 7, status: 'absent', grade: 2, classNum: 3 }]);
    const before = JSON.stringify(repo.data);

    // 2번은 명단에 둘이다. 같이 온 7번(정할 수 있는 학생)도 저장하지 않는다 — 호출 전체를 거부한다.
    const r = await write('s1', [
      { number: 7, status: 'late', grade: 2, classNum: 3 },
      { number: 2, status: 'absent' },
    ]);

    expect(r).toEqual({
      ok: false,
      status: 400,
      error: '이 수업반에는 2번 학생이 여러 명이에요. 학년과 반을 함께 보내 주세요.',
    });
    expect(JSON.stringify(repo.data)).toBe(before);
    expect(savedStudents()).toEqual([{ number: 7, status: 'absent', grade: 2, classNum: 3 }]);

    // 학년만 있고 반이 없어도 누구인지 못 정한다
    const gradeOnly = await write('s2', [{ number: 2, status: 'absent', grade: 2 }]);
    expect(gradeOnly.ok).toBe(false);
    expect(JSON.stringify(repo.data)).toBe(before);

    // 안내대로 학년·반을 함께 보내면 저장된다
    const retry = await write('s3', [{ number: 2, status: 'absent', grade: 2, classNum: 1 }]);
    expect(retry.ok).toBe(true);
    expect(savedStudents().map((s) => [studentKey(s), s.status])).toEqual([
      ['2-3-7', 'absent'],
      ['2-1-2', 'absent'],
    ]);
  });

  it('번호가 한 명뿐이면 명단의 학년·반으로 채워 저장한다', async () => {
    const r = await write('s1', [{ number: 7, status: 'late', reason: '질병' }]);

    expect(r.ok).toBe(true);
    // 번호만으로 남기지 않는다 — 저장 키가 명단 키("2-3-7")와 같다
    expect(savedStudents()).toEqual([
      { number: 7, status: 'late', reason: '질병', grade: 2, classNum: 3 },
    ]);
  });

  it('grade 가 null 이면 없는 것으로 본다', async () => {
    // 번호가 한 명뿐인 7번: null 은 "모름"이다 → 명단의 학년·반으로 채워 저장한다
    const unique = await write('s1', [{ number: 7, status: 'late', grade: null, classNum: null }]);
    expect(unique.ok).toBe(true);
    expect(savedStudents()).toEqual([{ number: 7, status: 'late', grade: 2, classNum: 3 }]);

    // 번호가 겹치는 2번: null 도 "학년·반 없이 온 것"이라 이유와 함께 거부한다
    const before = JSON.stringify(repo.data);
    const ambiguous = await write('s2', [
      { number: 2, status: 'absent', grade: null, classNum: null },
    ]);
    expect(ambiguous).toEqual({
      ok: false,
      status: 400,
      error: '이 수업반에는 2번 학생이 여러 명이에요. 학년과 반을 함께 보내 주세요.',
    });
    expect(JSON.stringify(repo.data)).toBe(before);
  });

  it('명단에 없는 번호는 받은 그대로 저장한다(기존 동작 유지)', async () => {
    const r = await write('s1', [{ number: 30, status: 'absent' }]);

    expect(r.ok).toBe(true);
    expect(savedStudents()).toEqual([{ number: 30, status: 'absent' }]);
  });

  it('다른 교시 기록은 건드리지 않는다', async () => {
    await write('p3', [{ number: 7, status: 'absent', grade: 2, classNum: 3 }], 3);
    await write('p4', [{ number: 7, status: 'late', grade: 2, classNum: 3 }], 4);

    expect(savedStudents(3)).toEqual([{ number: 7, status: 'absent', grade: 2, classNum: 3 }]);
    expect(savedStudents(4)).toEqual([{ number: 7, status: 'late', grade: 2, classNum: 3 }]);
  });

  it('삭제는 그 교시를 통째로 비운다', async () => {
    await write('s1', [
      { number: 2, status: 'absent', grade: 2, classNum: 1 },
      { number: 7, status: 'late', grade: 2, classNum: 3 },
    ]);
    const r = await applyLiveSyncWrite(
      {
        domain: 'attendance',
        op: 'delete',
        idempotencyKey: 'd1',
        data: { classId: 'tc-1', date: '2026-11-02', period: 3 },
      },
      deps,
    );

    expect(r.ok).toBe(true);
    expect(savedStudents()).toEqual([]);
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

  it('담임 출결은 학년·반을 싣지 않는다 — 담임 기록은 번호만으로 이어진다', async () => {
    await applyLiveSyncWrite(
      {
        domain: 'homeroomAttendance',
        op: 'create',
        idempotencyKey: 'h4',
        data: {
          date: '2026-06-09',
          students: [
            { number: 5, periods: [{ period: 2, status: 'late', grade: 3, classNum: 5 }] },
            { number: 6, allDay: { status: 'absent', grade: 3, classNum: 5 } },
          ],
        },
      },
      deps,
    );
    const arg = calls[0]?.args[0] as {
      recordsByPeriod: Map<number, StudentAttendance[]>;
      allDayNumbers: number[];
    };
    expect(arg.recordsByPeriod.get(2)).toEqual([
      { number: 5, status: 'late' },
      { number: 6, status: 'absent' },
    ]);
    // 하루 전체로 온 학생만 표시한다 — 저장 쪽이 이 학생만 그날을 통째로 바꾼다.
    expect(arg.allDayNumbers).toEqual([6]);
    for (const entry of arg.recordsByPeriod.get(2) ?? []) {
      expect(studentKey(entry)).toBe(String(entry.number));
    }
  });
});

describe('applyLiveSyncWrite — homeroomAttendance 입력 검증(저장 전 거부)', () => {
  const send = (students: unknown[]) =>
    applyLiveSyncWrite(
      {
        domain: 'homeroomAttendance',
        op: 'create',
        idempotencyKey: 'hv',
        data: { date: '2026-06-09', students },
      },
      deps,
    );

  it('periods 가 비었거나 번호만 오면 저장하지 않고 고칠 방법을 알려 준다', async () => {
    for (const student of [{ number: 5, periods: [] }, { number: 5 }]) {
      calls.length = 0;
      const r = await send([student]);
      expect(r).toMatchObject({ ok: false, status: 400 });
      expect(r.error).toContain('periods 에 교시를 하나 이상 넣거나 allDay');
      expect(calls.some((c) => c.fn === 'homeroomAttendance.save')).toBe(false);
    }
  });

  it('같은 학생에 allDay 와 periods 를 함께 보내면 거부한다', async () => {
    const r = await send([
      { number: 5, allDay: { status: 'absent' }, periods: [{ period: 2, status: 'late' }] },
    ]);
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(calls.some((c) => c.fn === 'homeroomAttendance.save')).toBe(false);
  });

  it('같은 학생을 두 번 보내면(한 번은 allDay, 한 번은 periods) 거부한다', async () => {
    const r = await send([
      { number: 5, allDay: { status: 'absent' } },
      { number: 5, periods: [{ period: 2, status: 'late' }] },
    ]);
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(calls.some((c) => c.fn === 'homeroomAttendance.save')).toBe(false);
  });
});

describe('applyLiveSyncWrite — observations(관찰기록)', () => {
  it('create: studentId+content → add 위임(classId·tags 포함)', async () => {
    const res = await applyLiveSyncWrite(
      {
        domain: 'observations',
        op: 'create',
        idempotencyKey: 'o1',
        // F7f: classId는 존재하는 수업반이어야 한다(cls-1 = mock classExists 통과)
        data: { studentId: 's1', classId: 'cls-1', content: '발표 잘함', tags: ['수업태도'] },
      },
      deps,
    );
    expect(res).toEqual({ ok: true, ref: 'o1' });
    expect(calls[0]?.fn).toBe('observations.add');
    expect(calls[0]?.args[0]).toMatchObject({
      studentId: 's1',
      classId: 'cls-1',
      content: '발표 잘함',
      tags: ['수업태도'],
    });
  });

  it('F7f(RM1): 미상 classId는 404, 보관된 수업반은 사용자 언어로 거부한다', async () => {
    const unknown = await applyLiveSyncWrite(
      {
        domain: 'observations',
        op: 'create',
        idempotencyKey: 'o-unknown',
        data: { studentId: 's1', classId: 'no-such-class', content: '내용' },
      },
      deps,
    );
    expect(unknown).toMatchObject({ ok: false, status: 404 });

    const archived = await applyLiveSyncWrite(
      {
        domain: 'observations',
        op: 'create',
        idempotencyKey: 'o-archived',
        data: { studentId: 's1', classId: 'cls-archived', content: '내용' },
      },
      deps,
    );
    expect(archived.ok).toBe(false);
    if (!archived.ok) {
      expect(archived.error).toBe(
        '보관된 수업반이라 새로 기록할 수 없어요. 보관을 해제한 뒤 다시 시도해 주세요.',
      );
    }
    expect(calls.filter((c) => c.fn === 'observations.add')).toHaveLength(0);
  });

  it('content 누락 거부', async () => {
    const res = await applyLiveSyncWrite(
      { domain: 'observations', op: 'create', idempotencyKey: 'o2', data: { studentId: 's1' } },
      deps,
    );
    expect(res.ok).toBe(false);
    expect(calls.length).toBe(0);
  });

  it('create 외 op 거부', async () => {
    const res = await applyLiveSyncWrite(
      {
        domain: 'observations',
        op: 'delete',
        idempotencyKey: 'o3',
        data: { studentId: 's1', content: 'x' },
      },
      deps,
    );
    expect(res.ok).toBe(false);
  });
});

describe('applyLiveSyncWrite — recordNote(담임 노트)', () => {
  const base = { domain: 'recordNote', op: 'create', idempotencyKey: 'n1' } as const;

  it('기본 카테고리(life>칭찬) 통과 → add 위임', async () => {
    const res = await applyLiveSyncWrite(
      {
        ...base,
        data: {
          studentId: 's1',
          categoryId: 'life',
          subcategory: '칭찬',
          content: '분리수거 정리',
        },
      },
      deps,
    );
    expect(res).toEqual({ ok: true, ref: 'n1' });
    expect(calls[0]?.fn).toBe('recordNote.add');
    expect(calls[0]?.args[0]).toMatchObject({
      studentId: 's1',
      categoryId: 'life',
      subcategory: '칭찬',
      content: '분리수거 정리',
    });
  });

  it('커스텀 UUID 카테고리 통과(하드코딩 화이트리스트 회귀 방지)', async () => {
    const res = await applyLiveSyncWrite(
      {
        ...base,
        data: {
          studentId: 's1',
          categoryId: 'custom-uuid-1234',
          subcategory: '봉사',
          content: 'x',
        },
      },
      deps,
    );
    expect(res.ok).toBe(true);
    expect(calls[0]?.fn).toBe('recordNote.add');
  });

  it('attendance 카테고리 거부(출결 트랙 침범 금지)', async () => {
    const res = await applyLiveSyncWrite(
      {
        ...base,
        data: { studentId: 's1', categoryId: 'attendance', subcategory: 'x', content: 'x' },
      },
      deps,
    );
    expect(res.ok).toBe(false);
    expect(calls.length).toBe(0);
  });

  it('미존재 categoryId 거부 + 허용목록 회신', async () => {
    const res = await applyLiveSyncWrite(
      { ...base, data: { studentId: 's1', categoryId: 'nope', subcategory: 'x', content: 'x' } },
      deps,
    );
    expect(res.ok).toBe(false);
    expect(res.error).toContain('life');
    expect(calls.length).toBe(0);
  });

  it('subcategory 불일치 거부 + 허용목록 회신', async () => {
    const res = await applyLiveSyncWrite(
      {
        ...base,
        data: { studentId: 's1', categoryId: 'life', subcategory: '없는세부', content: 'x' },
      },
      deps,
    );
    expect(res.ok).toBe(false);
    expect(res.error).toContain('칭찬');
    expect(calls.length).toBe(0);
  });

  it('create 외 op 거부', async () => {
    const res = await applyLiveSyncWrite(
      {
        ...base,
        op: 'delete',
        data: { studentId: 's1', categoryId: 'life', subcategory: '칭찬', content: 'x' },
      },
      deps,
    );
    expect(res.ok).toBe(false);
  });
});

describe('applyLiveSyncWrite — progress(수업 진도)', () => {
  it('create → progress.add(input), ok+ref(멱등키)', async () => {
    const r = await applyLiveSyncWrite(
      {
        domain: 'progress',
        op: 'create',
        idempotencyKey: 'k1',
        data: {
          classId: 'cls-1',
          date: '2026-07-07',
          period: 3,
          unit: '5단원 함수',
          lesson: '일차함수 그래프',
          status: 'completed',
          note: '진도 빠름',
        },
      },
      deps,
    );
    expect(r).toEqual({ ok: true, ref: 'k1' });
    expect(calls[0]).toEqual({
      fn: 'progress.add',
      args: [
        {
          classId: 'cls-1',
          date: '2026-07-07',
          period: 3,
          unit: '5단원 함수',
          lesson: '일차함수 그래프',
          status: 'completed',
          note: '진도 빠름',
        },
      ],
    });
  });

  it('create — lesson/status/note 생략 가능(선택 필드 미포함 전달)', async () => {
    const r = await applyLiveSyncWrite(
      {
        domain: 'progress',
        op: 'create',
        idempotencyKey: 'k',
        data: { classId: 'cls-1', date: '2026-07-07', period: 1, unit: '1단원' },
      },
      deps,
    );
    expect(r.ok).toBe(true);
    expect(calls[0]).toEqual({
      fn: 'progress.add',
      args: [{ classId: 'cls-1', date: '2026-07-07', period: 1, unit: '1단원' }],
    });
  });

  it('create — 필수 필드(classId/date/period/unit) 누락 → 400, 액션 미호출', async () => {
    const r = await applyLiveSyncWrite(
      {
        domain: 'progress',
        op: 'create',
        idempotencyKey: 'k',
        data: { classId: 'cls-1', date: '2026-07-07' },
      },
      deps,
    );
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(calls).toHaveLength(0);
  });

  it('create — 보관된 수업반 → 사용자 언어 오류로 거부, 액션 미호출 (plan S1.4-F)', async () => {
    const r = await applyLiveSyncWrite(
      {
        domain: 'progress',
        op: 'create',
        idempotencyKey: 'k',
        data: { classId: 'cls-archived', date: '2026-07-07', period: 1, unit: '1단원' },
      },
      deps,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('보관된 수업반이라 새로 기록할 수 없어요');
    }
    expect(calls).toHaveLength(0);
  });

  it('create — 미존재 수업반 → 404, 액션 미호출', async () => {
    const r = await applyLiveSyncWrite(
      {
        domain: 'progress',
        op: 'create',
        idempotencyKey: 'k',
        data: { classId: 'no-such', date: '2026-07-07', period: 1, unit: '1단원' },
      },
      deps,
    );
    expect(r).toMatchObject({ ok: false, status: 404 });
    expect(calls).toHaveLength(0);
  });

  it('update → progress.update(id, 변경분만), 없는 id → 404', async () => {
    const r = await applyLiveSyncWrite(
      {
        domain: 'progress',
        op: 'update',
        idempotencyKey: 'k',
        data: { id: 'prog-1', status: 'completed', note: '보강 완료' },
      },
      deps,
    );
    expect(r.ok).toBe(true);
    expect(calls[0]).toEqual({
      fn: 'progress.update',
      args: ['prog-1', { status: 'completed', note: '보강 완료' }],
    });
    const notFound = await applyLiveSyncWrite(
      { domain: 'progress', op: 'update', idempotencyKey: 'k2', data: { id: 'nope', unit: 'x' } },
      deps,
    );
    expect(notFound).toMatchObject({ ok: false, status: 404 });
  });

  it('update — 변경 필드 없음 → 400', async () => {
    const r = await applyLiveSyncWrite(
      { domain: 'progress', op: 'update', idempotencyKey: 'k', data: { id: 'prog-1' } },
      deps,
    );
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(calls).toHaveLength(0);
  });

  it('delete → progress.delete(id), 없는 id → 404', async () => {
    const r = await applyLiveSyncWrite(
      { domain: 'progress', op: 'delete', idempotencyKey: 'k', data: { id: 'prog-1' } },
      deps,
    );
    expect(r.ok).toBe(true);
    expect(calls[0]).toEqual({ fn: 'progress.delete', args: ['prog-1'] });
    const notFound = await applyLiveSyncWrite(
      { domain: 'progress', op: 'delete', idempotencyKey: 'k2', data: { id: 'nope' } },
      deps,
    );
    expect(notFound).toMatchObject({ ok: false, status: 404 });
  });

  it('complete 연산 거부', async () => {
    const r = await applyLiveSyncWrite(
      { domain: 'progress', op: 'complete', idempotencyKey: 'k', data: { id: 'prog-1' } },
      deps,
    );
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(calls).toHaveLength(0);
  });
});
