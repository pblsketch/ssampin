import { describe, it, expect } from 'vitest';
import {
  decideToggleAction,
  confirmAck,
  resetAck,
  R10_ACK_COPY,
  type BalanceByLevelAckState,
} from './balanceByLevelAck';

/**
 * BalanceByLevelToggle.ack 흐름 테스트 (Critic C#7)
 *
 * Acceptance:
 * - 'first toggle blocks on ack checkbox; reset clears ack state'
 */

const FRESH: BalanceByLevelAckState = { acknowledged: false, enabled: false };

describe('balanceByLevelAck', () => {
  it('first activation requests ack modal (blocks toggle)', () => {
    const action = decideToggleAction(FRESH, true);
    expect(action.kind).toBe('show-ack-modal');
  });

  it('after confirmAck: state becomes acknowledged + enabled', () => {
    const next = confirmAck(FRESH);
    expect(next).toEqual({ acknowledged: true, enabled: true });
  });

  it('subsequent activation (after ack) enables immediately, no modal', () => {
    const acked = confirmAck(FRESH);
    // disable
    expect(decideToggleAction(acked, false).kind).toBe('disable');
    // re-enable: 모달 없이 enable
    const reEnabled: BalanceByLevelAckState = { acknowledged: true, enabled: false };
    expect(decideToggleAction(reEnabled, true).kind).toBe('enable');
  });

  it('resetAck: clears acknowledged + enabled (다음 활성화 시 모달 재표시)', () => {
    const reset = resetAck();
    expect(reset).toEqual({ acknowledged: false, enabled: false });
    // 이후 다시 ack 모달이 뜸
    expect(decideToggleAction(reset, true).kind).toBe('show-ack-modal');
  });

  it('idempotent: enabled=true에서 enable 요청 → noop', () => {
    const acked = confirmAck(FRESH);
    expect(decideToggleAction(acked, true).kind).toBe('noop');
  });

  it('disabled=false 상태에서 disable 요청 → noop', () => {
    expect(decideToggleAction(FRESH, false).kind).toBe('noop');
  });

  it('R10_ACK_COPY: 한국어 추론 위험 안내 카피 포함', () => {
    expect(R10_ACK_COPY.body).toContain('학업성취도 등급을 시각적으로 추론');
    expect(R10_ACK_COPY.body).toContain('화면 공유, 칠판 게시, 학부모 공개');
    expect(R10_ACK_COPY.checkbox).toContain('확인');
  });
});
