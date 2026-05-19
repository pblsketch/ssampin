# 업데이트 알림 사용자 통제권 (Update Notification Controls) Design Document

> **Plan**: [`update-notification-controls.plan.md`](../../01-plan/features/update-notification-controls.plan.md) v0.1
> **Project**: SsamPin
> **Version**: v2.0.5 (예정 — patch)
> **Date**: 2026-05-14
> **Status**: Draft v0.1 — 사용자 승인 대기 중

---

## 0. 문서 구조

Plan §3의 5 Layer + 안전망을 차례로 상세 설계한다.

- §1 시나리오 흐름도 — 전체 분기
- §2 Layer 1 Design — `useUpdatePreferencesStore` 스토어
- §3 Layer 2 Design — `UpdateNotification.tsx` 게이팅 + 드롭다운 + 보안 변형
- §4 Layer 3 Design — `Sidebar.tsx` 배지 폴백
- §5 Layer 4 Design — release-notes.json 스키마 + isSecurity 매핑
- §6 Layer 5 Design — 단위/메타 테스트
- §7 a11y/i18n/디자인 토큰 점검 매트릭스
- §8 인수기준(RG) 시나리오 detail

---

## 1. 시나리오 흐름도

### 1.1 모달 노출 게이팅 (메인 분기)

```
┌──────────────────────────────────┐
│ electron-updater onUpdateAvailable │
│   info = {version, releaseNotes}   │
└────────────────┬─────────────────┘
                 │
                 ▼
┌──────────────────────────────────┐
│ fetchReleaseNotesSince(curr, info.v) │
│   → notes[0].isSecurity ?            │
│   (보수적: fetch 실패 → true)        │
└────────────────┬─────────────────┘
                 │
        ┌────────┴─────────┐
        │                  │
   isSecurity?            else
        │                  │
        ▼                  ▼
  ┌──────────┐    ┌──────────────────────────────┐
  │ 🔒 강제   │    │ Gate 1: skippedVersions ∋ v? │──Yes──► 침묵
  │ 모달 노출 │    └──────────────┬───────────────┘
  │ (스누즈   │                   │ No
  │  단기만)  │                   ▼
  └────┬─────┘    ┌──────────────────────────────┐
       │           │ Gate 2: now < snoozeUntil?   │──Yes──► 침묵
       │           └──────────────┬───────────────┘
       │                          │ No
       │                          ▼
       │           ┌──────────────────────────────┐
       │           │ Gate 3: lastNotifiedVer===v? │──Yes──► 사이드바 배지만
       │           └──────────────┬───────────────┘
       │                          │ No
       ▼                          ▼
  ┌─────────────────────────────────────────┐
  │ 모달 노출 + markNotified(info.version)   │
  │  (lastNotifiedVersion = info.version)    │
  └────────────────┬────────────────────────┘
                   │
        ┌──────────┼──────────────┬──────────────┐
        ▼          ▼              ▼              ▼
   [지금 업데이트] [나중에 ▾]      [X / ESC]    [사이드바 배지 클릭]
        │          │              │              │ (게이트 무시 강제 노출)
        ▼          ▼              ▼              ▼
   다운로드   1d/3d 스누즈    snooze(3)      모달 재노출
              or 건너뛰기      (기본)
```

### 1.2 사이드바 배지 폴백 (서브 분기)

```
"새 버전 있음" 조건:
  info.version > __APP_VERSION__
  AND lastNotifiedVersion === info.version   (이미 모달 노출됨)
  AND now > snoozeUntil                       (스누즈 만료)
  AND skippedVersions ∌ info.version          (영구 건너뛴 게 아님)
  AND status !== 'downloading' && !== 'downloaded'
                ↓
  ┌─────────────────────────────────┐
  │ Sidebar expanded?               │
  └──────────┬──────────────────────┘
             │
       ┌─────┴────┐
       │          │
      Yes        No (collapsed)
       │          │
       ▼          ▼
  v{X} • ←      햄버거/로고 영역에 점(•)
  텍스트 옆     (collapsed 사이드바 너비 64px 내)
```

---

## 2. Layer 1 Design — `useUpdatePreferencesStore`

### 2.1 파일 위치 + 의존성

**파일**: `src/adapters/stores/useUpdatePreferencesStore.ts` (신규)

