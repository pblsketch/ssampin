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
 *   - BoardCard ⋯ 메뉴에 "보관/보관 해제" 액션 — archived 플래그 토글 후 save
 *     (목록 활성/보관함 섹션 사이 이동, 데이터/shortCode 보존)
 *   - BoardCard ⋯ 메뉴에 "삭제" 액션 — confirm 모달 → repo.delete
 *     (파일 시스템 + index entry 모두 제거, 되돌릴 수 없음)
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
import { Modal } from '@adapters/components/common/Modal';

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
  const [deleteTarget, setDeleteTarget] = useState<WallBoardMeta | null>(null);
  const [deletingId, setDeletingId] = useState<WallBoardId | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<WallBoardId | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiveSuccess, setArchiveSuccess] = useState<string | null>(null);

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

  // 보드 보관/보관 해제. archived 플래그를 토글해 save. shortCode·posts 등
  // 모든 데이터는 그대로 유지되어 추후 복원이 가능. updatedAt은 갱신해
  // 목록 정렬에 즉시 반영되게 한다.
  const handleArchiveToggle = useCallback(
    async (target: WallBoardMeta, nextArchived: boolean) => {
      setArchivingId(target.id);
      setArchiveError(null);
      setArchiveSuccess(null);
      try {
        const source: WallBoard | null = await repo.load(target.id);
        if (!source) {
          setArchiveError('담벼락을 불러오지 못했어요.');
          return;
        }
        const next: WallBoard = {
          ...source,
          archived: nextArchived,
          updatedAt: Date.now(),
        };
        await repo.save(next);
        await refresh();
        setArchiveSuccess(
          nextArchived
            ? `'${target.title}'을(를) 보관함으로 옮겼어요.`
            : `'${target.title}'을(를) 보관함에서 꺼냈어요.`,
        );
      } catch {
        setArchiveError(
          nextArchived
            ? '담벼락을 보관하지 못했어요. 다시 시도해주세요.'
            : '담벼락을 보관 해제하지 못했어요. 다시 시도해주세요.',
        );
      } finally {
        setArchivingId(null);
      }
    },
    [refresh, repo],
  );

  // 보드 삭제. 모달에서 "삭제" 확정 시 호출. repo.delete는 파일 시스템과
  // index entry 모두에서 제거하므로, 성공 후 refresh 한 번이면 목록도 정상 동기화됨.
  const handleDelete = useCallback(
    async (target: WallBoardMeta) => {
      setDeletingId(target.id);
      setDeleteError(null);
      setDeleteSuccess(null);
      try {
        await repo.delete(target.id);
        await refresh();
        setDeleteSuccess(`'${target.title}'을(를) 삭제했어요.`);
        setDeleteTarget(null);
      } catch {
        setDeleteError('담벼락을 삭제하지 못했어요. 다시 시도해주세요.');
      } finally {
        setDeletingId(null);
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

  useEffect(() => {
    if (!deleteSuccess) return;
    const timer = window.setTimeout(() => setDeleteSuccess(null), 3000);
    return () => window.clearTimeout(timer);
  }, [deleteSuccess]);

  useEffect(() => {
    if (!deleteError) return;
    const timer = window.setTimeout(() => setDeleteError(null), 4000);
    return () => window.clearTimeout(timer);
  }, [deleteError]);

  useEffect(() => {
    if (!archiveSuccess) return;
    const timer = window.setTimeout(() => setArchiveSuccess(null), 3000);
    return () => window.clearTimeout(timer);
  }, [archiveSuccess]);

  useEffect(() => {
    if (!archiveError) return;
    const timer = window.setTimeout(() => setArchiveError(null), 4000);
    return () => window.clearTimeout(timer);
  }, [archiveError]);

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
      {deleteSuccess && (
        <div
          role="status"
          className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300"
        >
          {deleteSuccess}
        </div>
      )}
      {deleteError && (
        <div
          role="alert"
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300"
        >
          {deleteError}
        </div>
      )}
      {archiveSuccess && (
        <div
          role="status"
          className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300"
        >
          {archiveSuccess}
        </div>
      )}
      {archiveError && (
        <div
          role="alert"
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300"
        >
          {archiveError}
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
              onArchiveToggle={() => {
                void handleArchiveToggle(meta, true);
              }}
              onDelete={() => setDeleteTarget(meta)}
              isCloning={cloningId === meta.id}
              isArchiving={archivingId === meta.id}
              isDeleting={deletingId === meta.id}
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
                onArchiveToggle={() => {
                  void handleArchiveToggle(meta, false);
                }}
                onDelete={() => setDeleteTarget(meta)}
                isCloning={cloningId === meta.id}
                isArchiving={archivingId === meta.id}
                isDeleting={deletingId === meta.id}
              />
            ))}
          </div>
        </details>
      )}

      <DeleteWallBoardConfirmModal
        target={deleteTarget}
        isDeleting={deletingId !== null}
        onCancel={() => {
          if (deletingId !== null) return;
          setDeleteTarget(null);
        }}
        onConfirm={() => {
          if (!deleteTarget) return;
          void handleDelete(deleteTarget);
        }}
      />
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
  onArchiveToggle,
  onDelete,
  isCloning,
  isArchiving,
  isDeleting,
}: {
  meta: WallBoardMeta;
  onOpen: () => void;
  onClone: () => void;
  onArchiveToggle: () => void;
  onDelete: () => void;
  isCloning: boolean;
  isArchiving: boolean;
  isDeleting: boolean;
}): React.ReactElement {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const busy = isCloning || isArchiving || isDeleting;
  const isArchived = meta.archived === true;

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
        disabled={busy}
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
          disabled={busy}
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
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onArchiveToggle();
              }}
              className="flex w-full items-center gap-2 border-t border-sp-border px-3 py-2 text-left text-xs text-sp-text transition hover:bg-sp-surface"
            >
              <span className="material-symbols-outlined text-sm text-sp-muted">
                {isArchived ? 'unarchive' : 'archive'}
              </span>
              {isArchived ? '보관 해제' : '보관함으로 이동'}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onDelete();
              }}
              className="flex w-full items-center gap-2 border-t border-sp-border px-3 py-2 text-left text-xs text-red-300 transition hover:bg-red-500/10 hover:text-red-200"
            >
              <span className="material-symbols-outlined text-sm">delete</span>
              삭제
            </button>
          </div>
        )}
      </div>

      {(isCloning || isArchiving || isDeleting) && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-sp-bg/60 backdrop-blur-[1px]">
          <span className="text-xs text-sp-muted">
            {isDeleting
              ? '삭제 중…'
              : isArchiving
                ? (isArchived ? '보관 해제 중…' : '보관 중…')
                : '복제 중…'}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DeleteWallBoardConfirmModal — 삭제 확정 모달
// ---------------------------------------------------------------------------
//
// 되돌릴 수 없는 파괴적 액션이므로 별도 confirm을 둔다. 미리보기로 보드 제목과
// 카드 수, shortCode를 함께 노출해 잘못 누르는 사고를 줄인다. `isDeleting`인
// 동안에는 backdrop·ESC·취소 버튼이 모두 잠긴다 (ListView 측에서 onCancel을
// no-op으로 처리).
function DeleteWallBoardConfirmModal({
  target,
  isDeleting,
  onCancel,
  onConfirm,
}: {
  target: WallBoardMeta | null;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}): React.ReactElement | null {
  if (!target) return null;
  return (
    <Modal
      isOpen
      onClose={onCancel}
      title={`'${target.title}' 담벼락을 삭제하시겠습니까?`}
      srOnlyTitle
      size="sm"
      closeOnBackdrop={!isDeleting}
      closeOnEsc={!isDeleting}
    >
      <div className="p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-red-500/10">
            <span className="material-symbols-outlined text-icon-lg text-red-400">delete</span>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-sp-text">
              &lsquo;{target.title}&rsquo; 담벼락을 삭제하시겠습니까?
            </h3>
            <p className="mt-1 text-sm text-sp-muted">
              카드 {target.approvedCount}개와 모든 게시물이 함께 삭제되며,
              한번 삭제하면 되돌릴 수 없어요.
            </p>
            {target.shortCode && (
              <p className="mt-2 text-xs text-sp-muted">
                참여 코드:{' '}
                <span className="font-mono text-amber-300">
                  {target.shortCode}
                </span>
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="rounded-lg border border-sp-border px-4 py-2 text-sm text-sp-text transition hover:bg-sp-text/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600 disabled:cursor-wait disabled:opacity-60"
          >
            {isDeleting ? '삭제 중…' : '삭제'}
          </button>
        </div>
      </div>
    </Modal>
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
