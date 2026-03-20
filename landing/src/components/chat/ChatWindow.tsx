'use client';

import { useEffect, useRef } from 'react';
import type { ChatMessage as ChatMessageType, ChatStatus } from '../../types/chat';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import EscalationForm from './EscalationForm';
import TypingIndicator from './TypingIndicator';
import type { EscalationData } from '../../types/chat';

interface Props {
  messages: ChatMessageType[];
  status: ChatStatus;
  escalationType: 'bug' | 'feature' | 'other' | null;
  onSend: (message: string, images?: File[]) => void;
  onEscalate: (data: Omit<EscalationData, 'sessionId'>, images?: File[]) => void;
  onCancelEscalation: () => void;
  onClear: () => void;
  onClose: () => void;
  onFeedbackResolved?: (messageId: string) => void;
  onFeedbackUnresolved?: (messageId: string) => void;
  onFeedbackAskMore?: () => void;
  onFeedbackEscalate?: (messageId: string) => void;
}

export default function ChatWindow({
  messages,
  status,
  escalationType,
  onSend,
  onEscalate,
  onCancelEscalation,
  onClear,
  onClose,
  onFeedbackResolved,
  onFeedbackUnresolved,
  onFeedbackAskMore,
  onFeedbackEscalate,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 새 메시지 시 자동 스크롤
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, status]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-sp-border bg-sp-surface shadow-2xl shadow-black/40">
      {/* 헤더 */}
      <div className="flex items-center justify-between border-b border-sp-border bg-sp-card px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎓</span>
          <div>
            <h3 className="text-sm font-bold text-sp-text">쌤핀 AI 도우미</h3>
            <p className="text-[0.65rem] text-sp-muted">사용법이 궁금하면 물어보세요</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onClear}
            className="rounded-lg p-1.5 text-sp-muted transition-colors hover:bg-sp-surface hover:text-sp-text"
            aria-label="대화 초기화"
            title="대화 초기화"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M8 16H3v5" />
            </svg>
          </button>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-sp-muted transition-colors hover:bg-sp-surface hover:text-sp-text"
            aria-label="채팅 닫기"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>
      </div>

      {/* 메시지 목록 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-3">
        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            onFeedbackResolved={onFeedbackResolved}
            onFeedbackUnresolved={onFeedbackUnresolved}
            onFeedbackAskMore={onFeedbackAskMore}
            onFeedbackEscalate={onFeedbackEscalate}
          />
        ))}
        {status === 'loading' && <TypingIndicator />}
      </div>

      {/* 입력 또는 에스컬레이션 폼 */}
      {escalationType ? (
        <EscalationForm
          type={escalationType}
          onSubmit={onEscalate}
          onCancel={onCancelEscalation}
          disabled={status === 'loading'}
        />
      ) : (
        <ChatInput onSend={onSend} disabled={status === 'loading'} />
      )}
    </div>
  );
}
