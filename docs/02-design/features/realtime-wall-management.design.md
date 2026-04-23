---
template: design
version: 1.2
feature: realtime-wall-management
date: 2026-04-21
author: pblsketch
project: ssampin
version_target: v1.12.x → v1.13.x (3-Phase 순차 릴리즈)
depends_on: docs/01-plan/features/realtime-wall-management.plan.md
---

# 실시간 담벼락 관리 기능 설계서

> Plan의 **M1 프리셋 / M2 자동저장·재개 / M3 보드 엔티티화** 3-Phase를 **Clean Architecture 4-layer 경계**, **IPC 채널 signature**, **엔티티·포트 시그니처**, **UI 컴포넌트 props**, **마이그레이션 전략**으로 구체화한다. collab-board의 선행 검증된 14채널 IPC 패턴과 useToolPresetStore 확장 패턴을 미러링한다.
>
> **Status**: Draft v0.1 (2026-04-21)
> **Planning Doc**: [realtime-wall-management.plan.md](../../01-plan/features/realtime-wall-management.plan.md)
> **Reference Design**: [collab-board.design.md](./collab-board.design.md) — IPC·세션 패턴 미러
> **Reference Code**: [`src/adapters/stores/useToolPresetStore.ts`](../../../src/adapters/stores/useToolPresetStore.ts) — 프리셋 CRUD 패턴
>
> **Phase 매핑**: M1(§3·§4·§8) → M2(§5·§6·§9) → M3(§7·§10·§11)

---

## 1. Architecture Overview

### 1.1 Design Goals

- **기존 코드 비파괴**: realtime-wall BETA의 5개 IPC 채널(`start/stop/tunnel-*/student-submitted/connection-count`)과 도메인 타입(`RealtimeWallBoard/Post/Column`)은 **1줄도 건드리지 않는다**. 관리 레이어는 전부 additive.
- **Phase 독립 릴리즈**: M1 단독으로 v1.12.x 첫 마이너 배포 가능. M2·M3는 각각 다음 마이너로 순차. 한 Phase가 다음 Phase의 머지 조건이 되지 않게 한다.
- **Clean Architecture 4-layer 엄수**: domain은 순수 TS, IPC/파일 I/O는 infrastructure 한정, React/Zustand는 adapters 한정.
- **collab-board 패턴 미러링**: 14채널 IPC 네이밍 규칙, `userData/data/{kind}/{id}.json` 경로, before-quit 동기 저장 훅을 재활용. **공유 코드 금지** — 각 도구는 엔티티/경로/prefix가 독립.
- **마이그레이션 무손실**: 기존 `tool-presets.json`, `tool-results.json`은 스키마 진화 시 구버전 앱이 읽어도 crash 없이, 신버전 앱이 읽어도 데이터 누락 없이 동작.

### 1.2 Design Principles

- **개방·폐쇄**: 기존 BETA 도구 코드는 **닫힘**. 관리 기능은 **새 파일·새 IPC 채널**로만 확장.
- **단일 책임**: 엔티티는 불변 타입, rules는 순수 함수, stores는 상태, usecases는 흐름 조립, infrastructure는 기술 세부.
- **명시적 실패**: 스냅샷 저장 실패·프리셋 이름 충돌·보드 삭제 후 활성 세션 참조 시도는 전부 Toast로 사용자 통보.
- **Reversible 기본값**: 삭제는 "확인 다이얼로그 → 즉시 파일 삭제". 휴지통 개념은 도입하지 않음(관련 FR 없음, 복잡도 증가 회피).
- **Idempotent IPC**: `:save-snapshot`을 같은 payload로 N번 호출해도 파일 상태/렌더러 이벤트가 동일해야 한다.

### 1.3 Touchpoints (Layer × Phase)

| Layer | 파일 | M1 | M2 | M3 | 변경 유형 |
|---|---|:-:|:-:|:-:|---|
| domain/entities | `ToolPreset.ts` | ⚡수정 | | | **discriminated union 승격** |
| domain/entities | `RealtimeWallPreset.ts` | 🆕 | | | 신규 |
| domain/entities | `RealtimeWallSnapshot.ts` | | 🆕 | | 신규 |
| domain/entities | `BulletinBoard.ts` | | | 🆕 | 신규 |
| domain/entities | `ToolResult.ts` | | | ⚡수정 | `boardId?` optional 추가 |
| domain/valueObjects | `BulletinBoardId.ts` | | | 🆕 | 신규 (collab-board `BoardId` 미러) |
| domain/ports | `IRealtimeWallSnapshotPort.ts` | | 🆕 | | 신규 |
| domain/repositories | `IRealtimeWallPresetRepository.ts` | 🆕 | | | 신규 |
| domain/repositories | `IBulletinBoardRepository.ts` | | | 🆕 | 신규 |
| domain/rules | `realtimeWallRules.ts` | ⚡추가 | ⚡추가 | ⚡추가 | 신규 함수 add-only |
| usecases/realtimeWall | `ManagePresets.ts` | 🆕 | | | 신규 |
| usecases/realtimeWall | `SaveBulletinSnapshot.ts` | | 🆕 | | 신규 |
| usecases/realtimeWall | `LoadBulletinSnapshot.ts` | | 🆕 | | 신규 |
| usecases/realtimeWall | `ListBulletinSnapshots.ts` | | 🆕 | | 신규 |
| usecases/realtimeWall | `DeleteBulletinSnapshot.ts` | | 🆕 | | 신규 |
| usecases/realtimeWall | `ManageBulletinBoard.ts` | | | 🆕 | 신규 |
| usecases/realtimeWall | `StartBulletinBoardSession.ts` | | | 🆕 | 신규 (M2 snapshot 로드 + M3 엔티티 결합) |
| adapters/repositories | `JsonRealtimeWallPresetRepository.ts` | 🆕 | | | 신규 |
| adapters/repositories | `FileBulletinBoardRepository.ts` | | | 🆕 | 신규 |
| adapters/stores | `useToolPresetStore.ts` | ⚡수정 | | | 신규 type 처리 |
| adapters/stores | `useRealtimeWallPresetStore.ts` | 🆕 | | | 신규 (선택: useToolPresetStore 단독 확장도 가능. §8.2 결정 기록) |
| adapters/stores | `useRealtimeWallSessionStore.ts` | | 🆕 | | 신규 (런타임 autosave 상태) |
| adapters/stores | `useRealtimeWallBoardStore.ts` | | | 🆕 | 신규 |
| adapters/components/Tools | `ToolRealtimeWall.tsx` | ⚡수정 | ⚡수정 | ⚡수정 | viewMode 확장 |
| adapters/components/Tools/RealtimeWall | `PresetPicker.tsx` | 🆕 | | | 신규 |
| adapters/components/Tools/RealtimeWall | `PresetManagerModal.tsx` | 🆕 | | | 신규 |
| adapters/components/Tools/RealtimeWall | `ResumeSessionBanner.tsx` | | 🆕 | | 신규 |
| adapters/components/Tools/RealtimeWall | `EndSessionDialog.tsx` | | 🆕 | | 신규 |
| adapters/components/Tools/RealtimeWall | `BulletinBoardList.tsx` | | | 🆕 | 신규 |
| adapters/di | `container.ts` | ⚡수정 | ⚡수정 | ⚡수정 | Phase별 의존성 조립 추가 |
| infrastructure/realtimeWall | `FileBulletinSnapshotPersistence.ts` | | 🆕 | | 신규 |
| infrastructure/realtimeWall | `FileBulletinBoardPersistence.ts` | | | 🆕 | 신규 |
| electron/ipc | `realtimeWall.ts` | | ⚡추가 | ⚡추가 | IPC 채널 add-only |
| electron | `preload.ts` | | ⚡추가 | ⚡추가 | 브릿지 함수 add-only |
| electron | `main.ts` | | ⚡수정 | | before-quit 훅 추가 |
| typings | `global.d.ts` | | ⚡추가 | ⚡추가 | `ElectronAPI` 확장 |

