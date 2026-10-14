/**
 * Google Tasks 동기화 충돌 기록 — **기기 전용** 저장.
 *
 * ⚠️ 이 키를 `syncRegistry.ts` 의 `SYNC_REGISTRY` 에 **절대 등재하지 말 것.**
 *
 * 충돌은 "이 기기가 동기화하다가 본 일"의 기록이다. 드라이브 동기화에 실리면 다른 기기가
 * 같은 일을 또 기록하거나 옛 사본이 지운 기록을 되살린다(ADR-039/040/066 과 같은 모양).
 *
 * 구글에서 받은 내용이 들어 있으므로(ADR-136) 쌤핀 AI·AI 브릿지·돌아보기 숫자에 쓰지 않는다.
 * 설정 화면(TasksCard)만 읽는다.
 *
 * 읽기 실패·손상된 값은 "기록 없음"이다. 기록은 알려 주기 위한 보조 자료라, 읽지 못해서
 * 동기화가 멈추면 안 된다.
 */
import type {
  ConflictContent,
  TasksSyncConflict,
  TasksSyncConflictKind,
} from '@domain/entities/TasksSyncConflict';
import { TASKS_SYNC_CONFLICT_LIMIT } from '@domain/entities/TasksSyncConflict';

export const TASKS_SYNC_CONFLICTS_KEY = 'tasks-sync-conflicts';

const KINDS: readonly TasksSyncConflictKind[] = ['edit-edit', 'remote-deleted', 'local-deleted'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseContent(v: unknown): ConflictContent | null {
  if (!isRecord(v)) return null;
  if (typeof v['text'] !== 'string' || typeof v['completed'] !== 'boolean') return null;
  const notes = v['notes'];
  const dueDate = v['dueDate'];
  return {
    text: v['text'],
    ...(typeof notes === 'string' ? { notes } : {}),
    ...(typeof dueDate === 'string' ? { dueDate } : {}),
    completed: v['completed'],
  };
}

function parseConflict(v: unknown): TasksSyncConflict | null {
  if (!isRecord(v)) return null;
  const { id, kind, todoId, googleTaskId, detectedAt, remoteUpdatedAt } = v;
  if (
    typeof id !== 'string' ||
    typeof todoId !== 'string' ||
    typeof googleTaskId !== 'string' ||
    typeof detectedAt !== 'string' ||
    typeof kind !== 'string' ||
    !(KINDS as readonly string[]).includes(kind)
  ) {
    return null;
  }
  const local = parseContent(v['local']);
  if (!local) return null;
  const remote = v['remote'] === undefined ? undefined : parseContent(v['remote']);
  return {
    id,
    kind: kind as TasksSyncConflictKind,
    todoId,
    googleTaskId,
    detectedAt,
    ...(typeof remoteUpdatedAt === 'string' ? { remoteUpdatedAt } : {}),
    local,
    ...(remote ? { remote } : {}),
  };
}

/** 저장된 기록을 읽는다. 없거나 읽을 수 없으면 빈 목록. */
export async function readTasksSyncConflicts(): Promise<readonly TasksSyncConflict[]> {
  try {
    const { storage } = await import('@adapters/di/container');
    const raw = await storage.read<unknown>(TASKS_SYNC_CONFLICTS_KEY);
    if (!Array.isArray(raw)) return [];
    const out: TasksSyncConflict[] = [];
    for (const item of raw) {
      const parsed = parseConflict(item);
      if (parsed) out.push(parsed);
    }
    return out.slice(0, TASKS_SYNC_CONFLICT_LIMIT);
  } catch {
    return [];
  }
}

/** 기록을 통째로 저장한다. 실패하면 false(동기화를 막지 않는다). */
export async function writeTasksSyncConflicts(
  conflicts: readonly TasksSyncConflict[],
): Promise<boolean> {
  try {
    const { storage } = await import('@adapters/di/container');
    await storage.write<readonly TasksSyncConflict[]>(
      TASKS_SYNC_CONFLICTS_KEY,
      conflicts.slice(0, TASKS_SYNC_CONFLICT_LIMIT),
    );
    return true;
  } catch {
    return false;
  }
}

/** 기록을 모두 지운다. */
export async function clearTasksSyncConflictsStorage(): Promise<boolean> {
  try {
    const { storage } = await import('@adapters/di/container');
    await storage.remove(TASKS_SYNC_CONFLICTS_KEY);
    return true;
  } catch {
    return false;
  }
}