**의존성**:
- `zustand` (^4.5, 기존)
- `zustand/middleware` persist (기존)
- localStorage (브라우저/Electron 양쪽 사용 가능)

### 2.2 타입 시그니처

```typescript
export interface UpdatePreferencesState {
  /**
   * 가장 최근에 사용자에게 모달로 노출된 버전.
   * 같은 버전 두 번 모달 노출 방지용.
   * null이면 아직 어떤 버전도 노출 안 됨.
   */
  lastNotifiedVersion: string | null;

  /**
   * 모달 침묵 만료 시각 (Unix ms).
   * now < snoozeUntil 이면 모달 안 뜸.
   * null이면 스누즈 없음.
   */
  snoozeUntil: number | null;

  /**
   * 영구 건너뛴 버전 목록.
   * 사용자가 명시적으로 "이 버전 건너뛰기" 선택한 경우.
   * 보안 업데이트(isSecurity=true)는 이 목록 무시하고 강제 노출.
   */
  skippedVersions: string[];
}

export interface UpdatePreferencesActions {
  /** 모달 노출 직후 호출 — 같은 버전 재노출 차단 */
  markNotified: (version: string) => void;

  /** N일 동안 모달 침묵 — Date.now() + days * 86400_000 */
  snooze: (days: 1 | 3) => void;

  /** 영구 건너뛰기 — 더 새 버전 나올 때까지 모달도 배지도 안 뜸 */
  skip: (version: string) => void;

  /** 건너뛰기 취소 — v2.0.6+에서 설정 UI로 노출 예정, 본 PDCA에선 export만 */
  unskip: (version: string) => void;

  /** 모든 상태 초기화 — 디버그/테스트용 */
  reset: () => void;
}

export type UpdatePreferencesStore = UpdatePreferencesState & UpdatePreferencesActions;
```

### 2.3 persist 설정

```typescript
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const INITIAL_STATE: UpdatePreferencesState = {
  lastNotifiedVersion: null,
  snoozeUntil: null,
  skippedVersions: [],
};

export const useUpdatePreferencesStore = create<UpdatePreferencesStore>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,

      markNotified: (version) => set({ lastNotifiedVersion: version }),

      snooze: (days) =>
        set({ snoozeUntil: Date.now() + days * 86_400_000 }),

      skip: (version) =>
        set((s) => ({
          skippedVersions: s.skippedVersions.includes(version)
            ? s.skippedVersions
            : [...s.skippedVersions, version],
        })),

      unskip: (version) =>
        set((s) => ({
          skippedVersions: s.skippedVersions.filter((v) => v !== version),
        })),

      reset: () => set(INITIAL_STATE),
    }),
    {
      name: 'ssampin-update-prefs-v1',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      // 향후 v2 마이그레이션 슬롯 (현재는 비어있음)
      migrate: (persistedState, version) => {
        if (version === 0) {
          // v0 → v1 변환 (해당 없음, 신규 스토어)
          return persistedState as UpdatePreferencesState;
        }
        return persistedState as UpdatePreferencesState;
      },
    }
  )
);
```

### 2.4 셀렉터 헬퍼 (모달/사이드바에서 사용)

```typescript
/** 게이트 판정 — 모달 노출 여부 */
export function shouldShowUpdateModal(
  version: string,
  isSecurity: boolean,
  state: UpdatePreferencesState,
  now: number = Date.now()
): boolean {
  if (isSecurity) return true; // 보안: 모든 게이트 우회

  if (state.skippedVersions.includes(version)) return false;
  if (state.snoozeUntil !== null && now < state.snoozeUntil) return false;
  if (state.lastNotifiedVersion === version) return false;

  return true;
}

/** 사이드바 배지 표시 여부 — "이미 모달 노출됐고 스누즈 중도 건너뛴 것도 아님" */
export function shouldShowSidebarBadge(
  newVersion: string,
  currentVersion: string,
  state: UpdatePreferencesState,
  now: number = Date.now()
): boolean {
  if (compareVersion(newVersion, currentVersion) <= 0) return false;
  if (state.skippedVersions.includes(newVersion)) return false;
  if (state.snoozeUntil !== null && now < state.snoozeUntil) return false;
  if (state.lastNotifiedVersion !== newVersion) return false; // 아직 모달 한 번도 안 봄 → 모달이 뜨고 있을 것
  return true;
}

function compareVersion(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}
```

