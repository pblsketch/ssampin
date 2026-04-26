# first-sync-confirmation Design Document

> **요약**: 신규 기기 최초 동기화 시 데이터 유실을 방지하는 `FirstSyncConfirmModal` UI/UX 상세 설계
>
> **프로젝트**: SsamPin (쌤핀)
> **버전**: v1.12.x
> **작성자**: pblsketch
> **작성일**: 2026-04-26
> **상태**: Draft
> **참조 Plan**: `docs/01-plan/features/first-sync-confirmation.plan.md`

---

## 1. 개요

### 1.1 목적

신규 기기(local manifest 부재)에서 앱이 아무 경고 없이 `syncToCloud`를 실행하면 클라우드 데이터 전체가 빈 로컬 상태로 덮여 영구 유실된다. 이 다이얼로그는 첫 동기화 방향을 사용자가 명시적으로 선택하게 강제하여 해당 P1 위험을 차단한다.

현재 `src/App.tsx:659~667` 에 `window.confirm()`으로 간이 처리된 코드가 있으나, 이는 단순 예/아니오만 제공하고 클라우드 상태 정보를 사용자에게 전혀 보여주지 않는다. 이 PDCA는 해당 코드를 완전한 3선택 다이얼로그로 교체한다.

### 1.2 범위 (Plan §2 인용)

**포함**
- 신규 기기 감지 로직 (manifest `deviceId === ''`)
- `FirstSyncConfirmModal.tsx` 신규 컴포넌트 — download / upload / defer 3선택
- `App.tsx` autoSyncOnStart useEffect 분기 교체
- `BackupCard.tsx` autoSync 토글 ON 핸들러 분기
- `useDriveSyncStore.ts` `firstSyncRequired` 상태 + 결정 액션
- `Settings.ts` `sync.firstSyncDeferred` 도메인 엔티티 필드
- Settings 배너 알림 ("나중에" 선택 후 유도)

**제외**
- 부분 머지 / 필드별 선택 병합
- 자동 머지 전략 (충돌은 기존 `DriveSyncConflictModal` 담당)
- 모바일 앱(`useMobileDriveSyncStore`) 적용 — 별도 검토
- "덮어쓰기" 선택 전 클라우드 자동 백업 생성 — v2 검토

---

## 2. 진입 시점 / 트리거 분기

3가지 진입 경로 모두 동일한 모달을 노출한다.

### 2.1 진입 경로 A — autoSyncOnStart (App.tsx)

**현재 코드** (`src/App.tsx:648~684`):
```
enabled && autoSyncOnStart && lastSyncedAt === null → window.confirm() → syncFromCloud → syncToCloud
```

**교체 후**:
```
enabled && autoSyncOnStart && manifest.deviceId === '' → firstSyncRequired = true
  ↓ (모달 닫힌 후 결정)
  download  → syncFromCloud() 단독 실행
  upload    → [2차 confirm] → syncToCloud() 단독 실행
  defer     → autoSync OFF, firstSyncDeferred = true
```

> 주의: `lastSyncedAt === null` 조건은 기기를 재설치한 경우처럼 settings 파일은 없지만 다른 데이터가 남아있을 수 있는 상황을 포함하지 못한다. `manifest.deviceId === ''` 가 더 정확한 신규 기기 판정 조건이다. 실제 `getLocalManifest()` 반환이 null이거나 `deviceId === ''`인 경우를 모두 신규 기기로 간주한다.

### 2.2 진입 경로 B — autoSync 토글 ON (BackupCard.tsx)

`ServiceCard`의 `onToggle`이 호출될 때 `enabled: false → true` 전환이면 manifest 부재 여부를 검사한다.

```
onToggle(true)
  ↓
updateSync({ enabled: true }) 저장
manifest.deviceId === '' → firstSyncRequired = true (모달 노출)
manifest.deviceId !== '' → 기존 동작 그대로
```

### 2.3 진입 경로 C — "지금 백업 실행" 버튼 (BackupCard.tsx)

`handleBackupNow` 호출 시 manifest 부재이면 모달을 노출하고 직접 syncFromCloud/syncToCloud를 실행하지 않는다. 모달 선택 결과에 따라 처리한다.

### 2.4 상태 머신 요약

