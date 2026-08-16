# Plan — 옆핀 고도화 A: 가장자리 UX (A1 높이 슬롯 · A2 클릭통과 · A3 단축키)

- **작성일**: 2026-08-15
- **상태**: 구현 및 자동 검증 완료 (Electron 실기기 QA 필요)
- **근거**: [side-pin-enhancement-ideas.plan.md](./side-pin-enhancement-ideas.plan.md) §3-A (A1·A2·A3)
- **기준 문서**: [side-pin.plan.md](./side-pin.plan.md) (v0.4 확정 기획서) — 이 문서는 기획서를 대체하지 않는다.
- **영향 버전**: 미정 (sidePinPreferences.enabled 기본값이 false인 미출시 상태 기준)

---

## 1. 기능 개요

옆핀의 "잠깐 확인하고 닫는다"는 목적을 유지하면서, 여는 방법과 손잡이의 자리를 개선한다.

| #   | 기능                   | 한 줄 요약                                                                          |
| --- | ---------------------- | ----------------------------------------------------------------------------------- |
| A3  | **단축키 열기/닫기**   | 글로벌 단축키 한 번으로 옆핀을 열고 닫는다. 기존 단축키 체계에 합류한다.            |
| A1  | **손잡이 높이 슬롯**   | 손잡이를 화면 세로 8칸 중 원하는 칸에 두고 드래그로 옮긴다. 창은 하나 그대로다.     |
| A2  | **접힌 rail 클릭통과** | 접힌 상태에서는 손잡이 칩 부분만 클릭을 받고 나머지 투명 영역은 뚫고 지나가게 한다. |

구현 순서는 이 문서 순서대로: **A3 → A2 → A1**. 난이도 낮은 것부터 (아이디어 문서 우선순위 1위가 A3).

## 2. 사용자 가치

- **A3**: 글을 쓰다가 키보드만으로 메모를 꺼내 본다. 마우스를 화면 가장자리까지 보낼 필요가 없다.
- **A1**: 주로 쓰는 위젯이 화면 상단/하단에 있어도 손잡이를 그 근처로 옮겨 둔다. 마우스 이동 거리가 짧아진다.
- **A2**: 최대화한 창의 스크롤바가 화면 오른쪽 끝에 있어도 옆핀 때문에 누르지 못하는 일이 사라진다. v2.3.8 위젯 손잡이 사고("겹쳐 보이는 것보다 안 눌리는 게 컸다")와 같은 계열의 문제를 막는다.

---

## 3. 현황 조사 결과 (2026-08-15 코드 기준)

구현에 앞서 관련 코드를 읽고 확인한 사실:

| 항목             | 현황                                                                                                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 단축키 상태 전이 | **이미 구현돼 있다.** `SidePinEvent`에 `shortcut-toggle`이 있고 `resolveSidePinTransition`이 열기/닫기를 처리한다. `openReason: 'shortcut'`으로 포커스를 가져오는 규칙(`focusFor`)도 있다. **없는 것은 키 등록과 배선뿐**이다. |
| 단축키 인프라    | `settings.shortcuts.bindings`(6종: quickAdd 5종 + sticker-picker) → `useGlobalShortcuts`(렌더러 keydown) → `syncShortcuts` IPC → 메인 globalShortcut. sticker-picker처럼 **메인 프로세스가 직접 처리하는 선례**가 있다.        |
| 손잡이 위치      | `sidePinGeometry.ts`의 `rightEdgeTab()`이 **항상 세로 가운데**에 놓는다. 좌표는 저장하지 않는다(모니터 구성이 바뀌면 무효화되므로 매번 재계산).                                                                                |
| 기기 전용 저장   | `SidePinDeviceState`(스키마 v1: `displayId`, `panelWidth`)가 `userData/side-pin-device-state.json`에 원자적 저장된다. 도메인 정본 + electron 미러 구조.                                                                        |
| 클릭 가로채기    | rail 창은 52 DIP 폭 × 168 DIP 높이. **전체 사각형이 클릭을 받는다.** `setIgnoreMouseEvents`는 현재 쓰지 않는다. 메인이 50ms 간격으로 실제 커서 좌표를 폴링해 칸(rail-widget/rail-memo)을 판정한다(`sidePinPointerRegion.ts`).  |
| 창 구조          | rail(접힘)과 panel(펼침) 두 창. 패널 펼침 시 rail은 숨는다. 접힘 상태에서 rail만 화면에 떠 있다.                                                                                                                               |
| 옆핀 켜기 경로   | `closeAction: 'sidePin'`으로 X 버튼 누르면 옆핀 활성화. 설정 UI는 WidgetTab에 있다.                                                                                                                                            |

