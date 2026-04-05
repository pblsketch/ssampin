import type { TodoViewMode } from '@domain/entities/TodoSettings';

interface ViewToggleProps {
  currentView: TodoViewMode;
  onViewChange: (view: TodoViewMode) => void;
}

const VIEW_OPTIONS: { key: TodoViewMode; label: string; icon: string }[] = [
  { key: 'todo', label: '리스트', icon: 'list' },
  { key: 'kanban', label: '칸반', icon: 'view_kanban' },
  { key: 'list', label: '테이블', icon: 'table_rows' },
  { key: 'timeline', label: '타임라인', icon: 'timeline' },
];

export function ViewToggle({ currentView, onViewChange }: ViewToggleProps) {
  return (
    <div className="flex gap-1 p-1 bg-sp-surface rounded-lg">
      {VIEW_OPTIONS.map(({ key, label, icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onViewChange(key)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors
            focus-visible:ring-2 focus-visible:ring-sp-accent focus-visible:outline-none ${
            currentView === key
              ? 'bg-sp-accent text-white'
              : 'text-sp-muted hover:text-sp-text hover:bg-sp-card'
          }`}
          title={label}
        >
          <span className="material-symbols-outlined text-icon">{icon}</span>
          {label}
        </button>
      ))}
    </div>
  );
}