### 1.4 Dependency Rule 검증

```
domain/                                   (순수 TS)
  ↑
usecases/realtimeWall/                (domain만 import, M1~M3)
  ↑
adapters/                ──→  infrastructure/realtimeWall/
                                           (예외: di/container.ts만 infra 조립)
              ↓
              (fs, Electron IPC, path)

검증 (Phase별):
M1:
- [x] RealtimeWallPreset entity → 0 외부 의존
- [x] ManagePresets usecase → IRealtimeWallPresetRepository만
- [x] JsonRealtimeWallPresetRepository → window.electronAPI.readData/writeData만
- [x] PresetPicker/Modal → usecase/store만 참조

M2:
- [x] RealtimeWallSnapshot entity → 0 외부 의존 (기존 RealtimeWallPost 재사용)
- [x] IRealtimeWallSnapshotPort → 포트만 정의
- [x] SaveBulletinSnapshot usecase → port만 주입
- [x] FileBulletinSnapshotPersistence → fs/path (infrastructure OK)
- [x] electron/ipc/realtimeWall.ts → infrastructure 호출 OK

M3:
- [x] BulletinBoard entity → 0 외부 의존
- [x] BulletinBoardId VO → 문자열 brand 타입
- [x] IBulletinBoardRepository → 포트
- [x] ManageBulletinBoard / StartBulletinBoardSession → repository + snapshot port 주입
- [x] FileBulletinBoardRepository → infrastructure
- [x] BulletinBoardList → store/usecase만
```

### 1.5 Component Diagram

```
┌───────────────────────────────────────────────────────────────────────┐
│ Electron Renderer (React)                                             │
│                                                                       │
│  ToolRealtimeWall.tsx                                             │
│   (viewMode: 'list' → 'create' → 'running' → 'results')                │
│    │                                                                  │
│    ├─ [M3] BulletinBoardList.tsx — 보드 목록 (useRealtimeWallBoardStore)
│    ├─ [M1] CreateView                                                 │
│    │    ├─ PresetPicker.tsx — 드롭다운 + "프리셋으로 저장"              │
│    │    └─ PresetManagerModal.tsx — 목록/이름변경/삭제                 │
│    ├─ [M2] ResumeSessionBanner.tsx — 재개 다이얼로그 (진입 시 조건부)  │
│    ├─ running 뷰                                                      │
│    │    ├─ (기존) LiveSharePanel/QueuePanel/Board                     │
│    │    └─ [M2] EndSessionDialog.tsx — 유지/완전종료 2버튼            │
│    │    └─ [M2] useRealtimeWallSessionStore (autosave state)      │
│    └─ ResultView                                                      │
│                                                                       │
│                ↕ window.electronAPI.* (preload)                        │
└───────────────────────────────────────────────────────────────────────┘
┌───────────────────────────────────────────────────────────────────────┐
│ Electron Main (Node)                                                  │
│                                                                       │
│  electron/ipc/realtimeWall.ts                                     │
│    registerRealtimeWallHandlers(mainWindow)                       │
│      기존 5채널 (비수정)                                                │
│      [M2] :save-snapshot / :load-snapshot / :list-snapshots /         │
│           :delete-snapshot                                            │
│      [M3] :list / :create / :rename / :delete /                       │
│           :start-session / :end-session / :get-active-session         │
│                                                                       │
│  usecases/realtimeWall/*  (domain만 import)                       │
│                                                                       │
│  infrastructure/realtimeWall/                                     │
│    FileBulletinSnapshotPersistence → userData/data/bulletins/{id}.json│
│    FileBulletinBoardPersistence    → userData/data/bulletin-boards.json│
└───────────────────────────────────────────────────────────────────────┘
```

---

## 2. Data Model

### 2.1 Phase M1 — 프리셋 엔티티

```typescript
// domain/entities/RealtimeWallPreset.ts  [신규]
import type { RealtimeWallLayoutMode } from './RealtimeWall';

export interface RealtimeWallPreset {
  readonly id: string;
  readonly name: string;
  readonly layoutMode: RealtimeWallLayoutMode;
  readonly columnTitles: readonly string[];   // 자유 배치형은 [] 허용
  readonly titleTemplate?: string;             // 예: "{학년} 토론 보드" — optional placeholder
  readonly createdAt: string;                  // ISO 8601
  readonly updatedAt: string;
}
```

```typescript
// domain/entities/ToolPreset.ts  [⚡수정: discriminated union 승격]
// Before:
//   export type ToolPresetType = 'roulette' | 'random' | 'wordcloud';
//   export interface ToolPreset { id; name; type; items: string[]; createdAt; updatedAt; }

// After (v1 호환 + 신규 타입 추가):
export type TextListPresetType = 'roulette' | 'random' | 'wordcloud';
export type ToolPresetType = TextListPresetType | 'realtime-wall';

interface ToolPresetBase {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TextListPreset extends ToolPresetBase {
  readonly type: TextListPresetType;
  readonly items: readonly string[];
}

export interface RealtimeWallPresetEntry extends ToolPresetBase {
  readonly type: 'realtime-wall';
  readonly layoutMode: 'kanban' | 'freeform';
  readonly columnTitles: readonly string[];
  readonly titleTemplate?: string;
}

export type ToolPreset = TextListPreset | RealtimeWallPresetEntry;

export interface ToolPresetsData {
  readonly version?: number;              // v2부터 존재, 없으면 v1로 간주
  readonly presets: readonly ToolPreset[];
}
```

**호환성 전략**: 기존 `items: string[]`만 있는 엔트리는 자동으로 `type: 'roulette' | 'random' | 'wordcloud'`로 분류됨(discriminated union이라 TS가 강제). v1 파일을 읽어도 `realtime-wall` 엔트리는 없어서 무해. v2 파일을 구버전 앱이 읽으면 `'realtime-wall'` 타입은 switch default로 fall through (구버전 코드가 이미 `switch(type)`에서 unknown default 처리 필요 — §8.3 마이그레이션에서 가드).

