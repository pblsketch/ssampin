import { Metadata } from 'next';

export const metadata: Metadata = {
  title: '쌤핀 Analytics',
  robots: 'noindex, nofollow',
};

// Supabase REST API 직접 호출 (서버 사이드)
async function fetchView<T>(viewName: string): Promise<T[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return [];

  const res = await fetch(
    `${url}/rest/v1/${viewName}?select=*&limit=30`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      next: { revalidate: 300 }, // 5분 캐시
    }
  );

  if (!res.ok) return [];
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
    `${url}/rest/v1/app_analytics?select=event,properties,device_id,app_version,created_at&order=created_at.desc&limit=30`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      next: { revalidate: 60 }, // 1분 캐시
    }
  );

  if (!res.ok) return [];
  return res.json();
}

// 총 이벤트 수 / 고유 사용자 수 조회
async function fetchTotals(): Promise<{ totalEvents: number; uniqueDevices: number }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return { totalEvents: 0, uniqueDevices: 0 };

  // 총 이벤트 수
  const countRes = await fetch(
    `${url}/rest/v1/app_analytics?select=id&head=true`,
    {
      method: 'HEAD',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: 'count=exact',
      },
      next: { revalidate: 300 },
    }
  );
  const totalEvents = parseInt(countRes.headers.get('content-range')?.split('/')[1] || '0', 10);

  // 고유 기기 수 - daily active에서 최근 30일 합산
  const dailyData = await fetchView<{ dau: number }>('analytics_daily_active');
  const uniqueDevices = dailyData.length > 0 ? Math.max(...dailyData.map(d => d.dau)) : 0;

  return { totalEvents, uniqueDevices };
}

export default async function AdminAnalyticsPage() {
  const [weekly, daily, tools, exports, sessions, recentEvents, totals] = await Promise.all([
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
    }>('analytics_weekly_summary'),
    fetchView<{ date: string; dau: number; events: number }>('analytics_daily_active'),
    fetchView<{ tool_name: string; usage_count: number; unique_users: number; avg_per_user: number }>('analytics_tool_ranking'),
    fetchView<{ format: string; count: number; unique_users: number }>('analytics_export_formats'),
    fetchView<{ date: string; sessions: number; avg_seconds: number; max_seconds: number; median_seconds: number }>('analytics_session_duration'),
    fetchRecentEvents(),
    fetchTotals(),
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <SummaryCard label="총 이벤트" value={totals.totalEvents.toLocaleString()} />
              <SummaryCard label="오늘 DAU" value={daily[0]?.dau?.toString() || '0'} />
              <SummaryCard
                label="주간 사용자"
                value={weekly[0]?.weekly_active_users?.toString() || '0'}
              />
              <SummaryCard
                label="평균 세션(초)"
                value={sessions[0]?.avg_seconds?.toString() || '-'}
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

            {/* 도구 사용 순위 + 내보내기 형식 */}
            <div className="grid md:grid-cols-2 gap-6">
              <Section title="도구 사용 순위">
                {tools.length === 0 ? (
                  <p className="text-gray-500 text-sm">데이터 없음</p>
                ) : (
                  <div className="space-y-2">
                    {tools.map((t) => (
                      <div key={t.tool_name} className="flex items-center gap-3">
                        <span className="w-28 text-sm truncate">{t.tool_name}</span>
                        <div className="flex-1 bg-gray-800 rounded-full h-5 overflow-hidden">
                          <div
                            className="bg-blue-500 h-full rounded-full flex items-center justify-end pr-2 text-xs font-medium"
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
                )}
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
                      <th className="text-right py-2 px-3">평균(초)</th>
                      <th className="text-right py-2 px-3">중간값(초)</th>
                      <th className="text-right py-2 px-3">최대(초)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.slice(0, 14).map((s) => (
                      <tr key={s.date} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                        <td className="py-2 px-3">{s.date}</td>
                        <td className="text-right py-2 px-3">{s.sessions}</td>
                        <td className="text-right py-2 px-3">{s.avg_seconds}</td>
                        <td className="text-right py-2 px-3">{s.median_seconds}</td>
                        <td className="text-right py-2 px-3">{s.max_seconds}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            {/* 최근 이벤트 로그 */}
            <Section title="최근 이벤트 (30건)">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-800">
                      <th className="text-left py-2 px-3">시각</th>
                      <th className="text-left py-2 px-3">이벤트</th>
                      <th className="text-left py-2 px-3">속성</th>
                      <th className="text-left py-2 px-3">기기</th>
                      <th className="text-left py-2 px-3">버전</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentEvents.map((e, i) => (
                      <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                        <td className="py-2 px-3 text-gray-400 whitespace-nowrap">
                          {new Date(e.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-2 px-3">
                          <span className="bg-gray-800 px-2 py-0.5 rounded text-xs font-mono">
                            {e.event}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-gray-400 text-xs max-w-xs truncate">
                          {Object.keys(e.properties).length > 0
                            ? JSON.stringify(e.properties)
                            : '-'}
                        </td>
                        <td className="py-2 px-3 text-gray-500 text-xs font-mono">
                          {e.device_id?.slice(0, 8)}
                        </td>
                        <td className="py-2 px-3 text-gray-500 text-xs">
                          {e.app_version}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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

  return (
    <div className="flex items-end gap-1.5 h-40">
      {data.map((d, i) => {
        const val = Number(d[valueKey]) || 0;
        const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
        const label = String(d[labelKey]);
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-xs text-gray-300">{val}</span>
            <div
              className="w-full bg-blue-500 rounded-t transition-all"
              style={{ height: `${Math.max(pct, 2)}%` }}
              title={`${label}: ${val}`}
            />
            <span className="text-[10px] text-gray-500 truncate w-full text-center">
              {formatLabel ? formatLabel(label) : label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
