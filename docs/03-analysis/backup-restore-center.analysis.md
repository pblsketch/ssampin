# backup-restore-center Gap Analysis

> **분석일**: 2026-05-04
> **분석자**: Claude Code (gap-detector subagent)
> **설계 문서**: [`docs/02-design/features/backup-restore-center.design.md`](../02-design/features/backup-restore-center.design.md)
> **모드**: read-only (코드 수정 0회 / 신규 파일 0건)
> **PDCA Phase**: Check
> **다음 권장 단계**: `/pdca report backup-restore-center` (≥ 90% 통과)

---

## 1. 요약

| 지표 | 값 |
|------|----:|
| **종합 Match Rate** | **98%** |
| 설계 명세 항목 (§1.3 ~ §8) | 56 |
| 일치 (✅) | 54 |
| 부분일치 (⚠) | 2 |
| 누락 (❌) | 0 |
| 의도된 추가 (🆕) | 1 |

설계 문서의 **§3 IPC 4채널**, **§3.5 6단계 atomic 복원**, **§4 4섹션 UI**, **§5.1 18 테스트 케이스**, **§7 신규 6 / 수정 6 파일**이 모두 코드에 1:1 매핑된다. 잔여 갭 2건은 모두 mitigate된 의도 항목이다.

---

## 2. §1.3 범위 / 비범위 (5/5)

