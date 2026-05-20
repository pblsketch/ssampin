# Plan — 자유 배치 모드 (freestyle seating)

- **작성일**: 2026-05-20
- **우선순위**: 🟡 P2 (사용자 요청 신규 기능)
- **트리거**: 사용자 직접 설계서 제출 (`자유 형태 책상 배치 에디터 설계서`)
- **영향 버전**: v2.1.0+ (신규 기능)
- **UI 라벨**: 「자유 배치」 (한국어 그대로)
- **내부 코드명**: `freestyle` (`seatingLayout: 'freestyle'`, `FreestyleDesk`, `freestyleDesks`)

> ⚠️ **이름 충돌 회피**: 기존 [`electron/ipc/realtimeWall.ts`](../../../electron/ipc/realtimeWall.ts)의 `layoutMode: 'freeform'` (담벼락 자유 위치)과 검색·자동완성·코드 리뷰 시 헷갈리지 않도록 `freestyle`로 명명한다. 사용자가 보는 UI 라벨은 한국어 「자유 배치」로 통일.

---

## 1. 기능 개요

쌤핀의 자리배치 도구는 현재 `seats[row][col]` 2D 배열 기반의 **직사각형 그리드(grid)**와 **모둠(group)** 2가지 레이아웃만 지원한다. 실제 한국 교실에서는 ㄷ자형, 모둠형, 원형, 짝꿍 마주보기 같은 다양한 배치가 사용되며, 학습 목적(강의/토론/협력/시험)에 따라 빠른 전환이 필요하다는 교육학적 합의가 있다.

**「자유 배치」 모드**를 추가해, 프리셋 템플릿으로 시작점을 제공하고 드래그로 자유 조정할 수 있게 한다.

| 항목            | 그리드(grid)      | 모둠(group)                | **자유(freestyle, 신규)**            |
| --------------- | ----------------- | -------------------------- | ------------------------------------ |
| 좌표 모델       | `seats[row][col]` | 모둠 칩 목록               | `freestyleDesks[]` (정규화 x,y)      |
| 책상 위치       | 행/열 격자 고정   | 모둠별 자동 정렬           | 0~1000 정규화 좌표, 자유             |
| 회전            | 없음              | 없음                       | 0~360° 지원 (원형 등)                |
| 셔플            | row-major         | 모둠별 라운드로빈          | 책상 고정, 학생만                    |
| 출력 PDF        | 정식 지원         | best-effort (현 코드 한계) | Phase 3+ 정식 지원, Phase 1은 가드만 |
| 출력 Excel/HWPX | 정식 지원         | 정식 지원                  | **영구 미지원 + 안내 메시지**        |
| 자리뽑기 도구   | 지원              | 지원                       | **비활성 (안내 메시지)**             |

> ℹ️ 현재 [`SeatingPdf.ts`](../../../src/infrastructure/export/pdf/SeatingPdf.ts)는 `seats[][]` 기반 grid/pair 모드만 그리며 group 모드는 row-major로 흘려보내는 잠재 버그가 있다. **본 PDCA에서는 freestyle 가드만 추가하고 group 모드 PDF 거동 수정은 별도 PDCA로 분리** (Out of Scope).

---

## 2. 사용자 가치

### 현장 조사 결과 (10개교 60개 학급)

| 배치 유형             | 현장 사용률 | 기존 지원 | 신규 지원                            |
| --------------------- | ----------- | --------- | ------------------------------------ |
| 일제식 (전통 줄배치)  | 87%         | ✅ grid   | ✅ freestyle 프리셋                  |
| 모둠형 (클러스터)     | 8%          | ✅ group  | ✅ freestyle 프리셋 (가변 모둠 인원) |
| ㄷ자형 (U-Shape)      | 3-4%        | ❌        | ✅ freestyle 프리셋                  |
| 짝꿍/찬반토론/원형 등 | 1-2%        | ❌        | ✅ freestyle 프리셋                  |

### 교사 가치

- **토론·발표 수업**: ㄷ자형, 찬반토론, 원형 배치 즉시 적용 가능
- **시험 대형 빠른 전환**: 시험일에 임시 "시험 대형" 프리셋 → 끝나면 원래 배치 복원
- **활동 중심 수업**: 모둠 인원 가변(3/4/5/6 혼합) 자동 생성
- **수업 운영 다양성**: 교육학 연구의 "단일 최적 배치 없음, 목표별 전환" 권고 실현

---

## 3. 우선순위와 분할