### 2.2 Phase M2 — 스냅샷 엔티티

```typescript
// domain/entities/RealtimeWallSnapshot.ts  [신규]
import type {
  RealtimeWallColumn,
  RealtimeWallPost,
  RealtimeWallLayoutMode,
} from './RealtimeWall';

export type RealtimeWallSessionState = 'running' | 'paused' | 'ended';

export interface RealtimeWallSnapshot {
  readonly id: string;                     // = BulletinBoardId (M3에서 연결) / M2 단독 시 UUID
  readonly version: 1;                     // 스키마 버전 강제
  readonly title: string;
  readonly layoutMode: RealtimeWallLayoutMode;
  readonly columns: readonly RealtimeWallColumn[];
  readonly posts: readonly RealtimeWallPost[];
  readonly savedAt: number;                // epoch ms
  readonly sessionState: RealtimeWallSessionState;
  readonly tunnelActive: boolean;          // 저장 시점에 터널 열려있었는지 (UI 힌트)
}
```

**설계 포인트**:
- `RealtimeWallPost[]`는 기존 타입 그대로 재사용 → 추가 타입 폭발 없음
- `savedAt`은 number(epoch) — JSON 직렬화/역직렬화 단순화
- `version` 리터럴 타입 1로 못박아 향후 v2 스키마 진화 시 type narrowing 강제

### 2.3 Phase M3 — 보드 엔티티

```typescript
// domain/valueObjects/BulletinBoardId.ts  [신규]
// collab-board/BoardId 미러 — branded type으로 ID 혼동 방지
declare const __bulletinBoardIdBrand: unique symbol;
export type BulletinBoardId = string & { readonly [__bulletinBoardIdBrand]: true };

export function toBulletinBoardId(value: string): BulletinBoardId {
  if (!value || typeof value !== 'string') {
    throw new Error('BulletinBoardId는 비어있지 않은 문자열이어야 합니다');
  }
  return value as BulletinBoardId;
}
```

```typescript
// domain/entities/BulletinBoard.ts  [신규]
import type { BulletinBoardId } from '../valueObjects/BulletinBoardId';
import type { RealtimeWallColumn, RealtimeWallLayoutMode } from './RealtimeWall';

export interface BulletinBoard {
  readonly id: BulletinBoardId;
  readonly name: string;
  readonly title: string;                  // 세션 시작 시 화면에 뜨는 제목
  readonly layoutMode: RealtimeWallLayoutMode;
  readonly columns: readonly RealtimeWallColumn[];
  readonly presetId?: string;              // 생성 시 사용한 프리셋 참조 (optional)
  readonly createdAt: string;              // ISO
  readonly updatedAt: string;
  readonly lastSessionEndedAt: number | null;
  readonly hasSnapshot: boolean;           // `bulletins/{id}.json` 존재 여부 캐시
}

export interface BulletinBoardsMeta {
  readonly version: 1;
  readonly boards: readonly BulletinBoard[];
}
```

```typescript
// domain/entities/ToolResult.ts  [⚡수정]
export type RealtimeWallResultData = {
  readonly type: 'realtime-wall';
  readonly title: string;
  readonly layoutMode: RealtimeWallLayoutMode;
  readonly columns: readonly RealtimeWallColumn[];
  readonly posts: readonly RealtimeWallPost[];
  readonly totalParticipants: number;
  readonly boardId?: string;                // 🆕 M3부터 추가 (기존 결과는 undefined)
};
```

### 2.4 Entity Relationships

```
[Preset] 1 ──── 0..N [BulletinBoard]
(선택 템플릿)          │
                      ├── 1 ──── 0..1 [Snapshot]  (세션 일시정지 중이면 존재)
                      │
                      └── 1 ──── 0..N [ToolResult]  (종료된 세션 결과들, boardId로 참조)
```

**Consistency Rule**:
- Board 삭제 시 Snapshot도 함께 삭제(`bulletins/{id}.json` unlink)
- Board 삭제 시 ToolResult는 **보존** (교사가 결과는 따로 남기고 싶을 수 있음) → 해당 결과의 `boardId`는 유효하지 않은 참조로 남지만, UI에서 "분류되지 않은 세션"으로 표시
- Preset 삭제 시 Board의 `presetId`는 **유효하지 않은 참조로 남김**(Board 자체는 독립) → UI는 "삭제된 프리셋"으로 표시하고 기본 레이아웃으로 계속 동작

### 2.5 Storage Schema

| Phase | 파일 | 경로 | 포맷 | 버전 필드 |
|---|---|---|---|---|
| M1 | `tool-presets.json` | `userData/data/` | JSON (기존 확장) | `version?: 2` (신규 파일부터), 없으면 v1로 간주 |
| M2 | `bulletins/{boardId}.json` | `userData/data/bulletins/` | JSON per board | `version: 1` 필수 |
| M3 | `bulletin-boards.json` | `userData/data/` | JSON (메타 통합) | `version: 1` 필수 |

**디렉토리 자동 생성**: `fs.mkdirSync(..., { recursive: true })` — Electron main의 `data:write`는 이미 getDataDir 내부만 다루므로 `bulletins/` 서브디렉토리는 새 IPC 핸들러에서 별도 보장.

---

## 3. API Specification — M1 IPC 채널 (프리셋)

M1은 **신규 IPC 필요 없음**. 기존 `window.electronAPI.readData('tool-presets')`/`writeData`로 단일 파일 CRUD.

### 3.1 Renderer 측 API (스토어 signature)

```typescript
// adapters/stores/useRealtimeWallPresetStore.ts [신규]
interface RealtimeWallPresetStore {
  presets: readonly RealtimeWallPresetEntry[];
  loaded: boolean;

  load: () => Promise<void>;

  addPreset: (input: {
    name: string;
    layoutMode: RealtimeWallLayoutMode;
    columnTitles: readonly string[];
    titleTemplate?: string;
  }) => Promise<RealtimeWallPresetEntry>;

  renamePreset: (id: string, newName: string) => Promise<void>;

  updatePreset: (id: string, patch: Partial<{
    layoutMode: RealtimeWallLayoutMode;
    columnTitles: readonly string[];
    titleTemplate: string;
  }>) => Promise<void>;

  deletePreset: (id: string) => Promise<void>;
}
```

**에러 시나리오**:
- 이름 중복 → `throw new Error('같은 이름의 프리셋이 이미 있어요')` → UI Toast
- 저장 실패 → Electron `data:write`가 이미 atomic write + backup 하므로 실패 시 throw

### 3.2 구현 대안 결정 (§1.3 ambiguity 해소)

**결정**: 별도 `useRealtimeWallPresetStore` **신규 생성** (기존 `useToolPresetStore` 확장이 아니라).

