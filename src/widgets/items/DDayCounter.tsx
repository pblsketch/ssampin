import { useEffect, useMemo, useState, useCallback } from 'react';
import { useDDayStore } from '@adapters/stores/useDDayStore';
import { calculateDDay, formatDDay, sortDDayItems } from '@domain/rules/ddayRules';
import {
  DDAY_COLOR_MAP,
  DDAY_EMOJI_PRESETS,
  type DDayItem,
  type DDayColor,
} from '@domain/entities/DDay';
import { generateUUID } from '@infrastructure/utils/uuid';

/* ─── 상수 ─── */

const ALL_COLORS: DDayColor[] = ['blue', 'green', 'purple', 'orange', 'red', 'pink', 'teal', 'amber'];

/* ─── 유틸 ─── */

function todayStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function formatDateKR(dateStr: string): string {
  const parts = dateStr.split('-');
  const y = parts[0] ?? '';
  const m = parts[1] ?? '';
  const d = parts[2] ?? '';
  return `${y}.${m}.${d}`;
}

/* ─── 추가/편집 폼 ─── */

interface DDayFormProps {
  initial?: DDayItem;
  onSave: (data: Omit<DDayItem, 'id' | 'createdAt'>) => void;
  onCancel: () => void;
}

function DDayForm({ initial, onSave, onCancel }: DDayFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [targetDate, setTargetDate] = useState(
    initial?.targetDate ?? new Date().toISOString().slice(0, 10),
  );
  const [emoji, setEmoji] = useState(initial?.emoji ?? '📌');
  const [color, setColor] = useState<DDayColor>(initial?.color ?? 'blue');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !targetDate) return;
    onSave({
      title: title.trim(),
      targetDate,
      emoji,
      color,
      pinned: initial?.pinned ?? false,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-3 rounded-xl bg-sp-surface border border-sp-border">
      <div className="text-sm font-bold text-sp-text">
        {initial ? 'D-Day 편집' : 'D-Day 추가'}
      </div>

      {/* 제목 */}
      <input
        type="text"
        placeholder="제목 (예: 중간고사)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full rounded-lg bg-sp-card border border-sp-border px-3 py-2 text-sm text-sp-text placeholder-sp-muted focus:border-sp-accent focus:outline-none"
        autoFocus
      />

      {/* 날짜 */}
      <input
        type="date"
        value={targetDate}
        onChange={(e) => setTargetDate(e.target.value)}
        className="w-full rounded-lg bg-sp-card border border-sp-border px-3 py-2 text-sm text-sp-text focus:border-sp-accent focus:outline-none [color-scheme:dark]"
      />

      {/* 이모지 선택 */}
      <div>
        <div className="text-xs text-sp-muted mb-1">이모지</div>
        <div className="flex flex-wrap gap-1">
          {DDAY_EMOJI_PRESETS.map((em) => (
            <button
              key={em}
              type="button"
              onClick={() => setEmoji(em)}
              className={`w-8 h-8 rounded-lg text-base flex items-center justify-center transition-colors ${
                emoji === em
                  ? 'bg-sp-accent/20 ring-1 ring-sp-accent'
                  : 'hover:bg-sp-card'
              }`}
            >
              {em}
            </button>
          ))}
        </div>
      </div>

      {/* 색상 선택 */}
      <div>
        <div className="text-xs text-sp-muted mb-1">색상</div>
        <div className="flex gap-1.5">
          {ALL_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`w-6 h-6 rounded-full ${DDAY_COLOR_MAP[c].bg} ${DDAY_COLOR_MAP[c].border} border transition-transform ${
                color === c ? 'scale-125 ring-1 ring-white/40' : 'hover:scale-110'
              }`}
            />
          ))}
        </div>
      </div>

      {/* 버튼 */}
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-sm text-sp-muted hover:bg-sp-card transition-colors"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={!title.trim() || !targetDate}
          className="rounded-lg bg-sp-accent px-3 py-1.5 text-sm font-medium text-sp-accent-fg hover:brightness-110 transition-colors disabled:opacity-40"
        >
          저장
        </button>
      </div>
    </form>
  );
}

/* ─── D-Day 아이템 행 ─── */

interface DDayRowProps {
  item: DDayItem;
  dday: number;
  onEdit: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
}

function DDayRow({ item, dday, onEdit, onTogglePin, onDelete }: DDayRowProps) {
  const colorSet = DDAY_COLOR_MAP[item.color];
  const isPast = dday < 0;
  const isToday = dday === 0;

  return (
    <div
      className={`group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-sp-surface/50 ${
        isPast ? 'opacity-60' : ''
      }`}
    >
      {/* 이모지 */}
      <span className="text-lg shrink-0">{item.emoji}</span>

      {/* 제목 + 날짜 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-sm text-sp-text truncate">{item.title}</span>
          {item.pinned && (
            <span className="text-caption text-sp-muted">📌</span>
          )}
        </div>
        <span className="text-xs text-sp-muted">{formatDateKR(item.targetDate)}</span>
      </div>

      {/* D-Day 숫자 — hover 시 액션 버튼으로 교체 */}
      <span
        className={`shrink-0 text-sm font-bold group-hover:hidden ${
          isToday
            ? 'text-red-400 animate-pulse'
            : isPast
              ? 'text-sp-muted'
              : colorSet.text
        }`}
      >
        {formatDDay(dday)}
      </span>

      {/* 액션 버튼 — hover 시 표시 */}
      <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
        <button
          onClick={onTogglePin}
          title={item.pinned ? '고정 해제' : '상단 고정'}
          className="w-6 h-6 flex items-center justify-center rounded text-xs text-sp-muted hover:text-sp-accent hover:bg-sp-card transition-colors"
        >
          {item.pinned ? '📌' : '📍'}
        </button>
        <button
          onClick={onEdit}
          title="편집"
          className="w-6 h-6 flex items-center justify-center rounded text-sp-muted hover:text-sp-accent hover:bg-sp-card transition-colors"
        >
          <span className="material-symbols-outlined text-icon-sm">edit</span>
        </button>
        <button
          onClick={onDelete}
          title="삭제"
          className="w-6 h-6 flex items-center justify-center rounded text-sp-muted hover:text-red-400 hover:bg-sp-card transition-colors"
        >
          <span className="material-symbols-outlined text-icon-sm">delete</span>
        </button>
      </div>
    </div>
  );
}

