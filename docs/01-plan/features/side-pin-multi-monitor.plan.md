# 옆핀 모니터 선택 — 구현 계획

- 작성일: 2026-08-27
- 근거 분석: `docs/03-analysis/side-pin-multi-monitor.analysis.md`
- 원 요구: `docs/01-plan/features/side-pin-v0.plan.md:67` "모니터 선택과 패널 너비 설정" (미구현분)
- 피드백: "옆핀을 듀얼모니터 중에서 다른 모니터 화면으로 보내고 싶어요"
- 결정 기록: `DECISIONS.md` ADR-075
- **진행 상태 (2026-08-27): M1~M5 구현 완료. 실기기 QA만 남음.**

---

## 1. 목표

**고른 모니터가 어느 것이든 그 모니터의 오른쪽 끝에 붙인다.**
지금은 항상 주 모니터의 오른쪽에만 붙는다 — 고칠 것은 그것뿐이다.
고른 값은 그 컴퓨터에만 저장되고, **모니터를 뺐다 꽂아도 사용자의 선택은 지워지지 않는다.**

### 하지 않는 것

- 왼쪽 가장자리에 붙이는 옵션 — **만들지 않는다**(오너 결정 2026-08-27, 분석 T2)
- 패널 너비 조절 UI — 같은 저장 파일을 쓰지만 별건이다
- 손잡이를 끌어서 옆 모니터로 던지기 — 후순위
- 옆핀 패널 안에서 고르기 — 고르는 순간 패널이 재생성돼 사라져 보인다(분석 §4)

---

## 2. 결정 사항 (오너 확인 완료 2026-08-27)

| #   | 내용                                                                | 결정                                                                                                |
| --- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| D1  | 왼쪽 모니터를 고르면 손잡이가 두 화면 경계에 놓여 조준이 필요해진다 | **감수한다.** 어느 모니터든 그 모니터의 오른쪽 끝에 붙이면 된다. 왼쪽 가장자리 지원은 만들지 않는다 |
| D2  | 진입점                                                              | **트레이 메뉴 + 설정(위젯/창 탭) 두 곳**                                                            |
| D3  | 단축키 "다음 모니터로 보내기"                                       | 이번에는 넣지 않는다                                                                                |

---

## 3. 마일스톤

### ✅ M1 — 저장 모델 분리 (분석 T1 해결, **가장 중요**) — 완료

지금은 `displayId` 하나가 "사용자가 고른 값"과 "실제로 쓰는 값"을 겸한다.
사용자가 고를 수 있게 되면 이 겸직이 곧바로 데이터 손실이 된다.

**변경**

- `src/domain/entities/SidePinDeviceState.ts` (정본)
  - `displayId` → 의미를 "사용자가 고른 모니터"로 고정하고 **시스템은 절대 덮어쓰지 않는다**
  - `displayHint` 추가 — 번호가 바뀌었을 때 다시 찾기 위한 보조 정보
    (`label`, `bounds` 요약). 분석 T4 대응
  - `normalizeSidePinDeviceState`가 새 필드를 안전하게 읽도록 확장 (없으면 `null`)
- `electron/sidePinDeviceState.ts` (사본) — 같은 내용 복제. `mirror.test.ts`가 동치를 강제한다
- `electron/sidePinGeometry.ts`
  - `pickDisplay`가 `id` → `displayHint` 순서로 찾도록 확장
  - 못 찾으면 지금처럼 주 모니터로 대체하고 `usedFallbackDisplay: true`
- `electron/sidePinService.ts:94-97`
  - **저장값 덮어쓰기를 제거한다.** 대체는 이번 실행에만 적용하고 파일은 건드리지 않는다
  - 대신 사용자가 명시적으로 고를 때만 저장한다

**테스트 (신규)**

| 파일                                | 검사                                                                  |
| ----------------------------------- | --------------------------------------------------------------------- |
| `sidePinGeometry.test.ts`           | id로 못 찾아도 hint(label·해상도)로 찾는다 / 둘 다 없으면 주 모니터   |
| `sidePinService.test.ts`            | **고른 모니터를 뺐다 꽂으면 원래 모니터로 되돌아온다** (T1 회귀 방지) |
| `sidePinService.test.ts`            | 뽑혀 있는 동안에는 주 모니터에 뜨지만 저장 파일은 그대로다            |
| `sidePinDeviceState.mirror.test.ts` | 정본↔사본 동치 (기존 테스트가 자동으로 잡는다)                        |

### ✅ M2 — 모니터 목록을 사람 말로 만들기 — 완료

**신규** `electron/sidePinDisplayLabels.ts` (순수 함수, Electron import 없음)

```ts
describeSidePinDisplays(displays, primaryDisplayId): SidePinDisplayChoice[]
// { id, name: '모니터 2', position: '오른쪽', resolution: '2560×1440', scalePercent: 150, isPrimary }
```

