/**
 * 옆핀을 강제로 숨겨야 하는 이유를 모아 두고, 언제 풀지 정한다 — 순수 로직.
 *
 * 이유를 **하나만** 들고 있으면 안 되는 까닭이 있다. 잠금과 절전은 겹쳐서 일어난다.
 * 잠근 채로 절전에 들어갔다가 깨어나면 `resume`이 먼저 오고, `unlock-screen`은
 * 사용자가 실제로 로그인해야 온다. 그 사이에 보호를 풀면
 * **잠금 화면 위로 손잡이와 메모 내용이 그대로 드러난다.**
 *
 * 이유마다 **등급**이 다르다는 것도 중요하다. 잠금·절전은 선생님이 확실히 자리에
 * 없다고 볼 수 있어 `force`(최대 반응 — 패널까지 파괴)를 쓰지만, 전체화면은
 * PPT 슬라이드쇼 같은 상황을 **추측**으로 판단하는 것이라 `soft`(둘 다 감추되 패널 창은 살려 둠)로
 * 충분하고, 여기에 `force`급 반응을 물리면 오탐 한 번에 쓰던 메모가 날아간다.
 *
 * 여러 이유가 동시에 걸려 있을 때 `Set` 삽입 순서로 "아무 이유나" 골라 돌려주면
 * 등급이 낮은 이유가 살아남는 사고가 난다. 실제 사고 시나리오: PPT 발표 중이라
 * `fullscreen`이 먼저 걸리고, 그 상태로 절전에 들어가 `suspend`·`lock`이 추가된다.
 * 깨어날 때 `resume`이 `unlock-screen`보다 먼저 오므로 `release('suspend')`가
 * 호출되는데, 이때 남은 이유를 Set 삽입 순서로 고르면 첫 번째로 들어온 `fullscreen`
 * (soft)이 뽑혀 나와 **아직 잠금 화면인데 보호가 약한 등급으로 내려간다**(패널 창이 되살아나
 * 잠금 화면 뒤에 내용이 남는다). 그래서 `protect()`·
 * `release()`는 남은 이유 중 **가장 높은 등급**을 항상 돌려준다 — soft와 force가
 * 함께 걸려 있으면 언제나 force가 이긴다.
 *
 * 창을 다루지 않고 판단만 한다. 그래야 실제로 잠그고 재우지 않고도 시험할 수 있다.
 */

/** MIRROR: src/domain/entities/SidePinRuntimeState.ts 의 SidePinProtectReason 중 트래커가 다루는 세 가지.
 *  나머지 둘은 트래커를 거치지 않는다 — `adapter-unhealthy`는 전이 함수가 직접 설정하고
 *  (resolveSidePinTransition.ts:647, :670), `virtual-desktop-hidden`은 아직 배선돼 있지 않다. */
export type SidePinTrackedProtectReason = 'lock' | 'suspend' | 'fullscreen';

/** 이유의 심각도. 같은 순간 여러 이유가 걸려 있으면 `force`가 `soft`를 이긴다. */
export type SidePinProtectSeverity = 'force' | 'soft';

const SEVERITY_BY_REASON: Readonly<Record<SidePinTrackedProtectReason, SidePinProtectSeverity>> = {
  lock: 'force',
  suspend: 'force',
  fullscreen: 'soft',
};

/** 여러 이유 중 가장 높은 등급을 가진 것 하나를 고른다. 후보가 비어 있으면 undefined. */
function pickHighestSeverity(
  candidates: ReadonlySet<SidePinTrackedProtectReason>,
): { reason: SidePinTrackedProtectReason; severity: SidePinProtectSeverity } | undefined {
  let best: { reason: SidePinTrackedProtectReason; severity: SidePinProtectSeverity } | undefined;
  for (const reason of candidates) {
    const severity = SEVERITY_BY_REASON[reason];
    if (best === undefined || (severity === 'force' && best.severity === 'soft')) {
      best = { reason, severity };
    }
  }
  return best;
}

export type SidePinProtectionDecision =
  /** 이 이유로 숨긴다. `severity`는 남은 이유 중 최고 등급 — 호출부가 force-protect/soft-protect를 가른다 */
  | {
      readonly kind: 'protect';
      readonly reason: SidePinTrackedProtectReason;
      readonly severity: SidePinProtectSeverity;
    }
  /** 남은 이유가 없다 — 다시 보여도 된다 */
  | { readonly kind: 'release' }
  /** 상태가 그대로다 — 아무것도 보내지 않는다 */
  | { readonly kind: 'none' };

export interface SidePinProtectionTracker {
  protect(reason: SidePinTrackedProtectReason): SidePinProtectionDecision;
  release(reason: SidePinTrackedProtectReason): SidePinProtectionDecision;
  /** 지금 숨어 있어야 하는가 */
  isProtected(): boolean;
}

export function createSidePinProtectionTracker(): SidePinProtectionTracker {
  const reasons = new Set<SidePinTrackedProtectReason>();

  return {
    protect(reason) {
      // 같은 이유가 두 번 와도(중복 이벤트) 상태는 그대로다.
      if (reasons.has(reason)) return { kind: 'none' };
      reasons.add(reason);

      // 방금 추가한 이유만이 아니라, 지금 걸려 있는 모든 이유 중 최고 등급을 돌려준다.
      // 이미 force가 걸린 상태에서 soft가 추가돼도 force를 유지해야 하기 때문이다.
      // reasons에 방금 추가했으므로 pickHighestSeverity는 항상 값을 돌려주지만,
      // 타입상으로는 undefined일 수 있어 방금 추가한 이유를 기본값으로 둔다.
      const best = pickHighestSeverity(reasons) ?? { reason, severity: SEVERITY_BY_REASON[reason] };
      return { kind: 'protect', reason: best.reason, severity: best.severity };
    },

    release(reason) {
      if (!reasons.delete(reason)) return { kind: 'none' };

      // 아직 다른 이유가 남아 있으면 계속 숨긴다. 남은 이유 중 최고 등급으로 상태를
      // 다시 세워 "무엇 때문에, 얼마나 강하게 숨었는지"가 실제와 어긋나지 않게 한다.
      const best = pickHighestSeverity(reasons);
      if (best !== undefined)
        return { kind: 'protect', reason: best.reason, severity: best.severity };

      return { kind: 'release' };
    },

    isProtected() {
      return reasons.size > 0;
    },
  };
}
