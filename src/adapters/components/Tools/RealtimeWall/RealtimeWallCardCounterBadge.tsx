import type { RealtimeWallViewerRole } from './types';

/**
 * RealtimeWallCardCounterBadge — β-Step7 (v2.0 CounterBadge)
 *
 * Spec L189: `CounterBadge | UI presentation (NEW v2.0) | likeCount, commentCount,
 * position(우하단/좌하단) | renders-from RealtimeWallPost`.
 *
 * Plan §2.2 Step 7: "❤️N · 💬M 외부 노출, 모든 4 레이아웃 우하단 일관, hover 없이
 * visible, 클릭 시 좋아요 토글 또는 댓글 패널. v1.14 broadcast(like-toggled·
 * comment-added/removed) 재사용".
 *
 * 책임:
 *   - 카드 우하단 absolute 위치에 좋아요 수 + 댓글 수 노출
 *   - hover 없이 visible — 항상 보이게 (opacity-100, group-hover 의존 X)
 *   - 좋아요 클릭 시 viewerRole 분기 콜백 호출 (teacher / student)
 *   - 댓글 클릭 시 댓글 패널 토글 콜백 호출 (부모가 카드 footer 의 commentsOpen 상태 갱신)
 *
 * v1.14 broadcast 재사용:
 *   - count 값은 부모(RealtimeWallCard) 가 post.likes / post.comments?.length 에서
 *     계산해 전달. broadcast 수신 시 store 가 post 를 갱신 → React rerender → 본 컴포넌트
 *     count props 갱신. 별도 broadcast 채널 추가 0건.
 *
 * 회귀 보호:
 *   - 회귀 #1 status filter 무관 — 본 컴포넌트는 표시 전용, status 분기 X
 *   - 회귀 #3 teacherActions guard — onLikeClick prop 이 viewerRole 분기 후 부모에서
 *     주입되므로 본 컴포넌트는 viewerRole 만 표시(active/inactive 시각) 활용
 *   - 회귀 #4 prevSubmittingRef 무관
 *   - 회귀 #11 viewerRole 비대칭 0 — viewerRole 별 다른 카운터 X (양쪽 동일 데이터)
 *
 * Stateless: 모든 state 는 부모가 보유. props 만으로 렌더 → 테스트 친화.
 */

export interface RealtimeWallCardCounterBadgeProps {
  /** 좋아요 수 (post.likes ?? 0) */
  readonly likeCount: number;
  /** 댓글 수 (post.comments?.length ?? 0 — viewerRole 분기는 호출자 책임) */
  readonly commentCount: number;
  /** 현재 viewer 가 좋아요 했는지 (filled heart 시각) */
  readonly hasLiked?: boolean;
  /** 좋아요 클릭 콜백 — viewerRole 분기는 부모가 결정해 주입. 미전달 시 read-only */
  readonly onLikeClick?: () => void;
  /** 댓글 클릭 콜백 — 댓글 패널 토글. 미전달 시 read-only */
  readonly onCommentClick?: () => void;
  /** 시각 분기 (teacher 는 sky tint, student 는 red — 기존 패턴 정합). 기본 'teacher' */
  readonly viewerRole?: RealtimeWallViewerRole;
}

/**
 * 우하단 absolute positioning 전용 wrapper.
 * 부모는 카드 article 의 `relative` 박스 안에 본 컴포넌트를 mount.
 *
 * Spec L189 position='우하단' — 4 layout 일관 위치 보장.
 */
export function RealtimeWallCardCounterBadge({
  likeCount,
  commentCount,
  hasLiked = false,
  onLikeClick,
  onCommentClick,
  viewerRole = 'teacher',
}: RealtimeWallCardCounterBadgeProps) {
  const likeColorClass = hasLiked
    ? viewerRole === 'student'
      ? 'text-rose-500'
      : 'text-rose-400'
    : 'text-sp-muted';

  return (
    <div
      className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full border border-sp-border/70 bg-sp-surface/90 px-2 py-0.5 text-detail shadow-sm backdrop-blur-sm"
      // 항상 visible — group-hover 의존 금지 (Plan §2.2 Step 7 "hover 없이 visible")
      data-counter-badge="true"
      aria-label={`좋아요 ${likeCount}개, 댓글 ${commentCount}개`}
    >
      <button
        type="button"
        onClick={onLikeClick}
        disabled={!onLikeClick}
        title={onLikeClick ? (hasLiked ? '좋아요 취소' : '좋아요') : `좋아요 ${likeCount}개`}
        className={`inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 font-semibold tabular-nums transition disabled:cursor-default ${likeColorClass} ${
          onLikeClick ? 'hover:bg-rose-400/10' : ''
        }`}
        aria-pressed={hasLiked}
        aria-label={hasLiked ? '좋아요 취소' : '좋아요 누르기'}
      >
        <span className="material-symbols-outlined text-[14px]">
          {hasLiked ? 'favorite' : 'favorite_border'}
        </span>
        <span>{likeCount}</span>
      </button>
      <span aria-hidden="true" className="text-sp-muted/40">
        ·
      </span>
      <button
        type="button"
        onClick={onCommentClick}
        disabled={!onCommentClick}
        title={onCommentClick ? '댓글 패널 열기/닫기' : `댓글 ${commentCount}개`}
        className={`inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 font-semibold tabular-nums text-sp-muted transition disabled:cursor-default ${
          onCommentClick ? 'hover:bg-sky-400/10 hover:text-sky-400' : ''
        }`}
        aria-label="댓글 패널 토글"
      >
        <span className="material-symbols-outlined text-[14px]">chat_bubble</span>
        <span>{commentCount}</span>
      </button>
    </div>
  );
}
