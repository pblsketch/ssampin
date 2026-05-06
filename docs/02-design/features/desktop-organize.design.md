# desktop-organize Design Document

> **Summary**: 사용자가 가로×세로 그리드(프리셋 1×3 / 3×1 / 2×2 + 직접 입력 1~6, 합 ≤ 12)로 카테고리 박스를 만들고, native-desktop 모드 위에서 박스 영역에 OS 바탕화면 아이콘을 직접 드래그해 시각적으로 분류하는 신규 위젯 카드 `desktop-organize`를 구현한다. 박스는 시각적 영역만 그리고 아이콘은 추적하지 않는다. Clean Architecture 4-layer 패턴을 준수해 `IDesktopOrganizeRepository` 포트 + `JsonDesktopOrganizeRepository` 어댑터 + `ManageDesktopOrganize` 유스케이스 + `useDesktopOrganizeStore` 스토어로 분리한다.
>
> **Project**: SsamPin
> **Version**: v2.1.x (예정 — native-desktop-mode 안정화 이후)
> **Author**: pblsketch
> **Date**: 2026-05-07
> **Status**: Draft v0.1
> **Planning Doc**: [desktop-organize.plan.md](../../01-plan/features/desktop-organize.plan.md)

### 관련 문서

| 문서 | 경로 | 상태 |
|------|------|------|
| Plan | `docs/01-plan/features/desktop-organize.plan.md` | Draft v0.1 |
| native-desktop-mode PRD | `docs/desktop-icon-underlay-widget-mode-prd.md` | 머지됨 |
| Mockup (HTML) | `mockup/desktop-organize/{view-mode,edit-mode,grid-settings-popover}.html` | bkit:frontend-architect 에이전트 작업 중(2026-05-07) |
| 위젯 레지스트리 | `src/widgets/registry.ts` | 현행 |
| 위젯 카드 컨테이너 | `src/widgets/components/WidgetCard.tsx` | 현행 |
| 위젯 윈도우 | `src/adapters/components/Widget/Widget.tsx` | 현행, **수정 금지** (다른 세션 작업 영역) |
| Settings 엔티티 | `src/domain/entities/Settings.ts:119` (WidgetDesktopMode) | 현행 |
| 참조 패턴 (Repository) | `src/adapters/repositories/JsonBookmarkRepository.ts` | 현행 |

---

## 1. 개요

### 1.1 설계 목표

1. **인프라 비침습**: `electron/main.ts`, `desktopWidgetManager.ts`, `Widget.tsx`는 절대 수정하지 않는다. native-desktop 모드는 다른 세션이 운영 중이므로 본 작업의 변경 영역은 widgets/items, registry, 도메인 타입, 어댑터 신규 파일에만 한정한다.
2. **클린 아키텍처 준수**: 도메인 타입 → 포트(port) → 유스케이스(usecase) → 어댑터(repository + store) 4계층 분리. `BookmarkRepository` 패턴을 그대로 복제해 검증된 영속화 흐름을 사용.
3. **시각 영역 전용 데이터 모델**: 카드는 `{ cols, rows, boxTitles[] }`만 저장한다. 아이콘 위치·소속 박스 매핑은 절대 추적하지 않으며 향후 v2 검토 시에도 별도 PDCA로 분리한다.
4. **클릭 통과 정책 명시화**: native-desktop 모드의 hook 라우팅(LVM_HITTEST → 아이콘=Explorer / 빈공간=widget)을 변경하지 않는다. 카드는 view 모드에서 박스 빈 공간 클릭을 NoOp으로 받기만 하면 된다 (hook 라우팅을 무력화하지 않음).
5. **편집 격리**: 박스 제목 편집·그리드 변경은 위젯 우상단 ✏️ 편집 모드 진입 시에만 활성화. view 모드에서는 어떤 인터랙션도 노출하지 않는다.
6. **데이터 안전**: 그리드 축소 시 잘리는 박스 제목은 사용자 확인 모달 통과 후에만 삭제. 단위 테스트로 보존 로직 강제.

### 1.2 설계 원칙

- **읽기 전용 도메인**: `DesktopOrganizeConfig` 엔티티는 외부 의존 0건의 순수 타입. 검증 로직(`validateGridDimensions`, `resizeGrid`)은 `usecases/desktopOrganize/` 하위 순수 함수.
- **단일 진입점**: 카드는 `ManageDesktopOrganize` 유스케이스 메서드만 호출한다. 직접 Repository를 호출하지 않는다(스토어 내부에서만 한정).
- **Clean Architecture 의존 방향 엄수**:
  - `domain/` ← 모두 (외부 import 0)
  - `usecases/` ← `domain/`만
  - `adapters/` ← `domain/` + `usecases/`
  - `infrastructure/` ← `domain/`만 (포트 구현)
- **registry 중심 등록**: 카드는 `WIDGET_DEFINITIONS` 배열에 1건 추가만으로 노출. 별도 라우팅·전역 분기 로직 추가하지 않음.
- **WidgetInstance 스키마 비변경**: per-card 설정은 `WidgetInstance.settings` 확장이 아니라 별도 store(`useDesktopOrganizeStore`)로 관리. **이유**: `WidgetInstance` 스키마 변경은 22개 위젯 모두에 마이그레이션 영향 → 비용 과다.
- **접근성 우선**: 박스 제목 input WCAG 2.5.5 (≥ 24×24 px touch target), `aria-label`, 키보드 Tab/Enter 동작 보장. `prefers-reduced-motion: reduce` 시 transition 0.

### 1.3 범위 / 비범위

**포함 (Plan §2.1 전량)**

