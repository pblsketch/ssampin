# 쌤핀 모바일 리팩토링 계획 (mobile-refactor)

작성: 2026-07-03. 대상: `src/mobile/` (74파일, ~12,258줄).
근거 분석: `docs/03-analysis/mobile-refactor/` 3건 (구조·네이밍 / 중복 / 가시성·churn).

## 제1원칙

**기존 동작·렌더링 결과의 완전한 보존.** 모든 변경은 외부 관찰 가능 동작이 리팩토링 전과 동일해야 한다.

- 동작 변경이 불가피한 지점은 수정하지 않고 본 문서 하단 "보류 항목"에 기록만 한다.
- 확신 없는 변경은 수행하지 않는다.
- 검증: `npx tsc --noEmit` (에러 0 유지) + `npx vitest run src/mobile --pool=forks` (기준선: 3파일 24개 통과). 빌드·Playwright 등 실행 기반 검증 금지.
- **수정 범위는 `src/mobile/` 내부로 한정.** 공용 레이어(`src/domain`, `src/adapters`, `src/infrastructure` 등)와 다른 세션 작업 파일(`src/domain/entities/Settings.ts`, `src/global.d.ts`, `src/adapters/di/container.ts`, `src/adapters/components/Tools/ToolsGrid.tsx`, `electron/*`, `index.html`, `landing/*`)은 절대 수정 금지.

## 네이밍·구조 규칙 (전체 일관 적용)

### R1. 디렉토리 분류

```
src/mobile/
├── main.tsx, App.tsx            앱 부트스트랩 + 셸 (고정 프레임)
├── pages/                       화면 단위. XxxPage.tsx 규칙
│   └── students/                대형 페이지는 페이지명 소문자 폴더로 서브컴포넌트 분리
├── components/
│   ├── common/                  화면 무관 재사용 UI 패턴 (ActionSheet, Spinner, EmptyState, Toggle …)
│   ├── <Domain>/                화면 도메인별 (Today/, Class/, Students/, Onboarding/, Settings/, Share/, More/, SwipeRow/)
│   └── (루트 직속)              앱 전역 1회성 (ErrorBoundary, InAppBrowserBanner, QuickAddFab)
├── stores/                      모든 Zustand 스토어. useMobileXxxStore.ts 규칙
├── hooks/                       공용 훅. useXxx.ts 규칙 (Mobile 접두어 없음 — src/mobile 하위임이 이미 명시적)
├── utils/                       순수 함수 유틸 (date.ts, haptic.ts …) ← 신설
├── contexts/, di/, styles/, __tests__/
└── version.ts                   모바일 표시 버전 단일 소스 ← 신설
```

### R2. 네이밍

- 스토어: `useMobileXxxStore.ts` — 데스크톱 스토어(`useXxxStore`)와 import 시 즉시 구분되도록 유지.
  - 예외 3건 정리: `useBottomSheetStore` → `useMobileBottomSheetStore`, `SwipeRow/useSwipeRowStore` → `stores/useMobileSwipeRowStore`, `SwipeRow/useSwipeUndoStore` → `stores/useMobileSwipeUndoStore` (파일 이동+개명, export 심볼은 유지해 호출부 영향 최소화)
- 훅: `useXxx.ts` (Mobile 접두어 없음). 컴포넌트 폴더에 store 배치 금지 — store는 전부 `stores/`.
- 페이지: `XxxPage.tsx`. 뷰 상태 키(탭/세그먼트/moreSub)는 현행 문자열 값 절대 변경 금지 (localStorage persist·분석 이벤트와 결합 가능성).
- 내부 참조는 `@mobile/` alias 우선 (상대경로는 같은 폴더 내에서만). 단, **기존 코드의 import 스타일 일괄 변경은 하지 않는다** — 이동한 파일의 깨진 import만 수정 (diff 최소화).

### R3. 라우트/API 네이밍

- 자체 상태 라우팅 키(`home/students/schedule/more`, `moreSub`의 `tool-*` 등)는 이미 일관 — **값 변경 금지**, App.tsx의 14분기 삼항 체인만 레지스트리 테이블로 정리.
- API 엔드포인트는 인프라 레이어(`src/infrastructure`) 소관으로 모바일 범위 밖 — 변경 없음.

### R4. UI 가시성 (셸 vs 콘텐츠)

