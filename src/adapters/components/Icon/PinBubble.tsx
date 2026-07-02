/**
 * PinBubble — 아이콘 모드 펫의 말풍선 (v2.2.3~).
 *
 * 두 가지 용도를 한 컴포넌트로 처리한다:
 *   - 능동 알림: 제목 한 줄만 (예: "곧 3교시 수학 · 2-3반")
 *   - 호버 요약: 제목 + 보조 줄들 (다음 수업 / 할 일 / 급식 / 일정)
 *
 * v2.2.7: 자체 absolute 배치 제거 — 위치는 IconWindow의 오버레이 영역(핀 옆,
 * 창 확장 방향에 따라 위/아래)이 담당한다. 예전에는 bottom-full(뷰포트 기준)로
 * 떠서 어떤 창 크기에서도 화면 밖에 그려지는 버그가 있었다(2026-07-02 진단).
 * pointer-events-none 으로 클릭/드래그를 방해하지 않는다(뒤 창으로 클릭 통과).
 */
interface PinBubbleProps {
  title: string;
  lines?: readonly string[];
}

export function PinBubble({ title, lines = [] }: PinBubbleProps) {
  return (
    <div
      className="bg-sp-card border border-sp-border rounded-xl p-3 shadow-lg min-w-[180px] max-w-[260px] pointer-events-none animate-pin-bubble-pop"
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
