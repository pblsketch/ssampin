/**
 * 학생 관찰 기록 알림 — 미기록 배지.
 *
 * "미기록 N명"을 조용히 알리는 count-only 배지. 실명은 절대 노출하지 않는다.
 * 게이미피케이션 요소(점수·별·연속 표시) 없이, 완결성 큐로만 기능한다("은은형 알림").
 * 계획서: docs/01-plan/features/observation-record-reminder.plan.md
 */
export interface ReminderBadgeProps {
  /** 미기록 학생 수. 0이면 아무것도 렌더하지 않음(null 반환) */
  readonly count: number;
  readonly onClick?: () => void;
  /**
   * 'inline' = 칩(숫자+라벨) — 위젯·설정 화면 등에 단독 배치.
   * 'dot' = 작은 빨간 점+숫자만 — 아이콘/위젯용. 부모가 `position: relative`인
   * 아이콘·버튼 위에 겹쳐 놓는 용도로, 이 컴포넌트가 직접 절대 위치(우상단)를 지정한다.
   * 기본 'inline'.
   */
  readonly variant?: 'inline' | 'dot';
}

function formatCount(count: number): string {
  return count > 99 ? '99+' : String(count);
}

export function ReminderBadge({ count, onClick, variant = 'inline' }: ReminderBadgeProps) {
  if (count <= 0) return null;

  const label = `미기록 ${count}명`;

  if (variant === 'dot') {
    const dotClassName =
      'absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[16px] h-4 rounded-full bg-red-500 px-1 text-[9px] font-sp-semibold text-white leading-none tabular-nums shadow-sm';

    if (onClick) {
      return (
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          title={label}
          className={`${dotClassName} hover:brightness-110 transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent`}
        >
          {formatCount(count)}
        </button>
      );
    }

    return (
      <span role="status" aria-label={label} title={label} className={dotClassName}>
        {formatCount(count)}
      </span>
    );
  }

  // inline variant — 칩(작은 점 마커 + "미기록 N명")
  const chipClassName =
    'inline-flex items-center gap-1.5 rounded-full border border-sp-border bg-sp-surface px-2.5 py-1 text-xs font-medium text-sp-muted';

  const content = (
    <>
      <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" aria-hidden="true" />
      {label}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={`${chipClassName} hover:text-sp-text hover:bg-sp-card transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent`}
      >
        {content}
      </button>
    );
  }

  return (
    <span role="status" aria-label={label} className={chipClassName}>
      {content}
    </span>
  );
}
