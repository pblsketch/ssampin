# Google Tasks 동기화 정밀화 (Design v0.1)

> 작성일: 2026-05-01
> 관련 Plan: [`docs/01-plan/features/google-tasks-sync-fix.plan.md`](e:/github/ssampin/docs/01-plan/features/google-tasks-sync-fix.plan.md)

---

## 1. 도메인 변경 (`src/domain/entities/Todo.ts`)

### 1-1. 신규 필드 추가 (모두 optional)

```typescript
export interface Todo {
  // ... 기존 필드 유지 ...

  // === Google Tasks 동기화 메타데이터 (v2.0.2~) ===

  /**
   * 다음 sync 사이클에서 Google Tasks에 적용할 작업.
   * - 'create': 원격에 신규 생성 필요 (= googleTaskId 없는 신규 항목)
   * - 'update': 원격 업데이트 필요 (로컬에서 수정된 항목)
   * - 'delete': 원격에서 삭제 필요 (아카이브/영구삭제된 항목)
   * - undefined: 원격과 동기화된 상태
   */
  readonly pendingRemoteOp?: 'create' | 'update' | 'delete';

  /** 로컬에서 마지막으로 사용자가 수정한 시각 (ISO 8601) */
  readonly updatedAt?: string;

  /** Google Tasks와 마지막으로 동기화 성공한 시각 (ISO 8601) */
  readonly lastSyncedAt?: string;

  /**
   * Google Tasks 쪽에서 의도적으로 삭제됐음을 마킹하는 tombstone.
   * 다음 sync에서 이 todo를 다시 push하지 않기 위함 (mirror Bug2).
   * UI에서는 보이지만 sync에서는 이미 'detached' 상태로 간주.
   */
  readonly remoteDeletedAt?: string;
}
```

### 1-2. 마이그레이션 규칙 (안전 우선)

| 기존 필드 상태 | 신규 필드 초기화 |
|---------------|-----------------|
| `googleTaskId` 있음, `archivedAt` 없음 | `pendingRemoteOp = undefined` (이미 동기화된 것으로 가정), `lastSyncedAt = createdAt` |
| `googleTaskId` 있음, `archivedAt` 있음 | `pendingRemoteOp = 'delete'` 마킹 (다음 sync에서 원격 정리) |
| `googleTaskId` 없음, `archivedAt` 없음 | `pendingRemoteOp = undefined` (마이그레이션 시 push 안 함, 사용자 수정 시 'create'로 마킹) |
| `googleTaskId` 없음, `archivedAt` 있음 | `pendingRemoteOp = undefined` (이미 archive, 원격에도 없음 → 무시) |

**핵심 원칙: 마이그레이션 시 자동 push는 안 함.** 사용자가 다음번에 todo를 수정/추가/삭제할 때부터 정상 sync 흐름 진입.

마이그레이션 코드 위치: `useTodoStore.load()` / `useTodoStore.refresh()` 내부 (`migrated` 단계).

---

## 2. Use Case 변경 (`src/usecases/todo/ManageTodos.ts`)

### 2-1. mutation 메서드들 — 자동 메타데이터 부여

모든 변경(add/update/toggle/subTask)에서 다음 두 필드를 자동 부여:

```typescript
const now = new Date().toISOString();

return {
  ...existingTodo,
  ...changes,
  updatedAt: now,
  // pendingRemoteOp 결정 규칙:
  // - googleTaskId 없으면 → 'create'
  // - googleTaskId 있으면 → 'update'
  // - 단, archivedAt이 함께 있다면 → 'delete' (archive 우선)
  pendingRemoteOp:
    existingTodo.archivedAt
      ? (existingTodo.googleTaskId ? 'delete' : undefined)
      : (existingTodo.googleTaskId ? 'update' : 'create'),
};
```

### 2-2. `add(todo)` 변경

