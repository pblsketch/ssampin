/**
 * 옆핀의 상태 전이 규칙 — 순수 함수.
 *
 * 이 파일은 Electron도 React도 타이머도 모른다. "지금 상태 + 방금 일어난 일"을 받아
 * "다음 상태 + 시켜야 할 일"만 돌려준다. 그래서 창을 띄우지 않고도 180ms/400ms 규칙과
 * 늦게 도착한 응답 처리를 전부 테스트할 수 있다.
 *
 * 설계에서 가장 중요한 두 가지:
 *
 * 1. **펼침은 시간이 아니라 그려진 사실로 확정한다.** 180ms가 지났다고 `expanded`로
 *    바꾸면, 창을 띄우다 실패했을 때 "펼쳐진 상태인데 화면엔 없는" 유령 상태가 남는다.
 *    그래서 180ms에는 "보여줘"라고 요청만 하고, 실제로 그려졌다는 응답을 받은 뒤에만
 *    `expanded`가 된다.
 *
 * 2. **늦게 온 응답은 버린다.** 창 조작은 비동기라, 취소된 요청의 응답이 나중에 도착한다.
 *    모든 요청에 판번호(revision)와 식별자(operationId)를 붙여 두고, 둘 다 지금 것과
 *    맞을 때만 반영한다. 이걸 안 하면 사용자가 이미 닫은 패널이 혼자 다시 열린다.
 */
import {
  isEditorBusy,
  isPointerInsideSidePin,
  INITIAL_SIDE_PIN_RUNTIME_STATE,
  type SidePinHostOperationKind,
  type SidePinPendingHostOperation,
  type SidePinPendingTransition,
  type SidePinRuntimeState,
  type SidePinZone,
} from '../entities/SidePinRuntimeState';
import type { SidePinCommand, SidePinEvent } from '../events/SidePinEvent';

/** 손잡이에 머물러야 펼쳐지는 시간 — 지나가다 스치는 것과 구분한다 */
export const SIDE_PIN_REVEAL_DELAY_MS = 180;

/** 패널 밖으로 나간 뒤 접히기까지 기다리는 시간 — 잠깐 벗어나도 안 닫히게 */
export const SIDE_PIN_COLLAPSE_DELAY_MS = 400;

/** 접힌 뒤 패널 창을 없애기까지 기다리는 시간 — 다시 들어오면 재사용 */
export const SIDE_PIN_DISPOSE_DELAY_MS = 10_000;

/**
 * "보여줘" 이후 그려졌다는 답을 기다리는 한계 시간.
 *
 * 성능 게이트가 요구하는 상한이 300ms이므로 그보다 훨씬 넉넉하게 잡았다.
 * 여기 걸린다는 것은 느린 것이 아니라 무언가 잘못됐다는 뜻이다.
 */
export const SIDE_PIN_SHOW_TIMEOUT_MS = 3_000;

export interface SidePinTransitionContext {
  readonly nowMs: number;
  /**
   * 이번 전이에서 창 조작이 필요하면 쓸 식별자.
   *
   * 도메인이 난수를 만들면 순수 함수가 아니게 되므로 호출자가 미리 만들어 넣는다.
   */
  readonly operationId: string;
}

export interface SidePinTransitionResult {
  readonly next: SidePinRuntimeState;
  readonly commands: readonly SidePinCommand[];
}

function unchanged(state: SidePinRuntimeState): SidePinTransitionResult {
  return { next: state, commands: [] };
}

/** 상태를 바꾸면 판번호를 올린다 — 예약과 요청의 유효성 판단 기준이 된다 */
function bump(
  state: SidePinRuntimeState,
  patch: Partial<SidePinRuntimeState>,
): SidePinRuntimeState {
  return { ...state, ...patch, revision: state.revision + 1 };
}

function scheduleOf(
  type: SidePinPendingTransition['type'],
  revision: number,
  nowMs: number,
  delayMs: number,
): SidePinPendingTransition {
  return { type, scheduledRevision: revision, dueAtMs: nowMs + delayMs };
}

