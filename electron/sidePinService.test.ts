/**
 * 옆핀 조립부 테스트 — 조각들이 실제로 연결됐는지 본다.
 *
 * 규칙·창·위치 계산은 각자 이미 시험했다. 여기서 확인하는 것은 배선이다:
 * 켜면 손잡이가 실제로 그 자리에 뜨는가, 모니터가 사라지면 저장값까지 고치는가.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createSidePinService, type SidePinDisplaySnapshot } from './sidePinService';
import { SIDE_PIN_RAIL_WIDTH, type SidePinDisplayInfo } from './sidePinGeometry';
import {
  DEFAULT_SIDE_PIN_DEVICE_STATE,
  type SidePinDeviceState,
  type SidePinDeviceStateSaveResult,
} from './sidePinDeviceState';
import type { SidePinWindowLike } from './sidePinWindow';
import type { SidePinScheduler } from '../src/usecases/sidePin/SidePinScheduler';
import type { SidePinBounds } from '../src/usecases/sidePin/SidePinWindowHost';

const PRIMARY: SidePinDisplayInfo = {
  id: '1',
  workArea: { x: 0, y: 0, width: 1920, height: 1040 },
};
const SECOND: SidePinDisplayInfo = {
  id: '2',
  workArea: { x: 1920, y: 0, width: 1600, height: 900 },
};

class FakeWindow implements SidePinWindowLike {
  bounds: SidePinBounds | null = null;
  destroyed = false;
  visible = false;
  readonly sent: string[] = [];

  setBounds(bounds: SidePinBounds): void {
    this.bounds = bounds;
  }
  showInactive(): void {
    this.visible = true;
  }
  focus(): void {
    this.visible = true;
  }
  hide(): void {
    this.visible = false;
  }
  destroy(): void {
    this.destroyed = true;
  }
  isDestroyed(): boolean {
    return this.destroyed;
  }
  send(channel: string): void {
    this.sent.push(channel);
  }
}

/** 시간을 직접 굴리는 가짜 시계 */
function fakeScheduler(): SidePinScheduler & { advanceTo(ms: number): void } {
  let current = 0;
  let pending: { dueAtMs: number; cb: () => void } | null = null;
  return {
    now: () => current,
    schedule: (dueAtMs, cb) => {
      pending = { dueAtMs, cb };
    },
    cancel: () => {
      pending = null;
    },
    advanceTo(ms: number): void {
      current = ms;
      const due = pending;
      if (due !== null && ms >= due.dueAtMs) {
        pending = null;
        due.cb();
      }
    },
  };
}

interface Harness {
  windows: FakeWindow[];
  saved: SidePinDeviceState[];
  snapshot: SidePinDisplaySnapshot;
  fallbacks: string[];
  service: ReturnType<typeof createSidePinService>;
  scheduler: ReturnType<typeof fakeScheduler>;
}

function makeHarness(overrides: { device?: SidePinDeviceState } = {}): Harness {
  const windows: FakeWindow[] = [];
  const saved: SidePinDeviceState[] = [];
  const fallbacks: string[] = [];
  const scheduler = fakeScheduler();
  const state: { snapshot: SidePinDisplaySnapshot } = {
    snapshot: { displays: [PRIMARY], primaryDisplayId: '1' },
  };
  let device = overrides.device ?? DEFAULT_SIDE_PIN_DEVICE_STATE;

  const service = createSidePinService({
    factory: {
      create: () => {
        const w = new FakeWindow();
        windows.push(w);
        return w;
      },
    },
    scheduler,
    readDisplays: () => state.snapshot,
    loadDeviceState: () => device,
    saveDeviceState: (next): SidePinDeviceStateSaveResult => {
      device = next;
      saved.push(next);
      return 'saved';
    },
    onDisplayFallback: (id) => fallbacks.push(id),
  });

  return {
    windows,
    saved,
    fallbacks,
    scheduler,
    service,
    get snapshot() {
      return state.snapshot;
    },
    set snapshot(next: SidePinDisplaySnapshot) {
      state.snapshot = next;
    },
  } as Harness;
}

let h: Harness;
beforeEach(() => {
  h = makeHarness();
});

/** 비동기 창 응답이 반영될 때까지 */
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('켜고 끄기', () => {
  test('켜면 손잡이가 오른쪽 끝에 실제로 뜬다', async () => {
    h.service.enable();
    await flush();

    expect(h.windows).toHaveLength(1);
    expect(h.windows[0]?.visible).toBe(true);
    expect(h.windows[0]?.bounds).toEqual({
      x: 1920 - SIDE_PIN_RAIL_WIDTH,
      y: 0,
      width: SIDE_PIN_RAIL_WIDTH,
      height: 1040,
    });
  });

  test('끄면 창이 사라진다', async () => {
    h.service.enable();
    await flush();

    h.service.disable();
    await flush();

    expect(h.windows[0]?.destroyed).toBe(true);
  });

  test('꺼진 상태에서는 마우스를 올려도 창을 만들지 않는다', async () => {
    h.service.dispatch({ type: 'pointer-region-changed', region: 'rail-widget' });
    await flush();

    expect(h.windows).toHaveLength(0);
  });
});

