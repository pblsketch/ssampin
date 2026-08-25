// ── 챗봇 탭 ──
// 기존 챗봇 분석 화면을 그대로 옮겼다. 달라진 점은 이 탭을 열었을 때만 불러온다는 것,
// 그리고 대화 원문을 1,000건에서 300건으로 줄여 전송량을 낮췄다는 것뿐이다.

import ChatConversations from '../ChatConversations';
import { Section } from '../_components/primitives';
import { ChatbotAnalyticsSection } from '../_components/ChatbotAnalyticsSection';
import { loadChatbot } from '../_lib/data';
import type { DateRange } from '../_lib/data';

export default async function ChatbotTab({ range }: { range: DateRange }) {
  const data = await loadChatbot(range);

  return (
    <div className="space-y-6">
      <ChatbotAnalyticsSection
        chatDaily={data.chatDaily}
        chatTopics={data.chatTopics}
        chatDepth={data.chatDepth}
        chatEscalations={data.chatEscalations}
        chatConfidence={data.chatConfidence}
        chatFeedbackStats={data.chatFeedbackStats}
        chatFeedbackEscalations={data.chatFeedbackEscalations}
      />

      <Section title="챗봇 대화 원문 (최근 300건)">
        <ChatConversations conversations={data.chatConversations} />
      </Section>
    </div>
  );
}
