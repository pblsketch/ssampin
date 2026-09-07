# 관찰 입력 → 주제별 근거 정리 — 구현 분석·검증 기록

- 대상 계획: `docs/01-plan/features/observation-evidence-flow.plan.md` (ralplan 2차 Architect 승인 · Critic APPROVE)
- 실행: GJC ultragoal (session `bd274e18-…`), 단일 구현 담당자 순차 진행. 작업 위치 `main` 단일 워킹트리.
- 이 문서는 단계(S0~S5)가 진행될 때마다 아래에 이어 붙인다.

---

## S0 — 최신 변경 인수와 검증 기준 (2026-09-06)

### 1. 워킹트리 인수 상태

`git branch --show-current` = `main`. 마지막 커밋 `cd05f4cf`(AI 연결 번들 정리).

**커밋되지 않은 선행 작업 두 건을 그대로 이어받는다.** 되돌리거나 덮어쓰지 않는다.

| 선행 작업                                       | 상태                     | 근거                                                                                      |
| ----------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------- |
| 생기부 초안 3차 (`record-draft-uiux-v3`)        | 구현·게이트 완료, 미커밋 | `docs/02-design/features/record-draft-uiux-v3.design.md`, ADR-085, PROGRESS.md            |
| 근거 정리 보드 2차 (`record-evidence-board-v2`) | 구현·게이트 완료, 미커밋 | `docs/02-design/features/record-evidence-board-v2.design.md`, ADR-085 보강 2, PROGRESS.md |

`git status --short` 규모: 수정 32 · 삭제 5 · 신규(추적 안 됨) 다수. 이번 계획이 건드릴 영역과 겹치는 신규/수정 파일:

- 신규: `usecases/studentRecords/collectEvidenceCandidates.ts`(+테스트), `adapters/hooks/useEvidenceCandidates.ts`,
  `RecordDraft/RecordEvidenceBoard.tsx`, `EvidenceCard.tsx`, `EvidenceColumn.tsx`, `EvidenceDrawer.tsx`,
  `RecordEvidenceImportDrawer.tsx`, `evidenceBoardStyles.ts`, `adapters/stores/__tests__/useRecordEvidenceStore.board.test.ts`
- 수정: `adapters/stores/useRecordEvidenceStore.ts`, `usecases/sync/syncRegistry.ts`, `usecases/studentRecords/evidenceImport.ts`,
  `RecordDraft/RecordDraftView.tsx`, `adapters/di/container.ts`
- 삭제: `RecordEvidenceView.tsx`, `InquiryThreadChips.tsx`, `RecordDraftAiButton.tsx` 및 관련 테스트 2건

**다른 세션 동시 작업 여부:** 위 파일들의 마지막 수정 시각은 `2026-09-04 12:05` ~ `2026-09-06 18:50`이다.
S0 인수 시각(2026-09-06 20:1x) 기준 최근 1시간 내 변경된 파일이 없어, 선행 세션이 종료된 뒤의 정적인 워킹트리로 판단한다.
계획 §11에 따라 단계 진행 중 같은 파일이 다시 바뀌면 그 단계를 멈추고 diff를 다시 읽는다.

### 2. 검증 기준선 (이번 변경 이전, 실제 실행 결과)

| 게이트 | 명령                                  | 결과                                                          |
| ------ | ------------------------------------- | ------------------------------------------------------------- |
| 타입   | `npx tsc --noEmit`                    | **0 errors** (exit 0)                                         |
| 린트   | `npm run lint`                        | **0 errors / 137 warnings** (exit 0)                          |
| 회귀   | `npm run regression-check`            | **55 / 55 통과**                                              |
| 테스트 | `npm run test` (vitest, maxWorkers=4) | **688 / 688 파일 통과, 9186 통과 / 10 skip** (exit 0, 326.9s) |

**알려진 기존 불안정 1건 (이번 변경과 무관):**
1차 실행에서 `Error: [vitest-pool]: Worker forks emitted error. / Worker exited unexpectedly` 가 1회 발생해
`687/688 파일`·`9184 통과`·exit 1 로 끝났다. 실패한 테스트는 0건이고, 워커 프로세스 하나가 결과 보고 전에 종료된 것이다.
**동일 명령을 재실행하면 688/688·9186 통과·exit 0** 이므로 이 저장소의 재현되지 않는 워커 크래시로 분류한다.
앞으로 게이트에서 "테스트 실패 0건 + worker fork 크래시" 조합이 나오면 이번 변경 탓으로 돌리기 전에 재실행으로 판별한다.
PROGRESS.md 가 적어 둔 메타 테스트 5초 타임아웃 3건은 이번 기준선 두 번의 실행에서 재현되지 않았다(모두 통과).