**이유**:
- `TextListPreset.items: string[]`과 `RealtimeWallPresetEntry.columnTitles` 의미 차이가 크다
- `getByType(type)` 한 메서드에서 union을 반환하면 사용처에서 type narrowing 강제 필요 → DX 악화
- 두 스토어가 같은 `tool-presets.json`을 **읽기/쓰기 공유**하되 각자 자기 타입만 필터해 관리 → 파일은 공유, 상태는 분리

**공유 전략**: 한 스토어가 write 시 `onDataChanged('tool-presets')` IPC 이벤트로 다른 스토어에 reload 시그널 전달(기존 `data:changed` 이벤트 재사용).

---

## 4. UI/UX Design — M1

### 4.1 PresetPicker (CreateView 내부)

**위치**: `CreateView`의 제목 입력 필드 **상단**에 신규 섹션.

```
┌─────────────────────────────────────────────────────────┐
│ 💾 프리셋 불러오기                                        │
│ ┌───────────────────────────────────────┐ ┌──────────┐ │
│ │ ── 선택 안 함 ──                      ▼│ │ 관리  ⚙ │ │
│ └───────────────────────────────────────┘ └──────────┘ │
│  (선택 시 title/layoutMode/columnInputs 자동 채움.      │
│   이후 교사가 자유 편집 OK — 프리셋은 템플릿일 뿐)       │
└─────────────────────────────────────────────────────────┘
```

**Props**:
```typescript
interface PresetPickerProps {
  readonly selectedPresetId: string | null;
  readonly presets: readonly RealtimeWallPresetEntry[];
  readonly onSelect: (preset: RealtimeWallPresetEntry | null) => void;
  readonly onOpenManager: () => void;
}
```

**동작**:
- `onSelect(preset)` 호출 시 부모(`ToolRealtimeWall.tsx`)가 `setTitle(preset.titleTemplate ?? '')`, `setLayoutMode(preset.layoutMode)`, `setColumnInputs([...preset.columnTitles])` 실행
- 선택 후 교사가 수동 편집 시 `selectedPresetId`는 그대로 유지(템플릿 표시만). 저장 시점에 다시 새 프리셋으로 저장하거나 기존 프리셋 덮어쓰기는 PresetManagerModal에서.

### 4.2 "프리셋으로 저장" 버튼 (CreateView 하단)

**위치**: "실시간 담벼락 열기" CTA 위 보조 버튼.

```
┌─ [ 💾 현재 설정을 프리셋으로 저장 ] ─┐
└──────────────────────────────────────┘
         ↓ 클릭
┌─────────────────────────────────────┐
│ 프리셋 이름                          │
│ ┌─────────────────────────────┐    │
│ │ 예: 2학년 토론 기본         │    │
│ └─────────────────────────────┘    │
│                   [ 취소 ] [ 저장 ] │
└─────────────────────────────────────┘
```

**이름 중복 시**: "같은 이름의 프리셋이 이미 있어요. 덮어쓸까요?" → 덮어쓰기(id 유지, updatedAt 갱신) vs 새로 저장(id 신규) 2분기.

### 4.3 PresetManagerModal

**진입**: PresetPicker의 "관리 ⚙" 버튼.

```
┌────────────────────────────────────────────────┐
│  프리셋 관리                                [✕]│
├────────────────────────────────────────────────┤
│                                                │
│  ┌──────────────────────────────────────────┐ │
│  │ 📌 2학년 토론 기본                       │ │
│  │    칸반형 · 생각/질문/정리               │ │
│  │    2026-04-20 수정                       │ │
│  │                     [ 이름 변경 ] [ 삭제 ]│ │
│  └──────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────┐ │
│  │ 🎨 창의 브레인스토밍                     │ │
│  │    자유 배치형 · 컬럼 없음               │ │
│  │    2026-04-18 수정                       │ │
│  │                     [ 이름 변경 ] [ 삭제 ]│ │
│  └──────────────────────────────────────────┘ │
│                                                │
│  저장된 프리셋이 없으면 "아직 저장된 프리셋이   │
│  없어요" 빈 상태 표시                           │
└────────────────────────────────────────────────┘
```

**Props**:
```typescript
interface PresetManagerModalProps {
  readonly presets: readonly RealtimeWallPresetEntry[];
  readonly onRename: (id: string, newName: string) => Promise<void>;
  readonly onDelete: (id: string) => Promise<void>;
  readonly onClose: () => void;
}
```

---

## 5. API Specification — M2 IPC 채널 (자동 저장/재개)

### 5.1 신규 IPC 4채널

| 채널 | 방향 | Payload | Response | 용도 |
|---|---|---|---|---|
| `realtime-wall:save-snapshot` | R→M | `{ snapshot: RealtimeWallSnapshot }` | `{ savedAt: number }` | 스냅샷 저장 (debounced + interval + 수동) |
| `realtime-wall:load-snapshot` | R→M | `{ id: string }` | `RealtimeWallSnapshot \| null` | 재개 시 로드 |
| `realtime-wall:list-snapshots` | R→M | `{}` | `Array<{ id: string; title: string; savedAt: number; sessionState: RealtimeWallSessionState }>` | 재개 가능 목록 |
| `realtime-wall:delete-snapshot` | R→M | `{ id: string }` | `{ ok: true }` | 스냅샷 삭제 |

**네이밍 규칙**: `realtime-wall:*` prefix 고수 (기존 5채널과 동일). collab-board의 `collab-board:*`와는 완전 분리.

### 5.2 preload 브릿지 확장

```typescript
// electron/preload.ts [⚡추가]
// 기존 realtime-wall 섹션에 add-only:
realtimeWallSaveSnapshot: (
  snapshot: RealtimeWallSnapshot,
): Promise<{ savedAt: number }> =>
  ipcRenderer.invoke('realtime-wall:save-snapshot', { snapshot }),

realtimeWallLoadSnapshot: (
  id: string,
): Promise<RealtimeWallSnapshot | null> =>
  ipcRenderer.invoke('realtime-wall:load-snapshot', { id }),

realtimeWallListSnapshots: (): Promise<Array<{
  id: string;
  title: string;
  savedAt: number;
  sessionState: RealtimeWallSessionState;
}>> =>
  ipcRenderer.invoke('realtime-wall:list-snapshots', {}),

realtimeWallDeleteSnapshot: (
  id: string,
): Promise<{ ok: true }> =>
  ipcRenderer.invoke('realtime-wall:delete-snapshot', { id }),
```

### 5.3 before-quit 동기 저장 훅

```typescript
// electron/main.ts [⚡수정]
// 기존:
//   app.on('before-quit', () => { isQuitting = true; endActiveBoardSessionSync(); ... });
// 수정 후:
app.on('before-quit', () => {
  isQuitting = true;
  try {
    endActiveBoardSessionSync();                       // collab-board (기존)
  } catch (e) { console.error('[collab-board sync save]', e); }
  try {
    endActiveBulletinSessionSync();                    // 🆕 realtime-wall M2
  } catch (e) { console.error('[bulletin sync save]', e); }
  // ... 기존 analytics flush 유지
});
```

