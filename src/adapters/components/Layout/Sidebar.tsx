export type PageId =
  | 'dashboard'
  | 'timetable'
  | 'seating'
  | 'schedule'
  | 'student-records'
  | 'memo'
  | 'todo'
  | 'export'
  | 'settings';

import { useSettingsStore } from '@adapters/stores/useSettingsStore';

interface SidebarProps {
  currentPage: PageId;
  onNavigate: (page: PageId) => void;
}

interface NavItem {
  id: PageId;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: '대시보드', icon: 'dashboard' },
  { id: 'timetable', label: '시간표', icon: 'calendar_view_day' },
  { id: 'seating', label: '좌석 배치', icon: 'airline_seat_recline_normal' },
  { id: 'schedule', label: '일정', icon: 'event_note' },
  { id: 'student-records', label: '담임메모', icon: 'school' },
  { id: 'memo', label: '메모', icon: 'sticky_note_2' },
  { id: 'todo', label: '할 일', icon: 'check_circle' },
  { id: 'export', label: '내보내기', icon: 'ios_share' },
];

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const { settings } = useSettingsStore();

  return (
    <aside className="w-64 h-full bg-sp-surface flex flex-col border-r border-sp-border shrink-0">
      {/* 로고 */}
      <div className="p-6 flex items-center gap-3">
        <div className="bg-sp-accent/20 p-2 rounded-lg">
          <span className="material-symbols-outlined text-sp-accent text-3xl">
            school
          </span>
        </div>
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">쌤핀</h1>
          <p className="text-xs text-sp-muted">Teacher&apos;s Dashboard</p>
        </div>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 px-4 py-2 flex flex-col gap-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left ${isActive
                ? 'bg-sp-accent text-white shadow-lg shadow-sp-accent/20'
                : 'text-sp-muted hover:text-white hover:bg-white/5'
                }`}
            >
              <span className="material-symbols-outlined">{item.icon}</span>
              <span className="font-medium text-sm">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* 하단: 설정 + 프로필 + 버전 */}
      <div className="p-4 border-t border-sp-border">
        <button
          onClick={() => onNavigate('settings')}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all w-full text-left ${currentPage === 'settings'
            ? 'bg-sp-accent text-white shadow-lg shadow-sp-accent/20'
            : 'text-sp-muted hover:text-white hover:bg-white/5'
            }`}
        >
          <span className="material-symbols-outlined">settings</span>
          <span className="font-medium text-sm">설정</span>
        </button>

        <div className="flex items-center gap-3 px-4 py-2 mt-3">
          <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-slate-300 text-base">
              person
            </span>
          </div>
          <div>
            <p className="text-sm font-medium text-white">
              {settings.teacherName ? `${settings.teacherName} 선생님` : '선생님'}
            </p>
            <p className="text-xs text-sp-muted">
              {settings.className ? `${settings.className} 담임` : '학급 정보 없음'}
            </p>
          </div>
        </div>

        <p className="text-[10px] text-sp-muted/50 text-center mt-3">v0.1.0</p>
      </div>
    </aside>
  );
}
