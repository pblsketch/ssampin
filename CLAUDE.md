# CLAUDE.md — 쌤핀 (SsamPin)

교사용 데스크톱 대시보드 앱. Electron + React 18 + TypeScript strict + Tailwind CSS + Vite + Zustand.
한국 중·고등학교 교사 대상. 오프라인 완전 동작, 로컬 JSON 저장.

## 도메인 규칙 (반드시 참조)

- **아키텍처/의존성**: `docs/architecture-rules.md` — Clean Architecture 4 레이어, import 규칙, 프로젝트 구조
- **디자인 시스템**: `docs/design-system.md` — sp-\* 토큰, 폰트, 레이아웃, design examples/ 참조 규칙
- **코딩 컨벤션**: `docs/coding-conventions.md` — TypeScript strict, React, 스타일 규칙
- **디자인 컨텍스트**: `.impeccable.md` — 브랜드 퍼스널리티, 미적 방향

## 핵심 규칙 (항상 기억)

1. `domain/` 레이어는 외부 의존성 import 절대 금지
2. `any` 타입 사용 금지, TypeScript 에러 0개 유지
3. 하드코딩 HEX 금지 — 반드시 `sp-*` 토큰 사용
4. 모든 UI 텍스트는 한국어
5. `design examples/` 폴더 디자인을 최대한 재현

## 비개발자 설명 원칙

사용자는 코딩을 모르는 프로젝트 오너다. 설명은 기술자가 아니라 제품을 함께 만드는 사람에게 말하듯 작성한다.

1. 어려운 개발 용어를 단독으로 쓰지 말고, 처음 나올 때 쉬운 한국어로 풀어쓴다.
2. 답변은 기본적으로 `무엇을 바꿨는지` → `왜 필요한지` → `확인 결과` 순서로 짧게 말한다.
3. 파일명, 함수명, 레이어명은 필요할 때만 언급하고, 사용자가 이해할 수 있는 역할 설명을 붙인다.
4. "타입 안정성", "의존성", "어댑터", "리팩터링" 같은 용어는 한 문장 안에서 쉬운 의미를 함께 설명한다.
5. 검증 결과는 "통과했습니다"만 쓰지 말고, 실행한 명령과 핵심 출력/결과를 함께 적는다.
6. 내부 구현 세부사항을 길게 설명하지 말고, 사용자가 판단해야 하는 영향과 다음 행동을 우선한다.

예: "어댑터를 리팩터링했습니다"보다 "화면에서 데이터를 받아오는 중간 정리 부분을 더 단순하게 바꿨습니다"처럼 설명한다.

## 검증 게이트 (완료 선언 전 반드시 실행)

```bash
# 1단계: 구문 검증
npx tsc --noEmit              # TypeScript 에러 0개

# 2단계: 코드 품질
npm run lint                   # ESLint 통과

# 3단계: 테스트
npm run test                   # Vitest 통과

# 4단계: 회귀 방지
npm run regression-check       # 회귀 체크 통과
```

## 릴리즈 문서 규칙

- 새 버전, 핫픽스, 기능 공개 릴리즈 작업 시 Notion 사용자 가이드는 갱신 대상이 아니다.
- 공개 사용자 가이드는 `https://www.ssampin.com/docs`이며 소스는 `landing/src/content/docs.ts`, 이미지 자료는 `landing/public/docs/screenshots/`에 둔다.
- 사용자 행동, 설정, 문제 해결, FAQ가 바뀌면 같은 작업 단위에서 `/docs` 사용자 가이드를 최신화한다.
- 앱과 랜딩의 사용자 가이드 링크는 `landing/src/config.ts`의 `GUIDE_URL` 또는 `https://www.ssampin.com/docs`만 사용한다. `supsori.notion.site` 사용자 가이드 링크는 재도입하지 않는다.
- 릴리즈 전 `cd landing && npm run docs:check && npm run build` 결과를 확인한다.

검증 게이트를 모두 통과해야 완료로 간주한다. 에이전트가 자체 판단으로 완료를 선언하지 않는다.

## 세션 프로토콜

### 시작 시

