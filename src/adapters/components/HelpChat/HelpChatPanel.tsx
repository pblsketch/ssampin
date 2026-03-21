import { useState, useEffect, useCallback, useRef } from 'react';
import { useHelpChat } from './useHelpChat';
import { HelpChatWindow } from './HelpChatWindow';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';

/** 플로팅 AI 도움말 패널 — 앱 어디서나 접근 가능 */
export function HelpChatPanel() {
  const { track } = useAnalytics();
  const showChatbot = useSettingsStore((s) => s.settings.showChatbot ?? true);
  const [isOpen, setIsOpen] = useState(false);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const chat = useHelpChat();
  const inputElRef = useRef<HTMLTextAreaElement | null>(null);

  // 최초 1회만 뱃지 표시 (한 번이라도 열었으면 다시 표시하지 않음)
  useEffect(() => {
    const hasOpened = localStorage.getItem('ssampin-chat-opened');
    if (hasOpened) return;

    const timer = setTimeout(() => {
      if (!isOpen) setHasNewMessage(true);
    }, 5000);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 외부에서 채팅 열기 지원 (FeedbackModal 등)
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__ssampin_open_chat = () => {
      setIsOpen(true);
      setHasNewMessage(false);
    };
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__ssampin_open_chat;
    };
  }, []);

  const handleOpen = () => {
    track('chatbot_open');
    setIsOpen(true);
    setHasNewMessage(false);
    localStorage.setItem('ssampin-chat-opened', 'true');
  };

  const handleClose = () => {
    // pending 피드백이 있으면 no_response로 기록
    const hasPending = chat.messages.some(
      (m) => m.role === 'assistant' && m.feedbackState === 'pending',
    );
    if (hasPending) {
      track('chatbot_feedback', { result: 'no_response' });
      chat.hideAllPendingFeedback();
    }
    setIsOpen(false);
  };

  const handleSend = (message: string, images?: File[]) => {
    track('chatbot_message');
    chat.sendMessage(message, images);
  };

  /** 피드백: 해결됨 */
  const handleFeedbackResolved = useCallback((messageId: string) => {
    chat.setMessageFeedback(messageId, 'resolved');
    track('chatbot_feedback', { result: 'resolved' });
  }, [chat, track]);

  /** 피드백: 미해결 */
  const handleFeedbackUnresolved = useCallback((messageId: string) => {
    chat.setMessageFeedback(messageId, 'unresolved');
    track('chatbot_feedback', { result: 'unresolved' });
  }, [chat, track]);

  /** 피드백: 더 질문하기 → 입력창 포커스 */
  const handleFeedbackAskMore = useCallback(() => {
    inputElRef.current?.focus();
  }, []);

  /** 입력 컴포넌트에서 textarea ref 수신 */
  const handleInputRef = useCallback((el: HTMLTextAreaElement | null) => {
    inputElRef.current = el;
  }, []);

  /** 피드백: 개발자에게 전달 */
  const handleFeedbackEscalate = useCallback((messageId: string) => {
    const msg = chat.messages.find((m) => m.id === messageId);
    const lastUser = chat.messages.filter((m) => m.role === 'user').pop();
    track('chatbot_escalate', { questionText: lastUser?.content?.slice(0, 200) ?? '' });
    chat.escalateFromFeedback();
    // 피드백 상태는 ChatFeedback 컴포넌트 내에서 escalated 상태로 관리됨
    void msg; // unused but kept for clarity
  }, [chat, track]);

  // 설정에서 챗봇을 숨긴 경우 렌더링하지 않음 (단축키로는 접근 가능)
  if (!showChatbot && !isOpen) return null;

  return (
    <>
      {/* 채팅 윈도우 */}
      {isOpen && (
        <div
          className="fixed bottom-16 right-4 z-50 transition-all duration-200"
          style={{
            height: 'min(560px, calc(100vh - 100px))',
            width: 'min(380px, calc(100vw - 32px))',
          }}
        >
          <HelpChatWindow
            messages={chat.messages}
            status={chat.status}
            escalationType={chat.escalationType}
            isOnline={chat.isOnline}
            onSend={handleSend}
            onEscalate={chat.submitEscalation}
            onCancelEscalation={chat.cancelEscalation}
            onClear={chat.clearChat}
            onClose={handleClose}
            onFeedbackResolved={handleFeedbackResolved}
            onFeedbackUnresolved={handleFeedbackUnresolved}
            onFeedbackAskMore={handleFeedbackAskMore}
            onFeedbackEscalate={handleFeedbackEscalate}
            onInputRef={handleInputRef}
          />
        </div>
      )}

      {/* 플로팅 버튼 */}
      <button
        onClick={isOpen ? handleClose : handleOpen}
        className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-sp-accent shadow-lg shadow-sp-accent/30 transition-all duration-200 hover:scale-105 hover:bg-blue-600 active:scale-95"
        aria-label={isOpen ? '채팅 닫기' : '쌤핀 AI에게 물어보기'}
      >
        {isOpen ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" />
            <path d="M6 6l12 12" />
          </svg>
        ) : (
          <span className="material-symbols-outlined text-white text-xl">help</span>
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
