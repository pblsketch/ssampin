# 노트 Google Drive 동기화 Planning Document

> **Summary**: `useNoteStore`가 `autoSyncOnSave`에 구독되어 있지만 실제 업로드가 되지 않는 dead 구독 버그를 수정하고, 쌤핀 노트(노트북/섹션/페이지 메타 + 페이지 본문)를 Google Drive에 완전히 동기화한다.
>
> **Project**: SsamPin
> **Version**: v1.12.x (예정)
> **Author**: pblsketch
> **Date**: 2026-04-26
> **Status**: Draft

---

## 1. 개요

### 1.1 목적

이 기능이 해결하는 문제:

1. **Dead 구독 버그**: `src/App.tsx:726`에서 `useNoteStore.subscribe(() => triggerSaveSync())`가 등록되어 있으나, `src/usecases/sync/SyncToCloud.ts:15-21`의 `SYNC_FILES` 배열에 노트 관련 키(`note-notebooks`, `note-sections`, `note-pages-meta`, `note-body--{pageId}`)가 전혀 포함되어 있지 않다.
2. 결과적으로 스토어 변경 시 `triggerSaveSync()` → `SyncToCloud.execute()`가 호출되지만 노트 데이터는 Drive에 업로드되지 않는다.
3. 사용자가 "학교 노트북에서 입력한 노트가 집 데스크톱에서 안 보임"이라는 피드백을 제기했다.

### 1.2 배경

`JsonNotebookRepository`는 다른 도메인과 달리 **분산 저장 구조**를 사용한다:

| 파일 키 | 역할 |
|---------|------|
| `note-notebooks` | 노트북 메타 목록 (정적 키) |
| `note-sections` | 섹션 메타 목록 (정적 키) |
| `note-pages-meta` | 페이지 메타 목록 (정적 키) |
| `note-body--{pageId}` | 페이지 본문 (동적 파일명, 페이지마다 1파일) |

정적 키 3개는 `SYNC_FILES`에 추가하면 되지만, 페이지 본문은 `pageId`에 따라 파일명이 달라지므로 정적 배열만으로는 처리할 수 없다. **런타임에 현재 존재하는 pageId 목록을 조회하여 동적으로 파일 목록을 생성하는 메커니즘**이 필요하다.

이 문제는 향후 `sync-registry-refactor`(SYNC_FILES와 subscribe를 단일 소스로 통합)와도 연계된다. 단, 본 PDCA는 그 선행 여부와 무관하게 독립적으로 진행 가능하다.

### 1.3 관련 문서

- 기존 동기화 PRD: `PRD.md` — Google Drive 동기화 섹션
- 실시간 게시판 Plan: `docs/01-plan/features/realtime-wall-management.plan.md`
- 관련 PDCA (선행 권장): `sync-registry-refactor` (아직 Plan 미작성)
- 관련 PDCA (병행 가능): `first-sync-confirmation` (아직 Plan 미작성)
- 메타 테스트: `src/usecases/sync/__tests__/SyncSubscribers.test.ts`

---

## 2. 범위

### 2.1 포함 범위 (In Scope)

- [ ] 노트북 메타(`note-notebooks`) Google Drive 업로드/다운로드
- [ ] 섹션 메타(`note-sections`) Google Drive 업로드/다운로드
- [ ] 페이지 메타(`note-pages-meta`) Google Drive 업로드/다운로드
- [ ] 페이지 본문(`note-body--{pageId}`) Google Drive 업로드/다운로드 (동적 enumeration)
- [ ] `SyncToCloud`에 동적 파일 enumeration 훅(`getDynamicSyncFiles`) 추가
- [ ] `SyncFromCloud`에 노트 페이지 본문 다운로드 및 store reload 처리
- [ ] `JsonNotebookRepository`에 현재 저장된 pageId 목록 반환 메서드 추가
- [ ] `useDriveSync.reloadStores`에서 노트 파일 처리 (이미 구현됨 — 회귀 방지 확인)
- [ ] `SyncSubscribers.test.ts`에 노트 키 매핑 추가 (메타 테스트 통과)
- [ ] 같은 페이지를 두 기기가 동시 수정 시 `DriveSyncConflictModal` 충돌 다이얼로그 노출