- 주 모니터의 x좌표와 비교해 `왼쪽 | 오른쪽 | 위 | 아래 | 같은 자리`를 정한다
- `label`이 비었거나 `\.\DISPLAY1` 형태면 번호로 대체한다
- 해상도는 `workArea`가 아니라 `bounds` 기준(사용자가 아는 값은 작업 표시줄 포함 크기다)

**테스트** `sidePinDisplayLabels.test.ts` — 좌우 배치, 음수 좌표 보조 모니터, 세로 배치,
label 빈 값, 3대 이상, 같은 좌표 중복

### ✅ M3 — main 배선 (IPC) — 완료

- `electron/sidePinService.ts` 에 `setPreferredDisplay(id: string | null): void` 추가
  - 저장 → `layout-changed` 발행 (모니터 변경과 같은 통로)
  - 편집 중이면(`memoEditorActivity`) **저장은 하되 재배치는 편집이 끝난 뒤로 미룬다** (분석 T3)
  - `null`이면 "자동(주 모니터)"으로 되돌린다
- `electron/main.ts` IPC 2개 (§ "옆핀" 블록, 3123행 근처)
  - `sidePin:list-displays` (invoke) → `describeSidePinDisplays()` 결과 + 현재 선택값
  - `sidePin:set-display` (invoke) → 적용 결과 반환
  - 옆핀을 아직 한 번도 안 켠 상태에서도 동작해야 한다 —
    "옆핀 손잡이 위치 초기화"(main.ts:2504)가 쓰는 **저장값만 고치는 방식**을 그대로 따른다
    (`ensureSidePin()`을 부르면 쓰지도 않을 커서 폴링 타이머가 돈다)
- `electron/preload.ts` (1120행 `sidePin` 블록) — `listDisplays` / `setDisplay` 추가
- `src/global.d.ts` (731행) — 타입 추가. **둘 다 `?.()`로 부를 수 있게 optional로 선언한다**
  (preload는 앱을 다시 켜야 갱신되므로 새 화면이 옛 preload 위에서 도는 시간이 있다)

### ✅ M4 — 트레이 메뉴 (1순위 진입점) — 완료

`electron/main.ts` 트레이 메뉴, "옆핀 손잡이 위치 초기화" 바로 위에 서브메뉴를 넣는다.

```
옆핀 모니터  ▸  ● 자동 (주 모니터)
                모니터 1 · 주 모니터 (1920×1080)
                모니터 2 · 오른쪽 (2560×1440)
```

- 모니터가 1대면 서브메뉴 자체를 숨긴다 (누를 이유가 없는 메뉴를 두지 않는다 — 2504행 선례)
- 트레이 메뉴는 만들 때 한 번 그려지므로, `screen`의 `display-added/removed`에서
  **메뉴를 다시 만든다**. 아니면 모니터를 꽂아도 목록에 안 나온다

### ✅ M5 — 설정 화면 (2순위 진입점) — 완료

`src/adapters/components/Settings/tabs/WidgetTab.tsx` — "창 닫기 동작"(297행) 위에
"옆핀 모니터" 항목을 넣는다.

- 값은 `useSettingsStore`가 아니라 **IPC로 직접 읽고 쓴다** (동기화되면 안 되는 기기 전용 값)
- 화면에 "이 설정은 이 컴퓨터에만 저장됩니다"를 한 줄 적는다 — 다른 설정과 동작이 다르므로
- 모니터 1대면 항목을 숨긴다
- Electron이 아닌 브라우저 모드(`npm run dev`)에서는 `window.electronAPI?.sidePin?.listDisplays`가
  없으므로 항목이 나타나지 않아야 한다
- 🎨 디자인 협업 규칙(`feedback_frontend_agent_collaboration.md`)의 **명시된 예외**로 처리했다 —
  새 컴포넌트·토큰·디자인 시스템 확장이 없고, 같은 파일의 "창 닫기 동작"·"앱 시작 시 모습"
  라디오 마크업을 **글자 그대로 재사용**했다. 새 시각 요소를 만들었다면 협업 대상이었다.

**구현 결과**

- `src/adapters/components/Settings/SidePinDisplaySection.tsx` (신규) — `draft`/`patch`를
  받지 않고 IPC와 직접 주고받는다(동기화 금지). 모니터 1대·브라우저 모드·옛 preload면
  **스스로 사라진다.**
- `WidgetTab.tsx`에 "창 닫기 동작" 바로 위로 넣었다.
- `deferred`(메모 작성 중)를 **실패로 다루지 않는다** — 라디오를 되돌리지 않고
  "메모 작성이 끝나면 옮겨집니다" 안내만 띄운다.
- 테스트 13건 (`SidePinDisplaySection.test.tsx`)

---

## 4. 파일 요약

