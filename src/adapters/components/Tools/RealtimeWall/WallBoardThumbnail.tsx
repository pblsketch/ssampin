/**
 * WallBoardThumbnail — 목록 카드의 mini-preview 서브컴포넌트
 *
 * Design §3.5.1a. 실제 approved 카드 top-N을 **레이아웃 mode별로 축소 렌더**하여
 * "무엇이 있는 보드인지" 한눈에 인지할 수 있게 한다.
 *
 * 공통 제약:
 *   - 폭 240px, 높이 120px 고정 (카드 크기에 맞춤)
 *   - 폰트 text-[9px]~[11px]
 *   - pointer-events-none + aria-hidden="true" (스크린리더는 meta만 읽음)
 *   - posts가 비어있으면 친화 안내 텍스트
 *
 * 렌더 전략 (Design §3.5.1a 표):
 *   - kanban   : 컬럼 헤더 2~3개 + 각 컬럼 상위 1 post nickname + text 1줄
 *   - freeform : 상위 3 post를 absolute position 축소 렌더 (비율 0.18)
 *   - grid     : 2×3 grid로 상위 6개 축약
 *   - stream   : 상위 3 post 세로 쌓기
 */
import React from 'react';
import type {
  RealtimeWallColumn,
  RealtimeWallLayoutMode,
  WallPreviewPost,
} from '@domain/entities/RealtimeWall';

interface WallBoardThumbnailProps {
  readonly layoutMode: RealtimeWallLayoutMode;
  readonly columns: readonly RealtimeWallColumn[];
  readonly previewPosts: readonly WallPreviewPost[];
}

export const WallBoardThumbnail: React.FC<WallBoardThumbnailProps> = React.memo(
  ({ layoutMode, columns, previewPosts }) => {
    const isEmpty = previewPosts.length === 0;

    if (isEmpty) {
      return (
        <div
          className="flex h-[120px] w-full items-center justify-center rounded-t-xl border-b border-sp-border bg-sp-surface/50 text-[10px] text-sp-muted"
          aria-hidden="true"
        >
          아직 카드가 없어요
        </div>
      );
    }

    return (
      <div
        className="pointer-events-none relative h-[120px] w-full overflow-hidden rounded-t-xl border-b border-sp-border bg-sp-surface/60"
        aria-hidden="true"
      >
        {layoutMode === 'kanban' && (
          <KanbanThumbnail columns={columns} previewPosts={previewPosts} />
        )}
        {layoutMode === 'freeform' && (
          <FreeformThumbnail previewPosts={previewPosts} />
        )}
        {layoutMode === 'grid' && <GridThumbnail previewPosts={previewPosts} />}
        {layoutMode === 'stream' && <StreamThumbnail previewPosts={previewPosts} />}
      </div>
    );
  },
);

WallBoardThumbnail.displayName = 'WallBoardThumbnail';

// ---------------------------------------------------------------------------
// layout-specific thumbnail renders
// ---------------------------------------------------------------------------

function KanbanThumbnail({
  columns,
  previewPosts,
}: {
  columns: readonly RealtimeWallColumn[];
  previewPosts: readonly WallPreviewPost[];
}): React.ReactElement {
  const visibleColumns = columns.slice(0, 3);
  return (
    <div className="flex h-full gap-1 p-1.5">
      {visibleColumns.map((col) => {
        const inColumn = previewPosts.filter((p) => p.kanban?.columnId === col.id);
        const top = inColumn[0];
        return (
          <div
            key={col.id}
            className="flex h-full flex-1 flex-col rounded bg-sp-card/80 p-1"
          >
            <div className="truncate text-[9px] font-bold text-sp-muted">
              {col.title}
            </div>
            {top ? (
              <div className="mt-0.5 rounded bg-sp-surface/80 p-0.5">
                <div className="truncate text-[9px] font-semibold text-sp-text">
                  {top.nickname}
                </div>
                <div className="line-clamp-1 text-[9px] text-sp-muted">
                  {top.text}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

const FREEFORM_SCALE = 0.18;

function FreeformThumbnail({
  previewPosts,
}: {
  previewPosts: readonly WallPreviewPost[];
}): React.ReactElement {
  const visible = previewPosts.slice(0, 3);
  return (
    <div className="relative h-full w-full">
      {visible.map((p) => {
        if (!p.freeform) return null;
        const { x, y, w, h } = p.freeform;
        return (
          <div
            key={p.id}
            className="absolute rounded border border-sp-border bg-sp-card/90 p-0.5 shadow-sm"
            style={{
              left: x * FREEFORM_SCALE,
              top: y * FREEFORM_SCALE,
              width: w * FREEFORM_SCALE,
              height: h * FREEFORM_SCALE,
            }}
          >
            <div className="truncate text-[9px] font-semibold text-sp-text">
              {p.nickname}
            </div>
            <div className="line-clamp-1 text-[9px] text-sp-muted">{p.text}</div>
          </div>
        );
      })}
    </div>
  );
}

function GridThumbnail({
  previewPosts,
}: {
  previewPosts: readonly WallPreviewPost[];
}): React.ReactElement {
  const visible = previewPosts.slice(0, 6);
  return (
    <div className="grid h-full grid-cols-3 grid-rows-2 gap-1 p-1.5">
      {visible.map((p) => (
        <div
          key={p.id}
          className="flex min-w-0 flex-col rounded bg-sp-card/80 p-0.5"
        >
          <div className="truncate text-[9px] font-semibold text-sp-text">
            {p.nickname}
          </div>
          <div className="line-clamp-2 text-[9px] text-sp-muted">{p.text}</div>
        </div>
      ))}
    </div>
  );
}

function StreamThumbnail({
  previewPosts,
}: {
  previewPosts: readonly WallPreviewPost[];
}): React.ReactElement {
  const visible = previewPosts.slice(0, 3);
  return (
    <div className="flex h-full flex-col gap-1 p-1.5">
      {visible.map((p) => (
        <div
          key={p.id}
          className="flex min-w-0 flex-col rounded bg-sp-card/80 p-0.5"
        >
          <div className="truncate text-[10px] font-semibold text-sp-text">
            {p.nickname}
          </div>
          <div className="line-clamp-1 text-[9px] text-sp-muted">{p.text}</div>
        </div>
      ))}
    </div>
  );
}
