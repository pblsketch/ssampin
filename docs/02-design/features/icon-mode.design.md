# icon-mode Design Document

> **Summary**: 메인 프로그램 종료 시 화면 위에 떠 있는 56×56 px 플로팅 아이콘 윈도우(`iconWindow`)를 신설하고, opacity fade 220ms로 위젯/풀앱과 자연 전환하는 3-state 윈도우 시스템을 구현한다. 기존 `stickerPickerWindow`/`fadeInQuickAddWindow` 패턴을 거의 그대로 복제하며, `[mainWindow, widgetWindow]` 배열 패턴을 `getAllAppWindows()` 헬퍼로 일원화하는 선결 리팩토링 PR을 통해 회귀 위험을 격리한다.
>
> **Project**: SsamPin
> **Version**: v2.0.2 (예정)
> **Author**: pblsketch
> **Date**: 2026-05-01
> **Status**: Draft v0.2 (사용자 결정 반영: 뱃지 제거, 풀스크린 자동 hide 제외, build/icon.png 사용, v2.0.2 타깃)
> **Planning Doc**: [icon-mode.plan.md](../../01-plan/features/icon-mode.plan.md)

### 관련 문서

| 문서 | 경로 | 상태 |
|------|------|------|
| Plan | `docs/01-plan/features/icon-mode.plan.md` | Draft |
| 기술 검토 | 본 세션 architect 에이전트 출력 (2026-05-01) | 참조 |
| UX 검토 | 본 세션 frontend-architect 에이전트 출력 (2026-05-01) | 참조 |
| 기존 위젯 구현 | `electron/main.ts:447-1074`, `src/adapters/components/Widget/` | 현행 |
| 패턴 템플릿 | `electron/main.ts:283-373` (stickerPickerWindow) | 현행 |
| Fade 패턴 | `electron/main.ts:108-125` (fadeInQuickAddWindow) | 현행 |
| Settings 엔티티 | `src/domain/entities/Settings.ts:128-149` (WidgetSettings) | 현행 |

---

## 1. 개요

### 1.1 설계 목표

1. **검증된 패턴 재사용 우선**: 코드베이스에 이미 존재하는 frameless transparent + alwaysOnTop=`screen-saver` + `visibleOnFullScreen:true` 패턴(stickerPickerWindow)을 그대로 복제하여 신규 인프라 위험을 최소화한다.
2. **3-state 상태머신 명시화**: `icon ↔ widget ↔ main` 전환을 단일 IPC 시리얼 핸들러(`window:transition`)로 통합해 race condition을 차단한다.
3. **회귀 격리 우선**: `[mainWindow, widgetWindow]` 배열이 8곳 이상 흩어져 있는 현실을 인정하고, **본 기능 구현 전에 `getAllAppWindows()` 헬퍼 추출 PR을 먼저 머지**한다. 이 PR은 동작 변경 없이 리팩토링만 수행해 회귀 위험을 본 기능 PR과 분리한다.
4. **하위 호환 무손실**: 기존 사용자(`closeAction='widget'` 또는 `closeToWidget=true`) 동작을 100% 보존하고, `'icon'`은 명시적 옵트인으로만 활성화한다.
5. **opacity-only 애니메이션**: `setBounds` 보간(Windows DWM 한계로 항상 jerky)을 시도하지 않고, opacity 보간만 사용해 양 플랫폼 일관성을 확보한다.

### 1.2 설계 원칙

- **최소 침습**: 기존 `mainWindow`/`widgetWindow` 라이프사이클은 변경하지 않고 `iconWindow`만 추가한다.
- **상태머신 단일 진입점**: 모든 윈도우 모드 전환은 `executeWindowTransition(target: WindowMode)` 함수 1개를 통과한다. 분산된 분기 로직 금지.
- **헬퍼 우선**: `getAllAppWindows()`로 윈도우 배열 패턴을 통일. 새 코드는 헬퍼 사용을 강제(ESLint 규칙 또는 메타테스트로 검증).
- **Clean Architecture 준수**: 윈도우 관리는 infrastructure 레이어 책임. domain은 `WindowMode` value object만 추가, usecases는 본 기능에서 신규 생성하지 않음.
- **접근성 우선**: `prefers-reduced-motion` 시 fade duration=0, 키보드 접근 가능, 터치 타겟 ≥ 44 px (56 px 사용으로 자동 충족).
- **노이즈 최소화 (사용자 결정 v0.2)**: **뱃지 자체 없음**. 아이콘은 `build/icon.png` 축소판만 표시. 알림은 펄스 효과로만 표현(확인 즉시 중단). 정보가 필요하면 호버 툴팁 또는 위젯 펴기.

### 1.3 범위 / 비범위

**포함 (Plan §2.1 전량)**

- 새 BrowserWindow `iconWindow` 생성 함수 `buildIconWindow()` (stickerPickerWindow 패턴 복제)
- `closeAction` 스키마에 `'icon'` enum 값 추가 (`Settings.ts:WidgetSettings`)
- 설정 페이지 X 버튼 동작 라디오 4-옵션화
- IconWindow / IconTooltip / IconContextMenu / CoachMark 컴포넌트 신설 (renderer 측). **IconBadge 제외** (사용자 결정 v0.2)
- 4개 IPC 채널 (`icon:show`, `icon:hide`, `icon:set-bounds`, `icon:expand`)
- `executeWindowTransition()` 상태머신 함수 (`icon ↔ widget ↔ main`)
- `icon-bounds.json` 영속화 + 디바운스 + `ensureIconOnScreen` 안전망
- `getAllAppWindows()` 헬퍼 추출 (선결 PR)
- 트레이 컨텍스트 메뉴 "아이콘 위치 초기화" 항목
- 호버 툴팁, 우클릭 컨텍스트 메뉴, 더블클릭 분기, 드래그 영역
- `prefers-reduced-motion` 대응
- ~~다른 앱 풀스크린 자동 hide~~ — **제외** (사용자 결정 v0.2: 그냥 떠 있어도 됨)
- 1회성 코치마크
- v2.0.2 첫 실행 시 1회성 인앱 토스트 ("X 버튼 동작 설정에서 아이콘 모드를 켤 수 있어요")
- 마이그레이션 (기본값 `'widget'` 유지)
- release-notes.json v2.0.2 + 챗봇 KB 업데이트

**제외 (Plan §2.2)**

- 모바일 앱 / macOS 네이티브 위젯 SDK / 라이브 차트 / 위치 자석 / 사용자 커스터마이징

---

## 2. 아키텍처

### 2.1 컴포넌트 다이어그램

