export function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-sp-accent' : 'bg-sp-surface'
        }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white border border-gray-300 transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-[2px]'
          }`}
      />
    </button>
  );
}
