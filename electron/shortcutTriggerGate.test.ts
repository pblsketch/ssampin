import { describe, expect, test } from 'vitest';
import { createShortcutTriggerGate } from './shortcutTriggerGate';

describe('createShortcutTriggerGate', () => {
  test('전역 경로와 렌더러 폴백이 연달아 오면 한 번만 통과시킨다', () => {
    let now = 1_000;
    const gate = createShortcutTriggerGate(250, () => now);

    expect(gate.shouldDispatch()).toBe(true);
    now += 20;
    expect(gate.shouldDispatch()).toBe(false);
    now += 230;
    expect(gate.shouldDispatch()).toBe(true);
  });
});
