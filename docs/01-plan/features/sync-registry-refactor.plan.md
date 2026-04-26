# sync-registry-refactor 계획 문서

> **요약**: SYNC_FILES·subscribe·reloadStores·FILE_TO_STORE 4곳에 분산된 동기화 매핑을 단일 소스(`syncRegistry.ts`)로 통합하여 회귀 구조를 제거한다.
>
> **프로젝트**: SsamPin
> **버전**: v1.11.x
> **작성자**: pblsketch
> **작성일**: 2026-04-26
> **상태**: Draft

---

## 1. 개요

### 1.1 목적

Google Drive 동기화 경로에는 '어떤 도메인을 동기화할지'를 정의하는 지점이 현재 4곳에 분산되어 있다.
이 분산 구조가 2026-04-26 사용자 피드백 사고의 구조적 원인이었다.
본 계획은 해당 매핑을 단일 소스(`syncRegistry.ts`)로 통합하여,
새 도메인 추가 시 한 줄만 수정하면 모든 동기화 경로가 자동으로 정합되도록 한다.

### 1.2 배경 — 실제 발생 사고

2026-04-26 사용자 피드백 대응 과정에서 아래 버그의 구조적 원인이 드러났다.

**버그**: `surveys`, `assignments`, `seat-constraints`, `teaching-classes`, `curriculum-progress`, `attendance`, `dday`, `consultations`, `manual-meals` 등 여러 도메인이 자동 동기화(autoSyncOnSave)에서 누락되어 있었다.

**원인**: 아래 4곳이 각각 독립적으로 관리되고 있어, 한 곳에 키를 추가해도 다른 곳을 빠뜨리면 버그 상태가 된다.

| 위치 | 역할 | 파일 |
|------|------|------|
| `SYNC_FILES` 배열 | 업로드 대상 파일명 열거 | `src/usecases/sync/SyncToCloud.ts:15-21` |
| `autoSyncOnSave` subscribe 리스트 | 어떤 store 변경에 반응할지 | `src/App.tsx:721-738` |
| `reloadStores` switch 분기 | 다운로드 후 어떤 store를 리로드할지 | `src/adapters/hooks/useDriveSync.ts` |
| `FILE_TO_STORE` 매핑 테이블 | 회귀 검증용 메타 정보 | `src/usecases/sync/__tests__/SyncSubscribers.test.ts` |

`SyncSubscribers.test.ts`는 이 분산 구조를 **사후 탐지**하는 완화책으로 도입되었지만,
근본 원인(분산 정의)은 그대로 남아 있다. 본 리팩터는 원인 자체를 제거한다.

### 1.3 관련 문서

- 기존 동기화 설계: `src/usecases/sync/SyncToCloud.ts`, `src/usecases/sync/SyncFromCloud.ts`
- 회귀 탐지 테스트: `src/usecases/sync/__tests__/SyncSubscribers.test.ts`
- 연관 PDCA (선행 권장):
  - `note-cloud-sync` — dynamic file enumeration이 registry를 사용하면 구현 단순화
  - `first-sync-confirmation` — 동기화 대상 안내 시 SYNC_REGISTRY를 참조 가능

---

## 2. 범위

### 2.1 포함 범위

- [ ] `src/usecases/sync/syncRegistry.ts` 신규 작성 (20개 도메인 등록)
- [ ] `SyncToCloud.ts`의 `SYNC_FILES`를 registry에서 파생 상수로 re-export
- [ ] `App.tsx` autoSyncOnSave useEffect를 registry 기반 순회로 교체
- [ ] `useDriveSync.reloadStores`의 switch 분기를 registry 기반 dispatch로 교체
- [ ] `SyncSubscribers.test.ts`를 registry 자체 정합 검증으로 재작성
- [ ] 새 도메인 추가 시 단일 지점(registry) 수정만으로 충분함을 메타테스트로 검증

### 2.2 제외 범위

- 동기화 메커니즘(체크섬, 매니페스트, 충돌 감지) 변경 — 기존 로직 그대로 유지
- 새 도메인(note-cloud-sync 등) 추가 — 별도 PDCA에서 진행
- subscribeWithSelector 도입 (성능 최적화) — 별도 사이클
- SyncFromCloud.ts 내부 로직 변경 — 인터페이스만 활용

---

## 3. 요구사항

### 3.1 기능 요구사항