### 2.2 제외 범위 (Out of Scope)

- 페이지 첨부 이미지/바이너리 파일 동기화 (별도 PDCA)
- 노트 버전 히스토리 / 되돌리기
- 실시간 공동 편집 (본 PDCA는 last-write-wins 또는 충돌 다이얼로그)
- 모바일 앱(`useMobileNoteStore`) 동기화 — 데스크톱 전용 Electron 범위
- BlockNote 에디터 내부 collaborative editing 프로토콜

---

## 3. 요구사항

### 3.1 기능 요구사항 (Functional Requirements)

| ID | 요구사항 | 우선순위 | 상태 |
|----|----------|----------|------|
| FR-01 | 노트 변경(작성/수정/삭제) 시 5초 디바운스 후 자동 Drive 업로드 | Must | Pending |
| FR-02 | 정적 3개 키(`note-notebooks`, `note-sections`, `note-pages-meta`)를 `SYNC_FILES`에 추가 | Must | Pending |
| FR-03 | 동적 페이지 본문 파일(`note-body--*`)을 런타임에 enumeration하여 업로드 | Must | Pending |
| FR-04 | 다른 기기에서 다운로드 시 노트 store 자동 reload (`useNoteStore.load(true)`) | Must | Pending |
| FR-05 | 삭제된 페이지의 본문 파일이 Drive에서도 정리되는 동작 검토 및 처리 | Should | Pending |
| FR-06 | 같은 페이지를 두 기기에서 동시 수정 시 충돌 다이얼로그(`DriveSyncConflictModal`) 표시 | Should | Pending |
| FR-07 | `SyncSubscribers.test.ts` 메타 테스트가 노트 키 전체를 커버 | Must | Pending |
| FR-08 | 기존 16개 도메인 동기화 회귀 없음 (기존 메타 테스트 전량 통과) | Must | Pending |

### 3.2 비기능 요구사항 (Non-Functional Requirements)

| 분류 | 기준 | 측정 방법 |
|------|------|-----------|
| 성능 | 수백 페이지 노트북에서도 변경된 페이지만 업로드 (체크섬 기반) | 페이지 추가 1건 시 Drive API 호출 수 측정 |
| 안정성 | 동기화 실패 시 로컬 데이터 유실 없음 | 업로드 에러 시 로컬 파일 원본 보존 확인 |
| 아키텍처 | Clean Architecture 의존성 규칙 준수 (`usecases/` → `domain/`만 의존) | `npx tsc --noEmit` 에러 0개 |
| 테스트 | vitest 단위 테스트 통과, 기존 `SyncSubscribers.test.ts` 포함 | `npm run test` |

---

## 4. 사용자 시나리오 (User Stories)

**US-1: 기기 간 노트 동기화**
> 학교 노트북에서 노트를 작성하면 → 5초 후 자동 Drive 업로드 → 집 데스크톱을 열면 자동 다운로드 후 노트가 표시된다.
>
> - 수용 기준: 학교 기기에서 저장 후 10초 이내에 Drive에 파일이 존재하고, 집 기기 다음 폴링 주기(설정 주기, 기본 5분)에 정상 로드된다.

**US-2: 새 페이지 전체 동기화**
> 노트북에 새 페이지를 추가하면 → 페이지 메타(`note-pages-meta`)와 페이지 본문(`note-body--{newPageId}`) 모두 Drive에 업로드된다.
>
> - 수용 기준: 다른 기기에서 다운로드 후 새 페이지가 목록에 나타나고 본문을 열 수 있다.

