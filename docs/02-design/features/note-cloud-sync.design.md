# note-cloud-sync Design Document

> **Summary**: `useNoteStore` dead 구독 버그를 수정하고 쌤핀 노트(노트북/섹션/페이지 메타 + 페이지 본문) 전체를 Google Drive에 동기화한다. 정적 3개 키는 `SYNC_FILES`에 직접 추가하고, 동적 페이지 본문(`note-body--*`)은 `getDynamicSyncFiles` 훅을 통한 런타임 enumeration으로 처리한다.
>
> **Project**: SsamPin
> **Version**: v1.12.x (예정)
> **Author**: pblsketch
> **Date**: 2026-04-26
> **Status**: Draft
> **Planning Doc**: [note-cloud-sync.plan.md](../../01-plan/features/note-cloud-sync.plan.md)

### 관련 문서

| 문서 | 경로 | 상태 |
|------|------|------|
| Plan | `docs/01-plan/features/note-cloud-sync.plan.md` | Draft |
| 선행 권장 Plan | `docs/01-plan/features/sync-registry-refactor.plan.md` | Draft |
| 기존 동기화 UseCase | `src/usecases/sync/SyncToCloud.ts` | 현행 |
| 메타 테스트 | `src/usecases/sync/__tests__/SyncSubscribers.test.ts` | 현행 |

---

## 1. 개요

### 1.1 설계 목표

1. **Dead 구독 해소**: `App.tsx`에서 `useNoteStore.subscribe(() => triggerSaveSync())`를 이미 등록하고 있으나, `SyncToCloud.ts:SYNC_FILES`에 노트 키가 전혀 없어 업로드가 실제로 일어나지 않는 버그를 제거한다.
2. **정적 3개 키 동기화**: `note-notebooks`, `note-sections`, `note-pages-meta`를 `SYNC_FILES`에 추가하여 기존 체크섬 비교 + 업로드 인프라를 그대로 재사용한다.
3. **동적 페이지 본문 동기화**: `note-body--{pageId}` 파일은 페이지 수에 따라 개수가 변하므로, `getDynamicSyncFiles` 훅을 `SyncToCloud` / `SyncFromCloud` 생성자에 optional로 주입하여 런타임에 목록을 열거한다.
4. **다운로드 후 reload 확인**: `useDriveSync.reloadStores`는 이미 `note-*` 파일 처리 코드를 포함하고 있음을 검증하고 회귀를 방지한다. (현행 코드 `src/adapters/hooks/useDriveSync.ts:6-16` 참조)
5. **충돌 다이얼로그 확장**: `DriveSyncConflictModal`의 `FILE_LABELS`에 노트 파일명 레이블을 추가하여 페이지 단위 충돌 메시지를 사람이 읽을 수 있는 형태로 표시한다.

### 1.2 설계 원칙

- **최소 침습**: 기존 체크섬 비교·업로드·매니페스트 갱신 로직은 손대지 않는다.
- **Optional 훅 주입**: `getDynamicSyncFiles`는 생성자 optional 파라미터로 제공. 훅 없이도 기존 SYNC_FILES만으로 완전히 동작하므로 기존 단위 테스트 영향 없음.
- **Clean Architecture 준수**: `SyncToCloud` / `SyncFromCloud`(usecases)는 `INotebookRepository` 포트 인터페이스(domain)만 참조. `JsonNotebookRepository`(adapters)를 직접 import하지 않는다.
- **B안(단순) deletion**: 페이지 삭제 시 Drive 파일 정리는 이번 PDCA 범위 밖. orphan `note-body--*` 파일은 Drive에 잔존 허용(별도 cleanup PDCA로 분리).

### 1.3 범위 / 비범위

**포함 (Plan §2.1)**

- `note-notebooks`, `note-sections`, `note-pages-meta` 업로드/다운로드
- `note-body--{pageId}` 동적 enumeration + 업로드/다운로드
- `SyncToCloud` / `SyncFromCloud` 생성자 확장 (`getDynamicSyncFiles` optional 훅)
- `INotebookRepository` / `JsonNotebookRepository`에 `listPageBodyKeys()` 메서드 추가
- `DriveSyncConflictModal.FILE_LABELS`에 노트 키 추가
- `SyncSubscribers.test.ts` 노트 정적 키 매핑 추가
- `useDriveSync.reloadStores` 노트 케이스 회귀 방지 검증

