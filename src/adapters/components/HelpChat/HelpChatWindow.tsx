import { useEffect, useRef } from 'react';
import type { HelpChatMessage as MessageType, HelpChatStatus, EscalationPayload } from './types';
import { HelpChatMessage } from './HelpChatMessage';
import { HelpChatInput } from './HelpChatInput';
import { HelpEscalationForm } from './HelpEscalationForm';
import { HelpTypingIndicator } from './HelpTypingIndicator';

const QUICK_QUESTIONS = [
  '시간표 설정 방법',
  '위젯 모드 사용법',
  '자리 랜덤 배치',
  'Google Drive 동기화',
  '설정 초기화 방법',
  'NEIS 연동 방법',
  '모바일 앱 연결',
  '내보내기 방법',
];

interface Props {
  readonly messages: readonly MessageType[];
  readonly status: HelpChatStatus;
  readonly escalationType: 'bug' | 'feature' | 'other' | null;
  readonly isOnline: boolean;
  readonly onSend: (message: string, images?: File[]) => void;
  readonly onEscalate: (data: EscalationPayload, images?: File[]) => void;
  readonly onCancelEscalation: () => void;
  readonly onClear: () => void;
  readonly onClose: () => void;
  readonly onFeedbackResolved?: (messageId: string) => void;
  readonly onFeedbackUnresolved?: (messageId: string) => void;
  readonly onFeedbackAskMore?: () => void;
  readonly onFeedbackEscalate?: (messageId: string) => void;
  readonly onInputRef?: (el: HTMLTextAreaElement | null) => void;
}

/** 채팅 윈도우 — 헤더 + 메시지 목록 + 입력 */
export function HelpChatWindow({
  messages,
  status,
  escalationType,
  isOnline,
  onSend,
  onEscalate,
  onCancelEscalation,
  onClear,
  onClose,
  onFeedbackResolved,
  onFeedbackUnresolved,
  onFeedbackAskMore,
  onFeedbackEscalate,
  onInputRef,
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
          {/* 온라인/오프라인 상태 */}
          <span className={`mr-1 flex items-center gap-1 text-[0.6rem] ${isOnline ? 'text-emerald-400' : 'text-amber-400'}`}>
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            {isOnline ? '온라인' : '오프라인'}
          </span>
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

      {/* 오프라인 배너 */}
      {!isOnline && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-center text-xs text-amber-400">
          ⚡ 오프라인 모드 — 기본 FAQ만 이용 가능합니다
        </div>
      )}

      {/* 메시지 목록 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-3">
        {messages.map((msg) => (
          <HelpChatMessage
            key={msg.id}
            message={msg}
            onFeedbackResolved={onFeedbackResolved}
            onFeedbackUnresolved={onFeedbackUnresolved}
            onFeedbackAskMore={onFeedbackAskMore}
            onFeedbackEscalate={onFeedbackEscalate}
          />
        ))}
        {/* 빠른 질문 칩 */}
        {messages.length <= 1 && (
          <div className="px-4 pb-3">
            <p className="mb-2 text-xs text-sp-muted">💡 자주 묻는 질문</p>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => onSend(q)}
                  className="rounded-full border border-sp-border bg-sp-card/50 px-3 py-1.5 text-xs text-sp-text transition-colors hover:border-sp-accent hover:bg-sp-accent/10"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {/* 후속 질문 추천 */}
        {(() => {
          const lastMsg = messages.length > 1 ? messages[messages.length - 1] : undefined;
          const followUps = lastMsg?.role === 'assistant' ? lastMsg.suggestedQuestions : undefined;
          if (!followUps || followUps.length === 0) return null;
          return (
            <div className="px-4 pb-2">
              <p className="mb-1.5 text-detail text-sp-muted">🔗 관련 질문</p>
              <div className="flex flex-wrap gap-1.5">
                {followUps.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => onSend(q)}
                    className="rounded-full border border-sp-accent/30 bg-sp-accent/5 px-3 py-1 text-xs text-sp-accent transition-colors hover:bg-sp-accent/15"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          );
        })()}
        {status === 'loading' && <HelpTypingIndicator />}
      </div>

      {/* 입력 또는 에스컬레이션 폼 */}
      {escalationType ? (
        <HelpEscalationForm
          type={escalationType}
          onSubmit={onEscalate}
          onCancel={onCancelEscalation}
          disabled={status === 'loading'}
        />
      ) : (
        <HelpChatInput onSend={onSend} disabled={status === 'loading'} onInputRef={onInputRef} />
      )}
    </div>
  );
}
