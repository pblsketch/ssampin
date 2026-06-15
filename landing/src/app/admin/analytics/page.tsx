import { Metadata } from 'next';
import { Suspense } from 'react';
import EventLog from './EventLog';
import VersionDistribution from './VersionDistribution';
import ChatConversations from './ChatConversations';
import DateRangePicker from './DateRangePicker';
import { Section } from './_components/primitives';
import { SummaryCards } from './_components/SummaryCards';
import { DailyActiveSection } from './_components/DailyActiveSection';
import { WeeklySummarySection } from './_components/WeeklySummarySection';
import { ToolRankingSection } from './_components/ToolRankingSection';
import { ExportFormatsSection } from './_components/ExportFormatsSection';
import { SessionStatsSection } from './_components/SessionStatsSection';
import { RetentionSection } from './_components/RetentionSection';
import { ChatbotAnalyticsSection } from './_components/ChatbotAnalyticsSection';
import { loadDashboardData } from './_lib/data';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '쌤핀 Analytics',
  robots: 'noindex, nofollow',
};

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const days =
    params.days !== undefined ? Number(params.days) : params.from || params.to ? null : 14;

  let dateFrom: string | null = null;
  let dateTo: string | null = null;

  if (params.from || params.to) {
    dateFrom = params.from || null;
    dateTo = params.to || null;
  } else if (days && days > 0) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    dateFrom = d.toISOString().slice(0, 10);
  }
  // days === 0 means "전체" → no date filter

  const data = await loadDashboardData({ dateFrom, dateTo });
  const hasData = data.weekly.length > 0 || data.daily.length > 0;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* 헤더 */}
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold">쌤핀 Analytics</h1>
              <p className="text-gray-400 text-xs sm:text-sm mt-1">
                마지막 업데이트: {new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
              </p>
            </div>
            <a href="/" className="text-sm text-gray-400 hover:text-white transition shrink-0">
              ← 메인으로
            </a>
          </div>
          <Suspense fallback={<div className="h-10" />}>
            <DateRangePicker />
          </Suspense>
        </div>

        {!hasData ? (
          <div className="text-center py-20 text-gray-500">
            <p className="text-lg">데이터가 없습니다</p>
            <p className="text-sm mt-2">SUPABASE_SERVICE_ROLE_KEY 환경 변수를 확인하세요.</p>
          </div>
        ) : (
          <>
            <SummaryCards
              totals={data.totals}
              daily={data.daily}
              weekly={data.weekly}
              sessions={data.sessions}
            />

            <DailyActiveSection daily={data.daily} />

            <WeeklySummarySection weekly={data.weekly} />

            <div className="grid md:grid-cols-2 gap-6">
              <ToolRankingSection toolsWeekly={data.toolsWeekly} tools={data.tools} />
              <ExportFormatsSection exports={data.exports} />
            </div>

            <SessionStatsSection sessions={data.sessions} />

            <Section title="버전 분포 (최근 90일)">
              <VersionDistribution versions={data.versions} />
            </Section>

            <RetentionSection retention={data.retention} />

            <ChatbotAnalyticsSection
              chatDaily={data.chatDaily}
              chatTopics={data.chatTopics}
              chatDepth={data.chatDepth}
              chatEscalations={data.chatEscalations}
              chatConfidence={data.chatConfidence}
              chatFeedbackStats={data.chatFeedbackStats}
              chatFeedbackEscalations={data.chatFeedbackEscalations}
            />

            <Section title="챗봇 대화 원문 (최근)">
              <ChatConversations conversations={data.chatConversations} />
            </Section>

            <Section title="최근 이벤트">
              <EventLog events={data.recentEvents} />
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
