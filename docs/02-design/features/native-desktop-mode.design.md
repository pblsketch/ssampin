# native-desktop-mode Design Document

> **Summary**: Windows 전용 `WidgetDesktopMode='native-desktop'` 모드를 신설한다. 위젯 BrowserWindow를 Explorer `WorkerW` 레이어에 attach하고, 위젯 안의 `desktop-icon-zone` 카드(예: `작업 전 / 작업 중 / 작업 완료`) 영역만 `WH_MOUSE_LL` low-level mouse hook으로 이벤트를 Explorer로 통과시킨다. Win32/FFI 코드는 `electron/desktopWidgetManager.ts` + `electron/platform/win32Desktop.ts`로 격리하고, 비Windows에서는 no-op manager가 안전한 `'normal'` fallback을 보장한다. 쌤핀은 구역 카드의 이름·개수·레이아웃만 저장하며 바탕화면 파일/아이콘 데이터는 Explorer가 그대로 관리한다.
>
> **Project**: SsamPin
> **Version**: v2.1.0 (예정)
> **Author**: pblsketch
> **Date**: 2026-05-04
> **Status**: Draft v0.1
> **Planning Doc**: [native-desktop-mode.plan.md](../../01-plan/features/native-desktop-mode.plan.md)

### 관련 문서

| 문서 | 경로 | 상태 |
|------|------|------|
| Plan | `docs/01-plan/features/native-desktop-mode.plan.md` | Draft |
| 사용자 제공 프롬프트 | 본 세션 (2026-05-04) | 참조 |
| 기존 위젯 구현 | `electron/main.ts:447-1074`, `src/adapters/components/Widget/` | 현행 |
| 패턴 템플릿 | icon-mode 신규 IPC 4채널, `executeWindowTransition` | 현행 |
| Settings 엔티티 | `src/domain/entities/Settings.ts:128-149` (WidgetSettings) | 현행 |
| 빌드 설정 | `scripts/build-electron.mjs`, `electron-builder.yml` | 수정 대상 |

---

## 1. 개요

### 1.1 설계 목표

1. **Win32/FFI 격리**: `electron/main.ts`(약 3,587 lines)에 native 코드를 넣지 않는다. `desktopWidgetManager.ts`(고수준 API)와 `platform/win32Desktop.ts`(저수준 FFI)로 2단 분리.
2. **비Windows 안전**: 모든 비Windows 환경에서 no-op manager가 즉시 `'normal'` fallback. macOS 빌드 회귀 0.
3. **회귀 격리**: 기존 `'normal'`/`'topmost'`/`'icon'` 모드는 본 기능 도입으로 단 한 줄도 동작이 변하지 않는다. `applyWidgetSettings` 정규화의 잠재 버그(현재 `'native-desktop'` 값을 `'normal'`로 버릴 가능성)를 별도 PR로 선결.
4. **2단계 Phase 분리**: Phase 1(Safe — 타입·UI·no-op)과 Phase 2(Win32 — koffi/WorkerW/hook)을 별도 PR로 분리하여 native 버그가 위젯 모드 전체를 깨뜨리는 위험 차단.
5. **DPI/멀티모니터 정확성**: Renderer CSS px → Electron DIP → Win32 physical px 좌표 변환을 단일 함수로 캡슐화하고 100% / 125% / 150% / 다중 모니터 모두 검증.
6. **사용자 OFF 즉시 복구**: manager `disable()`은 다중 호출 안전, parent/style/hook 모두 원복. mode OFF 토글 한 번에 평소 위젯이 돌아온다.

### 1.2 설계 원칙

- **최소 침습**: 기존 `widgetWindow` 라이프사이클은 변경하지 않고 `desktopWidgetManager`만 라이프사이클 훅에서 호출.
- **단일 진입점**: WorkerW attach/disable/healthCheck는 모두 `desktopWidgetManager` 1개 인스턴스를 통과. 분산 분기 금지.
- **순수 타입 공유**: `electron/desktopIconZoneTypes.ts`에 Electron/Node 의존성 없는 순수 타입만 두어 main/preload/renderer가 동일 타입 사용.
- **Clean Architecture 준수**: 윈도우/Win32 관리는 infrastructure 책임. domain은 `WidgetDesktopMode` 확장과 `DesktopIconZoneSettings` 타입만 추가.
- **YAGNI**: 라우팅 정책은 상수로만 두고 사용자 커스터마이징은 미구현.
- **접근성**: 카드 이름·편집 버튼은 키보드 접근 가능, 편집 모드는 pass-through OFF.

### 1.3 범위 / 비범위

**포함**: Plan §2.1 전량 (타입·설정·UI·manager·Win32 attach·hook·DPI·healthCheck·release notes·KB)

**제외**: Plan §2.2 전량 (macOS/Linux native·전역 호환 모드·자동 분류·라우팅 커스터마이징)

---

## 2. 아키텍처

### 2.1 컴포넌트 다이어그램

