/**
 * PinBubble — 아이콘 모드 펫의 말풍선 (v2.2.3~).
 *
 * 두 가지 용도를 한 컴포넌트로 처리한다:
 *   - 능동 알림: 제목 한 줄만 (예: "곧 3교시 수학 · 2-3반")
 *   - 호버 요약: 제목 + 보조 줄들 (다음 수업 / 할 일 / 일정)
 *
 * 펫 위쪽에 떠서 표시. pointer-events-none 으로 클릭/드래그를 방해하지 않는다.
 */
interface PinBubbleProps {
  title: string;
  lines?: readonly string[];
}

export function PinBubble({ title, lines = [] }: PinBubbleProps) {
  return (
    <div
      className="absolute bottom-full mb-2 right-0 bg-sp-card border border-sp-border rounded-xl p-3 shadow-xl min-w-[180px] max-w-[260px] pointer-events-none animate-pin-bubble-pop"
      role="status"
    >
      <div className="text-sm text-sp-text font-medium leading-snug whitespace-pre-line">
        {title}
      </div>
      {lines.map((line) => (
        <div key={line} className="text-xs text-sp-muted mt-1 leading-snug">
          {line}
        </div>
      ))}
    </div>
  );
}
