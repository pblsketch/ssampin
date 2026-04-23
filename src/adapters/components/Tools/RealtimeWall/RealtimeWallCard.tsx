import type { RealtimeWallPost } from '@domain/entities/RealtimeWall';

interface RealtimeWallCardProps {
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

export function RealtimeWallCard({
  post,
  compact = false,
  actions,
  dragHandle,
  onOpenLink,
}: RealtimeWallCardProps) {
  const isPinned = post.pinned;

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
        className={`flex-1 whitespace-pre-wrap break-words leading-relaxed text-sp-text ${
          compact ? 'line-clamp-5 text-sm' : 'text-sm'
        }`}
      >
        {post.text}
      </p>

      {post.linkUrl && (
        <button
          type="button"
          onClick={() => onOpenLink?.(post.linkUrl!)}
          className="mt-2.5 inline-flex max-w-full items-center gap-1 self-start rounded-lg border border-sp-accent/25 bg-sp-accent/8 px-2.5 py-1 text-xs font-medium text-sp-accent transition hover:border-sp-accent/50 hover:bg-sp-accent/15"
        >
          <span className="material-symbols-outlined text-[13px]">open_in_new</span>
          <span className="truncate">{getLinkLabel(post.linkUrl)}</span>
        </button>
      )}
    </article>
  );
}
