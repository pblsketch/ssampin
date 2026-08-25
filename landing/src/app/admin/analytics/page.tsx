import { Metadata } from 'next';
import { Suspense } from 'react';
import DateRangePicker from './DateRangePicker';
import TabNav from './_components/TabNav';
import { DEFAULT_TAB, TABS, isTabKey } from './_lib/tabs';
import OverviewTab from './_sections/OverviewTab';
import RetentionTab from './_sections/RetentionTab';
import FeaturesTab from './_sections/FeaturesTab';
import RhythmTab from './_sections/RhythmTab';
import FrictionTab from './_sections/FrictionTab';
import ChatbotTab from './_sections/ChatbotTab';
import EventsTab from './_sections/EventsTab';
import { loadRollupStatus } from './_lib/data';
import type { DateRange } from './_lib/data';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '쌤핀 Analytics',
  robots: 'noindex, nofollow',
};

/**
 * 화면 뼈대(제목·기간 선택·탭)를 먼저 내보내고, 무거운 집계는 Suspense 안에서 흘려보낸다.
 * 예전에는 18개 조회가 전부 끝나야 첫 글자가 나왔다 — 가장 느린 하나가 전체를 잡아먹었다.
 */
function TabSkeleton() {
  return (
    <div className="space-y-4" aria-label="불러오는 중">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 bg-gray-900 border border-gray-800 rounded-xl animate-pulse"
          />
        ))}
      </div>
      <div className="h-64 bg-gray-900 border border-gray-800 rounded-xl animate-pulse" />
      <div className="h-48 bg-gray-900 border border-gray-800 rounded-xl animate-pulse" />
    </div>
  );
}

/** 헤더에 "이 수치가 언제 기준인지"를 적어준다. 미리 계산해둔 값이라 실시간이 아니다. */
async function RollupFreshness() {
  const status = await loadRollupStatus();
  if (!status?.refreshed_at) {
    return (
      <span className="text-gray-500">
        집계 기준: 확인 불가 — migration 061 적용 여부를 확인하세요
      </span>
    );
  }
  // 갱신 주기가 30분이라, 그보다 넉넉한 50분을 넘겼을 때만 '뭔가 멈췄다'로 본다.
  const stale = status.stale_minutes ?? 0;
  const at = new Date(status.refreshed_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  return (
    <span className={stale > 50 ? 'text-amber-400' : 'text-gray-500'}>
      집계 기준: {at} ({stale < 1 ? '방금' : `${Math.round(stale)}분 전`})
      {status.last_error ? ` · 갱신 오류: ${status.last_error}` : ''}
    </span>
  );
}

function renderTab(tab: string, range: DateRange) {
  switch (tab) {
    case 'retention':
      return <RetentionTab range={range} />;
    case 'features':
      return <FeaturesTab range={range} />;
    case 'rhythm':
      return <RhythmTab range={range} />;
    case 'friction':
      return <FrictionTab range={range} />;
    case 'chatbot':
      return <ChatbotTab range={range} />;
    case 'events':
      return <EventsTab />;
    default:
      return <OverviewTab range={range} />;
  }
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; from?: string; to?: string; tab?: string }>;
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

  const range: DateRange = { dateFrom, dateTo };
  const tab = isTabKey(params.tab) ? params.tab : DEFAULT_TAB;
  const tabLabel = TABS.find((t) => t.key === tab)?.label ?? '';

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* 헤더 */}
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold">쌤핀 Analytics</h1>
              <p className="text-xs mt-1">
                <Suspense fallback={<span className="text-gray-600">집계 기준 확인 중…</span>}>
                  <RollupFreshness />
                </Suspense>
              </p>
            </div>
            <a href="/" className="text-sm text-gray-400 hover:text-white transition shrink-0">
              ← 메인으로
            </a>
          </div>
          <Suspense fallback={<div className="h-10" />}>
            <DateRangePicker />
          </Suspense>
          <Suspense fallback={<div className="h-9" />}>
            <TabNav />
          </Suspense>
        </div>

        {/* 탭 본문 — key 를 바꿔 탭/기간이 달라지면 새 Suspense 경계로 다시 흘려보낸다 */}
        <Suspense key={`${tab}:${dateFrom ?? ''}:${dateTo ?? ''}`} fallback={<TabSkeleton />}>
          {renderTab(tab, range)}
        </Suspense>

        <p className="text-[11px] text-gray-600 pt-2">
          현재 보고 있는 항목: {tabLabel} · 기간{' '}
          {dateFrom ? `${dateFrom} ~ ${dateTo ?? '오늘'}` : '전체'}
        </p>
      </div>
    </div>
  );
}