- `desktop-organize` 위젯 카드 컴포넌트 신설 (`src/widgets/items/DesktopOrganize.tsx`)
- 그리드 셀 (`DesktopOrganizeGrid.tsx`), 박스 1개 (`DesktopOrganizeBox.tsx`), 그리드 설정 팝오버 (`DesktopOrganizeGridSettings.tsx`) 분리 컴포넌트
- 도메인 타입 `DesktopOrganizeConfig` 신설
- 유스케이스 `ManageDesktopOrganize` (load/save/setGrid/setTitle/resetTitles/resizeGrid)
- 검증 함수 `validateGridDimensions`, `computeGridResizePlan` (순수 함수, 단위 테스트 강제)
- 포트 `IDesktopOrganizeRepository` (도메인)
- 어댑터 `JsonDesktopOrganizeRepository` (`desktop-organize.json` 영속화)
- DI 컨테이너 등록
- Zustand 스토어 `useDesktopOrganizeStore`
- 그리드 축소 사용자 확인 모달 (`ConfirmGridResizeModal.tsx`)
- 비-Windows OS에서 카드 본문에 "Windows 전용" 안내 표시 (편집은 가능, 동작은 OS 의존)
- 첫 활성화 시 1회성 코치마크 (next 사용자 결정 따라 옵션)
- `useSettingsStore` 변경 0건 (다른 세션 영역)

**제외 (Plan §2.2)**

- 모바일 (`src/mobile/`)
- 아이콘 추적/자동 정렬/스냅
- 박스별 색상·아이콘 커스터마이징
- 다중 인스턴스 (registry id 단일이라 자연 제약)
- `electron/main.ts`, `Widget.tsx`, `desktopWidgetManager.ts` 수정 — **다른 세션 영역**

---

## 2. 아키텍처

### 2.1 컴포넌트 다이어그램

```
[전체 데이터 흐름]

┌──────────────────────────────────────────────────────────────────┐
│  Renderer (React)                                                │
│                                                                  │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │ Widget.tsx (existing — 수정 금지)                       │  │
│   │   ↓ visibleWidgets                                       │  │
│   │ WidgetCard.tsx (existing)                                │  │
│   │   ↓ Component = WIDGET_DEFINITIONS[id].component         │  │
│   │ ┌─────────────────────────────────────────────────────┐ │  │
│   │ │ DesktopOrganize.tsx (NEW)  ← entry point             │ │  │
│   │ │   - useDesktopOrganizeStore() — config 구독         │ │  │
│   │ │   - WidgetEditModeContext 또는 prop으로 isEditMode  │ │  │
│   │ │     수신 (현재 props로 전달 — WidgetCard는 isEditMode│ │  │
│   │ │     prop을 사용하지 않으므로 별도 구독)              │ │  │
│   │ │ ┌─────────────────────────────────────────────────┐ │ │  │
│   │ │ │ DesktopOrganizeGrid.tsx (NEW)                   │ │ │  │
│   │ │ │   - cols × rows CSS Grid                        │ │ │  │
│   │ │ │   - 박스 N개 렌더                               │ │ │  │
│   │ │ │ ┌───────────────────────────────────────┐       │ │ │  │
│   │ │ │ │ DesktopOrganizeBox.tsx (NEW)          │       │ │ │  │
│   │ │ │ │   - 제목 (view: span / edit: input)   │       │ │ │  │
│   │ │ │ │   - 빈 영역 (NoOp)                    │       │ │ │  │
│   │ │ │ └───────────────────────────────────────┘       │ │ │  │
│   │ │ └─────────────────────────────────────────────────┘ │ │  │
│   │ │ ┌─────────────────────────────────────────────────┐ │ │  │
│   │ │ │ DesktopOrganizeGridSettings.tsx (NEW, popover)  │ │ │  │
│   │ │ │   - 프리셋 3종 + 직접 입력 + 미리보기            │ │ │  │
│   │ │ │   - 잘리는 박스 경고 → ConfirmGridResizeModal    │ │ │  │
│   │ │ └─────────────────────────────────────────────────┘ │ │  │
│   │ └─────────────────────────────────────────────────────┘ │  │
│   └──────────────────────────────────────────────────────────┘  │
│              │                                                   │
│              ▼                                                   │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │ useDesktopOrganizeStore.ts (Zustand, NEW)               │  │
│   │   state: DesktopOrganizeConfig | null                    │  │
│   │   actions: load, setGrid(cols,rows,plan), setTitle, ...  │  │
│   │   ↓ 모든 액션은 ManageDesktopOrganize 호출              │  │
│   └──────────────────────────────────────────────────────────┘  │
│              │                                                   │
└──────────────┼───────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────┐
│  Application (usecases/desktopOrganize/)                         │
│   - ManageDesktopOrganize.ts (NEW)                               │
│   - validateGridDimensions.ts (NEW, pure)                        │
│   - computeGridResizePlan.ts (NEW, pure)                         │
└──────────────────────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────┐
│  Domain (도메인)                                                 │
│   - entities/DesktopOrganizeConfig.ts (NEW)                      │
│   - repositories/IDesktopOrganizeRepository.ts (NEW)             │
└──────────────────────────────────────────────────────────────────┘
               ▲
               │ implements
┌──────────────────────────────────────────────────────────────────┐
│  Infrastructure (간접) / Adapters                                │
│   - adapters/repositories/JsonDesktopOrganizeRepository.ts (NEW) │
│      → IStoragePort 사용 (기존 ElectronStorageAdapter/Local)     │
│   - adapters/di/container.ts (수정 1줄: repository 등록)         │
│   - infrastructure/storage/* (변경 0)                            │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 데이터 / 제어 흐름

```
[시나리오 1: 카드 첫 활성화 — config 없음 → 기본값 생성]

User adds desktop-organize widget via 위젯 편집 패널
   ▼
useDashboardConfig가 visibleWidgets에 추가
   ▼
WidgetCard renders DesktopOrganize.tsx
   ▼
DesktopOrganize.useEffect → useDesktopOrganizeStore.load()
   ▼
ManageDesktopOrganize.load() → repository.load()
   ▼
JsonDesktopOrganizeRepository.load()
   ├─ IStoragePort.read('desktop-organize.json')
   ├─ 없으면 → null 반환
   └─ ManageDesktopOrganize → 기본값 적용 (cols=3, rows=1, titles=['카테고리 1','2','3'])
       └─ repository.save() (영속화)
           ▼
