import type { HelpChatMessage as MessageType } from './types';

interface Props {
  readonly message: MessageType;
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

/** 메시지 버블 컴포넌트 */
export function HelpChatMessage({ message }: Props) {
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
        <div
          className="whitespace-pre-wrap break-words [&_strong]:font-semibold"
          dangerouslySetInnerHTML={{ __html: renderSimpleMarkdown(message.content) }}
        />

        {/* 오프라인 뱃지 */}
        {message.isOffline && (
          <div className="mt-1.5 text-[0.6rem] text-sp-muted">⚡ 오프라인 답변</div>
        )}

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
