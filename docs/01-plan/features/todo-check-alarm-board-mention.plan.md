상태: **pending approval**

# 할일 기능 확장 4건 — 구현 계획서 **rev.3**

**모드: RALPLAN-DR / deliberate · 합의 루프 3라운드(목표: APPROVE)**
**작성일: 2026-08-21 · 대상 브랜치: main (공유 워킹트리) · 저장 위치: docs/01-plan/features/todo-check-alarm-board-mention.plan.md**

> 읽는 분께: 이 문서는 코드를 고치지 않습니다. "무엇을, 어떤 순서로, 무엇이 되면 끝난 것으로 볼지"만 정합니다. 기술 용어에는 쉬운 뜻을 붙였습니다.

---

## 0. 개정 이력

### 0-1. Critic §5 22건 대응표

#### 🔴 반드시 (5건)

| #     | 대상                             | rev.3에서 무엇을 어떻게 바꿨나                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | **P0-A — 알람 훅 배치**          | rev.2 552행 *"`src/App.tsx` — `useTodoAlarmOsPush()` 한 줄 추가"*를 **`src/App.tsx`의 `MainApp()`(764행) 안**으로 확정. 근거를 실측으로 적음 — `App()`은 **570행의 훅 없는 분기 함수**이고, `?mode=widget`·`?mode=icon`·빠른입력·스티커·멀티설문공유 창이 **전부 `index.html`을 공유**한다(`main.ts:696·841·1894·2386·2824`, `src/main.tsx:17-23`). §A-3 결정 3의 "콜드 부팅 0건" 표를 **시작 모습 × `memorySaverMode` 2축**으로 다시 그렸다(§A-3 결정 3-2). rev.2가 "시작 모습 3종"이라고만 쓴 것은 memorySaver OFF 경우까지 0건인 것처럼 읽혔는데, 실제로 0건이 되는 것은 **memorySaver ON일 때뿐**이다                                                                                       |
| **2** | **P0-A 강제 수단**               | 계약 테스트를 **하나에서 둘로** 늘렸다. ★그리고 rev.2가 인용한 모델을 잘못 읽었음을 정정한다 — `electron/sidePinEntry.contract.test.ts`는 **의존 그래프 테스트가 아니라 소스 텍스트를 잘라 단언하는 테스트**다(`readFileSync` → `main.indexOf(...)`로 구간 슬라이스 → `toContain`/`not.toContain`, 33-38행). 이 관용구를 그대로 쓰면 *"`App()` 본문(570~591행 구간)에 `useTodoAlarmOsPush` 문자열이 없고 `MainApp()` 구간에는 있다"*를 **정확히 검사할 수 있다.** §A-3 결정 2에 각주 추가 — 위젯·아이콘은 `MainApp`과 같은 번들이라 **진입점 의존 그래프로는 원리적으로 구분 불가**하며, 그래서 소스 구간 단언을 쓴다                                                                           |
| **3** | **N-3 + P1-D — 완료 항목**       | §A-3 결정 4의 판정 표에 **`completed` 축**을 넣었다: _"`inferStatus(todo) === 'done'`이면 자동 보드에 표시하지 않는다."_ M2 파일 설명에 *"`bucketOf`는 `todoRules.inferStatus`(211행)를, 드래그 적용은 `todoRules.applyStatusChange`(217행 — 서브태스크까지 동기화)를 **재사용**한다. `status`를 직접 만들지 않는다"*를 명시. 실측 확인: 기존 수동 칸반(`KanbanView.tsx:7-9,35,45-47,70-74`)이 정확히 `filterActive`+`inferStatus`+`applyStatusChange` 조합을 쓴다 — 자동 보드는 **같은 조합을 쓰기만 하면 된다.** M2 완료 판정에 두 줄 추가(판정 3·9)                                                                                                                                          |
| **4** | **P0-B — 알람 스위치 저장 위치** | §A-3 **결정 7-5 신설**: _"알람 설정은 `settings.json` 안이라 **Drive로 기기 간 공유**된다. Google Tasks에 안 올린다는 것과 별개 문제다."_ 실측 확인 — `Settings.ts:6,741`이 `TodoSettings`를 품고, `useSettingsStore.ts:555-557`이 병합, `:573`이 `saveSettings`, `syncRegistry.ts:63,66-67`에서 `settings`는 **SYNC_REGISTRY 1번 항목**이며 `subscribeExcluded`는 *자동 업로드 구독*만 제외한다(같은 파일 35행 주석이 *"subscribeExcluded인 도메인(settings 등)도 다운로드 후 reload가 필요하다"*고 직접 적어 놓았다). ADR Consequences·§B-6 M4 1순위·**D-1 오너 질문 1**에 반영. 되돌리기 1순위에 *"동기화되는 설정이라 다른 기기의 오래된 사본이 나중에 저장되면 되살아날 수 있다"*를 덧붙임 |
| **5** | **N-6 — 상태 축 stale 발화**     | **Architect Synthesis 1을 채택했다.** `selectDue(buckets, now, firedIds, **isStillValid**)`로 술어를 주입하고, 껍데기(`reminder.ts`)가 발화 직전 `todos.json`을 읽어 *"그 `todoId`가 존재하고 `completed !== true`"*를 확인한다. 순수 코어는 그대로 테스트 가능하다. 선례 실측: `main.ts:579` `path.join(getContentRoot(), 'data')`로 main이 이미 데이터 폴더를 알고, `archiveManager.ts:499,503,663-664`가 도메인 JSON을 `readFileSync`+`JSON.parse`로 직접 읽는다 — **레이어 침범이지만 이 저장소에 이미 있는 침범**이다. 완료 판정 11에 **반대 방향** 추가: _"스냅샷에 있으나 현재 `todos.json`에 없거나 완료된 할일은 발화하지 않는다."_ Pre-mortem에 **시나리오 5**로 승격                 |

#### 🟠 승인 전 정리 (11건)

| #      | 대상                         | rev.3에서 무엇을 어떻게 바꿨나                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------- | ------------ | --------- | ----------- | ---------- | ----------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **6**  | **N-1 — 허구 게이트**        | M0 완료 판정 7과 §A-5(1) 마지막 행에서 *"`Date`·`crypto`를 안 쓴다"*를 **삭제**하고 *"외부 import를 안 쓴다"*로 축소. 실측 확인 — `domainPurity.meta.test.ts`에 `Date`·`crypto`·`randomUUID` 문자열 **0건**이고 구조는 `importSpecifiers()`(35행)→`isAllowed()`(50행)뿐이다. **★그리고 Critic 지시를 문자 그대로 이행하면 안 되는 것을 찾았다** — `scripts/regression-grep-check.mjs`에 _"`src/domain/rules/todo_.ts`에 `new Date(`·`Date.now(`금지"*를 넣으면 **기존`todoRules.ts`의 8건**(56·67·82·86·90·132·158·196행)에 걸려 `npm run regression-check`가 **손도 안 댄 파일 때문에 즉시 빨간불**이 된다. 그래서 rev.3은 `absenceChecks`의 `fileFilter`필드를 써서 **신규 4파일만** 겨냥한다(§B M0 참조). 아울러 *"실질 방어선은`todoTime.test.ts`의 오프셋 0/+540/-300 케이스"\*라고 안전망의 실재 위치를 정확히 적었다 |
| **7**  | **N-2 — `TodoWidget.tsx`**   | rev.2 M1 405행의 "제거" 지시를 **철회**하고 *"`src/widgets/items/TodoWidget.tsx`는 **이 계획의 관심 대상이 아니다.** `registry.ts:13`이 import하고 `:292`가 `component: TodoWidget`으로 실사용 중이므로 **파일을 삭제하지 않는다.** 프라이버시 테스트 대상만 `DashboardTodo`·`SidePinWidgetZone`으로 옮긴다"*로 교체. 404행의 `Tasks.tsx`와 뜻이 다름을 문장으로 구분했다 — `Tasks.tsx`는 **계획서 파일 목록에서만 뺀다**(참조 0건 실측 확인, `grep -rn "items/Tasks" src/` 무결과)                                                                                                                                                                                                                                                                                                                                         |
| **8**  | **N-15 — 화이트리스트 오해** | M0 361행을 *"`useTodoStore.ts:27`은 런타임 필터가 아니라 `Partial<Pick<Todo, …>>` **타입**이다. 빠지면 `tsc`가 잡는다(요란한 실패)"*로 교체. 실측 확인 — 27행 전문에 `'text'                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 'priority'                                                                                                        | 'category' | 'recurrence' | 'dueDate' | 'startDate' | 'subTasks' | 'sortOrder' | 'time' | 'status' | 'completed'`, `'notes'`없음. 189-190행이`syncedChanges`를 그대로 스프레드한다. `useTodoStore.localOnly.test.ts`의 목적을 *"새 필드가 `saveTodos`까지 도달한다"\*로 재정의 |
| **9**  | **P1-C — 지평·상한**         | `buildTodoAlarmSchedule(todos, settings, nowMs, offsetMinutes, graceMs, **horizonDays = 14**)`로 지평 인자 추가. `alarmDailyCap`은 **`fireAt`을 현지 시간대로 환산한 날짜별**로 적용함을 도메인 규칙에 명시. `todoAlarmRules.test.ts`에 _"이틀 × 각 10건 → 각 날 8건씩, 합계 16건"_ 케이스 추가                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **10** | **N-5 — 없는 테스트**        | `JsonTodoRepository.test.ts`·`useTasksSyncStore.*.test.ts`를 **(신규)**로 정정. 실측 확인 — `src/adapters/repositories/__tests__/`에는 `JsonSeatingSnapshotRepository.test.ts` **하나뿐**이고 `src/adapters/stores/__tests__/`에 todo·tasks 관련 **0건**. §A-5(4) 표에 *"할일 스토어·리포지토리의 현재 자동 커버리지는 0이다 — repository mock과 zustand 리셋 하네스부터 만든다"*를 적었고, M0 공수 서술에 이 사실을 반영했다                                                                                                                                                                                                                                                                                                                                                                                               |
| **11** | **N-7 + P2-E — 관측**        | `[notify]`를 `electron/nativeDesktopDiag.ts` 패턴으로 확정 — `userData/notify-diag.log`에 `fs.appendFileSync`. 실측 확인: 그 파일의 **머리 주석 4-12행이 직접 적어 놓았다** — _"Packaged Electron에서는 main process console.log가 stderr로 가서 cmd 없이는 안 보인다"_, 그래서 ①console ②모든 창에 IPC fanout ③`userData/*.log` append **3중 발사**를 한다(`init` 53행, 경로 58행, append 75·86행). rev.3은 같은 3중 구조를 쓴다. **E5b의 합격 판정을 로그 파일 전용으로 고쳤다** — 진단 패널은 여는 순간 메인 렌더러가 살아나 `'todo'` 칸을 자기 계산으로 덮어써 증거가 사라진다. 이 한계를 §A-5(4) 2번에 명시. 추가로 `diagnostics` 반환에 `restoredFromSnapshotAt`·`snapshotItemCount`(렌더러 push로 덮이지 않는 필드) 추가                                                                                             |
| **12** | **N-8 — 원자적 쓰기**        | `reminderState.ts` 명세에 세 줄 추가: ①`backupManager.ts:391-406` `atomicWriteData` 패턴(tmp 쓰기 → **길이 검증** → `renameSync`) — 실측 확인, 주석에 *"main.ts data:write와 동일 패턴"*이라 적혀 있다 ②복원 시 `reminder.ts:35-45` `isValidItem` 재통과(실측: `reminderId`·`fireAt`·`title`·`body`·`studentDedupKey` 5필드 타입 검사) ③*"`main.ts:5702` `app.requestSingleInstanceLock()`이 있어 다중 프로세스 동시 쓰기는 없다"*                                                                                                                                                                                                                                                                                                                                                                                          |
| **13** | **N-10 — M4 2커밋**          | **M4를 2커밋으로 쪼갰다** — (a) `reminderCore.ts` 추출(동작 변화 0) (b) 병합 + `expiresAt` + 장부 + 할일 생산자. **Q10의 반대 논거를 철회한다** — 동작 변화 0인 커밋이 남는 것은 어중간한 상태가 아니고, (b)만 revert하면 기록 알림은 완전히 복구되며 되돌리기는 여전히 1회다. §B-6 M4 행 재작성                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **14** | **N-9 — 모바일 근거 강화**   | §A-3 결정 6 공통 근거를 교체: _"`useMobileTodoStore.ts` **6곳**(49-50·56-57·63-64·79-80·100-101·117-118행)이 이미 `saveTodos({todos, categories})` + `triggerSaveSync()`로 **파일 전체를 저장하고 Drive 동기화를 트리거한다.** 모바일이 오래된 사본으로 체크 하나를 눌러도 데스크톱의 `checkAt`·`relatedStaff`가 사라질 수 있다. E11(왕복)은 동시 편집을 검사하지 않는다."_ **결정은 유지, 근거만 강화.** `updateTodo`가 없다는 사실(인터페이스 12-14행에 add/toggle/delete뿐)은 부차적 근거로 강등                                                                                                                                                                                                                                                                                                                         |
| **15** | **N-4 — 시그니처 통일**      | 4곳 전부 **위치 인자 2개**로 통일. 실측 기준: 현행 `preload.ts:1209-1210`이 `onReminderFired: (callback: (studentDedupKey: string) => void)` + `handler = (_event, studentDedupKey) => callback(studentDedupKey)` — **preload가 IPC 페이로드를 풀어 위치 인자로 넘기는 관용구**다. 이 관용구를 유지한 채 인자만 둘로 늘린다(§B M4 파일 목록에 4층 시그니처를 나란히 적음)                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **16** | **P2-F — 토스트 본문**       | §A-3 **결정 8 신설**(3안 비교). 선례 실측: `recordReminderRules.ts:171-172` `maskName(name, exposure)`, `:203` `maskName(student.name, config.nameExposure)`, `:314-315` `title: '관찰 기록 알림'` + `body: buildBody(...)` — **이 저장소는 토스트 본문을 개인정보 표면으로 이미 인정하고 노출 수준 설정을 만들어 뒀다.** rev.3 결정: `title`은 `'할 일 알림'` 고정, `body`는 새 설정 `alarmTextExposure: 'countOnly'                                                                                                                                                                                                                                                                                                                                                                                                       | 'full'`이 정하며 **기본값 `'countOnly'`**(= "확인할 일이 1건 있습니다"). ADR Consequences + **D-1 오너 질문 2\*\* |

#### 🟡 사무적 (6건)

| #      | 대상                   | rev.3에서 무엇을 어떻게 바꿨나                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **17** | N-11 테스트 경로       | 전부 실측 후 정정. `src/sidepin/`은 **존재하지 않는다**(파일 `src/sidepin-main.tsx`만). `src/adapters/components/SidePin/`은 **평면 배치**(`SidePinApp.test.tsx` 등 테스트 8개, `__tests__/` 없음) → 새 테스트도 평면. `src/adapters/components/Dashboard/`는 테스트 **0건** → `__tests__/` 신설 대신 **평면 배치**로 통일. `src/domain/rules/`는 평면 67개·`__tests__/` 43개로 **둘 다 관례**지만, 형제 파일 `todoRules.test.ts`가 평면이므로 **평면으로 통일**. 계약 테스트는 선례를 따라 `electron/` 아래 둔다 |
| **18** | N-12 호출 수           | `withSyncMeta` = **정의 21행 + 호출 7곳(73·112·121·148·166·180·202)**으로 본문 전체 통일. rev.2가 두 곳에서 "8곳"이라 쓴 것 삭제                                                                                                                                                                                                                                                                                                                                                                                  |
| **19** | N-13 ADR 번호          | 근거를 *"`git show HEAD:DECISIONS.md` 최신 = **ADR-064**. 065는 타 세션이 워킹트리에만 갖고 있고 아직 커밋하지 않았다"*로 정정(실측: HEAD 최대 064, 워킹트리 최대 065). 완료 판정을 **"066 이상 + 커밋 직전 재확인"**으로                                                                                                                                                                                                                                                                                         |
| **20** | N-14 M4 후행 근거 소멸 | rev.2 329행 근거 1(포털 세션과 electron 3파일 충돌)이 **소멸했음**을 반영. 현재 워킹트리는 `M DECISIONS.md` 하나뿐. **§B-0에서 M4를 원래 자리(M2 위치)로 되돌릴 수 있는 선택지를 오너에게 반환**하고 D-1 질문 6에 이 사실을 붙였다                                                                                                                                                                                                                                                                                |
| **21** | N-16 프로 모드 전용    | M2에 한 줄 추가 — _"자동 보드는 `TodoSettings.mode === 'pro'` 사용자에게만 도달한다."_ 실측: `TodoSettings.ts:1` `TodoMode = 'default'                                                                                                                                                                                                                                                                                                                                                                            | 'pro'`, `:7` `mode`, `:10` `defaultView`주석 *"프로 모드 기본 뷰"*,`:19-22`기본값은`{mode:'default', defaultView:'todo'}` |
| **22** | Architect §4(a) 보완   | ADR Consequences에 한 줄 — _"`todos.json`이 **동료 교직원 실명이 든 파일**이 된다. 백업 파일·자료실 공유·개인정보 처리방침 관점에서 이전과 성격이 달라진다."_                                                                                                                                                                                                                                                                                                                                                     |

**반영하지 않은 것: 0건.** 22건 전부 반영했다. 단 **6번은 지시를 문자 그대로 이행하면 게이트가 깨지므로 겨냥 범위를 좁혀 이행**했고, 그 사실을 §0-4에 적었다.

---

### 0-2. 철회한 것 (과잉 수용 정정)

| 철회 대상                                                   | rev.2에 쓴 것                                                                                                     | 철회 이유                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`src/widgets/items/TodoWidget.tsx` 파일 삭제** (M1 405행) | _"`TodoWidget.tsx`도 제거 — `DashboardTodo` 재export일 뿐이다"_                                                   | **Critic도 Architect도 요구한 적이 없다.** Critic §4(d)가 쓴 것은 *"재export를 렌더링하면 결국 `DashboardTodo`가 렌더되므로 테스트가 무의미하지 않다. 실질 지적은 옆핀 커버리지 부재 하나뿐"*이었다. rev.2가 바로 윗줄의 `Tasks.tsx` 처분(**계획서 목록에서** 빼라 — 참조 0건)에 이어 붙이면서 **참조 2건짜리 파일까지 같은 처분으로 끌어들였다.** `registry.ts:13,292` 실사용 확인. **파일은 그대로 둔다** |
| **Q10의 "단일 커밋 유지" 논거**                             | _"추출만 별도 커밋으로 두면 revert가 두 번이 되고, 추출된 모듈만 남고 병합 구조가 사라진 어중간한 상태가 생긴다"_ | 리팩터링은 **정의상 동작 변화 0**이다. 남아도 어중간하지 않다. 되돌리기는 (b)만 하면 되므로 여전히 1회. Critic 13번·Architect N-10 수용                                                                                                                                                                                                                                                                     |
| **"콜드 부팅 0건 = 시작 모습 3종"이라는 서술**              | 완료 판정 11                                                                                                      | 실측 결과 **0건이 되는 것은 `memorySaverMode: true`일 때뿐**이다. OFF면 메인 창이 `hide()`만 되어 `MainApp`이 숨은 채 살아 있다(`main.ts:1221-1231` `hideOrDestroyMainWindow` — ON이면 `destroy()`, OFF면 `hide()`). 범위를 과장했다                                                                                                                                                                        |

---

### 0-3. ★ 「이번 개정에서 실측한 것」

> Critic이 rev.3에 요구한 절차 조건이다. **rev.3에서 새로 쓰거나 고친 문장이 인용하는 모든 파일·행·테스트·게이트를 직접 열어 확인한 결과**를 아래에 전부 적는다. 마지막 두 행에 **확인하지 않고 인용한 것**을 정직하게 적었다.

#### (가) 오너가 확인해 주신 사실 — 재확인하지 않고 그대로 인용함 (11건)

`App.tsx` 구조(570·764행, 6개 창 분기) · `Settings.ts:6,741`의 `TodoSettings` 포함 · `todoRules.ts:147,211,217,231` · `TodoWidget.tsx`/`registry.ts:13,292` · `domainPurity`에 `Date`·`crypto` 0건 · `pinFeatureMap`의 `todo:'todo'` · `registry.ts` 할일 `sidePin.eligible:true` · `pendingRemoteOp` 설정 지점 · `updateTodo` 화이트리스트가 타입임 · `useMobileTodoStore`에 `updateTodo` 없음 · `reminder.ts` `onSchedule` 전체 교체·30초 틱 · `regression-check`가 grep 44종 · `Todo/Todo.tsx` 2,635줄 · HEAD ADR 064 · 워킹트리 `M DECISIONS.md` 하나.
→ **이 중 5건은 아래 (나)에서 다른 목적으로 열다가 우연히 재확인됐고, 전부 일치했다.**

