# 쌤핀 바탕화면 아이콘 아래 모드 PRD

> 작성일: 2026-05-05  
> 대상 제품: 쌤핀(SsamPin) Windows Electron 앱  
> 문서 목적: 설정 > 위젯에 **바탕화면 아이콘 아래 모드**를 추가하여, 스쿨보드 위젯 모드처럼 Windows 바탕화면 아이콘과 쌤핀 위젯이 공존하도록 만드는 제품 요구사항·기술스택·구현 전략 정의  
> 분석 근거: 스쿨보드 v1.1.4 설치파일 정적 분석, 쌤핀 현재 코드 구조 확인  
> 주의: 경쟁 앱 코드를 복제하지 않고, 공개 Win32/Electron API 개념을 바탕으로 독립 구현한다.

---

## 1. 결론 요약

쌤핀 설정 > 위젯에 **바탕화면 아이콘 아래 모드**를 새로 추가한다.

이 모드는 기존 쌤핀 위젯을 일반 투명 Electron 창으로 띄우는 수준을 넘어, Windows 바탕화면의 Explorer 창 계층에 위젯을 붙이고, 바탕화면 아이콘과 위젯 클릭을 함께 처리하는 Windows 전용 네이티브 위젯 모드다.

핵심 사용자 가치는 다음이다.

1. 교사는 쌤핀 위젯을 바탕화면 작업판처럼 깔아둘 수 있다.
2. 바탕화면 아이콘은 기존 Windows 방식 그대로 보이고, 클릭·드래그·이동할 수 있다.
3. 쌤핀 위젯의 카드·버튼·빈 공간도 기존처럼 사용할 수 있다.
4. 문제가 생기면 언제든 **일반 모드** 또는 **항상 위에 모드**로 되돌릴 수 있다.

---

## 2. 배경과 문제 정의

### 2.1 현재 쌤핀 위젯 모드

현재 쌤핀 위젯은 `electron/main.ts`에서 별도 `BrowserWindow`로 생성된다.

확인된 현재 특성:

- `frame: false`
- `transparent: true`
- `skipTaskbar: true`
- `alwaysOnTop`은 설정에 따라 적용
- `WidgetDesktopMode = 'normal' | 'topmost'`
- Win+D 최소화 감지 후 복구 로직 존재

현재 모드는 다음 두 가지뿐이다.

| 현재 모드 | 설명 | 한계 |
|---|---|---|
| `normal` | 일반 창. 다른 창에 가려질 수 있음 | 바탕화면 아이콘과 같은 레이어에서 섞이지 않음 |
| `topmost` | 항상 위. 다른 창 위에 표시 | 바탕화면 아이콘을 덮어버리는 사용감이 발생할 수 있음 |

현재 `window:applyWidgetSettings`는 `topmost`가 아니면 모두 `normal`로 정규화한다.

```ts
const newMode = widget.desktopMode === 'topmost' ? 'topmost' : 'normal';
```

따라서 새 모드를 추가하려면 타입, 설정 저장소, IPC, 메인 프로세스 정규화, 위젯 설정 UI를 모두 수정해야 한다.

### 2.2 사용자가 원하는 경험

사용자는 스쿨보드처럼 다음 경험을 기대한다.

```text
쌤핀 위젯이 바탕화면에 깔려 있음
+ Windows 바탕화면 아이콘은 그 위/같은 층에서 보임
+ 아이콘 클릭·드래그·이동 가능
+ 쌤핀 위젯 카드도 클릭 가능
```

즉 단순히 "위젯을 뒤로 보내기"가 아니다. 바탕화면 아이콘과 위젯이 같은 작업 공간 안에서 공존해야 한다.

### 2.3 스쿨보드 정적 분석에서 확인한 기술 패턴

스쿨보드 v1.1.4 설치파일 정적 분석 결과, `out/main/desktopWidget.js`에서 다음 패턴이 확인되었다.

| 영역 | 확인된 패턴 |
|---|---|
| Native FFI | `koffi`로 `user32.dll`, `kernel32.dll` 호출 |
| 바탕화면 계층 | `Progman`, `WorkerW`, `SHELLDLL_DefView`, `SysListView32` 탐색 |
| 창 삽입 | Electron `BrowserWindow.getNativeWindowHandle()`로 HWND 확보 후 `SetParent` 사용 |
| 아이콘 판정 | `LVM_HITTEST`로 바탕화면 아이콘 hit-test |
| 마우스 처리 | `WH_MOUSE_LL`, `PostMessageW`, `CallNextHookEx` 등으로 이벤트 라우팅 |
| 안정성 | WorkerW 변경 감지, 재부착, hook 해제, fallback 흐름 포함 |

쌤핀은 이 개념을 그대로 제품 요구사항으로 해석하되, 경쟁 앱 코드는 복제하지 않고 독립 구현한다.

---

## 3. 목표

### 3.1 제품 목표