> **Note**: `compareVersion`은 `UpdateNotification.tsx`의 `fetchReleaseNotesSince` 내부에도 동일 로직 존재. 본 PDCA에선 중복 유지 (DRY 리팩토링은 Out of Scope). 필요 시 v2.0.6+에서 `domain/valueObjects/SemVer.ts`로 추출.

---

## 3. Layer 2 Design — `UpdateNotification.tsx`

### 3.1 변경 diff 요약

| 영역 | Before | After |
|------|--------|-------|
| 상태 관리 | `useState(false)` for dismissed | `useUpdatePreferencesStore` + `forceShow` ref |
| onUpdateAvailable | 무조건 모달 노출 | `shouldShowUpdateModal()` 게이트 |
| 푸터 우측 | `[닫기] [지금 업데이트]` | `[나중에 ▾] [지금 업데이트]` |
| X/ESC 동작 | dismissed=true (세션만) | `snooze(3)` (영속화) |
| 보안 업데이트 헤더 | 일반 헤더 | `🔒 보안 업데이트 — v{X}` + 서브헤더 |
| isSecurity 매핑 | 없음 | `notes[0].isSecurity` 전파 |

### 3.2 핵심 코드 변경 — 상태/게이팅

```typescript
// Before (UpdateNotification.tsx:99)
const [dismissed, setDismissed] = useState(false);

// After
const prefs = useUpdatePreferencesStore();
const [forceShow, setForceShow] = useState(false); // 사이드바 배지 클릭 시 true
const [isSecurity, setIsSecurity] = useState(false);
```

**`onUpdateAvailable` 핸들러 변경**:

```typescript
// Before
cleanups.push(api.onUpdateAvailable((updateInfo) => {
  setInfo(updateInfo);
  setStatus('available');
  setDismissed(false);
}));

// After
cleanups.push(api.onUpdateAvailable(async (updateInfo) => {
  setInfo(updateInfo);

  // release-notes.json 조회 (fetchReleaseNotesSince 재사용)
  const currentVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
  const notes = await fetchReleaseNotesSince(currentVersion, updateInfo.version);
  const security = notes[0]?.isSecurity ?? false;
  setIsSecurity(security);

  // 게이트 판정
  const shouldShow = shouldShowUpdateModal(
    updateInfo.version,
    security,
    useUpdatePreferencesStore.getState()
  );

  if (shouldShow) {
    prefs.markNotified(updateInfo.version);
    setStatus('available');
  } else {
    // 모달 안 띄움 — 사이드바 배지가 폴백으로 노출됨
    setStatus('idle');
  }
}));
```

**사이드바 배지 클릭 → 모달 강제 재노출**:

```typescript
// 글로벌 이벤트 (Sidebar → UpdateNotification 통신)
useEffect(() => {
  const handler = () => {
    if (info) {
      setForceShow(true);
      setStatus('available');
    }
  };
  window.addEventListener('ssampin:show-update-modal', handler);
  return () => window.removeEventListener('ssampin:show-update-modal', handler);
}, [info]);
```

> Sidebar에서 `window.dispatchEvent(new Event('ssampin:show-update-modal'))`로 트리거. Zustand 액션도 가능하지만 컴포넌트 ref 우회를 위해 이벤트 방식 채택 (DOM 표준, 추가 의존성 0).

### 3.3 푸터 CTA — `[나중에 ▾]` 드롭다운

**Before**:
```tsx
<div className="flex items-center gap-2">
  <button onClick={handleDismiss}>닫기</button>
  <button onClick={handleDownload}>지금 업데이트</button>
</div>
```

**After**:
```tsx
<div className="flex items-center gap-2">
  <LaterDropdown
    isSecurity={isSecurity}
    onSnooze1d={() => { prefs.snooze(1); handleClose(); }}
    onSnooze3d={() => { prefs.snooze(3); handleClose(); }}
    onSkip={() => { prefs.skip(info.version); handleClose(); }}
  />
  <button onClick={handleDownload}>지금 업데이트</button>
</div>
```

**`LaterDropdown` 내부 마크업 (a11y 준수)**:

```tsx
function LaterDropdown({ isSecurity, onSnooze1d, onSnooze3d, onSkip }: Props) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // ESC: 드롭다운만 닫기 (모달 닫기와 충돌 안 함 — stopPropagation)
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('keydown', handler, { capture: true });
    return () => document.removeEventListener('keydown', handler, { capture: true });
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="px-3 py-1.5 text-sm text-sp-muted hover:text-sp-text transition-colors rounded-lg hover:bg-sp-surface flex items-center gap-1"
      >
        나중에
        <span className="material-symbols-outlined text-base" aria-hidden="true">
          expand_more
        </span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="나중에 다시 알림"
          className="absolute bottom-full right-0 mb-1 bg-sp-card border border-sp-border rounded-lg shadow-lg py-1 min-w-[200px] z-10"
        >
          <button role="menuitem" onClick={onSnooze1d} className="...">
            1일 뒤 다시 알림
          </button>
          <button role="menuitem" onClick={onSnooze3d} className="...">
            3일 뒤 다시 알림
          </button>
          {!isSecurity && (
            <>
              <div role="separator" className="my-1 border-t border-sp-border/40" />
              <button role="menuitem" onClick={onSkip} className="...">
                이 버전 건너뛰기
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

**드롭다운 키보드 a11y**:
- Tab으로 [나중에 ▾] 진입 → Enter/Space로 열기
- 열린 상태에서 ArrowDown/ArrowUp으로 메뉴 항목 이동 (포커스 순환)
- Enter로 선택, ESC로 닫기
- 메뉴 외부 클릭 시 닫기 (mousedown outside 감지)

### 3.4 보안 업데이트 헤더 변형

```tsx
{/* Before */}
<h3 className="text-sp-text text-base font-bold leading-tight">
  쌤핀이 v{info.version}로 업데이트됐어요
</h3>

{/* After */}
{isSecurity ? (
  <>
    <div className="flex items-center gap-2">
      <span className="material-symbols-outlined text-amber-400" aria-hidden="true">
        lock
      </span>
      <h3 className="text-sp-text text-base font-bold leading-tight">
        보안 업데이트 — v{info.version}
      </h3>
    </div>
    <p className="text-amber-300/80 text-xs mt-1">
      이 업데이트는 보안 패치를 포함하고 있어 건너뛸 수 없어요.
      가능한 한 빠른 업데이트를 권장해요.
    </p>
  </>
) : (
  <h3 className="text-sp-text text-base font-bold leading-tight">
    쌤핀이 v{info.version}로 업데이트됐어요
  </h3>
)}
```

### 3.5 X/ESC/백드롭 동작

**Modal props 변경**:
```tsx
<Modal
  isOpen={status === 'available'}
  onClose={handleClose}      // X 버튼 + 백드롭 클릭
  closeOnEsc={!isDownloading}
  // ...
/>

// handleClose: 보안이면 짧게(1일), 일반이면 기본(3일)
const handleClose = useCallback(() => {
  if (isSecurity) {
    prefs.snooze(1);
  } else {
    prefs.snooze(3);
  }
  setStatus('idle');
  setForceShow(false);
}, [isSecurity, prefs]);
```

---

## 4. Layer 3 Design — `Sidebar.tsx` 배지 폴백

### 4.1 배지 위치 매트릭스

| Sidebar 상태 | 위치 | 마크업 |
|--------------|------|--------|
| **Expanded** (`!sidebarCollapsed`) | 하단 `v{X}` 텍스트 옆 (현재 `Sidebar.tsx:337`) | `<p>v2.0.4 <span className="badge">•</span></p>` |
| **Collapsed** (`sidebarCollapsed`) | 상단 로고/햄버거 영역 (사이드바 폭 64px 내) | 햄버거 아이콘 우상단 절대 위치 `top-0 right-0` |

### 4.2 컴포넌트 추가 — `SidebarUpdateBadge`

`Sidebar.tsx` 내부 또는 분리 컴포넌트:

```tsx
function SidebarUpdateBadge({
  newVersion,
  variant,
}: {
  newVersion: string;
  variant: 'inline' | 'corner';
}) {
  const handleClick = () => {
    window.dispatchEvent(new Event('ssampin:show-update-modal'));
  };

  if (variant === 'inline') {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-label={`새 버전 ${newVersion} 사용 가능`}
        title={`${newVersion} 사용 가능 — 클릭해서 자세히 보기`}
        className="inline-block w-1.5 h-1.5 rounded-full bg-sp-accent ml-1.5 align-middle hover:scale-125 transition-transform"
      />
    );
  }

  // corner (collapsed)
  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`새 버전 ${newVersion} 사용 가능`}
      title={`${newVersion} 사용 가능`}
      className="absolute top-1 right-1 w-2 h-2 rounded-full bg-sp-accent hover:scale-125 transition-transform"
    />
  );
}
```

### 4.3 Sidebar.tsx 통합

```tsx
// useUpdateInfoForBadge 훅 (내부 또는 hooks/)
// → onUpdateAvailable 이벤트로 받아둔 최신 info를 전역 store 또는 ref로 노출
//   본 PDCA 단순화: 전역 zustand store에 latestUpdateInfo 추가 (스토어 1개 더 신설하지 않고
//   useUpdatePreferencesStore에 통합하지 않음 — 영속화 불필요한 임시 데이터)

