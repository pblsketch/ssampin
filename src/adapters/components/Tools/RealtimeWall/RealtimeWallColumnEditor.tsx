/**
 * RealtimeWallColumnEditor — 라이브 보드 실행 중 칸반 컬럼 편집 드로어
 *
 * Design §5.2. 라이브 모드(kanban) 상단의 "컬럼 편집" 버튼이 열며,
 * 드로어 안에서 컬럼 추가·이름변경·순서조정·삭제를 draft로 편집한 뒤
 * [저장] 시 일괄 반영한다. 삭제에는 3전략(이동·숨김·영구삭제) 중
 * 선택 대화가 뒤따른다.
 *
 * 주의:
 *   - 도메인 규칙(addWallColumn/renameWallColumn/reorderWallColumns/
 *     removeWallColumn)을 직접 호출하여 draft 상태를 갱신한다.
 *   - 저장 시 {columns, posts}를 onApply로 넘기므로 호출측이
 *     setColumnInputs · setPosts를 동시에 반영해야 한다.
 */
import { useEffect, useMemo, useState } from 'react';
import type {
  RealtimeWallColumn,
  RealtimeWallPost,
} from '@domain/entities/RealtimeWall';
import {
  addWallColumn,
  REALTIME_WALL_MAX_COLUMNS,
  REALTIME_WALL_MIN_COLUMNS,
  removeWallColumn,
  renameWallColumn,
  reorderWallColumns,
  type RemoveColumnStrategy,
} from '@domain/rules/realtimeWallRules';
import { Modal } from '@adapters/components/common/Modal';
import { IconButton } from '@adapters/components/common/IconButton';

export interface RealtimeWallColumnEditorProps {
  readonly open: boolean;
  readonly columns: readonly RealtimeWallColumn[];
  readonly posts: readonly RealtimeWallPost[];
  readonly onClose: () => void;
  /** draft 편집을 저장. columns/posts 모두 반영해야 함. */
  readonly onApply: (
    nextColumns: readonly RealtimeWallColumn[],
    nextPosts: readonly RealtimeWallPost[],
  ) => void;
}

type RemoveStage =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'confirm-remove';
      readonly columnId: string;
      readonly columnTitle: string;
      readonly cardCount: number;
    };

