import { describe, expect, it } from 'vitest';
import type { Todo } from '../../entities/Todo';
import type { GoogleTask } from '../../ports/IGoogleTasksPort';
import type { TasksSyncConflict } from '../../entities/TasksSyncConflict';
import {
  buildTasksSyncConflict,
  detectTasksConflict,
  localTodoContent,
  mergeTasksSyncConflicts,
  remoteDueToDate,
  remoteNotesToLocal,
  remoteTaskContent,
  tasksSyncConflictKey,
  toGoogleTaskCreatePayload,
  toGoogleTaskUpdatePayload,
} from '../tasksSyncRules';

const LIST = 'list-1';
const SYNCED = '2026-10-14T10:00:00.000Z';

function todo(over: Partial<Todo> = {}): Todo {
  return {
    id: 't1',
    text: '학부모 상담 회신',
    completed: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    googleTaskId: 'g1',
    googleTaskListId: LIST,
    lastSyncedAt: SYNCED,
    pendingRemoteOp: 'update',
    ...over,
  };
}

function remote(over: Partial<GoogleTask> = {}): GoogleTask {
  return {
    id: 'g1',
    title: '구글에서 고친 제목',
    status: 'needsAction',
    updated: '2026-10-14T11:00:00.000Z', // lastSyncedAt 보다 1시간 뒤
    etag: 'e',
    ...over,
  };
}

function detect(t: Todo, r: GoogleTask | undefined) {
  return detectTasksConflict({ todo: t, remote: r, taskListId: LIST });
}

describe('쓰기 payload', () => {
  it('생성: 값이 없는 칸은 보내지 않는다(null 도 아니다)', () => {
    const p = toGoogleTaskCreatePayload(todo({ dueDate: undefined, notes: undefined }));
    expect(p).toEqual({ title: '학부모 상담 회신', status: 'needsAction' });
    expect('due' in p).toBe(false);
    expect('notes' in p).toBe(false);
  });

  it('생성: 마감일·메모·완료가 있으면 그대로 싣는다', () => {
    const p = toGoogleTaskCreatePayload(
      todo({ dueDate: '2026-10-20', notes: '전화', completed: true }),
    );
    expect(p).toEqual({
      title: '학부모 상담 회신',
      status: 'completed',
      due: '2026-10-20T00:00:00.000Z',
      notes: '전화',
    });
  });

  it('수정: 지운 마감일·메모는 null 로 보낸다', () => {
    const p = toGoogleTaskUpdatePayload(todo({ dueDate: undefined, notes: undefined }));
    expect(p.due).toBeNull();
    expect(p.notes).toBeNull();
    expect(p.title).toBe('학부모 상담 회신');
  });

  it('수정: 빈 문자열 메모도 지운 것으로 본다', () => {
    expect(toGoogleTaskUpdatePayload(todo({ notes: '' })).notes).toBeNull();
  });

  it('수정: 값이 있으면 값을 보낸다', () => {
    const p = toGoogleTaskUpdatePayload(todo({ dueDate: '2026-10-20', notes: '전화' }));
    expect(p.due).toBe('2026-10-20T00:00:00.000Z');
    expect(p.notes).toBe('전화');
  });
});

describe('가져오기 변환', () => {
  it('due 는 앞 10자만 쓴다', () => {
    expect(remoteDueToDate('2026-10-20T00:00:00.000Z')).toBe('2026-10-20');
    expect(remoteDueToDate(undefined)).toBeUndefined();
  });

  it('구글에서 비운 메모(없음·공백)는 지움이다', () => {
    expect(remoteNotesToLocal(undefined)).toBeUndefined();
    expect(remoteNotesToLocal('')).toBeUndefined();
    expect(remoteNotesToLocal('   ')).toBeUndefined();
    expect(remoteNotesToLocal('전화')).toBe('전화');
  });

  it('내용 변환: 쌤핀·구글 모두 네 칸만 낸다', () => {
    expect(localTodoContent(todo({ dueDate: '2026-10-20', notes: 'n', priority: 'high' }))).toEqual(
      {
        text: '학부모 상담 회신',
        notes: 'n',
        dueDate: '2026-10-20',
        completed: false,
      },
    );
    expect(
      remoteTaskContent(
        remote({ due: '2026-10-20T00:00:00.000Z', status: 'completed', notes: undefined }),
      ),
    ).toEqual({ text: '구글에서 고친 제목', dueDate: '2026-10-20', completed: true });
  });
});

