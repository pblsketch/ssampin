import { useState, useEffect } from 'react';
import { useHelpChat } from './useHelpChat';
import { HelpChatWindow } from './HelpChatWindow';
import { useAnalytics } from '@adapters/hooks/useAnalytics';

/** 플로팅 AI 도움말 패널 — 앱 어디서나 접근 가능 */
export function HelpChatPanel() {
  const { track } = useAnalytics();
  const [isOpen, setIsOpen] = useState(false);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const chat = useHelpChat();

  // 3초 후 알림 뱃지 표시
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isOpen) setHasNewMessage(true);
    }, 5000);
    return () => clearTimeout(timer);
  }, [isOpen]);

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
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleSend = (message: string) => {
    track('chatbot_message');
    chat.sendMessage(message);
  };

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
