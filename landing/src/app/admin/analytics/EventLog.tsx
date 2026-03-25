'use client';

import { useState, useMemo } from 'react';

// ── 한글 라벨 매핑 ──

const EVENT_LABELS: Record<string, string> = {
  app_open: '앱 열기',
  app_close: '앱 종료',
  page_view: '페이지 이동',
  widget_open: '위젯 열기',
  widget_close: '위젯 닫기',
  timetable_edit: '시간표 수정',
  seating_shuffle: '좌석 섞기',
  seating_drag: '좌석 드래그',
  event_create: '일정 생성',
  memo_create: '메모 생성',
  todo_toggle: '할일 체크',
  tool_use: '도구 사용',
  export: '내보내기',
  share_import: '공유 가져오기',
  chatbot_open: '챗봇 열기',
  chatbot_message: '챗봇 메시지',
  update_installed: '업데이트 설치',
  onboarding_complete: '온보딩 완료',
  school_set: '학교 설정',
  class_set: '학급 설정',
  error: '에러',
  feature_discovery: '기능 발견',
  session_start: '세션 시작',
  assignment_create: '과제 생성',
  assignment_share: '과제 공유',
  assignment_view: '과제 조회',
  consultation_create: '상담 생성',
  consultation_update: '상담 수정',
  bookmark_add: '즐겨찾기 추가',
  bookmark_click: '즐겨찾기 클릭',
  feedback_submit: '피드백 제출',
  settings_change: '설정 변경',
  timetable_neis_sync: 'NEIS 동기화',
  widget_layout_change: '위젯 레이아웃 변경',
  onboarding_roles_selected: '역할 선택',
  onboarding_widget_preset: '위젯 프리셋 선택',
  chatbot_feedback: '챗봇 피드백',
  chatbot_escalate: '챗봇 에스컬레이션',
  share_modal_open: '공유 모달 열기',
  share_click: '공유 클릭',
  share_prompt_shown: '공유 안내 표시',
  share_prompt_action: '공유 안내 응답',
};

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
  assignment: '과제',
  class_seating: '자리배치',
  poll: '투표',
};

const PAGE_LABELS: Record<string, string> = {
  dashboard: '대시보드',
  timetable: '시간표',
  seating: '좌석배치',
  schedule: '일정관리',
  'student-records': '담임메모',
  memo: '메모',
  todo: '할일',
  settings: '설정',
  tools: '도구함',
  'class-management': '수업관리',
  'tool-timer': '타이머',
  'tool-random-picker': '랜덤뽑기',
  'tool-roulette': '룰렛',
  'tool-scoreboard': '점수판',
  'tool-traffic-light': '신호등',
  'tool-dice': '주사위',
  'tool-coin': '동전던지기',
  'tool-qr': 'QR코드',
  'tool-work-symbols': '활동기호',
  'tool-vote': '투표',
  'tool-survey': '설문조사',
  'tool-wordcloud': '워드클라우드',
  'tool-seat-picker': '자리뽑기',
  'tool-poll': '투표',
  'tool-assignment': '과제',
  'tool-class-seating': '자리배치',
  bookmarks: '즐겨찾기',
};

// ── 카테고리 정의 ──

interface CategoryDef {
  key: string;
  label: string;
  color: string;
  bgBar: string;
  pillClasses: string;
  events: string[];
}

