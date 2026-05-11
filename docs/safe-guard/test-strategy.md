# 안전장치 보완 — 실행 전략 (test-strategy.md)

> 작성일: 2026-05-11
> 상위 문서: [`docs/safe-guard/goal.md`](./goal.md)
> 이 문서는 **이 문서만 보고도 순서대로 작업을 끝낼 수 있도록** 작성한다.
> 각 작업은 독립 커밋으로 마무리한다. 절대 `git add .` / `git stash` 같은
> 일괄 명령을 쓰지 않고, 항상 명시한 파일 경로만 스테이징한다
> (다른 세션이 같은 워킹 트리에서 병렬 작업 중).

---

## 작업 0. 사전 점검 (이미 충족됨, 변경 불필요)

- [x] `package.json` 에 `typecheck` / `lint` / `test` / `regression-check` 스크립트 존재
- [x] `vitest.config.ts` 존재 (`include: src/**/*.{test,spec}.{ts,tsx}`, `environment: node`)
- [x] ESLint flat config(`eslint.config.js`) 존재
- [x] `scripts/regression-grep-check.mjs` 존재

---

## 작업 1. Prettier + Husky + lint-staged 도입

**목표**: 코드 스타일을 코드로 고정하고, 커밋 직전 스테이징 파일을 자동 정리.

### 1-1. 패키지 설치
```bash
npm install -D --save-exact prettier
npm install -D husky lint-staged
```
- `prettier` 는 버전 변동으로 인한 포맷 흔들림을 막기 위해 `--save-exact`.