function hostCommand(
  kind: SidePinHostOperationKind,
  ctx: SidePinTransitionContext,
  requestedRevision: number,
  focus?: boolean,
): SidePinCommand {
  return focus === undefined
    ? { type: 'host', kind, operationId: ctx.operationId, requestedRevision }
    : { type: 'host', kind, operationId: ctx.operationId, requestedRevision, focus };
}

function pendingOf(
  kind: SidePinHostOperationKind,
  ctx: SidePinTransitionContext,
  requestedRevision: number,
  userInitiated = false,
): SidePinPendingHostOperation {
  return { operationId: ctx.operationId, kind, requestedRevision, userInitiated };
}

/** 접힘을 미뤄야 하는 상황인가 — 고정했거나, 메모를 쓰는 중이거나, 포인터가 안에 있거나 */
function shouldHoldOpen(state: SidePinRuntimeState): boolean {
  return (
    state.pinnedZone !== 'none' ||
    isEditorBusy(state.editorActivity) ||
    isPointerInsideSidePin(state.pointerRegion)
  );
}

/**
 * 접힘 예약을 건다. 붙잡아 둘 이유가 있으면 아무것도 하지 않는다.
 */
function scheduleCollapse(
  state: SidePinRuntimeState,
  ctx: SidePinTransitionContext,
  patch: Partial<SidePinRuntimeState> = {},
): SidePinTransitionResult {
  if (state.surface !== 'expanded' || shouldHoldOpen({ ...state, ...patch })) {
    const next = bump(state, patch);
    return { next, commands: [] };
  }
  const revision = state.revision + 1;
  const transition = scheduleOf('collapse', revision, ctx.nowMs, SIDE_PIN_COLLAPSE_DELAY_MS);
  return {
    next: bump(state, { ...patch, pendingTransition: transition }),
    commands: [{ type: 'schedule', transition }],
  };
}

function withoutKind(
  ops: readonly SidePinPendingHostOperation[],
  kind: SidePinHostOperationKind,
): readonly SidePinPendingHostOperation[] {
  return ops.filter((op) => op.kind !== kind);
}

/**
 * 열려던 것을 그만둔다.
 *
 * "보여줘"까지 이미 보낸 뒤에 포인터가 떠나는 경우가 있다. 이때 대기 중인
 * show 요청을 그대로 두면, 뒤늦게 도착한 "그렸다" 알림이 짝을 찾아 패널을 열어버린다.
 * 사용자 입장에서는 건드리지도 않은 창이 혼자 튀어나온 것이다.
 *
 * 그래서 show 대기를 지우고, 이미 화면에 뜬 것이 있을 수 있으니 접으라고 시킨다.
 */
function abandonReveal(
  state: SidePinRuntimeState,
  ctx: SidePinTransitionContext,
  patch: Partial<SidePinRuntimeState>,
): SidePinTransitionResult {
  const commands: SidePinCommand[] = [];
  if (state.pendingTransition !== null) commands.push({ type: 'cancel-schedule' });

  const hasPendingShow = state.pendingHostOperations.some((op) => op.kind === 'show-panel');
  if (!hasPendingShow) {
    return { next: bump(state, { ...patch, pendingTransition: null }), commands };
  }

  const revision = state.revision + 1;
  commands.push(hostCommand('collapse-panel', ctx, revision));
  return {
    next: bump(state, {
      ...patch,
      pendingTransition: null,
      pendingHostOperations: [
        ...withoutKind(state.pendingHostOperations, 'show-panel'),
        pendingOf('collapse-panel', ctx, revision),
      ],
    }),
    commands,
  };
}

/** 예약이 걸려 있으면 취소한다 */
function cancelPending(
  state: SidePinRuntimeState,
  patch: Partial<SidePinRuntimeState> = {},
): SidePinTransitionResult {
  if (state.pendingTransition === null) {
    return { next: bump(state, patch), commands: [] };
  }
  return {
    next: bump(state, { ...patch, pendingTransition: null }),
    commands: [{ type: 'cancel-schedule' }],
  };
}