| 파일                                                  | 성격                                             |
| ----------------------------------------------------- | ------------------------------------------------ |
| `src/domain/entities/SidePinDeviceState.ts`           | 수정 — 정본                                      |
| `electron/sidePinDeviceState.ts`                      | 수정 — 사본(MIRROR 블록)                         |
| `electron/sidePinGeometry.ts`                         | 수정 — `pickDisplay` 확장                        |
| `electron/sidePinService.ts`                          | 수정 — 덮어쓰기 제거, `setPreferredDisplay` 추가 |
| `electron/sidePinDisplayLabels.ts`                    | **신규** — 순수 함수                             |
| `electron/main.ts`                                    | 수정 — IPC 2개, 트레이 서브메뉴                  |
| `electron/preload.ts` · `src/global.d.ts`             | 수정 — API 노출·타입                             |
| `src/adapters/components/Settings/tabs/WidgetTab.tsx` | 수정 — 설정 항목                                 |
| 테스트 4종                                            | 신규·확장                                        |

`electron/sidePinElectron.ts`는 `readDisplays`가 이미 필요한 것을 다 넘겨주므로
`label`·`bounds` 추가 외에는 손대지 않는다.

---

## 5. 검증

### 자동 (완료 선언 전 전부 통과해야 함)

```bash
npx tsc --noEmit
npm run lint
npm run test              # electron 코드를 실제로 보는 유일한 게이트
npm run regression-check
```

**2026-08-27 M1~M4 실행 결과**

| 게이트                            | 결과                                        |
| --------------------------------- | ------------------------------------------- |
| `npx tsc --noEmit`                | 옆핀 관련 오류 0건                          |
| `npm run lint`                    | 오류 0 (경고 135건은 전부 손대지 않은 파일) |
| `npm run test`                    | 옆핀 테스트 177건 통과 (신규 21건 포함)     |
| `npm run regression-check`        | 51/51 통과                                  |
| `node scripts/build-electron.mjs` | 성공 — main.ts 구문 이상 없음               |

`tsconfig.electron.json`은 rootDir 제약으로 원래 통과하지 않는 설정이라 게이트가 아니다.
그 안에서 **이번 변경이 새로 만든 오류는 없다**(기존 오류만 남음).

### 실기기 QA (듀얼 모니터 필요 — 오너 확인 사항)

| #   | 확인                                  | 통과 기준                                                                              |
| --- | ------------------------------------- | -------------------------------------------------------------------------------------- |
| Q1  | 트레이에서 보조 모니터 선택           | 손잡이가 그 모니터 오른쪽 끝으로 즉시 옮겨간다                                         |
| Q2  | 앱 재시작                             | 고른 모니터에 그대로 뜬다                                                              |
| Q3  | **케이블 뽑기 → 다시 꽂기**           | 뽑으면 주 모니터, **꽂으면 원래 모니터로 복귀** (T1)                                   |
| Q4  | 배율 다른 모니터로 이동 (100% ↔ 150%) | 손잡이 크기가 눈으로 같고, 패널이 잘리지 않는다 (T3)                                   |
| Q5  | 왼쪽 모니터 선택                      | 그 모니터의 오른쪽 끝에 정확히 붙고 화면 밖으로 나가지 않는다. 잡기 불편함은 감수 (D1) |
| Q6  | 메모 작성 중 모니터 변경              | 쓰던 글이 사라지지 않는다 (T3)                                                         |
| Q7  | 모니터 3대                            | 목록에 3개가 나오고 위치 표시가 맞다                                                   |
| Q8  | 모니터 1대                            | 트레이·설정에서 항목이 보이지 않는다                                                   |
| Q9  | 옆핀을 한 번도 안 켠 채로 선택        | 오류 없이 저장되고, 처음 켤 때 그 모니터에 뜬다                                        |

Q3·Q4가 이 작업의 핵심 회귀 지점이다.

---

## 6. 위험과 대응

| 위험                                  | 대응                                                                  |
| ------------------------------------- | --------------------------------------------------------------------- |
| 사용자 선택이 지워진다 (T1)           | M1에서 저장값 덮어쓰기 제거 + 회귀 테스트 고정                        |
| 왼쪽 모니터에서 손잡이 잡기 불편 (T2) | **감수하기로 결정(D1).** 목록의 위치 표시는 모니터를 알아보기 위한 것 |
| 모니터 이동 중 메모 초안 소실 (T3)    | 편집 중이면 재배치를 미룬다                                           |
| 모니터 번호가 바뀌어 못 찾는다 (T4)   | `displayHint`(label·해상도)로 2차 탐색                                |
| 트레이 목록이 낡는다                  | `display-added/removed`에서 메뉴 재생성                               |
| MIRROR 블록 불일치                    | 기존 `sidePinDeviceState.mirror.test.ts`가 강제                       |

---

## 7. 순서

M1 → M2 → M3 → M4 → M5.

M1을 먼저 하는 이유는 분석 §3-T1 때문이다. 진입점(M4·M5)을 먼저 만들면
**"고를 수는 있는데 케이블만 뽑으면 지워지는"** 상태로 출시될 수 있다.
M1까지만 해도 코드는 안전한 상태로 멈출 수 있고, M4만 붙여도 기능은 성립한다.