describe('충돌 판정', () => {
  it('edit-edit: 구글이 허용 오차를 넘어 뒤이고 내용이 다르다', () => {
    expect(detect(todo(), remote())).toBe('edit-edit');
  });

  it('local-deleted: 쌤핀에서 지운(보관한) 것을 구글에서 고쳤다', () => {
    expect(detect(todo({ pendingRemoteOp: 'delete' }), remote())).toBe('local-deleted');
  });

  it('remote-deleted: 스냅샷에 없다', () => {
    expect(detect(todo(), undefined)).toBe('remote-deleted');
  });

  it('remote-deleted: 삭제 표시가 있다', () => {
    expect(detect(todo(), remote({ deleted: true }))).toBe('remote-deleted');
  });

  it('쌤핀도 지우려던 것은 구글이 이미 지워졌어도 알릴 것이 없다', () => {
    expect(detect(todo({ pendingRemoteOp: 'delete' }), undefined)).toBeNull();
    expect(detect(todo({ pendingRemoteOp: 'delete' }), remote({ deleted: true }))).toBeNull();
  });

  describe('허용 오차 경계(5분)', () => {
    it('4분 59초 뒤는 같은 시각으로 본다', () => {
      expect(detect(todo(), remote({ updated: '2026-10-14T10:04:59.000Z' }))).toBeNull();
    });
    it('정확히 5분 뒤도 아니다', () => {
      expect(detect(todo(), remote({ updated: '2026-10-14T10:05:00.000Z' }))).toBeNull();
    });
    it('5분 1초 뒤는 충돌이다', () => {
      expect(detect(todo(), remote({ updated: '2026-10-14T10:05:01.000Z' }))).toBe('edit-edit');
    });
    it('구글이 더 앞이면 충돌이 아니다', () => {
      expect(detect(todo(), remote({ updated: '2026-10-14T09:00:00.000Z' }))).toBeNull();
    });
  });

  it('lastSyncedAt 이 없으면 비교할 기준이 없어 뒤로 본다', () => {
    expect(detect(todo({ lastSyncedAt: undefined }), remote())).toBe('edit-edit');
  });

  it('구글 updated 를 읽을 수 없으면 알리지 않는다', () => {
    expect(detect(todo(), remote({ updated: 'not-a-date' }))).toBeNull();
  });

  it('시계가 느린 PC: 방금 올린 내용(내용 같음)은 충돌이 아니다', () => {
    const t = todo({ text: '같은 제목', notes: '메모', dueDate: '2026-10-20' });
    const r = remote({
      title: '같은 제목',
      notes: '메모',
      due: '2026-10-20T00:00:00.000Z',
      updated: '2026-10-14T12:00:00.000Z', // 한참 뒤로 보이지만
    });
    expect(detect(t, r)).toBeNull();
  });

  it('메모 앞뒤 공백·빈 값 차이는 다른 내용이 아니다', () => {
    const t = todo({ text: '제목', notes: undefined });
    const r = remote({ title: '제목 ', notes: '  ', updated: '2026-10-14T12:00:00.000Z' });
    expect(detect(t, r)).toBeNull();
  });

  it('완료 여부만 달라도 충돌이다', () => {
    const t = todo({ text: '제목', completed: false });
    const r = remote({ title: '제목', status: 'completed' });
    expect(detect(t, r)).toBe('edit-edit');
  });

  it('마감일만 달라도 충돌이다', () => {
    const t = todo({ text: '제목', dueDate: '2026-10-20' });
    const r = remote({ title: '제목', due: '2026-10-21T00:00:00.000Z' });
    expect(detect(t, r)).toBe('edit-edit');
  });

  describe('판정 대상이 아닌 것', () => {
    it('보류 변경이 없다(쌤핀 전용 칸만 바뀐 수정 포함)', () => {
      expect(detect(todo({ pendingRemoteOp: undefined }), remote())).toBeNull();
    });
    it('create 는 구글에 아직 없는 것이다', () => {
      expect(
        detect(todo({ pendingRemoteOp: 'create', googleTaskId: undefined }), undefined),
      ).toBeNull();
    });
    it('구글과 연결되지 않았다', () => {
      expect(detect(todo({ googleTaskId: undefined }), undefined)).toBeNull();
    });
    it('옛 목록에 연결된 것은 판정하지 않는다', () => {
      expect(detect(todo({ googleTaskListId: 'old-list' }), undefined)).toBeNull();
    });
    it('목록 ID 가 비어 있으면 현재 목록으로 본다', () => {
      expect(detect(todo({ googleTaskListId: undefined }), remote())).toBe('edit-edit');
    });
    it('구글 하위 할 일', () => {
      expect(detect(todo(), remote({ parent: 'p1' }))).toBeNull();
    });
  });
});