```
┌──────────────────────────────────────────────────────────────────┐
│  Electron Main Process                                           │
│                                                                  │
│  electron/main.ts                                                │
│   ├─ createWidgetWindow()    ──► (after ready) manager.enable() │
│   ├─ window:applyWidgetSettings ── 정규화 수정 (native-desktop 보존) │
│   ├─ window:toggleWidget     ──► (before destroy) manager.disable()│
│   ├─ window:setWidgetLayout  ──► manager.updateWidgetBounds()   │
│   ├─ window:resizeWidget     ──► manager.updateWidgetBounds()   │
│   ├─ startWinDRecovery       ──► manager.healthCheck()          │
│   └─ ipcMain.handle('desktopIconZones:updateBounds', ...)       │
│            │                                                     │
│            ▼                                                     │
│  electron/desktopWidgetManager.ts (NEW)                          │
│   ├─ enable(widgetWindow): Promise<DesktopWidgetModeStatus>     │
│   ├─ disable(): void                                            │
│   ├─ updateWidgetBounds(widgetWindow): void                     │
│   ├─ setPassThroughZones(zones: DesktopIconZoneBounds[]): void  │
│   ├─ clearPassThroughZones(): void                              │
│   ├─ healthCheck(widgetWindow): Promise<DesktopWidgetModeStatus>│
│   └─ isEnabled(): boolean                                       │
│            │                                                     │
│            ├──── (Windows)  ──► electron/platform/win32Desktop  │
│            │                     ├─ findOrCreateWorkerW()      │
│            │                     ├─ attachToWorkerW(hwnd, parent)│
│            │                     ├─ detachFromWorkerW(hwnd)    │
│            │                     ├─ installLowLevelMouseHook() │
│            │                     ├─ uninstallLowLevelMouseHook │
│            │                     ├─ findDesktopListView()      │
│            │                     └─ koffi: User32, Kernel32... │
│            │                                                     │
│            └──── (non-Windows) ─► no-op manager                  │
│                                  (모든 메소드가 즉시 ok=false 반환)│
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  Renderer Process (위젯)                                         │
│                                                                  │
│  src/adapters/components/Widget/Widget.tsx                       │
│   └─ {isNativeDesktopMode && <DesktopIconZoneCard zone={z} />}  │
│                                                                  │
│  src/adapters/components/Widget/DesktopIconZoneCard.tsx (NEW)    │
│   ├─ ResizeObserver → DOM rect 측정                             │
│   ├─ devicePixelRatio 곱해 physical px 산출                     │
│   └─ throttle 30Hz로 window.electronAPI                          │
│                .desktopIconZones.updateBounds(zones)            │
│                                                                  │
│  src/adapters/components/Widget/DesktopIconZoneSettings.tsx (NEW)│
│   ├─ 구역 추가/삭제/이름 변경 (1~6개 제한)                      │
│   └─ Settings store → Repository → IStoragePort                  │
│                                                                  │
│  src/adapters/components/Widget/WidgetContextMenu.tsx (수정)     │
│   └─ "바탕화면 작업판" 토글 + 설정 진입 (Windows에서만 표시)    │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 Phase 분리 (PR 단위)

| Phase | PR 단위 | 검증 환경 | 결과물 |
|-------|---------|-----------|--------|
| **선결 PR** | `applyWidgetSettings` 정규화 수정 (native-desktop 값 보존) + WidgetDesktopMode 타입 확장 | 모든 OS | 동작 변화 0, 회귀 격리 |
| **Phase 1** | `DesktopIconZoneSettings` 타입 + 마이그레이션 + DesktopIconZoneCard UI + DesktopIconZoneSettings UI + no-op manager + IPC 채널 | 모든 OS (typecheck/build/test PASS) | UI/UX 완성, 비Windows 출하 가능 |
| **Phase 2** | `koffi` 의존성 + win32Desktop.ts + WorkerW attach + WH_MOUSE_LL hook + DPI 변환 + healthCheck | Windows 실기 검증 17항목 | native-desktop 정식 동작 |

### 2.3 시퀀스 — 활성화 → 사용 → OFF

```
사용자: 위젯 우클릭 > "바탕화면 작업판 켜기"
  → renderer: useSettingsStore.setState({ widget: { ..., desktopMode: 'native-desktop' } })
  → renderer: window.electronAPI.applyWidgetSettings({ opacity, desktopMode: 'native-desktop' })
  → main: ipcMain('window:applyWidgetSettings')
       widgetWindow.setOpacity(opacity)
       if (desktopMode === 'native-desktop') {
         const status = await desktopWidgetManager.enable(widgetWindow)
         if (!status.ok) {
           widgetWindow.webContents.send('desktopMode:fallback', status)  // toast
           // settings store는 fallbackMode로 자동 reset
         }
       } else {
         desktopWidgetManager.disable()
         widgetWindow.setAlwaysOnTop(desktopMode === 'topmost')
       }
  → renderer: <DesktopIconZoneCard /> 마운트, ResizeObserver 시작
  → renderer: throttle 30Hz로 desktopIconZones.updateBounds(zones)
  → main: manager.setPassThroughZones(zones)
       (cache 갱신만, hook은 cache hit-test로 즉시 반응)