const CATEGORIES: CategoryDef[] = [
  {
    key: 'app',
    label: '앱',
    color: 'text-green-400',
    bgBar: 'bg-green-500',
    pillClasses: 'bg-green-900/60 text-green-300 border-green-700/50',
    events: ['app_open', 'app_close', 'session_start', 'widget_open', 'widget_close'],
  },
  {
    key: 'nav',
    label: '탐색',
    color: 'text-gray-400',
    bgBar: 'bg-gray-500',
    pillClasses: 'bg-gray-700/60 text-gray-300 border-gray-600/50',
    events: ['page_view'],
  },
  {
    key: 'tool',
    label: '도구',
    color: 'text-blue-400',
    bgBar: 'bg-blue-500',
    pillClasses: 'bg-blue-900/60 text-blue-300 border-blue-700/50',
    events: ['tool_use'],
  },
  {
    key: 'content',
    label: '콘텐츠',
    color: 'text-amber-400',
    bgBar: 'bg-amber-500',
    pillClasses: 'bg-amber-900/60 text-amber-300 border-amber-700/50',
    events: ['timetable_edit', 'seating_shuffle', 'seating_drag', 'event_create', 'memo_create', 'todo_toggle', 'export', 'share_import', 'assignment_create', 'assignment_share', 'assignment_view', 'consultation_create', 'consultation_update', 'bookmark_add', 'bookmark_click'],
  },
  {
    key: 'discover',
    label: '기타',
    color: 'text-purple-400',
    bgBar: 'bg-purple-500',
    pillClasses: 'bg-purple-900/60 text-purple-300 border-purple-700/50',
    events: ['feature_discovery', 'onboarding_complete', 'update_installed', 'chatbot_open', 'chatbot_message', 'school_set', 'class_set', 'feedback_submit', 'settings_change', 'timetable_neis_sync', 'widget_layout_change', 'onboarding_roles_selected', 'onboarding_widget_preset', 'chatbot_feedback', 'chatbot_escalate', 'share_modal_open', 'share_click', 'share_prompt_shown', 'share_prompt_action'],
  },
  {
    key: 'error',
    label: '에러',
    color: 'text-red-400',
    bgBar: 'bg-red-500',
    pillClasses: 'bg-red-900/60 text-red-300 border-red-700/50',
    events: ['error'],
  },
];

function getCategoryForEvent(event: string): CategoryDef {
  return CATEGORIES.find((c) => c.events.includes(event)) || CATEGORIES[4];
}

// ── 이벤트 아이템 타입 ──

interface EventItem {
  event: string;
  properties: Record<string, unknown>;
  device_id: string;
  app_version: string;
  created_at: string;
}

// ── 유틸리티 ──

function formatKSTTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatKSTShortTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getEventShortLabel(e: EventItem): string {
  if (e.event === 'page_view' && e.properties.page) {
    const page = String(e.properties.page);
    return PAGE_LABELS[page] || page;
  }
  if (e.event === 'tool_use' && e.properties.tool) {
    const tool = String(e.properties.tool);
    return TOOL_LABELS[tool] || tool;
  }
  if (e.event === 'app_open' && e.properties.launchMode) {
    const mode = String(e.properties.launchMode);
    return mode === 'widget' ? '위젯모드' : '앱열기';
  }
  if (e.event === 'feature_discovery') {
    const feat = e.properties.feature ? String(e.properties.feature) : '?';
    const label = PAGE_LABELS[feat] || TOOL_LABELS[feat] || feat;
    return `발견: ${label}`;
  }
  return EVENT_LABELS[e.event] || e.event;
}

