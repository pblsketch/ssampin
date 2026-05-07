# desktop-organize-drop-crash-fix Design Document

> **Summary**: 모든 BrowserWindow에서 파일/폴더 드롭 시 발생하는 `file://` navigate 크래시를 차단하는 핫픽스. **단일 진실 원천 두 군데**(preload 1줄 + main 헬퍼 1개)로 6개 BrowserWindow를 일원 보호하고, `바탕화면 정리` 위젯에는 위젯 모드일 때 안내 배너 + 코치마크 문구 보강을 추가한다. 릴리즈는 본 PDCA 범위에서 제외하고 다른 작업들과 묶어서 별도 진행한다 (사용자 결정 2026-05-07).
>
> **Project**: SsamPin
> **Version**: v2.0.4+ 묶음 릴리즈 합류 예정 (본 PDCA에서는 머지/릴리즈 미수행)
> **Author**: pblsketch
> **Date**: 2026-05-07
> **Status**: Draft v0.1
> **Planning Doc**: [desktop-organize-drop-crash-fix.plan.md](../../01-plan/features/desktop-organize-drop-crash-fix.plan.md)

### 관련 문서

| 문서 | 경로 | 상태 |
|------|------|------|
| Plan | `docs/01-plan/features/desktop-organize-drop-crash-fix.plan.md` | Draft v0.1 |
| 위젯 본체 | `src/widgets/items/DesktopOrganize/` | 수정 (코치마크 + 배너) |
| Preload | `electron/preload.ts` | 수정 (1곳, 8줄 추가) |
| Main | `electron/main.ts` | 수정 (헬퍼 1개 + 6개 BrowserWindow 호출) |
| 의도된 drop 컴포넌트 | `BookmarkCard`, `BookmarkGroupCard`, `StickerManager`, `StickerUploader`, `FormUploadModal`, `StudentImageMultiPicker` 등 7+ | 미수정 (회귀 검증 대상) |
| 챗봇 KB ingest | `scripts/ingest-chatbot-qa.mjs` | 본 PDCA에서 카피 작성, 재임베딩은 묶음 릴리즈 시 |
| 노션 가이드 | (Notion MCP) | 본 PDCA에서 카피 작성, 게시는 묶음 릴리즈 시 |

---

## 1. 개요

### 1.1 설계 목표

1. **단일 진실 원천 (Single Source of Truth)**: 가드 코드는 *반드시* 두 군데로 끝낸다 — preload 1곳 + main 헬퍼 1개. 컴포넌트별 가드 추가는 누락 회귀의 시작.
2. **회귀 0건 (의도된 drop 컴포넌트 보호)**: 글로벌 가드는 **bubble 단계**에서만 등록. React `onDrop`/`onDragOver` 핸들러가 `e.preventDefault() + e.stopPropagation()`으로 가로채면 window 레벨 listener까지 도달하지 않는다 — 자연 격리.
3. **인프라 비침습**: `desktopWidgetManager.ts`, `win32Desktop.ts`(native-desktop 핵심) 미수정. 다른 세션 작업 영역 보호. main.ts는 신규 헬퍼 함수 1개 + 각 BrowserWindow 생성 직후 1줄 호출만 추가.
4. **사용자 멘탈 모델 정렬**: 위젯 모드/대시보드 미리보기에서 "이 위젯은 바탕화면 아이콘 아래 모드에서 동작" 명시. 기존 `!isWindows` 안내 배너와 동일 톤·동일 토큰.
5. **검증 가능한 안전망**: 메타 테스트 2종으로 향후 BrowserWindow 신설 시 가드 호출 누락을 차단.

### 1.2 설계 원칙

- **Defense in Depth (3 layer)**: (a) renderer DOM `dragover`/`drop` preventDefault → 가장 빠른 차단 (b) main `webContents.on('will-navigate')` `file://` 차단 → renderer가 어찌 됐든 navigate 자체를 거부 (c) `setWindowOpenHandler`로 신규 윈도우 오픈도 deny → 파일 드롭이 새 창으로 열리는 경로도 봉쇄.
- **Capture vs Bubble**: window 레벨 listener는 **bubble 단계**(`addEventListener` 3rd arg = false)에 등록. React 합성 이벤트는 `document` 레벨 위임(React 17+) → React 핸들러가 먼저 처리하고 `e.stopPropagation()` 호출하면 window까지 안 올라옴. 의도된 drop 핸들러 회귀 0건 보장.
- **Idempotent guard**: 같은 이벤트에 `preventDefault()`가 2번 호출돼도 부작용 없음. 의도된 핸들러가 `preventDefault()`만 부르고 `stopPropagation()`을 안 부른 경우(현재는 모두 둘 다 부름) — window 가드도 `preventDefault()`만 부르므로 무해.
- **Print 윈도우 예외 처리**: `printWin`(electron/main.ts:2939)은 hidden + ephemeral + preload 미로드. 사용자 입력 노출 0이므로 가드 미적용 (helper 호출 안 함).
- **사용자 학습 비용 최소**: 코치마크는 이미 dismiss한 사용자에게 재노출하지 않음. 신규 사용자만 새 문구 노출. 기존 사용자는 안내 배너로 학습.
- **디자인 토큰만 사용**: 신규 배너는 기존 `!isWindows` 안내 배너의 sp-* 토큰 + Tailwind 기본 키 100% 재사용. `rounded-sp-*` 사용 금지(메모리 정책).

