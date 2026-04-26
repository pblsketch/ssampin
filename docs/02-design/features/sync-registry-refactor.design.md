# sync-registry-refactor Design Document

> **요약**: SYNC_FILES·autoSyncOnSave subscribe·reloadStores switch·FILE_TO_STORE 4곳에 분산된 동기화 도메인 매핑을 단일 소스(`syncRegistry.ts`)로 통합하는 리팩터링의 기술 설계서.
>
> **프로젝트**: SsamPin
> **버전**: v1.11.x
> **작성자**: pblsketch
> **작성일**: 2026-04-26
> **최종 수정**: 2026-04-26
> **상태**: Draft
> **계획 문서**: [sync-registry-refactor.plan.md](../../01-plan/features/sync-registry-refactor.plan.md)

### 관련 PDCA

| 문서 | 상태 | 본 설계와의 관계 |
|------|------|-----------------|
| [sync-registry-refactor.plan.md](../../01-plan/features/sync-registry-refactor.plan.md) | Draft | 선행 Plan |
| [note-cloud-sync.plan.md](../../01-plan/features/note-cloud-sync.plan.md) | Draft | `isDynamic`/`enumerateDynamic` 인터페이스 소비자 |
| [first-sync-confirmation.plan.md](../../01-plan/features/first-sync-confirmation.plan.md) | Draft | `SYNC_REGISTRY`를 도메인 목록 열거 소스로 참조 |

---

## 1. 개요

### 1.1 목적 및 배경

Google Drive 동기화 경로에는 "어떤 도메인을 동기화할지"를 정의하는 지점이 현재 4곳에 분산되어 있다.

| 위치 | 역할 | 실제 파일 |
|------|------|-----------|
| `SYNC_FILES` 배열 | 업로드 대상 파일명 열거 | `src/usecases/sync/SyncToCloud.ts:15-21` |
| `autoSyncOnSave` subscribe 리스트 | store 변경 반응 대상 | `src/App.tsx:721-738` |
| `reloadStores` switch 분기 | 다운로드 후 store reload | `src/adapters/hooks/useDriveSync.ts:19-118` |
| `FILE_TO_STORE` 매핑 테이블 | 회귀 검증용 메타 정보 | `src/usecases/sync/__tests__/SyncSubscribers.test.ts:24-45` |

이 분산 구조가 2026-04-26 발생 버그의 구조적 원인이었다 (`surveys`, `assignments`, `seat-constraints` 등 여러 도메인이 `autoSyncOnSave`에서 누락된 상태로 오랫동안 잠복).

본 Design은 해당 매핑을 `syncRegistry.ts` 단일 소스로 통합하여 **새 도메인 추가 시 한 파일 한 블록만 편집**하면 모든 동기화 경로가 자동으로 정합되도록 하는 기술적 구현 방법을 정의한다.

### 1.2 범위

**포함**:
- `syncRegistry.ts` 신규 생성 — 20개 도메인 등록 + `SyncDomain` 인터페이스 정의
- `SyncToCloud.ts` — `SYNC_FILES`를 registry 파생 상수로 교체 (기존 import 경로 호환 유지)
- `App.tsx` — `autoSyncOnSave` useEffect를 registry 기반 순회로 교체
- `useDriveSync.ts` — `reloadStores` switch 분기를 registry dispatch로 교체
- `SyncSubscribers.test.ts` — `FILE_TO_STORE` 수동 테이블을 registry 기반 4개 메타 테스트로 재작성

**제외**:
- 동기화 메커니즘(체크섬, 매니페스트, 충돌 감지) 로직 변경 없음
- 새 도메인(note-cloud-sync 등) 실제 추가 — 인터페이스 준비만 함
- `subscribeWithSelector` 성능 최적화 — 별도 사이클
- `SyncFromCloud.ts` 내부 비즈니스 로직 변경 없음

### 1.3 설계 원칙

- **단일 소스**: 도메인 등록은 `syncRegistry.ts` 한 곳에만
- **Clean Architecture 준수**: `syncRegistry.ts`는 `usecases/` 레이어 — adapters 직접 import 금지
- **Lazy 참조**: store는 dynamic import lazy 함수로만 참조, 모듈 초기화 순환 참조 방지
- **후방 호환**: 기존 `SYNC_FILES` export와 `SyncFileName` 타입을 파생 상수로 그대로 제공
- **동적 확장 준비**: `isDynamic`/`enumerateDynamic` 필드를 인터페이스에 포함하여 note-cloud-sync가 소비할 수 있도록 함

---

## 2. 아키텍처

### 2.1 변경 전 구조 (현행)

```
┌──────────────────────────────────────────────────────────────┐
│  SyncToCloud.ts        SYNC_FILES (20개 정적 배열)            │
│  ─────────────────────────────────────────────────────────   │
│  App.tsx               autoSyncOnSave subscribe (16개 수동)   │
│  ─────────────────────────────────────────────────────────   │
│  useDriveSync.ts       reloadStores switch-case (18 case)    │
│  ─────────────────────────────────────────────────────────   │
│  SyncSubscribers.test  FILE_TO_STORE (20개 수동 매핑 테이블) │
│                                                              │
│  ⚠️ 4곳이 각각 독립 관리 → 한 곳 누락 시 silent bug          │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 변경 후 구조 (목표)

```
┌──────────────────────────────────────────────────────────────┐
│  syncRegistry.ts       ← SINGLE SOURCE OF TRUTH              │
│    SYNC_REGISTRY: SyncDomain[]  (20개 도메인)                │
│    SYNC_FILES = SYNC_REGISTRY.map(d => d.fileName)           │
│         │                                                    │
│         ├──▶ SyncToCloud.ts      SYNC_FILES (파생 import)    │
│         ├──▶ SyncFromCloud.ts    SYNC_FILES (파생 import)    │
│         ├──▶ App.tsx             registry.filter+map 순회    │
│         ├──▶ useDriveSync.ts     registry.find dispatch      │
│         └──▶ SyncSubscribers.test registry 정합 메타 테스트  │
│                                                              │
│  ✅ 새 도메인 추가 = registry 1개 블록 추가로 끝              │
└──────────────────────────────────────────────────────────────┘
```

### 2.3 레이어 위치

```
usecases/sync/syncRegistry.ts     ← usecases 레이어 (domain만 참조 가능)
adapters/hooks/useDriveSync.ts    ← adapters 레이어 (usecases + domain 참조 가능)
App.tsx                           ← adapters 레이어 (React 루트 컴포넌트)
```

`syncRegistry.ts`가 `usecases/` 레이어에 위치하기 때문에, Zustand store(`adapters/` 레이어)를 직접 import할 수 없다. store 참조는 모두 **dynamic import lazy 함수**로 캡슐화한다.

### 2.4 의존성 다이어그램

```
domain/                     ← 변경 없음
  ports/IStoragePort.ts
  repositories/IDriveSyncRepository.ts

