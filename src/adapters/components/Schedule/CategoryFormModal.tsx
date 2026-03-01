import { useState } from 'react';
import { CATEGORY_COLOR_PRESETS } from '@domain/entities/SchoolEvent';
import { getCategoryColors } from '@adapters/presenters/categoryPresenter';

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
    <>
      {/* 오버레이 */}
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* 모달 */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="w-full max-w-[400px] bg-sp-card rounded-2xl border border-sp-border shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 헤더 */}
          <div className="flex items-center justify-between p-6 pb-4 border-b border-sp-border">
            <h2 className="text-lg font-bold text-white">카테고리 추가</h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1 hover:bg-slate-700 rounded-lg transition-colors text-sp-muted hover:text-white"
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
                className="w-full bg-sp-bg border border-sp-border rounded-xl px-4 py-2.5 text-sm text-sp-text placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent"
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
                          ? 'ring-2 ring-white ring-offset-2 ring-offset-sp-card scale-110'
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
                className="flex-1 rounded-xl bg-sp-accent hover:bg-blue-600 text-white px-4 py-2.5 text-sm font-semibold shadow-sm transition-all"
              >
                추가
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
