# backup-restore-center Design Document

> **Summary**: 사용자가 직접 데이터를 백업/복원하고 저장 위치를 확인할 수 있는 **백업·복원·데이터 위치 센터**를 설정 화면에 추가한다. 단일 `.ssampin-backup.json` 파일 기반(외부 의존성 0), 복원 직전 자동 safety backup, 외부 서버 전송 없음. 설계는 사용자 제공 프롬프트(`04. 백업·복원·데이터 위치 센터 Claude Code 프롬프트`)를 충실히 반영한다.
>
> **Project**: SsamPin
> **Version**: v2.0.3 (예정)
> **Author**: pblsketch (사용자 프롬프트 제공) / Claude Code (구현)
> **Date**: 2026-05-04
> **Status**: Implemented (gap analysis 대기)
> **Source**: 사용자 제공 프롬프트 ("04. 백업·복원·데이터 위치 센터")

---

## 1. 개요

### 1.1 설계 목표

쌤핀의 강점은 **로컬·오프라인·투명성**이다. 기능이 늘어나면서 다음 세 가지가 신뢰의 핵심이 된다:

1. 내 데이터가 어디에 저장되는지 사용자가 즉시 확인할 수 있어야 한다.
2. 컴퓨터를 바꾸거나 USB로 옮기고 싶을 때 한 파일로 옮길 수 있어야 한다.
3. 데이터가 망가져도 직접 되돌릴 수 있어야 한다.

### 1.2 설계 원칙

- **외부 서버 0**: 모든 처리는 main 프로세스 + 사용자 디스크 안에서만 일어난다. fetch/upload/cloud sync 어떤 것도 사용하지 않는다.
- **외부 의존성 0**: zip 라이브러리 없이 단일 JSON 파일로 처리. 추후 확장은 metadata.schemaVersion으로 가능.
- **Clean Architecture 준수**: 검증 로직은 `src/domain/rules/backupRules.ts`에 순수 함수로 작성하고 단위 테스트로 잠근다.
- **MVP 작게**: 현재 존재하는 저장소(`userData/data/*.json`)를 모아 내보내는 방향. 데이터 저장 구조 자체는 손대지 않는다.
- **사용자 안전 우선**: 복원 직전 항상 safety backup을 자동 생성. 무엇이 잘못돼도 한 번은 되돌릴 수 있다.

### 1.3 범위 / 비범위

**포함**:
1. 저장 위치 표시 — `app.getPath('userData')` + 데이터 디렉토리 경로 표시 + OS 탐색기 열기 버튼
2. 백업 내보내기 — 단일 `.ssampin-backup.json` (metadata + data)
3. 복원 가져오기 — 파일 선택 → 구조/버전 검증 → 자동 safety backup → atomic write → 새로고침 안내
4. 개인정보 안내 — 학생명/연락처/메모 포함 가능 명시 + 외부 서버 전송 없음 명시
5. 도메인 검증 함수 + 단위 테스트

**제외 (MVP)**:
- 클라우드 백업
- 자동 원격 동기화
- 암호화 압축 (단 metadata.schemaVersion으로 추후 확장 가능)
- 바이너리 파일 (이모티콘 PNG, 서식 PDF/HWPX) — 명시적 제외
- 보안 저장소(safeStorage 토큰) — 절대 건드리지 않음

---

## 2. 사용자 시나리오

### 2.1 데이터 위치 확인 (시나리오 A)

1. 사용자가 설정 → "백업/복원" 탭을 연다.
2. 사용자 데이터 폴더 + JSON 데이터 디렉토리가 표시된다 (`Read-only`).
3. "폴더 열기" 버튼 → OS 파일 탐색기에서 디렉토리가 열린다.

### 2.2 백업 내보내기 (시나리오 B)

1. 사용자가 "백업 파일로 저장하기" 버튼 클릭.
2. OS 저장 다이얼로그 → 사용자가 위치 + 파일명 선택.
3. main 프로세스가 `userData/data/*.json`을 모아 `.ssampin-backup.json`으로 직렬화 → 디스크 저장.
4. UI에 저장된 파일 경로 + 항목 수 표시.

### 2.3 다른 PC로 옮기기 (시나리오 C)

1. PC#1에서 시나리오 B로 백업 파일 생성.
2. USB/이메일로 PC#2에 파일 전달.
3. PC#2에서 쌤핀 설치 후 같은 탭의 "백업 파일 가져오기" 클릭 → 파일 선택.
4. 시스템이 자동으로 PC#2의 현재 상태를 `userData/data/backups/safety-{timestamp}.ssampin-backup.json`로 보존.
5. 백업 파일의 데이터로 atomic write.
6. UI가 새로고침 안내. 사용자가 클릭 → 화면이 PC#1 상태로 변환.

