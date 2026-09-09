# 쌤도구 팝업 — 검증 기록

- 날짜: 2026-09-09 (KST) · 브랜치 `main`, 커밋하지 않은 상태에서 검증
- 계획: [tool-popup.plan.md](../01-plan/features/tool-popup.plan.md) · 설계: [tool-popup.design.md](../02-design/features/tool-popup.design.md)

## 1. 코드 검증 게이트 (전체 실행은 초록이 아니다 — §1-1)

| 명령 | 결과 |
| --- | --- |
| `npx tsc --noEmit` (작업 중) | 이 기능을 다 만든 시점에는 오류 0 |
| `npm run lint` | `137 problems (0 errors, 137 warnings)` — 경고 수·내용은 작업 전과 같다(기존 항목) |
| `npx tsc --noEmit` (전체) | 오류 21건 — **전부 다른 세션의 생기부 작성 방식 파일. 이번 기능 파일은 0건** (§1-1) |
| `npm run test` | **9,961 통과 · 10 건너뜀 / 736 파일 중 4 실패** — 넷 다 이번 기능이 아니다 (§1-1). **초록이 아니다** |
| 팝업 관련 테스트만 | **8파일 73건 전부 통과** |
| `npm run regression-check` | `Total: 75 | Passed: 75 | Failed: 0` (이번에 **#74·#75·#82** 추가) |
| `npm run build` | 성공 + postbuild 3종 통과(bundle-isolation · contract-sync · ai-bridge-protocol) |

### 1-1. 전체 실행이 초록이 아니다 — 원인 구분 (통과로 표시하지 않음)

**마지막 전체 실행(2026-09-09 08:28, 736파일 9,961통과)에서 4파일 10건이 실패했다.
넷 다 이번 기능이 아니다.** 근거를 나눠 적는다.

| 실패 파일 | 무엇 | 판단 |
| --- | --- | --- |
| `RecordDraft/__tests__/recordStylePicker.test.tsx` | 생기부 작성 방식(초점 10종·구성 블록) | **다른 세션이 작업 중**. 같은 시각 `npx tsc` 오류 21건도 전부 이 계열이고 내 파일은 0건 |
| `domain/rules/__tests__/recordStyleCompose.test.ts` | 〃 | 〃 |
| `domain/rules/__tests__/recordStylePresetStore.test.ts` | 〃 | 〃 |
| `infrastructure/storage/JsonInteractiveLessonRepository.test.ts` | `saveSession` 100회 원자적 쓰기 | **`timed out in 5000ms`. 단독 실행 1.80초·18건 전부 통과** — USB 디스크 경합 |

**이번 기능 파일의 tsc 오류는 0건이다.** 전체 오류 21건의 파일 목록은
`recordStylePicker.test.tsx` · `recordStyleCompose.test.ts` · `recordDraftPackStyle.test.ts` 뿐이었다.

**팝업 관련 테스트 8파일 73건은 전부 통과한다**(단독 재실행으로 확인).

**앞선 실행에서 걸렸던 `teachingClassArchiveCallSites.meta.test.ts` 는 이번엔 통과했다.**
이 검사는 `src/` 전체를 훑는 메타 테스트라 4워커 경합에 굶는데, 단독으로는 본체가 824~943ms 다
(상한 5,000ms). 전체 실행 4회 중 2회 통과·2회 시간 초과 — **부하에 따라 갈리는 간헐 실패**다.
이번 기능이 더한 소스 16개는 훑는 대상 1,900개의 1% 미만이고, 시간 초과이지 단언 실패가 아니며
새 팝업 파일은 `TeachingClass`·`.archived` 를 건드리지 않는다.

**남의 기능 테스트라 어느 것도 손대지 않았다.** 이 저장소는 여러 세션이 동시에 쓰고 있어
(실행 중에 테스트 파일이 730 → 736개로 늘었다) 한가한 디스크·정지된 트리를 만들 수 없었다.
**따라서 `npm run test` 와 `npx tsc` 게이트는 이 시점에 초록이 아니다.** 완료로 선언하지 않고 남긴다.

이번에 새로 추가한 자동 검사이번에 새로 추가한 자동 검사(총 73건):

- `src/domain/rules/toolPopupRules.test.ts` (9) — 허용목록 통과·거절, 창 사양 하한, 주소 조립·해석
- `src/domain/rules/toolPopupSession.test.ts` (7) — 이관 중 흐른 시간 반영, 시계 되감김 방어, 알람 due 판정
- `electron/toolPopupWindows.test.ts` (15) — 단일 창 보장·재열기 포커스·준비 대기·시간 초과 정리·로드 실패 정리·스냅샷 1회 소비·다른 창의 탈취 차단·앱 종료 정리
- `src/adapters/components/Tools/popup/toolPopupSession.test.ts` (7) — 칸 모으기·되돌리기, **capture 가 담기 전에 멈추는지**
- `.../__tests__/timerHandoff.test.tsx` (8) — 타이머 3모드 왕복, 알람 1회, 실패 시 원복
- `.../__tests__/randomHandoff.test.tsx` (4) — 뽑기 입력·제외·이력 보존, 마운트 초기화가 지우지 않는지
- `.../__tests__/allToolsHandoff.test.tsx` (17) — **9종 전부** 왕복, 점수판·룰렛·QR·주사위·동전·신호등·활동기호 개별 보존
- `.../__tests__/mainToolPopupHost.test.tsx` (7) — 등록부 대조, 연속 클릭 ref 가드, 실패 복원, 중복 렌더 방지,
  **본문 페이지가 그대로일 때의 복귀**(아래 §4 결함 고정), 팝업 사용 중 재이관 차단
- `scripts/regression-grep-check.mjs` — REGRESSION **#74**(9종이 각자 이관 칸을 등록하는 표),
  **#75**(본문 페이지가 그대로일 때의 복귀 왕복 테스트)

## 2. 실제 Electron 창 검증 (수행함)

**환경** — 다른 세션이 `npm run electron:dev`(포트 5173)를 이미 쓰고 있어 **건드리지 않았다.**
대신 방금 만든 `dist/` 를 쓰는 **별도 인스턴스**를 띄웠다:

```
electron . --remote-debugging-port=9333 --user-data-dir=.qa-tool-popup-data
```

조종은 CDP 로 했다. 이때 쓴 시나리오 파일은 `.omc/tmp/`(git 제외 폴더)에 둔 **일회용**이라
저장소에 남지 않는다 — 아래에 원본 출력을 그대로 붙여 둔 이유다. 다시 해 보려면 저장소에 있는
`scripts/qa-cdp-driver.mjs` 로 같은 절차를 밟으면 된다. 사용자의 실제 데이터 폴더는 쓰지 않았고,
검증이 끝난 뒤 임시 데이터 폴더(`.qa-tool-popup-data`)는 지웠다.

### 2-1. 본문 ↔ 팝업 왕복 (`qa-run.mjs` 원본 출력)

```
1) 타이머 화면: true
2) 본문에서 4초 흐른 뒤 남은 시간: 04:56
3) 팝업 창 주소: dist/index.html?mode=toolPopup&tool=tool-timer&handoff=hoff-1788880751387-1
   팝업 안 남은 시간: 04:54 (옮기는 데 3초)
4) 본문이 "별도 창에서 사용 중" 안내로 바뀜: true
   [창 보기] 단추: true
5) 본문을 시간표로 옮긴 뒤 팝업 시간: 04:49 (계속 흐르는가: true )
6) 재열기: {"ok":true,"focusedExisting":true} 창 수 1 → 1
7) 허용목록 밖(자리뽑기·외부주소·칠판) 거절:
   [{"ok":false,"reason":"unsupported-tool"},{"ok":false,"reason":"unsupported-tool"},{"ok":false,"reason":"unsupported-tool"}]
8) 랜덤 뽑기 창 추가: {"ok":true,"focusedExisting":false} 열린 목록: ["tool-timer","tool-random"]
9) 항상 위 토글: true
10) 본문으로 가져오기 — 복귀 직전 04:44 → 본문 04:41 / 타이머 화면인가: true
    타이머 팝업이 닫혔는가: true
11) 정리 후 열린 목록: []
```

읽는 법: 04:56 → (3초 이동) → 04:54 는 **시간이 이어졌다**는 뜻이다(멈춰 있었다면 04:56 그대로,
두 번 세었다면 04:52 이하). 본문을 시간표로 옮긴 5초 뒤 04:49 로 계속 줄었다.

### 2-2. 알람은 한 번만 (`qa-alarm.mjs` 원본 출력)

종료 8초 전에 팝업으로 옮기고, 창마다 **알람이 만드는 AudioContext 생성 횟수**를 셌다.

```
0) 예고 알림 상태: 꺼짐
1) 남은 시간: 00:08
2) 본문 알람 카운터 시작: 0
3) 팝업 남은 시간: 00:06
4) 팝업에 "시간 종료" 떴는가: true
   본문에 "시간 종료" 떴는가(떠서는 안 됨): false
   본문은 안내 화면인가: true
5) 알람 소리 횟수 — 팝업: 1 / 본문: 0
6) 6초 더 기다린 뒤 — 팝업: 1 / 본문: 0
```

### 2-3. 9종 전부가 실제 창으로 열리고 정리된다

```
tool-timer: {"ok":true,"focusedExisting":true}      ← 앞서 띄워 둔 창을 앞으로 가져옴(새 창 아님)
tool-random: {"ok":true,"focusedExisting":true}
tool-traffic-light: {"ok":true,"focusedExisting":false}
tool-scoreboard: {"ok":true,"focusedExisting":true}
tool-roulette: {"ok":true,"focusedExisting":false}
tool-dice: {"ok":true,"focusedExisting":false}
tool-coin: {"ok":true,"focusedExisting":false}
tool-qrcode: {"ok":true,"focusedExisting":false}
tool-work-symbols: {"ok":true,"focusedExisting":false}
열린 창 수: 9
   tool-work-symbols → 🤫 | 활동 기호 | volume_up | keep | move_item | close | 🤫 | 조용히
   tool-qrcode → 🔗 | QR코드 | volume_up | keep | move_item | close | 🔗 URL
   tool-coin → 🪙 | 동전 던지기 | volume_up | keep | move_item | close | 앞 | ⊙
   tool-dice → 🎲 | 주사위 | volume_up | keep | move_item | close | 주사위 수: | 1
   tool-roulette → 🎯 | 룰렛 | volume_up | keep | move_item | close | folder_open
   tool-scoreboard → 📊 | 점수판 | remove | 100% | add | volume_up | keyboard | keep
   tool-traffic-light → 🚦 | 신호등 | volume_up | keep | move_item | close | 🖱️ 수동
   tool-random → 🎲 | 랜덤 뽑기 | volume_up | keep | move_item | close | 🎯 1명 뽑기
   tool-timer → ⏱️ | 타이머 | volume_up | keep | move_item | close | ⏱️ 타이머
정리 후: []
```

`keep`·`move_item`·`close` 는 각각 [항상 위]·[본문으로 가져오기]·[닫기] 아이콘이다.
9개를 동시에 띄워도 서로 방해하지 않았고, 전부 닫은 뒤 열린 목록이 비었다(창 잔재 없음).

### 2-4. 화면 갈무리

| 파일 | 내용 |
| --- | --- |
| [01-main-restored.png](tool-popup-qa/01-main-restored.png) | 팝업에서 [본문으로 가져오기] 한 직후 본문(04:40, 계속 진행 중). 머리줄 오른쪽에 새 [팝업으로 옮기기] 아이콘 |
| [02-main-in-use-notice.png](tool-popup-qa/02-main-in-use-notice.png) | 팝업 사용 중일 때 본문이 도구 대신 보여 주는 안내와 [창 보기] |
| [03-popup-timer-finished.png](tool-popup-qa/03-popup-timer-finished.png) | 팝업 창의 타이머 종료 화면. 머리줄에 항상 위·본문으로 가져오기·닫기. **덮개를 고치기 전에 찍은 것**이라 뒤 숫자가 비쳐 보인다(§5) |
| [04-popup-scoreboard.png](tool-popup-qa/04-popup-scoreboard.png) | 점수판 팝업(900×680) — 팀 색·이름·시작 단추 모두 닿는다 |
| [05-popup-random.png](tool-popup-qa/05-popup-random.png) | 랜덤 뽑기 팝업(620×760) — 모드 탭·자료원·뽑기 단추 모두 닿는다 |
| [06-tools-grid-new-window-button.png](tool-popup-qa/06-tools-grid-new-window-button.png) | 쌤도구 목록 — 카드 오른쪽 위 [새 창으로 열기]. 카드 높이·너비가 고르다 |
| [07-return-while-on-same-page.png](tool-popup-qa/07-return-while-on-same-page.png) | 본문 페이지를 그대로 둔 채 복귀했을 때의 본문(진행 중인 시간 유지) |

### 2-5. 검토 뒤 재확인 — 본문 페이지가 **그대로일 때**의 복귀 (`qa-return.mjs`)

아래 §4 의 결함을 고친 뒤, **본문을 다른 화면으로 옮기지 않고** 그대로 둔 채 복귀시켰다.
(앞선 2-1 은 본문을 시간표로 옮겼다 돌아오는 경로라 이 결함을 비껴갔다.)

```
1) 본문 남은 시간: 04:56
2) 팝업 남은 시간: 04:54
3) 본문 상태: 안내 화면          ← 시간표 등으로 옮기지 않았다
4) 복귀 직전 팝업: 04:50 → 본문: 04:47
   타이머 화면인가: true
   초기화(05:00)로 돌아가지 않았는가: true
   일시정지 단추가 보이는가(계속 돌고 있음): true
5) 3초 뒤 본문: 04:44 (계속 흐르는가: true )
   팝업이 닫혔는가: true
```

### 2-6. 쌤도구 카드 격자 실측 (검토 지적 반영)

카드 버튼을 감싸개로 덮으면서 격자 늘어남을 잃었던 것을 고친 뒤, 실제 화면에서 잰 값:

```
cards: [{"w":154,"h":174,"t":226} × 4, {"w":154,"h":174,"t":416} × 4]
```

같은 줄 카드의 높이·너비가 모두 같다(174 / 154). 갈무리는
[06-tools-grid-new-window-button.png](tool-popup-qa/06-tools-grid-new-window-button.png) —
지원 9종에만 새 창 아이콘이 붙고 설문 계열에는 붙지 않은 것도 함께 보인다.

### 2-7. 정리 뒤 재검증

죽은 코드를 지운 뒤 2-1(왕복)과 2-2(알람 1회) 시나리오를 **다시 실행해** 같은 결과를 얻었다
(왕복 04:56 → 04:54 → 04:49 → 04:41, 알람 팝업 1 / 본문 0).

## 3. 아직 검증하지 못한 것 (통과로 표시하지 않음)

이 세션에서 실행할 수 없었던 항목이다. **미검증이며, 오너 확인이 필요하다.**

1. **설치본(패키지된 앱)에서의 동작** — `electron-builder` 설치본은 만들지 않았다. `npm run build` 산출물로만 확인했다.
2. **다중 모니터·배율(100/150/200%)·모니터 분리 후 화면 안 복구** — 이 기기에서 보조 모니터를 붙였다 뗄 수 없다.
3. **절전 복귀 후 타이머·알람** — 실제 절전 진입/복귀를 일으키지 않았다. (`capturedAt` 기반 보정과 `system:resume` 전파 경로는 코드로만 확인.)
4. **QR 실제 스캔** — 휴대폰으로 찍어 보지 않았다.
5. **오래 켜 둔 뒤 CPU·메모리 관찰** — 반복 개폐 10회 이상 장시간 관찰은 하지 않았다. (짧은 개폐에서는 창 목록이 항상 `[]` 로 정리됐다.)
6. **개발용 브라우저 폴백(`window.open`)의 실제 동작** — 코드와 단위 검사로만 확인했고, 브라우저에서 손으로 눌러 보지 않았다.
7. **마우스로 직접 눌러 보는 손 검증** — 이번 조종은 CDP 로 요소를 눌렀다. 실제 마우스 입력·창 끌기·크기 조절은 오너 확인 몫이다.

## 4. 검토에서 잡혀 고친 것

reviewer(architect) 검증에서 **막는 결함 2건**이 나왔고, 둘 다 고친 뒤 다시 확인했다.

1. **팝업 → 본문 복귀 시 상태가 버려졌다.** 넘어온 스냅샷을 "첫 렌더에만" 읽어서, 본문이 이미
   그 도구 화면이면 화면이 다시 만들어지지 않아 스냅샷이 그대로 사라졌다(타이머가 05:00 으로
   초기화). 게다가 안 쓰인 봉투가 남아 나중에 **유령 알람**까지 울렸다.
   → 도착하는 대로 집어 세대 번호로 화면을 다시 만들게 고쳤다. §2-5 실기기 확인 + REGRESSION #75.
   **2-1 시나리오가 하필 본문을 시간표로 옮겼다 돌아오는 경로라 이 결함을 비껴갔다** — 검증
   시나리오가 우연히 안전한 길을 밟으면 통과해도 못 잡는다는 사례로 남긴다.
2. **쌤도구 카드가 격자 칸을 채우지 못했다.** 보조 버튼을 형제로 두려고 카드를 `<div>` 로 감쌌는데,
   그 순간 카드 버튼이 격자 항목이 아니게 되어 늘어남(stretch)을 잃었다.
   → 감싸개에 `h-full`, 버튼에 `w-full h-full`. §2-6 실측.

정리(deslop) 단계에서 읽는 곳이 없는 코드도 지웠다: 스토어의 `pendingToolId`/`setPending`,
창 관리자의 `ready`·`alwaysOnTop` 보관값과 `isAlwaysOnTop`, 창 계약의 `send`,
통로의 `kind`, domain 의 안 쓰이는 `ToolPopupHandoff` 타입. 지운 뒤 게이트를 다시 돌렸다.
(`ToolPopupHandoff` 는 계획에 있던 항목이라 **의도적으로 뺀 것**으로 보고서에 남겼다 —
실제 봉투 계약은 `ToolPopupSnapshotEnvelope`·`StoredHandoff`·`ClaimedHandoff` 에 있다.)

## 5. 곁가지로 함께 고친 것 — 타이머 "시간 종료!" 덮개

처음에는 "이번 작업 밖"으로 남겼는데, 오너가 이어서 마무리하라고 해서 고쳤다.

### 5-1. 무엇이 잘못돼 있었나

종료 덮개가 `bg-sp-bg/90` 을 쓰고 있었다. `sp-*` 토큰은 `var(--sp-bg)` 원본 문자열이라
Tailwind 가 투명도 수식을 합성하지 못하고 **규칙을 아예 만들지 않는다.** 두 가지로 확인했다.

```
# ① 컴파일 — /90 규칙이 생성조차 되지 않는다
.bg-red-600\/30 { background-color: rgb(220 38 38 / 0.3) }   ← 진짜 색이라 정상
.bg-sp-bg       { background-color: var(--sp-bg) }            ← 수식 없는 것만 생성
(.bg-sp-bg\/90 은 출력에 없음)

# ② 실제 앱에서 종료 상태를 만들어 계산된 값을 읽음
{ "backgroundColor": "rgba(0, 0, 0, 0)", "digitsBehindVisible": true, "digitsText": "00:00" }
```

즉 덮개가 **완전히 투명**해서 뒤의 7xl 숫자가 "시간 종료!" 글씨와 겹쳐 보였다
([08 갈무리](tool-popup-qa/08-timer-overlay-before.png) — 밝은 테마에서 특히 심하다).
빨간 점멸(`bg-red-600/30`)만 진짜 색이라 깜빡일 때만 덮개가 보였다.

### 5-2. 무엇을 바꿨나 (디자인 에이전트 협의 후)

프로젝트 규칙상 UI 변경은 단독으로 하지 않으므로 디자인 에이전트와 방향을 정했다. 세 줄이다.

| 자리 | 전 | 후 | 이유 |
| --- | --- | --- | --- |
| 덮개 배경 | `bg-sp-bg/90`(무효) | 인라인 `backgroundColor: 'var(--sp-bg)'` | 가릴 대상이 **같은 자리·같은 크기의 숫자**라 반투명이 곧 겹침이다. 90%로 살리는 대신 아예 불투명하게 덮는다 |
| 점멸 | `bg-red-600/30` | 그대로 | 진짜 색이라 이미 정상 동작한다. 테마마다 달라지면 안 되는 경보색이라 토큰화하지 않았다 |
| 글씨색 | `text-red-400` | `text-sp-error` | red-400 은 **밝은 테마에서 큰 글씨 기준(3:1)에도 미달**했다(아래) |

`--sp-bg` 를 쓴 이유: 유리 효과는 `--sp-card`·`--sp-glass-surface` 만 건드리고 `--sp-bg` 는
손대지 않는다(`useGlassSurface.ts` 확인). 그래서 사용자가 투명도를 어떻게 놓든 이 덮개는 항상 불투명하다.
`data-sp-floating`(REGRESSION #64)은 `bg-sp-card` 클래스 + absolute 조합에만 걸리는 계약이라 해당 없다.

### 5-3. 글씨색 대비 실측 (WCAG, 큰 글씨 기준 3:1 · 실제 72px)

| 테마 배경 | `text-red-400`(전) | `text-sp-error`(후) |
| --- | --- | --- |
| `#ffffff` 노션 | 2.77 ✗ | **4.83 ✓** |
| `#faf5ff` 파스텔 | 2.58 ✗ | **4.50 ✓** |
| `#e0e2e6` 라이트 | 2.13 ✗ | **3.72 ✓** |
| `#f5efe6` 크래프트 | 2.42 ✗ | **4.22 ✓** |
| `#f5f5f7` 뉴트럴 | 2.54 ✗ | **4.44 ✓** |
| 어두운 테마 7종 | 6.36~6.98 ✓ | **6.36~6.98 ✓** |

`sp-error` 는 테마별로 값이 갈리므로(라이트 `#dc2626` · 다크 `#f87171`) 분기 없이 양쪽을 넘긴다.

### 5-4. 고친 뒤 실측 (실제 Electron 창, 두 테마 모두)

```
밝은 테마(노션, --sp-bg #ffffff)
  overlayBg  "rgb(255, 255, 255)"   ← 전: rgba(0, 0, 0, 0)
  inlineBg   "var(--sp-bg)"
  textColor  "rgb(220, 38, 38)"     ← #dc2626, 대비 4.83
  fontSize   "72px"

어두운 테마(노션 다크, --sp-bg #191919) — 설정에서 실제로 테마를 바꿔 확인
  overlayBg  "rgb(25, 25, 25)"
  inlineBg   "var(--sp-bg)"
  textColor  "rgb(248, 113, 113)"   ← #f87171, 대비 6.36
```

갈무리: [08 전](tool-popup-qa/08-timer-overlay-before.png) ·
[09 후·밝은 테마](tool-popup-qa/09-timer-overlay-after-light.png) ·
[10 후·어두운 테마](tool-popup-qa/10-timer-overlay-after-dark.png).

### 5-5. 되돌아오지 못하게 못 박기 — REGRESSION #82

이 함정은 **코드 리뷰로 안 잡히고 게이트도 초록**이라, 누가 "정리"하며 클래스로 되돌리면 그대로 재발한다.
그래서 덮개가 인라인 `var(--sp-bg)` 를 쓰는지 확인하는 검사를 넣었다.
**변이 시험으로 진짜 잡는지 확인했다** — 옛 `bg-sp-bg/90` 로 되돌리니 `X REGRESSION #82` 로 떨어졌고,
원복하니 다시 통과했다(원복본은 바이트 단위로 동일함을 `diff` 로 확인).

### 5-6. 범위를 넓히지 않은 것

같은 함정이 저장소 전체에 수천 곳 퍼져 있다(쌤도구 폴더만 547곳). 그건 자리마다 "원래 얼마나
진해야 하는가"라는 디자인 판단이 필요한 별도 작업이라 손대지 않았다. 이번에 고친 건
**가림이 목적인 덮개 한 곳**이다. 팝업 지원 9종의 다른 전면 덮개는 확인해 보니
`bg-black/60`·`bg-white` 처럼 진짜 색을 쓰고 있어 문제가 없었다.

## 6. 다른 세션 변경 보호

작업 내내 `git status --short` 로 확인했고, 아래 파일은 **한 줄도 건드리지 않았다**:
과제수합·설문·학생 자기평가·학생 번호 규칙·모바일·supabase 함수 계열 전부.
`PROGRESS.md`·`docs/progress/2026-09.md`·`DECISIONS.md` 는 **덧붙이기만** 했다.
