import { useState } from 'react';
import {
  addPreset,
  canAddPreset,
  DEFAULT_TIMER_PRESETS,
  MAX_TIMER_PRESETS,
  removePreset,
} from '@domain/rules/timerSettings';
import { useToastStore } from '@adapters/components/common/Toast';
import { CustomTimeModal } from './CustomTimeModal';
import { formatPresetLabel } from './TimerControls';

/**
 * 프리셋 칩 줄과 편집(ADR-139, spec 3-1, 설계 8-1·8-2).
 *
 * - 현재 설정 시간과 같은 칩이 선택된 것으로 보인다.
 * - 편집(데스크톱만): 칩 × 로 빼기, [추가]로 더하기(최대 8개, 같은 값은 한 번), [기본값으로].
 *   바꾸면 곧바로 동기화되는 설정에 저장된다.
 */
export function TimerPresetBar({
  presets,
  currentSeconds,
  disabled,
  editable,
  onSelect,
  onCustom,
  onChangePresets,
}: {
  readonly presets: readonly number[];
  readonly currentSeconds: number;
  readonly disabled: boolean;
  readonly editable: boolean;
  readonly onSelect: (seconds: number) => void;
  readonly onCustom: () => void;
  readonly onChangePresets: (next: readonly number[]) => void;
}): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const showToast = useToastStore((s) => s.show);
  const isCustom = !presets.includes(currentSeconds);

  const chipBase = 'px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors';
  const chipOff =
    'bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent';
  const chipOn = 'bg-sp-accent text-sp-accent-fg border border-sp-accent';

  if (editing) {
    return (
      <div className="flex flex-col items-center gap-2 w-full">
        <div className="flex flex-wrap justify-center gap-2">
          {presets.map((seconds) => (
            <span
              key={seconds}
              className="inline-flex items-center gap-1 pl-3.5 pr-1.5 py-1.5 rounded-full text-sm bg-sp-card border border-sp-border text-sp-text"
            >
              {formatPresetLabel(seconds)}
              <button
                type="button"
                disabled={presets.length <= 1}
                onClick={() => onChangePresets(removePreset(presets, seconds))}
                aria-label={`${formatPresetLabel(seconds)} 빼기`}
                className="w-5 h-5 rounded-full flex items-center justify-center text-sp-muted hover:text-sp-error disabled:opacity-30"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            </span>
          ))}
          <button
            type="button"
            disabled={presets.length >= MAX_TIMER_PRESETS}
            onClick={() => setAdding(true)}
            className={`${chipBase} border border-dashed border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent disabled:opacity-40 flex items-center gap-1`}
          >
            <span className="material-symbols-outlined text-icon-sm">add</span>
            추가
          </button>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {presets.length >= MAX_TIMER_PRESETS && (
            <span className="text-sp-muted">최대 {MAX_TIMER_PRESETS}개까지 담을 수 있어요</span>
          )}
          <button
            type="button"
            onClick={() => {
              onChangePresets(DEFAULT_TIMER_PRESETS);
              showToast('기본 프리셋(1·3·5·10·15·30분)으로 되돌렸어요', 'info');
            }}
            className="text-sp-muted hover:text-sp-error"
          >
            기본값으로
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="px-3 py-1 rounded-full bg-sp-accent text-sp-accent-fg font-medium"
          >
            완료
          </button>
        </div>
        {adding && (
          <CustomTimeModal
            title="프리셋 추가"
            confirmLabel="추가"
            minSeconds={5}
            initialSeconds={420}
            onClose={() => setAdding(false)}
            onConfirm={(seconds) => {
              if (!canAddPreset(presets, seconds)) {
                showToast(
                  presets.includes(seconds) ? '이미 있는 시간이에요' : '더 담을 수 없어요',
                  'error',
                );
                return;
              }
              onChangePresets(addPreset(presets, seconds));
              setAdding(false);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {presets.map((seconds) => (
        <button
          key={seconds}
          type="button"
          onClick={() => onSelect(seconds)}
          disabled={disabled}
          aria-pressed={currentSeconds === seconds}
          className={`${chipBase} ${currentSeconds === seconds ? chipOn : chipOff} disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {formatPresetLabel(seconds)}
        </button>
      ))}
      <button
        type="button"
        onClick={onCustom}
        disabled={disabled}
        aria-pressed={isCustom}
        className={`${chipBase} ${isCustom ? chipOn : chipOff} disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        직접 입력
      </button>
      {editable && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          disabled={disabled}
          title="프리셋 고치기"
          aria-label="프리셋 고치기"
          className="p-1.5 rounded-full text-sp-muted hover:text-sp-text disabled:opacity-40"
        >
          <span className="material-symbols-outlined text-icon-md">edit</span>
        </button>
      )}
    </div>
  );
}
