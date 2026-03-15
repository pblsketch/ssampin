# 쌤핀 Google Drive 동기화 — 계획서

## 1. 개요

### 목표
교사가 학교 노트북과 집 데스크탑에서 쌤핀을 사용할 때, Google Drive를 통해 데이터를 자동 동기화하여 별도 서버 없이 기기 간 연동을 구현한다.

### 핵심 원칙
- **외부 서버 없음**: 사용자 본인 Google Drive만 사용 → 개인정보 이슈 최소화
- **기존 Google OAuth 재활용**: 이미 calendar + drive.file 스코프 보유
- **Last-Write-Wins**: 동시 편집이 거의 없으므로 타임스탬프 기반 최신 우선
- **점진적 도입**: 기존 로컬 저장 로직은 그대로 유지, 동기화는 부가 기능

---

## 2. 현재 아키텍처 분석

### 2.1 로컬 저장 방식
```
IStoragePort (domain/ports)
  ├── ElectronStorageAdapter (userData/data/*.json 파일)
  └── LocalStorageAdapter (localStorage, 웹 테스트용)
```

- 모든 Repository(`JsonSettingsRepository`, `JsonScheduleRepository` 등)가 `IStoragePort.read/write`를 통해 JSON 파일 단위로 저장
- 파일명 패턴: `settings`, `class-schedule`, `teacher-schedule`, `students`, `seating`, `events`, `memos`, `todos`, `student-records`, `bookmarks`, `surveys` 등

### 2.2 DI Container (`src/adapters/di/container.ts`)
- `storage: IStoragePort`를 Electron/Web에 따라 선택
- 모든 Repository에 동일한 storage 인스턴스 주입
- Google OAuth 클라이언트 이미 존재 (`GoogleOAuthClient`)
- Google Drive 클라이언트 이미 존재 (`GoogleDriveClient`) — 현재 과제수합 전용

### 2.3 기존 Google 연동
- **OAuth**: `src/infrastructure/google/GoogleOAuthClient.ts`
  - 스코프: `calendar`, `drive.file`, `userinfo.email` — **drive.file 이미 포함!**
- **Drive**: `src/infrastructure/google/GoogleDriveClient.ts`
  - 현재 "쌤핀 과제" 폴더 전용
  - `getOrCreateRootFolder()`, `uploadFile()`, `listFiles()` 등 이미 구현
- **토큰 관리**: `electron/ipc/secureStorage.ts` + `GoogleCalendarSyncRepository`
  - `calendarSyncRepo`에 토큰 저장/갱신 로직 있음

---

## 3. 설계

### 3.1 동기화 대상 파일
| 파일명 | 설명 | 우선순위 |
|--------|------|----------|
| `settings` | 설정 전체 | ★★★ |
| `class-schedule` | 학급 시간표 | ★★★ |
| `teacher-schedule` | 교사 시간표 | ★★★ |
| `students` | 학생 명렬표 | ★★★ |
| `seating` | 좌석배치 | ★★☆ |
| `events` | 학사일정 | ★★☆ |
| `memos` | 메모 | ★★☆ |
| `todos` | 할 일 | ★★☆ |
| `student-records` | 학생 기록 | ★★☆ |
| `bookmarks` | 북마크 | ★☆☆ |
| `surveys` | 설문 데이터 | ★★☆ |
| `seat-constraints` | 좌석 제약조건 | ★☆☆ |
| `teaching-classes` | 수업 관리 | ★★☆ |
| `ddays` | 디데이 | ★☆☆ |

### 3.2 Drive 폴더 구조
```
내 드라이브/
  └── 쌤핀 동기화/          ← drive.file 스코프로 앱이 생성한 폴더
      ├── manifest.json      ← 동기화 메타데이터 (타임스탬프, 버전)
      ├── settings.json
      ├── class-schedule.json
      ├── teacher-schedule.json
      ├── students.json
      ├── seating.json
      ├── events.json
      ├── memos.json
      ├── todos.json
      ├── student-records.json
      ├── bookmarks.json
      ├── surveys.json
      ├── seat-constraints.json
      ├── teaching-classes.json
      └── ddays.json
```

### 3.3 manifest.json 형식
```typescript
interface SyncManifest {
  version: 1;
  lastSyncedAt: string;        // ISO timestamp
  deviceId: string;             // 기기 고유 ID (UUID, 최초 실행 시 생성)
  deviceName: string;           // 기기명 (OS hostname)
  files: Record<string, {
    lastModified: string;       // ISO timestamp
    checksum: string;           // MD5 해시 (변경 감지)
    size: number;               // 바이트
  }>;
}
```

