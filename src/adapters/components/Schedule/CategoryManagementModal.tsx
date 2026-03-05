import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { CATEGORY_COLOR_PRESETS } from '@domain/entities/SchoolEvent';
import type { CategoryItem } from '@domain/entities/SchoolEvent';

const DEFAULT_CAT_IDS = new Set(['school', 'class', 'department', 'treeSchool', 'etc']);

const SETTINGS_COLOR_MAP: Record<string, { bg: string; shadow: string; ring: string; label: string }> = {
  blue: { bg: 'bg-blue-500', shadow: 'shadow-[0_0_8px_rgba(59,130,246,0.5)]', ring: 'ring-blue-500', label: '파랑' },
  green: { bg: 'bg-green-500', shadow: 'shadow-[0_0_8px_rgba(34,197,94,0.5)]', ring: 'ring-green-500', label: '초록' },
  yellow: { bg: 'bg-amber-500', shadow: 'shadow-[0_0_8px_rgba(245,158,11,0.5)]', ring: 'ring-amber-500', label: '노랑' },
  purple: { bg: 'bg-purple-500', shadow: 'shadow-[0_0_8px_rgba(168,85,247,0.5)]', ring: 'ring-purple-500', label: '보라' },
  red: { bg: 'bg-red-500', shadow: 'shadow-[0_0_8px_rgba(239,68,68,0.5)]', ring: 'ring-red-500', label: '빨강' },
  pink: { bg: 'bg-pink-500', shadow: 'shadow-[0_0_8px_rgba(236,72,153,0.5)]', ring: 'ring-pink-500', label: '분홍' },
  indigo: { bg: 'bg-indigo-500', shadow: 'shadow-[0_0_8px_rgba(99,102,241,0.5)]', ring: 'ring-indigo-500', label: '남색' },
  teal: { bg: 'bg-teal-500', shadow: 'shadow-[0_0_8px_rgba(20,184,166,0.5)]', ring: 'ring-teal-500', label: '청록' },
  gray: { bg: 'bg-slate-400', shadow: 'shadow-[0_0_8px_rgba(148,163,184,0.5)]', ring: 'ring-slate-400', label: '회색' },
};

function colorDot(color: string, size = 'w-3 h-3') {
  const fallback = SETTINGS_COLOR_MAP['gray']!;
  const c = SETTINGS_COLOR_MAP[color] ?? fallback;
  return `${size} rounded-full ${c.bg} ${c.shadow}`;
}

/* ── 인라인 이름 편집 ────────────────────────────── */
function InlineNameEditor({
  value,
  onSave,
}: {
  value: string;
  onSave: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onSave(trimmed);
    else setDraft(value);
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-sm font-medium text-sp-text hover:text-sp-accent transition-colors cursor-text text-left"
        title="클릭하여 이름 수정"
      >
        {value}
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') { setDraft(value); setEditing(false); }
      }}
      className="text-sm font-medium text-sp-text bg-sp-bg/60 border border-sp-accent/50 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-sp-accent w-full min-w-0"
    />
  );
}