---

## 4. Phase 구성

### Phase A3 — 단축키 열기/닫기 (가장 먼저)

**범위**

1. `Settings` 도메인: `QuickAddShortcutId`에 `'sidePin:toggle'` 추가, `DEFAULT_SHORTCUTS.bindings`에 `{ combo: 'mod+alt+p', enabled: true }` 추가.
2. `useGlobalShortcuts.ts`: `sidePin:toggle`은 sticker-picker와 같은 방식(메인 IPC 위임 + 렌더러 keydown 이중 경로, debounce 250ms)으로 처리. 단, **렌더러 keydown 경로는 메인 창이 포커스일 때만** 동작해야 한다 — 옆핀 패널 창이 포커스를 갖고 있을 때 메인 렌더러의 keydown은 오지 않으므로 자연히 해결된다.
3. 메인 프로세스: `syncShortcuts` IPC의 globalShortcut 등록에 `sidePin:toggle` 포함. 트리거 시 `sidePinService.dispatch({ type: 'shortcut-toggle' })`.
4. **보호 상태 가드**: `shortcut-toggle` 전이가 이미 `isSidePinResponsive`(enabled + protectedReason null)로 막고 있으므로 잠금·절전·전체화면 중에는 동작하지 않는다. 확인만 하면 된다.
5. **비활성 상태 동작**: 옆핀이 꺼져 있으면(`enabled: false`) 단축키는 아무 일도 하지 않는다(전이 규칙이 이미 무시한다). 단축키로 켜는 것은 범위 밖 — "켜는" 것은 설정이라는 제품 결정 유지.
6. ShortcutsTab: COMMANDS 목록에 "옆핀 열기/닫기" 행 추가 (아이콘: `view_sidebar`, 색: text-sp-accent).

**주의점**

- 충돌 검사: ShortcutsTab의 중복 검출이 자동으로 새 항목을 포함한다. `mod+alt+p`가 기존 6종과 겹치지 않음을 확인했다(t/e/m/n/b/e — p 없음).
- 이중 트리거: globalShortcut(OS 전역)과 렌더러 keydown(메인 창 포커스)이 같은 키로 동시에 잡힐 수 있다. sticker-picker의 250ms debounce 패턴을 그대로 따른다.

**작업 파일**

| 파일                                                     | 작업                                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `src/domain/entities/Settings.ts`                        | `QuickAddShortcutId` 유니언에 `'sidePin:toggle'` 추가                          |
| `src/adapters/stores/useSettingsStore.ts`                | `DEFAULT_SHORTCUTS.bindings`에 `sidePin:toggle` 추가                           |
| `src/adapters/hooks/useGlobalShortcuts.ts`               | `sidePin:toggle` 분기 추가 (sticker-picker 패턴)                               |
| `electron/main.ts` (또는 단축키 처리 모듈)               | `sidePin:toggle` → `sidePinService.dispatch({ type: 'shortcut-toggle' })` 배선 |
| `src/adapters/components/Settings/tabs/ShortcutsTab.tsx` | COMMANDS에 행 추가                                                             |
| `src/adapters/hooks/useGlobalShortcuts.ts` 대응 테스트   | 신규/수정 — sidePin:toggle 트리거 경로                                         |

### Phase A2 — 접힌 rail 클릭통과

**목표**: 접힌 상태에서 rail 창의 **투명 영역이 클릭을 가로채지 않게** 한다.

**설계**

