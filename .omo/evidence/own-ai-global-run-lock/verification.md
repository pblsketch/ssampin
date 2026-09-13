# 전역 내 AI 실행 잠금 검증

작업 범위: `electron/ipc/ownAiRunner.ts`, `electron/ipc/ownAiRunner.test.ts`, `electron/ipc/ownAi.ts`, `electron/preload.ts`, `src/global.d.ts`, `src/domain/entities/OwnAiProvider.ts`, `src/domain/rules/ownAiCliRules.ts`, `src/domain/rules/__tests__/ownAiCliRules.test.ts`, `src/adapters/components/RecordDraft/ownAiRun.ts`, `src/adapters/components/RecordDraft/__tests__/ownAiRun.test.ts`, `src/infrastructure/ownAi/OwnAiAssistPort.ts`

## 성공 기준과 증거

- 러너가 초안+초안, 초안+패널, 패널+초안, 패널+패널 중복을 `busy`로 거절하고 두 번째 프로세스를 만들지 않음: `npx vitest run electron/ipc/ownAiRunner.test.ts --maxWorkers=1`; `electron/ipc/ownAiRunner.test.ts` 48개 테스트 통과.
- 정상 종료와 취소 뒤 다음 실행 허용: 같은 러너 테스트의 `정상 종료 뒤에는 다음 실행을 시작할 수 있다`, `취소 처리 뒤에는 다음 실행을 시작할 수 있다`가 통과.
- `busy` 오류를 타입·한국어 안내로 전달: `npx vitest run ...ownAiRun.test.ts ...ownAiCliRules.test.ts --maxWorkers=1`; `askOnce` busy 보존 3개와 오류 문구 검증 포함 총 91개 테스트 통과.
- 기존 패널 브릿지 준비 의미 유지: `npx vitest run electron/ipc/ownAiPort.noServer.test.ts src/usecases/assist/__tests__/withSolarFallback.test.ts --maxWorkers=1`; 2개 파일 16개 테스트 통과.
- TypeScript 오류 없음: `npx tsc --noEmit` 종료 코드 0.
- 변경 파일 lint 통과: `npx eslint electron/ipc/ownAiRunner.ts electron/ipc/ownAiRunner.test.ts electron/ipc/ownAi.ts electron/preload.ts src/domain/entities/OwnAiProvider.ts src/domain/rules/ownAiCliRules.ts src/domain/rules/__tests__/ownAiCliRules.test.ts src/infrastructure/ownAi/OwnAiAssistPort.ts src/adapters/components/RecordDraft/ownAiRun.ts src/adapters/components/RecordDraft/__tests__/ownAiRun.test.ts` 종료 코드 0.
- diff 공백 오류 없음: `git diff --check` 종료 코드 0.
- IPC 거부 뒤 잔존 runId 제거: `src/infrastructure/ownAi/__tests__/OwnAiAssistPort.test.ts`에서 `run` Promise 거부 후 `port.cancel()`이 호출되지 않는 회귀 시나리오 통과.
- 후속 집중 검증: `npx vitest run electron/ipc/ownAiRunner.test.ts src/adapters/components/RecordDraft/__tests__/ownAiRun.test.ts src/domain/rules/__tests__/ownAiCliRules.test.ts src/infrastructure/ownAi/__tests__/OwnAiAssistPort.test.ts electron/ipc/ownAiPort.noServer.test.ts --maxWorkers=1` — 5개 파일, 98개 테스트 통과. 후속 `npx tsc --noEmit`, `npx eslint src/infrastructure/ownAi/OwnAiAssistPort.ts src/infrastructure/ownAi/__tests__/OwnAiAssistPort.test.ts`, `git diff --check` 모두 종료 코드 0.

검증 시각: 2026-09-13 KST