/**
 * 옆핀 안으로 들어왔을 때 패널 수명 단계를 어떻게 볼지.
 *
 * - `absent`: 창이 없으니 지금부터 준비 중이다
 * - `cooldown`: 파기를 기다리던 창이 아직 살아 있으니 바로 쓸 수 있다
 * - 그 밖: 진행 중인 단계를 그대로 둔다. 준비가 안 끝났는데 `ready`로 적으면
 *   나중에 "이미 준비됐다"고 판단해 준비 단계를 건너뛴다.
 */
function lifecycleOnEnter(current: SidePinRuntimeState['panelLifecycle']) {
  if (current === 'absent') return 'preparing';
  if (current === 'cooldown') return 'ready';
  return current;
}

function onPointerRegionChanged(
  state: SidePinRuntimeState,
  region: SidePinRuntimeState['pointerRegion'],
  ctx: SidePinTransitionContext,
): SidePinTransitionResult {
  if (state.protectedReason !== null) return unchanged(state);
  if (state.pointerRegion === region) return unchanged(state);

  const inside = isPointerInsideSidePin(region);

  // 손잡이·패널 안에서의 이동은 "밖으로 나갔다"가 아니다. 접힘 예약만 취소한다.
  if (inside && state.surface === 'expanded') {
    return cancelPending(state, { pointerRegion: region });
  }

  // 접힌 상태에서 옆핀 안으로 들어왔다 → 펼침 예약 + 패널 미리 준비
  if (inside && state.surface === 'collapsed') {
    // 손잡이의 위젯 구역과 메모 구역 사이를 오가는 것은 계속 머무는 것이다.
    // 경계를 넘을 때마다 시간을 다시 세면, 손잡이를 훑는 사용자는 아무리 있어도 못 연다.
    if (state.pendingTransition?.type === 'reveal') {
      return { next: bump(state, { pointerRegion: region }), commands: [] };
    }

    const revision = state.revision + 1;
    const transition = scheduleOf('reveal', revision, ctx.nowMs, SIDE_PIN_REVEAL_DELAY_MS);
    const commands: SidePinCommand[] = [{ type: 'schedule', transition }];

    // 파기 대기 중이던 패널이 있으면 다시 만들지 않고 재사용한다.
    const needsPrepare = state.panelLifecycle === 'absent';
    const pendingHostOperations = needsPrepare
      ? [...state.pendingHostOperations, pendingOf('prepare-panel', ctx, revision)]
      : state.pendingHostOperations;
    if (needsPrepare) commands.push(hostCommand('prepare-panel', ctx, revision));

    return {
      next: bump(state, {
        pointerRegion: region,
        openReason: 'hover',
        pendingTransition: transition,
        pendingHostOperations,
        panelLifecycle: lifecycleOnEnter(state.panelLifecycle),
      }),
      commands,
    };
  }

  // 밖으로 나갔다
  if (!inside && state.surface === 'expanded') {
    return scheduleCollapse(state, ctx, { pointerRegion: region });
  }

  // 접힌 상태에서 나갔다 → 예약을 취소하고, 이미 보낸 show 요청도 포기한다
  return abandonReveal(state, ctx, { pointerRegion: region, openReason: null });
}