- Electron `setIgnoreMouseEvents(true, { forward: true })`를 쓴다. `forward: true`면 렌더러로 mouse-move 이벤트는 계속 오므로 호버 감지(칩 위)도 유지된다.
- **토글 지점은 메인의 pointer 폴링 루프**(`sidePinElectron.ts`의 50ms `syncPointerRegion`)에 둔다. 이미 실제 커서 좌표와 `resolveSidePinPointerRegion` 판정이 여기 있으므로, 판정 결과(`outside` vs `rail-widget`/`rail-memo`)에 따라 `setIgnoreMouseEvents`를 켜고 끈다:
  - 판정 = `rail-widget` 또는 `rail-memo` → `setIgnoreMouseEvents(false)` (칩 위, 클릭 받음)
  - 판정 = `outside` → `setIgnoreMouseEvents(true, { forward: true })` (뚫고 지나감)
- **패널 펼침 상태에서는 절대 클릭통과하지 않는다.** 패널 창 자체는 그대로 두고, rail 창이 숨는 구조이므로 자연히 해결된다. 레일이 살아있는 상태(surface: collapsed)에서만 적용.
- **파생 효과 확인 필요**: 클릭통과 상태에서는 칩 위로 마우스가 와도 OS가 칩에 이벤트를 주지 않는다. 단 `forward: true` + 50ms 폴링이 실제 커서 위치를 계속 보고 있으므로 칩 위 진입을 감지하면 즉시 `setIgnoreMouseEvents(false)`로 복귀 → 이후 클릭 가능. 폴링 간격(50ms) 안에서의 클릭 유실 가능성은 있다(칩 진입 후 0~50ms 사이 클릭). 수용한다 — 손잡이는 머무르고 여는 대상이지 즉시 클릭의 대상이 아니다.
- **레거시 창(단일 창 모드)은 건드리지 않는다.** `getSidePinRendererSurface`가 'legacy'를 돌려주는 옛 구성은 지원 범위 밖이되, 동작이 나빠지지 않게 토글 조건에 surface 기반 창 존재 확인을 넣는다.

**작업 파일**

| 파일                                    | 작업                                                                                      |
| --------------------------------------- | ----------------------------------------------------------------------------------------- |
| `electron/sidePinWindow.ts`             | `SidePinWindowLike`에 `setClickThrough(enabled: boolean): void` 추가 (선택적 메서드로)    |
| `electron/sidePinBrowserWindow.ts`      | adapt()에 `setClickThrough` 구현 (`setIgnoreMouseEvents(enabled, { forward: enabled })`)  |
| `electron/sidePinElectron.ts`           | `syncPointerRegion`에서 판정 결과에 따라 rail 창 토글. 무의미한 반복 호출 방지(상태 캐시) |
| `electron/sidePinPointerRegion.test.ts` | 토글 판정 순수 함수 테스트 추가                                                           |

### Phase A1 — 손잡이 높이 슬롯

**목표**: 손잡이 세로 위치를 8칸 슬롯 중 하나로 골라 두고, 손잡이 드래그로 옮긴다.

**설계**

1. **값 모델**: `railSlot: 0..7` (0=맨 위, 7=맨 아래). 절대 좌표가 아니라 **칸 번호**를 저장한다 — 모니터 구성·해상도가 바뀌어도 칸 번호는 유효하기 때문. 기본값 3 또는 4(현재의 "가운데"와 같은 위치).
2. **기기 전용 저장**: `SidePinDeviceState`에 `railSlot` 추가. **스키마 버전 1 유지 + optional 필드** — `normalizeSidePinDeviceState`가 없는 값(undefined)을 기본 슬롯으로 정규화하므로 마이그레이션 불필요. 도메인 정본(`src/domain/entities/SidePinDeviceState.ts`)과 electron 미러(`electron/sidePinDeviceState.ts`) **양쪽 모두** 수정 — mirror 테스트가 동치를 강제한다.
3. **위치 계산**: `sidePinGeometry.ts`의 `rightEdgeTab()`이 `area.y + railSlot × (area.height - rail높이) / 7` 형태로 y를 계산. `resolveSidePinLayout` 입력에 `railSlot` 추가. clamp: rail 높이(168)가 화면보다 큰 화면에서는 기존 동작 유지.
4. **드래그 UX**: rail 창은 `movable: false`라 OS 드래그가 안 된다. 대신:
   - rail 렌더러에서 칩 영역에 드래그 시작 감지(포인터다운 + 이동 임계값 4px)
   - 이동 중: 렌더러가 커서 화면 좌표를 IPC로 보내고, 메인이 그 y에서 슬롯 번호를 계산해 rail 창 위치를 즉시 옮긴다(`setPosition`만, 창 재생성 없음)
   - 드래그 종료: 확정된 `railSlot`를 `SidePinDeviceState`에 저장
   - 드래그 중에는 호버 펼침(reveal 예약)을 취소한다 — 드래그하다 패널이 펼쳐지면 손잡이를 놓친다. 전이 규칙에 드래그 중 펼침 금지 반영.
