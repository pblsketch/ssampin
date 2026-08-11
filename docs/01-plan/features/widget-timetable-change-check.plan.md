# 위젯 새로고침에서 컴시간 변동 확인 — 계획서 v1

- 작성일: 2026-08-11
- 출처: 사용자 피드백(챗봇 에스컬레이션) — "시간표 화면 새로고침처럼 위젯 새로고침에서도 컴시간 변동을 확인하고 싶다"
- 상태: 계획(미착수)

---

## 1. 현재 소스 기준 사실 확인

### 1.1 위젯 새로고침 버튼은 "다시 그리기"만 한다

- 버튼: `src/adapters/components/Widget/Widget.tsx:499-513` → `triggerRefreshAll()`
- 실체: `src/widgets/hooks/useWidgetRefresh.ts:62-64` — 같은 창 안에 `ssampin:refresh-all-widgets` 이벤트를 쏘는 게 전부.
- 각 위젯 카드가 이 이벤트를 받아 **로컬 저장 파일을 다시 읽는다**(예: `WeeklyTimetable.tsx:35` → `loadSchedule`).
- 즉 **컴시간(comci.net) 서버에 묻는 동작은 한 줄도 없다.** 챗봇 답변("위젯에는 컴시간 조회 기능 없음")은 정확했다.

### 1.2 컴시간 변동 확인 로직은 이미 재사용 가능한 함수다

- `src/adapters/hooks/useComciganAutoSync.ts:28` `checkComciganTimetableChange({ manual })`
- 시간표 화면 버튼(`TimetablePage.tsx:575-583`)과 앱 시작 자동 확인(같은 파일 `:118-120`)이 **이 함수 하나를 공유**한다.
- 통신은 renderer 직접 fetch가 아니라 `window.electronAPI.comcigan.fetch` → electron main IPC(`comcigan:fetch`, `preload.ts:1295`) 경유다.
  → **위젯 창에서도 그대로 호출 가능**(위젯 창도 같은 preload를 쓴다: `Widget.tsx:390`, `App.tsx:631`에서 `window.electronAPI` 사용 중).
- 압핀도 동일 구조: `useAppinAutoSync.ts:29` `checkAppinTimetableChange({ manual })`.

### 1.3 그냥 갖다 붙이면 깨지는 3가지 (핵심)

| #   | 걸림돌                                           | 근거                                                                                                                                                                                                                                                                    | 결과                                                                                                                                                    |
| --- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | **위젯 창에는 토스트 표시기가 없다**             | `App.tsx:688-693` `WidgetApp`은 `<Widget />` + `<WidgetUpdateBanner />`만 렌더. `ToastContainer`는 `App.tsx:605`(퀵애드)·`:1219`(메인)에만 있음                                                                                                                         | `checkComciganTimetableChange`가 부르는 toast가 **전부 보이지 않음** → 눌러도 아무 반응 없는 기능 (v2.3.7 "도달 불가능한 표시 조건"과 같은 계열의 함정) |
| B   | **자동 새로고침에 얹으면 comci.net 폴링이 된다** | `useWidgetRefresh.ts:31-51` — 5분 주기 타이머 + 창 활성화 시에도 같은 콜백 실행                                                                                                                                                                                         | 위젯을 켜둔 교사 전원이 **5분마다 컴시간 서버 조회** = 프로젝트 원칙(`useComciganAutoSync.ts:102-104` "폴링 금지, 하루 1회") 위반·차단 위험             |
| C   | **감지 결과가 창을 못 넘어간다**                 | 검토 대기 상태 `pendingComciganReview`는 `useScheduleStore`의 **창별 메모리**(`useScheduleStore.ts:125`). 게다가 `window:navigateToPage`는 메인 창을 띄운 뒤 **위젯 창을 닫는다**(`electron/main.ts:2751-2754`), 메모리 절약 모드면 메인 창이 새로 생성됨(`:2722-2728`) | 위젯에서 "바뀌었어요"를 감지해도 메인 시간표 화면은 그 사실을 모름 → 사용자는 다시 처음부터 눌러야 함                                                   |

---

## 2. 방안 비교