### 1.3 범위 / 비범위

**포함 (Plan §2.1 트랙 A/B/C 전량)**

- preload `installDropGuard()` 호출 1줄 (모든 5개 BrowserWindow가 공유하는 단일 preload.js)
- main `installNavigationGuard(win)` 헬퍼 신설 + 6개 BrowserWindow 생성 직후 호출 (printWin 제외 = 5개 + iconWindow)
- DesktopOrganize 코치마크 문구 변경
- DesktopOrganize 위젯 모드/대시보드용 안내 배너 추가 (native-desktop 모드일 때 숨김)
- 메타 테스트 2종 (preload 가드 단위 + main 가드 헬퍼 호출 카운트)
- 회귀 시나리오 RG-01~RG-05 수동 체크
- 챗봇 KB Q&A 5건 카피 작성 (스크립트에 추가만 — 재임베딩은 묶음 릴리즈 시)
- 노션 가이드 카피 작성 (게시는 묶음 릴리즈 시)

**제외 (사용자 결정 2026-05-07 + Plan §2.2)**

- **release-notes.json v2.0.4 신설** — 묶음 릴리즈 시 통합 항목으로 작성
- **빌드/태그/GitHub 릴리즈/URL 검증** — 묶음 릴리즈 시
- **챗봇 KB 재임베딩 (`node scripts/ingest-chatbot-qa.mjs` 실행)** — 묶음 릴리즈 시
- **노션 가이드 게시 (Notion MCP write)** — 묶음 릴리즈 시
- 위젯이 파일 drop을 수용하는 기능 (별도 PDCA)
- 자동 모드 전환 다이얼로그 (별도 PDCA)
- 모바일 앱
- `electron/main.ts`의 native-desktop 핵심 로직 (다른 세션)

---

## 2. 아키텍처

### 2.1 컴포넌트 다이어그램

```
┌──────────────────────────────────────────────────────────────┐
│  Renderer (React)                                            │
│  ┌────────────────────────────────────────────────────┐      │
│  │  DesktopOrganize.tsx                               │      │
│  │   - 코치마크 문구 변경 (모드 전제 명시)            │      │
│  │   - 위젯 모드/대시보드용 안내 배너 (조건부)       │      │
│  └────────────────────────────────────────────────────┘      │
│  ┌────────────────────────────────────────────────────┐      │
│  │  의도된 drop 컴포넌트 (BookmarkCard, Sticker...)  │      │
│  │   - 변경 없음                                      │      │
│  │   - e.preventDefault() + e.stopPropagation() 유지 │      │
│  └────────────────────────────────────────────────────┘      │
│                          ▲ bubble                            │
│                          │ (stopPropagation 시 차단)         │
│  ┌────────────────────────────────────────────────────┐      │
│  │  preload.ts (모든 5개 BrowserWindow 공유)          │      │
│  │   installDropGuard()                               │      │
│  │     window.addEventListener('dragover', e => ...)  │      │
│  │     window.addEventListener('drop', e => ...)      │      │
│  │     - 모두 bubble 단계 등록 → React 핸들러 우선   │      │
│  │     - default 동작(file:// navigate)만 차단        │      │
│  └────────────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────────┘
                          │ IPC (preload는 main에 의존 X)
                          ▼
┌──────────────────────────────────────────────────────────────┐
│  Main Process (electron/main.ts)                             │
│  ┌────────────────────────────────────────────────────┐      │
│  │  installNavigationGuard(win) — 신규 헬퍼           │      │
│  │   - win.webContents.on('will-navigate', e=>{...}) │      │
│  │   - win.webContents.setWindowOpenHandler(()=>...)  │      │
│  │   - file:// / 비-허용 origin 차단                  │      │
│  └────────────────────────────────────────────────────┘      │
│              ▲ 호출 1줄씩                                    │
│  ┌───────────┼───────────┬───────────┬───────────┐           │
│  │           │           │           │           │           │
│  mainWindow widgetWindow iconWindow  quickAdd    sticker     │
│  (L1328)    (L1721)      (L1015)     Window      PickerWin   │
│                                       (L419)      (L561)      │
│                                                              │
│  printWin (L2939) — 가드 미적용 (hidden + ephemeral)         │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 의존성 흐름 (Clean Architecture)

```
infrastructure/  (Electron — 본 핫픽스 변경 핵심)
  └─ electron/preload.ts          ← installDropGuard() 추가
  └─ electron/main.ts             ← installNavigationGuard(win) 헬퍼 + 5곳 호출