5. **패널 위치는 그대로**: 패널은 화면 오른쪽 전체 높이를 쓰는 구조를 유지한다(펼침 시 세로 위치가 바뀌면 열림 애니메이션 좌표가 흔들린다). 이는 아이디어 문서의 "단일 창 안의 배치값" 원칙과 일치한다.
6. **설정 UI**: Phase 1에서는 드래그만 둔다. 설정 패널의 슬롯 선택 UI는 사용자 피드백 후 추가 여부 결정 (안티-범위: 불필요한 설정 증식).

**작업 파일**

| 파일                                              | 작업                                                       |
| ------------------------------------------------- | ---------------------------------------------------------- |
| `src/domain/entities/SidePinDeviceState.ts`       | `railSlot` 필드 + 정규화 (clamp 0..7)                      |
| `electron/sidePinDeviceState.ts`                  | 미러 동기화                                                |
| `electron/sidePinGeometry.ts`                     | `rightEdgeTab` 슬롯 계산 + `SidePinLayoutInput.railSlot`   |
| `electron/sidePinGeometry.test.ts`                | 슬롯 경계(0/7), 짧은 화면, 다중 모니터 케이스              |
| `electron/sidePinService.ts`                      | `getLayout`에 device.railSlot 전달                         |
| `src/adapters/components/SidePin/SidePinRail.tsx` | 칩 드래그 감지 + IPC                                       |
| `electron/preload.ts` + `global.d.ts`             | 드래그 이벤트 IPC 노출                                     |
| `electron/sidePinElectron.ts`                     | 드래그 좌표 → 슬롯 계산 → setPosition + 저장               |
| `src/domain/services/resolveSidePinTransition.ts` | 드래그 중 펼침 취소 규칙 (신규 이벤트 `rail-drag-changed`) |
| 관련 테스트                                       | transition/geometry/service 갱신                           |

---

## 5. 도메인 규칙 준수 체크

- ✅ `domain/` 레이어 외부 의존성 import 없음 — `SidePinDeviceState.railSlot`은 값 객체 수정만
- ✅ `any` 금지 — 모든 IPC payload는 `unknown` 수신 후 좁히기 (기존 패턴)
- ✅ 하드코딩 HEX 금지 — ShortcutsTab 새 행은 기존 토큰 재사용
- ✅ UI 텍스트 전부 한국어
- ✅ 기획서 원칙 — 영역별 멀티 창 아님(A1은 단일 rail 창의 배치값), 전체 높이 상주 오버레이 아님(A2는 오히려 비용 감소), 데이터 복제본 없음(칸 번호만 저장)

## 6. 위험 요소 및 대응

| 위험                                        | 영향                | 대응                                                                                                           |
| ------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------- |
| A2: 클릭통과 후 칩 진입 감지 지연(≤50ms)    | 극히 드문 클릭 유실 | 폴링은 이미 50ms로 돌고 있음. 체감 문제 없을 것으로 보나 수동 QA에서 확인                                      |
| A2: `forward: true` 미지원 플랫폼(mac 일부) | 호버 감지 상실      | Windows 전용 서비스라 리스크 낮음. 미지원 시 forward 없이도 50ms 폴링이 감지 유지(렌더러 mouseenter 의존 제거) |
| A3: globalShortcut 등록 실패(다른 앱 선점)  | 단축키 무반응       | 기존 체계와 동일 — ShortcutsTab에서 사용자가 조합 변경 가능                                                    |
| A1: 드래그 중 `setPosition` 빈도            | 창 깜빡임           | 슬롯 번호가 바뀔 때만 setPosition (슬롯 경계 통과 시에만)                                                      |
| A1: railSlot 저장 실패                      | 위치 초기화         | 원자적 저장 기존 인프라 재사용. 실패 시 이번 세션 값만 유지                                                    |
| 다른 세션 동시 작업                         | 충돌                | 시작 전 `git status --short` 확인. sidePin 영역은 현재 다른 세션 작업 없음(2026-08-15 확인)                    |