**US-3: 페이지 삭제 반영**
> 한 기기에서 페이지를 삭제하면 → 메타에서 pageId가 제거되고 Drive의 해당 `note-body--{pageId}` 파일도 정리(또는 manifest에서 제거)된다.
>
> - 수용 기준: 다른 기기에서 동기화 후 삭제된 페이지가 목록에서 사라진다. (tombstone 또는 manifest 기반 처리 — 구현 단계에서 정책 결정)

**US-4: 충돌 감지 및 해소**
> 두 기기에서 같은 페이지를 동시에 수정하면 → `DriveSyncConflictModal`이 열리고 "내 버전 유지" / "클라우드 버전 적용" 선택지를 제시한다.
>
> - 수용 기준: 충돌 파일에 `note-body--{pageId}` 키가 포함되어 ConflictModal에 표시된다.

---

## 5. 기술 접근 옵션 비교

### 옵션 A: 페이지 본문 단일 파일 통합 (`notebook-bodies.json`)

모든 페이지 본문을 `{ [pageId]: NotePageBody }` 형태로 하나의 파일에 담아 `SYNC_FILES`에 정적으로 추가.

| 장점 | 단점 |
|------|------|
| 구현 단순, SYNC_FILES 1줄 추가 | 수백 페이지 노트북에서 파일이 매우 커짐 |
| 동적 enumeration 불필요 | 페이지 1건 수정에도 전체 파일 업로드 |
| 기존 충돌 감지 로직 그대로 재사용 | `JsonNotebookRepository` 구조 변경 필요 |

### 옵션 B: `SyncToCloud`에 동적 파일 enumeration 훅 추가 (권장)

`SyncToCloud` / `SyncFromCloud`에 `getDynamicSyncFiles(): Promise<string[]>` 훅 인터페이스를 추가하고, `JsonNotebookRepository.listPageBodyKeys()` 메서드로 현재 존재하는 `note-body--*` 키 목록을 런타임에 반환한다. 정적 `SYNC_FILES`와 동적 목록의 합집합을 업로드 대상으로 사용한다.

| 장점 | 단점 |
|------|------|
| 체크섬 기반으로 변경분만 업로드 (효율적) | `SyncToCloud` / `SyncFromCloud` 인터페이스 확장 필요 |
| 저장소 구조 유지 (파일당 1 pageId) | 동적 enumeration 구현 추가 공수 |
| 충돌 감지를 페이지 단위로 세분화 가능 | |
| `sync-registry-refactor`와 자연스럽게 연결 | |

### 옵션 C: 노트 전용 별도 UseCase 분리

`SyncNotebooksToCloud` / `SyncNotebooksFromCloud`를 신규 작성하여 기존 `SyncToCloud`와 완전히 분리.

| 장점 | 단점 |
|------|------|
| 기존 UseCase 변경 없음 | 동기화 로직 이중화, 매니페스트 처리 중복 |
| 노트 전용 로직(삭제 정리 등) 자유롭게 구현 가능 | 호출 사이트(`useDriveSyncStore`) 분기 추가 필요 |

**권장: 옵션 B.** 체크섬 기반 효율성을 유지하면서 기존 인프라를 최대 재사용한다. 옵션 A는 큰 노트북에서 성능 문제가 예상되고, 옵션 C는 코드 중복이 크다.

---

## 6. 영향 파일 (예상)

| 파일 | 변경 내용 |
|------|-----------|
| `src/usecases/sync/SyncToCloud.ts` | `getDynamicSyncFiles` 훅 파라미터 추가, 정적 3개 노트 키 `SYNC_FILES`에 추가, 동적 파일 루프 처리 |
| `src/usecases/sync/SyncFromCloud.ts` | `getDynamicSyncFiles` 훅 파라미터 추가, 동적 파일 다운로드 루프 처리 |
| `src/adapters/repositories/JsonNotebookRepository.ts` | `listPageBodyKeys(): Promise<string[]>` 메서드 추가 (현재 저장된 pageId 목록 반환) |
| `src/adapters/hooks/useDriveSync.ts` | `reloadStores`에서 노트 파일 처리 확인 (이미 구현 완료 — 라인 6~16, 회귀 방지 검증만) |
| `src/adapters/di/container.ts` | `SyncToCloud` / `SyncFromCloud` 생성 시 getDynamicSyncFiles 훅 주입 |
| `src/usecases/sync/__tests__/SyncSubscribers.test.ts` | `FILE_TO_STORE` 매핑에 노트 정적 3개 키 추가, 동적 파일 예외 처리 |
| `src/App.tsx` | `useNoteStore.subscribe` 이미 존재 — 회귀 없음 확인 |