사용자: 바탕화면 아이콘 드래그
  → 시스템 mouse event
  → WH_MOUSE_LL hook (manager 내부)
       physicalPoint = { x, y } from MSLLHOOKSTRUCT
       isInWidgetBounds = ...
       isInPassThroughZone = zones.some(z => contains(z.rect, physicalPoint))
       if (isInWidgetBounds && isInPassThroughZone) → CallNextHookEx (Explorer로 통과)
       else if (isInWidgetBounds) → CallNextHookEx (Electron HWND가 자체 처리)
       else → CallNextHookEx (시스템 기본 동작)

사용자: 위젯 우클릭 > "바탕화면 작업판 끄기"
  → renderer: setState({ widget: { ..., desktopMode: 'normal' } })
  → main: manager.disable() → win32Desktop.uninstallHook(); detachFromWorkerW();
       widgetWindow.setAlwaysOnTop(false)
       사용자에게 "일반 위젯 모드로 복귀" 토스트
```

---

## 3. 데이터 모델

### 3.1 Domain — `src/domain/entities/Settings.ts` (수정)

```ts
// 기존
export type WidgetDesktopMode = 'normal' | 'topmost';

// 수정
export type WidgetDesktopMode = 'normal' | 'topmost' | 'native-desktop';

// 신규
export interface DesktopIconZoneSettings {
  id: string;        // uuid
  name: string;      // 사용자 표시명, 1~20자
  enabled: boolean;  // 비활성화 시 bounds 미전송
  order: number;     // UI 정렬 순서, 0부터
}

// WidgetSettings 확장
export interface WidgetSettings {
  // ... 기존 필드 (opacity, desktopMode, ...)
  desktopMode: WidgetDesktopMode;
  desktopIconZones: DesktopIconZoneSettings[]; // 기본값 [] → 첫 활성화 시 프리셋 3개 제안
}

// 정규화 함수 (마이그레이션용)
export function normalizeDesktopMode(value: unknown): WidgetDesktopMode {
  if (value === 'topmost' || value === 'native-desktop') return value;
  return 'normal';
}

export function normalizeDesktopIconZones(
  value: unknown,
): DesktopIconZoneSettings[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((z): z is Partial<DesktopIconZoneSettings> => typeof z === 'object' && z !== null)
    .map((z, idx) => ({
      id: typeof z.id === 'string' && z.id.length > 0 ? z.id : crypto.randomUUID(),
      name: typeof z.name === 'string' && z.name.trim().length > 0 ? z.name.slice(0, 20) : `구역 ${idx + 1}`,
      enabled: typeof z.enabled === 'boolean' ? z.enabled : true,
      order: typeof z.order === 'number' ? z.order : idx,
    }))
    .sort((a, b) => a.order - b.order)
    .slice(0, 6); // 최대 6개
}

// 첫 활성화 프리셋
export const DEFAULT_DESKTOP_ICON_ZONE_PRESET: DesktopIconZoneSettings[] = [
  { id: '__preset_todo', name: '작업 전', enabled: true, order: 0 },
  { id: '__preset_doing', name: '작업 중', enabled: true, order: 1 },
  { id: '__preset_done', name: '작업 완료', enabled: true, order: 2 },
];
```

### 3.2 공유 타입 — `electron/desktopIconZoneTypes.ts` (신규)

```ts
// Electron/Node 의존성 없는 순수 타입 (main/preload/renderer 공유)
export interface DesktopIconZoneBounds {
  id: string;
  name: string;
  rect: {
    x: number;       // physical screen px
    y: number;       // physical screen px
    width: number;   // physical screen px
    height: number;  // physical screen px
  };
}

export type DesktopWidgetModeStatus =
  | { ok: true; mode: 'native-desktop' }
  | { ok: false; reason: string; fallbackMode: 'normal' | 'topmost' };
```

### 3.3 마이그레이션

기존 사용자 (`desktopMode='normal'|'topmost'`, no `desktopIconZones`):

```ts
// settings 로드 직후 1회
settings.widget.desktopMode = normalizeDesktopMode(settings.widget.desktopMode); // 기존값 보존
settings.widget.desktopIconZones = normalizeDesktopIconZones(settings.widget.desktopIconZones); // [] for legacy

