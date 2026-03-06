import { useState } from 'react';
import type { BookmarkGroup } from '@domain/entities/Bookmark';

interface BookmarkGroupModalProps {
  group: BookmarkGroup | null;
  onSave: (data: { name: string; emoji: string }) => void;
  onClose: () => void;
}

const EMOJI_GRID = [
  '📚', '💼', '🛠️', '📝', '🎓', '🏫', '📖', '💡',
  '🔬', '🎨', '🎵', '⚽', '🌍', '💻', '📊', '🔗',
  '🤖', '🔔', '📌', '🖼️',
];

export function BookmarkGroupModal({
  group,
  onSave,
  onClose,
}: BookmarkGroupModalProps) {
  const isEdit = group !== null;
  const [name, setName] = useState(group?.name ?? '');
  const [emoji, setEmoji] = useState(group?.emoji ?? '📚');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), emoji });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-sp-surface border border-sp-border rounded-2xl w-full max-w-sm p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-white mb-5">
          {isEdit ? '그룹 편집' : '그룹 추가'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 그룹명 */}
          <div>
            <label className="block text-sm text-sp-muted mb-1">그룹명 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="그룹 이름"
              className="w-full bg-sp-card border border-sp-border rounded-lg px-3 py-2 text-sp-text placeholder-sp-muted/50 focus:border-sp-accent focus:outline-none"
              autoFocus
            />
          </div>

          {/* 이모지 선택 */}
          <div>
            <label className="block text-sm text-sp-muted mb-1">이모지</label>
            <div className="p-3 bg-sp-card border border-sp-border rounded-lg grid grid-cols-5 gap-2">
              {EMOJI_GRID.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  className={`w-10 h-10 flex items-center justify-center rounded-lg text-xl transition-colors ${
                    emoji === e
                      ? 'bg-sp-accent/20 ring-2 ring-sp-accent'
                      : 'hover:bg-sp-border'
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* 버튼 */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg bg-sp-card hover:bg-sp-border text-sp-text transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-4 py-2 text-sm rounded-lg bg-sp-accent hover:bg-blue-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isEdit ? '저장' : '추가'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