```
┌──────────────────────────────────────────────────────┐
│  진입 시점 A/B/C                                      │
│         ↓                                            │
│  checkFirstSyncRequired()                            │
│         ↓                                            │
│  manifest 존재 & deviceId !== ''?                    │
│    ├─ Yes → 기존 동기화 플로우 (모달 없음)             │
│    └─ No  → set({ firstSyncRequired: true })         │
│               ↓                                      │
│         FirstSyncConfirmModal 노출                   │
│         (드라이브 manifest 사전 조회 병렬 실행)        │
│               ↓                                      │
│    ┌──────────┼──────────────┐                       │
│    ↓          ↓              ↓                       │
│  받기       덮어쓰기        나중에                    │
│    ↓          ↓              ↓                       │
│  syncFrom  [2차 confirm]  autoSync OFF               │
│  Cloud()   → syncTo       firstSyncDeferred=true     │
│    ↓        Cloud()        → 모달 닫기               │
│  스토어 리로드  ↓           → Settings 배너 표시      │
│    ↓       manifest 생성   ↓                         │
│  firstSync  firstSync     다음 실행 시 모달 재노출    │
│  Required=false Required=false                       │
└──────────────────────────────────────────────────────┘
```

---

## 3. 모달 컴포넌트 구조

### 3.1 파일 위치

```
src/adapters/components/common/FirstSyncConfirmModal.tsx   [신규, ~200줄]
src/adapters/components/common/FirstSyncUploadWarnModal.tsx [신규, ~80줄]
```

`DriveSyncConflictModal.tsx`와 동일한 `adapters/components/common/` 위치.

### 3.2 Props 인터페이스

```typescript
/** 클라우드 manifest 사전 조회 결과 */
export interface CloudSyncInfo {
  /** 클라우드에 데이터가 있는지 여부 */
  hasData: boolean;
  /** 클라우드 마지막 동기화 일시 (ISO string) */
  lastSyncedAt?: string;
  /** 클라우드에서 동기화한 기기 이름 */
  deviceName?: string;
}

export interface FirstSyncConfirmModalProps {
  open: boolean;
  /**
   * 동기화 대상 도메인 한글 표시 목록.
   * sync-registry-refactor 완료 전: DriveSyncConflictModal FILE_LABELS 키 목록 직접 사용.
   * sync-registry-refactor 완료 후: registry에서 자동 enumerate.
   */
  syncDomains: string[];
  /**
   * 클라우드 manifest 사전 조회 결과.
   * 조회 중이면 undefined, 조회 실패이면 null.
   */
  cloudInfo: CloudSyncInfo | null | undefined;
  onChooseDownload: () => void;
  onChooseUpload: () => void;
  onDefer: () => void;
  /** ESC / 외부 클릭 → defer로 처리 */
  onClose: () => void;
}
```

### 3.3 내부 구조

```
<Modal isOpen={open} onClose={onClose} title="첫 동기화 설정" size="md"
       closeOnBackdrop={false} closeOnEsc={false}>
  ├── 헤더 영역
  │     ├── cloud_sync 아이콘 (sp-accent/10 bg)
  │     ├── 제목: "첫 동기화 방향을 선택해주세요"
  │     ├── 부제목: "이 기기에는 동기화 기록이 없어요"
  │     └── X 버튼 (→ defer 처리)
  │
  ├── 클라우드 상태 배지 (cloudInfo 조회 완료 시)
  │     ├── 조회 중: Spinner + "클라우드 확인 중..."
  │     ├── hasData=true: 초록 배지 + "클라우드에 {deviceName}의 백업이 있어요 ({lastSyncedAt})"
  │     ├── hasData=false: 회색 배지 + "클라우드에 저장된 데이터가 없어요"
  │     └── null(실패): 노란 배지 + "클라우드 상태를 확인하지 못했어요"
  │
  ├── 선택 카드 영역 (3개 세로 스택)
  │     ├── 카드 1: 클라우드에서 받기
  │     ├── 카드 2: 이 기기 데이터로 덮어쓰기
  │     └── 카드 3: 나중에 결정
  │
  └── 하단 주의문 (text-xs text-sp-muted)
        "선택한 이후에는 설정 > 구글 드라이브에서 언제든지 변경할 수 있어요"
```