| 안                 | 방식                                                                                                                                                                    | 장점                                                                                                             | 단점                                                                   | 판정     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------- |
| **A. 의도 전달형** | 위젯이 확인 → 위젯 자체 배너로 결과 표시 → "검토하기" 클릭 시 `navigateToPage('timetable#sync-review')` → 메인 시간표가 열리면서 자동으로 한 번 더 확인해 미리보기 오픈 | 창 파괴/재생성에 안전(상태가 아니라 의도만 넘김), 기존 `settings#widget` 패턴 재사용, 메인 화면 흐름 100% 재사용 | 검토까지 가면 컴시간 조회가 2회                                        | **채택** |
| B. 상태 전달형     | 감지 결과(스케줄+diff)를 main process 메모리에 보관하고 IPC로 메인 창에 전달                                                                                            | 조회 1회                                                                                                         | 새 IPC 채널·직렬화·창 생성 타이밍·만료 정책까지 신설, 경계 케이스 많음 | 보류     |
| C. 최소안          | 위젯은 "바뀐 게 있는지"만 알려주고 "앱에서 확인하세요" 안내                                                                                                             | 가장 작음                                                                                                        | 결국 사용자가 같은 확인을 두 번 함 — 피드백을 절반만 해결              | 대안     |

> 2회 조회에 대한 판단: 사용자가 **직접 클릭한 시점**에만 발생하고, 시간표 화면의 기존 수동 버튼과 동일한 부하다. 폴링이 아니므로 원칙 위반이 아니다. 메인 창이 살아 있어 이미 `pendingComciganReview`가 있으면 2차 조회를 생략해 실제 2회 조회는 드물다.

---

## 3. 채택안(A) 상세 설계

### S1. 확인 함수가 결과를 돌려주게 한다 (표현과 판정 분리)

`checkComciganTimetableChange`는 현재 `Promise<void>`이고 안내를 toast로 직접 띄운다. 위젯에는 toast가 없으므로 **판정 결과를 반환**하도록 바꾼다.

```ts
// src/adapters/hooks/useComciganAutoSync.ts
export type TimetableCheckStatus =
  | 'not-configured' // 컴시간 연동 전
  | 'fetch-failed' // 연결 실패
  | 'unmatched' // 교사 매칭 실패 → 재선택 필요
  | 'unchanged' // 변경 없음
  | 'applied' // autoApply 로 즉시 반영됨
  | 'pending'; // 변경 감지 → 검토 대기

export interface TimetableCheckResult {
  readonly status: TimetableCheckStatus;
  readonly changeCount: number;
}

export async function checkComciganTimetableChange(
  opts: { manual: boolean; silent?: boolean }, // silent 기본 false = 기존 동작 그대로
): Promise<TimetableCheckResult>;
```

- `silent: true`이면 함수 내부에서 toast를 부르지 않는다(위젯 전용).
- 기존 호출자 2곳(TimetablePage, 앱 시작 훅)은 **인자·동작 불변**. 반환값을 안 써도 그만.
- 압핀 `checkAppinTimetableChange`도 동일 시그니처로 맞춘다(대칭 유지).

### S2. 위젯 새로고침 버튼에 "변동 확인" 병행

`Widget.tsx`의 새로고침 버튼 `onClick`:

```
triggerRefreshAll();            // 기존: 카드 다시 그리기
void runTimetableSourceCheck(); // 신규: 컴시간(+압핀) 변동 확인
```

가드(모두 필수):

1. **버튼 클릭 경로에서만 호출** — `useWidgetRefresh` 콜백(5분 타이머·visibility)에는 절대 넣지 않는다. (§1.3-B)
2. **재진입 금지** — 진행 중이면 무시, 아이콘은 회전 스피너로 진행 표시.
3. **쿨다운 60초** — 연타 시 서버를 두드리지 않고 "방금 확인했어요"로 응답.
4. **미설정이면 침묵** — 컴시간 연동을 안 쓰는 교사에게 전체 새로고침마다 안내가 뜨면 소음. `not-configured`는 배너 없이 종료(시간표 화면의 수동 버튼과 다른 점 — 그쪽은 "컴시간 변동 확인" 전용 버튼이라 안내가 맞다).
5. 압핀은 `settings.appin.autoSync.enabled`일 때만 이어서 확인(둘 다 켠 경우 순차 실행).

### S3. 위젯 전용 결과 배너 (`WidgetSyncBanner`)

토스트 대신 배너를 쓰는 이유: 토스트는 `min-w-[320px]`(`Toast.tsx:84`)이라 좁은 위젯 창에서 잘린다. 반면 같은 창에서 **이미 검증된 하단 전폭 배너 패턴**이 있다(`App.tsx:450-507` `WidgetUpdateBanner`). 이를 그대로 따른다.