### 2.4 복원 실패 → 직접 되돌리기 (시나리오 D)

1. 사용자가 잘못된 백업을 가져왔다고 판단.
2. 시스템이 시나리오 C 단계 4에서 만든 safety backup 파일이 `userData/data/backups/`에 남아 있음.
3. 사용자가 해당 파일을 다시 "가져오기"로 선택 → 원래 상태로 복원.

---

## 3. 시스템 설계

### 3.1 Clean Architecture 레이어 매핑

```
┌─────────────────────────────────────────────────────────────────┐
│  infrastructure/  (electron/)                                    │
│  ├ backupManager.ts        ← Save/Open dialog, fs I/O, IPC handler│
│  └ main.ts                 ← 4 IPC 핸들러 등록                    │
├─────────────────────────────────────────────────────────────────┤
│  adapters/                                                       │
│  └ components/Settings/                                          │
│     ├ BackupRestorePanel.tsx  ← 4 섹션 UI                        │
│     └ tabs/BackupTab.tsx      ← 탭 래퍼                          │
├─────────────────────────────────────────────────────────────────┤
│  usecases/   (없음 — 본 기능은 단순 IO. usecase 추가 안 함)        │
├─────────────────────────────────────────────────────────────────┤
│  domain/                                                         │
│  ├ entities/Backup.ts        ← BackupFile, BackupMetadata 타입    │
│  └ rules/backupRules.ts      ← validateBackupFile 등 순수 함수    │
└─────────────────────────────────────────────────────────────────┘
```

domain 레이어는 외부 의존 0. electron rootDir 한계로 `electron/backupManager.ts`가 동일 검증 규칙을 의도적 미러링한다 (관례: `electron/lib/zipStore.ts`, `SheetSplitter` 등).

### 3.2 IPC 채널 (4개)

| Channel | Direction | Payload | Purpose |
|---------|-----------|---------|---------|
| `backup:getDataLocation` | renderer → main | (none) | `{userDataPath, dataDirPath, exists}` 반환 |
| `backup:openDataLocation` | renderer → main | (none) | `shell.openPath(dataDir)` 후 `{ok, reason?}` |
| `backup:export` | renderer → main | (none) | Save dialog → 직렬화 → 디스크 저장 → `{canceled, filePath?, entryCount?}` |
| `backup:import` | renderer → main | (none) | Open dialog → 검증 → safety backup → atomic write → broadcast → 결과 반환 |

`backup:import` 핸들러는 매 복원 항목마다 main의 `broadcastToAllWindows('data:changed', filename)`을 호출하여 렌더러 store가 reload하게 한다. 이미 존재하는 `data:changed` 채널을 재사용 — preload 신규 채널 0.

### 3.3 백업 파일 구조

```jsonc
{
  "metadata": {
    "schemaVersion": 1,                 // 호환되지 않는 변경 시 +1
    "appVersion": "2.0.2",              // package.json version
    "exportedAt": "2026-05-04T12:34:56.789Z",  // ISO-8601
    "platform": "win32",                // win32 | darwin | linux | browser | unknown
    "entryCount": 25                    // data slot 개수
  },
  "data": {
    "settings": { /* JsonSettingsRepository payload */ },
    "students": [ /* ... */ ],
    "events": [ /* ... */ ],
    "memos": [ /* ... */ ],
    "todos": [ /* ... */ ],
    // ... userData/data/*.json 화이트리스트 통과한 모든 슬롯
  }
}
```

### 3.4 백업 대상 화이트리스트 규칙

`userData/data/` 디렉토리를 enumerate하여 다음 규칙을 통과하는 파일만 포함한다:

1. `.json` 확장자
2. base name이 `.backup` / `.tmp`로 끝나지 않음 (atomic write 부산물 차단)
3. base name이 `widget-bounds` / `icon-bounds`가 아님 (환경 의존)
4. base name이 `[A-Za-z0-9_.-]+` 패턴 (path traversal 방어)

이 방식은 `SYNC_REGISTRY` 25개 도메인 + critical 보조 파일을 자동으로 모두 포함한다. 새 도메인 추가 시 코드 수정 0회로 자동 반영.

### 3.5 복원 절차 (atomic, 6 단계)

```
1. 사용자 파일 선택 (Open dialog)
   ↓ canceled → return canceled=true
2. 파일 읽기 (fs.readFileSync utf-8)
   ↓ 실패 → file-read-failed
3. JSON.parse
   ↓ 실패 → invalid-json
4. validateBackupShape (구조 + schemaVersion + 필드 + 키 패턴)
   ↓ 실패 → invalid-structure | unsupported-future-version | empty-data
5. createSafetyBackup → userData/data/backups/safety-{stamp}.ssampin-backup.json
   ↓ 실패 → write-failed
6. 각 entry → atomicWriteData (tmp 쓰기 → 길이 검증 → rename)
   ↓ 실패 → write-failed (단, safetyBackupPath는 응답에 포함하여 사용자 복구 안내)
7. broadcast data:changed × N → 렌더러 store auto-reload
8. UI: "지금 새로고침" 버튼 표시
```

