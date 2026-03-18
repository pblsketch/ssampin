import { Metadata } from 'next';
import EventLog from './EventLog';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '쌤핀 Analytics',
  robots: 'noindex, nofollow',
};

// ── 한글 라벨 매핑 ──

const TOOL_LABELS: Record<string, string> = {
  timer: '타이머',
  random_picker: '랜덤뽑기',
  roulette: '룰렛',
  scoreboard: '점수판',
  traffic_light: '신호등',
  dice: '주사위',
  coin: '동전던지기',
  qr: 'QR코드',
  activity_symbol: '활동기호',
  vote: '투표',
  survey: '설문조사',
  wordcloud: '워드클라우드',
  seat_picker: '자리뽑기',
  assignment: '과제수합',
};

// ── 유틸리티 함수 ──

function formatDuration(seconds: number): string {
  if (seconds < 0 || !Number.isFinite(seconds)) return '-';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s}초`;
  return `${m}분 ${s}초`;
}

// Supabase REST API 직접 호출 (서버 사이드)
async function fetchView<T>(viewName: string, options?: { order?: string; limit?: number }): Promise<T[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return [];

  const limit = options?.limit ?? 60;
  let queryUrl = `${url}/rest/v1/${viewName}?select=*&limit=${limit}`;
  if (options?.order) {
    queryUrl += `&order=${options.order}`;
  }

  const res = await fetch(queryUrl, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    console.error(`[Analytics] View "${viewName}" fetch failed: ${res.status}`);
    return [];
  }
  return res.json();
}

// 최근 이벤트 로그 조회
async function fetchRecentEvents(): Promise<Array<{
  event: string;
  properties: Record<string, unknown>;
  device_id: string;
  app_version: string;
  created_at: string;
}>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return [];

  const res = await fetch(
    `${url}/rest/v1/app_analytics?select=event,properties,device_id,app_version,created_at&order=created_at.desc&limit=50`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    }
  );

  if (!res.ok) return [];
  return res.json();
}

// 총 이벤트 수 / 고유 사용자 수 조회 (daily 뷰에서 합산)
async function fetchTotals(): Promise<{ totalEvents: number; totalUsers: number; todayUsers: number }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return { totalEvents: 0, totalUsers: 0, todayUsers: 0 };

  const daily = await fetchView<{ dau: number; events: number }>('analytics_daily_active');
  const totalEvents = daily.reduce((sum, d) => sum + (d.events ?? 0), 0);

  const totalsView = await fetchView<{ total_users: number; today_users: number }>('analytics_total_users');
  const totalUsers = totalsView[0]?.total_users ?? 0;
  const todayUsers = totalsView[0]?.today_users ?? 0;

  return { totalEvents, totalUsers, todayUsers };
}

// 챗봇 대화 세션별 조회 (질문-답변 쌍)
async function fetchChatConversations(): Promise<Array<{
  session_id: string;
  role: string;
  content: string;
  created_at: string;
}>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];

  const res = await fetch(
    `${url}/rest/v1/ssampin_conversations?select=session_id,role,content,created_at&order=created_at.desc&limit=200`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    }
  );
  if (!res.ok) return [];
  return res.json();
}

export default async function AdminAnalyticsPage() {
  const [weekly, daily, tools, exports, sessions, recentEvents, totals, toolsWeekly, versions, retention, chatDaily, chatTopics, chatDepth, chatEscalations, chatConfidence, chatConversations] = await Promise.all([
    fetchView<{
      week_start: string;
      weekly_active_users: number;
      total_events: number;
      app_opens: number;
      seat_shuffles: number;
      tool_uses: number;
      exports: number;
      onboarding_completions: number;
      errors: number;
    }>('analytics_weekly_summary', { order: 'week_start.desc' }),
    fetchView<{ date: string; dau: number; events: number }>('analytics_daily_active', { order: 'date.desc' }),
    fetchView<{ tool_name: string; usage_count: number; unique_users: number; avg_per_user: number }>('analytics_tool_ranking', { order: 'usage_count.desc' }),
    fetchView<{ format: string; count: number; unique_users: number }>('analytics_export_formats', { order: 'count.desc' }),
    fetchView<{ date: string; sessions: number; avg_seconds: number; max_seconds: number; median_seconds: number }>('analytics_session_duration', { order: 'date.desc' }),
    fetchRecentEvents(),
    fetchTotals(),
    fetchView<{ tool_name: string; usage_count: number; unique_users: number; avg_per_user: number }>('analytics_tool_ranking_weekly', { order: 'usage_count.desc' }),
    fetchView<{ app_version: string; users: number; last_seen: string }>('analytics_version_distribution', { order: 'users.desc', limit: 50 }),
    fetchView<{ cohort_date: string; cohort_size: number; day1: number; day3: number; day7: number; day1_pct: number; day3_pct: number; day7_pct: number }>('analytics_retention', { order: 'cohort_date.desc' }),
    fetchView<{ date: string; user_messages: number; bot_responses: number; unique_sessions: number; avg_messages_per_session: number }>('chatbot_daily_stats', { order: 'date.desc' }),
    fetchView<{ keyword: string; mention_count: number; unique_sessions: number }>('chatbot_popular_topics', { order: 'mention_count.desc' }),
    fetchView<{ depth_bucket: string; session_count: number; pct: number }>('chatbot_depth_distribution'),
    fetchView<{ id: string; type: string; summary: string; user_message_preview: string; created_at_kst: string }>('chatbot_recent_escalations', { order: 'created_at_kst.desc' }),
    fetchView<{ confidence_level: string; response_count: number; pct: number }>('chatbot_confidence_stats'),
    fetchChatConversations(),
  ]);

  const hasData = weekly.length > 0 || daily.length > 0;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">쌤핀 Analytics</h1>
            <p className="text-gray-400 text-sm mt-1">
              마지막 업데이트: {new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
            </p>
          </div>
          <a
            href="/"
            className="text-sm text-gray-400 hover:text-white transition"
          >
            ← 메인으로
          </a>
        </div>

        {!hasData ? (
          <div className="text-center py-20 text-gray-500">
            <p className="text-lg">데이터가 없습니다</p>
            <p className="text-sm mt-2">
              SUPABASE_SERVICE_ROLE_KEY 환경 변수를 확인하세요.
            </p>
          </div>
        ) : (
          <>
            {/* 요약 카드 */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <SummaryCard label="총 이벤트" value={totals.totalEvents.toLocaleString()} />
              <SummaryCard label="총 사용자" value={totals.totalUsers.toString()} />
              <SummaryCard label="오늘 DAU" value={daily[0]?.dau?.toString() || '0'} />
              <SummaryCard
                label="주간 사용자"
                value={weekly[0]?.weekly_active_users?.toString() || '0'}
              />
              <SummaryCard
                label="평균 세션 (7일)"
                value={sessions.length > 0
                  ? formatDuration(
                      Math.round(
                        sessions.slice(0, 7).reduce((sum, s) => sum + (s.avg_seconds ?? 0) * (s.sessions ?? 1), 0) /
                        Math.max(1, sessions.slice(0, 7).reduce((sum, s) => sum + (s.sessions ?? 1), 0))
                      )
                    )
                  : '-'
                }
              />
            </div>

            {/* 일별 활성 사용자 (최근 14일) */}
            <Section title="일별 활성 사용자 (DAU)">
              <BarChart
                data={daily.slice(0, 14).reverse()}
                labelKey="date"
                valueKey="dau"
                formatLabel={(d: string) => d.slice(5)} // MM-DD
              />
            </Section>

            {/* 주간 요약 */}
            <Section title="주간 요약">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-800">
                      <th className="text-left py-2 px-3">주 시작</th>
                      <th className="text-right py-2 px-3">WAU</th>
                      <th className="text-right py-2 px-3">이벤트</th>
                      <th className="text-right py-2 px-3">앱 열기</th>
                      <th className="text-right py-2 px-3">좌석배치</th>
                      <th className="text-right py-2 px-3">도구</th>
                      <th className="text-right py-2 px-3">내보내기</th>
                      <th className="text-right py-2 px-3">온보딩</th>
                      <th className="text-right py-2 px-3">에러</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weekly.slice(0, 8).map((w) => (
                      <tr key={w.week_start} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                        <td className="py-2 px-3">{w.week_start}</td>
                        <td className="text-right py-2 px-3 font-medium">{w.weekly_active_users}</td>
                        <td className="text-right py-2 px-3">{w.total_events}</td>
                        <td className="text-right py-2 px-3">{w.app_opens}</td>
                        <td className="text-right py-2 px-3">{w.seat_shuffles}</td>
                        <td className="text-right py-2 px-3">{w.tool_uses}</td>
                        <td className="text-right py-2 px-3">{w.exports}</td>
                        <td className="text-right py-2 px-3">{w.onboarding_completions}</td>
                        <td className="text-right py-2 px-3 text-red-400">{w.errors}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            {/* 도구 사용 순위 (주간) + 내보내기 형식 */}
            <div className="grid md:grid-cols-2 gap-6">
              <Section title="도구 사용 순위 (이번 주)">
                {toolsWeekly.length === 0 ? (
                  <p className="text-gray-500 text-sm">데이터 없음</p>
                ) : (
                  <div className="space-y-2">
                    {toolsWeekly.map((t) => (
                      <div key={t.tool_name} className="flex items-center gap-3">
                        <span className="w-28 text-sm truncate" title={t.tool_name}>
                          {TOOL_LABELS[t.tool_name] || t.tool_name}
                        </span>
                        <div className="flex-1 bg-gray-800 rounded-full h-5 overflow-hidden">
                          <div
                            className="bg-blue-500 h-full rounded-full flex items-center justify-end pr-2 text-xs font-medium"
                            style={{
                              width: `${Math.min(100, (t.usage_count / Math.max(...toolsWeekly.map(x => x.usage_count))) * 100)}%`,
                              minWidth: '2rem',
                            }}
                          >
                            {t.usage_count}
                          </div>
                        </div>
                        <span className="text-xs text-gray-400 w-16 text-right">
                          {t.unique_users}명
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <details className="mt-4">
                  <summary className="text-sm text-gray-400 cursor-pointer hover:text-gray-200">
                    전체 기간 보기
                  </summary>
                  <div className="mt-3 space-y-2">
                    {tools.map((t) => (
                      <div key={t.tool_name} className="flex items-center gap-3">
                        <span className="w-28 text-sm truncate" title={t.tool_name}>
                          {TOOL_LABELS[t.tool_name] || t.tool_name}
                        </span>
                        <div className="flex-1 bg-gray-800 rounded-full h-5 overflow-hidden">
                          <div
                            className="bg-blue-500/60 h-full rounded-full flex items-center justify-end pr-2 text-xs font-medium"
                            style={{
                              width: `${Math.min(100, (t.usage_count / Math.max(...tools.map(x => x.usage_count))) * 100)}%`,
                              minWidth: '2rem',
                            }}
                          >
                            {t.usage_count}
                          </div>
                        </div>
                        <span className="text-xs text-gray-400 w-16 text-right">
                          {t.unique_users}명
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              </Section>

              <Section title="내보내기 형식">
                {exports.length === 0 ? (
                  <p className="text-gray-500 text-sm">데이터 없음</p>
                ) : (
                  <div className="space-y-2">
                    {exports.map((e) => (
                      <div key={e.format} className="flex items-center gap-3">
                        <span className="w-20 text-sm font-mono">{e.format}</span>
                        <div className="flex-1 bg-gray-800 rounded-full h-5 overflow-hidden">
                          <div
                            className="bg-amber-500 h-full rounded-full flex items-center justify-end pr-2 text-xs font-medium"
                            style={{
                              width: `${Math.min(100, (e.count / Math.max(...exports.map(x => x.count))) * 100)}%`,
                              minWidth: '2rem',
                            }}
                          >
                            {e.count}
                          </div>
                        </div>
                        <span className="text-xs text-gray-400 w-16 text-right">
                          {e.unique_users}명
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            </div>

            {/* 세션 시간 통계 */}
            <Section title="세션 시간 통계 (최근 14일)">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-800">
                      <th className="text-left py-2 px-3">날짜</th>
                      <th className="text-right py-2 px-3">세션 수</th>
                      <th className="text-right py-2 px-3">평균</th>
                      <th className="text-right py-2 px-3">중간값</th>
                      <th className="text-right py-2 px-3">최대</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.slice(0, 14).map((s) => (
                      <tr key={s.date} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                        <td className="py-2 px-3">{s.date}</td>
                        <td className="text-right py-2 px-3">{s.sessions}</td>
                        <td className="text-right py-2 px-3">{formatDuration(s.avg_seconds)}</td>
                        <td className="text-right py-2 px-3">{formatDuration(s.median_seconds)}</td>
                        <td className="text-right py-2 px-3">{formatDuration(s.max_seconds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            {/* 버전 분포 */}
            <Section title="버전 분포 (최근 90일)">
              {versions.length === 0 ? (
                <p className="text-gray-500 text-sm">데이터 없음</p>
              ) : (
                <div className="space-y-2">
                  {versions.map((v) => (
                    <div key={v.app_version} className="flex items-center gap-3">
                      <span className={`w-16 text-sm font-mono ${v.app_version === versions[0]?.app_version ? 'text-green-400' : 'text-gray-400'}`}>
                        v{v.app_version}
                      </span>
                      <div className="flex-1 bg-gray-800 rounded-full h-5 overflow-hidden">
                        <div
                          className={`h-full rounded-full flex items-center justify-end pr-2 text-xs font-medium ${
                            v.app_version === versions[0]?.app_version ? 'bg-green-500' : 'bg-gray-600'
                          }`}
                          style={{
                            width: `${Math.min(100, (v.users / Math.max(...versions.map(x => x.users))) * 100)}%`,
                            minWidth: '2rem',
                          }}
                        >
                          {v.users}명
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* 리텐션 (코호트 분석) */}
            <Section title="리텐션 (코호트 분석)">
              <p className="text-gray-400 text-xs mb-4">
                특정 날짜에 처음 앱을 사용한 사용자(코호트)가 이후에도 다시 사용하는지 추적합니다.
                Day 1 = 첫 사용 다음날 재방문율, Day 3 = 3일 후, Day 7 = 7일 후 재방문율.
              </p>
              {retention.length === 0 ? (
                <p className="text-gray-500 text-sm">데이터 없음</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-400 border-b border-gray-800">
                        <th className="text-left py-2 px-3">코호트 날짜</th>
                        <th className="text-right py-2 px-3">신규</th>
                        <th className="text-right py-2 px-3">Day 1</th>
                        <th className="text-right py-2 px-3">Day 3</th>
                        <th className="text-right py-2 px-3">Day 7</th>
                      </tr>
                    </thead>
                    <tbody>
                      {retention.slice(0, 14).map((r) => (
                        <tr key={r.cohort_date} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                          <td className="py-2 px-3">{r.cohort_date}</td>
                          <td className="text-right py-2 px-3 font-medium">{r.cohort_size}명</td>
                          <td className="text-right py-2 px-3">
                            <span className={r.day1_pct > 50 ? 'text-green-400' : r.day1_pct > 20 ? 'text-yellow-400' : 'text-red-400'}>
                              {r.day1_pct}%
                            </span>
                            <span className="text-gray-600 ml-1">({r.day1})</span>
                          </td>
                          <td className="text-right py-2 px-3">
                            <span className={r.day3_pct > 30 ? 'text-green-400' : r.day3_pct > 10 ? 'text-yellow-400' : 'text-red-400'}>
                              {r.day3_pct}%
                            </span>
                            <span className="text-gray-600 ml-1">({r.day3})</span>
                          </td>
                          <td className="text-right py-2 px-3">
                            <span className={r.day7_pct > 20 ? 'text-green-400' : r.day7_pct > 5 ? 'text-yellow-400' : 'text-red-400'}>
                              {r.day7_pct}%
                            </span>
                            <span className="text-gray-600 ml-1">({r.day7})</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            {/* AI 챗봇 분석 */}
            <Section title="AI 챗봇 분석">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <SummaryCard
                  label="총 세션"
                  value={chatDaily.reduce((s, d) => s + d.unique_sessions, 0).toLocaleString()}
                />
                <SummaryCard
                  label="총 질문"
                  value={chatDaily.reduce((s, d) => s + d.user_messages, 0).toLocaleString()}
                />
                <SummaryCard
                  label="총 응답"
                  value={chatDaily.reduce((s, d) => s + d.bot_responses, 0).toLocaleString()}
                />
                <SummaryCard
                  label="평균 질문/세션"
                  value={chatDaily[0]?.avg_messages_per_session?.toString() || '-'}
                />
              </div>

              {/* 일별 챗봇 사용량 */}
              {chatDaily.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm text-gray-400 mb-3">일별 사용량</h3>
                  <BarChart
                    data={chatDaily.slice(0, 14).reverse()}
                    labelKey="date"
                    valueKey="user_messages"
                    formatLabel={(d: string) => d.slice(5)}
                  />
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-6">
                {/* 인기 주제 */}
                <div>
                  <h3 className="text-sm text-gray-400 mb-3">자주 묻는 주제</h3>
                  {chatTopics.length === 0 ? (
                    <p className="text-gray-500 text-sm">데이터 없음</p>
                  ) : (
                    <div className="space-y-2">
                      {chatTopics.slice(0, 10).map((t) => (
                        <div key={t.keyword} className="flex items-center gap-3">
                          <span className="w-20 text-sm truncate">{t.keyword}</span>
                          <div className="flex-1 bg-gray-800 rounded-full h-4 overflow-hidden">
                            <div
                              className="bg-purple-500 h-full rounded-full"
                              style={{ width: `${(t.mention_count / Math.max(...chatTopics.map(x => x.mention_count))) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-400 w-12 text-right">{t.mention_count}회</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 대화 깊이 + 답변 신뢰도 */}
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm text-gray-400 mb-3">대화 깊이</h3>
                    {chatDepth.length === 0 ? (
                      <p className="text-gray-500 text-sm">데이터 없음</p>
                    ) : (
                      <div className="flex gap-4">
                        {chatDepth.map((d) => (
                          <div key={d.depth_bucket} className="text-center flex-1">
                            <div className="text-lg font-bold">{d.session_count}</div>
                            <div className="text-xs text-gray-400">{d.depth_bucket}</div>
                            <div className="text-xs text-gray-500">{d.pct}%</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="text-sm text-gray-400 mb-3">답변 신뢰도 (소스 기반)</h3>
                    {chatConfidence.length === 0 ? (
                      <p className="text-gray-500 text-sm">데이터 없음</p>
                    ) : (
                      <div className="space-y-2">
                        {chatConfidence.map((c) => (
                          <div key={c.confidence_level} className="flex items-center gap-3">
                            <span className="w-36 text-xs truncate">{c.confidence_level}</span>
                            <div className="flex-1 bg-gray-800 rounded-full h-4 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  c.confidence_level.includes('높음') ? 'bg-green-500' :
                                  c.confidence_level.includes('보통') ? 'bg-yellow-500' :
                                  'bg-red-500'
                                }`}
                                style={{ width: `${c.pct}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-400 w-16 text-right">{c.response_count}건 ({c.pct}%)</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 최근 버그/기능 요청 */}
              {chatEscalations.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm text-gray-400 mb-3">최근 버그/기능 요청</h3>
                  <div className="space-y-2">
                    {chatEscalations.slice(0, 5).map((e) => (
                      <div key={e.id} className="bg-gray-800/50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            e.type === 'bug' ? 'bg-red-500/20 text-red-400' :
                            e.type === 'feature' ? 'bg-blue-500/20 text-blue-400' :
                            'bg-gray-500/20 text-gray-400'
                          }`}>
                            {e.type === 'bug' ? 'BUG' : e.type === 'feature' ? 'FEATURE' : e.type}
                          </span>
                          <span className="text-xs text-gray-500">{e.created_at_kst}</span>
                        </div>
                        <p className="text-sm text-gray-300">{e.summary}</p>
                        {e.user_message_preview && (
                          <p className="text-xs text-gray-500 mt-1">{e.user_message_preview}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Section>

            {/* 챗봇 대화 원문 */}
            <Section title="챗봇 대화 원문 (최근)">
              {chatConversations.length === 0 ? (
                <p className="text-gray-500 text-sm">데이터 없음</p>
              ) : (
                <div className="space-y-4 max-h-[600px] overflow-y-auto">
                  {(() => {
                    // 세션별로 그룹핑
                    const sessionMap = new Map<string, typeof chatConversations>();
                    for (const msg of chatConversations) {
                      const existing = sessionMap.get(msg.session_id) ?? [];
                      existing.push(msg);
                      sessionMap.set(msg.session_id, existing);
                    }
                    // 최신 세션 순 정렬, 각 세션 내부는 시간순
                    const sessions = Array.from(sessionMap.entries())
                      .sort((a, b) => {
                        const aTime = a[1][a[1].length - 1]?.created_at ?? '';
                        const bTime = b[1][b[1].length - 1]?.created_at ?? '';
                        return bTime.localeCompare(aTime);
                      })
                      .slice(0, 30);

                    return sessions.map(([sessionId, messages]) => {
                      const sorted = [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
                      const firstTime = sorted[0]?.created_at ?? '';
                      const dateStr = firstTime
                        ? new Date(firstTime).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : '';
                      return (
                        <details key={sessionId} className="bg-gray-800/50 rounded-lg">
                          <summary className="px-4 py-2 cursor-pointer hover:bg-gray-800 rounded-lg flex items-center gap-3">
                            <span className="text-xs text-gray-500">{dateStr}</span>
                            <span className="text-sm text-gray-300 truncate flex-1">
                              {sorted.find(m => m.role === 'user')?.content.slice(0, 80) ?? '(empty)'}
                            </span>
                            <span className="text-xs text-gray-500">{sorted.filter(m => m.role === 'user').length}턴</span>
                          </summary>
                          <div className="px-4 pb-3 pt-1 space-y-2">
                            {sorted.map((msg, i) => (
                              <div key={i} className={`text-sm ${msg.role === 'user' ? 'text-blue-300' : 'text-gray-400'}`}>
                                <span className="text-xs font-medium mr-2">
                                  {msg.role === 'user' ? 'Q' : 'A'}
                                </span>
                                <span className="whitespace-pre-wrap break-words">
                                  {msg.role === 'assistant' ? msg.content.slice(0, 300) + (msg.content.length > 300 ? '...' : '') : msg.content}
                                </span>
                              </div>
                            ))}
                          </div>
                        </details>
                      );
                    });
                  })()}
                </div>
              )}
            </Section>

            {/* 최근 이벤트 로그 (Client Component) */}
            <Section title="최근 이벤트">
              <EventLog events={recentEvents} />
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

// ── 하위 컴포넌트들 ──

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-gray-400 text-xs">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h2 className="text-lg font-semibold mb-4">{title}</h2>
      {children}
    </div>
  );
}

function BarChart<T extends Record<string, unknown>>({
  data,
  labelKey,
  valueKey,
  formatLabel,
}: {
  data: T[];
  labelKey: keyof T;
  valueKey: keyof T;
  formatLabel?: (v: string) => string;
}) {
  if (data.length === 0) return <p className="text-gray-500 text-sm">데이터 없음</p>;

  const maxVal = Math.max(...data.map((d) => Number(d[valueKey]) || 0));
  // 그리드 라인 값 계산 (4등분)
  const gridLines = maxVal > 0
    ? [0.25, 0.5, 0.75, 1].map((ratio) => Math.round(maxVal * ratio))
    : [];

  return (
    <div className={`relative ${data.length <= 5 ? 'max-w-lg' : 'w-full'}`}>
      {/* 그리드 라인 — bar 영역에 맞춰 위치 */}
      <div className="absolute left-0 right-0 pointer-events-none" style={{ top: '1.5rem', bottom: '1.25rem' }}>
        {gridLines.map((val, i) => (
          <div
            key={i}
            className="absolute left-0 right-0 border-t border-gray-700/40"
            style={{ bottom: `${((i + 1) / 4) * 100}%` }}
          >
            <span className="absolute -top-3 -left-1 text-[10px] text-gray-600">
              {val}
            </span>
          </div>
        ))}
      </div>
      {/* items-stretch(기본값)로 자식이 h-48 전체를 차지 → bar height % 가 정상 동작 */}
      <div className="flex gap-2 h-48 relative z-10">
        {data.map((d, i) => {
          const val = Number(d[valueKey]) || 0;
          const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
          const label = String(d[labelKey]);
          return (
            <div key={i} className="flex-1 min-w-[2.5rem] flex flex-col items-center gap-1 group">
              {/* 값 라벨 */}
              <div className="relative shrink-0">
                <span className="text-xs text-gray-300 group-hover:hidden">{val}</span>
                <span className="text-xs text-blue-300 font-medium hidden group-hover:inline">
                  {val}
                </span>
              </div>
              {/* 바 영역 — flex-1로 남은 공간을 차지하여 height %의 기준이 됨 */}
              <div className="w-full flex-1 flex items-end">
                <div
                  className="w-full bg-blue-500 rounded-t transition-all group-hover:bg-blue-400 cursor-default"
                  style={{ height: `${Math.max(pct, 3)}%` }}
                  title={`${formatLabel ? formatLabel(label) : label}: ${val}`}
                />
              </div>
              {/* 날짜 라벨 */}
              <span className="text-[10px] text-gray-500 group-hover:text-gray-300 truncate w-full text-center transition-colors shrink-0">
                {formatLabel ? formatLabel(label) : label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