쌤핀 위젯을 교사용 **바탕화면 작업판**으로 발전시킨다.

교사는 바탕화면 파일·폴더·바로가기 아이콘을 그대로 쓰면서, 쌤핀 위젯을 배경 작업판처럼 깔아두고 시간표, 일정, 할 일, 메모, 좌석, 급식 정보를 함께 확인한다.

### 3.2 기능 목표

1. 설정 > 위젯 > 위젯 표시 모드에 **바탕화면 아이콘 아래** 옵션을 추가한다.
2. 해당 모드에서 쌤핀 위젯 창을 Windows 바탕화면 WorkerW 레이어에 붙인다.
3. 바탕화면 아이콘이 쌤핀 위젯 위에 시각적으로 보이도록 한다.
4. 위젯 영역 안의 바탕화면 아이콘 클릭·더블클릭·드래그·이동을 Explorer가 처리하도록 한다.
5. 위젯 영역 안의 쌤핀 카드·버튼·빈 공간 클릭은 쌤핀 위젯이 처리하도록 한다.
6. 실패 시 앱이 종료되지 않고 일반 모드로 fallback한다.
7. Windows 전용 기능으로 제공하고, macOS/Linux에서는 숨김 또는 비활성화한다.

### 3.3 비목표

이번 PRD 범위에서 제외한다.

- 쌤핀이 바탕화면 파일 목록을 직접 수집·관리하는 기능
- 파일 자동 분류, 파일 이동, 파일 삭제 기능
- 자동 로그인, 인증정보 저장, 교무 사이트 자동화
- Windows Explorer를 대체하는 자체 파일 관리자
- macOS/Linux에서 동일한 바탕화면 아이콘 호환 기능 구현
- 경쟁 앱 코드 복사 또는 바이너리 코드 재사용

---

## 4. 사용자 시나리오

### 4.1 기본 시나리오

1. 교사가 쌤핀 설정으로 이동한다.
2. `위젯` 탭에서 `위젯 표시 모드`를 연다.
3. `바탕화면 아이콘 아래`를 선택한다.
4. 쌤핀 위젯 모드로 전환한다.
5. 쌤핀 위젯이 바탕화면에 깔린다.
6. 바탕화면 아이콘이 쌤핀 위젯 위에 보인다.
7. 교사는 아이콘을 클릭하거나 드래그하여 위치를 바꾼다.
8. 동시에 쌤핀 위젯의 시간표·일정·할 일 카드도 클릭한다.

### 4.2 수업 준비 시나리오

1. 교사는 바탕화면에 수업자료 PDF, 영상, 한글 파일 바로가기를 둔다.
2. 쌤핀 위젯을 바탕화면 작업판처럼 깔아둔다.
3. 위젯에는 오늘 시간표, 이번 교시, 수업 일정, 할 일이 보인다.
4. 아이콘은 쌤핀 위젯 위에서 그대로 이동 가능하다.
5. 교사는 바탕화면을 "수업 준비판"처럼 사용한다.

### 4.3 장애 복구 시나리오

1. 교사가 Explorer를 재시작하거나 Windows가 잠금/절전에서 복귀한다.
2. 쌤핀은 바탕화면 아이콘 아래 모드 상태를 확인한다.
3. WorkerW 또는 SysListView32 핸들이 바뀌었으면 재탐색·재부착을 시도한다.
4. 실패하면 사용자 데이터 손실 없이 일반 모드로 되돌린다.
5. 필요 시 진단 메시지 또는 토스트로 안내한다.

---

## 5. 기능 요구사항

### 5.1 설정 UI

| ID | 요구사항 | 우선순위 |
|---|---|---|
| FR-UI-01 | 설정 > 위젯 > 위젯 표시 모드에 `바탕화면 아이콘 아래` 옵션을 추가한다. | P0 |
| FR-UI-02 | Windows가 아닌 환경에서는 해당 옵션을 숨기거나 비활성화한다. | P0 |
| FR-UI-03 | 옵션 설명에 Windows 창 계층/마우스 이벤트 제어 안내를 표시한다. | P0 |
| FR-UI-04 | 모드 변경 후 실패하면 `일반`으로 자동 복귀했음을 안내한다. | P0 |
| FR-UI-05 | 문제 발생 시 사용자가 즉시 `일반` 또는 `항상 위에`로 되돌릴 수 있어야 한다. | P0 |

권장 문구:

```text
바탕화면 아이콘 아래: 쌤핀 위젯을 바탕화면 작업판처럼 깔고, 바탕화면 아이콘은 위에서 그대로 클릭·이동할 수 있습니다. Windows 전용 기능입니다.
```

보안 안내 문구:

```text
이 모드는 바탕화면 아이콘과 함께 동작하기 위해 Windows 바탕화면 창 계층과 마우스 이벤트를 제어합니다. 일부 보안 프로그램에서 민감하게 볼 수 있으며, 문제가 있으면 일반 모드로 되돌릴 수 있습니다.
```

