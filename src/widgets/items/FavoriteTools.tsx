import { useState } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { TOOL_DEFINITIONS, DEFAULT_FAVORITE_TOOLS, getToolDefinition } from '@adapters/constants/toolDefinitions';
import type { ToolDefinition } from '@adapters/constants/toolDefinitions';

export function FavoriteTools() {
  const favoriteTools = useSettingsStore((s) => s.settings.favoriteTools) ?? DEFAULT_FAVORITE_TOOLS;
  const update = useSettingsStore((s) => s.update);
  const [showPicker, setShowPicker] = useState(false);

  const handleToolClick = (tool: ToolDefinition) => {
    // 외부 URL 도구는 브라우저로 열기
    if (tool.externalUrl) {
      if (window.electronAPI?.openExternal) {
        void window.electronAPI.openExternal(tool.externalUrl);
      } else {
        window.open(tool.externalUrl, '_blank', 'noopener,noreferrer');
      }
      return;
    }
    // 위젯 모드(별도 BrowserWindow)에서는 IPC로 메인 윈도우 네비게이션
    if (window.electronAPI?.navigateToPage) {
      void window.electronAPI.navigateToPage(tool.id);
    } else {
      // 브라우저 개발 모드 폴백
      window.dispatchEvent(new CustomEvent('ssampin:navigate', { detail: tool.id }));
    }
  };

  const tools = favoriteTools
    .map((id) => getToolDefinition(id))
    .filter((t): t is ToolDefinition => t !== undefined);

  return (
    <div className="rounded-xl bg-sp-card p-4 h-full flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-sp-text flex items-center gap-1.5"><span>🛠️</span>자주 쓰는 도구</h3>
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="text-sp-muted hover:text-sp-text transition-colors"
          title="도구 편집"
        >
          <span className="material-symbols-outlined text-sm">
            {showPicker ? 'close' : 'edit'}
          </span>
        </button>
      </div>

      {/* 도구 그리드 */}
      {!showPicker ? (
        <div className="grid grid-cols-4 gap-2 flex-1 content-start">
          {tools.map((tool) => (
            <button
              key={tool.id}
              onClick={() => handleToolClick(tool)}
              className={`flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl ${tool.color} hover:scale-105 active:scale-95 transition-all`}
            >
              <span className="text-xl">{tool.icon}</span>
              <span className="text-caption font-medium truncate w-full text-center">
                {tool.name}
              </span>
            </button>
          ))}

          {tools.length < 8 && (
            <button
              onClick={() => setShowPicker(true)}
              className="flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl bg-sp-border/30 text-sp-muted hover:bg-sp-border/50 transition-colors"
            >
              <span className="material-symbols-outlined text-xl">add</span>
              <span className="text-caption">추가</span>
            </button>
          )}
        </div>
      ) : (
        <FavoriteToolPicker
          selected={[...favoriteTools]}
          onSave={(ids) => {
            void update({ favoriteTools: ids });
            setShowPicker(false);
          }}
          onCancel={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

function FavoriteToolPicker({
  selected,
  onSave,
  onCancel,
}: {
  selected: string[];
  onSave: (ids: string[]) => void;
  onCancel: () => void;
}) {
  const [picked, setPicked] = useState<string[]>([...selected]);

  const toggle = (id: string) => {
    setPicked((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  return (
    <div className="flex-1 flex flex-col">
      <p className="text-caption text-sp-muted mb-2">
        대시보드에 표시할 도구를 선택하세요 (최대 8개)
      </p>
      <div className="grid grid-cols-4 gap-1.5 overflow-y-auto" style={{ maxHeight: 'calc(100% - 60px)' }}>
        {TOOL_DEFINITIONS.map((tool) => {
          const isSelected = picked.includes(tool.id);
          return (
            <button
              key={tool.id}
              onClick={() => {
                if (!isSelected && picked.length >= 8) return;
                toggle(tool.id);
              }}
              className={`flex flex-col items-center justify-center gap-1 p-1.5 rounded-lg transition-all text-caption ${
                isSelected
                  ? `${tool.color} ring-1 ring-sp-accent`
                  : 'bg-sp-bg text-sp-muted hover:bg-sp-border/30'
              } ${!isSelected && picked.length >= 8 ? 'opacity-30 cursor-not-allowed' : ''}`}
            >
              <span className="text-base">{tool.icon}</span>
              <span className="truncate w-full text-center">{tool.name}</span>
            </button>
          );
        })}
      </div>
      <div className="flex gap-2 mt-2 sticky bottom-0 bg-sp-card pt-2">
        <button
          onClick={() => onSave(picked)}
          className="flex-1 text-xs bg-sp-accent text-sp-accent-fg rounded-lg py-1.5 hover:brightness-110 transition-colors"
        >
          저장 ({picked.length}개)
        </button>
        <button
          onClick={onCancel}
          className="flex-1 text-xs bg-sp-border text-sp-muted rounded-lg py-1.5 hover:bg-sp-border/80 transition-colors"
        >
          취소
        </button>
      </div>
    </div>
  );
}