기준선 로그: `_workspace/s0-baseline/test-run-2.log`.

### 3. 계획 §3 사실 재확인 (실제 코드 인수)

계획이 참조한 경로 전부가 현재 워킹트리에 존재한다. 줄 번호는 일부 표류했으나 대상 코드는 동일하다.
아래는 S1~S4가 실제로 고쳐야 하는 **현행 동작**을 직접 읽어 확인한 결과다.

| #   | 확인한 현행 동작                                                                                                                                            | 위치                                                    | 영향 단계 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------- |
| A   | `useRecordEvidenceStore.persist` 가 `set({records:next})` 를 repo 저장 **앞에** 한다 → 저장 실패 시 메모리 유령                                             | `useRecordEvidenceStore.ts` `persist`                   | S1        |
| B   | 근거 스토어에 **파일 잠금이 전혀 없다**. `get().records` 로 next 를 계산하고 통째 저장 → 동기화 reload 와 경합                                              | 같은 파일 전체                                          | S1        |
| C   | `add`/`addMany` 에 **sourceId 중복 차단이 없다** → 같은 원본이 두 번 근거가 될 수 있다                                                                      | `add`, `addMany`                                        | S1        |
| D   | `moveToNewThread` 의 주제 생성(`useInquiryThreadStore.add`)이 보상 `try` **밖**이다. 이동 실패만 보상하고 생성 실패/보상 삭제 실패를 구분하지 않는다        | `moveToNewThread`                                       | S1        |
| E   | `moveToThread`/`unclassify` 가 공개 함수 `setThread` 를 await 한다(잠금 도입 시 중첩 위험)                                                                  | 같은 파일                                               | S1        |
| F   | `useInquiryThreadStore.persist` 도 메모리 선반영. `load` 는 오류를 `console.error` 로 흡수하고 `loaded:true` 로 만든다 → 읽기 실패가 빈 목록으로 둔갑       | `useInquiryThreadStore.ts`                              | S1        |
| G   | `useObservationStore.addRecord/updateRecord/deleteRecord` 가 `set(...)` 을 `manage.add/update/delete` **앞에** 한다                                         | `useObservationStore.ts`                                | S1        |
| H   | `ManageObservations` 는 이미 `withFileLock(SYNC_FILE_KEYS.observations)` 안에서 읽기→조립→쓰기를 한다. **이 경계를 그대로 재사용**하고 중첩 획득하지 않는다 | `ManageObservations.ts`                                 | S1        |
| I   | `SYNC_FILE_KEYS` 에 `record-evidence` · `inquiry-threads` 키가 **없다**(현재 4개: studentRecords·attendance·observations·curriculumProgress)                | `syncRegistry.ts:498`                                   | S1        |
| J   | `record-evidence` 동기화 reload 가 `setState({loaded:false})` 후 `load()` 를 호출한다 → 잠금 밖 스냅샷 게시 위험                                            | `syncRegistry.ts` 28-b                                  | S1        |
| K   | `ObservationForm.commitPendingAttachments` 가 파일별 오류를 토스트로 삼키고 `void` 를 반환한다. 성공/실패 파일 구분 불가                                    | `ObservationForm.tsx`                                   | S1        |
| L   | 학생 전환 자동저장이 `pendingFilesRef.current = []` 로 **먼저 비운 뒤** `void commitPendingAttachments(...)` 로 완료를 기다리지 않는다                      | `ObservationForm.tsx` 학생 전환 effect                  | S1·S2     |
| M   | `useRecordSaveStatus.wrapSave` 는 오류를 상태로만 흡수하고 `Promise<void>` 를 반환한다. 담임 호출부는 그 뒤 `resetForm()` 을 실행한다                       | `useRecordSaveStatus.ts:44`, `InputMode.tsx:417`        | S1·S2     |
| N   | `useObservationAttachmentStore.addAttachment` 는 repo `create` 성공 **뒤에** 게시한다. 이 순서는 **유지**한다                                               | `useObservationAttachmentStore.ts`                      | S1        |
| O   | `collectEvidenceCandidates` 의 `studentRecord` 갈래가 **출결·공백 본문을 거르지 않는다**                                                                    | `collectEvidenceCandidates.ts` `listEvidenceCandidates` | S4        |
| P   | 교과 입력 폼 순서는 `날짜 → 분류 → 태그 → 본문 → 장면 → 첨부 → 저장`. 계획 §4.1의 `본문 → 장면 → 주제 → 분류·태그` 로 재배치 대상                           | `ObservationForm.tsx` JSX                               | S2        |
| Q   | 담임 조회 원본 편집(`InlineRecordEditor`/`useRecordInlineEdit`)에 장면 편집 상태가 없다                                                                     | 두 파일                                                 | S2        |

