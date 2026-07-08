# 학생 관찰 기록 알림 (Observation Record Reminder) — 구현 계획서

> **상태: 승인 대기 (pending approval) — 구현 미착수**
> 산출: 2026-07-08 · 방식: `/ralplan` 합의(Planner→Architect→Critic, 2라운드)
> 합의 이력: 초안 → Critic ITERATE(9지시) → 개정(S1 채택) → Architect 재검증(M1~M4) → **Critic APPROVE**
> **사용자 결정(2026-07-08 반영):** Q1 = **알림 실명 노출 기본 ON**(사용성 우선, 마스킹은 옵션); Q3 = **수업반 '수업 직후' 자동 알림(D1) v1 포함**(매핑 실패 시 skip 폴백). — ⑧ 참조

---

## ① 한 줄 요약

'오래 기록이 비어있는 학생'을 자동 감지해 교사가 그 자리에서 3초 안에 기록하도록 돕는 리마인더. **감지·선정·로테이션은 렌더러 domain 순수함수**로 계산해 **각 후보의 *다음* 발화 timestamp를 forward-looking으로 미리 push**하고, **발화는 Electron main 상시 타이머**가 예정대로 쏜다(S1). 담임 기록은 `StudentRecord`, 수업반 관찰은 `ObservationRecord`로 적재. 생성형 AI·게이미피케이션 없음, 프라이버시 기본 무명.

## ② RALPLAN-DR 요약

### Principles

1. **조용한 리마인더** — 적게·의미있게. 하루 발화 상한(피로 상한)과 전체 일시정지를 1급 기능. 스트릭/포인트/랭킹/누적점수 절대 금지. 진행률은 "미기록 N명" 완결성 큐로만.
2. **AI는 감지만, 문장은 사람이** — 공백감지·학생선정·질문 프롬프트 로테이션만 자동. 관찰 내용 100% 교사 입력.
3. **기존 저장소로 흘려보내기** — 담임=`StudentRecord`(`src/domain/entities/StudentRecord.ts:18`), 수업반=`ObservationRecord`(`src/domain/entities/Observation.ts:1`). 신규 기록 엔티티 없음.
4. **프라이버시 — 사용자 결정: 실명 노출 기본 ON** — 준일님 결정에 따라 알림·상시 배지에 학생 이름을 **기본 표시**(사용성 우선). 단 마스킹(무명/번호·이니셜) 옵션을 설정으로 제공하고, 미러링/프로젝터 유출 위험은 설정 화면에 안내로 고지. `nameExposure` 기본값 = `full`.
5. **레이어 순수성** — 감지/선정/로테이션/스케줄빌드는 domain 순수함수(provider 주입). **main은 due도, studentId→프롬프트 매핑도 계산하지 않고** 미리 받은 스케줄만 발화하고 opaque id만 되돌린다. body 문자열은 **렌더러가 `nameExposure` 정책을 적용해 완성**한 뒤 IPC로 넘기므로(기본은 이름 포함), main은 마스킹 판단을 하지 않는다.

### Decision Drivers (상위 3)

1. 기본 설정(위젯/아이콘+memorySaver)에서도 능동 알림 약속 준수.
2. 레이어 보존(도메인 계산은 렌더러).
3. 프라이버시(실명 미노출).

### Viable Options — 최종 결정

**Fork C — S1 채택, C2 기각.**

- **S1(채택):** 렌더러가 세션마다(MainApp mount·focus·`system:resume` 재방송·record 저장 후) **forward-looking 스케줄**(각 후보의 _다음_ 발화 timestamp·opaque `reminderId`·마스킹 body, horizon N일)을 domain 순수함수로 계산 → 로컬 persist + IPC `reminder:schedule`로 main 전달. main은 상시 타이머(`electron/main.ts:4816`)+powerMonitor(`:4868-4923`)+Tray(`:1775`)로 예정 시각에 `new Notification()` 발화. 근거: 위젯/아이콘+memorySaver(기본 true `:2330`/`:2342`)에서 MainApp destroy(`:1039`)돼도 발화.
- **C2(기각):** 렌더러 타이머 due 판정+발화. IconApp(`src/App.tsx:495-507`)/WidgetApp은 축약본, EventPopup은 MainApp 전용(`:1164`) → 기본 설정 침묵.