describe('호버로 펼치기 — 배선 전 구간', () => {
  test('손잡이 진입 → 180ms → 그려짐까지 이어지면 패널 크기가 된다', async () => {
    h.service.enable();
    await flush();

    h.service.dispatch({ type: 'pointer-region-changed', region: 'rail-widget' });
    await flush();
    h.scheduler.advanceTo(180);
    await flush();

    // 창이 준비되고 보여달라는 요청까지 갔다
    expect(h.service.getState().surface).toBe('opening');

    const win = h.windows[0];
    expect(win?.bounds?.width).toBe(DEFAULT_SIDE_PIN_DEVICE_STATE.panelWidth);
  });
});

describe('AC-18 — 저장된 모니터가 사라졌을 때', () => {
  test('다른 화면으로 옮기고 저장값도 고친다', () => {
    h = makeHarness({
      device: { ...DEFAULT_SIDE_PIN_DEVICE_STATE, displayId: '뽑혀버린-모니터' },
    });

    const layout = h.service.getLayout();

    expect(layout).not.toBeNull();
    expect(h.saved).toHaveLength(1);
    expect(h.saved[0]?.displayId).toBe('1');
    expect(h.fallbacks).toEqual(['1']);
  });

  test('같은 대체를 반복해서 저장하지 않는다', () => {
    h = makeHarness({
      device: { ...DEFAULT_SIDE_PIN_DEVICE_STATE, displayId: '없는-모니터' },
    });

    h.service.getLayout();
    h.service.getLayout();
    h.service.getLayout();

    expect(h.saved).toHaveLength(1);
  });

  test('고른 모니터가 그대로 있으면 저장값을 건드리지 않는다', () => {
    h = makeHarness({ device: { ...DEFAULT_SIDE_PIN_DEVICE_STATE, displayId: '2' } });
    h.snapshot = { displays: [PRIMARY, SECOND], primaryDisplayId: '1' };

    const layout = h.service.getLayout();

    expect(layout?.rail.x).toBe(1920 + 1600 - SIDE_PIN_RAIL_WIDTH);
    expect(h.saved).toEqual([]);
  });

  test('쓸 수 있는 모니터가 없으면 배치가 없다고 답한다', () => {
    h.snapshot = { displays: [], primaryDisplayId: '1' };

    expect(h.service.getLayout()).toBeNull();
  });

  test('모니터가 없으면 펼치기가 조용히 성공하지 않는다', async () => {
    h.service.enable();
    await flush();
    h.snapshot = { displays: [], primaryDisplayId: '1' };

    h.service.dispatch({ type: 'pointer-region-changed', region: 'rail-widget' });
    await flush();
    h.scheduler.advanceTo(180);
    await flush();

    // 창을 못 그리므로 펼쳐진 것으로 확정되면 안 된다
    expect(h.service.getState().surface).not.toBe('expanded');
  });
});

describe('모니터 구성 변경', () => {
  test('배치가 바뀌면 창 위치를 다시 잡는다', async () => {
    h.service.enable();
    await flush();
    h.snapshot = { displays: [SECOND], primaryDisplayId: '2' };

    h.service.handleDisplayChange();
    await flush();

    expect(h.windows[0]?.bounds).toEqual({
      x: 1920 + 1600 - SIDE_PIN_RAIL_WIDTH,
      y: 0,
      width: SIDE_PIN_RAIL_WIDTH,
      height: 900,
    });
  });
});

describe('정리', () => {
  test('dispose 뒤에는 예약이 남지 않는다', async () => {
    h.service.enable();
    await flush();
    h.service.dispatch({ type: 'pointer-region-changed', region: 'rail-widget' });
    await flush();

    h.service.dispose();
    const before = h.service.getState().revision;
    h.scheduler.advanceTo(10_000);
    await flush();

    expect(h.service.getState().revision).toBe(before);
  });

  test('창 만드는 일은 주입받는다 — Electron 없이 전 구간이 시험된다', () => {
    const create = vi.fn(() => new FakeWindow());
    const service = createSidePinService({
      factory: { create },
      scheduler: fakeScheduler(),
      readDisplays: () => ({ displays: [PRIMARY], primaryDisplayId: '1' }),
      loadDeviceState: () => DEFAULT_SIDE_PIN_DEVICE_STATE,
      saveDeviceState: () => 'saved',
    });

    service.enable();

    expect(create).toHaveBeenCalledTimes(1);
  });
});
