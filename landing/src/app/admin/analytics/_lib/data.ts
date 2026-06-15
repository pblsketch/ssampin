// ── 대시보드 데이터 로딩 오케스트레이션 ──
// page.tsx 안에 있던 fetchTotals / fetchRecentEvents / fetchChatConversations 와
// 병렬 조회(Promise.all)를 여기로 모은다.
// 날짜 컬럼이 있는 집계는 뷰(fetchTable)에 gte/lte 로 필터하고, 뷰로는 임의 기간 집계가
// 불가능한 지표(도구순위·내보내기·버전·인기주제·대화깊이·신뢰도·피드백)는 기간 파라미터
// RPC 함수(fetchRpc, migration 038)로 조회해 DateRangePicker 선택을 반영한다.

import { fetchRpc, fetchTable } from './supabase';
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
// 기간 선택을 created_at 으로 반영한다. 프리셋(7·30일 등)은 dateFrom(gte)만 설정하므로
// 정확히 동작하고, 전체(days=0)는 필터 없이 limit 까지 가져온다. (커스텀 종료일 dateTo 는
// 원본 타임스탬프 기준 lte 라 해당 일자 자정 이후가 제외되는 일(日) 단위 한계가 있다.)
function fetchChatConversations({ dateFrom, dateTo }: DateRange): Promise<ConversationMessage[]> {
  return fetchTable<ConversationMessage>('ssampin_conversations', {
    select: 'session_id,role,content,created_at,is_test,sources',
    order: 'created_at.desc',
    limit: 1000,
    dateColumn: 'created_at',
    dateFrom,
    dateTo,
  });
}

// 총 이벤트 수 / 고유 사용자 수 조회 (daily 뷰에서 합산, 전체 기간 누적값)
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
  /** 전체 기간 도구 순위 (상세 '전체 기간 보기'용, 기간 무관) */
  tools: ToolRankingRow[];
  exports: ExportFormatRow[];
  sessions: SessionDurationRow[];
  recentEvents: EventItem[];
  totals: Totals;
  /** 선택 기간 도구 순위 (RPC, DateRangePicker 반영) */
  toolsRanged: ToolRankingRow[];
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
  // 기간 파라미터 RPC 공통 인자 (null 은 fetchRpc 가 생략 → 함수 DEFAULT NULL = 전체)
  const range = { p_from: dateFrom, p_to: dateTo };

  const [
    weekly,
    daily,
    tools,
    exports,
    sessions,
    recentEvents,
    totals,
    toolsRanged,
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
    fetchRpc<ExportFormatRow>('analytics_export_formats_range', range),
    fetchTable<SessionDurationRow>('analytics_session_duration', {
      order: 'date.desc',
      dateColumn: 'date',
      dateFrom,
      dateTo,
    }),
    fetchRecentEvents(),
    fetchTotals(),
    fetchRpc<ToolRankingRow>('analytics_tool_ranking_range', range),
    fetchRpc<VersionRow>('analytics_version_distribution_range', range),
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
    fetchRpc<ChatTopicRow>('chatbot_popular_topics_range', range),
    fetchRpc<ChatDepthRow>('chatbot_depth_distribution_range', range),
    fetchTable<ChatEscalationRow>('chatbot_recent_escalations', { order: 'created_at_kst.desc' }),
    fetchRpc<ChatConfidenceRow>('chatbot_confidence_stats_range', range),
    fetchChatConversations({ dateFrom, dateTo }),
    fetchRpc<ChatFeedbackStatsRow>('chatbot_feedback_stats_range', range),
    fetchRpc<ChatFeedbackEscalationRow>('chatbot_feedback_escalations_range', range),
  ]);

  return {
    weekly,
    daily,
    tools,
    exports,
    sessions,
    recentEvents,
    totals,
    toolsRanged,
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