### 4. 이번 계획이 확장할 기존 테스트 (모두 존재 확인)

- `src/usecases/studentRecords/collectEvidenceCandidates.test.ts`
- `src/adapters/components/RecordDraft/__tests__/RecordEvidenceBoard.test.tsx`
- `src/adapters/components/ClassManagement/__tests__/observationSlotLifecycle.test.ts`
- `src/adapters/stores/__tests__/useInquiryThreadStore.test.ts`
- `src/adapters/stores/__tests__/useRecordEvidenceStore.test.ts` · `useRecordEvidenceStore.board.test.ts`
- `src/adapters/stores/__tests__/useObservationStore.slots.test.ts`
- `src/adapters/repositories/JsonObservationAttachmentRepository.test.ts`

### 5. S0 판정

인수 완결. 계획 §6의 "불완전 인수면 계획만 유지" 조건에 해당하지 않는다.
겹치는 파일을 다른 세션이 점유하고 있지 않고, 기준선 게이트가 모두 통과하므로 S1 구현을 시작한다.

---

## S1 — 원본·첨부·주제·근거 저장 안정성 (2026-09-07)

실행: OMC ultragoal (`.omc/ultragoal/plans/obs-evidence-flow/`), 목표 `G001-s1`.
선행 gjc 세션(bd274e18)이 S0까지 마친 뒤 중단되어 같은 main 워킹트리에서 이어받았다.

### 1. 무엇을 바꿨나 — 저장이 실패하면 실패라고 말하게 만들었다

S0 이 확인한 결함 A~N 중 저장 안정성에 해당하는 것을 고쳤다.

| 대상                     | 이전                                                                 | 이후                                                                                |
| ------------------------ | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `useRecordEvidenceStore` | 파일 락 없음. `set()` 을 저장 **앞**에. `get().records` 로 next 계산 | 공용 `withFileLock` 안에서 최신 읽기 → 순수 변환 → 저장 → 게시                      |
| `useInquiryThreadStore`  | 같은 문제 + `load` 오류를 삼켜 빈 목록으로 둔갑                      | 같은 계약 + `loadError` 로 "못 읽음"과 "0건"을 구별                                 |
| `useObservationStore`    | `set()` 이 `manage.add/update/delete` **앞**                         | 저장 성공 뒤에 게시(4경로 전부)                                                     |
| `SYNC_FILE_KEYS`         | `record-evidence`·`inquiry-threads` 키 없음                          | 두 키 추가 + 정합 메타테스트 확장                                                   |
| 동기화 reload            | `setState({loaded:false})` 후 `load()` — 락 **밖** 읽기              | `forceReload()` — 쓰기와 같은 락 안에서 읽고 게시                                   |
| `wrapSave`               | `Promise<void>`, 실패를 상태로만 흡수                                | `Promise<boolean>` 반환                                                             |
| `InputMode.handleSave`   | 저장 실패해도 `resetForm()` 실행 → **본문 소실**                     | 성공했을 때만 리셋                                                                  |
| 중복 차단                | 없음 — 같은 원본이 두 번 근거가 될 수 있었다                         | `studentRef + sourceId` 단위로 `add`·`addMany`·신규 관문 전부 차단                  |
| `moveToNewThread`        | 주제 생성이 보상 `try` **밖**. 실패 종류 구별 없음                   | 생성/이동/보상을 `EvidenceLinkError.stage` 로 구별. 보상은 "아직 아무도 안 쓸 때만" |

신규 공개 관문 `ensureEvidenceFromSource` — 원본 하나당 근거 하나를 보장한다.
이미 있으면 **id 를 재사용하고 본문·영역·AI 제외를 보존**한다(교사가 다듬은 근거를 원본으로 덮지 않는다).
같은 키인데 출처 종류·수업반이 다르거나 이미 2개 이상이면 임의로 고르지 않고 거부한다.

