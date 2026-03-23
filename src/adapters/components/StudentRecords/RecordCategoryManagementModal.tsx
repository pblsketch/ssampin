import { useState } from 'react';
import { useStudentRecordsStore, RECORD_COLOR_MAP } from '@adapters/stores/useStudentRecordsStore';
import type { RecordCategoryItem } from '@domain/valueObjects/RecordCategory';

interface Props {
  onClose: () => void;
}

const COLOR_OPTIONS = Object.keys(RECORD_COLOR_MAP) as string[];

export function RecordCategoryManagementModal({ onClose }: Props) {
  const {
    categories,
    addCategory,
    updateCategory,
    deleteCategory,
    addSubcategory,
    deleteSubcategory,
  } = useStudentRecordsStore();

  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('blue');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newSubInputs, setNewSubInputs] = useState<Record<string, string>>({});
  const [editingCat, setEditingCat] = useState<{ id: string; name: string; color: string } | null>(null);

  const handleAddCategory = async () => {
    const trimmed = newCatName.trim();
    if (!trimmed) return;
    await addCategory(trimmed, newCatColor);
    setNewCatName('');
    setNewCatColor('blue');
  };

  const handleUpdateCategory = async () => {
    if (!editingCat) return;
    const target = categories.find((c) => c.id === editingCat.id);
    if (!target) return;
    const updated: RecordCategoryItem = {
      ...target,
      name: editingCat.name,
      color: editingCat.color,
    };
    await updateCategory(updated);
    setEditingCat(null);
  };

  const handleAddSub = async (catId: string) => {
    const name = (newSubInputs[catId] ?? '').trim();
    if (!name) return;
    await addSubcategory(catId, name);
    setNewSubInputs((prev) => ({ ...prev, [catId]: '' }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" aria-hidden="true">
      <div
        className="w-full max-w-[560px] max-h-[80vh] flex flex-col rounded-2xl bg-sp-card border border-sp-border shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title-record-category-management"
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-sp-border">
          <h2 id="modal-title-record-category-management" className="text-base font-bold text-sp-text flex items-center gap-2">
            <span className="material-symbols-outlined text-base">tune</span>
            카테고리 관리
          </h2>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="text-sp-muted hover:text-sp-text transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {categories.map((cat) => {
            const colorEntry = RECORD_COLOR_MAP[cat.color] ?? RECORD_COLOR_MAP['gray']!;
            const isExpanded = expandedId === cat.id;
            const isEditing = editingCat?.id === cat.id;

            return (
              <div key={cat.id} className="rounded-xl bg-sp-surface border border-sp-border overflow-hidden">
                {/* 카테고리 헤더 행 */}
                <div className="flex items-center gap-2 px-4 py-3">
                  {isEditing ? (
                    <>
                      <input
                        value={editingCat.name}
                        onChange={(e) => setEditingCat((prev) => prev ? { ...prev, name: e.target.value } : prev)}
                        className="flex-1 bg-sp-card border border-sp-border rounded-lg px-2 py-1 text-sm text-sp-text focus:outline-none focus:ring-1 focus:ring-sp-accent"
                      />
                      <select
                        value={editingCat.color}
                        onChange={(e) => setEditingCat((prev) => prev ? { ...prev, color: e.target.value } : prev)}
                        className="bg-sp-card border border-sp-border rounded-lg px-2 py-1 text-xs text-sp-text focus:outline-none"
                      >
                        {COLOR_OPTIONS.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => void handleUpdateCategory()}
                        className="text-xs text-sp-accent hover:text-sp-accent/80 transition-colors"
                      >
                        저장
                      </button>
                      <button
                        onClick={() => setEditingCat(null)}
                        className="text-xs text-sp-muted hover:text-sp-text transition-colors"
                      >
                        취소
                      </button>
                    </>
                  ) : (
                    <>
                      <span className={`text-sm font-semibold ${colorEntry.text}`}>{cat.name}</span>
                      <span className="text-xs text-sp-muted">({cat.subcategories.length})</span>
                      <div className="flex items-center gap-2 ml-auto">
                        <button
                          onClick={() => setIsExpanded(cat.id, !isExpanded)}
                          className="text-xs text-sp-muted hover:text-sp-text transition-colors"
                        >
                          {isExpanded ? '접기' : '펼치기'}
                        </button>
                        <button
                          onClick={() => setEditingCat({ id: cat.id, name: cat.name, color: cat.color })}
                          className="text-xs text-sp-muted hover:text-sp-accent transition-colors"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => void deleteCategory(cat.id)}
                          className="text-xs text-sp-muted hover:text-red-400 transition-colors"
                        >
                          삭제
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* 서브카테고리 */}
                {isExpanded && (
                  <div className="border-t border-sp-border px-4 py-3 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {cat.subcategories.map((sub) => (
                        <span
                          key={sub}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs ${colorEntry.inactiveBg}`}
                        >
                          {sub}
                          <button
                            onClick={() => void deleteSubcategory(cat.id, sub)}
                            className="ml-1 opacity-60 hover:opacity-100 transition-opacity"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        value={newSubInputs[cat.id] ?? ''}
                        onChange={(e) =>
                          setNewSubInputs((prev) => ({ ...prev, [cat.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void handleAddSub(cat.id);
                        }}
                        placeholder="서브카테고리 추가..."
                        className="flex-1 bg-sp-card border border-sp-border rounded-lg px-3 py-1.5 text-xs text-sp-text placeholder-sp-muted focus:outline-none focus:ring-1 focus:ring-sp-accent"
                      />
                      <button
                        onClick={() => void handleAddSub(cat.id)}
                        className="text-xs text-sp-accent hover:text-sp-accent/80 transition-colors"
                      >
                        추가
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 새 카테고리 추가 */}
        <div className="px-6 py-4 border-t border-sp-border">
          <p className="text-xs font-semibold text-sp-muted mb-3">새 카테고리 추가</p>
          <div className="flex items-center gap-2">
            <input
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleAddCategory();
              }}
              placeholder="카테고리 이름..."
              className="flex-1 bg-sp-surface border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text placeholder-sp-muted focus:outline-none focus:ring-1 focus:ring-sp-accent"
            />
            <select
              value={newCatColor}
              onChange={(e) => setNewCatColor(e.target.value)}
              className="bg-sp-surface border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text focus:outline-none focus:ring-1 focus:ring-sp-accent"
            >
              {COLOR_OPTIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <button
              onClick={() => void handleAddCategory()}
              className="px-4 py-2 bg-sp-accent text-white rounded-lg text-sm font-medium hover:bg-sp-accent/90 transition-colors"
            >
              추가
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  function setIsExpanded(id: string, expanded: boolean) {
    setExpandedId(expanded ? id : null);
  }
}
