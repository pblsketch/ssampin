'use client';

import { useState, useEffect, useCallback } from 'react';
import { useChatbot } from '../../hooks/useChatbot';
import ChatWindow from './ChatWindow';
import type { FeedbackState } from '../../types/chat';

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const chat = useChatbot();

  // 웰컴 메시지 후 3초 뒤 알림 뱃지 표시
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isOpen) setHasNewMessage(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, [isOpen]);

  const handleOpen = () => {
    setIsOpen(true);
    setHasNewMessage(false);
  };

  const handleClose = () => {
    // pending 피드백이 있으면 no_response로 처리
    const hasPending = chat.messages.some(
      (m) => m.role === 'assistant' && m.feedbackState === 'pending',
    );
    if (hasPending) {
      chat.hideAllPendingFeedback();
    }
    setIsOpen(false);
  };

  const handleFeedbackResolved = useCallback((messageId: string) => {
    chat.setMessageFeedback(messageId, 'resolved' as FeedbackState);
  }, [chat]);

  const handleFeedbackUnresolved = useCallback((messageId: string) => {
    chat.setMessageFeedback(messageId, 'unresolved' as FeedbackState);
  }, [chat]);

  const handleFeedbackAskMore = useCallback(() => {
    // 랜딩은 inputRef 없이 동작 — 별도 처리 불필요
  }, []);

  const handleFeedbackEscalate = useCallback(() => {
    chat.escalateFromFeedback();
  }, [chat]);

  // Feedback 섹션에서 호출할 수 있도록 전역 함수 등록
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__ssampin_open_chat = handleOpen;
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__ssampin_open_chat;
    };
  });

  return (
    <>
      {/* 채팅 윈도우 */}
      {isOpen && (
        <div className="fixed bottom-20 right-4 z-50 h-[min(600px,calc(100dvh-120px))] w-[min(400px,calc(100vw-32px))] animate-in fade-in slide-in-from-bottom-4 duration-200 sm:right-6">
          <ChatWindow
            messages={chat.messages}
            status={chat.status}
            escalationType={chat.escalationType}
            onSend={chat.sendMessage}
            onEscalate={chat.submitEscalation}
            onCancelEscalation={chat.cancelEscalation}
            onClear={chat.clearChat}
            onClose={handleClose}
            onFeedbackResolved={handleFeedbackResolved}
            onFeedbackUnresolved={handleFeedbackUnresolved}
            onFeedbackAskMore={handleFeedbackAskMore}
            onFeedbackEscalate={handleFeedbackEscalate}
          />
        </div>
      )}

      {/* 플로팅 버튼 */}
      <button
        onClick={isOpen ? handleClose : handleOpen}
        className="fixed bottom-4 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-sp-accent shadow-lg shadow-sp-accent/30 transition-all duration-200 hover:scale-105 hover:bg-sp-accent-hover active:scale-95 sm:right-6"
        aria-label={isOpen ? '채팅 닫기' : '쌤핀 AI에게 물어보기'}
      >
        {isOpen ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" />
            <path d="M6 6l12 12" />
          </svg>
        ) : (
          <span className="text-2xl">💬</span>
        )}

        {/* 알림 뱃지 */}
        {hasNewMessage && !isOpen && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[0.55rem] font-bold text-white">
            1
          </span>
        )}
      </button>
    </>
  );
}
