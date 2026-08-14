# 교시 이름 바꾸기 (period label rename) — 계획서 v0.1

- 작성일: 2026-08-13
- 상태: 계획 (구현 착수 전)
- 발단: 고객지원 챗봇 문의 "교시 이름을 어떻게 바꿔?" → 챗봇이 "지원하지 않는 기능일 가능성이 높다"고 답변

---

## 1. 결론 요약

**교시에 이름을 붙이는 기능은 현재 코드에 존재하지 않는다.** 챗봇 답변은 정확했다.

근거:

| 확인 항목                    | 결과                                            | 근거                                                          |
| ---------------------------- | ----------------------------------------------- | ------------------------------------------------------------- |
| 교시 데이터 구조에 이름 필드 | **없음** — `period`(번호), `start`, `end` 3개뿐 | `src/domain/valueObjects/PeriodTime.ts:1-5`                   |
| 설정 화면에서 편집 가능한 값 | 시작·종료 **시각만**                            | `src/adapters/components/Settings/tabs/PeriodTab.tsx:700-720` |
| 모바일 편집기                | 시작·종료 **시각만**                            | `src/mobile/components/Settings/PeriodTimesEditor.tsx:80`     |
| 화면에 뜨는 "N교시" 문자열   | 코드 **약 50곳에 하드코딩**                     | 아래 §2.2                                                     |

즉, "1교시"라는 글자는 **저장된 값이 아니라 화면을 그릴 때마다 번호 뒤에 '교시'를 붙여 만들어내는 문자열**이다. 그래서 이름을 바꿀 자리가 아예 없다.

---

## 2. 현재 구조 (근거 기반)

### 2.1 데이터

```ts
// src/domain/valueObjects/PeriodTime.ts
export interface PeriodTime {
  readonly period: number;
  readonly start: string; // "HH:mm"
  readonly end: string; // "HH:mm"
}
```

이 배열이 `Settings.periodTimes`에 들어간다 (`src/domain/entities/Settings.ts:500`).
기본값은 데스크톱·모바일이 **각각 따로** 들고 있다 (`src/adapters/stores/useSettingsStore.ts:56`, `src/mobile/stores/useMobileSettingsStore.ts:6`).

### 2.2 "N교시" 글자를 만들어내는 곳 — 흩어져 있음

부분적으로 모아둔 함수가 **3개 있는데 서로 다르고, 대부분의 화면은 이 셋 중 어느 것도 쓰지 않는다.**

| 함수                                      | 위치                                                     | 쓰는 곳           | 특이사항                         |
| ----------------------------------------- | -------------------------------------------------------- | ----------------- | -------------------------------- |
| `formatPeriodLabel(period)`               | `src/domain/entities/Attendance.ts:119`                  | 출결 관련 10여 곳 | `0`→"조회", `9`→"종례" 특례 있음 |
| `formatPeriodShort(period)`               | `src/domain/entities/Attendance.ts:126`                  | 좁은 칸           | "1" / "조회" / "종례"            |
| `periodToLabel(period, periodEnd?)`       | `src/adapters/presenters/periodPresenter.ts:2`           | 일정(Schedule)    | "방과후"/"종일"/"3~4교시" 특례   |
| `formatPeriodLabel(period)` **중복 정의** | `src/adapters/presentation/mixedRecordExcelMapper.ts:65` | 엑셀 내보내기     | 위 도메인 함수와 별개 사본       |

그 외에는 전부 **컴포넌트 안에서 직접 문자열을 만든다.** 대표 사례(전수는 §6 부록):

```
src/adapters/components/Timetable/TimetablePage.tsx:1584      {periodTime.period}교시
src/adapters/components/Timetable/TimetableEditor.tsx:849     {periodTime.period}교시
src/adapters/components/Dashboard/DashboardTimetable.tsx:266  {period}교시
src/adapters/components/Settings/tabs/PeriodTab.tsx:700       {index + 1}교시
src/adapters/components/Progress/ProgressCalendarGrid.tsx:108 {period}교시
src/mobile/components/Today/CurrentClassCard.tsx:202          `${currentPeriod}교시`
src/mobile/pages/AttendanceCheckPage.tsx:603                  {selectedPeriod}교시
src/infrastructure/export/ExcelExporter.ts:99,141             `${p + 1}교시`
src/infrastructure/export/HwpxExporter.ts:327,377             `${p + 1}교시`
src/adapters/components/Icon/pinPresence.ts                   (아이콘/위젯 표시)
```

