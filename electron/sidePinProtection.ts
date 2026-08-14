/**
 * 옆핀을 강제로 숨겨야 하는 이유를 모아 두고, 언제 풀지 정한다 — 순수 로직.
 *
 * 이유를 **하나만** 들고 있으면 안 되는 까닭이 있다. 잠금과 절전은 겹쳐서 일어난다.
 * 잠근 채로 절전에 들어갔다가 깨어나면 `resume`이 먼저 오고, `unlock-screen`은
 * 사용자가 실제로 로그인해야 온다. 그 사이에 보호를 풀면
 * **잠금 화면 위로 손잡이와 메모 내용이 그대로 드러난다.**
 *
 * 창을 다루지 않고 판단만 한다. 그래야 실제로 잠그고 재우지 않고도 시험할 수 있다.
 */

/** MIRROR: src/domain/entities/SidePinRuntimeState.ts 의 SidePinProtectReason 중 전원 관련 두 가지 */
export type SidePinPowerReason = 'lock' | 'suspend';

export type SidePinProtectionDecision =
  /** 이 이유로 숨긴다 */
  | { readonly kind: 'protect'; readonly reason: SidePinPowerReason }
  /** 남은 이유가 없다 — 다시 보여도 된다 */
  | { readonly kind: 'release' }
  /** 상태가 그대로다 — 아무것도 보내지 않는다 */
  | { readonly kind: 'none' };

export interface SidePinProtectionTracker {
  protect(reason: SidePinPowerReason): SidePinProtectionDecision;
  release(reason: SidePinPowerReason): SidePinProtectionDecision;
  /** 지금 숨어 있어야 하는가 */
  isProtected(): boolean;
}

export function createSidePinProtectionTracker(): SidePinProtectionTracker {
  const reasons = new Set<SidePinPowerReason>();

  return {
    protect(reason) {
      // 같은 이유가 두 번 와도(중복 이벤트) 상태는 그대로다.
      if (reasons.has(reason)) return { kind: 'none' };
      reasons.add(reason);
      return { kind: 'protect', reason };
    },

    release(reason) {
      if (!reasons.delete(reason)) return { kind: 'none' };

      // 아직 다른 이유가 남아 있으면 계속 숨긴다. 남은 이유로 상태를 다시 세워
      // "무엇 때문에 숨었는지"가 실제와 어긋나지 않게 한다.
      const [remaining] = reasons;
      if (remaining !== undefined) return { kind: 'protect', reason: remaining };

      return { kind: 'release' };
    },

    isProtected() {
      return reasons.size > 0;
    },
  };
}