## 7. 검증 게이트 (각 Phase 완료 조건)

```bash
npx tsc --noEmit              # 0 errors
npm run lint                  # 0 errors
npm run test                  # 기존 옆핀 스위트(118개) + 신규 테스트 통과
npm run regression-check      # 통과
```

수동 검증 (A3): 메인 창 포커스 상태에서 단축키 → 열림/닫기. 다른 앱 포커스에서 단축키 → 열림(전역). 잠금 화면 복귀 직후 → 동작 안 함(보호). 단축키 설정 변경 → 즉시 반영.

수동 검증 (A2): 접힌 상태에서 rail 투명 영역 아래 최대화 창의 스크롤바 클릭 → 동작. 칩 위 호버 180ms → 패널 펼침. 칩 클릭 → 즉시 펼침.

수동 검증 (A1): 칩 드래그 → 슬롯 스냅 이동. 재시작 → 위치 유지. 모니터 해상도 변경 → 칸 번호 기준 재배치(화면 밖 아님). 드래그 중 패널 펼침 없음.

## 8. 안티-범위 (하지 않는 것)

- 손잡이 자유 위치(픽셀 단위) — 슬롯만. 자유 위치는 저장·복원 복잡도만 더한다.
- 패널의 세로 위치 변경 — 패널은 항상 오른쪽 전체 높이 유지.
- 단축키로 위젯/메모 각각 열기(아이디어 문서의 "특정 위젯 열기") — Phase 1에서는 토글만. 필요 시 후속.
- 옆핀 켜기/끄기 단축키 — 켜기는 설정(X 버튼의 closeAction)의 영역이라는 기존 제품 결정 유지.
- 클릭통과를 패널 펼침 상태에 적용.

## 9. 다음 단계

1. **이 Plan 승인** (사용자 확인)
2. Phase A3 구현 → 검증 게이트 → 보고
3. Phase A2 구현 → 검증 게이트 → 보고
4. Phase A1 구현 → 검증 게이트 → 보고
5. 각 Phase 완료 후 side-pin-enhancement-ideas.plan.md §3-A 해당 항목에 완료 표시

## 10. 참고

- 기준 기획서: [side-pin.plan.md](./side-pin.plan.md)
- 아이디어 원본: [side-pin-enhancement-ideas.plan.md](./side-pin-enhancement-ideas.plan.md) §3-A
- 관련 코드: `electron/sidePinGeometry.ts`, `electron/sidePinPointerRegion.ts`, `electron/sidePinElectron.ts`, `electron/sidePinDeviceState.ts`, `src/domain/services/resolveSidePinTransition.ts`, `src/adapters/hooks/useGlobalShortcuts.ts`, `src/adapters/components/Settings/tabs/ShortcutsTab.tsx`

## 11. 구현 결과 (2026-08-16)

- A3: `mod+alt+p` 기본 단축키와 설정 화면을 추가하고, 전역·렌더러 경로가 겹쳐도 한 번만 토글되도록 main 공용 250ms 게이트를 적용했다.
- A2: 접힌 손잡이의 44×44 DIP 버튼 두 곳만 입력을 받고, 나머지 rail 영역은 아래 창으로 클릭이 통과한다.
- A1: 손잡이를 세로로 끌어 0~7의 8단계 위치에 놓고 기기 상태 파일에 저장한다. 드래그 중에는 호버 열기와 클릭 통과를 잠시 멈춘다.

### 11.1 단축키 체계 안정화 (A3 후속, 같은 날)

A3을 붙이면서 기존 단축키 체계에서 드러난 문제 6건을 함께 고쳤다. 옆핀 전용이 아니라 단축키 기능 전체에 적용된다.