### 5.2 설정 데이터 모델

| ID | 요구사항 | 우선순위 |
|---|---|---|
| FR-MODEL-01 | `WidgetDesktopMode`에 새 값 `native-desktop`을 추가한다. | P0 |
| FR-MODEL-02 | 기존 저장값 `normal`, `topmost`는 그대로 유지한다. | P0 |
| FR-MODEL-03 | 알 수 없는 저장값은 `normal`로 fallback한다. | P0 |
| FR-MODEL-04 | 기존 마이그레이션 값 `floating`, `auto`, `desktop`, `behind`, `above` 처리와 충돌하지 않게 한다. | P0 |

권장 내부 타입:

```ts
export type WidgetDesktopMode = 'normal' | 'topmost' | 'native-desktop';
```

권장 사용자 노출명:

| 내부 값 | 사용자 표시명 |
|---|---|
| `normal` | 일반 |
| `topmost` | 항상 위에 |
| `native-desktop` | 바탕화면 아이콘 아래 |

### 5.3 메인 프로세스 모드 적용

| ID | 요구사항 | 우선순위 |
|---|---|---|
| FR-MAIN-01 | `createWidgetWindow`에서 `native-desktop` 모드를 인식한다. | P0 |
| FR-MAIN-02 | `window:applyWidgetSettings`가 `native-desktop` 값을 `normal`로 버리지 않아야 한다. | P0 |
| FR-MAIN-03 | `native-desktop` 진입 시 `desktopWidgetManager.enable(widgetWindow)`를 호출한다. | P0 |
| FR-MAIN-04 | `normal` 또는 `topmost`로 전환 시 native manager를 반드시 `disable()`한다. | P0 |
| FR-MAIN-05 | 위젯 창 닫힘, 앱 종료, 모드 변경 시 mouse hook과 remote memory를 정리한다. | P0 |
| FR-MAIN-06 | 위젯 이동·리사이즈·레이아웃 변경 후 native bounds를 갱신한다. | P1 |
| FR-MAIN-07 | Win+D, Explorer 재시작, display 변경, 잠금/절전 복귀 후 health check 또는 재부착을 시도한다. | P1 |

### 5.4 Windows 바탕화면 계층 연동

| ID | 요구사항 | 우선순위 |
|---|---|---|
| FR-WIN-01 | Electron `BrowserWindow.getNativeWindowHandle()`로 쌤핀 위젯 HWND를 가져온다. | P0 |
| FR-WIN-02 | `Progman` 및 `WorkerW`를 탐색한다. | P0 |
| FR-WIN-03 | 필요 시 `Progman`에 메시지를 보내 WorkerW 레이어 생성을 유도한다. | P1 |
| FR-WIN-04 | `SetParent(widgetHwnd, workerWHwnd)`로 위젯 창을 WorkerW에 붙인다. | P0 |
| FR-WIN-05 | `SHELLDLL_DefView`와 `SysListView32`를 찾아 바탕화면 아이콘 ListView를 식별한다. | P0 |
| FR-WIN-06 | WorkerW 또는 ListView 탐색 실패 시 앱 종료 없이 fallback한다. | P0 |

### 5.5 마우스 이벤트 라우팅

| ID | 요구사항 | 우선순위 |
|---|---|---|
| FR-MOUSE-01 | 마우스 이벤트가 위젯 bounds 안인지 판단한다. | P0 |
| FR-MOUSE-02 | 위젯 bounds 밖 이벤트는 그대로 통과시킨다. | P0 |
| FR-MOUSE-03 | 위젯 bounds 안에서 바탕화면 아이콘 위 이벤트인지 `LVM_HITTEST`로 판정한다. | P0 |
| FR-MOUSE-04 | 아이콘 위 이벤트는 Explorer/ListView가 처리하도록 통과시킨다. | P0 |
| FR-MOUSE-05 | 아이콘이 아닌 위젯 영역 이벤트는 Electron 위젯 HWND로 전달한다. | P0 |
| FR-MOUSE-06 | 클릭, 더블클릭, 드래그, 마우스 이동, 마우스 leave, 휠 이벤트를 최대한 자연스럽게 처리한다. | P1 |
| FR-MOUSE-07 | hook 실패 시 `normal` 모드로 fallback한다. | P0 |

### 5.6 좌표계와 DPI

| ID | 요구사항 | 우선순위 |
|---|---|---|
| FR-DPI-01 | Electron DIP 좌표와 Win32 physical pixel 좌표 변환을 처리한다. | P0 |
| FR-DPI-02 | `screen.getDisplayNearestPoint`, display scaleFactor 등을 고려한다. | P1 |
| FR-DPI-03 | DPI 100%, 125%, 150%에서 hit-test 좌표가 맞아야 한다. | P1 |
| FR-DPI-04 | 다중 모니터에서 위젯이 위치한 모니터 기준으로 좌표 변환한다. | P1 |

