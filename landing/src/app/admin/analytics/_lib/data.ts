// ── 대시보드 데이터 로딩 ──
//
// 예전에는 loadDashboardData() 하나가 18개 조회를 한꺼번에 기다렸고, 그게 다 끝나야
// 화면에 첫 글자가 나왔다. 지금은 탭별로 필요한 것만 불러온다(loadOverview / loadRetention
// / loadFeatures / loadRhythm / loadFriction / loadChatbot / loadEventLog).
// page.tsx 는 각 로더를 Suspense 로 감싸 먼저 끝난 섹션부터 그려낸다.
//
// 집계는 전부 migration 061 의 롤업(미리 계산해둔 표) 위에서 도는 analytics_*_v2 RPC 를 쓴다.
// 아직 061 을 적용하지 않은 환경에서는 RPC 가 404 → fetchRpc 가 빈 배열을 돌려주므로
// 해당 섹션만 "데이터 없음"으로 비고 화면은 정상 동작한다.

import { fetchRpc, fetchTable, signStorageUrls } from './supabase';
import type {
  AdoptionRow,
  ChatConfidenceRow,
  ChatDailyRow,
  ChatDepthRow,
  ChatEscalationRow,
  ChatFeedbackEscalationRow,
  ChatFeedbackStatsRow,
  ChatTopicRow,
  ChurnRow,
  CohortCellRow,
  ConversationMessage,
  DailyV2Row,
  EngagementTierRow,
  ErrorRateRow,
  ErrorSummaryRow,
  EventBreakdownRow,
  EventItem,
  FunnelStepRow,
  OverviewRow,
  PropRankingRow,
  RhythmRow,
  RollupStatusRow,
  SchoolProfileRow,
  SessionV2Row,
  StaffroomHealthRow,
  VersionAdoptionRow,
  WeeklyV2Row,
} from './types';

export interface DateRange {
  dateFrom: string | null;
  dateTo: string | null;
}

/** RPC 공통 기간 인자 — null 은 fetchRpc 가 생략 → 함수 DEFAULT NULL = 전체 기간 */
function rangeParams({ dateFrom, dateTo }: DateRange) {
  return { p_from: dateFrom, p_to: dateTo };
}

const ESCALATION_SCREENSHOTS_BUCKET = 'escalation-screenshots';

// ── 개요 탭 ──

export interface OverviewData {
  overview: OverviewRow | null;
  daily: DailyV2Row[];
  weekly: WeeklyV2Row[];
  sessions: SessionV2Row[];
  breakdown: EventBreakdownRow[];
}

export async function loadOverview(range: DateRange): Promise<OverviewData> {
  const p = rangeParams(range);
  const [overview, daily, weekly, sessions, breakdown] = await Promise.all([
    fetchRpc<OverviewRow>('analytics_overview_v2', p),
    fetchRpc<DailyV2Row>('analytics_daily_v2', p),
    fetchRpc<WeeklyV2Row>('analytics_weekly_v2', p),
    fetchRpc<SessionV2Row>('analytics_session_v2', p),
    fetchRpc<EventBreakdownRow>('analytics_event_breakdown_v2', { ...p, p_limit: 20 }),
  ]);
  return { overview: overview[0] ?? null, daily, weekly, sessions, breakdown };
}

// ── 정착·이탈 탭 ──

export interface RetentionData {
  funnel: FunnelStepRow[];
  cohort: CohortCellRow[];
  tiers: EngagementTierRow[];
  churn: ChurnRow[];
  overview: OverviewRow | null;
}

export async function loadRetention(range: DateRange): Promise<RetentionData> {
  const p = rangeParams(range);
  const [funnel, cohort, tiers, churn, overview] = await Promise.all([
    fetchRpc<FunnelStepRow>('analytics_onboarding_funnel_v2', p),
    fetchRpc<CohortCellRow>('analytics_cohort_weekly_v2', { p_weeks: 12 }),
    fetchRpc<EngagementTierRow>('analytics_engagement_tiers_v2', p),
    fetchRpc<ChurnRow>('analytics_churn_v2'),
    fetchRpc<OverviewRow>('analytics_overview_v2', p),
  ]);
  return { funnel, cohort, tiers, churn, overview: overview[0] ?? null };
}

// ── 기능 탭 ──

export interface FeatureData {
  tools: PropRankingRow[];
  pages: PropRankingRow[];
  discovery: PropRankingRow[];
  exports: PropRankingRow[];
  shares: PropRankingRow[];
  toolAdoption: AdoptionRow[];
  pageAdoption: AdoptionRow[];
}

