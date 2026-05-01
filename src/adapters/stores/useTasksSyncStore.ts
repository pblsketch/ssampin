import { create } from 'zustand';
import type { GoogleTask, GoogleTaskList } from '@domain/ports/IGoogleTasksPort';
import type { Todo } from '@domain/entities/Todo';
import { generateUUID } from '@infrastructure/utils/uuid';

interface TasksSyncState {
  // 동기화 설정
  isEnabled: boolean;
  taskListId: string | null;
  taskListName: string | null;
  taskLists: readonly GoogleTaskList[];

  // 동기화 상태
  isSyncing: boolean;
  lastSyncedAt: string | null;
  error: string | null;

  // 모달 표시
  showScopeRequestModal: boolean;
  showTaskListPicker: boolean;

  /** 원격에서 삭제 대기 중인 Google Task ID 목록 (orphan: 로컬 record가 이미 사라진 항목) */
  pendingDeleteIds: readonly string[];

  // 액션
  enableSync: () => Promise<void>;
  disableSync: () => Promise<void>;
  setShowScopeRequestModal: (show: boolean) => void;
  setShowTaskListPicker: (show: boolean) => void;
  fetchTaskLists: () => Promise<void>;
  selectTaskList: (id: string, name: string) => Promise<void>;
  syncNow: () => Promise<void>;
  initialize: () => Promise<void>;
  /** 삭제 예약 (로컬 hard delete 시 호출) */
  markForRemoteDelete: (googleTaskId: string) => Promise<void>;
}

const STORAGE_KEY = 'tasks-sync-state';
const TASKS_SCOPE = 'https://www.googleapis.com/auth/tasks';

interface PersistedState {
  isEnabled: boolean;
  taskListId: string | null;
  taskListName: string | null;
  lastSyncedAt: string | null;
  pendingDeleteIds: readonly string[];
}

async function persistState(state: PersistedState): Promise<void> {
  const { storage } = await import('@adapters/di/container');
  await storage.write<PersistedState>(STORAGE_KEY, state);
}

// syncNow 동시 실행 방지 뮤텍스
let tasksSyncPromise: Promise<void> | null = null;

/** RFC3339 타임스탬프 비교용 안전 fallback */
function timestamp(value: string | undefined | null): string {
  return value ?? '';
}

/** 에러 객체에서 HTTP 상태코드 안전 추출 */
function errorCode(err: unknown): number | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const c = (err as { code: unknown }).code;
    if (typeof c === 'number') return c;
  }
  return undefined;
}

