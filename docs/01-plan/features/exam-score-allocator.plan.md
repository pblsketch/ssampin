# 지필평가 배점 계산기 (쌤도구) — 구현 계획

> 상태: Phase 1 구현 완료 · 2026-06-17
> 분류: 쌤도구(tools) 신규 도구

## 배경 / 동기

dorms.school 교사 앱 생태계 분석 중, 쌤핀의 평가 기능이 **수행평가 루브릭 채점**만 다루고
(`rubricRules.ts` D1: "환산·등급 없음"), **지필평가 성적처리**는 0건임을 확인했다. 그중
"출제 단계의 문항 배점 설계"는 학생 개인정보가 전혀 없어(문항 메타만) 제1원칙(AI 0 · 로컬 ·
학생데이터 외부전송 0)에 가장 안전하게 부합한다.

## 제1원칙 준수

- 외부 AI 호출 없음, 서버 없음, 모든 계산은 로컬 순수 함수.
- 학생 개인정보 0건 — 문항 유형/배점/난이도/단원/성취기준만 다룬다.

## 핵심 문제와 해법

한국 지필평가 = 객관식 + 서답형(서술형/단답형) 조합. 배점은 소수점 허용.

1. **소수점 합산 오차**: `3.5 × 20`이 부동소수점에서 `69.999…`로 드리프트 → 모든 산술을
   **센티포인트(×100 정수)** 로 수행해 차단. (`examAllocationRules.toCents/fromCents`)
2. **서답형 비율 규정**: 학업성적관리규정상 서답형 최소 비율이 있어, 교사가 목표 비율을
   설정하면 실시간 미달 경고. (`writtenRatio`, `meetsWrittenTarget`) — 고정값 금지.
3. **균등 배분**: 목표 점수를 step 단위로 분배하고 나머지를 앞 문항부터 결정론적으로 흡수.

## 구현 (Phase 1)

### 도메인

- `src/domain/entities/ExamPaper.ts` — `ItemType`, `ExamItem`, `ExamPaper`, 라벨/상수.
- `src/domain/rules/examAllocationRules.ts` — 순수 함수: `toCents`, `fromCents`, `sumPoints`,
  `remaining`, `isBalanced`, `subtotalByType`, `itemCountByType`, `writtenRatio`,
  `meetsWrittenTarget`, `distributeEvenly`, `validatePaper`.
- `src/domain/rules/examAllocationRules.test.ts` — 25 케이스(부동소수점/비율/배분/검증).
- 배럴 `entities/index.ts`에 타입 export 추가.

### 어댑터 (UI + 등록)

- `src/adapters/components/Tools/ToolScoreAllocator.tsx` — `{ onBack, isFullscreen }`,
  sp-\* 토큰, UI 한국어. 만점·문항리스트·실시간 합/잔여/초과경고·유형별 소계·서답형 비율
  목표 대비 경고·빠른 배분. 단일 초안 localStorage 자동저장.
- 등록 5지점: `Sidebar.tsx`(PageId) · `ToolsGrid.tsx`(TOOLS 🧮) · `toolDefinitions.ts` ·
  `App.tsx`(라우팅).
- `toolRegistration.test.ts`에 라우팅 가드 추가(App 소스에 분기 존재 검증).

## 범위 밖 (Phase 2/3)

여러 시험지 라이브러리(repository+store+DI), 이원목적분류표 Excel/HWPX 출력,
성취기준 `EvaluationPlan` 자동완성, 듀얼모드, 난이도/단원 분포.

## Acceptance Criteria

- `sumPoints([3.5]×20)===70`, `sumPoints([0.1]×10)===1` (드리프트 0). ✅
- `remaining` 초과 시 음수, `isBalanced` 정확. ✅
- `writtenRatio` 30.0 및 경계(29.95→30.0) 반올림. ✅
- `distributeEvenly(10,3,0.5)===[3.5,3.5,3.0]`, 합 정확. ✅
- `validatePaper` 만점0/배점0/번호중복/합≠만점 검출. ✅
- 쌤도구 그리드에 카드 노출 + App 라우팅 분기 존재(가드 테스트). ✅

## 검증 게이트

`npx tsc --noEmit && npm run lint && npm run test && npm run regression-check`

## 결정 / 미정

- 배점 정밀도: 소수 둘째자리(×100). 입력 단위 강제(0.5/0.1)는 후속.
- `distributeEvenly` step 기본 0.5, 나머지 앞 문항 흡수(결정론).
- 저장: 과한 repository/DI 대신 단일 초안 localStorage. 다중 시험지 저장은 Phase 2.