검증(이전 단계 사용자 피드백)에 따라 **6-Phase로 분할**한다. Phase 1만 이 PDCA의 1차 목표로 잡고, 이후 Phase는 별도 PDCA 사이클로 진행한다.

### Phase 1 — 데이터 모델 + 호환 인프라 (이 PDCA 범위) 🟢 위험도 낮음

- `FreestyleDesk` 엔티티 + `SeatingData.freestyleDesks?` 필드 추가
- `SeatingLayout`에 `'freestyle'` 추가
- 저장/로드 + **스냅샷 깊은 사본 확장** + **`sanitizeSeating` freestyle 분기**
- 기존 grid/group 동작 회귀 0건 보장 (메타 테스트)
- 자리뽑기·PDF·엑셀·한글 출력의 freestyle 가드 (안내 메시지 표시)
- ⛔ 신규 UI 모드/프리셋/렌더링 일체 없음 (그릇만 준비)

### Phase 2 — 프리셋 좌표 생성 알고리즘 🟢 위험도 낮음

- Tier 1 프리셋 3개 (일제식, 모둠형, ㄷ자형)
- 학생 수 8~40명 범위 대응, 모둠 인원 가변(3/4/5/6 혼합)
- 일제식 열 수 4~7열 자유 선택
- 도메인 레이어 순수 함수 + unit test

### Phase 3 — 렌더링 (`FreestyleSeatingView`) 🟡 위험도 중간