/* ─── 메인 위젯 ─── */

export function DDayCounter() {
  const { items, load, add, update, remove, togglePin } = useDDayStore();

  useEffect(() => {
    void load();
  }, [load]);

  const today = useMemo(() => todayStart(), []);

  const sorted = useMemo(() => sortDDayItems(items, today), [items, today]);

  const futureItems = useMemo(
    () => sorted.filter((i) => calculateDDay(i.targetDate, today) >= 0),
    [sorted, today],
  );
  const pastItems = useMemo(
    () => sorted.filter((i) => calculateDDay(i.targetDate, today) < 0),
    [sorted, today],
  );

  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<DDayItem | null>(null);
  const [showPast, setShowPast] = useState(false);

  const handleAdd = useCallback(
    async (data: Omit<DDayItem, 'id' | 'createdAt'>) => {
      const newItem: DDayItem = {
        ...data,
        id: generateUUID(),
        createdAt: new Date().toISOString(),
      };
      await add(newItem);
      setShowForm(false);
    },
    [add],
  );

  const handleUpdate = useCallback(
    async (data: Omit<DDayItem, 'id' | 'createdAt'>) => {
      if (!editingItem) return;
      await update(editingItem.id, data);
      setEditingItem(null);
    },
    [editingItem, update],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await remove(id);
    },
    [remove],
  );

  const handleDeleteAllPast = useCallback(async () => {
    for (const item of pastItems) {
      await remove(item.id);
    }
  }, [pastItems, remove]);

  return (
    <div className="rounded-xl bg-sp-card p-4 h-full flex flex-col min-h-0 overflow-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-2 shrink-0">
        <h3 className="text-sm font-bold text-sp-text flex items-center gap-1.5"><span>🎯</span>D-Day 카운터</h3>
      </div>

      {/* 추가 버튼 */}
      {!showForm && !editingItem && (
        <button
          onClick={() => setShowForm(true)}
          className="mb-2 shrink-0 flex items-center justify-center gap-1 rounded-lg border border-dashed border-sp-border px-2 py-1.5 text-xs text-sp-muted hover:border-sp-accent hover:text-sp-accent transition-colors"
        >
          <span className="text-base leading-none">+</span>
          D-Day 추가
        </button>
      )}

      {/* 추가 폼 */}
      {showForm && (
        <div className="mb-2 shrink-0">
          <DDayForm onSave={handleAdd} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {/* 편집 폼 */}
      {editingItem && (
        <div className="mb-2 shrink-0">
          <DDayForm
            initial={editingItem}
            onSave={handleUpdate}
            onCancel={() => setEditingItem(null)}
          />
        </div>
      )}

      {/* 콘텐츠 */}
      <div className="flex-1 min-h-0">
        {sorted.length === 0 && !showForm ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-4">
            <span className="text-3xl mb-2">🎯</span>
            <p className="text-sm text-sp-muted">
              D-Day를 추가하여<br />중요한 날짜를 관리하세요
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {/* 미래 항목 */}
            {futureItems.map((item) => (
              <DDayRow
                key={item.id}
                item={item}
                dday={calculateDDay(item.targetDate, today)}
                onEdit={() => setEditingItem(item)}
                onTogglePin={() => void togglePin(item.id)}
                onDelete={() => void handleDelete(item.id)}
              />
            ))}

            {/* 과거 항목 (접이식) */}
            {pastItems.length > 0 && (
              <div className="mt-2 pt-2 border-t border-sp-border/50">
                <button
                  onClick={() => setShowPast((v) => !v)}
                  className="flex items-center gap-1.5 w-full px-2 py-1 text-xs text-sp-muted hover:text-sp-text transition-colors"
                >
                  <span
                    className={`transition-transform text-caption ${showPast ? 'rotate-90' : ''}`}
                  >
                    ▶
                  </span>
                  지난 항목 ({pastItems.length})
                  {showPast && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDeleteAllPast();
                      }}
                      className="ml-auto text-caption text-red-400/70 hover:text-red-400"
                    >
                      모두 삭제
                    </button>
                  )}
                </button>
                {showPast && (
                  <div className="space-y-0.5 mt-1">
                    {pastItems.map((item) => (
                      <DDayRow
                        key={item.id}
                        item={item}
                        dday={calculateDDay(item.targetDate, today)}
                        onEdit={() => setEditingItem(item)}
                        onTogglePin={() => void togglePin(item.id)}
                        onDelete={() => void handleDelete(item.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
