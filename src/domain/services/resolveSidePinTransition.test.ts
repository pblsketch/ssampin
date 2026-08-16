import { describe, it, expect, beforeEach } from 'vitest';
import {
  INITIAL_SIDE_PIN_RUNTIME_STATE,
  type SidePinPendingTransition,
  type SidePinRuntimeState,
} from '../entities/SidePinRuntimeState';
import type { SidePinCommand, SidePinEvent } from '../events/SidePinEvent';
import {
  SIDE_PIN_COLLAPSE_DELAY_MS,
  SIDE_PIN_DISPOSE_DELAY_MS,
  SIDE_PIN_REVEAL_DELAY_MS,
  resolveSidePinTransition,
  type SidePinTransitionResult,
} from './resolveSidePinTransition';

// ─── 테스트 도우미 ───────────────────────────────────────────────

let opCounter = 0;
beforeEach(() => {
  opCounter = 0;
});

function nextOp(): string {
  opCounter += 1;
  return `op-${opCounter}`;
}

function apply(
  state: SidePinRuntimeState,
  event: SidePinEvent,
  nowMs = 0,
  operationId: string = nextOp(),
): SidePinTransitionResult {
  return resolveSidePinTransition(state, event, { nowMs, operationId });
}

type HostCommand = Extract<SidePinCommand, { type: 'host' }>;

function hostCommands(result: SidePinTransitionResult): HostCommand[] {
  return result.commands.filter((c): c is HostCommand => c.type === 'host');
}

function hostCommandOf(result: SidePinTransitionResult, kind: string): HostCommand {
  const found = hostCommands(result).find((c) => c.kind === kind);
  if (found === undefined) {
    throw new Error(`${kind} 명령이 없다. 실제 명령: ${JSON.stringify(result.commands)}`);
  }
  return found;
}

function scheduledTransition(result: SidePinTransitionResult): SidePinPendingTransition {
  const found = result.commands.find(
    (c): c is Extract<SidePinCommand, { type: 'schedule' }> => c.type === 'schedule',
  );
  if (found === undefined) {
    throw new Error(`schedule 명령이 없다. 실제 명령: ${JSON.stringify(result.commands)}`);
  }
  return found.transition;
}

function hasSchedule(result: SidePinTransitionResult): boolean {
  return result.commands.some((c) => c.type === 'schedule');
}

/** 창 조작 명령에 "성공했다"고 응답한다 */
function ack(state: SidePinRuntimeState, command: HostCommand, nowMs = 0): SidePinTransitionResult {
  return apply(
    state,
    {
      type: 'host-operation-result',
      operationId: command.operationId,
      requestedRevision: command.requestedRevision,
      status: 'applied',
    },
    nowMs,
  );
}

/**
 * 나가는 연출이 끝난 뒤의 결과.
 *
 * 접기는 두 걸음이다 — 먼저 `closing`으로 들어가 연출에 자리를 내주고,
 * 연출이 끝나야 창을 손잡이 크기로 줄인다. 창을 먼저 줄이면 패널이 잘려
 * 나가는 연출을 할 자리가 없다.
 */
function afterCloseAnimation(result: SidePinTransitionResult, nowMs = 0): SidePinTransitionResult {
  return apply(
    result.next,
    { type: 'timer-fired', transition: scheduledTransition(result) },
    nowMs,
  );
}

/** 옆핀을 켜고 손잡이가 준비된 상태까지 만든다 */
function enabledState(): SidePinRuntimeState {
  const started = apply(INITIAL_SIDE_PIN_RUNTIME_STATE, { type: 'enabled-changed', enabled: true });
  return ack(started.next, hostCommandOf(started, 'ensure-rail')).next;
}

/** 호버로 패널이 실제로 펼쳐진 상태까지 만든다 */
function expandedByHover(region: 'rail-widget' | 'rail-memo' = 'rail-widget'): SidePinRuntimeState {
  let state = enabledState();

  const entered = apply(state, { type: 'pointer-region-changed', region }, 1_000);
  const reveal = scheduledTransition(entered);
  state = entered.next;

  const fired = apply(state, { type: 'timer-fired', transition: reveal }, 1_180);
  const show = hostCommandOf(fired, 'show-panel');
  state = fired.next;

  const painted = apply(
    state,
    {
      type: 'panel-painted',
      operationId: show.operationId,
      requestedRevision: show.requestedRevision,
    },
    1_200,
  );
  return painted.next;
}

// ─── 앱 시작과 켜고 끄기 ─────────────────────────────────────────

describe('앱 시작 / 켜고 끄기', () => {
  it('옆핀을 켜면 손잡이를 준비하고 접힌 상태로 시작한다', () => {
    const result = apply(INITIAL_SIDE_PIN_RUNTIME_STATE, {
      type: 'enabled-changed',
      enabled: true,
    });

    expect(hostCommandOf(result, 'ensure-rail')).toBeDefined();
    expect(result.next.surface).toBe('collapsed');
    expect(result.next.pinnedZone).toBe('none');
  });

  it('옆핀을 끄면 모든 창을 없앤다', () => {
    const result = apply(expandedByHover(), { type: 'enabled-changed', enabled: false });

    expect(hostCommandOf(result, 'destroy-all')).toBeDefined();
    expect(result.next.surface).toBe('collapsed');
    expect(result.next.panelLifecycle).toBe('absent');
  });

  it('이미 켜진 상태에서 다시 켜면 숨은 손잡이를 복구하도록 상태를 초기화한다', () => {
    const result = apply(expandedByHover(), { type: 'enabled-changed', enabled: true });

    expect(hostCommandOf(result, 'ensure-rail')).toBeDefined();
    expect(result.next.surface).toBe('collapsed');
    expect(result.next.pointerRegion).toBe('outside');
    expect(result.next.enabled).toBe(true);
  });
});

// ─── 호버 펼침 (180ms) ───────────────────────────────────────────