#### (나) rev.3이 새로 인용해서 직접 연 것 (24건)

| #   | 대상                                                                      | 연 결과                                                                                                                                                                                                                                                                                                                                                                            | rev.3 어디에                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | `electron/nativeDesktopDiag.ts` 전문                                      | **머리 주석 4-12행이 직접 적어 놓음** — packaged main의 `console.log`는 stderr로 가서 안 보인다. 그래서 ①console ②전 창 IPC fanout ③`userData/native-desktop-diag.log` append **3중 발사.** `initNativeDesktopDiag` 53행, 경로 58행, `appendFileSync` 75·86행. 파일 쓰기 실패는 `catch {}`로 삼킴                                                                                  | 지시 11, M4 파일 목록, §A-5(4)                                                                                                                                                               |
| 2   | `electron/backupManager.ts:391-406`                                       | `atomicWriteData(dataDir, base, json)` — tmp 쓰기 → **읽어서 길이 비교** → 불일치면 unlink+throw → `renameSync`. 주석 390행 _"main.ts data:write와 동일 패턴"_                                                                                                                                                                                                                     | 지시 12, `reminderState.ts` 명세                                                                                                                                                             |
| 3   | `electron/ipc/reminder.ts:28,31,33,35-45,47-64,71-80`                     | `onReminderFired(studentDedupKey: string)` 위치 1개(28) · 모듈 전역 `schedule`(31)·`firedThisSession`(33) · `isValidItem` 5필드 검사(35-45) · `fireDue`에 staleness 컷 **없음**(50) · 발화 후 `schedule` 필터(63) · `onSchedule`은 `Array.isArray? filter : []`(72) · `onClear`는 `schedule = []`(75) · `setInterval(…, 30_000)`(80)                                               | 지시 12·15, §A-3 결정 2, M4                                                                                                                                                                  |
| 4   | `electron/preload.ts:1186-1215`                                           | `scheduleReminders(items)` 인자 1개(1186-1196) · `clearReminderSchedule()` **인자 없음**(1197-1199) · `onReminderFired`는 `handler = (_event, studentDedupKey) => callback(studentDedupKey)` — **preload가 IPC 페이로드를 풀어 위치 인자로 넘기는 관용구**(1209-1210)                                                                                                              | 지시 15, M4 시그니처 4층 표                                                                                                                                                                  |
| 5   | `src/domain/rules/recordReminderRules.ts:171-172,203,314-315`             | `maskName(name, exposure)` 정의(172) · `maskName(student.name, config.nameExposure)` 사용(203) · 토스트 `title: '관찰 기록 알림'`(314) + `body: buildBody(...)`(315)                                                                                                                                                                                                               | 지시 16, §A-3 결정 8                                                                                                                                                                         |
| 6   | `scripts/regression-grep-check.mjs` (639줄)                               | `presenceChecks`(32) `{file, pattern, name}` · `absenceChecks`(278) **`{name, roots[], extensions[], patterns[], fileFilter?}`** · `forbiddenTrackedPaths`(512) · 실행 루프 538·558·587                                                                                                                                                                                            | 지시 6, M0 작업 항목                                                                                                                                                                         |
| 7   | **`src/domain/rules/todoRules.ts`의 `new Date(` 실측**                    | **8건**(56·67·82·86·90·132·158·196행). `isOverdue(todo, today: Date = new Date())`처럼 **기본 인자**로 쓴다                                                                                                                                                                                                                                                                        | **§0-4 (가) — Critic 지시 6을 그대로 넣으면 게이트가 깨진다**                                                                                                                                |
| 8   | `electron/sidePinEntry.contract.test.ts:1-40`                             | **의존 그래프 테스트가 아니다.** `readFileSync`로 소스를 읽고 `toContain`/`not.toContain`으로 단언하며, 33-38행은 `main.indexOf("app.on('second-instance'")` ~ `indexOf('app.whenReady()')`로 **구간을 슬라이스해 그 안만 검사**한다                                                                                                                                               | **§0-4 (나) — 지시 2의 구현 수단 확정**                                                                                                                                                      |
| 9   | `electron/sidePinBrowserWindow.ts:174,187-197,237-238`                    | 174행 `preload: options.preloadPath`(메인과 공유) · 187행 `mode=sidePin&…` 쿼리 · **dev = `loadURL(sidepin.html)`(192-194), prod = `loadFile(options.indexHtmlPath)`(196)** · ★그런데 237-238행 `resolveSidePinIndexHtml`이 `dist/**sidepin**.html`을 반환한다 — **필드 이름이 `indexHtmlPath`라 오해하기 쉬우나 값은 sidepin.html이다.** 즉 옆핀은 dev·prod **양쪽 다 별도 번들** | §A-3 결정 2 각주, §0-4 (다)                                                                                                                                                                  |
| 10  | `src/main.tsx:1-23`                                                       | 분기 없음. `mode`를 읽어 sidePin일 때 CSS만 조정(7-15)하고 **무조건 `<App/>` 렌더**(17-23)                                                                                                                                                                                                                                                                                         | 지시 1 근거                                                                                                                                                                                  |
| 11  | `src/App.tsx:153-186,570-591,592,614,674,764,1323`                        | `isWidgetMode`(153)·`isQuickAddMode`(160)·`isStickerPickerMode`(165)·`isIconMode`(170)·`isMultiSurveyShareMode`(175)·`isSidePinMode`(180) · `App()` 571-587에서 6번 분기 · `IconApp`(592)·`QuickAddApp`(614)·`WidgetApp`(674)·`MainApp`(764) · `<ReminderPopup/>`는 **1323행 = MainApp 안**                                                                                        | 지시 1·2                                                                                                                                                                                     |
| 12  | `electron/main.ts:696,841,1894,1903,2386,2824,2826`                       | 빠른입력(696)·스티커(841)·아이콘(1903)·메인(2386)·위젯(2826)이 **전부 `dist/index.html`을 loadFile.** dev는 `?mode=icon`(1894)·`?mode=widget`(2824)                                                                                                                                                                                                                                | 지시 1                                                                                                                                                                                       |
| 13  | `electron/main.ts:1221-1231, 5870-5891`                                   | **`hideOrDestroyMainWindow(memorySaverMode)` — ON이면 `mainWindow.destroy()`(1226), OFF면 `hide()`(1229).** 시작 분기 5877(widget)·5881(sidePin)·5885(icon) 전부 이 함수를 부른다                                                                                                                                                                                                  | **§A-3 결정 3-2 콜드 부팅 2축 표**                                                                                                                                                           |
| 14  | `electron/main.ts:579,3236-3325,5702`                                     | 579행 `path.join(getContentRoot(), 'data')` — **main이 이미 데이터 폴더를 안다** · `data:read`(3237)·`data:write`(3286, 백업+atomic+검증) · **5702행 `app.requestSingleInstanceLock()`**                                                                                                                                                                                           | 지시 5·12                                                                                                                                                                                    |
| 15  | `electron/dataRoot.ts:166` / `archiveManager.ts:499,503,663-664,681`      | `getContentRoot()` export · archiveManager가 도메인 JSON을 `readFileSync`+`JSON.parse`로 **직접 읽는 선례 실재**                                                                                                                                                                                                                                                                   | 지시 5 (main이 `todos.json`을 읽는 근거)                                                                                                                                                     |
| 16  | `src/adapters/stores/useTodoStore.ts:27,109,117,129,146,175-199`          | 27행 화이트리스트 전문(11키, **`notes` 없음**) · `addTodo`(109)가 `pendingRemoteOp:'create'` 인라인(117) · `toggleTodo`(129,146) · **`updateTodo`(175)가 176-182행에서 `status`↔`completed`를 양방향 파생**하고 189-190에서 `syncedChanges` 스프레드, 192에서 `pendingRemoteOp`                                                                                                    | 지시 3·8                                                                                                                                                                                     |
| 17  | `src/adapters/components/Todo/views/KanbanView.tsx:7-9,26,35,45-47,70-74` | **기존 수동 칸반이 이미 `inferStatus`·`applyStatusChange`·`filterActive`를 import(7-9)해서 쓴다.** 35행 `filterActive`, 45-47행 `inferStatus`로 3칸, 70행 가드, **73행 `applyStatusChange(todo, targetColumn)` → 74행 `updateTodo`**                                                                                                                                               | 지시 3 (자동 보드가 베낄 정확한 모델)                                                                                                                                                        |
| 18  | `src/mobile/stores/useMobileTodoStore.ts:12-14,46-118`                    | 인터페이스는 add/toggle/delete뿐(12-14) · `saveTodos`+`triggerSaveSync` **6쌍**(49-50·56-57·63-64·79-80·100-101·117-118)                                                                                                                                                                                                                                                           | 지시 14                                                                                                                                                                                      |
| 19  | `src/usecases/sync/syncRegistry.ts:31,35,63,66-67,139`                    | `SYNC_REGISTRY`(63) **첫 항목이 `fileName:'settings'`(66)** + `subscribeExcluded:true`(67) · **35행 주석: _"subscribeExcluded인 도메인(settings 등)도 다운로드 후 reload가 필요하므로 분리"_** · `fileName:'todos'`(139)                                                                                                                                                           | 지시 4 (P0-B의 결정적 근거)                                                                                                                                                                  |
| 20  | `src/adapters/stores/useSettingsStore.ts:15,313,555-557,573`              | `settingsRepository` import(15) · `getSettings`(313) · **`todoSettings` 병합(555-557)** · `saveSettings(next)`(573)                                                                                                                                                                                                                                                                | 지시 4                                                                                                                                                                                       |
| 21  | `src/domain/entities/TodoSettings.ts:1-22`                                | `TodoMode='default'                                                                                                                                                                                                                                                                                                                                                                | 'pro'`(1) · `TodoViewMode`5종(2) ·`mode`(7) · `defaultView`주석 *"프로 모드 기본 뷰"*(10) ·`lastView?`(13) · **`DEFAULT_TODO_SETTINGS`는 `{mode:'default', defaultView:'todo'}`뿐\*\*(19-22) | 지시 21, M0 |
| 22  | `src/domain/entities/Todo.ts:2,38-75`                                     | `TodoStatus`(2) · **`dueDate`·`startDate` 주석이 `"YYYY-MM-DD"`, `time`이 `"HH:mm"`**(42-44) → `checkAt`을 날짜만으로 한 결정이 기존 관례와 정확히 일치 · `status?`(55) · `notes?`(63) · `pendingRemoteOp?`(73) · `updatedAt?`(75)                                                                                                                                                 | M0                                                                                                                                                                                           |
| 23  | `src/usecases/todo/ManageTodos.ts:14,21,25,67,73,112,121,148,166,180,202` | `nextPendingOp`(14) · `withSyncMeta` **정의 21 + 호출 7곳** · 67행 화이트리스트에 **`'notes'` 포함** · 73행이 `updateTodo`                                                                                                                                                                                                                                                         | 지시 18, M0                                                                                                                                                                                  |
| 24  | `package.json:23,24,32,35` / `vitest.config.ts:20-21`                     | `typecheck`(23) · **`lint`가 `eslint "src/**/\*.{ts,tsx}"`— electron/ 미포함**(24) ·`test`(32) · `regression-check`(35) · vitest include는 `src/**` + **`electron/**`\*\*(20)                                                                                                                                                                                                      | **§0-4 (다), §A-5(4) 커버리지 표**                                                                                                                                                           |

#### (다) 위 이외에 부수적으로 열어 확인한 것 (5건)

`src/adapters/hooks/useReminderOsPush.ts:28,35,67-69,86,94,127,175,180`(68행 `onReminderFired((dedupKey)=>…)` 위치 1개 / 94행 인자 없는 `clearReminderSchedule()` / 35행 주석 _"MainApp이 destroy돼도 main 타이머가 발화"_) · `src/domain/rules/contactRules.ts:111,114-126,135-147,202,213-216`(`ContactKind='staff'|'student'|'guardian'`, `staffToEntry`, `filterContactEntries`, **`filterStaffContacts(contacts: readonly StaffContact[]): StaffContact[]`** = M3 타입 게이트의 실물) · `src/adapters/components/SidePin/` 디렉터리 전수(**평면 배치**, 테스트 8개) · `src/adapters/components/Dashboard/` 전수(**테스트 0건**) · `src/domain/rules/` 테스트 배치(평면 67 / `__tests__/` 43 — **둘 다 관례**, 형제 `todoRules.test.ts`는 평면) · `vite.config.ts:56-59`(input = main·sidepin 2개) · `sidepin.html`·`src/sidepin-main.tsx` 전문(`<SidePinApp/>`만, `App` import 없음).

#### (라) ★ 확인하지 않고 인용한 것 — 정직 고지 (2건)

| 인용                                                                                                                                | 왜 확인 못 했나                                                                                                                                                        | 위험과 대처                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`src/adapters/components/Todo/components/DatePopover.tsx`·`TodoEditModal.tsx`·`ViewToggle.tsx`의 내부 구조** (M1·M2·M3 파일 목록) | rev.2에서 그대로 가져온 UI 파일 목록이다. **파일 존재는 확인했으나 내부 props·확장 지점은 열어보지 않았다.** "기존 팝오버 재사용/확장"이 실제로 가능한 모양인지 미확인 | 틀려도 `tsc`가 즉시 잡는 요란한 실패이고 구현자가 30초 안에 대체 경로를 찾는다. **다만 M1 착수 첫 작업을 "이 3파일을 열어 확장 지점 확인"으로 명시**했다(§B M1 착수 전 확인)                                      |
| **`useTasksSyncStore.ts:451-452`의 PULL 스프레드가 미지 필드를 보존한다** (§A-3 결정 7-3)                                           | rev.2가 *"확인함"*이라 적은 것을 그대로 승계했다. **rev.3에서 다시 열지 않았다**                                                                                       | 이 문장 위에 *"추가 작업 불필요"*라는 결론이 서 있으므로, 틀리면 `checkAt`이 구글 동기화마다 지워진다. **M0 완료 판정 9에 "PULL 후 새 필드 생존"을 신규 테스트로 넣어** 문서 주장이 아니라 테스트가 보증하게 했다 |

---

### 0-4. 이번 개정에서 새로 드러난 것 (아무도 지적하지 않았던 3건)

**(가) 🔴 Critic 지시 6을 문자 그대로 이행하면 `npm run regression-check`가 즉시 깨진다.**
지시는 _"`scripts/regression-grep-check.mjs`에 규칙 1건 추가(`src/domain/rules/todo_.ts`에 `new Date(`·`Date.now(`금지)"*다. 그런데 그 글롭에 걸리는 **기존`todoRules.ts`에 `new Date(`가 8건**(56·67·82·86·90·132·158·196행) 있다. 대부분 `isOverdue(todo, today: Date = new Date())`처럼 **기본 인자**여서 도메인 순수성 위반도 아니다(호출자가 값을 주입할 수 있다). 규칙을 그대로 넣으면 **이 계획이 손도 대지 않은 파일 때문에 게이트 4단계가 빨간불**이 되고, 구현자는 규칙을 지우거나 멀쩡한 기존 코드를 뜯게 된다.
→ **대처**: `absenceChecks`의 `fileFilter` 필드(278행 배열 스키마에 실재)를 써서 **신규 4파일만** 겨냥한다. §B M0에 정확한 형태를 적었다.

**(나) 🟠 rev.2가 계약 테스트의 모델을 잘못 읽었다 — 그런데 실물이 더 좋다.**
rev.2는 계약 테스트를 *"의존 그래프에 훅이 없음을 단언"*이라 썼고, Critic은 이를 *"위젯·아이콘은 번들을 공유하므로 원리적으로 못 막는다"*고 정확히 반박했다. 그런데 인용된 선례 `electron/sidePinEntry.contract.test.ts`를 열어 보니 **의존 그래프 테스트가 아니라 소스 텍스트를 슬라이스해 단언하는 테스트**였다(33-38행이 `main.indexOf(...)`로 핸들러 구간만 잘라 검사한다). 이 관용구는 **번들 공유와 무관하게 `App()` 본문만 정확히 겨냥할 수 있다.** 즉 Critic이 지적한 "도구가 표면에 적용 불가" 문제는 **다른 도구를 새로 만들 필요 없이, 이미 있던 도구를 제대로 읽기만 하면** 해소된다.

**(다) 🟠 게이트 4종 중 electron 코드를 보는 것은 `npm run test` **하나뿐**이다 — `lint`도 안 본다.**
rev.2 커버리지 표는 `npm run lint`를 "코딩 컨벤션"이라고만 적어 이 사실이 안 보였다. 실측: `package.json:24` `"lint": "eslint \"src/**/*.{ts,tsx}\""` — **`electron/`이 글롭에 없다.** `regression-check`도 grep 전용이다. M4는 electron 파일 4개(신규 2 + 개조 1 + preload)를 만드는데, **게이트 4종 중 2종이 그 코드를 아예 보지 않고 1종(`tsc`)은 타입만 본다.** §A-5(4) 표를 이 사실로 다시 썼다.

---

### 0-5. 유지한 것 — rev.2에서 옳았던 결정

Critic §6 첫째 근거가 *"결정 자체는 이제 다 옳다… 남은 22건은 전부 '이 결정을 어떻게 확인하고 어디에 배선하는가'이지 '무엇을 결정하는가'가 아니다"*라고 명시했다. 따라서 아래는 **한 글자도 바꾸지 않았다**.

알림 **출처(source) 분리**(Option B) · 자동 보드가 **`status`를 정본으로 쓰지 않음**(Option B) · **관련인 = 참조 + 이름 스냅샷**(Option C) · **모바일 읽기 전용** · **관련인은 교직원 한정으로 시작**(단 D-1로 오너에게 반환) · **`checkAt`은 날짜만** · **`boardMode` 없음** · **`studentDedupKey` 개명 안 함** · **`registry.ts`의 `sidePin.eligible: true` 유지** · **링크 파일(대안 D) 채택 안 함** · **6단계 분해** · **알람 기본 꺼짐**.

---

## A. RALPLAN-DR 요약

### A-1. Principles

1. **정본을 하나만 둔다.** 같은 정보를 두 곳에 저장하지 않는다. 어쩔 수 없이 둘이면 "어느 쪽이 진짜인지"를 타입과 문서 양쪽에 못 박는다. _(rev.3: main 스냅샷이 두 번째 진실이 되는 문제를 — 이번엔 인정하고 넘어가는 대신 — **발화 직전 `todos.json` 조회**로 실제로 해소했다. 스냅샷은 "언제 울릴지"만 알고 "울려도 되는지"는 언제나 정본에게 묻는다.)_
2. **기존 데이터는 건드리지 않는다.** 새 항목은 전부 optional이고 마이그레이션은 하지 않는다. _(rev.3: 자동 보드 드래그가 `completed`와 서브태스크를 뒤집는 경로를 막았다.)_
3. **알림은 조용히 실패한다.** 그래서 "동작한다"를 눈으로 볼 수 있는 장치를 기능과 **같은 단계**에 만들고, **그 장치가 실제로 존재하는지, 그리고 그 장치를 보는 행위가 증거를 파괴하지는 않는지도** 계획에 적는다. _(rev.3: 관측 1순위를 `console.log`에서 **파일 로그**로 바꿨고, 진단 패널로는 콜드 부팅을 판정할 수 없다는 사실을 적었다.)_
4. **개인정보는 잠기지 않은 표면으로 나가지 않는다.** _(rev.3: 표면 목록에 **OS 토스트 본문**을 추가했다 — PIN 잠금과 무관하게 화면 최상단에 뜬다.)_
5. **켤 수 있으면 끌 수 있어야 한다.** 새 동작은 전부 스위치 뒤에 두고 기본값은 현행 유지. **끄는 것이 실제로 무엇을 원상복구하고 무엇을 못 하는지, 그리고 그 스위치 자체가 안전한 곳에 있는지 표에 정직하게 적는다.** _(rev.3: 알람 스위치가 **동기화되는 파일 안에 산다**는 사실을 적었다.)_

### A-2. Decision Drivers