---

## 7. 의존성 / 종속성

### 7.1 선행 권장 (독립 진행 가능)

| PDCA | 관계 | 비고 |
|------|------|------|
| `sync-registry-refactor` | 선행 권장 (미착수) | SYNC_FILES와 subscribe를 단일 소스화. 본 PDCA를 먼저 진행해도 되나, 이후 sync-registry-refactor 진행 시 note 키를 registry로 마이그레이션해야 함 |
| `first-sync-confirmation` | 병행 가능 (미착수) | 첫 동기화 확인 다이얼로그. 노트 동기화와 UI 레이어에서 접점 있으나 독립적 |

### 7.2 기존 인프라 (재사용 대상)

| 컴포넌트 | 재사용 방식 |
|----------|------------|
| `SyncToCloud.execute()` | 훅 확장으로 노트 동적 파일 포함 |
| `SyncFromCloud.execute()` | 훅 확장으로 노트 동적 파일 다운로드 |
| `IDriveSyncPort` | 변경 없음 |
| `useDriveSyncStore.triggerSaveSync()` | 변경 없음 (5초 디바운스 그대로 활용) |
| `useDriveSync.reloadStores()` | 노트 파일 처리 이미 구현(`src/adapters/hooks/useDriveSync.ts:6-16`) |
| `DriveSyncConflictModal` | 변경 없음 (충돌 키에 `note-body--*` 포함되면 자동 노출) |

---

## 8. 우선순위 및 일정

- **Priority**: P1 — dead 구독 상태는 사용자가 발견하면 신뢰도 손상이 즉각적임
- **Estimated Effort**: 2~3일 (단위 테스트 포함)
- **Target Release**: v1.12.x (쌤핀 노트 기능 정식 릴리즈와 동시)

### MoSCoW 분류

| 우선순위 | 항목 |
|----------|------|
| **Must** | FR-01, FR-02, FR-03, FR-04, FR-07, FR-08 (dead 구독 수정, 기본 업/다운로드, 테스트) |
| **Should** | FR-05 (삭제 페이지 Drive 정리), FR-06 (충돌 다이얼로그) |
| **Could** | 페이지 단위 충돌 세분화 UI (현재는 파일명 `note-body--{pageId}` 그대로 표시) |
| **Won't** | 실시간 공동 편집, 첨부 파일 동기화, 버전 히스토리 |

---

## 9. 위험 및 미해결 질문

| 위험 | 영향 | 가능성 | 완화 방안 |
|------|------|--------|-----------|
| 페이지 본문 삭제 시 Drive 파일 정리 미흡 | 유령 파일이 Drive에 잔존, 다른 기기에서 삭제된 페이지 부활 가능 | 보통 | `SyncFromCloud`에서 manifest에 없는 `note-body--*` 키를 로컬에서 삭제하는 deletion 처리 추가 — `SyncFromCloud`의 기존 deletion 처리 로직 유무 확인 필요 |
| 대용량 노트북 첫 동기화 속도 | 수백 페이지 최초 동기화 시 Drive API 요청 수 급증 | 낮음 | 체크섬 기반으로 변경분만 업로드되므로 첫 동기화 이후엔 문제 없음. 첫 동기화 시 진행 표시 필요 여부는 구현 단계에서 검토 |
| `getDynamicSyncFiles` 훅 주입 방식이 DI 컨테이너를 복잡하게 만들 가능성 | 아키텍처 복잡도 증가 | 낮음 | 옵션 B 구현 시 훅을 optional parameter로 처리하여 기존 테스트 영향 최소화 |
| `SyncSubscribers.test.ts` 동적 파일 처리 | 동적 파일명(`note-body--*`)은 정적 매핑 테이블에 넣을 수 없음 | 확실 | 테스트에서 동적 파일 패턴을 예외로 인정하는 로직 추가 (`note-body--` 접두사 패턴으로 처리) |