**Fork A — A1 확정.** 설정=`Settings` 확장(`src/domain/entities/Settings.ts:408`)→`settings` 동기화 편승. 런타임 UX 상태(로테이션 커서·snoozeUntil·pausedUntil)=로컬 persist. 피로 ledger=동기화(S3). 선례 `src/adapters/stores/useUpdatePreferencesStore.ts:46`.

**Fork B — B1 확정.** domain 순수함수(provider 주입)+얇은 usecase. `CheckEventAlerts`(`src/adapters/stores/useEventsStore.ts:382`) 동형.

**Fork D — 사용자 결정: D1 v1 포함.** v1 = D2(수업반 진입 컨텍스트 프롬프트) + 주기/공백감지 + **D1(시간표 연동 '수업 직후' 자동 알림)**.

- **D1 매핑 불안정 대비(필수 폴백):** `getCurrentPeriod`(`src/domain/rules/periodRules.ts:32`)+`findMatchingClass`(`src/domain/rules/matchingRules.ts:12`)로 "방금 끝난 교시 → 수업반(`TeachingClass`)"을 매핑. **시간표는 과목/교실 문자열만 담고 `TeachingClass.id`가 없어 매핑이 느슨하므로**(이동수업·분반), 매핑이 **모호하거나 실패하면 자동 트리거를 조용히 skip**하고 주기/공백감지 경로로 흡수(오탐·오알림 방지). '방금 끝난 교시' 판정 헬퍼는 신설(`getCurrentPeriod`는 쉬는 시간에 null 반환 → "직전에 끝난 PeriodTime" 계산 로직 필요).
- Architect/Critic이 v1.1로 연기 권고했던 항목이나, 사용자 명시 결정으로 v1 포함. 리스크는 skip 폴백으로 유계화.

> 단일 옵션 무효화 근거: 저장처 이원화(신규 통합 엔티티 무효 — 조회·동기화·AI브릿지 이중화); 발화 S1(C2 "기본설정 침묵"·C1 "레이어 위반" 무효).

---

## ③ 레이어별 작업 분해 (신규 N / 수정 M)

### domain (외부 import 0)

- **N** `src/domain/entities/RecordReminder.ts` — `ReminderPreset='light'|'normal'|'thorough'`, `ReminderSettings`(요일·시각·공백일수·한번에 물을 학생수 1~3·방해금지·제외/관심·대상 homeroom/subject·`nameExposure`·`subtleEnabled`·`osToastEnabled`·`dailyFireCap`·`horizonDays`·`pausedUntil?`), `DueReminder`, `ReminderScheduleItem`(`reminderId`(opaque)·`fireAt`·`title`·`body`(마스킹됨)·`target`·`studentDedupKey`).
- **N** `src/domain/rules/recordReminderRules.ts` — **provider 주입형 순수함수**(스토어를 모름): `daysSinceLastRecord(provider, studentId, now)`, `rankStalestStudents(...)`, `applyRotation(ranked, cursor)`, `isWithinDoNotDisturb(now, start, end)`(자정 넘김), `resolvePromptText(rotationIndex)`, **`buildForwardSchedule(students, provider, config, fireLedger, now)`** — [M1] "오늘 due 집합"이 아니라 각 후보의 **다음 발화 timestamp**(아직 due 아닌 학생 포함)를 horizon(`config.horizonDays`) 내 forward-looking으로 산출해 반환. `lastRecordDateProvider: (studentId)=>string|null` 주입.
- **N** `src/domain/rules/periodRules.ts`에 **`getJustFinishedPeriod(periodTimes, now)`** 신설 [D1] — `getCurrentPeriod`(`:32`)는 쉬는 시간에 null이므로, `now` 직전에 `end`가 지난 PeriodTime을 반환(수업 종료 직후 창). 순수함수, `now` 주입 결정론.

### usecases

- **N** `src/usecases/reminders/CheckRecordReminders.ts` — 설정+두 provider(담임/수업반)로 forward 스케줄 빌드.
- **N** `src/usecases/reminders/BuildEventTriggeredReminders.ts` — 결석/조퇴 다음날(`StudentRecord.category==='attendance'`)+상담 `followUpDate` 도래(`StudentRecord.ts:28`).
- **N** `src/usecases/reminders/DetectJustFinishedClass.ts` — [D1] 현재 시각→"방금 끝난 교시"(`getJustFinishedPeriod`)→교사 시간표(`useScheduleStore.getEffectiveTeacherSchedule`)의 과목/교실→`findMatchingClass`로 `TeachingClass` 매핑. **매핑 모호/실패 시 null 반환(자동 트리거 skip).**
- **M** `src/usecases/sync/syncRegistry.ts:63` — 피로 ledger `reminder-fires` 도메인 추가(설정은 `settings` 편승).

