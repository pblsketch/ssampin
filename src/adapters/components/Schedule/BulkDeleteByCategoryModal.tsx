import { useState, useMemo } from 'react';
import type { SchoolEvent, CategoryItem } from '@domain/entities/SchoolEvent';
import { getCategoryColors } from '@adapters/presenters/categoryPresenter';

interface Props {
  categories: readonly CategoryItem[];
  events: readonly SchoolEvent[];
  onDelete: (categoryId: string) => Promise<number>;
  onClose: () => void;
}

export function BulkDeleteByCategoryModal({ categories, events, onDelete, onClose }: Props) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const countByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of events) {
      if (!e.isHidden) {
        map.set(e.category, (map.get(e.category) ?? 0) + 1);
      }
    }
    return map;
  }, [events]);

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);
  const selectedCount = selectedCategoryId ? (countByCategory.get(selectedCategoryId) ?? 0) : 0;

  // 외부 연동 일정 수 (선택된 카테고리)
  const externalCount = useMemo(() => {
    if (!selectedCategoryId) return 0;
    return events.filter(
      (e) => e.category === selectedCategoryId && !e.isHidden && (e.source === 'neis' || e.source === 'google'),
    ).length;
  }, [events, selectedCategoryId]);

  const handleDelete = async () => {
    if (!selectedCategoryId) return;
    setIsDeleting(true);
    const count = await onDelete(selectedCategoryId);
    setIsDeleting(false);
    alert(`${count}개의 일정이 삭제되었습니다.`);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose} aria-hidden="true">
      <div
        className="bg-sp-card border border-sp-border rounded-2xl w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title-bulk-delete-category"
      >
        <div className="px-6 py-5 border-b border-sp-border">
          <h3 id="modal-title-bulk-delete-category" className="text-lg font-bold text-sp-text">카테고리별 일정 삭제</h3>
          <p className="text-sm text-sp-muted mt-1">
            선택한 카테고리의 모든 일정을 삭제합니다.
          </p>
        </div>

        <div className="px-6 py-4 max-h-[300px] overflow-y-auto">
          {categories.length === 0 ? (
            <p className="text-sm text-sp-muted text-center py-4">카테고리가 없습니다.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {categories.map((cat) => {
                const colors = getCategoryColors(cat.color);
                const count = countByCategory.get(cat.id) ?? 0;

                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setSelectedCategoryId(cat.id);
                      setIsConfirming(false);
                    }}
                    disabled={count === 0}
                    className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-colors text-left ${
                      selectedCategoryId === cat.id
                        ? 'border-sp-accent bg-sp-accent/10'
                        : count === 0
                          ? 'border-sp-border/50 opacity-40 cursor-not-allowed'
                          : 'border-sp-border hover:bg-sp-surface'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-3 h-3 rounded-full ${colors.dot}`} />
                      <span className="text-sm font-medium text-sp-text">{cat.name}</span>
                    </div>
                    <span className="text-xs text-sp-muted">{count}개</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 확인 영역 */}
        {selectedCategoryId && selectedCount > 0 && (
          <div className="px-6 py-4 border-t border-sp-border">
            {externalCount > 0 && (
              <div className="mb-3 p-3 bg-yellow-900/20 border border-yellow-700/30 rounded-xl">
                <p className="text-xs text-yellow-300">
                  <span className="font-bold">주의:</span> 외부 연동 일정 {externalCount}개가 포함되어 있습니다.
                  삭제해도 다음 동기화 시 다시 나타날 수 있습니다.
                </p>
              </div>
            )}

            {!isConfirming ? (
              <button
                type="button"
                onClick={() => setIsConfirming(true)}
                className="w-full py-2.5 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 text-sm font-semibold transition-colors"
              >
                &apos;{selectedCategory?.name}&apos;의 일정 {selectedCount}개 삭제
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-red-400 font-semibold text-center">
                  정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsConfirming(false)}
                    className="flex-1 py-2.5 rounded-xl bg-sp-surface text-sp-muted hover:text-sp-text border border-sp-border text-sm font-medium transition-colors"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition-colors disabled:opacity-50"
                  >
                    {isDeleting ? '삭제 중...' : '삭제 확인'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 하단 닫기 */}
        <div className="px-6 py-4 border-t border-sp-border flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-sp-surface text-sp-muted hover:text-sp-text border border-sp-border text-sm font-medium transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