### 3.4 동기화 흐름

#### 업로드 (로컬 → Drive)
```
1. 로컬 파일 변경 감지 (storage.write 호출 시)
2. 변경된 파일을 Drive에 업로드
3. manifest.json 업데이트
```

#### 다운로드 (Drive → 로컬)
```
1. 앱 시작 시 Drive manifest 조회
2. 로컬 manifest와 비교
3. Drive 파일이 더 최신이면 다운로드
4. 로컬 스토어 리로드
```

#### 충돌 해결 (Conflict Resolution)
```
1. 동일 파일의 로컬/Drive 타임스탬프 비교
2. 기본 정책: Last-Write-Wins (최신 타임스탬프 우선)
3. 충돌 감지 시 선택적 다이얼로그:
   - "이 기기 버전 유지"
   - "클라우드 버전으로 덮어쓰기"
   - "수동 선택" (diff 없이, 타임스탬프 + 기기명 표시)
```

### 3.5 아키텍처 레이어 설계

#### Domain Layer (새로 추가)
```
src/domain/
├── entities/
│   └── SyncState.ts            (이미 존재 — 확장)
├── ports/
│   └── IGoogleDrivePort.ts     (이미 존재 — 동기화 메서드 추가)
└── repositories/
    └── ISyncRepository.ts      (새로 추가)
```

#### UseCase Layer (새로 추가)
```
src/usecases/sync/
├── SyncToCloud.ts              ← 로컬 → Drive 업로드
├── SyncFromCloud.ts            ← Drive → 로컬 다운로드
├── ResolveSyncConflict.ts      ← 충돌 해결
└── index.ts
```

#### Adapter Layer
```
src/adapters/
├── repositories/
│   └── JsonSyncRepository.ts   ← 로컬 manifest 저장
├── stores/
│   └── useSyncStore.ts          ← 동기화 상태 관리 (zustand)
└── components/
    └── Settings/tabs/
        └── SyncTab.tsx          ← 동기화 설정 UI (설정 페이지 탭)
```

#### Infrastructure Layer
```
src/infrastructure/google/
└── GoogleDriveClient.ts         ← 기존 파일 확장 (동기화용 메서드 추가)
```

### 3.6 Settings 확장
```typescript
// Settings 엔티티에 추가
interface SyncSettings {
  readonly enabled: boolean;
  readonly autoSyncOnStart: boolean;    // 앱 시작 시 자동 동기화
  readonly autoSyncOnSave: boolean;     // 저장 시 자동 업로드
  readonly autoSyncIntervalMin: number; // 주기적 동기화 (분, 0=비활성)
  readonly conflictPolicy: 'latest' | 'ask';  // 충돌 정책
  readonly lastSyncedAt: string | null;
  readonly deviceId: string;
}
```

### 3.7 SyncStorageAdapter (핵심 설계)
`IStoragePort`를 래핑하여 write 시 자동 업로드를 트리거하는 프록시 패턴:

```typescript
class SyncStorageAdapter implements IStoragePort {
  constructor(
    private readonly inner: IStoragePort,   // 실제 저장소 (Electron/Local)
    private readonly syncQueue: SyncQueue,  // 업로드 큐
  ) {}

  async read<T>(filename: string): Promise<T | null> {
    return this.inner.read<T>(filename);
  }

  async write<T>(filename: string, data: T): Promise<void> {
    await this.inner.write(filename, data);
    // 동기화가 활성화되어 있으면 큐에 추가
    this.syncQueue.enqueue(filename);
  }
}
```

---

## 4. 구현 단계

### Phase 1: 기반 구축 (2-3일)
1. **Domain**: `SyncState` 엔티티 확장, `ISyncRepository` 인터페이스
2. **Infrastructure**: `GoogleDriveClient`에 동기화 전용 메서드 추가
   - `getOrCreateSyncFolder()` — "쌤핀 동기화" 폴더
   - `uploadSyncFile()` — JSON 파일 업로드/업데이트
   - `downloadSyncFile()` — JSON 파일 다운로드
   - `getSyncManifest()` / `updateSyncManifest()`
3. **Adapter**: `JsonSyncRepository` 구현