### adapters

- **N** `src/adapters/stores/useRecordReminderStore.ts` — 로컬 persist: rotationCursor·snoozeUntil·pausedUntil·lastComputeAt + `recomputeAndSchedule()`(→IPC `reminder:schedule`)·`snooze()`·`skipStudent()`·**`recordSaved()`**([M3] 어떤 렌더러 표면이든 기록 저장 직후 재-push 1회 트리거).
- **N** `src/adapters/stores/useReminderFireStore.ts` — **동기화** 피로 ledger, dedup 키 `${studentId}:${YYYY-MM-DD}`, `hasFired`/`markFired`.
- **M** `src/adapters/stores/useStudentRecordsStore.ts:196` — `getLastRecordDate(studentId): string|null` 신설(observation `:142` 평행) + `addRecordWithTags(params)` 신설(단일 write; 기존 10-인자 `addRecord` 시그니처·15개 파일 호출부 불변). **저장 성공 시 `useRecordReminderStore.recordSaved()` 호출**(재-push).
- **재사용/M** `src/adapters/stores/useObservationStore.ts:64`·`:142` — 저장 성공 시 동일하게 `recordSaved()` 훅.
- **N** `src/adapters/components/Reminder/ReminderPrompt.tsx` — 공통 UX: 질문 프롬프트(로테이션)+태그 칩 우선+한 줄 메모(선택)+"오늘 못 봄/특이사항 없음"+"나중에"(스누즈)+"이 학생 건너뛰기". **[M3] 진입 시 렌더러가 재계산 → 이미 기록된 대상이면 프롬프트 no-op("이미 기록됨" 억제).**
- **N** `src/adapters/components/Reminder/ReminderPopup.tsx` — main 팝업. `EventPopup.tsx:96` 복제 + `useRegisterModal('RECORD_REMINDER', ...)`.
- **N** `src/adapters/components/Reminder/ReminderBadge.tsx`/`ReminderIconPopover.tsx` — 은은형. **상시 표면 count-only("미기록 N명"), 실명 미표시.**
- **M** `src/widgets/registry.ts:129`(`student-records`) count-only 배지; 수업반 `today-progress`(`:111`) 컨텍스트 프롬프트(D2).
- **M** `src/adapters/stores/useModalCoordinatorStore.ts:19`+`:46` — `RECORD_REMINDER=5.2` + **메타테스트 2개 수동 갱신**(`useModalCoordinatorStore.test.ts`, `common/__tests__/ModalRegistry.test.ts`).
- **M** `src/adapters/components/Settings/SettingsSidebar.tsx:50` — 신규 탭 `record-reminder`(기존 id/라벨 불변).
- **N** `src/adapters/components/Settings/RecordReminderSection.tsx` — 3프리셋+직접설정+실명 노출 레벨+OS토스트·은은형 on/off(기본 OFF)+전체 일시정지.
- **M** `src/domain/entities/Settings.ts:408` — `recordReminder?: RecordReminderSettings`(옵셔널).

### electron (재번들 필요 — watch 안 됨)

- **N** `electron/ipc/reminder.ts` — `ipcMain.on('reminder:schedule', (_e, items)=>{ 상시 타이머에 저장 })`; tick(`:4816` 패턴)에서 `fireAt<=now`+`Notification.isSupported()`+미지원/DND 가드 후 `new Notification({title, body}).show()`. **[M2] 클릭 핸들러 계약(1줄): main은 (a) `expandIconWindow()`(`:1202`)/포커스 + (b) opaque `reminderId`만 IPC로 렌더러에 전달. `reminderId→학생→어느 프롬프트` 해석은 전적으로 렌더러. main이 studentId→프롬프트 매핑을 판단하면 domain 누수이므로 금지.**
- **M** `electron/main.ts` — powerMonitor `resume`/`unlock-screen`(`:4875`,`:4920`)에서 `system:resume` 재방송(`:2012`) → 렌더러 재-push.
- **M** `electron/preload.ts:19` — `scheduleReminders(items)`·`clearReminderSchedule()`·`onReminderClick(cb)` 노출.