1. `PROGRESS.md` 읽고 현재 상태 파악 — **상태판(300줄 상한)** 이다. 세션별 상세 기록은 `docs/progress/YYYY-MM.md`(월별, 최신이 위)에 있으니 필요한 달만 연다.
2. `DECISIONS.md` 읽고 기존 결정 확인 — **목록**만 있다. 본문은 `docs/03-decisions/ADR-NNN.md`, 관련된 것만 연다.
3. `git status` 확인 — 다른 세션 작업 중인 파일 건드리지 않기

### 종료 시

1. 이번 세션의 작업 기록은 `docs/progress/YYYY-MM.md` **맨 위**(안내문 아래)에 `## 제목 (YYYY-MM-DD)` 섹션으로 쓴다. 검증 게이트 결과도 여기에.
2. `PROGRESS.md` 상태판은 항목당 3~5줄 + 월별 파일 링크만 갱신한다. 완료·출시된 항목은 상태판에서 지운다. 300줄을 넘기면 그 세션에서 줄인다.
3. 새로운 결정이 있으면 `docs/03-decisions/ADR-NNN.md`(마지막 번호 + 1) 파일을 만들고 `DECISIONS.md` 맨 아래에 한 줄 추가한다.

## 개발 명령어

```bash
npm run dev              # 브라우저 모드 (Vite dev server)
npm run electron:dev     # Electron + Vite 동시 실행
npm run build            # 프로덕션 빌드
npm run electron:build   # Electron 인스톨러 빌드
```

## AI 에이전트 작업 워크플로우

### 기본 원칙: main 단일 워킹트리에서 작업

이 프로젝트는 준일님이 여러 AI 세션을 번갈아 쓰는 경우가 많으므로, 별도 브랜치/`git worktree`/PR 기반 병렬 작업을 기본으로 하지 않는다. 여러 세션이 각자 브랜치나 워킹트리를 만들면 같은 파일을 중복 수정해 충돌이 잦아진다.

**기본 작업 위치는 항상 현재 저장소의 `main` 브랜치다.**

```bash
git branch --show-current  # main 이어야 함
git status --short         # 시작 전 기존 변경 확인
```

### 세션 시작 규칙

1. `git status --short`로 기존 변경사항을 먼저 확인한다.
2. 기존 변경이 있으면 절대 덮어쓰지 말고, 어떤 파일이 이미 수정되어 있는지 요약한 뒤 그 변경을 이어서 작업한다.
3. 새 브랜치, 새 worktree, PR은 사용자가 명시적으로 요청할 때만 만든다.
4. 여러 AI 세션에 병렬 구현을 맡기지 않는다. 병렬이 필요하면 구현이 아니라 **분석/리뷰/계획**만 병렬로 수행한다.

### 작업 단위와 커밋

- 하나의 세션은 하나의 작은 작업 단위만 다룬다.
- 작업이 끝나면 관련 검증을 실행하고, 통과한 범위를 명시한다.
- 커밋은 사용자가 요청하거나 작업 단위가 명확히 완료되었을 때만 만든다.
- PR 생성은 기본 흐름이 아니다. 필요 시 `main`에서 작업을 완료한 뒤 사용자가 요청할 때만 별도 브랜치/PR 전략을 세운다.

### 충돌 방지

- 코드 생성 전 관련 파일을 먼저 읽고 현재 상태를 기준으로 수정한다.
- 대규모 리팩터링 중에는 다른 세션에서 같은 영역을 동시에 수정하지 않는다.
- 문서/카드뉴스/릴리즈 자료처럼 산출물이 많은 작업도 `main`에서 순차적으로 처리한다.

---

## PDCA 문서 구조

- `docs/01-plan/features/` — 기능별 계획서 (.plan.md)
- `docs/02-design/features/` — 기능별 설계서 (.design.md)
- `docs/03-analysis/` — 기능별 분석/QA (.analysis.md)
- `docs/04-report/features/` — 완료 보고서 (.report.md)

## 참고 문서

- `PRD.md` — 제품 요구사항 (574줄, 필요시 참조)
- `SPEC.md` — 기술 명세 (1551줄, 필요시 참조)
- `claude-code-prompts.md` — Phase별 구현 프롬프트 (참고용)