describe('호버 펼침', () => {
  it('손잡이에 들어오면 180ms 뒤 펼치도록 예약하고 패널을 미리 준비한다', () => {
    const result = apply(
      enabledState(),
      { type: 'pointer-region-changed', region: 'rail-widget' },
      1_000,
    );

    const transition = scheduledTransition(result);
    expect(transition.type).toBe('reveal');
    expect(transition.dueAtMs).toBe(1_000 + SIDE_PIN_REVEAL_DELAY_MS);
    expect(hostCommandOf(result, 'prepare-panel')).toBeDefined();
    expect(result.next.panelLifecycle).toBe('preparing');
    // 아직 펼쳐지지 않았다
    expect(result.next.surface).toBe('collapsed');
  });

  it('끌어 옮기는 자리에서는 펼치지 않는다 — 잡으려는 순간 열리면 손잡이 창이 숨는다', () => {
    const result = apply(
      enabledState(),
      { type: 'pointer-region-changed', region: 'rail-grip' },
      1_000,
    );

    expect(result.next.pendingTransition?.type).not.toBe('reveal');
    expect(result.next.surface).toBe('collapsed');
    // 예약도 창 준비도 시키지 않는다 — 지나가는 곳으로 취급한다
    expect(result.commands).toEqual([]);
  });

  it('여는 버튼에서 끌기 자리로 넘어가면 예약된 펼침을 취소한다', () => {
    // 손잡이를 옮기려고 버튼을 스쳐 끌기 자리로 내려오는 경로. 여기서 예약이
    // 남아 있으면 끌기를 시작하기도 전에 패널이 열린다.
    const entered = apply(
      enabledState(),
      { type: 'pointer-region-changed', region: 'rail-widget' },
      1_000,
    );
    expect(scheduledTransition(entered).type).toBe('reveal');

    const moved = apply(
      entered.next,
      { type: 'pointer-region-changed', region: 'rail-grip' },
      1_050,
    );

    expect(moved.next.pendingTransition?.type).not.toBe('reveal');
    expect(moved.next.surface).toBe('collapsed');
  });

  it('180ms가 지나도 "보여줘"라고 요청만 하고 펼침을 확정하지 않는다', () => {
    const entered = apply(
      enabledState(),
      { type: 'pointer-region-changed', region: 'rail-widget' },
      1_000,
    );
    const reveal = scheduledTransition(entered);

    const fired = apply(entered.next, { type: 'timer-fired', transition: reveal }, 1_180);

    expect(hostCommandOf(fired, 'show-panel')).toBeDefined();
    // "여는 중"이지 "펼쳐짐"이 아니다 — 그려졌다는 답을 받아야 확정된다.
    expect(fired.next.surface).toBe('opening');
  });

  it('실제로 그려졌다는 응답을 받아야 펼침이 확정된다', () => {
    const state = expandedByHover();

    expect(state.surface).toBe('expanded');
    expect(state.panelLifecycle).toBe('visible');
    expect(state.openReason).toBe('hover');
  });

  it('들어온 칸을 기억한다 — 위젯 쪽으로 들어오면 위젯이다', () => {
    expect(expandedByHover('rail-widget').activeZone).toBe('widget');
  });

  it('메모 쪽으로 들어오면 메모다 — 두 손잡이 버튼이 같은 결과를 내면 안 된다', () => {
    expect(expandedByHover('rail-memo').activeZone).toBe('memo');
  });

  it('다 그려진 뒤에 정하지 않는다 — 그 사이 마우스는 이미 다른 곳에 가 있다', () => {
    // 손잡이(메모)로 들어와 여는 중에 포인터가 패널 위젯 쪽으로 옮겨가도,
    // 처음 들어온 칸은 메모여야 한다.
    let state = enabledState();
    const entered = apply(state, { type: 'pointer-region-changed', region: 'rail-memo' }, 1_000);
    const reveal = scheduledTransition(entered);
    const fired = apply(entered.next, { type: 'timer-fired', transition: reveal }, 1_180);
    const show = hostCommandOf(fired, 'show-panel');
    state = fired.next;

    const moved = apply(state, { type: 'pointer-region-changed', region: 'panel-widget' }, 1_190);
    const painted = apply(
      moved.next,
      {
        type: 'panel-painted',
        operationId: show.operationId,
        requestedRevision: show.requestedRevision,
      },
      1_200,
    );

    expect(painted.next.activeZone).toBe('memo');
  });

  it('"요청 접수" 응답이 먼저 와도 뒤이은 "그려짐" 알림이 펼침을 확정한다', () => {
    // 창은 보통 "요청 받았다"를 먼저 답하고, 그린 뒤에 "그렸다"를 따로 알린다.
    // 앞의 응답에서 대기 목록을 지워버리면 뒤 알림이 짝을 잃어, 패널이 실제로
    // 떠 있는데도 상태는 영영 접힌 채로 남는다.
    const entered = apply(
      enabledState(),
      { type: 'pointer-region-changed', region: 'rail-widget' },
      1_000,
    );
    const fired = apply(entered.next, {
      type: 'timer-fired',
      transition: scheduledTransition(entered),
    });
    const show = hostCommandOf(fired, 'show-panel');

    const accepted = ack(fired.next, show, 1_190);
    const painted = apply(accepted.next, {
      type: 'panel-painted',
      operationId: show.operationId,
      requestedRevision: show.requestedRevision,
    });

    expect(painted.next.surface).toBe('expanded');
  });

  it('호버로 열 때는 포커스를 가져가지 않는다 — 다른 앱 작업을 방해하지 않도록', () => {
    const entered = apply(
      enabledState(),
      { type: 'pointer-region-changed', region: 'rail-widget' },
      1_000,
    );
    const fired = apply(entered.next, {
      type: 'timer-fired',
      transition: scheduledTransition(entered),
    });

    expect(hostCommandOf(fired, 'show-panel').focus).toBe(false);
  });

  it('180ms 전에 손잡이를 벗어나면 예약이 취소되고 접힌 채로 남는다', () => {
    const entered = apply(
      enabledState(),
      { type: 'pointer-region-changed', region: 'rail-widget' },
      1_000,
    );
    const left = apply(entered.next, { type: 'pointer-region-changed', region: 'outside' }, 1_100);

    expect(left.commands).toContainEqual({ type: 'cancel-schedule' });
    expect(left.next.surface).toBe('collapsed');
    // 펼침 예약은 사라지고, 만들다 만 창을 없앨 예약으로 바뀐다.
    // 이게 없으면 보이지도 않는 창이 계속 메모리에 남는다.
    expect(left.next.pendingTransition?.type).toBe('dispose-panel');
  });

  it('취소된 뒤 도착한 타이머는 아무 일도 하지 않는다', () => {
    const entered = apply(
      enabledState(),
      { type: 'pointer-region-changed', region: 'rail-widget' },
      1_000,
    );
    const reveal = scheduledTransition(entered);
    const left = apply(entered.next, { type: 'pointer-region-changed', region: 'outside' }, 1_100);

    const late = apply(left.next, { type: 'timer-fired', transition: reveal }, 1_180);

    expect(late.commands).toEqual([]);
    expect(late.next).toBe(left.next);
  });

  it('창 준비 응답이 먼저 와도 펼침 예약이 살아남는다 (기획서 §5 규칙의 반례)', () => {
    // 손잡이 진입 → reveal 예약 + prepare-panel 요청이 동시에 나간다.
    const entered = apply(
      enabledState(),
      { type: 'pointer-region-changed', region: 'rail-widget' },
      1_000,
    );
    const reveal = scheduledTransition(entered);
    const prepare = hostCommandOf(entered, 'prepare-panel');

    // 창 준비가 180ms 안에 끝나 응답이 먼저 도착한다 → revision이 올라간다.
    const prepared = ack(entered.next, prepare, 1_050);
    expect(prepared.next.revision).not.toBe(reveal.scheduledRevision);
    expect(prepared.next.panelLifecycle).toBe('ready');

    // 그래도 180ms 타이머는 유효해야 한다. "revision이 같을 때만"으로 판단하면
    // 여기서 예약이 죽어 호버로는 패널이 영영 열리지 않는다.
    const fired = apply(prepared.next, { type: 'timer-fired', transition: reveal }, 1_180);
    expect(hostCommandOf(fired, 'show-panel')).toBeDefined();
  });

  it('손잡이의 위젯·메모 구역을 오갈 때 180ms를 다시 세지 않는다', () => {
    // 손잡이를 훑듯이 지나가는 사용자는 구역 경계를 여러 번 넘는다.
    // 그때마다 시간을 초기화하면 아무리 머물러도 패널이 안 열린다.
    const entered = apply(
      enabledState(),
      { type: 'pointer-region-changed', region: 'rail-widget' },
      1_000,
    );
    const reveal = scheduledTransition(entered);

    const moved = apply(
      entered.next,
      { type: 'pointer-region-changed', region: 'rail-memo' },
      1_100,
    );

    expect(hasSchedule(moved)).toBe(false);
    expect(moved.next.pendingTransition?.dueAtMs).toBe(reveal.dueAtMs);
  });

  it('창을 준비하는 중에는 준비됐다고 기록하지 않는다', () => {
    const entered = apply(
      enabledState(),
      { type: 'pointer-region-changed', region: 'rail-widget' },
      1_000,
    );
    const moved = apply(
      entered.next,
      { type: 'pointer-region-changed', region: 'rail-memo' },
      1_100,
    );

    expect(moved.next.panelLifecycle).toBe('preparing');
  });

  it('접힌 손잡이를 클릭하면 고정만 되는 게 아니라 열린다', () => {
    // 창이 아직 없으면 먼저 만들라고 시킨다. 손잡이만 상주하는 구조(D안)에서는
    // 없는 창에 "보여줘"를 보내면 실패하기 때문이다.
    const clicked = apply(enabledState(), { type: 'toggle-pin', zone: 'widget' }, 1_000);

    expect(hostCommandOf(clicked, 'prepare-panel')).toBeDefined();
    expect(clicked.next.surface).toBe('opening');
    expect(clicked.next.pinnedZone).toBe('widget');

    // 창이 준비되면 그때 보여달라고 하고, 클릭이므로 포커스까지 가져온다.
    const prepared = ack(clicked.next, hostCommandOf(clicked, 'prepare-panel'), 1_050);
    expect(hostCommandOf(prepared, 'show-panel').focus).toBe(true);
  });

  it('파기 대기 중인 패널이 있으면 다시 만들지 않고 재사용한다', () => {
    let state = expandedByHover();
    const left = apply(state, { type: 'pointer-region-changed', region: 'outside' }, 2_000);
    const collapseFired = apply(
      left.next,
      { type: 'timer-fired', transition: scheduledTransition(left) },
      2_400,
    );
    const closed = afterCloseAnimation(collapseFired, 2_580);
    state = ack(closed.next, hostCommandOf(closed, 'collapse-panel'), 2_580).next;
    expect(state.panelLifecycle).toBe('cooldown');

    const reentered = apply(state, { type: 'pointer-region-changed', region: 'rail-memo' }, 2_500);

    expect(hostCommands(reentered).some((c) => c.kind === 'prepare-panel')).toBe(false);
    expect(reentered.next.panelLifecycle).toBe('ready');
  });
});