### 5.7 안정성·복구

| ID | 요구사항 | 우선순위 |
|---|---|---|
| FR-RECOVERY-01 | Win+D 후 위젯이 최소화·숨김 상태로 남지 않아야 한다. | P0 |
| FR-RECOVERY-02 | Explorer 재시작 후 WorkerW/ListView를 재탐색한다. | P1 |
| FR-RECOVERY-03 | display 추가/제거, 해상도 변경, DPI 변경 시 health check를 수행한다. | P1 |
| FR-RECOVERY-04 | 잠금/절전 복귀 후 재부착을 시도한다. | P1 |
| FR-RECOVERY-05 | 연속 실패 시 반복 로그를 남기지 않고 안전하게 비활성화한다. | P0 |
| FR-RECOVERY-06 | 진단 로그에는 민감 정보가 없어야 한다. | P0 |

### 5.8 진단·문제 해결

| ID | 요구사항 | 우선순위 |
|---|---|---|
| FR-DIAG-01 | native mode enable 실패 사유를 내부 로그에 남긴다. | P1 |
| FR-DIAG-02 | 사용자가 복사 가능한 위젯 진단 정보를 제공한다. | P2 |
| FR-DIAG-03 | 진단 정보에는 OS, Electron 버전, display 정보, mode 상태, attach 상태만 포함한다. | P2 |
| FR-DIAG-04 | API 키, 토큰, 파일 내용, 사용자 개인정보는 진단 정보에 포함하지 않는다. | P0 |

---

## 6. 비기능 요구사항

### 6.1 안정성

- 기능 실패가 앱 종료로 이어지면 안 된다.
- native module load 실패 시 `normal` 모드로 fallback한다.
- mouse hook은 중복 등록되지 않아야 한다.
- 앱 종료 시 hook, remote memory, process handle을 정리해야 한다.

### 6.2 성능

- mouse hook callback은 매우 자주 호출되므로 무거운 연산을 피한다.
- HWND, ListView handle, Explorer process handle은 캐시하되 유효성 검사를 수행한다.
- hit-test 실패 또는 Explorer 상태 변화가 반복될 때 로그 스팸을 만들지 않는다.

### 6.3 보안·신뢰

- 네트워크 통신이 필요 없는 기능이다.
- 자동 로그인, 인증정보 수집, 파일 내용 접근을 추가하지 않는다.
- Windows low-level mouse hook과 Explorer 창 핸들 접근을 사용자에게 투명하게 안내한다.
- 일부 보안 프로그램이 민감하게 볼 수 있으므로 설정은 reversible해야 한다.

### 6.4 호환성

- Windows 10/11을 우선 지원한다.
- macOS/Linux에서는 no-op 또는 UI 비활성화 처리한다.
- Electron 개발 모드와 packaged 설치본 모두에서 검증한다.

---

## 7. 기술스택

### 7.1 기존 쌤핀 기술스택

| 영역 | 기술 |
|---|---|
| Desktop runtime | Electron 32.x |
| Main process | TypeScript, Node.js |
| Renderer | React 18, TypeScript |
| Bundler | Vite, esbuild |
| State | Zustand |
| Styling | Tailwind CSS |
| Packaging | electron-builder, NSIS |
| Storage | 로컬 JSON, Electron userData |

### 7.2 새로 필요한 기술스택

| 영역 | 권장 기술 | 목적 |
|---|---|---|
| Win32 FFI | `koffi` | `user32.dll`, `kernel32.dll` 호출 |
| Native window handle | Electron `BrowserWindow.getNativeWindowHandle()` | 쌤핀 위젯 HWND 확보 |
| Desktop layer | Win32 `Progman`, `WorkerW` | 바탕화면 레이어 탐색·삽입 |
| Window parenting | `SetParent`, `SetWindowPos`, `ShowWindow` | Electron 창을 WorkerW에 붙임 |
| Icon discovery | `SHELLDLL_DefView`, `SysListView32` | 바탕화면 아이콘 ListView 탐색 |
| Hit-test | `LVM_HITTEST` | 좌표에 아이콘이 있는지 판정 |
| Mouse routing | `WH_MOUSE_LL`, `SetWindowsHookExW`, `CallNextHookEx`, `PostMessageW` | 아이콘/위젯 이벤트 분기 |
| Remote memory | `OpenProcess`, `VirtualAllocEx`, `WriteProcessMemory`, `ReadProcessMemory`, `VirtualFreeEx` | Explorer 소유 ListView hit-test 구조체 처리 |
| DPI handling | Electron `screen`, Win32 좌표 변환 | DIP/physical pixel 변환 |

### 7.3 대안 기술 검토