**제외 (Plan §2.2)**

- 페이지 첨부 이미지/바이너리 동기화
- 버전 히스토리 / 되돌리기
- 실시간 공동 편집
- 모바일(`useMobileNoteStore`) 동기화
- Drive orphan 파일 정리(별도 cleanup PDCA)

---

## 2. 아키텍처

### 2.1 컴포넌트 다이어그램

```
[App.tsx]
  useNoteStore.subscribe(() => triggerSaveSync())   ← 이미 존재, dead 상태
        │
        ▼ (수정 후 활성화)
[useDriveSyncStore.triggerSaveSync()]  5초 디바운스
        │
        ▼
[SyncToCloud.execute(getDynamicSyncFiles?)]
  ├─ SYNC_FILES (정적) ← 이번에 note 3개 추가
  │    note-notebooks, note-sections, note-pages-meta
  └─ getDynamicSyncFiles()  ← NEW (optional 훅)
       └─ INotebookRepository.listPageBodyKeys()
            └─ JsonNotebookRepository  (PAGES_META_FILE 기반)
                 └─ IStoragePort (읽기 전용)

[SyncFromCloud.execute(getDynamicSyncFiles?)]
  ├─ SYNC_FILES 루프 (정적 3개 포함)
  └─ 동적 파일 루프 (note-body--* 다운로드)

[useDriveSync.reloadStores(downloadedFiles)]
  ├─ note-notebooks | note-sections | note-pages-meta | note-body--*
  │    → useNoteStore.setState({ loaded: false }); load(true)
  └─ (이미 구현됨 — 회귀 방지만)

[DriveSyncConflictModal]
  └─ FILE_LABELS  ← note-* 키 추가
```

### 2.2 데이터 흐름

```
[저장 트리거]  노트 편집 → useNoteStore 상태 변경
      │
      ▼
[자동 업로드]  triggerSaveSync() → 5초 디바운스 → SyncToCloud.execute()
      │         ├─ 정적: note-notebooks, note-sections, note-pages-meta
      │         └─ 동적: getDynamicSyncFiles() → note-body--{p1}, note-body--{p2}, ...
      │               각 파일 체크섬 계산 → 변경분만 Drive 업로드
      ▼
[Drive 매니페스트] note-body--{pageId} 항목 포함
      │
      ▼
[다른 기기 다운로드]  SyncFromCloud.execute() → 동일 루프
      │               → storage.write(filename, parsed)
      ▼
[Store reload]  reloadStores(['note-pages-meta', 'note-body--abc123', ...])
                  → useNoteStore.load(true)
```

### 2.3 의존성

| 컴포넌트 | 의존 대상 | 목적 |
|----------|-----------|------|
| `SyncToCloud` (usecases) | `INotebookRepository` (domain port) | `listPageBodyKeys()` |
| `SyncFromCloud` (usecases) | `INotebookRepository` (domain port) | `listPageBodyKeys()` |
| `JsonNotebookRepository` (adapters) | `IStoragePort` (domain port) | `PAGES_META_FILE` 읽기 |
| `container.ts` (adapters/di) | `JsonNotebookRepository` + `SyncToCloud` | 훅 주입 조립 |

---

## 3. 도메인 모델 매핑

현행 `JsonNotebookRepository` (`src/adapters/repositories/JsonNotebookRepository.ts`) 상수 기준으로 검증한 실제 파일 키:

| 데이터 | 저장 키(파일명) | 상수명 | 종류 | 변경 빈도 |
|--------|----------------|--------|------|-----------|
| 노트북 메타 | `note-notebooks` | `NOTEBOOKS_FILE` (L7) | 정적 (단일 파일) | 낮음 |
| 섹션 메타 | `note-sections` | `SECTIONS_FILE` (L8) | 정적 (단일 파일) | 중간 |
| 페이지 메타 | `note-pages-meta` | `PAGES_META_FILE` (L9) | 정적 (단일 파일) | 중간 |
| 페이지 본문 | `note-body--{pageId}` | `getPageBodyFileName()` (L11-13) | 동적 (페이지당 1파일) | 높음 |

