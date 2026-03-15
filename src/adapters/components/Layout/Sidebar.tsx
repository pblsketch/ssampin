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
  | 'todo'
  | 'class-management'
  | 'bookmarks'
  | 'export'
  | 'tools'
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
  | 'tool-wordcloud'
  | 'tool-seat-picker'
  | 'tool-supsori'
  | 'tool-pblsketch'
  | 'tool-assignment'
  | 'tool-assignment-detail'
  | 'settings';

import { useState, useMemo, useCallback } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
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
  todo: 'todo',
  'class-management': 'classManagement',
  bookmarks: 'bookmarks',
};

/** PIN 보호 불가 페이지 (대시보드, 내보내기, 쌤도구, 설정) */
const NON_PROTECTABLE: ReadonlySet<PageId> = new Set([
  'dashboard', 'export', 'tools',
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

  return (
    <aside className="w-64 h-full bg-sp-surface flex flex-col border-r border-sp-border shrink-0">
      {/* 로고 */}
      <div className="p-6 flex items-center gap-3">
        <div className="bg-sp-accent/20 p-2 rounded-lg">
          <img src={`${import.meta.env.BASE_URL}icon_new.svg`} alt="쌤핀" className="w-8 h-8" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-sp-text tracking-tight">쌤핀</h1>
          <p className="text-xs text-sp-muted">Teacher&apos;s Dashboard</p>
        </div>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 px-4 py-2 flex flex-col gap-1 overflow-y-auto">
        {visibleItems.map((item) => {
          const isActive = currentPage === item.id
            || (item.id === 'tools' && currentPage.startsWith('tool-'));
          const isDragged = draggedId === item.id;
          const isDragOver = dragOverId === item.id && draggedId !== item.id;

          return (
            <button
              key={item.id}
              draggable
              onDragStart={(e) => handleDragStart(e, item.id)}
              onDragOver={(e) => handleDragOver(e, item.id)}
              onDrop={(e) => handleDrop(e, item.id)}
              onDragEnd={handleDragEnd}
              onDragLeave={() => { if (dragOverId === item.id) setDragOverId(null); }}
              onClick={() => {
                track('feature_discovery', { feature: item.id, source: 'menu' });
                onNavigate(item.id);
              }}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left group ${
                isActive
                  ? 'bg-sp-accent text-white shadow-lg shadow-sp-accent/20'
                  : 'text-sp-muted hover:text-white hover:bg-white/5'
              } ${isDragged ? 'opacity-30' : ''} ${
                isDragOver ? 'ring-2 ring-sp-accent/50 bg-sp-accent/10' : ''
              }`}
            >
              <span className="material-symbols-outlined text-[18px] opacity-0 group-hover:opacity-50 cursor-grab active:cursor-grabbing shrink-0 -ml-1 mr--2 transition-opacity">
                drag_indicator
              </span>
              <span className="material-symbols-outlined">{item.icon}</span>
              <span className="font-medium text-sm">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* 하단: 설정 + 프로필 + 버전 */}
      <div className="p-4 border-t border-sp-border">
        <SyncStatusBar />
        <DriveSyncIndicator />
        <button
          onClick={() => {
            track('feature_discovery', { feature: 'settings', source: 'menu' });
            onNavigate('settings');
          }}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all w-full text-left ${currentPage === 'settings'
            ? 'bg-sp-accent text-white shadow-lg shadow-sp-accent/20'
            : 'text-sp-muted hover:text-white hover:bg-white/5'
            }`}
        >
          <span className="material-symbols-outlined">settings</span>
          <span className="font-medium text-sm">설정</span>
        </button>

        <div className="flex items-center gap-3 px-4 py-2 mt-3">
          <div className="w-8 h-8 rounded-full bg-sp-border flex items-center justify-center">
            <span className="material-symbols-outlined text-sp-muted text-base">
              person
            </span>
          </div>
          <div>
            <p className="text-sm font-medium text-sp-text">
              {settings.teacherName ? `${settings.teacherName} 선생님` : '선생님'}
            </p>
            <p className="text-xs text-sp-muted">
              {settings.className ? `${settings.className} 담임` : '학급 정보 없음'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onFeedback}
          className="flex items-center gap-3 px-4 py-2 rounded-xl transition-all w-full text-left text-sp-muted hover:text-sp-text hover:bg-white/5 mt-1"
        >
          <span className="material-symbols-outlined text-[18px]">rate_review</span>
          <span className="text-xs font-medium">건의사항 보내기</span>
        </button>

        <p className="text-[10px] text-sp-muted text-center mt-2">v0.4.1</p>
      </div>
    </aside>
  );
}
