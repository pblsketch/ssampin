# Google Drive 동기화 인프라 전면 재정비 — 통합 완료 보고서

> **기간**: 2026-04-26 (단일 세션)
> **테마**: 구글 드라이브 동기화 인프라 3개 사이클 통합 PDCA
> **버전 타깃**: v1.12.x
> **작성자**: pblsketch
> **검증**: 4개 PDCA 모두 Match Rate ≥ 90% PASS

---

## 1. 통합 개요

### 1.1 3개 사이클 요약

| # | Feature | 목표 | Match Rate | 상태 |
|:-:|---|---|:---:|:---:|
| 1 | **sync-registry-refactor** | SYNC_FILES·subscribe·reloadStores·FILE_TO_STORE 4곳 분산 매핑 → 단일 소스 통합 | 97% | ✅ PASS |
| 2 | **note-cloud-sync** | dead useNoteStore subscribe 해소 + 노트 정적 3키 + 동적 페이지 본문 동기화 | 97% | ✅ PASS |
| 3 | **first-sync-confirmation** | 신규 기기 최초 동기화 시 데이터 유실 방지 UX (3선택 모달) | 93% | ✅ PASS |
| 4 | *(선행 완료)* **ssampin** | 기존 16개 도메인 동기화 회귀 없음 | ~96% | ✅ PASS |

### 1.2 통합 효과

**근본 원인 해소**: 2026-04-26 사용자 피드백(설문·체크리스트·과제 미동기화)의 구조적 원인인 "4곳 분산 매핑"을 sync-registry로 단일 소스화.

**기능 확장**: 노트 동기화(정적 3개 + 동적 페이지 본문) 추가 + 신규 기기 데이터 유실 방지 UX.

**아키텍처 개선**: registry 기반 메타테스트 6개로 향후 도메인 추가 시 누락 자동 감지 메커니즘 구축.

---

## 2. 각 사이클 핵심 결정

### 2.1 Cycle 1: sync-registry-refactor (97% Match)

**결정**:
- `SyncDomain` 인터페이스 신규 정의 + `SYNC_REGISTRY` 배열 (20개 도메인)
- `SYNC_FILES` / `SyncFileName`을 registry 파생 export로 후방 호환 유지
- App.tsx `STORE_SUBSCRIBE_MAP` + registry 순회로 자동 subscribe 구성
- useDriveSync `reloadStores` switch 120줄 → registry dispatch 5줄로 축소
- `SyncSubscribers.test.ts` FILE_TO_STORE 수동 테이블 제거 → registry 자체 정합 메타테스트 6개 추가

**의도적 상향**:
- 노트 4개 도메인(note-notebooks/sections/pages-meta/body) 직접 통합 → note-cloud-sync 작업의 80% 선흡수
- `useNoteStore` dead subscribe B안(보존) 대신 SYNC_REGISTRY에 정식 등록

**문서 갱신 권고**: Design §4 등록표에 노트 4개 행 정식 추가 + useNoteStore B안 → 통합 채택으로 재기술.

### 2.2 Cycle 2: note-cloud-sync (97% Match)

**결정**:
- 옵션 B 채택: 동적 enumeration 훅 (`getDynamicSyncFiles?: () => Promise<string[]>`)
- `INotebookRepository.listPageBodyKeys()` 인터페이스 추가 (domain 포트)
- `SyncToCloud` / `SyncFromCloud` 생성자에 훅 optional 파라미터 주입
- B안 deletion (orphan Drive 파일 잔존 허용) — 별도 cleanup PDCA로 분리
- Container.ts에서 훅 주입 (module 로드 시점 → store 호출 시점으로 lazy import)

**의도적 개선**:
- `uploadOne` 헬퍼 추출로 정적/동적 루프 DRY 통합 + 진행률 UI 정확도 향상
- SyncFromCloud `local + remote prefix 합집합` — Design 단순 local enumeration → 신규 기기 첫 다운로드 안전성 강화
- 정적 키 3개는 sync-registry-refactor가 이미 통합 → 재작업 불필요

**문서 갱신 권고**: Design §9 "reloadStores 변경 없음" → 실제 변경된 부분 정정.

### 2.3 Cycle 3: first-sync-confirmation (93% Match)