function onTimerFired(
  state: SidePinRuntimeState,
  transition: SidePinPendingTransition,
  ctx: SidePinTransitionContext,
): SidePinTransitionResult {
  // 예약이 아직 살아 있고 그때 그 예약이 맞을 때만 실행한다.
  //
  // ⚠️ 기획서 §5는 "타이머의 scheduledRevision이 현재 revision과 다르면 폐기"라고
  // 적었지만, 그대로 구현하면 호버로 패널이 절대 안 열린다. 손잡이에 들어오면
  // reveal 예약과 함께 prepare-panel도 나가는데, 그 결과가 180ms 안에 돌아오면서
  // revision을 올려버리기 때문이다. 창 준비라는 내부 사정이 사용자 의도를 취소하는 셈이다.
  //
  // 그래서 판단 기준을 "revision이 그대로인가"가 아니라 "이 예약이 아직 유효한가"로 둔다.
  // 사용자 의도가 바뀌는 지점(포인터 이탈·고정·편집 시작)에서는 pendingTransition을
  // 반드시 지우거나 교체하므로, 취소 의미는 그대로 지켜진다.
  if (state.pendingTransition === null) return unchanged(state);
  if (state.pendingTransition.type !== transition.type) return unchanged(state);
  if (state.pendingTransition.scheduledRevision !== transition.scheduledRevision) {
    return unchanged(state);
  }

  const revision = state.revision + 1;

  if (transition.type === 'reveal') {
    // 아직 펼쳤다고 하지 않는다. 그려졌다는 응답을 받아야 확정한다.
    // 대신 답이 영영 안 올 경우를 대비해 감시 시간을 건다.
    const watchdog = scheduleOf('show-timeout', revision, ctx.nowMs, SIDE_PIN_SHOW_TIMEOUT_MS);
    return {
      next: bump(state, {
        pendingTransition: watchdog,
        pendingHostOperations: [
          ...state.pendingHostOperations,
          pendingOf('show-panel', ctx, revision),
        ],
      }),
      commands: [
        hostCommand('show-panel', ctx, revision, false),
        { type: 'schedule', transition: watchdog },
      ],
    };
  }

  if (transition.type === 'show-timeout') {
    // 창을 접으라고 시킨다. 여기서 `dispose-panel`만 보내면 안 된다 —
    // 손잡이와 패널이 한 창인 구조(A안)에서 파기는 "내용만 비우고 창은 유지"라,
    // 창이 펼친 크기 그대로 화면에 남는다. 접기만이 손잡이 크기로 되돌린다.
    //
    // 대신 반드시 "사용자가 닫은 것"으로 표시한다. 그러지 않으면 접기 완료가
    // "커서가 안에 있으니 다시 열기"를 불러, 그리기가 계속 실패하는 상황에서
    // 열기 → 3초 → 접기 → 열기가 끝없이 반복된다.
    return {
      next: bump(state, {
        surface: 'collapsed',
        openReason: null,
        activeZone: null,
        pendingTransition: null,
        pendingHostOperations: [
          ...withoutKind(state.pendingHostOperations, 'show-panel'),
          pendingOf('collapse-panel', ctx, revision, true),
        ],
        hostError: { operationId: ctx.operationId, code: 'SHOW_TIMEOUT' },
      }),
      commands: [hostCommand('collapse-panel', ctx, revision)],
    };
  }

  if (transition.type === 'collapse') {
    return {
      next: bump(state, {
        pendingTransition: null,
        pendingHostOperations: [
          ...state.pendingHostOperations,
          pendingOf('collapse-panel', ctx, revision),
        ],
      }),
      commands: [hostCommand('collapse-panel', ctx, revision)],
    };
  }

  return {
    next: bump(state, {
      pendingTransition: null,
      pendingHostOperations: [
        ...state.pendingHostOperations,
        pendingOf('dispose-panel', ctx, revision),
      ],
    }),
    commands: [hostCommand('dispose-panel', ctx, revision)],
  };
}

/** 지금 기다리고 있는 요청 중 이 응답과 완전히 일치하는 것을 찾는다 */
function findPending(
  state: SidePinRuntimeState,
  operationId: string,
  requestedRevision: number,
): SidePinPendingHostOperation | undefined {
  return state.pendingHostOperations.find(
    (op) => op.operationId === operationId && op.requestedRevision === requestedRevision,
  );
}

function withoutPending(
  state: SidePinRuntimeState,
  operationId: string,
): readonly SidePinPendingHostOperation[] {
  return state.pendingHostOperations.filter((op) => op.operationId !== operationId);
}

