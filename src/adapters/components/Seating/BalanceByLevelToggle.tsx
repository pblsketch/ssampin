import { useState } from 'react';
import {
  decideToggleAction,
  confirmAck,
  resetAck,
  R10_ACK_COPY,
  type BalanceByLevelAckState,
} from '@domain/rules/balanceByLevelAck';

/**
 * BalanceByLevelToggle — Seating 고급 설정의 '학업성취도 균형' 토글 (P6)
 *
 * 첫 활성 시 R10 ack 모달 차단. 체크박스 동의 후 enable. ack 상태는 부모가 관리 (controlled).
 *
 * 관련 ADR: docs/architecture/student-pii-adr-v1.2.md Decision 3 + Architect §R10
 */
export interface BalanceByLevelToggleProps {
  readonly state: BalanceByLevelAckState;
  readonly onChange: (next: BalanceByLevelAckState) => void;
  /** PII overlay 데이터 비율 (0..1). 50% 미만이면 토글이 disable + 안내. */
  readonly piiCoverage: number;
  readonly onReset?: () => void;
}

export function BalanceByLevelToggle(
  props: BalanceByLevelToggleProps,
): React.ReactElement {
  const { state, onChange, piiCoverage, onReset } = props;
  const [modalOpen, setModalOpen] = useState(false);
  const insufficient = piiCoverage < 0.5;

  const handleToggle = (requested: boolean): void => {
    const action = decideToggleAction(state, requested);
    switch (action.kind) {
      case 'show-ack-modal':
        setModalOpen(true);
        break;
      case 'enable':
        onChange({ ...state, enabled: true });
        break;
      case 'disable':
        onChange({ ...state, enabled: false });
        break;
      case 'noop':
        break;
    }
  };

  const handleConfirm = (): void => {
    onChange(confirmAck(state));
    setModalOpen(false);
  };

  const handleReset = (): void => {
    onChange(resetAck());
    if (onReset) onReset();
  };

  return (
    <div className="space-y-2">
      <label className="flex items-center justify-between gap-3">
        <span className="text-sm text-sp-text">학업성취도 균형</span>
        <input
          type="checkbox"
          checked={state.enabled}
          disabled={insufficient}
          onChange={(e) => handleToggle(e.target.checked)}
          aria-label="학업성취도 균형 토글"
        />
      </label>

      {insufficient && (
        <p className="text-xs text-sp-muted">
          학생 50% 이상에 학업성취도 등급이 입력되어야 사용 가능합니다.
        </p>
      )}

      {state.acknowledged && onReset && (
        <button
          type="button"
          onClick={handleReset}
          className="text-xs text-sp-muted hover:text-sp-text"
        >
          ack 재설정
        </button>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          role="dialog"
          aria-modal="true"
          aria-labelledby="balance-ack-title"
        >
          <div className="w-full max-w-md rounded-xl border border-amber-500/50 bg-sp-card p-6 shadow-2xl">
            <h2 id="balance-ack-title" className="mb-3 text-base font-bold text-amber-300">
              ⚠️ {R10_ACK_COPY.title}
            </h2>
            <p className="mb-4 whitespace-pre-line text-sm text-sp-text">
              {R10_ACK_COPY.body}
            </p>

            <AckCheckboxConfirm onConfirm={handleConfirm} onCancel={() => setModalOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

interface AckCheckboxConfirmProps {
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

function AckCheckboxConfirm({ onConfirm, onCancel }: AckCheckboxConfirmProps): React.ReactElement {
  const [checked, setChecked] = useState(false);
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm text-sp-text">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          aria-label="ack 체크박스"
        />
        {R10_ACK_COPY.checkbox}
      </label>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-sp-border px-3 py-1.5 text-sm text-sp-muted hover:text-sp-text"
        >
          {R10_ACK_COPY.cancel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!checked}
          className="rounded-md bg-sp-accent px-3 py-1.5 text-sm font-medium text-white disabled:bg-sp-border disabled:text-sp-muted"
        >
          {R10_ACK_COPY.confirm}
        </button>
      </div>
    </div>
  );
}
