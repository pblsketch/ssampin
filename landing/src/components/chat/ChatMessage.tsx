'use client';

import type { ChatMessage as ChatMessageType } from '../../types/chat';

interface Props {
  message: ChatMessageType;
}

export default function ChatMessage({ message }: Props) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex items-start gap-2 px-4 py-1.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* 아바타 */}
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${
          isUser ? 'bg-sp-accent/30' : 'bg-sp-accent/20'
        }`}
      >
        {isUser ? '👤' : '🤖'}
      </div>

      {/* 메시지 버블 */}
      <div
        className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'rounded-tr-sm bg-sp-accent text-white'
            : 'rounded-tl-sm bg-sp-card text-sp-text'
        }`}
      >
        {/* 마크다운 기본 렌더링 (줄바꿈, 볼드, 리스트) */}
        <div
          className="whitespace-pre-wrap break-words [&_strong]:font-semibold"
          dangerouslySetInnerHTML={{ __html: renderSimpleMarkdown(message.content) }}
        />

        {/* 소스 표시 */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="mt-2 border-t border-white/10 pt-2">
            <p className="text-[0.65rem] text-sp-muted">
              📚 참고: {message.sources.join(', ')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** 간단한 마크다운 → HTML 변환 (XSS 방지 포함) */
function renderSimpleMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code class="rounded bg-white/10 px-1 py-0.5 text-xs">$1</code>')
    .replace(/^- (.+)$/gm, '• $1')
    .replace(/^\d+\. (.+)$/gm, '  $1');
}