// ─── 접힘 (400ms) ────────────────────────────────────────────────

describe('접힘', () => {
  it('패널 밖으로 나가면 400ms 뒤 접도록 예약한다', () => {
    const result = apply(
      expandedByHover(),
      { type: 'pointer-region-changed', region: 'outside' },
      2_000,
    );

    const transition = scheduledTransition(result);
    expect(transition.type).toBe('collapse');
    expect(transition.dueAtMs).toBe(2_000 + SIDE_PIN_COLLAPSE_DELAY_MS);
    // 아직 펼쳐진 상태다
    expect(result.next.surface).toBe('expanded');
  });

  it('400ms 안에 다시 들어오면 예약이 취소된다', () => {
    const left = apply(
      expandedByHover(),
      { type: 'pointer-region-changed', region: 'outside' },
      2_000,
    );
    const reveal = scheduledTransition(left);

    const back = apply(left.next, { type: 'pointer-region-changed', region: 'panel-memo' }, 2_200);
    expect(back.commands).toContainEqual({ type: 'cancel-schedule' });

    // 취소된 뒤 도착한 타이머는 무시된다
    const late = apply(back.next, { type: 'timer-fired', transition: reveal }, 2_400);
    expect(late.commands).toEqual([]);
    expect(late.next.surface).toBe('expanded');
  });

  it('손잡이와 패널 사이를 오가는 것은 이탈이 아니다', () => {
    const state = expandedByHover();

    const moved = apply(state, { type: 'pointer-region-changed', region: 'panel-memo' }, 2_000);
    expect(hasSchedule(moved)).toBe(false);

    const moved2 = apply(
      moved.next,
      { type: 'pointer-region-changed', region: 'rail-widget' },
      2_100,
    );
    expect(hasSchedule(moved2)).toBe(false);
    expect(moved2.next.surface).toBe('expanded');
  });

  it('접힘 예약이 끝나도 창을 바로 줄이지 않는다 — 연출할 자리를 남긴다', () => {
    // 창을 먼저 줄이면 패널이 손잡이 크기로 잘려, 나가는 연출을 할 자리가 없다.
    const left = apply(
      expandedByHover(),
      { type: 'pointer-region-changed', region: 'outside' },
      2_000,
    );

    const fired = apply(
      left.next,
      { type: 'timer-fired', transition: scheduledTransition(left) },
      2_400,
    );

    expect(fired.next.surface).toBe('closing');
    expect(hostCommands(fired)).toEqual([]);
    expect(scheduledTransition(fired).type).toBe('close-animation');
  });

  it('연출이 끝나야 창을 줄인다', () => {
    const left = apply(
      expandedByHover(),
      { type: 'pointer-region-changed', region: 'outside' },
      2_000,
    );
    const fired = apply(
      left.next,
      { type: 'timer-fired', transition: scheduledTransition(left) },
      2_400,
    );

    const closed = afterCloseAnimation(fired, 2_580);

    expect(hostCommandOf(closed, 'collapse-panel')).toBeDefined();
    expect(closed.next.surface).toBe('collapsed');
  });

  it('그리기가 끝내 실패하면 연출 없이 곧바로 숨는다', () => {
    // 오류·보호 상황에서는 "부드럽게"보다 "지금 당장 가리기"가 먼저다.
    let state = enabledState();
    const entered = apply(state, { type: 'pointer-region-changed', region: 'rail-widget' }, 1_000);
    const fired = apply(entered.next, {
      type: 'timer-fired',
      transition: scheduledTransition(entered),
    });
    state = fired.next;

    const timedOut = apply(
      state,
      { type: 'timer-fired', transition: scheduledTransition(fired) },
      5_000,
    );

    expect(timedOut.next.surface).toBe('collapsed');
    expect(hostCommandOf(timedOut, 'collapse-panel')).toBeDefined();
  });

  it('나가는 연출 도중에 다시 들어오면 접기를 되돌린다', () => {
    // 창도 화면도 아직 그대로라 되돌리는 값이 싸다. 그냥 두면 손잡이 크기로 줄었다가
    // 곧바로 다시 펼쳐져, 스쳐 지나갈 때마다 창이 두 번 요동친다.
    const left = apply(
      expandedByHover(),
      { type: 'pointer-region-changed', region: 'outside' },
      2_000,
    );
    const fired = apply(
      left.next,
      { type: 'timer-fired', transition: scheduledTransition(left) },
      2_400,
    );
    expect(fired.next.surface).toBe('closing');

    const back = apply(fired.next, { type: 'pointer-region-changed', region: 'panel-memo' }, 2_410);

    expect(back.next.surface).toBe('expanded');
    expect(back.next.pendingTransition).toBeNull();
    // 창을 건드리지 않는다 — 줄인 적이 없으니 되돌릴 것도 없다.
    expect(hostCommands(back)).toEqual([]);
  });

  it('되돌린 뒤에는 열고 닫기를 반복하지 않는다', () => {
    const left = apply(
      expandedByHover(),
      { type: 'pointer-region-changed', region: 'outside' },
      2_000,
    );
    const fired = apply(
      left.next,
      { type: 'timer-fired', transition: scheduledTransition(left) },
      2_400,
    );
    const back = apply(fired.next, { type: 'pointer-region-changed', region: 'panel-memo' }, 2_410);

    // 포인터가 안에 있으므로 더 이상 아무것도 예약되지 않는다 = 진동 없음
    expect(back.next.surface).toBe('expanded');
    expect(hasSchedule(back)).toBe(false);
  });

  it('사용자가 직접 닫았다면 연출 도중 마우스가 위에 있어도 되열리지 않는다', () => {
    // Esc를 눌렀을 때 마우스는 대개 패널 위에 있다. 되돌리면 닫을 방법이 없어진다.
    let state = expandedByHover();
    state = apply(state, { type: 'window-focus-changed', focused: true }).next;
    const escaped = apply(state, { type: 'escape-pressed' }, 2_100);
    expect(escaped.next.surface).toBe('closing');

    const hover = apply(
      escaped.next,
      { type: 'pointer-region-changed', region: 'panel-memo' },
      2_150,
    );

    expect(hover.next.surface).toBe('closing');
  });

  it('접기가 끝나면 10초 뒤 패널을 없애도록 예약한다', () => {
    const left = apply(
      expandedByHover(),
      { type: 'pointer-region-changed', region: 'outside' },
      2_000,
    );
    const fired = apply(
      left.next,
      { type: 'timer-fired', transition: scheduledTransition(left) },
      2_400,
    );
    const closed = afterCloseAnimation(fired, 2_580);
    const collapsed = ack(closed.next, hostCommandOf(closed, 'collapse-panel'), 2_580);

    expect(collapsed.next.surface).toBe('collapsed');
    expect(collapsed.next.panelLifecycle).toBe('cooldown');
    const dispose = scheduledTransition(collapsed);
    expect(dispose.type).toBe('dispose-panel');
    expect(dispose.dueAtMs).toBe(2_580 + SIDE_PIN_DISPOSE_DELAY_MS);
  });
});