| 상태           | 문구                                      | 액션                                      |
| -------------- | ----------------------------------------- | ----------------------------------------- |
| `pending`      | 컴시간 시간표가 N칸 바뀌었어요 — 검토하기 | `navigateToPage('timetable#sync-review')` |
| `applied`      | 바뀐 시간표를 반영했어요 (N칸)            | 3초 후 자동 사라짐                        |
| `unchanged`    | 시간표는 최신 상태예요                    | 2초 후 자동 사라짐                        |
| `fetch-failed` | 컴시간에 연결하지 못했어요 — 다시 시도    | 버튼으로 재확인                           |
| `unmatched`    | 컴시간에서 본인을 다시 선택해주세요       | `navigateToPage('timetable')`             |

- 업데이트 배너와 동시에 뜰 수 있으므로 위치를 겹치지 않게 쌓는다(업데이트 배너 우선, 동기화 배너는 그 위).

### S4. 메인 창 라우팅에 `timetable#sync-review` 지원

현재 fragment 파서는 `settings`만 처리하고, 나머지는 `setCurrentPage(page as PageId)`로 흘려보낸다(`App.tsx:892-907`, 그리고 같은 규칙의 `ssampin:navigate` 핸들러 `:931-950`).
→ **미지원 fragment가 오면 존재하지 않는 페이지 id가 되어 빈 화면**이 된다. 반드시 두 곳 모두 확장한다.

```
base === 'timetable' && fragment === 'comcigan-review'
  → setCurrentPage('timetable') + setTimetableInitialIntent('comcigan-review')
```

`TimetablePage`는 새 prop `initialIntent`를 받아 mount 시 1회:

- 이미 `pendingComciganReview`가 있으면(메인 창이 살아 있던 경우) **재조회 없이** 바로 미리보기 오픈.
- 없으면 `handleComciganCheck()` 실행 → 기존 배너/미리보기 흐름 그대로.
- intent는 사용 즉시 초기화(`settingsInitialTab`과 동일 규칙 — `App.tsx:700-705`).

메모리 절약 모드에서 메인 창이 새로 생성되는 경우는 main의 기존 지연 송신 경로(`main.ts:2741-2749`, did-finish-load + 50ms)를 그대로 타므로 추가 처리가 필요 없다.

### S5. 하루 1회 스로틀과의 관계

위젯에서 확인하면 `markComciganSynced(today)`가 호출되어 그날 앱 시작 자동 확인은 건너뛴다 — 의도한 동작(중복 조회 방지). 수동 확인은 스로틀을 무시하므로 사용자가 원할 때 언제든 다시 누를 수 있다.

---

## 4. 변경 파일 목록

| 파일                                                  | 변경                                                                                               |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `src/adapters/hooks/useComciganAutoSync.ts`           | 반환 타입·`silent` 옵션 추가 (기존 동작 불변)                                                      |
| `src/adapters/hooks/useAppinAutoSync.ts`              | 동일 시그니처로 대칭 맞춤                                                                          |
| `src/adapters/components/Widget/Widget.tsx`           | 새로고침 `onClick`에 변동 확인 병행 + 진행/쿨다운 상태                                             |
| `src/widgets/components/WidgetSyncBanner.tsx` (신규)  | 위젯 결과 배너                                                                                     |
| `src/App.tsx`                                         | `WidgetApp`에 배너 마운트, fragment 파서 2곳에 `timetable#...` 지원, `timetableInitialIntent` 전달 |
| `src/adapters/components/Timetable/TimetablePage.tsx` | `initialIntent` prop 수신 → 자동 확인/미리보기                                                     |
| `landing/src/content/docs.ts`                         | 383~384행 문구 갱신(위젯 새로고침 경로 추가)                                                       |

레이어 규칙 영향 없음 — `domain/`은 건드리지 않고 adapters/widgets 계층만 수정한다.

---

## 5. 검증 계획

**자동**

1. `checkComciganTimetableChange`: 6개 status를 각각 반환하는지 + `silent: true`에서 toast 미호출.
2. **회귀 가드(가장 중요)**: `useWidgetRefresh`의 자동 경로(5분 타이머·visibilitychange)에서 컴시간 조회가 호출되지 않음을 단언하는 테스트. §1.3-B 재발 방지선.
3. 라우팅 파서: `'timetable#sync-review'` → page=`timetable`, intent=`comcigan-review`. `'settings#widget'` 기존 동작 불변.
4. 쿨다운: 60초 내 재클릭 시 fetch 미발생.
5. 게이트 4종: `npx tsc --noEmit` / `npm run lint` / `npm run test` / `npm run regression-check`.