function onPanelPainted(
  state: SidePinRuntimeState,
  operationId: string,
  requestedRevision: number,
): SidePinTransitionResult {
  // 잠금·절전·전체화면 중에는 어떤 알림이 와도 열지 않는다 (이중 방어).
  if (state.protectedReason !== null) return unchanged(state);

  const pending = findPending(state, operationId, requestedRevision);
  // 취소된 요청의 늦은 알림 → 유령 펼침을 만들지 않는다.
  if (pending === undefined || pending.kind !== 'show-panel') return unchanged(state);

  // 실제로 그려졌으니 감시 시간과 준비 요청 대기는 모두 필요 없다.
  // 남겨 두면 목록이 계속 자라고, 늦은 준비 응답이 엉뚱한 판단을 만든다.
  const commands: SidePinCommand[] =
    state.pendingTransition?.type === 'show-timeout' ? [{ type: 'cancel-schedule' }] : [];

  return {
    next: bump(state, {
      surface: 'expanded',
      activeZone: 'both',
      panelLifecycle: 'visible',
      pendingTransition:
        state.pendingTransition?.type === 'show-timeout' ? null : state.pendingTransition,
      pendingHostOperations: withoutKind(withoutPending(state, operationId), 'prepare-panel'),
      hostError: null,
    }),
    commands,
  };
}

function onHostResult(
  state: SidePinRuntimeState,
  event: Extract<SidePinEvent, { type: 'host-operation-result' }>,
  ctx: SidePinTransitionContext,
): SidePinTransitionResult {
  const pending = findPending(state, event.operationId, event.requestedRevision);
  if (pending === undefined) return unchanged(state);

  const remaining = withoutPending(state, event.operationId);

  if (event.status === 'stale') {
    return { next: bump(state, { pendingHostOperations: remaining }), commands: [] };
  }

  if (event.status === 'failed') {
    const hostError = { operationId: event.operationId, code: event.code ?? 'unknown' };
    // 펼치기에 실패했으면 절대 expanded로 두지 않고 손잡이 상태로 되돌린다.
    if (pending.kind === 'show-panel' || pending.kind === 'prepare-panel') {
      // 예약도 반드시 함께 지운다. 창 준비가 실패했는데 180ms 예약이 살아 있으면,
      // 없는 패널에 "보여줘"를 보내고 그 응답으로 다시 펼쳐진 것처럼 되어 버린다.
      return {
        next: bump(state, {
          surface: 'collapsed',
          openReason: null,
          activeZone: null,
          panelLifecycle: 'absent',
          pendingTransition: null,
          pendingHostOperations: withoutKind(remaining, 'show-panel'),
          hostError,
        }),
        commands: state.pendingTransition !== null ? [{ type: 'cancel-schedule' }] : [],
      };
    }
    // 손잡이조차 못 만들면 옆핀은 이번 실행에서 쓸 수 없다. 계속 시도하며
    // 반쯤 동작하는 상태로 두는 것보다, 꺼진 것으로 명확히 표시하는 편이 낫다.
    if (pending.kind === 'ensure-rail') {
      return {
        next: bump(state, {
          surface: 'collapsed',
          openReason: null,
          activeZone: null,
          panelLifecycle: 'absent',
          pendingTransition: null,
          pendingHostOperations: remaining,
          protectedReason: 'adapter-unhealthy',
          hostError,
        }),
        commands: state.pendingTransition !== null ? [{ type: 'cancel-schedule' }] : [],
      };
    }

    // 위치를 다시 잡는 데 실패했다. 어디에 그려야 할지 모르는 채로 띄워 두면
    // 화면 밖이나 엉뚱한 모니터에 걸쳐 남을 수 있으므로 일단 숨긴다.
    //
    // 이때 보호 상태로 표시하는 것이 중요하다. 그냥 숨기기만 하면 손잡이가 사라진 채
    // 다시 나타날 길이 없어져, "접힌 손잡이가 늘 보인다"는 약속이 영영 깨진다.
    // 보호 상태로 두면 `protect-released`가 손잡이를 다시 만들어 준다.
    if (pending.kind === 'reposition-all') {
      const revision = state.revision + 1;
      return {
        next: bump(state, {
          surface: 'collapsed',
          openReason: null,
          activeZone: null,
          pendingTransition: null,
          pendingHostOperations: [
            ...withoutKind(remaining, 'show-panel'),
            pendingOf('hide-all', ctx, revision, true),
          ],
          protectedReason: 'adapter-unhealthy',
          hostError,
        }),
        commands: [hostCommand('hide-all', ctx, revision)],
      };
    }

    return {
      next: bump(state, { pendingHostOperations: remaining, hostError }),
      commands: [],
    };
  }

  // status === 'applied'
  switch (pending.kind) {
    case 'prepare-panel':
      return {
        next: bump(state, { panelLifecycle: 'ready', pendingHostOperations: remaining }),
        commands: [],
      };
    case 'collapse-panel': {
      const revision = state.revision + 1;
      // 접는 사이에 커서가 다시 들어와 있으면, 접힌 채로 굳히지 않고 곧바로 다시 연다.
      // 그렇지 않으면 커서는 패널 위에 있는데 화면만 닫힌 상태로 멈춘다.
      // 사용자가 Esc·단축키로 직접 닫은 것이라면 커서가 패널 위에 있어도 되열지 않는다.
      const reopening =
        isPointerInsideSidePin(state.pointerRegion) && pending.userInitiated !== true;
      const transition = reopening
        ? scheduleOf('reveal', revision, ctx.nowMs, SIDE_PIN_REVEAL_DELAY_MS)
        : scheduleOf('dispose-panel', revision, ctx.nowMs, SIDE_PIN_DISPOSE_DELAY_MS);
      return {
        next: bump(state, {
          surface: 'collapsed',
          openReason: reopening ? 'hover' : null,
          activeZone: null,
          panelLifecycle: reopening ? 'ready' : 'cooldown',
          pendingTransition: transition,
          pendingHostOperations: withoutKind(remaining, 'prepare-panel'),
        }),
        commands: [{ type: 'schedule', transition }],
      };
    }
    case 'dispose-panel':
      return {
        next: bump(state, { panelLifecycle: 'absent', pendingHostOperations: remaining }),
        commands: [],
      };
    case 'hide-all':
      return {
        next: bump(state, {
          surface: 'collapsed',
          openReason: null,
          activeZone: null,
          panelLifecycle: 'absent',
          pendingHostOperations: remaining,
        }),
        commands: [],
      };
    case 'show-panel':
      // "요청을 받았다"와 "화면에 그려졌다"는 다른 사건이다.
      // 여기서 대기 목록에서 지워버리면 뒤이어 오는 panel-painted가 짝을 잃고
      // 무시되어, 패널이 실제로 떠 있는데도 영영 collapsed로 남는다.
      return unchanged(state);
    default:
      return { next: bump(state, { pendingHostOperations: remaining }), commands: [] };
  }
}