```
[전체 윈도우 라이프사이클]

┌──────────────────────────────────────────────────────────────────┐
│  Electron Main Process (electron/main.ts)                        │
│                                                                  │
│   ┌──────────────┐   ┌────────────────┐   ┌──────────────────┐  │
│   │  mainWindow  │   │  widgetWindow  │   │   iconWindow     │  │
│   │  (풀앱)       │   │  (위젯)        │   │   (NEW, 56×56)  │  │
│   │              │   │                │   │                  │  │
│   │  920×700     │   │  920×700 정도  │   │   56×56 px       │  │
│   │  frameless   │   │  frameless     │   │   frameless      │  │
│   │              │   │  transparent   │   │   transparent    │  │
│   │              │   │  alwaysOnTop   │   │   alwaysOnTop    │  │
│   │              │   │  (옵션)        │   │   screen-saver   │  │
│   └──────┬───────┘   └────────┬───────┘   └────────┬─────────┘  │
│          │                    │                     │           │
│          └────────────────────┴─────────────────────┘           │
│                               │                                 │
│              executeWindowTransition(target)  ◄─── ★ 단일 진입점│
│                               │                                 │
│                  getAllAppWindows() 헬퍼 (NEW)                 │
│                               │                                 │
└───────────────────────────────┼─────────────────────────────────┘
                                │
              ┌─────────────────┴────────────────┐
              ▼                                  ▼
   ┌─────────────────────┐           ┌──────────────────────┐
   │ IPC: window:transition │       │ IPC: icon:set-bounds │
   │   payload: 'icon'/      │       │ icon:show / icon:hide│
   │   'widget' / 'main'     │       │ icon:expand          │
   └─────────────────────┘           └──────────────────────┘
              ▲                                  ▲
              │                                  │
   ┌──────────┴──────────────────────────────────┴───────┐
   │  Renderer (src/adapters/components/)                │
   │                                                     │
   │  ┌──────────────────┐   ┌──────────────────────┐  │
   │  │  Icon/IconWindow │   │  Widget/Widget       │  │
   │  │  (NEW)           │   │  (existing)          │  │
   │  │  - IconBadge     │   │  - WidgetContextMenu │  │
   │  │  - IconTooltip   │   │    "아이콘으로 접기" │  │
   │  └──────────────────┘   │     항목 추가        │  │
   │                         └──────────────────────┘  │
   │                                                    │
   │  ┌──────────────────┐                              │
   │  │  Settings/        │                             │
   │  │  SettingsPage     │  ← X 버튼 동작 라디오     │
   │  │  (4 옵션화)       │     'widget'/'icon'/       │
   │  │                  │     'tray'/'ask'           │
   │  └──────────────────┘                              │
   └────────────────────────────────────────────────────┘
```

### 2.2 데이터/제어 흐름 (3-state 전환 시퀀스)

```
[시나리오 1: 풀앱 → 아이콘으로 접기]

User clicks X
   ▼
mainWindow.on('close')
   ▼
readSettingsWidgetOptions().closeAction === 'icon'
   ▼
e.preventDefault()
   ▼
executeWindowTransition('icon')
   │
   ├─ 1. ensureIconWindowExists()        (없으면 buildIconWindow())
   ├─ 2. iconWindow.setOpacity(0); iconWindow.show()
   ├─ 3. fadeInIconWindow(220ms)         (opacity 0→1)
   ├─ 4. (병렬) hideOrDestroyMainWindow(memorySaverMode)
   └─ 5. 마지막 state 기록: lastUserMode = 'main'

[시나리오 2: 아이콘 단일 클릭 → 마지막 state 복원]

User clicks iconWindow
   ▼
IconWindow.tsx onClick handler
   ▼
electronAPI.iconExpand({ to: 'restore' })
   ▼
IPC 'icon:expand'
   ▼
executeWindowTransition(lastUserMode === 'main' ? 'main' : 'widget')
   │
   ├─ 1. fadeOutIconWindow(180ms)        (opacity 1→0)
   ├─ 2. iconWindow.hide()                (애니메이션 종료 후)
   ├─ 3. show(targetWindow); fadeIn       (만약 transparent widget이면)
   └─ 4. lastUserMode 갱신

[시나리오 3: 아이콘 더블클릭 → 풀앱 직행]

User double-clicks iconWindow
   ▼
IconWindow.tsx onDoubleClick handler  (단일 클릭 250ms 디바운스)
   ▼
electronAPI.iconExpand({ to: 'main' })
   ▼
IPC 'icon:expand' with target='main'
   ▼
executeWindowTransition('main')
```

### 2.3 의존성 / 새 파일 목록

| 컴포넌트 | 의존하는 것 | 용도 |
|----------|-------------|------|
| `electron/main.ts: buildIconWindow()` | Electron BrowserWindow API, screen API | iconWindow 인스턴스 생성 |
| `electron/main.ts: executeWindowTransition()` | mainWindow, widgetWindow, iconWindow refs | 3-state 단일 전환 진입점 |
| `electron/main.ts: getAllAppWindows()` | mainWindow, widgetWindow, iconWindow refs | 윈도우 배열 패턴 통일 헬퍼 |
| `electron/main.ts: fadeInIconWindow()` | setOpacity 보간 (fadeInQuickAddWindow 복제) | 220ms 페이드인 |
| `electron/main.ts: fadeOutIconWindow()` | setOpacity 보간 | 180ms 페이드아웃 |
| `electron/main.ts: ensureIconOnScreen()` | screen.getAllDisplays(), iconWindow.setBounds | 멀티모니터 안전망 |
| `electron/main.ts: saveIconBounds()` | fs.writeFileSync, debounce 500ms | `icon-bounds.json` 영속화 |
| `electron/preload.ts: iconShow/Hide/SetBounds/Expand` | ipcRenderer.invoke | 4 IPC bridge |
| `src/adapters/components/Icon/IconWindow.tsx` | useScheduleStore, useEventsStore, useTodoStore, build/icon.png | 아이콘 본체 (56×56) — 앱 아이콘만 표시 |
| ~~IconBadge~~ | — | **제거됨** (v0.2) |
| `src/adapters/components/Icon/IconTooltip.tsx` | (props만 받음) | 호버 시 100ms 후 노출 |
| `src/adapters/components/Settings/SettingsPage.tsx` | (수정) | X 버튼 동작 라디오 4-옵션 |
| `src/adapters/components/Widget/WidgetContextMenu.tsx` | (수정) | "아이콘으로 접기" 항목 |
| `src/domain/valueObjects/WindowMode.ts` (선택) | 없음 (pure type) | `'icon' \| 'widget' \| 'main'` |

---

## 3. 데이터 모델

### 3.1 도메인 엔티티 변경

#### 3.1.1 `WidgetSettings` (수정 — 기존 `Settings.ts:128-149`)

```typescript
// src/domain/entities/Settings.ts
export interface WidgetSettings {
  readonly width: number;
  readonly height: number;
  readonly transparent: boolean;
  readonly opacity: number;
  readonly cardOpacity: number;
  readonly alwaysOnTop: boolean;
  readonly closeToWidget: boolean;        // keep for backward compat
  // ↓ 변경: 'icon' 추가
  readonly closeAction?: 'widget' | 'tray' | 'ask' | 'icon';
  readonly visibleSections: WidgetVisibleSections;
  readonly layoutMode: WidgetLayoutMode;
  readonly desktopMode: WidgetDesktopMode;
  readonly showWeather?: boolean;
  readonly memorySaverMode?: boolean;
  // ↓ NEW: 아이콘 모드 옵션
  readonly icon?: IconModeOptions;
}

// NEW
export interface IconModeOptions {
  /** 첫 활성화 코치마크 노출 여부 (기본 true → 첫 진입 후 false로 갱신) */
  readonly showCoachMark: boolean;
  // 주: 풀스크린 자동 hide(autoHideOnFullscreen)는 사용자 결정으로 제외(v0.2).
  //     아이콘은 alwaysOnTop='screen-saver' + visibleOnFullScreen:true로 항상 떠 있음.
}
```

#### 3.1.2 `WindowMode` value object (NEW, 선택)

