# Google Tasks 동기화 정밀화 (Report v0.1)

> 작성일: 2026-05-01
> 관련: [Plan](e:/github/ssampin/docs/01-plan/features/google-tasks-sync-fix.plan.md) · [Design](e:/github/ssampin/docs/02-design/features/google-tasks-sync-fix.design.md)
> 빌드: TypeScript ✅ exit 0 / Vite ✅ built in 20.73s

---

## 1. 사용자가 보고한 두 버그

| # | 증상 | 사용자 워딩 |
|---|------|-------------|
| 버그 1 | 쌤핀에서 추가한 할 일이 Google Tasks에 안 올라가고 사라짐 | "추가한 할 일이 삭제돼" |
| 버그 2 | "완료 항목 모두 아카이브" 후 일정 시간 뒤 부활 | "아카이브 했던 항목들이 되살아나서 완료 항목으로 들어와" |

---

## 2. 근본 원인 — 실제 코드에서 무슨 일이 벌어졌나

### 버그 1 — Sync 도중 사용자 변경이 덮어쓰임 (Race Condition)

**[기존] [`useTasksSyncStore.ts:195-257`](e:/github/ssampin/src/adapters/stores/useTasksSyncStore.ts#L195-L257)**

```typescript
const data = await todoRepository.getTodos();   // ① 시작 시점 스냅샷
const localTodos = data?.todos ?? [];
const remoteTasks = await listTasks(...);        // ② 수백ms~수초 (네트워크)
for (const todo of localTodos) {                  // ③ todo마다 createTask/updateTask (더 오래)
  ...
}
await todoRepository.saveTodos({ todos: processedTodos });  // ④ ① 시점 데이터로 덮어쓰기
//                              ^^^^^^^^^^^^^^^^^^^^^
// 그 사이 사용자가 추가한 todo는 storage엔 들어가 있지만, processedTodos엔 없음 → 사라짐!
```

### 버그 2 — Tombstone 누락 + Archive sync 제외 = 좀비 부활

**[기존] [`ManageTodos.ts:147-164`](e:/github/ssampin/src/usecases/todo/ManageTodos.ts) (변경 전)**

```typescript
async archiveCompleted(): Promise<number> {
  // archivedAt만 ISO 타임스탬프로 설정
  // Google Tasks API 호출 = 0건  ← Bug 2 시작점
}
```

**[기존] [`useTasksSyncStore.ts:206-209`](e:/github/ssampin/src/adapters/stores/useTasksSyncStore.ts#L206-L209) (변경 전)**

```typescript
for (const todo of localTodos) {
  if (todo.archivedAt) {
    processedTodos.push(todo);
    continue;        // ← remoteMap에서 todo.googleTaskId를 제거하지 않음!
  }
  ...
}
// 라인 240-254: remoteMap에 남은 task = "원격에만 있음"으로 인식 → 새 UUID로 부활
```

---

## 3. 적용한 해결책

### 3-1. 도메인 메타데이터 4필드 추가
**[`src/domain/entities/Todo.ts`](e:/github/ssampin/src/domain/entities/Todo.ts) (모두 optional)**
- `pendingRemoteOp: 'create' | 'update' | 'delete'` — 다음 sync에서 적용할 작업
- `updatedAt` — 로컬 마지막 수정 시각
- `lastSyncedAt` — 마지막 sync 성공 시각
- `remoteDeletedAt` — 원격에서 의도적 삭제됨 마커 (좀비 부활 방지)

### 3-2. Tombstone 패턴 (Bug 2 핵심 픽스)
**[`src/usecases/todo/ManageTodos.ts:archiveCompleted`](e:/github/ssampin/src/usecases/todo/ManageTodos.ts)**
- archive 시 `pendingRemoteOp: 'delete'` 마킹 + googleTaskId를 호출 측 반환
- `useTodoStore.archiveCompleted`가 받은 `pendingDeleteIds`를 `markForRemoteDelete`로 큐 등록
- 다음 sync의 PUSH-DELETE 단계에서 Google Tasks에서 실제 삭제 → 좀비 소스 차단

### 3-3. 5단계 Sync 파이프라인 (Bug 1 핵심 픽스)
**[`src/adapters/stores/useTasksSyncStore.ts:syncNow`](e:/github/ssampin/src/adapters/stores/useTasksSyncStore.ts)**

```
0. PRE-FLIGHT — 뮤텍스 + 토큰 + 초기 스냅샷 (initialTodos)
1. PUSH-DELETE — pendingRemoteOp:'delete' + orphan pendingDeleteIds → deleteTask()
2. PUSH-CREATE — pendingRemoteOp:'create' (archive/tombstone 제외) → createTask()
3. PUSH-UPDATE — pendingRemoteOp:'update' → updateTask()  (404 시 fallback create)
4. PULL — listTasks() → 매칭 (last-write-wins, pendingRemoteOp 보호)
   • remote.deleted → remoteDeletedAt 마킹
   • remoteIds에 없는 로컬 → 외부 hard delete로 간주, 연동 해제
   • text 일치 + remoteDeletedAt 있는 로컬 → 좀비 ghost로 PULL 무시
5. RECONCILE — storage 재읽기 → sync 도중 사용자 변경 보존
   (a) 신규 추가된 todo 보존
   (b) 사용자가 sync 도중 수정 → 사용자 값 우선, sync 메타만 합치기
   (c) 사용자가 sync 도중 삭제 → 삭제 적용
```

### 3-4. Push-Before-Pull 강제
- Bug 1의 race는 PUSH/PULL이 한 루프에 섞여있던 것이 원흉
- 이제 PUSH 3단계가 모두 끝난 뒤에 PULL이 실행됨
- 신규 항목은 PULL 시점에 이미 `googleTaskId` 부여되어 있어서 중복 생성 0

### 3-5. Read-After-Write Reconciliation (race condition 안전망)
- syncNow 종료 직전 storage를 다시 읽어 sync 시작 후 추가/수정/삭제된 todos를 머지
- "id 기반 비교 + updatedAt 비교"로 사용자 변경 우선
- 결과: 동기화 도중 사용자 동작이 절대 사라지지 않음

---

## 4. 변경 파일 (최종)

| 파일 | 변경 |
|------|------|
| [`src/domain/entities/Todo.ts`](e:/github/ssampin/src/domain/entities/Todo.ts) | 4 필드 추가 (모두 optional, 기존 데이터 100% 호환) |
| [`src/usecases/todo/ManageTodos.ts`](e:/github/ssampin/src/usecases/todo/ManageTodos.ts) | mutation 메서드 자동 메타데이터 + archive/delete 시그니처 변경 + restoreFromArchive 정교화 |
| [`src/adapters/stores/useTodoStore.ts`](e:/github/ssampin/src/adapters/stores/useTodoStore.ts) | 모든 mutation에서 메타데이터 자동 부여 + archive/delete가 markForRemoteDelete 호출 |
| [`src/adapters/stores/useTasksSyncStore.ts`](e:/github/ssampin/src/adapters/stores/useTasksSyncStore.ts) | syncNow 5단계 파이프라인 전면 재작성 |
| `src/adapters/hooks/useTasksAutoSync.ts` | 변경 없음 (syncNow 자체가 race-safe해짐) |
| `src/infrastructure/google/GoogleTasksApiClient.ts` | 변경 없음 |

---

## 5. 빌드 검증

| 검사 | 결과 |
|------|------|
| `npx tsc --noEmit` | exit 0, 에러 0건 |
| `npm run build` (Vite + Electron-vite) | ✅ built in 20.73s |
| 캐시 클리어 후 재빌드 | ✅ 통과 |

---

## 6. 사용자 수동 검증 시나리오 (재회귀 점검)

다음 6가지 시나리오를 사용자 환경에서 실행해 두 버그가 재현되지 않는지 확인 부탁드립니다.

### T1 — 신규 추가가 sync 도중 사라지지 않는지 (Bug 1)
1. 쌤핀 할일 페이지에서 "테스트1" 추가
2. **즉시 (3초 안에)** 다른 창으로 포커스 이동했다가 돌아와서 sync 트리거
3. 그 사이 "테스트2" 추가
4. **기대**: 두 항목 모두 살아남고, Google Tasks에도 양쪽 다 등장

### T2 — 완료 항목 아카이브가 부활하지 않는지 (Bug 2 핵심)
1. "완료 테스트A" 추가 → 완료 처리
2. sync가 한 번 돈 뒤 (Google Tasks에 보이는 것까지 확인)
3. "완료 항목 모두 아카이브" 클릭
4. **1분 이상 대기 후** 창 포커스 in/out으로 sync 강제 트리거
5. **기대**: "완료 테스트A"가 완료 영역에 부활하지 않고 아카이브 영역에만 존재. Google Tasks에서도 사라짐

### T3 — Google Tasks에서 외부 삭제 시 좀비 방지
1. 쌤핀에서 "외부삭제 테스트" 추가 → sync 완료
2. Google Tasks 앱(또는 웹)에서 직접 그 항목 삭제
3. 쌤핀에서 sync 트리거
4. **기대**: 쌤핀 로컬에는 항목이 남지만 `googleTaskId`가 제거됨 (연동 해제). 다시 sync 돌려도 Google Tasks에 자동 재생성되지 않음

### T4 — 영구 삭제(아카이브 → 영구 삭제)도 원격 정리
1. 완료 항목 아카이브 → 아카이브에서 영구 삭제
2. sync 트리거
3. **기대**: Google Tasks에도 사라짐

### T5 — 외부에서 추가한 항목 PULL
1. Google Tasks에서 "외부 추가" 항목 직접 생성
2. 쌤핀에서 sync 트리거
3. **기대**: 쌤핀에 신규로 들어옴 (creates duplicate 없음)

### T6 — 재시작 후에도 메타데이터 영속
1. 쌤핀에서 항목 추가 → sync **하지 않고 즉시 앱 종료**
2. 앱 재시작 → 자동 sync (2초 딜레이 후)
3. **기대**: 새 항목이 정상적으로 push (`pendingRemoteOp:'create'`가 storage에 영속됐기 때문)

> 모든 시나리오는 **Google 계정에 Tasks 동기화 활성화 + Task List 선택된 상태**여야 합니다.

---

## 7. 마이그레이션 안전성

기존 사용자가 v2.0.1 이하에서 만든 todos는 신규 4필드가 모두 `undefined`입니다.

### 동작 검증
- `googleTaskId` 있는 항목 → `pendingRemoteOp` 없음 → PUSH 단계에서 무시 → PULL에서 last-write-wins 적용 → 정상
- `googleTaskId` 없는 기존 항목 → `pendingRemoteOp` 없음 → PUSH-CREATE에서 `pendingRemoteOp:'create'` 명시 항목만 처리 → **자동 생성되지 않음** (안전)
- 사용자가 다음번에 todo 토글/수정/추가하는 순간 `pendingRemoteOp`이 부여되어 정상 sync 흐름 진입

이는 plan에서 합의한 "안전 우선" 마이그레이션 정책입니다.

---

## 8. 잠재 위험 및 후속 액션

### 안정화 후 추가 라운드 후보
1. **`updatedMin` 증분 동기화 도입** — 매번 전체 풀 대신 변경분만 가져오기 (Google Tasks API의 quota 절감, 50K req/day 보호)
2. **`updatedAt` 비교의 시계 편차 방어** — 클라이언트/서버 시간 차이가 큰 경우를 위한 grace period
3. **Sync 충돌 토스트** — 양쪽이 동시 수정된 경우 사용자에게 알림 (현재는 last-write-wins 침묵 처리)
4. **단위 테스트 추가** — `ManageTodos.archiveCompleted`, `syncNow` 5단계의 시나리오별 테스트

### 모니터링 포인트
- Google Tasks API 호출 횟수 — 매 sync마다 PUSH N + PULL 1 → todo 수가 많으면 한 sync에서 100+ req 가능
- 마이그레이션 첫 sync에서 중복 생성 0건이 맞는지 사용자 환경에서 확인 필요

---

## 9. CLAUDE.md / MEMORY 업데이트 권고

- 신규 sync 알고리즘은 "Push-Before-Pull + Tombstone + Reconciliation" 패턴 — 다른 BaaS 동기화(예: Drive Sync, Calendar Sync) 라운드에서도 동일 패턴을 참조 권장
- 본 라운드 자체는 디자인 변경 없음 (백엔드/sync 한정) — `frontend-design` 협업 의무 비대상

---

## 10. 다음 단계

- [ ] 사용자 환경 T1~T6 수동 검증
- [ ] 검증 통과 시 v2.0.2 (또는 v2.0.1 핫픽스) 릴리즈
- [ ] 안정화 후 `updatedMin` 증분 동기화 라운드 (별도 PDCA)
