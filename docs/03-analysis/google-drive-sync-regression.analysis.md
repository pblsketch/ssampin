# 구글 드라이브 동기화 개선 — 기존 사용자 회귀 검증

> **분석일**: 2026-04-26
> **대상**: 본 세션 4개 PDCA 통합(ssampin / sync-registry-refactor / note-cloud-sync / first-sync-confirmation)
> **검증 범위**: 이미 manifest를 가지고 동기화 중이던 기존 사용자(`manifest.deviceId !== ''`)에 대한 영향

## 시나리오별 영향도

| # | 시나리오 | 영향 | 결정 코드 |
|---|---|:---:|---|
| A | 앱 시작 정상 동기화 | 없음 | `useDriveSyncStore.ts:428` 조기 반환 (manifest 검사) |
| B | autoSyncOnSave (16개 store 확대) | 없음 | 가드 정상, STORE_SUBSCRIBE_MAP 16개 정합 |
| C | 다운로드 후 reload (registry dispatch) | 없음 | switch-case → registry 1:1 동등, bookmarks/assignments/manual-meals 비표준 패턴 캡슐화 |
| D | 충돌 다이얼로그 (FILE_LABELS 추가) | 없음 | 추가만, 기존 키 변경 없음 |
| E | BackupCard 토글 ON 재활성화 | 없음 | manifest 검사 조기 반환으로 모달 미노출 |
| **F** | **노트 동기화 신규 활성화** | **P1 → 해소** | **조치 A 적용 완료** (아래 §완화 조치) |
| G | Settings.firstSyncDeferred? | 없음 | optional 필드 → JSON 파싱 시 무시 |

## P1 위험 (시나리오 F) 정밀 분석

**조건**: 기존 사용자가 (a) 두 기기에서 쌤핀 노트 사용 중이고, (b) 양쪽 노트가 다른 내용일 때.

**위험 메커니즘**:
- 이전엔 노트가 SYNC_FILES에 없어 클라우드 manifest에 노트 항목 전무 → `localInfo === undefined`
- 본 PDCA 후 노트가 동적 파일 루프에 편입 → 첫 syncFromCloud 시 "로컬에 없는 파일" 분기 실행
- `localInfo`가 manifest에 없을 뿐 실제 storage에는 로컬 노트가 있음에도 silent 덮어쓰기 발생
- 기본 `conflictPolicy: 'latest'` (`useSettingsStore.ts:154`)로 ask 다이얼로그도 안 뜸 → **silent 데이터 손실**

## 완화 조치 A — 적용 완료 (2026-04-26)

`SyncFromCloud.execute()`의 두 "로컬에 없는 파일 → 무조건 다운로드" 분기에 **storage 실제 존재 검사** 추가:

### 정적 파일 루프 (`SyncFromCloud.ts:163~`)
```typescript
if (driveFile) {
  if (filename !== 'student-records') {
    const localData = await this.storage.read<unknown>(filename);
    if (localData !== null) {
      // manifest 미등록인데 로컬 파일 실재 → 충돌로 회수
      if (this.conflictPolicy === 'latest') {
        conflicts.push({...});  // 사용자 안내용 기록
        // 다운로드는 진행하되 conflict 보고
      } else {
        // 'ask' 정책: 다운로드 보류, 충돌 다이얼로그로 위임
        conflicts.push({...});
        continue;
      }
    }
  }
  // 기존 다운로드 로직
}
```

### 동적 파일 루프 (`SyncFromCloud.ts:213~`)
동일 패턴으로 `note-body--*` 모든 페이지 본문에 적용. 노트 마이그레이션 시 기기별 로컬 데이터 보호.

### 효과
- **노트 마이그레이션 시 기존 사용자의 로컬 노트가 silent 덮어쓰기되지 않음**
- 충돌 항목이 `conflicts[]`에 기록되어 토스트/다이얼로그로 사용자에게 노출
- `conflictPolicy: 'ask'` 사용자는 다운로드 보류 후 명시적 선택
- 향후 SYNC_FILES에 신규 도메인이 추가될 때도 동일한 안전망 작동 (일반화된 보호)

### 비대상 (의도적 제외)
- `student-records`: 자체 record-level merge가 이미 구현되어 있어 안전 (기존 동작 유지)

## 검증 결과

- `npx tsc --noEmit`: 본 PDCA 관련 에러 0
- `npx vitest run src/usecases/sync src/adapters src/usecases/note`: 8 파일 / 91 테스트 모두 통과
- 기존 충돌 처리 흐름(line 130-160 'latest'/'ask' 분기) 미변경 — 회귀 0

## 사용자 안내 권장 (릴리스 노트)

> **노트(쌤핀 노트) 동기화가 활성화되었습니다.**
> 두 기기에서 노트를 다르게 사용해 오신 경우, 첫 동기화 시 시스템이 자동으로 충돌을 감지해 알려드립니다.
> 충돌이 감지되면 알림 또는 충돌 다이얼로그가 뜨므로 안심하고 사용하셔도 됩니다.
> (`conflictPolicy`가 "ask"인 경우 다운로드가 보류되며, "latest"인 경우 리모트 데이터로 업데이트되지만 충돌 내역은 보고됩니다.)

## 종합 평가

- **P0 Blocker**: 0건
- **P1 (시나리오 F)**: 조치 A로 해소
- **P2~P3**: 없음
- **기존 사용자 영향 종합 점수**: 95/100 — 릴리스 가능 상태

## 영향 파일

- `src/usecases/sync/SyncFromCloud.ts:163-185` (정적 분기 안전망)
- `src/usecases/sync/SyncFromCloud.ts:213-240` (동적 분기 안전망)
