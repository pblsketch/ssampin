# 신규 기기 최초 동기화 확인 다이얼로그 Planning Document

> **Summary**: 신규 기기 최초 실행 시 빈 로컬 상태가 클라우드를 무확인 덮어쓰는 데이터 유실 위험을 방지하는 확인 다이얼로그 추가
>
> **Project**: SsamPin (쌤핀)
> **Version**: v1.12.x (예정)
> **Author**: pblsketch
> **Date**: 2026-04-26
> **Status**: Draft

---

## 1. Overview

### 1.1 Purpose

쌤핀을 신규 기기에 처음 설치했을 때, 빈 로컬 상태(manifest 부재)가 아무 경고 없이 클라우드 데이터를 덮어쓰는 시나리오를 차단한다. 사용자가 첫 동기화 방향을 명확히 선택하도록 강제하여 데이터 유실 위험을 제거한다.

### 1.2 Background

**분석 출처**: 2026-04-26 ssampin gap-detector 분석 §10.2 "최초 동기화 확인 UX 부재" — P1 갭으로 식별.

**위험 시나리오**:
1. 사용자가 A 기기에서 쌤핀을 수개월 사용, 클라우드에 데이터 보관
2. 신규 B 기기에 쌤핀 설치 (로컬 데이터 없음, manifest 없음)
3. 앱 시작 시 `autoSyncOnStart`가 켜진 상태 → `syncFromCloud` 전에 `syncToCloud` 실행
4. 빈 로컬 상태가 클라우드에 업로드 → **클라우드 데이터 전체 유실**

**기존 코드 현황**:
- `src/App.tsx:732~` `autoSyncOnFocus`: 창 포커스 복귀 시 syncFromCloud → syncToCloud 무확인 실행
- `BackupCard.tsx:90-93` `handleRestore`: 복원 버튼에는 `confirm()` 존재 (UX 모범 사례)
- `DriveSyncConflictModal.tsx`: 충돌 다이얼로그 패턴 참고 가능
- `driveSyncRepository.getLocalManifest()`: `deviceId === ''` 또는 `lastSyncedAt === ''` 로 신규 기기 감지 가능

### 1.3 Related Documents

- gap-detector 분석 §10.2 (2026-04-26 분석 세션)
- `src/adapters/components/common/DriveSyncConflictModal.tsx` — 충돌 다이얼로그 구현 참고
- Plan: `docs/01-plan/features/realtime-wall-management.plan.md` — 독립 진행 가능한 병렬 feature
- 의존 Plan: `sync-registry-refactor` (미작성) — 먼저 완료되면 모달 내 "어떤 도메인이 동기화되는지" 명시가 용이해짐

---

## 2. Scope

### 2.1 In Scope

- [x] 신규 기기(manifest 부재) 감지 로직
- [x] `FirstSyncConfirmModal.tsx` 신규 컴포넌트 (download-only / upload-only / defer 3선택)
- [x] `App.tsx` autoSyncOnStart useEffect — manifest 부재 시 모달 노출 분기
- [x] `BackupCard.tsx` — autoSync 토글 ON 시 동일 모달 노출
- [x] `useDriveSyncStore.ts` — `firstSyncRequired` 상태 + 결정 액션 추가
- [x] `Settings.ts` 도메인 엔티티 — `sync.firstSyncDeferred` 플래그 추가
- [x] "나중에" 선택 시 Settings 배너 알림 (autoSync 비활성화 안내)
- [x] vitest 통합 테스트 (각 선택지 동작 검증)

### 2.2 Out of Scope