**주의**: `closeOnBackdrop={false}`, `closeOnEsc={false}`로 설정하여 실수로 모달이 닫히지 않게 한다. X 버튼과 ESC 키는 별도 핸들러로 `onDefer`를 호출한다. `Modal.tsx`는 `closeOnEsc` prop을 지원하므로 (`src/adapters/components/common/Modal.tsx:23`) 이를 활용한다.

> `Modal.tsx:23`의 `closeOnEsc?: boolean` prop에 `false`를 전달하면 Modal 내부 `handleKeyDown`이 ESC 이벤트를 처리하지 않는다. 그러나 FocusTrap의 `escapeDeactivates: false`가 이미 설정되어 있으므로 포커스 탈출은 방지된다. ESC를 defer로 연결하려면 Modal 외부에서 별도 keydown 리스너를 추가한다.

---

## 4. 선택 카드 시각 디자인

### 4.1 카드 레이아웃 공통 구조

```
┌─────────────────────────────────────────────────────┐
│  [32px 아이콘]  제목 (text-base font-semibold)       │
│                 설명 (text-sm text-sp-muted)         │
│                 결과 미리보기 (text-xs)               │
└─────────────────────────────────────────────────────┘
```

Tailwind 클래스:
```
p-4 rounded-xl border transition-all duration-sp-base cursor-pointer
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent
```

### 4.2 카드 1 — 클라우드에서 받기 (download)

| 속성 | 값 |
|------|-----|
| 아이콘 | `cloud_download` |
| 아이콘 bg | `bg-sp-accent/10 text-sp-accent` |
| 기본 테두리 | `border-sp-border` |
| 강조 테두리 (cloudInfo.hasData=true) | `border-sp-accent ring-1 ring-sp-accent/30` |
| hover | `hover:bg-sp-accent/5 hover:border-sp-accent/60` |
| 권장 뱃지 | `hasData=true`일 때 오른쪽 상단에 `bg-sp-accent text-white text-xs px-2 py-0.5 rounded-full "권장"` |

**텍스트**:
- 제목: "클라우드 데이터 받기"
- 설명: "클라우드에 저장된 데이터를 이 기기로 가져옵니다. 기존 데이터가 덮여쓰여요."
- 미리보기 (hasData=true): `text-sp-accent` — "클라우드 백업을 이 기기에 적용해요"
- 미리보기 (hasData=false): `text-sp-muted` — "클라우드가 비어있어요. 빈 상태로 시작해요"

### 4.3 카드 2 — 이 기기 데이터로 덮어쓰기 (upload)

| 속성 | 값 |
|------|-----|
| 아이콘 | `cloud_upload` |
| 아이콘 bg | `bg-sp-card text-sp-muted` (기본), `bg-red-500/10 text-red-400` (cloudInfo.hasData=true 시 위험 강조) |
| 기본 테두리 | `border-sp-border` |
| 강조 테두리 (hasData=false) | `border-sp-accent ring-1 ring-sp-accent/30` |
| hover (hasData=false) | `hover:bg-sp-accent/5` |
| hover (hasData=true) | `hover:bg-red-500/5 hover:border-red-500/40` |

**텍스트**:
- 제목: "이 기기 데이터로 시작"
- 설명 (hasData=false): "클라우드가 비어있어요. 이 기기 데이터를 클라우드에 올려 동기화를 시작해요."
- 설명 (hasData=true): "클라우드의 기존 백업이 이 기기 데이터로 대체됩니다. 클라우드 데이터는 복구할 수 없어요."
- 미리보기 (hasData=true): `text-red-400` — "클라우드 백업이 삭제되고 이 기기 데이터로 교체돼요"

**2차 confirm**: 카드 클릭 시 `FirstSyncUploadWarnModal`을 노출한다. `FirstSyncConfirmModal` 위에 중첩 렌더링하지 않고, `FirstSyncConfirmModal`의 `showUploadWarn: boolean` 내부 state로 관리하여 조건부 렌더링한다.

### 4.4 카드 3 — 나중에 결정 (defer)

| 속성 | 값 |
|------|-----|
| 아이콘 | `schedule` |
| 아이콘 bg | `bg-sp-surface text-sp-muted` |
| 테두리 | `border-sp-border/60` |
| hover | `hover:bg-sp-surface hover:border-sp-border` |

**텍스트**:
- 제목: "나중에 결정"
- 설명: "동기화를 잠시 끄고 나중에 설정에서 결정할 수 있어요."
- 미리보기: `text-sp-muted` — "자동 동기화가 일시 중단돼요"

