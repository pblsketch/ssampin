'use client';

import { useState } from 'react';

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
};

// ── 필터 카테고리 ──

interface FilterCategory {
  label: string;
  events: string[] | null; // null = 전체
}

const FILTER_CATEGORIES: FilterCategory[] = [
  { label: '전체', events: null },
  { label: '페이지 이동', events: ['page_view'] },
  { label: '도구 사용', events: ['tool_use'] },
  { label: '앱', events: ['app_open', 'app_close', 'session_start', 'widget_open', 'widget_close'] },
  { label: '콘텐츠', events: ['timetable_edit', 'seating_shuffle', 'seating_drag', 'event_create', 'memo_create', 'todo_toggle', 'export'] },
  { label: '에러', events: ['error'] },
];

// ── 유틸리티 ──

function formatDuration(seconds: number): string {
  if (seconds < 0 || !Number.isFinite(seconds)) return '-';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s}초`;
  return `${m}분 ${s}초`;
}

function getEventBadgeClass(event: string): string {
  if (event === 'error') return 'bg-red-900/60 text-red-300 border border-red-700/50';
  if (['app_open', 'app_close', 'session_start'].includes(event)) return 'bg-green-900/60 text-green-300 border border-green-700/50';
  if (event === 'page_view') return 'bg-gray-700/60 text-gray-300 border border-gray-600/50';
  if (event === 'tool_use') return 'bg-blue-900/60 text-blue-300 border border-blue-700/50';
  return 'bg-gray-800 text-gray-300 border border-gray-700/50';
}

function formatProperties(event: string, properties: Record<string, unknown>): string {
  const keys = Object.keys(properties);
  if (keys.length === 0) return '-';

  // page_view → 페이지 이름
  if (event === 'page_view' && properties.page) {
    return `📄 ${String(properties.page)}`;
  }

  // tool_use → 도구 한글 이름
  if (event === 'tool_use' && properties.tool) {
    const toolKey = String(properties.tool);
    return `🔧 ${TOOL_LABELS[toolKey] || toolKey}`;
  }

  // app_close → 세션 시간 포맷
  if (event === 'app_close' && properties.sessionDuration != null) {
    return `⏱️ ${formatDuration(Number(properties.sessionDuration))}`;
  }

  // app_open → 실행 모드
  if (event === 'app_open' && properties.launchMode) {
    const mode = String(properties.launchMode);
    const modeLabels: Record<string, string> = {
      widget: '위젯 모드',
      normal: '일반 모드',
      main: '메인 모드',
    };
    return `🚀 ${modeLabels[mode] || mode}`;
  }

  // 그 외: key=value 형태
  return keys
    .map((k) => {
      const v = properties[k];
      return `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`;
    })
    .join(', ');
}

// ── 이벤트 타입 ──

interface EventItem {
  event: string;
  properties: Record<string, unknown>;
  device_id: string;
  app_version: string;
  created_at: string;
}

// ── 컴포넌트 ──

export default function EventLog({ events }: { events: EventItem[] }) {
  const [activeFilter, setActiveFilter] = useState<number>(0);

  const filtered = FILTER_CATEGORIES[activeFilter].events === null
    ? events
    : events.filter((e) => FILTER_CATEGORIES[activeFilter].events!.includes(e.event));

  return (
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
                    {new Date(e.created_at).toLocaleString('ko-KR', {
                      timeZone: 'Asia/Seoul',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="py-2 px-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${getEventBadgeClass(e.event)}`}>
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
                  <td className="py-2 px-3 text-gray-500 text-xs">
                    {e.app_version}
                  </td>
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
  );
}