- 셸(고정): main.tsx, App.tsx(헤더·탭바·FAB), ErrorBoundary, Onboarding/\*, InAppBrowserBanner.
- 콘텐츠(가변): components/Today/_ 카드, pages/_ 본문. 대형 페이지는 서브컴포넌트 분리로 "수정 지점이 파일 트리에서 바로 보이게" 한다.
- App.tsx의 도구 라우팅을 `toolRegistry` 테이블로 추출해 셸 코드에서 콘텐츠 목록이 한눈에 보이게 한다.

## 실행 단계 (각 단계 후 tsc + vitest 게이트)

### D1 — 안전 중복 통합 (중복 보고서 A그룹 + B-6)

1. `utils/date.ts`: `todayISO()` 신설 → 7곳 교체 (**`useMobileMealStore`의 `YYYYMMDD` 변종은 절대 건드리지 않음**), `DAY_LABELS`+`formatDateLabel` → 2곳 교체
2. `utils/haptic.ts`: `haptic()` → SwipeRow.tsx + ClassProgressEntryItem.tsx 교체
3. `components/common/ActionSheet.tsx`: 100% 동일 2곳(ClassProgressTab, ClassObservationTab) 추출
4. `components/common/Spinner.tsx`: **className이 바이트 단위 동일한 곳만** 교체 (다른 곳은 유지)
5. `components/common/EmptyState.tsx`: 3곳 (라벨은 prop으로 현행 문구 그대로)
6. `version.ts`: `MOBILE_APP_VERSION = 'v2.2.7'` → MorePage:107, SettingsPage:251 교체 (렌더 문자열 동일)

### D2 — 주의 그룹 선별 통합 (중복 보고서 B그룹 일부)

1. B-3: `ClassAttendanceCard`+`HomeroomAttendanceCard` → `components/Today/AttendanceSummaryCard.tsx` (전체 N명 줄은 prop 분기, 마크업 바이트 보존)
2. B-8: `hooks/useLongPress.ts` (햅틱·fired 동작을 옵션으로 현행 그대로 보존)
3. C-1: `components/common/ConfirmDialog.tsx` — title/message를 문자열 prop으로 받아 현행 문구를 호출부에서 그대로 조립
4. B-1 store load/reload 팩토리는 **보류** (변종 2계열 + 예외 3스토어 — 이득 대비 회귀 위험. 보류 항목에 기록)

### D3 — 구조 재배치

1. SwipeRow store 2개 + useBottomSheetStore → `stores/`로 이동·개명 (R2)
2. `StudentsPage.tsx`(1,815줄) → `pages/students/` 폴더로 9개 서브컴포넌트 순수 추출 (props 시그니처 불변)
3. App.tsx `moreSub` 삼항 체인 → `toolRegistry` 테이블 (lazy import·Suspense fallback 현행 유지)

### D4 — 가시성 마무리 + 최종 검증

1. `ClassObservationTab`(486줄)·`TodoPage`(405줄) 내부 서브컴포넌트 분리 (D1·D2에서 ActionSheet/ConfirmDialog 추출 후 잔여분, 여력 시)
2. 최종 게이트: tsc + vitest src/mobile + `npm run lint` (모바일 파일 대상)
3. 결과 보고서 작성 (`docs/04-report/features/mobile-refactor.report.md`)

## 보류 항목 (동작 보존 불확실 — 수정하지 않고 기록)

- **B-1 store load/reload 팩토리화**: 12개 스토어가 2계열 변종 + 예외 3개(StudentRecords 마이그레이션, Settings deviceId/NEIS, Meal 포맷). 추상화 시 미묘한 타이밍/분기 회귀 위험.
- **B-2 CRUD+triggerSaveSync 추상화**: 낙관적 업데이트 순서가 스토어마다 미묘하게 달라 일괄 추상화 부적합.
- **B-5 바텀시트 셸 공용화**: z-index(50/55/80)·정렬·백드롭 투명도가 의도적으로 제각각 — 통합 시 레이어 회귀 위험.
- **C-2/C-3 모바일↔데스크톱 스토어 통합**: 모바일은 의도적 기능 축소판. 통합 부적합 확정.
- **C-5 인라인 탭 vs SegmentedControl**: 시각 스타일이 다른 별개 패턴 — 통합 시 시각 회귀.
- **vite.mobile.config ↔ tsconfig `@student` alias 불일치**: vite 설정 수정은 빌드 검증 불가 제약상 보류.
- **URL 미동기화 라우팅(딥링크/뒤로가기 불가)**: 동작 변경이므로 리팩토링 범위 밖.