> 검증: `src/adapters/repositories/JsonNotebookRepository.ts:7-13` 확인 완료. 키 접두사는 `note-body--` (하이픈 2개). Plan 문서의 `note-body--{pageId}` 표기와 일치.

### 3.1 도메인 엔티티

```typescript
// src/domain/entities/Notebook.ts — 변경 없음
// src/domain/entities/NoteSection.ts — 변경 없음
// src/domain/entities/NotePage.ts (NotePage + NotePageBody) — 변경 없음
```

### 3.2 INotebookRepository 확장 (domain 포트)

```typescript
// src/domain/repositories/INotebookRepository.ts — 메서드 1개 추가
export interface INotebookRepository {
  // 기존 메서드 (변경 없음)
  getAllNotebooks(): Promise<readonly Notebook[]>;
  saveNotebooks(notebooks: readonly Notebook[]): Promise<void>;
  getAllSections(): Promise<readonly NoteSection[]>;
  saveSections(sections: readonly NoteSection[]): Promise<void>;
  getAllPagesMeta(): Promise<readonly NotePage[]>;
  savePagesMeta(pagesMeta: readonly NotePage[]): Promise<void>;
  getPageBody(pageId: string): Promise<NotePageBody | null>;
  savePageBody(pageId: string, body: NotePageBody): Promise<void>;
  deletePageBody(pageId: string): Promise<void>;

  // NEW: 현재 저장된 모든 페이지 본문 파일 키 목록 반환
  listPageBodyKeys(): Promise<string[]>;
}
```

---

## 4. 인터페이스 / 타입 변경

### 4.1 getDynamicSyncFiles 훅 타입

```typescript
// 사용처: SyncToCloud, SyncFromCloud 생성자 optional 파라미터
export type GetDynamicSyncFiles = () => Promise<string[]>;
```

이 함수는 DI 컨테이너(`container.ts`)에서 `JsonNotebookRepository.listPageBodyKeys`를 래핑하여 주입한다.

### 4.2 SyncToCloud 생성자 변경

```typescript
// src/usecases/sync/SyncToCloud.ts
export class SyncToCloud {
  constructor(
    private readonly storage: IStoragePort,
    private readonly drivePort: IDriveSyncPort,
    private readonly syncRepo: IDriveSyncRepository,
    private readonly deviceId: string,
    private readonly deviceName: string,
    private readonly getDynamicSyncFiles?: GetDynamicSyncFiles,  // NEW — optional
  ) {}
  // ...
}
```

### 4.3 SyncFromCloud 생성자 변경

```typescript
// src/usecases/sync/SyncFromCloud.ts
export class SyncFromCloud {
  constructor(
    private readonly storage: IStoragePort,
    private readonly drivePort: IDriveSyncPort,
    private readonly syncRepo: IDriveSyncRepository,
    private readonly deviceId: string,
    private readonly deviceName: string,
    private readonly conflictPolicy: 'latest' | 'ask' = 'ask',
    private readonly getDynamicSyncFiles?: GetDynamicSyncFiles,  // NEW — optional
  ) {}
  // ...
}
```

> `conflictPolicy` 다음에 위치시켜 기존 호출부(`container.ts`)에서 파라미터 순서를 유지하면서 undefined로 기본 처리되도록 한다.

---

## 5. SyncToCloud.execute 변경

### 5.1 정적 SYNC_FILES 확장

```typescript
// src/usecases/sync/SyncToCloud.ts:15-21 — 3개 추가
export const SYNC_FILES = [
  'settings', 'class-schedule', 'teacher-schedule', 'students',
  'seating', 'events', 'memos', 'todos', 'student-records',
  'bookmarks', 'surveys', 'assignments', 'seat-constraints',
  'teaching-classes', 'dday', 'curriculum-progress', 'attendance',
  'consultations', 'timetable-overrides', 'manual-meals',
  // NEW: 노트 정적 3개 파일
  'note-notebooks', 'note-sections', 'note-pages-meta',
] as const;
```

### 5.2 execute 메서드 — 동적 파일 루프 추가

기존 정적 루프 후에 아래 블록을 추가한다. 로직은 정적 루프와 완전히 동일하다(중복 함수 없이 인라인으로 재사용).