usecases/sync/
  syncRegistry.ts           [신규] → domain/ 만 참조 가능
  SyncToCloud.ts            [수정] → syncRegistry (import SYNC_FILES)
  SyncFromCloud.ts          [수정 소규모] → syncRegistry (import SYNC_FILES)
  __tests__/SyncSubscribers.test.ts  [재작성] → syncRegistry

adapters/
  hooks/useDriveSync.ts     [수정] → syncRegistry (registry.find dispatch)
  stores/use*Store.ts       ← 변경 없음 (lazy import로만 참조됨)

App.tsx                     [수정] → syncRegistry (registry.filter+map)
```

---

## 3. 데이터 모델 / 타입 정의

### 3.1 SyncDomain 인터페이스

**파일**: `src/usecases/sync/syncRegistry.ts` (신규)

```typescript
/**
 * 단일 동기화 도메인의 모든 관심사를 하나의 레코드로 표현한다.
 *
 * ⚠️ usecases 레이어 규칙:
 *   - adapters/stores를 직접 import 금지
 *   - storeSubscribe, reload는 반드시 lazy 함수로만 구현
 */
export interface SyncDomain {
  /**
   * Drive에 저장되는 파일 기본명 (확장자 제외).
   * 매니페스트 키와 동일. e.g. 'class-schedule' → Drive에 'class-schedule.json' 생성
   */
  fileName: string;

  /**
   * App.tsx autoSyncOnSave 구독에서 제외할지 여부.
   * true = 자동 업로드 구독 제외 (settings 등 무한루프 위험 항목).
   * 기본값: false (undefined와 동일하게 취급).
   */
  subscribeExcluded?: boolean;

  /**
   * autoSyncOnSave 구독 함수.
   * subscribeExcluded === true인 경우 undefined이어도 됨.
   * ⚠️ 반드시 lazy 함수로 구현 — 모듈 로드 시점에 store를 직접 참조하지 말 것.
   *
   * 반환값은 Zustand의 unsubscribe 함수.
   */
  storeSubscribe?: (callback: () => void) => () => void;

  /**
   * 다운로드 완료 후 해당 store를 재로드하는 함수.
   * subscribeExcluded인 도메인(settings 등)도 다운로드 후 reload가 필요하므로 분리.
   * ⚠️ 반드시 dynamic import lazy로 구현.
   */
  reload: () => Promise<void>;

  /**
   * true = fileName이 런타임에 결정되는 동적 파일군.
   * e.g. 노트 페이지 본문: 'note-body--{pageId}'
   * isDynamic === true이면 enumerateDynamic을 반드시 제공해야 한다.
   *
   * note-cloud-sync PDCA에서 사용. 본 리팩터에서는 인터페이스만 준비.
   */
  isDynamic?: boolean;

  /**
   * 런타임에 실제 fileName 목록을 반환하는 함수.
   * isDynamic === true인 도메인에만 사용.
   * SyncToCloud.execute()가 정적 SYNC_FILES 외에 이 목록을 합집합하여 업로드.
   *
   * note-cloud-sync PDCA가 소비할 훅. 본 리팩터에서는 인터페이스만 정의.
   */
  enumerateDynamic?: () => Promise<string[]>;
}
```

### 3.2 파생 상수 및 타입

```typescript
// syncRegistry.ts (계속)

/**
 * 기존 코드 후방 호환을 위한 파생 상수.
 * SyncToCloud.ts, SyncFromCloud.ts 모두 이 경로로 import 유지.
 * 'as const' 대신 readonly 배열로 선언 — registry는 런타임 배열이므로.
 */
export const SYNC_FILES: readonly string[] = SYNC_REGISTRY
  .filter(d => !d.isDynamic)  // 동적 도메인은 런타임 enumeration이므로 정적 목록에서 제외
  .map(d => d.fileName);

/**
 * 기존 SyncFileName 타입 후방 호환.
 * 정적 파일명의 유니언 타입으로 재정의.
 * 주의: isDynamic 도메인은 포함되지 않음 (note-cloud-sync PDCA에서 별도 처리).
 */
