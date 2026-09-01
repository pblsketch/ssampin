# 핸드오프: 옆핀 개인정보 보호 3단계 (/ralplan 용)

> 작성 2026-08-31 · 아래 "복사할 프롬프트"를 통째로 새 세션에 붙여 넣는다.
> 이 문서의 파일·줄 번호는 전부 실제 코드에서 확인한 값이다(2026-08-31 기준, `main` `7f71269a`).

---

## 복사할 프롬프트

````
/oh-my-claudecode:ralplan 쌤핀 옆핀(SidePin)의 개인정보 노출 구멍을 3단계로 막고, 마지막에 온라인 교무실 위젯을 붙인다.

## 시작 전에 반드시 읽을 것 (순서대로)

1. `docs/01-plan/features/sidepin-privacy-guard.handoff.md` — 이 프롬프트의 출처. **§"이미 조사된 사실"은 다시 조사하지 말 것.**
2. `CLAUDE.md` — 아키텍처·검증 게이트·비개발자 설명 원칙
3. `docs/architecture-rules.md`, `docs/design-system.md`, `docs/coding-conventions.md`
4. `git status --short` — 다른 세션 작업 파일은 건드리지 않는다

## 왜 하는가 (한 문장)

옆핀은 "항상 맨 위에 뜨는 창"인데 **대시보드가 갖는 PIN 잠금이 옆핀에는 없다.**
그래서 **대시보드에서 잠긴 위젯 4종이 옆핀에서는 그대로 보인다.** 선생님은 "잠갔다"고 믿고 있다.

## 0단계 — 계획을 세우기 전에 실측 1회 (필수)

**PPT 슬라이드쇼(F5) 위에 옆핀이 실제로 뜨는지 확인한다.**

- `npm run electron:dev` → 옆핀 켜기 → PowerPoint 를 F5 로 띄운다
- 마우스를 화면 오른쪽 가장자리로 가져간다
- 손잡이가 보이는가 / 스치면 패널이 펼쳐지는가

**이 결과가 1단계의 필요 여부를 정한다.**
- 뜬다 → 1단계 진행
- 안 뜬다(윈도우가 이미 막아 준다) → **1단계는 계획에서 제외하고 2단계부터.** 이유를 PROGRESS.md 에 남긴다

★ 실측 없이 1단계를 계획에 넣지 말 것. 안 뜨면 만들 필요가 없는 기능이다.

## 1단계 — 전체화면일 때 옆핀 숨기기 (0단계 결과에 따라)

옆핀에는 이미 **"숨겨야 할 이유가 하나라도 있으면 손잡이까지 통째로 숨긴다"** 구조가 있다.
지금은 윈도우 잠금·절전에만 반응한다. 여기에 "전체화면"을 이유로 추가한다.

- 숨기는 쪽은 **이미 다 만들어져 있다** — `SidePinProtectReason` 에 `'fullscreen'` 이 **선언까지 돼 있는데
  코드 전체에서 그 값을 쓰는 곳이 없다.** 자리는 뚫려 있고 배선만 없다
- **새로 만들어야 하는 쪽은 "알아채기"다.** 잠금·절전은 운영체제가 알려주지만(powerMonitor),
  다른 프로그램의 전체화면은 알려주지 않는다. 윈도우에 직접 물어보는 경로가 필요하다
  (윈도우에 "지금 발표 중인가"를 답해 주는 창구가 있다 — 알림 앱들이 발표 중 조용해지는 데 쓰는 것).
  **어떤 방법을 쓸지는 계획 단계에서 후보를 비교하고 결정 근거를 남긴다.**
- 덧붙임: **"손잡이를 눌러 즉시 가리기" 토글.** 실제 위험은 "5분 지났을 때"가 아니라
  "지금 화면을 띄웠을 때"다. 시간이 아니라 사건이다. PIN 을 안 켠 선생님까지 보호된다

## 2단계 — 옆핀 위젯 칸에 잠금 씌우기

