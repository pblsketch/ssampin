import { useState, useEffect } from 'react';
import type { FeedbackState } from './types';

interface Props {
  readonly messageId: string;
  readonly feedbackState: FeedbackState;
  readonly onResolved: (messageId: string) => void;
  readonly onUnresolved: (messageId: string) => void;
  readonly onAskMore: () => void;
  readonly onEscalate: (messageId: string) => void;
}

/** 챗봇 답변 하단 피드백 버튼 */
export function ChatFeedback({
  messageId,
  feedbackState,
  onResolved,
  onUnresolved,
  onAskMore,
  onEscalate,
}: Props) {
  const [visible, setVisible] = useState(false);
  const [escalated, setEscalated] = useState(false);

  // 답변 렌더링 1초 후 페이드인
  useEffect(() => {
    if (feedbackState === 'pending') {
      const timer = setTimeout(() => setVisible(true), 3000);
      return () => clearTimeout(timer);
    }
    setVisible(true);
  }, [feedbackState]);

  // hidden 상태이면 렌더링하지 않음
  if (feedbackState === 'hidden') return null;

  // 해결됨 상태
  if (feedbackState === 'resolved') {
    return (
      <div className="mt-2 border-t border-white/10 pt-2">
        <p className="text-center text-xs text-emerald-400 transition-opacity duration-300">
          감사합니다! 😊
        </p>
      </div>
    );
  }

  // 미해결 상태 → 후속 안내
  if (feedbackState === 'unresolved') {
    return (
      <div className="mt-2 border-t border-white/10 pt-2 transition-opacity duration-300">
        {escalated ? (
          <p className="text-center text-xs text-emerald-400">
            개발자에게 전달했어요! 빠르게 확인할게요 🙏
          </p>
        ) : (
          <>
            <p className="mb-2 text-xs text-sp-muted">
              더 자세히 알려주시면 다시 도와드릴게요! 아래 방법도 이용해보세요.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onAskMore}
                className="flex-1 rounded-lg border border-sp-border px-2 py-1.5 text-xs text-sp-text transition-colors hover:bg-sp-surface"
              >
                💬 더 질문하기
              </button>
              <button
                type="button"
                onClick={() => {
                  onEscalate(messageId);
                  setEscalated(true);
                }}
                className="flex-1 rounded-lg border border-sp-border px-2 py-1.5 text-xs text-sp-text transition-colors hover:bg-sp-surface"
              >
                📮 개발자에게 전달
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // pending 상태 → 피드백 버튼
  return (
    <div
      className="mt-2 border-t border-white/10 pt-2 transition-opacity duration-300"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <p className="mb-1.5 text-center text-detail text-sp-muted">도움이 되었나요?</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onResolved(messageId)}
          className="flex-1 rounded-lg border border-emerald-500/40 px-2 py-1.5 text-xs text-sp-text transition-colors hover:bg-emerald-500/10"
        >
          😊 해결됐어요
        </button>
        <button
          type="button"
          onClick={() => onUnresolved(messageId)}
          className="flex-1 rounded-lg border border-sp-border px-2 py-1.5 text-xs text-sp-text transition-colors hover:bg-sp-text/5"
        >
          😥 아직이요
        </button>
      </div>
    </div>
  );
}