// ─── 고정 ────────────────────────────────────────────────────────

describe('고정', () => {
  it('고정하면 포커스를 가져오고 예약된 접힘을 취소한다', () => {
    const left = apply(
      expandedByHover(),
      { type: 'pointer-region-changed', region: 'outside' },
      2_000,
    );

    const pinned = apply(left.next, { type: 'toggle-pin', zone: 'widget' }, 2_100);

    expect(pinned.commands).toContainEqual({ type: 'cancel-schedule' });
    expect(hostCommandOf(pinned, 'focus-panel')).toBeDefined();
    expect(pinned.next.pinnedZone).toBe('widget');
    expect(pinned.next.openReason).toBe('click');
  });

  it('고정된 상태에서는 밖으로 나가도 접힘을 예약하지 않는다', () => {
    const pinned = apply(expandedByHover(), { type: 'toggle-pin', zone: 'both' }, 2_000);

    const left = apply(pinned.next, { type: 'pointer-region-changed', region: 'outside' }, 2_100);

    expect(hasSchedule(left)).toBe(false);
    expect(left.next.surface).toBe('expanded');
  });

  it('같은 지점을 다시 누르면 고정이 풀리고, 포인터가 밖이면 접힘이 예약된다', () => {
    const pinned = apply(expandedByHover(), { type: 'toggle-pin', zone: 'widget' }, 2_000);
    const left = apply(pinned.next, { type: 'pointer-region-changed', region: 'outside' }, 2_100);

    const unpinned = apply(left.next, { type: 'toggle-pin', zone: 'widget' }, 2_200);

    expect(unpinned.next.pinnedZone).toBe('none');
    expect(scheduledTransition(unpinned).type).toBe('collapse');
  });

  it('고정된 상태에서 바깥을 클릭해도 유지된다', () => {
    const pinned = apply(expandedByHover(), { type: 'toggle-pin', zone: 'both' }, 2_000);

    const clicked = apply(pinned.next, { type: 'outside-click' }, 2_100);

    expect(clicked.next.pinnedZone).toBe('both');
    expect(clicked.next.surface).toBe('expanded');
  });
});

// ─── 메모 편집 중 보호 ───────────────────────────────────────────

