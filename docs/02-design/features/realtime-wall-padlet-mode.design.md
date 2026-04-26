---
template: design
version: 0.1
feature: realtime-wall-padlet-mode
date: 2026-04-24
author: cto-lead (consult: product-manager / frontend-architect / security-architect / infra-architect)
project: ssampin
version_target: v1.14.x
plan: docs/01-plan/features/realtime-wall-padlet-mode.plan.md
---

# 쌤핀 실시간 담벼락 — 패들렛 모드 설계서

> 대응 Plan: [`realtime-wall-padlet-mode.plan.md`](../../01-plan/features/realtime-wall-padlet-mode.plan.md) (Phase P1~P3)

---

## 0. 핵심 설계 원칙 (못박기)

### 0.1 교사·학생 동일 뷰 원칙 (Padlet 원칙)

> **학생과 교사는 같은 보드 화면을 본다. 차이는 오로지 교사 오버레이 권한 8종 뿐이다.**

이 원칙이 깨지면 본 Feature의 존재 이유가 사라진다. 모든 설계 결정은 이 원칙에 종속된다:

- 같은 카드 컴포넌트 (`RealtimeWallCard`) 두 entry에서 재사용
- 같은 4 보드 컴포넌트 (`Kanban/Freeform/Grid/Stream`) 두 entry에서 재사용
- 카드 위치/크기/배경/내용은 학생 화면과 교사 화면이 **픽셀 단위 일치**
- 교사 권한 표면(승인 버튼, 설정 드로어, 큐레이션 액션)은 학생 컴포넌트 트리에 **DOM 단위로 부재** (CSS hidden 의존 금지)
- 색상도 통일: sp-bg(#0a0e17), sp-card(#1a2332), sp-border(#2a3548) 등 동일 토큰

### 0.2 영속성 원칙

좋아요·댓글은 모두 WallBoard 스냅샷에 영속. 휘발성 클라이언트 상태는 허용하지 않는다 (사용자 결정 #2).

### 0.3 단계 진입 원칙

P1 통과 없이 P2 시작 금지. P2 통과 없이 P3 시작 금지. 각 Phase Match Rate 90%+ 도달 시 다음 Phase.

---

## 1. 구현 순서 (의존성)

```
[P1] 학생 뷰 대칭화 (read-only)
       │  ─ 교사 컴포넌트 재사용 + WebSocket 브로드캐스트 4종 + 학생 React entry
       │
       ▼
[P2] 학생 좋아요·댓글
       │  ─ 도메인 엔티티 확장 + WebSocket 메시지 3종 + UI 컴포넌트 + rate limit
       │
       ▼
[P3] 학생 카드 추가 패들렛화
          ─ 보드 화면 내 FAB + 모달 + approvalMode 분기 UX + 잠금 토글
```

각 Phase 완료 기준:
- TypeScript 0 error
- `npm run build` + `vite build --config vite.student.config.ts` 모두 성공
- 도메인 규칙 unit test 신규 규칙당 최소 5 케이스
- WebSocket 통합 테스트 PASS (Phase별 시나리오 §10 참조)
- 본 Design 해당 섹션 "검증 체크리스트" 전 항목 PASS
- 병렬 리뷰 통과 (code-reviewer-low + bkit:code-analyzer + security-reviewer P2 필수)

---

## 2. 데이터 모델 변화

### 2.1 기존 엔티티 확장 (Phase P2)

**위치**: `src/domain/entities/RealtimeWall.ts` (기존 파일에 필드 추가)

```ts
export interface RealtimeWallPost {
  readonly id: string;
  readonly nickname: string;
  readonly text: string;
  readonly linkUrl?: string;
  readonly linkPreview?: RealtimeWallLinkPreview;
  readonly status: RealtimeWallPostStatus;
  readonly pinned: boolean;
  /** 교사 로컬 하트 카운터. v1.13에서 도입. 학생 화면 표시 여부는 §5.3 옵션. */
  readonly teacherHearts?: number;
  readonly submittedAt: number;
  readonly kanban: RealtimeWallKanbanPosition;
  readonly freeform: RealtimeWallFreeformPosition;

  // ============ Phase P2 신규 필드 (모두 optional, 무손실 마이그레이션) ============

  /**
   * 학생이 누른 좋아요 집계. 익명 카운트.
   * 교사의 teacherHearts와 시각·필드명 모두 분리 (사용자 결정 #2 + Plan §5).
   */
  readonly likes?: number;

  /**
   * 좋아요를 누른 학생 sessionToken 배열 (중복 누름 방지 + unlike 동작).
   * 비교사 식별. PIPA 위반 없음 — 임의 토큰, 학생 ID 아님.
   * 길이 제한: 최대 1000개 (한 카드에 1000명이 누르면 그만 — UI에 +1000 표시).
   */
  readonly likedBy?: readonly string[];

  /**
   * 학생 댓글 배열. 카드당 최대 50개 (도메인 규칙 강제).
   * 교사 댓글 삭제 권한 (§5.5).
   */
  readonly comments?: readonly RealtimeWallComment[];
}
```

**필드 추가 근거**:
- 모두 `optional` — v1.13.x에서 저장된 데이터 로드 시 `undefined`로 들어옴 → §8 마이그레이션이 기본값 주입
- `likes` 별도 카운트 필드 vs `likedBy.length` 계산값: 직렬화 후 빠른 표시를 위해 양쪽 보관 (도메인 규칙이 일관성 강제)
- `likedBy: readonly string[]`: 평균 0~50 항목, 최악 1000. 직렬화 크기 한 카드당 ~30KB 상한

### 2.2 신규 엔티티: RealtimeWallComment (Phase P2)

**위치**: `src/domain/entities/RealtimeWall.ts` (같은 파일에 export 추가)

```ts
/**
 * 학생 댓글. 평면 구조 (대댓글 없음). 교사·학생 모두 작성 가능하지만
 * 본 Plan에서는 학생 입력만 다룬다 (교사 댓글 UX는 별도 Phase).
 */
export interface RealtimeWallComment {
  /** 댓글 식별자 (생성 시 generateUUID). */
  readonly id: string;

  /** 댓글이 달린 부모 post.id (역참조 편의용 — 직렬화는 post.comments 안). */
  readonly postId: string;

  /** 작성자 닉네임 (1~20자). 학생 자체 카드 닉네임과 별개로 매번 입력 가능. */
  readonly nickname: string;

  /** 댓글 본문 (1~200자). 도메인 규칙 강제. */
  readonly text: string;

  /** UTC ms timestamp. */
  readonly createdAt: number;

  /**
   * 작성자 sessionToken (브라우저 측 임의 ID).
   * 학생 ID 아님 — PIPA 위반 X. 단순 동일 학생 식별용.
   * 본인 삭제 권한은 v1.14에서 부여 안 함 (Plan §7 결정).
   */
  readonly sessionToken: string;
}
```

### 2.3 WallBoard는 변경 없음

P2 진입 시점에도 `WallBoard` 인터페이스 자체는 변경 없음. `posts: readonly RealtimeWallPost[]` 안의 각 post가 위 새 필드를 가질 뿐. 무손실 마이그레이션 보장.

---

## 3. 도메인 규칙 신설 (Phase P2)

**위치**: `src/domain/rules/realtimeWallRules.ts`

### 3.1 toggleStudentLike

```ts
/**
 * 학생 좋아요 토글. 같은 sessionToken이 이미 있으면 unlike, 없으면 like.
 *
 * @param posts 현재 보드 posts
 * @param postId 대상 카드 id
 * @param sessionToken 학생 브라우저 토큰
 * @returns 변경된 posts 배열 (해당 post의 likes/likedBy만 수정)
 *
 * 제약:
 * - 한 카드 likedBy 최대 1000명 (초과 시 입력 무시)
 * - postId 미존재 시 입력 무시 (원본 반환)
 */
export function toggleStudentLike(
  posts: readonly RealtimeWallPost[],
  postId: string,
  sessionToken: string,
): RealtimeWallPost[]
```

**테스트 케이스 (5+)**:
1. 처음 누름 → likes +1, likedBy에 sessionToken 추가
2. 두 번째 누름 (같은 토큰) → likes -1, likedBy에서 토큰 제거
3. 다른 토큰 + 같은 카드 → likes +1
4. likedBy 1000명 도달 시 추가 입력 무시 (likes 1000 유지)
5. postId 미존재 → 원본 반환
6. 빈 likedBy + likes 0 시작 시 like → likes 1, likedBy [token]

### 3.2 addStudentComment

```ts
/**
 * 학생 댓글 추가. 도메인 규칙 강제:
 * - 닉네임 1~20자
 * - 본문 1~200자 (trim 후 검증)
 * - 카드당 댓글 최대 50개 (초과 시 입력 무시)
 *
 * @param posts 현재 보드 posts
 * @param postId 대상 카드
 * @param input { nickname, text, sessionToken }
 * @param now Date.now() (테스트용 주입)
 * @returns 변경된 posts 배열 (해당 post.comments에 신규 댓글 append)
 *
 * 입력 무효 시 원본 반환 (예외 던지지 않음 — 서버 측에서 사전 검증 후 호출).
 */
export interface StudentCommentInput {
  readonly nickname: string;
  readonly text: string;
  readonly sessionToken: string;
}

export function addStudentComment(
  posts: readonly RealtimeWallPost[],
  postId: string,
  input: StudentCommentInput,
  now: number,
): RealtimeWallPost[]
```

**테스트 케이스 (5+)**:
1. 정상 댓글 → comments 길이 +1, id/createdAt 정상
2. 닉네임 빈 문자열 → 원본 반환
3. 본문 201자 → 원본 반환 (200자 ok)
4. 카드당 댓글 50개 도달 → 51번째 무시
5. postId 미존재 → 원본 반환
6. trim 검증: 닉네임 "   민수   " → "민수"로 저장

### 3.3 removeStudentComment

```ts
/**
 * 댓글 삭제. 교사 권한 (Plan §5 #5).
 * 학생 본인 삭제 권한은 v1.14에서 미부여 (Plan §7 결정).
 *
 * @returns 변경된 posts 배열 (해당 post.comments에서 commentId 제거)
 */
export function removeStudentComment(
  posts: readonly RealtimeWallPost[],
  postId: string,
  commentId: string,
): RealtimeWallPost[]
```

**테스트 케이스 (5+)**:
1. 정상 삭제 → comments 길이 -1
2. commentId 미존재 → 원본 반환
3. postId 미존재 → 원본 반환
4. 빈 comments에서 삭제 시도 → 원본 반환
5. 같은 commentId 두 번 삭제 (멱등성) → 두 번째는 noop

### 3.4 정규화 도우미 함수

```ts
/**
 * v1.13.x WallBoard 로드 시 likes/likedBy/comments 기본값 주입.
 * 마이그레이션 §8 적용 지점.
 */
export function normalizePostForPadletMode(
  post: RealtimeWallPost,
): RealtimeWallPost {
  return {
    ...post,
    likes: post.likes ?? 0,
    likedBy: post.likedBy ?? [],
    comments: post.comments ?? [],
  };
}

export function normalizeBoardForPadletMode(
  board: WallBoard,
): WallBoard {
  return {
    ...board,
    posts: board.posts.map(normalizePostForPadletMode),
  };
}
```

---

## 4. WebSocket 메시지 프로토콜

### 4.1 설계 원칙

- 모든 메시지 `{ type: '...' }` discriminated union
- 서버→클라이언트 송신 메시지는 TypeScript 타입으로만 강제 (서버는 신뢰 가능)
- 클라이언트→서버 수신 메시지는 **Zod 런타임 검증** 필수 (외부 입력 신뢰 불가)
- 모든 텍스트 필드는 서버에서 `escapeHtml` 후 broadcast (XSS 방어)

### 4.2 클라이언트 → 서버 (학생 입력)

| Type | Phase | Schema | Validation |
|------|-------|--------|------------|
| `join` | P1 (기존) | `{ type: 'join', sessionToken: string }` | sessionToken 1~64자 |
| `submit` | P3 (기존, 모달화) | `{ type: 'submit', sessionToken: string, nickname: string, text: string, linkUrl?: string }` | nickname 1~20자, text 1~maxTextLength, linkUrl URL 검증 |
| `like-toggle` | P2 신규 | `{ type: 'like-toggle', sessionToken: string, postId: string }` | postId UUID 형식, rate limit 30/분 |
| `comment-add` | P2 신규 | `{ type: 'comment-add', sessionToken: string, postId: string, nickname: string, text: string }` | nickname 1~20자, text 1~200자, rate limit 5/분 |

**Zod 스키마 예시** (P2 진입 시 추가):
```ts
import { z } from 'zod';

const LikeToggleSchema = z.object({
  type: z.literal('like-toggle'),
  sessionToken: z.string().min(1).max(64),
  postId: z.string().uuid().or(z.string().min(1).max(64)),  // generateUUID 호환
});

const CommentAddSchema = z.object({
  type: z.literal('comment-add'),
  sessionToken: z.string().min(1).max(64),
  postId: z.string().min(1).max(64),
  nickname: z.string().min(1).max(20),
  text: z.string().min(1).max(200),
});
```

**대안 검토**: Zod 의존성 추가가 부담이면 수동 type guard 함수도 동작은 같음. Zod 선택 근거: 보안 코드는 검증 누락이 치명적. P2부터 도입하면 1회 비용으로 미래 확장(filter 모드 등) 모두 커버.

### 4.3 서버 → 클라이언트 (브로드캐스트)

| Type | Phase | Recipient | Payload |
|------|-------|-----------|---------|
| `wall` | P1 (기존) | 신규 join 학생 1명 | `{ type: 'wall', title: string, maxTextLength: number }` |
| `submitted` | P1 (기존) | 제출자 1명 | `{ type: 'submitted' }` |
| `already_submitted` | P1 (기존) | 제출자 1명 | `{ type: 'already_submitted' }` |
| `closed` | P1 (기존) | 전체 | `{ type: 'closed' }` |
| `error` | P1 (기존, 확장) | 1명 | `{ type: 'error', message: string }` |
| **`wall-state`** | P1 신규 | 신규 join 1명 | `{ type: 'wall-state', board: WallBoardSnapshot }` (전체 보드 초기 동기화) |
| **`post-added`** | P1 신규 | 전체 | `{ type: 'post-added', post: RealtimeWallPost }` |
| **`post-updated`** | P1 신규 | 전체 | `{ type: 'post-updated', postId: string, patch: Partial<RealtimeWallPost> }` |
| **`post-removed`** | P1 신규 | 전체 | `{ type: 'post-removed', postId: string }` |
| **`like-toggled`** | P2 신규 | 전체 | `{ type: 'like-toggled', postId: string, likes: number, likedBy: readonly string[] }` |
| **`comment-added`** | P2 신규 | 전체 | `{ type: 'comment-added', postId: string, comment: RealtimeWallComment }` |
| **`comment-removed`** | P2 신규 | 전체 | `{ type: 'comment-removed', postId: string, commentId: string }` |
| **`student-form-locked`** | P3 신규 | 전체 | `{ type: 'student-form-locked', locked: boolean }` (교사가 학생 카드 추가 차단 토글) |

**WallBoardSnapshot 정의** (학생용 경량 — 교사 전용 필드 제외):
```ts
/**
 * 학생용 보드 스냅샷.
 * - hidden post 제외
 * - teacherHearts는 §5.3 옵션에 따라 포함/제외
 * - approvalMode/createdAt/updatedAt 등 교사 전용 메타 제외
 */
interface WallBoardSnapshot {
  readonly title: string;
  readonly layoutMode: RealtimeWallLayoutMode;
  readonly columns: readonly RealtimeWallColumn[];
  readonly posts: readonly RealtimeWallPost[];  // status==='approved'만
  readonly studentFormLocked: boolean;  // P3 — 학생 카드 추가 잠금 상태
}
```

### 4.4 메시지 ordering 보장

- 모든 서버→클라이언트 메시지는 **server timestamp** 포함 (`sentAt: number`)
- 클라이언트는 같은 postId의 메시지를 sentAt으로 정렬 후 적용
- WebSocket은 TCP 기반 — 같은 연결 내 메시지 순서는 보장됨. 단 재연결 직후 wall-state push와 그 사이 들어온 update의 race는 sentAt으로 reconcile

---

## 5. UI 컴포넌트 트리 및 권한 매핑

### 5.1 학생 entry 컴포넌트 트리 (Phase P1)

```
src/student/
├── main.tsx                       # ReactDOM.createRoot
└── StudentRealtimeWallApp.tsx     # 최상위
    │
    ├── StudentJoinScreen          # 닉네임 입력 (기존 폼 흐름 유지, 내부 컴포넌트)
    │
    └── StudentBoardView           # 보드 본체 (join 완료 후)
        ├── StudentBoardHeader     # 제목 + 참여 인원 + (P3) 카드 추가 FAB
        │
        ├── (4 레이아웃 — 교사 컴포넌트 재사용)
        │   ├── RealtimeWallKanbanBoard   viewerRole='student'
        │   ├── RealtimeWallFreeformBoard viewerRole='student'
        │   ├── RealtimeWallGridBoard     viewerRole='student'
        │   └── RealtimeWallStreamBoard   viewerRole='student'
        │
        │   각 보드 안 →
        │     RealtimeWallCard viewerRole='student'
        │       ├── (P2) 학생 좋아요 버튼 (sky 색상)
        │       ├── (P2) 댓글 토글 버튼
        │       └── (P2) RealtimeWallCommentList + RealtimeWallCommentInput
        │
        └── (P3) StudentSubmitForm (모달, "+ 카드 추가" 클릭 시)
```

**중요**: 학생 entry가 import하는 트리에는 다음 교사 전용 컴포넌트가 절대 포함되지 않는다:
- `RealtimeWallApprovalSettingsDrawer`
- `RealtimeWallBoardSettingsDrawer`
- `RealtimeWallQueuePanel`
- `RealtimeWallLiveSharePanel`
- `RealtimeWallColumnEditor`
- `RealtimeWallResultView`
- `WallBoardListView`
- `WallBoardThumbnail`

빌드 시 import 그래프 검증 (P1 Phase 완료 기준에 포함).

### 5.2 교사 entry는 변경 최소

기존 `ToolRealtimeWall.tsx` + 13 컴포넌트 그대로 + `viewerRole` prop만 추가. 기본값 `'teacher'`로 기존 동작 호환.

### 5.3 viewerRole prop 시그니처

```ts
export type RealtimeWallViewerRole = 'teacher' | 'student';

export interface RealtimeWallCardProps {
  readonly post: RealtimeWallPost;
  readonly compact?: boolean;
  readonly actions?: React.ReactNode;
  readonly dragHandle?: React.ReactNode;
  readonly onOpenLink?: (url: string) => void;

  // viewerRole === 'teacher'에서만 의미 있는 권한 콜백 — 학생일 때 무시
  readonly onTeacherHeart?: (postId: string) => void;
  readonly onTogglePin?: () => void;
  readonly onHide?: () => void;

  // viewerRole === 'student'에서만 의미 있는 콜백 (Phase P2+)
  readonly onStudentLike?: (postId: string) => void;
  readonly onAddComment?: (postId: string, input: StudentCommentInput) => void;

  // 권한 분기의 핵심
  readonly viewerRole?: RealtimeWallViewerRole;  // 기본값 'teacher'

  // 학생 본인 sessionToken — like 토글의 like/unlike 판정에 필요
  readonly currentSessionToken?: string;

  // 교사 화면에 학생 좋아요 카운터 read-only 표시 여부 (옵션)
  readonly showStudentLikesForTeacher?: boolean;
}
```

**컴포넌트 내부 분기 예시**:
```tsx
function RealtimeWallCard({
  post, viewerRole = 'teacher', onTogglePin, onHide, onStudentLike, currentSessionToken, ...
}: RealtimeWallCardProps) {
  // 교사 전용 액션 — 학생 트리에서 DOM 자체에 없음 (CSS hidden 의존 X)
  const teacherActions = viewerRole === 'teacher' ? (
    <RealtimeWallCardActions onTogglePin={onTogglePin} onHide={onHide} />
  ) : null;

  // 학생 좋아요 — Phase P2부터
  const studentLikeButton = viewerRole === 'student' && onStudentLike ? (
    <StudentLikeButton
      count={post.likes ?? 0}
      hasLiked={(post.likedBy ?? []).includes(currentSessionToken ?? '')}
      onClick={() => onStudentLike(post.id)}
    />
  ) : null;

  // 교사 화면 학생 좋아요 카운터 read-only 표시 (옵션)
  const studentLikesReadOnly = viewerRole === 'teacher' && showStudentLikesForTeacher ? (
    <span className="text-[11px] text-red-400">학생 좋아요 {post.likes ?? 0}</span>
  ) : null;

  // 교사 하트 — §12 Q1 확정(2026-04-24): 학생에게도 read-only 노출.
  // viewerRole='student'면 onClick=undefined로 클릭 무동작, count만 표시.
  const teacherHeartButton = (
    <HeartButton
      count={post.teacherHearts ?? 0}
      onClick={viewerRole === 'teacher' ? () => onTeacherHeart?.(post.id) : undefined}
    />
  );

  return (
    <article ...>
      {/* 카드 본문 — 학생/교사 동일 */}
      <div className="absolute right-2 top-2">{teacherActions}</div>
      ...
      <div className="footer">
        {teacherHeartButton}
        {studentLikeButton}
        {studentLikesReadOnly}
      </div>
    </article>
  );
}
```

### 5.4 교사 권한 8종 컴포넌트 매핑 (Plan §5 강제 표)

| # | 권한 | viewerRole='teacher' 컴포넌트 | viewerRole='student' 노출 |
|---|------|------------------------------|---------------------------|
| 1 | 카드 승인/거부 | `RealtimeWallQueuePanel` | 학생 트리에 import 안 됨 |
| 2 | 카드 hidden 전환 | `RealtimeWallCardActions.onHide` | viewerRole 분기로 DOM 없음 |
| 3 | 카드 pinned 토글 | `RealtimeWallCardActions.onTogglePin` | viewerRole 분기로 DOM 없음 |
| 4 | teacherHearts +1 | `HeartButton.onClick` | §12 Q1 확정: **학생에게 count read-only 노출** (onClick=undefined, rose-200 outline으로 표시). 클릭 시 무동작 |
| 5 | 댓글 삭제 | `RealtimeWallCommentList.onRemove` | viewerRole='student'면 휴지통 아이콘 DOM 없음 |
| 6 | 보드 설정 변경 | `RealtimeWallBoardSettingsDrawer` | 학생 트리에 import 안 됨 |
| 7 | 학생 연결 현황 | `RealtimeWallLiveSharePanel` "참여 N명" | 학생 트리에 import 안 됨 |
| 8 | QR/URL 공유 패널 | `RealtimeWallLiveSharePanel` | 학생 트리에 import 안 됨 |

### 5.5 RealtimeWallCommentList / Input (Phase P2 신규)

**위치**: `src/adapters/components/Tools/RealtimeWall/RealtimeWallCommentList.tsx` + `RealtimeWallCommentInput.tsx`

```ts
export interface RealtimeWallCommentListProps {
  readonly comments: readonly RealtimeWallComment[];
  readonly viewerRole: RealtimeWallViewerRole;
  readonly currentSessionToken?: string;
  readonly onRemove?: (commentId: string) => void;  // 교사일 때만 prop 전달
}

export interface RealtimeWallCommentInputProps {
  readonly postId: string;
  readonly nicknameDefault?: string;  // 기존 join 닉네임 default
  readonly onSubmit: (input: StudentCommentInput) => void;
  readonly disabled?: boolean;  // rate limit 도달 시
}
```

UI 디자인:
- 댓글 목록은 카드 하단 collapsible 영역. 기본은 접힘, "댓글 N" 클릭 시 펼침
- 댓글 1개 = 닉네임 + 본문 + 시각(상대) + (교사만) 휴지통
- 입력은 textarea + 전송 버튼. Enter는 줄바꿈 (shift+Enter 아닌 Enter→submit으로 하면 IME 문제), 버튼만 전송
- sp-card 배경 위에 더 짙은 sp-bg 배경으로 댓글 영역 구분
- 색상: §12 Q5 확정(2026-04-24) — 학생 좋아요는 **red-400 filled heart**, 교사 하트는 **rose-200 outline heart** (아이콘 형태로도 구분, 색상+형태 이중 구분으로 오인 방지). v1.13 컨벤션 교사=rose-300에서 rose-200 outline으로 조정

---

## 6. 상태 관리 (Zustand)

### 6.1 useRealtimeWallSyncStore (Phase P1 신규)

**위치**: `src/adapters/stores/useRealtimeWallSyncStore.ts`

WebSocket 클라이언트 상태 + 연결 lifecycle 관리. **교사·학생 entry 모두 사용**.

```ts
interface RealtimeWallSyncState {
  readonly status: 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'error';
  readonly board: WallBoardSnapshot | null;
  readonly currentSessionToken: string;
  readonly retryCount: number;
  readonly lastError?: string;

  // actions
  connect: (url: string) => void;
  disconnect: () => void;
  applyMessage: (msg: ServerMessage) => void;  // discriminated union 처리

  // P2: 학생 액션
  toggleLike: (postId: string) => void;
  addComment: (postId: string, input: Omit<StudentCommentInput, 'sessionToken'>) => void;

  // 재연결 로직 — exponential backoff (1s/2s/4s/8s/16s, 최대 5회)
  // 5회 실패 시 status='error' + lastError 메시지
}
```

**applyMessage 핵심 로직** (server message → 로컬 board 업데이트):
```ts
applyMessage: (msg) => {
  switch (msg.type) {
    case 'wall-state':
      set({ board: msg.board });
      break;
    case 'post-added':
      set((s) => s.board ? { board: { ...s.board, posts: [...s.board.posts, msg.post] } } : s);
      break;
    case 'post-updated':
      set((s) => s.board ? {
        board: {
          ...s.board,
          posts: s.board.posts.map((p) => p.id === msg.postId ? { ...p, ...msg.patch } : p),
        }
      } : s);
      break;
    case 'post-removed':
      set((s) => s.board ? {
        board: { ...s.board, posts: s.board.posts.filter((p) => p.id !== msg.postId) }
      } : s);
      break;
    case 'like-toggled':
      set((s) => s.board ? {
        board: {
          ...s.board,
          posts: s.board.posts.map((p) =>
            p.id === msg.postId ? { ...p, likes: msg.likes, likedBy: msg.likedBy } : p,
          ),
        }
      } : s);
      break;
    case 'comment-added':
      set((s) => s.board ? {
        board: {
          ...s.board,
          posts: s.board.posts.map((p) =>
            p.id === msg.postId
              ? { ...p, comments: [...(p.comments ?? []), msg.comment] }
              : p,
          ),
        }
      } : s);
      break;
    case 'comment-removed':
      set((s) => s.board ? {
        board: {
          ...s.board,
          posts: s.board.posts.map((p) =>
            p.id === msg.postId
              ? { ...p, comments: (p.comments ?? []).filter((c) => c.id !== msg.commentId) }
              : p,
          ),
        }
      } : s);
      break;
    // ...wall, submitted, already_submitted, closed, error
  }
}
```

### 6.2 교사 측 useWallBoardStore와의 관계

기존 `useWallBoardStore` (v1.13)는 **로컬 영속 보드 관리** (CRUD + 자동저장). 본 패들렛 모드는 **라이브 동기화**가 추가 — `useRealtimeWallSyncStore`가 board 상태를 유지하되, 교사 측에서는 sync 결과를 useWallBoardStore에 반영(영속화).

**경계 규칙**:
- `useWallBoardStore`: WallBoard 영속 — 자동저장 / before-quit
- `useRealtimeWallSyncStore`: WebSocket 동기화 — 라이브 세션 중 게시물 상태
- 교사 측에서만 둘이 양방향 sync (학생 입력 도착 시 sync store → WallBoardStore.markDirty)
- 학생 측에서는 useRealtimeWallSyncStore 단독 사용

---

## 7. IPC 채널 시그니처

### 7.1 기존 5채널 (변경 없음)

```
realtime-wall:start          (R→M) 라이브 세션 시작 → port + localIPs 반환
realtime-wall:stop           (R→M) 라이브 세션 종료
realtime-wall:tunnel-available  (R→M) cloudflared 설치 여부
realtime-wall:tunnel-install (R→M) cloudflared 설치
realtime-wall:tunnel-start   (R→M) 터널 시작 → tunnelUrl 반환
```

### 7.2 신규 채널 (Phase P1)

| 채널 | 방향 | 용도 |
|------|------|------|
| `realtime-wall:broadcast` | R→M | 교사 측 상태 변경 → Main이 모든 학생에게 broadcast (post-added/updated/removed) |
| `realtime-wall:student-like` | M→R | 학생 좋아요 도착 알림 (교사 useRealtimeWallSyncStore 갱신) |
| `realtime-wall:student-comment` | M→R | 학생 댓글 도착 알림 |
| `realtime-wall:student-form-locked` | R→M | 교사가 학생 카드 추가 잠금 토글 (P3) |

**preload 노출 API 시그니처** (global.d.ts에 반영):
```ts
interface ElectronAPI {
  realtimeWall: {
    start: (args: { title: string; maxTextLength: number }) => Promise<{ port: number; localIPs: string[] }>;
    stop: () => Promise<void>;
    tunnelAvailable: () => Promise<boolean>;
    tunnelInstall: () => Promise<void>;
    tunnelStart: () => Promise<{ tunnelUrl: string }>;

    // Phase P1+
    broadcast: (msg: BroadcastableServerMessage) => Promise<void>;
    setStudentFormLocked: (locked: boolean) => Promise<void>;  // P3

    // Renderer 수신 이벤트
    onConnectionCount: (cb: (data: { count: number }) => void) => () => void;
    onStudentSubmitted: (cb: (data: { post: RealtimeWallPost; totalSubmissions: number }) => void) => () => void;
    onStudentLike: (cb: (data: { postId: string; sessionToken: string }) => void) => () => void;     // P2
    onStudentComment: (cb: (data: { postId: string; comment: RealtimeWallComment }) => void) => () => void;  // P2
  };
}
```

`BroadcastableServerMessage`는 §4.3의 서버→클라이언트 메시지 타입 union. Main이 그대로 모든 ws 클라이언트에게 송신.

### 7.3 Main 프로세스 broadcast 함수

```ts
// electron/ipc/realtimeWall.ts (Phase P1 추가)

function broadcastToStudents(msg: BroadcastableServerMessage): void {
  if (!session) return;
  const payload = JSON.stringify({ ...msg, sentAt: Date.now() });
  for (const client of session.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(payload);
      } catch {
        // 개별 클라이언트 실패는 swallow
      }
    }
  }
}

ipcMain.handle('realtime-wall:broadcast', (_e, msg: BroadcastableServerMessage) => {
  broadcastToStudents(msg);
});
```

---

## 8. 마이그레이션 (Phase P2)

### 8.1 기존 v1.13.x WallBoard 데이터 호환

v1.13.x에서 저장된 `wall-board-{id}.json`의 각 post에는 `likes`/`likedBy`/`comments` 필드가 없음. P2 진입 시 다음 단계 적용:

**1. Repository 로드 시 normalizer 적용**

`adapters/repositories/JsonWallBoardRepository.ts`:
```ts
import { normalizeBoardForPadletMode } from '@domain/rules/realtimeWallRules';

async load(id: WallBoardId): Promise<WallBoard | null> {
  const raw = await this.storage.read(`wall-board-${id}.json`);
  if (!raw) return null;
  const board = JSON.parse(raw) as WallBoard;
  return normalizeBoardForPadletMode(board);
}
```

**2. Main 프로세스에도 동일 normalizer 적용**

`electron/ipc/realtimeWallBoard.ts:75-84` `readBoardSync`에 normalizer 호출 추가. 중복 코드처럼 보이지만 두 경로(Main / Renderer)가 모두 normalize된 데이터를 다루도록 보장.

**3. Save 시 정규화된 board 저장**

`save()`는 새 필드 포함된 board 그대로 직렬화. 다음 로드부터는 normalizer가 noop.

### 8.2 schema version 정책

P1+P2는 **schema version bump 없음**. optional 필드 추가만이라 v1.13.x 데이터 100% 무손실 호환.

P3 완료 시점에 v1.14.x 안정화되면 schema version 1→2 bump 검토 (별도 결정).

### 8.3 다운그레이드 시나리오

- v1.14.x → v1.13.x 다운그레이드 시: v1.13.x 로더는 likes/likedBy/comments 필드를 모르므로 단순 무시. 데이터는 디스크에 남아있음.
- 다시 v1.14.x로 업그레이드 시: 그대로 복원 (필드 보존)
- **단, v1.13.x에서 보드를 수정·저장하면 새 필드 손실 가능성** — release note에 다운그레이드 비권장 명시

### 8.4 검증 체크리스트

- [ ] v1.13.x WallBoard 파일을 v1.14.x에서 로드 → 모든 post에 likes=0, likedBy=[], comments=[] 주입 확인
- [ ] normalize 후 save → 디스크 파일에 새 필드 포함 확인
- [ ] 빈 보드 (posts=[])도 정상 normalize
- [ ] teacherHearts 필드 보존 (별도 마이그레이션 충돌 없음)

---

## 9. 보안 설계

### 9.1 sessionToken 위협 모델

| 공격 | 영향 | 방어 |
|------|------|------|
| sessionToken 리셋 후 카드 다중 제출 | 학생 1인 N카드 — UX 오염 | (1) IP+UA 보조 키로 rate limit, (2) 교사 hidden 즉시 동기화, (3) Plan §6 위협 인정 |
| 다른 학생의 sessionToken 추측 | unlike/댓글 삭제 우회 | (1) sessionToken은 학생 브라우저에서 `crypto.randomUUID()` 생성 — 추측 사실상 불가, (2) 본인 댓글 삭제 권한은 v1.14에서 미부여 |
| WebSocket 직접 접속 (cloudflared 우회) | rate limit·검증 우회 | cloudflared 터널 URL 자체가 비공개, 직접 IP 노출 없음. WebSocket origin 검증은 **v1.14에서 구현하지 않음** (cloudflared 네트워크 격리 신뢰) — Future Work |

### 9.2 XSS 방어

**입력 측**:
- 닉네임/본문/댓글 모두 도메인 규칙 길이 검증
- `<`/`>`/`&`/`"`/`'` 등은 그대로 보존 (React가 자동 escape)
- `dangerouslySetInnerHTML` 사용 금지 — 학생 entry CSP에 명시: `Content-Security-Policy: script-src 'self'; object-src 'none'`

**broadcast 측**:
- 서버는 입력을 그대로 직렬화해 broadcast (React escape 신뢰)
- linkUrl만 별도 검증 (http/https 스킴 검증, javascript: 차단 — 기존 `normalizeLink()` 패턴 유지)

### 9.3 Rate Limit

WebSocket 핸들러 측에서 `Map<sessionToken, { likes: TimestampWindow, comments: TimestampWindow, ... }>` 유지:

```ts
interface TimestampWindow {
  readonly windowStartMs: number;
  readonly count: number;
}

const RATE_LIMITS = {
  like: { perMinute: 30 },
  comment: { perMinute: 5 },
  submit: { perSession: 1 },  // 1 카드/세션 (기존)
} as const;
```

초과 시 클라이언트에 `error` 메시지 송신 + 해당 입력 무시. 60초 sliding window.

**보조 키**: IP+UA 해시도 같은 limit에 포함 (sessionToken 리셋 우회 방지).

### 9.4 페이로드 크기 상한

| 항목 | 상한 | 근거 |
|------|------|------|
| 닉네임 | 20자 | v1.13 정책 유지 |
| 카드 본문 | maxTextLength (기본 280, 최대 1000) | v1.13 정책 유지 |
| 링크 URL | 2000자 | URL 표준 상한 |
| 댓글 본문 | 200자 | 패들렛/슬랙 정도 — 토론 적정 |
| 카드당 댓글 수 | 50개 | UI 가독성 + 직렬화 크기 |
| 카드당 likedBy | 1000개 | 한 학급 100명 × 10배 — 충분 |

WebSocket 메시지 자체 크기 상한: **64KB** (Node.js ws 기본 maxPayload). 한 카드의 모든 데이터 + 50 댓글 + 1000 likedBy = 약 50KB → 안전.

### 9.5 CSP 메타 태그 (학생 entry)

`src/student/index.html` (또는 vite plugin):
```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  connect-src 'self' wss://*.trycloudflare.com wss://*;
  frame-src https://www.youtube-nocookie.com;
  object-src 'none';
">
```

`unsafe-inline` style은 Tailwind 동적 클래스 때문에 불가피. style-src nonce 도입은 Future Work.

### 9.6 검증 체크리스트 [보안]

- [ ] Zod 검증 누락 입력 → 서버가 무시 + error 송신
- [ ] linkUrl `javascript:` 스킴 거부
- [ ] 댓글 200자 + `<script>` 페이로드 → 다른 클라이언트에서 escape되어 텍스트로만 표시
- [ ] sessionToken 같은 학생이 분당 31회 like → 31번째부터 error
- [ ] 같은 학생이 분당 6 댓글 → 6번째부터 error
- [ ] 카드당 51번째 댓글 시도 → 도메인 규칙이 무시
- [ ] WebSocket 메시지 65KB 페이로드 → ws가 close

---

## 10. 테스트 전략

### 10.1 도메인 규칙 (unit, vitest)

| 규칙 | 케이스 |
|------|--------|
| `toggleStudentLike` | 6+ |
| `addStudentComment` | 6+ |
| `removeStudentComment` | 5+ |
| `normalizePostForPadletMode` | 4 (likes/likedBy/comments 각 default 주입 + 기존 값 보존) |
| `normalizeBoardForPadletMode` | 2 (빈 posts / 다중 posts) |

신규 23+ 케이스. 기존 v1.13 285 + 신규 = 308+ 테스트.

### 10.2 WebSocket 통합 테스트

`electron/ipc/realtimeWall.integration.test.ts` (P1 신규):
- 시나리오 1: 학생 3명 join → 3 wall-state 수신
- 시나리오 2: 교사 카드 승인 → 모든 학생에게 post-added 도착 (latency < 200ms 검증)
- 시나리오 3: 교사 카드 hidden → post-removed 도착
- 시나리오 4 (P2): 학생 A like → 모든 클라이언트 like-toggled 동기화
- 시나리오 5 (P2): 학생 B 분당 31 like → 31번째 error 수신
- 시나리오 6 (P2): 같은 sessionToken 두 번 like → unlike 동작
- 시나리오 7 (P3): 교사 setStudentFormLocked(true) → 학생 카드 추가 시도 거부

### 10.3 부하 테스트 (P1 완료 기준)

`scripts/load-test-realtime-wall.mjs` 신규:
- 100 동시 ws 클라이언트 join
- 1초마다 1 like + 5초마다 1 comment 발생
- 5분간 평균 latency < 200ms, max < 500ms 유지 검증
- Node 메모리 사용량 모니터링 (1GB 이하 유지)

### 10.4 수동 QA (iter #5 교훈 — UI 토스트 ≠ 파일 바이트)

- Playwright로 학생 진입 → fs.stat로 wall-board-{id}.json 읽기 → likes/comments 영속화 확인
- before-quit 시 학생 좋아요 → 디스크 fsync 확인
- v1.13.x로 다운그레이드 후 다시 v1.14.x → 데이터 보존 확인

### 10.5 qa-strategist 자문 (Plan §1.4 결정 #4)

- TypeScript strict 모드라 도메인 규칙 단위 테스트 우선이 ROI 최고
- WebSocket 통합 테스트는 in-process ws 서버 + 클라이언트로 빠르게 (cloudflared 모킹 불필요)
- 부하 테스트는 P1 완료 기준에만 포함 (P2/P3는 단위 + 통합 위주)
- 수동 시나리오 체크리스트는 Notion에 별도 페이지 (사용자 가이드와 동일 위치)

---

## 11. 통합 파일 변경 목록

### 11.1 신규 파일

| 경로 | Phase | 설명 |
|------|-------|------|
| `src/student/main.tsx` | P1 | 학생 React entry point |
| `src/student/StudentRealtimeWallApp.tsx` | P1 | 최상위 컨테이너 |
| `src/student/StudentJoinScreen.tsx` | P1 | 닉네임 입력 화면 |
| `src/student/StudentBoardView.tsx` | P1 | 4 레이아웃 라우터 |
| `src/student/useStudentWebSocket.ts` | P1 | WebSocket 훅 (재연결 backoff) |
| `vite.student.config.ts` | P1 | 학생 entry 별도 빌드 설정 |
| `src/adapters/stores/useRealtimeWallSyncStore.ts` | P1 | WebSocket 동기화 상태 |
| `src/usecases/realtimeWall/BroadcastWallState.ts` | P1 | 상태 변경 → 메시지 변환 |
| `src/usecases/realtimeWall/HandleStudentLike.ts` | P2 | 학생 like 처리 |
| `src/usecases/realtimeWall/HandleStudentComment.ts` | P2 | 학생 comment 처리 |
| `src/adapters/components/Tools/RealtimeWall/RealtimeWallCommentList.tsx` | P2 | 댓글 목록 |
| `src/adapters/components/Tools/RealtimeWall/RealtimeWallCommentInput.tsx` | P2 | 댓글 입력 |
| `src/adapters/components/Tools/RealtimeWall/StudentLikeButton.tsx` | P2 | 학생 좋아요 버튼 (sky 색상) |
| `src/student/StudentSubmitForm.tsx` | P3 | 카드 추가 모달 (기존 폼 마이그레이션) |
| `electron/ipc/realtimeWall.integration.test.ts` | P1 | WebSocket 통합 테스트 |
| `scripts/load-test-realtime-wall.mjs` | P1 | 100 클라이언트 부하 테스트 |

### 11.2 수정 파일

| 경로 | 변경 |
|------|------|
| `src/domain/entities/RealtimeWall.ts` | likes/likedBy/comments 필드 + RealtimeWallComment + StudentCommentInput 추가 (P2) |
| `src/domain/rules/realtimeWallRules.ts` | toggleStudentLike/addStudentComment/removeStudentComment/normalizePostForPadletMode/normalizeBoardForPadletMode 추가 (P2) |
| `src/adapters/components/Tools/RealtimeWall/RealtimeWallCard.tsx` | viewerRole prop, StudentLikeButton 통합, 학생 좋아요 카운터 read-only 옵션 |
| `src/adapters/components/Tools/RealtimeWall/RealtimeWallCardActions.tsx` | viewerRole='student'면 null 반환 |
| `src/adapters/components/Tools/RealtimeWall/RealtimeWall{Kanban,Freeform,Grid,Stream}Board.tsx` | viewerRole prop 전파 |
| `src/adapters/components/Tools/RealtimeWall/types.ts` | RealtimeWallViewerRole + onStudentLike/onAddComment props 추가 |
| `electron/ipc/realtimeWall.ts` | broadcastToStudents 함수 + 신규 메시지 5종 송신 + 학생 like/comment 핸들러 + Zod 검증 + rate limit |
| `electron/ipc/realtimeWallHTML.ts` | **폐기** — 1-21 줄 정책 주석을 패들렛 모드로 재작성 후 학생 SPA로 위임. 함수 자체는 cloudflared가 `dist/student/index.html` 서빙으로 대체 |
| `electron/ipc/realtimeWallBoard.ts` | normalizePostForPadletMode 호출 추가 (P2 마이그레이션) |
| `src/adapters/repositories/JsonWallBoardRepository.ts` | load 시 normalize 적용 |
| `electron/preload.ts` | broadcast/setStudentFormLocked + onStudentLike/onStudentComment 노출 |
| `src/global.d.ts` | 새 IPC 시그니처 + 메시지 타입 |
| `package.json` | `build:student` 스크립트 추가 (`vite build --config vite.student.config.ts`), `electron:build`에서 동시 빌드 |

---

## 12. Open Questions (사용자 회신 완료 — 2026-04-24 확정)

| # | 질문 | **최종 확정** (사용자 2026-04-24) | 근거 |
|---|------|----------------------------------|------|
| 1 | 학생 화면에 teacherHearts 카운터 read-only 표시 여부 | **✅ 학생에게 노출** | 사용자 결정: "학생 노출". §5.3 카드 레이아웃에서 교사 하트도 표시. `HeartButton` viewerRole='student' 시 onClick=undefined, count만 표시 (rose-300, read-only) |
| 2 | Zod 의존성 추가 vs 수동 type guard | **✅ Zod 추가 (가장 최적의 방법)** | 사용자 결정: "가장 최적의 방법". 서브에이전트 권고와 일치 — 보안 검증 누락 위험 회피. P2부터 `zod` dependency 추가, `package.json` 반영 |
| 3 | 학생 입장 시 어떻게 닉네임 입력 — 기존처럼 join 화면 / 카드 추가 시점에만 | **join 시점 닉네임 (기존 동작 유지)** — Phase P3에서 카드 추가는 join 닉네임 default | No (기존 패턴 유지) |
| 4 | freeform 모드에서 다른 학생 카드 위치를 학생도 보는가 | **본다** — 동일 뷰 원칙 (Plan §0.1) | No (Plan 결정) |
| 5 | 학생 좋아요 색상 — sky / emerald / rose 외 다른 옵션 | **✅ 빨간색 (red-400)** | 사용자 결정: "빨간색". 기존 Design 잠정안 sky-300 → **red-400으로 변경**. ⚠️ teacherHearts(rose-300)와 색상 근접성 발생 — §5.3에서 아이콘 형태로 구분(학생=heart outline, 교사=heart fill) 또는 색상 톤 조정(학생=red-400 filled, 교사=rose-200 outline) 필요. P2 구현 시 디자인 QA에서 최종 확정 |
| 6 | WebSocket 재연결 실패 시 학생에게 어떤 메시지 | "연결이 끊어졌어요. 새로고침해 주세요" + 5회 backoff 후 명시 | No (UX 표준) |
| 7 | P3 학생 카드 추가 잠금 토글 위치 — LiveSharePanel / BoardSettingsDrawer | **✅ BoardSettingsDrawer (설정 드로어)** | 사용자 결정: "설정 드로어". 서브에이전트 잠정안과 일치 — 보드 단위 설정과 정합 |

---

## 13. 수용 기준 (각 Phase 릴리즈 가능 조건)

### Phase P1 수용 기준
- [ ] §10.2 통합 테스트 시나리오 1~3 PASS
- [ ] §10.3 부하 테스트 100 클라이언트 latency < 200ms PASS
- [ ] 학생 entry 번들 크기 < 500KB (gzipped) — 빌드 후 측정
- [ ] 학생 entry import 그래프에 교사 전용 컴포넌트(QueuePanel/Drawer/LiveSharePanel/ColumnEditor/ResultView/WallBoardListView/WallBoardThumbnail) **0** 발견 (수동 grep + import-cost)
- [ ] `realtimeWallHTML.ts` 정책 주석 패들렛 모드로 업데이트
- [ ] release note BREAKING 명시
- [ ] 사용자 가이드 + 챗봇 KB 업데이트

### Phase P2 수용 기준
- [ ] §10.1 도메인 규칙 23+ 케이스 PASS
- [ ] §10.2 통합 테스트 시나리오 4~6 PASS
- [ ] §9.6 보안 검증 체크리스트 전 항목 PASS
- [ ] §8.4 마이그레이션 검증 체크리스트 전 항목 PASS
- [ ] v1.13.x WallBoard 데이터 무손실 로드 + 새 필드 주입 확인 (fs.stat)
- [ ] 학생 좋아요 **red-400 filled**, 교사 하트 **rose-200 outline** 시각 분리 (색상+형태 이중) 디자인 QA PASS — §12 Q5 확정 반영
- [ ] 학생 화면에 teacherHearts count read-only 노출 동작 확인 — §12 Q1 확정 반영

### Phase P3 수용 기준
- [ ] §10.2 통합 테스트 시나리오 7 PASS
- [ ] FAB 클릭 → 모달 → 제출 → 보드 등장 (auto/manual 양쪽) 수동 QA PASS
- [ ] 학생 카드 추가 잠금 토글 동작 PASS
- [ ] BETA 배지 제거 검토 결정

### v1.14.x 안정화 (P1+P2+P3 통과 후)
- [ ] 도메인 규칙 308+ 테스트 전수 통과
- [ ] tsc 0 error, build 성공
- [ ] 기존 feature/realtime-wall 11 커밋 회귀 0
- [ ] schema version bump 검토 (별도 결정)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-24 | 초안 작성 — Plan §1~13 대응 설계. 엔티티 확장 / WebSocket 메시지 12종 protocol / viewerRole prop / 교사 권한 8종 컴포넌트 매핑 / Zustand 동기화 스토어 / 마이그레이션 / 보안 위협 모델 / 테스트 전략 / 13 신규 파일 + 13 수정 파일 명세 | cto-lead (consult: pm/frontend/security/infra) |
