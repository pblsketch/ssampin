import type { TodoViewMode } from '@domain/entities/TodoSettings';

interface ViewToggleProps {
  currentView: TodoViewMode;
  onViewChange: (view: TodoViewMode) => void;
}

const VIEW_OPTIONS: { key: TodoViewMode; label: string; icon: string }[] = [
  { key: 'todo', label: '리스트', icon: '☰' },
  { key: 'kanban', label: '칸반', icon: '▦' },
  { key: 'list', label: '테이블', icon: '▤' },
  { key: 'timeline', label: '타임라인', icon: '▬' },
];

export function ViewToggle({ currentView, onViewChange }: ViewToggleProps) {
  return (
    <div className="flex gap-1 p-1 bg-sp-surface rounded-lg">
      {VIEW_OPTIONS.map(({ key, label, icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onViewChange(key)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            currentView === key
              ? 'bg-sp-accent text-white'
              : 'text-sp-muted hover:text-sp-text hover:bg-sp-card'
          }`}
          title={label}
        >
          {icon} {label}
        </button>
      ))}
    </div>
  );
}