집계: 템플릿 문자열 방식 19개 파일, JSX 직접 삽입 방식 25개 파일 안팎, **총 50곳 이상**.

> ⚠️ `PeriodTab.tsx:700`은 `pt.period`가 아니라 `index + 1`을 쓴다(같은 파일 373줄은 `pt.period`). 이름 기능을 붙일 때 이 불일치를 먼저 정리해야 한다.

### 2.3 이름을 지워버릴 수 있는 경로 (가장 중요한 함정)

교시 배열을 **통째로 갈아끼우는** 코드가 여러 개 있다. 이름 필드를 추가만 하고 이 경로들을 손보지 않으면, 선생님이 붙인 이름이 조용히 사라진다.

| 경로                      | 위치                                                                  | 동작                                     |
| ------------------------- | --------------------------------------------------------------------- | ---------------------------------------- |
| 컴시간 교시 시각 불러오기 | `src/domain/rules/comciganRules.ts:439-452` → `TimetablePage.tsx:753` | `periodTimes` 배열 **전체 교체**         |
| 프리셋 자동 생성          | `src/domain/rules/periodRules.ts:136` `generatePeriodTimes()`         | 새 배열 생성 (이름 개념 없음)            |
| 설정 → 자동 생성 버튼     | `PeriodTab.tsx:175`                                                   | 위 함수 결과로 교체                      |
| 학년도 마법사 3단계       | `SchoolYearWizard/Step3Profile.tsx:60,70`                             | 위 함수 결과로 교체                      |
| 온보딩                    | `Onboarding.tsx:55,259,311,783`                                       | 위 함수 결과로 교체                      |
| 시간표 편집기 저장        | `TimetableEditor.tsx:537`                                             | `slice(0, maxPeriods)` 후 저장           |
| 교시 삭제 후 재번호       | `PeriodTab.tsx:72`                                                    | 번호를 다시 매김 → 이름-번호 대응 어긋남 |

반면 압핀·NEIS 교사 시간표 불러오기는 교시 **시각을 건드리지 않는다**(`TimetablePage.tsx:1358,1371` 주석 "교시시각·지문 없음") → 영향 없음.

### 2.4 저장·동기화

`Settings`는 파일 단위로 통째 동기화된다. `periodTimes`에 필드를 하나 더해도 병합 로직 추가는 불필요하지만, 모바일 스토어가 별도 타입(`useMobileSettingsStore.ts:20`)을 갖고 있어 **양쪽 타입을 함께 고쳐야 한다.**

### 2.5 이미 있는 "이름 붙은 교시" 선례

출결에는 번호가 아닌 이름으로 도는 칸이 이미 있다:

```ts
// src/domain/entities/Attendance.ts:113-116
export const PERIOD_MORNING = 0; // "조회"
export const PERIOD_CLOSING = 9; // "종례"
```

단, 이 둘은 `periodTimes` 배열에 **들어있지 않고** 출결 화면에서만 쓰는 가상 칸이다. 이번 기능과는 별개 축이므로 v1 범위에서 제외한다(§5 참조).

---

## 3. 무엇을 만들 것인가

### 3.1 사용자 시나리오 (기능 목표)

선생님이 설정 → 교시 시간 표에서 각 줄에 **이름을 직접 적을 수 있다.** 비워두면 지금처럼 "1교시"로 나온다.

예상 사용례(현장에서 실제로 필요한 것):

- 1교시 앞의 아침 자습 시간을 "아침자습"으로
- 7교시를 "창체" / "동아리" / "보충"으로
- 점심 직후 칸을 "청소"로

### 3.2 표시 규칙 (단일 계약)

```
표시 이름 = label을 다듬은 값이 있으면 그것, 없으면 `${period}교시`
```

- 좁은 칸(좌석표·출결 그리드)에서는 짧은 형태를 따로 제공한다.
- 이름 길이 상한을 둔다(제안: **6자**). 상한이 없으면 시간표 격자·위젯이 깨진다.
- 빈 문자열/공백만 입력은 "이름 없음"으로 정규화해 저장한다(빈 문자열이 저장되면 이후 판정이 모두 갈린다).

---

## 4. 구현 계획 (5단계)

### P0 — 도메인 필드 추가