```typescript
// src/usecases/sync/SyncToCloud.ts — execute() 내부, 정적 루프 직후
if (this.getDynamicSyncFiles) {
  const dynamicFiles = await this.getDynamicSyncFiles();
  const dynamicTotal = dynamicFiles.length;
  let dynamicIndex = 0;

  for (const filename of dynamicFiles) {
    dynamicIndex++;
    onProgress?.({
      current: total + dynamicIndex,
      total: total + dynamicTotal,
      filename,
    });

    const data = await this.storage.read<unknown>(filename);
    if (data === null) {
      skipped.push(filename);
      console.log(`[SyncToCloud]   ${filename}: SKIP (데이터 없음)`);
      continue;
    }

    const content = JSON.stringify(data);
    const checksum = await computeChecksum(content);
    const manifestChecksum = localManifest?.files[filename]?.checksum;

    if (manifestChecksum === checksum) {
      skipped.push(filename);
      continue;
    }

    const remoteChecksum = remoteManifest?.files[filename]?.checksum;
    if (remoteChecksum && manifestChecksum && remoteChecksum !== manifestChecksum) {
      console.log(`[SyncToCloud]   ${filename}: SKIP (remote changed)`);
      skipped.push(filename);
      continue;
    }

    console.log(`[SyncToCloud]   ${filename}: UPLOAD (checksum ${manifestChecksum?.slice(0, 8) ?? 'NONE'} → ${checksum.slice(0, 8)})`);
    const result = await this.drivePort.uploadSyncFile(folder.id, `${filename}.json`, content);
    updatedFiles[filename] = {
      lastModified: result.modifiedTime,
      checksum,
      size: new TextEncoder().encode(content).length,
    };
    uploaded.push(filename);
  }
}
```

---

## 6. SyncFromCloud.execute 변경

기존 정적 루프(`for (const filename of SYNC_FILES)`) 직후에 동적 파일 루프를 추가한다. 충돌 감지 및 다운로드 로직은 정적 루프와 동일한 구조를 따른다.

```typescript
// src/usecases/sync/SyncFromCloud.ts — execute() 내부, 정적 루프 후
if (this.getDynamicSyncFiles) {
  const dynamicFiles = await this.getDynamicSyncFiles();

  for (const filename of dynamicFiles) {
    const remoteInfo = remoteManifest.files[filename];
    const localInfo = localManifest?.files[filename];

    if (!remoteInfo) {
      skipped.push(filename);
      continue;
    }

    if (localInfo && localInfo.checksum === remoteInfo.checksum) {
      skipped.push(filename);
      continue;
    }

    if (localInfo && localInfo.checksum !== remoteInfo.checksum) {
      // 동일 기기 스킵
      if (remoteManifest.deviceId === this.deviceId) {
        skipped.push(filename);
        continue;
      }

      if (this.conflictPolicy === 'latest') {
        const remoteIsNewer =
          new Date(localInfo.lastModified) <= new Date(remoteInfo.lastModified);
        if (remoteIsNewer) {
          const driveFile = remoteFiles.find(f => f.name === `${filename}.json`);
          if (driveFile) {
            const content = await this.drivePort.downloadSyncFile(driveFile.id);
            await this.storage.write(filename, JSON.parse(content) as unknown);
            updatedFiles[filename] = remoteInfo;
            downloaded.push(filename);
          }
        } else {
          skipped.push(filename);
        }
        continue;
      }

      // 'ask' 정책 → 충돌 목록 추가
      conflicts.push({
        filename,
        localModified: localInfo.lastModified,
        remoteModified: remoteInfo.lastModified,
        localDeviceName: this.deviceName,
        remoteDeviceName: remoteManifest.deviceName,
      });
      continue;
    }

    // 로컬에 없음 → 무조건 다운로드
    const driveFile = remoteFiles.find(f => f.name === `${filename}.json`);
    if (driveFile) {
      const content = await this.drivePort.downloadSyncFile(driveFile.id);
      await this.storage.write(filename, JSON.parse(content) as unknown);
      updatedFiles[filename] = remoteInfo;
      downloaded.push(filename);
      console.log(`[SyncFromCloud]   ${filename}: DOWNLOAD (로컬 없음)`);
    } else {
      skipped.push(filename);
    }
  }
}
```

> **주의**: `remoteFiles` 목록은 정적 루프 전에 이미 조회(`await this.drivePort.listSyncFiles(folder.id)`)되어 있으므로 별도 추가 조회 불필요.