describe('기록 만들기', () => {
  it('edit-edit: 쌤핀 내용과 구글 내용을 함께 남긴다', () => {
    const c = buildTasksSyncConflict({
      id: 'c1',
      detectedAt: '2026-10-14T12:00:00.000Z',
      kind: 'edit-edit',
      todo: todo({ notes: '쌤핀 메모' }),
      remote: remote({ notes: '구글 메모' }),
    });
    expect(c).toMatchObject({
      id: 'c1',
      kind: 'edit-edit',
      todoId: 't1',
      googleTaskId: 'g1',
      remoteUpdatedAt: '2026-10-14T11:00:00.000Z',
      local: { text: '학부모 상담 회신', notes: '쌤핀 메모', completed: false },
      remote: { text: '구글에서 고친 제목', notes: '구글 메모', completed: false },
    });
  });

  it('remote-deleted: 스냅샷에 없으면 remote·remoteUpdatedAt 이 없다', () => {
    const c = buildTasksSyncConflict({
      id: 'c2',
      detectedAt: '2026-10-14T12:00:00.000Z',
      kind: 'remote-deleted',
      todo: todo(),
      remote: undefined,
    });
    expect(c.remote).toBeUndefined();
    expect(c.remoteUpdatedAt).toBeUndefined();
  });

  it('remote-deleted: 삭제 표시가 있으면 그 표시의 내용·시각을 쓴다', () => {
    const c = buildTasksSyncConflict({
      id: 'c3',
      detectedAt: '2026-10-14T12:00:00.000Z',
      kind: 'remote-deleted',
      todo: todo(),
      remote: remote({ deleted: true, updated: '2026-10-14T10:30:00.000Z' }),
    });
    expect(c.remoteUpdatedAt).toBe('2026-10-14T10:30:00.000Z');
    expect(c.remote?.text).toBe('구글에서 고친 제목');
  });
});

describe('기록 합치기', () => {
  function rec(n: number, over: Partial<TasksSyncConflict> = {}): TasksSyncConflict {
    return {
      id: `c${n}`,
      kind: 'edit-edit',
      todoId: `t${n}`,
      googleTaskId: `g${n}`,
      detectedAt: '2026-10-14T12:00:00.000Z',
      remoteUpdatedAt: `2026-10-14T11:00:${String(n % 60).padStart(2, '0')}.000Z`,
      local: { text: 'a', completed: false },
      ...over,
    };
  }

  it('새 기록은 앞에 붙고 added 로 돌아온다', () => {
    const r = mergeTasksSyncConflicts([rec(1)], [rec(2)]);
    expect(r.merged.map((c) => c.id)).toEqual(['c2', 'c1']);
    expect(r.added.map((c) => c.id)).toEqual(['c2']);
  });

  it('열쇠(구글 ID·종류·구글 시각)가 같으면 다시 넣지 않는다', () => {
    const existing = rec(1);
    const same = { ...existing, id: 'other', detectedAt: '2026-10-15T00:00:00.000Z' };
    const r = mergeTasksSyncConflicts([existing], [same]);
    expect(r.added).toHaveLength(0);
    expect(r.merged).toEqual([existing]);
  });

  it('구글 시각이 달라지면 같은 할 일도 새 충돌이다', () => {
    const existing = rec(1);
    const later = { ...existing, id: 'c9', remoteUpdatedAt: '2026-10-15T08:00:00.000Z' };
    expect(tasksSyncConflictKey(existing)).not.toBe(tasksSyncConflictKey(later));
    expect(mergeTasksSyncConflicts([existing], [later]).added).toHaveLength(1);
  });

  it('새 기록들 사이의 중복도 한 번만 넣는다', () => {
    const a = rec(1);
    const r = mergeTasksSyncConflicts([], [a, { ...a, id: 'dup' }]);
    expect(r.added).toHaveLength(1);
  });

  it('20개를 넘으면 가장 오래된 것부터 밀려난다', () => {
    const existing = Array.from({ length: 20 }, (_, i) => rec(i + 1));
    const r = mergeTasksSyncConflicts(existing, [rec(100)]);
    expect(r.merged).toHaveLength(20);
    expect(r.merged[0]?.id).toBe('c100');
    expect(r.merged.some((c) => c.id === 'c20')).toBe(false);
    expect(r.merged.some((c) => c.id === 'c19')).toBe(true);
  });

  it('remoteUpdatedAt 이 없는 기록도 열쇠를 만든다', () => {
    const k = tasksSyncConflictKey({
      googleTaskId: 'g',
      kind: 'remote-deleted',
      remoteUpdatedAt: undefined,
    });
    expect(k).toBe('g|remote-deleted|');
  });
});