- 부분 머지 / 필드별 선택 병합 (단순 download-only / upload-only / defer 3선택으로 한정)
- 자동 머지 전략 (충돌 감지는 기존 `DriveSyncConflictModal` / `ResolveSyncConflict`가 담당)
- iOS / Android 모바일 동일 UX 적용 (추후 별도 검토, §9.1 위험 참고)
- 클라우드 백업 자동 생성 ("덮어쓰기" 선택 전 백업 여부는 v2에서 검토)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | 요구사항 | 우선순위 | 상태 |
|----|----------|----------|------|
| FR-01 | 앱 마운트 시 `getLocalManifest()`로 manifest 부재(`deviceId === ''` 또는 `lastSyncedAt === ''`) 감지 | Must | Pending |
| FR-02 | manifest 부재 + autoSync 활성화 상태일 때 syncFromCloud/syncToCloud 실행 전 `FirstSyncConfirmModal` 노출 | Must | Pending |
| FR-03 | "클라우드 데이터 받기" 선택 → `syncFromCloud`만 실행, `syncToCloud` 차단 | Must | Pending |
| FR-04 | "이 기기로 덮어쓰기" 선택 → 2차 경고 confirm 표시 후 `syncToCloud` 실행 | Must | Pending |
| FR-05 | "나중에 결정" 선택 → autoSync 토글 일시 비활성화 + `firstSyncDeferred: true` 저장 | Must | Pending |
| FR-06 | `firstSyncDeferred: true` 상태에서 다음 앱 실행 시 모달 재노출 (사용자가 명시적 결정 전까지) | Must | Pending |
| FR-07 | Settings 페이지 진입 시 `firstSyncDeferred: true`이면 안내 배너 표시 ("동기화 방향을 아직 결정하지 않았어요") | Should | Pending |
| FR-08 | `BackupCard`에서 autoSync 토글 ON 시 manifest 부재 여부 동일 검사 → 모달 노출 | Must | Pending |
| FR-09 | 기존 사용자(manifest 존재) 시나리오에서 모달 미노출 — 회귀 없음 | Must | Pending |
| FR-10 | 모달 노출 중 백그라운드 syncFromCloud / syncToCloud 차단 (경쟁 조건 방지) | Must | Pending |

### 3.2 Non-Functional Requirements

| 분류 | 기준 | 측정 방법 |
|------|------|-----------|
| 안전성 | "덮어쓰기" 선택 전 2차 경고로 오조작 방지 | 수동 검증 + vitest |
| 성능 | manifest 부재 감지 → 모달 노출까지 50ms 이내 | 개발자 도구 타이밍 |
| 접근성 | WCAG 2.1 AA — focus-trap 적용, 키보드 탐색 가능 | DriveSyncConflictModal 패턴 동일 적용 |
| 아키텍처 | domain/ 레이어 순수성 유지 (React/Zustand import 금지) | `npx tsc --noEmit` 에러 0개 |
| 일관성 | 기존 `DriveSyncConflictModal` 디자인 톤 동일 적용 | 코드 리뷰 |

---

## 4. 사용자 시나리오 (User Stories)

### US-1: 신규 기기 — 클라우드 데이터 받기
**As** 신규 데스크톱에 쌤핀을 설치한 교사,  
**I want** 첫 실행 시 클라우드 데이터를 내려받는 선택지를 제공받고 싶고,  
**So that** 기존 기기에서 작업한 데이터를 그대로 가져올 수 있다.

**Acceptance Criteria**:
- autoSyncOnStart = true 상태에서 manifest 부재 감지 → 모달 노출
- "클라우드 데이터 받기" 선택 → syncFromCloud 실행, syncToCloud 실행 안 됨
- 완료 후 manifest 생성, 이후 실행에서 모달 미노출

### US-2: 신규 기기 — 이 기기 데이터로 덮어쓰기
**As** 클라우드에 있는 데이터를 버리고 현재 기기를 기준으로 쓰려는 교사,  
**I want** 명확한 경고 후 클라우드를 덮어쓸 수 있고,  
**So that** 새 기기를 마스터 기기로 설정할 수 있다.

