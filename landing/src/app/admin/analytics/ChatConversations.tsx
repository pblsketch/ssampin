'use client';

import { useState } from 'react';

interface ConversationMessage {
  session_id: string;
  role: string;
  content: string;
  created_at: string;
  is_test: boolean;
  sources: string[] | null;
}

type FilterMode = 'real' | 'test' | 'all';

const PAGE_SIZE = 30;

export default function ChatConversations({
  conversations,
}: {
  conversations: ConversationMessage[];
}) {
  const [filter, setFilter] = useState<FilterMode>('real');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const filtered =
    filter === 'all'
      ? conversations
      : conversations.filter((m) => (filter === 'test' ? m.is_test : !m.is_test));

  // Count test sessions
  const testSessionIds = new Set(conversations.filter((m) => m.is_test).map((m) => m.session_id));
  const realSessionIds = new Set(conversations.filter((m) => !m.is_test).map((m) => m.session_id));

  // Group by session
  const sessionMap = new Map<string, ConversationMessage[]>();
  for (const msg of filtered) {
    const existing = sessionMap.get(msg.session_id) ?? [];
    existing.push(msg);
    sessionMap.set(msg.session_id, existing);
  }

  const allSessions = Array.from(sessionMap.entries()).sort((a, b) => {
    const aTime = a[1][a[1].length - 1]?.created_at ?? '';
    const bTime = b[1][b[1].length - 1]?.created_at ?? '';
    return bTime.localeCompare(aTime);
  });

  const sessions = allSessions.slice(0, visibleCount);
  const remaining = allSessions.length - sessions.length;

  const selectFilter = (mode: FilterMode) => {
    setFilter(mode);
    setVisibleCount(PAGE_SIZE);
  };

  return (
    <div>
      {/* Filter toggle */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => selectFilter('real')}
          className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
            filter === 'real'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:text-gray-200'
          }`}
        >
          실제 대화 ({realSessionIds.size})
        </button>
        <button
          onClick={() => selectFilter('test')}
          className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
            filter === 'test'
              ? 'bg-amber-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:text-gray-200'
          }`}
        >
          테스트 ({testSessionIds.size})
        </button>
        <button
          onClick={() => selectFilter('all')}
          className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
            filter === 'all'
              ? 'bg-gray-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:text-gray-200'
          }`}
        >
          전체
        </button>
      </div>

      {/* Conversations list */}
      {sessions.length === 0 ? (
        <p className="text-gray-500 text-sm">데이터 없음</p>
      ) : (
        <div className="space-y-4 max-h-[600px] overflow-y-auto">
          {sessions.map(([sessionId, messages]) => {
            const sorted = [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
            const firstTime = sorted[0]?.created_at ?? '';
            const isTest = sorted[0]?.is_test ?? false;
            const dateStr = firstTime
              ? new Date(firstTime).toLocaleString('ko-KR', {
                  timeZone: 'Asia/Seoul',
                  month: 'numeric',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '';
            return (
              <details key={sessionId} className="bg-gray-800/50 rounded-lg">
                <summary className="px-4 py-2 cursor-pointer hover:bg-gray-800 rounded-lg flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3">
                  <span className="text-xs text-gray-500 shrink-0">{dateStr}</span>
                  {isTest && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/50 text-amber-400 font-medium shrink-0">
                      TEST
                    </span>
                  )}
                  <span className="text-sm text-gray-300 truncate min-w-0 flex-1 basis-full sm:basis-auto">
                    {sorted.find((m) => m.role === 'user')?.content.slice(0, 80) ?? '(empty)'}
                  </span>
                  <span className="text-xs text-gray-500 shrink-0">
                    {sorted.filter((m) => m.role === 'user').length}턴
                  </span>
                </summary>
                <div className="px-4 pb-3 pt-1 space-y-3">
                  {sorted.map((msg, i) => {
                    const time = msg.created_at
                      ? new Date(msg.created_at).toLocaleTimeString('ko-KR', {
                          timeZone: 'Asia/Seoul',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '';
                    return (
                      <div
                        key={i}
                        className={`text-sm rounded-lg px-3 py-2 ${
                          msg.role === 'user'
                            ? 'bg-blue-900/20 text-blue-200'
                            : 'bg-gray-900/60 text-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              msg.role === 'user'
                                ? 'bg-blue-500/30 text-blue-300'
                                : 'bg-gray-600/40 text-gray-400'
                            }`}
                          >
                            {msg.role === 'user' ? '질문' : '답변'}
                          </span>
                          <span className="text-[10px] text-gray-500">{time}</span>
                        </div>
                        <p className="whitespace-pre-wrap break-words leading-relaxed">
                          {msg.content}
                        </p>
                        {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {[...new Set(msg.sources)].map((src, j) => (
                              <span
                                key={j}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/40 text-purple-300"
                              >
                                📄 {src}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </details>
            );
          })}
          {remaining > 0 && (
            <button
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              className="w-full py-2 rounded-lg bg-gray-800 text-gray-400 text-sm hover:bg-gray-700 hover:text-gray-200 transition"
            >
              더 보기 ({remaining}개 세션 남음)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
