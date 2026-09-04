/**
 * 말로 쓰기 버튼 — OS 받아쓰기를 부르는 단추.
 *
 * ## "듣는 중" 표시를 두지 않는 이유
 *
 * 받아쓰기 패널은 **OS 것**이다. 언제 듣기 시작했고 언제 멈췄는지 앱은 알 수 없다.
 * 그런 상태에서 버튼을 빨갛게 물들이거나 깜빡이게 하면 **거짓말**이 된다 — 선생님이
 * "지금 듣고 있구나" 하고 말했는데 실제로는 패널이 안 떴을 수 있다. 그래서 이 버튼은
 * 누르면 그만이고, 진행 상황은 OS 패널이 직접 보여 준다.
 * (모바일은 앱이 직접 듣기 때문에 그쪽에는 진짜 "듣는 중" 표시가 있다.)
 *
 * ## 생김새
 *
 * 새 시각 언어를 만들지 않는다. 놓이는 자리에 **이미 있는 단추 생김새**를 그대로 쓴다.
 * - `toolbar`: 아이콘+글자 도구 줄용(관찰 입력의 "학생 제출물" 옆과 같은 모양)
 * - `compact`: 좁은 아이콘 줄용(옆핀 머리 줄과 같은 모양)
 */
import { useVoiceTyping } from '@adapters/hooks/useVoiceTyping';

export type VoiceTypingButtonVariant = 'toolbar' | 'compact';

interface Props {
  /** 글자 칸에 커서를 두는 함수. 키를 보내기 전에 불린다. */
  readonly onFocusField: () => void;
  readonly variant?: VoiceTypingButtonVariant;
  /** 좁은 자리에서 초점 테두리 규칙이 따로 있는 경우(옆핀) 덧붙인다. */
  readonly className?: string;
}

const LABEL = '말로 쓰기';

export function VoiceTypingButton({ onFocusField, variant = 'toolbar', className = '' }: Props) {
  const { available, start } = useVoiceTyping();

  // 데스크톱 앱이 아니면 아예 그리지 않는다 — 눌러도 안 되는 단추를 보여 주지 않는다.
  if (!available) return null;

  const handleClick = (): void => {
    void start(onFocusField);
  };

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-label={LABEL}
        title={LABEL}
        className={`flex h-7 w-7 items-center justify-center rounded-lg text-sp-muted transition-colors duration-sp-quick hover:bg-sp-surface hover:text-sp-text ${className}`}
      >
        <span aria-hidden className="material-symbols-outlined text-icon-sm leading-none">
          mic
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={LABEL}
      className={`flex items-center gap-1 text-caption text-sp-muted transition-colors hover:text-sp-accent ${className}`}
    >
      <span aria-hidden className="material-symbols-outlined text-sm">
        mic
      </span>
      {LABEL}
    </button>
  );
}
