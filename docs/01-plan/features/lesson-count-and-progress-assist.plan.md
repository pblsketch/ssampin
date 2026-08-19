# 학기 총 수업 차시 자동 계산 + 진도 입력 보조 계획서 v1.2

- **상태: 승인 대기(pending approval)**
- 작성일: 2026-08-19 (v1.0) / 개정 2026-08-19 (v1.1)
- 단계: RALPLAN 합의 계획 워크플로우 — **Architect 검토 반영 완료**
- **v1.1 개정 요지**: Architect가 코드를 직접 열어 검증해 차단 사항 5건을 냈고, 그중 "고치면 좋은 것"에 있던 2건을 차단으로 승격해 총 7건을 반영했다. ①학기 종료일 팝업과 **함께 기존 개학일 팝업도** 모달 큐에 등록(8월 focus trap 재발 방지) ②반 삭제 시 수정 목록 정리 추가 ③"수업했어요"의 의미를 "교시 수 되살리기"로 재정의 ④방학식·종업식 자동 제외 자기모순 해소 ⑤시간표 미등록 시 "예상 0차시" 방지 ⑥계산 로직을 도메인 순수 함수로 내림(테스트 가능성) ⑦"넣은 날"과 매칭 근거도 화면에 노출(원칙 §1-1.2 준수). 전체 목록은 §14.
- 범위 확정: 사용자가 승인한 A·B·C(1~4) 그대로. **줄이거나 늘리지 않는다.**
- 이 문서는 계획서일 뿐이며, 승인 전에는 소스 코드를 한 줄도 고치지 않는다.

---

## 1. RALPLAN-DR 요약

### 1-1. Principles

1. **앱은 학사 구간을 단정하지 않는다.** 학기 종료일도, 수업이 없는 날도 앱이 확정하지 않고 사용자에게 묻거나 고칠 수 있게 연다(ADR-037 계승).
2. **계산 결과는 "예상"이고, 그 사실이 화면에 남아 있어야 한다.** 숫자 옆에 근거(제외한 날)를 항상 열어볼 수 있고, 근거를 사용자가 뒤집을 수 있다.
3. **앱이 차시를 세는 방식을 선생님에게 강요하지 않는다.** 입력 보조는 선생님이 이미 쓰던 표기를 읽어 이어 줄 뿐, 단위("차시")를 앱이 정의하거나 붙이지 않는다.
4. **기존 숫자를 바꾸지 않는다.** 지금 화면에 있는 진도율은 그대로 두고 새 지표를 나란히 붙인다. 숫자가 갑자기 떨어지면 선생님은 고장으로 읽는다.
5. **계산은 순수 도메인 함수로 하고, 계산 결과를 파일로 저장하지 않는다.** 저장하는 것은 사용자가 준 사실(학기 종료일, 수업 여부 수정)뿐이다.

### 1-2. Decision Drivers (상위 3개)

1. **오판이 기본값이 되는 것을 막을 수 있는가.** 시험기간·체육대회·수학여행은 나이스 데이터만으로 갈리지 않는다. 자동 제외를 넓게 잡으면 앱이 조용히 틀린 숫자를 확신 있게 보여 준다.
2. **기존 진도 데이터를 위험에 빠뜨리지 않는가.** 진도 저장 경로는 파일 통째 교체 방식이라(§4-6) 새 필드를 잘못 얹으면 조용히 지워진다. 과거 관찰기록 소실 사고와 같은 계열이다.
3. **학기 100일 × 반 10개를 훑는 비용을 감당할 수 있는가.** 지금 구조로 순진하게 돌리면 날짜×반마다 시간표 병합이 일어난다.

### 1-3. Viable Options

#### 축 (a) — 차시 계산을 어디서 할 것인가

**Option A1 — 순수 도메인 함수 + 어댑터 훅의 메모(권장)**

- 방식: `src/domain/rules/lessonCountRules.ts`에 스토어를 모르는 순수 함수를 두고, 어댑터 훅(`useLessonCountEstimate`)이 스토어에서 재료를 모아 넣는다. 기존 `progressMatching.ts`가 이미 쓰는 계약과 동일하다.
- 장점: 테스트가 쉽고(입력→출력), 도메인 레이어 규칙(외부 의존 0)을 지키며, PC·모바일이 나중에 같은 함수를 공유할 수 있다. 계산 결과를 저장하지 않으므로 무효화 문제가 없다.
- 단점: 훅이 재료를 모으는 코드가 필요하고, 메모 의존성 배열이 길어진다(시간표·변동·학사일정·설정·수정목록).

**Option A2 — 스토어 파생값(selector)로 계산**

- 방식: `useTeachingClassStore`에 파생 selector를 추가한다.
- 장점: 컴포넌트에서 바로 꺼내 쓸 수 있고 훅 추가가 없다.
- 단점: 계산 로직이 도메인 밖으로 나가 단위 테스트가 스토어 목킹에 묶인다. `getEffectiveTeacherSchedule`은 `useScheduleStore` 소유라 스토어 간 교차 참조가 생기고, 이 저장소는 `useStudentStore` import 순환 전례가 있다.

**Option A3 — 계산 결과를 캐시 엔티티로 파일에 저장**

- 방식: 학기별 차시 계산 결과를 파일에 적어 두고 재사용한다.
- 장점: 매번 계산하지 않는다.
- 단점: **무효화 지점이 너무 많다** — 시간표 변경, 변동 시간표 추가, 학사일정 재동기화, 학기 종료일 변경, 사용자 수정. 게다가 동기화 대상이 되면 기기마다 시간표가 다를 때 캐시가 서로를 덮어써 "예상"이 기기별로 흔들린다. 저장할 가치가 있는 것은 사용자가 준 사실뿐이라는 원칙(§1-1.5)과 정면 충돌.

→ **A1 채택.** A3는 무효화·동기화 비용이 이득보다 크고, A2는 테스트 가능성과 순환 참조 위험 때문에 기각한다. 성능은 저장이 아니라 **메모 전략**으로 푼다(§5).

#### 축 (b) — 사용자 수정("이 날은 수업했어요")을 어디에 저장할 것인가

**Option B1 — `settings`에 얹는다**

- 장점: `termStartDates`와 같은 자리라 개념이 모인다. 설정 저장 경로는 이미 있다.
- 단점: `settings`는 **통파일 교체 + 동기화 대상**이고, 이 저장소는 settings 통파일 교체로 충돌 루프가 난 전례(ADR-039·040)가 있다. 반별·날짜별로 계속 늘어나는 목록을 설정 파일에 넣으면 충돌 폭이 파일 전체가 된다. 반을 삭제해도 남는다.

**Option B2 — `curriculum-progress` 파일에 형제 배열로 추가(권장)**