// 가장 간단한 방식: window 객체에 임시 캐시
// → 추후 useUpdateAvailableStore 신설 가능 (P2)

const newVersion = useNewVersionAvailable(); // 새 훅
const prefs = useUpdatePreferencesStore();
const show = newVersion && shouldShowSidebarBadge(newVersion, __APP_VERSION__, prefs);

// 1) Collapsed: 햄버거 아이콘 영역
<button onClick={...} className="relative ...">
  <span className="material-symbols-outlined">menu</span>
  {show && <SidebarUpdateBadge newVersion={newVersion} variant="corner" />}
</button>

// 2) Expanded: v{X} 텍스트 옆 (Sidebar.tsx:337 교체)
{!sidebarCollapsed && (
  <p className="text-caption text-sp-muted text-center mt-2">
    v2.0.4
    {show && <SidebarUpdateBadge newVersion={newVersion} variant="inline" />}
  </p>
)}
```

### 4.4 `useNewVersionAvailable` 훅 신설

```typescript
// src/adapters/hooks/useNewVersionAvailable.ts
export function useNewVersionAvailable(): string | null {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    const cleanup = api.onUpdateAvailable((info) => {
      setVersion(info.version);
    });

    return cleanup;
  }, []);

  return version;
}
```

> ⚠️ **주의**: `onUpdateAvailable`은 `UpdateNotification.tsx`에서도 구독한다. Electron preload의 이벤트 리스너가 N개 구독자를 모두 호출하도록 보장되어야 함. preload 구현 점검 필요 (대부분 EventEmitter 패턴이라 다중 구독 가능).

---

## 5. Layer 4 Design — release-notes.json 스키마 + isSecurity 매핑

### 5.1 스키마 확장

`public/release-notes.json`:
```json
{
  "versions": [
    {
      "version": "2.0.6",
      "date": "2026-XX-XX",
      "isSecurity": true,
      "highlights": [...],
      "changes": [...]
    },
    {
      "version": "2.0.5",
      "date": "2026-05-XX",
      "highlights": [...],
      "changes": [...]
    }
    // ... 기존 9개 버전은 isSecurity 필드 없음 (= false로 간주)
  ]
}
```

### 5.2 타입 정의 (`src/global.d.ts` 또는 `UpdateNotification.tsx` 내부)

```typescript
interface VersionNote {
  version: string;
  date: string;
  isSecurity?: boolean;           // ★ 신규 옵션 필드
  highlights: string[];
  changes: ChangeItem[];
}
```

### 5.3 `landing/public/release-notes.json` 동기화

MEMORY.md "Release Workflow Step 2"에 명시된 대로 `public/release-notes.json`과 `landing/public/release-notes.json` 두 파일 모두 갱신. 본 PDCA의 D-09는 **스키마만 정착** — 기존 9개 버전 항목 수정 없음 (Plan §2.1 D-09 명시).

### 5.4 fetchReleaseNotesSince fallback 안전 동작

```typescript
// 현재 동작
const data = await fetchData();
if (!data) return []; // → notes[0]?.isSecurity = undefined → false

// 변경: 네트워크 실패 시 보수적으로 보안 가정
// → 호출자(UpdateNotification)가 빈 배열을 받으면
//   `setIsSecurity(true)`로 처리. release-notes를 못 읽었는데 일반 업데이트로
//   취급해 사용자가 건너뛰는 시나리오를 차단.
```

UpdateNotification 핸들러 보정:
```typescript
const notes = await fetchReleaseNotesSince(currentVersion, updateInfo.version);
const security = notes.length === 0
  ? true  // ★ fetch 실패 시 보수적
  : (notes[0]?.isSecurity ?? false);
