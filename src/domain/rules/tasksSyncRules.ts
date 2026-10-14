/**
 * Google Tasks 동기화 규칙 — 충돌 판정·기록 합치기·쓰기 payload 조립.
 *
 * 순수 함수만 둔다. 도메인은 시계·난수·외부 패키지에 의존하지 않으므로 기록의 `id` 와
 * `detectedAt` 은 호출 쪽이 인자로 넘긴다.
 *
 * ★승자는 바꾸지 않는다 — 쌤핀이 이긴다. 이 파일의 판정은 "알리고 남길지"만 정한다.
 */
import type { Todo } from '../entities/Todo';
import type { GoogleTask } from '../ports/IGoogleTasksPort';
import {
  TASKS_SYNC_CLOCK_TOLERANCE_MS,
  TASKS_SYNC_CONFLICT_LIMIT,
  type ConflictContent,
  type TasksSyncConflict,
  type TasksSyncConflictKind,
} from '../entities/TasksSyncConflict';
import { todoContentDiffers } from './googleSourcedData';

/** 구글 Tasks 의 `due` 는 날짜만 의미가 있다. 날짜 뒤에 붙는 시각은 쓰지 않는다. */
const DUE_TIME_SUFFIX = 'T00:00:00.000Z';

// ───────────────────────── 쓰기 payload ─────────────────────────

/** 생성(POST)용 — 값이 없는 칸은 **보내지 않는다**(`null` 도 보내지 않는다). */
export interface GoogleTaskCreatePayload {
  readonly title: string;
  readonly status: 'needsAction' | 'completed';
  readonly due?: string;
  readonly notes?: string;
}

/** 수정(PATCH)용 — 마감일·메모를 지웠으면 `null` 로 보내 구글 쪽도 지운다. */
export interface GoogleTaskUpdatePayload {
  readonly title: string;
  readonly status: 'needsAction' | 'completed';
  readonly due: string | null;
  readonly notes: string | null;
}

export function toGoogleTaskCreatePayload(todo: Todo): GoogleTaskCreatePayload {
  return {
    title: todo.text,
    status: todo.completed ? 'completed' : 'needsAction',
    ...(todo.dueDate ? { due: `${todo.dueDate}${DUE_TIME_SUFFIX}` } : {}),
    ...(todo.notes ? { notes: todo.notes } : {}),
  };
}

export function toGoogleTaskUpdatePayload(todo: Todo): GoogleTaskUpdatePayload {
  return {
    title: todo.text,
    status: todo.completed ? 'completed' : 'needsAction',
    due: todo.dueDate ? `${todo.dueDate}${DUE_TIME_SUFFIX}` : null,
    notes: todo.notes ? todo.notes : null,
  };
}

// ───────────────────────── 가져오기 변환 ─────────────────────────

/** 구글 `due`(RFC3339) → 쌤핀 `YYYY-MM-DD`. 없으면 없음. */
export function remoteDueToDate(due: string | undefined): string | undefined {
  return due ? due.substring(0, 10) : undefined;
}

/** 구글 `notes` → 쌤핀 메모. 구글은 비운 메모를 필드째 빼므로 **없음 = 지움**이다. */
export function remoteNotesToLocal(notes: string | undefined): string | undefined {
  return notes && notes.trim() !== '' ? notes : undefined;
}

export function localTodoContent(todo: Todo): ConflictContent {
  return {
    text: todo.text,
    ...(todo.notes ? { notes: todo.notes } : {}),
    ...(todo.dueDate ? { dueDate: todo.dueDate } : {}),
    completed: todo.completed,
  };
}

export function remoteTaskContent(remote: GoogleTask): ConflictContent {
  const notes = remoteNotesToLocal(remote.notes);
  const dueDate = remoteDueToDate(remote.due);
  return {
    text: remote.title,
    ...(notes !== undefined ? { notes } : {}),
    ...(dueDate !== undefined ? { dueDate } : {}),
    completed: remote.status === 'completed',
  };
}

// ───────────────────────── 충돌 판정 ─────────────────────────

/**
 * 구글 `updated` 가 `lastSyncedAt` 보다 허용 오차를 넘어 뒤인가.
 * 기준이 되는 `lastSyncedAt` 이 없거나 읽을 수 없으면 "뒤"로 본다(비교할 기준이 없다).
 * 구글 `updated` 를 읽을 수 없으면 뒤로 보지 않는다(근거 없이 알리지 않는다).
 */