export type SyncFileName = typeof SYNC_FILES[number];
```

### 3.3 주요 타입 결정

| 결정 사항 | 선택 | 근거 |
|-----------|------|------|
| `storeSubscribe` 반환 타입 | `() => void` (unsubscribe) | Zustand `.subscribe()` 반환 타입과 일치 |
| `reload` 반환 타입 | `Promise<void>` | async store load 패턴 표준화 |
| `SYNC_FILES` 타입 | `readonly string[]` | `as const` 튜플 불가 (SYNC_REGISTRY는 런타임 배열) |
| `SyncFileName` | `string` 서브타입 | 기존 코드 호환 유지 |
| `isDynamic` 기본값 | `undefined` (= false) | 대부분 도메인이 정적이므로 명시 불필요 |

---

## 4. 도메인 등록 표 (20개)

`SYNC_REGISTRY`에 등록될 전체 도메인. `src/usecases/sync/syncRegistry.ts` 구현의 직접 입력 스펙.

| # | fileName | storeSubscribe 대상 | subscribeExcluded | reload 대상 store | isDynamic | 비고 |
|---|----------|---------------------|:-----------------:|-------------------|:---------:|------|
| 1 | `settings` | — | **true** | `useSettingsStore` | — | 무한루프 방지: store 변경 시 자동 업로드 제외 |
| 2 | `class-schedule` | `useScheduleStore` | — | `useScheduleStore` | — | — |
| 3 | `teacher-schedule` | — (useScheduleStore 중복 subscribe 방지) | **true** | `useScheduleStore` | — | class-schedule과 동일 store. subscribe는 class-schedule에서만. 아래 §6.2 참조 |
| 4 | `timetable-overrides` | — (useScheduleStore 중복 subscribe 방지) | **true** | `useScheduleStore` | — | class-schedule과 동일 store. subscribe는 class-schedule에서만 |
| 5 | `students` | `useStudentStore` | — | `useStudentStore` | — | — |
| 6 | `seating` | `useSeatingStore` | — | `useSeatingStore` | — | — |
| 7 | `events` | `useEventsStore` | — | `useEventsStore` | — | — |
| 8 | `memos` | `useMemoStore` | — | `useMemoStore` | — | — |
| 9 | `todos` | `useTodoStore` | — | `useTodoStore` | — | — |
| 10 | `student-records` | `useStudentRecordsStore` | — | `useStudentRecordsStore` | — | — |
| 11 | `bookmarks` | `useBookmarkStore` | — | `useBookmarkStore` | — | reload: `loadAll()` 패턴 (loaded 플래그 없음) |
| 12 | `surveys` | `useSurveyStore` | — | `useSurveyStore` | — | — |
| 13 | `assignments` | `useAssignmentStore` | — | `useAssignmentStore` | — | reload: `loadAssignments()` 패턴 (loaded 플래그 없음) |
| 14 | `seat-constraints` | `useSeatConstraintsStore` | — | `useSeatConstraintsStore` | — | — |
| 15 | `teaching-classes` | `useTeachingClassStore` | — | `useTeachingClassStore` | — | — |
| 16 | `curriculum-progress` | — (useTeachingClassStore 중복 subscribe 방지) | **true** | `useTeachingClassStore` | — | teaching-classes와 동일 store. subscribe는 teaching-classes에서만 |
| 17 | `attendance` | — (useTeachingClassStore 중복 subscribe 방지) | **true** | `useTeachingClassStore` | — | teaching-classes와 동일 store. subscribe는 teaching-classes에서만 |
| 18 | `dday` | `useDDayStore` | — | `useDDayStore` | — | — |
| 19 | `consultations` | `useConsultationStore` | — | `useConsultationStore` | — | — |
| 20 | `manual-meals` | `useMealStore` | — | `useMealStore` | — | — |

**note-cloud-sync placeholder** (isDynamic 도메인):

| # | fileName (접두사) | subscribeExcluded | isDynamic | enumerateDynamic | 비고 |
|---|-------------------|:-----------------:|:---------:|-----------------|------|
| 21 | `note-body--` | false | **true** | `() => INotebookRepository.listPageBodyKeys()` | note-cloud-sync PDCA에서 활성화. 본 리팩터에서는 인터페이스만 준비 |

정적 3개 노트 파일 (`note-notebooks`, `note-sections`, `note-pages-meta`)도 note-cloud-sync PDCA에서 SYNC_REGISTRY에 추가 예정 — 본 리팩터 범위 아님.

### 4.1 subscribeExcluded 처리 요약

| subscribeExcluded: true 도메인 | 사유 |
|-------------------------------|------|
| `settings` | 무한루프 방지: 설정 store 변경 → 자동 업로드 → 설정 다시 변경 위험 |
| `teacher-schedule`, `timetable-overrides` | `useScheduleStore`를 class-schedule과 공유. 중복 subscribe 방지 |
| `curriculum-progress`, `attendance` | `useTeachingClassStore`를 teaching-classes와 공유. 중복 subscribe 방지 |

---

## 5. 통합 후 호출처 변경 상세

### 5.1 `syncRegistry.ts` 핵심 구현 (신규)

```typescript
// src/usecases/sync/syncRegistry.ts
// ⚠️ usecases 레이어: adapters/stores 직접 import 금지 → lazy dynamic import 사용

import type { SyncDomain } from './syncRegistry'; // self-referential 예시용 — 실제는 동일 파일 내 정의

export const SYNC_REGISTRY: SyncDomain[] = [
  // ─── 1. settings ────────────────────────────────────────────
  {
    fileName: 'settings',
    subscribeExcluded: true,
    reload: async () => {
      const { useSettingsStore } = await import('@adapters/stores/useSettingsStore');
      useSettingsStore.setState({ loaded: false });
      await useSettingsStore.getState().load();
    },
  },
  // ─── 2. class-schedule ──────────────────────────────────────
  {
    fileName: 'class-schedule',
    storeSubscribe: (cb) => {
      // NOTE: import()는 Promise이므로 동기 subscribe 함수에서 처리 불가.
      // App.tsx에서 직접 store를 import한 뒤 storeSubscribe를 래핑하거나,
      // §5.2에서 설명하는 App.tsx 패턴으로 처리한다.
      // → 실제 구현 전략은 §5.2 참조
      throw new Error('storeSubscribe 구현은 App.tsx 패턴으로 처리');
    },
    reload: async () => {
      const { useScheduleStore } = await import('@adapters/stores/useScheduleStore');
      useScheduleStore.setState({ loaded: false });
      await useScheduleStore.getState().load();
    },
  },
  // ... (나머지 도메인은 동일 패턴)
];
```

> **storeSubscribe lazy 구현 전략**: dynamic import는 Promise 반환이므로 동기 subscribe 래퍼 함수에서 직접 사용할 수 없다. `storeSubscribe` 필드를 `syncRegistry.ts` 내에서 완전히 self-contained로 구현하려면 store 모듈이 이미 로드되어 있어야 한다. 이 문제는 §5.2에서 해결한다.

### 5.2 `App.tsx` autoSyncOnSave useEffect (핵심 패턴 결정)

**변경 전** (`src/App.tsx:721-738`):
```typescript
// 수동 16개 목록 — 누락 시 silent bug
const unsubscribers = [
  useScheduleStore.subscribe(() => triggerSaveSync()),
  useSeatingStore.subscribe(() => triggerSaveSync()),
  useEventsStore.subscribe(() => triggerSaveSync()),
  useMemoStore.subscribe(() => triggerSaveSync()),
  useNoteStore.subscribe(() => triggerSaveSync()),
  useTodoStore.subscribe(() => triggerSaveSync()),
  useStudentRecordsStore.subscribe(() => triggerSaveSync()),
  useTeachingClassStore.subscribe(() => triggerSaveSync()),
  useStudentStore.subscribe(() => triggerSaveSync()),
  useSurveyStore.subscribe(() => triggerSaveSync()),
  useAssignmentStore.subscribe(() => triggerSaveSync()),
  useBookmarkStore.subscribe(() => triggerSaveSync()),
  useSeatConstraintsStore.subscribe(() => triggerSaveSync()),
  useDDayStore.subscribe(() => triggerSaveSync()),
  useConsultationStore.subscribe(() => triggerSaveSync()),
  useMealStore.subscribe(() => triggerSaveSync()),
];
```

**변경 후** (registry 기반):

`storeSubscribe`는 syncRegistry에서 lazy 함수를 완전히 캡슐화하기 어렵다 (동기 subscribe API + dynamic import 충돌). 대신 **App.tsx에서 이미 import된 store를 registry와 연결하는 어댑터 패턴**을 사용한다.

두 가지 구현 옵션을 검토한 결과 **옵션 B(registry 순회 + import 목록 별도 관리)** 권장:

**옵션 A: App.tsx에서 완전 registry 위임** (순수하지만 App.tsx에 모든 store import 필요)
```typescript
// App.tsx 상단에 모든 store import 유지, 그러나 subscribe는 registry에서 위임
import { SYNC_REGISTRY } from '@usecases/sync/syncRegistry';
// ... 기존 store imports 유지

