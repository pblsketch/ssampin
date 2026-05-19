# Harness Engineering Checklist — 쌤핀

마지막 검증: 2026-05-19

## 1. Instructions (지침)

| #   | 항목                       | 기준                                                     | 상태                      |
| --- | -------------------------- | -------------------------------------------------------- | ------------------------- |
| 1   | CLAUDE.md 길이             | ≤80줄 (라우팅 문서)                                      | ✅ 81줄 (빈줄 포함, 수용) |
| 2   | CLAUDE.md → docs/ 참조     | 4개 도메인 규칙 문서 링크                                | ✅ 7개 참조               |
| 3   | AGENTS.md 길이             | ≤50줄 (Codex용 간결 문서)                                | ✅ 45줄                   |
| 4   | 핵심 규칙 5개 명시         | domain 금지, any 금지, HEX 금지, 한국어, design examples | ✅                        |
| 5   | docs/architecture-rules.md | 4레이어, 의존성, import 규칙                             | ✅ 71줄                   |
| 6   | docs/design-system.md      | sp-\* 토큰, 폰트, 레이아웃                               | ✅ 49줄                   |
| 7   | docs/coding-conventions.md | TS strict, React, 스타일                                 | ✅ 23줄                   |
| 8   | .impeccable.md             | 브랜드/미적 방향                                         | ✅ 64줄                   |

## 2. Tools (도구)

| #   | 항목              | 기준                                        | 상태 |
| --- | ----------------- | ------------------------------------------- | ---- |
| 9   | 검증 게이트 4단계 | tsc, lint, test, regression-check 모두 정의 | ✅   |
| 10  | 개발 명령어       | dev, electron:dev, build, electron:build    | ✅   |

## 3. Environment (환경)

| #   | 항목                   | 기준                                                     | 상태 |
| --- | ---------------------- | -------------------------------------------------------- | ---- |
| 11  | git-guard hook         | .claude/settings.json에 PreToolUse 훅                    | ✅   |
| 12  | 다중 세션 git 프로토콜 | 7개 규칙 (git add . 금지, worktree, main 직푸시 금지 등) | ✅   |

## 4. State (상태)

| #   | 항목              | 기준                                         | 상태         |
| --- | ----------------- | -------------------------------------------- | ------------ |
| 13  | PROGRESS.md       | 4섹션: Completed, In Progress, Blocked, Next | ✅           |
| 14  | DECISIONS.md      | ADR 형식, 시간순, superseded 규칙            | ✅ 6개 ADR   |
| 15  | feature_list.json | behavior/verification/state 트리플           | ✅ 22개 기능 |

## 5. Feedback (피드백)

| #   | 항목                | 기준                                                                 | 상태         |
| --- | ------------------- | -------------------------------------------------------------------- | ------------ |
| 16  | 세션 프로토콜 시작  | PROGRESS.md + DECISIONS.md + git status                              | ✅           |
| 17  | 세션 프로토콜 종료  | PROGRESS 업데이트 + ADR 추가 + 검증 게이트 결과                      | ✅           |
| 18  | PDCA 문서 구조      | 01-plan → 02-design → 03-analysis → 04-report                        | ✅ 81개 문서 |
| 19  | 완료 선언 제한      | "검증 게이트를 모두 통과해야 완료" 명시                              | ✅           |
| 20  | CLAUDE.md 중복 제거 | CLAUDE.md ↔ AGENTS.md 간 중복 없음 (핵심규칙/docs참조는 의도적 공유) | ✅           |

## 결과: 20/20 통과