// 사용자가 native-desktop ON 시점에서만 프리셋 제안
if (desktopMode === 'native-desktop' && desktopIconZones.length === 0) {
  desktopIconZones = DEFAULT_DESKTOP_ICON_ZONE_PRESET;
}
```

**원칙**: legacy 사용자의 settings는 단 한 줄도 자동 변경하지 않는다. ON 토글 시점에만 프리셋 채움.

---

## 4. IPC 명세

### 4.1 신규 채널

| 채널 | 방향 | 페이로드 | 응답 | 비고 |
|------|------|----------|------|------|
| `desktopIconZones:updateBounds` | renderer → main | `DesktopIconZoneBounds[]` | `void` | renderer에서 30Hz throttle, main에서 invalid rect 검증 후 cache |
| `desktopIconZones:clearBounds` | renderer → main | `void` | `void` | 위젯 hide / 모드 OFF / 카드 unmount 시 |
| `desktopMode:fallback` | main → renderer | `{ reason: string; fallbackMode: WidgetDesktopMode }` | — | manager.enable() 실패 시 toast 표시용 |

### 4.2 기존 채널 수정

`window:applyWidgetSettings`:

```ts
// 기존 (잠재 버그)
const desktopMode = newSettings.desktopMode === 'topmost' ? 'topmost' : 'normal';

// 수정
const desktopMode: WidgetDesktopMode = normalizeDesktopMode(newSettings.desktopMode);

// 분기 처리
switch (desktopMode) {
  case 'native-desktop': {
    if (process.platform !== 'win32') {
      // 비Windows에서 native-desktop 선택 자체가 막혀야 하지만 방어적으로 처리
      widgetWindow.setAlwaysOnTop(false);
      break;
    }
    const status = await desktopWidgetManager.enable(widgetWindow);
    if (!status.ok) {
      widgetWindow.webContents.send('desktopMode:fallback', {
        reason: status.reason,
        fallbackMode: status.fallbackMode,
      });
      widgetWindow.setAlwaysOnTop(status.fallbackMode === 'topmost');
    }
    break;
  }
  case 'topmost':
    desktopWidgetManager.disable();
    widgetWindow.setAlwaysOnTop(true);
    break;
  case 'normal':
  default:
    desktopWidgetManager.disable();
    widgetWindow.setAlwaysOnTop(false);
    break;
}
```

### 4.3 Preload (contextBridge)

```ts
// electron/preload.ts (수정)
contextBridge.exposeInMainWorld('electronAPI', {
  // ... 기존
  desktopIconZones: {
    updateBounds: (zones: DesktopIconZoneBounds[]) => {
      // 입력 검증 — invalid 입력은 main 도달 전 거부
      const valid = (Array.isArray(zones) ? zones : [])
        .filter((z) =>
          typeof z?.id === 'string' &&
          typeof z?.name === 'string' &&
          typeof z?.rect?.x === 'number' &&
          typeof z?.rect?.y === 'number' &&
          typeof z?.rect?.width === 'number' &&
          typeof z?.rect?.height === 'number' &&
          z.rect.width > 0 &&
          z.rect.height > 0,
        );
      ipcRenderer.invoke('desktopIconZones:updateBounds', valid);
    },
    clearBounds: () => ipcRenderer.invoke('desktopIconZones:clearBounds'),
  },
  onDesktopModeFallback: (cb: (payload: { reason: string; fallbackMode: WidgetDesktopMode }) => void) => {
    const handler = (_e: unknown, payload: typeof cb extends (p: infer P) => unknown ? P : never) => cb(payload);
    ipcRenderer.on('desktopMode:fallback', handler as never);
    return () => ipcRenderer.removeListener('desktopMode:fallback', handler as never);
  },
});
```

---

## 5. UI/UX Design

### 5.1 DesktopIconZoneCard

| 요소 | 스펙 |
|------|------|
| 컨테이너 | `bg-sp-card/30 border border-dashed border-sp-border rounded-xl` (반투명 + 점선) |
| 제목 | `text-sm font-medium text-sp-muted px-3 pt-2`, 클릭/입력 가능한 영역은 카드 상단 헤더로 분리 |
| 본문 | `flex-1 min-h-[120px]` — 이 영역이 pass-through 영역. 시각적으로 비어있고 안내 문구는 `pointer-events-none text-xs text-sp-muted/60 italic` |
| 안내 문구 | "바탕화면 아이콘을 이 영역에 놓아 작업을 정리하세요" (첫 번째 카드만 표시, 학습 후 자동 hide) |
| 편집 버튼 | 카드 상단 헤더 우측, 편집 모드에서만 표시 — `IconButton` + `aria-label` |

**중요**: 카드 본문은 `pointer-events-none`이지만 native mode에서 hook이 처리하므로 사용자에게 영향 없음. **헤더(제목/편집)는 pass-through 영역 밖**이므로 일반 클릭 가능.

### 5.2 DesktopIconZoneSettings

- 구역 추가/삭제/이름 변경 모달 또는 인라인 편집
- 1~6개 제한, 최소 1개 보장
- 이름 1~20자 검증
- 드래그로 순서 변경(`order` 필드)

### 5.3 WidgetContextMenu 확장

```
[기존] 항상 위에 / 보통 위에 / 위치 잠금 / 설정 / 위젯 닫기
[추가] (Windows에서만) ✓ 바탕화면 작업판 켜기 (또는 끄기)
       (Windows에서만) 바탕화면 작업판 설정...