describe('메모 편집 중', () => {
  it('편집 중에는 밖으로 나가도 접히지 않는다', () => {
    const editing = apply(expandedByHover(), {
      type: 'editor-activity-changed',
      activity: 'editing',
    });

    const left = apply(editing.next, { type: 'pointer-region-changed', region: 'outside' }, 2_000);

    expect(hasSchedule(left)).toBe(false);
    expect(left.next.surface).toBe('expanded');
  });

  it('편집을 시작하면 이미 예약된 접힘을 취소한다', () => {
    const left = apply(
      expandedByHover(),
      { type: 'pointer-region-changed', region: 'outside' },
      2_000,
    );

    const editing = apply(
      left.next,
      { type: 'editor-activity-changed', activity: 'editing' },
      2_100,
    );

    expect(editing.commands).toContainEqual({ type: 'cancel-schedule' });
    expect(editing.next.pendingTransition).toBeNull();
  });

  it.each(['editing', 'saving', 'dialog-open', 'save-error'] as const)(
    '%s 상태에서는 접힘을 예약하지 않는다',
    (activity) => {
      const busy = apply(expandedByHover(), { type: 'editor-activity-changed', activity });
      const left = apply(busy.next, { type: 'pointer-region-changed', region: 'outside' }, 2_000);

      expect(hasSchedule(left)).toBe(false);
    },
  );

  it('편집이 끝나고 포인터가 밖이면 그때부터 접힘 시간을 잰다', () => {
    const editing = apply(expandedByHover(), {
      type: 'editor-activity-changed',
      activity: 'editing',
    });
    const left = apply(editing.next, { type: 'pointer-region-changed', region: 'outside' }, 2_000);

    const idle = apply(left.next, { type: 'editor-activity-changed', activity: 'idle' }, 5_000);

    expect(scheduledTransition(idle).type).toBe('collapse');
    expect(scheduledTransition(idle).dueAtMs).toBe(5_000 + SIDE_PIN_COLLAPSE_DELAY_MS);
  });

  it('편집 중 Esc는 옆핀이 처리하지 않는다 — 메모 편집기 몫이다', () => {
    const editing = apply(expandedByHover(), {
      type: 'editor-activity-changed',
      activity: 'editing',
    });

    const escaped = apply(editing.next, { type: 'escape-pressed' });

    expect(escaped.commands).toEqual([]);
    expect(escaped.next.surface).toBe('expanded');
  });
});

// ─── Esc / 바깥 클릭 ─────────────────────────────────────────────

describe('Esc와 바깥 클릭', () => {
  it('편집 중이 아닐 때 Esc는 고정을 풀고 접는다', () => {
    const pinned = apply(expandedByHover(), { type: 'toggle-pin', zone: 'widget' }, 2_000);

    const escaped = apply(pinned.next, { type: 'escape-pressed' }, 2_100);

    expect(escaped.next.pinnedZone).toBe('none');
    // 연출에 자리를 내준 뒤 창을 줄인다.
    expect(escaped.next.surface).toBe('closing');
    expect(hostCommandOf(afterCloseAnimation(escaped, 2_280), 'collapse-panel')).toBeDefined();
  });

  it('커서가 패널 위에 있어도 Esc로 닫으면 다시 열리지 않는다', () => {
    // 사용자는 방금 그 패널에서 작업했으므로 Esc를 누를 때 커서는 대개 패널 위에 있다.
    // "커서가 안에 있으면 되연다"를 여기까지 적용하면 Esc가 안 먹는 것처럼 보인다.
    const pinned = apply(expandedByHover(), { type: 'toggle-pin', zone: 'widget' }, 2_000);
    const inside = apply(
      pinned.next,
      { type: 'pointer-region-changed', region: 'panel-memo' },
      2_050,
    );
    const escaped = apply(inside.next, { type: 'escape-pressed' }, 2_100);

    const closed = afterCloseAnimation(escaped, 2_280);
    const collapsed = ack(closed.next, hostCommandOf(closed, 'collapse-panel'), 2_300);

    expect(collapsed.next.surface).toBe('collapsed');
    expect(collapsed.next.pinnedZone).toBe('none');
    expect(collapsed.next.pendingTransition?.type).not.toBe('reveal');
  });

  it('커서가 패널 위에 있어도 단축키로 닫으면 다시 열리지 않는다', () => {
    const inside = apply(
      expandedByHover(),
      { type: 'pointer-region-changed', region: 'panel-memo' },
      2_000,
    );
    const toggled = apply(inside.next, { type: 'shortcut-toggle' }, 2_100);

    const closed = afterCloseAnimation(toggled, 2_280);
    const collapsed = ack(closed.next, hostCommandOf(closed, 'collapse-panel'), 2_300);

    expect(collapsed.next.surface).toBe('collapsed');
    expect(collapsed.next.pendingTransition?.type).not.toBe('reveal');
  });

  it('포커스를 받은 상태에서 바깥을 클릭하면 접는다', () => {
    const focused = apply(expandedByHover(), { type: 'window-focus-changed', focused: true });

    const clicked = apply(focused.next, { type: 'outside-click' }, 2_100);

    expect(clicked.next.surface).toBe('closing');
    expect(hostCommandOf(afterCloseAnimation(clicked, 2_280), 'collapse-panel')).toBeDefined();
  });

  it('호버로만 열린(포커스 없는) 창은 Esc도 근거로 삼지 않는다', () => {
    // 포커스가 없으면 그 Esc는 다른 앱에서 누른 것이다. 남의 키 입력으로 닫지 않는다.
    const escaped = apply(expandedByHover(), { type: 'escape-pressed' }, 2_100);

    expect(escaped.commands).toEqual([]);
    expect(escaped.next.surface).toBe('expanded');
  });

  it('호버로만 열린(포커스 없는) 창은 바깥 클릭을 근거로 삼지 않는다', () => {
    const clicked = apply(expandedByHover(), { type: 'outside-click' }, 2_100);

    expect(clicked.commands).toEqual([]);
    expect(clicked.next.surface).toBe('expanded');
  });
});

// ─── 늦게 도착한 응답 ────────────────────────────────────────────