### 2. 잠금 순서 — 주제 → 근거, 역순 없음

- 공개 함수는 필요한 락을 **정확히 한 번** 잡고, 안에서는 락을 잡지 않는 순수 helper 만 부른다.
  `moveToThread`/`unclassify` 가 공개 `setThread` 를 await 하던 중첩 경로를 없앴다.
- 두 파일이 필요한 곳은 두 군데뿐이다. 둘 다 주제→근거 순서다.
  - 보상 삭제의 "쓰고 있나" 검사(`removeIfUnused`) — 주제 락 안에서 근거 락.
  - 입력 관문의 주제 검증 — 주제 락에서 검증 후 **풀고** 근거 락.
- 근거 락 안의 "저장 직전 주제 재검사"는 **락 없이 읽기만** 한다(`readThreadUnlocked`).
  여기서 주제 락을 잡으면 근거→주제가 되어 순서가 뒤집힌다. 주석으로 이유를 남겼다.

### 3. 검증 — 디스크 readback 으로 판정

신규 `src/adapters/stores/__tests__/recordEvidenceSourceLifecycle.test.ts` (23케이스).
메모리가 아니라 가짜 저장소의 실제 내용을 다시 읽어 확인한다.

| 잠근 것 | 케이스                                                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| AC-04   | 주제 미선택 = 근거 1·미분류 / 주제 선택 = 근거 1·연결                                                                                 |
| AC-06   | 저장 실패 시 메모리 유령 0 · 파일 0. 재시도해도 근거 1개                                                                              |
| AC-07   | 저장을 실제로 겹치게 만든 동시 2회 요청 → 근거 1개, 같은 id. 다른 학생은 별개 보존                                                    |
| AC-08   | 읽기 실패는 저장 0회이고 남의 근거가 살아남는다. `loadError` 로 0건과 구별                                                            |
| AC-08   | `moveToThread`·`unclassify`·`moveToNewThread` 가 3초 안에 종료(교착 0). 동시 쓰기 3건이 서로를 삼키지 않음                            |
| AC-09   | 생성 실패 = `stage:'thread-create'` · 이동 실패 = `evidence-link`+`compensation:'removed'` · 남이 쓰기 시작한 주제 = `'kept'` 로 보존 |
| AC-19   | 저장 중 들어온 동기화 reload 이후 파일과 메모리가 일치                                                                                |
| 재사용  | 교사가 다듬은 본문·영역·AI 제외가 재호출로 덮이지 않고 주제 연결만 바뀐다                                                             |

**테스트가 진짜인지 확인했다.** `withFileLock` 의 체인을 일시적으로 무력화하니
동시성 케이스 2건이 정확히 실패했고(`동시 2회 → 2개`, `동시 쓰기 3건 → 1개`), 락을 되돌리니 다시 통과했다.
통과만 보고 넘기면 아무것도 검증하지 않는 테스트를 남길 수 있어 이 확인을 넣었다.

### 4. 첨부 — 파일별 결과 계약

신규 `src/adapters/hooks/observationAttachmentCommit.ts`. 두 입력 화면이 같은 구현을 쓴다.

| 이전                                                         | 이후                                                                                |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| 파일별 오류를 토스트로 삼키고 `void` 반환                    | `{ succeeded: [{pendingKey, attachmentId}], failed: [{pendingKey, message}] }` 반환 |
| 이름·배열 위치로 식별                                        | 고르는 순간 붙인 **`pendingKey`** 로 식별                                           |
| 부분 실패해도 대기 목록을 통째로 비움                        | 성공분만 빼고 **실패분은 남겨** 다시 시도                                           |
| 학생 전환 시 `pendingFilesRef` 를 먼저 비우고 `void` 로 커밋 | 캡처 후 **완료를 기다리고**, 실패분은 이전 학생·기록 id 와 함께 보관                |

`pendingKey` 가 필요한 이유는 실제 상황에서 나온다 — 같은 이름 파일을 두 번 고르는 일이 흔하고,
일부만 성공한 뒤 목록에서 빼면 배열 위치가 밀린다. 테스트로 이 경우를 직접 잠갔다
(`같은 이름 파일이 둘이어도 pendingKey 로 정확히 실패분만 남는다`).

재시도는 **확보한 recordId 로 그 단계부터** 한다. 새 기록을 만들지 않는다.
학생 전환 자동저장의 실패는 화면 학생이 이미 바뀐 뒤에 알게 되므로, 토스트의 [첨부 다시 시도] 가
캡처한 이전 학생 맥락으로 동작한다.