adapters/  (UI 변경 최소)
  └─ widgets/items/DesktopOrganize/
       ├─ DesktopOrganize.tsx     ← 코치마크 문구 + 안내 배너 추가
       └─ (다른 파일 미수정)

widgets/   (변경 없음)
usecases/  (변경 없음)
domain/    (변경 없음)
```

본 핫픽스는 domain/usecases에 영향 0. infrastructure 레이어 보강 + adapters 컴포넌트 1개 미세 변경.

### 2.3 핵심 데이터 흐름

#### 2.3.1 정상 경로 — 의도된 drop (예: BookmarkSection import)

```
사용자가 .json 파일을 BookmarkGroupCard에 드롭
  ↓
BookmarkGroupCard.tsx onDrop 핸들러
  ↓ e.preventDefault() + e.stopPropagation()
  ↓ (이벤트가 window까지 안 올라감 — bubble 차단)
  ↓
정상 import 처리
  ↓
window 레벨 가드 listener: 호출되지 않음 (회귀 0건)
```

#### 2.3.2 차단 경로 — 비의도 drop (예: DesktopOrganize 박스 또는 메모 위젯 위)

```
사용자가 .pptx 파일을 DesktopOrganize 박스 위에 드롭
  ↓
DesktopOrganize.tsx — onDrop 핸들러 없음 (의도된 NoOp)
  ↓ 이벤트가 React 트리 통과
  ↓ document → window로 bubble
  ↓
preload installDropGuard() — window.addEventListener('drop')
  ↓ e.preventDefault() — Electron의 default file:// navigate 동작 차단
  ↓
[Defense in depth] 만에 하나 navigate가 시작되면:
main installNavigationGuard() — webContents.on('will-navigate')
  ↓ url.startsWith('file://') → e.preventDefault()
  ↓
앱 살아있음 ✅
```

### 2.4 비기능 보장

| 항목 | 보장 방식 |
|------|-----------|
| 성능 | window.addEventListener는 한 번만 등록. 이벤트당 비용은 preventDefault() 1회 = 무시 가능 |
| 메모리 | 가드 listener는 영구 등록 (윈도우 lifetime 동안). 누수 0 |
| 호환성 | Electron 40.9.3 표준 API. Win11/Win10/macOS Tahoe 26 모두 동일 동작 |
| 회귀 격리 | bubble 단계 + stopPropagation 자연 격리. 메타 테스트로 추가 보강 |

---

## 3. 상세 설계

### 3.1 preload.ts — `installDropGuard()`

**위치**: `electron/preload.ts` 파일 끝(`contextBridge.exposeInMainWorld(...)` 바로 다음에 추가)

**시그니처**:
```typescript
/**
 * BrowserWindow Drop → file:// Navigate 크래시 방지 가드.
 *
 * Electron 기본 동작: dragover/drop을 누구도 preventDefault 안 하면
 * 드롭된 파일의 file:// URL로 BrowserWindow를 navigate → React 렌더러
 * unload (사용자 입장에서는 앱 강제 종료처럼 보임).
 *
 * **bubble 단계** 등록 — React 합성 이벤트 위임이 document에서 먼저
 * 처리하므로, 의도된 drop 컴포넌트(BookmarkCard, StickerUploader,
 * FormUploadModal 등)가 e.stopPropagation() 호출하면 본 listener는
 * 호출되지 않는다 → 회귀 0건.
 *
 * 모든 5개 BrowserWindow(main, widget, icon, quickAdd, stickerPicker)가
 * 동일 preload.js를 공유하므로 본 함수 1회 호출로 전체 보호.
 *
 * Defense in depth: 본 가드 외에 main 프로세스 installNavigationGuard()도
 * file:// will-navigate를 차단 (만에 하나 본 가드를 우회한 경로 대비).
 */
function installDropGuard(): void {
  const block = (e: DragEvent): void => {
    e.preventDefault();
  };
  window.addEventListener('dragover', block, false); // bubble 단계
  window.addEventListener('drop', block, false);
}

installDropGuard();
```

**불변식**:
- bubble 단계 등록 (`useCapture = false`) — React 핸들러 우선 보장
- listener 함수는 `e.preventDefault()` 외 어떤 부작용도 없음 (idempotent)
- 등록 시점은 contextBridge 직후 — DOM이 아직 없어도 `window`는 존재하므로 안전

### 3.2 main.ts — `installNavigationGuard(win)`

**위치**: `electron/main.ts` 기존 헬퍼 영역 (예: `ensureMainWindow` 근처). 신규 파일 생성 안 함 (사용자 협업 정책상 다중 세션 머지 충돌 최소화).

**시그니처**:
```typescript
import type { BrowserWindow } from 'electron';