function onTogglePin(
  state: SidePinRuntimeState,
  zone: SidePinZone,
  ctx: SidePinTransitionContext,
): SidePinTransitionResult {
  if (state.protectedReason !== null) return unchanged(state);

  // 같은 지점을 다시 누르면 고정 해제. 포인터가 밖이면 곧 접힌다.
  if (state.pinnedZone === zone) {
    const released = { ...state, pinnedZone: 'none' as const };
    return scheduleCollapse(released, ctx, { pinnedZone: 'none' });
  }

  const revision = state.revision + 1;
  const commands: SidePinCommand[] = [];
  if (state.pendingTransition !== null) commands.push({ type: 'cancel-schedule' });

  // 접힌 손잡이를 클릭한 경우다. 고정만 하고 열지 않으면 아무 일도 안 일어난 것처럼 보인다.
  // 클릭은 명시적 의도이므로 포커스까지 가져오며 연다.
  const opening = state.surface !== 'expanded';
  const kind = opening ? 'show-panel' : 'focus-panel';
  commands.push(
    opening ? hostCommand(kind, ctx, revision, true) : hostCommand(kind, ctx, revision),
  );

  // 여는 경로에는 반드시 감시 시간을 건다. 호버든 클릭이든 그려졌다는 답이
  // 끝내 안 오면 상태가 영영 접힌 채로 남는 것은 똑같다.
  const watchdog = opening
    ? scheduleOf('show-timeout', revision, ctx.nowMs, SIDE_PIN_SHOW_TIMEOUT_MS)
    : null;
  if (watchdog !== null) commands.push({ type: 'schedule', transition: watchdog });

  return {
    next: bump(state, {
      pinnedZone: zone,
      openReason: 'click',
      pendingTransition: watchdog,
      pendingHostOperations: [...state.pendingHostOperations, pendingOf(kind, ctx, revision)],
    }),
    commands,
  };
}