| 순위   | 드라이버                                           | 왜 이게 이 순위인가                                                                                                                                                                                                    |
| ------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | **기존 기능 회귀 없음 — 특히 학생 관찰 기록 알림** | `reminder.ts:72`의 `onSchedule`은 `schedule = items` **전체 교체**, `:75`의 `onClear`는 `schedule = []`. 두 번째 생산자가 끼면 서로의 예약을 지운다. **이미 출시된 기능이 조용히 죽는** 문제다                         |
| **D2** | **사용자 데이터 무손실**                           | 데이터 소실 신고(파일 단위 LWW), 동기화 핑퐁(ADR-039/040), 좀비 부활, 정본 미지정(ADR-046/063/064) 이력이 전부 이 스키마 변경의 통과 경로에 있다. rev.3에서 새로 막은 것: **자동 보드 드래그가 완료를 푸는 경로**(N-3) |
| **D3** | **자기가 옳은지 확인할 수 있을 것**                | rev.1의 실패는 결정이 아니라 확인 장치였고, rev.2의 실패는 **새로 쓴 자리를 실측하지 않은 것**이었다(P0가 둘 다 rev.2가 새로 쓴 두 절에서 나왔다). rev.3은 §0-3에 **연 것과 안 연 것을 전부 적었다**                   |

### A-3. Viable Options

#### 결정 1 — 진행 방식 (rev.2 유지)

O1 4건 일괄 ❌(되돌리기 단위 하나) / **O2 6단계 분리 ★채택** / O3 알림 제외 ❌(요구 미충족, 단 M4 비상 경로로 문서에 남김). 근거는 rev.2와 동일하므로 반복하지 않는다.

#### 결정 2 — 알림 다중 생산자 충돌 (rev.2 채택 유지 + 각주 2개 추가)

**A. 렌더러 단일 수집 훅** ❌ / **B. 출처별 칸 분리 ★채택** / **C. 할일 전용 채널** ❌ — 비교표는 rev.2와 동일.

> **★ 각주 1 (rev.3 신설, Critic 지시 2)** — "출처당 생산자 하나"를 **진입점 의존 그래프로 지키려는 시도는 원리적으로 실패한다.** 위젯(`?mode=widget`)·아이콘(`?mode=icon`)·빠른입력·스티커 창은 **메인 창과 똑같이 `dist/index.html`을 로드**하고(`main.ts:696·841·1903·2386·2826`) `src/main.tsx`가 무조건 `<App/>`을 렌더한다. 즉 이 창들은 `MainApp`과 **같은 번들·같은 진입점**을 쓴다. 별도 진입점은 옆핀(`sidepin.html`)뿐이다.
> **그래서 쓰는 도구는 이것이다** — `electron/sidePinEntry.contract.test.ts`가 이미 쓰는 **소스 구간 단언**. 이 저장소는 `main.indexOf("app.on('second-instance'")` ~ `indexOf('app.whenReady()')`로 구간을 잘라 그 안만 검사하는 관용구를 갖고 있다(33-38행). 같은 방식으로 `App.tsx`를 `export function App()` ~ `function IconApp()` 구간으로 잘라 **그 구간에 `useTodoAlarmOsPush`가 없음**을, `function MainApp()` 이후 구간에는 **있음**을 단언한다. 번들 공유와 무관하게 정확히 겨냥한다.

> **★ 각주 2** — 옆핀은 dev·prod **양쪽 다 별도 번들**이다. 헷갈리기 쉬운 지점을 확인해 적어 둔다: `sidePinBrowserWindow.ts:196`의 prod 분기가 `loadFile(options.indexHtmlPath)`인데, **그 값은 `dist/index.html`이 아니라 `dist/sidepin.html`이다**(237-238행 `resolveSidePinIndexHtml`). 필드 이름만 보고 "옆핀도 index.html을 연다"고 읽지 말 것.
> 다만 **`src/main.tsx:9`가 `mode === 'sidePin'`을 아직 처리하고 `App.tsx:180,586`에 sidePin 분기가 살아 있다.** 지금은 아무도 그 경로로 옆핀을 열지 않지만, 코드가 남아 있는 한 장래에 되살아날 수 있다. 훅을 `MainApp()`에 두어야 하는 이유가 하나 더 있는 셈이다.

#### 결정 3 — 스케줄 소유권·유예 창 (rev.2 채택 유지 + **2축 표로 정정** + **상태 축 방어 추가**)

**A. 렌더러 소유** ❌ / **B. main 소유 + 비동기화 상태 파일 ★채택** / **C. E5 기준 하향** ❌ — 3안 비교표는 rev.2와 동일.

**★ 결정 3-2 (rev.3 신설) — "콜드 부팅 0건"을 시작 모습 × memorySaver 2축으로 다시 적는다.**

훅을 **`MainApp()`에 둔다는 전제**에서, `main.ts:1221-1231`(`memorySaverMode` ON → `mainWindow.destroy()`, OFF → `hide()`)과 5877-5891행(시작 분기)을 실측해 다시 그렸다.

| 시작 모습          | 두 번째 창                                        | **memorySaver OFF**                                        | **memorySaver ON**                                            |
| ------------------ | ------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------- |
| `main`             | 없음                                              | 메인 렌더러 정상 → 생산자 1 ✅                             | 해당 없음                                                     |
| `widget`           | 위젯 창(`index.html?mode=widget` → `WidgetApp`)   | 메인 창이 **`hide()`만 되어 `MainApp` 생존** → 생산자 1 ✅ | 메인 창 `destroy()` → **push 전에 파괴될 수 있음 → 0건 위험** |
| `icon`             | 아이콘 창(`index.html?mode=icon` → `IconApp`)     | 동일 ✅                                                    | 동일 — **0건 위험**                                           |
| `sidePin`          | 옆핀 창(`sidepin.html` → `SidePinApp`, 별도 번들) | 동일 ✅                                                    | 동일 — **0건 위험**                                           |
| 빠른입력·스티커 창 | 열 때마다 `index.html` 새로 로드                  | (일시적)                                                   | (일시적)                                                      |

- **훅을 `App()`에 두면**: `widget`·`icon` 열에서 **메인 렌더러 + 위젯/아이콘 렌더러가 동시에 `'todo'` 칸에 push** → 생산자 2. 빠른입력·스티커 창이 열릴 때마다 **일시적 세 번째 생산자**가 붙었다 사라지며 그때마다 칸이 그 창의 계산으로 덮인다. → **불변식 파괴.**
- **결론**: 훅은 **`MainApp()`(764행) 안**. 그리고 **결정 3(main 스냅샷)이 실제로 사들이는 것은 표의 오른쪽 열 한 칸 — `memorySaverMode: true` × 시작 모습 3종**이다. rev.2가 "시작 모습 3종"이라고만 쓴 것은 범위를 과장했다.

**★ 결정 3-3 (rev.3 신설, Critic 지시 5 / Architect Synthesis 1) — 시간 축만 막던 것을 상태 축까지 막는다.**

`expiresAt`은 "너무 오래된 것"을 막지 "**더 이상 유효하지 않은 것**"을 막지 못한다. 실제 경로: _일요일 저녁 모바일에서 완료 → 데스크톱은 꺼져 있음 → 월요일 아침 `icon` + memorySaver 콜드 부팅 → 렌더러가 스토어를 못 읽음 → main이 금요일 스냅샷으로 09:00에 발화. `expiresAt`은 아직 안 지났으므로 통과._

|                         | **B-1. `expiresAt`만 (rev.2)** | **B-2. 발화 직전 정본 조회 ★채택**                                                                                                                                                                                                | **B-3. 완료 판정만 추가**            |
| ----------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 방식                    | 시간 축만 검사                 | `selectDue(buckets, now, firedIds, **isStillValid**)` — 껍데기가 `todos.json`을 읽어 _"존재 + `completed !== true`"_ 술어를 주입                                                                                                  | 구조는 그대로, 테스트 케이스만 추가  |
| 이미 끝낸 할일 발화     | **가능** ❌                    | 구조적으로 불가 ✅                                                                                                                                                                                                                | 가능(테스트가 잡아도 코드가 못 막음) |
| 정본 개수               | **2** ❌                       | **1** — 스냅샷은 "언제"만 알고 "울려도 되는지"는 정본에게 묻는다 ✅                                                                                                                                                               | 2                                    |
| 순수 코어 테스트 가능성 | ✅                             | ✅ (술어를 인자로 받으므로 오히려 테스트가 쉬워짐)                                                                                                                                                                                | ✅                                   |
| 비용                    | —                              | main이 도메인 파일을 읽는다(**선례 실재**: `main.ts:579`가 이미 `getContentRoot()+'data'`를 알고, `archiveManager.ts:499,663`이 도메인 JSON을 직접 읽는다). 발화 시 파일 I/O 1회 — 30초 틱마다가 아니라 **발화 대상이 있을 때만** | —                                    |
| 판정                    | ❌                             | ✅                                                                                                                                                                                                                                | ❌                                   |

> **채택: B-2.** 이로써 Architect의 안티테제(_"캐시가 유일한 데이터원인 시간대가 있다면 그건 캐시가 아니다"_)에 **구조로 답한다.** 스냅샷은 "몇 시에 울릴 후보가 있다"는 **일정표**이고, "울려도 되는가"는 언제나 `todos.json`이 답한다. Principle 1이 다시 성립한다.
> **한계**: `todos.json` 읽기 실패(파일 잠김·손상) 시에는 **발화하지 않는다**(안전 쪽으로 실패). 이 선택도 로그에 남긴다.

#### 결정 4 — 자동 배치 보드와 수동 `status`의 공존 (rev.2 채택 유지 + **`completed` 축 추가**)

**A. `status` 덮어쓰기** ❌ / **B. 별도 뷰 ★채택** / **C. 정렬 힌트만** ❌ — 비교표 rev.2와 동일.

**★ 4칸 판정 표 — `completed` 축을 넣어 다시 그렸다 (Critic 지시 3)**

> **입력 계약 (맨 앞에 온다)**: `bucketOf`는 `todoRules.filterActive`(147행, 아카이브 제거)를 통과한 목록을 받고, **`todoRules.inferStatus(todo) === 'done'`인 할일은 어느 칸에도 배정하지 않는다**(반환 `null`). 기존 수동 칸반은 `done` 칸이 있어서 완료 항목을 받지만, **자동 보드에는 `done` 칸이 없으므로 받지 않는 것이 유일하게 일관된 처리**다.

| 컬럼         | 정본            | 판정 규칙                                                 | 이 칸으로 끌어다 놓으면                                  |
| ------------ | --------------- | --------------------------------------------------------- | -------------------------------------------------------- |
| (표시 안 함) | **`completed`** | `inferStatus(todo) === 'done'`                            | — (완료 항목은 자동 보드에 나타나지 않으므로 끌 수 없다) |
| 분류 대기    | 날짜            | `dueDate`·`startDate`·`checkAt` 전부 없음                 | 확인창 → 세 날짜를 모두 지운다                           |
| 오늘 처리    | 날짜            | 마감일 ≤ 오늘 **또는** 점검일 ≤ 오늘                      | 확인창 → `dueDate`를 오늘로                              |
| 진행 중      | **`status`**    | `inferStatus(todo) === 'inProgress'` (날짜 판정을 이긴다) | 확인창 → `applyStatusChange(todo, 'inProgress')`         |
| 예정·대기    | 날짜            | 나머지(미래 날짜 있음)                                    | 확인창 → `dueDate`를 지정 날짜로                         |

- **★ 드래그 적용은 `todoRules.applyStatusChange`(217행)를 거친다.** 실측 확인: 이 함수는 `status` + `completed` + **`subTasks`까지 함께 뒤집는다.** 기존 수동 칸반(`KanbanView.tsx:73-74`)이 정확히 이 함수를 쓴 뒤 `updateTodo`를 부른다. **자동 보드는 이 조합을 그대로 재사용한다 — 새 상태 개념을 만들지 않는다.**
- **그런데 자동 보드는 완료 항목을 아예 표시하지 않으므로**, `applyStatusChange`가 완료를 **푸는** 경로(N-3의 피해)는 **입력 계약 단계에서 이미 닫힌다.** 즉 이중 방어다: ①완료 항목이 칸에 안 들어옴 ②설령 들어와도 `applyStatusChange`가 서브태스크까지 일관되게 처리.
- **'진행 중'에서 끌어내면** `applyStatusChange(todo, 'todo')` → `status:'todo'`, `completed:false`(원래 false였으므로 무변화), 서브태스크 무변화.
- **자동 뷰는 `done`을 절대 만들지 않는다** — `AutoBoardBucket` 반환 타입에 없다.
- **자동 뷰를 껐을 때**: 드래그로 바뀐 `dueDate`·`status`는 **남는다.** `completed`는 **애초에 바뀌지 않는다**(완료 항목이 보드에 없으므로). §B-6에 그대로 적는다.
- **`dueDate`는 Google Tasks 동기화 대상**이므로 드래그 확인 한 번마다 원격 쓰기가 예약된다.
- **도달 범위**: 자동 보드는 `TodoSettings.mode === 'pro'` 사용자에게만 보인다(`TodoSettings.ts:7,10`).

#### 결정 5 — 관련인의 저장 형태와 대상 범위 (rev.2 유지)

A 이름 문자열만 ❌ / B 연락처 id만 ❌ / **C 참조 + 이름 스냅샷 ★채택**. 대안 D(별도 링크 파일) 채택 안 함. 대상 범위는 **교직원 한정으로 시작하되 D-1로 오너에게 반환**. 타입 게이트의 실물은 `contactRules.ts:213-216`의 `filterStaffContacts(contacts: readonly StaffContact[]): StaffContact[]` — 학생·보호자를 넣으면 `tsc`가 잡는다. 근거·표는 rev.2와 동일하므로 반복하지 않는다.

**정책(범위와 무관)**: 관련인 칩은 **본 화면(할일 페이지·편집창)에서만** 표시. **위젯·옆핀에서는 이름도 인원수도 표시하지 않는다.** 테스트로 고정하며 대상은 `DashboardTodo.tsx`와 **`SidePinWidgetZone.tsx`** 둘 다. `TodoWidget.tsx`는 **대상이 아니고 삭제하지도 않는다.**

#### 결정 6 — 모바일 대응 범위 (결정 유지, **근거 교체**)

점검 날짜 = 읽기 전용 / 시각 알람 = 제외 / 자동 보드 = 제외 / 관련인 = 읽기 전용(이름만).

> **★ 공통 근거 (rev.3에서 교체 — Critic 지시 14)**
> rev.2는 *"`useMobileTodoStore`에 `updateTodo`가 없어 방침이 자동 이행된다"*고 썼는데 이건 **근거가 약하다.** 실측: `useMobileTodoStore.ts`의 **6곳**(49-50·56-57·63-64·79-80·100-101·117-118행)이 이미 `todoRepository.saveTodos({todos, categories})` + `useMobileDriveSyncStore.getState().triggerSaveSync()`로 **`todos.json` 전체를 저장하고 Drive 동기화를 트리거한다.** 모바일 쓰기는 이미 열려 있다.
> 진짜 위험은 이것이다 — **모바일이 오래된 사본을 들고 있다가 체크 하나를 누르면 파일 전체가 그 사본으로 덮인다.** 데스크톱에서 방금 입력한 `checkAt`·`relatedStaff`가 사라진다. `todos`는 `syncRegistry.ts:139`에서 **파일 단위**로 동기화되고 `SyncFromCloud.ts`에 `todos` 전용 항목 병합이 없다. **E11(왕복)은 동시 편집을 검사하지 않으므로 이 경로를 통째로 비껴간다.**
> **결정은 유지한다 — 편집을 열지 않는 이유가 더 강해졌을 뿐이다.** `updateTodo`가 없다는 사실은 부차적 근거로 내린다.

#### 결정 7 — Google Tasks·Drive와의 상호작용 (rev.2 + **7-5 신설**)

1~4는 rev.2와 동일(대응 필드 없음 / `notes` 인코딩 금지 / PULL이 미지 필드 보존 / **B1을 스토어 + 유스케이스 양쪽에서 막음**).

> **★ 7-5 (rev.3 신설 — Critic 지시 4) — "로컬 전용"의 뜻을 정확히 한다.**
> rev.2는 *"새 항목(`checkAt`, `relatedStaff`, **알람 설정**)은 전부 로컬 전용이다"*라고 썼는데, 오너가 **"이 기기에만 있다"**로 읽을 문장이다. 실제 뜻은 **"Google Tasks에 올리지 않는다"**뿐이고, **Drive로는 간다.** 두 가지를 분리해 적는다.
>
> | 항목                                            | Google Tasks | **Drive(기기 간 공유)**                                                                                                                            | 근거                                                                                                                                                                                                  |
> | ----------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | `checkAt`·`relatedStaff`                        | ❌ 안 올림   | **✅ 간다** — `todos.json` 안에 살고 `syncRegistry.ts:139`가 동기화 대상                                                                           | 파일 내용이 바뀌면 SHA-256이 바뀌어 업로드된다                                                                                                                                                        |
> | **알람 설정 4종**(`alarmEnabled` 등)            | ❌ 안 올림   | **✅ 간다** — `TodoSettings`는 `Settings.ts:741`을 통해 `settings.json` 안에 있고, `settings`는 **`syncRegistry.ts:63,66` SYNC_REGISTRY 1번 항목** | `subscribeExcluded: true`(67행)는 *자동 업로드 구독*만 제외한 것이다. 같은 파일 **35행 주석이 직접 적어 놓았다** — _"subscribeExcluded인 도메인(settings 등)도 다운로드 후 reload가 필요하므로 분리"_ |
> | **`lastView: 'autoBoard'`**(M2의 유일한 스위치) | ❌           | **✅ 간다** — 같은 이유                                                                                                                            | 같은 위치                                                                                                                                                                                             |
>
> **귀결 3가지 (오너가 알아야 한다)**
>
> 1. **알람 켬/끔은 기기별이 아니라 계정별이다.** 학교 PC에서 켜면 다음 동기화에 집 PC에서도 켜지고, 집 PC가 09:00에 학교 업무 토스트를 띄운다.
> 2. **끈 것이 되살아날 수 있다.** `settings.json`은 파일 단위 LWW다. A기기에서 끄고, 오래된 사본을 든 B기기가 나중에 저장하면 `alarmEnabled: true`가 돌아온다. **되돌리기 1순위가 바로 그 위에 서 있다.**
> 3. 자동 보드도 마찬가지로 **한 기기에서 켜면 다른 기기에서도 켜진다.**
>
> → **D-1 질문 1로 오너에게 반환한다.** 기기별이어야 한다면 `alarmEnabled`를 `settings`가 아닌 곳으로 빼야 하는데, **그건 M0의 필드 배치 결정이므로 착수 전에 답해야 한다.** 대안 저장 위치와 선례는 D-1에 적었다.

#### ★ 결정 8 (rev.3 신설 — Critic 지시 16) — OS 토스트 본문에 무엇을 쓸 것인가

**문제**: M4가 새로 만드는 것은 **화면 최상단에 뜨는 OS 토스트**다. PIN 잠금과 무관하게 뜨고, 바탕화면 위젯 모드·교무실 모니터에서 그대로 읽힌다. 교사는 할일 텍스트에 학생 이름을 쓴다("김OO 학부모 상담 회신"). rev.2의 개인정보 분석은 **관련인 칩이 위젯·옆핀에 그려지는가**만 다뤘고 이 표면을 보지 못했다.

**선례가 결정적이다**: `recordReminderRules.ts:171-172,203`에 `maskName(name, exposure)`가 있고 `:314-315`가 `title: '관찰 기록 알림'` + 마스킹된 `body`를 만든다. **이 저장소는 토스트 본문을 개인정보 표면으로 이미 인정하고 노출 수준 설정을 만들어 뒀다.**

|      | **A. 전문 노출**                                   | **B. 건수만 ★기본값**              | **C. 앞 N글자만**                                    |
| ---- | -------------------------------------------------- | ---------------------------------- | ---------------------------------------------------- |
| 본문 | `body: todo.text`                                  | `body: '확인할 일이 1건 있습니다'` | `body: todo.text.slice(0, 10) + '…'`                 |
| 장점 | 토스트만 보고 판단 가능 — 가장 유용                | 유출 0. 앱을 열게 만든다           | 절충                                                 |
| 단점 | **교무실 모니터에 학생 실명 + 사안이 그대로 뜬다** | 무엇에 대한 알림인지 모른다        | **이름은 보통 앞에 온다 — 자르는 게 도움이 안 된다** |
| 판정 | 기본값으로는 ❌                                    | ✅ **기본값**                      | ❌                                                   |

> **채택**: `title`은 `'할 일 알림'` **고정**. `body`는 새 설정 `alarmTextExposure: 'countOnly' | 'full'`이 정하며 **기본값 `'countOnly'`**. 설정에서 "알림에 할 일 내용 표시" 스위치를 켜면 `'full'`이 된다. 켜는 순간 안내 문구: _"알림 창에 할 일 내용이 그대로 보입니다. 교실·교무실 화면을 여럿이 본다면 꺼 두세요."_
> **주의**: 이 설정도 `TodoSettings` 안이므로 **결정 7-5가 그대로 적용된다**(기기 간 공유). **D-1 질문 2**로 오너에게 올린다.

