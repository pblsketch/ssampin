/**
 * BoardListPanel — 저장된 보드 목록 + 신규 생성 + 이름변경 + 삭제 (Design §5.4)
 *
 * 좌측 사이드바 스타일. 선택 시 onSelect 콜백으로 부모에 전달.
 */
import { useEffect, useState } from 'react';

import { useBoardStore } from '@adapters/stores/useBoardStore';
import { useBoardSessionStore } from '@adapters/stores/useBoardSessionStore';

interface BoardListPanelProps {
  readonly selectedBoardId: string | null;
  readonly onSelect: (id: string) => void;
}

function formatRelativeTime(timestamp: number | null): string {
  if (!timestamp) return '-';
  const diff = Date.now() - timestamp;
  const s = Math.floor(diff / 1000);
  if (s < 60) return '방금';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}일 전`;
  const mo = Math.floor(d / 30);
  return `${mo}개월 전`;
}

export function BoardListPanel({ selectedBoardId, onSelect }: BoardListPanelProps): JSX.Element {
  const boards = useBoardStore((s) => s.boards);
  const loading = useBoardStore((s) => s.loading);
  const error = useBoardStore((s) => s.error);
  const load = useBoardStore((s) => s.load);
  const create = useBoardStore((s) => s.create);
  const rename = useBoardStore((s) => s.rename);
  const remove = useBoardStore((s) => s.remove);

  const active = useBoardSessionStore((s) => s.active);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(): Promise<void> {
    const board = await create();
    if (board) {
      onSelect(board.id);
    }
  }

  function startRename(id: string, currentName: string): void {
    setEditingId(id);
    setEditName(currentName);
  }

  async function commitRename(id: string): Promise<void> {
    const trimmed = editName.trim();
    if (trimmed.length > 0) {
      await rename(id, trimmed);
    }
    setEditingId(null);
    setEditName('');
  }

  async function handleDelete(id: string, name: string): Promise<void> {
    if (active?.boardId === id) {
      window.alert('실행 중인 보드는 삭제할 수 없습니다. 먼저 종료해주세요.');
      return;
    }
    const ok = window.confirm(`"${name}" 보드를 삭제하시겠습니까?\n저장된 내용도 함께 삭제됩니다.`);
    if (!ok) return;
    await remove(id);
  }

  return (
    <div className="bg-sp-card rounded-xl p-4 flex flex-col h-full min-h-[400px]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-sp-text">보드 목록</h3>
        <button
          type="button"
          onClick={handleCreate}
          className="px-2 py-1 text-xs bg-sp-accent/20 text-sp-accent rounded-md hover:bg-sp-accent/30 flex items-center gap-1"
          title="새 보드"
        >
          <span className="material-symbols-outlined text-icon-xs">add</span>
          새 보드
        </button>
      </div>

      {error && <div className="text-xs text-red-400 mb-2 break-words">{error}</div>}

      <div className="flex-1 overflow-y-auto space-y-1">
        {loading && boards.length === 0 && (
          <div className="text-xs text-sp-muted text-center py-8">불러오는 중…</div>
        )}
        {!loading && boards.length === 0 && (
          <div className="text-xs text-sp-muted text-center py-8">
            아직 보드가 없습니다.<br />&quot;새 보드&quot;를 눌러 시작하세요.
          </div>
        )}

        {boards.map((b) => {
          const isSelected = b.id === selectedBoardId;
          const isActive = active?.boardId === b.id;
          return (
            <div
              key={b.id}
              className={`group rounded-lg border transition ${
                isSelected
                  ? 'bg-sp-accent/10 border-sp-accent/40'
                  : 'bg-sp-bg/60 border-transparent hover:border-sp-border/60'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(b.id)}
                className="w-full text-left px-3 py-2 flex items-center gap-2"
              >
                {isActive && (
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"
                    title="실행 중"
                  />
                )}
                {editingId === b.id ? (
                  <input
                    type="text"
                    value={editName}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => void commitRename(b.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void commitRename(b.id);
                      if (e.key === 'Escape') { setEditingId(null); setEditName(''); }
                    }}
                    className="flex-1 bg-sp-bg border border-sp-border/60 rounded px-2 py-1 text-sm text-sp-text"
                  />
                ) : (
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-sp-text truncate">{b.name}</div>
                    <div className="text-[10px] text-sp-muted">
                      {b.participantHistory.length > 0
                        ? `참여 ${b.participantHistory.length}명 · ${formatRelativeTime(b.updatedAt)}`
                        : formatRelativeTime(b.updatedAt)}
                    </div>
                  </div>
                )}
                {editingId !== b.id && (
                  <div className="flex opacity-0 group-hover:opacity-100 transition">
                    <span
                      onClick={(e) => { e.stopPropagation(); startRename(b.id, b.name); }}
                      className="material-symbols-outlined text-icon-sm text-sp-muted hover:text-sp-text p-1"
                      title="이름 변경"
                    >
                      edit
                    </span>
                    <span
                      onClick={(e) => { e.stopPropagation(); void handleDelete(b.id, b.name); }}
                      className="material-symbols-outlined text-icon-sm text-sp-muted hover:text-red-400 p-1"
                      title="삭제"
                    >
                      delete
                    </span>
                  </div>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
