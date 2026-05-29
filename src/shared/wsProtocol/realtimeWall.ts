/**
 * Realtime Wall WS 프로토콜 Zod 스키마 — β-Step3.5 (v2.0)
 *
 * Plan §2.1 / §2.2 Step 3.5 매핑. 메인 프로세스(electron/ipc/realtimeWall.ts) +
 * 학생 SPA(src/student/*) 양쪽이 import 해 신뢰 경계 단일 게이트로 사용한다.
 *
 * 모든 외부 입력은 신뢰 불가 — 베이스 서버가 parse 실패 시
 * `connection.close(1008, 'invalid-payload')` 로 종료.
 *
 * **회귀 보호 #2 SERVER_TRUSTED_BROADCAST**: 본 스키마들은 서버 → 학생 broadcast 의
 * 단일 진실 원천 (SoR). 서버는 ServerMessage 만 send, 학생은 ServerMessage 만 receive.
 * 학생이 송신하는 ClientMessage 는 서버가 parse 후 trusted state 로 변환해 broadcast.
 *
 * v1.15 → v2.0 누적:
 *   - 12 v1.15 server messages (wall-state · post-* · closed · error · like-toggled ·
 *     comment-added/removed · student-form-locked · boardSettings-changed · nickname-changed)
 *   - 5 v2.0 신규: tab-added · tab-deleted · tab-permission-changed · tab-renamed ·
 *     post-tab-moved (탭 CRUD broadcast).
 *
 * 단일 진실 원천 정합:
 *   - `BroadcastWallState.BroadcastableServerMessage` union 과 1:1 매칭 (use case 단의
 *     TypeScript union ↔ shared/wsProtocol 의 runtime Zod schema).
 *   - 본 모듈을 변경하면 `BroadcastWallState.ts` 도 동기화 필수.
 */

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────
// 공통 — 프로토콜 버전 + ID
// ─────────────────────────────────────────────────────────────

/** 학생 SPA + 메인 프로세스가 공유하는 프로토콜 버전 (스키마 변경 시 bump) */
export const REALTIME_WALL_PROTOCOL_VERSION = '2.0.0' as const;

/** UUID v4 — sessionToken 등 서버 발급 ID */
export const UuidV4Schema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

/** 카드 ID — 서버가 발급 (timestamp 기반 또는 nanoid). 형식 자유, 길이 1~64. */
export const PostIdSchema = z.string().min(1).max(64);

/** 댓글 ID — 카드와 동일 형식 */
export const CommentIdSchema = z.string().min(1).max(64);

/** 탭 ID — 도메인 식별자 (영문/숫자/하이픈), 1~64자 */
export const TabIdSchema = z.string().min(1).max(64);

/** 탭 제목 — UI 라벨 (한국어 포함), trim 후 1~30자 */
export const TabTitleSchema = z.string().trim().min(1).max(30);

/** 탭 권한 — 3종 enum (RealtimeWallTabPermission 과 1:1) */
export const TabPermissionSchema = z.enum(['all', 'teacher-only', 'role-gated']);

/** 카드 색상 — RealtimeWallCardColor 8색 union */
export const CardColorSchema = z.enum([
  'white',
  'yellow',
  'pink',
  'blue',
  'green',
  'purple',
  'orange',
  'gray',
]);

// ─────────────────────────────────────────────────────────────
// 클라이언트 → 서버 메시지 (학생 송신)
// ─────────────────────────────────────────────────────────────

/**
 * 학생 카드 제출. v2.0 에서 tabId 옵션 추가 (활성 탭 컨텍스트).
 * 회귀 #1 status filter — 서버가 카드 status 를 강제 (학생 송신 무시).
 */
export const SubmitCardClientSchema = z.object({
  type: z.literal('submit'),
  nickname: z.string().trim().min(1).max(20),
  text: z.string().max(1000),
  linkUrl: z.string().max(500).optional(),
  images: z.array(z.string()).max(5).optional(),
  pdfDataUrl: z.string().optional(),
  pdfFilename: z.string().max(255).optional(),
  color: CardColorSchema.optional(),
  pinHash: z
    .string()
    .regex(/^[0-9a-f]{64}$/i)
    .optional(),
  columnId: z.string().max(64).optional(),
  /** v2.0 — 활성 탭 컨텍스트. 미지정 시 서버가 DEFAULT_TAB_ID 백필. */
  tabId: TabIdSchema.optional(),
});

/** 학생 좋아요 토글 */
export const ToggleLikeClientSchema = z.object({
  type: z.literal('toggle-like'),
  postId: PostIdSchema,
});

/** 학생 댓글 추가 */
export const AddCommentClientSchema = z.object({
  type: z.literal('add-comment'),
  postId: PostIdSchema,
  nickname: z.string().trim().min(1).max(20),
  text: z.string().trim().min(1).max(500),
});

