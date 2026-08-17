# 계획: 위젯 화면 이탈 방지 및 가시성 보장 (Widget Screen Boundary Clamping & Visibility Guard)

> 작성: 2026-08-17 · 유형: plan · 근거: 사용자 진단 로그(`native-desktop-diag.log`) 실증 분석 + `electron/platform/win32Desktop.ts` / `electron/main.ts` 확인

---

## 0. 배경 한 문단

사용자 진단 로그 분석 결과, 바탕화면 아래 모드(`native-desktop`)에서 위젯 헤더를 잡고 드래그하는 도중 위젯이 화면 맨 아래(`Y=1063`, 모니터 해상도 1080px 기준)로 밀려나 화면 밖으로 완전히 벗어나는 현상이 확인되었다. 현재 쌤핀의 위젯 이동(`moveWidget`) 및 모드 전환 로직은 모니터 가시 작업 영역(WorkArea)에 대한 **경계 제한(Clamping) 및 이탈 감지 보정**이 없어, 사용자가 마우스를 크게 내리거나 모니터 해상도가 바뀔 때 위젯이 사라져 기능이 동작하지 않는 것처럼 오인하게 된다. 이에 **드래그 중 경계 이탈 방지(Drag Clamping)** 및 **위젯 모드 전환/표시 시 가시성 자동 보장(Ensure Visible)** 기능을 구현한다.

---

## 1. 핵심 원칙 (설계 제약)

1. **Clean Architecture 준수**:
   - 화면 경계 계산 및 위치 보정 알고리즘은 외부(Electron) 비의존적인 순수 도메인/유틸 함수로 분리하여 단위 테스트로 100% 검증한다.
2. **다중 모니터(Multi-display) 호환**:
   - 가상 화면 전체(Virtual Screen) 및 각 개별 모니터의 작업 영역(WorkArea, 작업표시줄 제외 영역)을 정확히 인식하고, 음수 좌표(좌측/상단 모니터)에서도 정상 동작해야 한다.
3. **마우스 드래그 성능 유지 (Hot Path 최적화)**:
   - `WH_MOUSE_LL` 마우스 훅 콜백 안에서 동작하는 드래그 이동 로직은 매 프레임 수 밀리초 내에 처리되어야 하므로 무거운 I/O나 IPC 없이 순수 산술 연산으로 Clamping을 수행한다.
4. **부작용 방지 (Safe Fallback)**:
   - 화면 밖으로 이탈한 위젯을 안전 영역으로 복구할 때 기존 사용자 설정 크기(width, height)를 보존하고 위치(x, y)만 안전 가시 영역 내로 당겨온다.

---

## 2. 현재 상태와 문제점 (로그 실증 분석 기반)

1. **`win32Desktop.ts`의 드래그 이동 시 경계 검사 부재**:
   - 헤더 드래그 시 `newPos = { x: startBounds.x + delta.x, y: startBounds.y + delta.y }`를 계산한 뒤 아무런 상/하/좌/우 한계치 검사 없이 `moveWidget()`(`SetWindowPos`)을 호출함.
   - 사용자가 마우스를 아래로 1,000픽셀 끌어내리면 위젯이 화면 바닥을 뚫고 내려가 헤더의 최소 잡기 영역조차 남지 않음.
2. **위젯 모드 진입(`attachAndShow`) 시 기존 좌표 검증 부재**:
   - 저장된 위젯 좌표가 현재 모니터의 유효 영역을 벗어난 상태라도 그대로 창을 띄워 사용자가 위젯을 찾을 수 없음.
3. **모달 ESC 숏컷 등록/해제 루프**:
   - 로그상 1초마다 ESC 단축키 등록/해제가 반복되는 비효율/안정성 이슈 발견.

---

## 3. 워크스트림별 상세 계획

### WS1 — 화면 가시 영역 계산 및 Clamping 순수 로직 (Domain / Pure Utility)

- **목표**: 위젯이 모니터 화면 작업 영역(WorkArea) 밖으로 나가지 않도록 좌표를 보정하는 순수 함수 작성.
- **설계**:
  - 파일: `src/domain/services/screenBoundsClamp.ts` (또는 `electron/utils/screenClamp.ts` / 공유 모듈)
  - 함수:

    ```typescript
    export interface Rect {
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    }

    export interface ClampOptions {
      readonly minVisibleHeaderHeight: number; // 최소 화면에 보여야 하는 헤더 높이 (예: 40px)
      readonly minVisibleWidth: number; // 최소 화면에 보여야 하는 가로 폭 (예: 100px)
    }

    export function clampWidgetBoundsToWorkArea(
      bounds: Rect,
      workArea: Rect,
      options?: Partial<ClampOptions>,
    ): Rect;

    export function isWidgetVisibleInWorkArea(
      bounds: Rect,
      workArea: Rect,
      minVisibleHeight?: number,
    ): boolean;
    ```