**지금 새고 있는 4종을 막는다** — 오늘 수업 · 다가오는 일정 · 급식 · 할 일.
(`PIN_FEATURE_MAP` 에 있으면서 동시에 `sidePin.eligible: true` 인 위젯 = 이 4종)

- 잠금 설정값은 파일에 저장돼 있어 **옆핀 창에서도 읽힌다**. 잠금 카드를 그리는 부품도 이미 있다
- **★자동 잠금 5분을 그대로 옮기면 안 된다.** 대시보드 잠금은 "가끔 열어 본다"가 전제인데
  옆핀은 하루 종일 떠 있는 게 존재 이유다. 5분마다 자물쇠가 되면 위젯 칸이 온종일 자물쇠 그림이
  되고, 선생님은 잠금을 꺼 버린다 → **보호가 0이 된다.**
  → **"옆핀이 숨었다가 다시 나타나면 잠금"** 기준을 검토한다(1단계와 자연스럽게 맞물린다).
  다른 기준이 더 낫다고 판단하면 근거를 적고 바꿔도 된다. 단 **시간 기반 자동 잠금 단독은 안 된다.**
- **★잠금 푼 상태가 창마다 따로 논다.** "언제 풀었는지"가 메모리에만 있어서 본 앱에서 풀어도
  옆핀은 또 물어본다. 하루에 PIN 을 두 번 치게 된다. 창 사이 신호를 보낼지, 아니면 따로 두는 게
  맞는지(더 안전할 수도 있다) **계획에서 결정하고 근거를 남긴다.**
- **★PIN 입력 중 패널이 접히면 입력이 날아간다.** 옆핀은 마우스가 벗어나면 접힌다.
  이미 있는 장치(`MemoEditorActivity`)를 그대로 물린다. **이 패널에서 접힘이 문제가 된 게
  네 번째다**(메모 본문·파일 대화상자·메모 검색·위젯 편집). PIN 입력이 다섯 번째가 된다

## 3단계 — 온라인 교무실 위젯

1·2단계가 끝나면 "글 제목을 옆핀에 띄울지"가 더 이상 어려운 결정이 아니다. 잠금이 실제로 걸리니까.

- **서버 작업은 0이다.** 부서 목록을 부를 때 **부서별 안 읽은 글 수를 서버가 이미 함께 돌려준다.**
  게다가 글을 통째로 받아 세는 게 아니라 데이터베이스가 숫자만 세서 보낸다(전송량 설계가 이미 돼 있다)
- 손댈 곳 4군데: ① 위젯 본문 새 파일 ② `registry.ts` 등록 ③ 이동 목적지 목록에 `'staffroom'` 추가
  (지금 7개인데 교무실이 없다) ④ 실험실 스위치(`settings.staffRoomEnabled`)를 위젯에도 건다
  — 안 걸면 교무실을 안 켠 선생님 대시보드에 교무실 위젯이 뜬다
- 누르면 본 앱 열기는 **이미 깔린 길을 그대로 쓴다**(`navigateToPage`). 새 배선이 필요 없다
- **표시 수준 3안 — 기본값은 A.**
  - A. 숫자만 (`학년부 · 새 글 3` / `나를 부른 글 1`) — 위험 없음
  - B. 말머리까지 (`[공지] 2건`) — 말머리엔 학생 이름이 안 들어간다
  - C. 제목까지 — **학생 이름 노출 가능**(교무실 글 제목에 "3학년 2반 ○○○ 학생 건" 이 들어간다)
  - **C 는 설정에서 켜야만 되게 한다.** 할 일 알림이 이미 같은 방식이다
    (기본은 "확인할 일이 1건 있습니다"까지만, 내용은 따로 켠다) — 같은 말투를 쓰면 새로 배울 게 없다
- "나를 부른 글(@호출)" 부서 단위 합계는 서버에 아직 없다. 작은 추가가 필요하다.
  **@호출은 지금 표까지 만들어 놓고 알림이 하나도 안 나가는 상태**라, 이 배지가 그 기능을 처음 살린다
