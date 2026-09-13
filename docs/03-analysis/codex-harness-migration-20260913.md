# Codex 전환 하네스 개선 (2026-09-13)

## 변경과 범위

- AGENTS.md·CLAUDE.md에서 공용 개발/릴리즈 절차로 연결. Claude 개인 메모리의 출시 운영 지식을 프로젝트 문서로 이전했다. 오너 실기기 확인과 명시한 출시 승인 경계를 보존했다.
- Codex/Claude 개발 스킬의 고정 모델명·존재하지 않는 에이전트 호출·병렬 구현 지시 제거. GJC도 순차 규칙에 맞췄다.
- `scripts/agent-git-guard.cjs`를 Claude와 Codex가 공유한다. 관련 설정과 스킬만 gitignore 예외로 공개해 새 체크아웃에도 전달한다. CLI 실행 입력은 공식 문서상 Bash 별칭으로 훅에 전달된다.
- `npm run test:harness`를 CI에 추가. `npm run check:release-prep`는 버전 6개 비교만 수행하며 서버 변경이나 배포를 하지 않는다.
- OMX 전역 실행 파일과 플러그인 캐시 0.17.3 → 0.21.5. user/plugin 모드 setup 실행. 사용자 AGENTS.md는 자동 덮어쓰기/병합하지 않았다.

## OMX 이전과 보존 확인

- 백업: `C:/Users/wnsdl/.codex/tmp/ssampin-harness-20260913/` (config.toml, hooks.json, AGENTS.md, 기존 Windows shim).
- 구버전의 matcher/신뢰 항목/수정된 shim을 검사하고 새 플러그인 훅 방식으로 이전. 기존 글로벌 OMX 중복 실행 항목을 제거했다. 다른 훅의 좌표가 이동하지 않도록 빈 그룹은 보존했다.
- 구조 비교: 기존 모델·MCP 서버 설정·개인 AGENTS 내용·타 플러그인 신뢰 상태·Paseo 훅 명령과 좌표 모두 보존 확인.
- `omx --version`: 0.21.5. `omx setup --scope user --plugin`: 성공. 플러그인 manifest/cache 버전 일치.
- `omx doctor`: 20 passed, 4 warnings, 0 failed. 네이티브 훅 및 배포된 실행 코드 smoke 검사 통과.
- 경고: 소유자가 불명확한 legacy multi_agent 설정, 중복 개인 스킬 7개, 사용자 AGENTS의 OMX 자동 생성 표시 부재, 이전 OMX 세션 포인터. 개인 설정을 임의로 지우거나 진행 상태를 조작하지 않았다.
- Windows fsync 내구성 경고가 있었으나 setup 성공 후 파일 읽기·버전·진단으로 결과를 확인했다.

## 검증

- `npm run test:harness`: 20/20 통과. 실제 위험 명령 실행 없이 stdin 입력으로 차단/허용 검사. 등록된 Codex 명령을 landing 하위 폴더에서 실행해 공용 보호 코드까지 연결 확인.
- `npm run check:release-prep`: 6/6 통과.
- `git diff --check`: 통과.
- 전체 Vitest 실행: 769파일 통과, 1파일 실패. 10,612테스트 통과, 6실패, 10건 건너뜀. 실패는 `recordDraftPackBaseline.test.ts`의 출력 비교 6건. 로그: `output-harness-vitest.log`.
- 회귀 검사: 116/117 통과. #117의 `recordDraftPack.ts` 패턴 확인 실패. 로그: `output-harness-regression.log`.
- 최초 타입 검사: 별도 작업 중인 `RecordDraftAiPanel.test.tsx`의 exact 옵션 2건 오류. 실행 중 해당 파일이 다른 세션에서 바뀌어 재검사했다. 최종 재실행 `npx tsc --noEmit` 종료 0, 오류 0개. `npm run lint` 종료 0, 오류 0개·경고 136개.
- 앱 소스는 이 작업에서 수정하지 않았다. 공유 워킹트리의 전체 게이트를 통과했다고 선언하지 않는다.

## 적용 경계

- 현재 대화는 구버전 스킬 메타데이터를 보유할 수 있다. 새 Codex 세션에서 0.21.5와 프로젝트 훅을 다시 로드한다. 최초 훅 신뢰 화면이 나타나면 등록한 명령을 확인한다.
- 등록 명령·자식 프로세스 테스트는 통과했지만 새 Codex App 세션의 실제 도구 호출 차단까지 확인한 증거는 아니다.
- Git 훅은 일반적인 직접/연결 명령을 보호한다. 임의의 다른 셸로 감싼 코드 전체를 분석하지 않는다.
- 커밋·푸시·앱 릴리즈·운영 서버/KB 변경은 실행하지 않았다.