```

비Windows에서는 두 항목 모두 렌더링하지 않음 (`process.platform === 'win32'` 가드).

### 5.4 첫 활성화 안내

토글 ON 직전 모달:

```
바탕화면 작업판
─────────────────────────────────
이 모드는 Windows 바탕화면 아이콘을 쌤핀 위젯의
지정 구역 위에 올려 정리할 수 있게 합니다.

쌤핀은 파일이나 아이콘 정보를 저장하지 않으며,
아이콘 위치는 Windows가 그대로 관리합니다.

⚠ 일부 보안 프로그램이 Windows 창 계층/마우스 이벤트 제어를
   감지할 수 있으나, 문제가 있으면 언제든 일반 위젯 모드로
   되돌릴 수 있습니다.

[취소]  [켜기]
```

---

## 6. 핵심 함수 명세

### 6.1 `electron/desktopWidgetManager.ts`

```ts
import type { BrowserWindow } from 'electron';
import type { DesktopIconZoneBounds, DesktopWidgetModeStatus } from './desktopIconZoneTypes';

export interface DesktopWidgetManager {
  enable(widgetWindow: BrowserWindow): Promise<DesktopWidgetModeStatus>;
  disable(): void;
  updateWidgetBounds(widgetWindow: BrowserWindow): void;
  setPassThroughZones(zones: DesktopIconZoneBounds[]): void;
  clearPassThroughZones(): void;
  healthCheck(widgetWindow: BrowserWindow): Promise<DesktopWidgetModeStatus>;
  isEnabled(): boolean;
}

// 팩토리 — 플랫폼별 실제 구현 선택
export function createDesktopWidgetManager(): DesktopWidgetManager {
  if (process.platform === 'win32') {
    return createWin32DesktopWidgetManager();
  }
  return createNoOpDesktopWidgetManager();
}

// 비Windows no-op 구현
function createNoOpDesktopWidgetManager(): DesktopWidgetManager {
  return {
    async enable() {
      return { ok: false, reason: 'not-supported-on-platform', fallbackMode: 'normal' };
    },
    disable() {},
    updateWidgetBounds() {},
    setPassThroughZones() {},
    clearPassThroughZones() {},
    async healthCheck() {
      return { ok: false, reason: 'not-supported-on-platform', fallbackMode: 'normal' };
    },
    isEnabled() {
      return false;
    },
  };
}
```

### 6.2 `electron/platform/win32Desktop.ts` (Windows 전용)

```ts
import koffi from 'koffi';
import type { BrowserWindow } from 'electron';

// koffi 타입 정의
const HWND = koffi.opaque('HWND');
const user32 = koffi.load('user32.dll');
const FindWindowW = user32.func('FindWindowW', 'HWND', ['str16', 'str16']);
const FindWindowExW = user32.func('FindWindowExW', 'HWND', ['HWND', 'HWND', 'str16', 'str16']);
const SendMessageTimeoutW = user32.func('SendMessageTimeoutW', 'long', ['HWND', 'uint', 'uintptr', 'intptr', 'uint', 'uint', 'pointer']);
const SetParent = user32.func('SetParent', 'HWND', ['HWND', 'HWND']);
const SetWindowPos = user32.func('SetWindowPos', 'bool', ['HWND', 'HWND', 'int', 'int', 'int', 'int', 'uint']);
const EnumWindows = user32.func('EnumWindows', 'bool', ['pointer', 'intptr']);
const SetWindowsHookExW = user32.func('SetWindowsHookExW', 'pointer', ['int', 'pointer', 'pointer', 'uint']);
const CallNextHookEx = user32.func('CallNextHookEx', 'intptr', ['pointer', 'int', 'uintptr', 'intptr']);
const UnhookWindowsHookEx = user32.func('UnhookWindowsHookEx', 'bool', ['pointer']);

const WM_SPAWN_WORKER = 0x052C;
const WH_MOUSE_LL = 14;

export interface Win32DesktopAPI {
  findOrCreateWorkerW(): HwndOpaque | null;
  attachWidgetToWorkerW(widgetHwnd: HwndOpaque, workerW: HwndOpaque): boolean;
  detachWidgetFromWorkerW(widgetHwnd: HwndOpaque): void;
  installLowLevelMouseHook(callback: (point: { x: number; y: number }) => MouseHookDecision): HookOpaque;
  uninstallMouseHook(hook: HookOpaque): void;
  findDesktopListView(): HwndOpaque | null;
}

