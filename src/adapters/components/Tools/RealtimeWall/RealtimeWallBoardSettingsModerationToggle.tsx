import type { RealtimeWallModerationMode } from '@domain/entities/RealtimeWallBoardSettings';

/**
 * v2.1 신규 (Phase A-A5 / Plan FR-A7 / Design v2.1 §5.13).
 *
 * 교사용 보드 설정 — moderation 프리셋 토글 (`'off'` 즉시 공개 / `'manual'` 교사 승인).
 *
 * 정책:
 * - 'off' = Padlet 정합 기본값 (즉시 공개, approvalMode='auto'와 매핑)
 * - 'manual' = 교사 승인 큐 (approvalMode='manual'와 매핑)
 * - 라디오/세그먼트 형태로 양자택일
 * - 변경 시 onChange callback (호출자가 broadcast → boardSettings-changed 송신)
 *
 * Plan FR-A7 / Design v2.1 §13 Phase A 수용 기준 #6.
 */

interface RealtimeWallBoardSettingsModerationToggleProps {
  readonly value: RealtimeWallModerationMode;
  readonly onChange: (next: RealtimeWallModerationMode) => void;
  readonly disabled?: boolean;
}

export function RealtimeWallBoardSettingsModerationToggle({
  value,
  onChange,
  disabled = false,
}: RealtimeWallBoardSettingsModerationToggleProps) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-sp-muted">
        학생 카드를 즉시 공개할지, 교사 승인 후 공개할지 선택하세요.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <ModerationButton
          mode="off"
          label="즉시 공개"
          desc="학생 카드 바로 표시 (Padlet 기본)"
          icon="visibility"
          active={value === 'off'}
          disabled={disabled}
          onClick={() => onChange('off')}
        />
        <ModerationButton
          mode="manual"
          label="교사 승인"
          desc="교사가 보고 승인 후 표시"
          icon="task_alt"
          active={value === 'manual'}
          disabled={disabled}
          onClick={() => onChange('manual')}
        />
      </div>
    </div>
  );
}

interface ModerationButtonProps {
  readonly mode: RealtimeWallModerationMode;
  readonly label: string;
  readonly desc: string;
  readonly icon: string;
  readonly active: boolean;
  readonly disabled: boolean;
  readonly onClick: () => void;
}

function ModerationButton({ label, desc, icon, active, disabled, onClick }: ModerationButtonProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      disabled={disabled}
      className={[
        'flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition',
        active
          ? 'border-sp-accent bg-sp-accent/10 text-sp-accent'
          : 'border-sp-border bg-sp-surface text-sp-muted hover:border-sp-accent/40 hover:text-sp-text',
        disabled && 'cursor-not-allowed opacity-50',
      ].filter(Boolean).join(' ')}
    >
      <span className="material-symbols-outlined text-[18px]">{icon}</span>
      <span className="text-xs font-bold">{label}</span>
      <span className="text-[10px] leading-tight opacity-70">{desc}</span>
    </button>
  );
}