export const useTasksSyncStore = create<TasksSyncState>((set, get) => ({
  isEnabled: false,
  taskListId: null,
  taskListName: null,
  taskLists: [],
  isSyncing: false,
  lastSyncedAt: null,
  error: null,
  showScopeRequestModal: false,
  showTaskListPicker: false,
  pendingDeleteIds: [],

  enableSync: async () => {
    const { useCalendarSyncStore } = await import('./useCalendarSyncStore');
    const calendarState = useCalendarSyncStore.getState();

    if (!calendarState.isConnected) {
      set({ error: 'Google 계정이 연결되어 있지 않습니다. 먼저 구글 캘린더 연동을 완료해주세요.' });
      return;
    }

    try {
      const { calendarSyncRepo } = await import('@adapters/di/container');
      const tokens = await calendarSyncRepo.getAuthTokens();
      const granted = tokens?.grantedScopes ?? [];

      if (!granted.includes(TASKS_SCOPE)) {
        set({ showScopeRequestModal: true });
        return;
      }

      // Tasks 스코프 있음 → Task List 선택 모달 표시 + 즉시 로드
      set({ showTaskListPicker: true });
      await get().fetchTaskLists();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Tasks 동기화 활성화 중 오류가 발생했습니다.' });
    }
  },

  disableSync: async () => {
    set({
      isEnabled: false,
      taskListId: null,
      taskListName: null,
      lastSyncedAt: null,
      error: null,
      pendingDeleteIds: [],
    });

    try {
      await persistState({
        isEnabled: false,
        taskListId: null,
        taskListName: null,
        lastSyncedAt: null,
        pendingDeleteIds: [],
      });
    } catch (err) {
      console.error('[TasksSync] disableSync 저장 오류:', err);
    }
  },

  setShowScopeRequestModal: (show) => set({ showScopeRequestModal: show }),
  setShowTaskListPicker: (show) => set({ showTaskListPicker: show }),

  fetchTaskLists: async () => {
    try {
      const { authenticateGoogle, googleTasksPort } = await import('@adapters/di/container');
      const accessToken = await authenticateGoogle.getValidAccessToken();
      const lists = await googleTasksPort.listTaskLists(accessToken);
      set({ taskLists: lists });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Task List 조회 중 오류가 발생했습니다.' });
    }
  },

  selectTaskList: async (id, name) => {
    set({
      isEnabled: true,
      taskListId: id,
      taskListName: name,
      showTaskListPicker: false,
      error: null,
    });

    try {
      const state = get();
      await persistState({
        isEnabled: true,
        taskListId: id,
        taskListName: name,
        lastSyncedAt: state.lastSyncedAt,
        pendingDeleteIds: state.pendingDeleteIds,
      });
    } catch (err) {
      console.error('[TasksSync] selectTaskList 저장 오류:', err);
    }

    // 선택 즉시 동기화 실행
    await get().syncNow();
  },

  /**
   * 5단계 파이프라인 sync:
   * 0. PRE-FLIGHT — 뮤텍스 + 토큰 + 로컬 todos 스냅샷 로드
   * 1. PUSH-DELETE — pendingRemoteOp:'delete' + orphan pendingDeleteIds → 원격 삭제
   * 2. PUSH-CREATE — 신규 항목 (googleTaskId 없음) → 원격 생성
   * 3. PUSH-UPDATE — 수정된 항목 (pendingRemoteOp:'update') → 원격 갱신
   * 4. PULL — 원격 변경사항을 로컬에 반영 (last-write-wins, pendingRemoteOp 보호)
   * 5. RECONCILE — sync 도중 사용자가 추가/수정/삭제한 todo 보존 (race condition 방어)
   */
  syncNow: async () => {
    // 이미 진행 중인 동기화가 있으면 그 Promise를 기다림 (중복 실행 방지)
    if (tasksSyncPromise) {
      await tasksSyncPromise;
      return;
    }

    const state = get();
    if (!state.isEnabled || !state.taskListId) return;

    set({ isSyncing: true, error: null });
    const taskListId = state.taskListId;

    tasksSyncPromise = (async () => {
      try {
        const { authenticateGoogle, googleTasksPort, todoRepository } = await import('@adapters/di/container');
        const { useTodoStore } = await import('./useTodoStore');

        const accessToken = await authenticateGoogle.getValidAccessToken();

        // ── 0. PRE-FLIGHT ──
        const data0 = await todoRepository.getTodos();
        const initialTodos: readonly Todo[] = data0?.todos ?? [];
        // 작업용 맵 (id 기준)
        const workMap = new Map<string, Todo>(initialTodos.map((t) => [t.id, t]));
        const stamp = (): string => new Date().toISOString();

        // ── 1. PUSH-DELETE ──
        // (a) orphan pendingDeleteIds (로컬 record가 이미 사라진 googleTaskId)
        const orphanIds = [...get().pendingDeleteIds];
        if (orphanIds.length > 0) {
          for (const gid of orphanIds) {
            try {
              await googleTasksPort.deleteTask(accessToken, taskListId, gid);
            } catch (err) {
              const code = errorCode(err);
              if (code !== 404) {
                // 404가 아닌 진짜 에러는 다음 sync에서 재시도하도록 큐에 남길 수도 있으나,
                // 단순화: 일단 무시하고 큐만 비움 (404가 대부분)
                console.warn('[TasksSync] orphan delete 실패:', gid, err);
              }
            }
          }
          set({ pendingDeleteIds: [] });
        }

        // (b) 로컬 todo 중 pendingRemoteOp:'delete' 항목
        for (const todo of [...workMap.values()]) {
          if (todo.pendingRemoteOp !== 'delete' || !todo.googleTaskId) continue;
          try {
            await googleTasksPort.deleteTask(accessToken, taskListId, todo.googleTaskId);
            workMap.set(todo.id, {
              ...todo,
              googleTaskId: undefined,
              googleTaskListId: undefined,
              pendingRemoteOp: undefined,
              remoteDeletedAt: stamp(),
              lastSyncedAt: stamp(),
            });
          } catch (err) {
            const code = errorCode(err);
            if (code === 404) {
              // 이미 원격에서 사라짐 → 마킹만 클리어
              workMap.set(todo.id, {
                ...todo,
                googleTaskId: undefined,
                googleTaskListId: undefined,
                pendingRemoteOp: undefined,
                remoteDeletedAt: stamp(),
                lastSyncedAt: stamp(),
              });
            } else {
              console.error('[TasksSync] PUSH-DELETE 실패:', todo.id, err);
              // pendingRemoteOp 유지 → 다음 sync 재시도
            }
          }
        }

        // ── 2. PUSH-CREATE ──
        for (const todo of [...workMap.values()]) {
          if (todo.pendingRemoteOp !== 'create') continue;
          if (todo.googleTaskId) continue;          // 이미 원격 ID 있음
          if (todo.archivedAt || todo.remoteDeletedAt) continue;  // archive/tombstone 제외
          try {
            const created = await googleTasksPort.createTask(accessToken, taskListId, {
              title: todo.text,
              status: todo.completed ? 'completed' : 'needsAction',
              ...(todo.dueDate ? { due: `${todo.dueDate}T00:00:00.000Z` } : {}),
              ...(todo.notes ? { notes: todo.notes } : {}),
            });
            workMap.set(todo.id, {
              ...todo,
              googleTaskId: created.id,
              googleTaskListId: taskListId,
              pendingRemoteOp: undefined,
              lastSyncedAt: stamp(),
            });
          } catch (err) {
            console.error('[TasksSync] PUSH-CREATE 실패:', todo.id, err);
            // pendingRemoteOp 유지 → 다음 sync 재시도
          }
        }

        // ── 3. PUSH-UPDATE ──
        for (const todo of [...workMap.values()]) {
          if (todo.pendingRemoteOp !== 'update' || !todo.googleTaskId) continue;
          try {
            await googleTasksPort.updateTask(accessToken, taskListId, todo.googleTaskId, {
              title: todo.text,
              status: todo.completed ? 'completed' : 'needsAction',
              ...(todo.dueDate ? { due: `${todo.dueDate}T00:00:00.000Z` } : {}),
              ...(todo.notes ? { notes: todo.notes } : {}),
            });
            workMap.set(todo.id, {
              ...todo,
              pendingRemoteOp: undefined,
              lastSyncedAt: stamp(),
            });
          } catch (err) {
            const code = errorCode(err);
            if (code === 404) {
              // 원격에 없음 → fallback create
              try {
                const created = await googleTasksPort.createTask(accessToken, taskListId, {
                  title: todo.text,
                  status: todo.completed ? 'completed' : 'needsAction',
                  ...(todo.dueDate ? { due: `${todo.dueDate}T00:00:00.000Z` } : {}),
                  ...(todo.notes ? { notes: todo.notes } : {}),
                });
                workMap.set(todo.id, {
                  ...todo,
                  googleTaskId: created.id,
                  googleTaskListId: taskListId,
                  pendingRemoteOp: undefined,
                  lastSyncedAt: stamp(),
                });
              } catch (createErr) {
                console.error('[TasksSync] update→create fallback 실패:', todo.id, createErr);
              }
            } else {
              console.error('[TasksSync] PUSH-UPDATE 실패:', todo.id, err);
            }
          }
        }

        // ── 4. PULL ──
        const remoteTasks: readonly GoogleTask[] = await googleTasksPort.listTasks(accessToken, taskListId);
        const localByGoogleId = new Map<string, Todo>();
        for (const t of workMap.values()) {
          if (t.googleTaskId) localByGoogleId.set(t.googleTaskId, t);
        }

        // 외부 삭제 판정: deleted:true tombstone만 신뢰한다.
        // hidden:true는 "완료 처리 + 목록에서 가림" 상태이며, Google Tasks 앱은
        // 단순 완료 체크 시에도 hidden:true를 마킹할 수 있어서 hidden을 삭제로 보면
        // "완료 체크 = 삭제"로 잘못 동작한다. 따라서 hidden은 일반 completed 동기화로 흘려보낸다.
        // showDeleted=true로 호출하므로 진짜 삭제된 task는 deleted:true tombstone으로 도착한다.
        const isExternallyDeleted = (t: GoogleTask): boolean => !!t.deleted;

        // 이번 sync에서 외부 삭제로 hard delete한 todo id 집합.
        // RECONCILE 단계가 storage 옛 값을 보고 부활시키지 않도록 가드용.
        const hardDeletedIds = new Set<string>();

        for (const remote of remoteTasks) {
          const local = localByGoogleId.get(remote.id);

          // 4-1. 원격에서 삭제됨 (deleted:true) 또는 Google 앱에서 hidden 처리됨 (완료 후 clear)
          // 사용자가 Google Tasks 앱에서 의도적으로 지운 것 → 로컬도 삭제.
          // 단, archivedAt 있는 항목은 이미 사용자가 별도 의도 표시했으므로 record 유지(연동만 해제).
          if (isExternallyDeleted(remote)) {
            if (local) {
              if (local.archivedAt) {
                workMap.set(local.id, {
                  ...local,
                  googleTaskId: undefined,
                  googleTaskListId: undefined,
                  remoteDeletedAt: stamp(),
                  lastSyncedAt: stamp(),
                });
              } else {
                // 일반 todo는 원격 삭제 = 로컬 삭제 (사용자 기대)
                workMap.delete(local.id);
                hardDeletedIds.add(local.id);
              }
            }
            // localByGoogleId에서도 제거: 4-4가 "응답에 있으니 삭제 아님"으로 오판하지 않도록
            localByGoogleId.delete(remote.id);
            continue;
          }

          if (!local) {
            // 4-2. 원격에만 있음 → 신규 추가
            // 단, remoteDeletedAt이 있는 같은 text의 로컬이 있으면 좀비로 간주하고 무시
            const ghosted = [...workMap.values()].find(
              (t) => !!t.remoteDeletedAt && t.text === remote.title,
            );
            if (ghosted) continue;

            const newId = generateUUID();
            workMap.set(newId, {
              id: newId,
              text: remote.title,
              completed: remote.status === 'completed',
              createdAt: stamp(),
              updatedAt: stamp(),
              lastSyncedAt: stamp(),
              googleTaskId: remote.id,
              googleTaskListId: taskListId,
              ...(remote.due ? { dueDate: remote.due.substring(0, 10) } : {}),
              ...(remote.notes ? { notes: remote.notes } : {}),
            });
          } else {
            // 4-3. 양쪽 다 있음
            // 사용자가 로컬 변경 중이면(pendingRemoteOp 살아있음) PULL이 덮어쓰지 않음
            if (local.pendingRemoteOp) continue;

            // last-write-wins (remote.updated > local.lastSyncedAt이면 원격이 더 신선함)
            const remoteUpdated = timestamp(remote.updated);
            const localSynced = timestamp(local.lastSyncedAt);
            if (remoteUpdated > localSynced) {
              workMap.set(local.id, {
                ...local,
                text: remote.title,
                completed: remote.status === 'completed',
                ...(remote.due ? { dueDate: remote.due.substring(0, 10) } : { dueDate: undefined }),
                ...(remote.notes ? { notes: remote.notes } : {}),
                lastSyncedAt: stamp(),
              });
            }
          }
        }

        // 4-4. 로컬에 googleTaskId 있는데 원격 응답에 "살아있는 task"로 없음 → 외부 삭제로 간주.
        // tombstone(deleted/hidden) 항목은 4-1에서 이미 처리했으므로 여기서는 활성 task만 카운트한다.
        const remoteIds = new Set(
          remoteTasks.filter((t) => !isExternallyDeleted(t)).map((t) => t.id),
        );
        for (const todo of [...workMap.values()]) {
          if (!todo.googleTaskId) continue;
          if (todo.pendingRemoteOp) continue;          // 사용자가 변경 중인 항목 보호 (PUSH가 fallback create로 처리)
          if (remoteIds.has(todo.googleTaskId)) continue;

          if (todo.archivedAt) {
            // archive record는 보존, 연동만 해제
            workMap.set(todo.id, {
              ...todo,
              googleTaskId: undefined,
              googleTaskListId: undefined,
              remoteDeletedAt: stamp(),
              lastSyncedAt: stamp(),
            });
          } else {
            // 일반 todo는 hard delete (Google Tasks 외부 삭제 → 쌤핀에서도 삭제)
            workMap.delete(todo.id);
            hardDeletedIds.add(todo.id);
          }
        }

        // ── 5. RECONCILE (race condition 방어) ──
        const data1 = await todoRepository.getTodos();
        const currentTodos: readonly Todo[] = data1?.todos ?? [];
        const currentMap = new Map<string, Todo>(currentTodos.map((t) => [t.id, t]));
        const initialIdSet = new Set(initialTodos.map((t) => t.id));

        // (a) sync 도중 새로 추가된 todo (workMap에 없는데 storage에 있음) → 보존
        // 단, 이번 sync에서 외부 삭제로 hard delete한 항목은 부활시키지 않는다.
        for (const t of currentTodos) {
          if (workMap.has(t.id)) continue;
          if (hardDeletedIds.has(t.id)) continue;
          workMap.set(t.id, t);
        }

        // (b) sync 도중 사용자가 수정한 todo → 사용자 변경 우선 + sync 메타데이터 합치기
        const initialMap = new Map<string, Todo>(initialTodos.map((t) => [t.id, t]));
        for (const stored of currentTodos) {
          const synced = workMap.get(stored.id);
          if (!synced) continue;
          const initial = initialMap.get(stored.id);
          const storedUpdated = timestamp(stored.updatedAt) || timestamp(stored.createdAt);
          const initialUpdated = timestamp(initial?.updatedAt) || timestamp(initial?.createdAt);
          if (storedUpdated > initialUpdated) {
            // 사용자가 sync 도중 수정 → 사용자 값 우선, sync 결과의 ID/타임스탬프만 보존
            workMap.set(stored.id, {
              ...stored,
              googleTaskId: stored.googleTaskId ?? synced.googleTaskId,
              googleTaskListId: stored.googleTaskListId ?? synced.googleTaskListId,
              lastSyncedAt: synced.lastSyncedAt ?? stored.lastSyncedAt,
              pendingRemoteOp:
                stored.pendingRemoteOp
                ?? (stored.archivedAt
                  ? (stored.googleTaskId ? 'delete' : undefined)
                  : ((stored.googleTaskId ?? synced.googleTaskId) ? 'update' : 'create')),
            });
          }
        }

        // (c) sync 도중 사용자가 삭제한 todo (initial에 있고 workMap에 있는데 currentMap에 없음) → 삭제 적용
        for (const id of [...workMap.keys()]) {
          if (!currentMap.has(id) && initialIdSet.has(id)) {
            workMap.delete(id);
          }
        }

        // ── 저장 ──
        const finalTodos: readonly Todo[] = [...workMap.values()];
        await todoRepository.saveTodos({ todos: finalTodos, categories: data1?.categories });

        const lastSyncedAt = stamp();
        set({ lastSyncedAt, isSyncing: false });

        // 스토어 갱신
        await useTodoStore.getState().refresh();

        // 상태 영속
        await persistState({
          isEnabled: get().isEnabled,
          taskListId: get().taskListId,
          taskListName: get().taskListName,
          lastSyncedAt,
          pendingDeleteIds: get().pendingDeleteIds,
        });
      } catch (err) {
        console.error('[TasksSync] syncNow 오류:', err);
        set({
          isSyncing: false,
          error: err instanceof Error ? err.message : '동기화 중 오류가 발생했습니다.',
        });
      }
    })();

    try {
      await tasksSyncPromise;
    } finally {
      tasksSyncPromise = null;
    }
  },

  initialize: async () => {
    try {
      const { storage } = await import('@adapters/di/container');
      const saved = await storage.read<PersistedState>(STORAGE_KEY);
      if (!saved) return;

      set({
        isEnabled: saved.isEnabled,
        taskListId: saved.taskListId,
        taskListName: saved.taskListName,
        lastSyncedAt: saved.lastSyncedAt,
        pendingDeleteIds: saved.pendingDeleteIds ?? [],
      });
    } catch (err) {
      console.error('[TasksSync] initialize 오류:', err);
    }
  },

  markForRemoteDelete: async (googleTaskId) => {
    const current = get().pendingDeleteIds;
    if (current.includes(googleTaskId)) return;
    const next = [...current, googleTaskId];
    set({ pendingDeleteIds: next });

    try {
      const state = get();
      await persistState({
        isEnabled: state.isEnabled,
        taskListId: state.taskListId,
        taskListName: state.taskListName,
        lastSyncedAt: state.lastSyncedAt,
        pendingDeleteIds: next,
      });
    } catch (err) {
      console.error('[TasksSync] markForRemoteDelete 저장 오류:', err);
    }
  },
}));