```typescript
async add(todo: Todo): Promise<void> {
  const now = new Date().toISOString();
  const enriched: Todo = {
    ...todo,
    updatedAt: now,
    pendingRemoteOp: 'create',  // 신규 항목은 무조건 create 큐
    // googleTaskId/lastSyncedAt은 sync 성공 시 부여됨
  };
  // ... 기존 저장 로직 ...
}
```

### 2-3. `archiveCompleted()` 재작성 (Bug 2 핵심 픽스)

```typescript
async archiveCompleted(): Promise<{ archivedCount: number; pendingDeleteIds: readonly string[] }> {
  const data = await this.todoRepository.getTodos();
  const todos = data?.todos ?? [];
  const now = new Date().toISOString();
  const pendingDeleteIds: string[] = [];

  let archivedCount = 0;
  const updated = todos.map((todo) => {
    if (todo.completed && !todo.archivedAt) {
      archivedCount++;
      // Google Tasks와 연동된 항목은 원격 삭제 큐에 등록
      if (todo.googleTaskId) {
        pendingDeleteIds.push(todo.googleTaskId);
      }
      return {
        ...todo,
        archivedAt: now,
        updatedAt: now,
        // 원격 연동된 항목만 'delete' 큐, 비연동 항목은 그냥 archive
        pendingRemoteOp: todo.googleTaskId ? 'delete' as const : undefined,
      };
    }
    return todo;
  });

  await this.todoRepository.saveTodos({ todos: updated, categories: data?.categories });
  return { archivedCount, pendingDeleteIds };
}
```

**호출 측(`useTodoStore.archiveCompleted`)에서 `pendingDeleteIds`를 `useTasksSyncStore.markForRemoteDelete`에 전달.**

### 2-4. `deleteArchived(ids?)` 재작성 (영구 삭제 시 원격 정리)

```typescript
async deleteArchived(ids?: string[]): Promise<{ deletedCount: number; pendingDeleteIds: readonly string[] }> {
  const data = await this.todoRepository.getTodos();
  const todos = data?.todos ?? [];

  // 삭제 대상 식별
  const willDelete = ids
    ? todos.filter((t) => ids.includes(t.id))
    : todos.filter((t) => !!t.archivedAt);

  // googleTaskId가 있는 항목만 원격 삭제 큐로
  const pendingDeleteIds = willDelete
    .filter((t) => !!t.googleTaskId && t.pendingRemoteOp !== 'delete')  // 이미 delete 큐에 있는 항목은 useTasksSyncStore에서 처리
    .map((t) => t.googleTaskId as string);

  // 로컬에서는 즉시 제거 (영구 삭제는 hard delete)
  const remaining = ids
    ? todos.filter((t) => !ids.includes(t.id))
    : todos.filter((t) => !t.archivedAt);

  await this.todoRepository.saveTodos({ todos: remaining, categories: data?.categories });
  return { deletedCount: willDelete.length, pendingDeleteIds };
}
```

### 2-5. `restoreFromArchive(id)` 재작성

```typescript
async restoreFromArchive(id: string): Promise<void> {
  const data = await this.todoRepository.getTodos();
  const todos = data?.todos ?? [];
  const now = new Date().toISOString();
  const updated = todos.map((todo) => {
    if (todo.id !== id) return todo;
    return {
      ...todo,
      archivedAt: undefined,
      completed: false,
      updatedAt: now,
      // archive 시 pendingRemoteOp가 'delete'였을 수 있음 → 복원 시 재생성 필요
      // googleTaskId가 살아있으면 update, 없으면 create
      pendingRemoteOp: todo.googleTaskId ? 'update' as const : 'create' as const,
    };
  });
  await this.todoRepository.saveTodos({ todos: updated, categories: data?.categories });
}
```

**주의**: archive 후 sync로 원격에서 이미 삭제됐다면 `googleTaskId`가 살아있더라도 원격엔 없음 → sync의 PUSH-UPDATE 단계에서 404 발생 → fallback으로 create 시도. (sync에서 처리)

