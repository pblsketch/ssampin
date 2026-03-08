/** 추적 가능한 이벤트 이름 */
export type AnalyticsEventName =
  | 'app_open'
  | 'app_close'
  | 'page_view'
  | 'widget_open'
  | 'widget_close'
  | 'timetable_edit'
  | 'seating_shuffle'
  | 'seating_drag'
  | 'event_create'
  | 'memo_create'
  | 'todo_toggle'
  | 'tool_use'
  | 'export'
  | 'share_import'
  | 'chatbot_open'
  | 'chatbot_message'
  | 'update_installed'
  | 'onboarding_complete';

/** tool_use 이벤트의 tool 프로퍼티에 사용 가능한 도구명 */
export type ToolName =
  | 'timer'
  | 'random_picker'
  | 'roulette'
  | 'scoreboard'
  | 'traffic_light'
  | 'dice'
  | 'coin'
  | 'qr'
  | 'activity_symbol'
  | 'vote'
  | 'survey'
  | 'wordcloud'
  | 'seat_picker';

/** 이벤트별 properties 타입 매핑 */
export interface AnalyticsEventProperties {
  app_open: { launchMode: 'normal' | 'widget' };
  app_close: { sessionDuration: number };
  page_view: { page: string };
  widget_open: { trigger: 'close_button' | 'tray' };
  widget_close: Record<string, never>;
  timetable_edit: { action: 'add' | 'edit' | 'delete' };
  seating_shuffle: { studentCount: number };
  seating_drag: Record<string, never>;
  event_create: { category: string };
  memo_create: Record<string, never>;
  todo_toggle: { completed: boolean };
  tool_use: { tool: ToolName };
  export: { format: 'excel' | 'hwpx' | 'pdf' | 'ssampin' };
  share_import: Record<string, never>;
  chatbot_open: Record<string, never>;
  chatbot_message: Record<string, never>;
  update_installed: { from: string; to: string };
  onboarding_complete: { step: number };
}