신규 `src/adapters/hooks/__tests__/observationAttachmentCommit.test.ts` (8케이스).

### 5. S1 게이트 결과

| 게이트 | 명령                       | 결과                                                          |
| ------ | -------------------------- | ------------------------------------------------------------- |
| 타입   | `npx tsc --noEmit`         | **0 errors**                                                  |
| 린트   | `npm run lint`             | **0 errors / 137 warnings** — 기준선과 동일(새 경고 0)        |
| 회귀   | `npm run regression-check` | **55 / 55**                                                   |
| 테스트 | `npm run test`             | **690 / 690 파일 통과, 9217 통과 / 10 skip** (exit 0, 112.9s) |

기준선은 688파일·9186통과였다. 이번에 새 테스트 파일 2개(31케이스)를 더했고
688+2=690, 9186+31=9217 로 **정확히 일치한다** — 기존 테스트가 하나도 깨지지 않았다는 뜻이다.
S0 이 적어 둔 worker fork 크래시는 이번 두 번의 전체 실행에서 재현되지 않았다.

린트 경고가 기준선 그대로인지 확인한 이유: 처음 만든 첨부 헬퍼가 adapters→infrastructure
import 경고를 하나 늘렸다. `pendingKey` 는 저장되지 않는 화면 안 식별자라 UUID 가 필요 없어
세션 카운터로 바꿔 경고를 없앴다(아키텍처 규칙 위반을 남기지 않는다).

### 6. 남긴 것 — 이번 단계에서 하지 않은 일

- 계획이 제안한 조정 훅은 **순수 함수**로 먼저 만들었다(`src/adapters/hooks/observationEvidenceSave.ts`,
  `runObservationEvidenceSave`). React 밖에 두어 각 단계 실패를 주입해 따로 검증할 수 있게 했다.
  화면(훅 래퍼)은 S2 의 입력 재배치와 함께 붙인다 — 두 번 고치지 않기 위해서다.

  **이 조정 함수를 만들며 테스트가 내 버그를 하나 잡았다.** 첨부가 전부 성공한 뒤 재시도하면
  이미 붙은 파일을 다시 올렸다 — `attachmentsPending` 이 비었다는 사실만으로는 "전부 성공"과
  "아직 안 함"을 구별할 수 없었기 때문이다. `attachmentsAttempted` 를 두어 구별한다.
  신규 `src/adapters/hooks/__tests__/observationEvidenceSave.test.ts` (11케이스)가 이 경우를 잠근다.

- `moveToThread`(보드 열 끌어놓기)에는 "열린 주제만" 규칙을 넣지 않았다. 계획 §4.2 의 그 규칙은
  **입력 중 주제 연결** 대상이고, 보드는 마친 주제 열도 다룰 수 있어야 한다. 그래서
  `assertLinkable(..., { requireOpen })` 로 갈라 두고 신규 관문에서만 켰다. 기존 보드 동작 불변.
- 첨부 재시도는 토스트 동작으로만 붙였다. 대기 목록에 남은 실패 파일의 화면 표시는 S2 다.

---

## S2 — 본문 우선 입력과 선택 주제 (2026-09-07, 진행 중)

설계는 프론트엔드 디자인 에이전트와 함께 했다(단독 진행 금지 규칙).
산출물: `docs/02-design/features/observation-input-topic-picker.design.md` (375줄).

### 1. 설계자가 내 전제 3개를 고쳐 준 것 (실제 코드로 확인함)

프롬프트에 "주의하라"고 적어 보낸 것 중 셋이 **틀린 걱정**이었다. 그대로 믿지 않고 코드로 확인했다.

| 내가 걱정한 것                                                  | 실제                                                                                                                                                               | 확인 방법                                                |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `bg-sp-accent text-white` 는 라이트 모드에서 흰 글씨가 사라진다 | `index.css` 에 `.bg-sp-accent.text-white { color: var(--sp-accent-fg) }` 자동 대비 규칙이 있는 **보호된 쌍**이다                                                   | `index.css` 510행대 직접 확인                            |
| 대화상자에 `data-sp-floating` 을 붙여야 한다                    | 회귀 #64 는 `data-sp-floating` · `data-sp-overlay-surface` · `role="dialog"` 중 **아무거나** 인정한다. 공용 `Modal` 은 이미 `data-sp-overlay-surface` 를 갖고 있다 | `regression-grep-check.mjs` 776·903행, `Modal.tsx` 101행 |
| 새 대화상자에 포커스 트랩을 직접 만들어야 한다                  | 공용 `Modal` 이 이미 `focus-trap-react` 기반이다                                                                                                                   | `Modal.tsx` 1행                                          |