---

## 3. Sync 알고리즘 (`src/adapters/stores/useTasksSyncStore.ts:syncNow`)

### 3-1. 5단계 파이프라인

```
┌──────────────────────────────────────────────────────────┐
│ 0. PRE-FLIGHT     | 뮤텍스 + 토큰 + 로컬 todos 스냅샷 로드  │
├──────────────────────────────────────────────────────────┤
│ 1. PUSH-DELETE    | pendingDeleteIds + pendingRemoteOp:'delete'│
│                   | → googleTasksPort.deleteTask()           │
│                   | → 로컬 record는 archivedAt + remoteDeletedAt│
│                   |   유지 (UI에 archive로 보임)              │
├──────────────────────────────────────────────────────────┤
│ 2. PUSH-CREATE    | googleTaskId 없음 + pendingRemoteOp:'create'│
│                   | → googleTasksPort.createTask()           │
│                   | → 로컬에 googleTaskId/lastSyncedAt 부여   │
├──────────────────────────────────────────────────────────┤
│ 3. PUSH-UPDATE    | googleTaskId 있음 + pendingRemoteOp:'update'│
│                   | → googleTasksPort.updateTask()           │
│                   | → 404 시 fallback createTask()           │
├──────────────────────────────────────────────────────────┤
│ 4. PULL           | listTasks() → 매칭 → 신규/업데이트 적용   │
│                   | 로컬에 없는 원격 → 추가                   │
│                   | 로컬에 있고 lastSyncedAt < remote.updated │
│                   | → last-write-wins                        │
│                   | 원격에서 삭제됨 (deleted:true) → 로컬에   │
│                   |   remoteDeletedAt 마킹 (push 차단)       │
├──────────────────────────────────────────────────────────┤
│ 5. RECONCILE      | storage 재읽기 → sync 도중 추가/수정된    │
│                   | todos를 머지 (id 기준)                    │
│                   | → 사용자 변경 사항 보존                    │
└──────────────────────────────────────────────────────────┘
```

### 3-2. 의사 코드 (핵심)