store.set({ config: defaultConfig })
   ▼
DesktopOrganizeGrid 렌더 (1×3 박스 3개)

[시나리오 2: 사용자 박스 제목 편집]

User clicks ✏️ 편집 모드 (Widget.tsx)  ← 다른 세션 영역, 변경 X
   ▼
WidgetGrid → WidgetCard → DesktopOrganize에 isEditMode=true 전달
   ▼
사용자가 박스 제목 더블클릭 (or 펜 아이콘 클릭)
   ▼
DesktopOrganizeBox: <span> → <input> 전환, autoFocus
   ▼
사용자 타이핑 + Enter / Blur
   ▼
DesktopOrganize → store.setTitle(boxIndex, newTitle)
   ▼
ManageDesktopOrganize.setTitle(idx, title)
   ├─ 길이 검증 (≤ 20자, 트림)
   ├─ config 갱신
   └─ repository.save() (영속화)
       ▼
store.set({ config: updated }) → 리렌더

[시나리오 3: 그리드 변경 (3×1 → 2×2 = 셀 +1)]

User clicks ⚙️ 버튼 in DesktopOrganize 헤더 (편집 모드)
   ▼
DesktopOrganizeGridSettings 팝오버 노출
   ▼
User clicks [2×2] 프리셋
   ▼
computeGridResizePlan({ from: {3,1,['A','B','C']}, to: {2,2} })
   ├─ newSize=4, oldSize=3 → 확장 (잘림 없음)
   ├─ keepTitles = ['A','B','C']
   ├─ newSlots = 1 (placeholder='카테고리 4')
   └─ truncated = [] (빈)
       ▼
잘림 없으면 즉시 적용 → store.setGrid(2,2,plan)
   ▼
ManageDesktopOrganize.setGrid → repository.save → store 갱신

[시나리오 4: 그리드 축소 (3×2=6 → 2×1=2 = 셀 -4)]

User clicks ⚙️ → 직접 입력 [2 × 1]
   ▼
computeGridResizePlan({ from: {3,2,['A',..,'F']}, to: {2,1} })
   ├─ newSize=2, oldSize=6 → 축소
   ├─ keepTitles = ['A','B'] (앞 2개)
   ├─ truncated = [{idx:2,title:'C'},..,{idx:5,title:'F'}]
   └─ truncated.length > 0 → 사용자 확인 필요
       ▼
ConfirmGridResizeModal: "박스 3,4,5,6 ('C','D','E','F')의 제목이 사라집니다. 계속할까요?"
   │
   ├─ [취소] → 그리드 미변경, 팝오버 닫기
   └─ [확인] → store.setGrid(2,1,plan) → repository.save
                토스트 "되돌리기 (5초)" 노출 → 클릭 시 이전 config 복원
```

### 2.3 의존성 / 새 파일 목록

| 파일 | 신규/수정 | 책임 |
|------|----------|------|
| `src/domain/entities/DesktopOrganizeConfig.ts` | NEW | `{ cols, rows, boxTitles[] }` 순수 타입 |
| `src/domain/repositories/IDesktopOrganizeRepository.ts` | NEW | Repository 포트 인터페이스 |
| `src/usecases/desktopOrganize/ManageDesktopOrganize.ts` | NEW | load/save/setGrid/setTitle 유스케이스 |
| `src/usecases/desktopOrganize/validateGridDimensions.ts` | NEW | 1~6, 합 ≤ 12 검증 순수 함수 |
| `src/usecases/desktopOrganize/computeGridResizePlan.ts` | NEW | 그리드 변경 시 제목 보존/잘림 계산 순수 함수 |
| `src/usecases/desktopOrganize/__tests__/*.test.ts` | NEW | 검증/리사이즈 단위 테스트 (≥ 12개) |
| `src/adapters/repositories/JsonDesktopOrganizeRepository.ts` | NEW | IStoragePort 기반 영속화 (`desktop-organize.json`) |
| `src/adapters/stores/useDesktopOrganizeStore.ts` | NEW | Zustand 스토어 — UI ↔ 유스케이스 |
| `src/adapters/di/container.ts` | 수정 (3줄) | Repository 인스턴스 등록 + export |
| `src/widgets/items/DesktopOrganize.tsx` | NEW | 카드 entry point — store 구독 + edit mode 처리 |
| `src/widgets/items/DesktopOrganize/DesktopOrganizeGrid.tsx` | NEW | CSS Grid 렌더 |
| `src/widgets/items/DesktopOrganize/DesktopOrganizeBox.tsx` | NEW | 박스 1개 (제목 + 빈 영역) |
| `src/widgets/items/DesktopOrganize/DesktopOrganizeGridSettings.tsx` | NEW | ⚙️ 팝오버 (프리셋 + 직접 입력) |
| `src/widgets/items/DesktopOrganize/ConfirmGridResizeModal.tsx` | NEW | 축소 확인 모달 |
| `src/widgets/items/DesktopOrganize/usePlatformGuard.ts` | NEW (옵션) | Windows 외 OS에서 안내 노출 헬퍼 |
| `src/widgets/registry.ts` | 수정 (1건 추가) | `desktop-organize` WidgetDefinition |
| `mockup/desktop-organize/{view,edit,grid-settings-popover}.html` | NEW | bkit:frontend-architect 산출물 |

**수정 금지 (다른 세션 영역)**:
- `electron/main.ts`
- `electron/desktopWidgetManager.ts`
- `electron/platform/win32Desktop.ts`
- `electron/preload.ts`
- `src/adapters/components/Widget/Widget.tsx`
- `src/adapters/components/Widget/WidgetContextMenu.tsx`
- `src/adapters/components/Settings/tabs/WidgetTab.tsx`
- `src/domain/entities/Settings.ts`

---

## 3. 데이터 모델

### 3.1 도메인 엔티티

```typescript
// src/domain/entities/DesktopOrganizeConfig.ts
// 외부 의존 0건 — 순수 타입

/** 그리드 한 변의 칸 수 (1 ~ 6) */
export type GridDimension = 1 | 2 | 3 | 4 | 5 | 6;

