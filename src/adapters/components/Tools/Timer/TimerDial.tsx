import type { TimerDisplayStyle } from '@domain/entities/Settings';
import type { TimerColorLevel } from '@domain/rules/timerRules';
import { formatTime } from '@domain/rules/timerRules';
import type { TimerGeometry } from './timerGeometry';

/**
 * 타이머 원(또는 부채꼴)과 숫자(ADR-139, 설계 1·3·4장).
 *
 * - 색은 sp-* 토큰만 쓴다. 평소 색 `--sp-timer-ring-normal` 은 테마 색이 경고색과 헷갈리는
 *   테마(주황·흑백)에서 sp-info 로 바뀐다(useThemeApplier). 값이 없는 창(모바일 등)은 테마 색.
 * - 부채꼴은 숫자를 채운 면 위에 얹지 않고 **아래**에 둔다(spec 2-7).
 */

export function timerLevelColor(level: TimerColorLevel): string {
  if (level === 'critical') return 'var(--sp-error)';
  if (level === 'warning') return 'var(--sp-warning)';
  return 'var(--sp-timer-ring-normal, var(--sp-accent))';
}

/** "05:00" — 콜론만 좁혀 숫자 사이가 벌어져 보이지 않게 한다(설계 2-2). */
export function TimerDigits({
  seconds,
  fontSize,
  paused = false,
  className = '',
  colorClassName = 'text-sp-text',
  prefix,
}: {
  readonly seconds: number;
  readonly fontSize: number;
  readonly paused?: boolean;
  readonly className?: string;
  readonly colorClassName?: string;
  /** "+" 처럼 앞에 붙는 글자(초과 시간). */
  readonly prefix?: string;
}): JSX.Element {
  const [mm, ss] = formatTime(seconds).split(':');
  return (
    <span
      className={`inline-flex items-baseline font-mono font-bold tabular-nums leading-none select-none ${colorClassName} ${
        paused ? 'animate-sp-paused-blink' : ''
      } ${className}`}
      style={{ fontSize }}
      role="timer"
      aria-label={`${prefix === '+' ? '넘긴 시간 ' : ''}${Number(mm)}분 ${Number(ss)}초`}
    >
      {prefix !== undefined && <span aria-hidden="true">{prefix}</span>}
      <span aria-hidden="true">{mm}</span>
      {/* 글자 칸(0.6em)보다 좁은 상자에서는 text-center 가 가운데로 못 모으고 오른쪽 숫자에 겹친다 —
          flex 가운데 정렬은 넘친 만큼을 양쪽으로 나눈다(콜론 양옆은 빈 여백이라 겹쳐도 안 보인다). */}
      <span aria-hidden="true" className="inline-flex justify-center" style={{ width: '0.32em' }}>
        :
      </span>
      <span aria-hidden="true">{ss}</span>
    </span>
  );
}

/** 12시 방향에서 시계 방향으로 ratio 만큼의 부채꼴 경로. */
function pieWedgePath(cx: number, cy: number, r: number, ratio: number): string {
  const clamped = Math.min(1, Math.max(0, ratio));
  if (clamped >= 0.9999) {
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`;
  }
  const angle = clamped * 2 * Math.PI;
  const x = cx + r * Math.sin(angle);
  const y = cy - r * Math.cos(angle);
  const largeArc = clamped > 0.5 ? 1 : 0;
  return `M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 ${largeArc} 1 ${x} ${y} Z`;
}

export function TimerDial({
  remaining,
  total,
  level,
  displayStyle,
  geometry,
  paused = false,
  children,
}: {
  readonly remaining: number;
  readonly total: number;
  readonly level: TimerColorLevel;
  readonly displayStyle: TimerDisplayStyle;
  readonly geometry: TimerGeometry;
  readonly paused?: boolean;
  /** 숫자 대신 그릴 내용(없으면 남은 시간 숫자). */
  readonly children?: React.ReactNode;
}): JSX.Element {
  const { diameter, strokeWidth, digitFontSize } = geometry;
  const ratio = total > 0 ? Math.min(1, Math.max(0, remaining / total)) : 0;
  const color = timerLevelColor(level);
  const digits = children ?? (
    <TimerDigits seconds={remaining} fontSize={digitFontSize} paused={paused} />
  );

  if (displayStyle === 'pie') {
    const r = diameter / 2;
    return (
      <div className="flex flex-col items-center gap-3" data-timer-dial="pie">
        <svg
          width={diameter}
          height={diameter}
          viewBox={`0 0 ${diameter} ${diameter}`}
          aria-hidden="true"
        >
          <circle cx={r} cy={r} r={r} style={{ fill: 'var(--sp-border)' }} />
          {ratio > 0 && (
            <path
              d={pieWedgePath(r, r, r, ratio)}
              style={{ fill: color, transition: 'fill 300ms' }}
            />
          )}
        </svg>
        {digits}
      </div>
    );
  }

  const radius = (diameter - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: diameter, height: diameter }}
      data-timer-dial="ring"
    >
      <svg
        className="absolute inset-0 -rotate-90"
        width={diameter}
        height={diameter}
        viewBox={`0 0 ${diameter} ${diameter}`}
        fill="none"
        aria-hidden="true"
      >
        <circle
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius}
          strokeWidth={strokeWidth}
          style={{ stroke: 'var(--sp-border)' }}
        />
        <circle
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          style={{ stroke: color, transition: 'stroke-dashoffset 300ms linear, stroke 300ms' }}
        />
      </svg>
      <div className="relative z-10 flex items-center justify-center">{digits}</div>
    </div>
  );
}