describe('늦게 도착한 응답', () => {
  it('보여달라고 한 뒤 손잡이를 벗어나면, 뒤늦게 그려졌다는 알림이 와도 열리지 않는다', () => {
    // 손잡이를 스치고 지나간 상황이다. 180ms를 채워 show 요청까지 나갔지만
    // 창이 실제로 그려지기 전에 포인터가 떠났다. 이때 늦은 "그렸다" 알림으로
    // 패널이 열리면, 사용자에게는 건드리지도 않은 창이 튀어나온 것으로 보인다.
    const entered = apply(
      enabledState(),
      { type: 'pointer-region-changed', region: 'rail-widget' },
      1_000,
    );
    const fired = apply(entered.next, {
      type: 'timer-fired',
      transition: scheduledTransition(entered),
    });
    const show = hostCommandOf(fired, 'show-panel');

    const left = apply(fired.next, { type: 'pointer-region-changed', region: 'outside' }, 1_190);

    const painted = apply(left.next, {
      type: 'panel-painted',
      operationId: show.operationId,
      requestedRevision: show.requestedRevision,
    });

    expect(painted.next.surface).toBe('collapsed');
  });

  it('여는 중 같은 고정 지점을 다시 누르면 열기 자체가 취소된다', () => {
    // 고정만 풀고 열기를 그대로 두면, 늦게 도착한 "그렸다" 알림에 패널이 혼자 열린다.
    const first = apply(enabledState(), { type: 'toggle-pin', zone: 'widget' }, 1_000);
    const prepared = ack(first.next, hostCommandOf(first, 'prepare-panel'), 1_050);
    const show = hostCommandOf(prepared, 'show-panel');

    const second = apply(prepared.next, { type: 'toggle-pin', zone: 'widget' }, 1_100);
    expect(second.next.pinnedZone).toBe('none');
    expect(second.next.surface).toBe('collapsed');

    const painted = apply(second.next, {
      type: 'panel-painted',
      operationId: show.operationId,
      requestedRevision: show.requestedRevision,
    });

    expect(painted.next.surface).toBe('collapsed');
  });

  it('옆핀을 끈 뒤에는 마우스를 올려도 새 창 작업이 시작되지 않는다', () => {
    const off = apply(expandedByHover(), { type: 'enabled-changed', enabled: false }, 3_000);

    const after = apply(off.next, { type: 'pointer-region-changed', region: 'rail-widget' }, 3_100);

    expect(after.commands).toEqual([]);
    expect(after.next).toBe(off.next);
  });

  it('연속으로 위치가 바뀌면 지난 재조정 요청은 밀려난다', () => {
    // 새 위치가 성공한 뒤 오래된 위치의 실패가 도착해 화면을 숨겨 버리면 안 된다.
    const first = apply(enabledState(), { type: 'layout-changed' }, 5_000);
    const stale = hostCommandOf(first, 'reposition-all');
    const second = apply(first.next, { type: 'layout-changed' }, 5_100);

    const lateFailure = apply(second.next, {
      type: 'host-operation-result',
      operationId: stale.operationId,
      requestedRevision: stale.requestedRevision,
      status: 'failed',
      code: 'ERR_OLD',
    });

    expect(lateFailure.next).toBe(second.next);
  });

  it('창 조작 대기 목록은 종류 수를 넘어 자라지 않는다', () => {
    // 그려졌다는 답이 오기 전에 단축키를 여러 번 눌러도 요청이 쌓이면 안 된다.
    let state = enabledState();
    for (let i = 0; i < 20; i += 1) {
      state = apply(state, { type: 'shortcut-toggle' }, 1_000 + i).next;
    }

    expect(state.pendingHostOperations.length).toBeLessThanOrEqual(9);
  });

  it('식별자가 다른 응답은 무시한다', () => {
    const entered = apply(
      enabledState(),
      { type: 'pointer-region-changed', region: 'rail-widget' },
      1_000,
    );
    const fired = apply(entered.next, {
      type: 'timer-fired',
      transition: scheduledTransition(entered),
    });
    const show = hostCommandOf(fired, 'show-panel');

    const painted = apply(fired.next, {
      type: 'panel-painted',
      operationId: 'op-다른요청',
      requestedRevision: show.requestedRevision,
    });

    // 여는 중 상태 그대로여야 하고, 펼쳐졌다고 확정되면 안 된다.
    expect(painted.next.surface).toBe('opening');
    expect(painted.next).toBe(fired.next);
  });

  it('판번호가 다른 응답은 무시한다', () => {
    const entered = apply(
      enabledState(),
      { type: 'pointer-region-changed', region: 'rail-widget' },
      1_000,
    );
    const fired = apply(entered.next, {
      type: 'timer-fired',
      transition: scheduledTransition(entered),
    });
    const show = hostCommandOf(fired, 'show-panel');

    const painted = apply(fired.next, {
      type: 'panel-painted',
      operationId: show.operationId,
      requestedRevision: show.requestedRevision + 99,
    });

    expect(painted.next.surface).toBe('opening');
  });

  it('취소된 요청의 늦은 성공 응답이 상태를 되살리지 않는다', () => {
    const entered = apply(
      enabledState(),
      { type: 'pointer-region-changed', region: 'rail-widget' },
      1_000,
    );
    const fired = apply(entered.next, {
      type: 'timer-fired',
      transition: scheduledTransition(entered),
    });
    const show = hostCommandOf(fired, 'show-panel');

    // 사용자가 떠나 옆핀을 껐다
    const disabled = apply(fired.next, { type: 'enabled-changed', enabled: false }, 1_300);

    const painted = apply(disabled.next, {
      type: 'panel-painted',
      operationId: show.operationId,
      requestedRevision: show.requestedRevision,
    });

    expect(painted.next.surface).toBe('collapsed');
  });
});

// ─── 창 조작 실패 ────────────────────────────────────────────────