/** 박스 제목 (빈 문자열 허용, ≤ 20자) */
export type BoxTitle = string;

/** desktop-organize 카드의 영속 설정 */
export interface DesktopOrganizeConfig {
  /** 가로 칸 수 */
  readonly cols: GridDimension;
  /** 세로 칸 수 */
  readonly rows: GridDimension;
  /**
   * 박스 제목 배열 — 길이는 정확히 cols * rows.
   * 인덱스 순서는 row-major (왼→오, 위→아래).
   * 예) cols=3, rows=2 → [box00, box01, box02, box10, box11, box12]
   */
  readonly boxTitles: readonly BoxTitle[];
  /** 마지막 수정 시각 (ISO 8601) */
  readonly lastModified: string;
}

/** 박스 제목 placeholder (빈 문자열 표시용) */
export const DEFAULT_BOX_TITLE_PREFIX = '카테고리';

/** 기본 카드 설정 (첫 활성화 시) */
export const DEFAULT_DESKTOP_ORGANIZE_CONFIG: DesktopOrganizeConfig = {
  cols: 3,
  rows: 1,
  boxTitles: ['수업', '학급', '업무'],
  lastModified: new Date(0).toISOString(),
};

/** 박스 제목 길이 상한 */
export const MAX_BOX_TITLE_LENGTH = 20;

/** 그리드 셀 합산 상한 */
export const MAX_GRID_CELLS = 12;

/** 그리드 한 변 상한 */
export const MAX_GRID_DIMENSION: GridDimension = 6;
```

### 3.2 Repository 포트

```typescript
// src/domain/repositories/IDesktopOrganizeRepository.ts

import type { DesktopOrganizeConfig } from '@domain/entities/DesktopOrganizeConfig';

export interface IDesktopOrganizeRepository {
  /** 저장된 설정 로드. 없으면 null */
  load(): Promise<DesktopOrganizeConfig | null>;
  /** 설정 저장 (덮어쓰기) */
  save(config: DesktopOrganizeConfig): Promise<void>;
}
```

### 3.3 Storage 스키마

영속화 파일: `<userData>/data/desktop-organize.json`

```json
{
  "cols": 3,
  "rows": 2,
  "boxTitles": ["1교시", "2교시", "3교시", "오늘 결재", "내일 회의", "완료"],
  "lastModified": "2026-05-07T12:34:56.789Z"
}
```

마이그레이션 정책:
- v0 → v1: 첫 도입이라 마이그레이션 없음
- 향후 v2 (아이콘 추적 추가 시): 별도 PDCA, 별도 파일로 분리하여 본 파일 스키마 비변경 보장

### 3.4 Zustand 스토어 상태

```typescript
// src/adapters/stores/useDesktopOrganizeStore.ts

interface DesktopOrganizeState {
  config: DesktopOrganizeConfig | null;
  isLoading: boolean;
  /** 가장 최근 적용된 그리드 변경 이전 상태 (5초 undo 윈도우) */
  undoSnapshot: DesktopOrganizeConfig | null;
  undoExpiresAt: number | null;

  load: () => Promise<void>;
  setTitle: (boxIndex: number, title: string) => Promise<void>;
  setGrid: (cols: GridDimension, rows: GridDimension, plan: GridResizePlan) => Promise<void>;
  resetTitles: () => Promise<void>;
  undo: () => Promise<void>;
}
```

`config = null` → 미로드 상태. UI는 skeleton 또는 빈 그리드 placeholder를 노출.

### 3.5 GridResizePlan (순수 타입)

```typescript
// src/usecases/desktopOrganize/computeGridResizePlan.ts (export 타입)

export interface GridResizePlan {
  readonly from: { cols: number; rows: number; titles: readonly string[] };
  readonly to: { cols: GridDimension; rows: GridDimension };
  /** 변경 후 newSize 길이의 제목 배열 (앞쪽은 보존, 뒤쪽은 placeholder) */
  readonly nextTitles: readonly string[];
  /** 잘리는 박스 [{ index, title }] (빈 배열이면 잘림 없음) */
  readonly truncated: ReadonlyArray<{ index: number; title: string }>;
}

export function computeGridResizePlan(input: {
  from: { cols: number; rows: number; titles: readonly string[] };
  to: { cols: GridDimension; rows: GridDimension };
}): GridResizePlan;
```

규칙:
- `oldSize = from.cols * from.rows`, `newSize = to.cols * to.rows`
- `nextTitles[i] = i < oldSize ? from.titles[i] : '카테고리 ' + (i + 1)` (i < newSize)
- `truncated = oldSize > newSize ? from.titles.slice(newSize).map(...)` else `[]`
- 빈 제목(`''`)은 truncated에 포함하지 않음 (사용자 입력하지 않은 placeholder는 안내 불필요)

---

## 4. UI/UX 설계

### 4.1 화면 위계

```
WidgetWindow (Widget.tsx — 수정 X)
└─ WidgetGrid
   └─ WidgetCard (기존 컨테이너)
      └─ DesktopOrganize.tsx ─┐
         ├─ Header             │ 카드 자체 헤더 — sp-card 배경
         │  ├─ "📌 바탕화면 정리"
         │  └─ ⚙️ 그리드 설정 (편집 모드만)
         └─ DesktopOrganizeGrid
            └─ DesktopOrganizeBox × N   ← cols × rows 셀
               ├─ 제목 (view: span / edit: input)
               └─ 빈 영역 (NoOp / view) or 펜 아이콘 hover (edit)
      [팝오버 — 카드 외부, fixed positioned]
      └─ DesktopOrganizeGridSettings (편집 모드 + ⚙️ 클릭 시)
         ├─ 프리셋 [1×3] [3×1] [2×2]
         ├─ 직접 입력 [n × m]
         ├─ 미리보기 "→ N칸 생성"
         ├─ (조건부) 잘림 경고
         └─ [취소] [적용]
      [모달 — 카드 외부, body 직속 portal]
      └─ ConfirmGridResizeModal (잘림 발생 시만)