function onEditorActivityChanged(
  state: SidePinRuntimeState,
  activity: SidePinRuntimeState['editorActivity'],
  ctx: SidePinTransitionContext,
): SidePinTransitionResult {
  if (state.editorActivity === activity) return unchanged(state);

  // 편집을 시작했으면 예약된 접힘을 취소한다 — 쓰던 메모가 사라지면 안 된다.
  if (isEditorBusy(activity)) {
    return cancelPending(state, { editorActivity: activity });
  }

  // 편집이 끝났고 포인터도 밖이면 그때부터 접힘 시간을 잰다.
  return scheduleCollapse({ ...state, editorActivity: activity }, ctx, {
    editorActivity: activity,
  });
}

function collapseNow(
  state: SidePinRuntimeState,
  ctx: SidePinTransitionContext,
  patch: Partial<SidePinRuntimeState> = {},
): SidePinTransitionResult {
  const revision = state.revision + 1;
  const commands: SidePinCommand[] = [];
  if (state.pendingTransition !== null) commands.push({ type: 'cancel-schedule' });
  commands.push(hostCommand('collapse-panel', ctx, revision));

  return {
    next: bump(state, {
      ...patch,
      pendingTransition: null,
      // 아직 답이 안 온 show 요청은 여기서 포기한다. 남겨 두면 늦은 "그렸다" 알림이
      // 방금 닫은 패널을 다시 열어 버린다.
      pendingHostOperations: [
        ...withoutKind(state.pendingHostOperations, 'show-panel'),
        // 사용자가 직접 닫은 것으로 표시한다. 커서가 패널 위에 있어도 되열지 않기 위해서다.
        pendingOf('collapse-panel', ctx, revision, true),
      ],
    }),
    commands,
  };
}

/**
 * 상태 전이의 유일한 진입점.
 */
