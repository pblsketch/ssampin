import { useEffect, useRef } from 'react';
import { COLOR_PRESETS } from '@domain/valueObjects/SubjectColor';
import type { SubjectColorId } from '@domain/valueObjects/SubjectColor';

interface InlineColorPaletteProps {
  label: string;
  currentColorId: SubjectColorId;
  onSelect: (colorId: SubjectColorId) => void;
  onClose: () => void;
}

export function InlineColorPalette({ label, currentColorId, onSelect, onClose }: InlineColorPaletteProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Escape key to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute left-1/2 -translate-x-1/2 top-full z-50 mt-1 p-2 rounded-xl bg-sp-card border border-sp-border shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="text-caption text-sp-muted mb-1.5 font-medium text-center">{label}</p>
      <div className="grid grid-cols-8 gap-1.5">
        {COLOR_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            title={p.label}
            onClick={() => onSelect(p.id)}
            className={`w-5 h-5 rounded-full transition-all ${p.tw.bgSolid} ${
              currentColorId === p.id
                ? 'ring-2 ring-sp-accent ring-offset-1 ring-offset-sp-card scale-110'
                : 'hover:scale-110 opacity-70 hover:opacity-100'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