설계자는 또 보드의 기존 `InquiryThreadCreate`/`createPopover` 에 **실제 포커스 트랩과 포커스 복귀가 없다**는 것을 찾아냈다.
그래서 그 패턴을 베끼지 않고 공용 `Modal` 을 쓴다(AC-18 의 focus trap·Esc·원래 포커스 복귀 요구).

### 2. 설계자가 남긴 판단 8건에 대한 결정

| #   | 항목                         | 결정                                  | 이유                                                                                                                                                     |
| --- | ---------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 날짜 모드 위치               | **그대로 둔다**(아코디언에 넣지 않음) | 저장 결과를 바꾸는 조작이다. 접어서 숨기면 여러 날 저장을 모르고 누른다                                                                                  |
| 2   | 새 주제 생성 시점            | **(A) 지연 생성**                     | 계획이 "확정 전 저장소 쓰기 0회", "실제 생성은 기록 저장 후 연결 단계"라고 못 박았다                                                                     |
| 3   | 대화상자 파일 분리           | **별도 파일**                         | 선택기 본체가 이미 240줄이다                                                                                                                             |
| 4   | 주제 10건 이상               | 8건까지 보이고 [더 보기]              | 목록이 화면을 다 먹지 않게                                                                                                                               |
| 5   | 분류 요약 문구               | `분류: {값} · 태그 {N}개`             | 설계자 제안 그대로                                                                                                                                       |
| 6   | `useRecordInlineEdit` 호출부 | grep 으로 재확인함                    | `InlineRecordEditor` 는 **6곳**, 훅은 3곳. `InputMode` 는 훅을 안 쓴다(설계자 지적 맞음). `StudentRecords.tsx` 에는 **동명의 다른 컴포넌트**가 따로 있다 |
| 7   | 담임 도움말 아이콘           | 툴팁 대신 **보이는 안내 줄**          | hover 전용 `title` 은 스크린리더에 안 뜬다. 툴팁 장치를 새로 만드는 것보다 한 줄이 낫다                                                                  |
| 8   | "마친 주제 포함" 위치        | 목록 아래                             | 기본 흐름을 가리지 않게                                                                                                                                  |

### 3. 지금까지 한 것

- 신규 `RecordDraft/ObservationTopicPicker.tsx` + `ObservationTopicCreateDialog.tsx`
  - 계획 §4.2 의 상태 전부: 기본 / 학생 미선택 / 로딩 / 로딩 실패·다시 시도 / 마친 주제 / 학생 전환 / 다학생·다날짜 / 본문 없음
  - **마친 주제는 다시 열기가 성공한 뒤에만 연결**한다. 실패하면 그 항목 옆에 오류를 남긴다(토스트 아님 - 어느 항목이 실패했는지 알아야 한다)
  - 새 주제는 **이름만** 들고 있는다. 확정해도 저장소에 쓰지 않는다
- 교과 입력 `ObservationForm.tsx` 재배치
  - `날짜 → 관찰 내용 → 장면 → 주제 연결 → (접힌)분류·태그 → 첨부 → 저장`
  - 본문에 `<label>` 을 붙이고 안내 문구를 계획 §4.1 문장으로 교체
  - **학생을 바꾸면 고른 주제를 반드시 지운다** - 남기면 다음 학생 근거가 앞 학생 주제에 묶인다
  - 저장 성공 뒤에만 근거로 올리고 주제에 잇는다. 연결이 실패해도 **원본은 되돌리지 않는다**

신규 테스트 `RecordDraft/__tests__/ObservationTopicPicker.test.tsx` (12케이스).

### 4. 담임 입력 재배치와 원본 수정 장면 편집 (이어서 완료)

**담임 입력 `InputMode.tsx`** — 중앙 열을 계획 §4.1 순서로 옮겼다.

```
분류 상태 줄(항상 보임) → 관찰 내용 → 말로 쓰기 → 관찰 장면
→ 주제 연결 → [접힌] 분류·상세 정보 → 여러 날 등록 → 첨부 → 저장
```

