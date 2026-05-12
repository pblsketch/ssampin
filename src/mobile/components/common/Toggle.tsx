interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}

/**
 * 접근성을 갖춘 on/off 스위치. role="switch" + aria-checked.
 * 모바일 설정 토글 전반에 재사용.
 */
export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${checked ? 'bg-sp-accent' : 'bg-sp-border'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`}
      />
    </button>
  );
}