### 3.6 에러 분류

| Code | 의미 | UI 처리 |
|------|------|---------|
| (none, canceled=true) | 사용자 취소 | 무음 처리, 토스트 X |
| `file-read-failed` | OS-level read 실패 | 한국어 메시지 표시 |
| `invalid-json` | JSON 파싱 실패 | 한국어 메시지 표시 |
| `invalid-structure` | metadata/data 누락, path 패턴 위반 | 한국어 메시지 표시 |
| `unsupported-future-version` | schemaVersion > 1 | 업데이트 안내 |
| `empty-data` | data 객체에 키 0개 | 한국어 메시지 표시 |
| `write-failed` | 디스크 쓰기 실패 | 안전 백업 경로 함께 표시 |

---

## 4. UI 설계

### 4.1 위치

설정 → 사이드바 신규 탭 **"백업/복원"** (icon: `cloud_download`, color: emerald)

탭 위치: `system` 다음, `about` 이전. 사용자가 "내 데이터 → 시스템 → 백업/복원 → 앱 정보" 흐름으로 자연스럽게 도달.

### 4.2 패널 구성 (4 섹션)

**§ 섹션 A: 내 데이터가 저장된 위치**
- 사용자 데이터 폴더 + JSON 디렉토리 경로(monospace, 복사 가능)
- "폴더 열기" 버튼 → OS 탐색기

**§ 섹션 B: 내 데이터 백업하기**
- 개인정보 안내 박스 (amber, privacy_tip 아이콘)
  - "학생 이름·연락처·메모·평가 기록 등 민감한 개인정보가 포함될 수 있어요"
  - "외부 서버에는 어떤 데이터도 전송되지 않아요"
- "백업 파일로 저장하기" CTA 버튼 (sp-accent)
- 성공 시 저장된 파일 경로 + 항목 수 표시

**§ 섹션 C: 백업에서 복원하기**
- 자동 안전장치 안내 박스 (blue, shield 아이콘)
  - 복원 직전 자동 safety backup
  - 안전 백업 파일에서 다시 되돌릴 수 있음
  - 복원 후 새로고침 필요
- "백업 파일 가져오기" 1차 버튼 (purple, restore 아이콘)
- 클릭 시 확인 단계 → "계속하기" / "취소"
- 진행 중 progress 표시
- 성공 시 복원 항목 수 + safety backup 경로 + 백업 출처(앱 버전 + 날짜) + "지금 새로고침" 버튼
- 실패 시 한국어 에러 메시지(red 박스)

**§ 섹션 D: 백업에 포함되지 않는 항목**
- 이모티콘 이미지(PNG)와 서식 파일(.hwpx, .pdf 등)
- 로그인 토큰·비밀번호 등 보안 저장소 정보
- 위젯·아이콘 위치 정보 같은 환경 의존 설정

### 4.3 브라우저 모드 폴백

`window.electronAPI?.backup`이 없으면(브라우저 dev 모드) 다음 한 섹션만 렌더:
> "백업과 복원은 데스크톱 쌤핀에서만 지원돼요."

---

## 5. 검증 / 테스트 전략

### 5.1 단위 테스트 (`src/domain/rules/backupRules.test.ts`)

| 함수 | 테스트 케이스 |
|------|---------------|
| `selectBackupCandidates` | 정상 정렬, .backup/.tmp 부산물 제외, widget-bounds/icon-bounds 제외, json 외 무시, path traversal 거부, 중복 제거 |
| `buildBackupMetadata` | 현재 schemaVersion으로 metadata 생성 |
| `validateBackupFile` | 정상 통과, null/array/missing-metadata/missing-data 거부, 미래 버전 거부, empty-data 거부, 키 패턴 거부, 알 수 없는 platform → unknown 정규화 |
| `selectRestoreCandidates` | 백업 안의 환경 파일을 복원에서 skip |
| `buildDefaultBackupFilename` | ISO 시각 (밀리초 유무 모두) → 안전한 파일명 |

총 18개 케이스. `vitest.config.ts`의 `@domain` alias 사용.

### 5.2 통합/수동 검증 절차

1. `npm run electron:dev` → 설정 → "백업/복원" 탭
2. "폴더 열기" → 탐색기에서 `userData/data` 폴더 열림 확인
3. "백업 파일로 저장하기" → 임의 위치 저장 → 텍스트 에디터로 metadata + data 구조 확인
4. 데이터 일부 수정 → 위 백업 가져오기 → 토스트 + 새로고침 후 백업 시점으로 복원되는지 확인
5. `userData/data/backups/safety-*.ssampin-backup.json` 생성 확인
6. 일부러 손상된 JSON을 가져와 한국어 에러 메시지 확인
7. macOS / Linux에서도 다이얼로그 동작 확인 (metadata.platform 기록)

