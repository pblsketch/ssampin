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
  | 'onboarding_complete'
  | 'school_set'
  | 'class_set'
  | 'error'
  | 'feature_discovery'
  | 'session_start'
  | 'assignment_create'
  | 'assignment_share'
  | 'assignment_view'
  | 'consultation_create'
  | 'consultation_update'
  | 'bookmark_add'
  | 'bookmark_click'
  | 'feedback_submit'
  | 'settings_change'
  | 'timetable_neis_sync'
  | 'widget_layout_change'
  | 'onboarding_roles_selected'
  | 'onboarding_widget_preset'
  | 'chatbot_feedback'
  | 'chatbot_escalate'
  | 'share_modal_open'
  | 'share_click'
  | 'share_prompt_shown'
  | 'share_prompt_action';

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
  | 'seat_picker'
  | 'assignment'
  | 'class_seating';

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
  school_set: { school: string; level: string; region: string };
  class_set: { grade: number; classNum: number; studentCount: number };
  error: { message: string; component: string; stack?: string };
  feature_discovery: { feature: string; source: 'menu' | 'shortcut' | 'tooltip' | 'search' };
  session_start: { isReturning: boolean; launchCount: number };
  assignment_create: { title: string };
  assignment_share: { method: 'qr' | 'link' | 'copy' };
  assignment_view: { assignmentId: string };
  consultation_create: { type: string };
  consultation_update: { action: 'edit' | 'delete' | 'status_change' };
  bookmark_add: { url: string };
  bookmark_click: { url: string; type?: string };
  feedback_submit: Record<string, never>;
  settings_change: { section: string; key: string };
  timetable_neis_sync: { success: boolean };
  widget_layout_change: { from: string; to: string };
  onboarding_roles_selected: { roles: string[]; hiddenMenuCount: number; visibleMenuCount: number };
  onboarding_widget_preset: { presetKey: string; roles: string[] };
  chatbot_feedback: { result: 'resolved' | 'unresolved' | 'no_response' | 'implicit_positive'; topic?: string; elapsed_ms?: number; sessionId?: string };
  chatbot_escalate: { questionText: string; sessionId?: string };
  share_modal_open: { trigger: 'manual' | 'prompt' };
  share_click: { method: 'kakao' | 'clipboard' | 'qr' };
  share_prompt_shown: Record<string, never>;
  share_prompt_action: { action: 'share' | 'later' | 'never' };
}
