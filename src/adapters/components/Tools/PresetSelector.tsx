import { useState, useEffect, useCallback, useRef } from 'react';
import { useToolPresetStore } from '@adapters/stores/useToolPresetStore';
import type { ToolPresetType } from '@domain/entities/ToolPreset';

interface PresetSelectorProps {
  type: ToolPresetType;
  currentItems: readonly string[];
  onLoad: (items: readonly string[]) => void;
}

export function PresetSelector({ type, currentItems, onLoad }: PresetSelectorProps) {
  const { presets, loaded, load, getByType, addPreset, deletePreset } = useToolPresetStore();
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  // Click outside to close dropdown
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const typePresets = getByType(type);

  const handleSave = useCallback(async () => {
    const name = presetName.trim();
    if (!name || currentItems.length === 0) return;
    await addPreset(name, type, currentItems);
    setPresetName('');
    setShowSaveDialog(false);
  }, [presetName, type, currentItems, addPreset]);

  const handleSelect = useCallback((presetId: string) => {
    const preset = presets.find((p) => p.id === presetId);
    if (preset) {
      onLoad(preset.items);
      setIsOpen(false);
    }
  }, [presets, onLoad]);

  const handleDelete = useCallback(async (presetId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deletePreset(presetId);
  }, [deletePreset]);

  return (
    <div className="flex items-center gap-2">
      {/* 불러오기 드롭다운 */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen((v) => !v)}
          disabled={typePresets.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sp-surface border border-sp-border text-sp-text text-xs font-medium hover:border-sp-accent transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span className="material-symbols-outlined text-icon-sm">folder_open</span>
          <span>불러오기</span>
          {typePresets.length > 0 && (
            <span className="text-sp-muted">({typePresets.length})</span>
          )}
        </button>

        {isOpen && typePresets.length > 0 && (
          <div className="absolute top-full left-0 mt-1 w-56 bg-sp-card border border-sp-border rounded-xl shadow-2xl z-50 py-1 max-h-48 overflow-y-auto">
            {typePresets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => handleSelect(preset.id)}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-sp-text/5 text-left group transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-sp-text truncate block">{preset.name}</span>
                  <span className="text-caption text-sp-muted">
                    {preset.items.length}개 항목
                  </span>
                </div>
                <button
                  onClick={(e) => handleDelete(preset.id, e)}
                  className="text-sp-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all ml-2 shrink-0"
                  title="삭제"
                >
                  <span className="material-symbols-outlined text-icon-sm">delete</span>
                </button>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 저장 버튼 */}
      <button
        onClick={() => setShowSaveDialog(true)}
        disabled={currentItems.length < 2}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sp-surface border border-sp-border text-sp-text text-xs font-medium hover:border-sp-accent transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <span className="material-symbols-outlined text-icon-sm">save</span>
        <span>프리셋 저장</span>
      </button>

      {/* 저장 다이얼로그 */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-sp-card border border-sp-border rounded-2xl p-5 w-72">
            <h3 className="text-sm font-bold text-sp-text mb-3">프리셋 저장</h3>
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') setShowSaveDialog(false);
              }}
              placeholder="프리셋 이름..."
              maxLength={20}
              autoFocus
              className="w-full px-3 py-2 rounded-lg bg-sp-surface border border-sp-border text-sp-text text-sm placeholder-sp-muted focus:outline-none focus:border-sp-accent"
            />
            <p className="text-xs text-sp-muted mt-2">
              {currentItems.length}개 항목이 저장됩니다
            </p>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowSaveDialog(false)}
                className="flex-1 py-2 rounded-lg border border-sp-border text-sp-muted hover:text-sp-text text-sm transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={!presetName.trim()}
                className="flex-1 py-2 rounded-lg bg-sp-accent text-white text-sm font-medium disabled:opacity-40 transition-colors"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