---

## 7. JsonNotebookRepository 확장

### 7.1 listPageBodyKeys 구현

```typescript
// src/adapters/repositories/JsonNotebookRepository.ts — 메서드 추가

async listPageBodyKeys(): Promise<string[]> {
  const pagesMeta = await this.getAllPagesMeta();
  return pagesMeta.map((page) => getPageBodyFileName(page.id));
  // 결과 예: ['note-body--abc123', 'note-body--def456', ...]
}
```

- `PAGES_META_FILE`(`note-pages-meta`)이 단일 진실 원천. 실제 파일 존재 여부는 별도로 확인하지 않는다.
- 삭제된 페이지가 메타에서 이미 제거되었으면 해당 `note-body--*` 키는 자동으로 목록에서 빠진다.
- Drive에 잔존하는 orphan 본문 파일은 B안에 따라 이번 PDCA에서 정리하지 않는다.

### 7.2 B안 vs A안 결정

| 구분 | 설명 | 이번 결정 |
|------|------|-----------|
| B안 (단순) | Drive orphan 파일 잔존 허용. 로컬 `note-pages-meta`에 없는 pageId의 본문은 업로드 목록에서 자동 제외됨 | **채택** |
| A안 (완전) | `SyncToCloud` 시점에 Drive 매니페스트의 `note-body--*` 키를 순회하여 `note-pages-meta`에 없는 항목은 Drive 파일 삭제 | 별도 cleanup PDCA로 분리 |

B안 채택 근거: orphan 파일이 사용자 기기에서 다운로드될 가능성 없음(메타에 없으면 Store에 로드되지 않음). Drive 용량 낭비는 소량이므로 허용 가능.

---

## 8. container.ts — 훅 주입

```typescript
// src/adapters/di/container.ts — SyncToCloud / SyncFromCloud 생성 위치

// 훅 정의 (notebookRepository는 container에서 이미 생성된 인스턴스 사용)
const getDynamicSyncFiles = async (): Promise<string[]> => {
  return container.notebookRepository.listPageBodyKeys();
};

// SyncToCloud 생성 (기존 4개 파라미터 뒤에 훅 추가)
export const syncToCloud = new SyncToCloud(
  storage,
  drivePort,
  driveSyncRepository,
  deviceId,
  deviceName,
  getDynamicSyncFiles,  // NEW
);

// SyncFromCloud 생성 (conflictPolicy 뒤에 훅 추가)
export const syncFromCloud = new SyncFromCloud(
  storage,
  drivePort,
  driveSyncRepository,
  deviceId,
  deviceName,
  'ask',
  getDynamicSyncFiles,  // NEW
);
```

> `container.notebookRepository`는 `JsonNotebookRepository` 인스턴스. `listPageBodyKeys()`가 `INotebookRepository` 인터페이스에 추가되어 있어야 타입이 맞는다.

---

## 9. useDriveSync.reloadStores — 회귀 방지 확인

`src/adapters/hooks/useDriveSync.ts:4-17`에 이미 아래 코드가 존재한다. **이번 PDCA에서는 수정 불필요**. 회귀 방지 검증만 수행한다.

```typescript
// src/adapters/hooks/useDriveSync.ts:6-16 — 현행 구현, 변경 없음
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
```

확인 사항:
- 정적 3개 키와 동적 `note-body--*` 패턴 모두 처리함
- `continue`로 switch 블록을 건너뜀 (올바른 흐름)
- `useNoteStore.load(true)` 호출 시 `force=true`로 캐시 무효화

---

## 10. UI/UX — 충돌 다이얼로그 확장

### 10.1 FILE_LABELS 추가

```typescript
// src/adapters/components/common/DriveSyncConflictModal.tsx:5-23
// FILE_LABELS에 추가 (기존 객체 확장)
const FILE_LABELS: Record<string, string> = {
  // 기존 항목 유지 ...
  // NEW: 노트 정적 키
  'note-notebooks': '노트북 목록',
  'note-sections': '노트 섹션',
  'note-pages-meta': '노트 페이지 목록',
  // 동적 키는 FILE_LABELS에 없으므로 fallback 처리됨
};
```

### 10.2 동적 키 fallback 레이블

