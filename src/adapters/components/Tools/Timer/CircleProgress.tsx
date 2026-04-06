export function CircleProgress({ ratio, preWarningActive }: { ratio: number; preWarningActive?: boolean }) {
  const radius = 140;
  const stroke = 6;
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference * (1 - ratio);

  const color = preWarningActive
    ? '#f59e0b'
    : ratio > 0.5 ? '#3b82f6' : ratio > 0.2 ? '#f59e0b' : '#ef4444';

  return (
    <svg
      className="absolute inset-0 -rotate-90"
      viewBox="0 0 300 300"
      fill="none"
    >
      <circle
        cx="150"
        cy="150"
        r={radius}
        stroke="currentColor"
        strokeWidth={stroke}
        className="text-sp-border"
      />
      <circle
        cx="150"
        cy="150"
        r={radius}
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashoffset}
        className="transition-all duration-300"
      />
    </svg>
  );
}
