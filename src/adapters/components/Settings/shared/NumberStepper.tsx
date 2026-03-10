export function NumberStepper({
  value,
  min = 1,
  max = 10,
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center bg-sp-surface rounded-lg border border-sp-border p-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-10 h-10 flex items-center justify-center text-sp-muted hover:text-sp-text hover:bg-sp-text/5 rounded-md transition-colors"
      >
        <span className="material-symbols-outlined">remove</span>
      </button>
      <span className="flex-1 text-center text-sp-text font-bold text-lg">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        className="w-10 h-10 flex items-center justify-center text-sp-muted hover:text-sp-text hover:bg-sp-text/5 rounded-md transition-colors"
      >
        <span className="material-symbols-outlined">add</span>
      </button>
    </div>
  );
}