describe('창 조작 실패', () => {
  it('펼치기에 실패하면 펼쳐진 상태로 남지 않고 손잡이로 되돌아간다', () => {
    const entered = apply(
      enabledState(),
      { type: 'pointer-region-changed', region: 'rail-widget' },
      1_000,
    );
    const fired = apply(entered.next, {
      type: 'timer-fired',
      transition: scheduledTransition(entered),
    });
    const show = hostCommandOf(fired, 'show-panel');

    const failed = apply(fired.next, {
      type: 'host-operation-result',
      operationId: show.operationId,
      requestedRevision: show.requestedRevision,
      status: 'failed',
      code: 'ERR_SHOW',
    });

    expect(failed.next.surface).toBe('collapsed');
    expect(failed.next.hostError).toEqual({ operationId: show.operationId, code: 'ERR_SHOW' });
    // 상태만 되돌리면 부족하다. 반쯤 펼쳐진 창이 화면에 남을 수 있으므로
    // 실제로 접으라고 시켜야 한다.
    expect(hostCommandOf(failed, 'collapse-panel')).toBeDefined();
  });

  it('창 준비에 실패해도 손잡이 상태는 유지된다', () => {
    const entered = apply(
      enabledState(),
      { type: 'pointer-region-changed', region: 'rail-widget' },
      1_000,
    );
    const prepare = hostCommandOf(entered, 'prepare-panel');

    const failed = apply(entered.next, {
      type: 'host-operation-result',
      operationId: prepare.operationId,
      requestedRevision: prepare.requestedRevision,
      status: 'failed',
      code: 'ERR_PREPARE',
    });

    expect(failed.next.surface).toBe('collapsed');
    expect(failed.next.panelLifecycle).toBe('absent');
  });

  it('창 준비에 실패하면 예약된 펼침도 함께 취소된다 — 없는 패널에 "보여줘"를 보내지 않도록', () => {
    const entered = apply(
      enabledState(),
      { type: 'pointer-region-changed', region: 'rail-widget' },
      1_000,
    );
    const reveal = scheduledTransition(entered);
    const prepare = hostCommandOf(entered, 'prepare-panel');

    const failed = apply(entered.next, {
      type: 'host-operation-result',
      operationId: prepare.operationId,
      requestedRevision: prepare.requestedRevision,
      status: 'failed',
      code: 'ERR_PREPARE',
    });
    expect(failed.next.pendingTransition).toBeNull();

    // 예약이 살아 있었다면 여기서 없는 패널에 show 요청이 나간다.
    const fired = apply(failed.next, { type: 'timer-fired', transition: reveal }, 1_180);
    expect(hostCommands(fired)).toEqual([]);
    expect(fired.next.surface).toBe('collapsed');
  });

  it('그려졌다는 알림이 끝내 오지 않으면 손잡이 상태로 되돌린다', () => {
    const entered = apply(
      enabledState(),
      { type: 'pointer-region-changed', region: 'rail-widget' },
      1_000,
    );
    const fired = apply(
      entered.next,
      {
        type: 'timer-fired',
        transition: scheduledTransition(entered),
      },
      1_180,
    );
    hostCommandOf(fired, 'show-panel');

    // show 요청과 함께 감시 예약이 걸려야 한다.
    const watchdog = scheduledTransition(fired);
    expect(watchdog.type).toBe('show-timeout');

    const timedOut = apply(
      fired.next,
      { type: 'timer-fired', transition: watchdog },
      1_180 + 3_000,
    );

    expect(timedOut.next.surface).toBe('collapsed');
    expect(timedOut.next.pendingHostOperations.some((op) => op.kind === 'show-panel')).toBe(false);
  });

  it('그리기가 계속 실패해도 열고 닫기를 무한 반복하지 않는다', () => {
    // 커서가 손잡이 위에 있는 채로 렌더러가 죽은 상황.
    // 감시 만료가 "접기"로 이어지면, 접기 완료가 다시 "커서가 안에 있으니 열기"를
    // 부르고 3초마다 영원히 반복된다. 그래서 접기가 아니라 파기로 끝내야 한다.
    const entered = apply(
      enabledState(),
      { type: 'pointer-region-changed', region: 'rail-widget' },
      1_000,
    );
    const fired = apply(
      entered.next,
      {
        type: 'timer-fired',
        transition: scheduledTransition(entered),
      },
      1_180,
    );
    const watchdog = scheduledTransition(fired);

    const timedOut = apply(fired.next, { type: 'timer-fired', transition: watchdog }, 4_180);
    // 손잡이 크기로 되돌리려면 접기를 시켜야 한다.
    // (한 창 구조에서 파기는 내용만 비우고 창 크기는 그대로 둔다)
    const collapse = hostCommandOf(timedOut, 'collapse-panel');

    const collapsed = ack(timedOut.next, collapse, 4_200);

    // 커서가 손잡이 위에 그대로 있어도 다시 열자는 예약이 생기면 안 된다.
    expect(collapsed.next.pendingTransition?.type).not.toBe('reveal');
    expect(collapsed.next.surface).toBe('collapsed');
    expect(collapsed.next.hostError?.code).toBe('SHOW_TIMEOUT');
  });

  it('고정 클릭으로 여는 경로에도 감시 시간이 걸린다', () => {
    const clicked = apply(enabledState(), { type: 'toggle-pin', zone: 'widget' }, 1_000);

    expect(scheduledTransition(clicked).type).toBe('show-timeout');
  });

  it('단축키로 여는 경로에도 감시 시간이 걸린다', () => {
    const result = apply(enabledState(), { type: 'shortcut-toggle' }, 1_000);

    expect(scheduledTransition(result).type).toBe('show-timeout');
  });

  it('위치 재조정에 실패하면 화면 밖에 걸쳐 두지 않고 숨긴다', () => {
    const layout = apply(expandedByHover(), { type: 'layout-changed' }, 5_000);
    const reposition = hostCommandOf(layout, 'reposition-all');

    const failed = apply(layout.next, {
      type: 'host-operation-result',
      operationId: reposition.operationId,
      requestedRevision: reposition.requestedRevision,
      status: 'failed',
      code: 'ERR_DISPLAY',
    });

    expect(hostCommandOf(failed, 'hide-all')).toBeDefined();
    expect(failed.next.surface).toBe('collapsed');
  });

  it('위치 재조정 실패로 숨긴 뒤에도 손잡이가 다시 돌아올 길이 있다', () => {
    // 그냥 숨기기만 하면 손잡이가 사라진 채 다시 나타날 방법이 없어져
    // "접힌 손잡이가 늘 보인다"는 약속이 영영 깨진다.
    const layout = apply(expandedByHover(), { type: 'layout-changed' }, 5_000);
    const reposition = hostCommandOf(layout, 'reposition-all');
    const failed = apply(layout.next, {
      type: 'host-operation-result',
      operationId: reposition.operationId,
      requestedRevision: reposition.requestedRevision,
      status: 'failed',
      code: 'ERR_DISPLAY',
    });

    expect(failed.next.protectedReason).toBe('adapter-unhealthy');

    // 보호가 풀리면 손잡이를 다시 만든다
    const released = apply(failed.next, { type: 'protect-released' }, 6_000);
    expect(hostCommandOf(released, 'ensure-rail')).toBeDefined();
  });

  it('패널 파기에 실패하면 "없다"고 기록하지 않는다 — 창이 이중 생성되지 않도록', () => {
    let state = expandedByHover();
    const left = apply(state, { type: 'pointer-region-changed', region: 'outside' }, 2_000);
    const fired = apply(
      left.next,
      { type: 'timer-fired', transition: scheduledTransition(left) },
      2_400,
    );
    const closed = afterCloseAnimation(fired, 2_580);
    state = ack(closed.next, hostCommandOf(closed, 'collapse-panel'), 2_580).next;
    const disposeTimer = state.pendingTransition;
    const disposeFired = apply(state, { type: 'timer-fired', transition: disposeTimer! }, 12_400);
    const dispose = hostCommandOf(disposeFired, 'dispose-panel');

    const failed = apply(disposeFired.next, {
      type: 'host-operation-result',
      operationId: dispose.operationId,
      requestedRevision: dispose.requestedRevision,
      status: 'failed',
      code: 'ERR_DISPOSE',
    });

    // 실제 패널은 아직 살아 있으므로 absent로 적으면 다음 호버에서 또 만든다
    expect(failed.next.panelLifecycle).not.toBe('absent');
  });

  it('호버로 열었다 닫으면 대기 목록이 비워진다 — 항목이 쌓이지 않는다', () => {
    let state = expandedByHover();
    const left = apply(state, { type: 'pointer-region-changed', region: 'outside' }, 2_000);
    const fired = apply(
      left.next,
      { type: 'timer-fired', transition: scheduledTransition(left) },
      2_400,
    );
    const closed = afterCloseAnimation(fired, 2_580);
    state = ack(closed.next, hostCommandOf(closed, 'collapse-panel'), 2_580).next;

    expect(state.pendingHostOperations).toEqual([]);
  });

  it('손잡이조차 못 만들면 이번 실행에서는 옆핀을 쓰지 않는다', () => {
    const started = apply(INITIAL_SIDE_PIN_RUNTIME_STATE, {
      type: 'enabled-changed',
      enabled: true,
    });
    const ensure = hostCommandOf(started, 'ensure-rail');

    const failed = apply(started.next, {
      type: 'host-operation-result',
      operationId: ensure.operationId,
      requestedRevision: ensure.requestedRevision,
      status: 'failed',
      code: 'ERR_RAIL',
    });

    expect(failed.next.protectedReason).toBe('adapter-unhealthy');
    // 이후 호버해도 아무 일도 일어나지 않는다
    expect(
      apply(failed.next, { type: 'pointer-region-changed', region: 'rail-widget' }).commands,
    ).toEqual([]);
  });

  it('모니터 배치가 바뀌면 위치를 다시 잡는다', () => {
    const result = apply(enabledState(), { type: 'layout-changed' }, 5_000);

    expect(hostCommandOf(result, 'reposition-all')).toBeDefined();
  });

  it('stale 응답은 오류로 기록하지 않고 조용히 지운다', () => {
    const entered = apply(
      enabledState(),
      { type: 'pointer-region-changed', region: 'rail-widget' },
      1_000,
    );
    const prepare = hostCommandOf(entered, 'prepare-panel');

    const stale = apply(entered.next, {
      type: 'host-operation-result',
      operationId: prepare.operationId,
      requestedRevision: prepare.requestedRevision,
      status: 'stale',
    });

    expect(stale.next.hostError).toBeNull();
    expect(stale.next.pendingHostOperations).toEqual([]);
  });
});

