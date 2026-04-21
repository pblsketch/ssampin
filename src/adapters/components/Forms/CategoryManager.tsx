import { useState } from 'react';
import type { FormCategory } from '@domain/entities/FormCategory';
import { useFormStore } from '@adapters/stores/useFormStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { CategoryInUseError } from '@domain/errors/FormErrors';
import { generateUUID } from '@infrastructure/utils/uuid';

interface CategoryManagerProps {
  readonly onClose: () => void;
}

const COLOR_PRESETS: ReadonlyArray<{ label: string; value: string }> = [
  { label: '파랑',   value: '#3b82f6' },
  { label: '앰버',   value: '#f59e0b' },
  { label: '초록',   value: '#10b981' },
  { label: '보라',   value: '#8b5cf6' },
  { label: '회색',   value: '#64748b' },
  { label: '분홍',   value: '#ec4899' },
];

const ICON_PRESETS: readonly string[] = [
  'folder', 'mail', 'description', 'grade', 'assignment', 'forum', 'school', 'edit_note',
];

export function CategoryManager({ onClose }: CategoryManagerProps) {
  const categories = useFormStore((s) => s.categories);
  const upsertCategory = useFormStore((s) => s.upsertCategory);
  const deleteCategory = useFormStore((s) => s.deleteCategory);
  const showToast = useToastStore((s) => s.show);

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('folder');
  const [color, setColor] = useState('#3b82f6');

  const handleAdd = async () => {
    if (!name.trim()) {
      showToast('카테고리 이름을 입력해 주세요', 'error');
      return;
    }
    const newCategory: FormCategory = {
      id: `user:${generateUUID()}`,
      name: name.trim(),
      icon,
      color,
      order: categories.length,
      isBuiltin: false,
    };
    try {
      await upsertCategory(newCategory);
      showToast('카테고리를 추가했습니다', 'success');
      setName('');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : '카테고리 추가에 실패했습니다',
        'error',
      );
    }
  };

  const handleDelete = async (c: FormCategory) => {
    if (c.isBuiltin) return;
    if (!window.confirm(`"${c.name}" 카테고리를 삭제할까요?`)) return;
    try {
      await deleteCategory(c.id);
      showToast('카테고리를 삭제했습니다', 'success');
    } catch (err) {
      if (err instanceof CategoryInUseError) {
        showToast(
          `${err.count}개 서식이 이 카테고리를 사용 중입니다`,
          'error',
        );
      } else {
        showToast(
          err instanceof Error ? err.message : '카테고리 삭제에 실패했습니다',
          'error',
        );
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-sp-surface border border-sp-border rounded-xl w-full max-w-md max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-sp-border">
          <h2 className="text-lg font-bold text-sp-text">카테고리 관리</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sp-muted hover:text-sp-text p-1 rounded-lg hover:bg-sp-bg"
            aria-label="닫기"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>

        <div className="p-4 space-y-4">
          <section>
            <h3 className="text-xs font-semibold text-sp-muted uppercase tracking-wide mb-2">
              기존 카테고리
            </h3>
            <ul className="space-y-1">
              {categories.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between px-3 py-2 bg-sp-card border border-sp-border rounded-lg"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="material-symbols-outlined text-base text-sp-muted">
                      {c.icon}
                    </span>
                    <span className="text-sm text-sp-text truncate">{c.name}</span>
                    {c.isBuiltin && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-sp-bg text-[10px] text-sp-muted border border-sp-border">
                        <span className="material-symbols-outlined text-[11px]">lock</span>
                        기본
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={c.isBuiltin}
                    onClick={() => handleDelete(c)}
                    className={`p-1 rounded ${
                      c.isBuiltin
                        ? 'text-sp-muted/40 cursor-not-allowed'
                        : 'text-red-400 hover:bg-sp-bg'
                    }`}
                    title={c.isBuiltin ? '내장 카테고리는 삭제할 수 없습니다' : '삭제'}
                  >
                    <span className="material-symbols-outlined text-base">delete</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-3 pt-4 border-t border-sp-border">
            <h3 className="text-xs font-semibold text-sp-muted uppercase tracking-wide">
              새 카테고리
            </h3>
            <div>
              <label className="block text-xs text-sp-muted mb-1">이름</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 학급운영"
                className="w-full px-3 py-2 bg-sp-card border border-sp-border rounded-lg text-sm text-sp-text placeholder:text-sp-muted focus:outline-none focus:border-sp-accent"
              />
            </div>
            <div>
              <label className="block text-xs text-sp-muted mb-1">아이콘</label>
              <div className="flex flex-wrap gap-1">
                {ICON_PRESETS.map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setIcon(i)}
                    className={`p-2 rounded-lg border ${
                      icon === i
                        ? 'bg-sp-accent text-white border-sp-accent'
                        : 'bg-sp-card text-sp-muted border-sp-border hover:text-sp-text'
                    }`}
                  >
                    <span className="material-symbols-outlined text-base">{i}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-sp-muted mb-1">색상</label>
              <div className="flex flex-wrap gap-2">
                {COLOR_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setColor(p.value)}
                    title={p.label}
                    className={`w-7 h-7 rounded-full border-2 ${
                      color === p.value ? 'border-sp-text' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: p.value }}
                  />
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={handleAdd}
              className="w-full px-3 py-2 bg-sp-accent text-white rounded-lg text-sm hover:bg-sp-accent/90"
            >
              카테고리 추가
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
