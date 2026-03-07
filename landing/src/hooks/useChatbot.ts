'use client';

import { useState, useCallback, useRef } from 'react';
import type {
  ChatMessage,
  ChatResponse,
  ChatStatus,
  EscalationData,
  EscalationResponse,
} from '../types/chat';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

const CHAT_ENDPOINT = `${SUPABASE_URL}/functions/v1/ssampin-chat`;
const ESCALATE_ENDPOINT = `${SUPABASE_URL}/functions/v1/ssampin-escalate`;

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getSessionId(): string {
  if (typeof window === 'undefined') return generateId();

  const KEY = 'ssampin-chat-session';
  let id = sessionStorage.getItem(KEY);
  if (!id) {
    id = generateId();
    sessionStorage.setItem(KEY, id);
  }
  return id;
}

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    '안녕하세요! 🎓 쌤핀 AI 도우미예요.\n\n쌤핀의 기능이나 사용법에 대해 궁금한 점이 있으면 편하게 물어보세요!\n\n예시:\n- "시간표 설정은 어떻게 하나요?"\n- "좌석 배치 방법을 알려주세요"\n- "위젯 모드가 뭔가요?"',
  timestamp: new Date(),
};

export function useChatbot() {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [escalationType, setEscalationType] = useState<'bug' | 'feature' | 'other' | null>(null);
  const sessionIdRef = useRef<string>('');

  const getSession = useCallback(() => {
    if (!sessionIdRef.current) {
      sessionIdRef.current = getSessionId();
    }
    return sessionIdRef.current;
  }, []);

  /** 메시지 전송 */
  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || status === 'loading') return;

      // 유저 메시지 추가
      const userMsg: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: trimmed,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setStatus('loading');
      setEscalationType(null);

      try {
        // 히스토리 구성 (최근 6개)
        const history = messages
          .filter((m) => m.id !== 'welcome')
          .slice(-6)
          .map((m) => ({ role: m.role, content: m.content }));

        const res = await fetch(CHAT_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            apikey: SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            message: trimmed,
            sessionId: getSession(),
            history,
            source: 'landing',
          }),
        });

        if (res.status === 429) {
          addAssistantMessage('⏳ 잠시 후 다시 시도해 주세요. 요청이 너무 많아요.');
          setStatus('idle');
          return;
        }

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = (await res.json()) as ChatResponse;

        if (data.type === 'escalation') {
          addAssistantMessage(data.message);
          setEscalationType(data.escalationType);
          setStatus('escalation');
        } else {
          const assistantMsg: ChatMessage = {
            id: generateId(),
            role: 'assistant',
            content: data.message,
            timestamp: new Date(),
            sources: data.sources,
            confidence: data.confidence,
          };
          setMessages((prev) => [...prev, assistantMsg]);
          setStatus('idle');
        }
      } catch {
        addAssistantMessage('죄송해요, 일시적인 오류가 발생했어요. 잠시 후 다시 시도해 주세요! 🙏');
        setStatus('error');
      }
    },
    [messages, status, getSession]
  );

  /** 에스컬레이션 제출 */
  const submitEscalation = useCallback(
    async (data: Omit<EscalationData, 'sessionId'>) => {
      setStatus('loading');

      try {
        const res = await fetch(ESCALATE_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            apikey: SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            ...data,
            sessionId: getSession(),
          }),
        });

        const result = (await res.json()) as EscalationResponse;
        addAssistantMessage(
          result.ok
            ? '✅ 전달 완료! 빠르게 확인하겠습니다. 다른 질문이 있으면 편하게 물어보세요!'
            : '전달 중 문제가 발생했어요. 나중에 다시 시도해 주세요.'
        );
        setEscalationType(null);
        setStatus('idle');
      } catch {
        addAssistantMessage('전달 중 오류가 발생했어요. 나중에 다시 시도해 주세요.');
        setStatus('error');
      }
    },
    [getSession]
  );

  /** 에스컬레이션 취소 */
  const cancelEscalation = useCallback(() => {
    setEscalationType(null);
    setStatus('idle');
    addAssistantMessage('알겠어요! 다른 궁금한 점이 있으면 물어보세요 😊');
  }, []);

  /** 대화 초기화 */
  const clearChat = useCallback(() => {
    setMessages([WELCOME_MESSAGE]);
    setStatus('idle');
    setEscalationType(null);
    sessionIdRef.current = '';
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('ssampin-chat-session');
    }
  }, []);

  function addAssistantMessage(content: string) {
    const msg: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, msg]);
  }

  return {
    messages,
    status,
    escalationType,
    sendMessage,
    submitEscalation,
    cancelEscalation,
    clearChat,
  };
}
