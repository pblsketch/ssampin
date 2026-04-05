import type { Settings } from '@domain/entities/Settings';
import type { TodoViewMode, TodoProLayout } from '@domain/entities/TodoSettings';
import { DEFAULT_TODO_SETTINGS } from '@domain/entities/TodoSettings';
import { SettingsSection } from '../shared/SettingsSection';

interface Props {
  draft: Settings;
  patch: (p: Partial<Settings>) => void;
}

const VIEW_OPTIONS: { key: TodoViewMode; label: string; icon: string }[] = [
  { key: 'todo', label: '리스트', icon: 'list' },
  { key: 'kanban', label: '칸반', icon: 'view_kanban' },
  { key: 'list', label: '테이블', icon: 'table_rows' },
  { key: 'timeline', label: '타임라인', icon: 'timeline' },
];

const LAYOUT_OPTIONS: { key: TodoProLayout; label: string; icon: string; desc: string }[] = [
  { key: 'default', label: '기본', icon: 'crop_square', desc: '중앙 정렬 (max-w-3xl)' },
  { key: 'wide', label: '와이드', icon: 'width_wide', desc: '전체 폭 사용' },
  { key: 'dual', label: '듀얼 패널', icon: 'view_sidebar', desc: '좌우 분할 뷰' },
];

export function TodoTab({ draft, patch }: Props) {
  const todoSettings = draft.todoSettings ?? DEFAULT_TODO_SETTINGS;
  const isProMode = todoSettings.mode === 'pro';

  const updateTodoSettings = (p: Partial<typeof todoSettings>) => {
    patch({ todoSettings: { ...todoSettings, ...p } });
  };

  return (
    <>
      <SettingsSection
        icon="checklist"
        iconColor="bg-green-500/10 text-green-500"
        title="할 일 모드"
        description="프로 모드를 켜면 칸반, 테이블, 타임라인 뷰를 사용할 수 있습니다."
        actions={<span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-500 ring-1 ring-yellow-500/20">Beta</span>}
      >
        <div className="space-y-4">
          {/* 프로 모드 토글 */}
          <label className="flex items-center justify-between cursor-pointer group">
            <div>
              <span className="text-sm font-medium text-sp-text">프로 모드 사용</span>
              <p className="text-xs text-sp-muted mt-0.5">
                다양한 뷰와 진행 상태 관리 기능을 활성화합니다
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isProMode}
              onClick={() => updateTodoSettings({ mode: isProMode ? 'default' : 'pro' })}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                isProMode ? 'bg-sp-accent' : 'bg-sp-border'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  isProMode ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </label>

          <p className="text-xs text-sp-muted bg-sp-surface rounded-lg px-3 py-2">
            모드를 변경해도 기존 할 일 데이터는 그대로 유지됩니다.
          </p>
        </div>
      </SettingsSection>

      {isProMode && (
        <>
          <SettingsSection
            icon="view_carousel"
            iconColor="bg-blue-500/10 text-blue-500"
            title="기본 뷰"
            description="프로 모드 진입 시 기본으로 표시할 뷰를 선택합니다."
          >
            <div className="grid grid-cols-2 gap-2">
              {VIEW_OPTIONS.map(({ key, label, icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => updateTodoSettings({ defaultView: key })}
                  className={`flex items-center gap-2 px-4 py-3 rounded-lg border transition-all text-left ${
                    todoSettings.defaultView === key
                      ? 'border-sp-accent bg-sp-accent/10 text-sp-accent'
                      : 'border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-icon-md">{icon}</span>
                  <span className="text-sm font-medium">{label}</span>
                </button>
              ))}
            </div>
          </SettingsSection>

          <SettingsSection
            icon="dashboard_customize"
            iconColor="bg-purple-500/10 text-purple-500"
            title="레이아웃"
            description="프로 모드의 화면 레이아웃을 설정합니다."
          >
            <div className="space-y-2">
              {LAYOUT_OPTIONS.map(({ key, label, icon, desc }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => updateTodoSettings({ proLayout: key })}
                  className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg border transition-all text-left ${
                    (todoSettings.proLayout ?? 'default') === key
                      ? 'border-sp-accent bg-sp-accent/10 text-sp-accent'
                      : 'border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-icon-md">{icon}</span>
                  <div>
                    <span className="text-sm font-medium">{label}</span>
                    <p className="text-xs opacity-70 mt-0.5">{desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </SettingsSection>
        </>
      )}
    </>
  );
}
