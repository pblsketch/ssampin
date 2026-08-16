export interface ShortcutTriggerGate {
  shouldDispatch(): boolean;
}

/** 전역 단축키와 렌더러 폴백이 한 키 입력을 두 번 보내는 것을 막는다. */
export function createShortcutTriggerGate(
  debounceMs = 250,
  now: () => number = Date.now,
): ShortcutTriggerGate {
  let lastDispatchedAt = Number.NEGATIVE_INFINITY;

  return {
    shouldDispatch(): boolean {
      const current = now();
      if (current - lastDispatchedAt < debounceMs) return false;
      lastDispatchedAt = current;
      return true;
    },
  };
}