**`endActiveBulletinSessionSync()` 구현 위치**: `electron/ipc/realtimeWall.ts`에서 export. 내부 구현:
- 현재 renderer가 autosave로 올린 최신 snapshot이 main 메모리에 있으면 동기 `fs.writeFileSync(..., JSON.stringify(snapshot))` 호출
- 300ms timeout cap (비동기 I/O 대기 안 함, 동기 I/O만)
- 실패해도 throw 안 함 (quit 진행)

### 5.4 Debounce / Interval 전략

| 트리거 | 주기 | 구현 |
|---|---|---|
| setInterval 안전망 | 30초 | `useRealtimeWallSessionStore`에서 `setInterval` 훅, running 뷰 진입 시 start / 종료 시 clear |
| state change debounce | 3초 | lodash-es `debounce` 또는 직접 구현 (의존성 추가 지양 — 직접 구현) |
| 수동 저장 | 즉시 | `EndSessionDialog`의 "보드 유지" 버튼 |

**경합 조건**: interval과 debounce가 같은 시점에 발동해도 `saveSnapshot`은 idempotent하므로 파일은 마지막 write만 유효 (atomic rename으로 보장 — main의 기존 `data:write` 패턴 재사용 가능하지만 `bulletins/` 서브디렉토리 대응 위해 새 핸들러).

### 5.5 UI Components — M2

```typescript
// ResumeSessionBanner.tsx [신규]
interface ResumeSessionBannerProps {
  readonly pendingSnapshots: readonly {
    id: string;
    title: string;
    savedAt: number;
    sessionState: RealtimeWallSessionState;
  }[];
  readonly onResume: (snapshotId: string) => void;
  readonly onDiscard: (snapshotId: string) => void;
  readonly onDismiss: () => void;
}
```

진입 배너: `ToolRealtimeWall.tsx`의 `viewMode === 'create'` 진입 시 최상단에 렌더링. 재개할 스냅샷이 1개만 있으면 단일 "이어서 열기" 배너, 여럿이면 리스트.

```typescript
// EndSessionDialog.tsx [신규]
interface EndSessionDialogProps {
  readonly open: boolean;
  readonly onKeepSession: () => void;      // 스냅샷 저장 + isLiveMode=false but viewMode='running' 유지
  readonly onEndCompletely: () => void;    // 기존 handleFinish (viewMode='results')
  readonly onCancel: () => void;
}
```

---

## 6. M2 User Flow

```
[기존 Flow]
CreateView → running(Live) → handleStopLive → results → 저장/새 보드

[M2 신규 Flow]
(A) 진입 시 재개:
  ToolRealtimeWall mount
    → electronAPI.realtimeWallListSnapshots()
    → pending이 있으면 ResumeSessionBanner 표시
    → 교사 "이어서 열기" 클릭
    → loadSnapshot(id) → setTitle/layout/columns/posts → viewMode='running'
    → 학생 참여는 별도 시작 (기존 LiveSharePanel UI)

(B) 진행 중 autosave:
  posts/columns 변경 시 debounce(3s) 트리거
    → electronAPI.realtimeWallSaveSnapshot(snapshot)
    → 또는 30s interval 트리거 (둘 다 idempotent)

(C) 종료 분기:
  교사 "학생 참여 종료" 버튼 → EndSessionDialog
    ├─ "보드 유지(일시 정지)"
    │     → stopLive (서버 종료) + saveSnapshot(sessionState='paused')
    │     → viewMode='running' 유지, isLiveMode=false
    │     → 교사는 카드 편집/정리 계속 가능
    │     → 다시 "학생 참여 시작" 가능 (새 포트/터널 재발급)
    └─ "완전 종료"
         → stopLive + saveSnapshot(sessionState='ended', posts 최종본)
         → viewMode='results'
         → 교사가 결과 저장 or 새 보드

(D) before-quit:
  어떤 상태든 활성 스냅샷 있으면 동기 저장
    → 다음 앱 시작 시 (A)로 연결
```

---

## 7. API Specification — M3 IPC 채널 (보드 엔티티화)

### 7.1 신규 IPC 8채널 (collab-board 14채널 미러)

| 채널 | 방향 | Payload | Response | 용도 |
|---|---|---|---|---|
| `realtime-wall:list` | R→M | `{}` | `BulletinBoard[]` | 보드 목록 |
| `realtime-wall:create` | R→M | `{ name: string; presetId?: string; layoutMode; columns; title? }` | `BulletinBoard` | 신규 보드 |
| `realtime-wall:rename` | R→M | `{ id: string; name: string }` | `BulletinBoard` | 이름 변경 |
| `realtime-wall:update` | R→M | `{ id: string; patch: Partial<{title;layoutMode;columns}> }` | `BulletinBoard` | 설정 변경 (카드 X) |
| `realtime-wall:delete` | R→M | `{ id: string }` | `{ ok: true }` | 삭제 (스냅샷도 함께) |
| `realtime-wall:duplicate` | R→M | `{ id: string; newName: string }` | `BulletinBoard` | 복제 |
| `realtime-wall:start-session` | R→M | `{ id: string }` | `{ board: BulletinBoard; snapshot: Snapshot \| null }` | 세션 진입 (M2 snapshot 로드 연계) |
| `realtime-wall:get-active` | R→M | `{}` | `{ id: string; startedAt: number } \| null` | 현재 활성 보드 조회 (탭 재진입 시) |

**제외된 collab-board 채널**:
- `:participant-change` — 학생 참여자 변화는 이미 기존 `:student-submitted` + `:connection-count` 이벤트로 커버
- `:auto-save` 이벤트 — M2의 `:save-snapshot` 응답으로 충분
- `:session-error` / `:session-started` 이벤트 — UI가 return 값만으로 처리 가능 (동기성 충분)

**활성 세션 제약**: 쌤핀 전체에서 터널은 싱글턴 유지. `realtime-wall:start-session`은 `collab-board`가 활성이거나 다른 Live 도구가 활성이면 에러 반환 → UI Toast.

### 7.2 preload 브릿지 확장

```typescript
// electron/preload.ts [⚡추가]
// 기존 flat 노출 스타일이지만 8개라서 서브객체로 그루핑 (collab-board와 동일 패턴):
bulletinBoards: {
  list: (): Promise<BulletinBoard[]> => ipcRenderer.invoke('realtime-wall:list'),
  create: (args) => ipcRenderer.invoke('realtime-wall:create', args),
  rename: (args) => ipcRenderer.invoke('realtime-wall:rename', args),
  update: (args) => ipcRenderer.invoke('realtime-wall:update', args),
  delete: (args) => ipcRenderer.invoke('realtime-wall:delete', args),
  duplicate: (args) => ipcRenderer.invoke('realtime-wall:duplicate', args),
  startSession: (args) => ipcRenderer.invoke('realtime-wall:start-session', args),
  getActive: () => ipcRenderer.invoke('realtime-wall:get-active'),
},
```

### 7.3 UI — BulletinBoardList

