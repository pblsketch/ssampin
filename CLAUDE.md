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

검증 게이트를 모두 통과해야 완료로 간주한다. 에이전트가 자체 판단으로 완료를 선언하지 않는다.

## 세션 프로토콜

### 시작 시

1. `PROGRESS.md` 읽고 현재 상태 파악
2. `DECISIONS.md` 읽고 기존 결정 확인
3. `git status` 확인 — 다른 세션 작업 중인 파일 건드리지 않기

### 종료 시

1. `PROGRESS.md` 업데이트 (완료/진행/블록/다음)
2. 새로운 결정이 있으면 `DECISIONS.md`에 ADR 추가
3. 검증 게이트 결과 기록

## 개발 명령어

```bash
npm run dev              # 브라우저 모드 (Vite dev server)
npm run electron:dev     # Electron + Vite 동시 실행
npm run build            # 프로덕션 빌드
npm run electron:build   # Electron 인스톨러 빌드
```

## PDCA 문서 구조

- `docs/01-plan/features/` — 기능별 계획서 (.plan.md)
- `docs/02-design/features/` — 기능별 설계서 (.design.md)
- `docs/03-analysis/` — 기능별 분석/QA (.analysis.md)
- `docs/04-report/features/` — 완료 보고서 (.report.md)

## 참고 문서

- `PRD.md` — 제품 요구사항 (574줄, 필요시 참조)
- `SPEC.md` — 기술 명세 (1551줄, 필요시 참조)
- `claude-code-prompts.md` — Phase별 구현 프롬프트 (참고용)

## 다중 세션 git 프로토콜

1. 작업 전 `git status` 확인 — M/?? 파일은 다른 세션 작업 중일 수 있음
2. `git add .` / `git add -A` / `git stash` / `git reset --hard` / `git clean -f` 금지 — 항상 명시 경로만
3. 브랜치 전환은 `git worktree`로 — 메인 워킹 트리 브랜치 변경 금지
4. `main` 직푸시 금지 — feature/ 브랜치 → PR → CI 통과 → 머지
5. `npm ci` 금지 — `rm -rf node_modules package-lock.json && npm install`
6. husky pre-commit 훅 통과 필수 — `--no-verify` 금지
7. 충돌/이상 감지 시 강제 밀어붙이지 말고 사용자에게 보고
