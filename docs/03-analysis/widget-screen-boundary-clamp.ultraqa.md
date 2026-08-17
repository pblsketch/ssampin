# UltraQA: 위젯 화면 이탈 방지 및 가시성 보장 종합 품질 검증 보고서

> 작성일: 2026-08-17  
> 대상 기능: 위젯 화면 이탈 방지(Screen Boundary Clamp) & 가시성 자동 보장  
> 관련 문서: `docs/01-plan/features/widget-desktop-screen-boundary-clamp.plan.md`, `DECISIONS.md (ADR-051)`  
> 1차 판정(2026-08-17): PASS — **2차 재검증에서 뒤집힘**  
> 최종 판정(2026-08-17 재검증): **조건부 PASS** — 좌표 변환 결함 1건 수정 후 통과

---

## 0. 2차 재검증 결과 (재QA, 2026-08-17)

1차 QA가 보고한 자동 검증 수치는 **재실행 결과 전부 사실**이었다(39 tests / 40 regression / lint 0 errors / build SUCCESS / tsc 0). 그러나 게이트가 통과한 상태에서 **기능의 목적을 무너뜨리는 결함 1건**이 남아 있었다.

### 🔴 결함: 드래그 clamp가 per-monitor DPI 환경에서 화면 밖 이탈을 막지 못함 (수정 완료)

- **원인**: `desktopWidgetManager.ts` 드래그 시작부에서 모니터 작업 영역을 `workArea.x * scaleFactor` 단순 곱셈으로 환산했다. 보조 모니터의 physical origin은 **앞선 모니터들의 physical 폭 누적값**이지 자기 DIP 좌표 × 자기 배율이 아니다.
- **이 저장소는 같은 실수를 이미 고친 적이 있다** — `desktopWidgetManager.ts:762`의 "멀티 모니터 결정적 fix(2026-05-06)" 주석이 정확히 이 곱셈을 금지하고 있었고, 신규 코드가 같은 파일 안에서 그것을 되살렸다.
- **실측(primary 1920×1080 @100% + 우측 보조 2560×1440 @200%, 바탕화면 우측 끝 = 4480)**:

  | 드래그              | 곱셈(결함)                   | 올바른 변환                | 결과                                                          |
  | ------------------- | ---------------------------- | -------------------------- | ------------------------------------------------------------- |
  | 우측 끝까지 밀기    | x=**5200** (가시 폭 **0px**) | x=**4380** (가시 폭 100px) | 결함 시 위젯이 통째로 화면 밖 — **막으려던 증상 그대로 발생** |
  | 보조 모니터 좌측 끝 | x=1820 (140px 튐)            | x=1960                     | 멀쩡한 자리에서 위젯이 홱 끌려감                              |

- **왜 1차에서 못 잡았나**: 테스트 39건은 전부 _이미 올바른_ 사각형을 입력으로 받아 계산만 검증한다. 그 사각형을 만드는 DIP→physical 변환은 검증 대상이 아니었다(`desktopWidgetManager.noop.test.ts`에 `physicalWorkAreas`/`scaleFactor`/`getAllDisplays` 검색 결과 0건). **Dimension 1의 "4K/이종 해상도 검증 완료"는 이 사각지대 위에서 내려진 판정이었다.**
- **수정**: `computePhysicalWorkAreas(displays, convert)`를 분리하고 호출부가 `screen.dipToScreenRect(null, r)`를 주입하도록 변경. `null`을 넘기면 Electron이 각 rect에 가장 가까운 디스플레이 기준으로 환산하므로 모니터별 배율이 정확히 적용된다. 변환 실패 시 해당 모니터만 곱셈 폴백(단일 모니터에서는 정확).
- **그물 추가**: `electron/desktopWidgetWorkAreas.test.ts` 7건. 곱셈으로 되돌리면 **3건이 빨간불**로 바뀌는 것을 실증 확인했다(`expected 5200 to be 4380` 포함).