/** 학생 자기 카드 수정 (v2.1 Phase D) */
export const EditOwnCardClientSchema = z.object({
  type: z.literal('edit-own-card'),
  postId: PostIdSchema,
  text: z.string().max(1000).optional(),
  linkUrl: z.string().max(500).nullable().optional(),
  images: z.array(z.string()).max(5).optional(),
  pdfDataUrl: z.string().nullable().optional(),
  pdfFilename: z.string().max(255).nullable().optional(),
  color: CardColorSchema.optional(),
});

/** 학생 자기 카드 삭제 (soft delete — 회귀 #8) */
export const DeleteOwnCardClientSchema = z.object({
  type: z.literal('delete-own-card'),
  postId: PostIdSchema,
});

/**
 * 17 schemas 중 client-to-server 5종. 양방향 통합 discriminated union 은
 * `RealtimeWallClientMessageSchema` 로 별도 export.
 */
export const RealtimeWallClientMessageSchema = z.discriminatedUnion('type', [
  SubmitCardClientSchema,
  ToggleLikeClientSchema,
  AddCommentClientSchema,
  EditOwnCardClientSchema,
  DeleteOwnCardClientSchema,
]);
export type RealtimeWallClientMessage = z.infer<typeof RealtimeWallClientMessageSchema>;

// ─────────────────────────────────────────────────────────────
// 서버 → 클라이언트 메시지 (학생 수신) — 12 v1.15 + 5 v2.0
// ─────────────────────────────────────────────────────────────

/**
 * 카드 status enum (서버 측 권위 — 학생 송신 무시).
 *   - approved: 학생 화면 노출
 *   - hidden-by-author: placeholder 카드 (회귀 #8 보호)
 *   - pending: moderation='manual' 시 교사 승인 대기 (학생 broadcast 제외)
 *   - hidden: 교사 수동 숨김 (학생 broadcast 제외)
 */
export const PostStatusSchema = z.enum(['approved', 'hidden-by-author', 'pending', 'hidden']);

/** 댓글 status — 교사 삭제 시 'hidden' (배열 인덱스 보존) */
export const CommentStatusSchema = z.enum(['approved', 'hidden']);

/** 보드 단위 설정 (서버 → 클라이언트) — sanitizeBoardSettingsForStudents 통과 후 */
export const BoardSettingsSchema = z
  .object({
    version: z.literal(1),
    moderation: z.enum(['off', 'manual']),
    theme: z.unknown().optional(),
    /** β-Step8 — 학생 인라인 컴포저 토글 (G012-B 에서 settings 에 추가) */
    studentInlineComposerEnabled: z.boolean().optional(),
    /** β-Step11 — PIN 필수화 (신규 v2.0 보드 default true) */
    requirePin: z.boolean().optional(),
  })
  // settings 확장 가능 — 신규 필드(theme 등)는 zod unknown 으로 통과
  .passthrough();

/** 탭 메타 (서버 → 클라이언트) */
export const TabConfigSchema = z.object({
  id: TabIdSchema,
  title: TabTitleSchema,
  permission: TabPermissionSchema,
  order: z.number().int().min(0),
});

/** 카드 메타 (서버 → 클라이언트) — RealtimeWallPost 와 1:1 정합 */
export const PostSchema = z
  .object({
    id: PostIdSchema,
    nickname: z.string().min(1).max(20),
    text: z.string().max(1000),
    status: PostStatusSchema,
    pinned: z.boolean(),
    submittedAt: z.number().int().nonnegative(),
    linkUrl: z.string().max(500).optional(),
    color: CardColorSchema.optional(),
    likes: z.number().int().nonnegative().optional(),
    likedBy: z.array(z.string()).optional(),
    teacherHearts: z.number().int().nonnegative().optional(),
    comments: z.array(z.unknown()).optional(),
    images: z.array(z.string()).optional(),
    pdfUrl: z.string().optional(),
    pdfFilename: z.string().optional(),
    /** v2.0 (β-Step1) — 카드 소속 탭 ID. 미존재 = legacy 카드. */
    tabId: TabIdSchema.optional(),
  })
  .passthrough();

// 1. wall-state — 초기 스냅샷 (BroadcastWallState.WallBoardSnapshotForStudent 와 정합)
export const WallStateServerSchema = z.object({
  type: z.literal('wall-state'),
  board: z
    .object({
      title: z.string().max(100),
      layoutMode: z.enum(['kanban', 'freeform', 'grid', 'stream']),
      columns: z.array(z.unknown()),
      posts: z.array(PostSchema),
      studentFormLocked: z.boolean(),
      settings: BoardSettingsSchema,
      /** v2.0 (β-Step8) — teacher-only 제외 + order sort 후 broadcast */
      tabs: z.array(TabConfigSchema).optional(),
    })
    .passthrough(),
});

// 2. post-added
export const PostAddedServerSchema = z.object({
  type: z.literal('post-added'),
  post: PostSchema,
});

