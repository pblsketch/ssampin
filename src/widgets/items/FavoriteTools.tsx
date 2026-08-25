import { useState } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import {
  TOOL_DEFINITIONS,
  DEFAULT_FAVORITE_TOOLS,
  getToolDefinition,
} from '@adapters/constants/toolDefinitions';
import type { ToolDefinition } from '@adapters/constants/toolDefinitions';
import { OneClickPortalLaunchModal } from '@adapters/components/Tools/OneClickPortalLaunchModal';
import {
  ONECLICK_PORTAL_TOOL_ID,
  useOneClickPortalLauncher,
} from '@adapters/components/Tools/useOneClickPortalLauncher';

interface FavoriteToolsProps {
  /** false일 때(모달 확장 뷰) 전체 편집 레이아웃 렌더. 기본값 true(카드 뷰) */
  isCompactMode?: boolean;
}

export function FavoriteTools({ isCompactMode = true }: FavoriteToolsProps = {}) {
  const favoriteTools = useSettingsStore((s) => s.settings.favoriteTools) ?? DEFAULT_FAVORITE_TOOLS;
  const update = useSettingsStore((s) => s.update);
  const [showPicker, setShowPicker] = useState(false);
  // 위젯 창에는 ToastContainer 가 없어 토스트는 보이지 않는다. 안내가 꼭 필요한 경우(첫 실행
  // 고지·미설치)는 모달로 뜨므로, 위젯에서도 중요한 안내는 놓치지 않는다.
  const oneclickPortal = useOneClickPortalLauncher();

  const handleToolClick = (tool: ToolDefinition) => {
    // 원클릭업무포털은 웹사이트도 앱 내 페이지도 아닌 외부 프로그램이라 전용 흐름을 탄다.
    // 이 분기가 없으면 존재하지 않는 페이지로 이동해 빈 화면이 된다.
    if (tool.id === ONECLICK_PORTAL_TOOL_ID) {
      void oneclickPortal.handleCardClick();
      return;
    }
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

  // 확장 모달 뷰: 인라인 편집 토글 없이 항상 편집 모드
  if (!isCompactMode) {
    return (
      <FavoriteToolsExpandedEditor
        favoriteTools={[...favoriteTools]}
        onSave={(ids) => void update({ favoriteTools: ids })}
      />
    );
  }

  return (
    <div className="rounded-xl bg-sp-card p-4 h-full flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-sp-text flex items-center gap-1.5">
          <span>🛠️</span>자주 쓰는 도구
        </h3>
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="min-w-6 min-h-6 flex items-center justify-center text-sp-muted hover:text-sp-text transition-colors"
          title="도구 편집"
        >
          <span className="material-symbols-outlined text-sm">{showPicker ? 'close' : 'edit'}</span>
        </button>
      </div>

      {/* 도구 그리드 */}
      {!showPicker ? (
        <div className="grid grid-cols-4 gap-2 flex-1 content-start">
          {tools.map((tool) => (
            <button
              key={tool.id}
              onClick={() => handleToolClick(tool)}
              // 유리를 켰을 때만 손보는 자리. 타일 배경은 20% 틴트라 뒤가 그대로 비쳐
              // 글자가 배경 밝기에 휘둘린다(실측 2.67~4.09:1 — 화면에서 가장 낮았다).
              data-sp-tool-tile
              className={`min-w-6 min-h-6 flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl ${tool.color} hover:scale-105 active:scale-95 transition-all`}
            >
              <span className="text-xl">{tool.icon}</span>
              <span className="text-xs font-medium truncate w-full text-center">{tool.name}</span>
            </button>
          ))}

          {tools.length < 8 && (
            <button
              onClick={() => setShowPicker(true)}
              className="min-w-6 min-h-6 flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl bg-sp-border/30 text-sp-muted hover:bg-sp-border/50 transition-colors"
            >
              <span className="material-symbols-outlined text-xl">add</span>
              <span className="text-xs">추가</span>
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

      <OneClickPortalLaunchModal
        open={oneclickPortal.modalMode !== null}
        mode={oneclickPortal.modalMode ?? 'first-run'}
        showNotice={oneclickPortal.showNotice}
        onClose={oneclickPortal.closeModal}
        onLaunch={oneclickPortal.handleLaunchFromModal}
        onSelectTask={oneclickPortal.handleSelectTask}
        onOpenSite={oneclickPortal.openSite}
      />
    </div>
  );
}

// ─── 확장 모달 편집기 (isCompactMode=false) ───────────────────────────────

function FavoriteToolsExpandedEditor({
  favoriteTools,
  onSave,
}: {
  favoriteTools: string[];
  onSave: (ids: string[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>([...favoriteTools]);

  const selectedTools = picked
    .map((id) => getToolDefinition(id))
    .filter((t): t is ToolDefinition => t !== undefined);

  const availableTools = TOOL_DEFINITIONS.filter((t) => !picked.includes(t.id));

  const moveUp = (index: number) => {
    if (index === 0) return;
    setPicked((prev) => {
      const next = [...prev];
      const tmp = next[index - 1] ?? '';
      next[index - 1] = next[index] ?? '';
      next[index] = tmp;
      return next;
    });
  };

  const moveDown = (index: number) => {
    if (index === picked.length - 1) return;
    setPicked((prev) => {
      const next = [...prev];
      const tmp = next[index] ?? '';
      next[index] = next[index + 1] ?? '';
      next[index + 1] = tmp;
      return next;
    });
  };

  const remove = (id: string) => {
    setPicked((prev) => prev.filter((x) => x !== id));
  };

  const add = (id: string) => {
    if (picked.length >= 8) return;
    setPicked((prev) => [...prev, id]);
  };

  return (
    <div className="flex flex-col h-full gap-4 p-1">
      {/* 선택된 도구 */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-bold text-sp-text">
            선택된 도구
            <span className="ml-1.5 text-xs font-normal text-sp-muted">({picked.length}/8)</span>
          </h4>
          {picked.length > 0 && (
            <span className="text-xs text-sp-muted">순서 조정 후 자동 저장됩니다</span>
          )}
        </div>

        {picked.length === 0 ? (
          <p className="text-xs text-sp-muted py-3 text-center bg-sp-bg rounded-xl">
            아래에서 도구를 선택하세요
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {selectedTools.map((tool, index) => (
              <li
                key={tool.id}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-sp-bg hover:bg-sp-border/30 transition-colors"
              >
                <span className="text-lg w-6 text-center flex-shrink-0">{tool.icon}</span>
                <span className="flex-1 text-sm font-medium text-sp-text truncate">
                  {tool.name}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => moveUp(index)}
                    disabled={index === 0}
                    title="위로"
                    className="min-w-6 min-h-6 flex items-center justify-center rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-border/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <span className="material-symbols-outlined text-sm">arrow_upward</span>
                  </button>
                  <button
                    onClick={() => moveDown(index)}
                    disabled={index === picked.length - 1}
                    title="아래로"
                    className="min-w-6 min-h-6 flex items-center justify-center rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-border/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <span className="material-symbols-outlined text-sm">arrow_downward</span>
                  </button>
                  <button
                    onClick={() => remove(tool.id)}
                    title="제거"
                    className="min-w-6 min-h-6 flex items-center justify-center rounded-lg text-sp-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">close</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 추가할 도구 */}
      <section className="flex-1 flex flex-col min-h-0">
        <h4 className="text-sm font-bold text-sp-text mb-2">추가할 도구</h4>
        {availableTools.length === 0 ? (
          <p className="text-xs text-sp-muted py-3 text-center bg-sp-bg rounded-xl">
            모든 도구가 선택되었습니다 (최대 8개)
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-2 overflow-y-auto">
            {availableTools.map((tool) => {
              const disabled = picked.length >= 8;
              return (
                <button
                  key={tool.id}
                  onClick={() => add(tool.id)}
                  disabled={disabled}
                  title="선택"
                  data-sp-tool-tile
                  className={`min-w-6 min-h-6 flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl transition-all ${
                    disabled
                      ? 'opacity-30 cursor-not-allowed bg-sp-bg text-sp-muted'
                      : `${tool.color} hover:scale-105 active:scale-95`
                  }`}
                >
                  <span className="text-xl">{tool.icon}</span>
                  <span className="text-xs font-medium truncate w-full text-center">
                    {tool.name}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* 저장 버튼 */}
      <div className="sticky bottom-0 bg-sp-card pt-2 border-t border-sp-border">
        <button
          onClick={() => onSave(picked)}
          className="min-w-6 min-h-6 w-full text-sm bg-sp-accent text-sp-accent-fg rounded-xl py-2.5 font-medium hover:brightness-110 active:brightness-95 transition-all"
        >
          저장 ({picked.length}개)
        </button>
      </div>
    </div>
  );
}

// ─── 컴팩트 카드 인라인 피커 (기존) ──────────────────────────────────────────

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
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="flex-1 flex flex-col">
      <p className="text-caption text-sp-muted mb-2">
        대시보드에 표시할 도구를 선택하세요 (최대 8개)
      </p>
      <div
        className="grid grid-cols-4 gap-1.5 overflow-y-auto"
        style={{ maxHeight: 'calc(100% - 60px)' }}
      >
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