`DriveSyncConflictModal`의 파일명 표시 로직:

```typescript
// 현행: src/adapters/components/common/DriveSyncConflictModal.tsx:69
{FILE_LABELS[conflict.filename] ?? conflict.filename}
```

`note-body--{pageId}` 형태의 동적 키는 `FILE_LABELS`에 없으므로 `conflict.filename` 그대로 표시된다. 사용자 친화적 개선(페이지 제목 조회)은 **Should** 항목으로 별도 처리.

현재는 아래 레이블로 노출된다:
- `note-body--abc123` → "note-body--abc123" (pageId 원문)

> UX 개선 옵션 (Should, 본 PDCA 범위 외): `DriveSyncConflictModal`에 `pagesMeta` props를 전달하여 `pageId`에서 페이지 제목을 조회 후 "페이지 '제목'"으로 표시. 구현은 후속 이터레이션에서 결정.

---

## 11. 메타 테스트 갱신

### 11.1 SyncSubscribers.test.ts — FILE_TO_STORE 확장

```typescript
// src/usecases/sync/__tests__/SyncSubscribers.test.ts:24-45
const FILE_TO_STORE: Record<string, string | null> = {
  // 기존 항목 유지 ...

  // NEW: 노트 정적 3개 키 추가
  'note-notebooks': 'useNoteStore',
  'note-sections': 'useNoteStore',
  'note-pages-meta': 'useNoteStore',
};
```

### 11.2 동적 파일 예외 처리

`note-body--{pageId}` 파일은 `SYNC_FILES`(정적 배열)에 포함되지 않으므로 `FILE_TO_STORE`에도 추가하지 않는다. 기존 3개 테스트 케이스 로직 변경 없음.

`SyncSubscribers.test.ts`의 세 번째 테스트("매핑 테이블에 있지만 SYNC_FILES에 없는 dead key"):
- `note-notebooks`, `note-sections`, `note-pages-meta`는 `SYNC_FILES`에 추가되므로 dead key 테스트 통과

### 11.3 App.tsx subscribe 블록 확인

두 번째 테스트 케이스는 `App.tsx` subscribe 블록에서 `useNoteStore.subscribe(`를 검색한다. `App.tsx`에 이미 `useNoteStore.subscribe(() => triggerSaveSync())`가 존재함을 현행 코드(`src/App.tsx:726` 기준)에서 확인한 상태. 테스트 통과 조건 충족.

---

## 12. Clean Architecture 의존성 준수

### 12.1 레이어 배치

| 컴포넌트 | 레이어 | 위치 | 변경 유형 |
|----------|--------|------|-----------|
| `INotebookRepository.listPageBodyKeys()` | domain | `src/domain/repositories/INotebookRepository.ts` | 인터페이스 확장 |
| `JsonNotebookRepository.listPageBodyKeys()` | adapters | `src/adapters/repositories/JsonNotebookRepository.ts` | 메서드 추가 |
| `SyncToCloud` (생성자 확장) | usecases | `src/usecases/sync/SyncToCloud.ts` | 파라미터 + 루프 추가 |
| `SyncFromCloud` (생성자 확장) | usecases | `src/usecases/sync/SyncFromCloud.ts` | 파라미터 + 루프 추가 |
| `container.ts` (훅 주입) | adapters/di | `src/adapters/di/container.ts` | 생성자 인수 추가 |
| `DriveSyncConflictModal` (레이블 추가) | adapters | `src/adapters/components/common/DriveSyncConflictModal.tsx` | FILE_LABELS 확장 |
| `SyncSubscribers.test.ts` | usecases/__tests__ | `src/usecases/sync/__tests__/SyncSubscribers.test.ts` | FILE_TO_STORE 확장 |

### 12.2 의존성 규칙 검증

```
✅ SyncToCloud (usecases) → INotebookRepository (domain) — 포트 인터페이스만 참조
✅ SyncFromCloud (usecases) → INotebookRepository (domain) — 동일
✅ JsonNotebookRepository (adapters) → IStoragePort (domain) — 기존 패턴 유지
✅ container.ts (adapters/di) → JsonNotebookRepository + SyncToCloud — DI 조립 허용 지점
❌ usecases → adapters — 금지, getDynamicSyncFiles는 함수 타입으로만 주입 (포트 없이 의존성 역전)
```