| ID | 요구사항 | 우선순위 | 상태 |
|----|----------|----------|------|
| FR-01 | `syncRegistry.ts`에 `SyncDomain` 인터페이스와 `SYNC_REGISTRY` 배열을 정의한다 | Must | Pending |
| FR-02 | `SYNC_FILES`는 `SYNC_REGISTRY`에서 `.map(d => d.fileName)`으로 파생되어야 한다 | Must | Pending |
| FR-03 | `App.tsx` subscribe 리스트는 `SYNC_REGISTRY.forEach`로 구동되어야 한다 | Must | Pending |
| FR-04 | `reloadStores`는 `SYNC_REGISTRY.find(d => d.fileName === f).reload()`로 dispatch해야 한다 | Must | Pending |
| FR-05 | `SyncSubscribers.test.ts`는 FILE_TO_STORE 수동 테이블 대신 registry 자체를 검증해야 한다 | Must | Pending |
| FR-06 | 동적 파일(note-body-- 접두사 등)을 위한 `isDynamic` / `enumerateDynamic` 필드를 인터페이스에 포함한다 | Should | Pending |
| FR-07 | `settings`처럼 subscribe 제외 대상은 `subscribeExcluded: true` 플래그로 명시한다 | Should | Pending |
| FR-08 | 기존 `SyncFileName` 타입은 호환성을 위해 유지한다 | Should | Pending |

### 3.2 비기능 요구사항

| 분류 | 기준 | 측정 방법 |
|------|------|-----------|
| 정확성 | 기존 동작과 100% 동일 (16개+ 도메인 동기화 회귀 없음) | vitest + gap-detector |
| 유지보수성 | 새 도메인 추가 시 수정 지점 4곳 → 1곳 | 코드 리뷰 |
| 타입 안전성 | TypeScript strict 모드 에러 0개 | `npx tsc --noEmit` |
| 테스트 커버리지 | vitest 18+ 통과 | CI |

---

## 4. 성공 기준

### 4.1 완료 정의

- [ ] `syncRegistry.ts` 작성 완료, 20개 도메인 전체 등록
- [ ] `SYNC_FILES` 파생 상수로 re-export, 기존 import 경로 호환 유지
- [ ] `App.tsx` subscribe 블록이 수동 리스트 없이 registry 순회로 동작
- [ ] `useDriveSync.ts` switch 분기 제거, registry 기반 단순 dispatch
- [ ] `SyncSubscribers.test.ts` 재작성 완료 — registry 항목 누락 자동 탐지
- [ ] `npx tsc --noEmit` 에러 0개
- [ ] vitest 전체 통과

### 4.2 품질 기준

- [ ] gap-detector 재실행 시 Match Rate 96% 이상 유지 (회귀 없음)
- [ ] 새 도메인을 registry에 한 줄 추가 후 tsc + vitest 통과 → 자동 동기화 활성화 확인
- [ ] `settings` 도메인의 subscribe 제외 동작 유지 (무한루프 방지)

---

## 5. 기술 접근

### 5.1 단일 소스 구조 (syncRegistry.ts)

```typescript
// src/usecases/sync/syncRegistry.ts
// ⚠️ usecases 레이어: adapters import 금지 → storeRef는 lazy 함수로만 참조

export interface SyncDomain {
  /** Drive에 저장되는 파일 기본명 (확장자 제외) */
  fileName: string;
  /** subscribe에서 제외할 도메인 (settings 등 무한루프 위험 항목) */
  subscribeExcluded?: boolean;
  /** true = fileName이 가변 접두사를 갖는 동적 파일군 */
  isDynamic?: boolean;
  /** 동적 파일명 목록 열거 함수 (isDynamic === true인 경우 제공) */
  enumerateDynamic?: () => Promise<string[]>;
  /**
   * 다운로드 후 store 리로드 함수 — lazy dynamic import로 구현해야 circular 방지
   * settings처럼 subscribeExcluded인 도메인도 reload는 필요하므로 분리
   */
  reload: () => Promise<void>;
}

export const SYNC_REGISTRY: SyncDomain[] = [
  {
    fileName: 'settings',
    subscribeExcluded: true,  // 무한루프 방지: store 변경 시 자동 업로드 제외
    reload: async () => {
      const { useSettingsStore } = await import('@adapters/stores/useSettingsStore');
      useSettingsStore.setState({ loaded: false });
      await useSettingsStore.getState().load();
    },
  },
  {
    fileName: 'class-schedule',
    reload: async () => {
      const { useScheduleStore } = await import('@adapters/stores/useScheduleStore');
      useScheduleStore.setState({ loaded: false });
      await useScheduleStore.getState().load();
    },
  },
  // ... 나머지 19개 도메인
];

/** 기존 코드 호환용 파생 상수 */
export const SYNC_FILES = SYNC_REGISTRY.map(d => d.fileName) as readonly string[];
export type SyncFileName = (typeof SYNC_FILES)[number];
```