/**
 * BrowserWindow의 webContents에서 file:// navigate + 외부 윈도우 오픈을 차단.
 *
 * preload installDropGuard()와 함께 defense in depth 구성. 본 가드는
 * preload 가드를 우회한 경로(예: HTML5 file input의 잘못된 path 처리,
 * 외부 sub-window 시도)까지 봉쇄한다.
 *
 * **호출 시점**: BrowserWindow 생성 직후. webContents가 page를 load하기
 * 전에 등록해야 첫 navigation부터 보호됨.
 *
 * **예외**: printWin (hidden + ephemeral PDF 인쇄 전용)에는 호출 안 함.
 *
 * @param win 대상 BrowserWindow
 */
function installNavigationGuard(win: BrowserWindow): void {
  win.webContents.on('will-navigate', (event, url) => {
    // 허용: 개발 서버 (VITE_DEV_SERVER_URL) + 동일 origin 페이지 라우팅
    const devUrl = process.env['VITE_DEV_SERVER_URL'] ?? '';
    if (devUrl && url.startsWith(devUrl)) return;
    // 허용: file:// 중 본 앱의 dist/index.html 라우팅 (해시/쿼리 변경)
    // — 패키지 빌드는 file:///.../dist/index.html 으로 로드되므로
    //   동일 file 경로 + 다른 hash/query는 통과.
    const currentUrl = win.webContents.getURL();
    if (url.startsWith('file://') && url.split('#')[0]!.split('?')[0] === currentUrl.split('#')[0]!.split('?')[0]) {
      return;
    }
    // 차단: 그 외 모든 navigate (특히 사용자 드롭으로 인한 file://path/to/dropped.pptx)
    console.warn('[security] blocked navigation:', url);
    event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    // 외부 윈도우 오픈은 모두 deny. 정당한 외부 링크는 shell.openExternal 사용
    // (기존 패턴: openExternal IPC 채널).
    console.warn('[security] denied window.open:', url);
    return { action: 'deny' };
  });
}
```

**불변식**:
- 호출 후 webContents는 `file://` (자기 자신 dist/index.html 제외) navigate를 모두 거부
- `setWindowOpenHandler`로 모든 신규 윈도우 오픈 거부 — 외부 링크는 기존 `shell.openExternal` IPC 채널을 통해서만
- 콘솔 로그로 디버깅 추적 가능 — 토스트는 없음 (사용자 혼란 방지)

**호출 위치 (정확한 라인)**:
| BrowserWindow | 생성 라인 | `installNavigationGuard` 호출 위치 |
|---------------|-----------|-----------------------------------|
| `quickAddWindow` | electron/main.ts:419 | L443 직후 (`setVisibleOnAllWorkspaces` 이후) |
| `stickerPickerWindow` | electron/main.ts:561 | 생성 직후 |
| `iconWindow` | electron/main.ts:1015 | 생성 직후 |
| `mainWindow` | electron/main.ts:1328 | 생성 직후 |
| `widgetWindow` | electron/main.ts:1721 | 생성 직후 |
| `printWin` | electron/main.ts:2939 | **호출 안 함** (hidden + ephemeral) |

호출은 `생성 직후` = `new BrowserWindow({...})` 의 다음 줄에 1줄 추가.

### 3.3 DesktopOrganize.tsx — 코치마크 + 안내 배너

#### 3.3.1 코치마크 문구 변경 (역할: 사용법 안내)

**Before** (현재 `DesktopOrganize.tsx:219-221`):
```tsx
<p className="text-xs text-sp-text leading-snug mb-1.5">
  박스 위에 바탕화면 아이콘을 직접 드래그해 정리하세요. 자동 정렬은 하지 않아요.
</p>
```

**After** (bkit:frontend-architect 검토 반영, 2026-05-07):
```tsx
<p className="text-xs text-sp-text leading-snug mb-1.5">
  박스 위에 바탕화면 아이콘을 올려놓아 분류할 수 있어요.<br />
  파일을 끌어다 놓는 기능은 지원하지 않아요.
</p>
```

**역할 분리 결정 (frontend-architect 피드백 반영)**:
- 코치마크 = **사용법 안내**에 집중 (1회성)
- 안내 배너 = **모드 전환 권유**에 집중 (항시 노출, §3.3.2)
- 두 카피 모두 "모드 전환"으로 채우면 역할 중복 + 코치마크의 행동 유발력 약화

**근거 (frontend-architect)**:
- 기존 Before는 "직접 드래그"라는 행동 유발 카피 — 보존 가치 있음
- After 1차 안의 "모드를 바꾸면 … 할 수 있어요" 구조는 조건문처럼 읽혀 행동 유발력 약화 → 폐기
- 신규 카피는 (a) 사용법 한 줄, (b) 파일 drop 불가 사실 선제 명시 두 줄로 분리. 사용자가 파일을 끌어보기 전에 "지원하지 않아요"를 먼저 읽어 시도 자체를 줄임
- 강조(굵은 글씨/sp-accent) 없음 — 사용법 안내는 평이한 문장이 더 적합

#### 3.3.2 안내 배너 추가 (역할: 모드 전환 권유, 항시 노출)