/* ── 색상 선택 드롭다운 (Portal로 렌더링하여 잘림 방지) ── */
function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        btnRef.current?.contains(e.target as Node) ||
        popupRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function handleToggle() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      // 팝업을 버튼 아래 왼쪽 정렬로 배치
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen(!open);
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-sp-surface transition-colors shrink-0"
        title="색상 변경"
      >
        <div className={colorDot(value, 'w-4 h-4')} />
        <span className="material-symbols-outlined text-[14px] text-sp-muted">
          expand_more
        </span>
      </button>

      {open && createPortal(
        <div
          ref={popupRef}
          className="fixed z-[100] bg-sp-card border border-sp-border rounded-xl shadow-2xl p-3"
          style={{ top: pos.top, left: pos.left, minWidth: 200 }}
        >
          <div className="grid grid-cols-3 gap-2">
            {[...CATEGORY_COLOR_PRESETS, 'gray' as const].map((c) => {
              const info = SETTINGS_COLOR_MAP[c];
              if (!info) return null;
              const isSelected = c === value;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => { onChange(c); setOpen(false); }}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                    isSelected
                      ? 'bg-sp-accent/10 ring-1 ring-sp-accent/40 text-sp-text font-semibold'
                      : 'hover:bg-sp-surface text-sp-muted'
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full ${info.bg}`} />
                  {info.label}
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/* ── 삭제 확인 다이얼로그 ────────────────────────── */
function DeleteConfirmDialog({
  categoryName,
  eventCount,
  onConfirm,
  onCancel,
}: {
  categoryName: string;
  eventCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-xl space-y-3">
      <div className="flex items-start gap-3">
        <div className="p-1.5 bg-red-500/10 rounded-lg shrink-0">
          <span className="material-symbols-outlined text-red-400 text-[20px]">warning</span>
        </div>
        <div>
          <p className="text-sm font-medium text-sp-text">
            &apos;{categoryName}&apos; 카테고리를 삭제하시겠습니까?
          </p>
          {eventCount > 0 && (
            <p className="text-xs text-sp-muted mt-1">
              이 카테고리를 사용하는 일정 {eventCount}개가 있습니다.
              삭제해도 일정은 유지되지만, 카테고리 표시가 사라집니다.
            </p>
          )}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs text-sp-muted hover:text-sp-text rounded-lg hover:bg-sp-surface transition-colors"
        >
          취소
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="px-3 py-1.5 text-xs text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
        >
          삭제
        </button>
      </div>
    </div>
  );
}

/* ── 카테고리 행 (드래그 가능) ────────────────────── */
function CategoryRow({
  category,
  isDefault,
  eventCount,
  isDragOver,
  onUpdate,
  onDelete,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}: {
  category: CategoryItem;
  isDefault: boolean;
  eventCount: number;
  isDragOver: boolean;
  onUpdate: (partial: Partial<Pick<CategoryItem, 'name' | 'color'>>) => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (confirmDelete) {
    return (
      <DeleteConfirmDialog
        categoryName={category.name}
        eventCount={eventCount}
        onConfirm={() => { onDelete(); setConfirmDelete(false); }}
        onCancel={() => setConfirmDelete(false)}
      />
    );
  }

  return (
    <div className="flex items-center gap-3 group">
      {/* 카테고리 박스 */}
      <div
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDrop={onDrop}
        className={`flex items-center flex-1 min-w-0 px-5 py-3 rounded-lg bg-sp-surface hover:bg-sp-text/5 transition-all border cursor-grab active:cursor-grabbing ${
          isDragOver
            ? 'border-sp-accent/50 bg-sp-accent/5 shadow-[0_0_0_1px_rgba(59,130,246,0.3)]'
            : 'border-transparent hover:border-sp-border/50'
        }`}
      >
        {/* 드래그 핸들 */}
        <span className="material-symbols-outlined text-[18px] text-sp-muted/40 group-hover:text-sp-muted transition-colors shrink-0 select-none mr-3">
          drag_indicator
        </span>

        {/* 색상 선택 */}
        <ColorPicker value={category.color} onChange={(color) => onUpdate({ color })} />

        {/* 이름 편집 */}
        <div className="flex-1 min-w-0 ml-3">
          <InlineNameEditor
            value={category.name}
            onSave={(name) => onUpdate({ name })}
          />
        </div>

        {isDefault && (
          <span className="text-[10px] text-sp-muted bg-sp-border/30 px-1.5 py-0.5 rounded shrink-0 ml-2">
            기본
          </span>
        )}
      </div>

      {/* 삭제 버튼 (박스 바깥) */}
      {!isDefault ? (
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="text-sp-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          title="카테고리 삭제"
        >
          <span className="material-symbols-outlined text-[18px]">delete</span>
        </button>
      ) : (
        <div className="w-[18px] shrink-0" />
      )}
    </div>
  );
}

/* ── 메인 모달 ───────────────────────────────────── */
export function CategoryManagementModal({ onClose }: { onClose: () => void }) {
  const { categories, events, addCategory, updateCategory, deleteCategory, reorderCategories } = useEventsStore();
  const [showCatForm, setShowCatForm] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState<string>('blue');

  // 드래그 상태
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  function getEventCount(categoryId: string): number {
    return events.filter((e) => e.category === categoryId).length;
  }

  async function handleAddCategory() {
    if (!newCatName.trim()) return;
    await addCategory(newCatName.trim(), newCatColor);
    setNewCatName('');
    setNewCatColor('blue');
    setShowCatForm(false);
  }

  const handleDragStart = useCallback((index: number) => {
    dragIndexRef.current = index;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const fromIndex = dragIndexRef.current;
    if (fromIndex === null || fromIndex === dropIndex) {
      setDragOverIndex(null);
      dragIndexRef.current = null;
      return;
    }

    const ids = categories.map((c) => c.id);
    const [movedId] = ids.splice(fromIndex, 1);
    if (movedId) ids.splice(dropIndex, 0, movedId);
    void reorderCategories(ids);

    setDragOverIndex(null);
    dragIndexRef.current = null;
  }, [categories, reorderCategories]);

  const handleDragEnd = useCallback(() => {
    setDragOverIndex(null);
    dragIndexRef.current = null;
  }, []);

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="w-full max-w-[520px] bg-sp-card rounded-2xl border border-sp-border shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 헤더 */}
          <div className="flex items-center justify-between p-6 pb-4 border-b border-sp-border shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-pink-500/10 text-pink-400">
                <span className="material-symbols-outlined">category</span>
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">일정 카테고리 관리</h2>
                <p className="text-xs text-sp-muted mt-0.5">이름, 색상을 수정하고 드래그하여 순서를 변경하세요</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 hover:bg-slate-700 rounded-lg transition-colors text-sp-muted hover:text-white"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          {/* 카테고리 목록 */}
          <div className="p-6 overflow-y-auto space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-sp-muted">
                내 카테고리 ({categories.length})
              </span>
              {!showCatForm && (
                <button
                  type="button"
                  onClick={() => setShowCatForm(true)}
                  className="text-xs font-medium text-sp-accent hover:text-blue-400 flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  카테고리 추가
                </button>
              )}
            </div>

            {/* 도움말 */}
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-sp-accent/5 border border-sp-accent/10">
              <span className="material-symbols-outlined text-sp-accent text-[16px]">info</span>
              <span className="text-[11px] text-sp-muted">
                이름 클릭 → 수정 · 색상 점 클릭 → 변경 · 드래그하여 순서 이동
              </span>
            </div>

            <div className="space-y-1.5">
              {categories.map((cat, index) => (
                <CategoryRow
                  key={cat.id}
                  category={cat}
                  isDefault={DEFAULT_CAT_IDS.has(cat.id)}
                  eventCount={getEventCount(cat.id)}
                  isDragOver={dragOverIndex === index}
                  onUpdate={(partial) => void updateCategory(cat.id, partial)}
                  onDelete={() => void deleteCategory(cat.id)}
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  onDrop={(e) => handleDrop(e, index)}
                />
              ))}

              {/* 새 카테고리 추가 폼 */}
              {showCatForm && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0 px-5 py-3 rounded-lg bg-sp-surface border border-sp-accent/30">
                    <div className="flex gap-1.5 flex-wrap w-[40%]">
                      {[...CATEGORY_COLOR_PRESETS, 'gray' as const].map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setNewCatColor(c)}
                          className={`w-5 h-5 rounded-full ${SETTINGS_COLOR_MAP[c]?.bg ?? 'bg-slate-400'} ${
                            newCatColor === c ? 'ring-2 ring-white ring-offset-2 ring-offset-sp-card' : ''
                          }`}
                        />
                      ))}
                    </div>
                    <input
                      type="text"
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && void handleAddCategory()}
                      placeholder="카테고리 이름"
                      className="flex-1 bg-transparent text-sm text-sp-text placeholder-sp-muted focus:outline-none border-none p-0 min-w-0"
                      autoFocus
                    />
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => void handleAddCategory()}
                        className="text-sp-accent hover:text-blue-400 text-xs font-medium"
                      >
                        추가
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowCatForm(false); setNewCatName(''); }}
                        className="text-sp-muted hover:text-sp-text text-xs"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                  {/* 삭제 아이콘 자리 맞춤용 */}
                  <div className="w-[18px] shrink-0" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
