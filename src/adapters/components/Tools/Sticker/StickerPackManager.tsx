import { useState } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import { useStickerStore } from '@adapters/stores/useStickerStore';
import { DEFAULT_PACK_ID } from '@domain/entities/Sticker';
import { useToastStore } from '@adapters/components/common/Toast';
import { validatePackName } from '@domain/rules/stickerRules';

interface StickerPackManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * 팩 CRUD 모달.
 *
 * - 새 팩 추가 (인라인 폼)
 * - 이름 변경 (인라인 편집)
 * - 삭제 (확인 단계, 미분류는 불가)
 * - 순서 변경 (위/아래 화살표 — 드래그앤드롭은 MVP 이후)
 */
export function StickerPackManager({ isOpen, onClose }: StickerPackManagerProps): JSX.Element {
  const data = useStickerStore((s) => s.data);
  const addPack = useStickerStore((s) => s.addPack);
  const renamePack = useStickerStore((s) => s.renamePack);
  const deletePack = useStickerStore((s) => s.deletePack);
  const reorderPacks = useStickerStore((s) => s.reorderPacks);

  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const sortedPacks = [...data.packs].sort((a, b) => a.order - b.order);

  const stickerCountPerPack = (packId: string): number =>
    data.stickers.filter((s) => s.packId === packId).length;

  const handleAdd = async () => {
    const validation = validatePackName(newName, data.packs);
    if (!validation.ok) {
      useToastStore.getState().show(validation.reason, 'error');
      return;
    }
    const pack = await addPack(newName.trim());
    if (pack) {
      setNewName('');
      useToastStore.getState().show(`"${pack.name}" 팩을 만들었어요.`, 'success');
    }
  };

  const handleRename = async (packId: string) => {
    const validation = validatePackName(editName, data.packs, packId);
    if (!validation.ok) {
      useToastStore.getState().show(validation.reason, 'error');
      return;
    }
    await renamePack(packId, editName.trim());
    setEditingId(null);
  };

  const handleDelete = async (packId: string) => {
    await deletePack(packId);
    setConfirmDeleteId(null);
  };

  const handleMove = async (packId: string, dir: -1 | 1) => {
    const idx = sortedPacks.findIndex((p) => p.id === packId);
    if (idx === -1) return;
    const target = idx + dir;
    if (target < 0 || target >= sortedPacks.length) return;
    const next = [...sortedPacks];
    const [moved] = next.splice(idx, 1);
    next.splice(target, 0, moved!);
    await reorderPacks(next.map((p) => p.id));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="팩 관리" srOnlyTitle size="md">
      <div className="flex flex-col">
        <header className="flex items-center justify-between px-5 py-4 border-b border-sp-border">
          <h3 className="text-base font-sp-bold text-sp-text flex items-center gap-2">
            <span className="material-symbols-outlined icon-md text-sp-muted">folder</span>
            팩 관리
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="p-1.5 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>

        <div className="px-5 py-5 flex flex-col gap-4 max-h-[60vh] overflow-y-auto">
          {/* 새 팩 추가 */}
          <div className="rounded-xl bg-sp-bg/40 ring-1 ring-sp-border p-3">
            <p className="text-detail font-sp-semibold uppercase tracking-wider text-sp-muted mb-2">
              새 팩 만들기
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newName}
                maxLength={20}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="예: 수업용, 인사, 밈"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleAdd();
                  }
                }}
                className="flex-1 px-3 py-2 rounded-lg bg-sp-bg ring-1 ring-sp-border text-sp-text placeholder:text-sp-muted focus:outline-none focus:ring-2 focus:ring-sp-accent text-sm"
              />
              <button
                type="button"
                onClick={() => void handleAdd()}
                disabled={!newName.trim()}
                className="px-3 py-2 rounded-lg bg-sp-accent text-sp-accent-fg text-xs font-sp-semibold disabled:opacity-50 hover:bg-sp-accent/90 active:scale-95 transition-all"
              >
                추가
              </button>
            </div>
          </div>

          {/* 팩 목록 */}
          <div className="flex flex-col gap-1.5">
            {sortedPacks.map((pack, i) => {
              const isDefault = pack.id === DEFAULT_PACK_ID;
              const isEditing = editingId === pack.id;
              const count = stickerCountPerPack(pack.id);
              const confirming = confirmDeleteId === pack.id;

              return (
                <div
                  key={pack.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-sp-bg/30 ring-1 ring-sp-border group"
                >
                  <span
                    aria-hidden="true"
                    className="material-symbols-outlined icon-md text-sp-muted shrink-0"
                  >
                    folder
                  </span>

                  {isEditing ? (
                    <input
                      type="text"
                      value={editName}
                      maxLength={20}
                      autoFocus
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void handleRename(pack.id);
                        } else if (e.key === 'Escape') {
                          setEditingId(null);
                        }
                      }}
                      onBlur={() => void handleRename(pack.id)}
                      className="flex-1 px-2 py-1 rounded bg-sp-bg ring-1 ring-sp-accent text-sp-text text-sm focus:outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      disabled={isDefault}
                      onClick={() => {
                        setEditingId(pack.id);
                        setEditName(pack.name);
                      }}
                      className="flex-1 text-left text-sm text-sp-text hover:underline disabled:no-underline disabled:cursor-default"
                    >
                      {pack.name}
                      {isDefault && (
                        <span className="ml-2 text-detail text-sp-muted">(기본)</span>
                      )}
                    </button>
                  )}

                  <span className="text-detail text-sp-muted shrink-0">{count}개</span>

                  {confirming ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-1 rounded text-detail text-sp-muted hover:text-sp-text"
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(pack.id)}
                        className="px-2 py-1 rounded bg-red-600 text-white text-detail font-sp-semibold hover:bg-red-500"
                      >
                        삭제
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => void handleMove(pack.id, -1)}
                        disabled={i === 0}
                        aria-label="위로"
                        className="p-1 rounded text-sp-muted hover:text-sp-text hover:bg-sp-text/5 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <span className="material-symbols-outlined icon-sm">arrow_upward</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleMove(pack.id, 1)}
                        disabled={i === sortedPacks.length - 1}
                        aria-label="아래로"
                        className="p-1 rounded text-sp-muted hover:text-sp-text hover:bg-sp-text/5 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <span className="material-symbols-outlined icon-sm">arrow_downward</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(pack.id)}
                        disabled={isDefault}
                        aria-label="삭제"
                        title={isDefault ? '기본 팩은 삭제할 수 없어요' : '삭제'}
                        className="p-1 rounded text-red-400 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                      >
                        <span className="material-symbols-outlined icon-sm">delete</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-detail text-sp-muted">
            팩을 삭제해도 이모티콘은 사라지지 않고 자동으로 미분류 팩으로 이동해요.
          </p>
        </div>

        <footer className="flex items-center justify-end px-5 py-4 border-t border-sp-border bg-sp-bg/30">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-sp-accent text-sp-accent-fg text-sm font-sp-semibold hover:bg-sp-accent/90 active:scale-95 transition-all"
          >
            완료
          </button>
        </footer>
      </div>
    </Modal>
  );
}