**Acceptance Criteria**:
- "이 기기로 덮어쓰기" 선택 → "클라우드의 모든 데이터가 삭제됩니다" 2차 confirm 표시
- 확인 후 syncToCloud 실행
- 취소 시 모달 원상 복귀

### US-3: 나중에 결정
**As** 지금 바로 결정하기 어려운 교사,  
**I want** 동기화 결정을 미루고 싶고,  
**So that** Settings에서 충분히 검토한 뒤 선택할 수 있다.

**Acceptance Criteria**:
- "나중에 결정" 선택 → autoSync 토글 OFF, `firstSyncDeferred: true` 저장
- 다음 앱 실행 시 모달 재노출
- Settings 진입 시 "동기화 방향을 아직 결정하지 않았어요" 배너 표시

### US-4: autoSync 토글 재활성화
**As** 이전에 "나중에 결정"을 선택하고 Settings에서 autoSync를 다시 켜는 교사,  
**I want** 토글 ON 시 동일한 확인 다이얼로그가 나타나고,  
**So that** 토글을 켜는 것만으로 위험한 동기화가 발생하지 않는다.

**Acceptance Criteria**:
- BackupCard에서 autoSync 토글 ON → manifest 부재이면 모달 노출
- 모달 흐름은 US-1/US-2/US-3와 동일

---

## 5. 기술 접근

### 5.1 감지 시점

| 위치 | 감지 조건 | 처리 |
|------|-----------|------|
| `App.tsx` — autoSyncOnStart useEffect | `autoSyncOnStart === true && manifest.deviceId === ''` | 모달 노출, 동기화 차단 |
| `BackupCard.tsx` — autoSync 토글 핸들러 | 토글 ON + `manifest.deviceId === ''` | 모달 노출 |

### 5.2 신규 파일

| 파일 | 역할 |
|------|------|
| `src/adapters/components/common/FirstSyncConfirmModal.tsx` | 3선택 다이얼로그 (DriveSyncConflictModal 패턴 모방) |

### 5.3 수정 파일

| 파일 | 변경 내용 |
|------|-----------|
| `src/App.tsx` | autoSyncOnStart useEffect — manifest 부재 감지 → 모달 노출 분기, 동기화 실행 조건 추가 |
| `src/adapters/stores/useDriveSyncStore.ts` | `firstSyncRequired: boolean` 상태 + `setFirstSyncDecision(decision)` 액션 추가 |
| `src/adapters/components/Settings/google/BackupCard.tsx` | autoSync 토글 ON 핸들러 — manifest 부재 시 모달 노출 |
| `src/domain/entities/Settings.ts` | `sync.firstSyncDeferred: boolean` 필드 추가 (기본값 `false`) |

### 5.4 상태 흐름

```
앱 마운트
  └─ autoSyncOnStart = true?
       └─ manifest.deviceId === ''?
            Yes → firstSyncRequired = true → FirstSyncConfirmModal 노출
                    ├─ "클라우드 받기"  → syncFromCloud() → firstSyncRequired = false
                    ├─ "덮어쓰기"      → 2차 confirm → syncToCloud() → firstSyncRequired = false
                    └─ "나중에"        → autoSync OFF, firstSyncDeferred = true → 모달 닫기
            No  → 기존 동기화 플로우 그대로
```

### 5.5 아키텍처 적합성

- `FirstSyncConfirmModal`은 `adapters/components/common/` — Clean Architecture 준수
- `firstSyncDeferred` 플래그는 `domain/entities/Settings.ts` — 도메인 엔티티 확장 (외부 의존 없음)
- `useDriveSyncStore` 추가 상태는 `adapters/stores/` — 올바른 레이어

---

## 6. 영향 파일 (예상)