> **참고**: `reload` 함수 내 `dynamic import`는 usecases 레이어에서 adapters를 직접 import하는 것을 피하기 위한 의도적 lazy 평가이다. 이 패턴은 `useDriveSync.ts`의 기존 구현 방식과 동일하다.

### 5.2 단계별 구현 계획

| 단계 | 내용 | 변경 파일 |
|------|------|-----------|
| Step 1 | `syncRegistry.ts` 신규 작성 — 20개 도메인 전체 등록 | `src/usecases/sync/syncRegistry.ts` (신규) |
| Step 2 | `SyncToCloud.ts` — SYNC_FILES를 registry에서 re-export | `src/usecases/sync/SyncToCloud.ts` |
| Step 3 | `App.tsx` — subscribe 블록을 registry 순회로 교체 | `src/App.tsx` |
| Step 4 | `useDriveSync.ts` — switch 분기를 registry dispatch로 교체 | `src/adapters/hooks/useDriveSync.ts` |
| Step 5 | `SyncSubscribers.test.ts` — FILE_TO_STORE 제거, registry 검증으로 재작성 | `src/usecases/sync/__tests__/SyncSubscribers.test.ts` |

### 5.3 App.tsx 변경 전후 비교

**변경 전 (수동 리스트)**:
```typescript
// App.tsx — 수동으로 나열, 누락 시 silent bug
const unsubscribers = [
  useScheduleStore.subscribe(() => triggerSaveSync()),
  useSeatingStore.subscribe(() => triggerSaveSync()),
  // ... 16행 수동 목록
];
```

**변경 후 (registry 순회)**:
```typescript
// App.tsx — registry가 단일 소스, 누락 불가
const unsubscribers = SYNC_REGISTRY
  .filter(d => !d.subscribeExcluded)
  .map(d => d.storeSubscribe(() => triggerSaveSync()));
```

> `storeSubscribe` 구현 방법: registry의 각 도메인이 `subscribeStore: (cb: () => void) => () => void` 함수를 제공하거나, App.tsx에서 dynamic import로 store를 초기화하는 방식. 상세는 Design 단계에서 결정.

### 5.4 useDriveSync.ts 변경 전후 비교

**변경 전 (switch 분기 120줄)**:
```typescript
switch (file) {
  case 'settings': { ... break; }
  case 'class-schedule':
  case 'teacher-schedule': { ... break; }
  // ... 120줄
}
```

**변경 후 (registry dispatch)**:
```typescript
const domain = SYNC_REGISTRY.find(d => d.fileName === file);
if (domain) {
  await domain.reload();
}
```

### 5.5 SyncSubscribers.test.ts 재작성 방향

FILE_TO_STORE 수동 테이블을 제거하고 registry 자체를 검증한다.

```typescript
// 변경 후: registry 자체가 단일 소스이므로 "누락 탐지"가 아닌
// "registry 항목 완전성"을 검증하는 방향으로 전환
describe('syncRegistry 정합성', () => {
  it('모든 registry 항목은 fileName이 비어있지 않아야 한다', () => { ... });
  it('reload 함수는 모든 항목에 정의되어 있어야 한다', () => { ... });
  it('SYNC_FILES는 registry에서 파생되어야 한다', () => {
    expect(SYNC_FILES).toEqual(SYNC_REGISTRY.map(d => d.fileName));
  });
  it('중복 fileName이 없어야 한다', () => { ... });
  it('settings는 subscribeExcluded=true여야 한다 (무한루프 방지)', () => { ... });
});
```

---

## 6. 영향 파일

| 파일 | 변경 유형 | 비고 |
|------|-----------|------|
| `src/usecases/sync/syncRegistry.ts` | 신규 | 단일 소스 |
| `src/usecases/sync/SyncToCloud.ts` | 수정 | SYNC_FILES → registry 파생 |
| `src/usecases/sync/SyncFromCloud.ts` | 수정 (소규모) | SYNC_FILES import 경로 변경 시 |
| `src/App.tsx` | 수정 | autoSyncOnSave useEffect 단순화 |
| `src/adapters/hooks/useDriveSync.ts` | 수정 | reloadStores switch 120줄 → 5줄 |
| `src/usecases/sync/__tests__/SyncSubscribers.test.ts` | 재작성 | registry 기반 검증 |

---

## 7. 의존성 및 연관 PDCA

### 7.1 선행 관계

본 리팩터는 독립적으로 진행 가능하다. 다른 PDCA에 의존하지 않는다.