---

## 13. sync-registry-refactor 선행 시나리오 vs 독립 시나리오

### 13.1 registry 선행 완료 시 (권장)

`src/usecases/sync/syncRegistry.ts`가 `SyncDomain` 인터페이스와 `SYNC_REGISTRY` 배열을 제공한다면:

```typescript
// syncRegistry.ts — note-cloud-sync 적용 시 추가할 항목
{
  fileName: 'note-notebooks',
  reload: async () => {
    const { useNoteStore } = await import('@adapters/stores/useNoteStore');
    useNoteStore.setState({ loaded: false });
    await useNoteStore.getState().load(true);
  },
},
{
  fileName: 'note-sections',
  reload: async () => { /* 동일 */ },
},
{
  fileName: 'note-pages-meta',
  reload: async () => { /* 동일 */ },
},
{
  fileName: 'note-body',  // 베이스 prefix (isDynamic 도메인)
  isDynamic: true,
  enumerateDynamic: async () => container.notebookRepository.listPageBodyKeys(),
  reload: async (key?: string) => {
    const { useNoteStore } = await import('@adapters/stores/useNoteStore');
    useNoteStore.setState({ loaded: false });
    await useNoteStore.getState().load(true);
  },
},
```

이 경우 §5~§6의 execute 변경 코드는 registry의 `isDynamic` / `enumerateDynamic` 패턴으로 교체된다. useDriveSync.reloadStores의 switch 블록도 registry dispatch로 대체됨.

### 13.2 독립 진행 시 차이점

registry 없이 진행하면:
- `SYNC_FILES`에 정적 3개 키 수동 추가 (§5.1)
- `getDynamicSyncFiles` 훅 파라미터 수동 주입 (§4.2~§4.3)
- `useDriveSync.reloadStores`의 `if (file.startsWith('note-body--'))` 분기는 현행 코드에서 이미 처리됨 (§9)
- 이후 sync-registry-refactor 진행 시 노트 키를 registry로 마이그레이션 필요 (1회 추가 작업)

**이번 Design은 독립 진행 시나리오를 주 경로로 작성한다.** registry가 완료되면 §13.1 방식으로 확장한다.

---

## 14. 오류 처리

| 상황 | 처리 방식 |
|------|-----------|
| `listPageBodyKeys()` 실패 | try-catch로 감싸고 빈 배열 반환 — 정적 파일은 정상 동기화 계속 |
| 개별 `note-body--*` 업로드 실패 | 기존 단일 파일 업로드 실패와 동일: 해당 파일만 skipped로 처리, 나머지 계속 |
| 페이지 본문 다운로드 실패 | 기존 `SyncFromCloud` 다운로드 실패 처리와 동일 |
| `getDynamicSyncFiles` 미주입(undefined) | optional 훅이므로 동적 루프 전체 스킵 — 기존 동작과 완전히 동일 |

---

## 15. 구현 순서 (Do 단계 체크리스트)

| 순서 | 작업 | 파일 | 비고 |
|------|------|------|------|
| 1 | `INotebookRepository`에 `listPageBodyKeys()` 시그니처 추가 | `src/domain/repositories/INotebookRepository.ts` | domain 레이어 |
| 2 | `JsonNotebookRepository`에 `listPageBodyKeys()` 구현 추가 | `src/adapters/repositories/JsonNotebookRepository.ts` | `getAllPagesMeta()` 기반 |
| 3 | `SYNC_FILES`에 정적 3개 키 추가 | `src/usecases/sync/SyncToCloud.ts:15-21` | `SyncFileName` 타입 자동 확장 |
| 4 | `SyncToCloud` 생성자에 `getDynamicSyncFiles?` 추가, execute에 동적 루프 삽입 | `src/usecases/sync/SyncToCloud.ts` | §5 코드 인라인 |
| 5 | `SyncFromCloud` 생성자에 `getDynamicSyncFiles?` 추가, execute에 동적 루프 삽입 | `src/usecases/sync/SyncFromCloud.ts` | §6 코드 인라인 |
| 6 | `container.ts`에서 `getDynamicSyncFiles` 훅 정의 + `SyncToCloud` / `SyncFromCloud` 생성자 인수 추가 | `src/adapters/di/container.ts` | §8 참조 |
| 7 | `useDriveSync.reloadStores` 노트 분기 회귀 없음 확인 (코드 변경 없음) | `src/adapters/hooks/useDriveSync.ts:6-16` | §9 검증 |
| 8 | `DriveSyncConflictModal.FILE_LABELS`에 노트 정적 3개 키 추가 | `src/adapters/components/common/DriveSyncConflictModal.tsx` | §10.1 참조 |
| 9 | `SyncSubscribers.test.ts` `FILE_TO_STORE`에 노트 3개 키 추가 | `src/usecases/sync/__tests__/SyncSubscribers.test.ts` | §11.1 참조 |
| 10 | `npx tsc --noEmit` 에러 0개 확인 | — | — |
| 11 | `npm run test` 전량 통과 확인 | — | SyncSubscribers 포함 |
| 12 | 수동 검증: 두 기기 시나리오 US-1~US-4 | — | §16 검증 기준 참조 |

