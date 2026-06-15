// ── 대시보드 데이터 로딩 오케스트레이션 ──
// page.tsx 안에 있던 fetchTotals / fetchRecentEvents / fetchChatConversations 와
// 18개 병렬 조회(Promise.all)를 여기로 옮긴다. 모든 조회는 단일 헬퍼(fetchTable)를
// 경유하며, 생성되는 REST 호출은 통합 이전과 동일하다.

import { fetchTable } from './supabase';
import type {
  ChatConfidenceRow,
  ChatDailyRow,
  ChatDepthRow,
  ChatEscalationRow,
  ChatFeedbackEscalationRow,
  ChatFeedbackStatsRow,
  ChatTopicRow,
  ConversationMessage,
  DailyActiveRow,
  EventItem,
  ExportFormatRow,
  RetentionRow,
  SessionDurationRow,
  ToolRankingRow,
  Totals,
  VersionRow,
  WeeklySummaryRow,
} from './types';

export interface DateRange {
  dateFrom: string | null;
  dateTo: string | null;
}

// 최근 이벤트 로그 조회 (app_analytics)
function fetchRecentEvents(): Promise<EventItem[]> {
  return fetchTable<EventItem>('app_analytics', {
    select: 'event,properties,device_id,app_version,created_at',
    order: 'created_at.desc',
    limit: 50,
  });
}

// 챗봇 대화 세션별 조회 (질문-답변 쌍)
function fetchChatConversations(): Promise<ConversationMessage[]> {
  return fetchTable<ConversationMessage>('ssampin_conversations', {
    select: 'session_id,role,content,created_at,is_test,sources',
    order: 'created_at.desc',
    limit: 1000,
  });
}

// 총 이벤트 수 / 고유 사용자 수 조회 (daily 뷰에서 합산)
async function fetchTotals(): Promise<Totals> {
  const daily = await fetchTable<{ dau: number; events: number }>('analytics_daily_active');
  const totalEvents = daily.reduce((sum, d) => sum + (d.events ?? 0), 0);

  const totalsView = await fetchTable<{ total_users: number; today_users: number }>(
    'analytics_total_users',
  );
  const totalUsers = totalsView[0]?.total_users ?? 0;
  const todayUsers = totalsView[0]?.today_users ?? 0;

  return { totalEvents, totalUsers, todayUsers };
}

export interface DashboardData {
  weekly: WeeklySummaryRow[];
  daily: DailyActiveRow[];
  tools: ToolRankingRow[];
  exports: ExportFormatRow[];
  sessions: SessionDurationRow[];
  recentEvents: EventItem[];
  totals: Totals;
  toolsWeekly: ToolRankingRow[];
  versions: VersionRow[];
  retention: RetentionRow[];
  chatDaily: ChatDailyRow[];
  chatTopics: ChatTopicRow[];
  chatDepth: ChatDepthRow[];
  chatEscalations: ChatEscalationRow[];
  chatConfidence: ChatConfidenceRow[];
  chatConversations: ConversationMessage[];
  chatFeedbackStats: ChatFeedbackStatsRow[];
  chatFeedbackEscalations: ChatFeedbackEscalationRow[];
}

/** 대시보드에 필요한 모든 데이터를 병렬로 불러온다. */
export async function loadDashboardData({ dateFrom, dateTo }: DateRange): Promise<DashboardData> {
  const [
    weekly,
    daily,
    tools,
    exports,
    sessions,
    recentEvents,
    totals,
    toolsWeekly,
    versions,
    retention,
    chatDaily,
    chatTopics,
    chatDepth,
    chatEscalations,
    chatConfidence,
    chatConversations,
    chatFeedbackStats,
    chatFeedbackEscalations,
  ] = await Promise.all([
    fetchTable<WeeklySummaryRow>('analytics_weekly_summary', {
      order: 'week_start.desc',
      dateColumn: 'week_start',
      dateFrom,
      dateTo,
    }),
    fetchTable<DailyActiveRow>('analytics_daily_active', {
      order: 'date.desc',
      dateColumn: 'date',
      dateFrom,
      dateTo,
    }),
    fetchTable<ToolRankingRow>('analytics_tool_ranking', { order: 'usage_count.desc' }),
    fetchTable<ExportFormatRow>('analytics_export_formats', { order: 'count.desc' }),
    fetchTable<SessionDurationRow>('analytics_session_duration', {
      order: 'date.desc',
      dateColumn: 'date',
      dateFrom,
      dateTo,
    }),
    fetchRecentEvents(),
    fetchTotals(),
    fetchTable<ToolRankingRow>('analytics_tool_ranking_weekly', { order: 'usage_count.desc' }),
    fetchTable<VersionRow>('analytics_version_distribution', { order: 'users.desc' }),
    fetchTable<RetentionRow>('analytics_retention', {
      order: 'cohort_date.desc',
      dateColumn: 'cohort_date',
      dateFrom,
      dateTo,
    }),
    fetchTable<ChatDailyRow>('chatbot_daily_stats', {
      order: 'date.desc',
      dateColumn: 'date',
      dateFrom,
      dateTo,
    }),
    fetchTable<ChatTopicRow>('chatbot_popular_topics', { order: 'mention_count.desc' }),
    fetchTable<ChatDepthRow>('chatbot_depth_distribution'),
    fetchTable<ChatEscalationRow>('chatbot_recent_escalations', { order: 'created_at_kst.desc' }),
    fetchTable<ChatConfidenceRow>('chatbot_confidence_stats'),
    fetchChatConversations(),
    fetchTable<ChatFeedbackStatsRow>('chatbot_feedback_stats'),
    fetchTable<ChatFeedbackEscalationRow>('chatbot_feedback_escalations'),
  ]);

  return {
    weekly,
    daily,
    tools,
    exports,
    sessions,
    recentEvents,
    totals,
    toolsWeekly,
    versions,
    retention,
    chatDaily,
    chatTopics,
    chatDepth,
    chatEscalations,
    chatConfidence,
    chatConversations,
    chatFeedbackStats,
    chatFeedbackEscalations,
  };
}