setIsSecurity(security);
```

---

## 6. Layer 5 Design — 테스트

### 6.1 단위 테스트 — `useUpdatePreferencesStore.test.ts`

```typescript
describe('useUpdatePreferencesStore', () => {
  beforeEach(() => {
    useUpdatePreferencesStore.getState().reset();
    localStorage.clear();
  });

  it('markNotified updates lastNotifiedVersion', () => {
    useUpdatePreferencesStore.getState().markNotified('2.0.5');
    expect(useUpdatePreferencesStore.getState().lastNotifiedVersion).toBe('2.0.5');
  });

  it('snooze(3) sets snoozeUntil to 3 days from now', () => {
    const before = Date.now();
    useUpdatePreferencesStore.getState().snooze(3);
    const after = useUpdatePreferencesStore.getState().snoozeUntil!;
    expect(after).toBeGreaterThanOrEqual(before + 3 * 86_400_000);
    expect(after).toBeLessThan(before + 3 * 86_400_000 + 1000);
  });

  it('skip adds version uniquely', () => {
    const store = useUpdatePreferencesStore.getState();
    store.skip('2.0.5');
    store.skip('2.0.5'); // 중복 무시
    expect(useUpdatePreferencesStore.getState().skippedVersions).toEqual(['2.0.5']);
  });

  it('unskip removes version', () => {
    const store = useUpdatePreferencesStore.getState();
    store.skip('2.0.5');
    store.unskip('2.0.5');
    expect(useUpdatePreferencesStore.getState().skippedVersions).toEqual([]);
  });

  it('reset returns to initial state', () => {
    const store = useUpdatePreferencesStore.getState();
    store.markNotified('2.0.5');
    store.snooze(1);
    store.skip('2.0.4');
    store.reset();
    expect(useUpdatePreferencesStore.getState()).toMatchObject({
      lastNotifiedVersion: null,
      snoozeUntil: null,
      skippedVersions: [],
    });
  });
});
```

### 6.2 게이팅 테스트 — `shouldShowUpdateModal.test.ts`

```typescript
describe('shouldShowUpdateModal', () => {
  const baseState: UpdatePreferencesState = {
    lastNotifiedVersion: null,
    snoozeUntil: null,
    skippedVersions: [],
  };
  const NOW = 1_700_000_000_000;

  it('shows modal for new version with empty state', () => {
    expect(shouldShowUpdateModal('2.0.5', false, baseState, NOW)).toBe(true);
  });

  it('hides modal when version is in skippedVersions', () => {
    expect(shouldShowUpdateModal('2.0.5', false, {
      ...baseState, skippedVersions: ['2.0.5'],
    }, NOW)).toBe(false);
  });

  it('hides modal when now < snoozeUntil', () => {
    expect(shouldShowUpdateModal('2.0.5', false, {
      ...baseState, snoozeUntil: NOW + 1000,
    }, NOW)).toBe(false);
  });

  it('hides modal when same version already notified', () => {
    expect(shouldShowUpdateModal('2.0.5', false, {
      ...baseState, lastNotifiedVersion: '2.0.5',
    }, NOW)).toBe(false);
  });

  it('FORCE shows modal when isSecurity=true even with all gates', () => {
    expect(shouldShowUpdateModal('2.0.5', true, {
      skippedVersions: ['2.0.5'],
      snoozeUntil: NOW + 86_400_000,
      lastNotifiedVersion: '2.0.5',
    }, NOW)).toBe(true);
  });
});
```

### 6.3 메타 테스트 — `update-notification-persistence.test.ts`

```typescript
// __tests__/regression/update-notification-persistence.test.ts
import { readFileSync } from 'fs';
import path from 'path';