**결정**:
- 신규 기기 감지: `manifest.deviceId === ''` 조건으로 3가지 진입 경로(autoSyncOnStart / BackupCard 토글 / handleBackupNow) 통합
- 3선택 모달: "클라우드에서 받기" / "이 기기로 덮어쓰기"(2차 confirm) / "나중에 결정"
- 클라우드 manifest 사전 조회 병렬 실행으로 동적 카드 강조
- ESC / X 버튼 → defer 처리로 오조작 방지
- `firstSyncDeferred: true` 영속화 + Settings 배너로 명시적 결정 유도

**P1 즉시 수정**: defer 토스트 누락 → 분석 직후 `useToastStore.show('동기화를 나중에 설정해요...', 'info')` 추가.

**P1 후속 미해결**: FirstSyncConfirmModal / useDriveSyncStore.firstSync 단위 테스트 작성 (예상 2.5h).

---

## 3. 통합 코드 변경 통계

### 3.1 신규 파일

| 파일 | 줄수 | 역할 |
|------|------|------|
| `src/usecases/sync/syncRegistry.ts` | 297 | SyncDomain 인터페이스 + SYNC_REGISTRY 20개 도메인 + 노트 4개 |
| `src/adapters/components/common/FirstSyncConfirmModal.tsx` | 280 | 3선택 다이얼로그 + 클라우드 사전 조회 |
| `src/adapters/components/common/FirstSyncUploadWarnModal.tsx` | 80 | 2차 confirm (또는 내부 단계로 통합) |

### 3.2 주요 수정

| 파일 | 변경 내용 | 변경 LOC |
|------|----------|---------|
| `src/App.tsx` | STORE_SUBSCRIBE_MAP + registry 순회 + checkFirstSyncRequired 호출 + FirstSyncConfirmModal 렌더링 | +50 |
| `src/adapters/stores/useDriveSyncStore.ts` | firstSyncRequired/firstSyncCloudInfo 상태 + checkFirstSyncRequired/chooseFirstSync 액션 + 3곳 sync 가드 | +80 |
| `src/usecases/sync/SyncToCloud.ts` | SYNC_FILES re-export + getDynamicSyncFiles 훅 + 동적 루프 | +45 |
| `src/usecases/sync/SyncFromCloud.ts` | getDynamicSyncFiles 훅 + 동적 다운로드 루프 | +60 |
| `src/adapters/hooks/useDriveSync.ts` | switch-case 110줄 → registry dispatch 5줄 | -89 / +14 |
| `src/usecases/sync/__tests__/SyncSubscribers.test.ts` | FILE_TO_STORE 제거 → registry 기반 메타테스트 6개 | -90 / +92 |
| `src/adapters/components/Settings/google/BackupCard.tsx` | 토글/handleBackupNow 분기 + firstSyncDeferred 배너 | +40 |
| `src/adapters/components/common/DriveSyncConflictModal.tsx` | FILE_LABELS 노트 3개 키 + 동적 fallback | +5 |
| `src/domain/repositories/INotebookRepository.ts` | listPageBodyKeys 시그니처 | +2 |
| `src/adapters/repositories/JsonNotebookRepository.ts` | listPageBodyKeys 구현 | +4 |
| `src/domain/entities/Settings.ts` | sync.firstSyncDeferred? optional | +1 |

### 3.3 통합 규모

```
신규 파일:           657줄
수정 파일 합계:      ~347줄 증가
총 변경:             ~1,000줄
테스트 통과:         91/91 vitest (tsc 에러 0)
```

---

## 4. 검증 결과

### 4.1 Match Rate 종합

```
sync-registry-refactor:  97% PASS ✅
note-cloud-sync:         97% PASS ✅
first-sync-confirmation: 93% PASS ✅
ssampin (기존):          ~96% 회귀 없음
─────────────────────────────────────
평균:                    95.75% (모두 90% 이상)
```

### 4.2 검증 항목

| 항목 | 결과 |
|------|------|
| `npx tsc --noEmit` | 에러 0개 |
| `vitest run src/usecases src/adapters` | 91/91 통과 |
| Architecture (Clean Architecture) | 100% 준수 |
| Convention (TypeScript strict) | 100% 준수 |
| 사용자 피드백 원인 해소 | ✅ (surveys/assignments 등 누락 → registry 단일 소스) |
| 기능 회귀 | 0건 (기존 16개 도메인 동기화 정상) |
| 메타테스트 (회귀 방지 자동 감지) | 6/6 통과 |