```

### 4.2 view 모드 vs 편집 모드

| 요소 | view 모드 | 편집 모드 (✏️ ON) |
|------|-----------|---------------------|
| 박스 제목 | `<span class="text-sm font-bold">` | `<input>` (autoFocus 시 활성, 그 외 hover시 펜 아이콘 노출 → 클릭/더블클릭으로 input 전환) |
| 박스 빈 영역 | NoOp (CSS `pointer-events: none` 미사용 — hook 라우팅 그대로) | NoOp (편집 모드도 마찬가지) |
| ⚙️ 버튼 | 숨김 | 노출 |
| 카드 헤더 안내 | "📌 바탕화면 정리" | "✏️ 편집 중 — 박스 제목/그리드 변경 가능" |
| 박스 hover 효과 | `hover:bg-sp-card/50` 미세하게만 | `hover:ring-1 hover:ring-sp-accent/50` |
| 박스 외곽 | `border border-sp-border` | `border border-sp-border ring-2 ring-sp-accent/20` (편집 모드 표시) |

### 4.3 isEditMode 전달 경로

`Widget.tsx`의 `isEditMode` 상태(`useState<boolean>`)는 현재 `WidgetCard`에 prop으로 직접 전달되지 않는다. 두 가지 옵션:

**옵션 A (선택)** — `WidgetCard` props에 `isEditMode?: boolean` 추가하지 않고, `WidgetGrid`(편집 모드용 컴포넌트)와 일반 모드를 구분하는 기존 분기를 그대로 둔다. 그리고 `DesktopOrganize`는 자체적으로 위젯 윈도우의 편집 모드 상태를 알 수 없으므로:
1. `Widget.tsx`의 isEditMode를 `useDashboardConfig` 내부에 저장 → store로 노출하는 방식 — `Widget.tsx` 수정 필요 → **금지** (다른 세션 영역)
2. 카드 자체의 ⋯ 메뉴로 "편집 모드 진입" 토글 → 본 카드 전용 편집 모드 — `Widget.tsx` 비건드림 → **선택**

**옵션 B (rejected)** — `Widget.tsx`의 isEditMode를 props로 전달 (`WidgetCard` 수정 필요)

**선택: 옵션 A — 카드 자체 편집 모드 토글**

`DesktopOrganize` 헤더에 ⚙️ 옆에 ✏️ 토글 버튼을 두고, 카드 자체 편집 상태(`useState`)를 가진다. 이렇게 하면 `Widget.tsx`/`WidgetCard` 비건드림 + 사용자에게도 "이 카드의 편집은 카드 자체에서" 일관된 멘탈 모델이 된다.

→ 헤더 우상단: `[✏️] [⚙️]` 두 버튼. ✏️ ON → 박스 제목 input 활성, ⚙️ 활성. ✏️ OFF → 모두 비활성, ⚙️ 숨김.

### 4.4 그리드 설정 팝오버 (DesktopOrganizeGridSettings)

위치: ⚙️ 버튼 우측 아래로 `top: btnRect.bottom + 4, right: viewport.right - btnRect.right` 절대 위치. 카드 outside (body portal). 너비 280 px, `rounded-xl`, `bg-sp-card`, `border border-sp-border`, `shadow-2xl`.

내용 (HTML 구조):

```jsx
<div className="w-[280px] rounded-xl bg-sp-card border border-sp-border shadow-2xl p-4">
  <h3 className="text-sm font-bold text-sp-text mb-3">그리드 구성</h3>

  <div className="grid grid-cols-3 gap-2 mb-3">
    <PresetButton label="1×3" cols={1} rows={3} />
    <PresetButton label="3×1" cols={3} rows={1} />
    <PresetButton label="2×2" cols={2} rows={2} />
  </div>

  <hr className="border-sp-border/50 my-3" />

  <p className="text-xs text-sp-muted mb-2">직접 설정</p>
  <div className="flex items-center gap-2 mb-2">
    <NumberInput value={cols} min={1} max={6} onChange={...} />
    <span className="text-sp-muted">×</span>
    <NumberInput value={rows} min={1} max={6} onChange={...} />
  </div>
  <p className="text-xs text-sp-muted">→ {cols * rows}칸 생성</p>

  {/* 합 > 12 가드 */}
  {cols * rows > 12 && (
    <p className="text-xs text-red-400 mt-2">최대 12칸까지 만들 수 있어요</p>
  )}

  {/* 잘림 경고 (computeGridResizePlan 결과) */}
  {plan.truncated.length > 0 && (
    <div className="mt-3 p-2 rounded-lg bg-red-500/10 border border-red-500/30">
      <p className="text-xs text-red-300">
        박스 {plan.truncated.map(t => t.index + 1).join(',')}의 제목이 사라집니다
      </p>
    </div>
  )}

  <div className="flex gap-2 mt-4">
    <button className="flex-1 px-3 py-2 rounded-lg text-sp-muted hover:text-sp-text">취소</button>
    <button className="flex-1 px-3 py-2 rounded-lg bg-sp-accent text-white"
      disabled={cols * rows > 12 || cols < 1 || rows < 1}>
      적용
    </button>
  </div>
