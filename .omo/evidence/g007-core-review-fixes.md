# G007 core review fixes evidence

Date: 2026-09-13 KST
Scope: record-map domain, storage ports/repositories, apply/undo/recovery and batch use cases, sync recovery barrier, startup recovery hook, and minimal AI provider wiring.

## Binary verification

- Focused core and adapter scenarios
  - Invocation: `npx vitest run src/usecases/recordMap/__tests__/recordMapApplication.test.ts src/usecases/recordMap/__tests__/recordMapRun.test.ts src/domain/rules/__tests__/recordMapProposal.test.ts src/domain/services/__tests__/recordMapSuggestPack.test.ts src/adapters/repositories/JsonRecordMapApplicationPort.test.ts src/adapters/repositories/JsonRecordMapProposalRepository.test.ts src/usecases/shared/__tests__/dataOperationMutex.test.ts src/adapters/components/RecordDraft/__tests__/RecordMapBatchPanel.test.tsx`
  - Observable: exit code 0; 8 test files passed; 79 tests passed.
  - Artifact: this file and the named test sources.
- Type check
  - Invocation: `npx tsc --noEmit --pretty false`
  - Observable: exit code 0; no TypeScript diagnostics.
  - Artifact: this file.
- Changed-scope lint
  - Invocation: `npx eslint` over all changed record-map, sync barrier, DI, and App files.
  - Observable: exit code 0; 0 errors; one pre-existing `App.tsx:1028` hook dependency warning.
  - Artifact: this file.
- Full test suite
  - Invocation: `npm run test`
  - Observable: exit code 0; 786 files passed; 10,762 tests passed; 10 skipped.
  - Artifact: this file.
- Regression scan
  - Invocation: `npm run regression-check`
  - Observable: exit code 0; 117 of 117 checks passed.
  - Artifact: this file.
- Diff hygiene
  - Invocation: `git diff --check`
  - Observable: exit code 0; no whitespace errors.
  - Artifact: this file.

## Acceptance evidence

1. CAS ambiguity and journal truth
   - Scenarios: first evidence write exception, second thread write exception, false-after-mutation, mutate-then-throw first journal write, rollback failure and later recovery.
   - Observable: application tests require both data files to match before `committed` or `rolled-back`; otherwise `recovery-required`; prepared journal remains durable after uncertain first journal write.
   - Artifact: `src/usecases/recordMap/__tests__/recordMapApplication.test.ts`.
2. Missing-file CAS token
   - Scenario: first load with no inquiry-threads file returns normalized empty data plus raw `null`, then CAS succeeds using `null`.
   - Observable: `written` result.
   - Artifact: `src/adapters/repositories/JsonRecordMapApplicationPort.test.ts`.
3. Recovery gate and cloud barrier
   - Scenarios: nonterminal application blocks new apply; unresolved recovery barrier blocks SyncToCloud before Drive access; MainApp invokes recovery through current DI and only caches success.
   - Observable: `recovery-required`, Drive folder call count 0, and startup flag assigned only after no unresolved journal remains.
   - Artifacts: `src/usecases/recordMap/__tests__/recordMapApplication.test.ts`, `src/usecases/shared/__tests__/dataOperationMutex.test.ts`, `src/adapters/di/container.ts`, `src/App.tsx`.
4. Teacher metadata preservation
   - Scenarios: unambiguous replacement preserves note, noteSource, leadIn, leadInNeedsCheck, and evidenceFocus; process-note to result-only fixed scaffold is rejected.
   - Observable: fields remain equal or result code is `invalid-proposal` with zero application journal writes.
   - Artifacts: `src/domain/rules/recordMapApplication.ts`, `src/usecases/recordMap/__tests__/recordMapApplication.test.ts`.
5. Stop race and provider freeze
   - Scenarios: final batch update races a stored `stopped` lifecycle; resumed/generated calls use provider frozen in the run.
   - Observable: lifecycle remains `stopped`, item remains resumable/preserved, and AI request providers are `codex` from stored run data.
   - Artifact: `src/usecases/recordMap/__tests__/recordMapRun.test.ts`.
6. Proposal completeness and manual scaffold state
   - Scenarios: an included evidence ID omitted from topics and unplaced is rejected; AI scaffold `null` is accepted during generation and rejected during application.
   - Observable: `missing-included-evidence` and application-only `scaffold-required`.
   - Artifact: `src/domain/rules/__tests__/recordMapProposal.test.ts`.
7. Proposal audit metadata and atomic repository contract
   - Scenarios: generated proposal records included evidence IDs, exclusion counts, and suppressed memo count; whole-file save API is absent.
   - Observable: exact metadata object assertion and no `saveRecordMapProposals` references in owned production scope.
   - Artifacts: `src/usecases/recordMap/__tests__/recordMapRun.test.ts`, `src/domain/repositories/IRecordMapProposalRepository.ts`.

## AI slop cleanup report

- Behavior lock: focused failure-injection and race tests above.
- Fallback findings: caught write failures are grounded fail-safe boundaries; each is followed by direct two-file readback. No masking fallback remains in changed record-map code.
- Passes: unused whole-file save path deleted; duplicate unsafe contract removed from fakes; error states named explicitly; missing failure tests added.
- Architecture audit: domain imports domain only; record-map use cases import domain plus shared use cases; infrastructure construction stays in DI; UI change is limited to passing the stored request provider.
- Remaining UI work: presentation of omission counts and manual scaffold-required state belongs to the separate UI review lane.