function formatDuration(seconds: number): string {
  if (seconds < 0 || !Number.isFinite(seconds)) return '-';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s}초`;
  return `${m}분 ${s}초`;
}

function getEventBadgeClass(event: string): string {
  if (event === 'error') return 'bg-red-900/60 text-red-300 border border-red-700/50';
  if (['app_open', 'app_close', 'session_start'].includes(event))
    return 'bg-green-900/60 text-green-300 border border-green-700/50';
  if (event === 'page_view') return 'bg-gray-700/60 text-gray-300 border border-gray-600/50';
  if (event === 'tool_use') return 'bg-blue-900/60 text-blue-300 border border-blue-700/50';
  return 'bg-gray-800 text-gray-300 border border-gray-700/50';
}

function formatProperties(event: string, properties: Record<string, unknown>): string {
  const keys = Object.keys(properties);
  if (keys.length === 0) return '-';
  if (event === 'page_view' && properties.page) return `📄 ${String(properties.page)}`;
  if (event === 'tool_use' && properties.tool) {
    const toolKey = String(properties.tool);
    return `🔧 ${TOOL_LABELS[toolKey] || toolKey}`;
  }
  if (event === 'app_close' && properties.sessionDuration != null)
    return `⏱️ ${formatDuration(Number(properties.sessionDuration))}`;
  if (event === 'app_open' && properties.launchMode) {
    const mode = String(properties.launchMode);
    const modeLabels: Record<string, string> = { widget: '위젯 모드', normal: '일반 모드', main: '메인 모드' };
    return `🚀 ${modeLabels[mode] || mode}`;
  }
  return keys
    .map((k) => {
      const v = properties[k];
      return `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`;
    })
    .join(', ');
}

// ── 인사이트 계산 ──

interface SessionData {
  deviceId: string;
  version: string;
  events: EventItem[];
  timeRange: string;
  duration: string;
}

interface InsightData {
  activeDevices: number;
  totalEvents: number;
  avgEventsPerSession: number;
  errorCount: number;
  categoryCounts: { category: CategoryDef; count: number; pct: number }[];
  topPages: { name: string; label: string; count: number }[];
  topTools: { name: string; label: string; count: number }[];
  sessions: SessionData[];
}

function computeInsights(events: EventItem[]): InsightData {
  const total = events.length;

  // 활성 기기
  const deviceSet = new Set(events.map((e) => e.device_id));
  const activeDevices = deviceSet.size;

  // 에러 수
  const errorCount = events.filter((e) => e.event === 'error').length;

  // 카테고리별 카운트
  const catCounts = CATEGORIES.map((cat) => {
    const count = events.filter((e) => cat.events.includes(e.event)).length;
    return { category: cat, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 };
  }).filter((c) => c.count > 0);

  // 인기 페이지
  const pageCounts: Record<string, number> = {};
  events
    .filter((e) => e.event === 'page_view' && e.properties.page)
    .forEach((e) => {
      const page = String(e.properties.page);
      pageCounts[page] = (pageCounts[page] || 0) + 1;
    });
  const topPages = Object.entries(pageCounts)
    .map(([name, count]) => ({ name, label: PAGE_LABELS[name] || name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // 인기 도구
  const toolCounts: Record<string, number> = {};
  events
    .filter((e) => e.event === 'tool_use' && e.properties.tool)
    .forEach((e) => {
      const tool = String(e.properties.tool);
      toolCounts[tool] = (toolCounts[tool] || 0) + 1;
    });
  const topTools = Object.entries(toolCounts)
    .map(([name, count]) => ({ name, label: TOOL_LABELS[name] || name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // 세션 (기기별 그룹)
  const deviceEvents: Record<string, EventItem[]> = {};
  events.forEach((e) => {
    if (!deviceEvents[e.device_id]) deviceEvents[e.device_id] = [];
    deviceEvents[e.device_id].push(e);
  });

  const sessions: SessionData[] = Object.entries(deviceEvents)
    .map(([deviceId, devEvents]) => {
      const sorted = [...devEvents].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const diffSec = Math.round(
        (new Date(last.created_at).getTime() - new Date(first.created_at).getTime()) / 1000,
      );

      let duration = '< 1분';
      if (diffSec >= 3600) {
        duration = `${Math.floor(diffSec / 3600)}시간 ${Math.floor((diffSec % 3600) / 60)}분`;
      } else if (diffSec >= 60) {
        duration = `${Math.floor(diffSec / 60)}분`;
      }

      const startStr = formatKSTShortTime(first.created_at);
      const endStr = formatKSTShortTime(last.created_at);
      const timeRange = startStr === endStr ? startStr : `${startStr} ~ ${endStr}`;

      return { deviceId, version: first.app_version || '?', events: sorted, timeRange, duration };
    })
    .sort((a, b) => b.events.length - a.events.length);

  return {
    activeDevices,
    totalEvents: total,
    avgEventsPerSession: activeDevices > 0 ? Math.round((total / activeDevices) * 10) / 10 : 0,
    errorCount,
    categoryCounts: catCounts,
    topPages,
    topTools,
    sessions,
  };
}

// ── 필터 카테고리 (로그 탭) ──

interface FilterCategory {
  label: string;
  events: string[] | null;
}

const FILTER_CATEGORIES: FilterCategory[] = [
  { label: '전체', events: null },
  { label: '페이지 이동', events: ['page_view'] },
  { label: '도구 사용', events: ['tool_use'] },
  {
    label: '앱',
    events: ['app_open', 'app_close', 'session_start', 'widget_open', 'widget_close'],
  },
  {
    label: '콘텐츠',
    events: [
      'timetable_edit',
      'seating_shuffle',
      'seating_drag',
      'event_create',
      'memo_create',
      'todo_toggle',
      'export',
    ],
  },
  { label: '에러', events: ['error'] },
];

// ── 메인 컴포넌트 ──

type Tab = 'insights' | 'log';
const PREVIEW_COUNT = 12;

export default function EventLog({ events }: { events: EventItem[] }) {
  const [tab, setTab] = useState<Tab>('insights');
  const [activeFilter, setActiveFilter] = useState<number>(0);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());

  const insights = useMemo(() => computeInsights(events), [events]);

  const filtered =
    FILTER_CATEGORIES[activeFilter].events === null
      ? events
      : events.filter((e) => FILTER_CATEGORIES[activeFilter].events!.includes(e.event));

  const toggleSession = (deviceId: string) => {
    setExpandedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(deviceId)) next.delete(deviceId);
      else next.add(deviceId);
      return next;
    });
  };

  if (events.length === 0) {
    return <p className="text-gray-500 text-sm">데이터 없음</p>;
  }

  return (
    <div>
      {/* 탭 바 */}
      <div className="flex gap-1 mb-5">
        <button
          onClick={() => setTab('insights')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            tab === 'insights'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          인사이트
        </button>
        <button
          onClick={() => setTab('log')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            tab === 'log'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          로그
        </button>
      </div>

      {tab === 'insights' ? (
        <div className="space-y-6">
          {/* ── 요약 카드 ── */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-gray-800/50 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">접속 기기</div>
              <div className="text-xl font-bold text-gray-200">
                {insights.activeDevices}
                <span className="text-sm text-gray-500 ml-1">대</span>
              </div>
              <div className="text-[10px] text-gray-600 mt-0.5">최근 {insights.totalEvents}건 중</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">총 이벤트</div>
              <div className="text-xl font-bold text-gray-200">
                {insights.totalEvents}
                <span className="text-sm text-gray-500 ml-1">건</span>
              </div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">기기당 평균</div>
              <div className="text-xl font-bold text-gray-200">
                {insights.avgEventsPerSession}
                <span className="text-sm text-gray-500 ml-1">건</span>
              </div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">에러</div>
              <div
                className={`text-xl font-bold ${insights.errorCount > 0 ? 'text-red-400' : 'text-green-400'}`}
              >
                {insights.errorCount}
                <span className="text-sm text-gray-500 ml-1">건</span>
              </div>
            </div>
          </div>

          {/* ── 이벤트 분포 + 인기 페이지/도구 ── */}
          <div className="grid grid-cols-2 gap-4">
            {/* 이벤트 유형 분포 */}
            <div className="bg-gray-800/30 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-300 mb-3">이벤트 유형 분포</h4>

              {/* 스택 바 */}
              <div className="flex rounded-full overflow-hidden h-3 mb-3">
                {insights.categoryCounts.map(({ category, count }) => (
                  <div
                    key={category.key}
                    className={`${category.bgBar} transition-all`}
                    style={{ width: `${(count / insights.totalEvents) * 100}%` }}
                    title={`${category.label}: ${count}건`}
                  />
                ))}
              </div>

              {/* 범례 */}
              <div className="space-y-1.5">
                {insights.categoryCounts.map(({ category, count, pct }) => (
                  <div key={category.key} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-sm ${category.bgBar}`} />
                      <span className={category.color}>{category.label}</span>
                    </div>
                    <span className="text-gray-500">
                      {count}건 ({pct}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 인기 페이지 + 인기 도구 */}
            <div className="space-y-4">
              {insights.topPages.length > 0 && (
                <div className="bg-gray-800/30 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-gray-300 mb-2">인기 페이지</h4>
                  <div className="space-y-1.5">
                    {insights.topPages.map((p, i) => {
                      const maxCount = insights.topPages[0].count;
                      return (
                        <div key={p.name} className="flex items-center gap-2 text-xs">
                          <span className="text-gray-600 w-4 text-right">{i + 1}.</span>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-gray-300">{p.label}</span>
                              <span className="text-gray-500">{p.count}회</span>
                            </div>
                            <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gray-500 rounded-full"
                                style={{ width: `${(p.count / maxCount) * 100}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {insights.topTools.length > 0 && (
                <div className="bg-gray-800/30 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-gray-300 mb-2">인기 도구</h4>
                  <div className="space-y-1.5">
                    {insights.topTools.map((t, i) => {
                      const maxCount = insights.topTools[0].count;
                      return (
                        <div key={t.name} className="flex items-center gap-2 text-xs">
                          <span className="text-gray-600 w-4 text-right">{i + 1}.</span>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-gray-300">{t.label}</span>
                              <span className="text-gray-500">{t.count}회</span>
                            </div>
                            <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500 rounded-full"
                                style={{ width: `${(t.count / maxCount) * 100}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── 사용자 여정 ── */}
          <div>
            <h4 className="text-sm font-medium text-gray-300 mb-3">
              사용자 여정
              <span className="text-xs text-gray-600 font-normal ml-2">
                기기별 이벤트 흐름
              </span>
            </h4>
            <div className="space-y-2">
              {insights.sessions.map((session) => {
                const isExpanded = expandedSessions.has(session.deviceId);
                const displayEvents = isExpanded
                  ? session.events
                  : session.events.slice(0, PREVIEW_COUNT);
                const hasMore = session.events.length > PREVIEW_COUNT;

                return (
                  <div key={session.deviceId} className="bg-gray-800/30 rounded-lg p-3">
                    {/* 세션 헤더 */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono text-gray-500">
                          {session.deviceId.slice(0, 8)}
                        </span>
                        <span className="text-gray-600">v{session.version}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span>{session.timeRange}</span>
                        <span className="text-gray-700">·</span>
                        <span>{session.events.length}건</span>
                        <span className="text-gray-700">·</span>
                        <span>{session.duration}</span>
                      </div>
                    </div>

                    {/* 이벤트 흐름 */}
                    <div className="flex flex-wrap items-center gap-1">
                      {displayEvents.map((e, i) => {
                        const cat = getCategoryForEvent(e.event);
                        return (
                          <div key={i} className="flex items-center">
                            {i > 0 && <span className="text-gray-700 mx-0.5 text-xs">→</span>}
                            <span
                              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${cat.pillClasses}`}
                            >
                              {getEventShortLabel(e)}
                            </span>
                          </div>
                        );
                      })}
                      {hasMore && !isExpanded && (
                        <button
                          onClick={() => toggleSession(session.deviceId)}
                          className="text-[10px] text-blue-400 hover:text-blue-300 ml-1"
                        >
                          +{session.events.length - PREVIEW_COUNT}건 더보기
                        </button>
                      )}
                      {isExpanded && hasMore && (
                        <button
                          onClick={() => toggleSession(session.deviceId)}
                          className="text-[10px] text-blue-400 hover:text-blue-300 ml-1"
                        >
                          접기
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* ── 로그 탭 (기존 테이블) ── */
        <div>
          {/* 필터 버튼 */}
          <div className="flex flex-wrap gap-2 mb-4">
            {FILTER_CATEGORIES.map((cat, i) => (
              <button
                key={cat.label}
                onClick={() => setActiveFilter(i)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  activeFilter === i
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                }`}
              >
                {cat.label}
                {cat.events !== null && (
                  <span className="ml-1 opacity-60">
                    ({events.filter((e) => cat.events!.includes(e.event)).length})
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* 이벤트 테이블 */}
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
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-500">
                      해당 이벤트가 없습니다
                    </td>
                  </tr>
                ) : (
                  filtered.map((e, i) => (
                    <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                      <td className="py-2 px-3 text-gray-400 whitespace-nowrap">
                        {formatKSTTime(e.created_at)}
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${getEventBadgeClass(e.event)}`}
                        >
                          <span className="font-mono">{e.event}</span>
                          {EVENT_LABELS[e.event] && (
                            <span className="opacity-70">({EVENT_LABELS[e.event]})</span>
                          )}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-gray-300 text-xs max-w-xs truncate">
                        {formatProperties(e.event, e.properties)}
                      </td>
                      <td className="py-2 px-3 text-gray-500 text-xs font-mono">
                        {e.device_id?.slice(0, 8)}
                      </td>
                      <td className="py-2 px-3 text-gray-500 text-xs">{e.app_version}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* 필터 결과 요약 */}
          <div className="mt-3 text-xs text-gray-500 text-right">
            {filtered.length}건 표시 / 전체 {events.length}건
          </div>
        </div>
      )}
    </div>
  );
}