---

## 5. 사용자 피드백 해결

### 5.1 원인 분석

**2026-04-26 버그**: 사용자 보고 — "학교 노트북에서 입력한 설문/체크리스트가 집 데스크톱에서 안 보임"

**구조적 원인**: SYNC_FILES(15행)·autoSyncOnSave subscribe(16행)·reloadStores switch(18 case)·FILE_TO_STORE(20행) 4곳에 분산된 도메인 매핑. surveys, assignments, seat-constraints, teaching-classes, curriculum-progress, attendance, dday, consultations, manual-meals 9개 도메인이 autoSyncOnSave에서 누락되어 있던 silent bug.

**sync-registry 해결**: 
- SYNC_REGISTRY 단일 소스 신설 (20개 정적 + 4개 동적 노트)
- 새 도메인 추가 시 registry 1개 블록만 수정 → 모든 경로 자동 정합
- 메타테스트 (a~f) 6개로 향후 누락 자동 탐지

### 5.2 추가 기능

1. **노트 동기화** (note-cloud-sync): 정적 3개 + 동적 페이지 본문
2. **신규 기기 보호** (first-sync-confirmation): 데이터 유실 위험 차단

---

## 6. 학습 포인트 (Lessons Learned)

### 6.1 Why: 원인 파악과 구조 개선의 가치

분산 매핑이 silent bug의 근본 원인이었고, 사후 탐지(FILE_TO_STORE 메타 테스트)만으로는 불충분했다. **단일 소스화**를 통해 정의 순간의 정합성을 보장하는 것이 훨씬 강력하다.

### 6.2 순서의 중요성 — 후속 PDCA 자동 선흡수

sync-registry-refactor를 먼저 완료하자, note-cloud-sync의 80%가 자동으로 흡수되었다:
- 노트 4개 도메인이 registry에 직접 통합됨
- STORE_SUBSCRIBE_MAP이 정적 키를 모두 포함
- 메타테스트가 노트까지 자동 커버

**의도**: 향후 PDCA 착수 시 순서를 신중히 결정하면 누적 작업량을 대폭 줄일 수 있다.

### 6.3 Design은 시작점, 구현은 발전형

3개 PDCA 모두 Design보다 우수한 결정이 자연스럽게 도출되었다:
- **sync-registry**: `useNoteStore` B안(보존) → 정식 등록(상향)
- **note-cloud-sync**: 의사코드 대비 `uploadOne` 헬퍼 추출, local+remote 합집합
- **first-sync-confirmation**: `getSyncManifest` port 활용으로 간결화, 단위 테스트 후속 분리

Design은 "최소 권고"로 두고, 구현 단계에서 더 나은 패턴이 보이면 과감히 채택하면서 갭 분석으로 문서화하는 방식이 효율적이다.

### 6.4 메타 테스트의 높은 ROI

registry 기반 6개 메타테스트:
- (a) SYNC_FILES 파생 정합성
- (b) STORE_SUBSCRIBE_MAP 동기화
- (c) fileName 중복 검출
- (d) settings subscribeExcluded 회귀 방지
- (e) reload 함수 존재 여부
- (f) isDynamic ↔ enumerateDynamic 정합

이들은 향후 SYNC_FILES 추가 시 누락을 자동 탐지하는 **구조적 예방**이다.

### 6.5 Clean Architecture 레이어 경계의 명확성

sync-registry(usecases)가 adapters/stores를 직접 import하지 않고 dynamic import lazy 함수로만 참조하는 패턴은:
- 모듈 초기화 순환 참조 방지
- 의존성 역전 원칙 준수
- vitest 모킹 용이성

Clean Architecture 규칙을 "strict한 제약"이 아니라 "설계의 자유도"로 활용할 수 있게 한다.

### 6.6 우연의 일치와 의도된 설계의 경계

first-sync-confirmation의 `handleResolveDeferredSync`에서 임시 `enabled=true` 우회가 self-healing처럼 동작하지만, P2로 분류한 이유는:
- 명시적 intent가 부족 (`forceShow` 옵션이 더 직관적)
- 향후 유지보수자가 의도를 오인할 가능성