export function resolveSidePinTransition(
  state: SidePinRuntimeState,
  event: SidePinEvent,
  ctx: SidePinTransitionContext,
): SidePinTransitionResult {
  switch (event.type) {
    case 'enabled-changed': {
      if (!event.enabled) {
        const revision = state.revision + 1;
        return {
          next: {
            ...INITIAL_SIDE_PIN_RUNTIME_STATE,
            revision,
            pendingHostOperations: [pendingOf('destroy-all', ctx, revision)],
          },
          commands: [
            ...(state.pendingTransition !== null
              ? [{ type: 'cancel-schedule' } as SidePinCommand]
              : []),
            hostCommand('destroy-all', ctx, revision),
          ],
        };
      }
      const revision = state.revision + 1;
      return {
        next: {
          ...INITIAL_SIDE_PIN_RUNTIME_STATE,
          revision,
          pendingHostOperations: [pendingOf('ensure-rail', ctx, revision)],
        },
        commands: [hostCommand('ensure-rail', ctx, revision)],
      };
    }

    case 'force-protect': {
      const revision = state.revision + 1;
      return {
        next: bump(state, {
          surface: 'collapsed',
          openReason: null,
          activeZone: null,
          pinnedZone: 'none',
          panelLifecycle: 'absent',
          pendingTransition: null,
          // 잠금·절전에서는 편집 중이라도 화면 내용을 비운다. 민감한 메모가 먼저다.
          editorActivity: 'idle',
          pendingHostOperations: [
            ...withoutKind(state.pendingHostOperations, 'show-panel'),
            pendingOf('hide-all', ctx, revision),
          ],
          protectedReason: event.reason,
        }),
        commands: [
          ...(state.pendingTransition !== null
            ? [{ type: 'cancel-schedule' } as SidePinCommand]
            : []),
          hostCommand('hide-all', ctx, revision),
        ],
      };
    }

    case 'protect-released': {
      if (state.protectedReason === null) return unchanged(state);
      const revision = state.revision + 1;
      return {
        next: bump(state, {
          protectedReason: null,
          pendingHostOperations: [
            ...state.pendingHostOperations,
            pendingOf('ensure-rail', ctx, revision),
          ],
        }),
        commands: [hostCommand('ensure-rail', ctx, revision)],
      };
    }

    case 'layout-changed': {
      if (state.protectedReason !== null) return unchanged(state);
      const revision = state.revision + 1;
      return {
        next: bump(state, {
          pendingHostOperations: [
            ...state.pendingHostOperations,
            pendingOf('reposition-all', ctx, revision),
          ],
        }),
        commands: [hostCommand('reposition-all', ctx, revision)],
      };
    }

    case 'pointer-region-changed':
      return onPointerRegionChanged(state, event.region, ctx);

    case 'timer-fired':
      return onTimerFired(state, event.transition, ctx);

    case 'panel-painted':
      return onPanelPainted(state, event.operationId, event.requestedRevision);

    case 'host-operation-result':
      return onHostResult(state, event, ctx);

    case 'toggle-pin':
      return onTogglePin(state, event.zone, ctx);

    case 'editor-activity-changed':
      return onEditorActivityChanged(state, event.activity, ctx);

    case 'window-focus-changed':
      if (state.hasWindowFocus === event.focused) return unchanged(state);
      return { next: bump(state, { hasWindowFocus: event.focused }), commands: [] };

    case 'escape-pressed': {
      // 편집 중이라면 Esc는 메모 편집기 것이다. 여기까지 오지 않아야 정상이다.
      if (isEditorBusy(state.editorActivity)) return unchanged(state);
      if (state.protectedReason !== null) return unchanged(state);
      if (state.surface !== 'expanded' && state.pinnedZone === 'none') return unchanged(state);
      // 호버로만 열린 창은 포커스가 없다. 그때의 Esc는 다른 앱에서 누른 것이므로
      // 남의 키 입력으로 옆핀을 닫지 않는다. 호버 창은 포인터 이탈로만 닫힌다.
      if (!state.hasWindowFocus && state.pinnedZone === 'none') return unchanged(state);
      return collapseNow(state, ctx, { pinnedZone: 'none', openReason: null });
    }

    case 'outside-click': {
      if (state.pinnedZone !== 'none') return unchanged(state);
      if (isEditorBusy(state.editorActivity)) return unchanged(state);
      // 호버로만 열린 창은 포커스가 없어 바깥 클릭을 근거로 삼지 않는다.
      if (!state.hasWindowFocus || state.surface !== 'expanded') return unchanged(state);
      return collapseNow(state, ctx);
    }

    case 'shortcut-toggle': {
      if (state.protectedReason !== null) return unchanged(state);
      if (state.surface === 'expanded') {
        return collapseNow(state, ctx, { pinnedZone: 'none', openReason: null });
      }
      const revision = state.revision + 1;
      const commands: SidePinCommand[] = [];
      if (state.pendingTransition !== null) commands.push({ type: 'cancel-schedule' });
      commands.push(hostCommand('show-panel', ctx, revision, true));
      const watchdog = scheduleOf('show-timeout', revision, ctx.nowMs, SIDE_PIN_SHOW_TIMEOUT_MS);
      commands.push({ type: 'schedule', transition: watchdog });
      return {
        next: bump(state, {
          openReason: 'shortcut',
          pendingTransition: watchdog,
          pendingHostOperations: [
            ...state.pendingHostOperations,
            pendingOf('show-panel', ctx, revision),
          ],
        }),
        commands,
      };
    }

    default: {
      // 새 이벤트를 추가하고 여기 분기를 빠뜨리면 컴파일이 실패하도록 둔다.
      const exhaustive: never = event;
      void exhaustive;
      return unchanged(state);
    }
  }
}
