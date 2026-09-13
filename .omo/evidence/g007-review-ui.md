# G007 UI/interaction review evidence

Date: 2026-09-13 KST

## Implemented artifacts

- `src/adapters/components/RecordDraft/RecordMapProposalReview.tsx`
  - AI 제안/현재 지도 전환
  - 주제, 뼈대와 선택 이유, 장면 차례/역할, 장면 메모 출처, 장면/주제 이음말
  - 근거 ID 차례와 `button[aria-expanded]` 전문/날짜/출처/교사 메모
  - 자리 미정 원문/이유, 경고, included/excluded/too-long/suppressed 집계
  - 누락 근거/미결 뼈대/원본 변경 표시와 재제안 진입
- `src/adapters/components/RecordDraft/RecordMapBatchPanel.tsx`
  - 학생 단독 retry/source rerun, 고정 뼈대 단일 학생 새 run, 원본 보존
  - 한국어 오류 분류, 적용/검토 차단, 정직한 일괄 적용 집계
  - 실행 중 재진입 1초 polling, 선택 행 aria/current/pressed, 반응형 review grid
- `src/usecases/recordMap/RequeueRecordMapStudent.ts`
  - 기존 제안을 지우지 않고 지정 학생 run item만 queued로 전환
- `src/usecases/recordMap/ApplyReviewedRecordMapBatch.ts`
  - source-changed 결과 유지, recovery-required 뒤 적용 중단
- `src/adapters/components/RecordDraft/RecordEvidenceBoard.tsx`
  - RecordArea별 후보/기본 뼈대 resolver 전달
- `src/domain/rules/recordMapApplication.ts`
  - 현재 term이 정해진 run의 fingerprint에서 다른 학기 주제 제외

## Binary verification

1. Review detail, expansion, gating, retry isolation, area change, failure label, row aria, re-entry, term context, batch conflict/recovery
   - Invocation: `npx vitest run src/adapters/components/RecordDraft/__tests__/RecordMapProposalReview.test.tsx src/adapters/components/RecordDraft/__tests__/RecordMapBatchPanel.test.tsx src/adapters/stores/__tests__/useRecordMapRunStore.test.ts src/usecases/recordMap/__tests__/RequeueRecordMapStudent.test.ts src/usecases/recordMap/__tests__/recordMapRun.test.ts src/usecases/recordMap/__tests__/recordMapApplication.test.ts src/domain/entities/__tests__/RecordMapProposal.test.ts src/domain/rules/__tests__/recordMapProposal.test.ts src/domain/services/__tests__/recordMapSuggestPack.test.ts`
   - Observable: exit 0; 9 files passed; 82 tests passed.
   - Test artifacts: `src/adapters/components/RecordDraft/__tests__/RecordMapProposalReview.test.tsx`, `src/adapters/components/RecordDraft/__tests__/RecordMapBatchPanel.test.tsx`, `src/usecases/recordMap/__tests__/RequeueRecordMapStudent.test.ts`, `src/usecases/recordMap/__tests__/recordMapApplication.test.ts`.
2. Type safety
   - Invocation: `npx tsc --noEmit`
   - Observable: exit 0; TypeScript errors 0.
3. Changed-file lint
   - Invocation: `npx eslint` over the 10 changed UI/usecase/domain files.
   - Observable: exit 0; ESLint errors 0, warnings 0.
4. Patch integrity and token/identity scan
   - Invocation: `git diff --check`
   - Observable: exit 0.
   - Invocation: `rg -n "#[0-9A-Fa-f]{3,8}|subjectId"` over the new review/panel/requeue files.
   - Observable: exit 1 with empty output, meaning no hard-coded HEX and no invented `subjectId` in those artifacts.

## Limits

- This lane did not run an Electron/manual visual scenario. DOM interaction evidence covers the requested UI states; app-wide AI runner serialization and real-provider execution are owned by the separate core/global-runner lane.
- No commit, push, PR, release, or deployment was performed.

## Cleanup regression: policy-aware null scaffold

- Scenario: an existing topic under `existing` policy stores `scaffoldId: null`; AI policy returns the same null because it could not select a candidate.
- Observable: the existing-policy proposal leaves review enabled, while the AI-policy proposal disables both the single review checkbox and reviewed-batch apply button.
- Invocation: `npx vitest run src/adapters/components/RecordDraft/__tests__/RecordMapProposalReview.test.tsx src/adapters/components/RecordDraft/__tests__/RecordMapBatchPanel.test.tsx src/usecases/recordMap/__tests__/recordMapApplication.test.ts`
- Result: exit 0; 3 files passed; 38 tests passed.
- Type/lint/patch checks: `npx tsc --noEmit` exit 0; changed-file `npx eslint ...` exit 0; scoped `git diff --check` exit 0.
- Regression artifacts: `src/adapters/components/RecordDraft/__tests__/RecordMapProposalReview.test.tsx`, `src/adapters/components/RecordDraft/__tests__/RecordMapBatchPanel.test.tsx`.

## Final formatting repair

- Mutation: `npx prettier --write src/adapters/components/RecordDraft/RecordMapBatchPanel.tsx src/adapters/components/RecordDraft/__tests__/RecordMapBatchPanel.test.tsx`; exit 0, only formatting changed.
- Formatting verification: `npx prettier --check` over the review/panel components and their two test files; exit 0, `All matched files use Prettier code style!`.
- Focused regression: the review component, panel, and record-map application suites; exit 0, 3 files and 38 tests passed.
- Patch integrity: scoped `git diff --check`; exit 0.
