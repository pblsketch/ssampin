# 공용 개발 절차

Claude Code·Codex·GJC 공통 규칙이다. 모델별 스킬은 이 절차를 실행하는 안내만 둔다.

1. `git branch --show-current`, `git status --short`로 main과 기존 변경을 확인한다. PROGRESS.md·DECISIONS.md 및 관련 결정 본문을 읽는다.
2. `docs/architecture-rules.md`, `docs/coding-conventions.md`를 읽는다. UI 작업은 `docs/design-system.md`, `.impeccable.md`와 실제 디자인 예시도 확인한다.
3. 작은 수정은 직접 한다. 여러 레이어는 domain/usecases → infrastructure → adapters 순서로 순차 구현한다. 기존 승인 설계를 우선한다. 구현 에이전트를 동시에 돌리지 않는다.
4. 독립적인 분석·리뷰만 하위 에이전트에 병렬 위임할 수 있다. 현재 세션의 도구·역할을 사용하며 모델은 부모 설정을 상속한다. 각 에이전트에 범위·지침·기존 변경 보존을 명시한다.
5. 변경한 동작을 실제로 확인한다. UI는 브라우저/Electron에서 저장·취소·오류·원본 보존을 확인한다. 정적 검사와 실제 기기 확인은 구분한다.
6. 최종 변경 후 `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run regression-check`를 실행한다. 실패를 우회하거나 디자인 불일치를 자동 PASS로 처리하지 않는다.
7. `git diff --check`와 변경 범위를 확인하고 월별 진행 기록에 명령·결과를 남긴다. PROGRESS.md는 300줄 이내 상태판으로 유지한다. 완료·미검증·미배포를 구분한다.

## 환경과 보호 장치

- 현재 도구가 알려 주는 셸을 따른다. Windows라고 항상 Git Bash인 것은 아니다.
- Codex App의 하위 에이전트와 OMX tmux 팀은 별개다. tmux가 없는 App에서는 현재 세션의 질문·에이전트 도구를 사용한다.
- Git 훅은 흔한 위험 명령의 실수 방지 장치이며 임의 셸 전체를 분석하는 보안 경계는 아니다. 전체 stash/reset/clean이나 검사 우회로 다른 작업을 훼손하지 않는다.
- 릴리즈는 [공용 릴리즈 절차](release-workflow.md)를 따른다. 개발 검사 통과가 출시 허가는 아니다.
