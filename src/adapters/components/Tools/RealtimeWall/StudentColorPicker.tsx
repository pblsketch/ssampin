import type { RealtimeWallCardColor } from '@domain/entities/RealtimeWall';
import { REALTIME_WALL_CARD_COLORS } from '@domain/rules/realtimeWallRules';
import {
  REALTIME_WALL_CARD_COLOR_LABELS,
  REALTIME_WALL_CARD_COLOR_SWATCH,
} from './RealtimeWallCardColors';

/**
 * v2.1 신규 — 학생 카드 색상 픽커 (Plan §7.2 결정 #6 / Design v2.1 §5.11).
 *
 * 8색 horizontal scroll radio group. 모달 하단에 inline 표시.
 */

interface StudentColorPickerProps {
  readonly value: RealtimeWallCardColor | undefined;
  readonly onChange: (color: RealtimeWallCardColor) => void;
  readonly disabled?: boolean;
}

export function StudentColorPicker({
  value,
  onChange,
  disabled = false,
}: StudentColorPickerProps) {
  const current = value ?? 'white';
  return (
    <div
      className="flex gap-2 overflow-x-auto py-2"
      role="radiogroup"
      aria-label="카드 색상"
    >
      {REALTIME_WALL_CARD_COLORS.map((color) => {
        const swatch = REALTIME_WALL_CARD_COLOR_SWATCH[color];
        const label = REALTIME_WALL_CARD_COLOR_LABELS[color];
        const isActive = current === color;
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(color)}
            className={[
              'shrink-0 w-8 h-8 rounded-full border-2 transition-all disabled:opacity-40',
              swatch,
              isActive ? 'border-sky-500 ring-2 ring-sky-300' : 'border-transparent',
            ].join(' ')}
            title={label}
          />
        );
      })}
    </div>
  );
}