```
src/
├── adapters/
│   ├── components/
│   │   ├── common/
│   │   │   └── FirstSyncConfirmModal.tsx          [신규]
│   │   └── Settings/
│   │       └── google/
│   │           └── BackupCard.tsx                  [수정] 토글 ON 핸들러
│   └── stores/
│       └── useDriveSyncStore.ts                    [수정] firstSyncRequired 상태
├── domain/
│   └── entities/
│       └── Settings.ts                             [수정] sync.firstSyncDeferred 필드
└── App.tsx                                         [수정] autoSyncOnStart 분기
```

---

## 7. 의존성 / 종속성

### 7.1 독립성

이 feature는 다른 진행 중인 PDCA(realtime-wall-management, ssampin-note 등)와 **완전히 독립적**으로 진행 가능하다. 공유 파일 충돌 없음.

### 7.2 sync-registry-refactor와의 관계 (소프트 종속)

| 시나리오 | 영향 |
|----------|------|
| sync-registry-refactor **이후** 진행 | SYNC_FILES enumeration이 정리되어, 모달 내 "시간표·학생기록 등 X개 도메인이 동기화됩니다" 항목 명시가 용이해짐 |
| sync-registry-refactor **이전** 진행 | 모달 본문에서 도메인 목록 생략 또는 하드코딩 — 기능 동작에는 지장 없음 |

**권장**: sync-registry-refactor를 먼저 진행하면 UX 완성도가 높아지지만, P1 위험 해소를 위해 먼저 진행해도 무방하다.

---

## 8. 성공 기준

### 8.1 Definition of Done

- [ ] FR-01 ~ FR-10 전 항목 구현
- [ ] vitest 통합 테스트 — manifest 부재 시뮬레이션, 각 선택지(download / upload / defer) 동작 검증
- [ ] 기존 사용자(manifest 존재) 시나리오 회귀 없음 검증
- [ ] `npx tsc --noEmit` 에러 0개
- [ ] 코드 리뷰 완료

### 8.2 Quality Criteria

- [ ] 테스트 커버리지 — FirstSyncConfirmModal, useDriveSyncStore 신규 코드 80% 이상
- [ ] lint 에러 0개
- [ ] 빌드(`npm run build`) 성공

### 8.3 검증 시나리오

| 시나리오 | 기대 결과 |
|----------|-----------|
| manifest 없는 상태로 앱 실행 + autoSyncOnStart = true | 모달 노출, 동기화 차단 |
| "클라우드 받기" 선택 | syncFromCloud만 실행, syncToCloud 실행 안 됨 |
| "덮어쓰기" 선택 → 2차 취소 | syncToCloud 실행 안 됨, 모달 유지 |
| "덮어쓰기" 선택 → 2차 확인 | syncToCloud 실행 |
| "나중에" 선택 후 앱 재시작 | 모달 재노출 |
| "나중에" 선택 후 Settings 진입 | 배너 표시 |
| manifest 있는 기존 사용자 실행 | 모달 미노출, 기존 동기화 그대로 |
| BackupCard autoSync 토글 ON (manifest 없음) | 모달 노출 |
| BackupCard autoSync 토글 ON (manifest 있음) | 모달 미노출, 기존 동작 그대로 |

---

## 9. 위험 및 미해결 질문

| 위험 | 영향 | 가능성 | 완화 방안 |
|------|------|--------|-----------|
| 모달 노출 중 백그라운드 syncFromCloud 경쟁 조건 | High — 다운로드가 완료된 후 "나중에"를 선택하면 이미 동기화된 상태 | Medium | 모달 노출 즉시 sync 큐 일시정지 플래그 설정 (`syncLocked: true`) |
| iOS/Android 모바일에서도 같은 UX 필요 여부 | Medium | Medium | `useMobileDriveSyncStore` 별도 검토 — 이 Plan의 Out of Scope로 분리 |
| "덮어쓰기" 선택 전 클라우드 백업 자동 생성 필요 여부 | High — 사용자 실수로 클라우드 영구 유실 가능 | Low | v2 범위로 defer (2차 경고 confirm으로 1차 보호) |
| `sync.firstSyncDeferred` 필드가 도메인 Settings 엔티티 비대화 유발 | Low | Low | 동기화 관련 설정을 별도 `SyncSettings` 서브 엔티티로 분리 검토 |