- 담임은 분류가 상담 방법·후속 조치를 결정하므로 교과처럼 통째로 접을 수 없다.
  **고른 값은 맨 위 한 줄에 항상 보이고 상세 입력만 접는다.** 두 자리는 같은 펼침 상태를 공유한다.
- **여러 날 등록은 접이식 안에 넣지 않았다.** 설계자가 판단을 남긴 항목인데, 저장 결과를 바꾸는
  조작이라 접어서 숨기면 여러 날 저장을 모르고 누른다.
- 주제 연결은 **학생 하나·날짜 하나일 때만** 제공한다. 여러 학생·여러 날짜면 선택 UI 자체를
  그리지 않고 "저장 후 학생별 근거 보드에서 묶어 주세요"로 바꾼다. 한 주제를 여러 학생에게
  복사하면 남의 주제에 남의 근거가 붙는다.
- `resetForm` 에서 주제 선택을 반드시 지운다(장면과 같은 이유).

**담임 원본 수정의 장면 편집** — 입력과 같은 장면 목록을 원본 수정에서도 고칠 수 있게 했다.

호출부를 전수 확인한 결과 설계자가 본 것보다 많았다:

| 대상                                         | 개수                                                                        | 처리                                        |
| -------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------- |
| `InlineRecordEditor` 호출부                  | 4곳(`DefaultRecordListView`·`StudentTimelineView`·`ReviewMode`·`InputMode`) | 전부 장면 props 연결                        |
| `useRecordInlineEdit` 사용처                 | 3곳(`DefaultRecordListView`·`SearchMode`·`StudentTimelineView`)             | 훅에 장면 상태 추가                         |
| `StudentRecords.tsx` 의 `InlineRecordEditor` | 1곳                                                                         | **동명의 다른 컴포넌트**다. 건드리지 않았다 |

`InputMode` 는 훅을 쓰지 않고 자체 상태를 들고 있어 따로 붙였다(설계자 지적 그대로).
새 props 는 전부 옵셔널이라 넘기지 않는 호출부는 지금과 똑같이 동작한다.

★저장할 때 **정규화 후 빈 배열이면 키를 아예 넣지 않는다.** 부재와 빈 배열은 다르다 -
빈 배열을 저장하면 동기화 병합에서 다른 기기의 장면을 덮는다. 입력 경로와 같은 규칙이다.
★출결 기록에는 장면 UI를 그리지 않는다. 장면은 비출결 개념이고 출결 저장 경로는 건드리지 않았다.

### 5. 다른 세션과 겹친 일 (기록해 둔다)

전체 테스트 도중 `src/domain/rules/__tests__/narrativeParagraphs.test.ts` 2건이 실패했다.
**내 변경 탓이 아니었다.** 판정 근거:

1. `narrativeParagraphs.ts` 는 **import 가 하나도 없다** - 내가 고친 어떤 것에도 의존하지 않는다.
2. 파일 수정 시각이 07:04:13, 테스트 파일이 07:06:12 였다. 내가 그 테스트를 실행한 시각이 07:06:04 이다 -
   **실행 도중에 파일이 바뀌었다.**
3. 잠시 뒤 다시 실행하니 케이스 수가 14 → 19 로 늘고 전부 통과했다.

다른 세션이 그 파일을 쓰는 중이었고 내 실행이 그 중간 상태를 잡은 것이다.
계획 §11 대로 **그 파일은 건드리지 않았다.** 남의 미완성 작업을 "고치면" 그쪽 작업이 깨진다.

---

## S3 — 같은 학생·주제로 화면 왕복 (2026-09-07, 완료)

커밋 `903168c1`(토대) · `8251200f`(교과 저장→보드) · `fb487a72`(보드→입력) · `76f19ed2`(담임+주제 표시).

### 1. 요청을 남기고 한 번만 소비한다

저장 직후 [근거 보드에서 보기] 는 **대상이 준비되기 전에** 눌린다. 그래서 바로 이동하지 않고
`RecordFlowIntent` 를 남긴 뒤 명단이 로드되면 처리한다. 세 가지를 테스트로 잠갔다.

| 상황             | 처리                                          | 왜                                                                     |
| ---------------- | --------------------------------------------- | ---------------------------------------------------------------------- |
| 명단 로딩 중     | `pending` — 버리지 않고 기다린다              | 로딩 중이라는 이유로 이동을 놓치면 저장 직후 누른 조작이 사라진다      |
| 이미 처리한 요청 | `consumed` — 다시 하지 않는다                 | 리렌더마다 재처리하면 사용자가 다른 학생을 골라도 화면이 튕겨 돌아간다 |
| 지워진 학생      | `student-missing` — 첫 학생에게 붙이지 않는다 | 조용히 남의 기록을 여는 사고다                                         |