### 4.5 카드 접근성

각 카드는 `<button type="button">` 요소. 내부에 아이콘과 텍스트를 포함하므로 별도 `aria-label` 불필요. `role="group"` 컨테이너에 `aria-labelledby`로 모달 제목 연결.

---

## 5. "이 기기로 덮어쓰기" 2차 confirm 모달

### 5.1 파일

`src/adapters/components/common/FirstSyncUploadWarnModal.tsx` — 신규, ~80줄

또는 `FirstSyncConfirmModal` 내부 `showUploadWarn` state로 단계를 전환하는 방식도 허용한다 (파일을 분리하지 않아도 됨). 구현자 재량.

### 5.2 레이아웃

```
<Modal isOpen={showUploadWarn} onClose={() => setShowUploadWarn(false)}
       title="클라우드 데이터 덮어쓰기 확인" size="sm" closeOnBackdrop={false}>
  ├── 빨간 헤더 영역
  │     ├── bg-red-500/10 + warning 아이콘 (text-red-400, 32px)
  │     ├── 제목: "클라우드 데이터가 삭제됩니다"
  │     └── 부제목 (cloudInfo.hasData=true 시):
  │           "{deviceName}의 {date} 백업이 영구 삭제됩니다"
  │
  ├── 체크박스 확인
  │     <label>
  │       <input type="checkbox" checked={understood} onChange={...} />
  │       "클라우드의 모든 데이터가 삭제되는 것을 이해했습니다"
  │     </label>
  │
  └── 액션 버튼
        ├── "취소" (border-sp-border, 좌측)
        └── "덮어쓰기 진행" (bg-red-500/20 text-red-400 border-red-500/30,
                             disabled until understood=true)
```

**체크박스 스타일**: `accent-red-500` (Tailwind CSS `accent-*` 유틸리티).

**"덮어쓰기 진행" 비활성 상태**: `opacity-50 cursor-not-allowed` + `disabled` attribute.

---

## 6. "나중에 결정" 흐름

### 6.1 즉각 효과

1. `useDriveSyncStore.chooseFirstSync('defer')` 호출
2. settings store 업데이트: `sync.firstSyncDeferred = true`, `sync.enabled = false`
3. `firstSyncRequired = false` (모달 닫힘)
4. 토스트: "동기화를 나중에 설정해요. 설정 > 구글 드라이브에서 결정할 수 있어요." (info)

### 6.2 영속화

`src/domain/entities/Settings.ts`의 `SyncSettings` 인터페이스에 `firstSyncDeferred?: boolean` 추가.

`JsonSettingsRepository` 마이그레이션: 기존 데이터에 필드 부재 시 `undefined → false` 처리 (기존 사용자 회귀 방지).

### 6.3 재진입 조건

앱 다음 실행 시 `checkFirstSyncRequired()`가 호출될 때:
- `sync.enabled && manifest.deviceId === ''` → `firstSyncRequired = true` (firstSyncDeferred 여부 무관)
- 단, `firstSyncDeferred = true`이면 autoSync는 OFF 상태이므로, 사용자가 Settings에서 수동으로 enabled = true를 하기 전까지는 재진입 조건이 충족되지 않는다.

### 6.4 Settings 배너

`BackupCard.tsx` 최상단에 조건부 배너 추가.

**노출 조건**: `sync.firstSyncDeferred === true`

```
┌─────────────────────────────────────────────────────────────────┐
│  [warning_amber 아이콘]  최초 동기화 방향을 아직 결정하지 않았어요  │
│                          [지금 결정하기 →]                        │
└─────────────────────────────────────────────────────────────────┘
```

**스타일**: `bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-center gap-3`

**아이콘**: `material-symbols-outlined text-amber-400 text-icon-lg` — `warning_amber`

**"지금 결정하기" 버튼**: `text-sp-accent hover:underline text-sm font-medium` — 클릭 시 `firstSyncRequired = true` → 모달 재노출. 단, `sync.enabled = false` 상태이므로 모달에서 download/upload 선택 시 `enabled = true`로 함께 전환해야 한다.

---

## 7. 상태 관리

### 7.1 useDriveSyncStore 추가 상태 (`src/adapters/stores/useDriveSyncStore.ts`)

