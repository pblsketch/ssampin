import { useEffect, useRef, useState } from 'react';
import { Kbd } from '@adapters/components/common/Kbd';
import { eventToCombo, comboToDisplay, isMacOS } from '@adapters/hooks/shortcut/keyNormalize';

interface Props {
  combo: string;
  onChange: (combo: string) => void;
  disabled?: boolean;
}

const CAPTURE_TIMEOUT_MS = 10_000;
const MAC = isMacOS();

export function KeyCaptureInput({ combo, onChange, disabled }: Props): JSX.Element {
  const [capturing, setCapturing] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!capturing) return;

    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setCapturing(false);
        return;
      }
      const next = eventToCombo(e);
      if (!next) return; // 모디파이어만 누른 경우 대기
      e.preventDefault();
      onChange(next);
      setCapturing(false);
    };

    window.addEventListener('keydown', handler, true);
    timeoutRef.current = setTimeout(() => setCapturing(false), CAPTURE_TIMEOUT_MS);

    return () => {
      window.removeEventListener('keydown', handler, true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [capturing, onChange]);

  const display = comboToDisplay(combo, MAC);

  return (
    <div className="flex items-center gap-2">
      {capturing ? (
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-sp-accent/10 ring-1 ring-sp-accent/40 text-xs text-sp-accent animate-pulse font-sp-medium">
          키를 누르세요…
        </span>
      ) : (
        <Kbd combo={display} />
      )}
      <button
        type="button"
        onClick={() => setCapturing((c) => !c)}
        disabled={disabled}
        className="px-2.5 py-1 rounded-md text-xs text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-colors disabled:opacity-50"
      >
        {capturing ? '취소' : '변경'}
      </button>
    </div>
  );
}