**진입**: `ToolRealtimeWall.tsx`에서 `viewMode === 'list'`일 때 렌더링 (M3부터 이게 초기 viewMode).

```
┌───────────────────────────────────────────────────────────────┐
│ 🗂️ 실시간 담벼락                                  [ + 새 보드 ]│
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  💾 프리셋으로 빠르게 만들기:                                  │
│    [ 2학년 토론 기본 ▼ ]                                       │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ 📌 2학년 국어-수필 단원                              │  │ │
│  │    칸반형 · 컬럼 3개 · 4월 20일 수정                 │  │ │
│  │    💾 이어서 열 수 있는 세션 있음                    │  │ │
│  │          [ 열기 ] [ 편집 ] [ 복제 ] [ 이름 ] [ 삭제 ]│  │ │
│  └─────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ 🎨 3학년 사회-시민권 토론                            │  │ │
│  │    자유 배치형 · 4월 18일 수정                       │  │ │
│  │          [ 열기 ] [ 편집 ] [ 복제 ] [ 이름 ] [ 삭제 ]│  │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  📚 지난 결과 N개 (모든 보드)     [ 지난 결과 모아보기 ]      │
└───────────────────────────────────────────────────────────────┘
```

**Props**:
```typescript
interface BulletinBoardListProps {
  readonly boards: readonly BulletinBoard[];
  readonly presets: readonly RealtimeWallPresetEntry[];
  readonly onCreateEmpty: () => void;
  readonly onCreateFromPreset: (presetId: string) => Promise<void>;
  readonly onOpen: (boardId: BulletinBoardId) => void;        // start-session
  readonly onEdit: (boardId: BulletinBoardId) => void;        // CreateView로 편집 진입
  readonly onRename: (boardId: BulletinBoardId, newName: string) => Promise<void>;
  readonly onDuplicate: (boardId: BulletinBoardId) => Promise<void>;
  readonly onDelete: (boardId: BulletinBoardId) => Promise<void>;
  readonly onOpenPastResults: () => void;
}
```

### 7.4 viewMode 확장

```typescript
// ToolRealtimeWall.tsx 내부 상태
type ViewMode = 'list' | 'create' | 'running' | 'results';
// M3부터 초기값 'list', 기존 v1.12.x는 'create'가 초기값
```

**첫 진입 온보딩**: M3 릴리즈 후 처음 진입 시 "이제 여러 보드를 관리할 수 있어요!" Toast 1회 + sessionStorage 플래그로 재표시 차단.

---

## 8. Clean Architecture Mapping

### 8.1 Layer Assignment

| Component | Layer | Phase |
|---|---|---|
| `RealtimeWallPreset`, `RealtimeWallSnapshot`, `BulletinBoard` | Domain/Entities | M1/M2/M3 |
| `BulletinBoardId`, brand 타입 | Domain/ValueObjects | M3 |
| `IRealtimeWallPresetRepository`, `IBulletinBoardRepository` | Domain/Repositories | M1/M3 |
| `IRealtimeWallSnapshotPort` | Domain/Ports | M2 |
| `realtimeWallRules.ts` 신규 함수 (preset 검증 등) | Domain/Rules | M1~M3 |
| `ManagePresets`, `SaveBulletinSnapshot`, `ManageBulletinBoard` 등 | Application/Usecases | M1~M3 |
| `JsonRealtimeWallPresetRepository`, `FileBulletinBoardRepository` | Adapters/Repositories | M1/M3 |
| `useRealtimeWallPresetStore`, `...SessionStore`, `...BoardStore` | Adapters/Stores | M1~M3 |
| `PresetPicker`, `BulletinBoardList` 등 | Adapters/Components | M1~M3 |
| `FileBulletinSnapshotPersistence`, `FileBulletinBoardPersistence` | Infrastructure | M2/M3 |
| IPC handlers in `electron/ipc/realtimeWall.ts` | Electron Main (infra 등가) | M2/M3 |

### 8.2 Dependency Rule 검증

```
검증 체크리스트 (각 Phase 완료 시 ESLint + 수동):
- [ ] domain/* 는 react/zustand/electron/fs 전부 import 금지
- [ ] usecases/* 는 adapters/infrastructure import 금지
- [ ] adapters/* 는 infrastructure 직접 import 금지 (di/container.ts 예외)
- [ ] electron/ipc/realtimeWall.ts는 usecases + infrastructure만 import (adapters 금지)
- [ ] 기존 realtime-wall 5채널 로직은 1줄도 수정되지 않았는가 (diff 검증)
```

### 8.3 DI Container 확장 (`adapters/di/container.ts`)

```typescript
// M1 추가
export const realtimeWallPresetRepository = new JsonRealtimeWallPresetRepository();

// M2 추가
export const realtimeWallSnapshotPersistence = new FileBulletinSnapshotPersistence(/* electronAPI IPC */);

// M3 추가
export const bulletinBoardRepository = new FileBulletinBoardRepository(realtimeWallSnapshotPersistence);
```

**주의**: `container.ts`는 `adapters/di/` 예외 경로로 infrastructure import 허용. 기존 container 구조 따름.

---

## 9. Error Handling

### 9.1 Error Code 정의

| Code | 채널 | 메시지 | 원인 | UI 처리 |
|---|---|---|---|---|
| `BULLETIN_PRESET_NAME_DUPLICATE` | (renderer) | 같은 이름의 프리셋이 이미 있어요 | 이름 중복 | 덮어쓰기/취소/새로 저장 3분기 |
| `BULLETIN_PRESET_NOT_FOUND` | (renderer) | 프리셋을 찾을 수 없어요 | 삭제 후 참조 | 기본값으로 폴백, Toast |
| `BULLETIN_SNAPSHOT_WRITE_FAIL` | `:save-snapshot` | 저장에 실패했어요. 잠시 후 다시 시도할게요 | fs error | Toast + 다음 interval 재시도 |
| `BULLETIN_SNAPSHOT_CORRUPT` | `:load-snapshot` | 저장 파일이 손상됐어요 | JSON parse 실패 | backup 파일 자동 복구 시도 (기존 `data:read` 패턴) |
| `BULLETIN_BOARD_DELETE_WITH_ACTIVE_SESSION` | `:delete` | 실행 중인 보드는 삭제할 수 없어요 | active session 참조 | Toast, 세션 먼저 종료 유도 |
| `BULLETIN_TUNNEL_BUSY` | `:start-session` | 다른 도구(협업 보드 등)가 사용 중이에요 | tunnel 싱글턴 충돌 | Toast |
| `BULLETIN_BOARD_NOT_FOUND` | `:start-session`, `:delete` | 보드를 찾을 수 없어요 | 경쟁 조건 (삭제 후 로드) | Toast + 목록 새로고침 |

### 9.2 Error Response Format (main → renderer)

기존 `ipcRenderer.invoke` 패턴 유지. 에러는 throw → renderer catch 블록:
```typescript
try {
  await window.electronAPI.bulletinBoards.delete({ id });
} catch (err) {
  showToast(err instanceof Error ? err.message : '삭제에 실패했어요', 'error');
}
```