useEffect(() => {
  // ...
  // registry에서 subscribeExcluded가 false인 항목만 선택
  // storeSubscribe는 registry가 직접 갖거나, App.tsx에서 store map으로 연결
  const storeMap: Record<string, { subscribe: (cb: () => void) => () => void }> = {
    'class-schedule': useScheduleStore,
    'students': useStudentStore,
    // ... (registry와 동기화 필요한 매핑)
  };

  const unsubscribers = SYNC_REGISTRY
    .filter(d => !d.subscribeExcluded)
    .map(d => {
      const store = storeMap[d.fileName];
      if (!store) return () => {};  // 매핑 없으면 noop
      return store.subscribe(() => triggerSaveSync());
    });
  // ...
```

옵션 A는 `storeMap`을 별도로 유지해야 하므로 문제가 부분적으로 존재한다.

**옵션 B (권장): `storeSubscribe`를 registry 내 lazy 클로저로 구현** — App.tsx는 순수 순회만

`syncRegistry.ts`에서 `storeSubscribe`를 실제 동기 함수로 제공할 수 있다. Zustand store 모듈을 `import()`로 미리 로드할 필요 없이, `require()` 또는 **dynamic import를 피하고 store 객체를 클로저로 capture**하는 방식이다.

단, `usecases` → `adapters` import 금지 규칙으로 인해 registry 파일 내에서 store를 직접 참조할 수 없다.

**최종 결정 — 옵션 C: App.tsx가 store-to-fileName 매핑을 registry 구조와 분리하여 보유**

```typescript
// src/App.tsx

import { SYNC_REGISTRY } from '@usecases/sync/syncRegistry';

// App.tsx는 adapters 레이어이므로 store import 허용
// registry의 fileName을 키로 하는 subscribe 어댑터 맵 (App.tsx 내부)
const STORE_SUBSCRIBE_MAP: Record<string, (cb: () => void) => () => void> = {
  'class-schedule':     (cb) => useScheduleStore.subscribe(cb),
  'teacher-schedule':   (cb) => useScheduleStore.subscribe(cb),  // 동일 store, 중복 구독 주의
  'timetable-overrides':(cb) => useScheduleStore.subscribe(cb),
  'students':           (cb) => useStudentStore.subscribe(cb),
  'seating':            (cb) => useSeatingStore.subscribe(cb),
  'events':             (cb) => useEventsStore.subscribe(cb),
  'memos':              (cb) => useMemoStore.subscribe(cb),
  'todos':              (cb) => useTodoStore.subscribe(cb),
  'student-records':    (cb) => useStudentRecordsStore.subscribe(cb),
  'bookmarks':          (cb) => useBookmarkStore.subscribe(cb),
  'surveys':            (cb) => useSurveyStore.subscribe(cb),
  'assignments':        (cb) => useAssignmentStore.subscribe(cb),
  'seat-constraints':   (cb) => useSeatConstraintsStore.subscribe(cb),
  'teaching-classes':   (cb) => useTeachingClassStore.subscribe(cb),
  'curriculum-progress':(cb) => useTeachingClassStore.subscribe(cb),
  'attendance':         (cb) => useTeachingClassStore.subscribe(cb),
  'dday':               (cb) => useDDayStore.subscribe(cb),
  'consultations':      (cb) => useConsultationStore.subscribe(cb),
  'manual-meals':       (cb) => useMealStore.subscribe(cb),
};

// autoSyncOnSave useEffect (기존 App.tsx:708-744 교체)
useEffect(() => {
  const syncSettings = useSettingsStore.getState().settings.sync;
  if (!syncSettings?.enabled || !syncSettings.autoSyncOnSave) return;

  const calState = useCalendarSyncStore.getState();
  if (!calState.isConnected) return;

  const { triggerSaveSync } = useDriveSyncStore.getState();

  // registry 기반 순회 — 단일 소스, 누락 불가
  const unsubscribers = SYNC_REGISTRY
    .filter(d => !d.subscribeExcluded && STORE_SUBSCRIBE_MAP[d.fileName])
    .map(d => STORE_SUBSCRIBE_MAP[d.fileName](() => triggerSaveSync()));

  return () => {
    unsubscribers.forEach(unsub => unsub());
  };
}, [settings.sync?.enabled, settings.sync?.autoSyncOnSave]);
```

> **중복 subscribe 처리**: `teacher-schedule`, `timetable-overrides`, `curriculum-progress`, `attendance`는 모두 `subscribeExcluded: true`로 설정(§4 도메인 등록 표 참조)하여 `STORE_SUBSCRIBE_MAP`에서도 제외한다. 이렇게 하면 동일 store에 대한 중복 subscribe 문제가 발생하지 않는다.

**최종 App.tsx 변경 요약**:
- 기존 16행 수동 목록 → registry.filter+map 기반 4~5행으로 축소
- `STORE_SUBSCRIBE_MAP`은 registry와 1:1 대응하는 store 어댑터 — SyncSubscribers 테스트로 갭 자동 탐지
- `useNoteStore.subscribe` 처리는 §6 참조

### 5.3 `SyncToCloud.ts` 변경

**변경 전** (`src/usecases/sync/SyncToCloud.ts:15-21`):
```typescript
export const SYNC_FILES = [
  'settings', 'class-schedule', 'teacher-schedule', ...
] as const;

export type SyncFileName = typeof SYNC_FILES[number];
```

**변경 후**:
```typescript
// src/usecases/sync/SyncToCloud.ts
export { SYNC_FILES, type SyncFileName } from './syncRegistry';
// 또는 import 후 re-export
```

`SYNC_FILES`와 `SyncFileName`은 기존 import 경로(`from './SyncToCloud'`)를 유지하여 `SyncFromCloud.ts`와 테스트 코드가 경로 변경 없이 동작한다.

`isDynamic` 처리 훅은 본 리팩터에서 인터페이스만 준비하고 실제 호출은 note-cloud-sync PDCA에서 구현:

```typescript
// SyncToCloud.execute() 내부 — 향후 note-cloud-sync에서 활성화할 자리 표시
const dynamicFiles: string[] = [];
for (const domain of SYNC_REGISTRY) {
  if (domain.isDynamic && domain.enumerateDynamic) {
    const keys = await domain.enumerateDynamic();
    dynamicFiles.push(...keys);
  }
}
// const allFiles = [...SYNC_FILES, ...dynamicFiles];  // note-cloud-sync PDCA 활성화 시 사용
// 현재는 SYNC_FILES만 사용 (기존 동작 유지)
```

### 5.4 `useDriveSync.ts` reloadStores 변경

**변경 전** (`src/adapters/hooks/useDriveSync.ts:4-123`): switch-case 약 120줄

**변경 후**:
```typescript
// src/adapters/hooks/useDriveSync.ts
import { SYNC_REGISTRY } from '@usecases/sync/syncRegistry';

export async function reloadStores(downloadedFiles: string[]): Promise<void> {
  // 노트 동적 파일 처리 (note-cloud-sync PDCA가 완료될 때까지 유지)
  for (const file of downloadedFiles) {
    try {
      if (
        file === 'note-notebooks' ||
        file === 'note-sections' ||
        file === 'note-pages-meta' ||
        file.startsWith('note-body--')
      ) {
        const { useNoteStore } = await import('@adapters/stores/useNoteStore');
        useNoteStore.setState({ loaded: false });
        await useNoteStore.getState().load(true);
        continue;
      }

      // registry 기반 dispatch — switch-case 제거
      const domain = SYNC_REGISTRY.find(d => d.fileName === file);
      if (domain) {
        await domain.reload();
      } else {
        console.warn(`[DriveSync] reloadStores: registry에 없는 파일 키: ${file}`);
      }
    } catch (err) {
      console.error(`[DriveSync] Failed to reload store for ${file}:`, err);
    }
  }
}
```

> **bookmarks 패턴 처리**: bookmarks는 `setState({ loaded: false })` + `load()` 패턴이 아닌 `loadAll()`을 직접 호출한다(`src/adapters/hooks/useDriveSync.ts:70-73`). 이 예외는 registry의 `reload` 함수 내에 직접 캡슐화하면 된다:
> ```typescript
> // SYNC_REGISTRY bookmarks 항목
> {
>   fileName: 'bookmarks',
>   reload: async () => {
>     const { useBookmarkStore } = await import('@adapters/stores/useBookmarkStore');
>     await useBookmarkStore.getState().loadAll();  // loaded 플래그 없는 패턴
>   },
> }
> ```

> **assignments 패턴 처리**: `useAssignmentStore.getState().loadAssignments()` 직접 호출 패턴도 동일하게 registry `reload` 내 캡슐화.

### 5.5 `SyncFromCloud.ts` 변경

`SyncFromCloud.ts:6`에서 `SYNC_FILES`를 `SyncToCloud`에서 import하는 구조가 이미 존재한다. `SyncToCloud.ts`에서 `syncRegistry.ts` re-export로 바꾸면 `SyncFromCloud.ts`는 import 경로 변경 없이 자동으로 registry 기반 `SYNC_FILES`를 사용한다.

변경 없음 (경로 호환 유지로 인해).

---

## 6. useNoteStore Dead Subscribe 처리 방침

### 6.1 현황

`src/App.tsx:726`에서 `useNoteStore.subscribe(() => triggerSaveSync())`가 등록되어 있으나, `SYNC_FILES`에 노트 관련 키가 전혀 없다. 이는 note-cloud-sync Plan(`docs/01-plan/features/note-cloud-sync.plan.md`)에서 "dead 구독 버그"로 명시된 상태다.

본 리팩터는 이 dead subscribe를 SYNC_REGISTRY로 마이그레이션할 수 있는 시점이다. 세 가지 처리 옵션을 검토한다.

### 6.2 처리 옵션 비교

| 안 | 방법 | 장점 | 단점 |
|----|------|------|------|
| **A** (즉시 제거) | `useNoteStore.subscribe` 제거, registry에 미등록 | 코드 클린 | note-cloud-sync 진행 중 매번 add/remove 필요 → 회귀 위험 |
| **B** (보존 + 주석) | `useNoteStore.subscribe` 기존 위치 그대로 보존, `// TODO: note-cloud-sync에서 SYNC_REGISTRY로 이동` 주석 추가 | 최소 변경, 회귀 없음 | dead 구독 상태 일시 지속 |
| **C** (통합 사이클) | note-cloud-sync PDCA를 본 리팩터와 함께 진행 | 한 번에 정리 | PR 크기 비대화, 본 리팩터 범위 초과 |

### 6.3 권장 방침: **B안 (보존)** 채택

**사유**:
- A안은 단기 클린하지만 note-cloud-sync PDCA 착수 전까지 `useNoteStore` 변경 사항이 autoSyncOnSave에서 누락 → 기능 회귀. 단, 현재도 SYNC_FILES에 노트 키가 없으므로 클라우드 업로드 자체는 발생 안 함 — dead subscribe 상태는 동일하게 유지.
- C안은 본 리팩터의 핵심 목적(구조 개선)에 집중하지 못하게 함.
- B안: 기존 동작 그대로 유지 + 명확한 TODO 주석으로 note-cloud-sync PDCA 착수 시 즉시 확인 가능.

**구현**:
```typescript
// src/App.tsx autoSyncOnSave useEffect 내

const unsubscribers = SYNC_REGISTRY
  .filter(d => !d.subscribeExcluded && STORE_SUBSCRIBE_MAP[d.fileName])
  .map(d => STORE_SUBSCRIBE_MAP[d.fileName](() => triggerSaveSync()));

// TODO: note-cloud-sync PDCA 완료 후 아래 줄을 SYNC_REGISTRY로 이동
// useNoteStore는 SYNC_FILES에 노트 키가 없어 현재 dead subscribe 상태 (note-cloud-sync.plan.md §1.1)
const noteUnsub = useNoteStore.subscribe(() => triggerSaveSync());

return () => {
  unsubscribers.forEach(unsub => unsub());
  noteUnsub();
};
```

---

## 7. Circular Import 방지 전략

### 7.1 문제 정의

`syncRegistry.ts`는 `usecases/sync/` 레이어에 위치한다. Zustand store는 `adapters/stores/`에 위치한다. Clean Architecture 규칙:

```
✅ adapters/ → usecases/   (허용)
❌ usecases/ → adapters/   (금지)
```

따라서 registry에서 store를 직접 import할 수 없다.

### 7.2 Dynamic Import 패턴

모든 `reload` 함수는 dynamic import lazy 함수로 구현한다. 이 패턴은 `useDriveSync.ts:21-122`의 기존 구현 방식과 동일하다.

```typescript
// ✅ 허용: dynamic import는 모듈 로드 시점에 실행되지 않음
reload: async () => {
  const { useScheduleStore } = await import('@adapters/stores/useScheduleStore');
  useScheduleStore.setState({ loaded: false });
  await useScheduleStore.getState().load();
},

// ❌ 금지: 모듈 최상단 정적 import
import { useScheduleStore } from '@adapters/stores/useScheduleStore'; // circular!
```

### 7.3 storeSubscribe에서의 문제

`storeSubscribe`는 동기 함수(`(cb) => () => void`)여야 하므로 dynamic import를 내부에서 호출할 수 없다. 이로 인해 §5.2에서 선택한 **옵션 C (App.tsx가 STORE_SUBSCRIBE_MAP 보유)** 구조가 자연스럽게 도출된다.

```
syncRegistry.ts (usecases/)
  → reload만 dynamic import로 구현
  → storeSubscribe는 정의하지 않음 (or App.tsx 어댑터 참조용 타입만)

App.tsx (adapters/)
  → store를 직접 import 가능
  → STORE_SUBSCRIBE_MAP으로 fileName → store.subscribe 연결
  → SYNC_REGISTRY.filter+map으로 unsubscribers 생성
```

### 7.4 ESM/CJS 호환

`import()` 표준 dynamic import 사용. Vite(ESM) + Electron(CJS) 모두에서 동작. `require()` 사용 금지.

```typescript
// ✅ 표준 dynamic import (Vite ESM + Electron 모두 지원)
const { useScheduleStore } = await import('@adapters/stores/useScheduleStore');

// ❌ require() — CJS 전용, Vite ESM 환경에서 타입 없음
const { useScheduleStore } = require('@adapters/stores/useScheduleStore');
```

### 7.5 vitest 환경 검증

vitest에서 dynamic import는 표준으로 동작한다. `SyncSubscribers.test.ts`에서 registry의 `reload` 함수를 직접 실행하지 않고(mocking 없이 실제 store를 로드하면 부작용 발생), 대신 **함수 존재 여부와 구조적 정합성**만 검증한다.

---

## 8. SyncSubscribers.test.ts 재작성 — 메타 테스트 4개

### 8.1 기존 테스트의 문제점

현재 `src/usecases/sync/__tests__/SyncSubscribers.test.ts`는:
1. `FILE_TO_STORE` 수동 테이블(20개 항목)을 테스트 파일 내에 하드코딩
2. 이 테이블과 `SYNC_FILES`의 정합성, 그리고 `App.tsx`의 subscribe 블록 텍스트 일치를 검증

registry 도입 후 `FILE_TO_STORE`는 registry 자체로 대체된다. 메타 테스트는 "registry가 단일 소스이므로 registry 자체의 완전성"을 검증하는 방향으로 전환한다.

### 8.2 재작성 테스트 4개

```typescript
// src/usecases/sync/__tests__/SyncSubscribers.test.ts (재작성)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SYNC_REGISTRY, SYNC_FILES } from '../syncRegistry';

describe('syncRegistry 구조적 정합성', () => {

  // (a) 모든 SYNC_FILES가 SYNC_REGISTRY에 등재되어 있는지
  it('(a) SYNC_FILES의 모든 fileName은 SYNC_REGISTRY에서 파생되어야 한다', () => {
    const registryFileNames = SYNC_REGISTRY
      .filter(d => !d.isDynamic)
      .map(d => d.fileName);
    expect(SYNC_FILES).toEqual(registryFileNames);
  });

  // (b) subscribeExcluded가 false인 모든 도메인은 STORE_SUBSCRIBE_MAP에 등재됨을 확인
  // (App.tsx STORE_SUBSCRIBE_MAP 텍스트 파싱으로 검증)
  it('(b) subscribeExcluded가 없는 도메인은 App.tsx STORE_SUBSCRIBE_MAP에 등재되어야 한다', () => {
    const appPath = resolve(__dirname, '../../../App.tsx');
    const appSource = readFileSync(appPath, 'utf8');

    const startMarker = 'STORE_SUBSCRIBE_MAP';
    const startIdx = appSource.indexOf(startMarker);
    expect(startIdx, 'App.tsx에서 STORE_SUBSCRIBE_MAP을 찾지 못함').toBeGreaterThan(-1);

    const endMarker = '};';
    const endIdx = appSource.indexOf(endMarker, startIdx);
    const block = appSource.slice(startIdx, endIdx);

    const shouldSubscribe = SYNC_REGISTRY
      .filter(d => !d.subscribeExcluded && !d.isDynamic);

    const missing: string[] = [];
    for (const domain of shouldSubscribe) {
      if (!block.includes(`'${domain.fileName}'`)) {
        missing.push(domain.fileName);
      }
    }
    expect(
      missing,
      `다음 도메인이 App.tsx STORE_SUBSCRIBE_MAP에 없습니다: ${missing.join(', ')}\n` +
      `새 도메인을 SYNC_REGISTRY에 추가할 때 STORE_SUBSCRIBE_MAP도 함께 업데이트하세요.`,
    ).toEqual([]);
  });

  // (c) registry 내 fileName 중복 없음
  it('(c) SYNC_REGISTRY에 중복 fileName이 없어야 한다', () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const d of SYNC_REGISTRY) {
      if (seen.has(d.fileName)) {
        duplicates.push(d.fileName);
      }
      seen.add(d.fileName);
    }
    expect(duplicates, `중복 fileName 발견: ${duplicates.join(', ')}`).toEqual([]);
  });

  // (d) 역방향: settings는 반드시 subscribeExcluded이어야 한다 (무한루프 방지 회귀 감지)
  it('(d) settings 도메인은 subscribeExcluded: true이어야 한다 (무한루프 방지)', () => {
    const settings = SYNC_REGISTRY.find(d => d.fileName === 'settings');
    expect(settings, 'settings 도메인이 registry에 없음').toBeDefined();
    expect(settings!.subscribeExcluded).toBe(true);
  });

  // 추가: reload 함수 존재 검증 (모든 도메인)
  it('(e) 모든 도메인에 reload 함수가 정의되어 있어야 한다', () => {
    const missing = SYNC_REGISTRY.filter(d => typeof d.reload !== 'function');
    expect(
      missing.map(d => d.fileName),
      `reload 함수 미정의 도메인: ${missing.map(d => d.fileName).join(', ')}`,
    ).toEqual([]);
  });

  // 추가: isDynamic이면 enumerateDynamic도 있어야 함
  it('(f) isDynamic: true인 도메인은 enumerateDynamic 함수를 반드시 가져야 한다', () => {
    const invalid = SYNC_REGISTRY.filter(
      d => d.isDynamic && typeof d.enumerateDynamic !== 'function',
    );
    expect(
      invalid.map(d => d.fileName),
    ).toEqual([]);
  });
});
```

---

## 9. 마이그레이션 단계 (Do 단계 step-by-step)

| 단계 | 내용 | 변경 파일 | 검증 |
|------|------|-----------|------|
| **Step 1** | `syncRegistry.ts` 신규 생성 — `SyncDomain` 인터페이스 + 20개 도메인 전체 등록 + `SYNC_FILES`/`SyncFileName` 파생 export | `src/usecases/sync/syncRegistry.ts` (신규) | `tsc --noEmit` 에러 0 |
| **Step 2** | `SyncToCloud.ts` — `SYNC_FILES`, `SyncFileName` export 를 syncRegistry re-export로 교체 | `src/usecases/sync/SyncToCloud.ts` | tsc 에러 0 + 기존 동작 무변경 확인 |
| **Step 3** | `SyncFromCloud.ts` — import 경로 `./SyncToCloud`는 유지 (변경 없음), 단 Step 2 re-export로 자동 연결됨 | 변경 없음 | vitest 기존 테스트 통과 |
| **Step 4** | `SyncSubscribers.test.ts` — FILE_TO_STORE 수동 테이블 제거, registry 기반 6개 메타 테스트로 재작성 | `src/usecases/sync/__tests__/SyncSubscribers.test.ts` | vitest 전량 통과 |
| **Step 5** | `App.tsx` — `STORE_SUBSCRIBE_MAP` 추가 + `unsubscribers` 배열을 registry.filter+map으로 교체 + `useNoteStore.subscribe` B안 주석 보존 | `src/App.tsx` | vitest 통과 + e2e 수동 검증(autoSyncOnSave 동작) |
| **Step 6** | `useDriveSync.ts` — `reloadStores` switch-case 제거, registry dispatch로 교체 | `src/adapters/hooks/useDriveSync.ts` | vitest 통과 + e2e 수동 검증(다운로드 후 store reload) |
| **Step 7** | `tsc --noEmit` + vitest 전량 통과 + gap-detector 재실행 (Match Rate ≥ 96% 유지) | — | 최종 검증 |

**단계별 커밋 전략**: 각 Step을 별도 커밋으로 분리. 중간 상태에서도 tsc와 vitest가 통과해야 한다. Step 1~3은 논리적으로 함께 커밋 가능.

---

## 10. 파일별 변경 명세

### 10.1 신규 파일

| 파일 | 역할 | 예상 LOC |
|------|------|----------|
| `src/usecases/sync/syncRegistry.ts` | `SyncDomain` 인터페이스 + `SYNC_REGISTRY` 20개 도메인 + `SYNC_FILES`/`SyncFileName` 파생 export | ~180줄 |

### 10.2 수정 파일

| 파일 | 변경 내용 | 예상 변경 LOC |
|------|-----------|---------------|
| `src/usecases/sync/SyncToCloud.ts` | `SYNC_FILES` 리터럴 배열(L15-21) 제거 → `export { SYNC_FILES, SyncFileName } from './syncRegistry'` re-export로 교체 | -8 / +2 |
| `src/usecases/sync/SyncFromCloud.ts` | 변경 없음 (SyncToCloud re-export로 자동 연결) | 0 |
| `src/App.tsx` | `STORE_SUBSCRIBE_MAP` 추가(~25줄) + `unsubscribers` 블록 교체(-16 / +5) + useNoteStore 보존 주석 | +15 |
| `src/adapters/hooks/useDriveSync.ts` | switch-case 110줄 → registry dispatch 10줄 | -100 / +10 |
| `src/usecases/sync/__tests__/SyncSubscribers.test.ts` | FILE_TO_STORE 전체 제거 후 registry 기반 6개 메타 테스트로 재작성 | -90 / +90 |

---

## 11. 검증 및 테스트 전략

### 11.1 단위 테스트

| 테스트 | 내용 | 위치 |
|--------|------|------|
| registry 등록 무결성 | 20개 도메인 전체 등록, 중복 없음, `SYNC_FILES` 파생 정확성 | `SyncSubscribers.test.ts` |
| reload 함수 존재 | 모든 도메인에 `reload` 함수 정의됨 | `SyncSubscribers.test.ts` |
| subscribeExcluded 정합성 | settings, teacher-schedule 등 subscribeExcluded 도메인 확인 | `SyncSubscribers.test.ts` |
| isDynamic 정합성 | isDynamic이면 enumerateDynamic 반드시 존재 | `SyncSubscribers.test.ts` |
| App.tsx 매핑 갭 탐지 | STORE_SUBSCRIBE_MAP이 registry와 동기화되어 있는지 | `SyncSubscribers.test.ts` |

### 11.2 통합 시나리오

| 시나리오 | 기대 결과 | 검증 방법 |
|----------|-----------|-----------|
| `SyncToCloud.execute()` 실행 | registry 기반 SYNC_FILES로 동일 20개 파일 업로드 | vitest mock |
| autoSyncOnSave 트리거 | 16개 store 변경 모두 triggerSaveSync 호출 | 수동 e2e |
| Drive 다운로드 후 reloadStores | 20개 파일 각각 올바른 store reload | vitest mock |
| settings 도메인 | 자동 업로드 구독 없음, 다운로드 후 reload 동작 | 수동 e2e |

### 11.3 회귀 검증

- `npx tsc --noEmit` — 에러 0개
- `vitest run` — 기존 테스트 전량 통과
- events, surveys, assignments, seat-constraints 도메인을 수동으로 변경 후 Drive에 반영되는지 확인 (2026-04-26 원인 버그 재발 방지)
- gap-detector 재실행 후 Match Rate 96% 이상 유지

---

## 12. 위험 및 대응

| 위험 | 영향도 | 발생 가능성 | 대응 |
|------|:------:|:-----------:|------|
| Circular import (syncRegistry → adapters) | High | Low | 모든 store 참조는 `await import()` lazy로만. `usecases/`에서 `@adapters/` 정적 import 절대 금지 |
| `teacher-schedule`/`timetable-overrides` 중복 subscribe | Medium | Medium | `subscribeExcluded: true`로 명시. class-schedule 1개만 subscribe — 동일 store이므로 1번 구독으로 충분 |
| `bookmarks`/`assignments` reload 패턴 예외 | Low | Certain | 각 도메인 `reload` 내에 해당 store의 실제 메서드(`loadAll`, `loadAssignments`) 캡슐화 — 패턴 불일치는 registry 내부에서 흡수 |
| `SYNC_FILES` 타입 변화 (`as const` 튜플 → `readonly string[]`) | Low | Certain | `SyncFileName`을 `string` 서브타입으로 유지. 타입 narrowing이 필요한 기존 코드가 있으면 수동 확인 필요 |
| ESM/CJS 혼합 환경에서 dynamic import 동작 | Medium | Low | `import()` 표준만 사용. vitest + Electron 모두 ESM 지원 확인 |
| App.tsx STORE_SUBSCRIBE_MAP 동기화 누락 | High | Medium | SyncSubscribers 테스트 (b)가 자동 탐지 — SYNC_REGISTRY 항목 추가 시 테스트가 빨간불 |
| useNoteStore dead subscribe 잔존 | Low | Certain | B안으로 TODO 주석 보존. note-cloud-sync PDCA 착수 시 처리 예정 |

---

## 13. 연관 PDCA 인터페이스 계약

### 13.1 note-cloud-sync가 사용할 인터페이스

본 리팩터 완료 후 note-cloud-sync PDCA는 아래 절차로 registry에 노트 도메인을 추가한다:

1. `syncRegistry.ts`에 정적 노트 파일 3개 추가:
   ```typescript
   { fileName: 'note-notebooks', storeSubscribe: ..., reload: ... },
   { fileName: 'note-sections', storeSubscribe: ..., reload: ... },
   { fileName: 'note-pages-meta', storeSubscribe: ..., reload: ... },
   ```
2. 동적 페이지 본문 도메인 추가:
   ```typescript
   {
     fileName: 'note-body--',  // 접두사 — isDynamic이므로 SYNC_FILES에 포함 안 됨
     isDynamic: true,
     enumerateDynamic: async () => {
       // INotebookRepository.listPageBodyKeys() 호출 (도메인 인터페이스 통해)
     },
     reload: async () => {
       const { useNoteStore } = await import('@adapters/stores/useNoteStore');
       useNoteStore.setState({ loaded: false });
       await useNoteStore.getState().load(true);
     },
   }
   ```
3. `SyncToCloud.execute()`의 isDynamic 훅 호출 코드 주석 해제 (§5.3 참조)
4. App.tsx `STORE_SUBSCRIBE_MAP`에 정적 3개 키 추가 + useNoteStore TODO 주석 정식 처리
5. `SyncSubscribers.test.ts` 자동 통과 (새 도메인 등록만으로 메타 테스트 만족)

### 13.2 first-sync-confirmation이 사용할 인터페이스

```typescript
// FirstSyncConfirmModal 내에서 동기화 대상 도메인 목록 표시
import { SYNC_REGISTRY } from '@usecases/sync/syncRegistry';

const displayableDomains = SYNC_REGISTRY
  .filter(d => !d.isDynamic)
  .map(d => d.fileName);
// → "시간표, 좌석배치, 일정, ... 20개 도메인이 동기화됩니다"
```

---

## 14. 코딩 컨벤션

- TypeScript strict 모드 (`noImplicitAny`, `strictNullChecks`) — `any` 사용 금지
- 파일명: `camelCase.ts` (`syncRegistry.ts`)
- 상수: `UPPER_SNAKE_CASE` (`SYNC_REGISTRY`, `SYNC_FILES`, `STORE_SUBSCRIBE_MAP`)
- 인터페이스: `PascalCase` (`SyncDomain`)
- JSDoc 주석: 모든 인터페이스 필드에 한국어 설명 포함
- 들여쓰기: 2 spaces, 세미콜론 사용, 작은따옴표

---

## 버전 이력

| 버전 | 날짜 | 변경 내용 | 작성자 |
|------|------|-----------|--------|
| 0.1 | 2026-04-26 | 최초 작성 | pblsketch |