### A-4. Pre-mortem — 6개월 뒤 이 기능이 실패했다면 (5 시나리오)

**시나리오 1 — "학생 관찰 기록 알림이 언제부턴가 안 와요"**
M4에서 출처별 병합으로 바꿨는데 관찰 기록 항목이 검증에서 걸러졌거나 개발 중 main만 구버전이었다. 아무 에러도 안 나고 **몇 달간 아무도 눈치채지 못한다.**

- **예방 A**: M4 (a)커밋에서 **기존 동작을 테스트로 먼저 고정**하고, (b)커밋에서 "record 5건 push → 5건 예약 유지"를 기능 추가 **전에** 작성.
- **예방 B**: `userData/notify-diag.log`에 `[notify] push source=record count=5 buckets={record:5,todo:3} sender=12`.
- **예방 C**: 설정 화면 "알림 진단" 접기 패널.
- **예방 D**: 구버전 main + 신버전 렌더러 조합은 `reminder.ts:72`의 `: []` 때문에 **기록 알림 예약까지 전멸**시킨다는 사실을 주석에 **축소 없이** 명시.

**시나리오 2 — "알림이 너무 자주 떠서 윈도우 알림 자체를 껐어요"**
하루 12번 토스트를 띄웠고 사용자가 **윈도우 설정에서 쌤핀 알림을 통째로 차단**했다. 그 순간 학생 관찰 기록 알림까지 같이 죽는다. 앱은 계속 `Notification.show()`를 부르고 OS가 삼키므로 앱 쪽엔 정상으로 보인다.

- **예방 A**: 알람 기본값 **꺼짐**(`alarmEnabled: false`).
- **예방 B**: `expiresAt` 만료 폐기.
- **예방 C**: **발화 이력을 main 파일에 남긴다.**
- **예방 D**: 하루 발화 상한(기본 8건) — **`fireAt`의 현지 날짜별**로 적용(P1-C).
- **예방 E**: 스케줄 지평 14일 — 1년치 할일이 예약 배열에 안 들어간다(P1-C).
- **예방 F**: 알람 켜는 순간 안내 — _"알림이 너무 잦으면 여기서 끄세요. 윈도우 설정에서 끄면 학생 기록 알림도 함께 꺼집니다."_

**시나리오 3 — "옆핀에 관련인 이름이 떠서 아이들이 봤어요"**
대시보드·바탕화면 위젯은 `PIN_FEATURE_MAP.todo`로 잠기지만 **옆핀은 안 잠긴다.**

- **예방 A**: 위젯·옆핀 렌더 경로에서 관련인을 **아예 읽지 않는다.**
- **예방 B**: 스냅샷 테스트를 `DashboardTodo`와 `SidePinWidgetZone` 양쪽에.
- **예방 C**: 범위를 넓히려면 **옆핀 PIN 가드 도입 또는 미표시 테스트의 지속 통과**가 선행 조건임을 ADR에 명문화.
- **예방 D(주의)**: `registry.ts`의 `sidePin.eligible`을 `false`로 내리지 **않는다** — 이미 쓰이는 기능 회수다.

**시나리오 4 — "옆핀 모드로 시작하는데 알람이 한 번도 안 왔어요"**
`memorySaverMode: true` × 시작 모습 `widget`/`icon`/`sidePin`이면 메인 창이 `destroy()`되고(`main.ts:1226`), `MainApp` effect가 push하기 **전에** 파괴되면 그 세션 내내 할일 알람이 0건이다.

- **예방 A**: main이 마지막 `todo` 칸 스냅샷을 `notify-state.json`에 갖고 있다가 단독 발화.
- **예방 B**: 완료 판정 11 — 시작 모습 3종 × memorySaver ON 콜드 부팅 후 **로그 파일의 todo 예약 건수 ≠ 0**.
- **예방 C**: `expiresAt`으로 스냅샷 유효 지평 제한.
- **한계 인정**: `record` 칸은 보증 대상이 아니다 — 콜드 부팅 시 **기록 알림은 오늘과 똑같이 동작한다.**
- **★ 정정**: memorySaver **OFF**면 메인 창이 `hide()`만 되어 `MainApp`이 살아 있다 → 이 시나리오는 **ON일 때만** 발생한다(결정 3-2).

**★ 시나리오 5 (rev.3 신설 — N-6) — "일요일에 끝낸 일이 월요일 아침에 울렸어요"**
월요일 09:00 알람이 걸린 할일을 일요일 저녁 **모바일에서 완료**했다. Drive에는 반영됐지만 데스크톱은 꺼져 있었다. 월요일 아침 `icon` + memorySaver 콜드 부팅 → 렌더러가 파괴돼 스토어를 못 읽고, **main이 금요일 스냅샷으로 발화한다.** `expiresAt`은 시간 축만 보므로 통과한다. 사용자에게는 "끝낸 일이 다시 울리는 앱"이고, 이건 **시나리오 2("알림이 잦아 통째로 껐다")로 가는 새 경로**다.

- **예방 A ★ 구조적 해소**: `selectDue(buckets, now, firedIds, **isStillValid**)` — 발화 직전 껍데기가 `todos.json`을 읽어 *"그 `todoId`가 존재하고 `completed !== true`"*를 확인한다. 스냅샷은 "언제"만 알고 "울려도 되는지"는 정본에게 묻는다.
- **예방 B**: 완료 판정 11에 **반대 방향** — _"스냅샷에 있으나 현재 `todos.json`에 없거나 완료된 할일은 발화하지 않는다."_ rev.2의 판정은 *"건수 ≠ 0"*만 봐서 **틀린 것이 예약되는 방향을 통과시켰다.**
- **예방 C**: `reminderCore.test.ts` 케이스 ⑨ — `isStillValid`가 false를 반환하면 `toFire`가 아니라 `dropped`로 분류.
- **예방 D**: `todos.json` 읽기 실패 시 **발화하지 않는다**(안전 쪽으로 실패). 로그에 남긴다.

### A-5. 확장 테스트 계획

> **배치 관례 실측 반영**: `src/domain/rules/`는 평면 67개 / `__tests__/` 43개로 **둘 다 관례**지만, 형제 파일 `todoRules.test.ts`가 평면이므로 **평면으로 통일**한다. `src/adapters/components/SidePin/`은 평면(테스트 8개), `Dashboard/`는 테스트 0건 → **평면 신설**. `src/sidepin/` 디렉터리는 **존재하지 않는다.** electron은 평면(`electron/*.test.ts`, `electron/ipc/*.test.ts`).

#### (1) 단위 테스트 — domain 순수 함수

| 파일                                                    | 확인할 것                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/domain/rules/todoCheckRules.test.ts` (신규)        | `checkAt`(`YYYY-MM-DD`) 파싱: 잘못된 형식·빈 값·과거·미래. `nextTouchDate(todo)` = 마감·점검 중 이른 쪽. 월말·연말 경계. **문자열 비교만**                                                                                                                                                                                                                                                                                         |
| `src/domain/rules/todoTime.test.ts` (신규) ★            | `wallClockToEpochMs(dateStr, timeStr, offsetMinutes)` — **오프셋 0 / +540 / −300 각각.** 자정·`23:59`·월말·윤년, 잘못된 문자열은 `null`. **이 세 오프셋 케이스가 "시간대 안전성"의 실질 방어선이다**(`domainPurity`가 아니다 — 그건 import만 본다)                                                                                                                                                                                 |
| `src/domain/rules/todoAlarmRules.test.ts` (신규)        | 알람 OFF면 빈 배열. `expiresAt = fireAt + graceMs`. **지평 `horizonDays`(기본 14) 밖은 제외.** **하루 상한은 `fireAt`의 현지 날짜별** — _"이틀 × 각 10건 → 각 날 8건, 합계 16건"_(P1-C). 동률 정렬 `fireAt`↑ → `priority` → `id`. `reminderId`가 `todo:`로 시작. `dueDate+time`·`checkAt+time` 둘 다 후보. `time` 없으면 `alarmDefaultTime`. **`alarmTextExposure: 'countOnly'`면 `body`에 `todo.text`가 등장하지 않는다**(결정 8) |
| `src/domain/rules/todoAutoBoard.test.ts` (신규) ★       | **`inferStatus(todo) === 'done'`이면 `bucketOf`가 `null`을 반환한다**(완료 항목 제외 — 전수). 4칸 판정 전수(날짜 없음/과거/오늘/미래 × `status` 4종). `inProgress`가 날짜를 이김. `done`이 반환 타입에 없음. **드래그 적용이 `applyStatusChange`를 거쳐 `completed`와 모든 `subTasks.completed`가 함께 처리된다**                                                                                                                  |
| `src/domain/rules/todoMention.test.ts` (신규)           | `@` 뒤 질의 추출. 한글 초성 조합 중 상태. `a@b.com`에 오탐 없음                                                                                                                                                                                                                                                                                                                                                                    |
| `src/domain/__tests__/domainPurity.meta.test.ts` (기존) | 새 rules 4개가 **외부 import를 안 쓴다.** ~~`Date`·`crypto`~~ **삭제 — 이 테스트는 import 지정자만 검사한다**(`importSpecifiers()` 35행 → `isAllowed()` 50행)                                                                                                                                                                                                                                                                      |

#### (2) 통합 테스트

| 파일                                                                                                     | 확인할 것                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`electron/ipc/reminderCore.test.ts` (신규) ★가장 중요**                                                | 순수 모듈 `(buckets, now, firedIds, isStillValid) → { toFire, expired, dropped, nextBuckets }`. ①record 5 → todo 3 → 총 8 ②record 재-push(3) → **todo 3 생존** ③`clear('todo')` → **record 5 생존** ④`clear('record')` → todo 3 생존 ⑤구형 **배열** payload → `record` 칸 수용 ⑥`expiresAt` 지난 항목은 **발화 않고 `expired`** ⑦`firedIds`에 있으면 건너뜀 ⑧`isSupported()` false여도 크래시 없음 **⑨★`isStillValid`가 false면 `dropped`**(N-6) **⑩★`isStillValid`가 throw하면(파일 읽기 실패) 아무것도 발화하지 않는다.** 모델: `electron/ipc/aiBridgeLiveSyncCore.test.ts` |
| `electron/ipc/reminderState.test.ts` (신규)                                                              | `notify-state.json` 왕복. 파일 없음·깨진 JSON·**유효 JSON인데 형태가 다름**·권한 실패 → **빈 상태로 조용히 폴백**. 복원 항목이 `isValidItem` 재통과. **원자적 쓰기**(tmp → 길이 검증 → rename)                                                                                                                                                                                                                                                                                                                                                                                |
| `src/usecases/todo/ManageTodos.localOnly.test.ts` (신규) ★B1                                             | **repository mock의 `saveTodos` 인자를 단언.** ①`updateTodo(id,{checkAt})` → 저장 배열의 `pendingRemoteOp`가 **호출 전 값과 동일** ②`{checkAt,text}` → 기존 규칙대로 ③`addTodo` → `'create'` ④`toggleTodo` → `'update'`                                                                                                                                                                                                                                                                                                                                                       |
| `src/adapters/stores/useTodoStore.localOnly.test.ts` (신규)                                              | **목적 재정의(N-15)**: 화이트리스트는 런타임 필터가 아니라 타입이므로 "조용히 무시"를 검사하는 게 아니다. **"새 필드가 `saveTodos`까지 도달한다"**를 단언한다. **★현재 이 스토어의 자동 커버리지는 0이므로 zustand 리셋 하네스부터 만든다**                                                                                                                                                                                                                                                                                                                                   |
| `src/domain/rules/todoLocalOnlyFields.mirror.test.ts` (신규)                                             | `TODO_LOCAL_ONLY_FIELDS`의 모든 키가 스토어(`useTodoStore.ts:27`)·유스케이스(`ManageTodos.ts:67`) **양쪽에 존재**. 모델: `electron/closeAction.mirror.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                |
| `src/adapters/stores/useTasksSyncStore.localOnly.test.ts` **(신규 — rev.2의 "기존 확장"은 오기)**        | PULL이 원격 값으로 덮어쓸 때 `checkAt`·`relatedStaff`가 **살아남는다**. **§0-3(라)의 미확인 인용을 테스트로 대체하는 항목이다**                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `src/adapters/repositories/__tests__/JsonTodoRepository.test.ts` **(신규 — rev.2의 "기존 확장"은 오기)** | **왕복 동등성** — 새 필드 없는 옛 `todos.json`을 읽어 저장하면 내용이 그대로다(Principle 2 하드 게이트)                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **`electron/appEntryReminder.contract.test.ts` (신규) ★P0-A**                                            | **소스 구간 단언**(모델: `electron/sidePinEntry.contract.test.ts:33-38`). ①`src/App.tsx`를 `export function App()` ~ `function IconApp()` 구간으로 잘라 **`useTodoAlarmOsPush`가 없음** ②`function MainApp()` 이후 구간에 **있음** ③`src/sidepin-main.tsx`에 `useTodoAlarmOsPush`·`useReminderOsPush`·`from './App'`이 **없음**                                                                                                                                                                                                                                               |
| `src/widgets/__tests__/widgetAccessibility.test.ts` (기존)                                               | 새 배지/버튼이 `min-h-6`/`min-w-6` 통과                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/adapters/components/Dashboard/DashboardTodo.privacy.test.tsx` (신규, **평면**)                      | 대시보드 렌더 결과에 관련인 이름·인원수 **미등장**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **`src/adapters/components/SidePin/SidePinWidgetZone.privacy.test.tsx` (신규, 평면) ★**                  | **옆핀 렌더 결과**에 관련인 이름·인원수 **미등장**. 진짜 무방비 표면                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

#### (3) e2e / 실기기 수동 확인

| #                          | 시나리오                                                                                  | 합격 기준                                                                                                                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1                         | 알람 5분 뒤 설정 → 아이콘 모드로 접음                                                     | 5분 뒤 OS 토스트. 클릭하면 할일 화면                                                                                                                                                                      |
| E2                         | 알람 설정 → 완전 종료 → **30분** 지나 실행                                                | 토스트가 **안 뜬다**(만료 폐기). 앱 안에 "지난 알람"                                                                                                                                                      |
| E2b                        | 알람 발화 확인 → **3분 뒤** 재시작                                                        | 같은 알람이 **다시 안 뜬다**(발화 이력)                                                                                                                                                                   |
| E3                         | 기록 알림 예약 상태에서 할일 알람 추가                                                    | 진단 패널에 `기록 N / 할일 M` 둘 다. **둘 다** 뜬다                                                                                                                                                       |
| E4                         | 기록 알림을 "1시간 스누즈"                                                                | **할일 알람 생존**                                                                                                                                                                                        |
| E4b                        | 할일 알람을 **끔**                                                                        | **todo 0건, record는 그대로**                                                                                                                                                                             |
| E5                         | 절전 후 복귀                                                                              | 자는 동안 지난 알람은 **안 뜬다**                                                                                                                                                                         |
| **E5b (판정 수단 변경)**   | 완전 종료 → 시작 모습 `widget`/`sidePin`/`icon` **각각** + **memorySaver ON** → 콜드 부팅 | **`userData/notify-diag.log`를 메모장으로 열어** todo 예약 건수 ≠ 0 확인. ★**진단 패널로 판정하지 않는다** — 메인 창을 여는 순간 렌더러가 살아나 `'todo'` 칸을 덮어쓰므로 **확인 행위가 증거를 파괴한다** |
| **E5c (신규, 시나리오 5)** | 모바일에서 할일 완료 → 데스크톱 꺼진 채 동기화 → 알람 시각 전 콜드 부팅(memorySaver ON)   | 알람 시각에 **토스트가 안 뜬다.** 로그에 `[notify] dropped reason=completed`                                                                                                                              |
| E6                         | 자동 보드 드래그 → 확인창 **취소**                                                        | 아무것도 안 바뀐다                                                                                                                                                                                        |
| E6b                        | '진행 중'으로 끌었다 다시 끌어냄 → 자동 보드 끔                                           | `status`가 `'todo'`로 **남아 있음**(원복되지 않는 것이 사양)                                                                                                                                              |
| **E6c (신규, N-3)**        | 할일을 완료 체크 → 자동 보드로 전환                                                       | **완료된 할일이 어느 칸에도 없다.** 수동 칸반으로 바꾸면 `done` 칸에 있다                                                                                                                                 |
| E7                         | 관련인 교직원을 연락처에서 **삭제**                                                       | 흐린 이름 + "연락처에 없음". 저장 데이터 불변                                                                                                                                                             |
| E8                         | 연락처에서 이름 변경                                                                      | 표시가 **새 이름**. **저장 파일은 안 바뀜**                                                                                                                                                               |
| E9                         | PIN 잠금 켠 상태 — 대시보드 위젯·바탕화면 모드·**옆핀**                                   | 관련인이 **세 곳 모두 일절 안 보임**                                                                                                                                                                      |
| **E9b (신규, 결정 8)**     | `alarmTextExposure` 기본값으로 알람 발화                                                  | 토스트 본문에 **할일 텍스트가 안 보인다**("확인할 일이 1건 있습니다")                                                                                                                                     |
| E10                        | 모바일에서 동일 할일                                                                      | 점검 날짜·관련인이 **읽기 전용**                                                                                                                                                                          |
| E11                        | 데스크톱↔모바일 동기화 왕복                                                               | 새 필드 유실 없음. **★단, 이 항목은 동시 편집을 검사하지 않는다**(N-9)                                                                                                                                    |
| E12                        | Google Tasks 연동 켠 채 **점검 날짜만** 수정 → 동기화                                     | 구글 쪽 `updated`가 **안 바뀐다**                                                                                                                                                                         |
| **E13 (신규, P0-B)**       | A기기에서 알람 켬 → 동기화 → B기기 확인                                                   | **B기기에서도 켜져 있다**(현 설계의 사양). 오너가 이걸 원하는지가 D-1 질문 1                                                                                                                              |

#### (4) 관측 — 실패를 어떻게 알아차릴 것인가

1. **`userData/notify-diag.log` 파일 로그 (1순위 — rev.2의 `console.log`에서 변경)**
   `electron/nativeDesktopDiag.ts` 패턴을 그대로 재사용한다. 그 파일 **머리 주석 4-12행이 이유를 직접 적어 놓았다** — _"Packaged Electron에서는 main process console.log가 stderr로 가서 cmd 없이는 안 보이고, DevTools 콘솔에는 renderer 로그만 보인다."_ 그래서 ①console ②전 창 IPC fanout ③`userData/*.log` append 3중 발사를 한다(`initNativeDesktopDiag` 53행, 경로 58행, `appendFileSync` 75·86행, 실패는 `catch {}`).
   기록할 것: push 수신 시 `source`·건수·전체 칸 상태·`sender.id`, 발화 시 `reminderId`·`source`, 만료 폐기 건수, **`isStillValid` 탈락 건수와 사유**, `Notification.isSupported() === false` 경고 1회.
   **사용자가 메모장으로 열어 그대로 공유할 수 있다** — "알림이 안 와요" 신고에 이 파일 하나면 판정이 끝난다.
2. **설정 화면 "알림 진단" 접기 패널** — `reminder:diagnostics` invoke. 출처별 예약 건수 / 가장 이른 발화 예정 시각 / 마지막 push 시각 / **`restoredFromSnapshotAt`·`snapshotItemCount`**(렌더러 push로 덮이지 않는 필드).
   - **★ 원리적 한계 (rev.3 신설)**: 이 패널은 메인 렌더러에서만 보이고, **메인 창을 여는 순간 렌더러가 살아나 `'todo'` 칸을 자기 계산으로 덮어쓴다.** 즉 콜드 부팅 시점의 숫자를 이 패널로는 **원리적으로 확인할 수 없다.** `restoredFromSnapshotAt`을 추가한 것이 그 때문이고, **E5b의 정본 판정 수단은 로그 파일**이다.
3. **"지난 알람" 앱 내 배지** — 만료 폐기·정본 탈락으로 안 울린 알람 개수.
4. **★ 게이트 4종이 실제로 무엇을 도는가 (rev.3에서 다시 측정)**

| 검증 명령                     | 실제 범위 (실측)                                                                                                                                   | 이 계획의 무엇을 지키는가                                                                                                                                                |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npx tsc --noEmit`            | 프로젝트 전체 타입                                                                                                                                 | 화이트리스트 누락, `filterStaffContacts` 타입 게이트, 시그니처 4층 불일치                                                                                                |
| `npm run lint`                | **`eslint "src/**/\*.{ts,tsx}"`—`electron/`이 글롭에 없다**(`package.json:24`)                                                                     | src 코딩 컨벤션만. **M4가 만드는 electron 파일 4개는 lint를 통과하지 않는다 — 검사되지 않기 때문이다**                                                                   |
| `npm run test`                | Vitest, include = `src/**` + **`electron/**`**(`vitest.config.ts:20`)                                                                              | **알림 병합·만료·발화 이력·정본 조회·B1 저장 경로·자동 보드·프라이버시·훅 배치 계약 — 이 계획의 사실상 유일한 자동 방어선**                                              |
| `npm run regression-check`    | **`scripts/regression-grep-check.mjs`(grep 44종)만.** 단위 테스트 미실행                                                                           | 기존 44종 + **이 계획이 추가하는 2종**(§B M0)                                                                                                                            |
| **할일 도메인 현재 커버리지** | `src/adapters/repositories/__tests__/`에 `JsonSeatingSnapshotRepository.test.ts` **하나뿐**, `src/adapters/stores/__tests__/`에 todo·tasks **0건** | **B1 방어의 핵심("저장된 배열 단언")과 Principle 2 하드 게이트("왕복 동등성")가 둘 다 신규 작성이다.** repository mock과 zustand 리셋 하네스부터 만든다 — M0 공수에 반영 |