| 대안 | 장점 | 단점 | 판단 |
|---|---|---|---|
| `koffi` | JS/TS에서 빠르게 Win32 호출 가능, 스쿨보드에서도 유사 패턴 확인 | 포인터/콜백/hook 안정성 주의, 패키징 필요 | 1차 권장 |
| Rust N-API native addon | 타입 안정성·성능·복잡한 Win32 처리에 유리 | 개발·빌드·배포 복잡도 증가 | 2차 대안 |
| C++ Node addon | 성능과 Win32 제어력 높음 | 유지보수 난이도 높음 | 비권장, 최후 대안 |
| Electron `setIgnoreMouseEvents`만 사용 | 구현 쉬움 | 아이콘/위젯 이벤트 분기 불충분 | 단독 사용 비권장 |
| CSS `pointer-events: none` | 구현 매우 쉬움 | Windows 바탕화면 아이콘과 Electron 창 계층 문제 해결 불가 | 보조 수단만 가능 |

---

## 8. 아키텍처 설계

### 8.1 권장 모듈 구조

`electron/main.ts`에 Win32 구현을 직접 넣지 않는다. 현재 `main.ts`는 이미 위젯 창 생성, 트레이, IPC, Win+D 복구 등 많은 책임을 갖고 있으므로 native 기능은 분리한다.

권장 파일:

```text
electron/desktopWidgetManager.ts
  - 쌤핀 위젯 native desktop mode의 고수준 manager

/electron/platform/win32Desktop.ts
  - koffi 기반 Win32 API wrapper
  - Progman/WorkerW/SysListView32 탐색
  - SetParent, SetWindowPos, hook, hit-test

electron/desktopWidgetTypes.ts
  - manager result, status, diagnostics type
```

### 8.2 Manager API

권장 인터페이스:

```ts
export type DesktopWidgetModeStatus =
  | { ok: true; mode: 'native-desktop' }
  | { ok: false; reason: string; fallbackMode: 'normal' | 'topmost' };

export interface DesktopWidgetManager {
  enable(widgetWindow: BrowserWindow): Promise<DesktopWidgetModeStatus>;
  disable(): void;
  updateBounds(widgetWindow: BrowserWindow): void;
  healthCheck(widgetWindow: BrowserWindow): Promise<DesktopWidgetModeStatus>;
  isEnabled(): boolean;
  getDiagnostics(): DesktopWidgetDiagnostics;
}
```

### 8.3 동작 흐름

```text
사용자: 설정 > 위젯 > 바탕화면 아이콘 아래 선택
  ↓
Renderer: settings store 업데이트
  ↓
Preload: window.electronAPI.applyWidgetSettings({ desktopMode: 'native-desktop' })
  ↓
Main: normalizeWidgetDesktopMode('native-desktop')
  ↓
Main: desktopWidgetManager.enable(widgetWindow)
  ↓
Manager: HWND 확보
  ↓
Win32: WorkerW 탐색 + SetParent
  ↓
Win32: SysListView32 탐색
  ↓
Win32: mouse hook 설치
  ↓
성공: native-desktop 유지
실패: normal fallback + 사용자 안내
```

### 8.4 이벤트 라우팅 흐름

```text
마우스 이벤트 발생
  ↓
위젯 bounds 안인가?
  ├─ 아니오 → CallNextHookEx
  └─ 예
      ↓
      해당 좌표에 바탕화면 아이콘이 있는가? (LVM_HITTEST)
        ├─ 예 → CallNextHookEx, Explorer가 처리
        └─ 아니오 → PostMessageW(widgetHwnd, mouseMessage), 원 이벤트 차단
```

---

## 9. 구현 전략

### 9.1 원칙

1. **단계 구현**: UI/타입 → no-op manager → WorkerW attach → hit-test → mouse routing → 안정화 순서로 진행한다.
2. **안전한 fallback**: 어느 단계든 실패하면 앱 종료 없이 `normal`로 되돌린다.
3. **Windows 한정**: `process.platform !== 'win32'`에서는 native 코드를 load하지 않는다.
4. **분리 설계**: Win32 세부 구현은 `main.ts`가 아니라 별도 모듈에 둔다.
5. **독립 구현**: 스쿨보드 코드를 복제하지 않고 공개 API 개념으로 구현한다.
6. **작은 검증 단위**: WSL 정적 검증과 Windows 실기 검증을 분리한다.

### 9.2 단계별 구현

#### Phase 0. 사전 정리

목표:

- 현재 위젯 모드 동작을 깨지 않도록 기준 테스트와 수동 검증 목록을 만든다.

작업:

- 현재 `normal`, `topmost` 동작 확인
- `window:applyWidgetSettings` 정규화 함수 분리
- 설정 저장/로드 마이그레이션 동작 확인

완료 기준:

- 기존 위젯 모드가 변경 전과 동일하게 동작한다.
- `npm run typecheck`가 통과한다.

#### Phase 1. UI/타입/IPC 추가

목표:

- `native-desktop` 모드를 쌤핀 설정 경로 전체에서 잃지 않고 전달한다.

작업:

- `WidgetDesktopMode` 타입 확장
- `useSettingsStore` 마이그레이션 수정
- `WidgetTab.tsx` select 옵션 추가
- `preload.ts` 타입 명확화
- `main.ts`의 `window:applyWidgetSettings` 정규화 수정
- Windows 외 환경에서 옵션 비활성화

완료 기준:

- 설정에서 `바탕화면 아이콘 아래` 선택 가능
- 저장 후 재실행해도 값이 유지됨
- 메인 프로세스에서 `native-desktop`이 `normal`로 버려지지 않음
- 아직 native 기능은 no-op이어도 됨

#### Phase 2. no-op DesktopWidgetManager 도입

목표:

- native 구현 전에도 main 통합 구조를 안전하게 만든다.

작업:

- `electron/desktopWidgetManager.ts` 생성
- win32가 아니면 no-op manager 반환
- `enable`, `disable`, `updateBounds`, `healthCheck`, `isEnabled` 기본 구현
- `main.ts`에서 manager 호출 지점 연결

완료 기준:

- Windows 외 환경 또는 native 미구현 상태에서도 앱이 죽지 않음
- `normal`, `topmost` 기존 모드 정상

#### Phase 3. koffi dependency 및 빌드 설정

목표:

- Windows native API 호출 기반을 마련한다.

작업:

- `package.json` dependencies에 `koffi` 추가
- `scripts/build-electron.mjs` external에 `koffi` 추가 검토
- `electron-builder.yml`에 `asarUnpack` 추가 검토
- packaged 앱에서 `koffi` load 가능 여부 확인

완료 기준:

- `npm install` 후 lockfile 갱신
- `npm run build:electron` 통과
- 설치본에서 native module load 오류 없음

#### Phase 4. WorkerW attach 구현

목표:

- 쌤핀 위젯 창을 Windows 바탕화면 WorkerW 레이어에 붙인다.

작업:

- `getNativeWindowHandle()`로 HWND 확보
- `FindWindowW('Progman', null)` 구현
- `FindWindowExW`로 `WorkerW` 탐색
- 필요 시 WorkerW 생성 유도 메시지 전송
- `SetParent(widgetHwnd, workerWHwnd)` 호출
- `ShowWindow`, `SetWindowPos`로 표시 보정

완료 기준:

- `native-desktop` 선택 시 위젯이 바탕화면 레이어에 붙음
- 실패 시 `normal` fallback
- 앱 종료 시 parent/style 복구 또는 안전 정리

#### Phase 5. 바탕화면 아이콘 ListView 탐색

목표:

- Explorer가 관리하는 바탕화면 아이콘 목록을 찾는다.

작업:

- `SHELLDLL_DefView` 탐색
- `SysListView32` / `FolderView` 탐색
- Explorer 재시작 후 핸들 갱신 로직 추가

완료 기준:

- 아이콘 표시 상태에서 ListView handle 확보
- 아이콘 숨김 상태 또는 탐색 실패 상태에서도 앱이 죽지 않음

#### Phase 6. LVM_HITTEST 구현

목표:

- 특정 화면 좌표에 바탕화면 아이콘이 있는지 판정한다.

작업:

- `GetWindowThreadProcessId`로 Explorer PID 확보
- `OpenProcess`로 Explorer process handle 확보
- `VirtualAllocEx`로 Explorer 프로세스 메모리 확보
- `WriteProcessMemory`로 hit-test 구조체 전달
- `SendMessageW(listViewHwnd, LVM_HITTEST, ...)` 호출
- 결과 판정 후 `VirtualFreeEx`, `CloseHandle` 정리
- screen 좌표 → ListView client 좌표 변환

완료 기준:

- 아이콘 위 좌표와 빈 공간 좌표를 구분
- DPI 100% 기준에서 정확히 동작
- 실패 시 안전 fallback 또는 pass-through

#### Phase 7. mouse hook routing 구현

목표:

- 아이콘 클릭은 Explorer로, 위젯 클릭은 쌤핀으로 라우팅한다.

작업:

- `WH_MOUSE_LL` hook 등록
- 위젯 bounds 안/밖 판단
- 아이콘 hit-test 결과에 따라 `CallNextHookEx` 또는 `PostMessageW` 분기
- 클릭, 더블클릭, drag, mouse move, mouse leave, wheel 처리
- hook 중복 등록 방지
- `disable()`에서 hook 해제

완료 기준:

- 위젯 위 바탕화면 아이콘 클릭 가능
- 아이콘 드래그·이동 가능
- 위젯 카드/버튼 클릭 가능
- 앱 종료 후 mouse hook 잔류 없음

#### Phase 8. 안정성·복구

목표:

- 실제 교사 PC 환경에서 매일 쓸 수 있는 안정성을 확보한다.

작업:

- Win+D 후 복구
- Explorer 재시작 감지 후 재부착
- display 변경 이벤트 후 health check
- session lock/unlock, suspend/resume 후 health check
- 연속 실패 시 native mode 중지 및 normal fallback
- 진단 로그 정리

완료 기준:

- Explorer 재시작 후 재부착 또는 안전 fallback
- DPI 125%, 150%에서 좌표 보정
- 다중 모니터에서 위젯 위치와 hit-test 일치

#### Phase 9. 제품화

목표:

- 사용자가 이해하고 안전하게 켜고 끌 수 있게 한다.

작업:

- 설정 설명 문구 추가
- 릴리즈 노트 문구 작성
- 도움말/FAQ 추가
- 진단 정보 복사 버튼 검토
- 실패 시 토스트 또는 설정 경고 메시지 제공

완료 기준:

- 사용자가 기능의 민감 권한 성격과 되돌리는 방법을 이해할 수 있음
- 지원 문의 시 진단 정보를 받을 수 있음

---

## 10. 코드 변경 후보 파일

| 파일 | 변경 내용 |
|---|---|
| `src/domain/entities/Settings.ts` | `WidgetDesktopMode`에 `native-desktop` 추가 |
| `src/adapters/stores/useSettingsStore.ts` | 설정 마이그레이션 및 unknown mode fallback 수정 |
| `src/adapters/components/Settings/tabs/WidgetTab.tsx` | 위젯 표시 모드 옵션·설명 추가 |
| `electron/preload.ts` | `applyWidgetSettings` 타입 정교화 |
| `electron/main.ts` | `native-desktop` 모드 분기, manager 호출, cleanup 연결 |
| `electron/desktopWidgetManager.ts` | 신규. native desktop mode high-level manager |
| `electron/platform/win32Desktop.ts` | 신규. koffi 기반 Win32 API wrapper |
| `electron/desktopWidgetTypes.ts` | 신규. status, diagnostics, bounds type |
| `scripts/build-electron.mjs` | `koffi` external 처리 검토 |
| `electron-builder.yml` | `koffi` native binary packaging 설정 검토 |
| `package.json` | `koffi` dependency 추가 |
| `docs/user-guide.md` 또는 FAQ 문서 | 기능 설명·주의사항 추가 |

---

## 11. 성공 지표

### 11.1 기능 성공 기준

- 사용자가 설정에서 `바탕화면 아이콘 아래` 모드를 선택할 수 있다.
- 위젯이 바탕화면 레이어에 붙는다.
- 바탕화면 아이콘이 위젯 위에 보인다.
- 위젯 위 아이콘 클릭·더블클릭·드래그가 가능하다.
- 위젯 카드와 버튼도 클릭 가능하다.
- 실패 시 앱이 죽지 않고 일반 모드로 복귀한다.

### 11.2 품질 성공 기준

- `npm run typecheck` 통과
- `npm run build:electron` 통과
- Windows packaged 설치본에서 native module load 성공
- Win+D, Explorer 재시작, DPI 변경, 다중 모니터 수동 검증 통과
- hook/memory/process handle cleanup 검증 통과

### 11.3 사용자 경험 성공 기준

- 사용자가 기능명을 보고 어떤 기능인지 이해할 수 있다.
- 문제가 생겼을 때 일반 모드로 되돌리는 경로가 명확하다.
- 보안 프로그램 경고 가능성에 대한 설명이 과하지 않지만 투명하다.

---

## 12. 테스트 전략

### 12.1 WSL/Linux 정적 검증

WSL에서는 실제 Win32 동작을 검증할 수 없다. 대신 타입·빌드·분기 안정성을 확인한다.

필수 명령:

```bash
npm run typecheck
npm run build:electron
npm run build
```

가능하면 추가:

```bash
npm run test
```

검증 항목:

- `native-desktop` 타입 누락 없음
- Windows 외 환경에서 native module이 load되지 않음
- `normal`, `topmost` 기존 모드 회귀 없음
- `koffi` import가 비Windows 빌드에서 문제를 만들지 않음

### 12.2 Windows 개발 환경 검증

필수 수동 검증:

1. 앱 실행
2. 설정 > 위젯 > `바탕화면 아이콘 아래` 선택
3. 위젯 모드 진입
4. 바탕화면 아이콘이 위젯 위에 보이는지 확인
5. 아이콘 단일 클릭
6. 아이콘 더블클릭
7. 아이콘 드래그 이동
8. 위젯 카드/버튼 클릭
9. 위젯 리사이즈 후 아이콘 hit-test 좌표 확인
10. 일반 모드로 되돌리기
11. 항상 위에 모드로 전환
12. 앱 종료 후 hook 잔류 없는지 확인

### 12.3 Windows 예외 상황 검증