Main 측 핸들러에서 `throw new Error(CODE + ': ' + message)` 형태 일관성 유지.

---

## 10. Security Considerations

- [x] **파일 경로 탈출 방지**: `userData/data/bulletins/{id}.json`의 `id`는 BulletinBoardId(UUID)만 허용. path traversal(`../` 등)은 domain rule `toBulletinBoardId()` 검증 + main에서 `path.resolve + path.relative` 경계 검증 (collab-board의 `resolveFormsPath` 패턴 미러).
- [x] **JSON 파싱 안전**: `JSON.parse` 실패 시 throw 대신 null 반환 + 로그. 기존 `data:read` 의 atomic backup 복구 패턴 활용.
- [x] **학생 제출 검증은 기존 `realtimeWall.ts` validateNickname/normalizeLink 재사용** — 이 설계는 학생 입력 경로 변경 없음.
- [x] **IPC Payload 검증**: 모든 handler는 `args` 필드 타입 검증 후 동작. `realtime-wall:save-snapshot`의 `snapshot.posts` 개수 상한(1000) 체크 → DoS 방지.
- [x] **PIPA**: 학생 개인정보는 로컬 파일에만. 외부 송신 없음. 터널은 기존과 동일(제3자 서버 미경유).
- [x] **XSS**: snapshot 내 텍스트는 기존 React JSX 이스케이프로 충분. 학생 HTML은 기존 `escapeHtml` 그대로.

---

## 11. Test Plan

### 11.1 Test Scope

| Type | 대상 | Tool | Phase |
|---|---|---|---|
| Unit | `realtimeWallRules.ts` 신규 함수 (preset 검증, snapshot 직렬화 스키마) | Vitest | M1~M3 |
| Unit | `JsonRealtimeWallPresetRepository`, `FileBulletinBoardRepository` | Vitest + memfs or mock | M1/M3 |
| Unit | `SaveBulletinSnapshot`, `LoadBulletinSnapshot` usecase | Vitest + mock port | M2 |
| Integration | IPC handler `electron/ipc/realtimeWall.ts` M2/M3 채널 | Vitest + electron mock | M2/M3 |
| Integration | `ToolRealtimeWall.tsx` viewMode 전환 + autosave 훅 | Vitest + RTL + fake timers | M2 |
| E2E (manual) | 세션 중단 → 앱 재시작 → ResumeBanner → 이어서 열기 → 카드 상태 보존 | 수동 | M2 |
| E2E (manual) | 보드 생성 → 프리셋 적용 → 세션 시작 → 완전 종료 → 결과 저장 → 목록에서 과거 결과 접근 | 수동 | M3 |
| 마이그레이션 | v1.11.x `tool-presets.json` 파일을 v1.12.x에서 로드 | Vitest fixture | M1 |

### 11.2 Key Test Cases

**M1**:
- [ ] `buildPresetFromConfig(title, layoutMode, columnInputs)` — 빈 컬럼 제거 후 저장
- [ ] 프리셋 이름 중복 → 에러 throw
- [ ] 프리셋 삭제 → store 즉시 반영 + 파일 갱신
- [ ] v1 포맷 파일 로드 시 `TextListPreset`만 존재, `items.length > 0` 검증

**M2**:
- [ ] `SaveBulletinSnapshot.execute(snapshot)` 호출 → `bulletins/{id}.json` 존재, 역직렬화 시 원본 posts와 deep-equal
- [ ] debounce: 1초 간격으로 5번 state change → `saveSnapshot` 1번만 호출
- [ ] interval 안전망: debounce가 어떤 이유로 작동 안해도 30초 주기 저장 동작
- [ ] before-quit: main process exit 시 마지막 snapshot이 파일에 있음
- [ ] loadSnapshot 후 posts 상태 복원: `status/pinned/kanban/freeform` 모두 일치
- [ ] 손상 파일 복구: `bulletins/{id}.json`이 비어있으면 backup에서 복구 (없으면 null)

**M3**:
- [ ] 보드 CRUD: create → list → rename → update → duplicate → delete 전부 멱등
- [ ] 삭제 시 스냅샷도 함께 unlink
- [ ] ToolResult `boardId?` 없는 결과 로드 — `RealtimeWallDetail`가 crash 없이 렌더
- [ ] 경쟁 조건: renderer가 삭제된 보드 ID로 `start-session` 호출 → `BULLETIN_BOARD_NOT_FOUND` 응답

---

## 12. Coding Convention Reference

### 12.1 Naming

| Target | Rule | Example |
|---|---|---|
| Components | PascalCase | `BulletinBoardList`, `PresetPicker` |
| IPC 채널 | `realtime-wall:kebab-case` | `realtime-wall:save-snapshot` |
| 파일(component) | PascalCase.tsx | `PresetManagerModal.tsx` |
| 파일(utility) | camelCase.ts | `realtimeWallRules.ts` |
| 폴더 | kebab-case or PascalCase | `RealtimeWall/` (기존 유지) |
| Storage 파일 | kebab-case.json | `bulletin-boards.json`, `tool-presets.json` |
| 타입 | PascalCase | `BulletinBoard`, `RealtimeWallSnapshot` |
| Branded VO | `__brand` symbol | `BulletinBoardId` |

### 12.2 Import Order (CLAUDE.md 규칙 준수)

```typescript
// 1. External libraries
import { create } from 'zustand';
import { useState, useCallback } from 'react';

// 2. Domain imports (@domain/*)
import type { BulletinBoard } from '@domain/entities/BulletinBoard';

// 3. Usecases (@usecases/*)
import { ManageBulletinBoard } from '@usecases/realtimeWall/ManageBulletinBoard';

// 4. Adapters (@adapters/*)
import { useRealtimeWallBoardStore } from '@adapters/stores/useRealtimeWallBoardStore';

// 5. Relative
import { PresetPicker } from './PresetPicker';

// 6. Type-only
import type { RealtimeWallLayoutMode } from '@domain/entities/RealtimeWall';
```

### 12.3 Feature-Specific

| Item | Convention |
|---|---|
| viewMode enum | `ToolRealtimeWall` 내부에서만 사용. 다른 컴포넌트에 export 금지 |
| IPC handler return | 성공 시 payload 객체 반환. 실패 시 `throw new Error('CODE: message')` |
| autosave 훅 | `useRealtimeWallSessionStore`의 `scheduleAutosave()` 함수로 캡슐화. 컴포넌트에서 `setInterval` 직접 X |
| 한국어 UI 문구 | 친근+담백 (기존 쌤핀 톤). 이모지는 아이콘 위치에만 허용 |

---

## 13. Implementation Guide

### 13.1 Phase M1 구현 순서 (1~2일)