---

## 16. 검증 기준

| 기준 | 검증 방법 |
|------|-----------|
| US-1: 기기 간 노트 동기화 | 기기 A에서 노트 편집 → 5초 후 Drive에 파일 확인 → 기기 B 폴링 후 노트 표시 확인 |
| US-2: 새 페이지 전체 동기화 | 새 페이지 추가 시 `note-pages-meta`와 `note-body--{id}` 모두 Drive에 존재 확인 |
| US-4: 충돌 감지 | 두 기기에서 같은 페이지 동시 수정 → `DriveSyncConflictModal` 노출 확인 |
| 체크섬 기반 델타 업로드 | 페이지 1건 수정 시 Drive API 호출 수 = 1 (해당 파일만) |
| 정적 파일 회귀 없음 | 기존 16개 도메인 동기화 정상 동작 |
| 메타 테스트 통과 | `SyncSubscribers.test.ts` 3개 케이스 모두 통과 |
| 타입 안전성 | `npx tsc --noEmit` 에러 0개 |
| 단위 테스트 | `npm run test` 전량 통과 |

---

## 17. 위험 및 미해결 사항

| 위험 | 영향 | 완화 방안 |
|------|------|-----------|
| 수백 페이지 첫 동기화 속도 | 체크섬 계산 + Drive API 직렬 요청 급증 | 체크섬 기반 델타 업로드로 2회차 이후 문제 없음. 첫 동기화 진행 표시 UI는 Could 항목으로 분리 |
| `getDynamicSyncFiles` 미주입 | 동적 파일 루프 전체 스킵 → 본문 동기화 안 됨 | container.ts 조립 코드를 테스트로 검증 (integration test) |
| orphan `note-body--*` Drive 잔존 | Drive 용량 소량 낭비 | B안 채택 → 별도 cleanup PDCA로 분리 |
| 모바일 `useMobileNoteStore` 누락 | 모바일에서 노트 동기화 안 됨 | 본 PDCA 범위 외(데스크톱 전용). 모바일은 별도 PDCA |
| `SyncSubscribers.test.ts` 세 번째 테스트 dead-key 체크 | `note-notebooks` 등이 `SYNC_FILES`에 없으면 orphan 판정 | 순서 중요: Step 3(SYNC_FILES 추가) 후 Step 9(테스트 추가) 수행 |

**미해결 (Plan §9 이어받기)**:

1. `SyncFromCloud`에 "manifest에서 사라진 로컬 파일 삭제" 로직 여부 확인 → 현행 코드(`SyncFromCloud.ts`) 검토 결과 해당 로직 **없음**. 노트 본문의 deletion propagation(다른 기기에서 페이지 삭제 반영)은 `note-pages-meta` 동기화로 메타가 갱신되고 Store reload 시 삭제된 페이지가 UI에서 사라지는 방식으로 간접 처리됨. 단, `note-body--*` 로컬 파일은 그대로 잔존 (US-3 완전 충족 아님). A안은 cleanup PDCA.
2. 충돌 다이얼로그의 pageId → 페이지 제목 변환 UX 개선 — Should, 후속 이터레이션.

---

## 버전 이력

| 버전 | 날짜 | 변경사항 | 작성자 |
|------|------|----------|--------|
| 0.1 | 2026-04-26 | 최초 작성 | pblsketch |
