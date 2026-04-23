---
template: design
version: 0.1
feature: realtime-wall
sub-feature: v1.13-enhancement
date: 2026-04-23
author: claude
project: ssampin
version_target: v1.13.0
plan: docs/01-plan/features/realtime-wall-v1.13-enhancement.plan.md
---

# 쌤핀 실시간 담벼락 v1.13 설계서

> 대응 Plan: `realtime-wall-v1.13-enhancement.plan.md` MUST-A~E

---

## 0. 구현 순서 (의존성)

```
[E] 별/추천 리네임     ◄─── 독립, 가장 먼저 (부채 청소)
       │
[A] 보드 영속화         ◄─── 핵심 기반
       │
       ├── [C] 승인 정책 옵션
       ├── [B] 칸반 컬럼 편집
       └── [D] 보드 복제
```

각 단계 완료 기준:
- tsc 0 error
- npm run build 성공
- 도메인 규칙 unit test 신규 규칙당 최소 5케이스
- 병렬 리뷰 통과 (code-reviewer-low + bkit:code-analyzer,
  보안 민감 시 security-reviewer 추가)
- 이 design의 해당 섹션 "검증 체크리스트" 전 항목 PASS

---

## 1. 공통 데이터 모델 변화

### 1.1 신규 엔티티: `WallBoard`

**위치**: `src/domain/entities/RealtimeWall.ts` (기존 파일에 추가)

```ts
export type WallBoardId = string & { readonly __brand: 'WallBoardId' };

export type WallApprovalMode = 'manual' | 'auto' | 'filter';

/**
 * 영속 담벼락 인스턴스. 교사가 학기 내내 재사용하는 단위.
 * 라이브 세션은 WallBoard 위에 0..N회 실행되며, 각 세션의 학생 제출이
 * posts에 누적됨.
 */
export interface WallBoard {
  readonly id: WallBoardId;
  readonly title: string;
  readonly description?: string;
  readonly layoutMode: RealtimeWallLayoutMode;
  readonly columns: readonly RealtimeWallColumn[];
  readonly approvalMode: WallApprovalMode;
  readonly posts: readonly RealtimeWallPost[];
  readonly createdAt: number;
  readonly updatedAt: number;
  /** 마지막 라이브 세션 종료 시각. 재열기 시 "N일 전 수업"을 표시용. */
  readonly lastSessionAt?: number;
  /** 보관 처리된 보드는 목록에서 별도 섹션. 삭제 아님. */
  readonly archived?: boolean;
  /**
   * 학생 접속용 고정 short-code (Open Question #2 확정, 사용자 결정
   * 2026-04-23). 보드 첫 라이브 세션 시 Supabase LiveSessionClient로
   * 발급 후 여기 보관. 같은 보드 재열기 시 재사용 → 교사가 학기 내내
   * 동일 코드로 학생에게 공지 가능.
   *
   * 만료 정책: archived=true 또는 명시적 "코드 재발급" 메뉴 선택 시
   * 만료 → 다음 라이브 세션에 새 code 발급.
   */
  readonly shortCode?: string;
}
```

### 1.2 기존 `RealtimeWallPost.likes` 리네임

```ts
// Before (단계 6에서 도입)
readonly likes?: number;

// After (MUST-E, 사용자 확정 2026-04-23)
readonly teacherHearts?: number;
```

- 의미: "교사가 하트를 누른 횟수" (수업 중 강조용, 교사 소유 명시)
- 저장 위치는 동일, 필드명만 변경
- **이름 변경 근거**: FGI에서 "`likes`라는 이름이 학생 참여 지표로
  오해된다" 지적. 단 **아이콘(하트)·색상(rose)·카운트 방식은 유지** —
  사용자가 하트 UX가 교사 직관에 가장 익숙하다고 확정.

### 1.3 엔티티-세션 관계

