interface SegmentOption<K extends string> {
  key: K;
  label: string;
}

interface SegmentedControlProps<K extends string> {
  options: readonly SegmentOption<K>[];
  value: K;
  onChange: (key: K) => void;
  /** 접근성 라벨 (tablist). */
  ariaLabel?: string;
}

/**
 * iOS 식 pill 세그먼트 토글 (2~3 옵션). 페이지 헤더 아래 sticky 배치 권장.
 * 좌우 스와이프 탭 전환과 충돌하지 않도록 터치 이벤트 전파를 막는다.
 */
export function SegmentedControl<K extends string>({
  options,
  value,
  onChange,
  ariaLabel = '보기 선택',
}: SegmentedControlProps<K>) {
  const stop = (e: React.TouchEvent) => e.stopPropagation();
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex gap-0.5 rounded-lg bg-sp-card p-0.5"
      onTouchStart={stop}
      onTouchEnd={stop}
    >
      {options.map((opt) => {
        const selected = opt.key === value;
        return (
          <button
            key={opt.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(opt.key)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm transition-colors min-h-[36px] ${
              selected
                ? 'bg-sp-accent/20 text-sp-accent font-semibold'
                : 'text-sp-muted font-medium'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