---

## ④ Phase P0~P4 (각 독립 검증)

- **P0 — 도메인 규칙·타입·provider(순수):** `RecordReminder.ts`+`recordReminderRules.ts`(**`buildForwardSchedule` 포함, forward-looking**)+담임 `getLastRecordDate` provider+수업반 `:142` 재사용. 단위테스트만으로 검증. 의존 없음.
- **P1 — 설정·상태·피로집계·모달배선:** `Settings` 확장+`useRecordReminderStore`(로컬)+`useReminderFireStore`(동기화, SYNC_REGISTRY `:63`+App.tsx `:991` 두 곳)+3프리셋+설정 탭+`RecordReminderSection`+ModalPriority 4곳(union·PRIORITY_ORDER·메타테스트 2).
- **P2 — 은은형+기록 UX+담임 저장:** ModalCoordinator 팝업+count-only 배지/아이콘 팝오버+`ReminderPrompt`(재계산 no-op 포함)+담임 `addRecordWithTags` 배선+저장 후 `recordSaved()` 재-push.
- **P3 — 능동형 OS 토스트(S1):** 렌더러 **forward 스케줄** 계산→IPC→main 상시 타이머 발화→클릭 라우팅([M2] 계약)+폴백표+발화 시점 마스킹. **재번들+재시작 게이트.**
- **P4 — 수업반 확장(D2):** `useObservationStore.addRecord`(classId) 저장+교과 태그(`DEFAULT_OBSERVATION_TAGS`)+수업 컨텍스트 프롬프트+수업반 공백감지 provider.
- **P5 — 수업 직후 자동 알림(D1) [사용자 결정 추가]:** `getJustFinishedPeriod`+`DetectJustFinishedClass`로 방금 끝난 수업반 식별 → 그 반의 forward 스케줄에 "수업 직후" 트리거 편입(S1 발화 경로 재사용). **매핑 실패 시 skip 폴백.** P3(발화)·P4(수업반 저장) 위에 얹힘.

의존: P0 → P1 → P2 → P3 → P4 → P5.

---

## ⑤ 리스크 & 완화 + Pre-mortem

| 리스크                                  | 완화                                                                                                                                                                                               |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 알림 피로                               | 기본 OFF·보수 프리셋·`dailyFireCap`·전체 일시정지·스누즈·3초 완료. 진행률="미기록 N명"만.                                                                                                          |
| 프라이버시(실명)                        | **사용자 결정: 실명 노출 기본 ON**(사용성 우선). body는 렌더러가 `nameExposure` 정책 적용 후 IPC(기본 이름 포함). 마스킹(무명/번호) 옵션 제공 + 미러링/프로젝터 유출 위험을 설정 화면에 안내 고지. |
| Electron 재빌드 함정                    | P3 게이트에 `node scripts/build-electron.mjs`+`electron:dev` 재시작+실토스트 관찰 명시.                                                                                                            |
| 로테이션 공정성                         | 커서 로컬 persist. 건너뛰기/제외는 순회 제외+관측 로그.                                                                                                                                            |
| **stale 스케줄**(발화 시점 이미 기록됨) | **advisory 발화 수용.** destroy(`:1039`)가 close 핸들러(`:1727` preventDefault)를 우회해 "죽기 직전 정리"가 구조적 불가 → **재진입/클릭 시 렌더러 재계산으로 흡수**(no-op).                        |
| **오프라인 병합 유계** [M4]             | 오프라인 2기기 동시 발화 시 dedup ledger는 **수렴만 시킬 뿐 이미 뜬 토스트는 못 지움** → **중복 상한 "기기·일당 ≤ +1"로 유계, ledger는 best-effort 수렴**.                                         |
| 성능(대량 집계)                         | provider가 학생별 lastDate `Map` 1회; O(records).                                                                                                                                                  |

### Pre-mortem (3)

1. **기본설정 침묵** → S1(main 상시 타이머)이 근본 해소. AC3-a/f로 검증.
2. **프로젝터 실명 노출** → 상시 표면 count-only·발화 body 소스 마스킹·내용 미포함.
3. **dev 오판** → 재번들+실렌더 관찰 게이트.

---

## ⑥ Phase별 수용 기준 (테스트 가능)