- 교무실은 유일하게 인터넷이 필요한 기능이다. 못 가져왔을 때 **빨간 오류를 계속 띄우지 말고
  조용히 직전 숫자를 유지**한다. 확인 간격은 5~10분, 화면에 안 보일 때는 멈춘다

## 이미 조사된 사실 (다시 조사하지 말 것 — 전부 실측 확인)

### 옆핀 구조
- 옆핀은 **본체와 별개인 창 2개**다(손잡이 `rail` + 패널 `panel`) — `electron/sidePinWindow.ts:10`
- **항상 맨 위에 뜬다** — `electron/sidePinBrowserWindow.ts:185` `win.setAlwaysOnTop(true, 'normal')`
- 창 2개 모두 **본체와 같은 preload 를 쓴다** — `electron/main.ts:2083`.
  즉 구글 토큰·네트워크 경로가 옆핀 창에서도 그대로 열려 있다(3단계의 전제)
- 패널 안은 두 칸: 메모 칸 + 위젯 칸 (`SidePinMemoZone` · `SidePinWidgetZone`)
- **옆핀 창은 자기만의 스토어 사본을 갖는다**(별개 창). 본 앱과 상태가 자동으로 안 맞춰진다

### 보호(숨기기) 장치 — 이미 있는 것
- `electron/sidePinProtection.ts` — 이유를 모아 두고 **다 사라지면 푼다**(중복 이벤트에도 안 꼬임)
- `src/domain/entities/SidePinRuntimeState.ts:145-150` — `SidePinProtectReason` 5종 선언:
  `lock` · `suspend` · **`fullscreen`** · `virtual-desktop-hidden` · `adapter-unhealthy`
- **★`'fullscreen'` 은 이름만 있고 어디에서도 쓰이지 않는다.** 코드 전체 검색으로 확인했다
  (`src`·`electron` 통틀어 이 타입 선언 한 줄뿐). 실제로 배선된 건 `lock`·`suspend` 둘뿐이다
- `src/domain/events/SidePinEvent.ts:81,83` — `force-protect` / `protect-released` 이벤트
- `electron/main.ts:2063-2078` — `applySidePinProtection` · `protectSidePin` · `releaseSidePinProtection`
- `electron/main.ts:6098-6109` — powerMonitor `suspend`/`resume` 배선 (여기가 배선 선례다)
- `electron/preload.ts:1120-1184` — 옆핀 IPC 창구 목록. 렌더러→메인 채널 선례:
  `sidePin:request-close` · `sidePin:toggle-pin` · `sidePin:editor-activity`

### PIN 잠금 장치
- `src/widgets/utils/pinFeatureMap.ts` — 위젯 → 자물쇠 종류 매핑 **11개**
- `src/domain/entities/PinSettings.ts:1-26` — `ProtectedFeatureKey` **11종**(`staffroom` 없음)
- `src/adapters/components/Dashboard/DashboardPinGuard.tsx` — 잠금 카드 부품(재사용 대상)
- `src/adapters/stores/usePinStore.ts:51` — **`lastUnlockedAt` 은 메모리 전용**(파일에 안 남는다)
- 잠금 설정값 자체는 `useSettingsStore` 의 `settings.pin` → 파일 저장 → **옆핀 창에서도 읽힌다**
- 자동 잠금 기본 **5분**
- 설정 화면: PIN 은 `Settings/tabs/SecurityTab.tsx`, 옆핀은 `Settings/tabs/WidgetTab.tsx:301`
  → `Settings/SidePinDisplaySection.tsx`

### 지금 실제로 새고 있는 것 (2단계 대상)
- `src/adapters/components/SidePin/SidePinWidgetZone.privacy.test.tsx:1-10` 에
  **"옆핀에는 PIN 가드가 없다 — 옆핀은 `WidgetCard` 를 거치지 않고 위젯 본문을 직접 그리기 때문
  (전 위젯 공통의 기존 구멍)"** 이라고 이미 적혀 있다
- 옆핀에 올릴 수 있는 위젯 8종: `today-class` · `today-progress` · `meal` · `events` ·
  `mini-calendar` · `todo` · `dday-counter` · `favorite-tools`
