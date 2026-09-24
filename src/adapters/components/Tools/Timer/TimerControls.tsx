/**
 * 타이머 탭들이 함께 쓰는 작은 조작 부품(ADR-139, 설계 7-4·8장).
 * 색은 sp-* 토큰만, 채운 배경은 sp-accent 만 쓴다(짝 글자색 sp-accent-fg).
 */

/** 켜고 끄는 스위치 — 스위치 역할과 켜짐 상태를 알린다. */
export function TimerSwitch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
  readonly label: string;
  readonly disabled?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-5 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
        checked ? 'bg-sp-accent' : 'bg-sp-border'
      }`}
    >
      <span
        // left-0 이 없으면 단추의 가운데 정렬 때문에 동그라미가 가운데에서 출발해 밖으로 삐져나간다.
        className={`absolute left-0 top-0.5 w-4 h-4 rounded-full transition-transform ${
          checked ? 'translate-x-5 bg-sp-accent-fg' : 'translate-x-0.5 bg-sp-card'
        }`}
      />
    </button>
  );
}

export interface SegmentOption<T extends string> {
  readonly id: T;
  readonly label: string;
}

/** 몇 개 중 하나를 고르는 단추 묶음. */
export function TimerSegmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  readonly label: string;
  readonly options: readonly SegmentOption<T>[];
  readonly value: T;
  readonly onChange: (next: T) => void;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <span className="text-sm text-sp-text">{label}</span>
      <div
        role="group"
        aria-label={label}
        className="flex gap-1 p-0.5 bg-sp-bg rounded-lg border border-sp-border"
      >
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={value === o.id}
            onClick={() => onChange(o.id)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              value === o.id ? 'bg-sp-accent text-sp-accent-fg' : 'text-sp-muted hover:text-sp-text'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** ± 조정 단추 — 부호와 관계없이 같은 중립 모양(설계 8-3). */
export function AdjustButton({
  sign,
  label,
  seconds,
  disabled,
  onClick,
  compact = false,
  fill = false,
}: {
  readonly sign: 1 | -1;
  readonly label: string;
  readonly seconds: number;
  readonly disabled: boolean;
  readonly onClick: (delta: number) => void;
  readonly compact?: boolean;
  /** 칸 폭을 꽉 채운다(원 양옆 ± 칸). */
  readonly fill?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onClick(sign * seconds)}
      disabled={disabled}
      title={`${label} ${sign > 0 ? '더하기' : '빼기'}`}
      aria-label={`${label} ${sign > 0 ? '더하기' : '빼기'}`}
      className={`flex items-center justify-center gap-1 rounded-lg bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs font-medium ${
        compact ? 'py-2 px-1' : `px-3 py-1.5 ${fill ? 'w-full' : ''}`
      }`}
    >
      <span className="material-symbols-outlined text-icon-sm">{sign > 0 ? 'add' : 'remove'}</span>
      {label}
    </button>
  );
}

export const ADJUST_AMOUNTS = [
  { label: '10초', seconds: 10 },
  { label: '30초', seconds: 30 },
  { label: '1분', seconds: 60 },
  { label: '5분', seconds: 300 },
] as const;

/** 프리셋 칩 이름 — "5분", "1분 30초", "45초". */
export function formatPresetLabel(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}초`;
  if (s === 0) return `${m}분`;
  return `${m}분 ${s}초`;
}
