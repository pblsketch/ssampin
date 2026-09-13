# G004 atomic record-map application evidence

Date: 2026-09-13

## Scenarios

| Criterion                                                | Invocation                                                                                                | Binary observable                                                                                                                                                |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reviewed-only student apply and semantic source conflict | `npx vitest run src/usecases/recordMap`                                                                   | stored latest attempt and review status are re-read before writes; stale attempt and stored unreviewed status both produce zero writes; 9 application tests pass |
| Evidence-first, thread-second partial failure            | same invocation                                                                                           | injected thread write returns false; evidence owner is `undefined`; journal phase is `rolled-back`                                                               |
| Rollback failure and restart recovery                    | same invocation                                                                                           | injected rollback returns false -> `recovery-required`; `RecoverRecordMapApplications` changes phase to `rolled-back`; no thread remains                         |
| Restart at rolling-back endpoint                         | same invocation                                                                                           | journal is `rolling-back` while both files match after; recovery writes both directions backward and ends `rolled-back`, never `committed`                       |
| CAS success followed by readback mismatch                | `npx vitest run src/adapters/repositories/JsonRecordMapApplicationPort.test.ts src/usecases/recordMap`    | adapter returns false; coordinator performs a second evidence write and restores original owner                                                                  |
| Conservative undo                                        | `npx vitest run src/usecases/recordMap`                                                                   | other student's later content remains; later edit to the applied thread returns exact refusal result                                                             |
| Three-student partial batch                              | `npx vitest run src/usecases/recordMap`                                                                   | success/conflict/save-failure are returned separately; an already-applied proposal produces zero apply calls                                                     |
| Fixed scaffold and teacher field preservation            | `npx vitest run src/usecases/recordMap`                                                                   | one fixed scene remains with fixed label, teacher note and topic link preserved, generated scene ID differs from old ID                                          |
| Proposal RMW/CAS and late-response guards                | `npx vitest run src/usecases/recordMap src/adapters/repositories/JsonRecordMapProposalRepository.test.ts` | latest proposal remains after a second RMW; run tests pass                                                                                                       |
| UI explicit review/apply separation                      | `npx vitest run src/adapters/components/RecordDraft/__tests__/RecordMapBatchPanel.test.tsx`               | panel tests pass; UI exposes explicit review checkbox, hold, per-student apply, reviewed-N apply and undo controls                                               |
| Shared lock key registry                                 | `npx vitest run src/usecases/shared/__tests__/fileWriteLock.test.ts`                                      | 8 tests pass; local proposal/application journals are not added to `SYNC_FILE_KEYS`                                                                              |
| Electron CAS error propagation                           | `npx vitest run src/infrastructure/storage/__tests__/storageReadError.test.ts`                            | injected `writeDataIfUnchanged` rejection is observed as rejection                                                                                               |

## Final validation

- Focused suite: 11 test files passed, 83 tests passed.
- TypeScript: `npx tsc --noEmit --pretty false` -> `TSC_OK`, exit code 0.
- Changed-file ESLint: 25 files -> `ESLINT_OK`, exit code 0.
- Whitespace: `git diff --check` -> `DIFF_CHECK_OK`, exit code 0.

## Scope boundary

Browser/Electron real-window interaction and live AI were not run in G004. This attempt proves the domain, storage failure paths, repository RMW behavior, and component behavior in jsdom. Real-window validation remains a separate integration/QA gate.
