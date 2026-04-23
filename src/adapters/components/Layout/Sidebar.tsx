import type { ProtectedFeatureKey } from '@domain/entities/PinSettings';

export type PageId =
  | 'dashboard'
  | 'timetable'
  | 'seating'
  | 'schedule'
  | 'homeroom'
  | 'student-records'
  | 'meal'
  | 'memo'
  | 'note'
  | 'todo'
  | 'class-management'
  | 'bookmarks'
  | 'export'
  | 'tools'
  | 'tool-forms'
  | 'tool-timer'
  | 'tool-random'
  | 'tool-traffic-light'
  | 'tool-scoreboard'
  | 'tool-roulette'
  | 'tool-dice'
  | 'tool-coin'
  | 'tool-qrcode'
  | 'tool-work-symbols'
  | 'tool-poll'
  | 'tool-survey'
  | 'tool-multi-survey'
  | 'tool-realtime-bulletin'
  | 'tool-wordcloud'
  | 'tool-seat-picker'
  | 'tool-supsori'
  | 'tool-pblsketch'
  | 'tool-assignment'
  | 'tool-assignment-detail'
  | 'tool-grouping'
  | 'tool-chalkboard'
  | 'tool-valueline'
  | 'tool-traffic-discussion'
  | 'tool-collab-board'
  | 'dual-tool-view'
  | 'settings';

import { useState, useMemo, useCallback } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import { useShareStore } from '@adapters/stores/useShareStore';
import { SyncStatusBar } from '@adapters/components/Calendar/SyncStatusBar';
import { DriveSyncIndicator } from '@adapters/components/common/DriveSyncIndicator';

interface SidebarProps {
  currentPage: PageId;
  onNavigate: (page: PageId) => void;
  onFeedback: () => void;
}

interface NavItem {
  id: PageId;
  label: string;
  icon: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: '대시보드', icon: 'dashboard' },
  { id: 'timetable', label: '시간표', icon: 'calendar_view_day' },
  { id: 'schedule', label: '일정', icon: 'event_note' },
  { id: 'homeroom', label: '담임 업무', icon: 'school' },
  { id: 'memo', label: '메모', icon: 'sticky_note_2' },
  { id: 'note', label: '쌤핀 노트', icon: 'edit_note' },
  { id: 'todo', label: '할 일', icon: 'check_circle' },
  { id: 'class-management', label: '수업 관리', icon: 'menu_book' },
  { id: 'bookmarks', label: '즐겨찾기', icon: 'bookmark' },
  { id: 'tools', label: '쌤도구', icon: 'construction' },
  { id: 'meal', label: '급식', icon: 'restaurant' },
  { id: 'export', label: '내보내기', icon: 'ios_share' },
];

/**
 * PIN 보호 가능 페이지 목록 (자동 동기화)
 * NAV_ITEMS에서 보호 불가 페이지(dashboard, export)를 제외하고 생성.
 * 새 메뉴 추가 시 여기에 featureKey 매핑만 추가하면 PIN 설정에 자동 반영.
 */
export interface ProtectablePage {
  pageId: PageId;
  featureKey: ProtectedFeatureKey;
  label: string;
  icon: string;
}

/** PageId → ProtectedFeatureKey 매핑 (kebab-case → camelCase) */
const PAGE_TO_FEATURE_KEY: Partial<Record<PageId, ProtectedFeatureKey>> = {
  timetable: 'timetable',
  seating: 'seating',
  schedule: 'schedule',
  homeroom: 'studentRecords',
  'student-records': 'studentRecords',
  meal: 'meal',
  memo: 'memo',
  note: 'note',
  todo: 'todo',
  'class-management': 'classManagement',
  bookmarks: 'bookmarks',
};

/** PIN 보호 불가 페이지 (대시보드, 내보내기, 쌤도구, 설정) */
const NON_PROTECTABLE: ReadonlySet<PageId> = new Set([
  'dashboard', 'export', 'tools',
  'tool-forms',
  'tool-timer', 'tool-random', 'tool-traffic-light', 'tool-scoreboard',
  'tool-roulette', 'tool-dice', 'tool-coin', 'tool-poll', 'tool-survey', 'tool-seat-picker', 'settings',
]);

