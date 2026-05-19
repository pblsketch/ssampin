# AGENTS.md — 쌤핀 (SsamPin) Codex 컨텍스트

> Codex가 프로젝트를 이해할 때 참고하는 문서. Claude Code는 CLAUDE.md를 사용한다.

## 프로젝트

**쌤핀(SsamPin)** — 교사용 데스크톱 대시보드 앱.
Electron + React 18 + TypeScript strict + Tailwind CSS + Vite + Zustand.

## 도메인 규칙 (반드시 참조)

- `docs/architecture-rules.md` — Clean Architecture 4 레이어, import/의존성 규칙, 프로젝트 구조
- `docs/design-system.md` — sp-\* 토큰, 폰트, 레이아웃
- `docs/coding-conventions.md` — TypeScript, React, 스타일 규칙

## 핵심 규칙

1. `domain/` 레이어는 외부 의존성 import 절대 금지
2. `any` 타입 사용 금지
3. 하드코딩 HEX 금지 — `sp-*` 토큰 사용
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

## 검증 게이트

```bash
npx tsc --noEmit          # TypeScript 에러 0개
npm run lint              # ESLint 통과
npm run test              # Vitest 통과
npm run regression-check  # 회귀 체크
```

## 개발 명령어

```bash
npm run dev              # 브라우저 모드
npm run build            # 프로덕션 빌드
```

## 참고

- `PRD.md` — 제품 요구사항
- `SPEC.md` — 기술 명세
- `PROGRESS.md` — 세션 연속성
- `DECISIONS.md` — 아키텍처 결정 기록