```typescript
// DriveSyncState 인터페이스에 추가
firstSyncRequired: boolean;       // true → FirstSyncConfirmModal 노출
firstSyncCloudInfo: CloudSyncInfo | null | undefined; // 사전 조회 결과

// Actions
checkFirstSyncRequired: () => Promise<void>;
chooseFirstSync: (action: 'download' | 'upload' | 'defer') => Promise<void>;
```

**초기값**:
```typescript
firstSyncRequired: false,
firstSyncCloudInfo: undefined,
```

**checkFirstSyncRequired 구현 의사코드**:
```
async checkFirstSyncRequired():
  const settings = useSettingsStore.getState().settings
  const sync = settings.sync
  if (!sync?.enabled) return

  const { driveSyncRepository } = await import('@adapters/di/container')
  const manifest = await driveSyncRepository.getLocalManifest()

  if (manifest && manifest.deviceId !== '') return  // 기존 기기 → 무시

  // 신규 기기 감지 → 모달 준비
  // 클라우드 manifest 병렬 조회
  set({ firstSyncRequired: true, firstSyncCloudInfo: undefined })

  try {
    const { getDriveSyncAdapter, authenticateGoogle } = await import('@adapters/di/container')
    const getToken = () => authenticateGoogle.getValidAccessToken()
    const drivePort = getDriveSyncAdapter(getToken)
    const folder = await drivePort.getOrCreateSyncFolder()
    const cloudManifestFile = await drivePort.listSyncFiles(folder.id)
      .then(files => files.find(f => f.name === 'manifest.json'))

    if (!cloudManifestFile) {
      set({ firstSyncCloudInfo: { hasData: false } })
      return
    }
    const raw = await drivePort.downloadSyncFile(cloudManifestFile.id)
    const cloudManifest = JSON.parse(raw) as DriveSyncManifest
    set({
      firstSyncCloudInfo: {
        hasData: Object.keys(cloudManifest.files).length > 0,
        lastSyncedAt: cloudManifest.lastSyncedAt,
        deviceName: cloudManifest.deviceName,
      }
    })
  } catch {
    set({ firstSyncCloudInfo: null })  // 조회 실패 → 보수적으로 null
  }
```

**chooseFirstSync 구현 의사코드**:
```
async chooseFirstSync(action: 'download' | 'upload' | 'defer'):
  const { useSettingsStore } = await import('./useSettingsStore')
  const sync = useSettingsStore.getState().settings.sync

  if (action === 'download'):
    if (sync) await useSettingsStore.getState().update({ sync: { ...sync, enabled: true } })
    set({ firstSyncRequired: false, firstSyncCloudInfo: undefined })
    await get().syncFromCloud()  // 기존 syncFromCloud 액션 재사용

  else if (action === 'upload'):
    if (sync) await useSettingsStore.getState().update({ sync: { ...sync, enabled: true } })
    set({ firstSyncRequired: false, firstSyncCloudInfo: undefined })
    await get().syncToCloud()  // 기존 syncToCloud 액션 재사용

  else:  // defer
    if (sync) await useSettingsStore.getState().update({
      sync: { ...sync, enabled: false, firstSyncDeferred: true }
    })
    set({ firstSyncRequired: false, firstSyncCloudInfo: undefined })
```

### 7.2 Settings 엔티티 확장 (`src/domain/entities/Settings.ts`)

```typescript
export interface SyncSettings {
  readonly enabled: boolean;
  readonly autoSyncOnStart: boolean;
  readonly autoSyncOnSave: boolean;
  readonly autoSyncIntervalMin: number;
  readonly conflictPolicy: 'latest' | 'ask';
  readonly lastSyncedAt: string | null;
  readonly deviceId: string;
  /** 사용자가 "나중에 결정"을 선택했을 때 true. 명시적 결정 후 false로 초기화 */
  readonly firstSyncDeferred?: boolean;
}
```

필드는 optional (`?`)로 선언하여 기존 데이터 마이그레이션 없이 하위 호환성을 유지한다. 코드에서 `sync.firstSyncDeferred ?? false`로 읽는다.

---

## 8. 클라우드 사전 조회 UX

모달이 열리는 즉시 클라우드 manifest를 백그라운드에서 조회하여 `firstSyncCloudInfo`를 설정한다. 조회 결과에 따라 카드 강조가 자동으로 업데이트된다.

