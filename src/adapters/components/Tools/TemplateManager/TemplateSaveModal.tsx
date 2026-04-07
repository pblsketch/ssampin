import { useState, useCallback, useEffect, useRef } from 'react';

interface TemplateSaveModalProps {
  open: boolean;
  initialName?: string;
  onClose: () => void;
  onSave: (name: string) => void;
}

export function TemplateSaveModal({ open, initialName, onClose, onSave }: TemplateSaveModalProps) {
  const [name, setName] = useState(initialName ?? '');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(initialName ?? '');
      setError('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, initialName]);

  const handleSave = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('이름을 입력하세요');
      return;
    }
    onSave(trimmed);
  }, [name, onSave]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleSave();
      if (e.key === 'Escape') onClose();
    },
    [handleSave, onClose],
  );

  if (!open) return null;

  const isEdit = initialName !== undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl bg-sp-card border border-sp-border p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-sp-text mb-4">
          {isEdit ? '템플릿 이름 수정' : '템플릿 저장'}
        </h2>

        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => {
            if (e.target.value.length <= 50) {
              setName(e.target.value);
              setError('');
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder="예: 3월 수업 피드백"
          maxLength={50}
          className="w-full rounded-lg bg-sp-surface border border-sp-border px-4 py-2.5 text-sp-text placeholder-sp-muted focus:outline-none focus:border-sp-accent"
        />
        {error && <p className="mt-1.5 text-sm text-red-400">{error}</p>}
        <p className="mt-1.5 text-xs text-sp-muted text-right">{name.length}/50</p>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-sp-muted hover:bg-sp-surface transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            className="rounded-lg bg-sp-accent px-4 py-2 text-sm font-medium text-white hover:bg-sp-accent/80 transition-colors"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