- CSS absolute positioning + 정규화 좌표 변환
- 컨테이너 고정 종횡비(권장 4:3) 강제 → 모바일 세로/데스크톱 가로 비율 차이 흡수
- 교탁 위치 표시, 기존 `SeatCard` 디자인 재활용
- ⛔ 인터랙션(드래그/추가/삭제)은 Phase 4
- 🤝 **Phase 3 착수 전 `frontend-design` 에이전트 공동 설계 필수** (메모리 정책 [feedback_frontend_agent_collaboration](#)): 디자인·UI·UX 단독 진행 금지

### Phase 4 — 에디터 인터랙션 🟡 위험도 중간

- 책상 드래그 이동, 추가/삭제, 학생 배정 (드래그 swap)
- 모둠 인원 변경 UI
- undo/redo 통합

### Phase 5 — 셔플 & 제약조건 마이그레이션 🟠 위험도 높음

- freestyle용 셔플 (책상 위치 고정, 학생만 Fisher-Yates)
- 4종 제약조건 변환:
  - 고정좌석(`FixedSeatConstraint {row,col}`) → `deskId` 기반으로 자동 매핑 + 사용자 확인 토스트
  - 영역(`ZoneConstraint`) → 정규화 좌표 박스(예: `front1 = {y<200}`)로 변환
  - 분리/인접(맨해튼 거리) → 유클리드 거리 변환 공식 명시
  - 변환 불가능한 제약은 비활성 보존 (그리드 복귀 시 자동 복원)

### Phase 6 — Tier 2 + Tier 3 프리셋 확장 🟢 위험도 낮음

- ✅ **Phase 6에서 한 번에 만들지 말 것**: Tier 2/3는 현장 사용률 1-2% 또는 0%에 가까움
- Phase 1~5 출시 후 **사용자 피드백 기반으로 우선순위 재산정**한 뒤 진행

---

## 4. Phase 1 상세 (이 PDCA의 1차 목표)

### 4.1 작업 항목

| #   | 파일                                                                | 작업                                                                                                          |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1   | `src/domain/entities/Seating.ts`                                    | `SeatingLayout` 에 `'freestyle'` 추가, `SeatingData.freestyleDesks?` 추가, `FreestyleDesk` interface 신규     |
| 2   | `src/domain/rules/freestyleRules.ts`                                | 신규 — `sanitizeFreestyleDesks` 외 freestyle 전용 순수 함수 격리 (기존 `seatRules.ts` 부풀림 방지)            |
| 3   | `src/adapters/stores/useSeatingStore.ts`                            | `sanitizeSeating` 확장 (freestyle 분기), `saveCurrentAsSnapshot` 확장 (`freestyleDesks` 깊은 사본)            |
| 4   | `src/adapters/repositories/JsonSeatingRepository.ts`                | 마이그레이션 보장 — `freestyleDesks` 없는 기존 데이터는 그대로 로드 (optional 필드)                           |
| 5   | `src/adapters/components/Tools/ToolSeatPicker.tsx`                  | freestyle 모드 진입 시 "자유 배치에서는 사용 불가, 그리드 모드로 전환해 주세요" 안내 + 도구 비활성            |
| 6   | `src/infrastructure/export/pdf/SeatingPdf.ts`                       | freestyle 모드 진입 시 "PDF는 다음 Phase에 지원 예정" 임시 가드 (Phase 3 이후 정식 지원)                      |
| 7   | `src/infrastructure/export/ExcelExporter.ts`                        | freestyle 모드 진입 시 "자유 배치는 PDF로 출력해 주세요" 메시지 + 시트 생성 스킵                              |
| 8   | `src/infrastructure/export/HwpxExporter.ts`                         | 동일 — 자유 배치는 HWPX 미지원 안내                                                                           |
| 9   | `src/domain/rules/freestyleRules.test.ts`                           | 신규 — `sanitizeFreestyleDesks` 졸업/전학생 좀비 제거 검증                                                    |
| 10  | `src/adapters/stores/__tests__/useSeatingStore.snapshot.test.ts`    | 스냅샷 저장 시 `freestyleDesks` 깊은 사본 보장 메타 테스트 추가                                               |
| 11  | `src/adapters/stores/__tests__/useSeatingStore.freestyle.test.ts`   | 신규 — freestyle 필드가 있는 SeatingData 로드/저장 라운드트립                                                 |
| 12  | `src/adapters/repositories/__tests__/JsonSeatingRepository.test.ts` | 추가 — `freestyleDesks` 미주입 회귀 메타 테스트 (작업 #4 자체는 변경 없음, 테스트만 추가)                     |
| 13  | `src/adapters/components/ClassManagement/ClassSeatingTab.tsx`       | 호출처 확인 — `exportSeatingToExcel/Hwpx` 가드 자동 커버 검증, 수동 검증 시나리오에 ClassSeatingTab 경로 포함 |

### 4.2 도메인 규칙 준수 체크 (CLAUDE.md)

- ✅ `FreestyleDesk` 엔티티는 외부 import 0건 (원칙 1)
- ✅ `freestyleDesks[].id` 생성은 `crypto.randomUUID()` 또는 `${Date.now()}-${counter}` (nanoid 금지)
- ✅ `freestyleRules.ts`는 `domain/` 레이어 — 외부 의존성 0건
- ✅ `any` 금지, 모든 필드 `readonly`
- ✅ 모든 UI 텍스트 한국어 (원칙 4)
- ✅ UI 스타일은 `sp-*` 토큰만 사용 (Phase 3 이후 적용)

### 4.3 회귀 방지 (P0 — 이미 잘 동작하는 grid/group 깨뜨리지 않기)

- 🛡️ **메타 테스트 — `freestyleDesks` 없는 SeatingData 라운드트립**: 기존 저장 데이터를 로드→저장→로드 했을 때 `freestyleDesks` 필드가 임의 추가되지 않음
- 🛡️ **메타 테스트 — 스냅샷 깊은 사본**: 스냅샷 저장 후 원본 `freestyleDesks[0].x = 999` 변경해도 스냅샷 안의 값은 불변
- 🛡️ **메타 테스트 — `sanitizeSeating` freestyle 분기**: 졸업/전학 학생 ID가 `freestyleDesks[].studentId`에 남지 않음
- 🛡️ **회귀 — 자리뽑기 도구 grid 모드 동작 불변**: 기존 자리뽑기 시나리오(homeroom/teachingClass, 사전 배정) 4단계 통합 테스트 통과
- 🛡️ **회귀 — PDF/Excel/HWPX 출력 grid/group 모드 동작 불변**: 기존 출력 결과 바이트 비교 (스냅샷 테스트)
- 🛡️ `npm run regression-check` 통과

### 4.4 검증 게이트 (Phase 1 완료 조건)

```bash
# 1단계: 구문 검증
npx tsc --noEmit              # 0 errors

# 2단계: 코드 품질
npm run lint                   # 0 errors

# 3단계: 테스트
npm run test                   # 신규 테스트 포함 전체 통과 (baseline 1304 + 신규 ~15)

# 4단계: 회귀 방지
npm run regression-check       # 9/9 통과
```

추가 수동 검증:

1. 기존 grid 모드 사용자가 앱을 켰을 때 데이터 변화 0 (저장 파일 byte 비교)
2. freestyle 모드로 임의 전환→그리드 복귀 시 grid 데이터 손실 0
3. 자리뽑기 도구 진입 시 freestyle 모드면 안내 메시지 + 버튼 비활성
4. PDF 내보내기 시 freestyle 모드면 "Phase 3에서 지원 예정" 안내
5. 엑셀/한글 내보내기 시 freestyle 모드면 "PDF로 출력해 주세요" 안내 + 작업 스킵

---

## 5. 위험 요소 및 대응

| 위험                                                                | 영향                                                          | 대응                                                                                               |
| ------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `freeform`이라는 동명 개념이 담벼락(realtime-wall)에서 활성 사용 중 | 검색·자동완성·코드 리뷰 혼동, 다른 AI 세션이 잘못 수정할 위험 | **내부 코드명을 `freestyle`로 통일** — 사용자 UI는 한국어 「자유 배치」                            |
| `useSeatingStore.saveCurrentAsSnapshot`의 깊은 사본 누락            | 스냅샷 복원 후 책상 위치 망가짐 (참조 공유 회귀)              | Phase 1 작업 #3 + 메타 테스트로 차단                                                               |
| `sanitizeSeating`이 freestyle 분기 안 함                            | 졸업/전학생이 `freestyleDesks`에 좀비로 남음                  | Phase 1 작업 #3 + #9 메타 테스트로 차단                                                            |
| 다른 세션이 자리배치 관련 파일 수정 중                              | 충돌                                                          | 작업 시작 시 `git status --short` 확인. NEIS Schedule 파일은 절대 안 건드림 (메모리 feedback 정책) |
| PDF/엑셀/한글 출력 미지원 영역 진입 시 사용자 혼란                  | UX                                                            | Phase 1에서 안내 메시지 + 작업 스킵 가드 의무화 (작업 #6~#8)                                       |
| 자리뽑기 도구 grid 좌표 의존                                        | freestyle에서 동작 불가                                       | Phase 1에서 "그리드 모드로 전환해 주세요" 안내 (작업 #5)                                           |
| 모바일에 자리배치 freestyle 미지원                                  | 모바일 UX 누락                                                | 모바일은 Phase 1 out of scope 명시. `src/mobile/`에서 freestyle 진입 차단                          |

---

## 6. 의사결정 기록 (이전 단계에서 사용자가 확정)

| 결정                         | 채택                                                     |
| ---------------------------- | -------------------------------------------------------- |
| 내부 코드 이름               | `freestyle`                                              |
| PDF/엑셀/한글 출력 전략      | PDF만 정식 지원 (엑셀/한글은 안내 메시지)                |
| 자리뽑기 도구 freestyle 동작 | 그리드 모드에서만 사용 가능 (안내 + 비활성)              |
| Phase 1 범위                 | 데이터 모델 + 호환 인프라만 (UI/프리셋/렌더링 일체 없음) |

---

## 7. 다음 단계

1. **이 Plan 승인** → 사용자 확인
2. **Design 작성** ([freestyle-seating.design.md](../../02-design/features/freestyle-seating.design.md))
3. **design-validator 실행** — Plan/Design 정합성 검증
4. **Phase 1 구현** → `ssampin-develop` 에이전트 또는 직접
5. **검증 게이트 4단계 통과**
6. **Phase 1 분석 보고** → Phase 2 진행 여부 결정

---

## 8. 참고 문서

- **사용자 제출 설계서**: 대화 기록(이 PDCA 시작 시점)
- **사용자 피드백 5건 (P0)**: 출력 전략, 스냅샷 호환, 이름 충돌, 자리뽑기, 제약 마이그레이션
- **도메인 규칙**: `docs/architecture-rules.md`, `docs/coding-conventions.md`, `docs/design-system.md`
- **관련 코드**:
  - `src/domain/entities/Seating.ts:1-48` (SeatingData, SeatingLayout, SeatGroup)
  - `src/domain/entities/SeatConstraints.ts:1-55` (4종 제약)
  - `src/domain/rules/seatRules.ts:326-633` (shuffle + 제약 알고리즘)
  - `src/adapters/stores/useSeatingStore.ts:56-106` (sanitizeSeating), `:615-643` (saveCurrentAsSnapshot)
  - `src/adapters/repositories/JsonSeatingRepository.ts:1-32`
  - `src/infrastructure/export/pdf/SeatingPdf.ts:1-50` (좌석 PDF 출력)
  - `src/adapters/components/Tools/ToolSeatPicker.tsx:1-60` (자리뽑기 도구)
  - `electron/ipc/realtimeWall.ts:268-294` (이름 충돌 회피 대상)