| cloudInfo 상태 | 카드 1 (받기) | 카드 2 (덮어쓰기) |
|---|---|---|
| `undefined` (조회 중) | 기본 스타일 + Spinner | 기본 스타일 |
| `{ hasData: true }` | sp-accent 외곽선 + "권장" 뱃지 | 빨간 경고 텍스트 |
| `{ hasData: false }` | 회색 설명 | sp-accent 외곽선 + "권장" 뱃지 |
| `null` (실패) | 기본 스타일 (보수적 강조) | 기본 스타일 |

**Spinner** (조회 중): Material Symbols `progress_activity animate-spin text-sp-muted text-icon-sm` 을 클라우드 상태 배지 영역에 인라인으로 사용.

---

## 9. 시퀀스 다이어그램

### 9.1 경로 A — autoSyncOnStart (정상 흐름: 받기 선택)

```
App.tsx mount (2초 딜레이)
  → initDriveSync()
  → getLocalManifest()
  → manifest.deviceId === '' ?
       Yes → checkFirstSyncRequired()
               → set({ firstSyncRequired: true })
               → [백그라운드] drivePort.listSyncFiles() → set({ firstSyncCloudInfo })
  → <FirstSyncConfirmModal open={true} /> 렌더링
  → 사용자: "클라우드에서 받기" 클릭
  → chooseFirstSync('download')
       → settings.sync.enabled = true 저장
       → set({ firstSyncRequired: false })
       → syncFromCloud() 실행
               → 다운로드 완료 → reloadStores()
               → set({ status: 'success' })
  → 모달 닫힘
  → 이후 실행: manifest.deviceId !== '' → 모달 미노출
```

### 9.2 경로 — 덮어쓰기 선택 (2차 confirm 포함)

```
사용자: "이 기기 데이터로 덮어쓰기" 클릭
  → FirstSyncConfirmModal: setShowUploadWarn(true)
  → FirstSyncUploadWarnModal 렌더링
  → 사용자: 체크박스 체크 → "덮어쓰기 진행" 클릭
  → onChooseUpload() 호출
  → chooseFirstSync('upload')
       → settings.sync.enabled = true 저장
       → set({ firstSyncRequired: false })
       → syncToCloud() 실행
               → 업로드 완료
               → set({ status: 'success' })
  → 모달 닫힘
```

### 9.3 경로 — 나중에 결정

```
사용자: "나중에 결정" 클릭 (또는 ESC / X 버튼)
  → onDefer() 호출
  → chooseFirstSync('defer')
       → settings.sync = { ...sync, enabled: false, firstSyncDeferred: true }
       → set({ firstSyncRequired: false })
  → 토스트 노출: "동기화를 나중에 설정해요"
  → Settings 진입 시 BackupCard 배너 표시
  → 사용자: "지금 결정하기" 클릭
       → set({ firstSyncRequired: true }) → 모달 재노출
```

---

## 10. 디자인 시스템 일관성

### 10.1 토큰 사용 원칙

| 요소 | 토큰 / 클래스 |
|------|--------------|
| 모달 패널 배경 | `bg-sp-card` (Modal.tsx 기본) |
| 모달 테두리 | `border-sp-border` (Modal.tsx 기본) |
| 카드 배경 | `bg-sp-card` (기본), `bg-sp-surface` (hover) |
| 카드 테두리 | `border-sp-border` |
| 강조 카드 테두리 | `border-sp-accent ring-1 ring-sp-accent/30` |
| 위험 텍스트 | `text-red-400` |
| 위험 카드 hover | `hover:bg-red-500/5 hover:border-red-500/40` |
| 배너 배경 | `bg-amber-500/10 border-amber-500/30` |
| 아이콘 크기 | `text-icon-xl` (32px — 카드 내 주 아이콘) |
| 카드 radius | `rounded-xl` (카드 기본) |
| 버튼 radius | `rounded-lg` |
| 그림자 (hover) | `hover:shadow-sp-md` |
| 애니메이션 | `animate-scale-in` (Modal.tsx 기본 적용됨) |

**rounded-sp-* 사용 금지**: memory `feedback_rounding_policy.md` 준수. Tailwind 기본 키 사용.

### 10.2 접근성

