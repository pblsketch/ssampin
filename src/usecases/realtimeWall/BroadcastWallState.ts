import type {
  RealtimeWallColumn,
  RealtimeWallComment,
  RealtimeWallLayoutMode,
  RealtimeWallPost,
} from '@domain/entities/RealtimeWall';
import type { RealtimeWallBoardSettings } from '@domain/entities/RealtimeWallBoardSettings';

/**
 * 학생용 보드 스냅샷.
 * - hidden post 제외 (status === 'approved'만 / v2.1: 'hidden-by-author'는 placeholder로 포함)
 * - approvalMode/createdAt/updatedAt 등 교사 전용 메타 제외
 * - teacherHearts는 §12 Q1 확정대로 그대로 포함 (학생에게 read-only 노출)
 *
 * v2.1 신규 (Design v2.1 §4.3):
 * - settings: boardSettings 포함 (학생도 moderation 모드 인지)
 *
 * Design §4.3 WallBoardSnapshot 정의.
 */
export interface WallBoardSnapshotForStudent {
  readonly title: string;
  readonly layoutMode: RealtimeWallLayoutMode;
  readonly columns: readonly RealtimeWallColumn[];
  readonly posts: readonly RealtimeWallPost[];
  /** P3 학생 카드 추가 잠금 상태. P1 시점은 항상 false. */
  readonly studentFormLocked: boolean;
  /**
   * v2.1 신규 (Design v2.1 §4.3 Phase A) — 보드 설정 (moderation 모드 등).
   * Phase B에서 학생 화면에 전달 시작 (Phase A 토글 UI 도입 전 준비).
   * 미존재 시 student 측에서 default `{ version: 1, moderation: 'off' }`로 처리.
   */
  readonly settings?: RealtimeWallBoardSettings;
}

/**
 * Main → 학생 클라이언트 broadcast 메시지 union.
 * Design §4.3 서버→클라이언트 메시지.
 *
 * - P1 6종: wall-state / post-added / post-updated / post-removed / closed / error
 * - P2 3종: like-toggled / comment-added / comment-removed
 * - P3 1종: student-form-locked (학생 카드 추가 잠금 브로드캐스트)
 * - v2.1 Phase A 1종: boardSettings-changed (boardSettings 토글 broadcast)
 * - v2.1 Phase D 1종: nickname-changed (교사 닉네임 변경 broadcast)
 *
 * 총 12종 (v2.1 누적).
 */
export type BroadcastableServerMessage =
  | { readonly type: 'wall-state'; readonly board: WallBoardSnapshotForStudent }
  | { readonly type: 'post-added'; readonly post: RealtimeWallPost }
  | { readonly type: 'post-updated'; readonly postId: string; readonly patch: Partial<RealtimeWallPost> }
  | { readonly type: 'post-removed'; readonly postId: string }
  | { readonly type: 'closed' }
  | { readonly type: 'error'; readonly message: string }
  // ============ v1.14 Phase P2 (padlet mode) ============
  | {
      readonly type: 'like-toggled';
      readonly postId: string;
      readonly likes: number;
      readonly likedBy: readonly string[];
    }
  | {
      readonly type: 'comment-added';
      readonly postId: string;
      readonly comment: RealtimeWallComment;
    }
  | {
      readonly type: 'comment-removed';
      readonly postId: string;
      readonly commentId: string;
    }
  // ============ v1.14 Phase P3 (padlet mode — student card add) ============
  | {
      readonly type: 'student-form-locked';
      readonly locked: boolean;
    }
  // ============ v1.15.x Phase B 도메인 선언 (Phase A에서 활용) ============
  | {
      readonly type: 'boardSettings-changed';
      readonly settings: RealtimeWallBoardSettings;
    }
  // ============ v1.15.x Phase B 도메인 선언 (Phase D에서 활용) ============
  | {
      readonly type: 'nickname-changed';
      readonly postIds: readonly string[];
      readonly newNickname: string;
    };

export interface BuildWallStateForStudentsArgs {
  readonly title: string;
  readonly layoutMode: RealtimeWallLayoutMode;
  readonly columns: readonly RealtimeWallColumn[];
  readonly posts: readonly RealtimeWallPost[];
  /** P3 잠금 상태. 미전달 시 false. */
  readonly studentFormLocked?: boolean;
  /**
   * v2.1 — 보드 설정 (Design v2.1 §4.3 Phase A 토대).
   * 미전달 시 학생 측 default 적용.
   */
  readonly settings?: RealtimeWallBoardSettings;
}

/**
 * 학생 broadcast용 보드 스냅샷 빌더.
 *
 * 책임:
 * - hidden / pending 카드 제외 (학생은 'approved' / 'hidden-by-author' 만)
 *   - 'hidden-by-author' (v2.1 신규)는 placeholder로 표시되므로 포함
 *     (단 Phase B에서는 status='hidden-by-author'를 broadcast하지 않음 — Phase D에서 본격 활용)
 * - approvalMode / createdAt 등 교사 전용 메타 절단
 * - 그 외 카드 데이터는 그대로 통과 (Padlet 동일 뷰 원칙 — Design §0.1)
 *
 * 회귀 위험 #1: `posts.filter(p => p.status === 'approved')` 패턴 보존 (Design v2.1 §10.6).
 *
 * 순수 함수 — 외부 의존 없음. 테스트 가능.
 */
export function buildWallStateForStudents(
  args: BuildWallStateForStudentsArgs,
): WallBoardSnapshotForStudent {
  return {
    title: args.title,
    layoutMode: args.layoutMode,
    columns: args.columns,
    posts: args.posts.filter((post) => post.status === 'approved'),
    studentFormLocked: args.studentFormLocked ?? false,
    ...(args.settings !== undefined ? { settings: args.settings } : {}),
  };
}
