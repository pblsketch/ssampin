import { useState, useCallback, useRef, useEffect } from 'react';
import type { ToolTemplate, ToolTemplateType } from '@domain/entities/ToolTemplate';
import { useToolTemplateStore } from '@adapters/stores/useToolTemplateStore';

interface TemplateLoadDropdownProps {
  toolType: ToolTemplateType;
  onLoad: (template: ToolTemplate) => void;
}

function formatRelativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return '방금 전';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  return new Date(iso).toLocaleDateString('ko-KR');
}

export function TemplateLoadDropdown({ toolType, onLoad }: TemplateLoadDropdownProps) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const { load, getByType, updateTemplate, deleteTemplate } = useToolTemplateStore();

  useEffect(() => {
    load();
  }, [load]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setEditingId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (editingId) {
      setTimeout(() => editInputRef.current?.focus(), 50);
    }
  }, [editingId]);

  const templates = getByType(toolType).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  const handleToggle = useCallback(() => {
    setOpen((prev) => !prev);
    setEditingId(null);
  }, []);

  const handleLoad = useCallback(
    (template: ToolTemplate) => {
      onLoad(template);
      setOpen(false);
    },
    [onLoad],
  );

  const handleStartRename = useCallback((id: string, currentName: string) => {
    setEditingId(id);
    setEditName(currentName);
  }, []);

  const handleConfirmRename = useCallback(
    async (id: string) => {
      const trimmed = editName.trim();
      if (trimmed) {
        await updateTemplate(id, { name: trimmed });
      }
      setEditingId(null);
    },
    [editName, updateTemplate],
  );

  const handleDelete = useCallback(
    async (id: string, name: string) => {
      if (window.confirm(`"${name}" 템플릿을 삭제하시겠습니까?`)) {
        await deleteTemplate(id);
      }
    },
    [deleteTemplate],
  );

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={handleToggle}
        className="flex items-center gap-1.5 rounded-lg bg-sp-surface border border-sp-border px-3 py-2 text-sm text-sp-text hover:bg-sp-card transition-colors"
      >
        📂 내 템플릿
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 w-72 rounded-xl bg-sp-card border border-sp-border shadow-2xl overflow-hidden">
          {templates.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-sp-muted">
              저장된 템플릿이 없습니다
            </p>
          ) : (
            <ul className="max-h-64 overflow-y-auto divide-y divide-sp-border">
              {templates.map((t) => (
                <li key={t.id} className="flex items-center gap-2 px-3 py-2.5 hover:bg-sp-surface/50 transition-colors">
                  {editingId === t.id ? (
                    <input
                      ref={editInputRef}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleConfirmRename(t.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      onBlur={() => handleConfirmRename(t.id)}
                      maxLength={50}
                      className="flex-1 min-w-0 rounded bg-sp-surface border border-sp-accent px-2 py-0.5 text-sm text-sp-text focus:outline-none"
                    />
                  ) : (
                    <button
                      onClick={() => handleLoad(t)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <span className="block text-sm text-sp-text truncate">{t.name}</span>
                      <span className="text-xs text-sp-muted">{formatRelativeDate(t.updatedAt)}</span>
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleStartRename(t.id, t.name); }}
                    className="shrink-0 text-sp-muted hover:text-sp-text transition-colors"
                    title="이름 수정"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(t.id, t.name); }}
                    className="shrink-0 text-sp-muted hover:text-red-400 transition-colors"
                    title="삭제"
                  >
                    🗑️
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