---

## B. 계획 본문

### B-0. 진행 순서

```
M0 데이터 토대(필드 + 게이트 규칙)
   ↓
M1 점검 날짜 UI (날짜만)
   ↓
M2 자동 배치 보드 (프로 모드, 기본 꺼짐)
   ↓
M3 관련인 @태그 (교직원)
   ↓
M4 알림 허브 + 알람 ★최고 위험 · 2커밋 · electron 4파일
   ↓
M5 모바일 읽기 전용 + 문서
```

**★ M4를 맨 뒤에 둔 근거가 하나 사라졌다 (N-14).**
rev.2의 근거 1은 *"`electron/main.ts`·`preload.ts`·`src/global.d.ts`가 원클릭업무포털 세션에서 수정·스테이징 중"*이었다. **실측 결과 현재 워킹트리는 `M DECISIONS.md` 하나뿐이고 electron 3파일은 전부 깨끗하다** — 그 세션이 커밋을 마쳤다. 근거 2(죽은 시각 필드)는 `checkAt`을 날짜만으로 바꿔 이미 해소됐다.
**즉 M4 후행은 현재 근거 없이 남아 있고, D1(최고 위험을 먼저 격리)에는 오히려 역행한다.** 다만 이건 품질 문제가 아니라 일정 문제이므로 **오너에게 반환한다(D-1 질문 6).** 어느 순서든 **2커밋 격리는 커밋 단위의 문제라 그대로 유지된다.**

**M0 완료 시점에 M1·M2·M3은 서로 독립**이다. M4가 막히면 나머지는 M4 없이도 출시 가능하다(§A-3 O3 비상 경로). 단 **M5는 M4에 의존한다** — M4 없이 M5를 배포하면 사용자 가이드가 없는 기능을 설명하게 된다.

---

### M0 — 데이터 토대 (필드 정의 + 게이트 규칙, 화면 변화 0)

**목적**: 4건 전부가 쓸 항목을 한 번에 확정하고, **이 계획의 새 규칙을 실제로 검사하는 장치를 먼저 만든다.**

**파일**

- `src/domain/entities/Todo.ts`
  - `readonly checkAt?: string;` — **형식 `"YYYY-MM-DD"`(날짜만)**. 실측 확인: 같은 파일 42-44행의 `dueDate`·`startDate` 주석이 `"YYYY-MM-DD"`, `time`이 `"HH:mm"`이다 — **기존 관례와 정확히 일치**시킨 것이지 새 형식이 아니다.
  - `export interface TodoRelatedPerson { readonly staffId: string; readonly nameSnapshot: string; }` — 주석: _"nameSnapshot은 폴백일 뿐 정본이 아니다. 정본은 언제나 연락처이며, 생성 후 다시 쓰지 않는다."_
  - `readonly relatedStaff?: readonly TodoRelatedPerson[];`
  - `export const TODO_LOCAL_ONLY_FIELDS = ['checkAt', 'relatedStaff'] as const;` + 유니온 타입
- `src/domain/entities/TodoSettings.ts` (현재 22줄)
  - `TodoViewMode`(2행)에 `'autoBoard'` 추가
  - **★ 오너 결정 1(㉰) 반영 — `alarmEnabled` 는 여기 넣지 않는다.** 켬/끔 스위치는 기기별이므로
    아래 `todoAlarmDeviceState.ts` 가 따로 갖는다. 여기에는 **계정 전체 공유가 맞는 값 5개만** 둔다.
  - `readonly alarmLeadMinutes?: number;`(0) · `readonly alarmDailyCap?: number;`(8) · `readonly alarmDefaultTime?: string;`(`'09:00'`) · **`readonly alarmTextExposure?: 'countOnly' | 'full';`(기본 `'countOnly'` — 오너 결정 2)** · `readonly alarmHorizonDays?: number;`(14 — P1-C)
- **★ `src/adapters/repositories/todoAlarmDeviceState.ts` (신규 — 오너 결정 1)**
  - `TODO_ALARM_DEVICE_STATE_KEY = 'todo-alarm-device-state'`, `readTodoAlarmEnabled()`, `saveTodoAlarmEnabled(boolean)`.
  - `driveSyncDeviceState.ts` 와 **같은 모양**(storage 키를 쓰되 `syncRegistry` 미등재).
  - 파일 머리에 경고 주석: _"이 키를 `syncRegistry` 에 등재하지 말 것 — 등재하면 껐는데
    다른 기기의 오래된 사본이 되살린다. 그게 되돌리기 1순위 수단을 무력화한다(ADR-040 과 같은 실패)."_
  - **미등재를 강제하는 메타 테스트** `todoAlarmDeviceState.notSynced.test.ts` — `SYNC_REGISTRY`
    의 `fileName` 목록에 이 키가 **없음**을 단언. (`driveSyncLastSyncedAtLocation.meta.test.ts` 가 같은 선례.)
  - **`DEFAULT_TODO_SETTINGS`(19-22행)는 건드리지 않는다** — 전부 optional이므로 기존 저장 파일과 100% 호환.
  - **`boardMode` 없음**(P1-9). `lastView`(13행)가 이미 뷰를 기억한다.
  - ★ 주석 한 줄: _"이 설정들은 `Settings.todoSettings` 안에 있어 `settings.json`으로 저장되고 **Drive로 기기 간 공유된다**(`syncRegistry.ts:66`). 기기별로 두려면 저장 위치를 옮겨야 한다 — ADR-066 Consequences 참조."_
- `src/domain/rules/todoCheckRules.ts` **(신규)** — `parseCheckAt`, `isCheckDue(todo, todayStr)`, `nextTouchDate(todo)`, `compareByNextTouch`. **전부 문자열 비교, `Date` 미사용**
- `src/domain/rules/todoTime.ts` **(신규)** — `wallClockToEpochMs(dateStr, timeStr, offsetMinutes): number | null`. `Date`를 쓰지 않고 순수 산술. 오프셋은 어댑터가 `-new Date().getTimezoneOffset()`으로 주입. 주석에 _"한국은 서머타임이 없어 고정 오프셋이 항상 옳다"_ 명시
- `src/domain/rules/todoCheckRules.test.ts`, `todoTime.test.ts` **(신규, 평면 — 형제 `todoRules.test.ts`가 평면)**
- **★ `scripts/regression-grep-check.mjs` — 규칙 2건 추가 (신규 작업 항목)**
  실측한 스키마: `absenceChecks`(278행)의 원소는 `{ name, roots: string[], extensions: string[], patterns: RegExp[], fileFilter?: (path) => boolean }`.
  - **규칙 A — 새 도메인 규칙에서 시계 직접 읽기 금지**
    `roots: ['src/domain/rules']`, `extensions: ['.ts']`, `patterns: [/new Date\(/, /Date\.now\(/]`,
    **`fileFilter: (p) => /todo(CheckRules|Time|AlarmRules|AutoBoard)\.ts$/.test(p)`**
    > **★ 반드시 `fileFilter`로 신규 4파일만 겨냥할 것.** Critic 지시대로 `src/domain/rules/todo*.ts` 글롭을 쓰면 **기존 `todoRules.ts`의 `new Date(` 8건**(56·67·82·86·90·132·158·196행)에 걸려 **손도 안 댄 파일 때문에 게이트가 즉시 빨간불**이 된다. 그 8건은 대부분 `isOverdue(todo, today: Date = new Date())`처럼 **기본 인자**여서 순수성 위반도 아니다.
  - **규칙 B — 새 알람 훅에서 인자 없는 전체 삭제 금지**
    `roots: ['src/adapters/hooks']`, `patterns: [/clearReminderSchedule\(\s*\)/]`, `fileFilter: (p) => /useTodoAlarmOsPush\.ts$/.test(p)`
    → B4/P0-2의 재발을 grep이 막는다.
    > **이로써 "grep 전용이라는 사실을 한계가 아니라 도구로 쓴다"**(Architect Synthesis 4).
- **★ `src/usecases/todo/ManageTodos.ts` (B1 핵심)**
  - **67행** 화이트리스트에 `'checkAt' | 'relatedStaff'` 추가 (실측: 현재 11키 + `'notes'`)
  - **21행** `withSyncMeta<T extends Todo>(todo: T, now: string, **changedKeys?: readonly string[]**): T` — **선택적 3번째 인자.** `changedKeys`가 주어지고 **전부** `TODO_LOCAL_ONLY_FIELDS`에 속하면 `pendingRemoteOp: todo.pendingRemoteOp`(기존 값 유지). 아니면 기존대로 `nextPendingOp(todo)`(14행).
  - **73행(`updateTodo`)만** `withSyncMeta({...todo, ...changes}, now, Object.keys(changes))`로 호출. **나머지 6곳(112·121·148·166·180·202)은 인자를 생략해 무변경** → `addTodo`·`toggleTodo`·서브태스크·아카이브 경로 손대지 않는다.
  - **★ 호출 수는 정의 21행 + 호출 7곳이다**(73·112·121·148·166·180·202 — 실측). rev.2가 두 곳에서 "8곳"이라 쓴 것은 오기였다.
- `src/adapters/stores/useTodoStore.ts`
  - **27행** `updateTodo` 타입에 `'checkAt' | 'relatedStaff'` 추가.
    > **★ 이건 런타임 필터가 아니라 `Partial<Pick<Todo, …>>` 타입이다**(N-15). 빠지면 조용히 무시되는 게 아니라 **`tsc`가 잡는다(요란한 실패)**. 189-190행이 `syncedChanges`를 그대로 스프레드하므로, 변수로 넘기면 타입만 통과하고 값은 저장된다.
  - `pendingRemoteOp` 설정 지점 **117·146·192행 중 `updateTodo` 경로(192행)만** 같은 분기 적용. **117행(`addTodo`)·146행(`toggleTodo`)은 건드리지 않는다**
- 신규 테스트 4개: `ManageTodos.localOnly.test.ts` · `useTodoStore.localOnly.test.ts` · `todoLocalOnlyFields.mirror.test.ts` · `useTasksSyncStore.localOnly.test.ts`
- 신규 테스트 1개: `src/adapters/repositories/__tests__/JsonTodoRepository.test.ts`
  > **★ 공수 주의**: 위 5개는 전부 **신규**다. `src/adapters/stores/__tests__/`에 todo·tasks 테스트 **0건**, `repositories/__tests__/`에 `JsonSeatingSnapshotRepository.test.ts` 하나뿐임을 실측했다. **repository mock과 zustand 리셋 하네스를 먼저 만들어야 한다** — rev.2가 "기존 확장"이라 적어 공수를 낮춰 잡았던 부분이다.

**알려진 불일치 — 이번에 정리하지 않는다**
스토어 화이트리스트(27행)에는 `'notes'`가 없고 유스케이스(67행)에는 있다. **이미 어긋나 있다.** `notes`는 Google Tasks 동기화 대상이라 스토어 경로를 여는 순간 동기화 동작이 바뀐다 — 이 4건과 무관한 별개 위험이다. ①두 파일에 _"두 목록이 `notes`에서 어긋나 있음 — ADR-066 Follow-up 6"_ 주석 ②미러 테스트는 **`TODO_LOCAL_ONLY_FIELDS`에 대해서만** 동기화를 강제(전체 일치를 요구하면 지금 당장 빨간불).

**완료 판정**

1. `checkAt`을 담은 todo를 저장→로드하면 값이 그대로다.
2. 새 필드가 **없는** 기존 `todos.json`을 읽어 다시 저장하면 파일 내용이 동등하다.
3. **★ `updateTodo(id, { checkAt })` 후, repository mock의 `saveTodos`에 넘어간 배열에서 그 todo의 `pendingRemoteOp`가 호출 전 값과 동일하다.**
4. `updateTodo(id, { checkAt, text })` 후 저장 배열의 `pendingRemoteOp`는 기존 규칙대로.
5. `addTodo` 후 `'create'`, `toggleTodo` 후 `'update'` — **회귀 없음 단언.**
6. 미러 테스트 통과.
7. `domainPurity.meta.test.ts` 통과 — `todoCheckRules.ts`·`todoTime.ts`가 **외부 import를 쓰지 않는다**. _(~~`Date`·`crypto`~~ 삭제 — 이 테스트는 import 지정자만 검사한다.)_
8. **★ `npm run regression-check`가 규칙 2건 추가 후에도 통과한다** — 기존 44종 + 신규 2종 = 46종 전부 초록. **`todoRules.ts`가 이 규칙에 걸리지 않음을 반드시 확인**(fileFilter가 제대로 좁혀졌는지).
9. **★ `useTasksSyncStore` PULL 후 `checkAt`·`relatedStaff`가 살아남는다** — §0-3(라)에서 "확인하지 않고 인용했다"고 고지한 항목을 테스트가 대신 보증한다.
10. `todoTime.test.ts`가 오프셋 0/+540/−300 각각에서 통과한다 — **실행 머신 시간대와 무관하게 결정적.**
11. 화면에 보이는 변화가 0건이다.

**검증 명령 — 무엇을 커버하고 무엇을 커버하지 않는가**

```bash
npx tsc --noEmit                 # 커버: 화이트리스트 누락, withSyncMeta 시그니처
npm run lint                     # 커버: src만 (이 단계는 전부 src라 온전히 커버됨)
npm run test -- todoCheckRules todoTime ManageTodos useTodoStore todoLocalOnlyFields JsonTodoRepository useTasksSyncStore domainPurity
npm run test                     # ★ 완료 판정 1~7·9·10의 유일한 실행 수단
npm run regression-check         # ★ 완료 판정 8. 이 단계에서 새 규칙 2종이 처음으로 실재하게 된다
```

**되돌리기**: 필드만 추가·화면 무변화. 되돌리면 `checkAt` 값이 든 파일은 남고 새 코드가 무시(무해). **재시작 불필요.** 단 `regression-grep-check.mjs` 변경은 함께 되돌려야 한다(안 그러면 존재하지 않는 파일을 겨냥하는 규칙이 남는다 — `absenceChecks`는 파일이 없으면 통과하므로 실피해는 0).

---

### M1 — 점검 날짜 UI ("다시 확인할 날")

**★ 착수 전 확인 (§0-3(라) 대응)**: 아래 3파일을 **먼저 열어** 확장 지점을 확인한다. rev.3은 이 파일들의 내부 구조를 실측하지 않고 "재사용/확장"이라고만 적었다.
`TodoEditModal.tsx` · `DatePopover.tsx` · `ViewToggle.tsx`(M2용).

**파일**

- `src/adapters/components/Todo/components/TodoEditModal.tsx` — 점검 날짜 입력(날짜 + 지우기). 라벨 **"다시 확인할 날"**, 도움말 _"공문 회신, 제출물 확인처럼 '끝내는 날'과 '다시 볼 날'이 다를 때 씁니다."_ **시각 입력은 넣지 않는다** — 시각은 기존 "시간" 항목이 담당한다.
- `src/adapters/components/Todo/components/DatePopover.tsx` — 기존 팝오버 **재사용/확장**
- `src/adapters/components/Todo/views/ListView.tsx`, `TimelineView.tsx`, `KanbanView.tsx` — 점검 배지. `sp-*` 토큰만, 하드코딩 HEX 금지
- `src/adapters/components/Todo/components/KanbanCard.tsx` — 카드에 점검 배지
- `src/adapters/components/Dashboard/DashboardTodo.tsx` — "오늘 확인" 배지. **인터랙티브 요소는 `min-h-6`/`min-w-6` 필수**
- `src/domain/rules/todoRules.ts` — `sortTodos`(11행)에 `nextTouchDate` 기반 정렬 옵션 추가(기존 모드는 그대로)
- **`src/widgets/items/Tasks.tsx`는 이 계획서의 파일 목록에서 뺀다** — 전 저장소 참조 0건인 죽은 플레이스홀더다(실측: `grep -rn "items/Tasks" src/` 무결과). **파일 삭제는 이 계획의 범위가 아니다.**
- **★ `src/widgets/items/TodoWidget.tsx`는 이 계획의 관심 대상이 아니다 — 파일을 삭제하지 않는다.** `registry.ts:13`이 `import { TodoWidget }`, `:292`가 `component: TodoWidget`으로 **실사용 중**이다. 지우면 빌드가 깨지고 할일 위젯이 사라진다. 프라이버시 테스트 대상만 `DashboardTodo`·`SidePinWidgetZone`으로 옮긴다(M3).
  > **위 두 줄은 뜻이 다르다.** `Tasks.tsx`는 _"계획서 목록에서 뺀다"_(문서 정리), `TodoWidget.tsx`는 _"건드리지 않는다"_(코드 보존). rev.2가 이 둘을 "제거"라는 같은 단어로 이어 붙인 것이 오류였다.

**완료 판정**

1. 마감일이 **없고** 점검 날짜만 있는 할일이 "오늘 볼 것" 목록에 뜬다.
2. 점검 날짜를 설정/해제해도 **저장된 배열의** `pendingRemoteOp`가 안 바뀐다(M0-3이 커버).
3. `widgetAccessibility.test.ts` 통과.
4. 라이트 모드에서 새 배지 글자가 읽힌다.
5. 모든 새 UI 문구가 한국어.
6. 점검 날짜가 없는 기존 할일의 화면이 M1 이전과 동일하다.
7. **새로 출시된 입력 중 "저장은 되는데 아무 일도 안 일어나는" 것이 없다.**
8. **★ `npx tsc --noEmit`이 통과한다 — `TodoWidget.tsx`가 그대로 있고 `registry.ts`가 깨지지 않았다**(N-2 재발 방지).

**검증 명령**

```bash
npx tsc --noEmit && npm run lint   # ★ 판정 8은 여기서 5초 안에 드러난다
npm run test -- todoRules widgetAccessibility
npm run test && npm run regression-check
npm run electron:dev               # 실화면: 라이트/다크, 대시보드 위젯·옆핀 배지
```

**커버하지 않는 것**: 판정 1·4·6·7은 **자동 검사가 없다** — 실화면 확인이 유일한 수단이다.

**되돌리기**: UI 커밋 revert. 데이터는 M0 필드에 남는다. 재시작 불필요.

---

### M2 — 자동 배치 보드 (프로 모드 전용, 기본 꺼짐)

> **★ 도달 범위**: 자동 보드는 `TodoSettings.mode === 'pro'` 사용자에게만 보인다(`TodoSettings.ts:7`, `:10` 주석 _"프로 모드 기본 뷰"_). 기본값은 `{mode:'default'}`(19-22행)이므로 **대다수 사용자에게는 존재 자체가 도달하지 않는다**(N-16).

**파일**

- `src/domain/rules/todoAutoBoard.ts` **(신규)**
  - `AutoBoardBucket = 'triage' | 'today' | 'inProgress' | 'upcoming'` — **`done`이 반환 타입에 없다**
  - **★ `bucketOf(todo, todayStr): AutoBoardBucket | null` — `todoRules.inferStatus(todo) === 'done'`이면 `null`을 반환한다(완료 항목은 어느 칸에도 배정하지 않는다).** 목록은 호출자가 `todoRules.filterActive`(147행, 아카이브 제거)를 통과시켜 넘긴다.
  - **★ `changesForBucketMove(todo, target, todayStr): Partial<Todo>` — `status`를 직접 만들지 않는다. `todoRules.applyStatusChange(todo, newStatus)`(217행)를 호출해 그 반환을 그대로 실어 보낸다.** 실측: `applyStatusChange`는 `status` + `completed` + **`subTasks`까지 함께 뒤집는다.** 기존 수동 칸반(`KanbanView.tsx:73-74`)이 정확히 이 함수를 쓴 뒤 `updateTodo`를 부른다 — **자동 보드는 같은 조합을 재사용한다.**
  - `describeBucketMove(todo, target, todayStr)` — 확인창 한국어 문구 생성
