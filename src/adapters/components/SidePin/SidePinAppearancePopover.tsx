/**
 * 옆핀 안에서 바로 투명도를 조절하는 작은 판.
 *
 * 설정 창을 열지 않고 여기서 조절하게 하는 이유가 있다. 투명도는 **뒤에 무엇이 있느냐에
 * 따라 알맞은 값이 달라진다** — 흰 문서 위와 어두운 영상 위가 다르다. 설정 창을 열면
 * 정작 맞춰야 할 화면이 가려져서, 바꾸고 닫고 다시 보기를 반복하게 된다.
 * 위젯 모드가 창 안에 스타일 판을 둔 것과 같은 이유다.
 *
 * 값은 곧바로 저장한다. 옆핀에는 "확인" 버튼을 둘 자리가 없고, 슬라이더를 움직이는
 * 동안 결과가 바로 보이는 편이 맞추기도 쉽다.
 */
import { SIDE_PIN_MEMO_FOCUS } from './SidePinMemoList';

export interface SidePinAppearancePopoverProps {
  readonly opacity: number;
  readonly cardOpacity: number;
  readonly onOpacityChange: (value: number) => void;
  readonly onCardOpacityChange: (value: number) => void;
  readonly onClose: () => void;
}

export function SidePinAppearancePopover({
  opacity,
  cardOpacity,
  onOpacityChange,
  onCardOpacityChange,
  onClose,
}: SidePinAppearancePopoverProps) {
  return (
    <section
      aria-label="옆핀 모양"
      className="shrink-0 border-b border-sp-border bg-sp-surface px-3 py-2"
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <h3 className="flex-1 text-caption font-semibold text-sp-text">모양</h3>
        <button
          type="button"
          aria-label="모양 설정 닫기"
          onClick={onClose}
          className={`flex h-5 w-5 items-center justify-center rounded-lg text-sp-muted transition-colors duration-sp-quick hover:text-sp-text ${SIDE_PIN_MEMO_FOCUS}`}
        >
          <span aria-hidden className="material-symbols-outlined text-icon-sm leading-none">
            close
          </span>
        </button>
      </div>

      <OpacitySlider label="배경 투명도" value={opacity} onChange={onOpacityChange} />
      <OpacitySlider label="카드 투명도" value={cardOpacity} onChange={onCardOpacityChange} />
    </section>
  );
}

function OpacitySlider({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: number;
  readonly onChange: (value: number) => void;
}) {
  const percent = Math.round(value * 100);

  return (
    <label className="mb-1.5 block last:mb-0">
      <span className="mb-0.5 flex items-center justify-between">
        <span className="text-caption text-sp-muted">{label}</span>
        <span className="text-caption font-medium text-sp-text">{percent}%</span>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={percent}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-sp-border accent-sp-accent"
      />
    </label>
  );
}