```typescript
// src/domain/valueObjects/WindowMode.ts
export type WindowMode = 'icon' | 'widget' | 'main';

export const WINDOW_MODES = ['icon', 'widget', 'main'] as const;

export function isValidWindowMode(value: string): value is WindowMode {
  return (WINDOW_MODES as readonly string[]).includes(value);
}
```

### 3.2 영속화 데이터

#### 3.2.1 `icon-bounds.json` (NEW)

`widget-bounds.json` 패턴 복제. `app.getPath('userData')/data/icon-bounds.json`에 저장.

```typescript
interface IconBounds {
  x: number;
  y: number;
  // 56×56 고정이지만 사용자 화면 해상도/DPI 변화 대응 위해 width/height도 저장
  width: number;
  height: number;
  // 마지막 위치를 저장한 디스플레이 ID (모니터 disconnect 시 fallback)
  displayId?: number;
}
```

기본값 (파일 없음): 화면 우하단 24px 마진, 활성 디스플레이 기준.

```typescript
function getDefaultIconBounds(): IconBounds {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.workArea;
  return {
    x: x + width - 56 - 24,
    y: y + height - 56 - 24,
    width: 56,
    height: 56,
    displayId: display.id,
  };
}
```

#### 3.2.2 `settings.json`의 `widget.icon` (NEW)

```json
{
  "widget": {
    "closeAction": "icon",
    "icon": {
      "showCoachMark": false
    }
  }
}
```

### 3.3 마이그레이션 전략