| 요구사항 | 구현 방법 |
|----------|-----------|
| focus-trap | `Modal.tsx`의 `FocusTrap` 재사용 (`focus-trap-react`) |
| 초기 포커스 | "클라우드에서 받기" 카드 버튼 (`initialFocusRef` 전달) |
| aria-labelledby | Modal의 `titleId` 자동 생성 (`useId()`) |
| aria-describedby | 클라우드 상태 배지 `id="cloud-status-desc"` → 모달 패널 `aria-describedby` |
| ESC 처리 | `closeOnEsc={false}` + 별도 keydown → `onDefer` 연결 |
| 색상 단독 정보 전달 금지 | 위험 카드에 아이콘 + 텍스트 병행 사용 |
| WCAG 2.5.5 최소 터치 영역 | 카드 버튼 min-height: `min-h-[80px]` |

### 10.3 DriveSyncConflictModal 패턴 준수 체크리스트

- [x] `Modal` 공통 컴포넌트 사용 (focus-trap 내장)
- [x] `closeOnBackdrop={false}` — 실수로 닫기 방지
- [x] 헤더: 아이콘 bg `rounded-lg p-2` + 제목 bold + 설명 xs muted
- [x] X 버튼: `p-1 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-text/5`
- [x] 액션 버튼: sp-accent/10 기반 톤 사용
- [x] 한국어 텍스트 전용

---

## 11. 영향 파일

```
src/
├── adapters/
│   ├── components/
│   │   ├── common/
│   │   │   ├── FirstSyncConfirmModal.tsx          [신규, ~200줄]
│   │   │   └── FirstSyncUploadWarnModal.tsx        [신규, ~80줄]
│   │   │       (또는 FirstSyncConfirmModal 내부 단계로 통합)
│   │   └── Settings/
│   │       └── google/
│   │           └── BackupCard.tsx                  [수정] ~30줄
│   │               - onToggle 핸들러 분기 추가
│   │               - firstSyncDeferred 배너 추가
│   │               - "지금 결정하기" 버튼 추가
│   └── stores/
│       └── useDriveSyncStore.ts                    [수정] ~60줄
│           - firstSyncRequired, firstSyncCloudInfo 상태 추가
│           - checkFirstSyncRequired() 액션 추가
│           - chooseFirstSync() 액션 추가
├── domain/
│   └── entities/
│       └── Settings.ts                             [수정] 1줄
│           - SyncSettings.firstSyncDeferred?: boolean 추가
└── App.tsx                                         [수정] ~20줄
    - initDriveSync() 내 window.confirm() 교체
    - checkFirstSyncRequired() 호출 추가
    - FirstSyncConfirmModal 렌더링 추가
```

**테스트 파일** (신규):
```
src/adapters/components/common/__tests__/
└── FirstSyncConfirmModal.test.tsx                  [신규]
src/adapters/stores/__tests__/
└── useDriveSyncStore.firstSync.test.ts             [신규]
```

---

## 12. 의존성

### 12.1 다른 PDCA와의 관계

| PDCA | 관계 | 영향 |
|------|------|------|
| `sync-registry-refactor` | 소프트 종속 (선행 권장) | 완료 후 `syncDomains` prop을 registry에서 자동 enumerate 가능. 현재는 `DriveSyncConflictModal.tsx:5-23`의 `FILE_LABELS` 키 목록을 직접 참조하여 하드코딩 |
| `note-cloud-sync` | 독립 | 노트 도메인이 추가되면 `FILE_LABELS` 또는 registry에 자동 포함됨 — 모달 안내 문구 자동 반영 |
| `realtime-wall-management` | 독립, 공유 파일 없음 | 영향 없음 |

### 12.2 런타임 의존성

- `focus-trap-react` — 기존 Modal.tsx에서 이미 사용 중, 추가 설치 불필요
- `@adapters/di/container` — `driveSyncRepository`, `getDriveSyncAdapter`, `authenticateGoogle` 사용 (기존 패턴 동일)

---

## 13. 검증 기준 (E2E 시나리오)