- `src/domain/rules/todoAutoBoard.test.ts` **(신규, 평면)**
- `src/adapters/components/Todo/views/AutoBoardView.tsx` **(신규)** — `KanbanColumn`·`KanbanCard`를 **재사용**(복사 금지)
- `src/adapters/components/Todo/components/BucketMoveConfirm.tsx` **(신규)** — _"'진행 중' 표시를 지우고 마감일을 오늘(8/21)로 바꿉니다. 진행할까요?"_
- `src/adapters/components/Todo/components/ViewToggle.tsx` — `'autoBoard'` 뷰 노출
- **`src/adapters/components/Todo/Todo.tsx`(2,635줄)** — **뷰 분기 한 줄만.** 이 파일에 로직을 넣지 않는다

**완료 판정**

1. **`Todo.tsx`의 diff가 10줄 이하.**
2. `bucketOf`가 **절대** `done`/`completed`를 만들지 않는다(반환 타입에 없음).
3. **★ `inferStatus(todo) === 'done'`인 할일에 대해 `bucketOf`가 `null`을 반환한다** — 날짜 조합 전수 테스트로 고정(N-3).
4. `inferStatus === 'inProgress'`인 할일은 마감일이 오늘이어도 '진행 중' 칸에 간다.
5. `changesForBucketMove`가 `status` 키를 포함하는 경우가 **'진행 중'으로 들어감 / '진행 중'에서 나감** 두 가지뿐임을 조합표 전수 테스트로 고정.
6. **왕복 테스트 — `(진행 중 칸 제외)` 단서 없음.** '진행 중'으로 넣었다 빼면 `status`가 `'inProgress'` → `'todo'`가 되고, **이것이 기대값임을 테스트가 명시적으로 단언한다.** 원복을 주장하지 않는다.
7. 드래그 후 확인창을 **취소**하면 `saveTodos`가 **호출되지 않는다**(저장 경로 단언).
8. `lastView` 기본값이 `'autoBoard'`가 아니고, **`boardMode`라는 두 번째 스위치가 존재하지 않는다.**
9. **★ 드래그 전후 `completed`와 모든 `subTasks[].completed`가 일관된다** — `applyStatusChange`를 거치므로 서브태스크가 함께 처리되고, 애초에 완료 항목은 보드에 없으므로 **완료가 풀리는 경로가 이중으로 닫혀 있다**(N-3 + P1-D).
10. **실기기 E6·E6b·E6c 통과.**

**검증 명령**

```bash
npx tsc --noEmit && npm run lint
npm run test -- todoAutoBoard                # ★ 판정 2~7·9의 유일한 실행 수단
npm run test && npm run regression-check
git diff --stat src/adapters/components/Todo/Todo.tsx   # 판정 1 (자동 게이트 아님 — 눈으로 확인)
```

**커버하지 않는 것**: 판정 1은 자동 검사가 없다. 판정 10은 수동이다. `regression-check`는 이 단계의 규칙을 **하나도 검사하지 않는다.**

**되돌리기**: 뷰를 다른 것으로 바꾸면 즉시 현행 복귀. **단 §B-6 참조** — 드래그로 바뀐 `dueDate`·`status`는 남는다. 재시작 불필요.

---

### M3 — 관련인 @태그 (교직원 연락처 한정)

**파일**

- `src/domain/rules/todoMention.ts` **(신규)** — `extractMentionQuery(text, caretIndex)`, `applyMention(text, caretIndex, name)`. 순수 함수
- `src/domain/rules/todoMention.test.ts` **(신규, 평면)**
- `src/adapters/components/Todo/components/MentionPopover.tsx` **(신규)** — 기존 `contactRules.filterContactEntries`(202행, 초성 검색 지원) 재사용. **`kind === 'staff'`만 후보**(`contactRules.ts:111` `ContactKind='staff'|'student'|'guardian'`)
- `src/adapters/components/Todo/components/TodoEditModal.tsx` — 관련인 칩 표시·제거, `@` 입력 시 팝오버
- `src/adapters/components/Todo/components/RelatedStaffChips.tsx` **(신규)** — 표시 전용. `staffId`로 현재 연락처 조회 → 있으면 **현재 이름**, 없으면 `nameSnapshot` + 흐린 스타일 + "연락처에 없음"
- `src/adapters/components/Todo/views/ListView.tsx` 등 — **본 화면에서만** 칩 표시
- `src/adapters/components/Dashboard/DashboardTodo.privacy.test.tsx` **(신규, 평면 — 이 디렉터리에 테스트 0건)**
- **`src/adapters/components/SidePin/SidePinWidgetZone.privacy.test.tsx` (신규, 평면 — 이 디렉터리는 평면 관례) ★** — 진짜 무방비 표면
- **위젯·옆핀 렌더 파일은 건드리지 않는다** — 관련인을 읽는 코드를 넣지 않는 것이 곧 정책 이행
- **`src/widgets/registry.ts`는 건드리지 않는다** — `sidePin.eligible: true`를 `false`로 내리지 않는다(이미 쓰이는 기능 회수)

**완료 판정**

1. `relatedStaff`에 학생·보호자를 넣으려 하면 **타입 에러**가 난다. 실물: `contactRules.ts:213-216`의 `filterStaffContacts(contacts: readonly StaffContact[]): StaffContact[]`. _(이건 학생을 배제하는 **이유**가 아니라, 오너가 정한 범위를 컴파일러가 지키게 하는 **수단**이다.)_
2. 연락처에서 교직원을 삭제해도 할일이 안 깨지고 흐린 이름 + "연락처에 없음". **저장 데이터 불변.**
3. 이름을 바꾸면 표시가 **새 이름**. **저장 데이터 불변**(`saveTodos` 미호출 단언).
4. **`DashboardTodo.privacy` + `SidePinWidgetZone.privacy` 둘 다 통과** — 이름도 인원수도 등장하지 않는다.
5. `a@b.com` 입력에 멘션 팝오버가 뜨지 않는다.
6. 한글 조합 중("ㄱ"만 입력)에도 초성 검색이 동작한다.
7. **실기기**: E7·E8·E9 통과.

**검증 명령**

```bash
npx tsc --noEmit && npm run lint   # ★ 판정 1의 유일한 검사 수단
npm run test -- todoMention DashboardTodo.privacy SidePinWidgetZone.privacy
npm run test && npm run regression-check
npm run electron:dev               # PIN 잠금 켠 상태로 대시보드·바탕화면 모드·옆핀 육안 확인
```

**되돌리기**: 커밋 revert. `relatedStaff` 값은 파일에 남았다가 코드가 무시. 되돌려도 위젯·옆핀에는 원래 안 떴으므로 노출 없음. 재시작 불필요.

---

### M4 — 알림 허브 통합 + 할일 시각 알람 ★최고 위험 · **2커밋**

> **★ rev.2의 "단일 커밋" 결정을 철회하고 2커밋으로 바꾼다 (N-10 / Critic 지시 13).**
> **(a) 커밋** — `electron/ipc/reminderCore.ts` 순수 모듈 추출. **동작 변화 0.** 기존 동작을 `reminderCore.test.ts`로 고정.
> **(b) 커밋** — 출처별 병합 + `expiresAt` + 발화 이력 + 정본 조회 + 할일 생산자 + 훅 + 설정 UI.
> **되돌리기는 여전히 1회다** — (b)만 revert하면 관찰 기록 알림이 완전히 원상복구되고, 남은 (a)는 동작이 같으므로 "어중간한 상태"가 아니다. **rev.2의 반대 논거는 리팩터링의 정의상 성립하지 않았다.** 그리고 2커밋이면 게이트가 깨졌을 때 **원인이 추출인지 병합인지 즉시 갈린다** — rev.2가 O1(4건 일괄)을 탈락시킨 바로 그 논리다.

**착수 전 필수 확인**

```bash
git status --short   # electron/main.ts · preload.ts · src/global.d.ts 가 타 세션에서
                     # 수정 중인지 확인. (2026-08-21 실측: 전부 깨끗)
```

**진행 순서**

1. **(a)** `reminderCore.ts` 추출 → 기존 동작 테스트 고정 → **게이트 4종 통과 → 커밋.**
2. **(b)** 관찰 기록 경로 회귀 테스트 작성(기능 추가 **전**).
3. **(b)** 출처별 병합 + `expiresAt` + 장부 + `isStillValid` 구조 투입. 회귀 테스트 통과 확인.
4. **(b)** 할일 생산자 + 훅 + 설정 UI. **게이트 4종 + 실기기 → 커밋.**

**파일 — (a) 커밋**

- **`electron/ipc/reminderCore.ts` (신규) ★**
  - `export interface ReminderScheduleItem { reminderId; fireAt; expiresAt?; title; body; studentDedupKey; }` — `expiresAt`은 optional(구 렌더러 호환)
  - `export type ReminderSource = 'record' | 'todo'`
  - `export function applySchedule(buckets, source, items): Buckets` — 해당 칸만 교체
  - `export function applyClear(buckets, source?): Buckets` — 인자 없으면 전체(구 렌더러 호환)
  - `export function selectDue(buckets, now, firedIds, **isStillValid**): { toFire, expired, dropped, nextBuckets }`
    - `expiresAt < now` → **발화하지 않고 `expired`**
    - `firedIds`에 있으면 건너뜀
    - **★ `isStillValid(item)`가 false → `dropped`**(N-6). 이 술어는 껍데기가 주입한다 — 코어는 파일을 모른다.
    - **★ `isStillValid`가 throw하면 그 항목을 발화하지 않는다**(안전 쪽 실패)
  - `export function normalizePayload(payload): { source, items }` — **배열이 오면 `source: 'record'`**
  - `export function diagnostics(buckets, now): { counts, nextFireAt, lastPushedAt, **restoredFromSnapshotAt, snapshotItemCount** }` — 뒤 두 필드는 **렌더러 push로 덮이지 않는다**(P2-E)
  - **`ipcMain`·`Notification`·`setInterval`을 import하지 않는다.** 관례: `aiBridgeCore.ts`/`aiBridgeLiveSyncCore.ts`
  - 타입 주석: _"`studentDedupKey`는 학생 전용이 아니다 — 출처별 중복 방지 열쇠다. 개명하지 않는 이유는 ADR-066."_
- **`electron/ipc/reminder.ts`** — 파일명·채널명 유지, 내부는 얇은 껍데기가 된다. **(a)에서는 동작이 바뀌지 않는다** — 모듈 전역 `schedule`(31행)·`firedThisSession`(33행)을 코어 함수 호출로 옮기기만 한다.
- **`electron/ipc/reminderCore.test.ts` (신규, 평면)** — (a) 시점에는 기존 동작만 고정(케이스 ①⑧). 모델: `electron/ipc/aiBridgeLiveSyncCore.test.ts`

**파일 — (b) 커밋**

- **`electron/ipc/reminderState.ts` (신규)** — `userData/notify-state.json` 읽기/쓰기. **`syncRegistry`에 등록하지 않는다.** 저장 대상은 **`todo` 칸 스냅샷 + 발화 이력뿐** — `record` 칸은 오늘과 똑같이 렌더러가 매번 push한다.
  - **★ 원자적 쓰기**: `backupManager.ts:391-406` `atomicWriteData` 패턴 — tmp 쓰기 → **읽어서 길이 비교** → 불일치면 unlink+throw → `renameSync`.
  - **★ 복원 시 `reminder.ts:35-45` `isValidItem` 재통과** — 유효한 JSON인데 형태가 다른 경우(다운그레이드·필드 변경)를 잡는다.
  - **★ 다중 프로세스 동시 쓰기 위험 없음** — `main.ts:5702` `app.requestSingleInstanceLock()`이 있어 앱은 한 프로세스뿐이고, 옆핀·위젯은 렌더러라 이 파일을 쓰지 않는다.
  - 파일 없음·깨진 JSON·형태 불일치·권한 실패 → **빈 상태로 조용히 폴백**(알림이 안 오는 건 나쁘지만 앱이 죽는 건 더 나쁘다).
- **`electron/notifyDiag.ts` (신규)** — `electron/nativeDesktopDiag.ts`(53·58·75·86행) 패턴 복제. `userData/notify-diag.log`에 `appendFileSync`, 세션 헤더, 실패는 `catch {}`. **패키징된 앱에서 main의 `console.log`는 사용자가 볼 수 없기 때문**(그 파일 머리 주석 4-12행이 직접 적어 놓았다).
- **`electron/ipc/reminder.ts`** — 껍데기 확장
  - `onSchedule(e, payload)` → `normalizePayload` → `applySchedule`. **`e.sender.id`를 기록해 같은 source의 소유 렌더러가 바뀌면 `[notify] WARN source=todo owner changed 12→34` 로그**(거부하지는 않는다 — 메인 렌더러 파괴·재생성 시 정상적으로 바뀌므로 거부는 오탐)
  - `onClear(e, source?)` → `applyClear`
  - **★ `isStillValid` 주입**: 발화 대상이 있을 때만 `path.join(getContentRoot(), 'data', 'todos.json')`을 읽어(`main.ts:579`가 쓰는 것과 같은 경로 계산) *"그 `todoId`가 존재하고 `completed !== true`"*를 판정한다. 선례: `archiveManager.ts:499,663`이 도메인 JSON을 직접 읽는다. 읽기 실패 시 **발화하지 않고 로그**.
  - `fireDue` → `selectDue` 결과로 발화. 발화 시 `hooks.onReminderFired(it.studentDedupKey, source)`
  - `reminder:diagnostics` **invoke 핸들러 신설**
  - 구버전 main + 신버전 렌더러 조합의 파괴성을 **축소 없이** 주석에 명시: _"배열이 아닌 객체가 오면 72행의 `: []` 때문에 **기록 알림 예약까지 전부 소멸한다.** 개발 중에만 발생하며 완전 재시작으로 해소된다."_
- **★ 시그니처 4층 통일 (N-4 / Critic 지시 15)** — 실측 기준은 `preload.ts:1209-1210`의 관용구(**preload가 IPC 페이로드를 풀어 위치 인자로 넘긴다**)다. 이걸 유지한 채 인자만 둘로 늘린다.

| 층          | 파일·행                      | 시그니처                                                                                                                                                                                                                                      |
| ----------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 코어 발화부 | `reminderCore.ts`            | `hooks.onReminderFired(it.studentDedupKey, source)` — **위치 2개**                                                                                                                                                                            |
| main 훅     | `electron/main.ts:5822 부근` | `onReminderFired: (dedupKey: string, source: ReminderSource) => broadcastToAllWindows('reminder:fired', { dedupKey, source })` — 와이어는 **객체**                                                                                            |
| preload     | `electron/preload.ts:1209`   | `onReminderFired: (callback: (dedupKey: string, source: ReminderSource) => void) => { const handler = (_event: unknown, p: { dedupKey: string; source: ReminderSource }) => callback(p.dedupKey, p.source); … }` — **객체를 풀어 위치 2개로** |
| 렌더러 훅   | `useReminderOsPush.ts:68`    | `api.onReminderFired((dedupKey, source) => { if (source === 'record') markFired(dedupKey); })` — **위치 2개**                                                                                                                                 |

- `electron/preload.ts`(1186-1215) — `scheduleReminders(source, items)`, **`clearReminderSchedule(source?)`**, 위 `onReminderFired`, `getReminderDiagnostics()`
- `src/global.d.ts`(759-770) — 위 4개 타입 갱신
- **`src/adapters/hooks/useReminderOsPush.ts`** — 최소 변경
  - 180행 `api.scheduleReminders(items)` → `api.scheduleReminders('record', items)`
  - **94행 `api.clearReminderSchedule()` → `api.clearReminderSchedule('record')`** ← **"스누즈가 할일 알람을 죽이던" 구멍을 막는 한 줄**
  - 68행 → 위 표의 위치 인자 2개. **접두 문자열로 분기하지 않는다** — 실측: 담임반 키 `` `${sid}:${date}` ``, 수업반 키 `` `subject:${cls.id}:${today}` ``, 둘 다 `record:`로 시작하지 않는다
  - **`studentDedupKey` 필드명은 그대로 둔다**
- `src/domain/rules/todoAlarmRules.ts` **(신규)** — `buildTodoAlarmSchedule(todos, settings, nowMs, offsetMinutes, graceMs, **horizonDays = 14**)`.
  - 유예 창 → `expiresAt` 계산
  - **★ 지평**: `horizonDays` 밖의 할일은 배열에 넣지 않는다(P1-C — 1년치 200건이 매 push마다 main으로 가고 파일에 쓰이는 것을 막는다)
  - **★ 하루 상한은 `fireAt`을 현지 시간대로 환산한 날짜별**로 적용. 정렬 `fireAt`↑ → `priority`(high>medium>low>none) → `id` 사전순
  - `reminderId = todo:<todoId>:<fireAtMs>`
  - **★ `title = '할 일 알림'` 고정. `body`는 `alarmTextExposure`가 결정** — `'countOnly'`(기본)면 `'확인할 일이 N건 있습니다'`, `'full'`이면 `todo.text`(결정 8)
  - `todoTime.wallClockToEpochMs` 사용
- `src/domain/rules/todoAlarmRules.test.ts` **(신규, 평면)**
- `src/adapters/hooks/useTodoAlarmOsPush.ts` **(신규)** — `useTodoStore`만 구독
  - **★ `alarmEnabled === false`(및 electronAPI 없음을 제외한 모든 OFF 조건)일 때 조기 return **전에 반드시 `clearReminderSchedule('todo')`를 호출한다.** 기존 훅(`useReminderOsPush.ts:94`)을 그대로 베끼면 **인자 없는 `clearReminderSchedule()`을 부르게 되고, 그러면 기록 알림이 전멸한다.** 이 경고를 코드 주석에도 남긴다. **grep 규칙 B가 이걸 게이트에서 잡는다\*\*(M0).
- **★ `src/App.tsx` — `MainApp()`(764행) 안에 `useTodoAlarmOsPush()` 한 줄 추가 (P0-A)**
  > **`App()`(570행)에 두면 안 되는 이유**: `App()`은 훅이 하나도 없는 **분기 함수**이고, `?mode=widget`·`?mode=icon`·빠른입력·스티커·멀티설문공유 창이 **전부 `dist/index.html`을 로드**하며(`main.ts:696·841·1903·2386·2826`) `src/main.tsx`가 무조건 `<App/>`을 렌더한다. 여기에 훅을 두면 **최대 6개 렌더러가 같은 `'todo'` 칸에 push해 "출처당 생산자 하나" 불변식이 깨진다.**
  > **기존 기록 알림 훅이 이미 정답 자리에 있다** — `ReminderPopup`은 `App.tsx:1323`, 즉 `MainApp` 안이다. rev.2가 *"팝업과 무관하므로"*라며 버린 그 위치가 사실 이 저장소가 이미 찾아낸 정답이었다.
- `src/adapters/components/Settings/…` (할일 설정 탭) — 알람 켬/끔, 미리 알림(0/5/10/30분), 기본 발화 시각, 하루 상한, **알림에 할 일 내용 표시**(결정 8), **알림 진단 접기 패널**
- `electron/ipc/reminderState.test.ts` **(신규, 평면)**
- **`electron/appEntryReminder.contract.test.ts` (신규) ★P0-A 강제 수단**
  > **모델은 `electron/sidePinEntry.contract.test.ts`이되, rev.2가 이 파일의 성격을 잘못 읽었다.** 실측: 이건 **의존 그래프 테스트가 아니라 소스 텍스트 슬라이스 단언 테스트**다 — `readFileSync`로 소스를 읽고, 33-38행처럼 `main.indexOf(...)`로 **구간을 잘라 그 안만** `toContain`/`not.toContain` 한다.
  > **왜 이 도구여야 하는가**: 위젯·아이콘·빠른입력은 `MainApp`과 **같은 번들**이므로 "진입점 의존 그래프"로는 **원리적으로 구분할 수 없다.** 소스 구간 단언은 그 제약을 받지 않는다.
  > **단언 3건**: ①`src/App.tsx`를 `export function App()` ~ `function IconApp()` 구간으로 잘라 **`useTodoAlarmOsPush`가 없음** ②`function MainApp()` 이후 구간에 **있음** ③`src/sidepin-main.tsx`에 알람 훅과 `from './App'`이 **없음**