단, 본 리팩터가 **먼저 완료되면** 다음 PDCA 구현이 단순해진다:

| 연관 PDCA | 연관 이유 |
|-----------|-----------|
| `note-cloud-sync` | 노트 동적 파일 enumeration 시 `isDynamic` / `enumerateDynamic` 인터페이스를 활용 가능 |
| `first-sync-confirmation` | "동기화 대상 파일 목록" 안내 시 `SYNC_REGISTRY`를 단일 소스로 참조 가능 |

### 7.2 아키텍처 레이어 규칙

- `syncRegistry.ts`는 **usecases 레이어**에 위치한다.
- adapters(store) 직접 import는 금지 — `reload` 함수 내에서 `dynamic import`로만 참조한다.
- domain/ 레이어는 변경 없음.

---

## 8. 위험 및 미해결 질문

| 위험 | 영향도 | 발생 가능성 | 완화 방안 |
|------|--------|-------------|-----------|
| Circular import | High | Medium | storeRef를 dynamic import(`() => import(...)`) 또는 `() => store` lazy 함수로 두어 모듈 초기화 시점에 순환 참조 방지 |
| TypeScript 제네릭 추출 복잡성 | Medium | Low | `StoreApi` 대신 `() => Promise<void>` 함수 시그니처로만 타입 정의 — Zustand StoreApi 직접 노출 불필요 |
| App.tsx subscribe 방식 변경 시 기존 동작 차이 | High | Low | Step 3 완료 후 즉시 e2e 수동 테스트로 검증 |
| useNoteStore 잔존 subscribe (dead?) | Medium | Medium | App.tsx에 `useNoteStore.subscribe`가 있으나 'note-*' 파일은 SYNC_FILES에 없음 → 본 리팩터 시 이 구독을 SYNC_REGISTRY에 포함(note-cloud-sync 선행)하거나 명시적으로 보존 결정 필요 |

**미해결 질문**:

1. `useNoteStore.subscribe`를 registry에 포함할지, note-cloud-sync PDCA까지 보존할지 결정 필요.
2. `useAssignmentStore`의 `loadAssignments()`처럼 `setState({ loaded: false })` 없이 로드하는 예외 케이스 — reload 함수를 각 domain이 직접 구현하므로 registry 방식에서도 그대로 수용 가능하나 패턴 불일치 문서화 필요.
3. `class-schedule`과 `teacher-schedule`이 같은 store(`useScheduleStore`)를 공유 — registry에서 두 항목이 동일한 reload 함수를 가리키는 것은 허용됨. subscribe는 store 단위이므로 중복 subscribe 여부 재검토 필요.

---

## 9. 우선순위 및 일정

- **Priority**: P2 — 사용자 직접 가시 영향 없음, 구조적 회귀 방지 가치 큼
- **예상 공수**: 1~1.5일 (테스트 재작성 + gap-detector 재검증 포함)
- **권장 착수 시점**: note-cloud-sync / first-sync-confirmation 착수 전

---

## 10. 아키텍처 결정

| 결정 | 선택 | 이유 |
|------|------|------|
| 레이어 위치 | usecases/sync/ | SYNC_FILES가 기존에 usecases에 위치했고, domain 규칙에 해당 |
| store 참조 방식 | dynamic import lazy 함수 | usecases → adapters circular import 방지 |
| 기존 코드 호환성 | SYNC_FILES 파생 re-export 유지 | SyncFromCloud 등 기존 import 경로 무변경 |
| 제네릭 타입 | reload: () => Promise<void> 단순 함수 | StoreApi 제네릭 복잡성 회피 |
| settings 제외 방식 | subscribeExcluded: true 명시 필드 | null 대신 의도를 명확히 표현 |

**Enterprise 레벨 선택 확인**: 쌤핀은 Clean Architecture 4레이어 구조를 유지하며, 본 리팩터도 usecases/adapters 경계를 그대로 따른다.

---

## 11. 다음 단계

1. [ ] Design 문서 작성 (`sync-registry-refactor.design.md`) — `syncRegistry.ts` 인터페이스 상세 + App.tsx subscribe 패턴 확정
2. [ ] `useNoteStore` 잔존 subscribe 처리 방침 결정 (note-cloud-sync와 협의)
3. [ ] 팀 리뷰 및 승인
4. [ ] Step 1~5 순서 구현 착수

---

## 버전 이력

| 버전 | 날짜 | 변경 내용 | 작성자 |
|------|------|-----------|--------|
| 0.1 | 2026-04-26 | 최초 초안 | pblsketch |