- **1 WallBoard : N live sessions** — 같은 보드를 학기 내 여러 번 열기
- 라이브 세션 ID는 별도 저장 안 함 (휘발성). 필요 시 post에 `sessionId`
  추가는 후속 버전 논의 (Plan Open Question #1.3)
- 동시 라이브는 여전히 1개 (tunnel 싱글턴 제약)

---

## 2. [E] `likes` → `teacherHearts` 필드 리네임 (아이콘 하트 유지)

### 2.1 엔티티 변경

`likes?: number` → `teacherHearts?: number`

### 2.2 도메인 규칙 리네임

| Before | After |
|---|---|
| `likeRealtimeWallPost` | `heartRealtimeWallPost` |
| `REALTIME_WALL_MAX_LIKES = 999` | `REALTIME_WALL_MAX_HEARTS = 999` |

### 2.3 UI 변경 (아이콘·색상은 유지, 식별자·라벨만 변경)

**색상 토큰 정책**: realtime-wall 영역의 상태 강조색(pinned amber-400,
하트 rose-400, hover emerald 등)은 **쌤핀 기존 관례대로 Tailwind 원색
을 직접 사용**한다. `sp-*` 토큰은 구조색(bg/surface/card/border/muted/
text/accent)만 담당하고, **의미 색(pinned/teacherHearts/success/danger)**
은 Tailwind 원색 — `RealtimeWallCard.tsx` 기존 구현 관례 유지.

**RealtimeWallCard.tsx** (아이콘·색상 변경 없음, 이름·prop만):

```diff
- function LikeButton({ count, onClick }) {
+ function HeartButton({ count, onClick }) {
    const highlighted = count >= 5;
    ...
-   title={readOnly ? `좋아요 ${count}` : '좋아요'}
+   title={readOnly ? `교사 하트 ${count}` : '교사 하트'}
    ...
    className={`... ${highlighted
      ? 'border-rose-400/40 bg-rose-400/10 text-rose-300'
      : 'border-sp-border ... hover:border-rose-400/40 hover:text-rose-300'
    }`}
    <span className="material-symbols-outlined">favorite</span>  {/* 유지 */}
```

- 아이콘 `favorite`(하트) 유지 — 사용자 확정
- 색상 rose 유지 — 사용자 확정
- 카운트 +1 누적 유지 — 사용자 확정
- 상한 999 유지

### 2.4 Props 연쇄 리네임

```diff
// types.ts (RealtimeWallBoardCommonProps)
-  readonly onLike?: (postId: string) => void;
+  readonly onHeart?: (postId: string) => void;

// ToolRealtimeWall.tsx
-  const handleLikePost = useCallback((postId: string) => {
-    setPosts((prev) => likeRealtimeWallPost(prev, postId));
-  }, []);
+  const handleHeartPost = useCallback((postId: string) => {
+    setPosts((prev) => heartRealtimeWallPost(prev, postId));
+  }, []);

// 4개 Board + RealtimeWallCard + 테스트
```

### 2.5 마이그레이션

- **WIP 릴리즈 전이라 실제 저장본 없음** → 무마이그레이션
- 단 개발자 로컬에 테스트 데이터가 있을 수 있어 `teacherStarred` 로더에
  `likes` fallback 임시 허용 (1회 릴리즈 후 제거):

```ts
// adapters/repositories/JsonWallBoardRepository.ts (신규)
function migratePostFields(post: unknown): RealtimeWallPost {
  const raw = post as RealtimeWallPost & { likes?: number };
  if (raw.likes !== undefined && raw.teacherStarred === undefined) {
    return { ...raw, teacherStarred: raw.likes, likes: undefined };
  }
  return raw;
}
```

**2-way 적용**: 위 fallback은 두 경로에 모두 적용한다:
1. `JsonWallBoardRepository.load()` — 신규 WallBoard 로드 시점
2. `useToolResultStore` / `PastResultsView`가 사용하는 `RealtimeWallResultData`
   로더 — 기존 스냅샷 재생 시점에도 `likes`가 있으면 `teacherStarred`로
   투명 변환. 이는 `ToolResult.ts` 타입을 건드리지 않고, 소비 측(View)의
   필드 접근을 `post.teacherStarred ?? (post as { likes?: number }).likes`
   패턴으로 래핑하는 1회 작업. v1.13.1 릴리즈에서 제거 예정.

### 2.6 검증 체크리스트 [E]

- [ ] `rg 'likes|LikeButton|onLike|likeRealtimeWallPost|REALTIME_WALL_MAX_LIKES'`
      쌤핀 realtime-wall 영역 잔존 0
- [ ] `favorite` 아이콘은 **유지** (grep 결과 건재해야 함)
- [ ] rose 색상 클래스 유지 (grep 결과 건재해야 함)
- [ ] 기존 테스트 모두 통과 (29→29, 이름만 변경)
- [ ] 신규 테스트: `heartRealtimeWallPost` 5케이스 (이름만 바꾼 재생성)
- [ ] UI 수동 확인: 하트 아이콘 그대로 + 카운트 +1 누적 + 5+ rose 강조
- [ ] 버튼 tooltip "교사 하트 N" / "교사 하트" 표시
- [ ] PastResultsView가 기존 `likes` 필드를 `teacherHearts`로 fallback
      매핑해 카운트 표시 정상

---

## 3. [A] 보드 영속화

### 3.1 신규 Repository 포트

**위치**: `src/domain/repositories/IWallBoardRepository.ts`

```ts
import type { WallBoard, WallBoardId } from '@domain/entities/RealtimeWall';

export interface IWallBoardRepository {
  /** 모든 보드 메타(posts 제외 경량) 목록 — 목록 화면용 */
  listAllMeta(): Promise<readonly WallBoardMeta[]>;

  /** 단일 보드 전체 로드 (posts 포함) — 재열기용 */
  load(id: WallBoardId): Promise<WallBoard | null>;

  /** 보드 저장 (전체 덮어쓰기). 자동 저장·수동 저장 공용. */
  save(board: WallBoard): Promise<void>;

  /** 메타 필드만 업데이트 (title, archived 등) */
  updateMeta(id: WallBoardId, patch: Partial<WallBoardMeta>): Promise<void>;

  /** 삭제 — 파일 시스템에서 완전 제거 */
  delete(id: WallBoardId): Promise<void>;
}

export interface WallBoardMeta {
  readonly id: WallBoardId;
  readonly title: string;
  readonly description?: string;
  readonly layoutMode: RealtimeWallLayoutMode;
  readonly approvalMode: WallApprovalMode;
  readonly postCount: number;
  readonly approvedCount: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly lastSessionAt?: number;
  readonly archived?: boolean;
  /** 학생 접속 고정 short-code (Open Question #2 확정). */
  readonly shortCode?: string;
  /** 썸네일 mini-preview용 경량 post snapshot (Open Question #1 확정). */
  readonly previewPosts: readonly WallPreviewPost[];
}

export interface WallPreviewPost {
  readonly id: string;
  readonly nickname: string;
  readonly text: string;        // 100자 초과 truncate
  readonly kanban?: RealtimeWallKanbanPosition;
  readonly freeform?: RealtimeWallFreeformPosition;
}
```

`save(board)` 내부에서 `buildWallPreviewPosts(board.posts)`로
previewPosts를 재계산 후 index.json에 반영. 다만 posts 업데이트마다
index 재쓰기는 부담이므로 **디바운스**: dirty 플래그 + 5초마다 또는
명시적 `flushIndex()` 호출 시만 index 갱신.

### 3.2 Repository 구현체

**위치**: `src/adapters/repositories/JsonWallBoardRepository.ts`

저장 구조 (`IStoragePort` 경유):

```
userData/data/
├── wall-boards-index.json          # 경량 메타 배열 (목록 화면)
└── wall-boards/
    ├── {boardId}.json              # 각 보드 전체 (posts 포함)
    └── {boardId}.backup.json       # atomic write 백업
```

- `listAllMeta()`: index.json 1회 read — 목록 빠름
- `load(id)`: boards/{id}.json read
- `save(board)`: boards/{id}.json 쓰기 + index.json의 해당 entry 갱신
- 원자성: 기존 IStoragePort의 tmp + rename 패턴 그대로 활용
- **collab-board와 저장 경로 분리** — 충돌 없음

### 3.3 자동 저장 전략

**위치**: `adapters/stores/useWallBoardStore.ts` (신규 Zustand)

collab-board의 `SaveBoardSnapshot` 패턴 재사용:

```ts
export const useWallBoardStore = create<WallBoardState>((set, get) => ({
  boards: new Map<WallBoardId, WallBoard>(),
  loading: false,
  dirty: new Set<WallBoardId>(),

  loadAll: async () => { /* listAllMeta */ },
  open: async (id) => { /* load + setActive */ },
  setActive: (id) => set({ activeBoardId: id }),
  markDirty: (id) => set((s) => ({ dirty: new Set(s.dirty).add(id) })),

  // 30초 interval + 3초 debounce (collab-board와 동일 설정)
  autoSave: async () => {
    const dirtyIds = Array.from(get().dirty);
    for (const id of dirtyIds) {
      const board = get().boards.get(id);
      if (board) {
        await repo.save(board);
        get().clearDirty(id);
      }
    }
  },
}));
```

**before-quit 동기 저장**: Main의 `before-quit` 훅에 등록. collab-board
와 같은 `app.before-quit` 콜체인에 추가. 각 보드 300ms cap.

### 3.4 IPC 채널 (신규)

| 채널 | 방향 | 용도 |
|---|---|---|
| `realtime-wall:board:list-meta` | R→M | 목록 화면 초기 로드 |
| `realtime-wall:board:load` | R→M | 보드 열기 |
| `realtime-wall:board:save` | R→M | 저장 (자동/수동) |
| `realtime-wall:board:update-meta` | R→M | 제목·archived 변경 |
| `realtime-wall:board:delete` | R→M | 삭제 |
| `realtime-wall:board:clone` | R→M | 복제 (MUST-D) |

Main 핸들러: `electron/ipc/realtimeWallBoard.ts` (신규)

**preload 노출 API 시그니처** (global.d.ts에 반영):

```ts
interface ElectronAPI {
  // ...기존 채널...
  wallBoards: {
    listMeta: () => Promise<readonly WallBoardMeta[]>;
    load: (id: WallBoardId) => Promise<WallBoard | null>;
    save: (board: WallBoard) => Promise<void>;
    updateMeta: (
      id: WallBoardId,
      patch: Partial<Pick<WallBoardMeta, 'title' | 'description' | 'archived'>>,
    ) => Promise<void>;
    delete: (id: WallBoardId) => Promise<void>;
    clone: (sourceId: WallBoardId, titleSuffix?: string) => Promise<WallBoardId>;
  };
}
```

- `clone`은 Main에서 `WallBoardId` 생성 + save까지 수행 후 신규 id 반환
- `updateMeta`의 patch는 안전 필드만 허용 (updatedAt은 Main이 자동 설정)
- 모든 메서드는 실패 시 `Error`로 rejection (rendering에는 string
  message만 노출, 경로·stack 등 내부 정보 누설 X)

### 3.5 UI 플로우

#### 3.5.1 보드 목록 화면 (신규 뷰 `WallBoardListView`)

ToolRealtimeWall의 첫 viewMode를 `'list' | 'create' | 'running' | 'results'`
로 확장. 초기값 `'list'`.

```
┌──────────────────────────────────────────────────────────────┐
│ ← 쌤도구  🗂️ 실시간 담벼락                                    │
├──────────────────────────────────────────────────────────────┤
│ 내 담벼락                                   [+ 새 담벼락 만들기]│
│                                                              │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│ │┌──┬──┬──┐│ │●         │ │┌──┐┌──┐  │ │민수 우리..│          │
│ ││질│근│정││ │  ●  ●    │ ││..││..│  │ │지연 저는..│          │
│ ││민│이│경││ │     ●●   │ │└──┘└──┘  │ │성현 선생..│          │
│ │└──┴──┴──┘│ │  ●       │ │┌──┐┌──┐  │ │          │          │
│ │ 📋 칸반   │ │ 📐 자유  │ ││..││..│  │ │ 🎞 스트림 │          │
│ │ 주장·근거·│ │ 학급회의 │ │└──┘└──┘  │ │ 질문받기 │          │
│ │  반박     │ │ 아이디어 │ │ 📊 격자  │ │          │          │
│ │ 카드 42   │ │ 카드 18  │ │ 카드 31  │ │ 카드 7   │          │
│ │ 최종 3일전│ │ 최종 오늘│ │ 최종 1주전│ │ 최종 어제│          │
│ │        ⋯  │ │        ⋯ │ │        ⋯ │ │        ⋯ │          │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
│                                                              │
│ ▾ 보관함 (3)                                                  │
│   ...                                                        │
└──────────────────────────────────────────────────────────────┘
```

각 카드 상단 120px 영역은 **WallBoardThumbnail** (§3.5.1a) —
layoutMode별 실제 카드 축약 렌더. 하단은 메타(아이콘, 제목, 카드수,
최종 세션, ⋯ 메뉴).

⋯ 메뉴: 이름변경 / 복제 / 보관 / 삭제

**빈 상태**: "아직 만든 담벼락이 없어요" + 큰 "+ 담벼락 만들기" CTA

#### 3.5.1a 카드 Mini-Preview 서브컴포넌트 (Open Question #1 확정)

목록 화면 각 보드 카드는 **실제 승인 카드의 mini-preview**를 렌더한다.
v1.13.0 포함, 사용자 결정(2026-04-23).

**위치**: `RealtimeWall/WallBoardThumbnail.tsx` (신규, ~120줄)

**렌더 규칙** (레이아웃 mode별):

| layoutMode | Thumbnail 전략 |
|---|---|
| `kanban` | 컬럼 헤더 2~3개(title + 카드수 표시) + 각 컬럼 상위 1 post의 nickname + 텍스트 1줄 축약. 좌→우 3 컬럼 박스. 카드 0 시 컬럼 헤더만 |
| `freeform` | 상위 3 post를 absolute position 그대로 축소(비율 0.18) + 배경 grid 흐리게. 카드가 3개 미만이면 보이는 만큼 |
| `grid` | approved posts 상위 6개를 2×3 grid로 축약(텍스트 2줄 line-clamp) |
| `stream` | 상위 3 post를 세로로 쌓아 nickname + 본문 첫 1줄만 |

**공통 제약**:
- 폭: 카드 고정 240px, 높이 120px
- 폰트: 매우 작게 (`text-[9px]` ~ `text-[11px]`) — 가독성보다 "무엇이
  있는지 기억나게" 정도
- `pointer-events-none` — 썸네일 내부 클릭은 카드 전체 클릭(열기)과
  구분 안 됨 방지
- `aria-hidden="true"` — 스크린리더는 meta만 읽음

**성능**:
- posts가 100장 넘어도 상위 6개만 쓰므로 무관
- React `memo`로 상위 posts 변경 없으면 리렌더 안 함
- 목록 화면 초기 로드 시 `listAllMeta()`에 각 보드의 상위 6개 post
  snapshot 포함 여부 결정 → **포함**. 경량 메타 + 6 post는 수십 KB라
  전체 로드 부담 낮음. 대안(보드 클릭 시 load) 쓰면 썸네일 비어있다가
  뜨는 flash 발생 → 비포함.

**WallBoardMeta 확장**:

```ts
export interface WallBoardMeta {
  readonly id: WallBoardId;
  readonly title: string;
  // ...기존...
  /** 썸네일용 상위 6개 approved post snapshot (text 최대 100자) */
  readonly previewPosts: readonly WallPreviewPost[];
}

export interface WallPreviewPost {
  readonly id: string;
  readonly nickname: string;
  readonly text: string;        // max 100자 truncate
  readonly kanban?: RealtimeWallKanbanPosition;
  readonly freeform?: RealtimeWallFreeformPosition;
}
```

**도메인 규칙 추가**:

```ts
/** posts에서 썸네일용 상위 6개 approved post를 경량 포맷으로 추출 */
export function buildWallPreviewPosts(
  posts: readonly RealtimeWallPost[],
  max: number = 6,
): WallPreviewPost[]
```

#### 3.5.2 CreateView 변경

- 기존 viewMode === 'create' 진입점은 목록의 "+ 새 담벼락" 버튼
- 저장 시 즉시 WallBoard 엔티티 생성 + index에 추가 + boardId 확보
- **CTA 텍스트 변경**: "담벼락 열기" → "**만들어서 열기**"
- 저장만 하고 열지 않는 옵션: "만들기만" 버튼 (작게, 부수)

#### 3.5.3 재열기 플로우

```
목록 → 카드 클릭 → 로드 → viewMode='running' + 보드 복원
                                     │
                                     └── 라이브 세션 시작?
                                          (교사 Start 버튼 기존과 동일)
```

**중요**: 기존 posts는 **viewMode 'running' 진입 즉시** 화면에 표시.
라이브 세션 시작 버튼은 별도. 학생 참여 없이도 기존 담벼락 내용을
프로젝터에 띄워 리뷰 가능.

**신규 세션 제출의 append 규칙**: 라이브 세션이 다시 시작되어 학생이
새로 제출하면, `createPendingRealtimeWallPost(input, existingPosts, columns)`
의 order 계산(`existingPosts.filter(status==='approved' && columnId).length`)
에 의해 **기존 posts 뒤에 자연스럽게 append**된다. 즉 이전 수업 기록은
그대로 유지되고 새 카드만 추가. `submittedAt` 타임스탬프로 구분 가능.
UI에서 세션 경계선을 표시하는 기능은 v1.14+.

#### 3.5.4 "수업 마무리" 동작 변경

Before: viewMode='results' 이동 + 1회성 끝
After: 세션 종료(터널 닫기) + **목록으로 복귀** + `lastSessionAt` 갱신
       + 보드 저장. "지난 결과" 화면은 별도 메뉴로 유지(하위 호환)

### 3.6 기존 `PastResultsView` 호환성

- 기존 저장된 `RealtimeWallResultData` (1회성 스냅샷)는 그대로 읽기
  전용으로 존치
- 새 기능은 `WallBoard`만 사용
- **메뉴 분리**: 목록 화면 하단에 "이전 결과 스냅샷 보기"(옵션)

### 3.7 검증 체크리스트 [A]

- [ ] WallBoard 생성 → 파일 시스템에 `wall-boards/{id}.json` 실제 생성
      (iter #5 교훈: UI 토스트 ≠ 파일 바이트. fs.stat 확인)
- [ ] index.json에 메타 동기화 (title 변경 시 index도 갱신)
- [ ] 재열기 시 posts 완전 복원 (likes, linkPreview, freeform 모두)
- [ ] 자동 저장 30초 주기 작동 — Playwright + fs.stat 조합 검증
- [ ] before-quit 시 dirty 보드 모두 저장 (collab-board와 같은 패턴)
- [ ] 삭제 시 wall-boards/{id}.json + backup + tmp + index entry 4종 제거
- [ ] 기존 PastResults 로드 여전히 작동

---

## 4. [C] 승인 정책 옵션

### 4.1 엔티티 변경

`WallBoard.approvalMode: WallApprovalMode = 'manual' | 'auto' | 'filter'`

v1.13.0은 `'manual' | 'auto'` 구현. `'filter'`는 enum에만 존재하고
UI에서 "준비 중" 비활성 표시.

### 4.2 도메인 규칙 변경

기존:
```ts
createPendingRealtimeWallPost(input, existingPosts, columns): RealtimeWallPost
```

변경:
```ts
createWallPost(
  input: RealtimeWallStudentSubmission,
  existingPosts: readonly RealtimeWallPost[],
  columns: readonly RealtimeWallColumn[],
  approvalMode: WallApprovalMode,
): RealtimeWallPost
```

- `'manual'`: status='pending' (기존 동작)
- `'auto'`: status='approved' + kanban.order/freeform.zIndex를 승인 카드
  처럼 계산 (approveRealtimeWallPost와 동일 로직)
- `'filter'`: 구현 스텁 → pending으로 폴백 (v1.13.2에서 진짜 구현)

**exhaustive switch 방어 코드 예시**:

```ts
function applyApprovalMode(
  post: RealtimeWallPost,
  mode: WallApprovalMode,
): RealtimeWallPost {
  switch (mode) {
    case 'manual': return post;
    case 'auto':   return { ...post, status: 'approved', ...recomputeOrder() };
    case 'filter': return post;  // v1.13.2 스텁
    default: {
      const _exhaustive: never = mode;
      throw new Error(`Unknown approvalMode: ${String(_exhaustive)}`);
    }
  }
}
```

v1.13.2에서 `'filter'` 분기만 교체하면 TS가 나머지 분기 누락 시 컴파일
오류로 강제.

### 4.3 라이브 중 정책 전환

교사가 설정 패널에서 manual ↔ auto 전환 가능.

**기존 pending 카드 처리**:
- manual → auto 전환 시: **일괄 approve 확인 대화**
  "대기 중 카드 12장을 자동 승인하시겠어요?" [취소][승인][각 카드 개별 검토]
- auto → manual 전환 시: 기존 approved 카드는 건드리지 않음, 이후 제출만 pending

**도메인 규칙 신설**:
```ts
bulkApproveWallPosts(
  posts: readonly RealtimeWallPost[],
  columns: readonly RealtimeWallColumn[],
): RealtimeWallPost[]
```
- 모든 pending 카드에 approveRealtimeWallPost 순차 적용

### 4.4 UI

#### CreateView (보드 생성 시)

Step 4 추가 (kanban의 경우 컬럼 설정 Step 3 다음):

```
┌──────────────────────────────────────────────────────────────┐
│ ④ 학생 카드 승인 방식                                         │
│ ┌────────────────────────┐ ┌────────────────────────┐        │
│ │ ◉ 승인 필요             │ │ ○ 자동 승인             │        │
│ │ 교사가 대기열에서        │ │ 학생 제출 즉시 보드에    │        │
│ │ 검토 후 보드에 올립니다. │ │ 노출됩니다 (빠른 진행용).│        │
│ │ 기본값, 초중등 권장      │ │ 고등 대규모 의견 수합용. │        │
│ └────────────────────────┘ └────────────────────────┘        │
│ ○ 키워드 필터 (준비 중)                                       │
└──────────────────────────────────────────────────────────────┘
```

#### 라이브 중 설정 패널

기존 `RealtimeWallLiveSharePanel` 우측에 톱니 아이콘 → 설정 드로어:
- 승인 모드 토글 (라디오)
- 별표 ≥ N 강조 임계값 (선택, Open Question #5)
- 익명화(v1.13.2)

### 4.5 auto 모드에서 QueuePanel 축소

- 승인 대기 섹션 숨김 (pending 0건)
- "숨김 카드" 섹션만 남음
- 공간을 보드 뷰에 양보 — `xl:grid-cols-[300px_minmax(0,1fr)]` → `xl:grid-cols-[200px_minmax(0,1fr)]`

### 4.6 검증 체크리스트 [C]

- [ ] `createWallPost(…, 'auto')` → 즉시 approved + order/zIndex 정상
- [ ] `createWallPost(…, 'manual')` → 기존 pending 동작 동일
- [ ] `bulkApproveWallPosts` 테스트 3케이스 (혼합·전부 pending·전부 hidden)
- [ ] manual→auto 전환 시 UI 일괄 승인 대화 동작
- [ ] auto 모드에서 QueuePanel pending 섹션 자동 숨김
- [ ] 도메인 규칙 exhaustive switch (manual/auto/filter) never 방어

---

## 5. [B] 칸반 컬럼 실행 중 편집

### 5.1 도메인 규칙 신설

```ts
/** 컬럼 추가. 상한 REALTIME_WALL_MAX_COLUMNS(=6) 초과 시 원본 반환. */
export function addWallColumn(
  columns: readonly RealtimeWallColumn[],
  title: string,
): RealtimeWallColumn[]

/** 컬럼 이름 변경. postId가 아닌 columnId로 타겟팅. */
export function renameWallColumn(
  columns: readonly RealtimeWallColumn[],
  columnId: string,
  newTitle: string,
): RealtimeWallColumn[]

/** 컬럼 순서 재배치 + order 필드 재계산 */
export function reorderWallColumns(
  columns: readonly RealtimeWallColumn[],
  fromIndex: number,
  toIndex: number,
): RealtimeWallColumn[]

export type RemoveColumnStrategy =
  | { kind: 'move-to'; targetColumnId: string }
  | { kind: 'hide' }
  | { kind: 'delete' };

/**
 * 컬럼 삭제 + 안의 approved 카드 migration.
 *
 * strategy 별 동작:
 * - 'move-to': 삭제 컬럼의 카드를 targetColumnId **뒤에 append**
 *   (approveRealtimeWallPost의 order 계산과 동일 패턴).
 *   기존 targetColumn 카드 수를 시작 order로 하여 +1씩 부여.
 * - 'hide':    카드 status='hidden' 일괄 전환. 컬럼 자체는 제거.
 *              hidden 카드는 어떤 컬럼에도 속하지 않으므로 columnId 참조
 *              유지는 무의미하지만 필드는 남김 (fallback용).
 * - 'delete':  해당 컬럼 카드를 posts 배열에서 영구 제거. 복구 불가.
 *
 * 모든 strategy에서 columns[i].order는 0..n-1로 재계산.
 */
export function removeWallColumn(
  columns: readonly RealtimeWallColumn[],
  posts: readonly RealtimeWallPost[],
  columnId: string,
  strategy: RemoveColumnStrategy,
): { columns: RealtimeWallColumn[]; posts: RealtimeWallPost[] }
```

**제약**:
- 컬럼 2개 이상 유지 (REALTIME_WALL_MIN_COLUMNS=2)
- 컬럼 이름 공백/빈 문자열 거부 → 원본 반환
- 중복 이름은 허용 (사용자가 원할 수 있음, 퀴즈앤도 중복 허용)

### 5.2 UI — `RealtimeWallColumnEditor`

라이브 보드 상단에 **"컬럼 편집"** 버튼(kanban만). 클릭 시 드로어:

```
┌──────────────────────────────────────────────────────────────┐
│ 컬럼 편집                                                  ✕ │
├──────────────────────────────────────────────────────────────┤
│ [⋮⋮] 1. 주장                            ✏️      🗑️          │
│ [⋮⋮] 2. 근거                            ✏️      🗑️          │
│ [⋮⋮] 3. 반박                            ✏️      🗑️          │
│                                                              │
│ [+ 컬럼 추가]                                                │
│                                                              │
│ 컬럼을 드래그해 순서를 바꾸세요                              │
│                                                              │
│                                               [적용]          │
└──────────────────────────────────────────────────────────────┘
```

✏️ 클릭 → 인라인 rename
🗑️ 클릭 → 3옵션 모달 (안에 카드 있을 때만):
- "다른 컬럼으로 이동" + 타겟 드롭다운
- "숨김 처리"
- "영구 삭제" + 확인 대화

### 5.3 adapters 위치

`src/adapters/components/Tools/RealtimeWall/RealtimeWallColumnEditor.tsx`

### 5.4 검증 체크리스트 [B]

- [ ] addWallColumn: 6개 도달 시 원본 반환
- [ ] renameWallColumn: 빈 문자열 거부
- [ ] reorderWallColumns: order 필드 0..n-1 재정렬 일관
- [ ] removeWallColumn 3전략 동작:
  - [ ] move-to: 카드가 targetColumnId로 이동 + 기존 그 컬럼 카드와 order 조정
  - [ ] hide: 카드 status='hidden', 컬럼만 제거
  - [ ] delete: 카드 영구 제거(배열에서 제거)
- [ ] 최소 2컬럼 유지 가드 (3개 컬럼 중 1개 삭제 시 정상, 2개 중 삭제 시 거부)
- [ ] 라이브 중 편집 시 학생 제출이 **삭제된 컬럼 ID로 들어와도 fallback**
      (createWallPost 이미 첫 컬럼 fallback 구현됨)

---

## 6. [D] 보드 복제

### 6.1 도메인 규칙

```ts
/** 새 WallBoard를 source 기반으로 생성. posts는 비움 (PIPA 준수). */
export function cloneWallBoard(
  source: WallBoard,
  newId: WallBoardId,
  now: number,
  options?: { titleSuffix?: string },
): WallBoard {
  return {
    id: newId,
    title: source.title + (options?.titleSuffix ?? ' (복제)'),
    description: source.description,
    layoutMode: source.layoutMode,
    columns: source.columns.map((c) => ({ ...c })),  // deep clone
    approvalMode: source.approvalMode,
    posts: [],                                         // 비움
    createdAt: now,
    updatedAt: now,
    lastSessionAt: undefined,
    archived: false,
  };
}
```

### 6.2 Repository 활용

`IWallBoardRepository.save(cloneWallBoard(source, newId, Date.now()))`

IPC 채널 `realtime-wall:board:clone` (Main에서 id 생성 + save)

### 6.3 UI

목록 화면 카드의 ⋯ 메뉴에서 "복제":
1. 대화: "'XX' 담벼락을 복제하시겠어요? 카드는 빈 상태로 시작합니다."
2. 확인 → 즉시 생성 + 목록에 추가 + 복제본 이름 인라인 편집 포커스

### 6.4 반별 일괄 복제 (v1.13.1로 연기)

MUST 범위에서는 **단일 복제**만. 일괄 복제는 v1.13.1 후속.

### 6.5 검증 체크리스트 [D]

- [ ] `posts.length === 0` 복제본
- [ ] `id` 새로 생성, `createdAt === updatedAt === Date.now()`
- [ ] `lastSessionAt` undefined
- [ ] `archived` false
- [ ] columns deep clone (원본 수정이 복제본에 영향 없음)
- [ ] 복제본 save 후 원본 부하 없음
- [ ] title 한국어 "(복제)" 접미 (§9 Q#4 확정 완료)

---

## 7. 통합 파일 변경 목록

### 7.1 신규 파일

| 경로 | 설명 |
|---|---|
| `src/domain/repositories/IWallBoardRepository.ts` | Repository 포트 |
| `src/adapters/repositories/JsonWallBoardRepository.ts` | IStoragePort 기반 구현 |
| `src/adapters/stores/useWallBoardStore.ts` | Zustand 저장소 |
| `src/adapters/components/Tools/RealtimeWall/WallBoardListView.tsx` | 목록 화면 |
| `src/adapters/components/Tools/RealtimeWall/WallBoardThumbnail.tsx` | 카드 mini-preview (§3.5.1a) |
| `src/adapters/components/Tools/RealtimeWall/RealtimeWallColumnEditor.tsx` | 컬럼 편집 드로어 |
| `src/adapters/components/Tools/RealtimeWall/RealtimeWallSessionSettings.tsx` | 라이브 설정 드로어 |
| `electron/ipc/realtimeWallBoard.ts` | IPC 핸들러 (list/load/save/update-meta/delete/clone) |

### 7.2 수정 파일

| 경로 | 변경 |
|---|---|
| `src/domain/entities/RealtimeWall.ts` | WallBoard/WallBoardId/WallApprovalMode 추가, likes → teacherStarred |
| `src/domain/rules/realtimeWallRules.ts` | createWallPost/bulkApproveWallPosts/add·rename·reorder·removeWallColumn/cloneWallBoard/starRealtimeWallPost |
| `src/domain/rules/realtimeWallRules.test.ts` | 20+ 테스트 추가 (예상 총 60+) |
| `src/adapters/components/Tools/ToolRealtimeWall.tsx` | viewMode='list' 추가, Repository 통합, 자동저장 effect |
| `src/adapters/components/Tools/RealtimeWall/RealtimeWallCard.tsx` | LikeButton → StarButton, 아이콘·색상 |
| `src/adapters/components/Tools/RealtimeWall/types.ts` | onLike → onStar |
| `src/adapters/components/Tools/RealtimeWall/RealtimeWall{Kanban,Freeform,Grid,Stream}Board.tsx` | onStar 전달 |
| `src/adapters/components/Tools/RealtimeWall/RealtimeWallCreateView.tsx` | 승인 모드 단계 추가 |
| `electron/main.ts` | registerRealtimeWallBoardHandler 등록 + before-quit 훅 |
| `electron/preload.ts` | wallBoards.* API 노출 |
| `src/global.d.ts` | WallBoard IPC 타입 |
| `src/domain/entities/ToolResult.ts` | RealtimeWallResultData 폴드 호환 레이어 |

---

## 8. 테스트 전략

### 8.1 도메인 규칙 (unit, vitest)

| 규칙 | 테스트 수 예상 |
|---|---|
| createWallPost — 'manual' (기존 동작) | 2 |
| createWallPost — 'auto' (즉시 approved) | 2 |
| createWallPost — 'filter' (pending 폴백) | 1 |
| createWallPost — exhaustive switch 방어 (never branch) | 1 |
| bulkApproveWallPosts | 3 |
| addWallColumn | 3 |
| renameWallColumn | 3 |
| reorderWallColumns | 3 |
| removeWallColumn × 3 strategies | 6 |
| cloneWallBoard | 4 |
| heartRealtimeWallPost (likes 리네임, 아이콘 하트 유지) | 5 (기존 대체) |
| buildWallPreviewPosts (레이아웃별 상위 N개 추출) | 4 |

누적 64+ 테스트 (기존 40 + 신규 24+)

### 8.2 Repository 통합 테스트

`adapters/repositories/JsonWallBoardRepository.integration.test.ts`
- FakeStorage(in-memory) 기반
- list/load/save/updateMeta/delete/atomic write 검증

### 8.3 수동 QA (iter #5 교훈 반영)

- Playwright로 보드 생성 → fs.stat로 wall-boards/{id}.json 바이트 확인
- 30초 대기 후 자동저장 파일 mtime 갱신 확인
- before-quit 시뮬(`app.quit()`) → dirty 보드 저장 확인

---

## 9. Open Questions (Plan §8 대응)

| # | 질문 | 기본 제안 |
|---|---|---|
| 1 | 목록 썸네일 형태 | 레이아웃 아이콘 + 메타(카드수/최종 세션)만. mini-preview는 v1.13.1 |
| 2 | 재열기 시 short-code | 매번 새로 생성 (보안 회전). "고정 코드" 옵션은 v1.13.2 |
| 3 | manual→auto 전환 시 pending | 확인 대화 + 일괄 승인 (§4.3) |
| 4 | 복제 title 한/영 | **확정: 한국어 "(복제)"**. 쌤핀 코드베이스
     grep 결과 기존 "(복제)"/"(사본)" UI 관례 없음(useSurveyStore는
     API 파라미터 기반). 한국어 UI 원칙 + FGI 자연스러움 근거. |
| 5 | 별 카운트 vs 바이너리 | **카운트 유지**, 강조 임계값만 설정 가능. 바이너리는 제품 정의 변경 필요 |
| 6 | likes → teacherStarred 호환 레이어 | 1회 릴리즈 임시 fallback (§2.5) |

---

## 10. 수용 기준 (v1.13.0 릴리즈 가능 조건)

"구현 완료" 판정 기준 = **본 Design의 §2.6 / §3.7 / §4.6 / §5.4 / §6.5
각 섹션 체크리스트 전 항목 PASS**. 항목별 근거:

- [ ] §2.6 [E] 리네임 — `rg 'likes|favorite|onLike'` 0 + star 테스트 5케이스
- [ ] §3.7 [A] 영속화 — fs.stat 검증 + 재열기 posts 복원 + 자동저장 주기
- [ ] §4.6 [C] 승인 정책 — exhaustive switch + bulkApprove 3케이스
- [ ] §5.4 [B] 컬럼 편집 — 4규칙 + 3 removeStrategy + 최소 2컬럼 가드
- [ ] §6.5 [D] 복제 — posts 비움 + id 재생성 + deep clone
- [ ] 도메인 규칙 테스트 60+ 전수 통과 (vitest 기준)
- [ ] Playwright 수동 QA 3종 PASS (생성/재열기/자동저장 파일 바이트)
- [ ] 병렬 리뷰 통과: 각 단계마다 code-reviewer-low + bkit:code-analyzer
      (보안 민감 단계에는 security-reviewer 추가)
- [ ] 기존 feature/realtime-wall 14커밋 기능 회귀 0 (단계 1~6 수동 재확인)
- [ ] 기존 PastResults 스냅샷 로드·표시 정상 (후방 호환)

본 설계서가 참조하는 기존 plan은 `realtime-wall-v1.13-enhancement.plan.md`
이며, 이전 `realtime-wall.plan.md` (v1.2, 단계 1~6 범위)는 하위 호환
체크리스트로만 역할을 남긴다.