export async function loadFeatures(range: DateRange): Promise<FeatureData> {
  const p = rangeParams(range);
  const [tools, pages, discovery, exportRows, shares, toolAdoption, pageAdoption] =
    await Promise.all([
      fetchRpc<PropRankingRow>('analytics_prop_ranking_v2', {
        ...p,
        p_event: 'tool_use',
        p_limit: 25,
      }),
      fetchRpc<PropRankingRow>('analytics_prop_ranking_v2', {
        ...p,
        p_event: 'page_view',
        p_limit: 25,
      }),
      fetchRpc<PropRankingRow>('analytics_prop_ranking_v2', {
        ...p,
        p_event: 'feature_discovery',
        p_limit: 20,
      }),
      fetchRpc<PropRankingRow>('analytics_prop_ranking_v2', {
        ...p,
        p_event: 'export',
        p_limit: 10,
      }),
      fetchRpc<PropRankingRow>('analytics_prop_ranking_v2', {
        ...p,
        p_event: 'share_click',
        p_limit: 10,
      }),
      fetchRpc<AdoptionRow>('analytics_adoption_v2', { ...p, p_event: 'tool_use', p_limit: 25 }),
      fetchRpc<AdoptionRow>('analytics_adoption_v2', { ...p, p_event: 'page_view', p_limit: 25 }),
    ]);
  return { tools, pages, discovery, exports: exportRows, shares, toolAdoption, pageAdoption };
}

// ── 리듬 탭 ──

export interface RhythmData {
  rhythm: RhythmRow[];
  daily: DailyV2Row[];
  school: SchoolProfileRow[];
  launchModes: PropRankingRow[];
}

export async function loadRhythm(range: DateRange): Promise<RhythmData> {
  const p = rangeParams(range);
  const [rhythm, daily, school, launchModes] = await Promise.all([
    fetchRpc<RhythmRow>('analytics_rhythm_v2', p),
    fetchRpc<DailyV2Row>('analytics_daily_v2', p),
    fetchRpc<SchoolProfileRow>('analytics_school_profile_v2'),
    fetchRpc<PropRankingRow>('analytics_prop_ranking_v2', {
      ...p,
      p_event: 'app_open',
      p_limit: 5,
    }),
  ]);
  return { rhythm, daily, school, launchModes };
}

// ── 마찰 탭 ──

export interface FrictionData {
  errors: ErrorSummaryRow[];
  errorRate: ErrorRateRow[];
  versions: VersionAdoptionRow[];
  feedbackStats: ChatFeedbackStatsRow[];
  feedbackEscalations: ChatFeedbackEscalationRow[];
}

export async function loadFriction(range: DateRange): Promise<FrictionData> {
  const p = rangeParams(range);
  const [errors, errorRate, versions, feedbackStats, feedbackEscalations] = await Promise.all([
    fetchRpc<ErrorSummaryRow>('analytics_error_summary_v2', { ...p, p_limit: 20 }),
    fetchRpc<ErrorRateRow>('analytics_error_rate_v2', p),
    fetchRpc<VersionAdoptionRow>('analytics_version_adoption_v2', { p_active_days: 30 }),
    // 피드백 해결률·에스컬레이션은 누적 품질 지표라 전체 기간 고정(뷰). 짧은 기간으로 자르면
    // 해결됨 0건처럼 오해를 부르므로 DateRangePicker 를 따르지 않는다.
    fetchTable<ChatFeedbackStatsRow>('chatbot_feedback_stats'),
    fetchTable<ChatFeedbackEscalationRow>('chatbot_feedback_escalations'),
  ]);
  return { errors, errorRate, versions, feedbackStats, feedbackEscalations };
}

// ── 챗봇 탭 ──

export interface ChatbotData {
  chatDaily: ChatDailyRow[];
  chatTopics: ChatTopicRow[];
  chatDepth: ChatDepthRow[];
  chatEscalations: ChatEscalationRow[];
  chatConfidence: ChatConfidenceRow[];
  chatConversations: ConversationMessage[];
  chatFeedbackStats: ChatFeedbackStatsRow[];
  chatFeedbackEscalations: ChatFeedbackEscalationRow[];
}

// 에스컬레이션 첨부 스크린샷(private 버킷) → 임시 서명 URL 일괄 발급 후 각 행에 부착.
// 개별 escalation 마다 서명 요청을 하지 않도록 전체 경로를 모아 한 번에 처리한다.
async function attachEscalationImageUrls(
  escalations: ChatEscalationRow[],
): Promise<ChatEscalationRow[]> {
  const allPaths = escalations.flatMap((e) => e.image_paths ?? []);
  if (allPaths.length === 0) return escalations;

  const urlMap = await signStorageUrls(ESCALATION_SCREENSHOTS_BUCKET, allPaths);
  return escalations.map((e) =>
    e.image_paths && e.image_paths.length > 0
      ? { ...e, image_urls: e.image_paths.map((p) => urlMap[p]).filter((u): u is string => !!u) }
      : e,
  );
}

