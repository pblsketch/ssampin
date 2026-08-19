# 학기 총 수업 차시 자동 계산 + 진도 입력 보조 — 설계서 (구현 후 기록)

- **상태**: 구현 완료 · 미출시 (2026-08-20)
- 계획서: `docs/01-plan/features/lesson-count-and-progress-assist.plan.md` (v1.2)
- 커밋: `194deeab` → `332af94a` → `c73541f9` → `cd47f445` → `3c2e778c` → `0a7df03d` → `d14b7175`

이 문서는 **실제로 만들어진 구조**를 적는다. 왜 그렇게 했는지는 계획서에 있고, 여기서는
"무엇이 어디에 있는가"와 "다음 사람이 건드릴 때 조심할 것"을 남긴다.

---

## 1. 한 줄 요약

교사 시간표 + 나이스 학사일정 + 공휴일을 합쳐 **"이번 학기 이 반 수업이 몇 차시인가"를 추정**하고,
그 값을 진도 관리 화면과 진도 입력에 쓴다. 숫자는 **확정이 아니라 예상**이며, 그 사실과 근거가
화면에 열려 있다.

---

## 2. 레이어별 지도

### 2-1. Domain (외부 의존 0)

| 파일                             | 역할                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| `rules/buildLessonDayIndex.ts`   | 학기 전체를 훑어 `날짜 → {교시들, 매칭단계}` 색인 생성. 성능 3단(P1~P3) 포함         |
| `rules/lessonDayExclusion.ts`    | 그날 수업이 없었는지 판정. 자동 제외는 공휴일·방학만                                 |
| `rules/lessonCountRules.ts`      | 차시 집계(`estimateLessonCount`)와 다음 수업일(`findNextLessonDate`)                 |
| `rules/lessonNumberPattern.ts`   | 직전 기록의 차시 표기를 읽어 다음 값 제안                                            |
| `rules/termEndFromSchedule.ts`   | 학사일정에서 학기 종료일 후보 찾기                                                   |
| `rules/termEndPrompt.ts`         | 종료일을 언제 물을지 판정                                                            |
| `rules/progressMatching.ts`      | **기존 파일 확장** — `getMatchingPeriodsDetailed`가 매칭 단계(1/2/3)를 함께 돌려준다 |
| `entities/Settings.ts`           | `termEndDates` · `termEndPromptSkipped` 추가                                         |
| `entities/CurriculumProgress.ts` | `LessonDayAdjustment` · `lessonDayAdjustments?` 추가                                 |

### 2-2. UseCases

| 파일                                          | 역할                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `classManagement/ManageCurriculumProgress.ts` | **루트 보존 규칙**(`{ ...data, entries }`) + `getAdjustments`/`saveAdjustment` + `saveAll`의 정정 인자 |

### 2-3. Adapters

| 파일                                                 | 역할                                                              |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| `hooks/useTermRange.ts`                              | 이번 학기의 (시작, 끝). 끝이 없으면 `null`                        |
| `hooks/useLessonCountEstimate.ts`                    | 스토어에서 재료를 모아 도메인에 넘기는 얇은 층. **2단계 useMemo** |
| `components/Progress/LessonCountSummary.tsx`         | 한 줄 요약 + 진도율 두 개                                         |
| `components/Progress/ExcludedDaysPanel.tsx`          | 뺀 날·넣은 날 근거 패널                                           |
| `components/Progress/PlannedBulkFillModal.tsx`       | 남은 수업일에 '예정' 일괄 생성                                    |
| `components/SchoolYearWizard/TermEndPromptModal.tsx` | 학기 마지막 수업일 확인 팝업                                      |
| `components/ClassManagement/ProgressTab.tsx`         | 위 조각들을 조립. 차시 이어받기·날짜 이동·빠진 날 표시            |
| `components/ClassManagement/ProgressEntryFields.tsx` | 참고 표시 슬롯 + 수업일 이동 버튼                                 |
| `stores/useTeachingClassStore.ts`                    | `lessonDayAdjustments` 상태 + `setLessonDayAdjustment`            |
| `stores/useModalCoordinatorStore.ts`                 | `TERM_START_PROMPT`(5.25) · `TERM_END_PROMPT`(5.3)                |

