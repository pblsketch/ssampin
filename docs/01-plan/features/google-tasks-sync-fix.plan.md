# Google Tasks 동기화 정밀화 (Plan v0.1)

> 작성일: 2026-05-01
> 작업: SsamPin × Google Tasks 양방향 동기화 버그 정밀 수정
> 관련 PDCA: `/pdca plan google-tasks-sync-fix`

---

## 1. 사용자가 보고한 증상

| # | 증상 | 사용자 워딩 |
|---|------|-------------|
| **버그 1** | 쌤핀 할일에서 추가한 항목이 Google Tasks에 안 올라가고, 시간이 지나면 **사라짐** | "추가한 할 일이 삭제돼" |
| **버그 2** | "완료 항목 모두 아카이브" 실행 후 일정 시간 뒤 **아카이브가 풀려서 다시 완료 항목으로 부활** | "아카이브 했던 항목들이 되살아나서 완료 항목으로 들어와" |

두 증상의 공통점: **"동기화 타이밍에 따라 결과가 달라짐"** → race condition + 잘못된 충돌 해결 정책의 전형적 증상.

---

## 2. 코드 레벨 근본 원인 분석

### 버그 1 — 신규 할일 사라짐의 진짜 범인: 두 종류의 race condition

#### 1-A. Sync 도중 사용자 추가 → sync 종료 시 **덮어쓰기**
[`src/adapters/stores/useTasksSyncStore.ts:195-257`](e:/github/ssampin/src/adapters/stores/useTasksSyncStore.ts#L195-L257)

```typescript
// L195: sync 시작 시점에 storage에서 todos 로드
const data = await todoRepository.getTodos();
const localTodos: readonly Todo[] = data?.todos ?? [];

// L199: Google Tasks 원격 조회 (수백 ms ~ 수 초 소요)
const remoteTasks = await googleTasksPort.listTasks(...);

// L205-238: 각 todo마다 createTask/updateTask 호출 (네트워크 N회 — 더 오래 걸림)
for (const todo of localTodos) { ... }

// L257: sync 시작 시점 스냅샷에 기반한 processedTodos를 storage에 저장
await todoRepository.saveTodos({ todos: processedTodos, ... });
//                              ^^^^^^^^^^^^^^^^^^^^^
//   문제: 이 사이(수 초~수십 초) 사용자가 추가한 todo는 사라짐!
```

**시나리오:**
1. 사용자가 "수업 준비" 추가 → storage 저장 (`{id:"a"}`)
2. 다른 트리거(focus/주기/2.5s 디바운스)가 **이미 syncNow 실행 중**
3. syncNow는 `localTodos = [{id:"a"}]`까지 읽음
4. 사용자가 "회식 참석" 추가 → storage에 저장 (`{id:"a"}, {id:"b"}`)
5. 그 사이 syncNow가 N개의 fetch 처리 후 `saveTodos([processed_a])` 실행
6. → `{id:"b"}` **덮어쓰여서 사라짐** (storage엔 `[processed_a]`만 남음)

#### 1-B. "원격에 없는 신규 항목"에 대한 정책 자체는 OK이지만 위 race로 누락됨
현재 라인 211 (`if (!todo.googleTaskId)` → `createTask` 호출)은 합리적이나, **race condition 자체를 방어하지 않음**.

---

### 버그 2 — 좀비 부활의 진짜 범인: archive가 sync에서 제외되어 remoteMap 잔존

#### 2-A. `archiveCompleted()`가 Google Tasks에 아무 호출도 안 함
[`src/usecases/todo/ManageTodos.ts:148-164`](e:/github/ssampin/src/usecases/todo/ManageTodos.ts#L148-L164)

```typescript
async archiveCompleted(): Promise<number> {
  // archivedAt만 ISO 타임스탬프로 설정
  // Google Tasks API 호출 = 0
  // pendingDeleteIds 추가 = 0
}
```

#### 2-B. `syncNow`가 archive 항목을 remoteMap에서 제거하지 않음
[`src/adapters/stores/useTasksSyncStore.ts:206-209`](e:/github/ssampin/src/adapters/stores/useTasksSyncStore.ts#L206-L209)

```typescript
for (const todo of localTodos) {
  if (todo.archivedAt) {
    processedTodos.push(todo);
    continue;        // ← remoteMap에서 todo.googleTaskId 제거 안 함!
  }
  ...
}

// L242-254: remoteMap에 남은 task = "원격에만 있는 것"으로 인식 → 새 UUID로 삽입
for (const remote of remoteMap.values()) {
  const newTodo: Todo = { id: generateUUID(), ..., completed: remote.status === 'completed' };
  processedTodos.push(newTodo);  // ← 좀비 부활!
}
```

**시나리오:**
1. 로컬: `{id:"x", googleTaskId:"g1", completed:true}` (Google Tasks의 g1은 status=completed)
2. 사용자: "완료 항목 모두 아카이브" 클릭 → `{id:"x", googleTaskId:"g1", completed:true, archivedAt:"..."}`
3. Google Tasks에는 변동 없음 (API 호출 없었으므로 g1 그대로)
4. syncNow:
   - L206: `if (todo.archivedAt) { processedTodos.push(todo); continue }` → **remoteMap.delete("g1") 안 함**
   - remoteMap에는 g1 그대로 남음
   - L242 루프: g1을 "원격에만 있음"으로 처리 → 새 UUID `{id:"y", googleTaskId:"g1", completed:true}` 추가
5. 결과: 로컬에 같은 g1을 가리키는 todo 2개 (`x` 아카이브 + `y` 완료) → UI에서 `y`가 "되살아난 완료 항목"으로 보임

#### 2-C. 영구 삭제(`deleteArchived`)는 markForRemoteDelete를 안 호출
[`src/usecases/todo/ManageTodos.ts:177-184`](e:/github/ssampin/src/usecases/todo/ManageTodos.ts#L177-L184)에는 Google Tasks 정리 로직이 없음. 그러나 `useTodoStore.deleteTodo`에는 있음 → 일관성 부재.

---

### 추가 발견: "원격에서 삭제됨" 처리의 잠재 문제
[`src/adapters/stores/useTasksSyncStore.ts:221-226`](e:/github/ssampin/src/adapters/stores/useTasksSyncStore.ts#L221-L226)

```typescript
if (!remote) {
  // 원격에서 삭제된 경우 — 로컬 연동 해제 후 유지
  const { googleTaskId, googleTaskListId, ...rest } = todo;
  processedTodos.push(rest as Todo);
}
```

→ Google Tasks에서 사용자가 의도적으로 삭제한 항목이, 다음 sync에서 `googleTaskId === undefined`이므로 **신규로 다시 push됨** (좀비 부활의 미러 케이스). 본 PDCA에서 함께 수정.

---

## 3. 표준 해결책 (웹 리서치 기반)

리서치 출처: [Android Offline-First Architecture](https://developer.android.com/topic/architecture/data-layer/offline-first), [RxDB Replication](https://rxdb.info/replication.html), [Azure Mobile Apps Sync](https://learn.microsoft.com/sl-si/previous-versions/azure/developer/mobile-apps/azure-mobile-apps/howto/data-sync), [Google Tasks API Reference](https://developers.google.com/workspace/tasks/reference/rest/v1/tasks/list).

### 3-1. Tombstone 패턴 (Bug 2 해결)
- "삭제 = 즉시 제거" 안티패턴 → "삭제 = `pendingRemoteOp` 마킹 후 push 성공해야 진짜 제거"
- 아카이브 시 `pendingDeleteIds`에 `googleTaskId` 추가 (재사용)

### 3-2. Push-Before-Pull (Bug 1-A 해결의 핵심)
- 한 sync 사이클 안에서 **PUSH(로컬→원격) 먼저, PULL(원격→로컬) 나중에**
- 신규 항목은 PUSH 단계에서만 다뤄지고, PULL은 "원격에 있는 것"만 다룸

### 3-3. Read-After-Write Reconciliation (Bug 1-A 해결의 안전망)
- syncNow 종료 직전 storage를 **다시 읽어** sync 시작 후 추가/수정된 항목과 머지
- 또는 sync 진행 중 사용자 mutation을 차단/큐잉

### 3-4. Soft Delete with `googleTaskId` 보존 (Bug 2-A 해결)
- 아카이브 시 로컬 record는 유지하되 `archivedAt` + `pendingRemoteOp:'delete'` 마킹
- syncNow는 이 항목을 보고 Google Tasks에서 `delete` 호출
- 성공 후 `pendingRemoteOp` 클리어 (record 자체는 유지 — 사용자가 "복원" 가능하게)

### 3-5. `updatedMin` 증분 동기화 (성능 최적화, 옵션)
- 매번 전체 풀 대신 `lastSyncedAt` 이후 변경분만 가져오기
- 본 PDCA에서는 **선택적**으로 적용 (안정화 후 별도 라운드)

---

## 4. 변경 범위

### 4-1. 도메인 (`domain/entities/Todo.ts`)
신규 필드 4개 추가 (모두 optional, 기존 데이터 100% 호환):

```typescript
export interface Todo {
  // ... 기존 필드 ...

  // === Google Tasks 동기화 메타데이터 (신규) ===
  /** 원격 작업 큐: 다음 sync 때 Google Tasks에 어떤 작업을 해야 하는지 */
  readonly pendingRemoteOp?: 'create' | 'update' | 'delete';
  /** 마지막으로 sync에 성공한 시각. 충돌 해결 기준 (last-write-wins) */
  readonly lastSyncedAt?: string;
  /** 로컬 마지막 수정 시각. updatedAt > lastSyncedAt이면 push 필요 */
  readonly updatedAt?: string;
  /** "원격에서 의도적으로 삭제됐음" 마커. 다음 sync에서 신규 push 안 함 */
  readonly remoteDeletedAt?: string;
}
```

### 4-2. Use Case (`usecases/todo/ManageTodos.ts`)
- `archiveCompleted()`: archive + `pendingRemoteOp:'delete'` 마킹 + `pendingDeleteIds` 추가
- `restoreFromArchive()`: archive 해제 + `pendingRemoteOp:'create'` 마킹 (googleTaskId 재발급 필요)
- `deleteArchived()`: 영구 삭제 + `pendingDeleteIds` 추가
- `add()`, `updateTodo()`, `toggleTodo()`: `updatedAt` 자동 갱신 + `pendingRemoteOp` 마킹

### 4-3. Sync (`adapters/stores/useTasksSyncStore.ts`)
`syncNow`를 다음 5단계로 재작성:

```
1. PUSH-DELETE: pendingDeleteIds + pendingRemoteOp:'delete' 항목 → googleTasksPort.deleteTask()
2. PUSH-CREATE: googleTaskId 없는 신규 항목 (archive/remoteDeleted 제외) → createTask()
3. PUSH-UPDATE: updatedAt > lastSyncedAt + googleTaskId 있는 항목 → updateTask()
4. PULL: listTasks() → 로컬 매칭 (remoteId로) → 신규는 추가, 기존은 갱신
5. RECONCILE: 종료 직전 storage 재읽기 → sync 도중 추가된 신규 항목 보존
```

### 4-4. Auto-sync 훅 (`adapters/hooks/useTasksAutoSync.ts`)
- 변경 사항 없음 (기존 디바운스/쿨다운 유지)
- 단, syncNow 자체가 race-safe해지므로 트리거 빈도는 그대로 OK

### 4-5. Auto-sync (`adapters/stores/useTodoStore.ts`)
- `addTodo`, `updateTodo`, `toggleTodo` 등 mutation 메서드에서 `updatedAt` 자동 부여 (use case에서 처리하므로 store 변경 최소화)

---

## 5. 회귀 방지 전략

### 5-1. 시나리오 테스트 (수동 + 향후 자동화)
| # | 시나리오 | 기대 결과 |
|---|----------|-----------|
| T1 | 할일 추가 → 즉시 (디바운스 전) 다른 sync 트리거 → 그 사이 새 할일 추가 | 두 항목 모두 보존, Google Tasks 양쪽 등장 |
| T2 | "완료 항목 모두 아카이브" → 1분 대기 → focus sync | 아카이브 항목은 archive 영역에만, 완료 영역에 부활 X |
| T3 | Google Tasks에서 외부 삭제 → 쌤핀 sync | 로컬에 `remoteDeletedAt` 마킹, 다음 sync에서 재푸시 X |
| T4 | 오프라인에서 추가/완료/아카이브 여러 건 → 온라인 복귀 + sync | 모든 변경이 큐에 누적 후 한 번에 적용 |
| T5 | 두 PC에서 같은 task 동시 수정 → sync | 더 최근 `updatedAt`이 win (last-write-wins) |
| T6 | "완료 항목 모두 아카이브" 직후 즉시 다른 기기 sync 트리거 | 아카이브가 다른 기기로 전파되어 양쪽에서 사라짐 |

### 5-2. 메타테스트 (코드 레벨 가드)
- `archiveCompleted` 테스트: googleTaskId 있는 항목은 `pendingRemoteOp:'delete'`로 마킹되는지 확인
- `syncNow` 테스트: race 시뮬레이션 (sync 중 storage 변경) → reconciliation으로 보존되는지

### 5-3. 마이그레이션
- 기존 사용자의 todos는 모든 신규 필드가 `undefined` → 첫 sync 시 "신규로 보일 수 있음"
- 방어: 첫 sync 시 `googleTaskId` 있는 항목은 `pendingRemoteOp` 부여하지 않음 (이미 동기화된 것으로 간주)
- `lastSyncedAt`이 없으면 `createdAt`을 fallback으로 사용

---

## 6. 작업 단계 (Do Phase)

### Phase A — 도메인 + Use Case (선결)
1. `Todo` 엔티티 필드 추가
2. `ManageTodos`의 mutation 메서드들에 `updatedAt` + `pendingRemoteOp` 부여 로직
3. `archiveCompleted` / `restoreFromArchive` / `deleteArchived` 재작성

### Phase B — Sync 알고리즘 재작성 (핵심)
1. `syncNow`를 5단계 파이프라인으로 분해
2. Push-before-pull + reconciliation 추가
3. `markForRemoteDelete` → `pendingRemoteOp` 통합

### Phase C — 검증
1. `npx tsc --noEmit` 에러 0개
2. `npm run build` 성공
3. 6개 시나리오(T1~T6) 수동 검증 — 사용자 환경에서 직접 실행
4. 기존 데이터 마이그레이션 검증 (기존 사용자가 업데이트 후 sync 시 중복 생성되지 않는지)

### Phase D — 문서화
1. Design 문서 (이번 PDCA의 다음 단계)
2. Report 문서 (구현 완료 후)
3. CLAUDE.md / MEMORY.md에 sync 패턴 기록

---

## 7. 위험 및 완화

| 위험 | 영향 | 완화책 |
|------|------|--------|
| 마이그레이션 시 기존 todo가 신규로 인식되어 Google Tasks에 중복 생성 | 중 | Phase A 끝나면 첫 sync 전에 dry-run 로그로 확인 |
| `updatedAt` 갱신 누락된 mutation 경로가 남으면 push 안 됨 | 중 | Use case 단일 진입점으로 강제, 필드별 단위 메서드 점검 |
| 다른 기기에서 archive한 항목을 본 기기가 새 항목으로 인식 | 낮 | `remoteDeletedAt` 마커 + `pendingDeleteIds` 양방향 동기화 |
| reconciliation 단계가 `processedTodos` 일부를 잃을 수 있음 | 중 | 머지 키를 `id`로 명확히, 충돌 시 항상 storage 우선 |
| sync 도중 앱 종료 → pendingRemoteOp가 영속되지 않으면 손실 | 낮 | `pendingRemoteOp`는 storage에 영속됨 (Todo가 storage에 저장되므로 자동 영속) |

---

## 8. 다음 단계

1. **사용자 합의** — 본 plan의 변경 범위(엔티티 4필드 추가, sync 알고리즘 전면 재작성)에 대한 합의
2. **Design 문서 작성** — 5단계 sync 파이프라인의 의사 코드 + 충돌 매트릭스
3. **구현** — Phase A → B → C → D 순서

> 본 작업은 디자인 변경 없음 — 백엔드/sync 로직 한정 수정.
> 디자인 변경이 발생할 경우 `frontend-design` 에이전트 협업 의무 (MEMORY.md 정책).