**위치**: `DesktopOrganize.tsx` 내 `!isWindows` 배너(L182-188) 직후, 동일 패턴.

**조건**: native-desktop 모드가 *아닐* 때만 노출. native-desktop 모드 감지는 [`useSettingsStore`](src/adapters/stores/useSettingsStore.ts)의 `widget.desktopMode === 'native-desktop'` 여부로 판정.

**컴포넌트 추가** (bkit:frontend-architect 검토 반영, 2026-05-07):
```tsx
// import 추가
import { useSettingsStore } from '@adapters/stores/useSettingsStore';

// 컴포넌트 내부
const desktopMode = useSettingsStore((s) => s.widget.desktopMode);
const isNativeDesktopMode = desktopMode === 'native-desktop';

// JSX — !isWindows 배너 직후 (L188 다음)에 추가
{isWindows && !isNativeDesktopMode && (
  <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-sp-card/60 border border-sp-border shrink-0">
    <p className="text-xs text-sp-muted leading-snug">
      💡 박스 위로 바탕화면 아이콘을 직접 분류하려면{' '}
      <span className="text-sp-text font-bold">바탕화면 아이콘 아래 모드</span>가 필요해요. 설정에서 켤 수 있어요.
    </p>
  </div>
)}
```

**카피 결정 근거 (frontend-architect 피드백)**:
- "전환하세요" 명령형 → "켤 수 있어요" 권유형 — 쌤핀 친근 존댓말 표준에 더 부합
- "설정에서 켤 수 있어요" 한 줄로 진입 경로 힌트 추가 → 사용자 행동 마찰 감소
- 정확한 경로(설정 > 위젯 > 데스크톱 모드)는 한 줄 길어지므로 배너에 미포함 — 사용자가 설정 화면에서 직접 찾는 비용 < 배너 가독성

**선택적 Do 단계 강화 (out of copy scope)**:
- 배너 우측에 "설정 열기" 작은 텍스트 버튼 추가 검토 가능 (`navigateToPage('settings/widget')` IPC 호출). frontend-architect는 카피 검토 범위 외로 판단만 남김 → Do 단계에서 사용자 의향 재확인 후 결정. 미구현 시에도 배너 카피만으로 사용 가능.

**디자인 토큰**:
- 배경: `bg-sp-card/60` (기존 `!isWindows` 배너의 `bg-sp-highlight/10` 보다 차분 — 정보 안내 톤)
- 테두리: `border-sp-border`
- 텍스트: `text-sp-muted` (강조 단어만 `text-sp-text font-bold`)
- 라운딩: `rounded-lg` (기존 패턴 그대로)
- 모서리/간격: `mb-2 px-2.5 py-1.5` — `!isWindows` 배너와 100% 동일

**노출 매트릭스**:
| OS | desktopMode | 배너 |
|----|-------------|:----:|
| Windows | normal | ✅ 노출 |
| Windows | topmost | ✅ 노출 |
| Windows | native-desktop | ❌ 숨김 (정상 동작 모드) |
| macOS/Linux | (any) | ❌ 숨김 (`!isWindows` 배너가 우선 — 중복 방지) |

#### 3.3.3 frontend-architect 에이전트 검토 결과 (2026-05-07 완료)

**검토 의뢰**: bkit:frontend-architect (frontend-design은 서브에이전트 미등록 → 메모리 정책 2순위 fallback)

**핵심 피드백 5건 + 반영**:

| 피드백 | 반영 |
|--------|------|
| 1차 코치마크 After안 "모드 바꾸면 … 할 수 있어요"는 조건문처럼 읽혀 행동 유발력 약화 | **반영**: 코치마크 = 사용법 안내, 배너 = 모드 전환 권유로 역할 분리 (§3.3.1, §3.3.2) |
| 두 카피 모두 "모드 전환"으로 채우면 역할 중복 | **반영**: 카피 분리 |
| "전환하세요" 명령형보다 "켤 수 있어요" 권유형이 쌤핀 표준 | **반영**: 배너 카피 변경 |
| 진입 경로 힌트("설정에서") 한 줄 추가 시 행동 마찰 감소 | **반영**: 배너에 "설정에서 켤 수 있어요" 추가 |
| 배너에 "설정 열기" 링크 버튼 추가는 컴포넌트 변경 → 카피 범위 외 판단만 남김 | **선택적 Do 강화로 분리** (§3.3.2 후반부) |

검토 결과 본 §3.3.1·§3.3.2 카피는 frontend-architect 권고를 100% 반영하여 확정. Do 단계 직전 사용자 최종 확인만 받으면 됨.

### 3.4 챗봇 KB Q&A 5건 (카피 작성 — 본 PDCA에서 카피만, 재임베딩은 묶음 릴리즈)

**파일**: `scripts/ingest-chatbot-qa.mjs` (기존 카테고리 `바탕화면 정리` 확장)