// 챗봇 대화 세션별 조회 (질문-답변 쌍)
// 기간 선택을 created_at 으로 반영한다. 프리셋(7·30일 등)은 dateFrom(gte)만 설정하므로
// 정확히 동작하고, 전체(days=0)는 필터 없이 limit 까지 가져온다. (커스텀 종료일 dateTo 는
// 원본 타임스탬프 기준 lte 라 해당 일자 자정 이후가 제외되는 일(日) 단위 한계가 있다.)
//
// limit 은 1000 → 300. 대화 본문이 통째로 브라우저까지 실려 가던 게 이 화면에서 가장
// 무거운 전송량이었다. 300건이면 최근 흐름을 보는 용도로 충분하다.
function fetchChatConversations({ dateFrom, dateTo }: DateRange): Promise<ConversationMessage[]> {
  return fetchTable<ConversationMessage>('ssampin_conversations', {
    select: 'session_id,role,content,created_at,is_test,sources',
    order: 'created_at.desc',
    limit: 300,
    dateColumn: 'created_at',
    dateFrom,
    dateTo,
  });
}

export async function loadChatbot(range: DateRange): Promise<ChatbotData> {
  const p = rangeParams(range);
  const { dateFrom, dateTo } = range;

  const [
    chatDaily,
    chatTopics,
    chatDepth,
    chatEscalations,
    chatConfidence,
    chatConversations,
    chatFeedbackStats,
    chatFeedbackEscalations,
  ] = await Promise.all([
    fetchTable<ChatDailyRow>('chatbot_daily_stats', {
      order: 'date.desc',
      dateColumn: 'date',
      dateFrom,
      dateTo,
    }),
    fetchRpc<ChatTopicRow>('chatbot_popular_topics_range', p),
    fetchRpc<ChatDepthRow>('chatbot_depth_distribution_range', p),
    fetchTable<ChatEscalationRow>('chatbot_recent_escalations', { order: 'created_at_kst.desc' }),
    fetchRpc<ChatConfidenceRow>('chatbot_confidence_stats_range', p),
    fetchChatConversations(range),
    fetchTable<ChatFeedbackStatsRow>('chatbot_feedback_stats'),
    fetchTable<ChatFeedbackEscalationRow>('chatbot_feedback_escalations'),
  ]);

  return {
    chatDaily,
    chatTopics,
    chatDepth,
    chatEscalations: await attachEscalationImageUrls(chatEscalations),
    chatConfidence,
    chatConversations,
    chatFeedbackStats,
    chatFeedbackEscalations,
  };
}

// ── 이벤트 로그 탭 ──

/** 최근 이벤트는 "지금 무슨 일이 있었나"를 보는 용도라 캐시하지 않는다. */
export function loadEventLog(): Promise<EventItem[]> {
  return fetchTable<EventItem>('app_analytics', {
    select: 'event,properties,device_id,app_version,created_at',
    order: 'created_at.desc',
    limit: 100,
    revalidate: 0,
  });
}

// ── 롤업 갱신 상태 (헤더에 "언제 기준 수치인지" 표시) ──

export async function loadRollupStatus(): Promise<RollupStatusRow | null> {
  const rows = await fetchRpc<RollupStatusRow>('analytics_rollup_status', undefined, 60);
  return rows[0] ?? null;
}

// ── 온라인 교무실 (migration 064 · ADR-079) ──

/**
 * 교무실 실사용·건강 스냅샷.
 *
 * ★ range 를 받지 않는다 — 이건 기간 집계가 아니라 **지금 상태**다(EventsTab 과 같은 선례).
 * ★ revalidate 를 명시로 넘긴다. 기본 300초의 근거는 "061 롤업이 30분 주기라서"인데
 *   이 함수는 롤업을 쓰지 않는 라이브 질의라 그 근거를 상속하면 안 된다.
 * ★ rows[0] 만 돌려준다. SQL 쪽은 바깥 SELECT 에 FROM 이 없어 구조적으로 1행이지만,
 *   여기서 한 번 더 자른다 — 누가 함수를 부서 단위로 넓히면 2행째가 브라우저로
 *   직렬화조차 되지 않고, 그 사고가 로그에 남는다(ADR-079).
 */
export async function loadStaffroom(): Promise<StaffroomHealthRow | null> {
  const rows = await fetchRpc<StaffroomHealthRow>('staffroom_health_v1', undefined, 60);
  if (rows.length !== 1) {
    // 0행도 로그한다 — 환경변수가 없으면 fetchRpc 가 조용히 [] 를 돌려주는데,
    // 그때 화면은 "migration 064 를 확인하세요" 라는 엉뚱한 힌트를 띄우게 된다.
    console.error(
      `[Analytics] staffroom_health_v1 이 ${rows.length}행을 돌려줬다 — 항상 1행이어야 한다(ADR-079).`,
    );
  }
  return rows[0] ?? null;
}
