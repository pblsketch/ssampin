# 안전장치 보완 작업 — 목표 (goal.md)

> 작성일: 2026-05-11
> 대상 프로젝트: 쌤핀(SsamPin) — Electron + React + TypeScript 데스크톱 앱
> 배경: AI 코딩 에이전트(Claude Code 등)를 본격적으로 도입하기에 앞서, AI가
> 의도치 않은 버그를 만들거나 클린 아키텍처 4레이어 구조를 훼손하는 것을 막을
> 안전장치(Safety Net)를 보완한다.

---

## 1. 왜 지금 이 작업이 필요한가

쌤핀은 이미 다음을 갖추고 있다.

- ✅ Clean Architecture 4레이어 (`domain` / `usecases` / `adapters` / `infrastructure`)
- ✅ ESLint(flat config) + `npm run lint`
- ✅ TypeScript strict + `npm run typecheck`
- ✅ Vitest + `npm run test` (도메인 규칙·유스케이스 일부에 테스트 존재)
- ✅ 회귀 grep 어서션 `npm run regression-check` (`scripts/regression-grep-check.mjs`)

그러나 **AI 에이전트가 코드를 자동 수정하는 환경**에서는 다음 취약점이 위험하다.

| # | 취약점 | 위험 | 영향 |
|---|--------|------|------|
| V1 | **코드 포매터 부재** | Prettier가 없어 들여쓰기·따옴표·줄바꿈이 사람/AI/도구마다 제각각. AI가 만든 대규모 diff가 "의미 변경 + 포맷 변경"이 섞여 리뷰가 불가능해짐 | 리뷰 품질 ↓, 머지 충돌 ↑ |
| V2 | **커밋 시점 자동 검증(Git Hook) 부재** | 포맷 깨진 코드, 린트 에러, (선택적으로) 테스트 실패가 그대로 커밋·푸시됨. AI가 `--dangerously-skip-permissions`로 돌 때 특히 위험 | main 오염, 빌드 깨짐 |
| V3 | **CI 자동 검증 파이프라인 부재** | PR/푸시 시 typecheck·lint·test·regression-check를 자동으로 돌리는 GitHub Actions가 없음(현재 워크플로우는 macOS 빌드·임베딩 갱신만). AI PR이 사람 검토 전까지 검증되지 않음 | 회귀 미탐지 |
| V4 | **도메인 규칙 테스트 커버리지 구멍** | `src/domain/rules/`의 핵심 순수 함수 다수(`attendanceRules`, `holidayRules`, `ddayRules`, `todoRules`, `periodRules` 등)에 단위 테스트가 없음. AI가 이 함수들을 리팩토링하면 회귀를 잡을 그물이 없음 | silent breakage |

---

## 2. 핵심 목표

### G1. 결정론적 코드 스타일 — Prettier 도입
- `.prettierrc`로 프로젝트 컨벤션(작은따옴표, 세미콜론, 2-space, 후행 쉼표)을 코드로 고정한다.
- `npm run format` / `npm run format:check` 스크립트를 제공한다.
- ⚠️ **전체 코드베이스 일괄 포매팅은 이번 작업 범위에서 제외**한다.
  현재 워킹 트리에 다른 세션의 미커밋 변경이 다수 있어, 일괄 포매팅 diff가
  그 변경들과 섞이면 추적이 불가능해진다. 신규/수정 파일에만 점진 적용한다.

### G2. 커밋 게이트 — Husky + lint-staged
- 커밋 직전 **스테이징된 파일에 한해** Prettier 포매팅 + ESLint 자동수정을 실행한다.
- 전체 코드베이스나 미스테이징 변경은 건드리지 않는다(`lint-staged`의 격리 동작).
- 무거운 검증(전체 test, typecheck)은 pre-commit이 아니라 **CI(G3)** 에서 수행한다 — 로컬 커밋 속도 보호.

### G3. CI 자동 검증 — GitHub Actions `ci.yml`
- PR 및 `main` 브랜치 푸시 시 다음 4종을 모두 통과해야 머지 가능:
  1. `npm run typecheck`
  2. `npm run lint`
  3. `npm run test`
  4. `npm run regression-check`
- Electron 인스톨러 빌드는 CI에서 제외(별도 macOS 빌드 워크플로우가 존재하고, 시간이 오래 걸리며 Bash 환경 quirk가 있음).

### G4. 도메인 규칙 안전망 — 단위 테스트 보강
- `src/domain/rules/` 중 테스트 없는 핵심 순수 함수에 Vitest 단위 테스트를 추가한다.
- 모든 엣지 케이스(빈 입력, 경계값, 중복, 정렬 안정성, 대체공휴일 등)를 커버한다.
- 1차: `attendanceRules.ts`, `holidayRules.ts` — 2차 이후: `ddayRules.ts`, `todoRules.ts`, `periodRules.ts` 등.
- ⚠️ `neisTransformRules.ts` 등 다른 세션에서 작업 중인 파일은 건드리지 않는다.

---

## 3. 비목표 (이번 작업에서 하지 않는 것)

- 전체 코드베이스 일괄 Prettier 포매팅 및 그 커밋 (다른 세션 변경과 충돌 위험)
- ESLint 규칙 자체의 강화/변경 (별도 작업)
- 아키텍처 의존성 경계를 강제하는 도구(`eslint-plugin-boundaries`, `dependency-cruiser`) 도입 (후속 후보)
- E2E·통합 테스트 인프라 확장 (후속 후보)
- pre-push 훅으로 전체 test 실행 (CI가 담당)

---

## 4. 완료 기준 (Definition of Done)

- [ ] `docs/safe-guard/test-strategy.md` 가 이 목표를 실행 가능한 체크리스트로 구체화함
- [ ] `npx prettier --check <파일>` 동작, `.prettierrc` 커밋됨
- [ ] `git commit` 시 `.husky/pre-commit` → `lint-staged` 가 스테이징 파일을 포매팅·린트함
- [ ] GitHub Actions `ci.yml` 이 PR/push에서 typecheck·lint·test·regression-check 4종을 실행함
- [ ] `attendanceRules.ts`, `holidayRules.ts` 에 단위 테스트가 추가되고 `npm run test` 통과
- [ ] 추가로 도메인 규칙 2~3개 파일에 단위 테스트 추가, `npm run test` 통과

---

## 5. 후속 작업 후보 (이번 범위 밖, 참고용)

1. 워킹 트리가 깨끗해진 시점에 `npm run format` 으로 전체 코드베이스 일괄 포매팅 → 단일 커밋
2. 아키텍처 경계 강제 린트 룰 도입 (`usecases`→`adapters` import 금지 등을 ESLint로)
3. CI에 `pre-build smoke`(타입체크만 통과하면 `vite build` 1회) 추가 검토
4. 커버리지 리포트(`vitest --coverage`) 및 임계치 게이트
5. `src/usecases/` 의 테스트 미보유 유스케이스 보강