이런 "우연의 동작"들을 P2 갭으로 기록하면 나중에 명확한 의도로 재작성할 수 있다.

---

## 7. 잔여 갭 및 다음 사이클 권장

### 7.1 P0 (Blocker) — 없음

4개 PDCA 모두 코어 기능 완성. v1.12.x 릴리즈 진입 가능.

### 7.2 P1 (Should Fix)

| 사이클 | 항목 | 공수 | 시점 |
|--------|------|------|------|
| sync-registry | Design §4/§6 사후 갱신 (노트 4개 + useNoteStore 통합) | 30분 | 본 사이클 직후 |
| note-cloud-sync | Design §9 reloadStores 변경 정정 | 15분 | 본 사이클 직후 |
| first-sync-confirmation | FirstSyncConfirmModal + useDriveSyncStore 단위 테스트 | 2.5h | v1.12.x-test 브랜치 |

### 7.3 P2 (Nice to Have)

| 사이클 | 항목 | 비고 |
|--------|------|------|
| sync-registry | computeChecksum 중복 (SyncToCloud + ResolveSyncConflict) | 별도 cleanup PDCA |
| note-cloud-sync | 동적 enumeration 인터페이스 의도 명확화 (enumerateDynamic placeholder vs 실제 호출) | Design §2 업데이트 |
| first-sync-confirmation | onFocus/autoSyncIntervalMin 최상단 firstSyncRequired 가드 추가 | P2 cleanup |
| 공통 | ⚠️/☁️ 인라인 이모지 → Material Symbols 통일 | UI 일관성 |
| 공통 | duration-200 → duration-sp-base 토큰화 | 디자인 시스템 |

### 7.4 별도 PDCA 권장

| 항목 | 이유 | 예상 공수 |
|------|------|----------|
| Drive orphan `note-body--*` 정리 (A안 cleanup) | note-cloud-sync B안 채택 후속 | 1일 |
| 충돌 다이얼로그 pageId → 페이지 제목 변환 | UX 개선, note-cloud-sync Should | 4시간 |
| 모바일 동기화 (useMobileDriveSyncStore) | 범위 외, 별도 PDCA | 2~3일 |
| "덮어쓰기" 직전 클라우드 자동 백업 | first-sync-confirmation v2 | 1.5일 |

---

## 8. v1.12.x 릴리즈 준비 체크리스트

```
[x] 4개 PDCA 모두 Match Rate ≥ 90%
[x] tsc --noEmit: 에러 0개
[x] vitest 91/91 통과
[x] 기존 16개 도메인 동기화 회귀 없음 검증
[x] 사용자 피드백(설문/체크리스트/과제 미동기화) 근본 원인 해소
[x] 신규 기능(노트/first-sync) 추가
[x] 메타테스트(회귀 방지 자동 감지) 6개 구현

[ ] P1 Design 갱신 3건 (30분)
[ ] P1 첫-동기화 단위 테스트 (2.5h) → 별도 브랜치
[ ] v1.12.0-rc1 포함 정보 업데이트 (releaseNotes.json + changelog)
```

---

## 9. 핵심 수치

| 지표 | 값 |
|------|-----|
| **총 변경 규모** | ~1,000줄 |
| **신규 파일** | 3개 (657줄) |
| **수정 파일** | 11개 (~347줄 증가) |
| **테스트 추가** | 메타 6개 + 단위 테스트 계획 12개 |
| **Match Rate** | 97% / 97% / 93% → 평균 95.75% |
| **사용자 피드백 해결** | 9개 도메인 autoSyncOnSave 누락 → 단일 소스 통합 |
| **예방 능력** | 메타테스트로 향후 도메인 누락 자동 탐지 |

---

## 10. 결론

### 10.1 성공 요인

1. **근본 원인 파악**: 분산 매핑 → 단일 소스화로 구조적 버그 제거
2. **순서의 전략성**: sync-registry 먼저 → note-cloud-sync 작업 80% 자동 흡수
3. **의도된 상향**: Design과 구현의 gap을 예방이 아닌 개선으로 활용
4. **예방 메커니즘**: 메타테스트 6개로 향후 회귀 자동 차단