**불변식 (명시)**

> **한 `source`당 생산자는 정확히 하나다.** 옆핀은 별도 렌더러 진입점(`sidepin.html` → `src/sidepin-main.tsx` → `<SidePinApp/>`, dev·prod 양쪽 다)이지만 **메인과 같은 preload를 공유한다**(`sidePinBrowserWindow.ts:174`) — 즉 옆핀에서도 `scheduleReminders` 호출이 물리적으로 가능하다. 위젯·아이콘·빠른입력·스티커는 **같은 번들을 공유**하므로 더 위험하다. 이 불변식은 ①**소스 구간 계약 테스트** ②main의 소유 렌더러 교체 경고 로그 두 겹으로 지킨다.

**완료 판정**

1. `record` 5건 → `todo` 3건 push 후 총 8건 예약. `record` 재-push(3건) 후에도 **todo 3건 생존.**
2. `clearReminderSchedule('record')` 후 **todo 3건 생존.**
3. **★ `alarmEnabled`를 켜서 todo 3건 예약 → 끄면 todo 칸 0건, record 칸은 그대로.**
4. 구형 **배열** payload를 보내면 `record` 칸으로 들어간다.
5. **★ `expiresAt`이 지난 항목은 `toFire`가 아니라 `expired`로 분류된다.**
6. **★ 발화 이력에 있는 `reminderId`는 재발화하지 않는다** — "14:00 발화 → 14:03 재시작".
7. `alarmEnabled` 기본값 `false`.
8. 하루 상한이 **`fireAt`의 현지 날짜별**로 적용된다 — _"이틀 × 각 10건 → 각 날 8건, 합계 16건"_. 지평 14일 밖은 배열에 없다.
9. `reminder:diagnostics`가 출처별 건수·다음 발화 시각·**`restoredFromSnapshotAt`·`snapshotItemCount`**를 반환하고 설정 패널에 표시된다.
10. **★ 계약 테스트 3건 통과** — `App()` 구간에 알람 훅 없음, `MainApp()` 구간에 있음, 옆핀 진입점에 없음.
11. **★ 콜드 부팅 (양방향)**
    - **(정방향)** 시작 모습 `widget`/`sidePin`/`icon` **3종 각각** + **`memorySaverMode: true`**로 완전 종료 후 재실행 → **`userData/notify-diag.log`의 todo 예약 건수 ≠ 0**이고 예정 시각에 실제 발화.
    - **★ (역방향, N-6)** _"스냅샷에 있으나 현재 `todos.json`에 없거나 `completed === true`인 할일은 발화하지 않는다"_ — `reminderCore.test.ts` 케이스 ⑨ + 실기기 **E5c**.
    - **판정 수단은 로그 파일 전용** — 진단 패널을 열면 메인 렌더러가 살아나 `'todo'` 칸을 덮어써 **확인 행위가 증거를 파괴한다**(P2-E).
12. **★ 토스트 본문에 기본값으로 할일 텍스트가 들어가지 않는다**(`alarmTextExposure: 'countOnly'`) — 단위 테스트 + 실기기 **E9b**.
13. **실기기**: E1·E2·E2b·E3·E4·E4b·E5·E5b·**E5c**·**E9b** 전부 통과.

**검증 명령 — 무엇을 커버하고 무엇을 커버하지 않는가**

```bash
# (a) 커밋 후
npx tsc --noEmit && npm run test -- reminderCore
# ★ 여기서 통과해야 (b)로 간다. 동작 변화 0을 이 시점에 고정한다.

# (b) 커밋 후
npx tsc --noEmit
npm run lint          # ★ electron/ 은 검사되지 않는다 — package.json:24 글롭이 src/** 뿐
npm run test -- reminderCore reminderState todoAlarmRules appEntryReminder
npm run test          # ★ 게이트 4종 중 electron 코드를 실제로 실행하는 유일한 명령
npm run regression-check   # ★ 규칙 B(인자 없는 clearReminderSchedule 금지)만 이 단계를 지킨다
# ★ electron main 변경은 electron:dev 가 감시하지 않는다 — 반드시 완전 종료 후 재시작
npm run electron:dev
```

**커버하지 않는 것 (명시)**: 판정 11·13은 **자동 검사가 전혀 없다** — 실기기 콜드 부팅과 로그 파일 육안 확인이 유일한 수단이다. `npm run lint`는 이 단계가 만드는 electron 파일 4개를 **아예 보지 않는다.**

**되돌리기**: §B-6 참조. **재시작 필요(electron main).**

---

### M5 — 모바일 읽기 전용 + 문서 정리

> **★ M5는 M4에 의존한다** — M4 없이 배포하면 사용자 가이드가 없는 기능(할일 알람)을 설명하게 된다.

**파일**

- `src/mobile/…` 할일 화면 — 점검 날짜 배지, 관련인 이름(텍스트만) **읽기 전용.** 편집 UI 없음.
- `landing/src/content/docs.ts` — "다시 확인할 날", "할일 알람", "자동 배치 보드", "관련인" 추가. 명시할 것:
  ①모바일은 보기만 됨 ②새 항목은 구글에 올라가지 않아 구글 앱에서는 안 보임 ③**자동 보드에서 카드를 옮기면 마감일이 실제로 바뀌고 그건 구글에도 반영된다** ④**★ 알람 설정은 기기 간에 공유된다**(결정 7-5) ⑤**★ 알림 창에는 기본적으로 할 일 내용이 보이지 않는다**(결정 8) ⑥**★ 자동 보드는 프로 모드 전용**
- `landing/public/docs/screenshots/` — 필요 시 이미지
- `PROGRESS.md` — 완료/진행/블록/다음 갱신
- `DECISIONS.md` — §C의 **ADR-066** 추가. **`git commit -m "..." -- DECISIONS.md` 경로 지정 필수**

**완료 판정**

1. 모바일에 점검 날짜·관련인이 보이고 **편집 컨트롤이 없다.**
2. 데스크톱↔모바일 동기화 왕복 후 새 필드 유실 없음(E11). **★ 단 이 항목은 동시 편집을 검사하지 않는다** — `useMobileTodoStore` 6곳이 파일 전체를 저장하므로 오래된 사본 문제는 남는다(N-9).
3. `cd landing && npm run docs:check && npm run build` 통과.
4. **★ ADR 번호가 066 이상이고 커밋 직전에 재확인했다.** 근거: `git show HEAD:DECISIONS.md` 최신 = **ADR-064**, 065는 타 세션이 워킹트리에만 갖고 있고 아직 커밋하지 않았다. **경로 지정 커밋은 같은 파일 안의 번호 충돌을 막지 못하므로 커밋 직전 `git show HEAD:DECISIONS.md | grep -o "ADR-0[0-9][0-9]" | sort -u | tail -1`을 다시 돌린다.**

**검증 명령**

```bash
npx tsc --noEmit && npm run lint && npm run test && npm run regression-check
cd landing && npm run docs:check && npm run build
git show HEAD:DECISIONS.md | grep -o "ADR-0[0-9][0-9]" | sort -u | tail -1   # 판정 4
```

---

### B-6. 되돌리기 전략

| 단계   | 되돌리는 법                                                                                                                                                                                                                                                                                                                                                                                         | **원상복구되지 않는 것 (정직 고지)**                                                                                                                                                                                                                                                                                                                                                     | 재시작?                |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| M0     | 커밋 revert(`regression-grep-check.mjs` 포함)                                                                                                                                                                                                                                                                                                                                                       | 없음. `checkAt`·`relatedStaff` 값이 파일에 남지만 코드가 무시(무해)                                                                                                                                                                                                                                                                                                                      | 아니오                 |
| M1     | UI 커밋 revert                                                                                                                                                                                                                                                                                                                                                                                      | 없음. 데이터는 M0 필드에 남음                                                                                                                                                                                                                                                                                                                                                            | 아니오                 |
| **M2** | 뷰를 `'autoBoard'`가 아닌 것으로 전환 → 즉시 현행 복귀                                                                                                                                                                                                                                                                                                                                              | **★ 드래그 확인창에서 승인한 `dueDate` 변경이 남는다.** **★ '진행 중' 칸을 드나든 할일의 `status`가 남는다.** **★ `dueDate`는 Google Tasks 동기화 대상이라 드래그 승인마다 구글 쓰기가 예약됐고, 이미 나간 것은 안 돌아온다.** **★ `lastView`는 `settings.json` 안이라 뷰 전환도 기기 간에 전파된다.** _(단 `completed`와 서브태스크는 바뀌지 않는다 — 완료 항목이 애초에 보드에 없다.)_ | 아니오                 |
| **M3** | 커밋 revert                                                                                                                                                                                                                                                                                                                                                                                         | 없음. `relatedStaff` 값은 파일에 남았다가 코드가 무시. 되돌려도 위젯·옆핀엔 원래 안 떴으므로 노출 없음                                                                                                                                                                                                                                                                                   | 아니오                 |
| **M4** | **1순위: 설정에서 알람 끄기** → `clearReminderSchedule('todo')`로 todo 칸이 비고 **record 칸은 그대로.**<br>**★ 단, 이 설정은 `settings.json` 안이라 Drive로 동기화된다. 다른 기기의 오래된 사본이 나중에 저장되면 `alarmEnabled: true`가 되살아날 수 있다. 확실히 멈추려면 2순위를 쓴다.**<br>**2순위: (b) 커밋만 revert** → 관찰 기록 알림이 병합 이전 상태로 완전 복구. (a)는 남아도 동작이 같다 | `userData/notify-state.json`·`notify-diag.log`가 남는다(무해, 구 코드가 안 읽음). 이미 발화한 토스트는 되돌릴 수 없음                                                                                                                                                                                                                                                                    | **예 (electron main)** |
| M5     | 문서 커밋 revert                                                                                                                                                                                                                                                                                                                                                                                    | 없음                                                                                                                                                                                                                                                                                                                                                                                     | 아니오                 |

**공유 워킹트리 규칙 (반드시)**

```bash
git branch --show-current   # main 이어야 함
git status --short          # 시작 전 타 세션 변경 확인
git commit -m "..." -- <경로만 명시>   # ★ git add -A 금지
```

- **건드리지 않을 파일**: `src/adapters/components/Schedule/Schedule.tsx`, `src/adapters/components/CoolMessenger/`, `src/adapters/components/StaffRoom/`, `src/usecases/assist/`, `src/domain/rules/screenAssistInput.ts`
- **`DECISIONS.md`**: 타 세션이 ADR-061·062·065를 워킹트리에 갖고 있다. **경로 지정 커밋 필수 + 커밋 직전 번호 재확인.**
- **`electron/main.ts`·`preload.ts`·`src/global.d.ts`**: **2026-08-21 실측 기준 전부 깨끗**(포털 세션 커밋 완료). M4 착수 직전에 다시 확인한다.

---

## C. ADR 초안

> **번호 근거**: `git show HEAD:DECISIONS.md`의 최신 ADR은 **ADR-064**다. 워킹트리에는 타 세션이 만든 ADR-061·062·065가 **아직 커밋되지 않은 채** 있다. 따라서 **ADR-066**을 쓰되, **커밋 직전에 번호를 다시 확인한다** — 경로 지정 커밋은 다른 파일이 딸려 나가는 것을 막지, 같은 파일 안에서 두 세션이 같은 번호를 쓰는 것을 막지 못한다.

### ADR-066 — 할일 확장 4건: 알림은 main이 갖되 정본에게 묻고, 자동 보드는 기존 상태 규칙을 재사용하며, 로컬 전용 필드는 저장 경로까지 막는다

- **상태**: 초안(승인 대기) · **일자**: 2026-08-21 · **관련**: ADR-039/040(동기화 핑퐁), ADR-046/063/064(정본 지정)

**Decision**

1. **알림 스케줄러를 "출처별 병합"으로 바꾼다.** `reminder:schedule` 페이로드를 `{ source: 'record' | 'todo', items }`로 확장하고 main이 출처별 칸을 따로 들고 있다가 발화 시 합친다. `reminder:clear`도 **출처 인자를 받는다.** **`studentDedupKey`는 개명하지 않는다** — 대신 `onReminderFired(dedupKey, source)`로 출처를 함께 싣고, 렌더러는 문자열 접두가 아니라 **출처로 분기**한다.
2. **유예 창·만료 판정·발화 이력의 소유권은 발화하는 쪽(main)에 둔다.** 항목에 `expiresAt`을 실어 만료분을 폐기하고, `userData/notify-state.json`(**`syncRegistry` 미등록**)에 **`todo` 칸 스냅샷과 발화 이력**을 둔다. `record` 칸은 오늘과 동일하게 렌더러가 매번 push한다.
3. **★ 스냅샷은 "언제"만 알고, "울려도 되는가"는 언제나 정본에게 묻는다.** `selectDue(buckets, now, firedIds, isStillValid)`로 술어를 주입하고, 껍데기가 발화 직전 `todos.json`을 읽어 *"그 `todoId`가 존재하고 `completed !== true`"*를 확인한다. 읽기 실패 시 발화하지 않는다. **이로써 정본이 둘이 되는 것을 피한다**(Principle 1).
4. **`electron/ipc/reminderCore.ts` 순수 모듈을 추출한다.** `ipcMain`·`Notification`·타이머를 모르는 모듈로, `aiBridgeCore`/`aiBridgeLiveSyncCore` 관례를 따른다. **M4를 2커밋으로 나눠 추출(동작 변화 0)을 먼저 커밋한다.**
5. **★ 알람 생산자 훅은 `src/App.tsx`의 `MainApp()` 안에 둔다.** `App()`은 훅 없는 분기 함수이고 위젯·아이콘·빠른입력·스티커 창이 전부 `index.html`을 공유하므로, 거기 두면 최대 6개 렌더러가 같은 칸에 push한다. **한 `source`당 생산자는 정확히 하나**를 불변식으로 삼고, **소스 구간 계약 테스트**(`electron/sidePinEntry.contract.test.ts`의 관용구)와 main의 소유 렌더러 교체 경고 로그로 강제한다.
6. **자동 배치 보드는 별도 뷰(`TodoViewMode.'autoBoard'`)이며 `boardMode`라는 두 번째 스위치를 만들지 않는다.** **★ 완료된 할일(`inferStatus === 'done'`)은 어느 칸에도 배정하지 않는다.** 4칸 중 '진행 중'만 `status`가 정본이고 나머지 3칸은 날짜 필드가 정본이다. **★ `bucketOf`는 `todoRules.inferStatus`를, 드래그 적용은 `todoRules.applyStatusChange`(서브태스크까지 동기화)를 재사용한다 — 평행한 상태 개념을 새로 만들지 않는다.** 드래그는 항상 확인창을 거치며, '진행 중'을 드나든 `status`와 승인한 `dueDate`는 자동 뷰를 꺼도 남는다.
7. **관련인은 교직원 연락처(`StaffContact`)로만 시작한다.** 저장 형태는 `{ staffId, nameSnapshot }` 하이브리드이며 스냅샷은 폴백일 뿐 정본이 아니다. **관련인은 위젯·옆핀에 이름도 인원수도 표시하지 않는다.** `registry.ts`의 할일 위젯 `sidePin.eligible`은 **`true`로 유지**하고, `src/widgets/items/TodoWidget.tsx`는 **삭제하지 않는다**(`registry.ts:13,292`가 실사용 중).
8. **★ OS 토스트 본문에 기본적으로 할 일 내용을 넣지 않는다.** `title = '할 일 알림'` 고정, `body`는 `alarmTextExposure: 'countOnly' | 'full'`이 결정하며 **기본값 `'countOnly'`**. 선례: `recordReminderRules.ts:203`의 `maskName(name, nameExposure)` — 이 저장소는 토스트 본문을 개인정보 표면으로 이미 인정하고 노출 수준 설정을 만들어 뒀다.
9. **새 필드는 Google Tasks에 올리지 않는다.** 로컬 전용 필드만 바뀐 경우 **스토어와 유스케이스(`ManageTodos.withSyncMeta`) 양쪽에서** `pendingRemoteOp`를 세우지 않는다. `updatedAt`은 갱신한다. **★ 다만 "로컬 전용"은 "Google Tasks에 안 올린다"는 뜻일 뿐이고, Drive로는 간다.**
10. **모바일은 읽기 전용**(점검 날짜·관련인 표시만).
11. `checkAt`은 **`"YYYY-MM-DD"`(날짜만)**이며 시각은 기존 `time` 필드를 쓴다. 새 시간 형식을 만들지 않는다.
12. **알람 스케줄에 지평(기본 14일)을 두고, 하루 상한은 `fireAt`의 현지 날짜별로 적용한다.**
13. 6단계(M0~M5)로 쪼개고 **알림 단계(M4)는 2커밋으로 격리**한다.

**Drivers**

- **D1 기존 기능 회귀 없음 — 특히 학생 관찰 기록 알림.** `reminder.ts:72`의 `onSchedule`이 목록을 통째로 교체하고 `:75`의 `onClear`가 전체를 지우므로, 두 번째 생산자는 **조용한 상호 삭제**를 일으킨다.
- **D2 사용자 데이터 무손실.** 데이터 소실 신고(파일 단위 LWW), 동기화 핑퐁, 좀비 부활, 정본 미지정 이력. 이번에 새로 막은 것은 **자동 보드 드래그가 완료를 푸는 경로**다.
- **D3 자기가 옳은지 확인할 수 있을 것.** rev.1의 실패는 확인 장치였고, rev.2의 실패는 **새로 쓴 자리를 실측하지 않은 것**이었다. rev.3은 §0-3에 연 것과 안 연 것을 전부 적었다.

**Alternatives considered**

- **알림 A: 렌더러 단일 수집 훅** — `electron/` 무변경이라 안전해 보이나, 한쪽 OFF의 조기 return이 다른 쪽 스케줄까지 지우는 **같은 버그를 렌더러로 옮길 뿐**이고 `clearReminderSchedule` 전면 삭제 구멍이 남는다.
- **알림 C: 할일 전용 채널 신설** — 회귀 위험 최저지만 발화·중복억제·지원여부 분기가 두 벌로 복제되고 관측 지점이 갈라진다.
- **유예 창을 렌더러에만 두기** — 절전 복귀·재시작 중복·콜드 부팅 0건을 전부 못 막는다.
- **`expiresAt`만으로 stale을 막기** — **시간 축만 막고 상태 축을 못 막는다.** "일요일에 모바일에서 완료한 일이 월요일 콜드 부팅에서 울린다"가 통과한다. **채택하지 않음** — 대신 발화 직전 정본 조회를 넣었다.
- **완료 판정 한 줄만 추가하고 구조는 그대로** — 테스트가 잡아도 코드가 못 막는다. 채택하지 않음.
- **E5(절전) 합격 기준 하향** — 요구의 핵심을 훼손.
- **`record` 칸도 main에 영속화** — 대칭적이지만 **출시된 기능의 동작을 바꾼다.** D1 위반.
- **알람 훅을 `App()`에 두기(rev.2 안)** — **위젯·아이콘 모드에서 생산자가 둘이 되고, 빠른입력·스티커 창이 열릴 때마다 세 번째가 붙었다 사라진다.** 채택하지 않음.
- **진입점 의존 그래프 계약 테스트** — 위젯·아이콘은 `MainApp`과 **같은 번들**이라 원리적으로 구분 불가. **소스 구간 단언으로 교체.**
- **자동 보드 A: `status` 덮어쓰기** — 모드를 끄면 손으로 정리한 `status`가 이미 소실되고, `status↔completed` 파생 때문에 최악의 경우 할일이 완료 처리돼 사라진다.
- **자동 보드 C: 정렬 힌트만** — 컬럼 분류를 여전히 손으로 해야 해 **요구 미충족.**
- **자동 보드가 자체 상태 개념을 갖기(rev.2 안)** — `todoRules.ts:147,211,217,231`에 **완료↔상태↔서브태스크 계약이 이미 다 있다.** 평행 개념을 만들면 미러 한쪽만 고쳐 조용히 어긋나는, 이 저장소가 세 번 겪은 사고 유형이 된다. **채택하지 않음 — 기존 함수를 재사용한다.**
- **`boardMode` + `TodoViewMode` 두 스위치** — 같은 상태가 두 곳에 생기고 우선순위 미정의.
- **관련인 A: 이름 문자열만** / **B: 연락처 id만** / **D: 별도 링크 파일** — D는 `todos.json`에 사람 이름이 안 들어가는 매력이 크지만 **동기화 파일이 +1(11→12) 되고 두 파일 다 파일 단위 LWW라 고아 링크가 가능하다.** 이 저장소에는 파일 단위 LWW로 인한 실제 데이터 소실 신고 이력이 있다. 채택하지 않음.
- **할일 위젯 `sidePin.eligible: false`** / **`TodoWidget.tsx` 삭제(rev.2가 잠깐 적었던 것)** — 전자는 이미 쓰이는 기능 회수, 후자는 `registry.ts:13,292`가 실사용 중이라 **빌드가 깨진다.** 둘 다 채택하지 않음.
- **`studentDedupKey → dedupKey` 개명** — 기능 이득 0이면서 접두 기반 분기가 담임반·수업반 **양쪽 모두 실패**하는 위험의 유일한 원인이었다. 취소.
- **`checkAt`을 `"YYYY-MM-DDTHH:mm"`로** — 새 시간 형식·시간대 변환 진입로가 생기고, 알림 단계 전까지 아무 일도 안 일어나는 시각 입력을 출시하게 된다.
- **`domainPurity.meta.test.ts`로 `Date` 사용을 막기** — **그 테스트는 import 지정자만 검사한다.** 실제 방어선은 `todoTime.test.ts`의 오프셋 0/+540/−300 케이스이고, 추가로 `regression-grep-check.mjs`에 규칙을 넣었다. **단 `todo*.ts` 글롭은 쓸 수 없다** — 기존 `todoRules.ts`에 `new Date(`가 8건 있어 게이트가 즉시 깨진다.
- **토스트 본문 전문 노출** — 가장 유용하지만 교무실 모니터에 학생 실명이 그대로 뜬다. **기본값으로는 채택하지 않고 설정으로 뺐다.**
- **토스트 본문 앞 N글자만** — 이름은 보통 앞에 오므로 자르는 것이 도움이 안 된다.
- **M4 단일 커밋(rev.2 안)** — 되돌리기 1회를 사고 **원인 특정을 판다.** 추출은 정의상 동작 변화 0이므로 별도 커밋으로 남아도 어중간하지 않다. **2커밋으로 변경.**
- **모바일 편집 허용** — `useMobileTodoStore` 6곳이 이미 파일 전체를 저장하므로, 오래된 사본으로 체크 하나만 눌러도 데스크톱 입력이 사라질 수 있다.
- **4건 일괄 출시** — 되돌리기 단위가 하나뿐이라 D1을 구조적으로 만족 불가.
- **알림을 아예 안 하고 M0~M3만** — 위험은 0에 가깝지만 요구 중 가장 강한 것을 안 하는 셈. **M4가 막혔을 때의 비상 경로로 문서에 남긴다.**