</div>
```

`prefers-reduced-motion: reduce` 시 enter/exit transition 0.

### 4.5 ConfirmGridResizeModal

잘림이 발생할 때만 [적용] 클릭 → 이 모달이 뜬다. body portal, backdrop blur. 기존 `Modal.tsx`(focus-trap-react 기반) 컴포넌트 재사용 — 메모리에 따르면 v1 60→v3 90/100까지 정착된 디자인 시스템.

내용:

```jsx
<Modal isOpen onClose={cancel} title="그리드 변경 확인">
  <p className="text-sm text-sp-text mb-3">
    그리드를 {fromCols}×{fromRows}에서 {toCols}×{toRows}로 줄이면 다음 박스의 제목이 사라집니다:
  </p>
  <ul className="text-sm text-sp-muted mb-4 space-y-1">
    {truncated.map(t => <li>• 박스 {t.index + 1}: "{t.title}"</li>)}
  </ul>
  <div className="flex justify-end gap-2">
    <button onClick={cancel} className="px-4 py-2 rounded-lg text-sp-muted">취소</button>
    <button onClick={confirm} className="px-4 py-2 rounded-lg bg-red-500 text-white">계속</button>
  </div>
</Modal>
```

확인 → store.setGrid 실행 → 5초 undo 토스트 노출.

### 4.6 비-Windows OS 안내

`process.platform !== 'win32'`인 경우 (renderer에서는 `navigator.platform` 또는 `window.electronAPI.platform()` IPC 활용):

```jsx
{!isWindows && (
  <div className="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-sp-highlight/10 border border-sp-highlight/30">
    <p className="text-xs text-sp-highlight">Windows 전용 기능 — 그리드 설정만 가능</p>
  </div>
)}
```

그리드 설정·제목 편집·영속화는 동작하되, 박스 위로 아이콘이 안 깔리는 게 자연스러우므로 안내만 노출.

### 4.7 1회성 코치마크

처음 카드를 추가했을 때(`config === null` && first session detection):

```
"박스 위에 바탕화면 아이콘을 직접 드래그해 정리하세요"
"박스 그 자체가 아이콘을 자동 정렬하지는 않아요"
[알겠어요] (5초 자동 dismiss)
```

위치: 카드 바닥 중앙. dismiss 후 `localStorage.setItem('desktop-organize:coach-shown', '1')`.

---

## 5. Clean Architecture 적용

### 5.1 Layer Assignment

| Layer | Responsibility | This Feature |
|-------|---------------|--------------|
| **Domain** | 순수 타입, 외부 의존 0 | `DesktopOrganizeConfig`, `IDesktopOrganizeRepository`, 상수 |
| **Application (usecases)** | 도메인만 import | `ManageDesktopOrganize`, `validateGridDimensions`, `computeGridResizePlan` |
| **Adapters** | domain + usecases import. UI / store / Repository 구현 | `useDesktopOrganizeStore`, `JsonDesktopOrganizeRepository`, `DesktopOrganize.tsx` 등 |
| **Infrastructure** | domain port 구현. 외부 기술 (변경 0) | 기존 `ElectronStorageAdapter` / `LocalStorageAdapter` 재사용 |

### 5.2 Import Rules 검증

```
src/domain/entities/DesktopOrganizeConfig.ts
  → import: (none)

src/domain/repositories/IDesktopOrganizeRepository.ts
  → import: @domain/entities/DesktopOrganizeConfig ✅