★**소비 검사를 명단 검사보다 먼저** 한다. 순서를 바꾸면 소비된 요청이 명단 로딩 중에 되살아난다.
★소비 기록은 `ref` 에 둔다. state 는 갱신이 비동기라 같은 렌더 흐름에서 두 번 처리된다.

### 2. 이동 전에 저장 대기분을 기다린다

초안은 700ms 뒤에 저장한다. 그 사이 이동하면 **저장 안 된 글을 두고 화면이 바뀐다.**

- `persist`·`flush` 가 성공 여부를 돌려주게 바꾸고, 입력칸이 스스로 등록소에 등록한다.
  저장을 아는 것은 칸이고 이동을 정하는 것은 상위 화면이라, 상위가 칸마다 ref 를 들면 배선이 늘어난다.
- 등록은 마운트당 한 번이고 호출은 ref 로 최신 flush 를 쓴다. 매 렌더 등록/해제하면
  **이동이 걸린 순간 등록이 잠깐 비어** 저장을 놓친다.
- 한 칸이 실패해도 나머지를 건너뛰지 않는다. 전부 시도하고 결과만 모은다.
- 모든 왕복 이동이 **하나의 전환 함수**를 지난다. 새 CTA 가 기존 보호를 우회하지 못하게 하는 장치다.

### 3. 화면 배선

| 방향        | 교과                                                           | 담임                             |
| ----------- | -------------------------------------------------------------- | -------------------------------- |
| 맥락 주인   | `ClassRecordTab`                                               | `HomeroomPage`                   |
| 저장 → 보드 | 토스트 [근거 보드에서 보기]. 주제에 연결됐으면 이름까지 말한다 | 같음(단일 학생·단일 날짜일 때만) |
| 보드 → 입력 | 열 [관찰 이어 쓰기] · 카드 [원본 보기·수정]                    | 같은 컴포넌트를 공유             |

★[관찰 이어 쓰기] 는 **빈 본문**이다. 주제만 미리 골라 준다. 기존 글을 복사하지 않는 것이 요점이다.
★[원본 보기·수정] 은 카드의 기존 [수정](근거 다듬기)과 **다른 일**이라 나란히 두고 문구로 구별했다.
★마친 주제에는 [관찰 이어 쓰기] 를 그리지 않는다. 다시 열어야 묶을 수 있다.

### 4. 최근 기록의 주제 표시

주제 이름 / '주제 미지정' / '주제 확인 중'. **판정 근거는 원본이 아니라 저장된 근거**다(ADR-086 결정 2).
`studentRef` 로 한 번 더 거른다 — `sourceId` 만으로 찾으면 다른 학생의 근거를 집는다.

---

## S4 — 원본 비교·명시 반영 (2026-09-07, 저장 계약만 완료)

커밋 `b3f3a764`. **비교창 화면은 미착수.**

### 1. 한 것

- 비교 순수 함수(`domain/rules/evidenceSourceComparison.ts`) — 정규화·차이 판정·적용 직전 재검증.
- 스토어 `applySourceFields` — 쓰기 직전 양쪽 재읽기 후 캡처와 대조. 바뀌었으면 **쓰기 0회**.
- 자동 거울 후보에서 **출결·공백 본문 제외**(AC-17).

정규화 수위가 핵심이다. 줄바꿈만 통일하고 띄어쓰기는 보존한다 — 자세한 이유는 ADR-086 결정 5.

### 2. 안 한 것 (다음 세션)

- `EvidenceSourceComparisonDialog` — 왼쪽 '현재 원본' / 오른쪽 '정리한 근거', 기본 '현재 근거 유지'.
- 근거 카드의 '원본과 내용이 달라요' + [비교하기], 상세의 '원본과 내용 같음'.
- 계획 §5.3 상태표의 나머지 문구: 원본 로딩/실패/없음, 빈 본문·출결로 바뀐 원본, 삭제 안내 4갈래, 5초 되돌리기.
- `useEvidenceSourceState` 훅(원본 수집 = adapter 책임).

★`applySourceFields` 는 `readLatestSource` 를 **주입받는다.** 스토어가 관찰·담임 저장소를 직접
알지 않게 하려는 것이고, 훅이 그 함수를 만들어 넘기면 된다.