// ─── 잠금·절전·전체화면 보호 ─────────────────────────────────────

describe('보호 상태', () => {
  it('잠금이 오면 편집 중이라도 즉시 숨기고 편집 상태를 비운다', () => {
    const editing = apply(expandedByHover(), {
      type: 'editor-activity-changed',
      activity: 'editing',
    });

    const locked = apply(editing.next, { type: 'force-protect', reason: 'lock' }, 3_000);

    expect(hostCommandOf(locked, 'hide-all')).toBeDefined();
    expect(locked.next.surface).toBe('collapsed');
    expect(locked.next.editorActivity).toBe('idle');
    expect(locked.next.protectedReason).toBe('lock');
  });

  it('보호 중에는 호버·고정·단축키가 모두 무시된다', () => {
    const locked = apply(expandedByHover(), { type: 'force-protect', reason: 'fullscreen' }, 3_000);
    const state = locked.next;

    expect(
      apply(state, { type: 'pointer-region-changed', region: 'rail-widget' }).commands,
    ).toEqual([]);
    expect(apply(state, { type: 'toggle-pin', zone: 'widget' }).commands).toEqual([]);
    expect(apply(state, { type: 'shortcut-toggle' }).commands).toEqual([]);
  });

  it('잠금 중에는 뒤늦게 도착한 "그렸다" 알림으로도 열리지 않는다', () => {
    // 잠금 직전에 보낸 show 요청의 응답이 잠금 뒤에 도착하는 경우.
    // 여기서 열리면 잠금 화면 위로 메모가 노출된다.
    const entered = apply(
      enabledState(),
      { type: 'pointer-region-changed', region: 'rail-widget' },
      1_000,
    );
    const fired = apply(entered.next, {
      type: 'timer-fired',
      transition: scheduledTransition(entered),
    });
    const show = hostCommandOf(fired, 'show-panel');

    const locked = apply(fired.next, { type: 'force-protect', reason: 'lock' }, 1_190);

    const painted = apply(locked.next, {
      type: 'panel-painted',
      operationId: show.operationId,
      requestedRevision: show.requestedRevision,
    });

    expect(painted.next.surface).toBe('collapsed');
  });

  it('잠금 직전에 예약된 접힘이 완료돼도 다시 펼침을 예약하지 않는다', () => {
    // 커서가 패널 위에 있는 채로 잠기는 흔한 상황이다. 접힘 완료 처리가
    // "커서가 안에 있으니 다시 열자"로 이어지면 잠금 화면 위로 메모가 노출된다.
    const left = apply(
      expandedByHover(),
      { type: 'pointer-region-changed', region: 'outside' },
      2_000,
    );
    const fired = apply(
      left.next,
      { type: 'timer-fired', transition: scheduledTransition(left) },
      2_400,
    );
    const closed = afterCloseAnimation(fired, 2_580);
    const collapse = hostCommandOf(closed, 'collapse-panel');
    const back = apply(
      closed.next,
      { type: 'pointer-region-changed', region: 'panel-memo' },
      2_600,
    );
    const locked = apply(back.next, { type: 'force-protect', reason: 'lock' }, 2_620);

    const late = ack(locked.next, collapse, 2_500);

    expect(late.next.pendingTransition?.type).not.toBe('reveal');
    expect(late.next.protectedReason).toBe('lock');
  });

  it('보호가 풀리면 지난 숨김 요청이 손잡이를 다시 숨기지 못한다', () => {
    // protect-released가 손잡이를 다시 만든 뒤에 지난 hide-all 완료가 도착하면,
    // 손잡이가 사라진 채 복구할 길이 없어진다.
    const locked = apply(expandedByHover(), { type: 'force-protect', reason: 'lock' }, 3_000);
    const hide = hostCommandOf(locked, 'hide-all');
    const released = apply(locked.next, { type: 'protect-released' }, 4_000);

    const lateHide = ack(released.next, hide, 4_100);

    expect(lateHide.next).toBe(released.next);
  });

  it('보호가 풀리면 손잡이만 다시 준비한다', () => {
    const locked = apply(expandedByHover(), { type: 'force-protect', reason: 'lock' }, 3_000);

    const released = apply(locked.next, { type: 'protect-released' }, 4_000);

    expect(hostCommandOf(released, 'ensure-rail')).toBeDefined();
    expect(released.next.protectedReason).toBeNull();
    expect(released.next.surface).toBe('collapsed');
  });
});

// ─── 단축키 ──────────────────────────────────────────────────────

describe('단축키', () => {
  it('접혀 있을 때 단축키는 창을 먼저 만들고 포커스까지 가져오며 연다', () => {
    const result = apply(enabledState(), { type: 'shortcut-toggle' }, 1_000);

    expect(hostCommandOf(result, 'prepare-panel')).toBeDefined();
    expect(result.next.surface).toBe('opening');
    expect(result.next.openReason).toBe('shortcut');

    const prepared = ack(result.next, hostCommandOf(result, 'prepare-panel'), 1_050);
    expect(hostCommandOf(prepared, 'show-panel').focus).toBe(true);
  });

  it('펼쳐져 있을 때 단축키는 고정을 풀고 접는다', () => {
    const pinned = apply(expandedByHover(), { type: 'toggle-pin', zone: 'both' }, 2_000);

    const toggled = apply(pinned.next, { type: 'shortcut-toggle' }, 2_100);

    expect(toggled.next.surface).toBe('closing');
    expect(hostCommandOf(afterCloseAnimation(toggled, 2_280), 'collapse-panel')).toBeDefined();
    expect(toggled.next.pinnedZone).toBe('none');
  });
});
