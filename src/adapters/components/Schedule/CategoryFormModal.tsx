import { useState } from 'react';
import { CATEGORY_COLOR_PRESETS } from '@domain/entities/SchoolEvent';
import { getCategoryColors } from '@adapters/presenters/categoryPresenter';
import { Modal } from '@adapters/components/common/Modal';

interface CategoryFormModalProps {
  onSubmit: (name: string, color: string) => void;
  onClose: () => void;
}

export function CategoryFormModal({ onSubmit, onClose }: CategoryFormModalProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(CATEGORY_COLOR_PRESETS[0]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit(name.trim(), color);
  }

  return (
    <Modal isOpen onClose={onClose} title="카테고리 추가" srOnlyTitle size="sm">
      <div>
        {/* 헤더 */}
        <div className="flex items-center justify-between p-6 pb-4 border-b border-sp-border">
          <h3 className="text-lg font-bold text-sp-text">카테고리 추가</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="p-1 hover:bg-sp-surface rounded-lg transition-colors text-sp-muted hover:text-sp-text"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

          {/* 폼 */}
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* 카테고리명 */}
            <div>
              <label className="block text-sm font-medium text-sp-muted mb-1.5">
                카테고리 이름 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 동아리"
                className="w-full bg-sp-bg border border-sp-border rounded-xl px-4 py-2.5 text-sm text-sp-text placeholder-sp-muted focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent"
                required
                autoFocus
              />
            </div>

            {/* 색상 선택 */}
            <div>
              <label className="block text-sm font-medium text-sp-muted mb-2">색상</label>
              <div className="flex gap-3 flex-wrap">
                {CATEGORY_COLOR_PRESETS.map((c) => {
                  const colors = getCategoryColors(c);
                  const isSelected = c === color;

                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-8 h-8 rounded-full transition-all ${colors.dot} ${
                        isSelected
                          ? 'ring-2 ring-sp-text ring-offset-2 ring-offset-sp-card scale-110'
                          : 'hover:scale-110'
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            {/* 버튼 */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-sp-border px-4 py-2.5 text-sm font-semibold text-sp-muted hover:bg-sp-surface transition-all"
              >
                취소
              </button>
              <button
                type="submit"
                className="flex-1 rounded-xl bg-sp-accent hover:bg-sp-accent/90 text-sp-accent-fg px-4 py-2.5 text-sm font-semibold shadow-sm transition-all"
              >
                추가
              </button>
            </div>
          </form>
      </div>
    </Modal>
  );
}