```typescript
syncNow: async () => {
  if (tasksSyncPromise) return tasksSyncPromise;

  tasksSyncPromise = (async () => {
    const accessToken = await authenticateGoogle.getValidAccessToken();
    const taskListId = get().taskListId!;

    // ── 0. PRE-FLIGHT ──
    const data0 = await todoRepository.getTodos();
    const initialTodos = data0?.todos ?? [];
    // 작업용 맵 — id 기준
    const workMap = new Map<string, Todo>(initialTodos.map((t) => [t.id, t]));

    // ── 1. PUSH-DELETE ──
    // (a) pendingDeleteIds (orphan, 이미 로컬에 없는 googleTaskId)
    const orphanDeleteIds = [...get().pendingDeleteIds];
    for (const gid of orphanDeleteIds) {
      try {
        await googleTasksPort.deleteTask(accessToken, taskListId, gid);
      } catch (err) {
        // 이미 없거나 권한 문제 — 무시
        console.warn('[TasksSync] orphan delete 실패:', gid, err);
      }
    }
    set({ pendingDeleteIds: [] });

    // (b) 로컬 todos 중 pendingRemoteOp:'delete' 항목
    for (const todo of [...workMap.values()]) {
      if (todo.pendingRemoteOp !== 'delete' || !todo.googleTaskId) continue;
      try {
        await googleTasksPort.deleteTask(accessToken, taskListId, todo.googleTaskId);
        // 로컬: googleTaskId 제거 + remoteDeletedAt 마킹 + pendingRemoteOp 클리어
        // (archivedAt 유지 — UI는 archive 영역에 표시)
        const cleared: Todo = {
          ...todo,
          googleTaskId: undefined,
          googleTaskListId: undefined,
          pendingRemoteOp: undefined,
          remoteDeletedAt: new Date().toISOString(),
          lastSyncedAt: new Date().toISOString(),
        };
        workMap.set(todo.id, cleared);
      } catch (err) {
        // 404면 이미 원격에 없음 → 마킹만 클리어
        if ((err as { code?: number }).code === 404) {
          workMap.set(todo.id, { ...todo, googleTaskId: undefined, pendingRemoteOp: undefined });
        }
        // 기타 에러는 다음 sync에서 재시도 (pendingRemoteOp 유지)
      }
    }

    // ── 2. PUSH-CREATE ──
    for (const todo of [...workMap.values()]) {
      if (todo.pendingRemoteOp !== 'create' || todo.googleTaskId) continue;
      if (todo.archivedAt || todo.remoteDeletedAt) continue;  // 마이그레이션·tombstone 항목 제외
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
          lastSyncedAt: new Date().toISOString(),
        });
      } catch (err) {
        // 다음 sync에서 재시도 (pendingRemoteOp 유지)
        console.error('[TasksSync] PUSH-CREATE 실패:', todo.id, err);
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
          lastSyncedAt: new Date().toISOString(),
        });
      } catch (err) {
        // 404 시 fallback create
        if ((err as { code?: number }).code === 404) {
          try {
            const created = await googleTasksPort.createTask(accessToken, taskListId, {
              title: todo.text,
              status: todo.completed ? 'completed' : 'needsAction',
              ...(todo.dueDate ? { due: `${todo.dueDate}T00:00:00.000Z` } : {}),
            });
            workMap.set(todo.id, {
              ...todo,
              googleTaskId: created.id,
              googleTaskListId: taskListId,
              pendingRemoteOp: undefined,
              lastSyncedAt: new Date().toISOString(),
            });
          } catch (createErr) {
            console.error('[TasksSync] update→create fallback 실패:', todo.id, createErr);
          }
        }
      }
    }

    // ── 4. PULL ──
    const remoteTasks = await googleTasksPort.listTasks(accessToken, taskListId);
    // 단, pendingRemoteOp가 남아있는 로컬은 PULL이 덮어쓰지 않음 (사용자 변경 보호)
    const localByGoogleId = new Map<string, Todo>();
    for (const t of workMap.values()) {
      if (t.googleTaskId) localByGoogleId.set(t.googleTaskId, t);
    }

    const now = new Date().toISOString();
    for (const remote of remoteTasks) {
      const local = localByGoogleId.get(remote.id);

      // 4-1. 원격에서 삭제됨 (deleted:true)
      if (remote.deleted) {
        if (local) {
          workMap.set(local.id, {
            ...local,
            googleTaskId: undefined,
            googleTaskListId: undefined,
            remoteDeletedAt: now,
            lastSyncedAt: now,
          });
        }
        continue;
      }

      if (!local) {
        // 4-2. 원격에만 있음 → 신규 추가
        // 단, 같은 googleTaskId가 remoteDeletedAt 있는 로컬 항목과 매칭되면 무시
        const ghosted = [...workMap.values()].find(
          (t) => t.remoteDeletedAt && t.text === remote.title,
        );
        if (ghosted) continue;

        const newId = generateUUID();
        workMap.set(newId, {
          id: newId,
          text: remote.title,
          completed: remote.status === 'completed',
          createdAt: now,
          updatedAt: now,
          lastSyncedAt: now,
          googleTaskId: remote.id,
          googleTaskListId: taskListId,
          ...(remote.due ? { dueDate: remote.due.substring(0, 10) } : {}),
          ...(remote.notes ? { notes: remote.notes } : {}),
        });
      } else {
        // 4-3. 양쪽 다 있음
        // 사용자가 로컬 변경 중이면(pendingRemoteOp 남아있음) PULL이 덮어쓰지 않음
        if (local.pendingRemoteOp) continue;

        // last-write-wins
        const remoteUpdated = remote.updated ?? '0';
        const localSynced = local.lastSyncedAt ?? '0';
        if (remoteUpdated > localSynced) {
          workMap.set(local.id, {
            ...local,
            text: remote.title,
            completed: remote.status === 'completed',
            ...(remote.due ? { dueDate: remote.due.substring(0, 10) } : {}),
            ...(remote.notes ? { notes: remote.notes } : {}),
            lastSyncedAt: now,
          });
        }
      }
    }

    // 4-4. 로컬에 googleTaskId 있는데 원격 응답에 없음 → 원격 삭제로 간주
    const remoteIds = new Set(remoteTasks.map((t) => t.id));
    for (const todo of [...workMap.values()]) {
      if (todo.googleTaskId && !remoteIds.has(todo.googleTaskId) && !todo.pendingRemoteOp) {
        // 원격에서 (외부 도구로) 삭제됨 — 로컬은 유지하되 연동 해제
        workMap.set(todo.id, {
          ...todo,
          googleTaskId: undefined,
          googleTaskListId: undefined,
          remoteDeletedAt: now,
          lastSyncedAt: now,
        });
      }
    }

    // ── 5. RECONCILE (race condition 방어) ──
    const data1 = await todoRepository.getTodos();
    const currentTodos = data1?.todos ?? [];
    const currentIds = new Set(currentTodos.map((t) => t.id));

    // (a) sync 도중 새로 추가된 todo (workMap에 없는 storage 항목) → 보존
    for (const t of currentTodos) {
      if (!workMap.has(t.id)) {
        workMap.set(t.id, t);
      }
    }

    // (b) sync 도중 사용자가 수정한 todo → 사용자 수정 우선
    //     기준: storage의 updatedAt > workMap의 (sync 시작 시점) updatedAt
    for (const stored of currentTodos) {
      const synced = workMap.get(stored.id);
      if (!synced) continue;
      const initial = initialTodos.find((t) => t.id === stored.id);
      const storedUpdated = stored.updatedAt ?? '0';
      const initialUpdated = initial?.updatedAt ?? '0';
      if (storedUpdated > initialUpdated) {
        // 사용자가 sync 도중 수정 → 사용자 변경 보존, sync 메타데이터(googleTaskId, lastSyncedAt)는 합침
        workMap.set(stored.id, {
          ...stored,
          googleTaskId: synced.googleTaskId ?? stored.googleTaskId,
          googleTaskListId: synced.googleTaskListId ?? stored.googleTaskListId,
          lastSyncedAt: synced.lastSyncedAt ?? stored.lastSyncedAt,
          // pendingRemoteOp는 사용자가 다시 수정했으니 'update'로 마킹
          pendingRemoteOp: stored.pendingRemoteOp ?? (synced.googleTaskId ? 'update' : 'create'),
        });
      }
    }

    // (c) sync 도중 삭제된 todo (initial엔 있고 workMap에 있는데 storage엔 없음) → 삭제 적용
    for (const id of [...workMap.keys()]) {
      if (!currentIds.has(id) && initialTodos.some((t) => t.id === id)) {
        workMap.delete(id);
      }
    }

    // ── 저장 ──
    const finalTodos = [...workMap.values()];
    await todoRepository.saveTodos({ todos: finalTodos, categories: data1?.categories });

    set({ lastSyncedAt: now, isSyncing: false });
    await useTodoStore.getState().refresh();
    await persistState({ ...get() });
  })();

  await tasksSyncPromise;
  tasksSyncPromise = null;
}
```