- `PeriodTime`에 `readonly label?: string` 추가 (`src/domain/valueObjects/PeriodTime.ts`).
- 정규화 함수 `normalizePeriodLabel(raw): string | undefined` — trim + 길이 상한 + 빈 값 → `undefined`.
- 모바일 설정 타입도 같은 필드 반영 (`src/mobile/stores/useMobileSettingsStore.ts:20`).
- **검증**: 기존 저장 파일에 `label`이 없어도 그대로 동작(선택 필드).

### P1 — 표시 함수 단일화

- `src/domain/rules/periodLabel.ts` 신설:
  - `resolvePeriodLabel(period, periodTimes): string`
  - `resolvePeriodShortLabel(period, periodTimes): string`
- 기존 3.5개 함수를 이 함수로 **위임**시킨다:
  - `Attendance.ts`의 `formatPeriodLabel`/`formatPeriodShort` — 조회·종례 특례는 유지한 채 안쪽만 교체
  - `periodPresenter.ts`의 `periodToLabel` — 방과후·종일·범위 특례 유지
  - `mixedRecordExcelMapper.ts:65`의 **중복 사본은 삭제**하고 도메인 함수 재사용
- 주의: 이 함수들은 지금 `period` 하나만 받는다. `periodTimes`를 넘겨야 하므로 **호출부 시그니처가 바뀐다** → P2와 한 덩어리로 진행.

### P2 — 호출부 치환 (가장 품이 큼)

50여 곳을 교체한다. 화면 중요도 순으로 나눠 커밋한다:

1. 시간표(`TimetablePage`, `TimetableEditor`, `TempChangeModal`, `TimetableOverridesPanel`)
2. 대시보드·위젯·아이콘(`DashboardTimetable`, `Icon/pinPresence`, `IconWindow`)
3. 출결(`AttendanceGridView`, `AttendanceMatrixCore`, `PeriodRowEditor`, `SeatPeriodPopover`, `MultiDayAttendancePanel`)
4. 진도·기록(`ProgressTab`, `ProgressCalendarGrid`, `ProgressFanoutPicker`, `ClassRecordSearchView`, `displayRecord`)
5. 모바일 전체(`CurrentClassCard`, `TodayHub`, `AttendanceCheckPage`, `Class*`, `MobileProgressLogModal`)
6. 내보내기(`ExcelExporter`, `HwpxExporter`, `AllPdfExporters`)
7. 설정·온보딩·마법사 자체 표시(`PeriodTab`, `Onboarding`, `Step3Profile`, `Step4Confirm`)

**회귀 방지 그물**: 소스 grep 계약 테스트를 추가한다 — `src/` 안에서 `}교시` / `${...}교시` 패턴이 허용 목록 밖에 새로 생기면 실패. (프로젝트에 이미 같은 방식의 메타 테스트 선례 있음: `attendanceSingleWriter.metatest`, `settingsTabIds.test.ts`)

### P3 — 편집 UI

- 데스크톱 설정 → 교시 시간 표에 **이름 칸** 추가 (`PeriodTab.tsx` `PeriodRows`, 700줄 근처). placeholder에 `1교시`를 회색으로 보여 "비우면 기본값"을 알린다.
- 모바일 `PeriodTimesEditor.tsx:80` 동일 반영.
- 시간표 화면의 인라인 교시 편집(현재 시각만 수정 가능, `/docs:417`에 안내된 동선)에도 이름 편집 추가 — **확정 범위**. 대상: `TimetablePage.tsx:1568-1590`, `TimetableEditor.tsx:849` 근처의 교시 셀.
- ⚠️ `PeriodTab.tsx:700`의 `index + 1` → `pt.period` 정정 선행.
- 프론트엔드 디자인 에이전트와 협업 필수(프로젝트 규칙).

### P4 — 이름 보존 계약

§2.3의 교체 경로 전부에 "번호 기준 이름 승계" 규칙을 넣는다:

- `mergePeriodLabels(prev, next): PeriodTime[]` — `next`의 시각을 쓰되 같은 `period` 번호의 `prev.label`을 물려받는다.
- 적용 지점: `comciganRules.periodTimesToSettingsPatch`, `PeriodTab` 자동 생성, `Step3Profile`, `Onboarding`, `TimetableEditor` 저장.
- 교시 **삭제 후 재번호**(`PeriodTab.tsx:72`)는 이름까지 같이 밀리므로, 재번호 시 이름은 **행을 따라가게** 한다(번호가 아니라 배열 위치 기준).
- 자동 생성 버튼은 이미 "직접 편집한 교시 시간이 모두 초기화됩니다" 경고를 띄운다(`PeriodTab.tsx:403`) → 이름 승계 여부를 이 문구에 반영.