```javascript
// 기존 'desktop-organize' 또는 '바탕화면 정리' 카테고리에 추가:

{
  category: 'desktop-organize',
  question: '바탕화면 정리에 파일이나 폴더를 끌어 넣으면 빨간 동그라미 빗금이 나오고 앱이 튕겨요',
  answer: '바탕화면 정리 위젯은 위젯 모드에서는 시각적 박스 그리드만 보이고, 박스에 직접 파일을 받지 않아요. 진짜 동작은 "바탕화면 아이콘 아래 모드"에서 이뤄집니다 — 위젯이 바탕화면 아이콘 아래 깔리고, 사용자는 평소처럼 윈도우 바탕화면 아이콘을 박스 위로 드래그해 시각적으로 분류해요. 모드 전환은 트레이 메뉴 또는 설정 → 위젯 모드에서 할 수 있어요. (v2.0.4부터는 잘못 드롭해도 앱이 튕기지 않아요.)',
},
{
  category: 'desktop-organize',
  question: '바탕화면 정리는 어떻게 사용하나요?',
  answer: '1) 위젯 모드에 진입하고 2) 트레이/설정에서 "바탕화면 아이콘 아래 모드"로 전환합니다. 3) 위젯이 바탕화면 아이콘 아래 깔리면 4) 위젯 우상단 ✏️로 편집 모드 진입 → 박스 그리드와 제목을 설정합니다. 5) 편집을 끝내고 평소처럼 바탕화면 아이콘들을 박스 위로 드래그하면 시각적으로 분류돼요. 자동 정렬·자동 이동은 하지 않습니다 — 사용자가 직접 옮기는 시각 가이드라인이에요.',
},
{
  category: 'desktop-organize',
  question: '바탕화면 아이콘 아래 모드는 무엇인가요?',
  answer: '쌤핀 위젯이 윈도우 바탕화면의 아이콘들 아래 레이어에 깔리는 모드입니다(Windows 전용). 평소 위젯이 화면 위에 떠 있는 게 아니라, 바탕화면 자체에 통합돼 보여요. 이 모드에서만 "바탕화면 정리" 위젯이 정상 동작합니다. 트레이 메뉴 또는 설정 → 위젯 → 데스크톱 모드에서 전환할 수 있어요. macOS는 미지원입니다.',
},
{
  category: 'desktop-organize',
  question: '위젯 모드에서 바탕화면 정리가 동작하지 않아요',
  answer: '의도된 동작이에요. 위젯 모드(또는 대시보드 미리보기)에서는 박스 그리드와 제목만 보이고, 실제 분류 동작은 "바탕화면 아이콘 아래 모드"에서만 이뤄집니다. 위젯 카드 본문 안에 안내 배너가 표시될 거예요 — 거기서 안내된 모드로 전환하시면 됩니다.',
},
{
  category: 'desktop-organize',
  question: '바탕화면 정리 박스가 파일을 받게 만들 수 없나요?',
  answer: '현재 v2.0.x에서는 위젯이 파일을 받아 분류하는 기능은 제공하지 않아요. 설계상 "박스는 시각적 영역, 아이콘은 윈도우 Explorer가 그대로 관리"라는 구조라서, 박스 안에 어떤 파일이 들어있는지를 쌤핀이 추적하지 않습니다. 사용자가 파일을 박스 위로 직접 드래그해 OS 차원에서 정리하는 방식이에요. (이 설계 결정은 향후 별도 논의로 검토할 수 있어요.)',
},
```

### 3.5 노션 가이드 카피 작성 (게시는 묶음 릴리즈 시)

**대상 페이지**: 사용자 가이드 → "바탕화면 정리" 섹션 상단

**추가 블록 카피**:

```markdown
> ⚠️ **이 위젯은 "바탕화면 아이콘 아래 모드"에서만 동작해요**
>
> 위젯 모드에서는 박스 그리드만 보이고 파일이 박스에 들어가지 않습니다 (의도된 동작이에요).
> 트레이 메뉴 또는 설정 → 위젯 → 데스크톱 모드에서 "바탕화면 아이콘 아래"를 선택하면, 위젯이 바탕화면 아이콘 아래 레이어로 내려가고
> 평소처럼 바탕화면 아이콘을 박스 위로 드래그해 시각적으로 분류할 수 있어요.
>
> *macOS는 미지원입니다.*
```

게시 시점: 묶음 릴리즈 노션 가이드 갱신 작업 시 함께 반영.

### 3.6 메타 테스트 2종

#### 3.6.1 preload 가드 단위 테스트

**파일 경로 (제안)**: `electron/__tests__/installDropGuard.test.ts`

**프레임워크**: 기존 vitest 테스트 환경 재사용 (`npm run test`)

