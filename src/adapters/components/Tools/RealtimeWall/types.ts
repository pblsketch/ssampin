import type { RealtimeWallPost } from '@domain/entities/RealtimeWall';

/**
 * Kanban·Freeform·Grid·Stream 4개 Board가 공유하는 공통 props.
 * 새 상호작용(댓글·공유 등) 추가 시 이 interface 한 곳만 수정하면
 * 4곳에 자동 전파된다.
 *
 * 특화 props:
 *   - Kanban: + columns, onChangePosts
 *   - Freeform: + onChangePosts (drag/resize로 freeform meta 갱신)
 *   - Grid/Stream: 이 공통 props 만
 */
export interface RealtimeWallBoardCommonProps {
  readonly posts: readonly RealtimeWallPost[];
  readonly readOnly?: boolean;
  readonly onTogglePin?: (postId: string) => void;
  readonly onHidePost?: (postId: string) => void;
  readonly onOpenLink?: (url: string) => void;
  readonly onLike?: (postId: string) => void;
}
