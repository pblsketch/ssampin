/**
 * 공유 중 포스트잇 배지 (plan.md v2 B-3).
 * 교실 화면에 공유되고 있는 메모임을 항상 보이게 표시한다 — 개인정보 인지 장치.
 */
interface MemoShareBadgeProps {
  className?: string;
}

export function MemoShareBadge({ className = '' }: MemoShareBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-sp-accent px-2 py-0.5 text-xs font-sp-semibold text-white shadow-sm ${className}`}
      title="교실 화면에 공유 중인 메모예요"
    >
      <span className="material-symbols-outlined text-sm leading-none">sensors</span>
      공유 중
    </span>
  );
}
