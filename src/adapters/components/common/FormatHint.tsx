interface FormatHintProps {
  formats: string;
  className?: string;
}

export function FormatHint({ formats, className = '' }: FormatHintProps) {
  return (
    <p className={`text-[11px] text-sp-muted flex items-center gap-1 ${className}`}>
      <span className="material-symbols-outlined text-icon-xs">info</span>
      지원 형식: {formats}
    </p>
  );
}