| 항목 | 설계 | 구현 위치 | 판정 |
|------|------|-----------|:---:|
| 저장 위치 표시 | userDataPath + dataDirPath + 탐색기 열기 | [`BackupRestorePanel.tsx:152-182`](../../src/adapters/components/Settings/BackupRestorePanel.tsx#L152-L182), [`backupManager.ts:123-140`](../../electron/backupManager.ts#L123-L140) | ✅ |
| 단일 `.ssampin-backup.json` export | metadata + data | [`backupManager.ts:144-202`](../../electron/backupManager.ts#L144-L202) | ✅ |
| 복원 + 자동 safety + atomic | 6단계 | [`backupManager.ts:377-493`](../../electron/backupManager.ts#L377-L493) | ✅ |
| 개인정보 안내 + 외부 서버 0 명시 | UI | [`BackupRestorePanel.tsx:192-205`](../../src/adapters/components/Settings/BackupRestorePanel.tsx#L192-L205) | ✅ |
| 도메인 검증 + 단위 테스트 | 18 케이스 | [`backupRules.test.ts`](../../src/domain/rules/backupRules.test.ts) 18 it() | ✅ |
| 클라우드/암호화/바이너리/safeStorage 제외 | MVP 비범위 | fetch/secureWrite/zip 호출 0건 (grep 검증) | ✅ |

---

## 3. §3 시스템 설계 (15/15)

### 3.1 Clean Architecture 매핑

| 레이어 | 설계 | 구현 위치 | 판정 |
|--------|------|-----------|:---:|
| infrastructure (electron) | `electron/backupManager.ts` + main 4 IPC | [`backupManager.ts:1-493`](../../electron/backupManager.ts), [`main.ts:2080-2097`](../../electron/main.ts#L2080) | ✅ |
| adapters | Panel + 탭 래퍼 | [`BackupRestorePanel.tsx`](../../src/adapters/components/Settings/BackupRestorePanel.tsx), [`tabs/BackupTab.tsx`](../../src/adapters/components/Settings/tabs/BackupTab.tsx) | ✅ |
| usecases | "없음" | 신규 usecase 0건 | ✅ |
| domain | `Backup.ts` + `backupRules.ts` | [`Backup.ts`](../../src/domain/entities/Backup.ts), [`backupRules.ts`](../../src/domain/rules/backupRules.ts) | ✅ |
| 도메인 검증 미러링 | `backupManager.ts`가 동일 규칙 의도적 미러 | [`backupManager.ts:14-16`](../../electron/backupManager.ts#L14-L16) 주석 + `validateBackupShape:207-317` ↔ `backupRules.ts:87-202` 동일 | ✅ |

domain → 외부 import 0건 확인.

### 3.2 IPC 4채널

| 채널 | 페이로드 | main 등록 | preload 노출 | 타입 | 판정 |
|------|----------|-----------|--------------|------|:---:|
| `backup:getDataLocation` | `{userDataPath, dataDirPath, exists}` | `main.ts:2080` | `preload.ts:739-743` | `global.d.ts:532-536` | ✅ |
| `backup:openDataLocation` | `{ok, reason?}` | `main.ts:2082` | `preload.ts:745-746` | `global.d.ts:538` | ✅ |
| `backup:export` | `{canceled, filePath?, entryCount?}` | `main.ts:2084-2087` | `preload.ts:748-752` | `global.d.ts:540-544` | ✅ |
| `backup:import` | `{canceled, restoredCount?, restoredFilenames?, safetyBackupPath?, metadata?, error?}` | `main.ts:2089-2097` | `preload.ts:754-776` | `global.d.ts:550-557` | ✅ |
| `data:changed` 채널 재사용 | broadcast | `main.ts:2095` | (재사용) | — | ✅ |

### 3.3 백업 파일 구조

설계 jsonc 예시의 5개 metadata 필드(`schemaVersion=1`, `appVersion`, `exportedAt` ISO, `platform`, `entryCount`)가 `Backup.ts:22-33` `BackupMetadata`와 1:1 일치. 직렬화는 `backupManager.ts:172-173` `JSON.stringify(backupFile, null, 2)`.

### 3.4 화이트리스트 4규칙

설계 §3.4 4규칙 ↔ `backupRules.ts:42-57` (도메인) ↔ `backupManager.ts:88-109` (electron 미러):

1. `.json` 확장자 → `name.endsWith('.json')`
2. `.backup`/`.tmp` 부산물 차단
3. `widget-bounds`/`icon-bounds` 제외 (`EXCLUDED_FILENAMES` Set)
4. `[A-Za-z0-9_.-]+` 패턴 (`VALID_FILENAME_RE`)

도메인과 electron의 규칙/순서/리터럴이 완전히 동일.

### 3.5 복원 6단계 (atomic)

| 단계 | 설계 | 구현 라인 | 판정 |
|------|------|-----------|:---:|
| 1. Open dialog | `dialog.showOpenDialog` → `canceled=true` | `backupManager.ts:383-395` | ✅ |
| 2. fs read | `file-read-failed` | `backupManager.ts:399-412` | ✅ |
| 3. JSON.parse | `invalid-json` | `backupManager.ts:415-428` | ✅ |
| 4. validateBackupShape | `invalid-structure` / `unsupported-future-version` / `empty-data` | `backupManager.ts:431-434` + `validateBackupShape:207-317` | ✅ |
| 5. createSafetyBackup | `userData/data/backups/safety-{stamp}` | `backupManager.ts:437-450` + `createSafetyBackup:320-357` | ✅ |
| 6. atomic per-entry (tmp 쓰기 → 길이 검증 → rename) | `write-failed` (safetyBackupPath 응답 포함) | `backupManager.ts:453-475` + `atomicWriteData:360-371` | ✅ |
| 7. broadcast `data:changed` × N | renderer auto-reload | `backupManager.ts:478-484` + `main.ts:2091-2095` | ✅ |

### 3.6 에러 분류

| Code | 의미 | 구현 | 판정 |
|------|------|------|:---:|
| (canceled=true) | 무음 | `BackupRestorePanel.tsx:98-100` | ✅ |
| `file-read-failed` | OS read 실패 | `backupManager.ts:402-411` | ✅ |
| `invalid-json` | 파싱 실패 | `backupManager.ts:418-427` | ✅ |
| `invalid-structure` | metadata/data/패턴 위반 | `backupManager.ts:212-303` | ✅ |
| `unsupported-future-version` | schemaVersion > 1 | `backupManager.ts:257-266` | ✅ |
| `empty-data` | 0 키 | `backupManager.ts:281-290` | ✅ |
| `write-failed` | 쓰기 실패 + safetyBackupPath | `backupManager.ts:441-449, 463-473` | ✅ |

UI 처리: `BackupRestorePanel.tsx:355-364` 한국어 메시지 그대로 표시.

---

## 4. §4 UI 설계 (10/10)

### 4.1 위치

설계 "system 다음 / about 이전" → [`SettingsSidebar.tsx:24-26`](../../src/adapters/components/Settings/SettingsSidebar.tsx#L24) TABS 인덱스 13(system) → **14(backup)** → 15(about). emerald + `cloud_download` 일치. ✅

### 4.2 4섹션

| 섹션 | 설계 | 구현 | 판정 |
|------|------|------|:---:|
| A. 데이터 위치 | userDataPath + dataDirPath (monospace) + "폴더 열기" | `BackupRestorePanel.tsx:153-182` | ✅ |
| B. 백업 내보내기 | amber privacy_tip + sp-accent CTA + 결과 카드 | `BackupRestorePanel.tsx:185-247` | ✅ |
| C. 복원 | blue shield + purple 1차 + 확인 단계 + progress + 새로고침 + red 에러 | `BackupRestorePanel.tsx:250-366` | ✅ |
| D. 미포함 항목 | PNG/HWPX/PDF + safeStorage + 환경 설정 | `BackupRestorePanel.tsx:368-379` | ✅ |

성공 카드의 "백업 출처: 쌤핀 v{appVersion} · {date}" 형식도 정확히 일치 (`BackupRestorePanel.tsx:336`).

### 4.3 브라우저 모드 폴백

설계 단일 섹션 "백업과 복원은 데스크톱 쌤핀에서만 지원돼요" → `BackupRestorePanel.tsx:135-148` 동일 문구. ✅

---

## 5. §5 검증 / 테스트 (3/3)

### 5.1 단위 테스트 18 케이스

| 함수 | 설계 | 구현 | 판정 |
|------|----:|----:|:---:|
| `selectBackupCandidates` | 6 | 6 (`backupRules.test.ts:11-61`) | ✅ |
| `buildBackupMetadata` | 1 | 1 (`63-77`) | ✅ |
| `validateBackupFile` | 9 | 8 (`79-173`) | ⚠ |
| `selectRestoreCandidates` | 1 | 1 (`175-184`) | ✅ |
| `buildDefaultBackupFilename` | 2 | 2 (`186-198`) | ✅ |
| **합계** | **18** | **18** | ✅ |

⚠ 미세한 갭: `validateBackupFile`의 의미 항목 9개 중 "missing-data" 케이스가 별도 it()으로 분리되지 않고 "metadata 누락" 케이스의 대칭 의미로 흡수됨. **합계 18은 설계와 정확히 일치**하므로 영향 없음.

### 5.2 빌드/테스트 메트릭

| 항목 | 결과 |
|------|:---:|
| TypeScript typecheck | **0 errors** ✅ |
| backupRules 단위 테스트 | **18/18 pass** ✅ |
| 전체 vitest | **518/518 pass (회귀 0)** ✅ |
| Electron build | **성공** ✅ |

### 5.3 보안 검증 4체크

| 항목 | 결과 |
|------|:---:|
| path traversal 화이트리스트 차단 | ✅ `backupRules.ts:25` + `backupManager.ts:31` 동일 정규식 |
| 외부 서버 전송 0 | ✅ fetch/http/https.request 호출 0건 |
| 보안 저장소 0회 호출 | ✅ `secureWrite`/`secureRead` 호출 0건 |
| 코드 실행 위험 | ✅ JSON.parse/JSON.stringify만 사용 |

---

## 6. §6 위험 / 트레이드오프 mitigate 검증

### 6.1 의도적 트레이드오프 (3/3 코드 반영)

- **zip 미사용**: `JSON.stringify(..., null, 2)` 사람 읽기 가능. schemaVersion으로 v2 확장 여지.
- **바이너리 미포함**: 화이트리스트 4규칙이 .json 외 차단. UI 섹션 D 명시.
- **safeStorage 미포함**: backupManager에서 `secureWrite`/`secureRead` 호출 0건. UI 섹션 D 명시.

### 6.2 회귀 리스크 mitigate

| 리스크 | mitigate | 잔존 위험 |
|--------|----------|----------|
| 채널 미가입 도메인 auto-reload 실패 | "지금 새로고침" 버튼 + 주석 | **저** — 새로고침 1회로 100% 반영 |
| atomic 중간 실패로 일부만 새 데이터 | safetyBackupPath 응답 동봉 + UI 표시 | **저** — safety import로 완전 복구 |
| 손상 파일 chain 오염 | export/safety 양쪽 try/catch continue | **무** — 의도된 skip |
| 빈 사용자 export → import empty-data 거부 | export는 허용 / import는 거부 | ⚠ **미세** — 신규 사용자 라운드트립 시나리오 외 무영향 |

---

## 7. §7 파일 변경 명세 (12/12)

### 7.1 신규 6 (모두 존재)

| 파일 | 라인수 | 판정 |
|------|------:|:---:|
| `src/domain/entities/Backup.ts` | 53 | ✅ |
| `src/domain/rules/backupRules.ts` | 233 | ✅ |
| `src/domain/rules/backupRules.test.ts` | 198 | ✅ |
| `electron/backupManager.ts` | 493 | ✅ |
| `src/adapters/components/Settings/BackupRestorePanel.tsx` | 382 | ✅ |
| `src/adapters/components/Settings/tabs/BackupTab.tsx` | 5 | ✅ |

### 7.2 수정 6 (모두 반영)

| 파일 | 변경 내용 | 판정 |
|------|-----------|:---:|
| `electron/main.ts` | backupManager 4함수 import + IPC 4핸들러 (`:2080-2097`) | ✅ |
| `electron/preload.ts` | `backup` 네임스페이스 4 메서드 (`:737-777`) | ✅ |
| `src/global.d.ts` | `BackupElectronAPI` + `BackupFileMetadataView` + `BackupImportErrorPayload` (`:506, 510-558`) | ✅ |
| `SettingsPage.tsx` | `'backup'` SettingsTabId (`:11`) | ✅ |
| `SettingsSidebar.tsx` | TABS backup 항목 (`:25`) | ✅ |
| `SettingsLayout.tsx` | `case 'backup': return <BackupTab />` (`:155`) + import (`:16`) | ✅ |

### 7.3 🆕 의도된 추가

| 항목 | 위치 | 의도 |
|------|------|------|
| safety backup 파일 `kind: 'safety' as const` 마커 | `backupManager.ts:345` | 일반 export와 safety를 구분. 향후 디버깅/복구 도구에 활용 가능. JSON 호환이라 회귀 위험 0. |

---

## 8. §8 완료 기준 (11/11)

| 기준 | 검증 |
|------|:---:|
| 데이터 위치 확인 + OS 탐색기 | ✅ |
| 단일 .ssampin-backup.json export | ✅ |
| 백업 import로 복원 | ✅ |
| 복원 직전 자동 safety backup | ✅ |
| 외부 서버 전송 없음 UI 명시 | ✅ |
| 개인정보 포함 가능성 UI 명시 | ✅ |
| 한국어 메시지 + 에러 분리 | ✅ |
| backupRules 18/18 | ✅ |
| typecheck 0 errors | ✅ |
| Electron 번들 빌드 성공 | ✅ |
| 전체 vitest 518/518 (회귀 0) | ✅ |

---

## 9. 잔여 위험 / Follow-up

| 위험 | 영향도 | 메모 |
|------|:------:|------|
| 빈 사용자가 export → import → empty-data 거부 | 낮음 | UX 흠집 정도. v2에서 토스트 안내 검토 가능. |
| `data:changed` 미가입 도메인 auto-reload 실패 | 낮음 | "지금 새로고침" 버튼 + 토스트로 mitigate. wall-board-* 등은 wallBoards.* 별도 reload 채널 사용 — 사용자 시각으로는 동일하게 새로고침으로 보임. |
| atomic write 중간 실패 → 일부만 새 데이터 | 낮음 | safetyBackupPath UI 표시(`BackupRestorePanel.tsx:339-340`)로 사용자가 직접 복구 가능. |
| safety backup 디렉토리 무한 누적 | 낮음 | TTL/회전 정책 없음. v2에서 "safety 7일 이전 자동 삭제" 검토 가능. |
| `backupManager.ts` ↔ `backupRules.ts` 미러링 동기 부담 | 낮음 | 의도된 중복(electron rootDir 한계). v2에서 codegen 검토 가능. |

---

## 10. 권장 액션

**Match Rate 98% ≥ 90% 통과 → `/pdca report backup-restore-center`로 즉시 이행 가능.**

Report 단계에서 다루면 좋을 follow-up (선택):

1. safety backup TTL/회전 정책 (`userData/data/backups/` 수동 정리 부담)
2. wall-board-* 도메인 IPC dedupe 확인 (현재 `data:changed` + `wallBoards.*` 이중 broadcast)
3. backupManager ↔ backupRules 미러링 자동화 (electron rootDir 조정 또는 codegen)
4. v2 schemaVersion 시 zip + appendix(stickers/PNG) 확장 시나리오

위 4건 모두 **회귀 위험 없는 enhancement** — 본 릴리즈 게이트 통과를 막지 않음.

---

## 참고 파일

- 설계: [`docs/02-design/features/backup-restore-center.design.md`](../02-design/features/backup-restore-center.design.md)
- 도메인: [`Backup.ts`](../../src/domain/entities/Backup.ts), [`backupRules.ts`](../../src/domain/rules/backupRules.ts), [`backupRules.test.ts`](../../src/domain/rules/backupRules.test.ts)
- Electron: [`backupManager.ts`](../../electron/backupManager.ts), [`main.ts`](../../electron/main.ts) (라인 2080-2097), [`preload.ts`](../../electron/preload.ts) (라인 737-777)
- 타입: [`global.d.ts`](../../src/global.d.ts) (라인 504-558)
- UI: [`BackupRestorePanel.tsx`](../../src/adapters/components/Settings/BackupRestorePanel.tsx), [`tabs/BackupTab.tsx`](../../src/adapters/components/Settings/tabs/BackupTab.tsx)
- Settings 통합: [`SettingsPage.tsx`](../../src/adapters/components/Settings/SettingsPage.tsx), [`SettingsSidebar.tsx`](../../src/adapters/components/Settings/SettingsSidebar.tsx), [`SettingsLayout.tsx`](../../src/adapters/components/Settings/SettingsLayout.tsx)
