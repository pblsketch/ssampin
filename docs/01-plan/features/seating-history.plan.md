# Plan — 자리배치 3대 신규 기능

- **작성일**: 2026-05-20
- **우선순위**: 🟡 P2 (사용자 요청 기능)
- **트리거**: 사용자 직접 요청 (자리배치 운영 편의성 + 수업 활용도 향상)
- **영향 버전**: v2.1.0+ (신규 기능 묶음)

---

## 1. 기능 개요

쌤핀의 핵심 도구인 "자리배치"에 교사 수업 활용도를 높이는 신규 기능 3종을 추가한다.

| #   | 기능                   | 한 줄 요약                                                                    |
| --- | ---------------------- | ----------------------------------------------------------------------------- |
| 1   | **자리배치 히스토리**  | 이전 자리 배치를 저장·복원·비교, 셔플 시 자동 스냅샷, "이전 자리 피하기" 옵션 |
| 2   | **이름 학습 모드**     | 자리 그리드 위에서 학생 이름을 가리고 카드 플립으로 익히는 전체화면 모드      |
| 3   | **우연을 가장한 배치** | 교사가 미리 설정한 배치를 "랜덤 셔플" 애니메이션으로 위장해 결과 표시         |

---

## 2. 사용자 가치

### 기능 1: 자리배치 히스토리

- "지난 주랑 똑같이 앉히지 말아줘" 요청 충족 — 학생 만족도 향상
- 교사 실수(잘못 셔플) 즉시 복구 — 학생 항의 차단
- "그 때 그 배치 어땠지?" — 과거 배치 회상 가능

### 기능 2: 이름 학습 모드

- 신학기 첫 주, 새 학급 학생 이름 빠르게 외우기
- 동료 교사·교생 실습생의 학급 파악 보조
- 학기 중 명단 정리(전·입학) 후 재학습

### 기능 3: 우연을 가장한 배치

- 교실 운영 시나리오 — 특정 학생 분리, 짝꿍 조합 사전 설계를 자연스럽게 적용
- "내가 정한 거 아니야, 랜덤이야"라는 학생 수용성 확보
- 교사 의도와 학생 인식 사이의 거리감 조절

---

## 3. 우선순위와 분할

검증 결과(2026-05-20 design-validator 보고서)에 따라 **3-Phase로 분할**한다.

### Phase 1 — 자리배치 히스토리 (저장/복원/UI)

- 위험도: 🟢 낮음 — 도메인 규칙 변경 없음, 신규 엔티티/리포지토리만 추가
- 범위:
  - `SeatingSnapshot` 엔티티 + `ISeatingSnapshotRepository` 추가
  - 셔플 후 자동 스냅샷, 수동 저장, 복원, 삭제, 미니 프리뷰
  - `SeatingHistoryPanel` 사이드 패널
  - 비교 모드(`SnapshotDiffView`)

### Phase 2 — "이전 자리 피하기" 알고리즘

- 위험도: 🟡 중간 — `seatRules.ts` 시그니처 변경, 호출처 동시 수정
- 범위:
  - `shuffleSeatsWithConstraints` 7번째 인자 `avoidHistory` 추가
  - `RandomizeSeats` UseCase에 `ISeatingSnapshotRepository` 주입
  - 3단계 fallback에 통합 (가장 약한 제약)
  - unit test 10건+ 추가

### Phase 3 — 이름 학습 모드 + 우연을 가장한 배치 (병렬 가능)

- 위험도: 🟢 낮음 — Phase 1 인프라 활용, 독립적 UI
- 범위:
  - `NameLearningMode` 전체화면 오버레이 + `LearningCard` 플립
  - `ISeatingRepository`에 `getPreset/savePreset/clearPreset` 추가
  - `useSeatingStore`에 `presetArrangement` + `randomizeWithPreset` 추가
  - 학생/프로젝터 모드 보안 가드

---

## 4. Phase 1 상세 (이 PDCA의 1차 목표)

### 4.1 작업 항목

| #   | 파일                                                             | 작업                                                                               |
| --- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | `src/domain/entities/SeatingSnapshot.ts`                         | 신규 — 엔티티 정의                                                                 |
| 2   | `src/domain/repositories/ISeatingSnapshotRepository.ts`          | 신규 — 인터페이스 4개 메서드                                                       |
| 3   | `src/adapters/repositories/JsonSeatingSnapshotRepository.ts`     | 신규 — 스토리지 키 `seating-snapshots`, 최대 50개 보관                             |
| 4   | `src/adapters/di/container.ts`                                   | `seatingSnapshotRepository` 등록                                                   |
| 5   | `src/adapters/stores/useSeatingStore.ts`                         | snapshots/snapshotsLoaded state + loadSnapshots/saveCurrent/restore/delete actions |
| 6   | `src/adapters/components/Seating/SeatingHistoryPanel.tsx`        | 신규 — 사이드 패널                                                                 |
| 7   | `src/adapters/components/Seating/SnapshotPreviewGrid.tsx`        | 신규 — 가변 그리드 미니 프리뷰                                                     |
| 8   | `src/adapters/components/Seating/SnapshotDiffView.tsx`           | 신규 — 비교 뷰                                                                     |
| 9   | `src/adapters/components/Seating/Seating.tsx`                    | 툴바에 🕐 히스토리 버튼 추가                                                       |
| 10  | `src/domain/rules/seatRules.test.ts`                             | 스냅샷 라벨 포맷·정렬 테스트 (해당 시)                                             |
| 11  | `src/adapters/stores/__tests__/useSeatingStore.snapshot.test.ts` | 신규 — 자동/수동 저장, 복원 시 sanitize 통합 검증                                  |