| 기존 상태 | 마이그레이션 후 동작 |
|-----------|---------------------|
| `closeToWidget=true` (legacy) | 그대로 → `closeAction='widget'` 폴백 (기존 [`main.ts:1090-1092`](e:/github/ssampin/electron/main.ts#L1090) 로직 유지) |
| `closeToWidget=false` (legacy) | 그대로 → `closeAction='tray'` 폴백 |
| `closeAction='widget' \| 'tray' \| 'ask'` | 동작 변경 없음 |
| `closeAction='icon'` | 본 기능 활성화 |
| `widget.icon` 키 없음 | `{ showCoachMark: true }` 기본값 적용 (첫 진입 시 코치마크 노출) |

**중요**: 본 기능 도입으로 인해 기존 사용자의 `closeAction` 값이 자동으로 `'icon'`으로 바뀌면 안 됨. 사용자가 설정에서 명시적으로 선택해야만 활성화.

---

## 4. IPC 명세

### 4.1 신규 IPC 채널 4개

| 채널 | 방향 | Payload | Returns | 용도 |
|------|------|---------|---------|------|
| `icon:show` | renderer → main | `void` | `Promise<void>` | 아이콘 표시 + fade-in (220ms) |
| `icon:hide` | renderer → main | `void` | `Promise<void>` | 아이콘 숨김 + fade-out (180ms) |
| `icon:set-bounds` | renderer → main | `{ x: number; y: number }` | `Promise<void>` | 사용자 드래그 후 위치 저장 (500ms 디바운스) |
| `icon:expand` | renderer → main | `{ to: 'main' \| 'widget' \| 'restore' }` | `Promise<void>` | 아이콘 → 위젯/풀앱 전환. `'restore'`는 lastUserMode 사용 |

### 4.2 기존 IPC 확장 — `window:transition` (NEW 통합 채널, 선택)

기존 `window:setWidget`, `window:toggleWidget` 등은 그대로 유지. 본 기능에서는 **새로운 통합 채널을 도입할지 / 채널을 분리할지** 다음 두 안 검토:

**옵션 A — 분리 (현행 패턴 유지, 채택)**

기존 패턴(`window:setWidget`, `window:toggleWidget`)에 맞춰 `icon:show`/`icon:hide`/`icon:expand` 3개를 추가. 일관성 유지.

**옵션 B — 통합 `window:transition`**

`window:transition({ from, to })` 단일 채널로 모든 전환 통합. 깔끔하지만 기존 채널과 중복.

**채택: 옵션 A**. 일관성 우선, 별도 통합 리팩토링은 별도 PDCA로.

### 4.3 preload.ts 추가 항목

```typescript
// electron/preload.ts (추가)
contextBridge.exposeInMainWorld('electronAPI', {
  // ... 기존 ...
  iconShow: (): Promise<void> =>
    ipcRenderer.invoke('icon:show'),
  iconHide: (): Promise<void> =>
    ipcRenderer.invoke('icon:hide'),
  iconSetBounds: (bounds: { x: number; y: number }): Promise<void> =>
    ipcRenderer.invoke('icon:set-bounds', bounds),
  iconExpand: (target: { to: 'main' | 'widget' | 'restore' }): Promise<void> =>
    ipcRenderer.invoke('icon:expand', target),
});
```

### 4.4 main.ts 핸들러

```typescript
// electron/main.ts (추가, 1300번대 ipcMain.handle 영역에)
ipcMain.handle('icon:show', async () => {
  await executeWindowTransition('icon');
});

ipcMain.handle('icon:hide', async () => {
  await fadeOutIconWindow(180);
  if (iconWindow && !iconWindow.isDestroyed()) iconWindow.hide();
});

ipcMain.handle('icon:set-bounds', async (_event, bounds: { x: number; y: number }) => {
  if (!iconWindow || iconWindow.isDestroyed()) return;
  iconWindow.setBounds({ x: bounds.x, y: bounds.y, width: 56, height: 56 });
  saveIconBoundsDebounced({ ...bounds, width: 56, height: 56 });
});

ipcMain.handle('icon:expand', async (_event, target: { to: 'main' | 'widget' | 'restore' }) => {
  const resolved = target.to === 'restore' ? (lastUserMode === 'main' ? 'main' : 'widget') : target.to;
  await executeWindowTransition(resolved);
});
```

---

## 5. UI/UX Design

### 5.1 아이콘 시각 사양 (v0.2 — 뱃지 제거)

```
┌──────────────────────────────────────┐
│   유휴 상태 (Idle)                   │
│                                      │
│      ╭────────────╮                  │
│      │            │                  │
│      │ 쌤핀 아이콘 │ ← build/icon.png│
│      │  (PNG)     │   축소판 (56×56) │
│      ╰────────────╯                  │
│                                      │
│   배경: 투명 (transparent)           │
│   외곽 라운딩: rounded-2xl 컨테이너  │
│   배경: bg-sp-card 살짝 (앱 식별성)  │
│   border: sp-border/60               │
│   shadow: shadow-lg                  │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│   알림 (펄스) — 다음 교시 5분 전 등  │
│                                      │
│      ╭────────────╮                  │
│    .─│            │─.                │
│   ( °│ 쌤핀 아이콘 │° ) ← ring-2     │
│    `─│            │─'    ring-       │
│      ╰────────────╯      sp-accent  │
│                          animate-    │
│                          pulse       │
│   사용자가 위젯 열어서 확인 시 즉시 중단
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│   호버 (툴팁) — 100ms 딜레이         │
│                                      │
│      ╭────────────╮                  │
│      │            │                  │
│      │ 쌤핀 아이콘 │ ← scale-105     │
│      │            │   transition    │
│      ╰────────────╯                  │
│      ┌──────────────────────┐        │
│      │ 3교시 수학            │ ← Tooltip
│      │ 다음: 4교시 영어      │   p-3   │
│      └──────────────────────┘   rounded-xl
│                                  bg sp-card│
│                                              │
│   ★ 정보 표시는 호버 툴팁만. 아이콘 자체엔│
│     숫자/뱃지/배지 일체 없음.              │
└──────────────────────────────────────┘
```

**아이콘 비주얼 결정 (v0.2)**:
- 사용 에셋: `build/icon.png` (쌤핀 앱 메인 아이콘) → 56×56 컨테이너 안에 padding 8px로 40×40 렌더
- `<img src="path/to/icon.png" />` 또는 `<img>` 대신 React 빌드 시 import (Vite asset import)
- 별도 SVG 아이콘 디자인 작업 없음 (빠른 구현 우선)

### 5.2 디자인 토큰 매핑

| 요소 | Tailwind 클래스 | 토큰/값 |
|------|-----------------|---------|
| 컨테이너 크기 | `w-14 h-14` | 56×56 px |
| 컨테이너 라운딩 | `rounded-2xl` | Tailwind 기본 (rounded-sp-* 금지) |
| 컨테이너 배경 | `bg-sp-card` | #1a2332 |
| 컨테이너 테두리 | `border border-sp-border/60` | #2a3548 60% |
| 컨테이너 그림자 | `shadow-lg` | Tailwind 기본 |
| 호버 transform | `hover:scale-105 transition-transform duration-150` | — |
| **앱 아이콘 이미지** | `<img src={appIconPng} className="w-10 h-10" />` | `build/icon.png` 40×40 렌더 (56 컨테이너 - 8px padding × 2) |
| 펄스 링 | `ring-2 ring-sp-accent ring-offset-2 animate-pulse` | — |
| 툴팁 컨테이너 | `bg-sp-card border border-sp-border rounded-xl p-3 shadow-xl` | — |
| 툴팁 텍스트 | `text-sm text-sp-text` (메인), `text-xs text-sp-muted` (서브) | — |

**라운딩 정책 준수**: 모든 라운딩은 Tailwind 기본 키(`rounded-2xl`, `rounded-full`, `rounded-xl`)만 사용. `rounded-sp-*` 사용 금지 (메모리 `feedback_rounding_policy.md`).

### 5.3 사용자 흐름 다이어그램 (상태머신)

```
                    ┌──────────────────────────────────────┐
                    │    State Machine (Window Mode)       │
                    │                                      │
                    │   ┌──────┐                           │
                    │   │ main │  ◄────── (start)          │
                    │   └───┬──┘                           │
                    │       │ X 버튼 (closeAction='icon')  │
                    │       ▼                              │
                    │   ┌──────┐                           │
                    │   │ icon │                           │
                    │   └───┬──┘                           │
                    │       │ 클릭 (lastUserMode='main')   │
                    │       │ → main                       │
                    │       │                              │
                    │       │ 클릭 (lastUserMode='widget') │
                    │       │ → widget                     │
                    │       │                              │
                    │       │ 더블클릭 → main              │
                    │       │                              │
                    │       │ 우클릭 → 컨텍스트 메뉴       │
                    │       │   - "위젯 열기" → widget     │
                    │       │   - "전체 앱 열기" → main    │
                    │       │   - "위치 초기화" → reset    │
                    │       │   - "종료" → app.quit()      │
                    │       │                              │
                    │   ┌───▼────┐                         │
                    │   │ widget │                         │
                    │   └───┬────┘                         │
                    │       │ 우클릭 "아이콘으로 접기"     │
                    │       │ → icon                       │
                    │       │                              │
                    │       │ X (위젯 자체 닫기)           │
                    │       │ → tray로만 hide (기존 동작)  │
                    └───────┴──────────────────────────────┘

전환 규칙:
  - 모든 전환은 executeWindowTransition(target) 함수 1개를 통과
  - 전환 중인 동안 다른 전환 요청은 큐잉(Promise chain)
  - lastUserMode는 'icon' 진입 직전 상태를 기록 (icon 자체는 lastUserMode 갱신 안 함)
```

### 5.4 "아이콘이 살아 있다"는 시각적 표시

| 상태 | 표시 |
|------|------|
| 유휴 (항상 — 정보 표시 없음) | 56×56 컨테이너 + 쌤핀 앱 아이콘 (40×40) |
| 알림 발생 (다음 교시 5분 전, 미확인 메모 등) | `ring-2 ring-sp-accent` + `animate-pulse`, 사용자가 확인 시 즉시 중단 |
| 호버 | scale-105 + 100ms 후 툴팁 표시 (현재 교시 + 다음 교시) |
| 드래그 중 | cursor: grab → grabbing |
| **풀스크린 시** | 그대로 떠 있음 (사용자 결정 v0.2 — 자동 hide 없음) |

### 5.5 컴포넌트 신설 명세

#### `IconWindow.tsx` (NEW)

```tsx
// src/adapters/components/Icon/IconWindow.tsx
import { useEffect, useRef, useState } from 'react';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { IconBadge } from './IconBadge';
import { IconTooltip } from './IconTooltip';
import { IconContextMenu } from './IconContextMenu';

export function IconWindow() {
  const [hovered, setHovered] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const hoverTimer = useRef<number | null>(null);
  const lastClickRef = useRef<number>(0);

  const currentSchedule = useScheduleStore((s) => s.getCurrent());
  const upcomingAlert = useEventsStore((s) => s.getUpcomingAlert());
  // 앱 아이콘 PNG (Vite asset import)
  // import appIconPng from '/build/icon.png?url';  ← 실제 import 경로는 Vite 설정 확인 필요

  const handleClick = () => {
    const now = Date.now();
    const isDouble = now - lastClickRef.current < 250;
    lastClickRef.current = now;

    if (isDouble) {
      window.electronAPI.iconExpand({ to: 'main' });
    } else {
      // 단일 클릭은 250ms 후 (더블클릭 아니라고 확정되면) 실행
      setTimeout(() => {
        if (Date.now() - lastClickRef.current >= 250) {
          window.electronAPI.iconExpand({ to: 'restore' });
        }
      }, 260);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <>
      <div
        className={`relative w-14 h-14 rounded-2xl bg-sp-card border border-sp-border/60 shadow-lg flex items-center justify-center cursor-pointer transition-transform duration-150 hover:scale-105 ${upcomingAlert ? 'ring-2 ring-sp-accent ring-offset-2 animate-pulse' : ''}`}
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        onMouseEnter={() => {
          hoverTimer.current = window.setTimeout(() => setHovered(true), 100);
        }}
        onMouseLeave={() => {
          if (hoverTimer.current) clearTimeout(hoverTimer.current);
          setHovered(false);
        }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        {/* v0.2: 쌤핀 앱 아이콘 사용. 우상단 뱃지 제거됨. */}
        <img
          src={appIconPng}
          alt="쌤핀"
          className="w-10 h-10 select-none pointer-events-none"
          draggable={false}
        />
      </div>
      {hovered && currentSchedule && (
        <IconTooltip
          current={currentSchedule.current}
          next={currentSchedule.nextPeriod}
        />
      )}
      {contextMenu && (
        <IconContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}
```

#### ~~`IconBadge.tsx`~~ — **제거됨 (v0.2)**

사용자 결정으로 우상단 뱃지 자체 제외. 아이콘에 정보 표시 없음. 정보가 필요하면 호버 툴팁 또는 위젯 펴기.

#### `IconTooltip.tsx` (NEW)

```tsx
// src/adapters/components/Icon/IconTooltip.tsx
interface IconTooltipProps {
  current: { number: number; subject: string } | null;
  next: { number: number; subject: string } | null;
}

export function IconTooltip({ current, next }: IconTooltipProps) {
  return (
    <div
      className="absolute bottom-full mb-2 right-0 bg-sp-card border border-sp-border rounded-xl p-3 shadow-xl min-w-[180px]"
      role="tooltip"
    >
      <div className="text-sm text-sp-text font-medium">
        {current ? `${current.number}교시 ${current.subject}` : '쉬는 시간'}
      </div>
      {next && (
        <div className="text-xs text-sp-muted mt-1">
          다음: {next.number}교시 {next.subject}
        </div>
      )}
    </div>
  );
}
```

#### `IconContextMenu.tsx` (NEW)

```tsx
// 우클릭 메뉴: "위젯 열기" / "전체 앱 열기" / "위치 초기화" / "종료"
// WidgetContextMenu.tsx 패턴 복제, 4 항목.
```

### 5.6 라우팅 / 진입점

`src/App.tsx`에서 URL의 `?mode=icon` 쿼리 파라미터 감지 시 `<IconWindow />` 단독 렌더링.

```tsx
// src/App.tsx (수정 부분만)
const params = new URLSearchParams(window.location.search);
const mode = params.get('mode');

if (mode === 'icon') {
  return <IconWindow />;
}
// ... 기존 라우팅 로직 ...
```

`buildIconWindow()` 측에서 `loadURL`/`loadFile` 시 `?mode=icon` 쿼리 추가.

---

## 6. 핵심 main.ts 함수 명세

### 6.1 `getAllAppWindows()` 헬퍼 (선결 PR — 회귀 격리)

```typescript
// electron/main.ts (선결 리팩토링 PR로 먼저 머지)
function getAllAppWindows(): BrowserWindow[] {
  const windows: BrowserWindow[] = [];
  if (mainWindow && !mainWindow.isDestroyed()) windows.push(mainWindow);
  if (widgetWindow && !widgetWindow.isDestroyed()) windows.push(widgetWindow);
  // 본 기능 PR에서 한 줄 추가:
  // if (iconWindow && !iconWindow.isDestroyed()) windows.push(iconWindow);
  return windows;
}
```

**적용 대상 (선결 PR에서 일괄 변경)**:

| 위치 | 현재 코드 | 변경 후 |
|------|-----------|---------|
| `main.ts:861` | `for (const win of [mainWindow, widgetWindow])` | `for (const win of getAllAppWindows())` |
| `main.ts:1267` | 동일 | 동일 |
| `main.ts:1303` | 동일 | 동일 |
| `main.ts:1120-1166` (autoUpdater 5건) | `mainWindow.webContents.send(...) + widgetWindow.webContents.send(...)` | `for (const win of getAllAppWindows()) win.webContents.send(...)` |
| `main.ts:3109-3112` (analytics:flush) | 동일 패턴 | 동일 |

**메타테스트** (선결 PR에 포함):

```typescript
// src/__tests__/getAllAppWindows.meta.test.ts
// grep으로 main.ts에서 [mainWindow, widgetWindow] 배열 사용을 0건으로 강제
import * as fs from 'fs';
import * as path from 'path';

test('main.ts contains no inline [mainWindow, widgetWindow] arrays', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../electron/main.ts'), 'utf-8');
  const matches = src.match(/\[mainWindow,\s*widgetWindow\]/g);
  expect(matches).toBeNull();
});
```

### 6.2 `buildIconWindow()` (NEW)

```typescript
// electron/main.ts
let iconWindow: BrowserWindow | null = null;
let lastUserMode: 'main' | 'widget' = 'main';

function buildIconWindow(): void {
  const bounds = readIconBoundsOrDefault();

  iconWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    hasShadow: false,
    opacity: 0,
    title: '쌤핀 (실행 중)',  // 작업관리자 식별용
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  iconWindow.setAlwaysOnTop(true, 'screen-saver');
  iconWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  if (process.env['VITE_DEV_SERVER_URL']) {
    void iconWindow.loadURL(`${process.env['VITE_DEV_SERVER_URL']}?mode=icon`);
  } else {
    void iconWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
      query: { mode: 'icon' },
    });
  }

  iconWindow.on('move', () => {
    if (!iconWindow || iconWindow.isDestroyed()) return;
    const b = iconWindow.getBounds();
    saveIconBoundsDebounced({ x: b.x, y: b.y, width: 56, height: 56 });
  });

  iconWindow.on('close', (e) => {
    if (isQuitting) return;
    if (!iconWindow || iconWindow.isDestroyed()) return;
    e.preventDefault();
    iconWindow.hide();
    iconWindow.setOpacity(0);
  });

  iconWindow.on('closed', () => {
    iconWindow = null;
  });
}
```

### 6.3 `executeWindowTransition()` 상태머신 (NEW)

```typescript
// electron/main.ts
type WindowMode = 'icon' | 'widget' | 'main';

let transitionInProgress: Promise<void> = Promise.resolve();

function executeWindowTransition(target: WindowMode): Promise<void> {
  // 큐잉: 진행 중인 전환이 끝나면 다음 전환 실행
  transitionInProgress = transitionInProgress.then(async () => {
    const opts = readSettingsWidgetOptions();

    switch (target) {
      case 'icon': {
        // (1) 아이콘 윈도우 보장 + show
        if (!iconWindow || iconWindow.isDestroyed()) buildIconWindow();
        iconWindow!.setOpacity(0);
        iconWindow!.show();
        await fadeInIconWindow(220);

        // (2) 마지막 user mode 기록 (icon 진입 직전 상태)
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
          lastUserMode = 'main';
        } else if (widgetWindow && !widgetWindow.isDestroyed() && widgetWindow.isVisible()) {
          lastUserMode = 'widget';
        }

        // (3) 다른 윈도우들 숨김
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
          hideOrDestroyMainWindow(opts.memorySaverMode);
        }
        if (widgetWindow && !widgetWindow.isDestroyed() && widgetWindow.isVisible()) {
          widgetWindow.hide();
        }
        break;
      }

      case 'widget': {
        // (1) 위젯 윈도우 보장 + show
        if (!widgetWindow || widgetWindow.isDestroyed()) {
          createWidgetWindow(opts);
        } else {
          widgetWindow.show();
        }

        // (2) 아이콘 fade-out 후 hide
        if (iconWindow && !iconWindow.isDestroyed() && iconWindow.isVisible()) {
          await fadeOutIconWindow(180);
          iconWindow.hide();
        }

        // (3) 메인 숨김
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
          hideOrDestroyMainWindow(opts.memorySaverMode);
        }
        break;
      }

      case 'main': {
        // (1) 메인 윈도우 보장 + show
        if (!mainWindow || mainWindow.isDestroyed()) {
          createWindow();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }

        // (2) 아이콘 fade-out 후 hide
        if (iconWindow && !iconWindow.isDestroyed() && iconWindow.isVisible()) {
          await fadeOutIconWindow(180);
          iconWindow.hide();
        }

        // (3) 위젯 숨김
        if (widgetWindow && !widgetWindow.isDestroyed() && widgetWindow.isVisible()) {
          widgetWindow.hide();
        }
        break;
      }
    }
  });

  return transitionInProgress;
}
```

### 6.4 `fadeInIconWindow()` / `fadeOutIconWindow()` (NEW, fadeInQuickAdd 복제)

```typescript
// electron/main.ts
function fadeInIconWindow(duration = 220): Promise<void> {
  return new Promise((resolve) => {
    if (!iconWindow || iconWindow.isDestroyed()) return resolve();

    // prefers-reduced-motion 처리는 renderer 측에서 hint를 주지만,
    // main 측 fade는 OS 레벨이라 검출 어렵다 → 항상 실행하되 duration=0 옵션 제공
    const reducedMotion = readReducedMotionPreference();
    const actualDuration = reducedMotion ? 0 : duration;

    if (actualDuration === 0) {
      iconWindow.setOpacity(1);
      return resolve();
    }

    const startTime = Date.now();
    iconWindow.setOpacity(0);
    const interval = setInterval(() => {
      if (!iconWindow || iconWindow.isDestroyed()) {
        clearInterval(interval);
        resolve();
        return;
      }
      const elapsed = Date.now() - startTime;
      const t = Math.min(1, elapsed / actualDuration);
      // ease-out cubic + slight overshoot 근사: 1 - (1-t)^3 (UX 검토의 cubic-bezier(0.34,1.56,0.64,1) overshoot은 setOpacity로 표현 어려움 → 단순 ease-out)
      const opacity = 1 - Math.pow(1 - t, 3);
      iconWindow.setOpacity(opacity);
      if (t >= 1) {
        clearInterval(interval);
        resolve();
      }
    }, 16);
  });
}

function fadeOutIconWindow(duration = 180): Promise<void> {
  return new Promise((resolve) => {
    if (!iconWindow || iconWindow.isDestroyed()) return resolve();

    const reducedMotion = readReducedMotionPreference();
    const actualDuration = reducedMotion ? 0 : duration;

    if (actualDuration === 0) {
      iconWindow.setOpacity(0);
      return resolve();
    }

    const startTime = Date.now();
    iconWindow.setOpacity(1);
    const interval = setInterval(() => {
      if (!iconWindow || iconWindow.isDestroyed()) {
        clearInterval(interval);
        resolve();
        return;
      }
      const elapsed = Date.now() - startTime;
      const t = Math.min(1, elapsed / actualDuration);
      // ease-in cubic
      const opacity = 1 - Math.pow(t, 3);
      iconWindow.setOpacity(opacity);
      if (t >= 1) {
        clearInterval(interval);
        resolve();
      }
    }, 16);
  });
}

function readReducedMotionPreference(): boolean {
  // OS 설정 직접 읽기보다는 settings.json에 사용자 옵션으로 노출하는 편이 단순
  // 첫 버전: 항상 false. 후속 PDCA에서 OS 미디어쿼리 통합 검토.
  return false;
}
```

### 6.5 `ensureIconOnScreen()` 안전망 (NEW, ensureWidgetOnScreen 복제)

```typescript
// electron/main.ts
function ensureIconOnScreen(): void {
  if (!iconWindow || iconWindow.isDestroyed()) return;
  const bounds = iconWindow.getBounds();
  const displays = screen.getAllDisplays();
  const visible = displays.some((d) => {
    const a = d.workArea;
    return bounds.x >= a.x && bounds.y >= a.y &&
           bounds.x + bounds.width <= a.x + a.width &&
           bounds.y + bounds.height <= a.y + a.height;
  });
  if (!visible) {
    const fallback = getDefaultIconBounds();
    iconWindow.setBounds(fallback);
    saveIconBoundsDebounced(fallback);
  }
}

// display-removed 이벤트 핸들러에 추가
screen.on('display-removed', () => {
  ensureWidgetOnScreen();
  ensureIconOnScreen();  // NEW
});
```

### 6.6 `mainWindow.on('close')` 분기 확장

```typescript
// electron/main.ts:590-615 수정
mainWindow.on('close', (e) => {
  if (!isQuitting) {
    e.preventDefault();
    const opts = readSettingsWidgetOptions();

    if (opts.closeAction === 'ask') {
      mainWindow?.webContents.send('close-action:ask');
      return;
    }

    if (opts.closeAction === 'icon') {
      // NEW: 아이콘 모드로 전환
      void executeWindowTransition('icon');
      return;
    }

    if (opts.closeAction === 'widget') {
      // 기존 동작
      if (!widgetWindow || widgetWindow.isDestroyed()) {
        createWidgetWindow(opts, () => hideOrDestroyMainWindow(opts.memorySaverMode));
      } else {
        widgetWindow.show();
        hideOrDestroyMainWindow(opts.memorySaverMode);
      }
    } else {
      // tray
      mainWindow?.hide();
    }
  }
});
```

### 6.7 트레이 메뉴 확장 (`createTray()`)

```typescript
// electron/main.ts:639-682 — 메뉴 항목 1개 추가
const contextMenu = Menu.buildFromTemplate([
  { label: '쌤핀 열기', click: () => void executeWindowTransition('main') },
  { label: '위젯 모드', click: () => void executeWindowTransition('widget') },
  { label: '아이콘 모드', click: () => void executeWindowTransition('icon') },  // NEW
  { label: '위젯 위치 초기화', click: () => { /* 기존 */ } },
  { label: '아이콘 위치 초기화', click: () => {  // NEW
    if (iconWindow && !iconWindow.isDestroyed()) {
      const fallback = getDefaultIconBounds();
      iconWindow.setBounds(fallback);
      saveIconBoundsDebounced(fallback);
    }
  } },
  { type: 'separator' },
  { label: '완전히 종료', click: () => { isQuitting = true; app.quit(); } },
]);
```

### 6.8 ~~풀스크린 자동 hide~~ — **v0.2에서 제거됨**

사용자 결정: 풀스크린 위에 그냥 떠 있어도 OK. 자동 hide 휴리스틱 구현하지 않음.

대신: `alwaysOnTop='screen-saver'` + `visibleOnFullScreen:true`로 항상 떠 있도록 보장. 사용자가 수업 중 가리고 싶으면 트레이 우클릭 메뉴 또는 위젯/풀앱으로 전환하면 됨.

(후속 PDCA에서 사용자 피드백 받고 필요 시 재검토)

---

## 7. 에러 처리

### 7.1 에러 시나리오 및 대응

| 시나리오 | 감지 방법 | 대응 |
|----------|-----------|------|
| `iconWindow` 생성 실패 (BrowserWindow 예외) | try-catch | 트레이 토스트로 사용자 알림 + closeAction을 자동으로 'tray'로 폴백 |
| `icon-bounds.json` 파싱 실패 | JSON.parse 예외 | `getDefaultIconBounds()` 사용 |
| 모니터 disconnect로 아이콘이 화면 밖 | `display-removed` 이벤트 | `ensureIconOnScreen()` 호출 |
| 아이콘 fade 도중 윈도우 destroy | `iconWindow.isDestroyed()` 체크 | setInterval clear + Promise resolve |
| IPC `icon:expand`에서 `lastUserMode` 미정의 | undefined check | 기본값 'widget' 사용 |
| 전환 중 다른 전환 요청 도착 | `transitionInProgress` Promise chain | 큐잉 (시리얼 실행) |
| Windows F11 풀스크린 감지 실패 | 휴리스틱 한계 | 사용자가 수동으로 트레이 후퇴 가능 (메뉴 "아이콘 위치 초기화" 옆 "트레이로 보내기" 추가 검토) |
| 코치마크 노출 중 사용자가 X 버튼 (없음 — 아이콘에는 X 없음) | N/A | 코치마크 자체는 5초 후 자동 사라짐 |

### 7.2 로깅

기존 `console.log('[widget] ...')` 패턴을 따라 `[icon] ...` 프리픽스로 통일:

```typescript
console.log('[icon] window created');
console.log(`[icon] transition: ${currentMode} → ${target}`);
console.log('[icon] bounds restored from icon-bounds.json');
console.warn('[icon] icon-bounds.json parse failed, using default');
console.warn('[icon] icon was off-screen, restored to default position');
```

---

## 8. 보안 고려사항

- [x] 새 IPC 채널 4개 모두 payload 검증 (`x`, `y`는 number 타입 강제)
- [x] `iconWindow`도 `contextIsolation: true`, `nodeIntegration: false` (기존 패턴 준수)
- [x] `loadURL`/`loadFile`에 사용자 입력 직접 주입 없음 (mode=icon 고정)
- [x] `icon-bounds.json` 외부 입력 없음 (자체 생성/소비)
- [x] preload에 노출되는 API는 read-only IPC 호출만, 임의 코드 실행 없음
- [N/A] 외부 네트워크 통신 없음

---

## 9. 테스트 계획

### 9.1 테스트 범위

| 유형 | 대상 | 도구 |
|------|------|------|
| 단위 테스트 | `WindowMode` value object, `getDefaultIconBounds()`, 마이그레이션 폴백 로직 | vitest |
| 메타테스트 | `[mainWindow, widgetWindow]` 인라인 배열 0건 | vitest + 정적 grep |
| 통합 테스트 (수동) | `executeWindowTransition()` 6개 전환 경로 | 실제 Electron 빌드 |
| 회귀 테스트 (수동) | Plan §5.5 RG-01 ~ RG-07 | 빌드 후 시나리오 체크 |
| PoC | PPT 풀스크린 가시성, fade 체감 | Plan §5.3 PoC #1~#3 |

### 9.2 핵심 테스트 케이스

- [ ] **TC-01**: `WindowMode.isValidWindowMode('icon')` === true
- [ ] **TC-02**: `closeToWidget=true` legacy 설정 로드 시 `closeAction='widget'`로 폴백
- [ ] **TC-03**: `closeToWidget=false` legacy 설정 로드 시 `closeAction='tray'`로 폴백
- [ ] **TC-04**: `closeAction='icon'` 명시 시 그대로 보존
- [ ] **TC-05**: `getDefaultIconBounds()`는 활성 디스플레이 우하단 24px 마진 좌표 반환
- [ ] **TC-06**: `icon-bounds.json`이 깨졌을 때 `getDefaultIconBounds()` 폴백
- [ ] **TC-07**: 메타테스트 — `electron/main.ts`에 `[mainWindow, widgetWindow]` 인라인 배열 0건
- [ ] **TC-08**: 메타테스트 — 모든 `webContents.send` 호출이 `getAllAppWindows()` 또는 단일 윈도우 ref를 통과 (정적 검사)
- [ ] **TC-Manual-01**: 풀앱 X 클릭 → 아이콘 페이드인 (220ms)
- [ ] **TC-Manual-02**: 아이콘 단일 클릭 → lastUserMode 복원
- [ ] **TC-Manual-03**: 아이콘 더블클릭 → 풀앱 직행
- [ ] **TC-Manual-04**: 아이콘 드래그 → 위치 저장 (앱 재시작 후 복원)
- [ ] **TC-Manual-05**: 모니터 disconnect 후 아이콘 복구
- [ ] **TC-Manual-06**: 트레이 "아이콘 위치 초기화" → 우하단 복귀
- [ ] **TC-Manual-07**: 빠른 연속 클릭 (race) → 큐잉 정상 동작
- [ ] **TC-Manual-08**: autoUpdater 알림이 아이콘 모드에서도 트레이/시각적으로 도달

---

## 10. Clean Architecture 준수

### 10.1 레이어별 변경 요약

| 레이어 | 변경 내용 | 위반 여부 |
|--------|-----------|:---------:|
| **domain/** | `valueObjects/WindowMode.ts` 신규 (pure type), `Settings.ts` 인터페이스 확장 | ✅ 외부 의존 없음 |
| **usecases/** | (변경 없음) — 윈도우 전환은 infrastructure 책임 | ✅ |
| **adapters/** | `Icon/IconWindow.tsx`, `IconBadge.tsx`, `IconTooltip.tsx`, `IconContextMenu.tsx` 신규 / `Settings/SettingsPage.tsx`, `Widget/WidgetContextMenu.tsx` 수정 | ✅ domain + usecases만 import |
| **infrastructure/** | (변경 없음 — `electron/`는 별도 분류) | ✅ |
| **electron/** | `main.ts`에 윈도우 관리 함수 + IPC 핸들러 추가, `preload.ts`에 4개 API 추가 | N/A (Electron main process는 4-layer 외부) |

### 10.2 Import 규칙 검증 체크리스트

- [ ] `WindowMode.ts`는 외부 패키지 0개 import
- [ ] `IconWindow.tsx`는 `@infrastructure/*` import 0건
- [ ] `IconWindow.tsx`는 `electron/*` import 0건 (window.electronAPI만 사용)
- [ ] `Settings.ts`는 외부 의존성 0개 (interface 정의만)

---

## 11. 코딩 컨벤션 적용

### 11.1 적용할 컨벤션

| 항목 | 적용 사항 |
|------|-----------|
| 컴포넌트 네이밍 | `IconWindow`, `IconBadge`, `IconTooltip`, `IconContextMenu` (PascalCase) |
| 파일 네이밍 | `IconWindow.tsx`, `IconBadge.tsx` (PascalCase.tsx) |
| 폴더 네이밍 | `src/adapters/components/Icon/` (PascalCase 폴더, 기존 `Widget/`, `Memo/` 패턴 따름) |
| TypeScript | strict, `any` 0건 |
| 라운딩 | `rounded-2xl`, `rounded-full`, `rounded-xl` (Tailwind 기본만, `rounded-sp-*` 금지) |
| 디자인 토큰 | `sp-card`, `sp-border`, `sp-accent`, `sp-text`, `sp-muted` 사용 |
| 폰트 | Noto Sans KR (전역) |
| 한국어 UI | "아이콘으로 접기", "전체 앱 열기", "위치 초기화" 등 |
| Import 순서 | 외부 → `@domain` → `@usecases` → `@adapters` → `@infrastructure` → 상대경로 |
| Path Alias | `@adapters/components/Icon/*`, `@domain/valueObjects/WindowMode` |

### 11.2 주석 정책

- 비명백한 WHY만 주석 (예: "전환 race 차단 위해 Promise chain 큐잉")
- WHAT은 코드와 식별자명으로 충분
- 다국어 주석 한국어로 통일 (기존 `electron/main.ts` 패턴)

---

## 12. 구현 가이드

### 12.1 파일 구조 (변경 후)

```
e:/github/ssampin/
├── electron/
│   ├── main.ts                 (수정 — buildIconWindow, executeWindowTransition,
│   │                                   fadeIcon, ensureIconOnScreen, IPC 핸들러,
│   │                                   getAllAppWindows 헬퍼, 트레이 메뉴 확장)
│   └── preload.ts              (수정 — iconShow/Hide/SetBounds/Expand 4개 추가)
│
├── src/
│   ├── domain/
│   │   ├── entities/
│   │   │   └── Settings.ts     (수정 — closeAction에 'icon' 추가, IconModeOptions 신규)
│   │   └── valueObjects/
│   │       └── WindowMode.ts   (NEW)
│   │
│   ├── adapters/
│   │   ├── components/
│   │   │   ├── Icon/                       (NEW 폴더)
│   │   │   │   ├── IconWindow.tsx          (NEW)
│   │   │   │   ├── IconTooltip.tsx         (NEW)
│   │   │   │   ├── IconContextMenu.tsx     (NEW)
│   │   │   │   └── CoachMark.tsx           (NEW, 첫 활성화 1회성)
│   │   │   ├── Settings/
│   │   │   │   └── SettingsPage.tsx        (수정 — 4-옵션 라디오)
│   │   │   └── Widget/
│   │   │       └── WidgetContextMenu.tsx   (수정 — "아이콘으로 접기" 추가)
│   │   └── stores/
│   │       └── useSettingsStore.ts         (수정 — 마이그레이션 폴백)
│   │
│   └── App.tsx                 (수정 — ?mode=icon 분기로 IconWindow 렌더링)
│
└── src/__tests__/
    ├── getAllAppWindows.meta.test.ts       (NEW — 메타테스트)
    └── icon-mode.unit.test.ts              (NEW — TC-01~TC-06)
```

### 12.2 구현 순서

본 문서의 §11.2 구현 순서 (Plan §9 다음 단계와 정합):

**Phase 0 — 선결 커밋 (회귀 격리, 0.5일)** ※ 사용자 결정 v0.2: 별도 브랜치 분리 안 함, `feature/icon-mode` 브랜치의 첫 커밋으로 분리

1. [ ] `getAllAppWindows()` 헬퍼 추출
2. [ ] 8곳 이상 흩어진 `[mainWindow, widgetWindow]` 인라인 배열을 헬퍼로 일괄 변경
3. [ ] 메타테스트 `getAllAppWindows.meta.test.ts` 추가
4. [ ] 회귀 테스트 (autoUpdater 알림, data:write 브로드캐스트, navigate 등)
5. [ ] **단일 커밋으로 분리**: `chore(electron): getAllAppWindows() 헬퍼 추출 + 메타테스트 추가` (revert 가능하도록 단일 커밋)

**Phase 1 — PoC 3건 (1.5일, Phase 0과 병행 가능)**

1. [ ] PoC #1: Windows PPT 슬라이드쇼 위 56×56 transparent 윈도우 가시성
2. [ ] PoC #2: macOS Keynote 풀스크린 위 가시성 (GitHub Actions Mac 빌드)
3. [ ] PoC #3: opacity 0→1 fade 220ms 체감 검증

**Phase 2 — 도메인 + Settings 확장 (0.5일)**

1. [ ] `WindowMode.ts` value object 신규
2. [ ] `Settings.ts`에 `closeAction='icon'`, `IconModeOptions` 추가
3. [ ] `useSettingsStore.ts` 마이그레이션 폴백 검증
4. [ ] `icon-mode.unit.test.ts` TC-01 ~ TC-06 작성 + 통과

**Phase 3 — Electron main + preload (1일)**

1. [ ] `buildIconWindow()` 신규
2. [ ] `fadeInIconWindow()` / `fadeOutIconWindow()` 신규
3. [ ] `saveIconBoundsDebounced()` + `readIconBoundsOrDefault()` + `ensureIconOnScreen()`
4. [ ] `executeWindowTransition()` 상태머신
5. [ ] 4개 IPC 핸들러 (`icon:show/hide/set-bounds/expand`)
6. [ ] `mainWindow.on('close')` 분기에 `'icon'` 추가
7. [ ] 트레이 메뉴에 "아이콘 모드" + "아이콘 위치 초기화" 추가
8. [ ] `screen.on('display-removed')`에 `ensureIconOnScreen` 추가
9. [ ] `preload.ts`에 4개 API 추가

**Phase 4 — Renderer 컴포넌트 (1일)**

1. [ ] `IconWindow.tsx`, `IconTooltip.tsx`, `IconContextMenu.tsx`, `CoachMark.tsx` 신규 (~~IconBadge 제외~~)
2. [ ] `App.tsx`에 `?mode=icon` 분기 추가
3. [ ] `SettingsPage.tsx` 라디오 4-옵션화
4. [ ] `WidgetContextMenu.tsx`에 "아이콘으로 접기" 추가
5. [ ] 디자인 검토 — frontend-design 또는 bkit:frontend-architect로 mockup 검증

**Phase 5 — QA (0.5일)** ※ 풀스크린 자동 hide는 v0.2에서 제거됨

1. [ ] 회귀 시나리오 RG-01 ~ RG-07 수동 체크
2. [ ] TC-Manual-01 ~ TC-Manual-08 수동 체크
3. [ ] PPT 풀스크린 위 아이콘 가시성 확인 (자동 hide 없이 그냥 떠 있는지)

**Phase 6 — 릴리즈 준비 (0.5일)**

1. [ ] release-notes.json **v2.0.2** 항목 추가 ("아이콘 모드" 신기능)
2. [ ] 첫 실행 인앱 토스트 "X 버튼 동작 설정에서 아이콘 모드를 켤 수 있어요" 1회성 표시 로직
2. [ ] 챗봇 KB 업데이트 (`scripts/ingest-chatbot-qa.mjs`)
3. [ ] 노션 사용자 가이드 갱신
4. [ ] UpdateNotification 카드에 "새 기능: 아이콘 모드" 안내

**총 예상 공수**: 5.5일 (Phase 0 + 1 병행 시 4.5일, Plan §의 3~4일 추정과 정합. PoC 결과·회귀 검증 따라 변동)

### 12.3 검증 게이트

각 Phase 종료 시 다음 게이트 통과:

| Phase | 게이트 |
|-------|--------|
| Phase 0 | 메타테스트 통과, autoUpdater 회귀 없음 |
| Phase 1 | PoC #1, #3 PASS (선결, 실패 시 본 기능 재검토) |
| Phase 2 | `npx tsc --noEmit` 통과, vitest TC-01~06 통과 |
| Phase 3 | `npm run build` 통과, 기본 `executeWindowTransition` 6경로 수동 동작 |
| Phase 4 | 디자인 검토 통과, `?mode=icon`으로 IconWindow 단독 렌더링 |
| Phase 5 | RG-01~07 + TC-Manual-01~08 모두 PASS |
| Phase 6 | 릴리즈 노트·챗봇·노션 모두 갱신 |

---

## Version History

| 버전 | 날짜 | 변경사항 | 작성자 |
|------|------|----------|--------|
| 0.1 | 2026-05-01 | 최초 Draft. 기술 검토(architect) + UX 검토(frontend-architect) 통합. 상태머신 명시화, IPC 4채널 정의, 6단계 구현 순서 확정 | pblsketch |
| 0.2 | 2026-05-01 | **사용자 결정 반영**: (1) 우상단 뱃지(IconBadge) 제거 — 정보 표시 없음, 호버 툴팁만, (2) 풀스크린 자동 hide(FR-15) 제거 — 그냥 떠 있음, (3) 아이콘 비주얼 = `build/icon.png` 축소판 (40×40), (4) 타깃 버전 v1.13.x → **v2.0.2**, (5) 첫 실행 인앱 토스트 추가, (6) 브랜치 분리 안 함 — `feature/icon-mode` 단일 브랜치 + 첫 커밋으로 헬퍼 분리, (7) `IconModeOptions`에서 `autoHideOnFullscreen` 제거 | pblsketch |