### 🟠 부수 수정: 줄바꿈 전면 변경으로 인한 diff 오염

`desktopWidgetManager.ts`·`desktopWidgetTypes.ts`가 CRLF로 저장되어 실제 52줄 수정이 **3,297줄 변경**으로 기록되고 있었다(저장소 나머지는 LF). 리뷰 가독성과 다중 세션 충돌 위험 때문에 LF로 정규화했다 → 실제 diff `52/3`, `2/0`으로 축소.

---

## 1. 개요 및 결함 재현 분석

### 1.1 사용자 피드백 및 장애 원인

- **증상**: 사용자가 바탕화면 모드에서 위젯이 보이지 않아 "바탕화면 아래 모드가 안 된다"고 신고함.
- **진단 로그 실증 분석**:
  - 로그 `native-desktop-diag.log` 5,644줄 전수 분석 결과, Win32 마우스 훅(`failed=0`, 61,520회 콜백) 및 `WorkerW`/`Progman` 부착(`STRATEGY3: SUCCESS`)은 정상 동작함.
  - 결정적 원인: 세션 13의 12:06 드래그 조작 중 `totalDelta=(-576, 1056)` 발생으로 위젯 상단 좌표가 `Y=1063` (1080p 해상도 기준)으로 밀려나 위젯 상단 헤더(40~60px)가 모니터 화면 바닥 아래로 99% 이상 잠김.
  - 기존 코드(`desktopWidgetManager.ts`, `main.ts`)에 화면 작업 영역(WorkArea) 경계 검증 및 Clamping 안전장치가 부재했음.

---

## 2. UltraQA 5대 심층 검증 영역

### 📐 Dimension 1: 다중 모니터 & 복합 좌표계 (Multi-Display & Coordinates)

- **음수 좌표계 모니터 (좌측/상단 배치)**:
  - 좌측 보조 모니터(`x: -1920, y: 0`) 및 상단 모니터(`x: 0, y: -1080`)에서도 위젯 헤더 최소 가시 높이(`minVisibleHeaderHeight: 40px`) 및 가로 최소폭(`minVisibleWidth: 100px`)이 정상 유지됨을 검증 완료.
- **작업표시줄 변칙 배치**:
  - 상단 작업표시줄(`y: 60, height: 1020`) 또는 좌측 작업표시줄(`x: 80, width: 1840`) 환경에서 `workArea.y` / `workArea.x` 원점을 초과해 작업표시줄 뒤로 숨지 않도록 clamp됨을 확인.
- **4K/FHD 이종 해상도 & 3대 모니터 스패닝**:
  - 4K 초고해상도(`3840x2160`) 및 3대 모니터 가로 배열(`-1920, 0, 1920`)에서 교차 면적(Intersection Area) 및 거리 기반 가장 적절한 모니터 작업 영역 자동 탐색 알고리즘 검증 완료.

### ⚡ Dimension 2: 핫패스 드래그 성능 & 마우스 훅 안정성 (Hot Path Performance)

