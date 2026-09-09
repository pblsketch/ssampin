import { describe, it, expect, vi } from 'vitest';
import { ToolPopupSlotRegistry, asSnapshotEnvelope } from './toolPopupSession';

describe('ToolPopupSlotRegistry — 칸 모으기와 되돌리기', () => {
  it('등록된 칸을 한 봉투로 담고 칸별로 되돌린다', () => {
    const registry = new ToolPopupSlotRegistry();
    const resumedA = vi.fn();
    const resumedB = vi.fn();
    registry.register('a', { capture: () => ({ n: 1 }), resume: resumedA });
    registry.register('b', { capture: () => 'hello', resume: resumedB });

    const envelope = registry.capture(1_700_000_000_000);
    expect(envelope).toEqual({
      version: 1,
      capturedAt: 1_700_000_000_000,
      slots: { a: { n: 1 }, b: 'hello' },
    });

    registry.resume(envelope);
    expect(resumedA).toHaveBeenCalledWith({ n: 1 }, 1_700_000_000_000);
    expect(resumedB).toHaveBeenCalledWith('hello', 1_700_000_000_000);
  });

  it('봉투에 없는 칸은 건드리지 않는다 — 화면 구성이 다른 창에서도 안전하다', () => {
    const registry = new ToolPopupSlotRegistry();
    const resumed = vi.fn();
    registry.register('only-here', { capture: () => 1, resume: resumed });
    registry.resume({ version: 1, capturedAt: 1, slots: { somewhere: 'else' } });
    expect(resumed).not.toHaveBeenCalled();
  });

  it('등록을 풀면 더 이상 담기지 않는다', () => {
    const registry = new ToolPopupSlotRegistry();
    const unregister = registry.register('a', { capture: () => 1, resume: () => {} });
    unregister();
    expect(registry.capture(1).slots).toEqual({});
  });

  it('★capture 는 담기 전에 먼저 멈춘다 — 두 창에서 알람이 두 번 울리지 않게', () => {
    const registry = new ToolPopupSlotRegistry();
    let ticking = true;
    let alarms = 0;
    registry.register('timer', {
      capture: () => {
        ticking = false; // 계약: 담기 전에 정지
        return { ticking };
      },
      resume: (snapshot) => {
        if ((snapshot as { ticking: boolean }).ticking) alarms += 1;
      },
    });

    const envelope = registry.capture(1);
    expect(ticking).toBe(false);
    expect(envelope.slots['timer']).toEqual({ ticking: false });

    registry.resume(envelope);
    expect(alarms).toBe(0);
  });
});

describe('asSnapshotEnvelope — 낯선 값 거르기', () => {
  it('우리가 만든 봉투만 통과시킨다', () => {
    expect(asSnapshotEnvelope({ version: 1, capturedAt: 5, slots: {} })).toEqual({
      version: 1,
      capturedAt: 5,
      slots: {},
    });
  });

  it('모양이 다르면 null — 새로 시작한다', () => {
    expect(asSnapshotEnvelope(null)).toBeNull();
    expect(asSnapshotEnvelope('문자열')).toBeNull();
    expect(asSnapshotEnvelope({ version: 2, capturedAt: 5, slots: {} })).toBeNull();
    expect(asSnapshotEnvelope({ version: 1, capturedAt: 'x', slots: {} })).toBeNull();
    expect(asSnapshotEnvelope({ version: 1, capturedAt: 5 })).toBeNull();
  });
});
