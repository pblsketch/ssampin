# 쌤핀 모바일 리팩토링 완료 보고서 (mobile-refactor)

일자: 2026-07-03 · 대상: `src/mobile/` · 계획: `docs/01-plan/features/mobile-refactor.plan.md` · 분석: `docs/03-analysis/mobile-refactor/` 3건

## 제1원칙 준수

**모든 변경은 동작·렌더링 결과를 보존하는 순수 리팩토링**(코드 이동·파일 분리·동일 마크업 컴포넌트 추출·상수 단일화)만 수행했다. 동작이 달라질 수 있는 항목은 수정하지 않고 아래 "보류 지점"에 기록했다. 로직·마크업·문구·타이밍 값 변경 0건.

## 1. 변경 요약

### 신설 — 단일 소스로 통합 (중복 제거)

| 신규 파일                                                     | 통합한 중복                                                     | 기존 사용처                                                                                                      |
| ------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `utils/date.ts` (`todayISO`, `DAY_LABELS`, `formatDateLabel`) | 동일 날짜 함수 복사본                                           | 스토어 2 + 페이지 3 + 컴포넌트 2곳 교체. **`useMobileMealStore`의 `YYYYMMDD` 변종은 의도적으로 제외**(NEIS 포맷) |
| `utils/haptic.ts`                                             | 진동 헬퍼 2곳                                                   | SwipeRow, ClassProgressEntryItem                                                                                 |
| `components/common/ActionSheet.tsx`                           | 바이트 동일 구현 2곳                                            | ClassProgressTab, ClassObservationTab                                                                            |
| `components/common/ConfirmDialog.tsx`                         | 삭제 확인 다이얼로그 2곳 (문구는 호출부에서 현행 그대로 조립)   | ClassProgressTab, ClassObservationTab                                                                            |
| `components/common/Spinner.tsx`                               | className 완전 동일한 로딩 스피너만 교체                        | 10여 곳                                                                                                          |
| `components/common/EmptyState.tsx`                            | 빈 상태 블록 3곳 (라벨은 prop으로 현행 문구 유지)               | MemoPage, ClassProgressTab, ClassObservationTab                                                                  |
| `components/Today/AttendanceSummaryCard.tsx`                  | 거의 동일한 출결 요약 카드 2개 통합 ("전체 N명" 줄은 prop 분기) | ClassAttendanceCard·HomeroomAttendanceCard **삭제**, TodayHub 교체                                               |
| `hooks/useLongPress.ts`                                       | 롱프레스 타이머 2곳 (햅틱·fired 동작은 옵션으로 각각 보존)      | ClassProgressEntryItem, MemoPage                                                                                 |
| `version.ts` (`MOBILE_APP_VERSION`)                           | `v2.2.7` 하드코딩 2곳 → 릴리즈 시 1곳만 수정                    | MorePage, SettingsPage                                                                                           |

### 이동·개명 (네이밍 규칙 통일: 스토어는 전부 `stores/useMobileXxxStore`)

| 구                                         | 신                                             |
| ------------------------------------------ | ---------------------------------------------- |
| `components/SwipeRow/useSwipeRowStore.ts`  | `stores/useMobileSwipeRowStore.ts`             |
| `components/SwipeRow/useSwipeUndoStore.ts` | `stores/useMobileSwipeUndoStore.ts`            |
| `stores/useBottomSheetStore.ts` (+.test)   | `stores/useMobileBottomSheetStore.ts` (+.test) |

### 대형 파일 분해 (함수 경계 순수 추출 — 본문 무변경)

| 파일                                       | 전               | 후         | 분리 결과                                                                                                                                                                          |
| ------------------------------------------ | ---------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pages/StudentsPage.tsx`                   | 1,815줄          | 484줄      | `pages/students/` 9파일 (SeatingView, TeachingSeatingView, HomeroomListView, TeachingListView, StudentQuickActionSheet, AttendanceSubTab, RecordsSubTab, ContactSubTab, shared.ts) |
| `App.tsx` 도구 라우팅                      | 삼항 14분기 52줄 | 레지스트리 | `MORE_LAZY_TOOLS` 테이블 + `renderMoreSub()` — 분기 순서·props·Suspense fallback 의미 동일                                                                                         |
| `pages/TodoPage.tsx`                       | 398줄            | 102줄      | `pages/todo/` 3파일 (AddTodoModal, TodoItem, priorityConfig)                                                                                                                       |
| `pages/ToolSurveyPage.tsx`                 | 455줄            | 153줄      | `pages/survey/` 2파일 (SurveyDetail, TeacherCheckRow)                                                                                                                              |
| `components/Class/ClassObservationTab.tsx` | 486줄            | 215줄      | ObservationSheet, ObservationRecordCard 분리 + 공용 컴포넌트 사용                                                                                                                  |

### 삭제

- `components/Today/ClassAttendanceCard.tsx`, `HomeroomAttendanceCard.tsx` (AttendanceSummaryCard로 통합)
- 구 경로 스토어 3파일 (이동·개명)

### 화이트리스트 승계 2건 (코드 무변경 이사에 따른 게이트 등재)

- `eslint.config.js`: exhaustive-deps 래칫 목록에 `pages/students/AttendanceSubTab.tsx` 추가 — StudentsPage에 있던 기존 warn 위반(useMemo `records` dep)이 추출 파일로 그대로 이사한 것. 코드 수정으로 풀지 않은 이유: dep 제거는 리렌더 타이밍이 달라질 수 있어 제1원칙 위반 소지.
- `src/domain/rules/studentActivityCallSites.test.ts`: `.isVacant` UI 표시 화이트리스트에 `pages/students/` 4파일 추가 (StudentsPage의 기존 허용 사유 3을 승계).

## 2. 구조 Before / After

```
Before                                     After
src/mobile/                                src/mobile/
├── App.tsx (502, 도구 삼항 14분기)         ├── App.tsx (494, MORE_LAZY_TOOLS 레지스트리)
├── pages/                                 ├── pages/
│   ├── StudentsPage.tsx (1,815)           │   ├── StudentsPage.tsx (484)
│   ├── TodoPage.tsx (405)                 │   ├── students/ ★ (9파일 — 자리배치·명단·시트·서브탭)
│   ├── ToolSurveyPage.tsx (455)           │   ├── todo/ ★ (AddTodoModal·TodoItem·priorityConfig)
│   └── …                                  │   ├── survey/ ★ (SurveyDetail·TeacherCheckRow)
├── components/                            │   ├── TodoPage.tsx (102) · ToolSurveyPage.tsx (153) · …
│   ├── SwipeRow/ (store 2개 혼재)          ├── components/
│   ├── Today/ (출결 카드 2개 중복)          │   ├── common/ ★ ActionSheet·ConfirmDialog·Spinner·EmptyState (+기존 3종)
│   ├── Class/ (ActionSheet 등 복붙)        │   ├── Today/ AttendanceSummaryCard ★ (2카드 통합)
│   └── common/ (3종)                      │   ├── Class/ ObservationSheet·ObservationRecordCard ★ 분리
├── stores/ (useBottomSheetStore 예외)      │   └── SwipeRow/ (컴포넌트만)
├── hooks/                                 ├── stores/ — 전부 useMobileXxxStore 규칙 ★
└── styles/, di/, contexts/                ├── hooks/ +useLongPress ★
                                           ├── utils/ ★ date.ts·haptic.ts
                                           └── version.ts ★ (표시 버전 단일 소스)