- **P0:** `tsc`·`test` 통과. `daysSinceLastRecord` 기록없음/오늘/N일전 정확; `rankStalestStudents` 오래된 순+제외/관심+커서 반영; `isWithinDoNotDisturb` 자정넘김 정확; **`buildForwardSchedule`가 ledger의 `studentId:date`를 제외하고 각 후보의 다음 발화 timestamp를 horizon 내 산출**; provider 주입 2종(담임/수업반) 각각 테스트.
- **P1:** 3프리셋·직접설정 저장 후 재시작 복원. 마이그레이션 0. **피로 dedup 2기기 시뮬 단위테스트: 같은 `studentId+date` 총 발화 ≤ `dailyFireCap`**. ModalPriority 메타테스트 2개 갱신 후 녹색.
- **P2:** 공백 학생 존재 시 설정 조합대로 main 팝업/count-only 배지/아이콘 팝오버 노출; 프롬프트 저장 시 `StudentRecord`에 `studentId·date·category·tags` 적재; "나중에"→재노출 안 함; "건너뛰기"→순회 제외; 행사알림과 동시 시 겹침 없음(5.2). 상시 배지 실명 없음.
- **P3 ("발화되는 앱 상태"를 AC에 명시):**
  - **AC3-a:** memorySaverMode=true+위젯 모드(MainApp destroy)에서 예정 시각 OS 토스트 발화.
  - **AC3-b:** 아이콘 모드에서 발화, 클릭 시 `expandIconWindow()` 펼침+프롬프트. **[M2] main은 `expandIconWindow`+opaque `reminderId`만 전달하고, reminderId→프롬프트 해석은 렌더러가 수행**(main이 매핑 판단 시 실패로 간주).
  - **AC3-c:** 메인 닫힘·트레이 상주에서 발화(앱 완전종료는 비대상 — 다음 기동 시 은은형).
  - **AC3-d:** Notification 미지원/OS 알림 OFF/DND 시 억제+은은형 폴백(폴백표대로).
  - **AC3-e:** `nameExposure=off`일 때 토스트 body에 이름 없음(main 이름 미수신).
  - **AC3-f [M1]:** 3pm에 렌더러가 죽어도, **자정에 공백 임계를 넘는 학생이 다음 풀앱 개방 전에 예정 시각 발화**된다(미래 timestamp를 미리 push했으므로).
  - **AC3-g [M3]:** 이미 기록된 대상은 클릭 후 프롬프트가 no-op("이미 기록됨" 처리·억제). 재-push 배선은 **스토어 저장 액션(`addRecordWithTags`/observation add) 훅으로 통일** → MainApp뿐 아니라 WidgetApp의 `student-records` 위젯 편집 등 모든 저장 표면에서 저장 직후 1회 재-push. 글로벌 quick-add(`App.tsx:509-515`)는 todo/event/memo/note/bookmark만 다뤄 기록 미변경이므로 no-op.
  - 게이트: 재번들+재시작 후 실토스트 관찰.
- **P4:** 수업반 진입 시 컨텍스트 프롬프트; 저장 시 `ObservationRecord`(classId) 적재; 교과 태그 노출; 수업반 공백감지 `getLastRecordDate(studentId, classId)` 기반.
- **P5 [D1]:** `getJustFinishedPeriod` 단위테스트(쉬는 시간·수업중·경계 정확); `DetectJustFinishedClass`가 매핑 성공 시 해당 `TeachingClass` 반환, **매핑 모호/실패 시 null(자동 트리거 skip)** 검증; 수업 종료 직후 창에서 그 반 대상 알림이 S1 경로로 발화; 이동수업/분반 등 매핑 불가 케이스에서 오알림 0.

### 폴백 조건표

| 앱 상태                                               | S1 발화?    | 폴백                |
| ----------------------------------------------------- | ----------- | ------------------- |
| 풀앱 포커스                                           | O(main)     | —                   |
| 위젯/아이콘 + memorySaver=true(기본, MainApp destroy) | **O(main)** | —                   |
| 메인 닫힘·트레이 상주                                 | O(main)     | —                   |
| 앱 완전 종료                                          | X           | 다음 기동 시 은은형 |
| Notification 미지원 / OS 알림 OFF / DND               | X(억제)     | 은은형(인앱)        |

---

## ⑦ 확장 테스트 매트릭스