src/usecases/desktopOrganize/ManageDesktopOrganize.ts
  → import: @domain/entities/DesktopOrganizeConfig
            @domain/repositories/IDesktopOrganizeRepository
            ./computeGridResizePlan
            ./validateGridDimensions ✅
  → 금지: @adapters/*, @infrastructure/*

src/adapters/repositories/JsonDesktopOrganizeRepository.ts
  → import: @domain/entities/DesktopOrganizeConfig
            @domain/repositories/IDesktopOrganizeRepository
            @domain/ports/IStoragePort ✅

src/adapters/stores/useDesktopOrganizeStore.ts
  → import: @adapters/di/container (useCase factory)
            @usecases/desktopOrganize/ManageDesktopOrganize
            @domain/entities/DesktopOrganizeConfig
            zustand ✅

src/widgets/items/DesktopOrganize.tsx
  → import: @adapters/stores/useDesktopOrganizeStore
            @widgets/types
            @usecases/desktopOrganize/computeGridResizePlan (Plan 타입 노출용)
            ./DesktopOrganize/* ✅
```

### 5.3 Registry 등록

```typescript
// src/widgets/registry.ts (수정 — 1건 추가)

import { DesktopOrganize } from './items/DesktopOrganize/DesktopOrganize';

// WIDGET_DEFINITIONS 배열 안에 추가:
{
  id: 'desktop-organize',
  name: '바탕화면 정리',
  icon: '📌',
  description: '바탕화면 아이콘을 카테고리 박스로 정리합니다 (Windows 전용)',
  category: 'admin',
  defaultSize: { w: 4, h: 6 },
  minSize: { w: 2, h: 3 },
  availableFor: {
    schoolLevel: ['elementary', 'middle', 'high', 'custom'],
    role: ['homeroom', 'subject', 'admin'],
  },
  component: DesktopOrganize,
  // navigateTo / navigateLabel: 없음 — 카드 클릭 시 페이지 전환 없음
},
```

---

## 6. 컨벤션 적용

### 6.1 Naming

| 대상 | 규칙 | 예 |
|------|------|-----|
| 컴포넌트 | PascalCase | `DesktopOrganize`, `DesktopOrganizeBox` |
| 함수 | camelCase | `computeGridResizePlan`, `validateGridDimensions` |
| 상수 | UPPER_SNAKE_CASE | `MAX_BOX_TITLE_LENGTH`, `DEFAULT_DESKTOP_ORGANIZE_CONFIG` |
| 타입/인터페이스 | PascalCase | `DesktopOrganizeConfig`, `GridResizePlan` |
| 파일(컴포넌트) | PascalCase.tsx | `DesktopOrganize.tsx` |
| 파일(유틸/유스케이스) | camelCase.ts (유스케이스는 PascalCase 클래스 규약 준수) | `validateGridDimensions.ts`, `ManageDesktopOrganize.ts` |
| 폴더 | kebab-case 또는 camelCase (기존 프로젝트 관습 따름 — `usecases/desktopOrganize/`) | `desktopOrganize/`, `widgets/items/DesktopOrganize/` |

### 6.2 Tailwind 클래스 정책

- 라운딩: `rounded-xl`(카드 frame), `rounded-2xl`(박스), `rounded-lg`(버튼/입력) — `rounded-sp-*` 0건
- 색상: `sp-card`, `sp-border`, `sp-accent`, `sp-highlight`, `sp-text`, `sp-muted`만 (하드코딩 hex 0건)
- 박스 배경: `bg-sp-card/40` (alpha 40%)
- transition: `transition-colors duration-150` 기본
- `prefers-reduced-motion: reduce` 시 `motion-reduce:transition-none`

### 6.3 Import 순서

```typescript
// 1. External
import { useState, useEffect } from 'react';
import { create } from 'zustand';

// 2. Internal absolute (domain → usecases → adapters → widgets 순)
import type { DesktopOrganizeConfig } from '@domain/entities/DesktopOrganizeConfig';
import { validateGridDimensions } from '@usecases/desktopOrganize/validateGridDimensions';
import { useDesktopOrganizeStore } from '@adapters/stores/useDesktopOrganizeStore';

// 3. Relative
import { DesktopOrganizeBox } from './DesktopOrganizeBox';

// 4. Type imports
import type { GridResizePlan } from '@usecases/desktopOrganize/computeGridResizePlan';
```

### 6.4 환경 변수

추가 환경 변수 없음.

---

## 7. 구현 가이드

### 7.1 파일 구조

```
src/
├── domain/
│   ├── entities/
│   │   └── DesktopOrganizeConfig.ts             [NEW]
│   └── repositories/
│       └── IDesktopOrganizeRepository.ts        [NEW]
├── usecases/
│   └── desktopOrganize/
│       ├── ManageDesktopOrganize.ts             [NEW]
│       ├── validateGridDimensions.ts            [NEW]
│       ├── computeGridResizePlan.ts             [NEW]
│       └── __tests__/
│           ├── validateGridDimensions.test.ts   [NEW]
│           ├── computeGridResizePlan.test.ts    [NEW]
│           └── ManageDesktopOrganize.test.ts    [NEW]
├── adapters/
│   ├── di/
│   │   └── container.ts                          [MODIFY +3 lines]
│   ├── repositories/
│   │   └── JsonDesktopOrganizeRepository.ts      [NEW]
│   └── stores/
│       └── useDesktopOrganizeStore.ts            [NEW]
└── widgets/
    ├── registry.ts                               [MODIFY +1 entry]
    └── items/
        └── DesktopOrganize/
            ├── DesktopOrganize.tsx               [NEW] (entry point)
            ├── DesktopOrganizeGrid.tsx           [NEW]
            ├── DesktopOrganizeBox.tsx            [NEW]
            ├── DesktopOrganizeGridSettings.tsx   [NEW]
            ├── ConfirmGridResizeModal.tsx        [NEW]
            ├── PresetButton.tsx                  [NEW]
            ├── NumberInput.tsx                   [NEW]
            └── usePlatformGuard.ts               [NEW]

mockup/
└── desktop-organize/
    ├── view-mode.html                            [NEW — agent]
    ├── edit-mode.html                            [NEW — agent]
    └── grid-settings-popover.html                [NEW — agent]
```

### 7.2 구현 순서 (4 Phase)

#### Phase A — 도메인 + 유스케이스 + 단위 테스트 (~0.5일)

순수 함수와 타입만 — UI 의존 0.

1. `DesktopOrganizeConfig.ts` (타입 + 상수)
2. `IDesktopOrganizeRepository.ts`
3. `validateGridDimensions.ts` + 단위 테스트 (5+ 케이스: 1~6 범위, 합 ≤ 12, 0/-1/7 등 경계)
4. `computeGridResizePlan.ts` + 단위 테스트 (7+ 케이스: 확장/축소/동일 크기/빈 제목 처리/잘림 인덱스)
5. `ManageDesktopOrganize.ts` + 단위 테스트 (Repository mock으로 load/save/setTitle/setGrid 흐름)

`npm run typecheck` + `npm run test` 통과 확인.

#### Phase B — Repository + Store + DI (~0.3일)

영속화 흐름.

1. `JsonDesktopOrganizeRepository.ts` (IStoragePort 사용, BookmarkRepository 패턴 그대로)
2. `container.ts` 등록 (3줄: import / instance / export)
3. `useDesktopOrganizeStore.ts` (Zustand store, undo 스냅샷 포함)

`npm run typecheck` 통과. 카드 컴포넌트 없이도 store가 단독으로 영속화 가능한지 콘솔로 sanity 체크 (`useDesktopOrganizeStore.getState().load()`).

#### Phase C — UI 컴포넌트 (~0.6일)

mockup HTML 결과 반영.

1. `DesktopOrganizeBox.tsx` (제목 + 빈 영역, isEditMode 분기)
2. `DesktopOrganizeGrid.tsx` (CSS Grid 레이아웃)
3. `PresetButton.tsx`, `NumberInput.tsx` (소형 컴포넌트)
4. `DesktopOrganizeGridSettings.tsx` (팝오버 — body portal, 외부 클릭 시 닫기, ESC dismiss)
5. `ConfirmGridResizeModal.tsx` (기존 `Modal.tsx` 재사용)
6. `usePlatformGuard.ts` (Windows 외 안내)
7. `DesktopOrganize.tsx` (entry — store 구독, 자체 편집 모드 토글, 1회성 코치마크)
8. `widgets/registry.ts` 등록

브라우저 모드(`npm run dev`) + Electron 모드(`npm run electron:dev`) 양쪽에서 카드 추가 → 그리드 변경 → 제목 편집 → 영속화 검증.

#### Phase D — 회귀 시나리오 + 디자인 polish (~0.3일)

1. RG-01 ~ RG-06 수동 체크 (Plan §5.3)
2. native-desktop 모드에서 박스 빈 공간 클릭이 hook 라우팅을 거쳐 widget으로 도달하는지 확인 (NoOp 정책 검증)
3. 디자인 일관성 — 라운딩, sp-* 토큰, hover 효과 미세 조정
4. `prefers-reduced-motion` 동작 확인
5. release-notes.json v2.1.x 임시 항목 추가
6. 챗봇 KB Q&A 5+건 초안 작성

### 7.3 의존성 설치

추가 npm 패키지 없음. 기존 zustand, focus-trap-react, react만 사용.

---

## 8. 테스트 계획

### 8.1 단위 테스트 (Vitest)

| 파일 | 케이스 수 | 검증 항목 |
|------|-----------|-----------|
| `validateGridDimensions.test.ts` | ≥ 5 | 1~6 범위, 합 ≤ 12, 0/-1/7/12.5 거부, 정상 케이스 통과 |
| `computeGridResizePlan.test.ts` | ≥ 7 | 확장(잘림 0), 축소(잘림 N), 동일 크기, 빈 제목 처리, 인덱스 정확성, 1×1 → 6×6, 비대칭 변경 |
| `ManageDesktopOrganize.test.ts` | ≥ 6 | load 첫 실행 (null → default), save round-trip, setTitle 길이 검증, setGrid plan 적용, 동시 호출 race |

### 8.2 회귀 시나리오 (수동)

Plan §5.3 RG-01 ~ RG-06 (총 6건). 각 시나리오는 다음 두 환경에서 검증:
- 브라우저(`npm run dev`): localStorage 폴백
- Electron(`npm run electron:dev`): userData JSON

### 8.3 native-desktop 호환 검증 (Windows 실기, 옵션)

native-desktop 모드 실기 환경(다른 세션 검증 항목)이 가능하면:
- desktop-organize 카드 활성 + native-desktop ON
- 박스 빈 공간 클릭 → hook이 widget으로 라우팅 → 카드 NoOp (오류·소비 없이 통과)
- 박스 위에 실제 바탕화면 아이콘 hover → 시각적 위계 확인 (아이콘 ON TOP)
- 박스 위 아이콘 단일 클릭 → Explorer 처리 (파일 열림)

### 8.4 접근성 검증

- `<input>` aria-label "박스 N 제목"
- 키보드 Tab으로 박스 제목 순회
- Enter → 다음 박스로 포커스 이동 (Shift+Enter → 이전)
- ESC → 편집 취소 (이전 값 복원)
- `prefers-reduced-motion: reduce` 미디어 쿼리 시 transition 0

---

## 9. 위험 및 완화

| 위험 | 영향도 | 발생 가능성 | 완화 |
|------|--------|-------------|------|
| 다른 세션 native-desktop 머지 충돌 | High | Low | 변경 영역 격리(`widgets/`, `usecases/`, 신규 stores·repos만). `Widget.tsx`, `electron/main.ts`, `Settings.ts` 비건드림. PR 생성 직전 git rebase로 latest main 흡수 후 재검증 |
| 클릭 통과 정책 위반 — 박스에 onClick 핸들러를 추가해 hook 라우팅이 차단되는 회귀 | High | Medium | 박스 컴포넌트에 onClick 추가 금지 명시 주석 + 회귀 테스트 RG-04 강제. `pointer-events: none`은 사용하지 않음 (편집 모드에서 input 클릭 보존) |
| 그리드 변경 중 race — store에서 setGrid 실행 중 사용자 다시 setGrid 호출 | Medium | Low | store에 `isApplying` 플래그. 적용 중 ⚙️ 버튼/팝오버 적용 버튼 disabled |
| 영속화 실패 (디스크 가득) | Medium | Low | repository.save catch → 콘솔 + 토스트 "저장 실패. 다시 시도해주세요" |
| undo 윈도우 만료 후 클릭 | Low | Medium | `Date.now() > undoExpiresAt` 가드. UI는 5초 카운트다운 후 토스트 자동 dismiss |
| 박스 제목 입력 중 한국어 IME 조합 |  Medium | Medium | Enter는 `isComposing` 체크 후 처리 (조합 중 Enter는 IME가 처리). 기존 메모/할일 입력 패턴 참조 |
| Windows 외 OS에서 사용자 혼란 | Low | Medium | FR-12 안내 노출. 그리드 설정은 보존(향후 Windows 전환 대비) |
| 첫 실행 시 default config 자동 저장 → 사용자가 카드 제거해도 파일 잔존 | Low | Low | 카드 제거 시 자동 삭제는 안 함. 다음 추가 시 파일이 있으면 그대로 로드. 사용자에게 자연스러운 경험 |

---

## 10. 컨벤션 검증 항목 (PR 자가 체크)

- [ ] `domain/entities/DesktopOrganizeConfig.ts`에 외부 import 0건 (`grep '^import' src/domain/entities/DesktopOrganizeConfig.ts` 결과 빈)
- [ ] `usecases/desktopOrganize/*.ts`에 `@adapters` / `@infrastructure` import 0건
- [ ] `widgets/items/DesktopOrganize/*` 내 `any` 타입 0건
- [ ] `rounded-sp-*` 0건 (`grep -r 'rounded-sp-' src/widgets/items/DesktopOrganize/` 결과 빈)
- [ ] sp-* 디자인 토큰만 사용 (`grep -rE '#[0-9a-fA-F]{3,6}' src/widgets/items/DesktopOrganize/` 결과 빈, mockup 제외)
- [ ] 박스 컴포넌트에 `onClick` 핸들러 0건 (편집 모드 input은 onClick 아닌 onFocus/onBlur 사용)
- [ ] `npx tsc --noEmit` 0 errors
- [ ] `npm run build` 성공
- [ ] `npm run test` 통과 (신규 ≥ 18 케이스 포함)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-05-07 | 최초 Draft. Plan v0.1 결정사항 반영. 영속화 = 별도 store + Repository(BookmarkRepository 패턴), 편집 모드 = 카드 자체 토글(Widget.tsx 비건드림), 박스 NoOp 정책 명시, 4-Phase 구현 순서 정의 | pblsketch |
