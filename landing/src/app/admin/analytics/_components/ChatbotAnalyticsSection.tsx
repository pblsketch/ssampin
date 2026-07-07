import { BarChart, Section, SummaryCard } from './primitives';
import type {
  ChatConfidenceRow,
  ChatDailyRow,
  ChatDepthRow,
  ChatEscalationRow,
  ChatFeedbackEscalationRow,
  ChatFeedbackStatsRow,
  ChatTopicRow,
} from '../_lib/types';

export function ChatbotAnalyticsSection({
  chatDaily,
  chatTopics,
  chatDepth,
  chatEscalations,
  chatConfidence,
  chatFeedbackStats,
  chatFeedbackEscalations,
}: {
  chatDaily: ChatDailyRow[];
  chatTopics: ChatTopicRow[];
  chatDepth: ChatDepthRow[];
  chatEscalations: ChatEscalationRow[];
  chatConfidence: ChatConfidenceRow[];
  chatFeedbackStats: ChatFeedbackStatsRow[];
  chatFeedbackEscalations: ChatFeedbackEscalationRow[];
}) {
  // 인기 주제 막대 기준 최댓값은 한 번만 계산(빈 배열이면 map 미실행 → 출력 동일).
  const topicsMax = Math.max(...chatTopics.map((x) => x.mention_count));

  return (
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

      {/* 피드백 해결률 */}
      {chatFeedbackStats.length > 0 &&
        chatFeedbackStats[0].total_count > 0 &&
        (() => {
          const fb = chatFeedbackStats[0];
          const esc = chatFeedbackEscalations[0]?.escalation_count ?? 0;
          return (
            <div className="mb-6 rounded-lg bg-gray-800/50 p-4">
              <h3 className="text-sm text-gray-400 mb-3">피드백 해결률 (전체 기간)</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
                <div className="text-center">
                  <div className="text-xl sm:text-2xl font-bold text-emerald-400">
                    {fb.resolution_rate}%
                  </div>
                  <div className="text-xs text-gray-400">해결률</div>
                  <div className="text-xs text-gray-500">
                    ({fb.resolved_count}/{fb.responded_total})
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xl sm:text-2xl font-bold text-emerald-400">
                    {fb.resolved_count}
                  </div>
                  <div className="text-xs text-gray-400">해결됨</div>
                </div>
                <div className="text-center">
                  <div className="text-xl sm:text-2xl font-bold text-red-400">
                    {fb.unresolved_count}
                  </div>
                  <div className="text-xs text-gray-400">미해결</div>
                </div>
                <div className="text-center">
                  <div className="text-xl sm:text-2xl font-bold text-amber-400">{esc}</div>
                  <div className="text-xs text-gray-400">에스컬레이션</div>
                </div>
                <div className="text-center">
                  <div className="text-xl sm:text-2xl font-bold text-gray-400">
                    {fb.no_response_count}
                  </div>
                  <div className="text-xs text-gray-400">미응답</div>
                  <div className="text-xs text-gray-500">
                    (
                    {fb.total_count > 0
                      ? Math.round((fb.no_response_count / fb.total_count) * 100)
                      : 0}
                    %)
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

      {/* 일별 챗봇 사용량 */}
      {chatDaily.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm text-gray-400 mb-3">일별 사용량</h3>
          <BarChart
            data={[...chatDaily].reverse()}
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
                      style={{
                        width: `${(t.mention_count / topicsMax) * 100}%`,
                      }}
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
                          c.confidence_level.includes('높음')
                            ? 'bg-green-500'
                            : c.confidence_level.includes('보통')
                              ? 'bg-yellow-500'
                              : 'bg-red-500'
                        }`}
                        style={{ width: `${c.pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 w-16 text-right">
                      {c.response_count}건 ({c.pct}%)
                    </span>
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
            {chatEscalations.slice(0, 5).map((e) => {
              const context = e.conversation_context ?? [];
              return (
                <details key={e.id} className="group bg-gray-800/50 rounded-lg">
                  <summary className="cursor-pointer list-none p-3 hover:bg-gray-800/70 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          e.type === 'bug'
                            ? 'bg-red-500/20 text-red-400'
                            : e.type === 'feature'
                              ? 'bg-blue-500/20 text-blue-400'
                              : 'bg-gray-500/20 text-gray-400'
                        }`}
                      >
                        {e.type === 'bug' ? 'BUG' : e.type === 'feature' ? 'FEATURE' : e.type}
                      </span>
                      <span className="text-xs text-gray-500">{e.created_at_kst}</span>
                      <span className="ml-auto text-[10px] text-gray-500 group-open:text-blue-400">
                        대화 보기 <span className="group-open:hidden">▾</span>
                        <span className="hidden group-open:inline">▴</span>
                      </span>
                    </div>
                    <p className="text-sm text-gray-300">{e.summary}</p>
                    {e.user_message_preview && (
                      <p className="text-xs text-gray-500 mt-1 group-open:hidden">
                        {e.user_message_preview}
                      </p>
                    )}
                  </summary>
                  <div className="border-t border-gray-700/40 px-3 pb-3 pt-2 space-y-1.5">
                    {e.image_urls && e.image_urls.length > 0 && (
                      <div className="flex flex-wrap gap-2 pb-1">
                        {e.image_urls.map((url, i) => (
                          <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                            <img
                              src={url}
                              alt={`첨부 스크린샷 ${i + 1}`}
                              className="h-16 w-16 rounded object-cover border border-gray-700 hover:border-gray-500"
                            />
                          </a>
                        ))}
                      </div>
                    )}
                    {context.length === 0 ? (
                      <p className="text-xs text-gray-500">저장된 대화 맥락이 없습니다</p>
                    ) : (
                      context.map((m, i) => (
                        <div
                          key={i}
                          className={`rounded px-2 py-1.5 text-xs ${
                            m.role === 'user'
                              ? 'bg-blue-900/20 text-blue-200'
                              : 'bg-gray-900/60 text-gray-300'
                          }`}
                        >
                          <span
                            className={`text-[10px] font-bold mr-1.5 ${
                              m.role === 'user' ? 'text-blue-300' : 'text-gray-400'
                            }`}
                          >
                            {m.role === 'user' ? '질문' : '답변'}
                          </span>
                          <span className="whitespace-pre-wrap break-words leading-relaxed">
                            {m.content}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      )}
    </Section>
  );
}