---

## 3. 데이터 흐름

```
설정(개학일·종료일) ─┐
교사 시간표 ─────────┤
변동 시간표 ─────────┼→ buildLessonDayIndexResult → { index, unavailable }
수업반 목록 ─────────┘                                    │
                                                          ↓
공휴일(holidayRules) ─┐                        estimateLessonCount
학사일정(events) ─────┼──────────────────────────────┤
사용자 정정 ──────────┘                                    ↓
                                        { status, 차시 합계, 넣은 날, 뺀 날 }
                                                          ↓
                                     LessonCountSummary · ExcludedDaysPanel
                                     PlannedBulkFillModal · 다음 수업일 이동
```

**저장하는 것은 두 가지뿐이다** — 학기 종료일(`settings.termEndDates`)과 수업일 정정
(`curriculum-progress.lessonDayAdjustments`). 계산 결과는 저장하지 않는다.

---

## 4. 다음 사람이 조심할 것

### 4-1. 진도 저장은 반드시 루트를 보존한다

`ManageCurriculumProgress`의 모든 저장 경로가 `{ ...data, entries }` 형태여야 한다.
`{ entries }`로 새로 만들면 `lessonDayAdjustments`가 **다음 저장 한 번에 사라진다.**
새 메서드를 추가할 때도 같다.
잠금: `__tests__/curriculumProgressSiblingPreserve.test.ts` (수정 전 코드로 되돌리면 5건 빨간불)

### 4-2. 학사 확인 팝업 2종은 **함께** 큐에 있어야 한다

모달 코디네이터는 등록된 것끼리만 줄을 세운다. 한쪽만 등록하면 나머지는 큐 밖에서 그대로 뜨고,
8월 신규 사용자는 두 조건이 동시에 참이라 focus trap이 겹친다.
잠금: `ModalRegistry.test.ts` + `regression-grep-check.mjs` #54·#55

### 4-3. 교시 이름을 직접 만들지 않는다

`${period}교시` 금지. 학교가 '1교시'를 '1블록'으로 바꿀 수 있다. `resolvePeriodLabel` 사용.
잠금: `periodLabelHardcoding.metatest.test.ts` (구현 중 실제로 이 가드에 걸렸다)

### 4-4. 새 모달 우선순위는 두 곳에 등록한다

`PRIORITY_ORDER`에 값을 넣는 것만으로는 부족하다. `useModalCoordinatorStore.test.ts`의
기대 배열과 `ModalRegistry.test.ts`의 `expectedPriorities`에도 넣어야 실제 검사 대상이 된다.

### 4-5. `matchStage`는 지우지 말 것

2·3단계는 "덜 확실한 날"을 사용자에게 보여주는 유일한 통로다. 이걸 감추면 과대 추정 쪽 오차를
확인할 방법이 사라진다.

### 4-6. 성능 — 색인과 집계를 나눠 둔 이유

`useLessonCountEstimate`의 `useMemo`가 두 단계다. 색인(무거움)은 시간표·학기 구간이 바뀔 때만,
집계(가벼움)는 공휴일·정정이 바뀔 때. **진도 기록은 색인 의존성에 없다** — 수업 한 건 적을 때마다
학기 100일을 다시 훑으면 입력이 버벅인다.

---

## 5. 아직 안 한 것

- **`/docs` 사용자 가이드** — 출시 시점에 함께 올린다. 앱에 없는 기능을 안내하는 문서는 낡은 게
  아니라 거짓말이다(ADR-056에서 반대 방향으로 겪은 문제).
- **모바일** — 진도 화면이 별도라 UI 작업이 두 벌이다. 데이터는 같은 유스케이스를 쓰므로 안전하다.
- **학년별 행사 필터** — `TeachingClass`에 학년 정보가 없다. 학년 일부만 해당하는 행사는 자동
  제외하지 않고 목록에만 올린다.
- **실기기 확인** — 팝업 겹침·포커스는 jsdom으로 잡히지 않는다.
