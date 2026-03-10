import { useState, useCallback, useMemo } from 'react';
import type { Settings } from '@domain/entities/Settings';
import { NAV_ITEMS } from '@adapters/components/Layout/Sidebar';
import type { PageId } from '@adapters/components/Layout/Sidebar';
import { SettingsSection } from '../shared/SettingsSection';
import { Toggle } from '../shared/Toggle';

interface Props {
  draft: Settings;
  patch: (p: Partial<Settings>) => void;
}

export function SidebarTab({ draft, patch }: Props) {
  const [draggedId, setDraggedId] = useState<PageId | null>(null);
  const [dragOverId, setDragOverId] = useState<PageId | null>(null);

  const sortedItems = useMemo(() => {
    const order = draft.menuOrder;
    if (!order || order.length === 0) return NAV_ITEMS;
    return [...NAV_ITEMS].sort((a, b) => {
      const aIdx = order.indexOf(a.id);
      const bIdx = order.indexOf(b.id);
      if (aIdx === -1 && bIdx === -1) return 0;
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    });
  }, [draft.menuOrder]);

  const handleDragStart = useCallback((e: React.DragEvent, id: PageId) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, id: PageId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedId !== id) setDragOverId(id);
  }, [draggedId]);

  const handleDrop = useCallback((e: React.DragEvent, targetId: PageId) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }
    const currentOrder = sortedItems.map((item) => item.id);
    const dragIdx = currentOrder.indexOf(draggedId);
    const targetIdx = currentOrder.indexOf(targetId);
    const newOrder = [...currentOrder];
    newOrder.splice(dragIdx, 1);
    newOrder.splice(targetIdx, 0, draggedId);
    patch({ menuOrder: newOrder });
    setDraggedId(null);
    setDragOverId(null);
  }, [draggedId, sortedItems, patch]);

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDragOverId(null);
  }, []);

  const handleResetOrder = useCallback(() => {
    patch({ menuOrder: NAV_ITEMS.map((item) => item.id) });
  }, [patch]);

  return (
    <SettingsSection
      icon="menu"
      iconColor="bg-slate-500/10 text-slate-400"
      title="메뉴 표시 설정"
      actions={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleResetOrder}
            className="text-xs text-sp-muted hover:text-sp-text transition-colors px-3 py-1.5 rounded-lg border border-sp-border hover:bg-sp-text/5"
          >
            순서 초기화
          </button>
          <button
            type="button"
            onClick={() => patch({ hiddenMenus: [] })}
            className="text-xs text-sp-accent hover:text-sp-accent/80 transition-colors px-3 py-1.5 rounded-lg border border-sp-accent/30 hover:bg-sp-accent/10"
          >
            모두 표시
          </button>
        </div>
      }
    >
      <p className="text-sm text-sp-muted mb-4">드래그하여 메뉴 순서를 변경하고, 토글로 표시/숨김을 설정할 수 있습니다.</p>
      <div className="flex flex-col gap-1">
        {sortedItems.map((item) => {
          const isAlwaysVisible = item.id === 'dashboard';
          const isHidden = (draft.hiddenMenus ?? []).includes(item.id);
          const isDragged = draggedId === item.id;
          const isDragOver = dragOverId === item.id && draggedId !== item.id;

          return (
            <div
              key={item.id}
              draggable
              onDragStart={(e) => handleDragStart(e, item.id)}
              onDragOver={(e) => handleDragOver(e, item.id)}
              onDrop={(e) => handleDrop(e, item.id)}
              onDragEnd={handleDragEnd}
              onDragLeave={() => { if (dragOverId === item.id) setDragOverId(null); }}
              className={`flex items-center justify-between py-2.5 px-3 rounded-lg transition-all select-none ${
                isDragged ? 'opacity-30' : ''
              } ${isDragOver ? 'ring-2 ring-sp-accent/50 bg-sp-accent/5' : 'hover:bg-sp-surface/50'}`}
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[16px] text-sp-muted/40 cursor-grab active:cursor-grabbing">
                  drag_indicator
                </span>
                <span className={`material-symbols-outlined text-[18px] ${isAlwaysVisible ? 'text-sp-muted/50' : isHidden ? 'text-sp-muted/30' : 'text-sp-muted'}`}>{item.icon}</span>
                <span className={`text-sm font-medium ${isAlwaysVisible ? 'text-sp-muted/70' : isHidden ? 'text-sp-muted/40' : 'text-sp-text'}`}>{item.label}</span>
                {isAlwaysVisible && (
                  <span className="text-[10px] text-sp-muted bg-sp-surface px-1.5 py-0.5 rounded">항상 표시</span>
                )}
              </div>
              <Toggle
                checked={isAlwaysVisible ? true : !isHidden}
                onChange={isAlwaysVisible ? () => undefined : (visible) => {
                  const current = draft.hiddenMenus ?? [];
                  if (visible) {
                    patch({ hiddenMenus: current.filter((id) => id !== item.id) });
                  } else {
                    if (!current.includes(item.id)) {
                      patch({ hiddenMenus: [...current, item.id] });
                    }
                  }
                }}
              />
            </div>
          );
        })}
      </div>
    </SettingsSection>
  );
}