type MouseHookDecision = 'pass-through' | 'electron-handles';
```

### 6.3 `desktopWidgetManager.win32` 핵심 흐름

```ts
function createWin32DesktopWidgetManager(): DesktopWidgetManager {
  let api: Win32DesktopAPI | null = null;
  let attachedHwnd: HwndOpaque | null = null;
  let mouseHook: HookOpaque | null = null;
  let widgetBoundsCache: { x: number; y: number; width: number; height: number } | null = null;
  let zonesCache: DesktopIconZoneBounds[] = [];
  let enabled = false;

  return {
    async enable(widgetWindow: BrowserWindow): Promise<DesktopWidgetModeStatus> {
      try {
        api ??= await import('./platform/win32Desktop').then((m) => m.createWin32DesktopAPI());
        const workerW = api.findOrCreateWorkerW();
        if (!workerW) {
          return { ok: false, reason: 'workerw-not-found', fallbackMode: 'normal' };
        }
        const hwndBuf = widgetWindow.getNativeWindowHandle();
        const widgetHwnd = decodeHwnd(hwndBuf);
        widgetWindow.setAlwaysOnTop(false);
        if (!api.attachWidgetToWorkerW(widgetHwnd, workerW)) {
          return { ok: false, reason: 'set-parent-failed', fallbackMode: 'topmost' };
        }
        attachedHwnd = widgetHwnd;
        widgetBoundsCache = widgetWindow.getBounds();
        mouseHook = api.installLowLevelMouseHook((point) => decideMouseRouting(point, widgetBoundsCache, zonesCache));
        enabled = true;
        return { ok: true, mode: 'native-desktop' };
      } catch (e) {
        return { ok: false, reason: `exception: ${(e as Error).message}`, fallbackMode: 'normal' };
      }
    },

    disable() {
      if (mouseHook && api) { api.uninstallMouseHook(mouseHook); mouseHook = null; }
      if (attachedHwnd && api) { api.detachWidgetFromWorkerW(attachedHwnd); attachedHwnd = null; }
      widgetBoundsCache = null;
      zonesCache = [];
      enabled = false;
    },

    updateWidgetBounds(widgetWindow) {
      if (!enabled) return;
      widgetBoundsCache = widgetWindow.getBounds();
    },

    setPassThroughZones(zones) {
      // invalid rect 필터링
      zonesCache = zones.filter((z) => z.rect.width > 0 && z.rect.height > 0);
    },

    clearPassThroughZones() {
      zonesCache = [];
    },

    async healthCheck(widgetWindow) {
      if (!enabled) return { ok: false, reason: 'not-enabled', fallbackMode: 'normal' };
      // attach 상태 검증 — Explorer 재시작·display 변경 후 재부착 가능
      // 실패 시 enable() 재호출
      // ... 구현 세부는 Phase 2에서
      return { ok: true, mode: 'native-desktop' };
    },

    isEnabled() {
      return enabled;
    },
  };
}

