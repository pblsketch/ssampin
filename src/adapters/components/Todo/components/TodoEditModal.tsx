import { useState, useCallback } from 'react';
import type { Todo, TodoPriority, TodoCategory, TodoStatus } from '@domain/entities/Todo';
import { PRIORITY_CONFIG } from '@domain/valueObjects/TodoPriority';
import { RECURRENCE_PRESETS } from '@domain/valueObjects/TodoRecurrence';
import { DatePopover } from './DatePopover';
import { toLocalDateString } from '@shared/utils/localDate';

interface TodoEditModalProps {
  todo: Todo;
  categories: readonly TodoCategory[];
  onUpdate: (id: string, changes: Partial<Pick<Todo, 'text' | 'priority' | 'category' | 'dueDate' | 'startDate' | 'time' | 'status' | 'recurrence'>>) => void;
  onClose: () => void;
}

const PRIORITY_OPTIONS: TodoPriority[] = ['none', 'low', 'medium', 'high'];
const STATUS_OPTIONS: { key: TodoStatus; label: string }[] = [
  { key: 'todo', label: '할 일' },
  { key: 'inProgress', label: '진행 중' },
  { key: 'done', label: '완료' },
];

export function TodoEditModal({ todo, categories, onUpdate, onClose }: TodoEditModalProps) {
  const [text, setText] = useState(todo.text);
  const [dueDate, setDueDate] = useState(todo.dueDate ?? '');
  const [startDate, setStartDate] = useState(todo.startDate ?? '');
  const [time, setTime] = useState(todo.time ?? '');
  const [priority, setPriority] = useState<TodoPriority>(todo.priority ?? 'none');
  const [category, setCategory] = useState(todo.category ?? '');
  const [status, setStatus] = useState<TodoStatus>(todo.status ?? 'todo');
  const [recurrenceIdx, setRecurrenceIdx] = useState(() => {
    if (!todo.recurrence) return 0;
    const idx = RECURRENCE_PRESETS.findIndex(
      (p) => p.value && p.value.type === todo.recurrence!.type && p.value.interval === todo.recurrence!.interval,
    );
    return idx >= 0 ? idx : 0;
  });

  const handleSave = useCallback(() => {
    const changes: Record<string, unknown> = {};
    if (text.trim() !== todo.text) changes.text = text.trim();
    if (dueDate !== (todo.dueDate ?? '')) changes.dueDate = dueDate || undefined;
    if (startDate !== (todo.startDate ?? '')) changes.startDate = startDate || undefined;
    if (time !== (todo.time ?? '')) changes.time = time || undefined;
    if (priority !== (todo.priority ?? 'none')) changes.priority = priority;
    if (category !== (todo.category ?? '')) changes.category = category || undefined;
    if (status !== (todo.status ?? 'todo')) changes.status = status;

    const newRecurrence = RECURRENCE_PRESETS[recurrenceIdx]?.value ?? undefined;
    const oldType = todo.recurrence?.type;
    const oldInterval = todo.recurrence?.interval;
    if (newRecurrence?.type !== oldType || newRecurrence?.interval !== oldInterval) {
      changes.recurrence = newRecurrence;
    }

    if (Object.keys(changes).length > 0) {
      onUpdate(todo.id, changes as Partial<Pick<Todo, 'text' | 'priority' | 'category' | 'dueDate' | 'startDate' | 'time' | 'status' | 'recurrence'>>);
    }
    onClose();
  }, [text, dueDate, startDate, time, priority, category, status, recurrenceIdx, todo, onUpdate, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-sp-card rounded-2xl ring-1 ring-sp-border shadow-2xl w-full max-w-md mx-4 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-sp-text">할 일 수정</h3>
          <button type="button" onClick={onClose} className="text-sp-muted hover:text-sp-text transition-colors">
            <span className="material-symbols-outlined text-icon">close</span>
          </button>
        </div>

        {/* 텍스트 */}
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full bg-sp-surface text-sp-text text-sm px-3 py-2 rounded-lg border border-sp-border focus:border-sp-accent focus:outline-none mb-3"
          autoFocus
        />

        {/* 날짜 */}
        <div className="mb-3">
          <div className="flex items-center gap-2">
            <DatePopover
              date={startDate || dueDate || toLocalDateString()}
              endDate={startDate ? dueDate : undefined}
              onDateChange={(d) => {
                if (startDate) setStartDate(d);
                else setDueDate(d);
              }}
              onEndDateChange={(endDate) => {
                if (endDate) {
                  setStartDate(dueDate || toLocalDateString());
                  setDueDate(endDate);
                } else {
                  setStartDate('');
                }
              }}
            >
              {dueDate ? (
                <div className="flex items-center gap-2 flex-1 px-3 py-2 bg-sp-surface rounded-lg border border-sp-border hover:border-sp-accent/50 transition-colors cursor-pointer text-sm text-sp-text">
                  <span className="material-symbols-outlined text-base text-sp-accent">calendar_today</span>
                  <span>{startDate ? `${startDate} → ${dueDate}` : dueDate}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-1 px-3 py-2 rounded-lg border border-dashed border-sp-border hover:border-sp-accent/50 hover:text-sp-text transition-colors cursor-pointer text-sm text-sp-muted">
                  <span className="material-symbols-outlined text-base">calendar_today</span>
                  <span>기한 설정</span>
                </div>
              )}
            </DatePopover>
            {dueDate && (
              <button
                type="button"
                onClick={() => { setDueDate(''); setStartDate(''); }}
                className="p-1.5 rounded-lg text-sp-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="기한 제거"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            )}
          </div>
        </div>

        {/* 시간 */}
        <div className="mb-3">
          <div className="flex items-center gap-2">
            {time ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-sp-surface rounded-lg border border-sp-border text-sm text-sp-text">
                <span className="material-symbols-outlined text-base text-sp-accent">schedule</span>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="bg-transparent text-sp-text text-sm focus:outline-none [color-scheme:dark]"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setTime('09:00')}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-sp-border hover:border-sp-accent/50 hover:text-sp-text transition-colors text-sm text-sp-muted"
              >
                <span className="material-symbols-outlined text-base">schedule</span>
                <span>시간 설정</span>
              </button>
            )}
            {time && (
              <button
                type="button"
                onClick={() => setTime('')}
                className="p-1.5 rounded-lg text-sp-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="시간 제거"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            )}
          </div>
        </div>

        {/* 우선순위 */}
        <div className="flex items-center gap-1 mb-3">
          <span className="text-xs text-sp-muted mr-1">우선순위</span>
          {PRIORITY_OPTIONS.map((p) => {
            const config = PRIORITY_CONFIG[p];
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={`flex flex-col items-center px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                  priority === p
                    ? `${config.bgColor || 'bg-sp-surface'} ${config.color} ring-1 ring-current`
                    : 'text-sp-muted hover:text-sp-text'
                }`}
              >
                <span>{config.icon}</span>
                <span className="text-caption leading-tight mt-0.5">{config.label}</span>
              </button>
            );
          })}
        </div>

        {/* 카테고리 */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-sp-muted">카테고리</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="bg-sp-surface text-sp-text text-xs px-2 py-1.5 rounded-lg border border-sp-border focus:border-sp-accent focus:outline-none"
          >
            <option value="">없음</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
            ))}
          </select>
        </div>

        {/* 반복 */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-sp-muted">🔁</span>
          <select
            value={recurrenceIdx}
            onChange={(e) => setRecurrenceIdx(Number(e.target.value))}
            className="bg-sp-surface text-sp-text text-xs px-2 py-1.5 rounded-lg border border-sp-border focus:border-sp-accent focus:outline-none"
          >
            {RECURRENCE_PRESETS.map((preset, idx) => (
              <option key={idx} value={idx}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>

        {/* 상태 */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-sp-muted">상태</span>
          <div className="flex gap-1">
            {STATUS_OPTIONS.map(s => (
              <button
                key={s.key}
                type="button"
                onClick={() => setStatus(s.key)}
                className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                  status === s.key
                    ? 'bg-sp-accent/20 text-sp-accent font-medium'
                    : 'text-sp-muted hover:text-sp-text hover:bg-sp-surface'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-xs text-sp-muted hover:text-sp-text hover:bg-sp-surface transition-colors">
            취소
          </button>
          <button type="button" onClick={handleSave} className="px-4 py-2 rounded-lg text-xs font-bold bg-sp-accent hover:bg-blue-600 text-white transition-colors">
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