### 4.2 도메인 규칙 준수 체크

- ✅ `SeatingSnapshot` 엔티티는 외부 import 0 (CLAUDE.md 원칙 1)
- ✅ ID 생성은 `crypto.randomUUID()` 또는 `${Date.now()}-${counter}` (외부 라이브러리 nanoid 도입 금지)
- ✅ `ISeatingSnapshotRepository`는 `domain/`에, 구현은 `adapters/`에 (Clean Architecture)
- ✅ `useSeatingStore`는 기존 패턴(`seatingRepository` 직접 사용) 유지
- ✅ 자동 라벨 포맷은 빌트인 `Intl.DateTimeFormat('ko-KR')` (외부 date-fns 등 금지)
- ✅ 모든 UI 텍스트 한국어 (CLAUDE.md 원칙 4)
- ✅ UI 스타일은 `sp-*` 토큰만 사용 (design-system.md)

### 4.3 회귀 방지

- 셔플 후 자동 스냅샷 — 기존 `randomize()` 동작에 영향 없음, 실패해도 셔플 자체는 성공
- 복원 시 `sanitizeSeating`을 거쳐 졸업/전학 학생 ID 좀비 방지
- 스냅샷 최대 50개 초과 시 가장 오래된 것 자동 삭제 (스토리지 무한 증가 방지)
- 기존 사용자 데이터 마이그레이션 불필요 — 신규 스토리지 키만 추가

### 4.4 검증 게이트 (Phase 1 완료 조건)

```bash
npx tsc --noEmit              # 0 errors
npm run lint                  # 0 errors
npm run test                  # 신규 테스트 포함 전체 통과
npm run regression-check      # 통과
```

추가 수동 검증:

1. 셔플 후 히스토리 패널에 새 스냅샷이 자동 추가됨
2. 복원 클릭 시 좌석이 정확히 되돌아옴
3. 졸업/전학 처리한 학생이 있는 과거 스냅샷 복원 시 좀비 ID 미발생
4. 51번째 스냅샷 저장 시 가장 오래된 것 삭제됨
5. 비교 모드에서 이동한 학생만 하이라이트

---

## 5. 위험 요소 및 대응

| 위험                                              | 영향                | 대응                                                                                            |
| ------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------- |
| 다른 세션에서 자리배치 관련 파일 수정 중          | 충돌                | 작업 시작 시 `git status --short` 확인. 현재(2026-05-20 시점) 자리배치 영역 다른 세션 작업 없음 |
| `useSeatingStore` state 추가로 기존 selector 영향 | 회귀                | 신규 state는 모두 optional 또는 별도 영역. 기존 `seating`/`past`/`future`/`isEditing` 미변경    |
| 스냅샷 JSON 크기 증가                             | 디스크 사용량       | 스냅샷 1개 ≈ 1KB × 50개 = 50KB. LocalStorage 5MB 한도 대비 1% 미만 — 안전                       |
| Phase 2(이전 자리 피하기) 알고리즘 복잡도         | 셔플 성능 저하      | 기존 maxAttempts=200 유지, 비교 비용 O(N × history_count) 무시 가능                             |
| 모바일에 자리배치 화면 없음                       | 모바일 UX 누락 우려 | 모바일은 out of scope 명시. `src/mobile/`에 자리배치 관련 컴포넌트 0개 확인 완료                |

---

## 6. 다음 단계

1. **이 Plan 승인** → 사용자 확인
2. **Design v0.2 작성** ([seating-history.design.md](../../02-design/features/seating-history.design.md))
3. **Phase 1 구현** — `ssampin-develop` 에이전트 또는 직접 구현
4. **검증 게이트 4단계 통과**
5. **Phase 1 분석 보고** → Phase 2 진행 여부 결정

---

## 7. 참고 문서

- 검증 보고서: 2026-05-20 design-validator 결과 (대화 기록)
- 도메인 규칙: `docs/architecture-rules.md`, `docs/coding-conventions.md`, `docs/design-system.md`
- 관련 코드: `src/domain/rules/seatRules.ts:326-549`, `src/adapters/stores/useSeatingStore.ts:48-244`
