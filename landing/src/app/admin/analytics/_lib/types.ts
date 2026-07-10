// ── 분석 뷰 행(row) 타입 (단일 소스) ──
// page.tsx 의 Promise.all 안에 인라인으로 흩어져 있던 Supabase 뷰 행 타입과,
// 자식 컴포넌트들이 각자 다시 선언하던 인터페이스를 한곳으로 모은다.

export interface WeeklySummaryRow {
  week_start: string;
  weekly_active_users: number;
  total_events: number;
  app_opens: number;
  seat_shuffles: number;
  tool_uses: number;
  exports: number;
  onboarding_completions: number;
  errors: number;
}

export interface DailyActiveRow {
  date: string;
  dau: number;
  events: number;
}

export interface ToolRankingRow {
  tool_name: string;
  usage_count: number;
  unique_users: number;
  avg_per_user: number;
}

export interface ExportFormatRow {
  format: string;
  count: number;
  unique_users: number;
}

export interface SessionDurationRow {
  date: string;
  sessions: number;
  avg_seconds: number;
  max_seconds: number;
  median_seconds: number;
}

export interface VersionRow {
  app_version: string;
  users: number;
  last_seen: string;
}

export interface RetentionRow {
  cohort_date: string;
  cohort_size: number;
  day1: number;
  day3: number;
  day7: number;
  day1_pct: number;
  day3_pct: number;
  day7_pct: number;
}

export interface ChatDailyRow {
  date: string;
  user_messages: number;
  bot_responses: number;
  unique_sessions: number;
  avg_messages_per_session: number;
}

export interface ChatTopicRow {
  keyword: string;
  mention_count: number;
  unique_sessions: number;
}

export interface ChatDepthRow {
  depth_bucket: string;
  session_count: number;
  pct: number;
}

/** 에스컬레이션 신고 시점에 저장된 대화 맥락 한 줄 */
export interface EscalationMessage {
  role: string;
  content: string;
  created_at: string;
}

export interface ChatEscalationRow {
  id: string;
  type: string;
  summary: string;
  user_message_preview: string;
  /** 신고 본문 전문 (migration 043 뷰가 노출, 접힌 미리보기와 달리 잘리지 않음) */
  user_message?: string;
  created_at_kst: string;
  session_id: string;
  /** 신고 시점 대화 맥락 (ssampin-escalate 가 적재, 최근 메시지 순서대로) */
  conversation_context: EscalationMessage[] | null;
  /** 첨부 스크린샷의 escalation-screenshots 버킷 내 경로 (ssampin-escalate 가 적재) */
  image_paths: string[] | null;
  /** image_paths 로 서버에서 발급한 임시 서명 URL (data.ts 가 채움, private 버킷이라 뷰 자체엔 없음) */
  image_urls?: string[];
}

export interface ChatConfidenceRow {
  confidence_level: string;
  response_count: number;
  pct: number;
}

export interface ChatFeedbackStatsRow {
  resolved_count: number;
  unresolved_count: number;
  no_response_count: number;
  total_count: number;
  resolution_rate: number;
  responded_total: number;
}

export interface ChatFeedbackEscalationRow {
  escalation_count: number;
}

/** 최근 이벤트 로그 한 건 (app_analytics 테이블) — EventLog 가 소비 */
export interface EventItem {
  event: string;
  properties: Record<string, unknown>;
  device_id: string;
  app_version: string;
  created_at: string;
}

/** 챗봇 대화 메시지 한 건 (ssampin_conversations 테이블) — ChatConversations 가 소비 */
export interface ConversationMessage {
  session_id: string;
  role: string;
  content: string;
  created_at: string;
  is_test: boolean;
  sources: string[] | null;
}

/** 상단 요약 카드용 합계 */
export interface Totals {
  totalEvents: number;
  totalUsers: number;
  todayUsers: number;
}
