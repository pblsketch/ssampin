import { useState, useCallback, useRef, useEffect } from 'react';
import type { ToolResultData, ToolResultType } from '@domain/entities/ToolResult';
import { useToolResultStore } from '@adapters/stores/useToolResultStore';

interface ResultSaveButtonProps {
  toolType: ToolResultType;
  defaultName: string;
  resultData: ToolResultData;
}

export function ResultSaveButton({ toolType, defaultName, resultData }: ResultSaveButtonProps) {
  const [mode, setMode] = useState<'idle' | 'editing' | 'saved'>('idle');
  const [name, setName] = useState(defaultName);
  const inputRef = useRef<HTMLInputElement>(null);
  const { addResult } = useToolResultStore();

  useEffect(() => {
    if (mode === 'editing') {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [mode]);

  const handleStartSave = useCallback(() => {
    setName(defaultName);
    setMode('editing');
  }, [defaultName]);

  const handleSave = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await addResult(trimmed, toolType, resultData);
    setMode('saved');
    setTimeout(() => setMode('idle'), 2000);
  }, [name, toolType, resultData, addResult]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleSave();
      if (e.key === 'Escape') setMode('idle');
    },
    [handleSave],
  );

  if (mode === 'saved') {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-green-400 font-medium">
        저장됨 ✓
      </span>
    );
  }

  if (mode === 'editing') {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={50}
          className="rounded-lg bg-sp-surface border border-sp-border px-3 py-1.5 text-sm text-sp-text focus:outline-none focus:border-sp-accent w-48"
        />
        <button
          onClick={handleSave}
          className="rounded-lg bg-sp-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-sp-accent/80 transition-colors"
        >
          저장
        </button>
        <button
          onClick={() => setMode('idle')}
          className="text-sm text-sp-muted hover:text-sp-text transition-colors"
        >
          취소
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleStartSave}
      className="flex items-center gap-1.5 rounded-lg bg-sp-surface border border-sp-border px-3 py-2 text-sm text-sp-text hover:bg-sp-card transition-colors"
    >
      💾 결과 저장
    </button>
  );
}