### 10.2 v1.12.x 릴리즈 가능성

✅ **완전히 진행 가능**: 4개 PDCA 모두 PASS, 사용자 피드백 근본 해결, 회귀 0건, P0 갭 없음.

P1 3건(Design 갱신 + 단위 테스트)은 v1.12.0-rc1 → release 사이에 처리 가능.

### 10.3 3개 PDCA 통합의 가치

"데이터 유실 위험 → 동기화 인프라 재정비 → 신규 기능 추가"로 이어지는 **선순환 고리**를 만들었다.

향후 PDCA 추진 시 이 모델을 참고하여 순서 결정하면 누적 작업량을 대폭 감소시킬 수 있다.

---

## 부록: 관련 문서 링크

| 문서 | 경로 | 상태 |
|------|------|------|
| sync-registry Plan | `docs/01-plan/features/sync-registry-refactor.plan.md` | Draft |
| sync-registry Design | `docs/02-design/features/sync-registry-refactor.design.md` | Draft |
| sync-registry Analysis | `docs/03-analysis/sync-registry-refactor.analysis.md` | 97% PASS |
| note-cloud-sync Plan | `docs/01-plan/features/note-cloud-sync.plan.md` | Draft |
| note-cloud-sync Design | `docs/02-design/features/note-cloud-sync.design.md` | Draft |
| note-cloud-sync Analysis | `docs/03-analysis/note-cloud-sync.analysis.md` | 97% PASS |
| first-sync-confirmation Plan | `docs/01-plan/features/first-sync-confirmation.plan.md` | Draft |
| first-sync-confirmation Design | `docs/02-design/features/first-sync-confirmation.design.md` | Draft |
| first-sync-confirmation Analysis | `docs/03-analysis/first-sync-confirmation.analysis.md` | 93% PASS |
| **기존 사용자 회귀 검증** | `docs/03-analysis/google-drive-sync-regression.analysis.md` | **95/100 — P1 1건 해소** |

---

## 부록 A: 기존 사용자 회귀 위험 + 조치 A (2026-04-26 추가)

3개 PDCA 머지 직전, 기존 동기화 사용자(`manifest.deviceId !== ''`)에 대한 회귀 영향을 7가지 시나리오로 정밀 검증.

### 발견된 P1 위험 — 시나리오 F (노트 동기화 신규 활성화)
- 이전엔 노트가 SYNC_FILES에 없어 manifest에 노트 항목이 전무 → 본 PDCA로 노트 도메인 추가 시 첫 syncFromCloud 시 `localInfo === undefined`로 판정 → "로컬에 없는 파일 → 무조건 다운로드" 분기 진입
- 그러나 실제 storage에는 사용자가 작성한 로컬 노트가 존재할 수 있음
- 기본 `conflictPolicy: 'latest'` 환경에서 silent 덮어쓰기 발생 → 데이터 손실 가능

### 조치 A 적용 (해소)
`SyncFromCloud.execute()`의 정적/동적 두 "로컬에 없는 파일 → 무조건 다운로드" 분기에 `storage.read(filename) !== null` 검사 추가:
- `latest` 정책: 다운로드 진행하되 `conflicts[]`에 기록(사용자 안내)
- `ask` 정책: 다운로드 보류, 충돌 다이얼로그로 위임
- `student-records` 비대상(자체 record-level merge 보유)
- 영향 파일: `src/usecases/sync/SyncFromCloud.ts:163-185, 213-240`

### 효과
노트뿐 아니라 **모든 도메인의 신규 활성화 시 동일 안전망**이 작동. 향후 SYNC_FILES 추가 시 마이그레이션 위험 자동 차단.

### 검증
- tsc 0 에러 / vitest 91/91 통과
- P0 0건, P1 0건 (해소), 종합 점수 95/100 — 릴리스 가능

---

## 버전 이력

| 버전 | 날짜 | 변경 내용 | 작성자 |
|------|------|----------|--------|
| 1.0 | 2026-04-26 | 3개 PDCA 통합 완료 보고서 | pblsketch |
| 1.1 | 2026-04-26 | 기존 사용자 회귀 검증 + 조치 A 추가(부록 A) | pblsketch |
