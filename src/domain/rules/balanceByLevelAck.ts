/**
 * balanceByLevelAck — Seating '학업성취도 균형' 토글 ack 흐름 (R10)
 *
 * 토글 첫 활성화 시 사용자에게 "이 자리 배치는 학생의 학업성취도 등급을 시각적으로
 * 추론할 수 있게 할 수 있습니다. 화면 공유, 칠판 게시, 학부모 공개 시 주의하세요."
 * 안내를 보여주고 체크박스 확인을 받는다.
 *
 * 본 모듈은 ack 상태 + 토글 의도를 받아 다음 액션을 결정하는 **순수 로직**.
 * UI/IO 분리를 위해 컴포넌트에서 분리되었다 (테스트 용이성).
 *
 * 관련 ADR: docs/architecture/student-pii-adr-v1.2.md Decision 3 + Architect §R10
 */
export interface BalanceByLevelAckState {
  /** 사용자가 이미 R10 안내를 확인한 적 있는지 */
  readonly acknowledged: boolean;
  /** 현재 토글 상태 */
  readonly enabled: boolean;
}

export type BalanceByLevelToggleAction =
  | { readonly kind: 'show-ack-modal' }
  | { readonly kind: 'enable' }
  | { readonly kind: 'disable' }
  | { readonly kind: 'noop' };

/**
 * 사용자의 토글 요청(enable/disable)을 받아 다음 액션 결정.
 *
 * - `requestedEnabled === true`:
 *   - 이미 enabled → noop
 *   - 아직 acknowledged 안 됨 → show-ack-modal (모달 후 confirmAck → enable)
 *   - 이미 acknowledged → enable 즉시
 * - `requestedEnabled === false`:
 *   - 이미 disabled → noop
 *   - enabled → disable 즉시 (ack 흐름 없음)
 */
export function decideToggleAction(
  state: BalanceByLevelAckState,
  requestedEnabled: boolean,
): BalanceByLevelToggleAction {
  if (requestedEnabled) {
    if (state.enabled) return { kind: 'noop' };
    if (!state.acknowledged) return { kind: 'show-ack-modal' };
    return { kind: 'enable' };
  }
  if (!state.enabled) return { kind: 'noop' };
  return { kind: 'disable' };
}

/**
 * ack 모달의 체크박스 확인 후 호출. ack 상태 + enabled 동시 true로 변경.
 */
export function confirmAck(state: BalanceByLevelAckState): BalanceByLevelAckState {
  return { ...state, acknowledged: true, enabled: true };
}

/**
 * settings에서 ack reset 호출. ack 해제 + 다음 활성화 시 다시 모달 표시.
 * enabled는 reset의 일부로 함께 false (안전 기본값).
 *
 * (현재 인자 의존성 없음 — 향후 부분 reset 지원 시 활용.)
 */
export function resetAck(): BalanceByLevelAckState {
  return { acknowledged: false, enabled: false };
}

/**
 * R10 안내 카피 (UI에서 사용).
 */
export const R10_ACK_COPY = {
  title: '학업성취도 균형 활성화 안내',
  body:
    '이 자리 배치는 학생의 학업성취도 등급을 시각적으로 추론할 수 있게 할 수 있습니다.\n' +
    '화면 공유, 칠판 게시, 학부모 공개 시 주의하세요.',
  checkbox: '안내를 확인했으며 위 위험을 인지합니다.',
  cancel: '취소',
  confirm: '확인하고 활성화',
} as const;
