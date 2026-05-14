# mobile-ux-improvement Gap Analysis (Plan/Design vs Implementation)

> **Analysis Date**: 2026-05-12
> **Plan/Design**: `docs/01-plan/features/mobile-ux-improvement.plan.md` (Approved) · `docs/02-design/features/mobile-ux-improvement.design.md` (Draft)
> **Scope**: Phase 1+2 (F-1 ~ F-6). Phase 3·4·5 는 본 회차 미착수(설계 패스 예정) — 분석 대상 아님.
> **Verification**: `npx tsc --noEmit` 0 errors / `npx eslint <changed>` 0 errors / Playwright E2E (390px, IndexedDB 시드) 전 기능 통과 / `bkit:code-analyzer` 리뷰 1회 + 권고 반영

---

## 1. FR Implementation — Phase 1+2

| FR  | 제목                       |      상태      | 근거                                                                                                                                                                                                                                                                                                                                                                       |
| --- | -------------------------- | :------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-1 | 출결 총원 실데이터 연동    |       ✅       | `TodayHub.tsx` `const totalStudents = homeroomStudents.filter(isStudentActive).length` (하드코딩 30 제거) · `HomeroomAttendanceCard.tsx` "전체 N명" 표시 (totalStudents prop 실사용) · 담임 반 미설정 시 카드 미렌더(`showHomeroomCard`)                                                                                                                                   |
| F-2 | 출결 교시 선택 드롭다운    |       ✅       | `AttendanceCheckPage.tsx` `selectedPeriod` 로컬 state + 헤더/리스트의 모든 `period` 사용처 치환 + `type==='class'` 일 때 교시 칩 → fixed listbox(교시별 시작시각 + "현재" 뱃지) · `ClassAttendanceTab.tsx` `period={1}` 제거 → `useCurrentPeriod` 기반 초기값 + `currentPeriod` 주입 · 사일런트 자동변경 아님(R6 회귀 차단) · 교시 변경 시 미저장분 `await doSave()` flush |
| F-3 | 일정 추가 모달 시간 필드   |       ✅       | `SchedulePage.tsx` 일정 추가 바텀시트에 `종일` 토글(`<Toggle>`) + 시작/종료 `<input type="time">`(종료는 시작 입력 전 disabled) · `handleAdd` 가 `time`("HH:mm" 또는 "HH:mm - HH:mm")·`startTime`·`endTime` 저장 · 비우면 종일(현행 유지)                                                                                                                                  |
| F-4 | 홈 탭 카드 접기            | ✅ (날씨·급식) | `CollapsibleCard.tsx` 신규 공통 래퍼(헤더 탭 → 본문 접기, 접힘 시 1줄 요약, `aria-expanded`/`aria-controls`) · `WeatherCard.tsx`/`MealCard.tsx` 리팩토링하여 래핑(데이터 로딩·끼니 탭·스와이프 보존) · 접힘 상태 `useMobileHomeLayoutStore.collapsedCards` 영속(localStorage). **현재교시/담임출결/수업출결 카드는 미적용** — Phase 2 잔여(아래 §3)                        |
| F-5 | 홈 카드 표시 on/off (설정) |       ✅       | `SettingsPage.tsx` "홈 화면 카드 표시" 섹션(현재교시/담임출결/수업출결/날씨/급식 5개 `<Toggle>`) · `useMobileHomeLayoutStore.hiddenCards` 영속 · `TodayHub.tsx` 가 `isHidden(id)` 로 렌더 제외 + bento col-span 보정 · 동기화 대상 아님(autoSyncInterval 패턴)                                                                                                             |
| F-6 | 출결 버튼 라벨 가시성      |       ✅       | `AttendanceCheckPage.tsx` 학생 행 2행 레이아웃(이름 / 버튼 5열 균등) · 각 버튼 `flex-col`(아이콘 18px + `text-[10px]` 라벨) → 360px 에서도 출석/지각/결석/조퇴/결과 라벨 노출 · `aria-pressed` 추가                                                                                                                                                                        |

**FR Match Rate (Phase 1+2): 6/6 = 100%** (F-4 는 의도된 부분 적용 — 보고서가 명시한 날씨·급식 카드 한정. 나머지 3개 카드 collapse 는 Phase 2 잔여로 트래킹).

## 2. NFR / 품질

| 항목                                                                                                     |                                상태                                 |
| -------------------------------------------------------------------------------------------------------- | :-----------------------------------------------------------------: |
| Clean Architecture 의존성 (모바일 → `@domain/*`·`@mobile/*`·`@infrastructure/*`(DI 경유))                |                            ✅ 위반 없음                             |
| TypeScript strict / `any` 금지 / tsc 0 errors                                                            |                                 ✅                                  |
| ESLint 0 errors (변경 파일)                                                                              |                                 ✅                                  |
| 라운드 정책 (`rounded-xl`/`rounded-lg` 만, `rounded-sp-*` 금지)                                          |                                 ✅                                  |
| 한국어 UI 텍스트                                                                                         |                                 ✅                                  |
| 접근성 (`role="switch"`·`aria-checked`·`aria-expanded`·`aria-controls`·`aria-pressed`, 터치 타깃 ≥ 44px) |                                 ✅                                  |
| 영속성 (localStorage, 사파리 프라이빗 모드 try-catch 가드)                                               |                                 ✅                                  |
| frontend-design/architect 협업 의무                                                                      | ✅ `bkit:frontend-architect` 가 Phase 1+2 UI 권고 제공, 그대로 반영 |

## 3. Gap / 잔여 (다음 회차)

| ID    | 내용                                                                                                                                                                                                                    | 비고                                                                                                                                              |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| GAP-1 | F-4 — 현재교시·담임출결·수업출결 카드 collapse 미적용                                                                                                                                                                   | 보고서가 명시한 날씨·급식만 우선 적용. 나머지는 `CollapsibleCard` 재사용으로 확장만 하면 됨 (저위험)                                              |
| GAP-2 | Phase 3 (4탭+FAB), Phase 4 (스와이프), Phase 5 (모바일 설정 양방향)                                                                                                                                                     | Design §4~6 개요만 — 별도 design 패스 후 구현                                                                                                     |
| GAP-3 | 버전 텍스트 3곳 + `release-notes.json` 미갱신                                                                                                                                                                           | 사용자 지시: 전체 작업 완료 후 단일 릴리즈에 묶음 처리                                                                                            |
| REV-1 | 코드 리뷰 권고 반영 완료 — H1(`handleSelectPeriod` async), H2(언마운트 시 debounce flush), M2(MealCard `currentIdx` 초기화 effect), L2(인라인 토글 → 공용 `Toggle`), L6(`CollapsibleCard` chevron 버튼 `aria-expanded`) | M1(불필요 loadStudents)·M3(접힘 시 끼니탭 숨김 — 의도)·L1(localStorage 값 타입)·L3(SchedulePage color map 중복, 기존 코드)는 미반영(무해/범위 외) |

## 4. 결론

Phase 1+2 (F-1~F-6) 구현·검증·리뷰 반영 완료. **Match Rate 100%**, 추가 이터레이션 불요. 릴리즈는 사용자 지시대로 Phase 3~5 까지 마친 뒤 단일 릴리즈에 묶음 게시.

다음 단계: GAP-2 (Phase 3~5) `/pdca design` 상세화 → 구현. 또는 GAP-1 (나머지 카드 collapse) 마저.