| 유형          | 대상                                                                                                                | Phase    |
| ------------- | ------------------------------------------------------------------------------------------------------------------- | -------- |
| unit          | `recordReminderRules` 전 함수(경계·자정넘김·빈명단·전원최신·provider 2종·**forward 다음-발화 timestamp**)           | P0       |
| unit          | 피로 dedup 2기기 시뮬 `studentId+date` 총발화 ≤ cap                                                                 | P1       |
| unit          | ModalPriority 고유·단조 + 메타테스트 2개 갱신                                                                       | P1       |
| integration   | 렌더러 forward 스케줄→IPC `reminder:schedule`→main 발화(모킹 Notification)                                          | P3       |
| integration   | 담임 `addRecordWithTags`/수업반 `addRecord` 저장→`recordSaved()` 재-push 발생                                       | P2/P4    |
| e2e           | memorySaver=true+위젯/아이콘 상태 토스트 발화·클릭 라우팅(opaque id)                                                | P3       |
| observability | `fire-attempt`/`fire-success`/`suppressed(reason)` 카운터·로그 — 개인식별정보 미로깅(`studentDedupKey` 해시/불투명) | P3       |
| regression    | `npm run regression-check` + 메타테스트                                                                             | 전 Phase |

---

## ⑧ 열린 질문 (차단성/비차단성)

**차단성(해소):** 발화 경로(S1)·피로 정책(동기화 ledger dedup)·이원 저장(provider 주입)·forward-scheduling·클릭 계약·stale 흡수 — 확정.

**비차단성(권장 기본값 확정, 라벨):**

- **Q1 실명 노출 — 사용자 결정: 실명 노출 기본 ON**(사용성 우선, `feedback_usability_over_theoretical_privacy`). 마스킹(무명/번호·이니셜)은 설정 옵션으로 유지, 미러링 유출 위험 안내 고지.
- **Q2 설정 동기화 — 확정:** 설정=`settings` 편승, 커서=로컬, 피로 ledger=동기화 `reminder-fires`.
- **Q3 수업반 D1 — 사용자 결정: D1 v1 포함.** `getJustFinishedPeriod` 헬퍼 신설 + 시간표↔수업반 매핑 실패 시 자동 트리거 skip 폴백. (Phase P5)
- **Q4 백그라운드 발화 — 확정:** S1으로 위젯/아이콘/실행중 발화. 완전종료=비대상.
- **Q5 담임 tags 경로 — 확정:** 신규 `addRecordWithTags`(단일 write, 시그니처·15파일 호출부 불변).
- **Q6 이벤트연동 범위 — 확정:** 결석/조퇴 다음날+상담 `followUpDate`만 v1.

### 실행 시 구현 체크리스트(비차단 follow-up, Critic 지적)

1. `recordSaved()` 훅을 **저장 경계(repository/usecase)**에 두어 담임·수업반·위젯 인라인 편집 모든 표면 커버 확인.
2. 위젯 모드에서 MainApp이 죽어도 재예약이 굶지 않게 **horizon당 최소 1회 재계산** 보장(WidgetApp `onDataChanged` 경로 등).
3. 배치 저장(출결 30명 일괄) 시 재계산·push **디바운스/코얼레싱**.

---

## ⑨ ADR

**Title:** 학생 관찰 기록 알림 — forward-scheduling(렌더러 계산) + Electron main 상시 타이머 발화(S1)

**Decision:**

- 감지·선정·로테이션·**forward 스케줄빌드**는 렌더러 domain 순수함수(provider 주입). 담임=`StudentRecord`, 수업반=`ObservationRecord` 적재(신규 엔티티 없음).
- 능동형 OS 토스트는 S1: 렌더러가 각 후보의 **다음 발화 timestamp(horizon N일)**·opaque `reminderId`·마스킹 body를 계산해 로컬 persist+IPC `reminder:schedule`, main은 상시 타이머+powerMonitor+Tray로 발화. **클릭 시 main은 `expandIconWindow`+opaque `reminderId`만 되돌리고, 학생/프롬프트 해석은 렌더러가 수행.**
- 설정=`settings` 편승, 로테이션 커서=로컬, 피로 상한=동기화 `reminder-fires`(`studentId:date` 멱등).

**Drivers:** ①기본 설정에서도 능동 알림 준수 ②레이어 보존 ③프라이버시.

**Alternatives considered:**

