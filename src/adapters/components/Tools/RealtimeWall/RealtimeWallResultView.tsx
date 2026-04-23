import { useMemo } from 'react';
import type {
  RealtimeWallLayoutMode,
  RealtimeWallPost,
} from '@domain/entities/RealtimeWall';
import { buildRealtimeWallColumns } from '@domain/rules/realtimeWallRules';
import { ResultSaveButton } from '../TemplateManager';
import { RealtimeWallKanbanBoard } from './RealtimeWallKanbanBoard';
import { RealtimeWallFreeformBoard } from './RealtimeWallFreeformBoard';
import { RealtimeWallGridBoard } from './RealtimeWallGridBoard';
import { RealtimeWallStreamBoard } from './RealtimeWallStreamBoard';
import { openExternalLink, REALTIME_WALL_LAYOUT_LABELS } from './realtimeWallHelpers';

export interface RealtimeWallResultViewProps {
  readonly title: string;
  readonly layoutMode: RealtimeWallLayoutMode;
  readonly columns: ReturnType<typeof buildRealtimeWallColumns>;
  readonly posts: readonly RealtimeWallPost[];
  readonly onNewBoard: () => void;
}

export function RealtimeWallResultView({
  title,
  layoutMode,
  columns,
  posts,
  onNewBoard,
}: RealtimeWallResultViewProps) {
  const approvedCount = posts.filter((post) => post.status === 'approved').length;
  const pendingCount = posts.filter((post) => post.status === 'pending').length;
  const hiddenCount = posts.filter((post) => post.status === 'hidden').length;

  const resultData = useMemo(
    () => ({
      type: 'realtime-wall' as const,
      title,
      layoutMode,
      columns,
      posts,
      totalParticipants: posts.length,
    }),
    [columns, layoutMode, posts, title],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <section className="rounded-xl border border-sp-border bg-sp-card px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h2 className="text-lg font-bold text-sp-text">{title}</h2>
            <p className="mt-0.5 text-xs text-sp-muted">
              {REALTIME_WALL_LAYOUT_LABELS[layoutMode]} · 수업 결과 복기
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-400">
              승인 {approvedCount}
            </span>
            {pendingCount > 0 && (
              <span className="rounded-full bg-sp-surface px-2.5 py-1 text-xs text-sp-muted">
                대기 {pendingCount}
              </span>
            )}
            {hiddenCount > 0 && (
              <span className="rounded-full bg-sp-surface px-2.5 py-1 text-xs text-sp-muted">
                숨김 {hiddenCount}
              </span>
            )}
          </div>
        </div>
      </section>

      <section className="min-h-0 flex-1">
        {(() => {
          switch (layoutMode) {
            case 'kanban':
              return (
                <RealtimeWallKanbanBoard
                  columns={columns}
                  posts={posts}
                  readOnly
                  onOpenLink={openExternalLink}
                />
              );
            case 'freeform':
              return (
                <RealtimeWallFreeformBoard
                  posts={posts}
                  readOnly
                  onOpenLink={openExternalLink}
                />
              );
            case 'grid':
              return (
                <RealtimeWallGridBoard
                  posts={posts}
                  readOnly
                  onOpenLink={openExternalLink}
                />
              );
            case 'stream':
              return (
                <RealtimeWallStreamBoard
                  posts={posts}
                  readOnly
                  onOpenLink={openExternalLink}
                />
              );
            default: {
              const _exhaustive: never = layoutMode;
              throw new Error(`Unknown layout mode: ${String(_exhaustive)}`);
            }
          }
        })()}
      </section>

      <div className="flex flex-wrap items-center justify-end gap-2.5">
        <button
          type="button"
          onClick={onNewBoard}
          className="rounded-lg border border-sp-border px-4 py-2.5 text-sm text-sp-muted transition hover:border-sp-accent hover:text-sp-accent"
        >
          내 담벼락 목록
        </button>
        <ResultSaveButton
          toolType="realtime-wall"
          defaultName={title}
          resultData={resultData}
        />
      </div>
    </div>
  );
}