**검증**: 이름을 붙인 뒤 컴시간 불러오기 → 이름 유지되는지 테스트로 못 박는다.

### P5 — 문서·안내

- `/docs` 사용자 가이드(`landing/src/content/docs.ts`) — 교시 시간 안내(377·379·417·873줄 부근)에 이름 설정 문단 추가. 릴리즈 규칙상 **같은 작업 단위에서** 갱신.
- 앱 내 오프라인 FAQ(`src/adapters/components/HelpChat/offlineFaq.ts:189-193`)에 항목 추가.
- 챗봇 지식베이스 재수집(ingest) — push만으로는 반영되지 않음(기존 함정 기록).
- `cd landing && npm run docs:check && npm run build` 확인.

---

## 5. 범위 결정 (2026-08-13 확정)

| #   | 항목                    | 결정                      | 근거                                                                                                                            |
| --- | ----------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 0교시(1교시 앞) 행 추가 | ❌ **범위 밖**            | "이름 바꾸기만" 확정. 맨 앞 교시 추가는 `PeriodTab.tsx:60-66`의 추가·재번호 로직을 바꿔야 하는 별개 작업 → 필요해지면 별건 PDCA |
| 2   | 조회·종례 이름 변경     | ❌ **범위 밖**            | `periodTimes` 밖의 별도 축(`Attendance.ts:113-116`). v1 제외                                                                    |
| 3   | 요일별 다른 이름        | ❌ **범위 밖**            | `periodTimes`에 요일 개념이 없어 자료 구조를 통째로 바꿔야 함. 요일별 과목명은 이미 시간표로 표현 가능                          |
| 4   | 편집 위치               | ✅ **설정 + 시간표 양쪽** | `/docs:417`이 이미 "시간표 화면에서 바로 교시 시간 조정"을 안내 중 → 한쪽만 되면 같은 문의가 반복됨                             |

**따라서 v1의 정의**: `periodTimes`의 각 줄에 이름을 붙일 수 있다. 줄을 더하거나 빼는 동작은 지금 그대로 둔다.

### 5.1 범위 밖 항목에 대한 사용자 응대 문구

문의자가 원한 것이 0교시 추가나 조회·종례 이름이었을 가능성이 남아 있다. 응대 시 **"7교시를 창체로 바꾸는 것"과 "1교시 앞에 아침자습을 새로 만드는 것"을 구분해서** 되물을 것. 전자는 이번 작업으로 해결, 후자는 별건.

---

## 6. 검증 게이트

```bash
npx tsc --noEmit          # TypeScript 에러 0개
npm run lint              # ESLint
npm run test              # Vitest
npm run regression-check  # 회귀 체크
cd landing && npm run docs:check && npm run build
```

추가로 이 기능 전용:

- `mergePeriodLabels` 단위 테스트 (컴시간 교체 / 자동 생성 / 삭제 재번호)
- `resolvePeriodLabel` 단위 테스트 (빈 값·공백·길이 상한·조회/종례 특례)
- 소스 grep 계약 테스트 (하드코딩 "N교시" 재발 방지)
- 실렌더 확인: 시간표·대시보드·위젯·모바일 홈에서 긴 이름(6자)이 레이아웃을 깨지 않는지

## 7. 규모 추정

| 단계           | 파일 수 | 난이도            |
| -------------- | ------- | ----------------- |
| P0 도메인      | 3~4     | 낮음              |
| P1 표시 함수   | 4       | 낮음              |
| P2 호출부 치환 | 30~40   | **높음(양)**      |
| P3 편집 UI     | 3~4     | 중간(디자인 협업) |
| P4 보존 계약   | 6~7     | **높음(함정)**    |
| P5 문서        | 3       | 낮음              |

가장 위험한 곳은 **P4**다. 필드만 추가하고 넘어가면 "이름을 붙였는데 나중에 사라졌다"는 새 신고가 들어온다.

---

## 8. 부록 — 하드코딩 지점 전수 조사 방법

```bash
# 템플릿 문자열 방식
grep -rn '\${[^}]*}교시' --include="*.ts" --include="*.tsx" src/ electron/

# JSX 직접 삽입 방식
grep -rn '}교시' --include="*.tsx" src/
```
