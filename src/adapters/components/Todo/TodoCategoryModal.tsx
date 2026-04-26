import { useState, useCallback } from 'react';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import type { TodoCategory } from '@domain/entities/Todo';
import { Modal } from '@adapters/components/common/Modal';
import { IconButton } from '@adapters/components/common/IconButton';

interface TodoCategoryModalProps {
  onClose: () => void;
}

const COLOR_OPTIONS = [
  { value: 'blue', label: '파랑', bg: 'bg-blue-500' },
  { value: 'green', label: '초록', bg: 'bg-green-500' },
  { value: 'yellow', label: '노랑', bg: 'bg-yellow-500' },
  { value: 'purple', label: '보라', bg: 'bg-purple-500' },
  { value: 'red', label: '빨강', bg: 'bg-red-500' },
  { value: 'pink', label: '분홍', bg: 'bg-pink-500' },
  { value: 'gray', label: '회색', bg: 'bg-gray-500' },
];

const ICON_OPTIONS = ['📚', '📋', '👨‍🎓', '🤝', '📌', '🎓', '📝', '💡', '🔔', '⭐'];

export function TodoCategoryModal({ onClose }: TodoCategoryModalProps) {
  const { categories, saveCategories } = useTodoStore();
  const [editCategories, setEditCategories] = useState<TodoCategory[]>([...categories]);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('blue');
  const [newIcon, setNewIcon] = useState('📌');

  const handleAdd = useCallback(() => {
    const name = newName.trim();
    if (!name) return;
    const newCat: TodoCategory = {
      id: `cat_${Date.now()}`,
      name,
      color: newColor,
      icon: newIcon,
    };
    setEditCategories((prev) => [...prev, newCat]);
    setNewName('');
  }, [newName, newColor, newIcon]);

  const handleRemove = useCallback((id: string) => {
    setEditCategories((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const handleUpdateName = useCallback((id: string, name: string) => {
    setEditCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, name } : c)),
    );
  }, []);

  const handleUpdateColor = useCallback((id: string, color: string) => {
    setEditCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, color } : c)),
    );
  }, []);

  const handleUpdateIcon = useCallback((id: string, icon: string) => {
    setEditCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, icon } : c)),
    );
  }, []);

  const handleSave = useCallback(() => {
    let finalCategories = editCategories;
    const pendingName = newName.trim();
    if (pendingName) {
      const pendingCat: TodoCategory = {
        id: `cat_${Date.now()}`,
        name: pendingName,
        color: newColor,
        icon: newIcon,
      };
      finalCategories = [...finalCategories, pendingCat];
    }
    void saveCategories(finalCategories);
    onClose();
  }, [editCategories, newName, newColor, newIcon, saveCategories, onClose]);

  return (
    <Modal isOpen onClose={onClose} title="카테고리 관리" srOnlyTitle size="md">
      <div className="flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-sp-border">
          <h3 className="text-sp-text font-bold text-lg flex items-center gap-2">
            <span>📁</span> 카테고리 관리
          </h3>
          <IconButton icon="close" label="닫기" variant="ghost" size="md" onClick={onClose} />
        </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
            {/* 기존 카테고리 */}
            {editCategories.map((cat) => (
              <div
                key={cat.id}
                className="flex items-center gap-2 bg-sp-surface rounded-lg px-3 py-2"
              >
                {/* 아이콘 선택 */}
                <select
                  value={cat.icon}
                  onChange={(e) => handleUpdateIcon(cat.id, e.target.value)}
                  className="bg-transparent text-base w-10 cursor-pointer focus:outline-none"
                >
                  {ICON_OPTIONS.map((icon) => (
                    <option key={icon} value={icon}>
                      {icon}
                    </option>
                  ))}
                </select>

                {/* 이름 편집 */}
                <input
                  type="text"
                  value={cat.name}
                  onChange={(e) => handleUpdateName(cat.id, e.target.value)}
                  className="flex-1 bg-transparent text-sp-text text-sm focus:outline-none border-b border-transparent focus:border-sp-accent transition-colors"
                />

                {/* 색상 선택 */}
                <div className="flex gap-1">
                  {COLOR_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleUpdateColor(cat.id, opt.value)}
                      className={`w-4 h-4 rounded-full ${opt.bg} transition-transform ${
                        cat.color === opt.value ? 'ring-2 ring-white scale-110' : 'opacity-50 hover:opacity-80'
                      }`}
                      title={opt.label}
                    />
                  ))}
                </div>

                {/* 삭제 */}
                <button
                  type="button"
                  onClick={() => handleRemove(cat.id)}
                  className="p-1 rounded text-sp-muted hover:text-red-400 transition-colors"
                >
                  <span className="material-symbols-outlined text-icon">delete</span>
                </button>
              </div>
            ))}

            {/* 새 카테고리 추가 */}
            <div className="flex items-center gap-2 bg-sp-surface/50 rounded-lg px-3 py-2 ring-1 ring-dashed ring-sp-border">
              <select
                value={newIcon}
                onChange={(e) => setNewIcon(e.target.value)}
                className="bg-transparent text-base w-10 cursor-pointer focus:outline-none"
              >
                {ICON_OPTIONS.map((icon) => (
                  <option key={icon} value={icon}>
                    {icon}
                  </option>
                ))}
              </select>

              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="새 카테고리 이름..."
                className="flex-1 bg-transparent text-sp-text text-sm placeholder:text-sp-muted focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAdd();
                  }
                }}
              />

              <div className="flex gap-1">
                {COLOR_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setNewColor(opt.value)}
                    className={`w-4 h-4 rounded-full ${opt.bg} transition-transform ${
                      newColor === opt.value ? 'ring-2 ring-white scale-110' : 'opacity-50 hover:opacity-80'
                    }`}
                    title={opt.label}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={handleAdd}
                disabled={!newName.trim()}
                className="p-1 rounded text-sp-accent hover:bg-sp-accent/10 disabled:opacity-30 transition-colors"
              >
                <span className="material-symbols-outlined text-icon-md">add</span>
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-5 py-4 border-t border-sp-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium text-sp-muted hover:text-sp-text hover:bg-sp-surface transition-colors"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 rounded-xl text-sm font-bold bg-sp-accent hover:bg-sp-accent/90 text-sp-accent-fg transition-colors shadow-sp-md"
            >
              저장
            </button>
          </div>
      </div>
    </Modal>
  );
}