**실기기(필수 — 위젯은 별도 창이라 브라우저 모드로 검증 불가)**

- 컴시간 연동된 계정으로 위젯 실행 → 새로고침 클릭 → 배너 문구 확인.
- 변경 있는 상태에서 "검토하기" → 메인 창이 시간표로 열리고 미리보기가 뜨는지(메모리 절약 모드 ON/OFF 각각).
- 컴시간 미설정 계정에서 새로고침 → 아무 안내도 뜨지 않는지.
- 위젯을 30분 방치 → 자동 새로고침이 도는 동안 컴시간 조회가 없는지(개발자 도구 네트워크/메인 로그).
- 바탕화면 아이콘 아래 모드에서도 버튼 클릭이 먹는지(`Widget.tsx:151-160` no-drag 제외 영역 회귀).

---

## 6. 판단거리 — 결정됨 (2026-08-12, 오너)

1. **압핀도 함께 확인** — 켜져 있는 원천만 순차 확인.
2. **미설정이면 침묵** — 연동을 안 쓰는 사용자에게는 조회도 안내도 없음.
3. **기존 새로고침 버튼에 얹음** — 전용 버튼 신설 없음.

---

## 7. 구현 결과 (2026-08-12)

계획대로 채택안 A로 구현했다. 계획 대비 달라진 점과, 구현 중 발견한 함정을 남긴다.

**계획 대비 변경**

- fragment 이름을 `timetable#comcigan-review` → **`timetable#sync-review`** 로 바꿨다(압핀까지 포함하므로).
- fragment 해석을 App.tsx 인라인이 아니라 `src/adapters/utils/navigationTarget.ts` 로 분리했다 — IPC 경로와 앱 내 이벤트 경로가 같은 규칙을 쓰는데 두 곳에 복붙돼 있었고, 테스트가 불가능했다.
- 위젯 하단 배너와 기존 업데이트 배너가 둘 다 `fixed bottom-0` 이라 겹칠 수 있어, `WidgetApp` 에 하단 알림 **스택 컨테이너**를 두고 두 배너를 쌓았다(`WidgetUpdateBanner` 는 위치 클래스만 컨테이너로 이관, 표시 로직 불변).

**구현 중 발견해 함께 고친 것 (계획서에 없던 위험)**

1. **비교 기준 미로딩 → 거짓 감지.** 확인 함수는 `useScheduleStore` 의 현재 시간표를 기준으로 diff 를 낸다. 그런데 위젯 창의 스토어는 시간표 위젯 카드가 있을 때만 채워지고, 메모리 절약 모드의 메인 창은 방금 만들어졌을 수 있다. 빈 시간표를 기준으로 비교하면 **바뀐 게 없는데도 "전부 바뀌었다"** 가 된다. → 두 경로 모두 확인 전에 `settings.load()` + `schedule.load()` 를 선행하도록 강제(둘 다 이미 읽었으면 즉시 반환).
2. **재진입 가드의 위치.** `if (inFlight) return` 과 `inFlight = true` 사이에 위 `load()` await 가 생기면서, 연타 두 번이 모두 가드를 통과해 서버를 두 번 두드릴 수 있었다. → 플래그를 첫 await 앞으로 옮기고 `try/finally` 로 감쌌다. 회귀 테스트 추가.
3. 테스트 환경: vitest `globals: false` 라 @testing-library/react 의 자동 정리가 등록되지 않는다. `cleanup()` 을 직접 부르지 않으면 이전 테스트의 훅이 계속 window 이벤트를 들어, 클릭 한 번이 여러 번 조회한 것처럼 보인다(실제로 이 함정에 걸려 처음 2건이 실패했다).

**검증 결과**

- `npx tsc --noEmit` — 통과(에러 0).
- `npm run lint` — 에러 0 (경고 133건은 전부 기존 것, 건수 변화 없음).
- 신규 테스트 19건 통과: `useWidgetTimetableCheck.test.ts` 13건 + `navigationTarget.test.ts` 5건 + 폴링 금지 계약 1건.
- `npm run regression-check` — 39/39 통과.
- `cd landing && npm run docs:check` — 통과(문서 41개).
- 사용자 가이드(`landing/src/content/docs.ts`) '시간표 변경 자동 감지' 항목에 위젯 경로 한 문단 추가.

**남은 일**

- 실기기 검증(§5 실기기 항목) — 위젯은 별도 창이라 브라우저 모드로 확인 불가.
- 릴리즈 노트 고지, 챗봇 KB 재수집(다음 릴리즈 ingest 시 자동).