- **수용 기준**:
  - [ ] 위젯이 화면 하단 밖으로 내려갈 때 헤더 최소 높이(`minVisibleHeaderHeight`)만큼 화면 상단에 걸리도록 `y`가 제한된다.
  - [ ] 위젯이 화면 상단 위로 올라갈 때 헤더가 작업표시줄/화면 상단을 벗어나지 않도록 `y >= workArea.y`로 제한된다.
  - [ ] 위젯이 좌/우로 벗어날 때 최소 `minVisibleWidth`만큼 화면 내에 남는다.
  - [ ] 단위 테스트 100% 통과 (`screenBoundsClamp.test.ts`).

---

### WS2 — Electron `win32Desktop.ts` 드래그 경로에 실시간 Clamping 적용 (Platform / FFI)

- **목표**: 바탕화면 아래 모드(`native-desktop`) 헤더 드래그 중 위젯이 화면 바깥으로 나가지 않도록 실시간 보정.
- **설계**:
  - 드래그 시작 시점(`dragStart`)에 현재 디스플레이의 `workArea`를 physical pixel 단위로 캐시하거나, 드래그 핸들러에서 bounds를 clamp하여 `moveWidget`에 전달.
  - `handleHeaderDragMove(screenPoint)` 내에서:
    ```typescript
    const rawX = startPhysicalBounds.x + deltaX;
    const rawY = startPhysicalBounds.y + deltaY;
    const clamped = clampPhysicalBounds(
      rawX,
      rawY,
      startPhysicalBounds.width,
      startPhysicalBounds.height,
      currentDisplayPhysicalWorkArea,
    );
    moveWidget(
      widgetHwnd,
      clamped.x,
      clamped.y,
      startPhysicalBounds.width,
      startPhysicalBounds.height,
    );
    ```
- **수용 기준**:
  - [ ] 드래그 도중 마우스를 모니터 맨 밑으로 내려도 위젯 헤더가 화면 하단에 걸려 화면 밖으로 완전히 사라지지 않는다.
  - [ ] 멀티 모니터 경계를 넘나드는 드래그 시 인접 모니터로 자연스럽게 이동하되 전체 화면 밖으로는 이탈하지 않는다.

---

### WS3 — 위젯 생성 / 모드 전환 시 가시성 자동 보장 (Main Process)

- **목표**: 위젯 모드 전환 또는 앱 시작 시 위젯 위치가 화면 밖이면 안전한 기본 위치로 자동 보정.
- **설계**:
  - `electron/desktopWidgetManager.ts` 및 `electron/main.ts`의 `ensureWidgetVisibleOnScreen(win: BrowserWindow)` 헬퍼 구현.
  - `screen.getAllDisplays()`를 조회하여 현재 위젯 위치가 어떤 디스플레이의 `workArea`와도 충분히 겹치지 않는 경우:
    - 가장 가까운 디스플레이의 `workArea` 안쪽으로 `clamp`하거나 `getDefaultWidgetBounds` 위치로 재설정.
  - 호출 시점:
    1. `attachAndShow()` 시작 시점
    2. `executeWindowTransition('widget')` 진입 시점
    3. 디스플레이 해상도/연결 변경 이벤트(`screen.on('display-metrics-changed')`, `screen.on('display-removed')`)
- **수용 기준**:
  - [ ] 위젯이 화면 밖 좌표(`x: -295, y: 1063`)로 저장되어 있어도, 위젯 모드로 전환하면 자동으로 화면 가시 영역 안으로 복구되어 나타난다.
  - [ ] 모니터 연결 해제 시 다른 모니터 안쪽으로 위젯 위치가 자동 보정된다.

---

### WS4 — 모달 단축키 등록/해제 루프 최적화 (Renderer / Adapters)

- **목표**: 1초마다 불필요하게 단축키가 등록/해제되는 로그 패턴 점검 및 제거.
- **설계**:
  - `useDesktopModeFallback.ts` 또는 모달 관리 스토어에서 상태 변경이 없을 때 전역 단축키 등록/해제가 반복 호출되지 않도록 `useMemo`/`useEffect` 의존성 배열 및 조건문 정비.
- **수용 기준**:
  - [ ] 위젯 실행 중 콘솔/진단 로그에 1초 간격의 `[modal] global Escape shortcut` 등록/해제 로그가 반복 찍히지 않는다.

---

## 4. 검증 게이트

```bash
npx tsc --noEmit
npm run lint
npm run test
npm run regression-check
```