### 5.3 보안 검증 체크리스트

- [x] path traversal: `[A-Za-z0-9_.-]+` 화이트리스트로 차단
- [x] 외부 서버 전송: 코드에 fetch/http/https.request 없음
- [x] 보안 저장소 접근: `secureWrite`/`secureRead` 호출 0회
- [x] 사용자 콘텐츠 코드 실행 위험: 직렬화/역직렬화 모두 JSON.parse/JSON.stringify만 사용

---

## 6. 위험 / 트레이드오프

### 6.1 의도적 트레이드오프

- **zip 미사용**: 단일 JSON으로 압축 효율을 포기하는 대신 외부 의존성 0과 사람이 읽을 수 있는 파일을 얻는다. 대용량 사용자(>100MB)가 등장하면 schemaVersion 2에서 zip 추가 검토.
- **바이너리 미포함**: 이모티콘/서식 파일은 별도 파일 시스템에 있어 백업 범위 외. 사용자에게 명시. v2.0.4+에서 별도 탭으로 확장 가능.
- **보안 저장소 미포함**: 토큰/비밀번호는 OS keychain에 별도 저장되어 PC 이동 시 어차피 재발급 필요. 본 백업으로 옮기지 않는다 (보안 + 의도된 동작).

### 6.2 회귀 리스크

- 기존 `data:changed` 채널을 재사용하므로 `App.tsx`의 `STORE_SUBSCRIBE_MAP`에 이미 매핑된 도메인은 자동 reload. 그러나 채널 미가입 도메인(예: `wall-board-*`)은 사용자가 새로고침 버튼을 누를 때 비로소 반영. UI에 "지금 새로고침" 버튼 표시로 mitigate.
- atomic write 실패 중간에 발생 시 일부 파일만 새 데이터로 바뀌고 일부는 옛 데이터일 수 있다. → safety backup 경로를 응답에 포함하여 사용자가 직접 되돌릴 수 있도록 함.

---

## 7. 파일 변경 명세

### 7.1 신규

| 파일 | 책임 |
|------|------|
| `src/domain/entities/Backup.ts` | `BackupFile`/`BackupMetadata`/`BackupParseError` 엔티티 |
| `src/domain/rules/backupRules.ts` | `validateBackupFile`/`selectBackupCandidates`/`buildBackupMetadata` 등 순수 함수 |
| `src/domain/rules/backupRules.test.ts` | 18개 단위 테스트 |
| `electron/backupManager.ts` | `getDataLocationInfo`/`openDataLocation`/`exportBackup`/`importBackup` |
| `src/adapters/components/Settings/BackupRestorePanel.tsx` | 4섹션 패널 |
| `src/adapters/components/Settings/tabs/BackupTab.tsx` | 탭 래퍼 |

### 7.2 수정

| 파일 | 변경 내용 |
|------|-----------|
| `electron/main.ts` | backupManager import + 4개 IPC 핸들러 등록 |
| `electron/preload.ts` | `backup` 네임스페이스 노출 |
| `src/global.d.ts` | `BackupElectronAPI` 타입 추가 |
| `src/adapters/components/Settings/SettingsPage.tsx` | `'backup'` 탭 ID 추가 |
| `src/adapters/components/Settings/SettingsSidebar.tsx` | TABS 배열에 `backup` 항목 |
| `src/adapters/components/Settings/SettingsLayout.tsx` | TabContent switch에 `case 'backup'` |

### 7.3 영향 받지 않는 파일

기존 데이터 저장 구조는 단 한 줄도 손대지 않는다. `data:read`/`data:write` IPC, `IStoragePort`, repositories, stores 모두 그대로.

---

## 8. 완료 기준

- [x] 설정에서 데이터 위치를 확인하고 OS 탐색기로 열 수 있다.
- [x] 백업 파일을 단일 `.ssampin-backup.json`으로 내보낼 수 있다.
- [x] 백업 파일을 가져와 데이터를 복원할 수 있다.
- [x] 복원 직전 자동 safety backup이 생성된다.
- [x] 외부 서버 전송 없음이 UI에 명시된다.
- [x] 개인정보 포함 가능성이 UI에 명시된다.
- [x] 모든 한국어 메시지로 사용자 취소/파싱/구조/버전 에러 분리.
- [x] backupRules 단위 테스트 18/18 통과.
- [x] TypeScript typecheck 에러 0.
- [x] Electron 번들 빌드 성공.
- [x] 전체 vitest 518/518 통과 (회귀 0).