| 상황 | 기대 결과 |
|---|---|
| Win+D | 위젯이 사라진 채 남지 않음 |
| Explorer 재시작 | 재부착 또는 normal fallback |
| DPI 125% | 클릭 좌표 정상 |
| DPI 150% | 클릭 좌표 정상 |
| 다중 모니터 | 위젯 위치 모니터 기준으로 hit-test 정상 |
| 절전 복귀 | health check 후 정상 또는 fallback |
| 바탕화면 아이콘 숨김 | 앱 죽지 않음, fallback 또는 제한 동작 |
| 보안 프로그램 차단 | 앱 죽지 않음, 사용자에게 실패 안내 |

### 12.4 패키징 검증

```bash
npm run electron:build
```

검증 항목:

- 설치본에서 `koffi` native binary load 가능
- `asarUnpack` 누락 없음
- 설치 후 첫 실행에서 normal mode 정상
- native-desktop mode 선택 시 오류 로그 없음 또는 fallback 안내 정상

---

## 13. 리스크와 대응

| 리스크 | 영향 | 대응 |
|---|---|---|
| Explorer 내부 창 구조 변경 | 기능 실패 | WorkerW/ListView 탐색 실패 시 fallback |
| DPI/다중 모니터 좌표 오류 | 클릭 위치 불일치 | scaleFactor 기반 좌표 변환, Windows 실기 검증 |
| mouse hook 보안 경고 | 사용자 불안 | 설정 설명·릴리즈 노트에 투명 안내 |
| koffi 패키징 실패 | 설치본에서 기능 불가 | `asarUnpack`, packaged smoke test 필수 |
| hook cleanup 실패 | 입력 이상 가능성 | `disable`, `closed`, `before-quit`, mode 변경 cleanup 중복 안전화 |
| main.ts 복잡도 증가 | 유지보수 악화 | `desktopWidgetManager.ts`, `win32Desktop.ts` 분리 |
| Windows 외 빌드 깨짐 | macOS/Linux 회귀 | 동적 import, no-op fallback, 플랫폼 가드 |

---

## 14. 출시 메시지 초안

### 설정 UI 설명

```text
바탕화면 아이콘 아래
쌤핀 위젯을 바탕화면 작업판처럼 깔고, 바탕화면 아이콘은 위에서 그대로 클릭·이동할 수 있습니다. Windows 전용 기능입니다.
```

### 릴리즈 노트 초안

```text
새로운 위젯 표시 모드: 바탕화면 아이콘 아래
이제 쌤핀 위젯을 바탕화면 작업판처럼 깔아두고, Windows 바탕화면 아이콘을 그 위에서 그대로 클릭하고 이동할 수 있습니다.

이 기능은 Windows 바탕화면 창 계층과 마우스 이벤트를 제어하므로 일부 보안 프로그램에서 민감하게 볼 수 있습니다. 문제가 있으면 설정 > 위젯에서 언제든 일반 모드로 되돌릴 수 있습니다.
```

---

## 15. 구현 완료 정의

이 기능은 다음 조건을 모두 만족해야 완료로 본다.

- [ ] 설정 > 위젯에 `바탕화면 아이콘 아래` 옵션이 있다.
- [ ] 내부 타입 `WidgetDesktopMode`가 `native-desktop`을 포함한다.
- [ ] 저장소, preload, main IPC가 `native-desktop` 값을 보존한다.
- [ ] Windows에서 위젯 HWND를 WorkerW에 attach할 수 있다.
- [ ] 바탕화면 아이콘 `SysListView32`를 탐색할 수 있다.
- [ ] 위젯 위 아이콘 클릭·드래그가 가능하다.
- [ ] 위젯 내부 카드·버튼 클릭이 가능하다.
- [ ] Win+D, Explorer 재시작, DPI, 다중 모니터 검증을 통과한다.
- [ ] 실패 시 앱 종료 없이 `normal` fallback한다.
- [ ] 앱 종료와 모드 변경 시 hook과 native resource가 정리된다.
- [ ] `npm run typecheck`, `npm run build:electron`, packaged build가 통과한다.
- [ ] 사용자 안내 문구와 되돌리기 경로가 제공된다.

---

## 16. 최종 권장안

쌤핀에는 이 기능을 **단순히 스쿨보드 모방 기능**으로 넣기보다, 제품 언어상 **바탕화면 작업판**의 기반 기능으로 넣는 것이 좋다.

권장 구조:

1. 설정 모드명: **바탕화면 아이콘 아래**
2. 제품 메시지: **바탕화면 작업판처럼 쓰는 쌤핀 위젯**
3. 내부 구현명: `native-desktop`
4. 구현 방식: `koffi` 기반 Win32 manager를 별도 모듈로 분리
5. 출시 방식: 실험적/Windows 전용 기능으로 시작하고, fallback과 되돌리기 경로를 명확히 제공

이 방향이 쌤핀의 기존 강점인 가벼움, 로컬 우선, 교사용 데스크톱 대시보드 정체성과 가장 잘 맞는다.
