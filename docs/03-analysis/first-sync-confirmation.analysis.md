# first-sync-confirmation — Gap Analysis

> **분석일**: 2026-04-26
> **Plan**: `docs/01-plan/features/first-sync-confirmation.plan.md`
> **Design**: `docs/02-design/features/first-sync-confirmation.design.md`
> **검증**: tsc 0 에러, vitest 91/91 통과
> **참고**: 분석 직후 P1 #1(defer 토스트 누락)은 즉시 수정 적용함 — 본 분석은 수정 전 시점 기준

## 종합 점수

| 카테고리 | 점수 | 상태 |
|---|:---:|:---:|
| 기능 충족도 (FR-01~FR-10) | 95% | OK |
| 컴포넌트/상태 구조 (§3, §7) | 100% | OK |
| 진입 시점 분기 (§2 A/B/C) | 100% | OK |
| 디자인 시스템 (§10) | 95% | OK |
| 검증 시나리오 (§13, 15개) | 87% (단위 테스트 미작성) | WARN |
| **종합 Match Rate** | **93%** | **PASS** |

## 항목별 검증

### §2 진입 시점 A/B/C — 100%
- A (App.tsx initDriveSync): `window.confirm()` 제거, `checkFirstSyncRequired()` + `firstSyncRequired === true` 가드
- B (BackupCard handleToggle): OFF→ON 전환 시 enabled=true 저장 + manifest 검사
- C (BackupCard handleBackupNow): manifest 부재 시 모달 우선

### §3 모달 컴포넌트 — 95%
- 위치 `adapters/components/common/FirstSyncConfirmModal.tsx`
- Props 4개 (`open`/`cloudInfo`/`onChooseDownload`/`onChooseUpload`/`onDefer`) — Design 6개 중 `syncDomains`/`onClose` 2개 미사용 (sync-registry 미반영 + onDefer로 일원화 — 합의된 우회)
- `closeOnBackdrop=false`, `closeOnEsc=false`, ESC keydown → onDefer 정확

### §4 카드 시각 디자인 — 95%
- 3카드 톤(accent/danger/muted), "권장" 배지 자동 전환, rounded-xl/lg, min-h-[80px] WCAG
- (사소) `duration-200` 하드코드 — `duration-sp-base` 토큰 권장

### §5 2차 confirm — 100% (합의된 통합)
- Design §5.1 명시 옵션 (`showUploadWarn` 내부 state) 채택
- 빨간 헤더 + 체크박스(accent-red-500) + disabled 버튼

### §6 "나중에" 흐름 — 80% → 95% (수정 후)
- enabled=false + firstSyncDeferred=true + firstSyncRequired=false ✅
- **§6.1.4 토스트 — 분석 직후 즉시 수정 적용됨** (App.tsx:933 `useToastStore.show('동기화를 나중에 설정해요...', 'info')`)
- 노란 배너 (BackupCard) ✅
- handleResolveDeferredSync 임시 enabled=true 우회는 self-healing이지만 P2

### §7 상태 관리 — 100%
- `firstSyncRequired`/`firstSyncCloudInfo` 초기값 정확
- `checkFirstSyncRequired`/`chooseFirstSync` 의사코드 그대로
- syncToCloud/syncFromCloud/triggerSaveSync 3곳 가드 적용

### §8 클라우드 사전 조회 — 100% (개선)
- Design 의사코드: `listSyncFiles().find(...).downloadSyncFile(...)`
- 실구현: `drivePort.getSyncManifest(folder.id)` 직접 호출 — 더 간결

### §10 디자인 시스템 — 95%
- sp-* 토큰 일관, rounded-xl/lg 정확, rounded-sp-* 미사용 OK
- (사소) ⚠️/☁️ 인라인 이모지 → Material Symbols 통일 권장

### §13 검증 시나리오 — 87%
- 15개 중 14개 코드 충족 (defer 토스트 수정 후 15개 충족)
- **단위 테스트 미작성**: `FirstSyncConfirmModal.test.tsx`, `useDriveSyncStore.firstSync.test.ts`

## Gap 목록

### P0 (Blocker) — 없음

### P1 (Should Fix)
| ID | 항목 | 상태 |
|---|---|---|
| G1 | defer 토스트 누락 (§6.1.4) | **분석 직후 수정 완료** |
| G2 | 단위 테스트 미작성 (FirstSyncConfirmModal + useDriveSyncStore.firstSync) | 미해결 |

### P2 (Nice to Have)
| ID | 항목 |
|---|---|
| G3 | onFocus(App.tsx:767~) / autoSyncIntervalMin 핸들러 최상단 firstSyncRequired 가드 미추가 |
| G4 | handleResolveDeferredSync 임시 enabled=true 우회 — `forceShow` 옵션이 더 깔끔 |
| G5 | syncDomains prop 미구현 (sync-registry-refactor 종속) |
| G6 | ⚠️/☁️ 이모지 → Material Symbols 통일 |
| G7 | duration-200 → duration-sp-base 토큰화 |

### P3 (별도 PDCA)
- 모바일(useMobileDriveSyncStore) 미적용
- "덮어쓰기" 직전 클라우드 자동 백업 (v2)

## 후속 권장

| 우선순위 | 항목 | 예상 공수 |
|:--:|---|:--:|
| P1 | FirstSyncConfirmModal 단위 테스트 (open/close, 2차 confirm, ESC/X→defer, cloudInfo 4상태) | 1.5h |
| P1 | useDriveSyncStore.firstSync 단위 테스트 (3분기 × 2액션) | 1h |
| P2 | onFocus/autoSyncIntervalMin 가드 + 이모지 + 토큰화 | 30분 |
| P3 | 모바일 동일 UX 적용 — 별도 PDCA | 1~2일 |
| P3 | "덮어쓰기" 전 클라우드 스냅샷 — v2 PDCA | 1~2일 |

## 핵심 결과

1. **Match Rate 93% PASS** — 핵심 요구(데이터 유실 방지, 3선택 UX, 신규 기기 감지, 경쟁 조건 가드, 영속화 배너) 모두 충족
2. **3개 진입 경로 단일화** — App.tsx initDriveSync + BackupCard handleToggle/handleBackupNow 모두 `checkFirstSyncRequired()`로 위임
3. **개선점**: getSyncManifest port 활용으로 의사코드보다 간결, firstSyncRequired 자체를 lock으로 활용
4. **P1 갭 2건 중 1건 즉시 수정 완료** (defer 토스트). 단위 테스트는 후속 작업으로 분리
5. **P2 5건 + P3 2건은 별도 PDCA로 안전 분리**. v1.12.x 릴리즈 진입 가능
