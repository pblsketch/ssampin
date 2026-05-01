/**
 * 아이콘 모드 호버 시 노출되는 툴팁 (v2.0.2~).
 * 100ms 딜레이 후 표시. 현재 교시 + 다음 교시 정보.
 */
interface PeriodInfo {
  number: number;
  subject: string;
}

interface IconTooltipProps {
  current: PeriodInfo | null;
  next: PeriodInfo | null;
}

export function IconTooltip({ current, next }: IconTooltipProps) {
  return (
    <div
      className="absolute bottom-full mb-2 right-0 bg-sp-card border border-sp-border rounded-xl p-3 shadow-xl min-w-[180px] pointer-events-none"
      role="tooltip"
    >
      <div className="text-sm text-sp-text font-medium">
        {current
          ? `${current.number}교시${current.subject ? ` ${current.subject}` : ''}`
          : '쉬는 시간'}
      </div>
      {next && (
        <div className="text-xs text-sp-muted mt-1">
          다음: {next.number}교시{next.subject ? ` ${next.subject}` : ''}
        </div>
      )}
      {!current && !next && (
        <div className="text-xs text-sp-muted mt-1">오늘 일정 없음</div>
      )}
    </div>
  );
}