- **드래그 이동 핫패스 무부하 설계**:
  - `WH_MOUSE_LL` 마우스 훅 콜백 내부의 드래그 이동(`WM_MOUSEMOVE`) 시 무거운 IPC나 비동기 I/O를 배제하고, 드래그 시작 시점(`LBUTTONDOWN`)에 캐시된 `physicalWorkAreas`를 바탕으로 **순수 산술 연산(O(1))**으로 Clamping 처리.
  - 재QA 확인: `screen.dipToScreenRect` 호출은 드래그 시작 1회(모니터 수만큼)뿐이며 MOUSEMOVE 경로에는 들어가지 않는다 — 핫패스 무부하 원칙 유지.
  - ✅ **단위 불일치 해소(재QA, 수정 완료)**: 드래그 경로의 `minVisibleHeaderHeight=40`이 **physical px**로, 모드 전환 경로(`main.ts`)의 40은 **DIP**로 해석되어 150% 배율에서 드래그 시 남는 헤더가 약 27 DIP에 그쳤다. **DIP 기준으로 통일**했다 — 헤더 높이 자체가 CSS(DIP)로 정의되므로 배율과 무관하게 헤더 전체가 잡혀야 하고, physical 고정은 고배율 사용자에게만 불리해진다. `computePhysicalWorkAreas`가 모니터별 배율로 환산한 최소 가시량(`minVisibleHeaderHeight`/`minVisibleWidth`)을 작업 영역 rect에 함께 실어 반환하고, 핫패스는 선택된 모니터의 값을 그대로 쓴다.
    - 배열 인덱스를 맞추는 대신 rect에 값을 얹은 이유: 모니터마다 환산값이 다른데 "어느 작업 영역인가"와 "몇 physical px인가"가 분리되면 핫패스에서 어긋나기 쉽다. `findBestWorkAreaForBounds`를 제네릭으로 바꿔(런타임 동작 변화 없음) 선택된 객체가 자기 최소값을 그대로 들고 나오도록 했다.
    - 검증: 150% 모니터에서 헤더 노출이 40 physical(≈27 DIP) → 60 physical(=40 DIP)로 증가함을 테스트로 고정(`★회귀 가드: 고배율 모니터에서 헤더가 화면 밑으로 더 잠기지 않는다`).
  - 마우스 훅 처리 지연으로 인한 OS 타임아웃 회귀 원천 차단.

### 🛡️ Dimension 3: 윈도우 생명주기 & 모드 전환 안전성 (Lifecycle & Visibility Guard)

- **위젯 모드 전환 시 자동 위치 복구 (`ensureWidgetBoundsWithinDisplays`)**:
  - 과거에 화면 바깥으로 나간 좌표가 설정 파일에 남아있더라도, `executeWindowTransition('widget')` 및 `ensureWidgetOnScreen`(디스플레이 이벤트) 진입 시 안전 가시 위치로 복구. 창을 새로 만드는 경로는 `createWidgetWindow` 내부의 별도 보정 로직이 담당한다.
  - ⚠️ **정정(재QA)**: 초판은 `attachAndShow`에도 적용된다고 기술했으나 **사실이 아니다.** 호출처는 `main.ts:1843`과 `main.ts:2244` 두 곳뿐이다.
  - ⚠️ **범위 주의(재QA)**: "안쪽으로 당겨온다"는 **전체를 화면 안으로 넣는다는 뜻이 아니다.** 가로 100 DIP + 헤더 40 DIP만 남으면 통과하므로, 해상도를 낮추면 위젯이 대부분 잘린 채 유지될 수 있다.
  - ✅ **크기 축소 복원(재QA, 수정 완료)**: 구현 교체 과정에서 구 `ensureWidgetOnScreen`의 "화면보다 큰 위젯 크기 축소"가 사라졌었다. **신고된 증상(위치)과 무관한 누락**으로 판단해 복원했다.
    - 없으면 생기는 함정: 크기 조절 손잡이는 위젯 우측·하단 모서리에 있는데, 위젯이 화면보다 크면 두 손잡이가 모두 화면 밖이다. 손잡이를 끌어오려면 위젯을 위로 올려야 하지만 clamp가 `y >= workArea.y`를 강제하므로 **크기를 되돌릴 방법이 없는 상태로 고착**된다(큰 모니터에서 키운 뒤 해상도 하향/모니터 분리 시 실제 도달 가능).
    - `fitWidgetSizeToWorkArea(bounds, workArea, minSize)`를 도메인·Electron 미러 양쪽에 추가하고, 크기 검증을 **가시성 판정과 분리해 항상 수행**하도록 `ensureWidgetBoundsWithinDisplays`를 재구성했다. 창 최소 크기(`getMinimumSize()`) 아래로는 줄이지 않는다.
- **디스플레이 연결/해제/해상도 변경 대응**:
  - 모니터 분리(`display-removed`) 또는 해상도 변경(`display-metrics-changed`) 시 `ensureWidgetOnScreen`을 통해 화면 밖 이탈 자동 방어.