| #   | 문제                                                                                                                                                       | 처리                                                                                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 설정 단축키를 다시 등록할 때 `globalShortcut.unregisterAll()`이 위젯·모달 등 **다른 곳이 잡아 둔 전역 키까지 해제**했다                                    | `electron/ownedGlobalShortcutRegistry.ts` 신규 — 설정에서 만든 키만 추적해 그것만 해제한다                                                                              |
| 2   | 전역 등록과 렌더러 폴백의 이중 트리거를 **명령마다 따로** 막고 있었다                                                                                      | `electron/shortcutTriggerGate.ts` 신규 — 250ms 게이트를 공용화해 이모티콘·옆핀이 같은 규칙을 쓴다                                                                       |
| 3   | 조합에 Ctrl/Alt 없이 **글자 하나만 저장**할 수 있어 일반 타자를 가로챌 수 있었다                                                                           | 저장(`KeyCaptureInput`)·렌더러 실행(`useGlobalShortcuts`)·메인 등록(`applyGlobalShortcuts`) **세 곳 모두**에서 `isSafeGlobalCombo`로 막고, 저장 시 안내 토스트를 띄운다 |
| 4   | 키 입력을 받는 중에도 **기존 전역 단축키가 살아 있어** 그 키가 먼저 실행됐다                                                                               | `shortcuts:capture-active` IPC 신규 — 입력받는 동안 설정 단축키 등록을 잠시 풀고, 끝나면 마지막 설정으로 되돌린다                                                       |
| 5   | 중복 검사가 **문자열 그대로 비교**해서 `ctrl+alt+t`와 `mod+alt+t`를 다른 키로 봤다. 꺼 둔 단축키를 다시 켤 때는 검사 자체가 없었다                         | `canonicalizeCombo`로 정규화해 비교하고, 다시 켜는 경로에도 같은 검사를 넣었다                                                                                          |
| 6   | 이모티콘 피커가 이미 떠 있을 때 메인이 보내는 명령 ID가 실제 처리 ID와 **어긋나** 있었다 (`sticker-picker:toggle` → 화면은 `sticker-picker:show`를 기다림) | 메인이 `sticker-picker:show`를 보내도록 맞췄다                                                                                                                          |

추가로 전역 등록에 실패한 단축키가 있으면 조용히 넘어가지 않고 사용자에게 토스트로 알린다. 설정 화면의 토글 두 종류는 실제 누를 수 있는 영역이 3~6px에 불과해 44×44로 넓혔다(보이는 크기는 그대로).

**신규 테스트 7파일 23건** — `ownedGlobalShortcutRegistry` / `shortcutTriggerGate` / `keyNormalize` / `useGlobalShortcuts` / `useSettingsStore.shortcuts` / `ShortcutsTab` / `StickerPickerApp.shortcut`.

### 11.2 검증 결과

- `npx tsc --noEmit` — 0 errors
- `npm run lint` — 0 errors (기존 경고 135건, 이번 변경과 무관)
- `npx vitest run --maxWorkers=1 --no-file-parallelism` — **417 files / 4,977 passed / 10 skipped / 0 failed**
- `npm run regression-check` — 40/40 passed
- `npm run build:electron` — 성공

### 11.3 남은 확인 (실기기 수동)

`electron/`은 `npx tsc --noEmit` 검사 대상이 아니고 Electron 런타임 동작은 자동 테스트로 덮이지 않는다. 다음은 실제 Windows에서 눈으로 확인해야 한다.

1. **A3** — 다른 앱에 포커스가 있을 때 `Ctrl+Alt+P`로 옆핀이 열리는가. 잠금 화면 복귀 직후에는 동작하지 않는가.
2. **A3 후속** — 설정에서 키를 바꾸는 중에 그 키가 먼저 실행되지 않는가. 등록 실패 시 토스트가 뜨는가. 단축키를 바꾼 뒤에도 위젯·모달의 다른 전역 키가 그대로 동작하는가(문제 1의 회귀 확인).
3. **A2** — 최대화한 창의 스크롤바가 손잡이 뒤에 있을 때 눌리는가. 칩 위 호버 180ms에 패널이 펼쳐지는가.
4. **A1** — 손잡이 드래그가 8단계로 스냅되는가. 앱을 껐다 켜도 위치가 유지되는가. 배율이 다른 모니터에서도 화면 밖으로 나가지 않는가.
