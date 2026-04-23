import { useState } from 'react';
import type { RealtimeWallLinkPreview, RealtimeWallPost } from '@domain/entities/RealtimeWall';

export interface RealtimeWallCardProps {
  readonly post: RealtimeWallPost;
  readonly compact?: boolean;
  readonly actions?: React.ReactNode;
  readonly dragHandle?: React.ReactNode;
  readonly onOpenLink?: (url: string) => void;
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
}: RealtimeWallCardProps) {
  const isPinned = post.pinned;
  const preview = post.linkPreview;

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
    </article>
  );
}