- 그중 **대시보드에서는 잠기는데 옆핀에서는 안 잠기는 4종**:
  `today-class`(timetable) · `events`(schedule) · `meal`(meal) · `todo`(todo)
- ★ 같은 테스트 파일에 **"이미 쓰이는 기능을 회수하지 않는다 — `sidePin.eligible` 을 false 로
  내리지 않는다"** 는 규칙이 못박혀 있다. **위젯을 옆핀에서 빼는 방식으로 해결하지 말 것.**

### 위젯 등록 구조 (3단계)
- `src/widgets/registry.ts` 한 곳에 정의. `sidePin: { eligible: true, navigationTarget: ... }` 를
  적어야 옆핀에 올라간다. **안 적으면 조용히 빠진다**(`src/widgets/types.ts:32-34` 의 의도적 설계)
- `src/widgets/types.ts:17-25` — `SIDE_PIN_NAVIGATION_TARGETS` **7종, `staffroom` 없음**
- `src/adapters/components/SidePin/SidePinApp.tsx:299` — 누르면 본 앱 열기(`navigateToPage`)
- `electron/preload.ts:430` + `electron/main.ts:3584` — `window:navigateToPage` (임의 페이지 문자열 허용)
- `src/adapters/components/Layout/Sidebar.tsx:213-218` — 교무실 실험실 게이트(`staffRoomEnabled`)

### 온라인 교무실 서버 (3단계)
- `supabase/functions/staffroom-departments/index.ts:182-206` — `list` 응답에 **`unreadCount` 가
  부서별로 이미 들어 있다.** DB 함수 `staffroom_unread_counts` 가 숫자만 센다
- 교무실 서버 호출은 매번 구글 access token 을 넘기는 방식 — `useStaffRoomStore.ts:80-82`
- 교무실은 v2.4.4 부터 **실험실 기능(ADR-070)** 으로 출시됨. 기본 꺼짐

## 반드시 지킬 것

1. **UI 를 새로 만들 때는 프론트엔드 디자인 전문 에이전트와 함께 작업한다**(단독 진행 금지).
   `design examples/` 폴더 디자인을 최대한 재현한다
2. UI 텍스트는 전부 한국어 · 하드코딩 HEX 금지(`sp-*` 토큰) · 직각 금지
   (`rounded-*` Tailwind 기본 키만, `rounded-sp-*` 금지) · `any` 금지
3. `domain/` 레이어는 외부 의존성 import 절대 금지
4. **electron 메인/IPC/preload 를 고치면 `npm run electron:dev` 를 재시작해야 반영된다**(watch 안 됨)
5. **`npm run test` 가 electron 코드를 보는 유일한 게이트다.** `tsc`·`lint` 는 electron 을 안 본다
6. **커밋은 반드시 경로를 지정한다**: `git commit -m "..." -- <path>`.
   git 인덱스는 세션 간 공유라 경로 없는 커밋이 남의 파일 8개를 딸려 보낸 전력이 있다
7. **Edit 도구가 `src` 소스를 CRLF 로 뒤집는 일이 있다.** 편집 후 `git diff --numstat` 으로
   변경 줄 수가 실제 수정량과 맞는지 확인한다(수십 줄 고쳤는데 1,110줄 diff 가 난 적 있다)