function remoteIsNewer(remoteUpdated: string, lastSyncedAt: string | undefined): boolean {
  const remoteMs = Date.parse(remoteUpdated);
  if (Number.isNaN(remoteMs)) return false;
  const syncedMs = lastSyncedAt === undefined ? Number.NaN : Date.parse(lastSyncedAt);
  if (Number.isNaN(syncedMs)) return true;
  return remoteMs - syncedMs > TASKS_SYNC_CLOCK_TOLERANCE_MS;
}

export interface DetectTasksConflictInput {
  readonly todo: Todo;
  /** 올리기 전에 읽어 둔 구글 쪽 상태. 스냅샷에 아예 없으면 `undefined`. */
  readonly remote: GoogleTask | undefined;
  /** 지금 동기화 대상으로 고른 구글 목록 ID. */
  readonly taskListId: string;
}

/**
 * 이 할 일이 올라가기(또는 지워지기) 직전, 구글 쪽과 충돌하는가.
 *
 * 판정 대상이 아닌 것: 구글과 연결되지 않은 것, 다른(옛) 목록에 연결된 것,
 * 보류 중인 변경이 없거나 `create` 인 것(쌤핀 전용 칸만 바뀐 수정은 보류가 서지 않는다),
 * 구글 하위 할 일.
 */
export function detectTasksConflict(input: DetectTasksConflictInput): TasksSyncConflictKind | null {
  const { todo, remote, taskListId } = input;
  const op = todo.pendingRemoteOp;
  if (!todo.googleTaskId) return null;
  if (todo.googleTaskListId !== undefined && todo.googleTaskListId !== taskListId) return null;
  if (op !== 'update' && op !== 'delete') return null;

  // 구글에서 이미 지워졌다 — 쌤핀에서 고친 경우만 알린다(지우려던 것은 잃을 내용이 없다).
  if (remote === undefined || remote.deleted === true) {
    return op === 'update' ? 'remote-deleted' : null;
  }
  if (remote.parent) return null;

  if (!remoteIsNewer(remote.updated, todo.lastSyncedAt)) return null;
  const content = remoteTaskContent(remote);
  if (!todoContentDiffers(localTodoContent(todo), content)) return null;

  return op === 'update' ? 'edit-edit' : 'local-deleted';
}

// ───────────────────────── 기록 만들기·합치기 ─────────────────────────

export interface BuildConflictInput {
  readonly id: string;
  readonly detectedAt: string;
  readonly kind: TasksSyncConflictKind;
  readonly todo: Todo;
  /** 구글 쪽 상태(삭제 표시 포함). 스냅샷에 없으면 `undefined`. */
  readonly remote: GoogleTask | undefined;
}

export function buildTasksSyncConflict(input: BuildConflictInput): TasksSyncConflict {
  const { id, detectedAt, kind, todo, remote } = input;
  return {
    id,
    kind,
    todoId: todo.id,
    googleTaskId: todo.googleTaskId ?? '',
    detectedAt,
    ...(remote?.updated ? { remoteUpdatedAt: remote.updated } : {}),
    local: localTodoContent(todo),
    ...(remote ? { remote: remoteTaskContent(remote) } : {}),
  };
}

/** 같은 충돌을 다시 기록하지 않기 위한 열쇠. 올리기가 실패해 다음 회차에 다시 걸리는 경우를 막는다. */
export function tasksSyncConflictKey(
  c: Pick<TasksSyncConflict, 'googleTaskId' | 'kind' | 'remoteUpdatedAt'>,
): string {
  return `${c.googleTaskId}|${c.kind}|${c.remoteUpdatedAt ?? ''}`;
}

export interface MergeConflictsResult {
  /** 합친 기록(최신이 앞, 개수 제한 적용). */
  readonly merged: readonly TasksSyncConflict[];
  /** 이번에 **새로** 들어간 기록 — 알림 개수의 기준. */
  readonly added: readonly TasksSyncConflict[];
}

/**
 * 새 기록을 기존 기록 앞에 합친다. 이미 있는 열쇠는 넣지 않는다(새 기록들 사이의 중복도).
 * 시간으로 지우지 않고 개수만 제한한다.
 */
export function mergeTasksSyncConflicts(
  existing: readonly TasksSyncConflict[],
  incoming: readonly TasksSyncConflict[],
  limit: number = TASKS_SYNC_CONFLICT_LIMIT,
): MergeConflictsResult {
  const seen = new Set(existing.map(tasksSyncConflictKey));
  const added: TasksSyncConflict[] = [];
  for (const c of incoming) {
    const key = tasksSyncConflictKey(c);
    if (seen.has(key)) continue;
    seen.add(key);
    added.push(c);
  }
  const merged = [...added, ...existing].slice(0, Math.max(0, limit));
  return { merged, added };
}