### 9.1 미해결 질문

1. 모달 노출 중 백그라운드 syncFromCloud 차단 메커니즘 — `useDriveSyncStore`에 `syncLocked` 플래그 추가 vs. useEffect 의존성 배열로 처리?
2. "덮어쓰기" 선택 시 클라우드 자동 백업을 먼저 생성할지 여부 (안전 장치 강화 vs. 복잡도 증가 트레이드오프)
3. 모바일 앱(`useMobileDriveSyncStore`)에도 동일 확인 UX를 이 이터레이션에서 함께 적용할지?

---

## 10. 우선순위 / 일정

| 항목 | 내용 |
|------|------|
| **Priority** | P1 — 데이터 유실 위험 직결 |
| **Estimated Effort** | 1~2일 |
| **Target Version** | v1.12.x |
| **Dependencies** | 없음 (독립 진행 가능) |
| **Recommended Order** | sync-registry-refactor → first-sync-confirmation 순서가 UX 완성도 측면에서 이상적이나, P1 위험이므로 먼저 진행 가능 |

---

## 11. Architecture Considerations

### 11.1 Project Level

**Enterprise** — 쌤핀은 Clean Architecture 4-레이어 구조를 엄격히 유지한다. 이 feature도 동일 규칙을 따른다.

### 11.2 Key Architectural Decisions

| 결정 | 선택 | 근거 |
|------|------|------|
| 상태 관리 | Zustand (`useDriveSyncStore` 확장) | 기존 동기화 상태 스토어와 일관성 유지 |
| UI 컴포넌트 위치 | `adapters/components/common/` | 기존 `DriveSyncConflictModal` 와 동일 위치 |
| 도메인 엔티티 확장 | `Settings.ts` — `sync.firstSyncDeferred` 필드 추가 | 동기화 설정의 영속성 필요, 도메인 레이어에서 관리 |
| 모달 패턴 | `DriveSyncConflictModal` 패턴 재사용 | 디자인 일관성 + focus-trap + WCAG 준수 |

### 11.3 Clean Architecture 적합성

```
FirstSyncConfirmModal (adapters/components/common/)
  └─ useDriveSyncStore (adapters/stores/)
       └─ driveSyncRepository (adapters/repositories/)
            └─ IStoragePort (domain/ports/)

Settings.ts (domain/entities/) ← firstSyncDeferred 필드 추가
  - 외부 의존 없음 (순수 TypeScript)
```

---

## 12. Convention Prerequisites

### 12.1 준수해야 할 기존 컨벤션

- [ ] TypeScript strict 모드 — `noImplicitAny`, `strictNullChecks`
- [ ] `any` 타입 사용 금지
- [ ] 함수형 컴포넌트만 사용
- [ ] 모든 UI 텍스트 한국어
- [ ] Tailwind CSS 유틸리티 클래스 사용 (인라인 스타일 지양)
- [ ] 모서리: 모달은 `rounded-xl`, 버튼은 `rounded-lg`
- [ ] 디자인 토큰: `sp-bg`, `sp-card`, `sp-border`, `sp-accent` 사용

### 12.2 환경 변수

해당 없음 — 이 feature는 신규 환경 변수를 필요로 하지 않는다.

---

## 13. Next Steps

1. [ ] Design 문서 작성 (`first-sync-confirmation.design.md`) — UI 컴포넌트 상세 설계 + 상태 다이어그램
2. [ ] CTO (team lead) 리뷰 및 승인
3. [ ] 구현 시작 — FR-01(감지 로직) → FR-02(모달 컴포넌트) → FR-03~05(선택지 핸들러) → FR-06~08(배너/재노출) 순서

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-26 | Initial draft (gap-detector §10.2 기반) | pblsketch |