```

총 규모 12,258 → 12,245줄 (중복 제거분이 분리 파일 보일러플레이트와 상쇄). 변경분: 기존 27파일 −2,713/+149, 신규 24파일.

## 3. 검증 게이트 (전부 이 세션에서 실행)

| 게이트        | 명령                        | 결과                                                       |
| ------------- | --------------------------- | ---------------------------------------------------------- |
| 타입          | `npx tsc --noEmit`          | **에러 0** (매 단계 D1~D4 후 반복 확인)                    |
| 린트          | `npm run lint`              | **에러 0** (경고 132 = 기존 부채, 리팩토링 전과 동일 성격) |
| 모바일 테스트 | `npx vitest run src/mobile` | **3파일 24개 통과** (기준선과 동일)                        |
| 전체 테스트   | `npx vitest run`            | **269파일 3,363개 통과, 10 skipped, 실패 0**               |
| 회귀 체크     | `npm run regression-check`  | **38/38 통과**                                             |

## 4. 최적화 권장사항 메모 (이번 작업에서 수행하지 않음)

성능/UX 개선 여지 — 전부 동작이 바뀌는 변경이라 별도 작업으로 분리:

1. **탭 전환 시 페이지 완전 언마운트** (App.tsx 조건부 렌더) — 스크롤·상태 소실, 재진입 시 재로딩. keep-alive 검토.
2. **TodayHub 재진입마다 6개 스토어 무조건 reload** — `loaded` 플래그 가드 가능.
3. **WeatherCard 스토어 부재** — 컴포넌트 언마운트마다 재fetch. MealCard처럼 스토어 캐시로 승격.
4. **CurrentClassCard 매 분 틱마다 DayScheduleOverview까지 재렌더** — `React.memo` 한 줄 여지.
5. **출결 조회 O(n²)** (students 서브탭 `getRecordForDate`가 map 내부 find) — 날짜·수업 키 Map 인덱싱.
6. **오늘 허브 카드 순서 하드코딩** — show/hide는 스토어에 있으나 순서는 코드. config 배열로 승격하면 코드 수정 없이 배치 변경.
7. **아이콘 전용 버튼 일부 aria-label 누락** (App.tsx 헤더 계정 전환 등).
8. **현장 UX 아이디어**: 등교 시간대엔 담임 출결 카드를 풀너비 상단 고정(시간대 적응형 배치) / 날씨 미설정 시 에러문구 대신 설정 유도 CTA / 담임 학급 변경 `window.confirm` 안전장치 강화.

## 5. 동작 보존 불확실로 보류한 지점 (수정하지 않음)

1. **스토어 load/reload 보일러플레이트 팩토리화(12곳)** — 가드/분기 2계열 변종 + 예외 3스토어(StudentRecords 마이그레이션, Settings deviceId/NEIS, Meal 날짜 포맷). 추상화 시 미묘한 타이밍 회귀 위험.
2. **CRUD+triggerSaveSync 패턴 추상화(6스토어 25회)** — 낙관적 업데이트 순서가 스토어마다 달라 일괄 추상화 부적합.
3. **바텀시트 셸 공용화(7곳+)** — z-index 50/55/80, 정렬, 백드롭 투명도가 의도적으로 제각각.
4. **모바일↔데스크톱 스토어 통합** — 모바일은 의도적 기능 축소판(Todo·Memo·DriveSync). 통합 부적합 확정.
5. **인라인 탭 vs SegmentedControl** — 하단보더 탭과 pill은 다른 시각 패턴. 통합 시 시각 회귀.
6. **vite.mobile.config ↔ tsconfig `@student` alias 불일치** — vite 설정 수정은 빌드 실행 금지 제약상 검증 불가라 보류.
7. **URL 미동기화 자체 라우팅(딥링크·뒤로가기 불가)** — 구조 개선 여지가 크지만 동작 변경이므로 범위 밖.
8. **AttendanceCheckPage(652줄)** — 단일 컴포넌트로 응집도가 높아 분해 이득 낮음, 유지.
