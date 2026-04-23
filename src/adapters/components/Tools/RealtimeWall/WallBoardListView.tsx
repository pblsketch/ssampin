/**
 * WallBoardListView — 영속 담벼락 목록 화면
 *
 * Design §3.5.1. 교사가 이전에 만든 보드를 다시 열거나, 새 보드를 만드는
 * 첫 진입점. 카드 상단은 `WallBoardThumbnail`로 실제 approved 카드 미니프리뷰를
 * 보여주고, 하단에는 메타(제목, 카드 수, 최종 세션, shortCode) + ⋯ 메뉴를 렌더.
 *
 * Stage A 범위:
 *   - 보드 목록 로드 (wallBoardRepository.listAllMeta)
 *   - 카드 클릭 → onOpen(board.id)
 *   - "+ 새 담벼락" 클릭 → onCreate()
 *   - 삭제 (단일 확인 대화 없이 바로 — 추후 Stage D/B에서 ⋯ 메뉴로 개선)
 *
 * 보관함(archived) 섹션 분리와 ⋯ 메뉴(이름변경/복제/보관)는 Stage C/D로 연기.
 */
import React, { useCallback, useEffect, useState } from 'react';
import type {
  WallBoardId,
  WallBoardMeta,
} from '@domain/entities/RealtimeWall';
import type { IWallBoardRepository } from '@domain/repositories/IWallBoardRepository';

import { WallBoardThumbnail } from './WallBoardThumbnail';
import { REALTIME_WALL_LAYOUT_LABELS } from './realtimeWallHelpers';

interface WallBoardListViewProps {
  readonly repo: IWallBoardRepository;
  readonly onOpen: (id: WallBoardId) => void;
  readonly onCreate: () => void;
}

export const WallBoardListView: React.FC<WallBoardListViewProps> = ({
  repo,
  onOpen,
  onCreate,
}) => {
  const [metas, setMetas] = useState<readonly WallBoardMeta[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await repo.listAllMeta();
      // 최근 사용순 정렬 (lastSessionAt || updatedAt)
      const sorted = [...list].sort((a, b) => {
        const at = a.lastSessionAt ?? a.updatedAt;
        const bt = b.lastSessionAt ?? b.updatedAt;
        return bt - at;
      });
      setMetas(sorted);
    } finally {
      setLoading(false);
    }
  }, [repo]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const activeBoards = metas.filter((m) => !m.archived);
  const archivedBoards = metas.filter((m) => m.archived);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-sp-text">내 담벼락</h2>
        <button
          type="button"
          onClick={onCreate}
          className="rounded-lg bg-sp-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-sp-accent/90"
        >
          + 새 담벼락 만들기
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-sp-muted">불러오는 중…</p>
      ) : activeBoards.length === 0 ? (
        <EmptyState onCreate={onCreate} />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
          {activeBoards.map((meta) => (
            <BoardCard key={meta.id} meta={meta} onOpen={() => onOpen(meta.id)} />
          ))}
        </div>
      )}

      {archivedBoards.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-sp-muted">
            ▾ 보관함 ({archivedBoards.length})
          </summary>
          <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3 opacity-70">
            {archivedBoards.map((meta) => (
              <BoardCard
                key={meta.id}
                meta={meta}
                onOpen={() => onOpen(meta.id)}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// BoardCard — 단일 보드 카드 (썸네일 + 메타 + shortCode)
// ---------------------------------------------------------------------------

function BoardCard({
  meta,
  onOpen,
}: {
  meta: WallBoardMeta;
  onOpen: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full flex-col overflow-hidden rounded-xl border border-sp-border bg-sp-card text-left transition hover:border-sp-accent hover:shadow-md"
    >
      <WallBoardThumbnail
        layoutMode={meta.layoutMode}
        // 카드 목록에서는 columns 스냅샷을 별도로 보관하지 않으므로, thumbnail은
        // previewPosts에 이미 담긴 post.kanban.columnId만 써서 렌더 가능한 수준.
        // Stage A는 kanban에서 컬럼 헤더 타이틀을 모사할 수 없으므로 fallback columns 주입.
        // (Stage C 컬럼 편집 기능 이후에 meta.columnsSnapshot 필드로 확장 예정)
        columns={kanbanFallbackColumnsFromPreview(meta.previewPosts)}
        previewPosts={meta.previewPosts}
      />
      <div className="flex flex-col gap-1 p-3">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-sp-surface px-2 py-0.5 text-[10px] text-sp-muted">
            {REALTIME_WALL_LAYOUT_LABELS[meta.layoutMode]}
          </span>
          {meta.approvalMode === 'auto' && (
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">
              자동 승인
            </span>
          )}
        </div>
        <h3 className="truncate text-sm font-bold text-sp-text">
          {meta.title}
        </h3>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-sp-muted">
          <span>카드 {meta.approvedCount}</span>
          <span>·</span>
          <span>{formatLastSession(meta.lastSessionAt, meta.updatedAt)}</span>
          {meta.shortCode && (
            <>
              <span>·</span>
              <span className="font-mono text-amber-300">
                {meta.shortCode}
              </span>
            </>
          )}
        </div>
      </div>
    </button>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-sp-border py-12 text-center">
      <p className="text-sm text-sp-muted">아직 만든 담벼락이 없어요</p>
      <button
        type="button"
        onClick={onCreate}
        className="rounded-lg bg-sp-accent px-4 py-2 text-sm font-semibold text-white hover:bg-sp-accent/90"
      >
        + 담벼락 만들기
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * previewPosts에 담긴 kanban.columnId들로부터 fallback column 정보를 재구성.
 *
 * 현 Stage A 범위에서 `WallBoardMeta`는 columnsSnapshot 필드를 가지지 않으므로,
 * kanban mode 썸네일의 컬럼 헤더를 그리려면 previewPosts의 columnId를 역추적해야
 * 한다. 이는 임시 해법이며 Stage C(컬럼 편집) 도입 시 `WallBoardMeta.columnsSnapshot`
 * 추가로 대체한다.
 */
function kanbanFallbackColumnsFromPreview(
  previewPosts: readonly { kanban?: { columnId: string } }[],
): readonly { id: string; title: string; order: number }[] {
  const seen = new Set<string>();
  const cols: { id: string; title: string; order: number }[] = [];
  for (const p of previewPosts) {
    if (p.kanban && !seen.has(p.kanban.columnId)) {
      seen.add(p.kanban.columnId);
      cols.push({
        id: p.kanban.columnId,
        title: p.kanban.columnId, // id를 title 대체 (Stage C에서 진짜 title로 교체)
        order: cols.length,
      });
    }
  }
  return cols;
}

function formatLastSession(lastSessionAt: number | undefined, updatedAt: number): string {
  const ts = lastSessionAt ?? updatedAt;
  const now = Date.now();
  const diffMs = now - ts;
  const day = 24 * 60 * 60 * 1000;
  if (diffMs < day) return '오늘';
  if (diffMs < 2 * day) return '어제';
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}일 전`;
  return new Date(ts).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}