### 🏛️ Dimension 4: Clean Architecture 및 미러 패리티 (Architecture & Parity)

- **도메인 독립성**:
  - `src/domain/services/screenBoundsClamp.ts`는 외부 라이브러리/Electron 의존성 0건 준수.
- **Electron 메인 프로세스 미러 동기화**:
  - Electron `rootDir: "electron"` 제약을 만족하기 위해 `electron/desktopWidgetBounds.ts`를 구현하고, `desktopWidgetBounds.mirror.test.ts`를 통해 도메인과 Electron 간 계산 결과가 100% 동일함을 단위 테스트로 보장.

### ⌨️ Dimension 5: 동시성 & 단축키 간섭 (Concurrency & Shortcuts)

- **모달 1초 주기 단축키 깜빡임 방어**:
  - `WidgetModal.tsx`의 `saveAndClose` 핸들러를 `useRef`로 안정화하여 모달 내부 리렌더링 시마다 1초 주기로 전역 Escape 단축키가 register/unregister를 반복하던 루프를 완전히 제거.

---

## 3. 자동화 검증 게이트 결과

| 검증 항목                      | 명령어                                                          | 결과             | 비고                           |
| ------------------------------ | --------------------------------------------------------------- | ---------------- | ------------------------------ |
| **도메인 단위 테스트**         | `npx vitest run src/domain/services/screenBoundsClamp.test.ts`  | **18 / 18 PASS** | 극단적 엣지 케이스 5건 포함    |
| **Electron 미러 테스트**       | `npx vitest run electron/desktopWidgetBounds.mirror.test.ts`    | **4 / 4 PASS**   | 도메인 ↔ Electron 100% 일치    |
| **좌표 변환 회귀 (재QA 신규)** | `npx vitest run electron/desktopWidgetWorkAreas.test.ts`        | **7 / 7 PASS**   | 곱셈으로 되돌리면 3건 RED 실증 |
| **데스크톱 매니저 테스트**     | `npx vitest run electron/desktopWidgetManager.noop.test.ts`     | **17 / 17 PASS** | 헤더/리사이즈 영역 핸들링 통과 |
| **기기 상태 테스트**           | `npx vitest run src/domain/entities/SidePinDeviceState.test.ts` | **15 / 15 PASS** | SidePin 위치 정규화 통과       |
| **회귀 방지 검사**             | `npm run regression-check`                                      | **40 / 40 PASS** | 전 항목 PASS                   |
| **코드 품질 검사**             | `npm run lint`                                                  | **0 errors**     | Lint 통과                      |
| **Electron 번들 빌드**         | `node scripts/build-electron.mjs`                               | **SUCCESS**      | 빌드 정상 완료                 |

---

## 4. 실기기 수동 QA 시나리오 (Checklist)

1. **바탕화면 모드 극단 드래그 테스트**:
   - [ ] 바탕화면 모드(`native-desktop`)에서 위젯 상단 헤더를 잡고 마우스를 화면 맨 밑(작업표시줄 너머)으로 빠르게 내린다.
   - [ ] 위젯 헤더가 화면 맨 밑바닥에 걸려 멈추며, 마우스를 떼고 다시 잡을 수 있는지 확인한다.
2. **화면 밖 좌표 복구 테스트**:
   - [ ] 위젯을 끈 상태에서 다른 모니터를 분리하거나 해상도를 변경한다.
   - [ ] 위젯을 다시 켰을 때 현재 모니터의 가시 영역 안쪽으로 자동 당겨져 즉시 표시되는지 확인한다.
3. **모달 열림 중 단축키 안정성 테스트**:
   - [ ] 위젯에서 메모/할일 카드를 클릭하여 모달을 띄운다.
   - [ ] 10초 이상 대기해도 콘솔에 `[modal] global Escape shortcut` 등록/해제 로그가 반복 찍히지 않는지 확인한다.