### 3-3. 충돌 매트릭스 (전수 케이스)

| 로컬 상태 | 원격 상태 | sync 결과 |
|----------|----------|-----------|
| 신규 (gid=∅, op=create) | — (없음) | PUSH-CREATE → 원격 생성, gid 부여 |
| 기존 (gid=g, op=update) | 있음 | PUSH-UPDATE → 원격 업데이트 |
| 기존 (gid=g, op=update) | **없음** (외부 삭제됨) | PUSH-UPDATE 404 → fallback create로 재생성 (사용자 변경 보존) |
| archive (gid=g, op=delete) | 있음 | PUSH-DELETE → 원격 제거, 로컬 archivedAt+remoteDeletedAt 유지 |
| archive (gid=g, op=delete) | 없음 (이미 외부 삭제) | PUSH-DELETE 404 무시 → 로컬 cleanup |
| archive (gid=∅) | — | sync 무시 (마이그레이션 케이스) |
| 동기화됨 (op=∅) | 변경됨 (remote.updated > lastSyncedAt) | PULL → 로컬 갱신 |
| 동기화됨 (op=∅) | 삭제됨 (deleted:true) | PULL → remoteDeletedAt 마킹 |
| 동기화됨 (op=∅) | 응답에 없음 (외부 hard delete) | PULL 사후 → remoteDeletedAt 마킹 |
| **사용자 sync 도중 수정 (op=update)** | 변경됨 | RECONCILE → 사용자 변경 우선, op=update 재마킹 (다음 sync에서 push) |
| 없음 (workMap에 없음) | 신규 | PULL → 신규 로컬 추가 |
| **사용자 sync 도중 추가 (workMap에 없음)** | — | RECONCILE → 보존 (storage에서 발견됨) |
| **사용자 sync 도중 삭제** | — | RECONCILE → workMap에서 제거 |
| remoteDeletedAt 있는 로컬 | text 일치하는 신규 원격 | PULL → 무시 (좀비 부활 방지) |