- C2(렌더러 발화) 기각: IconApp/WidgetApp 축약(`App.tsx:495-507`), EventPopup MainApp 전용(`:1164`), memorySaver 기본 true(`main.ts:2330/2342`)로 위젯/아이콘 진입 시 MainApp destroy(`:1039`) → 넛지 필요 상태에서 침묵.
- C1(main 자체 due 계산) 기각: 도메인 로직 누수.
- 신규 통합 엔티티 기각: 조회·동기화·AI브릿지 이중화.
- "오늘 due 집합" 스케줄 기각: 렌더러가 죽으면 날짜 경계 재계산 불가 → forward-looking 미래 timestamp 필수(M1).

**Why chosen:** S1이 딛을 상시 인프라(setInterval `main.ts:4816`·powerMonitor `:4868-4923`·Tray `:1775`·Notification 그린필드)가 이미 프로덕션에 존재해 미룰 이유가 없고, 계산을 렌더러에 남겨 레이어를 지키면서 기본 설정에서도 능동 알림을 보장.

**Consequences:**

- 렌더러↔main 스케줄 계약(`reminder:schedule`) + opaque-id 클릭 계약 추가; electron 재번들 게이트 상시.
- 스케줄은 forward-looking(horizon N일 미리 push)이라 렌더러 사망 중에도 미래 발화 유지(AC3-f).
- **발화는 advisory:** destroy가 close 핸들러(`:1727` preventDefault)를 우회(`:1039`)해 late-invalidate 구조적 불가 → stale은 **재진입/클릭 시 렌더러 재계산으로 흡수**(no-op, AC3-g). 저장 경로 단일 훅으로 WidgetApp 편집 등 모든 표면 재-push.
- **오프라인 유계[M4]:** 2기기 동시 발화 dedup은 ledger 수렴만 — 이미 뜬 토스트는 못 지움 → 중복 상한 "기기·일당 ≤ +1", ledger best-effort 수렴.
- 저장 위치 이원화 유지; 앱 완전종료 발화 불가(다음 기동 시 은은형).
- 신규 동기화 도메인 `reminder-fires` → SYNC_REGISTRY(`syncRegistry.ts:63`)+App.tsx(`:991`) 두 곳 등록.

**Follow-ups:** Q1(실명 노출 ON)·Q3(D1 v1 포함) 사용자 결정 반영 완료; v1.1 = 앱 완전종료 상태 발화 강화·D1 매핑 정밀화(이동수업/분반). D1의 시간표↔수업반 매핑 불안정은 v1에서 skip 폴백으로 유계화.

---

### 근거 파일 (주요, file_path:line)

발화경로: `electron/main.ts:2330`/`:2342`(memorySaver 기본 true)·`:1034-1044`(destroy)·`:1727-1729`(close preventDefault 우회 대상)·`:4816`(상시 타이머)·`:4868-4923`(powerMonitor)·`:1775`(Tray)·`:1202`(expandIconWindow)·`:2012`(system:resume 재방송); `src/App.tsx:495-507`(IconApp)·`:1164`(EventPopup MainApp 전용)·`:509-515`(quick-add kinds); `electron/preload.ts:19`; Notification 전역 grep 0.
기록: `src/domain/entities/StudentRecord.ts:18`·`:35`·`:28`·`:55`; `src/usecases/studentRecords/ManageStudentRecords.ts:18`; `src/adapters/stores/useStudentRecordsStore.ts:196`; `src/domain/entities/Observation.ts:1`·`:23`·`:30`; `src/adapters/stores/useObservationStore.ts:64`·`:142`; `src/domain/entities/TeachingClass.ts:42`.
모달/큐/스누즈: `src/adapters/stores/useModalCoordinatorStore.ts:19`·`:46`; 메타테스트 `src/adapters/stores/__tests__/useModalCoordinatorStore.test.ts`·`src/adapters/components/common/__tests__/ModalRegistry.test.ts`; `src/adapters/components/Dashboard/EventPopup.tsx:96`; `src/adapters/stores/useUpdatePreferencesStore.ts:46`.
설정/동기화/위젯: `src/domain/entities/Settings.ts:408`·`:238`·`:463`; `src/domain/valueObjects/PeriodTime.ts:1`; `src/adapters/components/Settings/SettingsSidebar.tsx:50`; `src/usecases/sync/syncRegistry.ts:63`; `src/App.tsx:991`; `src/widgets/registry.ts:129`·`:111`.
