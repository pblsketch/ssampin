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
 *
 * Stage D 추가:
 *   - BoardCard ⋯ 메뉴에 "복제" 액션 — cloneWallBoard + repo.save
 *     (posts 빈 배열, 새 id + " (복제)" 접미, lastSessionAt 리셋)
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type {
  WallBoard,
  WallBoardId,
  WallBoardMeta,
} from '@domain/entities/RealtimeWall';
import type { IWallBoardRepository } from '@domain/repositories/IWallBoardRepository';
import {
  cloneWallBoard,
  generateUniqueWallShortCode,
} from '@domain/rules/realtimeWallRules';

import { WallBoardThumbnail } from './WallBoardThumbnail';
import { REALTIME_WALL_LAYOUT_LABELS } from './realtimeWallHelpers';

/** crypto.randomUUID → WallBoardId branded type 캐스팅 (ToolRealtimeWall와 동일 규칙) */
function newWallBoardId(): WallBoardId {
  const raw = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `wb-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return raw as WallBoardId;
}

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
  const [cloningId, setCloningId] = useState<WallBoardId | null>(null);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [cloneSuccess, setCloneSuccess] = useState<string | null>(null);

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

  // v1.13 Stage D: 보드 복제. source 전체를 load해 cloneWallBoard로 새 WallBoard
  // 생성 → save → refresh. posts 빈 배열, shortCode는 기존 코드와 충돌하지 않는
  // 새 코드로 발급 (학생 공지 혼동 방지).
  const handleClone = useCallback(
    async (sourceMeta: WallBoardMeta) => {
      setCloningId(sourceMeta.id);
      setCloneError(null);
      setCloneSuccess(null);
      try {
        const source: WallBoard | null = await repo.load(sourceMeta.id);
        if (!source) {
          setCloneError('원본 담벼락을 불러오지 못했어요.');
          return;
        }
        const existingMetas = await repo.listAllMeta();
        const existingCodes = new Set(
          existingMetas
            .map((m) => m.shortCode)
            .filter((c): c is string => Boolean(c)),
        );
        const newShortCode = generateUniqueWallShortCode(existingCodes);
        const clone = cloneWallBoard(source, newWallBoardId(), Date.now(), {
          shortCode: newShortCode,
        });
        await repo.save(clone);
        await refresh();
        setCloneSuccess(`'${clone.title}'이 만들어졌어요.`);
      } catch {
        setCloneError('담벼락을 복제하지 못했어요. 다시 시도해주세요.');
      } finally {
        setCloningId(null);
      }
    },
    [refresh, repo],
  );

  // 토스트 자동 소거 (3초)
  useEffect(() => {
    if (!cloneSuccess) return;
    const timer = window.setTimeout(() => setCloneSuccess(null), 3000);
    return () => window.clearTimeout(timer);
  }, [cloneSuccess]);

  useEffect(() => {
    if (!cloneError) return;
    const timer = window.setTimeout(() => setCloneError(null), 4000);
    return () => window.clearTimeout(timer);
  }, [cloneError]);

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

      {cloneSuccess && (
        <div
          role="status"
          className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300"
        >
          {cloneSuccess}
        </div>
      )}
      {cloneError && (
        <div
          role="alert"
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300"
        >
          {cloneError}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-sp-muted">불러오는 중…</p>
      ) : activeBoards.length === 0 ? (
        <EmptyState onCreate={onCreate} />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
          {activeBoards.map((meta) => (
            <BoardCard
              key={meta.id}
              meta={meta}
              onOpen={() => onOpen(meta.id)}
              onClone={() => {
                void handleClone(meta);
              }}
              isCloning={cloningId === meta.id}
            />
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
                onClone={() => {
                  void handleClone(meta);
                }}
                isCloning={cloningId === meta.id}
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
  onClone,
  isCloning,
}: {
  meta: WallBoardMeta;
  onOpen: () => void;
  onClone: () => void;
  isCloning: boolean;
}): React.ReactElement {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 메뉴 닫기
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <div className="group relative flex w-full flex-col overflow-hidden rounded-xl border border-sp-border bg-sp-card text-left transition hover:border-sp-accent hover:shadow-md">
      <button
        type="button"
        onClick={onOpen}
        disabled={isCloning}
        className="flex w-full flex-col text-left disabled:cursor-wait disabled:opacity-70"
      >
        <WallBoardThumbnail
          layoutMode={meta.layoutMode}
          // 카드 목록에서는 columns 스냅샷을 별도로 보관하지 않으므로, thumbnail은
          // previewPosts에 이미 담긴 post.kanban.columnId만 써서 렌더 가능한 수준.
          columns={kanbanFallbackColumnsFromPreview(meta.previewPosts)}
          previewPosts={meta.previewPosts}
        />
        <div className="flex flex-col gap-1 p-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-sp-surface px-2 py-0.5 text-caption text-sp-muted">
              {REALTIME_WALL_LAYOUT_LABELS[meta.layoutMode]}
            </span>
            {meta.approvalMode === 'auto' && (
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-caption text-emerald-300">
                자동 승인
              </span>
            )}
          </div>
          <h3 className="truncate text-sm font-bold text-sp-text">
            {meta.title}
          </h3>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-detail text-sp-muted">
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

      {/* ⋯ 메뉴 */}
      <div ref={menuRef} className="absolute right-2 top-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          disabled={isCloning}
          aria-label="더보기"
          className="rounded-full bg-sp-bg/80 p-1 text-sp-muted opacity-0 backdrop-blur-sm transition hover:text-sp-text group-hover:opacity-100 focus:opacity-100 disabled:cursor-wait"
        >
          <span className="material-symbols-outlined text-base">more_horiz</span>
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-full z-10 mt-1 w-36 overflow-hidden rounded-lg border border-sp-border bg-sp-card shadow-xl"
          >
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onClone();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-sp-text transition hover:bg-sp-surface"
            >
              <span className="material-symbols-outlined text-sm text-sp-muted">content_copy</span>
              복제
            </button>
          </div>
        )}
      </div>

      {isCloning && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-sp-bg/60 backdrop-blur-[1px]">
          <span className="text-xs text-sp-muted">복제 중…</span>
        </div>
      )}
    </div>
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