// 3. post-updated
export const PostUpdatedServerSchema = z.object({
  type: z.literal('post-updated'),
  postId: PostIdSchema,
  patch: z.record(z.string(), z.unknown()),
});

// 4. post-removed
export const PostRemovedServerSchema = z.object({
  type: z.literal('post-removed'),
  postId: PostIdSchema,
});

// 5. closed
export const ClosedServerSchema = z.object({ type: z.literal('closed') });

// 6. error
export const ErrorServerSchema = z.object({
  type: z.literal('error'),
  message: z.string().min(1).max(300),
});

// 7. like-toggled
export const LikeToggledServerSchema = z.object({
  type: z.literal('like-toggled'),
  postId: PostIdSchema,
  likes: z.number().int().nonnegative(),
  likedBy: z.array(z.string()),
});

// 8. comment-added
export const CommentAddedServerSchema = z.object({
  type: z.literal('comment-added'),
  postId: PostIdSchema,
  comment: z
    .object({
      id: CommentIdSchema,
      nickname: z.string().min(1).max(20),
      text: z.string().min(1).max(500),
      status: CommentStatusSchema,
      createdAt: z.number().int().nonnegative(),
    })
    .passthrough(),
});

// 9. comment-removed
export const CommentRemovedServerSchema = z.object({
  type: z.literal('comment-removed'),
  postId: PostIdSchema,
  commentId: CommentIdSchema,
});

// 10. student-form-locked
export const StudentFormLockedServerSchema = z.object({
  type: z.literal('student-form-locked'),
  locked: z.boolean(),
});

// 11. boardSettings-changed
export const BoardSettingsChangedServerSchema = z.object({
  type: z.literal('boardSettings-changed'),
  settings: BoardSettingsSchema,
});

// 12. nickname-changed
export const NicknameChangedServerSchema = z.object({
  type: z.literal('nickname-changed'),
  postIds: z.array(PostIdSchema),
  newNickname: z.string().min(1).max(20),
});

// ─── v2.0 신규 5종 (β-Step12) ───────────────────────────────────

// 13. tab-added — 교사가 새 탭 생성 시 broadcast (cap 8 검증 후)
export const TabAddedServerSchema = z.object({
  type: z.literal('tab-added'),
  tab: TabConfigSchema,
});

// 14. tab-deleted — 교사가 탭 삭제 시 broadcast. orphan posts 는 DEFAULT_TAB_ID 로 이동.
export const TabDeletedServerSchema = z.object({
  type: z.literal('tab-deleted'),
  tabId: TabIdSchema,
  /** 삭제된 탭에서 default 로 이동된 카드 id 목록 (학생 측 UI 갱신용) */
  orphanedPostIds: z.array(PostIdSchema),
});

// 15. tab-renamed — 교사가 탭 이름 변경
export const TabRenamedServerSchema = z.object({
  type: z.literal('tab-renamed'),
  tabId: TabIdSchema,
  newTitle: TabTitleSchema,
});

// 16. tab-permission-changed — 교사가 권한 토글 (all / teacher-only / role-gated)
export const TabPermissionChangedServerSchema = z.object({
  type: z.literal('tab-permission-changed'),
  tabId: TabIdSchema,
  permission: TabPermissionSchema,
});

// 17. post-tab-moved — 교사가 카드를 다른 탭으로 이동 (tabId patch broadcast)
export const PostTabMovedServerSchema = z.object({
  type: z.literal('post-tab-moved'),
  postId: PostIdSchema,
  newTabId: TabIdSchema,
});

/**
 * 17 server-to-client messages — discriminated union.
 *
 * **회귀 보호 #2 SERVER_TRUSTED_BROADCAST**: 본 union 은 서버가 broadcast 할 수 있는 모든
 * 메시지 형태를 정의한다. 추가 메시지는 본 union 에도 등록되어야 학생 SPA 가 인식한다.
 */
export const RealtimeWallServerMessageSchema = z.discriminatedUnion('type', [
  // v1.15 12종
  WallStateServerSchema,
  PostAddedServerSchema,
  PostUpdatedServerSchema,
  PostRemovedServerSchema,
  ClosedServerSchema,
  ErrorServerSchema,
  LikeToggledServerSchema,
  CommentAddedServerSchema,
  CommentRemovedServerSchema,
  StudentFormLockedServerSchema,
  BoardSettingsChangedServerSchema,
  NicknameChangedServerSchema,
  // v2.0 5종 (β-Step12)
  TabAddedServerSchema,
  TabDeletedServerSchema,
  TabRenamedServerSchema,
  TabPermissionChangedServerSchema,
  PostTabMovedServerSchema,
]);

export type RealtimeWallServerMessage = z.infer<typeof RealtimeWallServerMessageSchema>;

/** 카운트 검증 helper — 메타테스트가 import 해 정합성 확인 */
export const REALTIME_WALL_SERVER_MESSAGE_COUNT = 17 as const;
export const REALTIME_WALL_V2_NEW_MESSAGE_COUNT = 5 as const;
