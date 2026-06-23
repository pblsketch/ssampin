interface RecordEmptyStateProps {
  /** 빈 상태 안내 문구. */
  message?: string;
  /** 필터가 활성일 때만 [필터 초기화] CTA를 노출. */
  hasActiveFilters?: boolean;
  /** 초기화 콜백(hasActiveFilters일 때 필요). */
  onReset?: () => void;
}

/**
 * 기록 조회 빈 상태 공용 부품 — 필터가 걸려 결과가 없을 때 [필터 초기화] CTA를 함께 노출.
 */
export function RecordEmptyState({
  message = '조건에 맞는 기록이 없습니다',
  hasActiveFilters = false,
  onReset,
}: RecordEmptyStateProps) {
  return (
    <div className="py-12 text-center text-sm text-sp-muted">
      <p>{message}</p>
      {hasActiveFilters && onReset && (
        <button
          type="button"
          onClick={onReset}
          className="mt-3 px-3 py-1.5 rounded-lg bg-sp-accent text-white text-xs font-medium hover:brightness-110 transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent"
        >
          필터 초기화
        </button>
      )}
    </div>
  );
}
