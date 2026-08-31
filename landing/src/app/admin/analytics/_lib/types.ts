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

// ── migration 061 롤업 기반 신규 지표 행 타입 ──
// 모두 analytics_*_v2 RPC 의 반환 형태와 1:1 로 맞춘다.
// PostgREST 는 bigint/numeric 을 JSON number 로 내려주므로 number 로 받는다.

/** 한눈 요약 (analytics_overview_v2) */
export interface OverviewRow {
  total_users: number;
  active_users: number;
  new_users: number;
  returning_users: number;
  total_events: number;
  avg_dau: number | null;
  wau: number;
  mau: number;
  /** WAU/MAU — 한 달에 한 번 온 분 중 이번 주에도 온 비율. 습관화 정도. */
  stickiness: number | null;
  onboarded_users: number;
  today_users: number;
}

/** 일별 활성 — 신규/재방문 분리 (analytics_daily_v2) */
export interface DailyV2Row {
  d: string;
  dau: number;
  new_users: number;
  returning_users: number;
  events: number;
}

/** 주간 요약 (analytics_weekly_v2) */
export interface WeeklyV2Row {
  week_start: string;
  weekly_active_users: number;
  new_users: number;
  total_events: number;
  app_opens: number;
  tool_uses: number;
  exports: number;
  onboarding_completions: number;
  errors: number;
}

/** 속성값 순위 — 도구/화면/기능발견/내보내기 공용 (analytics_prop_ranking_v2) */
export interface PropRankingRow {
  prop: string;
  uses: number;
  users: number;
  uses_per_user: number | null;
}

/** 기능 채택·재사용 (analytics_adoption_v2) */
export interface AdoptionRow {
  prop: string;
  reach_users: number;
  reach_pct: number | null;
  repeat_users: number;
  repeat_pct: number | null;
  once_only_users: number;
  once_only_pct: number | null;
  sticky_users: number;
  sticky_pct: number | null;
  avg_uses: number | null;
}

/** 주간 코호트 리텐션 한 칸 (analytics_cohort_weekly_v2) */
export interface CohortCellRow {
  cohort_week: string;
  cohort_size: number;
  week_offset: number;
  retained: number;
  pct: number | null;
}

/** 사용 강도 등급 (analytics_engagement_tiers_v2) */
export interface EngagementTierRow {
  tier: string;
  tier_order: number;
  devices: number;
  pct: number | null;
  avg_events: number | null;
}

/** 이탈 신호 (analytics_churn_v2) */
export interface ChurnRow {
  bucket: string;
  bucket_order: number;
  devices: number;
  engaged_devices: number;
  pct: number | null;
}

/** 요일 × 시간대 (analytics_rhythm_v2) */
export interface RhythmRow {
  dow: number;
  hour: number;
  events: number;
  avg_users: number | null;
  day_count: number;
}

/** 온보딩 퍼널 (analytics_onboarding_funnel_v2) */
export interface FunnelStepRow {
  step: string;
  step_order: number;
  devices: number;
  pct: number | null;
  drop_from_prev: number | null;
}

/** 오류 요약 (analytics_error_summary_v2) */
export interface ErrorSummaryRow {
  component: string;
  message: string;
  occurrences: number;
  users: number;
  last_date: string;
}

/** 오류 발생률 추이 (analytics_error_rate_v2) */
export interface ErrorRateRow {
  d: string;
  error_events: number;
  affected_users: number;
  active_users: number;
  affected_pct: number | null;
}

/** 버전 잔류 (analytics_version_adoption_v2) */
export interface VersionAdoptionRow {
  app_version: string;
  users: number;
  pct: number | null;
  last_seen: string;
  is_current: boolean;
}

/** 학교급·지역 분포 (analytics_school_profile_v2) */
export interface SchoolProfileRow {
  dimension: 'level' | 'region';
  label: string;
  users: number;
  pct: number | null;
}

/** 세션 길이 (analytics_session_v2) */
export interface SessionV2Row {
  d: string;
  sessions: number;
  avg_seconds: number;
  median_seconds: number;
  p90_seconds: number;
  max_seconds: number;
}

/** 이벤트 구성 (analytics_event_breakdown_v2) */
export interface EventBreakdownRow {
  event: string;
  events: number;
  users: number;
}

/** 롤업 갱신 상태 (analytics_rollup_status) */
export interface RollupStatusRow {
  refreshed_at: string | null;
  duration_ms: number | null;
  last_error: string | null;
  stale_minutes: number | null;
}

/**
 * 온라인 교무실 건강·사용 스냅샷 (staffroom_health_v1, migration 064 · ADR-079)
 *
 * ★ 여기에 부서 이름·교사 이메일·글 제목이 들어오면 안 된다. 부서 id 조차 없다.
 *   SQL 의 RETURNS TABLE 19칸과 **정확히 짝**이어야 하고, 그 짝은
 *   staffroomHealthPrivacy.meta.test.ts 가 지킨다. 한쪽만 넓히면 빨간불이 난다.
 */
export interface StaffroomHealthRow {
  generated_at: string;
  departments_total: number;
  dept_members_0: number;
  dept_members_1: number;
  dept_members_2_5: number;
  dept_members_6_10: number;
  dept_members_11_30: number;
  dept_members_31_up: number;
  posts_total: number;
  comments_total: number;
  files_total: number;
  files_bytes: number;
  /** 활동이 0건이면 NULL */
  last_activity_date: string | null;
  depts_no_activity: number;
  health_ok: number;
  health_broken: number;
  health_quiet: number;
  health_unlinked: number;
  /** 끊긴 적이 없으면 NULL — 계측이 살아 있는지 보는 유일한 창 */
  last_broken_at: string | null;
}