### 3-4. `markForRemoteDelete` 동작 변경

기존: `pendingDeleteIds` 배열에 googleTaskId만 추가.

변경 없음. 단, **호출 시점이 늘어남**:
- `useTodoStore.deleteTodo` (기존)
- `useTodoStore.archiveCompleted` (신규) — `manageTodos.archiveCompleted`가 반환하는 `pendingDeleteIds`를 일괄 등록
- `useTodoStore.deleteArchived` (신규) — `manageTodos.deleteArchived`가 반환하는 `pendingDeleteIds`를 일괄 등록

### 3-5. `useTasksAutoSync` 변경 사항

**변경 없음.** syncNow 자체가 race-safe해지므로 기존 4트리거(시작/저장/주기/포커스) 모두 안전.

---

## 4. Store 변경 (`src/adapters/stores/useTodoStore.ts`)

### 4-1. `archiveCompleted` 변경

```typescript
archiveCompleted: async () => {
  const { archivedCount, pendingDeleteIds } = await manageTodos.archiveCompleted();
  if (archivedCount > 0) {
    // 낙관적 UI 업데이트
    const now = new Date().toISOString();
    set((state) => ({
      todos: state.todos.map((todo) =>
        todo.completed && !todo.archivedAt
          ? {
              ...todo,
              archivedAt: now,
              updatedAt: now,
              pendingRemoteOp: todo.googleTaskId ? 'delete' as const : undefined,
            }
          : todo,
      ),
    }));

    // Google Tasks 원격 삭제 큐 등록
    if (pendingDeleteIds.length > 0) {
      try {
        const { useTasksSyncStore } = await import('./useTasksSyncStore');
        const tasksState = useTasksSyncStore.getState();
        if (tasksState.isEnabled && tasksState.taskListId) {
          for (const gid of pendingDeleteIds) {
            await tasksState.markForRemoteDelete(gid);
          }
        }
      } catch (err) {
        console.error('[Todo] archiveCompleted: markForRemoteDelete 실패:', err);
      }
    }
  }
  return archivedCount;
},
```

### 4-2. `deleteArchived` 변경