- 방식: `CurriculumProgressData`에 `lessonDayAdjustments?: readonly LessonDayAdjustment[]`를 더한다.
- 장점: 같은 도메인(진도)이고, 동기화 레지스트리에 이미 등록돼 있어(#16 `curriculum-progress`) 신규 동기화 도메인 등록이 필요 없다. **B3보다 표면 비용이 명백히 작다** — B2는 기존 4개 메서드에서 `{ entries }` → `{ ...data, entries }`로 바꾸는 수준이고 형제 필드가 없으면 스프레드가 무해하다. 반면 B3는 리포지토리·포트·유스케이스·`syncRegistry`·`App.tsx`를 늘리고, `ExecuteYearTransition`의 리셋 목록(66~161행)에도 새 키를 등록해야 한다 — 빠뜨리면 학년도 전환 후에도 작년 수정이 살아남는다.
- ⚠️ **v1.1 정정** — v1.0이 적은 장점 2개는 코드와 달랐다(Architect 검증). ①**"반 삭제 시 함께 정리되는 경로가 있다"는 거짓이다.** `useTeachingClassStore.ts:396-398`은 `entries`만 걸러내므로, Step 1로 형제 필드를 보존하는 순간 삭제된 반의 수정 목록이 영구히 남는다 — B1을 기각한 사유("반을 삭제해도 남는다")와 **똑같은 결함**이 된다. 그래서 §7 Step 4에 정리 작업을 **필수로 추가**했다. ②**"항목 단위라 충돌 폭이 좁다"도 거짓이다.** `syncRegistry.ts:195-203`의 `curriculum-progress`는 항목 병합이 없는 **통파일 LWW**다(항목 병합은 `student-records`·`observations`·`attendance`뿐). **근거가 틀린 채 결론만 맞으면 다음 세션이 그 근거를 믿고 다른 결정을 내린다** — 그래서 결론(B2 채택)은 유지하되 근거를 위와 같이 바꿨다.
- 단점: **선결 조건이 있다.** 현재 진도 저장은 `{ entries }`만 새로 만들어 통째로 덮어쓴다(§4-6, 5개 지점). 그대로 두면 새 형제 필드가 다음 저장 때 **조용히 사라진다.** 이 선결 수정은 기존 진도 저장 경로 전체에 영향을 주므로 별도 단계·별도 커밋으로 분리해야 한다.

**Option B3 — 새 도메인 파일 + 동기화 신규 등록**

- 장점: 기존 진도 저장 경로를 건드리지 않는다.
- 단점: 새 동기화 도메인은 `syncRegistry.ts`와 `App.tsx` 두 곳을 손봐야 하고(과거 함정 기록), 리포지토리·포트·유스케이스가 통째로 하나 더 생긴다. 저장할 데이터가 반·날짜·한 글자 상태뿐인 것에 비해 표면이 과하다.

**Option B4 — 기존 `ProgressEntry`의 `status: 'skipped'`를 재활용 — 기각**

- 기각 사유: 의미가 다르다. `skipped`는 "수업은 있었는데 진도를 건너뜀"이고 이번 건은 "그날 수업 자체가 있었나/없었나"다. 섞으면 기존 진도율 분모가 오염되고, 원칙 §1-1.4(기존 숫자 보존)를 위반한다.

→ **B2 채택, 단 §7 Step 1(형제 필드 보존 수정)을 선행 조건으로 못 박는다.** B1은 충돌 폭·수명 관리에서 지고, B3는 표면 비용이 이득보다 크다.

### 1-4. 유일 옵션만 남은 항목과 무효화 근거

**학기 종료일(B)의 저장 형태**는 사실상 하나만 남았다: `settings.termEndDates?: Record<학기라벨, YYYY-MM-DD>` + `settings.termEndPromptSkipped?: string`.

- 대안 ①(전용 새 엔티티): 이미 `termStartDates`가 같은 성격의 값을 settings에 두고 있다(`Settings.ts:504-520`). 시작일과 종료일을 다른 파일에 흩으면 "이 학기의 구간"을 읽는 쪽이 두 저장소를 합쳐야 한다. → 무효화.
- 대안 ②(학기 구간을 하나의 객체로 통합 `termRanges: {start,end}`): 기존 `termStartDates`의 스키마 마이그레이션이 필요하고, `resolveCurrentTerm`·`termSignalFromTimetable`·`SchoolYearWizard`·모바일 훅까지 읽는 쪽이 6곳 이상이다. 종료일 하나 추가하려고 학기 판정 정본을 흔드는 것은 ADR-037 표면을 불필요하게 넓힌다. → 무효화.
- 대안 ③(종료일을 학사일정에서 매번 자동 파생, 저장 안 함): 행사명이 학교마다 달라 오탐이 있고, 무엇보다 사용자 확인 결과를 기억할 곳이 없어 매번 다시 묻게 된다. → 무효화(원칙 §1-1.1과 충돌).

---

## 2. 쉬운 말 요약 (비개발자용)

지금 진도 관리 화면은 **선생님이 적은 것만** 셉니다. 그래서 "이번 학기에 이 반 수업이 몇 번인지"는 아무도 모릅니다.

이 기능은 세 가지를 합쳐서 그 숫자를 **추정**합니다.

1. 선생님 시간표 — 이 반이 무슨 요일 몇 교시에 있는지
2. 학교가 올린 학사일정 — 방학·시험·행사가 언제인지
3. 공휴일 — 앱이 이미 알고 있는 한국 공휴일

이걸 합치면 "2학기 예상 34차시 · 완료 12 · 남은 22" 같은 한 줄이 나옵니다.

**중요한 건 이 숫자가 틀릴 수 있다는 걸 앱이 숨기지 않는다는 점입니다.** 그래서

- 항상 **"예상"**이라고 씁니다.
- **뺀 날 목록을 펼쳐 볼 수 있고**, "이 날은 수업했어요"를 눌러 선생님이 고칠 수 있습니다.
- 학기가 언제 끝나는지는 앱이 마음대로 정하지 않고, 학사일정에서 찾은 날짜를 보여 주며 **"12월 31일까지로 보면 될까요?"라고 물어봅니다.**

그리고 이 숫자를 진도 입력에도 씁니다.

- 새 진도를 적을 때 **직전 기록의 표기를 이어서** 제안합니다. "3차시 - 소설의 구성"을 적었으면 다음엔 `4`를 넣어 둡니다. 선생님마다 차시를 세는 방식이 다르니 **앱은 숫자만 넣고 "차시"라는 글자는 붙이지 않습니다.**
- 남은 수업일에 **빈 계획을 한꺼번에 깔아** 단원만 채우게 합니다(미리 보고, 되돌릴 수 있게).
- 날짜를 넘길 때 **수업 없는 날은 건너뛰고** 다음 수업일로 갑니다.
- 기록이 빠진 수업일에 **표시**를 답니다.

---

## 3. 범위

### 3-1. 1차 포함

| 코드 | 항목                                                                           |
| ---- | ------------------------------------------------------------------------------ |
| A-1  | 진도 관리 탭 상단 한 줄 요약 — "2학기 예상 34차시 · 완료 12 · 남은 22"         |
| A-2  | 제외한 날 목록 펼치기 — 날짜·사유·근거 행사명                                  |
| A-3  | "이 날은 수업했어요 / 수업 없었어요" 개별 수정과 저장                          |
| A-4  | 모든 숫자에 "예상" 표기 고정, 확정처럼 보이는 표현 금지                        |
| B-1  | 학사일정에서 학기 종료일 후보 찾기(방학식·종업식·여름방학·겨울방학)            |
| B-2  | 확인 팝업 — 후보 제시 → 사용자 확정 → `settings.termEndDates` 저장             |
| B-3  | 후보 없음/거절 시 직접 입력 폴백                                               |
| C-1  | 직전 진도 기록의 표기 패턴을 읽어 다음 값 제안(순수 도메인 파서)               |
| C-1b | 앱이 센 누적 차시는 입력칸이 아닌 옆의 작은 참고 표시("이번 학기 13번째 수업") |
| C-2  | 남은 수업일에 `planned` 일괄 생성 — 미리보기·되돌리기·중복 방지 포함           |
| C-3  | "다음 수업일로" 이동 — 수업 없는 날·공휴일 스킵                                |
| C-4  | 빠뜨린 날 배지 + 학기 기준 진도율을 **기존 진도율과 나란히** 표시              |

### 3-2. 1차 제외 (근거 포함)

- **모바일(`src/mobile/`) 진도 화면** — §6-3에 근거와 데이터 호환 조건을 별도로 적는다. **제외지만 무해하지 않다**: 모바일 저장 경로가 새 필드를 지우지 않는지 반드시 확인해야 한다(Step 1에 포함).
- **학년별 행사 필터(`gradeYn` 활용)** — §6-2 근거. 대신 "학년 일부만 해당"인 행사는 자동 제외하지 않고 확인 목록에만 올린다.
- **시험기간 전용 시간표 자동 반영** — 시험기간에 별도 시간표를 운영하는 학교의 실제 표를 앱이 알 수 없다. 시험기간은 "확인 필요" 표시만 하고 사용자가 정한다.
- **차시 번호를 진도 기록에 필드로 저장** — 앱이 차시를 정의하지 않는다는 원칙(§1-1.3) 위반. 참고 표시는 계산값이며 저장하지 않는다.
- **보관된 반(`archived`)** — 계산·표시 대상에서 제외한다.
- **다년도/이전 학기 소급 계산** — 현재 학기만.

---

## 4. 코드 사실 대조 결과 (직접 열어 확인함)

| #    | 확인한 것                                                                      | 결과                                                                                                                                       | 계획에 미치는 영향                                                                                        |
| ---- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| 4-1  | `src/domain/rules/progressMatching.ts`                                         | `getMatchingPeriods(MatchingInput)` — 교실+과목 → 교실만 → 담임반 폴백 3단계. 스토어 의존 0, 그날 시간표를 **호출자가 넣어 준다**          | 그대로 재사용. 새 계산 함수도 같은 계약(호출자가 재료 주입)을 따른다                                      |
| 4-2  | `useScheduleStore.getEffectiveTeacherSchedule` (`useScheduleStore.ts:321-328`) | 결과가 **(요일, 그날 override) 두 가지로만** 결정된다. 내부에서 `overrides.filter((o) => o.date === date)`를 매 호출 수행                  | 성능 전략의 핵심 근거 — override가 없는 날짜는 요일별 결과를 재사용할 수 있다(§5)                         |
| 4-3  | `ProgressTab.tsx:174-188` `lessonDayIndices`                                   | **이번 주 기준 7일만** 훑어 요일 인덱스를 만든다. 학기 전체 개념 없음                                                                      | 학기 전체 계산은 새 훅으로 분리하고, 기존 `lessonDayIndices`(달력 강조용)는 건드리지 않는다               |
| 4-4  | `ProgressTab.tsx:140-147` `stats`                                              | `percent = completed / entries.length` — **입력한 것 중 완료 비율**                                                                        | 이 값을 유지하고 새 지표를 옆에 붙인다(C-4). 덮어쓰기 금지                                                |
| 4-5  | `ProgressTab.tsx:191-199` `handleDateChange`                                   | 날짜 변경 시 이미 매칭 교시 첫 번째를 자동 선택 중                                                                                         | C-1(값 제안)은 이 핸들러에 얹는다. 새 경로를 만들지 않는다                                                |
| 4-6  | `usecases/classManagement/ManageCurriculumProgress.ts`                         | **`add`/`update`/`delete`/`saveAll` 모두 `{ entries }`만 새로 만들어 저장한다.** 읽을 때 `data?.entries ?? []`로 형제 필드를 버린다        | ⚠️ **최대 함정.** 새 형제 필드는 다음 저장 때 조용히 사라진다. Step 1 선결 수정 필수                      |
| 4-7  | `adapters/repositories/JsonTeachingClassRepository.ts:18-24`                   | `storage.write('curriculum-progress', data)` — 파일 통째 쓰기                                                                              | 위와 같은 이유. 병합은 유스케이스 책임                                                                    |
| 4-8  | `domain/entities/Settings.ts:504-525`                                          | `termStartDates?: Record<string,string>` + `termStartPromptSkipped?: string` 쌍이 이미 있다                                                | 종료일은 이 **대칭 형태** 그대로 간다(`termEndDates` + `termEndPromptSkipped`)                            |
| 4-9  | `domain/rules/termStartFromSchedule.ts`                                        | 학사일정에서 개학일 후보를 찾는 규칙이 **이미 있다**. `ScheduleEventLike{date,title,neisEventName}` 최소 입력, `findTermStartCandidates()` | 종료일 규칙은 이 파일을 **그대로 본떠** `termEndFromSchedule.ts`로 만든다. 새 설계 아님                   |
| 4-10 | `domain/rules/termStartPrompt.ts` + `TermStartPromptModal.tsx`                 | 8월에만·학기당 한 번 묻는 판정 + 확인 팝업이 이미 있다. 학사일정 후보를 기본값으로 채운다                                                  | 종료일 팝업의 형태·문구·흐름을 그대로 따른다                                                              |
| 4-11 | `App.tsx:1286,1307`                                                            | `TermStartPromptModal`은 `{!isFirstRun && ...}` 안에 있지만 **`useRegisterModal`을 쓰지 않는다**                                           | ⚠️ 8월 온보딩 focus trap 사고의 구조적 원인. 새 종료일 팝업은 **반드시 모달 코디네이터에 등록**한다(§6-4) |
| 4-12 | `adapters/stores/useModalCoordinatorStore.ts:19-62`                            | `ModalPriority` 11종 + `PRIORITY_ORDER` 숫자 지도. 회귀 그물이 `useRegisterModal(...)` 등록을 grep으로 검사 중                             | 새 우선순위 값 1개 추가 필요(§6-4)                                                                        |
| 4-13 | `domain/entities/NeisSchedule.ts`                                              | `classifyNeisEvent()`는 `subtractDayType === '공휴일'`이면 holiday, 그 외는 **제목 문자열**로 exam/vacation/event/etc 분류                 | 행사 기반 판단은 오판 가능 → 자동 제외는 holiday·vacation만(§6-1)                                         |
| 4-14 | `domain/entities/SchoolEvent.ts:109-117`                                       | 저장된 일정에 `neis.gradeYn`, `neis.subtractDayType`, `neis.eventName`이 **모두 보존돼 있다**                                              | 나이스 원본을 다시 부르지 않고 로컬 일정만으로 계산 가능                                                  |
| 4-15 | `domain/entities/TeachingClass.ts:42-71`                                       | `TeachingClass`에 **`grade` 필드 없음.** `students[].grade?`는 optional                                                                    | 학년 필터 1차 제외 근거(§6-2)                                                                             |
| 4-16 | `domain/rules/teachingClassArchive.ts:14,19`                                   | `isTeachingClassArchived`, `filterActiveClasses` 존재                                                                                      | 그대로 사용. 별도 판정 로직 만들지 않는다                                                                 |
| 4-17 | `adapters/components/Progress/useProgressFanout.ts:32,112,146`                 | `type DayScheduleCache = Map<string, ...>` — **날짜별 시간표 캐시 패턴이 이미 있다**                                                       | 성능 전략은 새 발명이 아니라 이 패턴의 확장(§5)                                                           |
| 4-18 | `scripts/emit-entity-samples.mjs` `ENTITY_FIELD_CONTRACT`                      | `ProgressEntry`/`CurriculumProgress`는 **등록돼 있지 않다**                                                                                | 이번 엔티티 확장은 그 메타 테스트를 건드리지 않는다. 단, Step 6에서 재확인                                |
| 4-19 | `domain/rules/holidayRules.ts`                                                 | `getKoreanHolidays(year)`, `getHolidayName(dateStr, holidays)` — 음력·대체공휴일 포함                                                      | 공휴일 판정은 이것만 쓴다. 새 목록 만들지 않는다                                                          |
| 4-20 | `src/mobile/stores/useMobileProgressStore.ts`                                  | 같은 `ManageCurriculumProgress`를 통해 저장                                                                                                | 4-6 수정이 모바일에도 자동 적용된다 → **모바일을 1차 범위에서 빼도 데이터는 안전해진다**                  |

---

## 5. 성능 전략 (구체안)

### 5-1. 문제 크기

학기 약 100일 × 반 최대 10개 = 순진하게 짜면 `getEffectiveTeacherSchedule` 1,000회 + `getMatchingPeriods` 1,000회. 게다가 `getEffectiveTeacherSchedule`은 매 호출 `overrides` 전체를 훑는다(4-2).

### 5-2. 핵심 관찰

`getEffectiveTeacherSchedule(date)`의 결과는 **(요일, 그날의 override)** 로만 결정된다(코드 확인 4-2). 학기 100일 중 변동 시간표가 걸린 날은 보통 한 자리 수다. 즉 **대부분의 날짜는 같은 요일끼리 결과가 완전히 동일하다.**

### 5-3. 5단계 전략

| 단계 | 내용                                                                                       | 효과                                              |
| ---- | ------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| P1   | `overrides`를 `Map<date, TimetableOverride[]>`로 **한 번** 인덱싱                          | 날짜당 O(overrides) 스캔 → O(1) 조회              |
| P2   | override가 **없는** 날짜는 요일별 시간표 결과를 재사용 (`Map<DayOfWeek, slots>`, 최대 7개) | 시간표 병합 100회 → 7회 + (override 있는 날짜 수) |
| P3   | `getMatchingPeriods` 결과를 `(classId, 요일)` 키로 메모. override가 있는 날짜만 개별 계산  | 매칭 1,000회 → 70회 + 예외 날짜                   |
| P4   | 공휴일(`getKoreanHolidays(year)`)·학사일정(`events`)을 `Map<date, ...>`로 1회 인덱싱       | 날짜당 배열 스캔 제거                             |
| P5   | 상단 요약은 **지금 선택된 반 1개만** 계산. 전체 반 일괄 계산은 하지 않는다                 | 반 개수 배수 자체를 제거                          |

### 5-4. 계산 계층 위치

- P1·P2·P4의 인덱스 생성은 **어댑터 훅(`useLessonCountEstimate`)의 `useMemo`** 안에서 한다. 도메인 함수는 이미 인덱싱된 재료를 받는다.
- 훅 의존성: `[classId, classes, teacherSchedule, classSchedule, overrides, events, settings.enableWeekendDays, termStart, termEnd, lessonDayAdjustments]`.
- 진도 항목(`progressEntries`)은 **의존성에서 분리**한다 — 진도를 하나 적을 때마다 학기 전체를 다시 훑으면 안 된다. "완료/남은" 집계는 계산된 수업일 목록과 진도 목록의 **가벼운 교집합**으로 별도 `useMemo`에서 구한다.

### 5-5. 성능 수용 기준

- 학기 100일 × 변동 20건 × 반 1개 기준으로 `estimateLessonCount` 1회 호출이 **로컬 테스트 환경에서 100ms 미만**(측정: `performance.now()` 상한 assert. 환경 편차를 감안해 넉넉히 잡되, 상한을 넘으면 실패).
- 훅 재계산 횟수 회귀 방지: 진도 항목 1건 추가 시 학기 계산 `useMemo`가 **재실행되지 않는다**(계산 함수 호출 카운터로 검증).

### 5-6. ⚠️ v1.1 변경 — 계산 로직을 도메인 순수 함수로 내린다 (blocking #6으로 승격)

**문제:** v1.0은 P1~P3(계산 로직의 실질)을 어댑터 훅 `useMemo` 안에 두고, 도메인 테스트는 **이미 인덱싱된 재료를 받는 얕은 합산만** 검증했다. 그러면 §9의 A-a1·A-a2가 "결정론적"이라 주장하는 부분이 정작 **틀릴 수 있는 부분을 안 덮는다.** §5-5의 100ms 기준도 jsdom 안의 `useMemo`를 재는 형태라 측정 신뢰도가 낮다.

**사실 확인:** `getDayOfWeek`(`domain/rules/periodRules`)와 `mergeOverridesIntoTeacherSchedule`(`domain/rules/timetableRules`)이 **둘 다 도메인**이다. 따라서 아래 함수는 외부 의존 0으로 구현 가능하다.

```
buildLessonDayIndex({
  termStart, termEnd, weekendDays,
  teacherSchedule,   // 주간 base (요일→슬롯)
  classSchedule,     // 폴백용
  overrides,         // 원본 배열 — 인덱싱도 이 함수 안에서
  classes,           // name/subject/archived
}) → ReadonlyMap<date, { periods: readonly number[]; matchStage: 1 | 2 | 3 }>
```

**효과 3가지**

1. P1·P2·P3이 전부 순수 함수 안으로 들어가 **단위 테스트가 가능**해진다. §5-5의 100ms 상한도 도메인 테스트에서 잰다.
2. `estimateLessonCount`의 인자가 줄어 **인터페이스 비대 우려가 해소**된다. v1.0안은 도메인 함수가 어댑터가 만든 인덱스를 받아 **도메인이 어댑터 내부 구현에 결합**되는 문제가 있었다.
3. `matchStage`가 반환값에 담겨 §6-6("넣은 날" 노출)이 사실상 공짜가 된다.

**P2 전제는 검증 완료.** `timetableRules.ts:114-119`가 `applicable.length === 0`일 때 `base`를 **참조 그대로** 돌려준다. v1.0 §13-3의 자기 불확실성 표시는 해소됐다. 두 가지 보강:

- 실제 판별 기준은 "override 존재"가 아니라 **`appliesToScope(o,'teacher')`를 통과하는 override 존재**다. P1 인덱스로 걸러도 결과는 맞지만(보수적으로 더 많이 개별 계산할 뿐), 스코프까지 인덱싱하면 재사용률이 더 올라간다.
- **P3도 성립한다.** `progressMatching.ts:84`에서 `date`는 오직 `getDayOfWeek` 파생에만 쓰인다(1·2단계는 주입받은 `dayTeacherSchedule`만 봄). 따라서 `(classId, 요일)` 메모 키가 안전하다.

---

## 6. 어려운 결정과 그 근거

### 6-1. 무엇을 자동으로 뺄 것인가 (오판 방지)

| 사유                                                                                          | 자동 제외                                                                                   | 근거                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 주말/시간표에 수업 없음                                                                       | ✅ 제외                                                                                     | 시간표가 정본. 오판 여지 없음                                                                                                                                                            |
| 공휴일 (`holidayRules` 또는 `neis.subtractDayType === '공휴일'`)                              | ✅ 제외                                                                                     | 법정 공휴일. 학교마다 갈리지 않음                                                                                                                                                        |
| 방학 (`classifyNeisEvent === 'vacation'`) — 단 **`…식`으로 끝나는 항목은 제외 대상에서 뺀다** | ✅ 제외                                                                                     | ⚠️ **v1.1 정정(blocking #4)**: `NeisSchedule.ts:258`의 `/방학                                                                                                                            | 재량휴업 | 개교기념/`가 **"여름방학식"·"겨울방학식"까지** `vacation`으로 잡는다. 그런데 §B-1은 **바로 그 행사를 학기 종료일 후보로 쓴다** — 학기 마지막 등교일이 자동 제외되면서 동시에 종료일이 되는 자기 모순이다. 방학식·종업식은 등교일이므로 자동 제외에서 뺀다 |
| 시험기간 (`'exam'`)                                                                           | ❌ **제외 안 함 + "확인 필요" 강조 표시** (v1.1 변경 — ✅ **오너 확정 2026-08-19**, §12 Q3) | v1.0은 자동 제외였으나 뒤집었다. ①**§6-1 원칙의 정반대다** — 자동 제외는 정의상 과소 추정이고, 이 계획 자신이 "알아챌 방법이 없다"고 규정한 종류다. ②**근거 정규식이 취약하다** — `/시험 | 평가     | 고사/`(`NeisSchedule.ts:257`)가 **"수행평가 주간"·"학업성취도평가"·"진단평가"** 처럼 정상 수업일에 붙는 이름까지 잡는다. 이름 기반 판단은 오판한다며 행사를 제외 대상에서 뺀 논리를 시험에 적용하지 않을 이유가 없다                                      |
| 행사 (`'event'` — 체육대회·수학여행 등)                                                       | ❌ **제외 안 함, 목록에만 표시**                                                            | `subtractDayType`이 '공휴일'이 아니라 그냥 행사로 들어온다. 이름으로 판단하면 오판한다. **넣은 채로 두고 "이 날 수업하셨나요?"만 묻는다**                                                |
| 학년 일부만 해당(`gradeYn` 부분 해당)                                                         | ❌ 제외 안 함, 목록에만 표시                                                                | §6-2                                                                                                                                                                                     |

**설계 의도:** 자동 제외를 좁게 잡으면 숫자가 과대 추정되고, 넓게 잡으면 과소 추정된다. **과대 추정이 낫다** — "예상보다 수업이 적었다"는 선생님이 알아채지만, 앱이 조용히 빼 버린 날은 알아챌 방법이 없기 때문이다.

### 6-2. 학년별 행사 필터 간극 — 1차 범위에서 뺀다

- 사실: `NeisScheduleEvent.gradeYn`은 학년별 해당 여부를 갖고 있지만, `TeachingClass`에는 `grade` 필드가 **없다**(4-15).
- 추정 경로 두 가지 모두 불안하다.
  - 반 이름 파싱(`"3-2"`, `"3학년 2반"`, `"화학I A"`) — 선택 과목반·이동수업반 이름은 학년이 안 들어가는 경우가 흔하다.
  - `students[].grade` — optional이고, 여러 학년이 섞인 선택 과목반에서는 단일 값이 나오지 않는다.
- **결정: 학년 필터를 1차 범위에서 뺀다.** 대신 `gradeYn`이 "일부 학년만 해당"인 행사는 **자동 제외 대상에서 빼고 확인 목록에만** 올린다(위 표 마지막 행). 즉 학년 정보를 버리는 게 아니라, **"확실하지 않으니 앱이 결정하지 않는다"는 쪽으로 쓴다.**
- 후속 후보(2차): `TeachingClass`에 `grade?: number`를 명시 입력 필드로 추가하고, 사용자가 채운 반에서만 학년 필터를 적용.

### 6-3. 모바일은 1차 제외 — 단, 데이터 호환은 필수

- 제외 근거 3가지:
  1. 모바일 진도는 별도 스토어(`useMobileProgressStore`)와 별도 화면(`ClassProgressTab`, `MobileProgressLogModal`)이라 UI 작업이 사실상 두 벌이다.
  2. 모바일에는 변동 시간표 병합 경로가 PC와 다르고, 학기 전체 계산 재료(학사일정 전량)가 항상 로드돼 있지 않다.
  3. 한 줄 요약과 제외일 목록은 좁은 화면에서 값이 떨어진다. PC에서 검증한 뒤 옮기는 편이 안전하다.
- **그래도 반드시 할 것:** 모바일도 같은 `ManageCurriculumProgress`를 쓰므로(4-20), Step 1의 형제 필드 보존 수정이 들어가면 **모바일에서 진도를 적어도 PC에서 만든 수정 목록이 지워지지 않는다.** 이 조건이 깨지면 모바일 제외는 성립하지 않는다 — Step 1의 수용 기준에 명시한다.

### 6-4. 학기 종료일 확인 팝업은 모달 코디네이터에 등록한다

- 8월 온보딩 먹통 사고의 구조적 원인은 `TermStartPromptModal`이 **전역 모달 큐를 거치지 않고** 독립적으로 떠서 포커스를 도로 뺏은 것이었다(4-11).
- 새 팝업은 반드시:
  1. `{!isFirstRun && ...}` 안에 마운트하고,
  2. `useRegisterModal('TERM_END_PROMPT')`로 큐에 등록하며,
  3. `ModalPriority`에 `TERM_END_PROMPT` 값을 추가한다(`PRIORITY_ORDER` 제안값 **5.3** — `RECORD_REMINDER`(5.2) 다음, `WIDGET_MODE_COACH`(5.5) 앞. 학사 설정 확인이라 알림보다 늦고 교육용 투어보다 이르다).
- 언제 묻는가(`decideTermEndPrompt` 판정): 아래 조건을 **모두** 만족할 때만, 학기당 한 번.
  - 현재 학기의 `termEndDates` 항목이 없다.
  - 사용자가 그 학기를 `termEndPromptSkipped`로 넘기지 않았다.
  - 사용자가 **진도 관리 탭에 실제로 들어왔다.** (앱 켜자마자 묻지 않는다 — 이 값은 진도 화면에서만 쓰인다. 잔소리를 만들지 않는다.)

### 6-5. 사용자 수정의 데이터 모양

```
LessonDayAdjustment {
  classId: string;       // 반 단위 — 같은 날도 반마다 다를 수 있다
  date: string;          // 'YYYY-MM-DD'
  kind: 'hasLesson' | 'noLesson';
  updatedAt: string;     // ISO — 향후 항목 병합 도입 대비 (현재는 통파일 LWW라 읽는 코드가 아직 없다)
}
```

- 반 단위인 이유: "체육대회라 1학년만 수업 없음" 같은 경우가 실제로 있다. 전역으로 두면 다른 반까지 틀어진다.
- `updatedAt`을 두는 이유(⚠️ **v1.1 정정**): v1.0은 "동기화 병합 시 최신 우선 판정용"이라 적었으나, `curriculum-progress`에는 항목 병합이 없어(**통파일 LWW**) **현재 이 필드를 읽는 코드가 하나도 없다.** 그래도 두는 이유는 향후 항목 병합 도입 대비 + 사용자에게 "언제 고쳤는지"를 보여줄 수 있어서다. **지금은 장식이라는 사실을 명시해 둔다.**
- 판정 우선순위: **사용자 수정 > 공휴일 > 방학 > 행사 > 시간표.** 즉 사용자가 뒤집으면 무조건 이긴다. (v1.1: 시험기간이 자동 제외에서 빠져 우선순위에서도 제거)
- ⚠️ **v1.1 추가 — `hasLesson`의 정확한 의미 (blocking #3).** `hasLesson`은 "그날 **시간표가 주는 교시 수를 되살린다**"로 정의한다. **"차시를 1 더한다"가 아니다.** 이유 두 가지:
  1. 그 반이 그날 **2교시 연강**이면 "1 증가"가 틀린다.
  2. **시간표상 0교시인 날**(대체수업·주말 보강)에 누르면 되살릴 교시가 없어 아무 변화가 없고, 사용자는 **버튼이 고장 났다고 읽는다.**
  - 따라서 **시간표상 0교시인 날은 "수업했어요" 버튼을 비활성화하고 사유를 안내한다** — "이 날은 시간표에 이 반 수업이 없어서 되살릴 게 없어요. 시간표에서 먼저 등록해 주세요."
  - 대안(`periods?: readonly number[]`를 데이터에 넣기)은 **기각**한다 — 앱이 차시를 정의하지 않는다는 원칙 §1-1.3과 어긋나고, 시간표와 별개의 두 번째 정본이 생긴다.

### 6-6. ⚠️ v1.1 추가 — "넣은 날"과 매칭 근거도 화면에 연다 (blocking #7로 승격)

**Architect의 가장 강한 반론:** 이 계획은 시간표를 정본으로 삼는데, `getMatchingPeriods`의 2단계는 **교실명 양방향 부분 문자열 매칭**이다(`progressMatching.ts:56-93`) — `"3-1"`이 `"3-10"`에 걸리고 `"화학"`이 `"화학실"`에 걸린다. 지금까지 이 함수는 "오늘 이 반 수업이 몇 교시인가"를 **한 날짜에 대해 사용자가 눈앞에서 보며** 쓰는 용도라 틀리면 즉시 보였고 오차가 쌓이지 않았다. 이 계획은 같은 함수를 **100일치 무인 반복 적용**해 하나의 숫자로 접는다. 주 1회만 과대 매칭돼도 학기 전체로 15차시가 부풀고, **계획이 보여 주는 건 뺀 날 목록이지 넣은 날 목록이 아니라** 사용자가 알아챌 방법이 없다.

**이 반론은 정당하다.** 원칙 §1-1.2("계산 결과는 예상이고, 그 사실이 화면에 남아 있어야 한다")를 v1.0은 **제외일에만 적용하고 포함일에는 적용하지 않았다** — 원칙 위반이다. 게다가 §6-1은 "과대 추정이 낫다"며 **가장 검증하기 어려운 방향으로 오차를 밀어 놓고, 그 방향의 근거는 화면에 열지 않았다.**

**대응:** `ExcludedDaysPanel`과 같은 패널에서 **수업일 목록(주별 접기)** 을 토글로 제공한다. 각 행에 `(날짜, 교시, 매칭 근거)`를 표시하고, 매칭 근거는 `matchStage`다.

| `matchStage` | 의미                    | 표시                                                |
| ------------ | ----------------------- | --------------------------------------------------- |
| 1            | 교실명 + 과목 동시 일치 | 기본 (강조 없음)                                    |
| 2            | 교실명만 부분 일치      | ⚠️ **구분 표시** — "교실 이름만 맞아서 넣었어요"    |
| 3            | 담임반 시간표 폴백      | ⚠️ **구분 표시** — "우리 반 시간표를 보고 넣었어요" |

이러면 과대 매칭이 사용자 눈에 보이고, "과대 추정이 낫다"는 판단이 **비로소 정당해진다.** 비용은 작다 — `buildLessonDayIndex`(§5-6) 반환값에 `matchStage`를 담기만 하면 된다.

**`getMatchingPeriods` 자체는 고치지 않는다.** 이 계획의 범위가 아니고, 고치면 기존 진도 입력·진도 캘린더·오늘 진도 위젯이 전부 영향을 받는다. 대신 **부정확성을 숨기지 않고 연다.**

---

## 7. 단계별 작업 목록 (파일 단위 + 검증)

> 작업 위치는 항상 현재 저장소의 `main` 브랜치다. 새 브랜치·worktree·PR을 만들지 않는다.
> 다중 세션 충돌 방지를 위해 커밋은 항상 `git commit -m "..." -- <명시 path>` 형태로 한다.

### Step 1 — 선결: 진도 저장이 형제 필드를 지우지 않게 한다 ⚠️ 단독 커밋

**왜 먼저인가:** 이걸 안 하면 §7 Step 4에서 저장한 사용자 수정이 다음 진도 입력 한 번에 사라진다(4-6). 기존 진도 저장 경로 전체에 영향을 주므로 되돌릴 수 있게 분리한다.

| 파일                                                       | 작업                                                                                                                                                                                          |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/usecases/classManagement/ManageCurriculumProgress.ts` | `add`/`update`/`delete`/`saveAll` 4개 메서드에서 `{ entries: ... }` → `{ ...data, entries: ... }`로 바꿔 **읽어 온 형제 필드를 보존**한다. `getProgress()`가 `null`일 때의 기본값도 함께 정리 |

⚠️ **v1.1 정정 2건 (Architect 코드 검증)**

- v1.0 §11-1이 적은 "**5개 지점**"은 실제로 **4개**다 — `add`/`update`/`delete`/`saveAll`. 읽기(`getProgress`)는 성격이 달라 별도 처리.
- **AI 브릿지는 이미 안전하다** — `electron/ai-bridge/index.mjs:25635` `appendProgressDirect`가 이미 `{ ...root, entries: [...] }`로 **루트를 보존**한다. 이 경로는 Step 1 없이도 형제 필드를 지우지 않으므로 electron 게이트 사각지대 걱정이 없다. (다음 세션이 "브릿지도 고쳐야 하나"를 재조사하지 않도록 기록)

**검증**

- 신규 테스트 `src/usecases/classManagement/__tests__/curriculumProgressSiblingPreserve.test.ts`
  - 가짜 리포지토리에 `{ entries: [...], __probe: 'keep' }`를 넣고 `add`/`update`/`delete`/`saveAll` 각각 실행 후 `__probe`가 살아 있는지 확인 (4개 케이스)
  - **그물이 실제로 작동하는지 실증**: 수정 전 코드로 돌리면 이 테스트가 빨간불이 나야 한다(회귀 되살리기 실증 — 과거 교훈)
  - ⚠️ **v1.1 — `any` 금지(G-6) 준수.** `CurriculumProgressData`는 닫힌 인터페이스라 `__probe`를 넣으려면 캐스팅이 필요하다. **테스트 로컬 확장 인터페이스**를 정의해 쓰고 `any`를 쓰지 않는다.
- `npm run test`
- 모바일 경로 확인: `src/mobile/stores/useMobileProgressStore.ts`가 같은 유스케이스를 쓰는지 재확인하고, 별도 저장 경로가 있으면 같은 수정을 적용

### Step 2 — 도메인 순수 함수 4종 + 테스트

| 파일                                             | 작업                                                                                                           |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `src/domain/rules/lessonNumberPattern.ts` (신규) | C-1 표기 패턴 파서. `suggestNextLessonValue(input): string \| null`                                            |
| `src/domain/rules/lessonDayExclusion.ts` (신규)  | 날짜 하나의 제외 사유 판정. `classifyLessonDayExclusion(input): LessonDayExclusion \| null`                    |
| `src/domain/rules/lessonCountRules.ts` (신규)    | 학기 차시 추정. `estimateLessonCount(input): LessonCountEstimate`, `findNextLessonDate(input): string \| null` |
| `src/domain/rules/termEndFromSchedule.ts` (신규) | 학사일정에서 학기 종료일 후보 찾기. `termStartFromSchedule.ts`를 본뜬다                                        |
| `src/domain/rules/termEndPrompt.ts` (신규)       | 언제 물을지 판정. `decideTermEndPrompt(input)`                                                                 |
| `src/domain/entities/Settings.ts`                | `termEndDates?`, `termEndPromptSkipped?` 추가 (주석은 `termStartDates`와 같은 톤으로, ADR-037 근거 명시)       |
| `src/domain/entities/CurriculumProgress.ts`      | `LessonDayAdjustment` 인터페이스 + `CurriculumProgressData.lessonDayAdjustments?` 추가                         |

**설계 제약 (반드시)**

- 이 파일들은 `@domain/*` 안에서만 import한다. 스토어·React·infrastructure import 0건.
- 모든 함수는 재료를 **호출자가 주입**한다(`progressMatching.ts` 계약 그대로). 날짜별 교시 배열, 공휴일 지도, 학사일정 지도, 사용자 수정 목록을 인자로 받는다.
- `any` 금지. 실패는 `null` 또는 빈 배열로 표현하고 예외를 던지지 않는다.

**검증**

- `src/domain/rules/__tests__/lessonNumberPattern.test.ts` — §8 케이스 표 전량
- `src/domain/rules/__tests__/lessonDayExclusion.test.ts` — 우선순위 6단계 × 충돌 케이스
- `src/domain/rules/__tests__/lessonCountRules.test.ts` — §9 수용 기준 대응
- `src/domain/rules/__tests__/termEndFromSchedule.test.ts` — 행사명 변형(방학식/종업식/여름방학/겨울방학/모호 항목 버리기)
- `npx tsc --noEmit`, `npm run lint`, `npm run test`

### Step 3 — 학기 종료일 확보(B) UI

| 파일                                                                     | 작업                                                                                                                                                                                                   |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/adapters/stores/useModalCoordinatorStore.ts`                        | `ModalPriority`에 `'TERM_END_PROMPT'`(5.3)와 ⚠️ **`'TERM_START_PROMPT'`(5.25)** 를 **둘 다** 추가, 주석에 사유 1줄. 5.2(`RECORD_REMINDER`)와 5.5(`WIDGET_MODE_COACH`) 사이가 비어 있음을 코드로 확인함 |
| `src/adapters/components/SchoolYearWizard/TermStartPromptModal.tsx`      | ⚠️ **v1.1 필수 승격(blocking #1)** — `useRegisterModal('TERM_START_PROMPT')` 등록 추가. v1.0은 §10 후속으로 미뤘으나 **후속이 아니라 Step 3의 선결 조건**이다(아래 사유)                               |
| `src/adapters/components/SchoolYearWizard/TermEndPromptModal.tsx` (신규) | `TermStartPromptModal.tsx` 구조를 그대로 따름 + `useRegisterModal('TERM_END_PROMPT')`. 후보 기본값 채움 + 직접 입력 폴백 + "나중에"                                                                    |
| `src/App.tsx`                                                            | `{!isFirstRun && ...}` 블록 안(1286~1307 근처)에 마운트                                                                                                                                                |
| `src/adapters/hooks/useTermRange.ts` (신규)                              | 현재 학기의 (시작일, 종료일) 해석 — `resolveCurrentTerm` + `termStartDates` + `termEndDates` 합성. 종료일 미확정 시 `null` 반환                                                                        |

⚠️ **v1.1 blocking #1 — 왜 기존 개학일 팝업도 함께 등록해야 하는가**

모달 코디네이터는 **참가자끼리만** 직렬화한다(`useModalCoordinatorStore.ts:97-99`의 `selectHead`가 `entries`만 봄). 새 팝업만 등록하면 등록 안 된 `TermStartPromptModal`은 **여전히 독립적으로 뜬다.** 그리고 **두 팝업의 발화 조건이 겹친다** — 8월에 처음 쓰는 선생님은 `termStartDates`도 `termEndDates`도 비어 있으므로, 진도 관리 탭에 들어가는 순간 **focus trap 두 개가 동시에** 뜬다(`Modal.tsx:1,77`이 `focus-trap-react` 사용). **이것이 정확히 8월 온보딩 먹통 사고의 재현 경로다.**

**문구 규칙:** 전부 한국어. "12월 31일까지로 보면 될까요?"처럼 **묻는 문장**으로 쓰고 단정하지 않는다.

⚠️ **v1.1 — Step 3은 Step 4와 같은 릴리즈에 묶는다.** Step 3만 단독 배포되면 "학기 종료일을 물어보기만 하고 아무 데도 안 쓰는 팝업"이 된다 — 잔소리만 늘고 이득이 0인 중간 상태다. "문서상 보류가 코드상 출시"였던 v2.4.2 사고와 같은 계열이므로 문서에 못 박는다.

**검증**

- `src/domain/rules/__tests__/termEndPrompt.test.ts` — 안 묻는 조건 4가지
- `src/adapters/components/common/__tests__/ModalRegistry.test.ts` 갱신 — 새 우선순위 값이 순서에 맞는지
- 실행 확인: 온보딩(첫 실행)과 종료일 팝업이 **동시에 뜨지 않는지** 실제 렌더로 확인. jsdom으로 못 잡는 focus trap은 실기기 확인 항목으로 남긴다
- `npm run regression-check`

### Step 4 — 어댑터 훅 + 상단 요약 + 제외일 패널(A)

| 파일                                                             | 작업                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/adapters/hooks/useLessonCountEstimate.ts` (신규)            | §5 성능 전략 P1~P5 구현. 스토어에서 재료를 모아 도메인 함수 호출                                                                                                                                                                                                                                                               |
| `src/adapters/components/Progress/LessonCountSummary.tsx` (신규) | 한 줄 요약 — "2학기 **예상** 34차시 · 완료 12 · 남은 22". 종료일 미확정이면 "학기 종료일을 알려주세요" 안내 + 팝업 열기                                                                                                                                                                                                        |
| `src/adapters/components/Progress/ExcludedDaysPanel.tsx` (신규)  | 제외한 날 목록(날짜·사유·근거 행사명) + "이 날은 수업했어요/수업 없었어요" 토글                                                                                                                                                                                                                                                |
| `src/adapters/stores/useTeachingClassStore.ts`                   | `lessonDayAdjustments` 상태 + `setLessonDayAdjustment(classId, date, kind \| null)` 액션. 로드 시 함께 읽음                                                                                                                                                                                                                    |
| `src/usecases/classManagement/ManageCurriculumProgress.ts`       | `getAdjustments()` / `saveAdjustment()` 추가 (Step 1의 보존 수정 위에 얹는다). ⚠️ **새 메서드도 반드시 `{ ...data, ... }` 스프레드로 쓴다** — Step 1에서 고친 습관이 새 코드에서 되살아나는 게 이 저장소의 전형적 재발 경로다                                                                                                  |
| `src/adapters/stores/useTeachingClassStore.ts` (삭제 경로)       | ⚠️ **v1.1 blocking #2 — 반 삭제·보관 시 `lessonDayAdjustments` 정리.** 396~398행이 `entries`만 걸러내므로, Step 1로 형제 필드를 보존하는 순간 **삭제된 반의 수정 목록이 영구히 남는다.** 이는 §1-3에서 B1(settings 저장)을 기각한 사유("반을 삭제해도 남는다")와 똑같은 결함이라, 안 하면 **B2를 채택한 이유 자체가 무너진다** |
| `src/adapters/components/ClassManagement/ProgressTab.tsx`        | 상단에 `LessonCountSummary` + `ExcludedDaysPanel` 배치. **기존 `stats`·`lessonDayIndices`는 손대지 않는다**                                                                                                                                                                                                                    |

**스타일 제약:** 하드코딩 HEX 금지 — `sp-*` 토큰만. 라운드는 Tailwind 기본 키(`rounded-lg` 등), 직각 금지. `sp-*` 토큰에 Tailwind 투명도 수식(`bg-sp-x/50`) 금지 — 조용히 투명해진다.

**검증**

- `src/adapters/hooks/__tests__/useLessonCountEstimate.test.ts` (`@vitest-environment jsdom`) — 재계산 횟수 회귀(§5-5)
- 성능 상한 테스트(§5-5)
- 실화면 확인: 라이트/다크/뉴트럴 테마에서 "예상" 표기가 잘리지 않는지
- `npx tsc --noEmit`, `npm run lint`, `npm run test`

### Step 5 — 진도 입력 활용 4종(C)

| 파일                                                               | 작업                                                                                                                       |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `src/adapters/components/ClassManagement/ProgressTab.tsx`          | C-1: `handleDateChange`/`resetForm`에서 `suggestNextLessonValue` 결과를 `formLesson`에 주입. **패턴 못 읽으면 빈 칸 유지** |
| `src/adapters/components/ClassManagement/ProgressEntryFields.tsx`  | C-1b: 차시 입력칸 옆 작은 참고 표시 슬롯(`lessonOrdinalHint?: string`) 추가. **입력값에는 절대 넣지 않는다**               |
| `src/adapters/components/Progress/PlannedBulkFillModal.tsx` (신규) | C-2: 남은 수업일 `planned` 일괄 생성 — 미리보기 표, 개수, 중복 스킵 표시, 상한 경고, 생성 후 "되돌리기"                    |
| `src/adapters/components/ClassManagement/ProgressTab.tsx`          | C-2 진입점을 기존 팬아웃·가져오기 버튼 **옆**에 배치                                                                       |
| `src/adapters/components/ClassManagement/ProgressEntryFields.tsx`  | C-3: 날짜 좌우 이동 버튼이 `findNextLessonDate`를 쓰도록. 없으면 이동하지 않고 안내                                        |
| `src/adapters/components/Progress/LessonCountSummary.tsx`          | C-4: 학기 기준 진도율을 **기존 진도율과 나란히** 두 줄로. 라벨을 서로 다르게("입력 기준" / "학기 기준(예상)")              |
| `src/adapters/components/ClassManagement/ProgressTab.tsx`          | C-4: 기록 없는 지난 수업일에 배지 표시                                                                                     |

**C-2 안전장치 (대량 생성)**

1. **미리보기 필수** — 생성될 (날짜, 교시) 전량을 표로 먼저 보여 주고, 사용자가 확인 버튼을 눌러야 생성한다.
2. **중복 방지** — 같은 `(classId, date, period)`에 이미 항목이 있으면 건너뛰고 "N건 건너뜀"을 표시한다.
3. **되돌리기** — 생성된 id 목록을 화면 상태로 들고 있다가 토스트의 "되돌리기"로 일괄 삭제. **엔티티에 `batchId` 필드를 추가하지 않는다**(스키마 오염 회피, 세션 내 되돌리기로 충분).
4. **상한** — 한 번에 최대 60건. 초과 시 "너무 많습니다. 기간을 좁혀 주세요" 안내 후 중단.
5. 이미 지난 날짜에는 생성하지 않는다(미래 수업일만).

**검증**

- `src/domain/rules/__tests__/lessonNumberPattern.test.ts` (Step 2에서 작성) 전량 통과
- 일괄 생성 중복 스킵·상한 단위 테스트
- `npm run test`, `npm run regression-check`

### Step 6 — 통합 검증 + 문서

| 파일                                                                        | 작업                                                                                                                                |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `docs/02-design/features/lesson-count-and-progress-assist.design.md` (신규) | 구현 후 실제 구조 기록                                                                                                              |
| `PROGRESS.md`                                                               | 완료/진행/블록/다음 갱신                                                                                                            |
| `DECISIONS.md`                                                              | ADR 추가(§10)                                                                                                                       |
| `landing/src/content/docs.ts`                                               | 사용자 행동이 바뀌므로 `/docs` 사용자 가이드 최신화. **문단 통째 교체 금지**(`requiredSearchTerms` 화이트리스트), UTF-8 BOM·LF 보존 |

**검증 게이트 4종 (전부 통과해야 완료)**

```bash
npx tsc --noEmit          # TypeScript 에러 0개
npm run lint              # ESLint 통과
npm run test              # Vitest 통과
npm run regression-check  # 회귀 체크 통과
cd landing && npm run docs:check && npm run build   # 가이드 수정 시
```

---

## 8. C-1 표기 패턴 파서 테스트 케이스 설계

**계약:** `suggestNextLessonValue({ previousLesson, previousUnit, nextUnit }) → string | null`

- 반환값은 **숫자 또는 숫자 범위 문자열만**. `"차시"`·`"교시"` 같은 단위 글자를 절대 붙이지 않는다.
- 읽을 수 없으면 `null`을 돌려주고 호출자는 **아무것도 넣지 않는다**(추측 금지).
- `previousUnit !== nextUnit`이면 항상 `"1"`.

⚠️ **v1.1 — 판정 규칙 3단계 (오너 Q1 결정 반영 + v1.0 내부 모순 해소)**

v1.0의 케이스 표는 규칙이 **서로 어긋나 있었다.** 케이스 13·15는 "마지막 숫자 +1"인데 케이스 10만 "앞머리 숫자 +1"이라 적혀 `"1단원 3차시"` → `"2"`가 기대값이었다. 같은 파서가 두 규칙을 동시에 만족할 수 없다. 오너 결정("숫자가 둘이면 제안하지 않는다")에 맞춰 아래로 통일한다.

| 단계 | 조건                                                                                                          | 처리                                                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `previousUnit !== nextUnit`                                                                                   | `"1"` (단원이 바뀌면 무조건 리셋 — 다른 규칙보다 우선)                                                                                       |
| 2    | 숫자가 **하나**                                                                                               | 그 숫자 +1                                                                                                                                   |
| 3    | 숫자가 여러 개인데 **범위 표기** — 숫자들이 `-`·`~`로만 이어짐(`2-3`, `3~4`, `2-3-1`)                         | 마지막 숫자 +1, 앞부분은 그대로 유지. ⚠️ **v1.2 정정**: v1.1은 예시에 `3차시~4차시`를 넣어 자기 조건을 어겼다(글자가 섞여 있으므로 규칙 4다) |
| 4    | 숫자가 여러 개이고 **서로 다른 층위를 가리킴** — 숫자 사이에 낱말이 낀 경우(`1단원 3차시`, `Unit 2 Lesson 5`) | ⚠️ **`null` — 제안하지 않는다**                                                                                                              |
| 5    | 숫자 없음 / 음수 / 소수 / 빈 값                                                                               | `null`                                                                                                                                       |

**4단계가 오너 결정의 핵심이다.** 어느 숫자가 차시인지 앱이 확신할 수 없는 표기에서는 **조용히 틀린 숫자를 넣느니 빈칸으로 둔다.** 선생님마다 대단원·소단원별로 차시를 세는 방식이 달라 앱이 층위를 판별할 근거가 없다.

| #   | previousLesson               | unit 변화 | 기대값    | 의도                                                                                                                                                                                                                                               |
| --- | ---------------------------- | --------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `"3차시 - 소설의 구성"`      | 동일      | `"4"`     | 앞머리 숫자 + 뒤 텍스트 버림 (명세 예시)                                                                                                                                                                                                           |
| 2   | `"2-3"`                      | 동일      | `"2-4"`   | 범위 표기 — 끝 숫자만 +1 (명세 예시)                                                                                                                                                                                                               |
| 3   | `"Lesson 5"`                 | 동일      | `"6"`     | 라벨 접두 — 숫자만 반환 (명세 예시)                                                                                                                                                                                                                |
| 4   | `"3차시 - 소설의 구성"`      | **변경**  | `"1"`     | 단원 바뀌면 리셋                                                                                                                                                                                                                                   |
| 5   | `"7"`                        | 동일      | `"8"`     | 숫자만                                                                                                                                                                                                                                             |
| 6   | `"07"`                       | 동일      | `"8"`     | 0 패딩 — 패딩 복원하지 않음(앱이 표기를 정의하지 않으므로 가장 단순한 형태)                                                                                                                                                                        |
| 7   | `""`                         | 동일      | `null`    | 빈 값                                                                                                                                                                                                                                              |
| 8   | `"소설의 구성"`              | 동일      | `null`    | 숫자 없음 → 추측 금지                                                                                                                                                                                                                              |
| 9   | `"중간고사"`                 | 동일      | `null`    | 숫자 없음                                                                                                                                                                                                                                          |
| 10  | `"1단원 3차시"`              | 동일      | `null`    | ✅ **오너 결정(2026-08-19)** — 규칙 4단계. 숫자 사이에 낱말이 껴 층위가 갈리므로 제안하지 않는다. v1.0 기대값 `"2"`는 표 안의 다른 케이스와 규칙이 어긋났다                                                                                        |
| 11  | `"2-3-1"`                    | 동일      | `"2-3-2"` | 다단 범위 — 마지막 숫자만 +1                                                                                                                                                                                                                       |
| 12  | `"3~4"`                      | 동일      | `"3~5"`   | 물결 범위도 같은 규칙                                                                                                                                                                                                                              |
| 13  | `"3차시~4차시"`              | 동일      | `null`    | ✅ **v1.2 정정(구현 중 발견)** — v1.1 기대값 `"5"`는 규칙 3의 처리("마지막 숫자 +1, **앞부분 유지**")를 적용하면 `"3차시~5"`가 나와야 해서 표 안에서 자기모순이었다. 숫자 사이에 낱말('차시')이 껴 있으니 규칙 4가 맞다 — 케이스 10·15와 같은 처리 |
| 14  | `"lesson 5"` / `"LESSON 5"`  | 동일      | `"6"`     | 대소문자 무시                                                                                                                                                                                                                                      |
| 15  | `"Unit 2 Lesson 5"`          | 동일      | `null`    | ✅ **v1.1 변경** — 규칙 4단계. 케이스 10과 같은 모양(숫자 사이 낱말)인데 v1.0은 여기만 `"6"`이라 **자기모순**이었다. 오너 결정에 맞춰 통일                                                                                                         |
| 16  | `"9999"`                     | 동일      | `"10000"` | 상한 없음(선생님 자유)                                                                                                                                                                                                                             |
| 17  | `"-3"`                       | 동일      | `null`    | 음수는 차시가 아님                                                                                                                                                                                                                                 |
| 18  | `"3.5"`                      | 동일      | `null`    | 소수는 판단 보류                                                                                                                                                                                                                                   |
| 19  | `"  4  "`                    | 동일      | `"5"`     | 앞뒤 공백 정리                                                                                                                                                                                                                                     |
| 20  | `"3차시(보충)"`              | 동일      | `"4"`     | 괄호 주석 버림                                                                                                                                                                                                                                     |
| 21  | previousLesson 없음(첫 기록) | —         | `null`    | 이전 기록이 없으면 제안하지 않는다                                                                                                                                                                                                                 |
| 22  | `"복습"`                     | 변경      | `"1"`     | 단원 변경이 패턴 실패보다 우선                                                                                                                                                                                                                     |

**금지 확인 테스트 (메타 성격)**

- 케이스 1~22 전체에서 반환값에 `"차시"`·`"교시"`·`"강"` 문자열이 **한 번도 포함되지 않는다**(전량 정규식 assert).
- 반환값이 `previousLesson`의 설명 텍스트("소설의 구성" 등)를 **포함하지 않는다**.

---

## 9. 수용 기준 (테스트 가능)

### A. 차시 계산 + 근거 표시·수정

| #     | 기준                                                                                                                                    | 검증 방법                                                                                                                                                                                                |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A-a1  | 학기 시작일·종료일·시간표·공휴일이 주어지면 총 차시가 결정론적으로 나온다                                                               | `estimateLessonCount` 단위 테스트(고정 입력 → 고정 출력)                                                                                                                                                 |
| A-a2  | 주 2회(월·목) 수업 + 100일 학기 + 공휴일 3일(월요일 2·목요일 1) → **교시 수 합계** = 원래 합계 − (그 3일의 교시 수)                     | 단위 테스트. ⚠️ v1.1 정정: "총 차시 = 원래 개수 − 3"은 하루 1교시를 전제한 문구였다                                                                                                                      |
| A-a3  | 화면의 모든 총 차시 숫자 옆에 "예상"이 붙는다                                                                                           | 렌더 테스트 — 요약 영역 텍스트에 `예상` 포함 assert                                                                                                                                                      |
| A-a4  | 제외한 날 목록에 날짜·사유·근거 행사명이 모두 나온다                                                                                    | 렌더 테스트                                                                                                                                                                                              |
| A-a5  | "이 날은 수업했어요"를 누르면 **그날 시간표가 주는 교시 수만큼** 총 차시가 늘고 저장된다(연강이면 2 증가)                               | 스토어 통합 테스트. ⚠️ v1.1 정정(blocking #3): "정확히 1 증가"는 2교시 연강일 때 틀린다 — §6-5                                                                                                           |
| A-a5b | 시간표상 **0교시인 날**은 "수업했어요" 버튼이 **비활성화**되고 사유 안내가 뜬다                                                         | 렌더 테스트. 되살릴 교시가 없어 눌러도 아무 변화가 없으면 사용자는 버튼 고장으로 읽는다                                                                                                                  |
| A-a6  | 그 수정 후 진도를 1건 추가해도 수정 내용이 남아 있다                                                                                    | Step 1 보존 테스트 + 통합 테스트                                                                                                                                                                         |
| A-a7  | 보관된 반은 계산·요약 대상에서 나오지 않는다                                                                                            | `filterActiveClasses` 경유 단위 테스트                                                                                                                                                                   |
| A-a8  | 학기 종료일이 없으면 총 차시를 **표시하지 않고** 종료일을 묻는 안내가 뜬다                                                              | 렌더 테스트                                                                                                                                                                                              |
| A-a9  | 미래 날짜에 변동 시간표가 없으면 기본 시간표로 계산하고, 그 사실이 "예상" 표기로 드러난다                                               | 단위 테스트 + 렌더 테스트                                                                                                                                                                                |
| A-a10 | ⚠️ **v1.1 blocking #5** — 학기 전체 매칭 교시가 **0이면 숫자를 표시하지 않고** "시간표를 먼저 등록해 주세요" 안내를 띄운다              | 단위 + 렌더 테스트. 교사 시간표 미등록 사용자(나이스 시간표 미등록 학교·비담임 교과교사)는 `getMatchingPeriods`가 전 구간 0을 돌려줘 **"예상 0차시"** 가 뜬다 — 첫 화면이 0차시인 기능은 고장으로 읽힌다 |
| A-a11 | ⚠️ **v1.1 blocking #7** — 수업일 목록을 펼칠 수 있고, `matchStage` 2·3(교실명만 일치·담임반 폴백)으로 걸린 날이 **시각적으로 구분**된다 | 렌더 테스트 + `buildLessonDayIndex` 단위 테스트(§6-6)                                                                                                                                                    |
| A-a12 | ⚠️ **v1.1 blocking #2** — 반을 삭제하면 그 반의 수정 목록(`lessonDayAdjustments`)도 함께 사라진다                                       | 스토어 통합 테스트(§7 Step 4)                                                                                                                                                                            |
| A-a13 | ⚠️ **v1.1 blocking #4** — 방학식·종업식 날짜는 자동 제외되지 않는다                                                                     | `lessonDayExclusion` 단위 테스트(§6-1)                                                                                                                                                                   |

### B. 학기 종료일

| #    | 기준                                                                                                                 | 검증 방법                                                                                      |
| ---- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| B-b1 | 학사일정에 "겨울방학식"이 있으면 그 전날 또는 당일이 후보로 나온다                                                   | `termEndFromSchedule` 단위 테스트                                                              |
| B-b2 | "방학·개학 안내"처럼 모호한 항목은 후보에서 버린다                                                                   | 단위 테스트                                                                                    |
| B-b3 | 사용자가 확인하기 전에는 `termEndDates`에 아무것도 저장되지 않는다                                                   | 스토어 테스트                                                                                  |
| B-b4 | "나중에"를 누르면 같은 학기에 다시 묻지 않는다                                                                       | `decideTermEndPrompt` 단위 테스트                                                              |
| B-b5 | 후보가 없으면 직접 입력 칸이 나온다                                                                                  | 렌더 테스트                                                                                    |
| B-b6 | 첫 실행(온보딩) 중에는 종료일 팝업이 뜨지 않는다                                                                     | 렌더 테스트 (`isFirstRun=true`)                                                                |
| B-b7 | 팝업이 모달 코디네이터에 등록돼 다른 모달과 겹치지 않는다                                                            | `regression-check` grep + 레지스트리 테스트                                                    |
| B-b8 | ⚠️ **v1.1 blocking #1** — 개학일 팝업과 종료일 팝업이 **동시에 뜨지 않는다**(둘 다 조건이 참인 상태에서 하나만 표시) | 렌더 테스트. `termStartDates`·`termEndDates`가 **둘 다 빈** 8월 신규 사용자 상태를 시드로 쓴다 |
| B-b9 | `ModalRegistry.test.ts`의 `expectedPriorities` 배열에 새 값 2개가 **추가돼 있다**                                    | 메타 검증 — 현재 `toContain` 방식이라 배열에 없으면 아무것도 검증하지 않는다(§11-18)           |

### C. 진도 입력 활용

| #     | 기준                                                               | 검증 방법                         |
| ----- | ------------------------------------------------------------------ | --------------------------------- |
| C-c1  | §8 케이스 22건 전량 통과                                           | `lessonNumberPattern.test.ts`     |
| C-c2  | 제안값에 "차시"라는 글자가 절대 들어가지 않는다                    | 전량 정규식 assert                |
| C-c3  | 앱이 센 누적 차시가 입력칸(`formLesson`)에 들어가지 않는다         | 렌더 테스트 — 입력칸 value assert |
| C-c4  | 누적 차시는 참고 표시 영역에만 나온다("이번 학기 13번째 수업")     | 렌더 테스트                       |
| C-c5  | 일괄 생성은 미리보기 확인 전에 항목을 만들지 않는다                | 스토어 호출 카운트 assert         |
| C-c6  | 이미 항목이 있는 (날짜, 교시)는 건너뛰고 건너뛴 수를 보고한다      | 단위 테스트                       |
| C-c7  | "되돌리기"를 누르면 방금 만든 항목만 정확히 사라진다               | 통합 테스트                       |
| C-c8  | 60건 초과 시 생성하지 않고 안내한다                                | 단위 테스트                       |
| C-c9  | "다음 수업일로"가 공휴일·방학·수업 없는 요일을 건너뛴다            | `findNextLessonDate` 단위 테스트  |
| C-c10 | 60일 안에 수업일이 없으면 이동하지 않고 안내한다                   | 단위 테스트                       |
| C-c11 | **기존 진도율 값이 이 작업 전후로 동일하다**                       | 기존 `stats` 회귀 테스트          |
| C-c12 | 학기 기준 진도율과 입력 기준 진도율이 서로 다른 라벨로 함께 보인다 | 렌더 테스트                       |

### 전역

| #   | 기준                                                   |
| --- | ------------------------------------------------------ |
| G-1 | `npx tsc --noEmit` 에러 0개                            |
| G-2 | `npm run lint` 통과                                    |
| G-3 | `npm run test` 통과                                    |
| G-4 | `npm run regression-check` 통과                        |
| G-5 | 새 도메인 파일에 `@domain/*` 외 import 0건 (grep 검증) |
| G-6 | 새 코드에 `any` 0건, 하드코딩 HEX 0건                  |
| G-7 | 새 UI 텍스트 전부 한국어                               |

---

## 10. ADR 초안 (`DECISIONS.md`에 추가 예정 — 번호는 커밋 시점에 확정, 현재 최신은 ADR-056)

### 결정 (Decision)

학기 총 수업 차시를 **순수 도메인 함수로 그때그때 계산**하고 결과를 저장하지 않는다. 저장하는 것은 사용자가 준 사실 두 가지뿐이다 — 학기 종료일(`settings.termEndDates`)과 수업일 수정(`curriculum-progress.lessonDayAdjustments`). 자동 제외는 공휴일·방학·시험까지만 하고 행사·학년 부분 해당은 제외하지 않는다.

### 드라이버 (Drivers)

1. 앱이 학사 구간을 단정하지 않는다(ADR-037 계승).
2. 진도 저장 경로가 파일 통째 교체라 새 필드가 조용히 소실될 수 있다.
3. 학기 100일 × 반 10개 계산 비용.

### 검토한 대안 (Alternatives considered)

- 계산 위치: 순수 도메인 함수(채택) / 스토어 파생 selector / 캐시 엔티티 파일 저장
- 수정 저장: `curriculum-progress` 형제 필드(채택) / `settings` / 새 동기화 도메인 / `status:'skipped'` 재활용
- 학기 종료일: `settings.termEndDates`(채택) / 전용 엔티티 / `termRanges` 통합 스키마 / 저장 없이 매번 파생

### 채택 이유 (Why chosen)

- 계산 결과를 저장하면 무효화 지점(시간표·변동·학사일정·종료일·수정)이 다섯 개로 늘고, 동기화되면 기기별 시간표 차이로 "예상"이 흔들린다. 저장 대상은 사실뿐이어야 한다.
- `curriculum-progress`는 이미 동기화에 등록돼 있고 반 삭제 시 함께 정리되는 수명 관리 경로가 있다. `settings`는 통파일 충돌 전례가 있고 반 삭제 시 남는다.
- 자동 제외를 좁게 잡아 **과대 추정**을 택했다. 과소 추정(앱이 조용히 뺀 날)은 사용자가 발견할 방법이 없다.

### 결과 (Consequences)

- **비용**: `ManageCurriculumProgress` 4개 메서드를 고쳐야 하며 이는 옆핀·모바일 등 모든 진도 저장 경로에 영향을 준다(별도 커밋으로 분리·되돌리기 가능하게).
- **제약**: 학기 종료일을 확인받기 전에는 총 차시를 표시하지 않는다.
- **제약**: 학년별 행사 필터가 없어, 학년 일부만 해당하는 행사는 자동으로 빠지지 않는다.
- **이득**: 모바일을 1차에서 빼도 데이터가 안전하다(Step 1 덕분).
- **제약(v1.1 추가)**: 학년도 전환 시 `ExecuteYearTransition.ts:132`가 진도를 `{entries: []}`로 리셋하므로 수정 목록도 함께 사라진다. 의도된 동작이다.
- **제약(v1.1 추가)**: 시험기간을 자동 제외하지 않으므로, 시험기간에 수업을 안 하는 학교는 그 날들을 손으로 빼야 한다(목록에서 연속 선택으로 한 번에 뺄 수 있게 한다).
- **비용(v1.1 추가)**: 기존 `TermStartPromptModal`을 모달 큐에 등록하는 작업이 이 범위에 포함된다 — 이 계획이 만든 문제는 아니지만, 새 팝업을 안전하게 붙이려면 선행이 불가피하다.

### 후속 (Follow-ups)

1. 모바일 진도 화면 반영(2차).
2. `TeachingClass.grade?` 명시 필드 추가 후 학년 필터 도입(2차).
3. `TermStartPromptModal`도 모달 코디네이터에 등록(8월 focus trap 사고의 잔여 구조적 원인).
4. 시험기간 전용 시간표 지원.

---

## 11. 함정 목록 (구현 세션이 반드시 읽을 것)

| #     | 함정                                                                                                                      | 대응                                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 11-1  | **진도 저장이 형제 필드를 지운다** — `{ entries }`만 새로 만들어 통째 저장(**4개 지점**, v1.1 정정)                       | Step 1 선결 수정. 그물이 실제로 빨간불 나는지 실증. AI 브릿지(`electron/ai-bridge/index.mjs:25635`)는 이미 루트 보존이라 대상 아님 |
| 11-2  | **미래 날짜엔 변동 시간표가 없다**                                                                                        | 미래는 기본 시간표 기준 "예상"임을 계산 결과에 명시적 플래그로 담고 UI에 드러낸다                                                  |
| 11-3  | **시험기간은 시간표를 따로 운영**한다                                                                                     | 자동 제외하되 "확인 필요"로 강조. 되돌리기 한 번에                                                                                 |
| 11-4  | **체육대회·수학여행은 `subtractDayType`이 '공휴일'이 아니다**                                                             | 자동 제외하지 않는다. 목록에만 올린다                                                                                              |
| 11-5  | **`TeachingClass`에 `grade`가 없다**                                                                                      | 학년 필터 1차 제외(§6-2)                                                                                                           |
| 11-6  | **전역 팝업은 `{!isFirstRun && ...}` 안에 + 모달 큐 등록**                                                                | Step 3. 8월 온보딩 focus trap 재발 방지                                                                                            |
| 11-7  | **`getEffectiveTeacherSchedule`은 매 호출 overrides 전체 스캔**                                                           | §5 P1·P2                                                                                                                           |
| 11-8  | **진도 1건 추가에 학기 전체가 재계산되면 안 된다**                                                                        | §5-4 의존성 분리 + 재계산 횟수 테스트                                                                                              |
| 11-9  | **electron 파일을 건드리면 게이트가 안 잡는다**                                                                           | 이번 범위에 electron 변경 없음. 생기면 `npx tsc -p tsconfig.electron.json --noEmit` 별도 실행                                      |
| 11-10 | **`sp-*` 토큰에 Tailwind 투명도 수식(`/50`) 금지**                                                                        | opacity 유틸로 대체                                                                                                                |
| 11-11 | **다중 세션 git 인덱스 공유** — `git add` 후 방치 금지                                                                    | `git commit -m "..." -- <명시 path>`                                                                                               |
| 11-12 | **윈도우 python 파일 쓰기가 LF→CRLF로 바꿔 diff를 부풀린다**                                                              | 계획서·문서 수정은 sed 우선, 파이썬은 바이너리 모드                                                                                |
| 11-13 | **`/docs` 문단 통째 교체 금지** (`requiredSearchTerms` 화이트리스트) + UTF-8 BOM·LF 보존                                  | Step 6                                                                                                                             |
| 11-14 | **jsdom으로 못 잡는 항목이 있다** — 팝업 겹침, 실제 포커스 이동                                                           | 실기기 확인 항목으로 분리 기록                                                                                                     |
| 11-15 | **`ENTITY_FIELD_CONTRACT`** — 현재 `ProgressEntry`는 미등록이라 영향 없지만, 등록 상태가 바뀌었을 수 있다                 | Step 6에서 `npm run test` 결과로 재확인                                                                                            |
| 11-16 | ⚠️ **모달 코디네이터는 참가자끼리만 직렬화한다** — 새 팝업만 등록하면 미등록 팝업과 그대로 겹친다                         | Step 3에서 `TermStartPromptModal`도 함께 등록(blocking #1)                                                                         |
| 11-17 | ⚠️ **반 삭제가 `entries`만 걸러낸다**(`useTeachingClassStore.ts:396-398`)                                                 | Step 4에서 adjustments 정리 추가(blocking #2)                                                                                      |
| 11-18 | ⚠️ **`ModalRegistry.test.ts:97`의 `expectedPriorities`가 `toContain` 방식**이라 배열에 없으면 아무것도 검증하지 않는다    | 새 우선순위 2개를 배열에 **추가**해야 검사 대상이 된다. `scripts/regression-grep-check.mjs`에도 #12~#17 형식으로 항목 추가         |
| 11-19 | ⚠️ **`ExecuteYearTransition.ts:132`가 학년도 전환 시 `{entries: []}`로 리셋**해 adjustments도 함께 사라진다               | 의도된 동작이나 기록이 없으면 나중에 버그로 신고된다 — §10 결과에 명시                                                             |
| 11-20 | ⚠️ **`getMatchingPeriods` 2단계는 교실명 양방향 부분 문자열 매칭** — `"3-1"`이 `"3-10"`에, `"화학"`이 `"화학실"`에 걸린다 | 함수는 고치지 않되 `matchStage`를 노출해 사용자가 볼 수 있게 한다(§6-6)                                                            |

---

## 12. 열린 질문 (승인 전/구현 중 결정 필요)

⚠️ **v1.1 분류** — 오너가 승인 전에 답해야 하는 것은 **Q1·Q3 두 개뿐**이고, 나머지는 구현 중 결정해도 된다.

| 질문                         | 분류                    | 답을 안 주면 이렇게 감                                 |
| ---------------------------- | ----------------------- | ------------------------------------------------------ |
| Q1 `"1단원 3차시"` 표기 처리 | ✅ **확정(2026-08-19)** | (c) **제안하지 않음(`null`)** — §8 규칙 4단계로 명문화 |
| Q2 팝업 시점                 | 구현 중 가능            | 진도 관리 탭 첫 진입 시에만                            |
| Q3 시험기간 자동 제외 여부   | ✅ **확정(2026-08-19)** | **제외 안 함 + 표시만** — v1.1 변경안 그대로 승인      |
| Q4 일괄 생성 상한 60건       | 구현 중 가능            | 60건 유지                                              |
| Q5 되돌리기 범위             | 구현 중 가능            | 세션 내로 한정                                         |

- ~~**Q1.**~~ ✅ **결정 완료(2026-08-19) — (c) 제안하지 않는다.** 숫자가 여러 개이고 그 사이에 낱말이 껴 층위가 갈리는 표기(`"1단원 3차시"`, `"Unit 2 Lesson 5"`)는 `null`을 돌려주고 입력칸을 비워 둔다. §8에 판정 규칙 4단계로 명문화했다. **부수 효과**: v1.0 케이스 15(`"Unit 2 Lesson 5"` → `"6"`)가 케이스 10과 규칙이 어긋나 있었는데, 이 결정으로 둘 다 `null`이 되어 **표 내부의 자기모순이 함께 해소됐다.**
- **Q2.** 학기 종료일 확인 팝업을 **진도 관리 탭 첫 진입 시**에만 띄우는 것으로 잡았다(§6-4). 앱 시작 시에도 물을지 여부. 잔소리 위험 vs 발견 가능성 트레이드오프.
- ~~**Q3.**~~ ✅ **결정 완료(2026-08-19) — 제외하지 않고 표시만 한다.** v1.1이 뒤집은 안(§6-1) 그대로 확정. 근거: 나이스 분류 정규식 `/시험|평가|고사/`가 "수행평가 주간"·"진단평가"처럼 **정상 수업일**에 붙는 이름까지 잡아 조용히 일주일치를 뺄 수 있다. 뺀 날은 선생님이 알아챌 방법이 없다.
- **Q4.** C-2 일괄 생성 상한 60건이 적절한가. 주 4회 × 15주 = 60이라 한 학기 한 반을 겨우 덮는 수치다.
- **Q5.** "되돌리기"를 세션 내(화면을 벗어나면 사라짐)로 한정했다. 앱을 껐다 켠 뒤에도 되돌리려면 엔티티에 배치 표시가 필요한데, 그건 스키마 오염이다. 세션 내로 충분한가.

---

## 13. 검토자에게 (v1.0 시점 질문 — 아래 §14에 답이 있다)

특히 다음 세 가지를 집중적으로 봐 주기 바란다.

1. **§1-3 축 (b)의 B2 채택이 옳은가.** Step 1(형제 필드 보존 수정)이 기존 진도 저장 경로 전체를 건드린다는 비용을 감안하면, 표면이 더 넓지만 기존 경로를 안 건드리는 B3가 오히려 안전할 수도 있다.
2. **§6-1 자동 제외 경계.** "과대 추정이 낫다"는 판단이 실제 교사 사용 맥락에서도 맞는가.
3. **§5 성능 전략이 실제로 성립하는가.** 특히 P2(override 없는 날짜는 요일별 결과 재사용)가 `mergeOverridesIntoTeacherSchedule`의 반환 동일성 전제 위에 서 있는데, 그 함수가 override 0건일 때 base를 그대로 돌려주는지 구현 시 재확인이 필요하다.

---

## 14. v1.1 개정 이력 — Architect 검토 반영

Architect가 계획서가 인용한 코드 사실을 **직접 파일을 열어 검증**했다. 판정은 **조건부 승인**이었고, 차단 5건 + "고치면 좋은 것" 10건을 냈다. 그중 2건을 차단으로 **승격**해 총 7건을 반영했다.

### 14-1. 코드 사실 검증 결과 (계획의 토대 3건)

| 검증 대상                                    | 결과                                                                                                                                                           |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4-6 진도 저장이 형제 필드를 지운다           | ✅ **사실.** `ManageCurriculumProgress.ts`의 `add`(22) `update`(34) `delete`(46) `saveAll`(64) 모두 `{ entries }` 신규 생성. 읽기(9행)도 `data?.entries ?? []` |
| 4-2 / §5 P2 override 0건 시 base 동일 반환   | ✅ **사실, 참조 동일성까지.** `timetableRules.ts:119`가 `applicable.length === 0`이면 `base`를 그대로 반환. v1.0의 자기 불확실성 표시 해소                     |
| 4-11 `TermStartPromptModal`이 모달 큐 미등록 | ✅ **사실. 다만 v1.0의 대책은 사고를 못 막았다** — 코디네이터는 참가자끼리만 직렬화하므로 새 팝업만 등록하면 그대로 겹친다                                     |

### 14-2. 반영한 차단 사항 7건

| #   | 내용                                                                                           | 반영 위치                   |
| --- | ---------------------------------------------------------------------------------------------- | --------------------------- |
| 1   | 기존 개학일 팝업(`TermStartPromptModal`)도 **함께** 모달 큐에 등록 — 후속이 아니라 Step 3 선결 | §7 Step 3, §9 B-b8, §11-16  |
| 2   | 반 삭제·보관 시 `lessonDayAdjustments` 정리 — 없으면 B2 채택 근거가 무너짐                     | §7 Step 4, §9 A-a12, §11-17 |
| 3   | `hasLesson`을 "교시 수 되살리기"로 재정의 + 0교시 날 버튼 비활성화                             | §6-5, §9 A-a5·A-a5b         |
| 4   | 방학식·종업식을 방학 자동 제외에서 제외(자기 모순 해소)                                        | §6-1, §9 A-a13              |
| 5   | 시간표 미등록 시 "예상 0차시" 대신 안내 표시                                                   | §9 A-a10                    |
| 6   | **승격** — 계산 로직(P1~P3)을 `buildLessonDayIndex` 도메인 순수 함수로 내림                    | §5-6                        |
| 7   | **승격** — "넣은 날" 목록과 `matchStage` 노출                                                  | §6-6, §9 A-a11              |

**6·7을 승격한 이유:** Architect는 둘 다 "고치면 좋은 것"에 뒀으나, 6이 없으면 §5-5의 성능 기준과 계산 정확도를 **테스트로 잡을 수 없고**, 7이 없으면 원칙 §1-1.2("근거가 화면에 남아 있어야 한다")를 **제외일에만 적용하고 포함일에는 적용하지 않는** 원칙 위반이 남는다. 둘 다 계획의 자기 정합성 문제라 차단이 맞다.

### 14-3. 사실이 아니어서 바로잡은 서술 4건

v1.0이 **결론은 맞았지만 근거가 코드와 달랐던** 부분이다. 근거가 틀린 채 결론만 맞으면 다음 세션이 그 근거를 믿고 다른 결정을 내리므로 전부 정정했다.

| 잘못된 서술                                        | 사실                                      | 정정 위치             |
| -------------------------------------------------- | ----------------------------------------- | --------------------- |
| "반 삭제 시 진도와 함께 정리되는 경로가 이미 있다" | 거짓 — `entries`만 걸러냄                 | §1-3 축(b), §7 Step 4 |
| "항목 단위라 충돌 폭이 좁다"                       | 거짓 — `curriculum-progress`는 통파일 LWW | §1-3 축(b), §6-5      |
| `updatedAt`이 "동기화 병합 시 최신 우선 판정용"    | 현재 읽는 코드 없음(장식)                 | §6-5                  |
| 형제 필드 소실 "5개 지점"                          | 4개                                       | §7 Step 1, §11-1      |

### 14-4. 새로 확인된 좋은 소식 1건

`electron/ai-bridge/index.mjs:25635` `appendProgressDirect`는 **이미 `{ ...root, entries }`로 루트를 보존**한다. AI 브릿지는 Step 1 없이도 안전하며, `npm run lint`·`tsc`가 `src/**`만 본다는 electron 사각지대 걱정이 이 경로에는 없다.

### 14-5. Architect의 가장 강한 반론과 처리

> "이 계획은 시간표를 정본으로 삼는데, 이 앱의 시간표는 정본이 될 수 없다."

`getMatchingPeriods`의 2단계 부분 문자열 매칭이 100일치 무인 반복 적용되면 오차가 축적되는데, 계획은 **뺀 날만 보여 주고 넣은 날은 안 보여 준다**는 지적이다.

**처리: 기능을 접지 않고 §6-6(넣은 날 + `matchStage` 노출)으로 흡수한다.** 근거는 두 가지다. ①이 기능이 대체하려는 현상 유지는 "선생님이 손으로 세기"이고, 근거가 열려 있는 추정치는 그보다 낫다. ②반론의 핵심은 "숫자가 틀린다"가 아니라 **"틀린 걸 사용자가 알 수 없다"**이므로, 알 수 있게 만들면 반론이 해소된다. `getMatchingPeriods` 자체는 이 계획에서 고치지 않는다 — 범위 밖이고 기존 화면 3곳이 영향을 받는다.

### 14-6. 오너 결정 반영 (2026-08-19)

| 질문                    | 결정                          | 반영                                              |
| ----------------------- | ----------------------------- | ------------------------------------------------- |
| Q1 `"1단원 3차시"` 표기 | **제안하지 않는다(`null`)**   | §8 판정 규칙 4단계 신설, 케이스 10·15 기대값 변경 |
| Q3 시험기간             | **자동 제외하지 않고 표시만** | §6-1 확정                                         |

**Q1 반영 중 추가로 발견한 결함:** v1.0 §8의 케이스 표가 **두 규칙을 동시에 주장**하고 있었다 — 케이스 13·15는 "마지막 숫자 +1", 케이스 10만 "앞머리 숫자 +1"이라 같은 파서로 둘 다 만족시킬 수 없었다. 구현 단계에서야 드러났을 모순이고, 그때는 어느 쪽이 의도인지 판단할 근거가 없었을 것이다. 오너 결정에 맞춰 **판정 규칙 5단계를 명문화**해 해소했다.

### 14-7. v1.2 — 구현 후 검증에서 반영한 것 (2026-08-20)

Step 1·2 구현 뒤 Architect 검증(**APPROVED**, 치명·높음 0건)에서 나온 지적을 반영했다.

| 지적                                                                                                                   | 처리                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `noTimetable`이 서로 다른 4가지 원인을 뭉갠다 — 보관된 반을 열었을 뿐인데 "시간표를 먼저 등록해 주세요"가 뜬다         | ✅ `buildLessonDayIndexResult`가 사유(`archivedClass`·`invalidTerm`·`classNotFound`)를 함께 돌려주고 `LessonCountStatus`를 5종으로 분리 |
| `…식` 판정이 `endsWith`라 `'여름방학식(1~2학년)'`에서 뚫린다 → 자동 제외되면서 동시에 종료일 후보가 되는 자기모순 부활 | ✅ 포함 판정으로 교체 + 접미 변형 테스트 추가                                                                                           |
| §8 케이스 13이 코드와 다름                                                                                             | ✅ 위 표 정정                                                                                                                           |
| 커밋 메시지 사실 오류 2건 — "학년도 전환이 `saveAll`을 쓴다"(실제로는 저장소에 직접 씀), "테스트 105건"(실제 128건)    | ✅ 테스트 주석 정정. 커밋 이력은 그대로 두고 여기에 기록                                                                                |

**검증에서 사실로 확인된 것**: 그물 실증(수정 전 5건 빨간불)을 검증자가 직접 재현 · 게이트 수치 전부 정확 · `progressMatching` 리팩터링 동작 불변(조기 return 등가) · P2 캐시 전제 참 · 테스트 4건 뮤테이션 검사에서 전부 falsifiable.

### 14-8. ⚠️ Step 3 착수 전에 정해야 할 것 (미해결)

**`hasLesson` 정정이 시간표에 없는 날에는 아무 일도 하지 않는다.**

`estimateLessonCount`는 시간표가 수업을 주는 날(색인 키)만 훑는다. 그래서 **보강처럼 시간표에 없는 날**에 "수업했어요"를 표시해도 결과가 전혀 바뀌지 않는다. 같은 뿌리에서 §9 A-a5b("시간표상 0교시인 날은 버튼 비활성화 + 사유 안내")도 **원리적으로 도달 불가능**하다 — `excludedDays`에 담기는 날은 전부 교시가 1개 이상이라 `userOverridable`이 항상 참이다.

**지금 사용자 피해는 0이다**(화면이 없다). 그러나 문서가 구현보다 넓게 약속하고 있으므로 Step 3 전에 둘 중 하나를 골라야 한다.

- **(a) 범위를 좁힌다(권장)** — `hasLesson`은 "자동 제외를 되돌리는 것"만으로 정의하고, 엔티티 주석에서 '보강'을 빼고 A-a5b를 내린다. 보강은 **시간표 변동으로 등록하는 것이 이미 있는 정상 경로**이며, 그렇게 하면 색인에 자동으로 들어온다.
- **(b) 통로를 만든다** — 색인 밖 날짜도 합류시키고 교시 수를 사용자가 입력하게 한다. 그러나 이는 시간표와 별개의 두 번째 정본을 만드는 셈이라 §1-1.3과 긴장한다.

**오너 결정 필요.**

### 14-9. 반영하지 않은 것

- **`getMatchingPeriods` 매칭 품질 개선** — 범위 밖. 기존 진도 입력·진도 캘린더·오늘 진도 위젯이 전부 영향을 받는다. 후속 후보로 §10에 남긴다.
- **Critic 단계** — 오너 판단으로 생략했다. Critic이 강제하는 항목(원칙-옵션 일관성, 대안의 공정성, 수용 기준의 테스트 가능성)은 위 7건 반영으로 상당 부분 해소됐으나, **독립 검토를 받지 않은 계획이라는 점을 명시해 둔다.**