1. [ ] `domain/entities/ToolPreset.ts` discriminated union 승격 (기존 타입 호환 확인)
2. [ ] `domain/entities/RealtimeWallPreset.ts` 신규
3. [ ] `domain/repositories/IRealtimeWallPresetRepository.ts` 신규
4. [ ] `domain/rules/realtimeWallRules.ts`에 `buildPresetFromConfig` 추가 + 테스트
5. [ ] `usecases/realtimeWall/ManagePresets.ts` 신규 + 테스트 (mock repository)
6. [ ] `adapters/repositories/JsonRealtimeWallPresetRepository.ts` 신규
7. [ ] `adapters/stores/useRealtimeWallPresetStore.ts` 신규
8. [ ] `adapters/di/container.ts` 추가 조립
9. [ ] `PresetPicker.tsx` + `PresetManagerModal.tsx` 신규
10. [ ] `ToolRealtimeWall.tsx` `CreateView`에 PresetPicker 통합
11. [ ] 수동 테스트: 저장/선택/이름변경/삭제/v1 포맷 로드
12. [ ] `npx tsc --noEmit` + `npx vitest run` 그린 확인

### 13.2 Phase M2 구현 순서 (3~5일)

1. [ ] `domain/entities/RealtimeWallSnapshot.ts` 신규
2. [ ] `domain/ports/IRealtimeWallSnapshotPort.ts` 신규
3. [ ] `usecases/realtimeWall/SaveBulletinSnapshot.ts` + `LoadBulletinSnapshot.ts` + `List/DeleteBulletinSnapshot.ts` 신규
4. [ ] `infrastructure/realtimeWall/FileBulletinSnapshotPersistence.ts` 신규 (fs + path.resolve 검증)
5. [ ] `electron/ipc/realtimeWall.ts`에 4채널 핸들러 추가 + `endActiveBulletinSessionSync` export
6. [ ] `electron/main.ts` before-quit 훅 추가
7. [ ] `electron/preload.ts` 4개 브릿지 함수 추가
8. [ ] `src/global.d.ts` `ElectronAPI` 확장
9. [ ] `adapters/stores/useRealtimeWallSessionStore.ts` 신규 (autosave schedule)
10. [ ] `ResumeSessionBanner.tsx` + `EndSessionDialog.tsx` 신규
11. [ ] `ToolRealtimeWall.tsx` autosave 훅 통합 + 종료 분기 다이얼로그
12. [ ] 통합 테스트: 중단→재개, before-quit, debounce
13. [ ] 수동 E2E: 앱 강제 종료 후 재개 복원

### 13.3 Phase M3 구현 순서 (5~7일)

1. [ ] `domain/valueObjects/BulletinBoardId.ts` 신규
2. [ ] `domain/entities/BulletinBoard.ts` 신규
3. [ ] `domain/entities/ToolResult.ts` `boardId?` 추가 (기존 결과 호환)
4. [ ] `domain/repositories/IBulletinBoardRepository.ts` 신규
5. [ ] `usecases/realtimeWall/ManageBulletinBoard.ts` + `StartBulletinBoardSession.ts` 신규 (M2 snapshot 결합)
6. [ ] `infrastructure/realtimeWall/FileBulletinBoardPersistence.ts` 신규
7. [ ] `adapters/repositories/FileBulletinBoardRepository.ts` 신규
8. [ ] `electron/ipc/realtimeWall.ts`에 8채널 추가
9. [ ] `electron/preload.ts` `bulletinBoards` 서브객체 추가
10. [ ] `src/global.d.ts` 확장
11. [ ] `adapters/stores/useRealtimeWallBoardStore.ts` 신규
12. [ ] `BulletinBoardList.tsx` 신규 + 온보딩 Toast
13. [ ] `ToolRealtimeWall.tsx` viewMode='list' 추가, 라우팅 조정
14. [ ] `PastResultsView.tsx`에 `boardId` 기반 필터 옵션 추가 (고아 결과 섹션)
15. [ ] 마이그레이션 검증: v1.12.x 저장 파일 → v1.13.x 로드
16. [ ] 사용자 가이드(Notion) + 챗봇 KB(`scripts/ingest-chatbot-qa.mjs`) 업데이트
17. [ ] BETA 배지 제거 검토 (기획자 결정)

---

## 14. Open Questions

| # | 질문 | 결정 기준 | 권장 |
|---|---|---|---|
| Q1 | M3에서 보드 삭제 시 연결된 ToolResult도 cascade 삭제할지? | 교사 기대(결과는 보존? vs 완전 삭제?) | **결과 보존** (default). 고아 결과는 "분류되지 않은 세션"으로 표시. 강제 cascade 옵션은 설정으로만 |
| Q2 | Preset의 `titleTemplate`에 `{학년}` 같은 placeholder를 실제 변수로 치환? | UX 복잡도 vs 효용 | M1은 **그냥 문자열 기본값으로만** 사용 (placeholder 치환 로직 없음). 필요 시 M3+에서 도입 |
| Q3 | 자동 저장 실패가 연속 N번 발생하면 사용자에게 강제 경고? | 데이터 손실 리스크 | 3회 연속 실패 시 Toast "저장이 반복 실패하고 있어요. 설정을 확인해주세요" |
| Q4 | M3에서 보드 목록을 기본 뷰로 할지, 아니면 "단축 모드"(바로 create) 옵션 제공? | BETA 사용자의 기존 흐름 유지 | **기본 목록**. "새 보드" 버튼 1클릭으로 create 진입 (추가 설정 없이) |
| Q5 | Preset import/export(JSON 파일)는 M3에 포함할지 M4로 미룰지? | 사용자 요청 명시 여부 | **M4 이후**. Plan §2.4 Out of Scope 유지 |
| Q6 | before-quit 동기 저장이 300ms timeout을 초과하면 어떻게? | 데이터 손실 vs quit 지연 | timeout 이후엔 **quit 진행**. 로그만 남기고 포기. 다음 시작 시 partial 데이터라도 load |

---

## 15. Red Flags

- ❌ `useToolPresetStore`에 realtime-wall 로직을 억지로 끼워 넣어 union 타입이 사용처마다 narrowing 지옥
- ❌ M2 스냅샷 포맷을 version 필드 없이 출시 (향후 스키마 진화 막힘)
- ❌ M3 IPC 채널을 `collab-board:*` 네임스페이스로 혼용 (도구 경계 무너짐)
- ❌ `BulletinBoardId`를 그냥 `string`으로 두고 brand type 생략 (ID 혼동)
- ❌ before-quit 핸들러가 async라서 quit 지연 유발
- ❌ M3에서 `ToolResult.boardId`를 required로 해서 기존 결과 파일 깨짐
- ❌ autosave가 `setState` 루프를 유발 (리렌더 폭증)
- ❌ 보드 목록 페이지에서 "열기" 버튼이 2단계 이상 (세션 시작까지 3+ 클릭)

---

## 16. Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-21 | 초안. M1/M2/M3 3-Phase 설계 + IPC 12채널 signature + 엔티티 6개 + UI 컴포넌트 props + Clean Architecture 레이어 매핑 + 16개 Open Questions | pblsketch |