```typescript
deleteArchived: async (ids) => {
  const { pendingDeleteIds } = await manageTodos.deleteArchived(ids);

  set((state) => ({
    todos: ids
      ? state.todos.filter((t) => !ids.includes(t.id))
      : state.todos.filter((t) => !t.archivedAt),
  }));

  if (pendingDeleteIds.length > 0) {
    try {
      const { useTasksSyncStore } = await import('./useTasksSyncStore');
      const tasksState = useTasksSyncStore.getState();
      if (tasksState.isEnabled && tasksState.taskListId) {
        for (const gid of pendingDeleteIds) {
          await tasksState.markForRemoteDelete(gid);
        }
      }
    } catch (err) {
      console.error('[Todo] deleteArchived: markForRemoteDelete 실패:', err);
    }
  }
},
```

### 4-3. `addTodo` 변경 (신규 항목 메타데이터)

```typescript
addTodo: async (text, dueDate, priority, category, recurrence, time, startDate) => {
  const now = new Date().toISOString();
  const newTodo: Todo = {
    id: generateUUID(),
    text,
    completed: false,
    createdAt: now,
    updatedAt: now,                // 신규
    pendingRemoteOp: 'create',     // 신규 — sync에서 push 큐로 진입
    priority: priority ?? 'none',
    ...(dueDate !== undefined ? { dueDate } : {}),
    ...(category !== undefined ? { category } : {}),
    ...(recurrence !== undefined ? { recurrence } : {}),
    ...(time !== undefined ? { time } : {}),
    ...(startDate !== undefined ? { startDate } : {}),
  };
  await manageTodos.add(newTodo);
  set((state) => ({ todos: [...state.todos, newTodo] }));
},
```

### 4-4. `toggleTodo`, `updateTodo`, `subTask` 메서드들

ManageTodos에서 자동 메타데이터 부여하므로 store 측 수정은 낙관적 UI 갱신 시 메타데이터 동기화만 추가하면 됨. (구현 시 일괄 처리)

---

## 5. 빌드/테스트 체크리스트

- [ ] `npx tsc --noEmit` 에러 0
- [ ] `npm run build` 성공
- [ ] 마이그레이션: 기존 사용자가 v2.0.2 이하에서 만든 todo 데이터가 그대로 로드되어야 함
- [ ] 첫 sync 시 중복 생성 0건 (샘플 데이터로 검증)
- [ ] T1~T6 시나리오 (plan §5-1) 수동 검증

---

## 6. 변경 파일 요약

| 파일 | 변경 종류 |
|------|----------|
| `src/domain/entities/Todo.ts` | 4 필드 추가 (optional) |
| `src/usecases/todo/ManageTodos.ts` | mutation 메서드 메타데이터 자동 부여 + archiveCompleted/deleteArchived 시그니처 변경 |
| `src/adapters/stores/useTodoStore.ts` | addTodo 메타데이터 + archiveCompleted/deleteArchived → markForRemoteDelete 호출 |
| `src/adapters/stores/useTasksSyncStore.ts` | syncNow 5단계 파이프라인 재작성 |
| `src/adapters/hooks/useTasksAutoSync.ts` | 변경 없음 |
| `src/infrastructure/google/GoogleTasksApiClient.ts` | 변경 없음 (이미 updatedMin/showHidden 지원) |

---

## 7. 잠재 위험 및 완화

| 위험 | 완화 |
|------|------|
| RECONCILE에서 `updatedAt` 미부여 옛 todo는 `'0' > '0'` 비교 → 머지 누락 | initialUpdated/storedUpdated 모두 `?? createdAt` fallback |
| sync 도중 syncNow 두 번째 호출 발생 (다른 트리거) | 기존 뮤텍스(`tasksSyncPromise`) 그대로 활용 — 이미 진행 중이면 같은 promise를 await |
| Google Tasks rate limit 49,999/day 초과 | Phase A 완료 후 모니터링; 향후 `updatedMin` 증분 동기화 도입 |
| RECONCILE에서 sync 도중 사용자가 새 todo 추가 + Google Tasks도 같은 task 추가 | 매우 드문 케이스. 둘 다 보존됨 (id 다르므로) |