function decideMouseRouting(
  point: { x: number; y: number },
  widgetBounds: { x: number; y: number; width: number; height: number } | null,
  zones: DesktopIconZoneBounds[],
): 'pass-through' | 'electron-handles' {
  if (!widgetBounds) return 'pass-through';
  const inWidget = point.x >= widgetBounds.x && point.x < widgetBounds.x + widgetBounds.width
    && point.y >= widgetBounds.y && point.y < widgetBounds.y + widgetBounds.height;
  if (!inWidget) return 'pass-through';
  const inZone = zones.some((z) =>
    point.x >= z.rect.x && point.x < z.rect.x + z.rect.width
    && point.y >= z.rect.y && point.y < z.rect.y + z.rect.height,
  );
  return inZone ? 'pass-through' : 'electron-handles';
}
```

### 6.4 좌표 변환

| 좌표계 | 단위 | 출처 |
|--------|------|------|
| Renderer DOM `getBoundingClientRect()` | CSS px | 위젯 내부 기준 (origin = 위젯 client-area 좌상단) |
| Electron `BrowserWindow.getBounds()` | DIP | 가상 데스크톱 기준 |
| Win32 `MSLLHOOKSTRUCT.pt` | physical px | 가상 데스크톱 기준 |

변환 (renderer 측):

```ts
// DesktopIconZoneCard.tsx
function measureZone(el: HTMLElement, widgetBounds: { x: number; y: number }): DesktopIconZoneBounds['rect'] {
  const rect = el.getBoundingClientRect();
  const dpr = window.devicePixelRatio;
  // CSS px → physical px (가상 데스크톱 기준)
  // widgetBounds는 main에서 IPC로 받은 DIP 값
  const display = window.electronAPI.getDisplayForPoint({ x: widgetBounds.x, y: widgetBounds.y });
  const scaleFactor = display.scaleFactor; // Win32 physical px / DIP
  return {
    x: Math.round((widgetBounds.x + rect.left) * scaleFactor),
    y: Math.round((widgetBounds.y + rect.top) * scaleFactor),
    width: Math.round(rect.width * scaleFactor),
    height: Math.round(rect.height * scaleFactor),
  };
}
```

**주의**: Electron의 DIP는 일반적으로 DOM CSS px와 1:1이지만 Windows DPI에서 일부 케이스에 어긋날 수 있다. 실기 검증 시 100/125/150% 모두 측정.

---

## 7. 에러 처리

| 상황 | 처리 |
|------|------|
| `koffi` load 실패 (DLL 미존재 등) | manager.enable()이 `{ ok: false, reason: 'koffi-load-failed', fallbackMode: 'normal' }` 반환, toast 표시 |
| `findOrCreateWorkerW()` 실패 | `{ ok: false, reason: 'workerw-not-found', fallbackMode: 'normal' }` |
| `SetParent` 실패 (권한·UAC) | `{ ok: false, reason: 'set-parent-failed', fallbackMode: 'topmost' }` (사용자가 보이도록 topmost로) |
| mouse hook 설치 실패 | `disable()` 후 `{ ok: false, reason: 'hook-install-failed', fallbackMode: 'normal' }` |
| Explorer 재시작 (WorkerW HWND invalid) | `healthCheck()`이 detect 후 `enable()` 재호출 |
| 위젯 destroy 중 manager가 살아있음 | `disable()` 다중 호출 안전, 각 native handle은 close 시 `null` 체크 |
| zone bounds 갱신 IPC 폭주 | renderer 측 throttle 30Hz, main 측 invalid rect 필터링 |
| 카드 unmount but main이 아직 zones 보유 | renderer unmount cleanup에서 `clearBounds()` 호출 |

---

## 8. 보안 고려사항

| 항목 | 정책 |
|------|------|
| 외부 네트워크 호출 | 0건 (이 기능에 필요 없음) |
| 자격증명 수집 | 0건 |
| 바탕화면 파일 데이터 | 쌤핀이 보유·저장·전송 안 함. Explorer가 모두 관리 |
| 저장 데이터 | `desktopIconZones[]` (이름·개수·order만) — 민감정보 없음 |
| native 코드 보안 | `koffi`는 prebuilt, 외부 DLL 다운로드 없음, user32/kernel32만 사용 |
| 안티바이러스 false-positive | 사용자 토글로 즉시 OFF, 안내 문구 명시, 토스트로 fallback 알림 |
| renderer → main 입력 검증 | preload에서 1차, main에서 2차 (rect width/height > 0, name 길이 등) |
| IPC 채널 이름 | 명시적 namespace `desktopIconZones:*` (다른 채널과 충돌 방지) |

---

## 9. 테스트 계획

### 9.1 단위 테스트 (모든 OS)

| 대상 | 테스트 |
|------|--------|
| `normalizeDesktopMode` | `'normal'/'topmost'/'native-desktop'` 그대로 반환, 그 외 `'normal'` |
| `normalizeDesktopIconZones` | invalid 입력 → `[]`, 최대 6개 truncate, name 20자 truncate, order 정렬 |
| `DEFAULT_DESKTOP_ICON_ZONE_PRESET` | 3개 항목, 이름 정확 |
| `decideMouseRouting` | widget 밖 → pass-through, zone 안 → pass-through, zone 밖 위젯 안 → electron-handles |
| no-op manager `enable()` | `{ ok: false, reason: 'not-supported-on-platform' }` 반환 |
| no-op manager `disable()` 다중 호출 | 예외 없음 |

### 9.2 Renderer 테스트

| 대상 | 테스트 |
|------|--------|
| `DesktopIconZoneCard` | 이름 표시, 점선 테두리, 헤더 분리 |
| `DesktopIconZoneSettings` | 1~6개 제한, 1자 미만 / 21자 이상 거부, order 변경 |
| disabled zone | bounds 전송 대상에서 제외 |
| ResizeObserver | 위젯 리사이즈 시 bounds 재측정 |

### 9.3 Windows 실기 검증 체크리스트 (17항목)

(Plan §5.1 — Phase 2 완료 시 모두 PASS 필수)

1. 위젯 모드 진입
2. 설정에서 "바탕화면 작업판" 활성화
3. 기본 구역 3개 표시
4. 구역 이름 변경
5. 구역 추가/삭제
6. 바탕화면 아이콘을 `작업 전`으로 드래그
7. `작업 중` → `작업 완료`로 이동
8. 구역 빈 공간 클릭이 바탕화면 빈 공간 클릭처럼 동작
9. 일반 쌤핀 카드/버튼/메모 클릭 정상
10. 위젯 이동/리사이즈 후 zone 좌표 정확
11. Win+D 후 위젯/구역 복구
12. Explorer 재시작 후 재부착
13. DPI 100% / 125% / 150% 검증
14. 다중 모니터 검증
15. 절전/잠금 복귀 후 동작
16. OFF 시 일반 위젯 모드 복귀
17. 설치본에서 `koffi` load 정상

### 9.4 회귀 체크리스트

- 기존 `'normal'` 모드 정상
- 기존 `'topmost'` 모드 정상
- icon-mode 모드 정상 (3-state 전환)
- Win+D 복구 정상
- 트레이 메뉴 정상
- macOS / Linux 빌드·실행 정상

---

## 10. Clean Architecture 준수

| 레이어 | 변경 |
|--------|------|
| domain | `WidgetDesktopMode` 확장, `DesktopIconZoneSettings` 신규, 정규화 함수 추가. **외부 의존성 없음** |
| usecases | 본 기능에서 신규 생성 안 함 (Settings 변경은 기존 use case로 처리) |
| adapters | `DesktopIconZoneCard.tsx`, `DesktopIconZoneSettings.tsx` 신규, `Widget.tsx` / `WidgetContextMenu.tsx` 수정. domain + usecases만 import |
| infrastructure | `electron/desktopWidgetManager.ts`, `electron/platform/win32Desktop.ts` 신규. `electron/main.ts` 수정 |

**의존성 위반 없음** — Win32 코드는 infrastructure에 격리, domain은 순수 타입만 추가.

---

## 11. 코딩 컨벤션 적용

- TypeScript strict (`any` 금지, `unknown` 정규화 후 사용)
- Path alias (`@domain/`, `@adapters/`, `@infrastructure/`)
- Tailwind 유틸리티만 사용, `rounded-sp-*` 금지(`feedback_rounding_policy.md`)
- 모든 UI 텍스트 한국어
- 디자인 토큰 (`sp-bg`, `sp-card`, `sp-border`, `sp-accent`, `sp-text`, `sp-muted`)
- 카드 모서리 `rounded-xl`, 버튼 `rounded-lg`
- 컴포넌트 파일명 PascalCase
- 함수형 컴포넌트만, 커스텀 훅 `use` 접두사
- 프론트 작업 시 `frontend-design` 또는 `bkit:frontend-architect`와 협업 (`feedback_frontend_agent_collaboration.md`)

---

## 12. 구현 가이드

### 12.1 권장 작업 순서

**선결 PR (모든 OS 영향, 매우 작은 diff)**
1. `git status --short` — 작업 디렉터리 클린 확인
2. `WidgetDesktopMode` 타입 확장 (normal | topmost | native-desktop)
3. `normalizeDesktopMode` 함수 추가 (이전 `topmost ? topmost : normal` 분기를 제거)
4. `applyWidgetSettings` 정규화 수정
5. typecheck/build/test PASS

**Phase 1 (모든 OS, UI/타입/no-op)**
6. `DesktopIconZoneSettings` 타입 + `normalizeDesktopIconZones` + `DEFAULT_DESKTOP_ICON_ZONE_PRESET`
7. `electron/desktopIconZoneTypes.ts` 신규
8. `electron/desktopWidgetManager.ts` 신규 (no-op 구현만)
9. `electron/main.ts` 라이프사이클 통합 (manager 호출, IPC 채널 등록)
10. `electron/preload.ts` API 노출
11. `DesktopIconZoneCard.tsx` 신규 (UI, ResizeObserver, throttle)
12. `DesktopIconZoneSettings.tsx` 신규 (구역 추가/삭제/이름)
13. `Widget.tsx` 카드 렌더링 (`isNativeDesktopMode` 가드)
14. `WidgetContextMenu.tsx` 메뉴 추가 (Windows 가드)
15. 단위 테스트 추가
16. typecheck/build/test PASS — **이 시점에 macOS/Linux 출하 가능 (no-op fallback)**

**Phase 2 (Windows native)**
17. `package.json`에 `koffi` 추가
18. `scripts/build-electron.mjs` external에 `'koffi'` 추가
19. `electron-builder.yml` `asarUnpack`에 koffi 검토
20. `electron/platform/win32Desktop.ts` 신규 (FFI wrapper)
21. `desktopWidgetManager`의 win32 구현 추가 (enable/disable/hook/healthCheck)
22. DPI/멀티모니터 좌표 변환 함수
23. Windows 실기 검증 17항목
24. 설치본 빌드 → koffi load 검증
25. 회귀 체크리스트
26. release-notes.json + 챗봇 KB + 노션 가이드

### 12.2 실패 시 fallback 매트릭스

| 단계 실패 | fallback |
|-----------|----------|
| Phase 1 typecheck 실패 | 작업 중단, 타입 수정 |
| Phase 1 macOS 빌드 실패 | no-op manager 검증, 작업 중단 |
| Phase 2 koffi load 실패 | 자동 `'normal'` fallback, 사용자 토스트 |
| Phase 2 WorkerW 미발견 | 자동 `'normal'` fallback |
| Phase 2 SetParent 실패 | 자동 `'topmost'` fallback (가시성 보장) |
| Phase 2 hook 설치 실패 | 자동 `'normal'` fallback |
| Phase 2 실기 17항목 중 1개 fail | 해당 항목 분석 후 재구현, 통과 전 release 금지 |

### 12.3 검증 명령

```bash
npm run typecheck
npm run build:electron
npm run build
npm run test
npm run regression-check       # 존재 시
npm run electron:build         # 설치본 (Phase 2 종료 시)
```

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-05-04 | 초안 — Plan v0.1 기반 Design 작성. 선결 PR + Phase 1 + Phase 2 분리 명시 | pblsketch / Claude |