### Phase 2: 동기화 로직 (2-3일)
4. **UseCase**: `SyncToCloud`, `SyncFromCloud`, `ResolveSyncConflict` 구현
5. **Adapter**: `useSyncStore` 구현 (동기화 상태, 진행률, 에러)
6. **DI Container**: `SyncStorageAdapter` 프록시 연결

### Phase 3: UI (1-2일)
7. **Settings**: `SyncTab` 설정 UI (활성화/비활성화, 마지막 동기화 시간, 수동 동기화 버튼)
8. **상태바**: 동기화 진행 인디케이터 (사이드바 또는 하단)
9. **충돌 다이얼로그**: 모달 UI

### Phase 4: 통합 테스트 (1일)
10. E2E 시나리오 테스트
    - 최초 동기화 (빈 Drive → 업로드)
    - 기기 B에서 다운로드
    - 양쪽 수정 후 충돌 해결

---

## 5. 리스크 및 고려사항

### 기술적 리스크
- **drive.file 스코프 제한**: 앱이 생성한 파일/폴더만 접근 가능 → 동기화 전용 폴더를 앱에서 생성하면 OK
- **토큰 공유**: 캘린더 동기화와 Drive 동기화가 동일 OAuth 토큰 사용 → 이미 `drive.file` 스코프 포함이므로 추가 인증 불필요
- **파일 크기**: 개별 JSON 파일은 대부분 수 KB~수십 KB → Drive API 제한 문제 없음
- **오프라인 사용**: 로컬 저장은 항상 유지 → 오프라인에서도 정상 동작, 온라인 복귀 시 동기화

### UX 고려
- 최초 동기화 시 "이 기기의 데이터를 클라우드에 업로드할까요?" 확인
- 다른 기기에서 최초 접속 시 "클라우드 데이터를 이 기기로 가져올까요?" 확인
- 동기화 실패 시 토스트 알림 (데이터 손실 없음 — 로컬 항상 유지)

### 보안
- Google OAuth 토큰은 `electron/ipc/secureStorage.ts`의 keytar를 통해 OS 키체인에 안전 저장
- Drive에 저장되는 데이터는 사용자 본인 계정 → 제3자 접근 불가
- 민감 데이터(학생 이름 등)가 Drive에 저장되므로, 동기화 활성화 시 안내 문구 표시

---

## 6. 파일 변경 목록 (예상)

### 신규 파일
| 파일 | 설명 |
|------|------|
| `src/domain/repositories/ISyncRepository.ts` | 동기화 메타데이터 Repository 인터페이스 |
| `src/usecases/sync/SyncToCloud.ts` | 로컬→Drive 업로드 UseCase |
| `src/usecases/sync/SyncFromCloud.ts` | Drive→로컬 다운로드 UseCase |
| `src/usecases/sync/ResolveSyncConflict.ts` | 충돌 해결 UseCase |
| `src/usecases/sync/index.ts` | barrel export |
| `src/adapters/repositories/JsonSyncRepository.ts` | 로컬 manifest 저장 |
| `src/adapters/stores/useSyncStore.ts` | 동기화 상태 zustand 스토어 |
| `src/adapters/components/Settings/tabs/SyncTab.tsx` | 동기화 설정 UI |
| `src/adapters/components/common/SyncStatusIndicator.tsx` | 동기화 상태 인디케이터 |
| `src/adapters/components/common/SyncConflictModal.tsx` | 충돌 해결 모달 |

### 수정 파일
| 파일 | 변경 내용 |
|------|-----------|
| `src/domain/entities/Settings.ts` | `sync?: SyncSettings` 필드 추가 |
| `src/domain/entities/SyncState.ts` | 동기화 상태 타입 확장 |
| `src/domain/ports/IGoogleDrivePort.ts` | 동기화용 메서드 추가 |
| `src/infrastructure/google/GoogleDriveClient.ts` | 동기화 전용 메서드 구현 |
| `src/adapters/di/container.ts` | `SyncStorageAdapter` 프록시 연결, sync UseCase 등록 |
| `src/adapters/stores/useSettingsStore.ts` | `SyncSettings` 기본값 추가, merge 로직 |
| `src/adapters/components/Settings/SettingsPage.tsx` | SyncTab 탭 추가 |
| `src/adapters/components/Settings/SettingsSidebar.tsx` | "동기화" 메뉴 항목 추가 |
| `src/adapters/components/Layout/Sidebar.tsx` | 동기화 상태 인디케이터 표시 |