describe('UpdateNotification persistence regression', () => {
  const filePath = path.resolve(__dirname, '../../src/adapters/components/common/UpdateNotification.tsx');
  const source = readFileSync(filePath, 'utf-8');

  it('does NOT contain `useState(false)` for dismissed', () => {
    // dismissed useState 패턴 잔존 차단
    expect(source).not.toMatch(/const\s+\[dismissed,\s*setDismissed\]\s*=\s*useState\(false\)/);
  });

  it('imports useUpdatePreferencesStore', () => {
    expect(source).toMatch(/useUpdatePreferencesStore/);
  });

  it('uses shouldShowUpdateModal gate function', () => {
    expect(source).toMatch(/shouldShowUpdateModal/);
  });
});
```

---

## 7. a11y / i18n / 디자인 토큰 점검 매트릭스

| 항목 | 위치 | 검증 |
|------|------|------|
| `aria-haspopup="menu"` `aria-expanded={open}` | LaterDropdown trigger | ✅ §3.3 |
| `role="menu"` `role="menuitem"` `role="separator"` | LaterDropdown 내부 | ✅ §3.3 |
| 키보드 화살표 네비 (Tab→Enter→Arrow→ESC) | LaterDropdown | ✅ §3.3 (구현 시 화살표 키 핸들러 추가 명시) |
| aria-label 배지 점 | SidebarUpdateBadge | ✅ §4.2 (`새 버전 X 사용 가능`) |
| title 툴팁 hover 안내 | SidebarUpdateBadge | ✅ §4.2 |
| 모달 ESC 닫기 (보안 시에도 허용) | Modal closeOnEsc | ✅ §3.5 (다운로드 중에만 차단) |
| 명도 대비 4.5:1 (sp-* 토큰) | 전 변경 | ✅ sp-accent / amber-400 (보안용) 사용, 라이트 테마 검증 필요 |
| Korean only (i18n 비대상) | 전 카피 | ✅ Plan §2.2 명시 |
| 디자인 토큰만 사용 (하드코딩 금지) | 전 변경 | ✅ `sp-card sp-border sp-accent sp-muted sp-text` |
| amber-400 (보안 강조) | 보안 헤더 | ⚠️ sp-warning 토큰 없음 — 디자인 시스템 확장 또는 amber-* 임시 허용. 본 PDCA에선 amber-400 사용, v2.0.6+에서 sp-warning 토큰화 검토. |

---

## 8. 인수기준(RG) 시나리오 detail

Plan §6의 5개 RG에 대해 재현 절차 + 기대 결과:

### RG-01 — 영속화

**전제**: v2.0.5 사용자가 v2.0.5 → v2.0.6 업데이트 대기
1. 모달이 떠서 [닫기 X] 클릭 → 모달 사라짐
2. 앱 완전 종료 (`Cmd+Q` or 트레이 종료)
3. 앱 재실행 → onUpdateAvailable 재발생
4. **기대**: 모달 안 뜸. 사이드바 v2.0.5 옆 작은 점(•) 노출.

### RG-02 — X/ESC 3일 스누즈

**전제**: RG-01과 동일 환경
1. 모달이 떠서 [X] 클릭 → snoozeUntil = now + 3d
2. 24시간 후 앱 재실행 → onUpdateAvailable 재발생
3. **기대**: 모달 안 뜸 (스누즈 중). 배지도 안 뜸 (스누즈 중 = 사이드바 배지도 침묵).
4. 72시간 + 1분 후 재실행 → **기대**: 모달 재노출 (lastNotifiedVersion === v2.0.6 이지만 스누즈 만료, 게이트 3 통과... 잠깐, lastNotifiedVersion 동일하면 게이트 3에서 막힘?)

> ⚠️ **설계 결함 발견**: 스누즈 만료 후에도 lastNotifiedVersion 게이트가 막아서 모달이 재노출 안 됨. → **해결**: 스누즈 만료 후엔 사이드바 배지로만 노출(현재 설계 그대로). 사용자가 배지 클릭하면 모달 재노출. 자동 재노출 원하면 lastNotifiedVersion을 게이트 3 진입 시점에 clear 해야 하는데, 그러면 무한 루프. **현재 설계 유지: 스누즈 만료 시 배지로만 안내**.

→ Plan RG-03 ("24시간 후 자동 체크에서 모달 재노출")은 **수정 필요**. "24시간 후 사이드바 배지가 다시 노출"로 변경.

### RG-03 — [1일 뒤 다시 알림]

**변경**: "24시간 후 사이드바 배지 재노출. 배지 클릭 시 모달 재호출."

### RG-04 — 이 버전 건너뛰기

1. [나중에 ▾ → 이 버전 건너뛰기] 클릭 → skippedVersions에 v2.0.6 추가
2. 앱 재실행 시 모달도 배지도 안 뜸
3. v2.0.7 릴리즈 후 onUpdateAvailable(v2.0.7) 발생 → **기대**: 모달 노출 (v2.0.7은 skippedVersions에 없음)

### RG-05 — 보안 강제

1. `release-notes.json`에 v2.0.6 `"isSecurity": true` 모의 설정
2. 스토어 상태 `{ skippedVersions: ['2.0.6'], snoozeUntil: now + 7d, lastNotifiedVersion: '2.0.6' }`로 강제
3. onUpdateAvailable(v2.0.6) 발생 → **기대**: 모든 게이트 우회, 🔒 헤더로 모달 강제 노출, [나중에 ▾]에 "이 버전 건너뛰기" 메뉴 항목 없음

### RG-06 (신규) — 배지 클릭 재노출

1. RG-01 상태 (배지 노출 중)
2. 사이드바 v2.0.6 옆 점(•) 클릭
3. **기대**: `ssampin:show-update-modal` 이벤트 발생 → UpdateNotification이 forceShow=true로 모달 재노출. 게이트 무시.

### RG-07 (신규) — Collapsed 사이드바 배지

1. RG-01 상태 + 사이드바 collapsed 토글
2. **기대**: 햄버거 아이콘 우상단 모서리에 점(•) 노출. 클릭 시 RG-06과 동일 동작.

---

## 9. 변경 파일 최종 목록

| 파일 | 변경 유형 | LOC 추정 |
|------|----------|---------|
| `src/adapters/stores/useUpdatePreferencesStore.ts` | 🆕 신규 | ~80 |
| `src/adapters/hooks/useNewVersionAvailable.ts` | 🆕 신규 | ~20 |
| `src/adapters/components/common/UpdateNotification.tsx` | ✏️ 수정 | +60 / -10 |
| `src/adapters/components/common/LaterDropdown.tsx` (분리) | 🆕 신규 | ~80 |
| `src/adapters/components/Layout/Sidebar.tsx` | ✏️ 수정 | +25 |
| `src/adapters/components/Layout/SidebarUpdateBadge.tsx` (분리 또는 inline) | 🆕 신규 (inline 가능) | ~30 |
| `public/release-notes.json` | ✏️ 스키마만 (옵션 필드 추가, 기존 항목 수정 X) | +0 (스키마만) |
| `landing/public/release-notes.json` | ✏️ 동일 미러 | +0 |
| `src/global.d.ts` | ✏️ 타입 추가 | +1 |
| `__tests__/regression/update-notification-persistence.test.ts` | 🆕 신규 | ~30 |
| `src/adapters/stores/useUpdatePreferencesStore.test.ts` | 🆕 신규 | ~80 |
| `src/adapters/components/common/shouldShowUpdateModal.test.ts` | 🆕 신규 | ~80 |

**총 신규 파일 6 + 수정 파일 5 = 11개**

---

## 10. 다음 단계

1. **이 Design 사용자 승인** — §8 RG-02/03 수정안 (스누즈 만료 시 자동 모달 X, 배지로만)·amber-400 임시 사용·이벤트 기반 모달 재호출 방식 확정.
2. **bkit:design-validator** 검증 (Plan/Design 일관성, 특히 RG-03 plan 표현 수정 반영)
3. **Do 단계** — `/pdca do update-notification-controls` 진입.
   - 구현 순서: D-01 스토어 → D-02 스토어 테스트 → D-03~D-05 모달 → D-06 모달 게이팅 테스트 → D-09~D-11 스키마/타입 → D-07~D-08 사이드바 → D-12 메타 테스트
4. **Plan 갱신 사항** (본 design에서 발견):
   - Plan RG-03 표현 수정 ("24시간 후 자동 재노출" → "24시간 후 사이드바 배지 노출 + 클릭 시 재호출")
   - RG-06, RG-07 추가
   - LaterDropdown / SidebarUpdateBadge 분리 컴포넌트 D-04a/D-07a로 deliverable에 추가 검토

---

> **Status**: Draft v0.1 — 사용자 승인 대기 중. 승인 후 `/pdca do update-notification-controls`로 Do 단계 진입.
