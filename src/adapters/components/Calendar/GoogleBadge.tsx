interface GoogleBadgeProps {
  className?: string;
}

export function GoogleBadge({ className = '' }: GoogleBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full bg-blue-500/10 px-1.5 py-0.5 text-caption font-medium text-blue-400 ${className}`}
      title="구글 캘린더"
    >
      <span className="material-symbols-outlined text-icon-xs">language</span>
      G
    </span>
  );
}