/** NAV_ITEMS에서 자동 파생된 PIN 보호 가능 페이지 목록 */
export const PROTECTABLE_PAGES: readonly ProtectablePage[] = NAV_ITEMS
  .filter((item) => !NON_PROTECTABLE.has(item.id))
  .map((item) => ({
    pageId: item.id,
    featureKey: PAGE_TO_FEATURE_KEY[item.id]!,
    label: item.label,
    icon: item.icon,
  }));

export function Sidebar({ currentPage, onNavigate, onFeedback }: SidebarProps) {
  const { track } = useAnalytics();
  const { settings } = useSettingsStore();
  const updateSettings = useSettingsStore((s) => s.update);

  const sidebarCollapsed = settings.sidebarCollapsed ?? false;

  const [draggedId, setDraggedId] = useState<PageId | null>(null);
  const [dragOverId, setDragOverId] = useState<PageId | null>(null);

  const sortedItems = useMemo(() => {
    const order = settings.menuOrder;
    if (!order || order.length === 0) return NAV_ITEMS;
    return [...NAV_ITEMS].sort((a, b) => {
      const aIdx = order.indexOf(a.id);
      const bIdx = order.indexOf(b.id);
      if (aIdx === -1 && bIdx === -1) return 0;
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    });
  }, [settings.menuOrder]);

  const visibleItems = useMemo(() => {
    const hidden = settings.hiddenMenus;
    if (!hidden || hidden.length === 0) return sortedItems;
    return sortedItems.filter((item) => !hidden.includes(item.id));
  }, [sortedItems, settings.hiddenMenus]);

  const handleDragStart = useCallback((e: React.DragEvent, id: PageId) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, id: PageId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedId !== id) {
      setDragOverId(id);
    }
  }, [draggedId]);

  const handleDrop = useCallback((e: React.DragEvent, targetId: PageId) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }

    const currentOrder = sortedItems.map((item) => item.id);
    const draggedIdx = currentOrder.indexOf(draggedId);
    const targetIdx = currentOrder.indexOf(targetId);
    const newOrder = [...currentOrder];
    newOrder.splice(draggedIdx, 1);
    newOrder.splice(targetIdx, 0, draggedId);

    updateSettings({ menuOrder: newOrder });
    setDraggedId(null);
    setDragOverId(null);
  }, [draggedId, sortedItems, updateSettings]);

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDragOverId(null);
  }, []);

  const handleToggleCollapse = useCallback(() => {
    void updateSettings({ sidebarCollapsed: !sidebarCollapsed });
  }, [sidebarCollapsed, updateSettings]);

  return (
    <aside
      className={`${sidebarCollapsed ? 'w-16' : 'w-64'} h-full bg-sp-surface flex flex-col border-r border-sp-border shrink-0 transition-[width] duration-200 ease-in-out overflow-hidden`}
    >
      {/* 로고 */}
      <div className={`p-4 flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
        {!sidebarCollapsed && (
          <div className="bg-sp-accent/20 p-2 rounded-lg shrink-0">
            <img src={`${import.meta.env.BASE_URL}icon_new.svg`} alt="쌤핀" className="w-8 h-8" />
          </div>
        )}
        {!sidebarCollapsed && (
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-sp-text tracking-tight">쌤핀</h1>
            <p className="text-xs text-sp-muted">Teacher&apos;s Dashboard</p>
          </div>
        )}
        <button
          type="button"
          onClick={handleToggleCollapse}
          aria-label={sidebarCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
          aria-expanded={!sidebarCollapsed}
          title={sidebarCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
          className="text-sp-muted hover:text-sp-text hover:bg-sp-text/5 rounded-md p-1.5 transition-colors duration-sp-quick ease-sp-out shrink-0"
        >
          <span className="material-symbols-outlined text-xl">
            {sidebarCollapsed ? 'menu' : 'menu_open'}
          </span>
        </button>
      </div>

      {/* 네비게이션 */}
      <nav aria-label="메인 내비게이션" className="flex-1 px-2 py-2 flex flex-col gap-1 overflow-y-auto">
        {visibleItems.map((item) => {
          const isActive = currentPage === item.id
            || (item.id === 'tools' && currentPage.startsWith('tool-'));
          const isDragged = draggedId === item.id;
          const isDragOver = dragOverId === item.id && draggedId !== item.id;

          return (
            <button
              key={item.id}
              draggable={!sidebarCollapsed}
              onDragStart={!sidebarCollapsed ? (e) => handleDragStart(e, item.id) : undefined}
              onDragOver={!sidebarCollapsed ? (e) => handleDragOver(e, item.id) : undefined}
              onDrop={!sidebarCollapsed ? (e) => handleDrop(e, item.id) : undefined}
              onDragEnd={!sidebarCollapsed ? handleDragEnd : undefined}
              onDragLeave={!sidebarCollapsed ? () => { if (dragOverId === item.id) setDragOverId(null); } : undefined}
              title={sidebarCollapsed ? item.label : undefined}
              onClick={() => {
                track('feature_discovery', { feature: item.id, source: 'menu' });
                onNavigate(item.id);
              }}
              className={`flex items-center ${sidebarCollapsed ? 'justify-center px-3' : 'gap-3 px-4'} py-3 rounded-xl transition-all duration-sp-base ease-sp-out text-left group ${
                !isDragged ? 'active:scale-[0.98]' : ''
              } ${
                isActive
                  ? 'bg-sp-accent text-white shadow-lg shadow-sp-accent/20'
                  : 'text-sp-muted hover:text-sp-text hover:bg-sp-text/5'
              } ${isDragged ? 'opacity-30' : ''} ${
                isDragOver ? 'ring-2 ring-sp-accent/50 bg-sp-accent/10' : ''
              }`}
            >
              {!sidebarCollapsed && (
                <span className="material-symbols-outlined text-icon-md opacity-0 group-hover:opacity-50 cursor-grab active:cursor-grabbing shrink-0 -ml-1 mr--2 transition-opacity">
                  drag_indicator
                </span>
              )}
              <span className="material-symbols-outlined">{item.icon}</span>
              {!sidebarCollapsed && (
                <span className="font-medium text-sm">{item.label}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* 하단: 설정 + 프로필 + 버전 */}
      <div className={`${sidebarCollapsed ? 'p-2' : 'p-4'} border-t border-sp-border`}>
        {!sidebarCollapsed && <SyncStatusBar />}
        {!sidebarCollapsed && <DriveSyncIndicator />}
        <button
          onClick={() => {
            track('feature_discovery', { feature: 'settings', source: 'menu' });
            onNavigate('settings');
          }}
          title={sidebarCollapsed ? '설정' : undefined}
          className={`flex items-center ${sidebarCollapsed ? 'justify-center px-3' : 'gap-3 px-4'} py-3 rounded-xl transition-all w-full text-left ${currentPage === 'settings'
            ? 'bg-sp-accent text-white shadow-lg shadow-sp-accent/20'
            : 'text-sp-muted hover:text-sp-text hover:bg-sp-text/5'
            }`}
        >
          <span className="material-symbols-outlined">settings</span>
          {!sidebarCollapsed && <span className="font-medium text-sm">설정</span>}
        </button>

        <div className={`flex items-center ${sidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-4'} py-2 mt-3`}>
          <div className="w-8 h-8 rounded-full bg-sp-border flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-sp-muted text-base">
              person
            </span>
          </div>
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <p className="text-sm font-medium text-sp-text truncate">
                {settings.teacherName ? `${settings.teacherName} 선생님` : '선생님'}
              </p>
              <p className="text-xs text-sp-muted truncate">
                {settings.className ? `${settings.className} 담임` : '학급 정보 없음'}
              </p>
            </div>
          )}
        </div>

        {!sidebarCollapsed && (
          <button
            type="button"
            onClick={() => {
              useShareStore.getState().openModal('manual');
            }}
            className="flex items-center gap-3 px-4 py-2 rounded-xl transition-all w-full text-left text-sp-accent/80 hover:text-sp-accent hover:bg-sp-accent/5 mt-1"
          >
            <span className="material-symbols-outlined text-icon-md">mail</span>
            <span className="text-xs font-medium">지인에게 추천</span>
          </button>
        )}

        {!sidebarCollapsed && (
          <button
            type="button"
            onClick={onFeedback}
            className="flex items-center gap-3 px-4 py-2 rounded-xl transition-all w-full text-left text-sp-muted hover:text-sp-text hover:bg-sp-text/5 mt-1"
          >
            <span className="material-symbols-outlined text-icon-md">rate_review</span>
            <span className="text-xs font-medium">건의사항 보내기</span>
          </button>
        )}

        {!sidebarCollapsed && (
          <p className="text-caption text-sp-muted text-center mt-2">v1.10.5</p>
        )}
      </div>
    </aside>
  );
}
