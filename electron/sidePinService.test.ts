/**
 * 옆핀 조립부 테스트 — 조각들이 실제로 연결됐는지 본다.
 *
 * 규칙·창·위치 계산은 각자 이미 시험했다. 여기서 확인하는 것은 배선이다:
 * 켜면 손잡이가 실제로 그 자리에 뜨는가, 모니터가 사라지면 저장값까지 고치는가.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createSidePinService, type SidePinDisplaySnapshot } from './sidePinService';
import {
  SIDE_PIN_RAIL_HEIGHT,
  SIDE_PIN_RAIL_WIDTH,
  type SidePinDisplayInfo,
} from './sidePinGeometry';
import {
  DEFAULT_SIDE_PIN_DEVICE_STATE,
  SIDE_PIN_RAIL_POSITION_DEFAULT,
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
  bounds: SidePinBounds | null;
  destroyed = false;
  visible = false;
  readonly sent: string[] = [];

  constructor(bounds: SidePinBounds) {
    this.bounds = bounds;
  }

  setPosition(bounds: SidePinBounds): void {
    this.bounds = bounds;
  }
  async showInactive(): Promise<void> {
    this.visible = true;
  }
  async focus(): Promise<void> {
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
      create: (_role, bounds) => {
        const w = new FakeWindow(bounds);
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

    expect(h.windows).toHaveLength(2);
    expect(h.windows[0]?.visible).toBe(true);
    expect(h.windows[1]?.visible).toBe(false);
    // 손잡이는 가장자리를 다 덮지 않고 세로 가운데에 짧게 놓인다
    expect(h.windows[0]?.bounds).toEqual({
      x: 1920 - SIDE_PIN_RAIL_WIDTH,
      y: Math.round((1040 - SIDE_PIN_RAIL_HEIGHT) * DEFAULT_SIDE_PIN_DEVICE_STATE.railPosition),
      width: SIDE_PIN_RAIL_WIDTH,
      height: SIDE_PIN_RAIL_HEIGHT,
    });
    expect(h.windows[1]?.bounds).toEqual({ x: 1520, y: 0, width: 400, height: 1040 });
  });

  test('끄면 창이 사라진다', async () => {
    h.service.enable();
    await flush();

    h.service.disable();
    await flush();

    expect(h.windows[0]?.destroyed).toBe(true);
  });

  test('이미 켜진 옆핀에 다시 진입하면 숨은 손잡이를 복구하고 패널을 닫는다', async () => {
    h.service.enable();
    await flush();
    const rail = h.windows[0]!;
    const panel = h.windows[1]!;

    await panel.showInactive();
    rail.hide();
    expect(rail.visible).toBe(false);
    expect(panel.visible).toBe(true);

    h.service.enable();
    await flush();

    expect(rail.visible).toBe(true);
    expect(panel.visible).toBe(false);
    expect(h.service.getState().surface).toBe('collapsed');
    expect(h.service.getState().enabled).toBe(true);
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

    const win = h.windows[1];
    expect(win?.bounds?.width).toBe(DEFAULT_SIDE_PIN_DEVICE_STATE.panelWidth);
  });
});

describe('모니터 지정 (setPreferredDisplay)', () => {
  test('고르면 그 모니터의 오른쪽 끝으로 옮기고 단서까지 저장한다', () => {
    h.snapshot = { displays: [PRIMARY, { ...SECOND, label: '보조화면' }], primaryDisplayId: '1' };

    const result = h.service.setPreferredDisplay('2');

    expect(result).toBe('applied');
    expect(h.service.getLayout()?.rail.x).toBe(1920 + 1600 - SIDE_PIN_RAIL_WIDTH);
    expect(h.saved).toHaveLength(1);
    expect(h.saved[0]?.displayId).toBe('2');
    // 단서가 없으면 번호가 바뀌는 순간 선택을 잃는다
    expect(h.saved[0]?.displayHint).toEqual({
      label: '보조화면',
      x: 1920,
      y: 0,
      width: 1600,
      height: 900,
    });
  });

  test('null 이면 자동(주 모니터)으로 되돌리고 단서도 지운다', () => {
    h.snapshot = { displays: [PRIMARY, SECOND], primaryDisplayId: '1' };
    h.service.setPreferredDisplay('2');

    const result = h.service.setPreferredDisplay(null);

    expect(result).toBe('applied');
    expect(h.service.getPreferredDisplayId()).toBeNull();
    expect(h.saved.at(-1)?.displayHint).toBeNull();
    // 오른쪽에 다른 모니터가 맞닿아 있으면 그 경계를 넘지 않도록 1 DIP 물러난다
    expect(h.service.getLayout()?.rail.x).toBe(1920 - SIDE_PIN_RAIL_WIDTH - 1);
  });

  test('없는 모니터를 고르면 아무것도 바꾸지 않는다', () => {
    const result = h.service.setPreferredDisplay('있지도-않은-모니터');

    expect(result).toBe('unknown-display');
    expect(h.saved).toEqual([]);
    expect(h.service.getPreferredDisplayId()).toBeNull();
  });

  test('★메모를 쓰는 중이면 저장만 하고 화면 이동은 미룬다', async () => {
    h.snapshot = { displays: [PRIMARY, SECOND], primaryDisplayId: '1' };
    h.service.enable();
    await flush();
    const windowCountBefore = h.windows.length;

    h.service.dispatch({ type: 'editor-activity-changed', activity: 'editing' });
    const result = h.service.setPreferredDisplay('2');
    await flush();

    // 저장은 즉시 — 여기서 앱이 꺼져도 선택은 남는다
    expect(result).toBe('deferred');
    expect(h.saved.at(-1)?.displayId).toBe('2');
    // 창은 아직 다시 만들지 않았다 (쓰던 글이 사라지지 않도록)
    expect(h.windows.length).toBe(windowCountBefore);

    // 편집이 끝나면 그때 옮긴다
    h.service.dispatch({ type: 'editor-activity-changed', activity: 'idle' });
    await flush();
    expect(h.service.getLayout()?.rail.x).toBe(1920 + 1600 - SIDE_PIN_RAIL_WIDTH);
  });
});

describe('AC-18(개정) — 저장된 모니터가 사라졌을 때 (ADR-075)', () => {
  test('다른 화면으로 옮기되 저장값은 건드리지 않는다', () => {
    h = makeHarness({
      device: { ...DEFAULT_SIDE_PIN_DEVICE_STATE, displayId: '뽑혀버린-모니터' },
    });

    const layout = h.service.getLayout();

    expect(layout).not.toBeNull();
    // 이번 실행에만 주 모니터로 그린다
    expect(layout?.rail.x).toBe(1920 - SIDE_PIN_RAIL_WIDTH);
    // ★저장값은 그대로다 — 고쳐 버리면 케이블을 뽑을 때마다 선택이 지워진다
    expect(h.saved).toEqual([]);
    expect(h.service.getPreferredDisplayId()).toBe('뽑혀버린-모니터');
    expect(h.fallbacks).toEqual(['1']);
  });

  test('★케이블을 뽑았다 다시 꽂으면 고른 모니터로 돌아온다', () => {
    h = makeHarness({ device: { ...DEFAULT_SIDE_PIN_DEVICE_STATE, displayId: '2' } });
    h.snapshot = { displays: [PRIMARY, SECOND], primaryDisplayId: '1' };
    expect(h.service.getLayout()?.rail.x).toBe(1920 + 1600 - SIDE_PIN_RAIL_WIDTH);

    // 뽑았다 — 주 모니터로 밀려난다
    h.snapshot = { displays: [PRIMARY], primaryDisplayId: '1' };
    expect(h.service.getLayout()?.rail.x).toBe(1920 - SIDE_PIN_RAIL_WIDTH);

    // 다시 꽂았다 — 저장값이 살아 있으므로 원래 자리로 돌아와야 한다
    h.snapshot = { displays: [PRIMARY, SECOND], primaryDisplayId: '1' };
    expect(h.service.getLayout()?.rail.x).toBe(1920 + 1600 - SIDE_PIN_RAIL_WIDTH);
    expect(h.saved).toEqual([]);
  });

  test('같은 대체를 반복해서 알리지 않는다', () => {
    h = makeHarness({
      device: { ...DEFAULT_SIDE_PIN_DEVICE_STATE, displayId: '없는-모니터' },
    });

    h.service.getLayout();
    h.service.getLayout();
    h.service.getLayout();

    // 커서 감시가 50ms마다 부르므로 빗장이 없으면 초당 스무 번씩 알림이 나간다
    expect(h.fallbacks).toEqual(['1']);
    expect(h.saved).toEqual([]);
  });

  test('번호가 바뀌어도 단서로 같은 모니터를 찾아 번호만 갱신한다', () => {
    // 재부팅 뒤 Electron이 같은 모니터에 다른 번호를 붙인 상황
    h = makeHarness({
      device: {
        ...DEFAULT_SIDE_PIN_DEVICE_STATE,
        displayId: '2',
        displayHint: { label: 'DELL U2720Q', x: 1920, y: 0, width: 1600, height: 900 },
      },
    });
    const renumbered: SidePinDisplayInfo = { ...SECOND, id: '99', label: 'DELL U2720Q' };
    h.snapshot = { displays: [PRIMARY, renumbered], primaryDisplayId: '1' };

    const layout = h.service.getLayout();

    // 주 모니터로 밀려나지 않고 원래 그 모니터에 그대로 뜬다
    expect(layout?.rail.x).toBe(1920 + 1600 - SIDE_PIN_RAIL_WIDTH);
    expect(h.fallbacks).toEqual([]);
    // 가리키는 대상이 같으므로 번호는 따라간다 (선택을 잃는 것이 아니다)
    expect(h.service.getPreferredDisplayId()).toBe('99');
    expect(h.saved).toHaveLength(1);
  });

  test('구별할 수 없는 모니터가 둘이면 단서 매칭을 포기한다', () => {
    // 같은 모델 두 대 — 이름도 크기도 같아 자리로만 갈린다
    h = makeHarness({
      device: {
        ...DEFAULT_SIDE_PIN_DEVICE_STATE,
        displayId: '없는번호',
        displayHint: { label: '같은모델', x: 5000, y: 0, width: 1600, height: 900 },
      },
    });
    const twinA: SidePinDisplayInfo = { ...SECOND, id: 'a', label: '같은모델' };
    const twinB: SidePinDisplayInfo = {
      ...SECOND,
      id: 'b',
      label: '같은모델',
      workArea: { x: 3520, y: 0, width: 1600, height: 900 },
    };
    h.snapshot = { displays: [PRIMARY, twinA, twinB], primaryDisplayId: '1' };

    const layout = h.service.getLayout();

    // 아무거나 고르지 않는다 — 주 모니터로 물러나고 저장값은 남긴다
    // (오른쪽에 모니터가 맞닿아 있어 1 DIP 안쪽)
    expect(layout?.rail.x).toBe(1920 - SIDE_PIN_RAIL_WIDTH - 1);
    expect(h.service.getPreferredDisplayId()).toBe('없는번호');
    expect(h.saved).toEqual([]);
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
      y: Math.round((900 - SIDE_PIN_RAIL_HEIGHT) * DEFAULT_SIDE_PIN_DEVICE_STATE.railPosition),
      width: SIDE_PIN_RAIL_WIDTH,
      height: SIDE_PIN_RAIL_HEIGHT,
    });
  });
});

describe('손잡이 높이 이동', () => {
  test('끄는 동안 창이 손을 그대로 따라간다', async () => {
    h.service.enable();
    await flush();
    const startY = h.windows[0]?.bounds?.y ?? 0;

    h.service.setRailDragTop(startY + 10);
    await flush();

    expect(h.windows[0]?.bounds?.y).toBe(startY + 10);
    // 아직 손을 떼지 않았으므로 저장하지 않는다
    expect(h.saved).toEqual([]);
  });

  test('끄는 동안에도 작업 영역 밖으로는 나가지 않는다', async () => {
    h.service.enable();
    await flush();

    h.service.setRailDragTop(PRIMARY.workArea.height + 500);
    await flush();
    expect(h.windows[0]?.bounds?.y).toBe(PRIMARY.workArea.height - SIDE_PIN_RAIL_HEIGHT);

    h.service.setRailDragTop(-500);
    await flush();
    expect(h.windows[0]?.bounds?.y).toBe(PRIMARY.workArea.y);
  });

  test('맨 아래까지 끌면 비율 1로 저장한다', async () => {
    h.service.enable();
    await flush();

    h.service.setRailDragTop(PRIMARY.workArea.height);
    h.service.commitRailDrag();
    await flush();

    expect(h.saved.at(-1)?.railPosition).toBe(1);
    expect(h.windows[0]?.bounds?.y).toBe(PRIMARY.workArea.height - SIDE_PIN_RAIL_HEIGHT);
  });

  test('★손을 떼도 창이 튀지 않는다 — 놓은 자리를 그대로 저장한다', async () => {
    // 8단계로 맞추던 때는 놓는 순간 창이 최대 반 칸(62 DIP) 빠져나가, 끌기 자리가
    // 손 밑에 없어 두 번째 끌기가 시작되지 않았다(2026-08-17 실기기).
    h.service.enable();
    await flush();
    const releasedY = (h.windows[0]?.bounds?.y ?? 0) + 10;

    h.service.setRailDragTop(releasedY);
    await flush();
    h.service.commitRailDrag();
    await flush();

    expect(h.windows[0]?.bounds?.y).toBe(releasedY);
  });

  test('저장한 비율이 다음에 켤 때 같은 자리를 준다', async () => {
    h.service.enable();
    await flush();
    const releasedY = (h.windows[0]?.bounds?.y ?? 0) + 37;

    h.service.setRailDragTop(releasedY);
    h.service.commitRailDrag();
    await flush();

    const saved = h.saved.at(-1);
    if (saved === undefined) throw new Error('놓았는데 저장이 일어나지 않았다');

    // 앱을 다시 켠 셈 — 저장된 비율만으로 같은 자리를 재현해야 한다
    const restarted = makeHarness({ device: saved });
    restarted.service.enable();
    await flush();

    expect(restarted.windows[0]?.bounds?.y).toBe(releasedY);
  });

  test('끌지 않았는데 놓으면 아무 일도 하지 않는다', async () => {
    h.service.enable();
    await flush();
    const before = h.windows[0]?.bounds;

    h.service.commitRailDrag();
    await flush();

    expect(h.saved).toEqual([]);
    expect(h.windows[0]?.bounds).toEqual(before);
  });

  test('위치 초기화는 손잡이를 기본 자리로 되돌린다', async () => {
    h.service.enable();
    await flush();
    const home = h.windows[0]?.bounds?.y;

    h.service.setRailDragTop((home ?? 0) + 120);
    h.service.commitRailDrag();
    await flush();
    expect(h.windows[0]?.bounds?.y).not.toBe(home);

    h.service.resetRailPosition();
    await flush();

    expect(h.windows[0]?.bounds?.y).toBe(home);
    expect(h.saved.at(-1)?.railPosition).toBe(SIDE_PIN_RAIL_POSITION_DEFAULT);
  });

  test('★이미 기본값이어도 배치를 다시 한다 — 되돌리는 기능은 언제 눌러도 되돌려야 한다', async () => {
    // "값이 같으면 아무것도 안 함"으로 두면, 모니터가 바뀌어 손잡이가 엉뚱한 높이에
    // 있는데 저장값만 기본값인 경우 초기화가 막다른 길이 된다. v2.3.7에서 같은
    // 판단(from === next 조기 반환)이 "다시 시도" 버튼까지 죽였다(ADR-042·043).
    h.service.enable();
    await flush();
    const home = h.windows[0]?.bounds?.y;

    // 저장값은 기본값 그대로 둔 채 창만 딴 자리로 밀어 둔다(모니터 변경 흉내).
    h.windows[0]?.setPosition({ x: 0, y: (home ?? 0) + 300, width: 52, height: 168 });

    h.service.resetRailPosition();
    await flush();

    expect(h.windows[0]?.bounds?.y).toBe(home);
  });

  test('끌던 도중에 눌러도 그 자리에 머물지 않는다', async () => {
    h.service.enable();
    await flush();
    const home = h.windows[0]?.bounds?.y;

    h.service.setRailDragTop((home ?? 0) + 200);
    await flush();
    // 손을 떼지 않은 채(commit 없이) 초기화를 누른 상황
    h.service.resetRailPosition();
    await flush();

    expect(h.windows[0]?.bounds?.y).toBe(home);
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
    const create = vi.fn((_role, bounds: SidePinBounds) => new FakeWindow(bounds));
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