### 1-2. `.prettierrc` 생성 (프로젝트 컨벤션 = CLAUDE.md 코딩 컨벤션)
```json
{
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "semi": true,
  "singleQuote": true,
  "quoteProps": "as-needed",
  "trailingComma": "all",
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

### 1-3. `.prettierignore` 생성
```
node_modules
dist
dist-electron
dist-slides-student
release
landing/.next
landing/node_modules
*.tsbuildinfo
coverage
mac-artifacts
card-news-output
_workspace
```

### 1-4. `package.json` 수정
- `scripts` 에 추가:
  - `"format": "prettier --write ."`
  - `"format:check": "prettier --check ."`
  - `"prepare": "husky"`  ← husky v9 설치 훅
- 루트에 `lint-staged` 설정 추가:
  ```json
  "lint-staged": {
    "*.{ts,tsx}": ["prettier --write", "eslint --fix"],
    "*.{js,jsx,mjs,cjs,json,jsonc,css,md,mdx,yml,yaml}": ["prettier --write"]
  }
  ```
  - `.husky/*` 파일은 확장자가 없어 어떤 패턴에도 안 걸림(의도된 동작).

### 1-5. Husky 초기화 + pre-commit 훅
```bash
npx husky init    # .husky/ 디렉터리 생성 + package.json prepare 훅(이미 1-4에서 넣었으면 중복 무해)
```
- `.husky/pre-commit` 내용을 다음으로 교체:
  ```sh
  npx lint-staged
  ```
- (참고) husky v9는 `.husky/pre-commit` 가 그냥 셸 스크립트. shebang/`husky.sh` source 불필요.

### 1-6. ⚠️ 전체 코드베이스 포매팅은 하지 않음
- `goal.md` G1 비목표 참조. 다른 세션 미커밋 변경과 섞이면 추적 불가.
- 신규로 만드는 파일(.prettierrc 등 + 이후 테스트 파일)만 자연히 포맷에 맞게 작성.

### 1-7. 커밋
```bash
git add package.json package-lock.json .prettierrc .prettierignore .husky/pre-commit .gitignore
git commit -m "chore: Prettier 및 Husky 설정 추가"
```
- `.gitignore` 는 `coverage/` 추가가 필요하면 함께(없으면 생략).
- `package-lock.json` 이 추적 대상이면 함께 커밋.

**완료 기준**: `npx prettier --check .prettierrc` 통과. 빈 커밋 테스트로 `npx lint-staged` 가 hang/error 없이 끝남.

---

## 작업 2. GitHub Actions CI 파이프라인 (`ci.yml`)

**목표**: PR 및 `main` 푸시에서 4종 검증 자동 실행.

### 2-1. `.github/workflows/ci.yml` 생성
- 트리거: `pull_request` + `push` (branches: `main`)
- 환경: `ubuntu-latest`, Node `24` (package.json `engines.node: ">=24"`), `npm` 캐시
- 설치: `npm ci` (package-lock.json 필요 — 없으면 `npm install`)
- 단계(순차):
  1. `npm run typecheck`
  2. `npm run lint`
  3. `npm run test`
  4. `npm run regression-check`
- `concurrency` 로 같은 브랜치 중복 실행 취소.
- Electron/electron-builder 빌드는 **포함하지 않음**(별도 `build-macos.yml` 존재, 시간↑, Bash quirk).

### 2-2. 검증
- YAML 문법 확인(들여쓰기, `on:`/`jobs:` 구조).
- 로컬에서 `npm run typecheck && npm run lint && npm run test && npm run regression-check` 가 통과하는지 사전 확인(통과해야 CI도 통과).

### 2-3. 커밋
```bash
git add .github/workflows/ci.yml
git commit -m "ci: 자동 검증 워크플로우 추가"
```

**완료 기준**: 파일 존재 + YAML 유효 + 로컬 4종 통과. (실제 Actions 실행은 push 후 GitHub에서 확인.)

---

## 작업 3. 도메인 규칙 단위 테스트 보강

**목표**: `src/domain/rules/` 의 테스트 없는 핵심 순수 함수에 Vitest 단위 테스트 추가.
**규칙**: 한 번에 다 하지 말 것. 2~3개 파일씩 끊어서 → `npm run test` 통과 → 커밋.
**금지**: `neisTransformRules.ts` 등 다른 세션 작업 파일은 손대지 않는다.

### 3-1. 테스트 미보유 파일 인벤토리 (2026-05-11 기준)
이미 테스트가 있는 것(건드리지 않음): `backupRules`, `bookmarkRules`, `formTemplateRules`,
`notebookRules`, `overlayRules`, `realtimeWallRules*`, `rosterImportPlan`, `seatRules`,
`studentActivity*`, `studentCountRules`, `timetableOverrideRules`, `toolResultAggregation`,
`toolResultSerialization`.

테스트 없음(보강 대상, 우선순위 순):
1. **`attendanceRules.ts`** — `cycleStatus`, `buildAttendanceMatrix`, `summarizeBy*`, `summarizeTotal`, `pickRepresentativeAttendance`, `validateAttendancePeriods` ← 1차
2. **`holidayRules.ts`** — `getKoreanHolidays`(고정/음력/대체공휴일), `getHolidayName`, `getHolidayMapForMonth` ← 1차
3. **`ddayRules.ts`** — D-Day 계산, 알림 대상 판정 ← 2차
4. **`todoRules.ts`** — 정렬/필터/overdue 판정 ← 2차
5. **`periodRules.ts`** — 현재 교시 판정 ← 2차
6. `eventRules.ts` — 일정 필터/정렬 ← 3차 이후
7. `randomRules.ts` — 랜덤 시드/셔플 (시드 고정 테스트) ← 3차 이후
8. `subjectColorRules.ts`, `studentRecordRules.ts`, `shareRules.ts` 등 ← 3차 이후

### 3-2. 1차 배치 — `attendanceRules.test.ts` + `holidayRules.test.ts`
- 위치: `src/domain/rules/attendanceRules.test.ts`, `src/domain/rules/holidayRules.test.ts`
- `import { describe, it, expect } from 'vitest';` (vitest.config 의 `globals: false`)
- `attendanceRules`:
  - `cycleStatus`: present→absent→late→earlyLeave→classAbsence→present 한 바퀴.
  - `buildAttendanceMatrix`: 레코드 없음(undefined 채움), 학년/반 매칭, 같은 period 중복 시 마지막 값.
  - `summarizeByStudent` / `summarizeByPeriod` / `summarizeTotal`: 카운트 정확성, undefined 무시.
  - `pickRepresentativeAttendance`: 우선순위(absent>earlyLeave>late>classAbsence), 동률 시 이른 교시, present만/빈 입력 → undefined.
  - `validateAttendancePeriods`: EMPTY / OUT_OF_RANGE / MISSING_STATUS / DUPLICATE_PERIOD, 조회(0)·종례(9) 허용, 정상 → null.
- `holidayRules`:
  - 2025년 고정 공휴일 8종 포함 확인(신정·삼일절·어린이날·현충일·광복절·개천절·한글날·성탄절).
  - 2025 음력: 설날 `01-29`±1, 부처님오신날 `05-05`, 추석 `10-06`±1 포함.
  - 대체공휴일: 2025-05-05(어린이날=월) 대체 없음, 2027 등 일요일 겹치는 해는 대체공휴일 존재 — 표 기반으로 1~2개 명시 검증.
  - `getHolidayName`: 매칭/비매칭(null).
  - `getHolidayMapForMonth`: 0-based month, 같은 날 중복 시 첫 항목, 해당 월만 필터.
- 실행: `npm run test` → 전부 PASS 확인.
- 커밋:
  ```bash
  git add src/domain/rules/attendanceRules.test.ts src/domain/rules/holidayRules.test.ts
  git commit -m "test: 도메인 규칙 단위 테스트 추가"
  ```

### 3-3. 2차 배치 — `ddayRules.test.ts` + `todoRules.test.ts` + `periodRules.test.ts`
- 각 파일의 export 함수를 먼저 읽고, 엣지 케이스(경계 날짜, 빈 배열, 정렬 안정성, 현재 시각 경계) 커버.
- `Date` 의존 함수는 인자로 "기준 시각"을 받으면 그것으로, 아니면 `vi.useFakeTimers()` / `vi.setSystemTime()` 사용.
- 실행: `npm run test` → PASS.
- 커밋:
  ```bash
  git add src/domain/rules/ddayRules.test.ts src/domain/rules/todoRules.test.ts src/domain/rules/periodRules.test.ts
  git commit -m "test: 도메인 규칙 단위 테스트 추가 (2차)"
  ```

### 3-4. 3차 이후 (선택, 같은 패턴 반복)
- 위 3-1 인벤토리 6~8번을 2~3개씩 끊어서 반복. 매번 `npm run test` 통과 후 커밋.

**완료 기준**: `npm run test` 가 신규 테스트 포함 전부 통과. 새 테스트 파일이 `vitest.config.ts` `include` 패턴에 자동 포함됨(별도 설정 불필요).

---

## 부록 A. 커밋 메시지 규약
| 작업 | 메시지 |
|------|--------|
| 작업 1 | `chore: Prettier 및 Husky 설정 추가` |
| 작업 2 | `ci: 자동 검증 워크플로우 추가` |
| 작업 3-2 | `test: 도메인 규칙 단위 테스트 추가` |
| 작업 3-3 | `test: 도메인 규칙 단위 테스트 추가 (2차)` |

## 부록 B. 안전 수칙 (다른 세션과 공존)
- `git add` 는 **항상 명시 경로**. `git add .` / `git add -A` 금지.
- `git stash` / `git checkout -- .` 등 워킹 트리 일괄 조작 금지.
- `neisTransformRules.ts`, `electron/ipc/*`, `src/adapters/components/Tools/InteractiveSlides/*`,
  `src/slides-student/*` 등 현재 `M`/`??` 상태인 파일은 이 작업에서 손대지 않는다.
- husky 도입 후 본인 커밋도 pre-commit(`lint-staged`)을 거친다. lint-staged 는 미스테이징
  변경을 내부적으로 stash/keep-index 로 격리하므로 다른 세션 변경은 보존되지만,
  혹시 충돌 시 커밋을 중단하고 사용자에게 보고한다.