### 미해결 질문

1. `SyncFromCloud`에 현재 "manifest에서 사라진 로컬 파일 삭제" 로직이 있는지 — `src/usecases/sync/SyncFromCloud.ts` 전체 검토 필요 (현재 코드에서 확인되지 않음, 구현 단계에서 추가 여부 결정)
2. `note-body--{pageId}` 충돌 발생 시 `DriveSyncConflictModal`에 표시할 파일명 레이블 — pageId 그대로 노출할지, 페이지 제목을 조회하여 표시할지 (UX 개선은 Should)

---

## 10. 검증 기준 (Acceptance Criteria)

- [ ] 두 기기에서 노트 추가/수정/삭제 시 5~10초(디바운스) + 다음 폴링 주기 이내에 동기화 확인
- [ ] 신규 페이지 추가 시 `note-pages-meta`와 `note-body--{pageId}` 모두 Drive에 업로드됨
- [ ] `DriveSyncConflictModal`이 같은 페이지 본문 양쪽 수정 시 정상 노출
- [ ] `vitest` 단위 테스트 전량 통과 (`npm run test`)
- [ ] `SyncSubscribers.test.ts` 3개 케이스 모두 통과
- [ ] 기존 16개 도메인(`SYNC_FILES`) 동기화 회귀 없음
- [ ] `npx tsc --noEmit` 에러 0개

---

## 11. 아키텍처 고려사항

### 11.1 레이어 수준

**Enterprise** (기존 쌤핀 구조 유지)

### 11.2 핵심 설계 결정

| 결정 | 선택지 | 선택 | 근거 |
|------|--------|------|------|
| 동적 파일 처리 방식 | A: 통합 파일 / B: 동적 enumeration 훅 / C: 별도 UseCase | B | 체크섬 효율 + 기존 인프라 재사용 |
| 훅 주입 방식 | 생성자 파라미터 / 별도 메서드 | 생성자 optional 파라미터 | DI 컨테이너 기존 패턴과 일치 |
| Deletion 처리 | manifest 기반 / tombstone | manifest 기반 (기존 방식 확장) | 별도 tombstone 엔티티 불필요 |
| 충돌 처리 | last-write-wins / ask | ask (기존 `conflictPolicy` 그대로) | `DriveSyncConflictModal` 재사용 |

### 11.3 Clean Architecture 의존성 준수

```
SyncToCloud (usecases/) ← getDynamicSyncFiles 훅 (INotebookRepository 인터페이스, domain/)
JsonNotebookRepository (adapters/) → IStoragePort (domain/)
container.ts (adapters/di/) → JsonNotebookRepository + SyncToCloud 조립
```

`usecases/sync/SyncToCloud.ts`에서 `JsonNotebookRepository`를 직접 import하지 않고, `domain/repositories/INotebookRepository.ts`에 `listPageBodyKeys()` 메서드를 추가하여 포트 인터페이스로 접근한다.

---

## 12. 다음 단계

1. [ ] Design 문서 작성 (`note-cloud-sync.design.md`) — `getDynamicSyncFiles` 훅 인터페이스, `INotebookRepository.listPageBodyKeys()` 시그니처, deletion 처리 정책 구체화
2. [ ] `sync-registry-refactor` Plan 작성 검토 (선행 진행 여부 결정)
3. [ ] 팀 리뷰 및 승인
4. [ ] 구현 착수

---

## Version History

| 버전 | 날짜 | 변경사항 | 작성자 |
|------|------|----------|--------|
| 0.1 | 2026-04-26 | 최초 작성 (dead 구독 버그 분석 기반) | pblsketch |