**Why chosen**

가장 위험한 것(알림)이 가장 조용하게 실패한다. 그래서 **규율이 아니라 자료구조·타입·파일 경계·기존 함수 재사용이 사고를 막게** 설계했다 — 출처별 칸은 서로를 지울 수 없고, `AutoBoardBucket`에는 `done`이 없으며 완료 항목은 입력 계약에서 걸러지고, 상태 변경은 **이미 서브태스크까지 동기화하도록 만들어진 함수**를 거치며, 로컬 전용 필드 방어는 메모리가 아니라 **저장 직전 지점**에 있고, 발화 직전에는 언제나 **정본에게 묻는다.**

rev.2와의 결정적 차이는 **결정이 아니라 배선과 확인이다.** ①알람 훅이 정확히 어느 컴포넌트에 붙는지를 6개 창의 로드 경로를 열어 확정했고 ②알람 스위치가 동기화되는 파일 안에 산다는 사실을 찾아 오너에게 반환했으며 ③완료된 할일이 자동 보드의 어느 칸으로 가는지에 답했다(어느 칸에도 안 간다) ④관측 1순위를 사용자가 볼 수 없는 `console.log`에서 **메모장으로 열 수 있는 파일**로 바꿨고 ⑤완료 판정에 **반대 방향**(틀린 것이 예약되는 방향)을 넣었다.

그리고 §0-3에 **이번 개정에서 연 것과 열지 않은 것을 전부 적었다.** rev.2의 실패 패턴은 "지적받은 자리는 완벽히 고치는데 새로 쓴 자리는 실측하지 않는다"였고, 그 패턴을 깨는 유일한 방법은 **안 연 것을 안 열었다고 쓰는 것**이다(§0-3(라)의 2건).

**Consequences**

- `electron/ipc/reminder.ts`·`reminderCore.ts`(신규)·`reminderState.ts`(신규)·`notifyDiag.ts`(신규)·`preload.ts`·`global.d.ts`·`main.ts`의 알림 IPC 계약이 바뀐다. **앞으로 새 알림 생산자는 반드시 `source`를 지정해야 하며, `source` 없는 push는 `record`로 취급된다.**
- **`clearReminderSchedule`을 인자 없이 호출하면 모든 출처의 예약이 삭제된다.** 새 생산자 훅을 만들 때 기존 훅을 복사하면 이 함정에 정확히 빠진다 — `regression-grep-check.mjs` 규칙 B가 이를 막는다.
- **알람 생산자 훅은 반드시 `MainApp()` 안에 둔다.** `App()`에 두면 위젯·아이콘·빠른입력·스티커 렌더러에서도 실행된다. 소스 구간 계약 테스트가 이를 고정한다.
- **개발 중 구버전 main + 신버전 렌더러 조합은 기록 알림 예약까지 전부 소멸시킨다.** `electron:dev`는 main을 감시하지 않으므로 **완전 재시작 필수.**
- **★ 게이트 4종 중 electron 코드를 실제로 보는 것은 `npm run test` 하나뿐이다.** `npm run lint`는 `eslint "src/**/*.{ts,tsx}"`라 **`electron/`을 검사하지 않고**, `npm run regression-check`는 grep 46종(기존 44 + 신규 2)만 돌린다.
- **★ 할일 스토어·리포지토리의 자동 테스트 커버리지는 이 계획 착수 시점에 0이다.** repository mock과 zustand 리셋 하네스를 M0에서 새로 만든다.
- **콜드 부팅 보증은 할일 알람에만, 그리고 `memorySaverMode: true`일 때만 의미가 있다.** memorySaver OFF면 메인 창이 `hide()`만 되어 `MainApp`이 살아 있다. **기록 알림은 오늘과 동일하게 렌더러 의존이다.**
- **★ 알람 설정은 `settings.json`(`syncRegistry` 1번 항목) 안이라 Drive로 기기 간 공유된다.** Google Tasks에 안 올린다는 것과 별개다. 학교 PC에서 켜면 집 PC에서도 켜지고, 파일 단위 LWW라 **끈 것이 오래된 사본에 의해 되살아날 수 있다.** `lastView: 'autoBoard'`도 같다.
- **자동 보드에서 카드를 옮기면 `dueDate`·`status`가 실제로 바뀌고 자동 보드를 꺼도 되돌아오지 않는다.** `dueDate`는 Google Tasks 동기화 대상이라 드래그 승인마다 원격 쓰기가 예약된다. **다만 `completed`와 서브태스크는 바뀌지 않는다** — 완료 항목이 애초에 보드에 없기 때문이다.
- **자동 보드는 `TodoSettings.mode === 'pro'` 사용자에게만 도달한다.**
- Todo 칸반이 수동/자동 두 벌이 된다. `KanbanColumn`·`KanbanCard` 공유로 완화.
- **할일 위젯은 `PIN_FEATURE_MAP.todo`로 대시보드·바탕화면 위젯 모드에서 이미 잠긴다.** 잠기지 않은 표면은 **옆핀**이며, 이는 `SidePinWidgetZone`이 `WidgetCard`를 쓰지 않는 데서 오는 **전 위젯 공통의 기존 구멍**이다.
- **★ `todos.json`이 동료 교직원 실명이 든 파일이 된다.** 백업 파일·자료실 공유·개인정보 처리방침 관점에서 이전과 성격이 달라진다.
- **★ OS 토스트는 PIN 잠금과 무관한 새 개인정보 표면이다.** 기본값은 내용을 숨기지만, 사용자가 켜면 할 일 텍스트가 화면 최상단에 그대로 뜬다.
- **로컬 전용 필드만 고쳐도 Drive 업로드는 일어난다.** 파일 내용이 바뀌면 SHA-256이 바뀌기 때문이며, `todos.json` 안에 사는 한 피할 수 없다. **막은 것은 Google Tasks 쓰기(핑퐁)이지 Drive 업로드가 아니다.**
- 모바일 편집 불가는 **의도된 제약**이다. `useMobileTodoStore` 6곳이 이미 파일 전체를 저장하므로, 편집을 열면 동시 편집 소실 표면이 넓어진다.

**Follow-ups**

1. **관련인 대상 범위** — 학생·보호자 확장은 오너 결정(§D-1 질문 3). 확장 시 옆핀 노출 대책이 선행 조건.
2. **옆핀 PIN 가드** — `SidePinWidgetZone`이 `WidgetCard`를 안 써서 생긴 전 위젯 공통 구멍. 별도 과제.
3. **`todos` 동기화를 파일 단위 → 항목 단위 병합으로** — 이게 되면 모바일 편집을 열 수 있다.
4. **세 번째 알림 생산자(일정 알림)** — `source` 칸만 추가하면 된다.
5. **`record` 칸의 main 영속화** — 콜드 부팅 시 기록 알림도 보장하려면 필요하나 출시된 동작 변경이라 별도 과제.
6. **`updateTodo` 화이트리스트 두 목록의 `notes` 불일치** — 스토어(27행)에는 없고 유스케이스(67행)에는 있다. 이번엔 주석으로 표시만 했다.
7. `checkAt`에 마감과 다른 시각을 주고 싶다는 요구가 생기면 `checkTime?: 'HH:mm'` 검토.
8. `alarmDailyCap` 8건·`alarmHorizonDays` 14일의 적정값은 실사용 피드백으로 조정.
9. 자동 보드 '오늘 처리' 판정에 `priority` 반영 여부.
10. **★ `regression-grep-check.mjs`의 머리 주석이 아직 "Realtime Wall v2.1 회귀 9건"이라고 되어 있다** — 실제로는 44종(신규 포함 46종)이다. 별도 과제로 정리.
11. **★ 기기별 설정을 담을 자리가 없다** — `startupMode`·`memorySaverMode`도 `Settings.ts`에 있어 동기화된다. "이 기기에만 적용" 범주가 필요해지면 공통 저장소를 설계해야 한다.

---

## D. 오너가 답해야 할 질문

> **1·2번은 착수 전에 답해야 합니다** — M0의 필드 배치가 답에 따라 달라집니다. 나머지는 진행 중에 정해도 됩니다.

---

### ✅ 오너 결정 (2026-08-22 확정 — 착수 전 필수 2건 모두 답변됨)

**질문 1 → ㉰ 절반씩.** 알람 **켬/끔 스위치만 기기별**로 두고, 나머지 알람 값(미리 알림 분,
하루 상한, 기본 시각, 문구 노출, 예약 범위)은 지금대로 계정 전체 공유로 둔다.

- 근거: "껐는데 되살아난다"가 위험한 이유는 **되돌리기 1순위 수단이 무력화**되기 때문인데,
  그 위험은 **켬/끔 스위치에만** 해당한다. 미리 알림 분·상한 같은 값은 기기 간 공유가 오히려 편하다.
- 저장 위치: `src/adapters/repositories/driveSyncDeviceState.ts` 와 같은 방식 —
  **`syncRegistry` 에 등재하지 않는 별도 저장 키**(`todo-alarm-device-state`). 이 선례는
  ADR-040 이 정확히 같은 실패(동기화 대상 안에 기기별 값을 두어 LWW 핑퐁)를 겪고 만든 것이다.
- **M0 변경**: `alarmEnabled` 를 `TodoSettings` 에 **넣지 않는다.** 나머지 5개 값만 넣는다.

**질문 2 → ㉰ 기본은 건수만, 설정에서 켜면 전체.** 계획서 원안(`alarmTextExposure` 기본
`'countOnly'`)이 그대로 이 답이다. **M0 변경 없음.**

**남은 질문(3~9)은 착수를 막지 않는다** — 진행 중에 정한다.

---

### 🔴 D-1. 착수 전 필수 _(→ 위에서 답변 완료)_

**1. 알람 켬/끔이 "계정 전체"인가 "이 기기만"인가?** _(Critic이 승인 조건으로 지목)_

지금 설계대로면 알람 켬/끔은 `settings.json`이라는 파일 안에 들어가고, 그 파일은 **구글 드라이브로 기기 사이를 오갑니다.** 그래서 학교 PC에서 켜면 다음 동기화 때 **집 PC에서도 켜집니다.**

| 선택                                            | 무슨 일이 벌어지나                                                  | 대가                                                                                                                                                                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **㉮ 계정 전체 (지금 설계, 추가 작업 0)**       | 한 번 켜면 모든 기기에서 켜진다. 끄면 모든 기기에서 꺼진다          | 집 PC가 아침 9시에 학교 업무 알림을 띄운다. 그리고 **껐는데 되살아날 수 있다** — 오래된 사본을 가진 다른 기기가 나중에 저장하면 켬 상태가 돌아온다. 이 앱은 예전에 비슷한 유형(끈 것이 되살아남)의 사고를 겪은 적이 있다 |
| **㉯ 이 기기만 (M0에서 저장 위치를 바꿔야 함)** | 학교 PC에서만 켜고 집 PC는 조용하다. 끄면 확실히 꺼진다             | 기기를 새로 쓰면 다시 켜야 한다. 개발 쪽 추가 작업 반나절 정도 — 이 앱에는 이미 "이 기기에만 저장" 방식(`localStorage`)을 쓰는 자리가 열두 군데 넘게 있어서 새 방식을 발명할 필요는 없다                                 |
| **㉰ 절반씩**                                   | 알람 켬/끔만 기기별, 나머지 설정(미리 알림 분, 상한 등)은 계정 전체 | 두 곳에 나뉘어 설명하기가 조금 복잡하다                                                                                                                                                                                  |

**권장: ㉯ 또는 ㉰.** 이유는 "끈 것이 되살아난다"가 **되돌리기 1순위 수단을 무력화**하기 때문입니다. 알람에 문제가 생겼을 때 제일 먼저 하는 일이 "설정에서 끄기"인데, 그게 확실히 안 꺼지면 안전장치가 아닙니다.

**2. 알림 창에 할 일 내용을 보여줄까요?**

윈도우 알림은 **화면 오른쪽 아래에 그대로 뜹니다.** 잠금(PIN)과 무관하고, 바탕화면 위젯 모드나 교무실 큰 모니터에서도 읽힙니다. 그런데 선생님들은 할 일에 학생 이름을 씁니다 — "김OO 학부모 상담 회신" 같은 식으로요.

| 선택                                                   | 알림에 뜨는 글                          | 결과                                                              |
| ------------------------------------------------------ | --------------------------------------- | ----------------------------------------------------------------- |
| **㉮ 건수만 (권장 기본값)**                            | "할 일 알림 / 확인할 일이 1건 있습니다" | 옆 사람이 아무것도 못 읽는다. 대신 앱을 열어야 무슨 일인지 안다   |
| **㉯ 내용 전부**                                       | "할 일 알림 / 김OO 학부모 상담 회신"    | 알림만 보고 바로 판단 가능. 대신 **옆 사람도 같이 읽는다**        |
| **㉰ 기본은 건수만, 설정에서 켜면 전부 (현재 계획안)** | 처음엔 ㉮, 원하면 ㉯로                  | 안전하게 시작하고 필요한 사람만 켠다. 설명할 항목이 하나 늘어난다 |

**권장: ㉰.** 참고로 학생 관찰 기록 알림에는 이미 "이름을 얼마나 보여줄지" 고르는 설정이 있습니다 — 같은 고민을 이 앱이 이미 한 번 했다는 뜻입니다.

### 🟠 D-2. 진행 중에 정해도 되는 것

**0. (M3 구현 중 발견 · 2026-08-22) 멘션으로 고른 이름을 할 일 본문에 남길까요?**

지금은 "@김"에서 고르면 본문이 `@김민호 `가 됩니다. 본문은 **위젯·옆핀에 그대로 보이고,
구글 Tasks 로도 올라갑니다.** 관련인 데이터(`relatedStaff`) 자체는 위젯 경로로 흐르지 않게
막았지만, **이름이 본문 글자로는 새는** 셈입니다.

| 선택                                       | 결과                                                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| **㉮ 그대로 둔다 (현재 상태)**             | "선생님이 직접 친 글자"로 본다. 프라이버시 테스트의 보장 범위를 좁혀 정직하게 적어 두었다 |
| **㉯ 칩만 남기고 본문의 `@질의`는 지운다** | 이름이 어디에도 안 남는다. `applyMention` 을 삭제형으로 바꾸면 된다                       |
| ㉰ 위젯 표시에서만 가린다                  | 위젯 렌더 파일을 건드리게 되어 M3 의 "위젯 파일 무수정" 원칙과 충돌                       |

**권장: ㉮ 또는 ㉯.** 어느 쪽이든 판정 4의 문구를 "관련인 **데이터**가 위젯 경로로 흐르지
않는다"로 읽어야 한다(이미 그렇게 정정해 두었다).

**3. 관련인에 학생·보호자를 붙일 수 있게 할까요?**
1차 계획의 배제 근거 중 하나("할일 위젯에 잠금이 없다")는 **사실이 아니었습니다.** 실태는 "대시보드·바탕화면 위젯 모드는 이미 잠기고, **옆핀만 안 잠긴다**"입니다. 남은 근거는 "학생 관련 기록은 이미 학생 기록·관찰 기록이라는 제자리가 있다"인데, 이건 원칙이 아니라 **범위 선택**입니다.

- **㉮ 교직원만으로 시작 (권장)** — 나중에 열 수 있습니다. 지금 범위가 늘지 않습니다.
- **㉯ 처음부터 학생·보호자도** — 작업이 한 단계 늘고, 옆핀 노출 대책이 먼저 필요합니다.

**4. 알람 소리·모양을 관찰 기록 알림과 구분할까요?**
지금 구조상 둘 다 같은 윈도우 알림이라 겉모습이 같습니다. 제목 앞머리로만 구분할지("할 일 알림" vs "관찰 기록 알림" — 현재 계획안), 구분 없이 갈지.

**5. 하루 알림 상한 8건, 기본 시각 09:00, 예약 범위 14일이 적절한가요?**

- 상한을 넘으면 나머지는 앱 안 배지로만 알립니다. **상한은 "발화하는 날짜별"로 적용**되므로, 오늘 8건이 찼다고 내일 것이 사라지지는 않습니다.
- 예약 범위 14일 — 두 주 뒤보다 먼 할 일은 알람 대상에 넣지 않습니다. 1년치 할 일을 미리 넣어 두는 분이 있다면 이 값이 중요합니다.

**6. 알림 단계(M4)를 맨 뒤에 둘까요, 원래대로 앞에 둘까요?**
rev.2가 M4를 맨 뒤로 옮긴 이유는 *"다른 세션이 electron 파일 3개를 수정 중"*이었는데, **지금 확인해 보니 그 세션이 이미 끝나 파일들이 전부 깨끗합니다.** 즉 뒤로 미룰 이유가 사라졌습니다.

- **㉮ 그대로 맨 뒤** — 위험한 걸 나중에. 앞의 3단계를 먼저 써 볼 수 있습니다.
- **㉯ 앞으로 당김** — 가장 위험한 것을 먼저 격리해 일찍 확인합니다(계획서의 D1 원칙 방향).
  **어느 쪽이든 계획 품질은 같습니다 — 일정 문제입니다.**

**7. '오늘 처리' 칸에 지난 것(연체)을 섞을까요, 분리할까요?**
현재 안은 섞습니다(마감일 ≤ 오늘). 분리하면 칸이 5개가 되어 복잡해집니다.

**8. 점검 날짜를 반복(매주 금요일 등)과 연동할까요?** 1차 범위에서는 뺐습니다.

**9. 알림 진단 패널을 설정 어느 탭에 둘까요?** 할일 설정 탭 vs 알림 설정을 모으는 새 위치.

---

**이 개정판이 의도한 바를 담고 있습니까?**

- `proceed` — 이대로 `docs/01-plan/features/todo-check-alarm-board-mention.plan.md`에 저장하고 Architect/Critic 3라운드 검토로 넘김
- `adjust [항목]` — 특정 결정을 바꿔서 다시
- `restart` — 버리고 처음부터

---

## 부록 — rev.3 작업 요약 (에이전트를 띄운 쪽에 드리는 메모)

- **Critic §5 22건 전부 반영.** 미반영 0건. 단 **6번은 지시를 문자 그대로 이행하면 게이트가 깨져서**(기존 `todoRules.ts`에 `new Date(` 8건) `fileFilter`로 겨냥 범위를 좁혀 이행했고, 그 사실을 §0
