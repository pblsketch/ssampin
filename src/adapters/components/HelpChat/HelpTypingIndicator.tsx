/** 타이핑 인디케이터 (AI 응답 대기 중) */
export function HelpTypingIndicator() {
  return (
    <div className="flex items-start gap-2 px-4 py-2">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sp-accent/20 text-xs">
        🤖
      </div>
      <div className="rounded-2xl rounded-tl-sm bg-sp-card px-4 py-3">
        <div className="flex items-center gap-1">
          <span className="h-2 w-2 animate-bounce rounded-full bg-sp-muted" style={{ animationDelay: '0ms' }} />
          <span className="h-2 w-2 animate-bounce rounded-full bg-sp-muted" style={{ animationDelay: '150ms' }} />
          <span className="h-2 w-2 animate-bounce rounded-full bg-sp-muted" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}