8. 새 회귀 검사를 넣는다면 `scripts/regression-grep-check.mjs` 에 **REGRESSION #65** 부터.
   새 ADR 은 **ADR-078** 부터(현재 최신 #64 / ADR-077)

## 하지 말 것

- **0단계 실측 없이 1단계를 계획에 넣기.** 안 뜨면 만들 필요가 없다
- `sidePin.eligible` 을 false 로 내려서 문제를 회피하기 (이미 쓰이는 기능 회수 금지)
- 대시보드의 시간 기반 자동 잠금을 **그대로** 옆핀에 옮기기
- 3단계에서 글 제목을 **기본값으로** 띄우기
- 새 브랜치·worktree·PR 생성 (사용자가 요청할 때만)
- 계획에 없는 기능 추가. 특히 **활동 포인트·랭킹·출석도장은 프로젝트 금지 규칙이다**
- 코드만 보고 "됐다" 선언하기

## 단계별 쪼개기 기준

각 스토리는 "화면에서 눈으로 확인 가능한 단위"로 만든다. 1·2·3단계는 **각각 따로 완결**되어야
하며(중간에 멈춰도 쓸 수 있어야 한다), 2단계는 3단계 없이도 그 자체로 값이 있다.

## 완료 기준 (검증 게이트 — 하나라도 빠지면 완료 아님)

```bash
npx tsc --noEmit          # 에러 0
npm run lint              # 통과
npm run test              # 통과 (electron 코드를 보는 유일한 게이트)
npm run regression-check  # 통과
```

- 위 4종 결과를 **실행한 명령과 핵심 출력까지** 함께 보고한다. "통과했습니다"만 쓰지 않는다
- **실기기 확인 필수** — 게이트 4종이 전부 초록인 채로 살아 있던 결함 전력이 여러 번 있다:
  - 1단계: PPT F5 로 띄우고 옆핀이 실제로 사라지는가 / 끝나면 돌아오는가
  - 2단계: 잠금 켠 상태에서 옆핀 위젯 칸이 가려지는가 / PIN 치는 도중 패널이 안 접히는가
  - 3단계: 부서 새 글 숫자가 실제로 맞는가 / 눌러서 본 앱 교무실이 열리는가
- 끝나면 `PROGRESS.md` 갱신, 새 결정이 있으면 `DECISIONS.md` 에 ADR 추가

## 막히면

추측해서 진행하지 말고 사용자에게 묻는다. 사용자는 코딩을 모르는 프로젝트 오너이므로,
기술 용어를 쓸 때는 쉬운 한국어 설명을 한 문장 안에 함께 붙인다.
````

---

## 프롬프트에 넣지 않았지만 알아두면 좋은 것

### 이 작업이 나온 경위

온라인 교무실 고도화를 브레인스토밍하다가 "옆핀에 새 글 알림을 붙이자"가 나왔고,
붙이려고 보니 **옆핀에 개인정보 보호 장치가 없다**는 게 드러났다.
그래서 순서가 뒤집혔다 — 교무실을 붙이기 전에 옆핀 구멍부터 막는다.

**이건 교무실이 만든 문제가 아니다.** 지금 이미 4종이 새고 있고, 교무실은 그 위에 얹힐 뿐이다.

### 판단의 핵심 세 줄

1. 옆핀은 "늘 보이는 창"이다. 대시보드용 장치를 그대로 옮기면 **사용자가 꺼 버려서 보호가 0이 된다**
2. 위험한 순간은 시간이 아니라 **사건**이다(발표·화면 공유·옆자리 손님)
3. 숨기는 절반은 공짜고, **알아채는 절반이 진짜 작업**이다

### 참고 — 교무실 쪽 미착수 항목 (이 작업 범위 아님)

3단계까지 끝나도 교무실에는 아래가 남는다. 별도 작업 단위다.

- **M5 나머지**: 윈도우 알림 · 문서 확인 서명 · 부서 서식함
- **M6 전체**: 관리자 넘겨주기 · 부서 삭제(지금 만들기/목록/조회 3개뿐) · 자료 통째로 내려받기 ·
  학년도 인수인계. **관리자 토큰이 끊기면 자료실 전체가 전원에게 안 열린다**(계획서 §10.1) —
  `staffroom_admin_tokens` 는 부서당 1행만 저장한다(`049_staffroom_core.sql:124`).
  **공동 관리자(백업 토큰)가 승계보다 값싸고 효과가 크다**는 게 이번 조사의 결론이다
- **실사용 계측 없음**: 집계 롤업(`061`)에도 앱 코드에도 교무실 사용 기록이 0건.
  계획서 §10.4 의 "실사용 확인 후 결정" 이 아직 안 닫혔다
