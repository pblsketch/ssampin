export type TodoMode = 'default' | 'pro';
export type TodoViewMode = 'todo' | 'kanban' | 'list' | 'timeline';

export interface TodoSettings {
  /** 기능 모드 (기본: 'default') */
  readonly mode: TodoMode;

  /** 프로 모드 기본 뷰 (기본: 'todo') */
  readonly defaultView: TodoViewMode;

  /** 마지막으로 사용한 뷰 (프로 모드 뷰 전환 시 기억) */
  readonly lastView?: TodoViewMode;
}

export const DEFAULT_TODO_SETTINGS: TodoSettings = {
  mode: 'default',
  defaultView: 'todo',
};