| # | 시나리오 | 기대 결과 |
|---|----------|-----------|
| 1 | 앱 초기화(manifest 없음) + autoSync enabled + Google 연결 | 2초 후 FirstSyncConfirmModal 노출, 백그라운드 동기화 차단 |
| 2 | 모달 노출 중 "받기" 선택 | syncFromCloud만 실행, syncToCloud 미실행, 모달 닫힘 |
| 3 | 모달 노출 중 "덮어쓰기" 선택 | 2차 confirm 모달 노출 |
| 4 | 2차 confirm 체크박스 체크 → "덮어쓰기 진행" | syncToCloud 실행, 모달 닫힘 |
| 5 | 2차 confirm "취소" | syncToCloud 미실행, 1차 모달 복귀 |
| 6 | 모달 노출 중 "나중에 결정" | autoSync OFF, firstSyncDeferred=true, 모달 닫힘, 토스트 노출 |
| 7 | "나중에 결정" 후 앱 재실행 (autoSync는 OFF 상태) | 모달 미노출 (enabled=false이므로 진입 조건 미충족) |
| 8 | "나중에 결정" 후 Settings > BackupCard 진입 | 노란 배너 표시 |
| 9 | 배너 "지금 결정하기" 클릭 | firstSyncRequired=true → 모달 재노출 |
| 10 | manifest 있는 기존 사용자 앱 실행 | 모달 미노출, 기존 동기화 그대로 (회귀 없음) |
| 11 | BackupCard autoSync 토글 ON (manifest 없음) | 모달 노출 |
| 12 | BackupCard autoSync 토글 ON (manifest 있음) | 모달 미노출, 기존 동작 그대로 |
| 13 | ESC 키 입력 | defer 처리 (실수로 덮어쓰기 방지) |
| 14 | X 버튼 클릭 | defer 처리 |
| 15 | `npx tsc --noEmit` | 에러 0개 |

---

## 14. 위험 및 미해결

| 위험 | 영향 | 완화 방안 |
|------|------|-----------|
| 모달 노출 중 백그라운드 syncFromCloud 경쟁 조건 | High — `autoSyncOnFocus` useEffect(App.tsx:747)가 포커스 복귀 시 동기화 실행 | `firstSyncRequired === true` 체크를 `onFocus` 핸들러 최상단에 추가하여 모달 열려있는 동안 sync 차단 |
| "나중에" 후 autoSync 토글 재활성화 시 재진입 여부 | Medium — 사용자가 직접 토글 ON → manifest 여전히 없음 → 다시 모달 노출해야 함 | 진입 경로 B 로직으로 커버됨 |
| 모바일 범위 | Low | Out of Scope. `useMobileDriveSyncStore`는 별도 PDCA에서 처리 |
| "덮어쓰기" 전 클라우드 자동 백업 | High (사용자 실수) | 현재: 2차 confirm으로 1차 보호. v2에서 클라우드 스냅샷 자동 생성 옵션 검토 |
| firstSyncDeferred 상태에서 수동 "지금 백업 실행" 클릭 시 | Medium — 모달 없이 syncFromCloud+syncToCloud 실행될 수 있음 | 진입 경로 C에서 manifest 부재 시 모달 노출로 차단 |

### 14.1 경쟁 조건 상세 (syncLocked 전략)

`useDriveSyncStore`에 `syncLocked: boolean` 플래그를 추가하는 방법과 useEffect 내 `firstSyncRequired` 체크를 활용하는 방법 두 가지가 있다.

**권장**: `firstSyncRequired` 자체를 lock 역할로 활용한다. `syncFromCloud`, `syncToCloud`, `triggerSaveSync` 액션 초입에 `if (get().firstSyncRequired) return` 가드를 추가하면 별도 플래그 없이 경쟁 조건을 방지할 수 있다. 이는 `status === 'syncing'` 가드 패턴(useDriveSyncStore:48,127)과 동일한 방식이다.

---

## 15. 구현 순서 (권장)

1. `Settings.ts` — `SyncSettings.firstSyncDeferred?: boolean` 추가 (1줄)
2. `useDriveSyncStore.ts` — `firstSyncRequired`, `firstSyncCloudInfo` 상태 + `checkFirstSyncRequired`, `chooseFirstSync` 액션 추가
3. `FirstSyncConfirmModal.tsx` 신규 작성
4. `App.tsx` — `initDriveSync()` 내 `window.confirm()` 교체 + 모달 렌더링
5. `BackupCard.tsx` — 토글 핸들러 분기 + 배너 추가
6. vitest 테스트 작성
7. `npx tsc --noEmit` 확인

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-26 | Initial draft | pblsketch |
