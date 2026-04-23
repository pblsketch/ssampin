import { useState } from 'react';
import type { RealtimeWallLinkPreview, RealtimeWallPost } from '@domain/entities/RealtimeWall';

export interface RealtimeWallCardProps {
  readonly post: RealtimeWallPost;
  readonly compact?: boolean;
  readonly actions?: React.ReactNode;
  readonly dragHandle?: React.ReactNode;
  readonly onOpenLink?: (url: string) => void;
  /** 교사 로컬 좋아요 증가. 미전달 시 좋아요 UI는 읽기 전용(결과 복기 등). */
  readonly onLike?: (postId: string) => void;
}

function LikeButton({
  count,
  onClick,
}: {
  count: number;
  onClick?: () => void;
}) {
  const highlighted = count >= 5;
  const readOnly = !onClick;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={readOnly}
      title={readOnly ? `좋아요 ${count}` : '좋아요'}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition ${
        highlighted
          ? 'border-rose-400/40 bg-rose-400/10 text-rose-300'
          : 'border-sp-border bg-sp-surface text-sp-muted hover:border-rose-400/40 hover:text-rose-300'
      } ${readOnly ? 'cursor-default' : ''} disabled:opacity-80`}
    >
      <span className="material-symbols-outlined text-[13px]">favorite</span>
      <span className="tabular-nums">{count}</span>
    </button>
  );
}

function getLinkLabel(linkUrl: string): string {
  try {
    const parsed = new URL(linkUrl);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return linkUrl;
  }
}

function YoutubeEmbed({ videoId, compact }: { videoId: string; compact: boolean }) {
  // youtube-nocookie: 추적 쿠키 미설정 (Enhanced Privacy Mode).
  // sandbox에서 allow-same-origin 제거 — 임베드가 부모 문서에 접근 불가.
  // YouTube 플레이어는 자체 origin 내부에서 동작하므로 scripts + presentation
  // 조합만으로 재생 가능.
  return (
    <div
      className={`relative mt-2.5 w-full overflow-hidden rounded-lg border border-sp-border/60 bg-black ${
        compact ? 'aspect-video max-h-[160px]' : 'aspect-video'
      }`}
    >
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${videoId}`}
        title="YouTube 영상 미리보기"
        className="absolute inset-0 h-full w-full"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        loading="lazy"
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-presentation"
      />
    </div>
  );
}

function WebPagePreview({
  preview,
  linkUrl,
  onOpenLink,
}: {
  preview: Extract<RealtimeWallLinkPreview, { kind: 'webpage' }>;
  linkUrl: string;
  onOpenLink?: (url: string) => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const hasMeta = preview.ogTitle || preview.ogDescription || preview.ogImageUrl;
  if (!hasMeta) return null;

  const showImage = preview.ogImageUrl && !imageFailed;

  return (
    <button
      type="button"
      onClick={() => onOpenLink?.(linkUrl)}
      className="mt-2.5 flex w-full items-stretch gap-2.5 overflow-hidden rounded-lg border border-sp-border/70 bg-sp-surface text-left transition hover:border-sp-accent/40"
    >
      {showImage && (
        <div className="w-16 shrink-0 overflow-hidden bg-sp-bg sm:w-20">
          <img
            src={preview.ogImageUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
            onError={() => setImageFailed(true)}
          />
        </div>
      )}
      <div className="min-w-0 flex-1 px-2 py-1.5">
        {preview.ogTitle && (
          <p className="line-clamp-2 text-xs font-semibold text-sp-text">{preview.ogTitle}</p>
        )}
        {preview.ogDescription && (
          <p className="mt-0.5 line-clamp-2 text-[11px] text-sp-muted">{preview.ogDescription}</p>
        )}
        <p className="mt-1 truncate text-[10px] text-sp-muted/70">
          {getLinkLabel(linkUrl)}
        </p>
      </div>
    </button>
  );
}

export function RealtimeWallCard({
  post,
  compact = false,
  actions,
  dragHandle,
  onOpenLink,
  onLike,
}: RealtimeWallCardProps) {
  const isPinned = post.pinned;
  const preview = post.linkPreview;
  const likesCount = post.likes ?? 0;
  // 승인된 카드만 좋아요 버튼 노출. pending/hidden은 대기열이나 숨김 영역이라 의미 없음.
  const showLikes = post.status === 'approved' && (likesCount > 0 || Boolean(onLike));

  return (
    <article
      className={`group flex h-full flex-col rounded-xl border p-3.5 shadow-sm transition-shadow ${
        isPinned
          ? 'border-amber-400/50 bg-sp-card shadow-amber-400/10 shadow-md'
          : 'border-sp-border bg-sp-card hover:border-sp-border/80'
      }`}
    >
      <div className="mb-2.5 flex items-start gap-1.5">
        {dragHandle && (
          <div className="mt-0.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
            {dragHandle}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-sp-text">{post.nickname}</span>
            {isPinned && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                <span className="material-symbols-outlined text-[11px]">push_pin</span>
                고정
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-sp-muted">
            {new Date(post.submittedAt).toLocaleTimeString('ko-KR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
        {actions && (
          <div className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
            {actions}
          </div>
        )}
      </div>

      <p
        className={`whitespace-pre-wrap break-words leading-relaxed text-sp-text ${
          compact ? 'line-clamp-5 text-sm' : 'text-sm'
        }`}
      >
        {post.text}
      </p>

      {/* YouTube 임베드 (교사 UI 전용) */}
      {post.linkUrl && preview?.kind === 'youtube' && (
        <YoutubeEmbed videoId={preview.videoId} compact={compact} />
      )}

      {/* 웹페이지 OG 미리보기 */}
      {post.linkUrl && preview?.kind === 'webpage' && (
        <WebPagePreview preview={preview} linkUrl={post.linkUrl} onOpenLink={onOpenLink} />
      )}

      {/* 링크 칩 — preview가 없거나 미리보기 옆에 원본 접근용 */}
      {post.linkUrl && (
        <button
          type="button"
          onClick={() => onOpenLink?.(post.linkUrl!)}
          className="mt-2 inline-flex max-w-full items-center gap-1 self-start rounded-lg border border-sp-accent/25 bg-sp-accent/8 px-2.5 py-1 text-xs font-medium text-sp-accent transition hover:border-sp-accent/50 hover:bg-sp-accent/15"
        >
          <span className="material-symbols-outlined text-[13px]">open_in_new</span>
          <span className="truncate">{getLinkLabel(post.linkUrl)}</span>
        </button>
      )}

      {/* 교사 로컬 좋아요 — 승인 카드에만, 학생 HTML에는 절대 노출 X */}
      {showLikes && (
        <div className="mt-2 flex items-center">
          <LikeButton count={likesCount} onClick={onLike ? () => onLike(post.id) : undefined} />
        </div>
      )}
    </article>
  );
}