export function RealtimeWallColumnEditor({
  open,
  columns,
  posts,
  onClose,
  onApply,
}: RealtimeWallColumnEditorProps) {
  // 드로어 내부 draft. 저장 전까지 원본은 건드리지 않음.
  const [draftColumns, setDraftColumns] = useState<readonly RealtimeWallColumn[]>(columns);
  const [draftPosts, setDraftPosts] = useState<readonly RealtimeWallPost[]>(posts);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [newTitleInput, setNewTitleInput] = useState('');
  const [removeStage, setRemoveStage] = useState<RemoveStage>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);

  // 드로어가 열릴 때마다 현재 값으로 초기화
  useEffect(() => {
    if (open) {
      setDraftColumns(columns);
      setDraftPosts(posts);
      setRenamingId(null);
      setRenameInput('');
      setNewTitleInput('');
      setRemoveStage({ kind: 'idle' });
      setError(null);
    }
  }, [open, columns, posts]);

  const approvedCountByColumn = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of draftPosts) {
      if (p.status === 'approved' || p.status === 'pending') {
        map.set(p.kanban.columnId, (map.get(p.kanban.columnId) ?? 0) + 1);
      }
    }
    return map;
  }, [draftPosts]);

  if (!open) return null;

  const canAddMore = draftColumns.length < REALTIME_WALL_MAX_COLUMNS;
  const canRemove = draftColumns.length > REALTIME_WALL_MIN_COLUMNS;

  const handleAdd = () => {
    const trimmed = newTitleInput.trim();
    if (trimmed.length === 0) {
      setError('컬럼 이름을 입력해주세요.');
      return;
    }
    if (!canAddMore) {
      setError(`컬럼은 최대 ${REALTIME_WALL_MAX_COLUMNS}개까지 만들 수 있어요.`);
      return;
    }
    const next = addWallColumn(draftColumns, trimmed);
    if (next.length === draftColumns.length) {
      setError('이 컬럼을 추가할 수 없어요.');
      return;
    }
    setDraftColumns(next);
    setNewTitleInput('');
    setError(null);
  };

  const handleStartRename = (column: RealtimeWallColumn) => {
    setRenamingId(column.id);
    setRenameInput(column.title);
    setError(null);
  };

  const handleCommitRename = () => {
    if (!renamingId) return;
    const trimmed = renameInput.trim();
    if (trimmed.length === 0) {
      setError('컬럼 이름을 비울 수 없어요.');
      return;
    }
    setDraftColumns(renameWallColumn(draftColumns, renamingId, trimmed));
    setRenamingId(null);
    setRenameInput('');
    setError(null);
  };

  const handleCancelRename = () => {
    setRenamingId(null);
    setRenameInput('');
    setError(null);
  };

  const handleMove = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= draftColumns.length) return;
    setDraftColumns(reorderWallColumns(draftColumns, index, targetIndex));
    setError(null);
  };

  const handleStartRemove = (column: RealtimeWallColumn) => {
    if (!canRemove) {
      setError(`컬럼은 최소 ${REALTIME_WALL_MIN_COLUMNS}개가 필요해요.`);
      return;
    }
    const cardCount = approvedCountByColumn.get(column.id) ?? 0;
    setRemoveStage({
      kind: 'confirm-remove',
      columnId: column.id,
      columnTitle: column.title,
      cardCount,
    });
    setError(null);
  };

  const handleConfirmRemove = (strategy: RemoveColumnStrategy) => {
    if (removeStage.kind !== 'confirm-remove') return;
    const result = removeWallColumn(
      draftColumns,
      draftPosts,
      removeStage.columnId,
      strategy,
    );
    setDraftColumns(result.columns);
    setDraftPosts(result.posts);
    setRemoveStage({ kind: 'idle' });
  };

  const handleCancelRemove = () => {
    setRemoveStage({ kind: 'idle' });
  };

  const handleSave = () => {
    onApply(draftColumns, draftPosts);
    onClose();
  };

  const handleCloseBackdrop = () => {
    // 편집 중 상태가 있으면 확인 없이 닫기만.
    // 더 정교한 "저장 안 한 변경 있음" 경고는 의도적으로 생략 (MVP 범위).
    onClose();
  };

  return (
    <Modal isOpen onClose={handleCloseBackdrop} title="컬럼 편집" srOnlyTitle size="lg">
      <div className="flex flex-col p-5 max-h-[calc(100vh-96px)]">
        {/* 헤더 */}
        <div className="mb-4 flex items-center gap-2.5">
          <span className="material-symbols-outlined text-[20px] text-sp-accent">view_column</span>
          <h3 className="text-base font-bold text-sp-text">컬럼 편집</h3>
          <span className="text-xs text-sp-muted">
            ({draftColumns.length} / {REALTIME_WALL_MAX_COLUMNS})
          </span>
          <IconButton icon="close" label="닫기" variant="ghost" size="sm" onClick={onClose} className="ml-auto" />
        </div>

        {/* 본문 */}
        {removeStage.kind === 'idle' ? (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ul className="space-y-2">
                {draftColumns.map((column, index) => {
                  const isRenaming = renamingId === column.id;
                  const cardCount = approvedCountByColumn.get(column.id) ?? 0;
                  return (
                    <li
                      key={column.id}
                      className="flex items-center gap-2 rounded-lg border border-sp-border bg-sp-surface px-3 py-2"
                    >
                      {/* 순서 이동 버튼 */}
                      <div className="flex flex-col">
                        <button
                          type="button"
                          onClick={() => handleMove(index, -1)}
                          disabled={index === 0}
                          className="rounded p-0.5 text-sp-muted transition hover:text-sp-text disabled:cursor-not-allowed disabled:opacity-30"
                          aria-label="위로"
                        >
                          <span className="material-symbols-outlined text-[14px]">arrow_upward</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMove(index, 1)}
                          disabled={index === draftColumns.length - 1}
                          className="rounded p-0.5 text-sp-muted transition hover:text-sp-text disabled:cursor-not-allowed disabled:opacity-30"
                          aria-label="아래로"
                        >
                          <span className="material-symbols-outlined text-[14px]">arrow_downward</span>
                        </button>
                      </div>

                      {/* 번호 */}
                      <span className="w-5 text-center text-[11px] text-sp-muted">{index + 1}</span>

                      {/* 제목 / 인라인 rename */}
                      {isRenaming ? (
                        <div className="flex min-w-0 flex-1 items-center gap-1.5">
                          <input
                            type="text"
                            value={renameInput}
                            onChange={(e) => setRenameInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleCommitRename();
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                handleCancelRename();
                              }
                            }}
                            autoFocus
                            maxLength={20}
                            className="min-w-0 flex-1 rounded border border-sp-accent/50 bg-sp-bg px-2 py-1 text-sm text-sp-text focus:outline-none focus:ring-1 focus:ring-sp-accent"
                          />
                          <button
                            type="button"
                            onClick={handleCommitRename}
                            className="rounded bg-sp-accent px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-sp-accent/85"
                          >
                            확인
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelRename}
                            className="rounded border border-sp-border px-2 py-1 text-[11px] text-sp-muted transition hover:text-sp-text"
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm text-sp-text">
                            {column.title}
                          </span>
                          {cardCount > 0 && (
                            <span className="shrink-0 rounded bg-sp-surface px-1.5 py-0.5 text-[10px] text-sp-muted">
                              {cardCount}장
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleStartRename(column)}
                            className="rounded p-1 text-sp-muted transition hover:bg-sp-bg hover:text-sp-text"
                            aria-label="이름 변경"
                          >
                            <span className="material-symbols-outlined text-[14px]">edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStartRemove(column)}
                            disabled={!canRemove}
                            className="rounded p-1 text-sp-muted transition hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30"
                            aria-label="삭제"
                          >
                            <span className="material-symbols-outlined text-[14px]">delete</span>
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>

              {/* + 컬럼 추가 */}
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="text"
                  value={newTitleInput}
                  onChange={(e) => setNewTitleInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAdd();
                    }
                  }}
                  maxLength={20}
                  placeholder={canAddMore ? '새 컬럼 이름' : '최대 6개까지 가능해요'}
                  disabled={!canAddMore}
                  className="min-w-0 flex-1 rounded-lg border border-sp-border bg-sp-surface px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={!canAddMore || newTitleInput.trim().length === 0}
                  className="rounded-lg bg-sp-accent px-3 py-2 text-xs font-bold text-white transition hover:bg-sp-accent/85 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  + 추가
                </button>
              </div>
              {error && (
                <p className="mt-2 text-xs text-red-400" role="alert">
                  {error}
                </p>
              )}
              <p className="mt-2 text-[11px] text-sp-muted">
                위/아래 화살표로 컬럼 순서를 바꿀 수 있어요.
                컬럼은 최소 {REALTIME_WALL_MIN_COLUMNS}개, 최대 {REALTIME_WALL_MAX_COLUMNS}개까지 가능합니다.
              </p>
            </div>

            {/* 액션 */}
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-sp-border px-4 py-2 text-xs text-sp-muted transition hover:border-sp-accent hover:text-sp-accent"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="rounded-lg bg-sp-accent px-4 py-2 text-xs font-bold text-white transition hover:bg-sp-accent/85"
              >
                저장
              </button>
            </div>
          </>
        ) : (
          // 삭제 확인 단계: 3전략 선택
          <RemoveConfirmPanel
            columnTitle={removeStage.columnTitle}
            cardCount={removeStage.cardCount}
            otherColumns={draftColumns.filter((c) => c.id !== removeStage.columnId)}
            onConfirm={handleConfirmRemove}
            onCancel={handleCancelRemove}
          />
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// RemoveConfirmPanel — 컬럼 삭제 3전략 선택 내부 뷰
// ---------------------------------------------------------------------------

interface RemoveConfirmPanelProps {
  readonly columnTitle: string;
  readonly cardCount: number;
  readonly otherColumns: readonly RealtimeWallColumn[];
  readonly onConfirm: (strategy: RemoveColumnStrategy) => void;
  readonly onCancel: () => void;
}

function RemoveConfirmPanel({
  columnTitle,
  cardCount,
  otherColumns,
  onConfirm,
  onCancel,
}: RemoveConfirmPanelProps) {
  const [moveTargetId, setMoveTargetId] = useState<string>(() => otherColumns[0]?.id ?? '');
  const hasCards = cardCount > 0;

  return (
    <div>
      <div className="mb-3 flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
        <span className="material-symbols-outlined mt-0.5 text-[18px] text-red-300">warning</span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-sp-text">
            &lsquo;{columnTitle}&rsquo; 컬럼을 삭제할까요?
          </p>
          {hasCards ? (
            <p className="mt-1 text-xs text-sp-muted">
              이 컬럼에 {cardCount}장의 카드가 있어요. 카드 처리 방법을 선택해주세요.
            </p>
          ) : (
            <p className="mt-1 text-xs text-sp-muted">컬럼 안에 카드는 없어요.</p>
          )}
        </div>
      </div>

      {hasCards ? (
        <div className="space-y-2">
          {/* 1. 다른 컬럼으로 이동 */}
          <div className="rounded-lg border border-sp-border bg-sp-surface p-3">
            <p className="text-sm font-semibold text-sp-text">다른 컬럼으로 이동</p>
            <p className="mt-0.5 text-xs text-sp-muted">카드를 선택한 컬럼 뒤로 옮깁니다.</p>
            <div className="mt-2 flex items-center gap-2">
              <select
                value={moveTargetId}
                onChange={(e) => setMoveTargetId(e.target.value)}
                className="min-w-0 flex-1 rounded border border-sp-border bg-sp-bg px-2 py-1.5 text-xs text-sp-text"
              >
                {otherColumns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() =>
                  onConfirm({ kind: 'move-to', targetColumnId: moveTargetId })
                }
                disabled={!moveTargetId}
                className="rounded bg-sp-accent px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-sp-accent/85 disabled:cursor-not-allowed disabled:opacity-40"
              >
                이동
              </button>
            </div>
          </div>

          {/* 2. 숨김 처리 */}
          <button
            type="button"
            onClick={() => onConfirm({ kind: 'hide' })}
            className="w-full rounded-lg border border-sp-border bg-sp-surface p-3 text-left transition hover:border-amber-500/50"
          >
            <p className="text-sm font-semibold text-sp-text">카드 숨김 처리</p>
            <p className="mt-0.5 text-xs text-sp-muted">
              카드는 숨김 처리되어 보드에서 사라지지만, 나중에 복구할 수 있어요.
            </p>
          </button>

          {/* 3. 영구 삭제 */}
          <button
            type="button"
            onClick={() => onConfirm({ kind: 'delete' })}
            className="w-full rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-left transition hover:border-red-500/60"
          >
            <p className="text-sm font-semibold text-red-300">카드 영구 삭제</p>
            <p className="mt-0.5 text-xs text-sp-muted">
              카드가 완전히 삭제됩니다. 되돌릴 수 없어요.
            </p>
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onConfirm({ kind: 'delete' })}
            className="rounded-lg bg-red-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-red-500/85"
          >
            삭제
          </button>
        </div>
      )}

      <div className="mt-3 flex items-center justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-sp-border px-4 py-2 text-xs text-sp-muted transition hover:border-sp-accent hover:text-sp-accent"
        >
          취소
        </button>
      </div>
    </div>
  );
}