**테스트 시나리오**:
- `installDropGuard()` 호출 후 window에 dragover/drop listener 2개가 등록됐는지 (`addEventListener` mock spy)
- bubble 단계로 등록됐는지 (`useCapture === false`)
- listener가 dispatch된 이벤트의 `preventDefault()`를 호출하는지

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('installDropGuard', () => {
  it('dragover/drop을 bubble 단계에서 preventDefault 한다', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    // installDropGuard를 동적 import 또는 함수 export로 호출
    // (preload.ts는 IIFE라 export 분리 필요 — 3.6.3 참조)
    installDropGuardForTest();
    expect(addSpy).toHaveBeenCalledWith('dragover', expect.any(Function), false);
    expect(addSpy).toHaveBeenCalledWith('drop', expect.any(Function), false);

    const dragoverHandler = addSpy.mock.calls.find((c) => c[0] === 'dragover')?.[1] as EventListener;
    const ev = new DragEvent('dragover', { cancelable: true });
    const pdSpy = vi.spyOn(ev, 'preventDefault');
    dragoverHandler(ev);
    expect(pdSpy).toHaveBeenCalled();
  });
});
```

#### 3.6.2 main 가드 헬퍼 호출 카운트 테스트

**파일 경로 (제안)**: `electron/__tests__/installNavigationGuard.staticgrep.test.ts`

**전략**: 정적 grep 기반 검증. main.ts 파일을 읽어 `new BrowserWindow(` 발생 횟수와 `installNavigationGuard(` 호출 횟수를 비교.

```typescript
import { readFileSync } from 'fs';
import { describe, it, expect } from 'vitest';

describe('main.ts navigation guard coverage', () => {
  it('BrowserWindow 신설 시 installNavigationGuard 호출이 일치한다 (printWin 제외)', () => {
    const src = readFileSync('electron/main.ts', 'utf-8');
    const browserWindowCount = (src.match(/new BrowserWindow\(/g) ?? []).length;
    const guardCallCount = (src.match(/installNavigationGuard\(/g) ?? []).length;
    // printWin은 의도적 예외 — 헬퍼 정의 1줄 + 호출 5줄 = 6, 신설 6건과 일치
    // (1: 함수 정의 본인, 5: 5개 윈도우 호출)
    // 또는 정의를 별도 파일로 빼면 = 5 호출
    const expectedCalls = browserWindowCount - 1; // printWin 제외
    expect(guardCallCount).toBeGreaterThanOrEqual(expectedCalls);
  });
});
```

**보충**: 정적 grep은 false positive 가능 (주석 안 호출 등). 하지만 누락 회귀를 1차로 잡는 안전망으로 충분.

#### 3.6.3 preload export 리팩토링 (테스트 가능성)

현재 `preload.ts`는 IIFE 스타일(top-level `contextBridge.exposeInMainWorld`). 테스트를 위해 `installDropGuard` 함수를 named export 추가:

```typescript
// preload.ts 끝부분
export function installDropGuard(): void { /* ... */ }

// IIFE 호출 (자동 적용)
installDropGuard();
```

`tsconfig.json`은 이미 module resolution이 ESM이라 export 가능. 단 preload는 빌드 후 CJS로 emit되므로 export가 런타임에서 unused warning만 발생할 수 있음 → `// eslint-disable-next-line` 또는 모듈 분리.

**대안 (간단)**: `electron/security-guards.ts` 신규 파일에 `installDropGuard` + `installNavigationGuard` 두 함수를 묶고, preload.ts와 main.ts에서 각각 import. 단일 파일 = 단일 책임.

→ **결정**: `electron/security-guards.ts` 신규 파일 채택. 이유: (a) 테스트 분리 명확, (b) 향후 보안 가드 추가 시 한 곳에 모임, (c) main.ts 파일 비대화 방지.

### 3.7 회귀 시나리오 (Plan §5.3 RG-01~RG-05) 수동 체크 절차

| ID | 시나리오 | 절차 | 기대 결과 |
|----|----------|------|-----------|
| RG-01 | 위젯 모드 `바탕화면 정리` 박스에 파일 드롭 | 1. 위젯 모드 진입 2. `바탕화면 정리` 카드 활성화 3. 임의의 .pptx/.png/폴더를 박스 위로 드래그&드롭 | 빨간 동그라미 빗금 커서 → 드롭 무동작 → **앱 살아있음** + 안내 배너 표시 |
| RG-02 | 메인 윈도우에 파일 드롭 | 1. 메인 앱 → 메모/할일 입력 중 2. 파일을 메인 윈도우 빈 공간에 드롭 | 무동작 + 메모 입력 데이터 보존 |
| RG-03 | 아이콘 윈도우에 파일 드롭 | 1. 아이콘 모드 전환 2. 떠 있는 아이콘 위에 파일 드롭 | 무동작 + 앱 살아있음 |
| RG-04 | 즐겨찾기 import 모달에 .json 드롭 | 1. 메인 → 도구 → 즐겨찾기 → import 모달 오픈 2. 정상 .json 드롭 | **정상 import 동작** (가드 회귀 없음) |
| RG-05 | 스티커 업로더에 이미지 드롭 / 실시간 보드에 이미지 드롭 | 1. 도구 → 내 이모티콘 → 업로더 / 실시간 보드 학생 이미지 multi-picker 2. PNG 드롭 | **정상 업로드 동작** |

각 시나리오 수행 후 결과를 Analysis 단계 (`/pdca analyze`)에서 기록.

---

## 4. 구현 순서 (Do 단계)

| Phase | 작업 | 파일 | 예상 시간 |
|-------|------|------|----------|
| A | `electron/security-guards.ts` 신규 작성 (`installDropGuard` + `installNavigationGuard`) | NEW | 0.1일 |
| B | `electron/preload.ts` import + 호출 1줄 추가 | preload.ts | 0.05일 |
| C | `electron/main.ts` import + 5개 BrowserWindow 생성 직후 호출 1줄씩 추가 | main.ts | 0.15일 |
| D | `DesktopOrganize.tsx` 코치마크 문구 변경 + 안내 배너 추가 + `useSettingsStore` import | DesktopOrganize.tsx | 0.1일 |
| E | 메타 테스트 2종 작성 + 통과 | electron/__tests__/ | 0.1일 |
| F | `npx tsc --noEmit` 0 errors + `npm run test` 통과 | — | 0.05일 |
| G | RG-01~RG-05 수동 체크 (Win11 dev 빌드) | — | 0.1일 |
| H | 챗봇 KB 카피 작성 (스크립트 추가만) | scripts/ingest-chatbot-qa.mjs | 0.05일 |
| **합계** | | | **~0.7일** |

**제외**: 노션 게시 + 챗봇 재임베딩 + 빌드/태그/릴리스/URL 검증 → 묶음 릴리즈 시.

---

## 5. 위험 및 대응 (Plan §6 보강)

| 위험 | 영향도 | 대응 |
|------|--------|------|
| frontend-design 에이전트 검토에서 카피 변경 요청 | Low | §3.3.1, §3.3.2 카피만 갱신, 디자인 토큰/구조 변경 없음 |
| `installNavigationGuard`의 file:// 허용 로직 (자기 자신 dist/index.html 라우팅)이 실제 패키지 빌드에서 차단 발생 | Medium | §3.2 로직: `currentUrl`과 동일 file 경로 + 다른 hash/query는 통과. 빌드 후 메인 페이지 라우팅(예: react-router push/pop)이 file:// 기반이므로 회귀 가능성. **Do 단계에서 packaged dev 빌드로 라우팅 정상 동작 확인 필수** |
| 다른 세션이 같은 BrowserWindow에 추가 listener 등록 | Low | 가드는 idempotent — 중복 listener도 모두 `preventDefault()` 호출, 충돌 없음 |
| 메타 테스트가 false negative (정적 grep 한계) | Low | grep 보강: 주석 제외 정규식 `/(?<!\/\/.*)\bnew BrowserWindow\(/`. 정확도 낮으면 ESLint 커스텀 룰 검토 |
| preload.ts에 export 추가 시 빌드 산출물에서 unused warning | Low | `electron/security-guards.ts`로 분리하여 preload는 그냥 import → 호출. unused warning 0 |

---

## 6. 진입 전 체크리스트 (Do 단계 직전)

- [x] ~~frontend-design 또는 bkit:frontend-architect 에이전트에 §3.3.1·§3.3.2 카피 + 톤 검토 의뢰~~ → bkit:frontend-architect 검토 완료 (2026-05-07)
- [x] ~~검토 결과 반영하여 본 문서 갱신~~ → §3.3.1, §3.3.2, §3.3.3 갱신 완료
- [ ] 사용자 최종 승인 (`/pdca do desktop-organize-drop-crash-fix`)
- [ ] **사용자 결정 필요 항목** (Do 단계 진입 전):
  - 배너에 "설정 열기" 링크 버튼 추가 여부 (§3.3.2 선택적 강화)
- [ ] Win11 + dev 빌드 환경 준비 (RG-01~RG-05 수동 체크용)

---

## Version History

| 버전 | 날짜 | 변경사항 | 작성자 |
|------|------|----------|--------|
| 0.1 | 2026-05-07 | 최초 Draft. 사용자 결정(2026-05-07): 릴리즈 트랙 D를 Out-of-Scope로 분리 → 묶음 릴리즈 시 통합. preload + main 헬퍼 단일 진실 원천 패턴 확정. `electron/security-guards.ts` 신규 파일로 가드 분리 결정. 의도된 drop 컴포넌트 7개 grep 검증으로 회귀 격리 안전성 확인. | pblsketch |
| 0.2 | 2026-05-07 | bkit:frontend-architect 카피 검토 반영 (§3.3.1·§3.3.2). 코치마크=사용법 안내 / 배너=모드 전환 권유로 역할 분리. 코치마크 카피 변경: 파일 drop 불가 사실 선제 명시. 배너 카피 변경: "전환하세요" → "켤 수 있어요. 설정에서 켤 수 있어요" (권유형 + 진입 경로 힌트). "설정 열기" 링크 버튼은 선택적 Do 강화로 분리하여 사용자 결정 대기. | pblsketch |
