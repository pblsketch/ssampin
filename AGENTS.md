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
