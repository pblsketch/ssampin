/**
 * 옆핀의 상태 전이 규칙 — 순수 함수.
 *
 * 이 파일은 Electron도 React도 타이머도 모른다. "지금 상태 + 방금 일어난 일"을 받아
 * "다음 상태 + 시켜야 할 일"만 돌려준다. 그래서 창을 띄우지 않고도 180ms/400ms 규칙과
 * 늦게 도착한 응답 처리를 전부 테스트할 수 있다.
 *
 * 설계를 지탱하는 네 가지 규칙:
 *
 * 1. **펼침은 시간이 아니라 그려진 사실로 확정한다.** 180ms가 지났다고 `expanded`로
 *    바꾸면, 창을 띄우다 실패했을 때 "펼쳐진 상태인데 화면엔 없는" 유령 상태가 남는다.
 *    그래서 180ms에는 "보여줘"라고 요청만 하고(`opening`), 실제로 그려졌다는 응답을
 *    받은 뒤에만 `expanded`가 된다.
 *
 * 2. **여는 중은 눈에 보이는 상태로 둔다.** `opening`을 `collapsed`에 섞어 표현했더니
 *    "아직 안 열림"과 "열려던 걸 그만둠"을 구분할 수 없었고, 취소해야 할 지점을
 *    빠뜨려도 드러나지 않았다.
 *
 * 3. **같은 종류의 창 조작은 하나만 살아 있는다.** 새 요청은 같은 종류의 지난 요청을
 *    밀어낸다. 그래서 대기 목록이 무한히 자라지 않고, 취소된 요청의 늦은 응답은
 *    짝을 잃어 자동으로 버려진다.
 *
 * 4. **꺼졌거나 보호 중이면 아무 입력도 창 조작이 되지 않는다.** 이 판단은
 *    `isSidePinResponsive` 한 곳에서만 한다. 분기마다 따로 검사하면 반드시 빠뜨린다.
 */
import {
  isEditorBusy,
  isPointerInsideSidePin,
  isSidePinResponsive,
  INITIAL_SIDE_PIN_RUNTIME_STATE,
  type SidePinHostOperationKind,
  type SidePinOpenReason,
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

// ─── 작은 도구들 ────────────────────────────────────────────────

function unchanged(state: SidePinRuntimeState): SidePinTransitionResult {
  return { next: state, commands: [] };
}

/** 상태를 바꾸면 판번호를 올린다 */
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

function withoutKind(
  ops: readonly SidePinPendingHostOperation[],
  ...kinds: readonly SidePinHostOperationKind[]
): readonly SidePinPendingHostOperation[] {
  return ops.filter((op) => !kinds.includes(op.kind));
}

/**
 * 새 요청을 등록한다. 같은 종류의 지난 요청은 밀어낸다.
 *
 * 목록이 종류 수(9개)를 넘지 않게 하고, 취소된 요청의 늦은 응답이 짝을 잃어
 * 자동으로 버려지게 만드는 장치다.
 */
function withPending(
  ops: readonly SidePinPendingHostOperation[],
  op: SidePinPendingHostOperation,
): readonly SidePinPendingHostOperation[] {
  return [...withoutKind(ops, op.kind), op];
}

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

/** 접힘을 미뤄야 하는 상황인가 — 고정했거나, 메모를 쓰는 중이거나, 포인터가 안에 있거나 */
function shouldHoldOpen(state: SidePinRuntimeState): boolean {
  return (
    state.pinnedZone !== 'none' ||
    isEditorBusy(state.editorActivity) ||
    isPointerInsideSidePin(state.pointerRegion)
  );
}

/** 호버로 열 때는 포커스를 빼앗지 않고, 클릭·단축키로 열 때만 가져온다 */
function focusFor(reason: SidePinOpenReason): boolean {
  return reason === 'click' || reason === 'shortcut';
}

/** 예약을 취소해야 하면 취소 명령을 낸다 */
function cancelIfScheduled(state: SidePinRuntimeState): SidePinCommand[] {
  return state.pendingTransition !== null ? [{ type: 'cancel-schedule' }] : [];
}

// ─── 열기·닫기 공통 동작 ────────────────────────────────────────

/**
 * 패널 열기를 시작한다.
 *
 * 창이 아직 없으면 먼저 만들라고 시키고, 만들어졌다는 답이 오면 그때 보여달라고 한다
 * (`onPrepared`). 손잡이만 상주하는 구조(D안)에서는 창을 만들지 않고 바로 보여달라고 하면
 * 존재하지 않는 창을 대상으로 하는 셈이라 실패한다.
 */
function beginOpen(
  state: SidePinRuntimeState,
  ctx: SidePinTransitionContext,
  reason: SidePinOpenReason,
  patch: Partial<SidePinRuntimeState> = {},
): SidePinTransitionResult {
  const revision = state.revision + 1;
  const watchdog = scheduleOf('show-timeout', revision, ctx.nowMs, SIDE_PIN_SHOW_TIMEOUT_MS);
  const commands: SidePinCommand[] = [...cancelIfScheduled(state)];

  const needsPrepare = state.panelLifecycle === 'absent';
  const kind: SidePinHostOperationKind = needsPrepare ? 'prepare-panel' : 'show-panel';
  commands.push(
    needsPrepare
      ? hostCommand('prepare-panel', ctx, revision)
      : hostCommand('show-panel', ctx, revision, focusFor(reason)),
  );
  commands.push({ type: 'schedule', transition: watchdog });

  return {
    next: bump(state, {
      ...patch,
      surface: 'opening',
      openReason: reason,
      panelLifecycle: needsPrepare ? 'preparing' : state.panelLifecycle,
      pendingTransition: watchdog,
      pendingHostOperations: withPending(
        state.pendingHostOperations,
        pendingOf(kind, ctx, revision),
      ),
    }),
    commands,
  };
}

/**
 * 열려던 것을 그만둔다.
 *
 * "보여줘"까지 보낸 뒤 취소하는 경우, 대기 중인 show 요청을 그대로 두면 뒤늦게 도착한
 * "그렸다" 알림이 짝을 찾아 패널을 열어버린다. 사용자 입장에서는 건드리지도 않은 창이
 * 혼자 튀어나온 것이다. 그래서 show 대기를 지우고, 이미 뜬 것이 있을 수 있으니 접으라고 시킨다.
 */
function abandonOpen(
  state: SidePinRuntimeState,
  ctx: SidePinTransitionContext,
  patch: Partial<SidePinRuntimeState> = {},
): SidePinTransitionResult {
  const revision = state.revision + 1;
  return {
    next: bump(state, {
      ...patch,
      surface: 'collapsed',
      openReason: null,
      activeZone: null,
      pendingTransition: null,
      pendingHostOperations: withPending(
        withoutKind(state.pendingHostOperations, 'show-panel'),
        pendingOf('collapse-panel', ctx, revision, true),
      ),
    }),
    commands: [...cancelIfScheduled(state), hostCommand('collapse-panel', ctx, revision)],
  };
}

/**
 * 접힌 상태에서 준비만 해 두고 나간 경우를 정리한다.
 *
 * 손잡이를 스치고 지나가면 창을 만들라는 요청만 나간 채 남는다. 그대로 두면 보이지도
 * 않는 창이 계속 메모리에 상주하므로, 없앨 시간을 예약해 둔다.
 */
function abandonPrepare(
  state: SidePinRuntimeState,
  ctx: SidePinTransitionContext,
  patch: Partial<SidePinRuntimeState>,
): SidePinTransitionResult {
  const idlePanel = state.panelLifecycle === 'preparing' || state.panelLifecycle === 'ready';
  if (!idlePanel) {
    return {
      next: bump(state, { ...patch, pendingTransition: null }),
      commands: cancelIfScheduled(state),
    };
  }

  const revision = state.revision + 1;
  const transition = scheduleOf('dispose-panel', revision, ctx.nowMs, SIDE_PIN_DISPOSE_DELAY_MS);
  return {
    next: bump(state, { ...patch, pendingTransition: transition }),
    commands: [...cancelIfScheduled(state), { type: 'schedule', transition }],
  };
}

/** 사용자가 직접 닫았다 (Esc·단축키·고정 해제) */
function closeNow(
  state: SidePinRuntimeState,
  ctx: SidePinTransitionContext,
  patch: Partial<SidePinRuntimeState> = {},
): SidePinTransitionResult {
  const revision = state.revision + 1;
  return {
    next: bump(state, {
      ...patch,
      surface: 'collapsed',
      openReason: null,
      activeZone: null,
      pendingTransition: null,
      pendingHostOperations: withPending(
        withoutKind(state.pendingHostOperations, 'show-panel'),
        pendingOf('collapse-panel', ctx, revision, true),
      ),
    }),
    commands: [...cancelIfScheduled(state), hostCommand('collapse-panel', ctx, revision)],
  };
}

/** 접힘 예약을 건다. 붙잡아 둘 이유가 있으면 아무것도 하지 않는다. */
function scheduleCollapse(
  state: SidePinRuntimeState,
  ctx: SidePinTransitionContext,
  patch: Partial<SidePinRuntimeState> = {},
): SidePinTransitionResult {
  if (state.surface !== 'expanded' || shouldHoldOpen({ ...state, ...patch })) {
    return { next: bump(state, patch), commands: [] };
  }
  const revision = state.revision + 1;
  const transition = scheduleOf('collapse', revision, ctx.nowMs, SIDE_PIN_COLLAPSE_DELAY_MS);
  return {
    next: bump(state, { ...patch, pendingTransition: transition }),
    commands: [{ type: 'schedule', transition }],
  };
}

// ─── 이벤트별 처리 ──────────────────────────────────────────────

/** 옆핀 안으로 들어왔을 때 패널 수명 단계를 어떻게 볼지 */
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
  if (!isSidePinResponsive(state)) return unchanged(state);
  if (state.pointerRegion === region) return unchanged(state);

  const inside = isPointerInsideSidePin(region);

  // 여는 중에는 위치만 기록한다. 감시 시간을 취소하면 안 된다.
  if (state.surface === 'opening') {
    if (inside) return { next: bump(state, { pointerRegion: region }), commands: [] };
    return abandonOpen(state, ctx, { pointerRegion: region });
  }

  // 손잡이·패널 안에서의 이동은 "밖으로 나갔다"가 아니다. 접힘 예약만 취소한다.
  if (inside && state.surface === 'expanded') {
    if (state.pendingTransition?.type !== 'collapse') {
      return { next: bump(state, { pointerRegion: region }), commands: [] };
    }
    return {
      next: bump(state, { pointerRegion: region, pendingTransition: null }),
      commands: [{ type: 'cancel-schedule' }],
    };
  }

  // 접힌 상태에서 옆핀 안으로 들어왔다 → 펼침 예약 + 필요하면 패널 미리 준비
  if (inside && state.surface === 'collapsed') {
    // 손잡이의 위젯 구역과 메모 구역 사이를 오가는 것은 계속 머무는 것이다.
    // 경계를 넘을 때마다 시간을 다시 세면, 손잡이를 훑는 사용자는 아무리 있어도 못 연다.
    if (state.pendingTransition?.type === 'reveal') {
      return { next: bump(state, { pointerRegion: region }), commands: [] };
    }

    const revision = state.revision + 1;
    const transition = scheduleOf('reveal', revision, ctx.nowMs, SIDE_PIN_REVEAL_DELAY_MS);
    const commands: SidePinCommand[] = [{ type: 'schedule', transition }];

    const needsPrepare = state.panelLifecycle === 'absent';
    if (needsPrepare) commands.push(hostCommand('prepare-panel', ctx, revision));

    return {
      next: bump(state, {
        pointerRegion: region,
        openReason: 'hover',
        pendingTransition: transition,
        panelLifecycle: lifecycleOnEnter(state.panelLifecycle),
        pendingHostOperations: needsPrepare
          ? withPending(state.pendingHostOperations, pendingOf('prepare-panel', ctx, revision))
          : state.pendingHostOperations,
      }),
      commands,
    };
  }

  // 밖으로 나갔다
  if (!inside && state.surface === 'expanded') {
    return scheduleCollapse(state, ctx, { pointerRegion: region });
  }

  // 접힌 상태에서 나갔다 → 펼침 예약 취소, 준비만 된 창은 없앨 시간을 예약
  return abandonPrepare(state, ctx, { pointerRegion: region, openReason: null });
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
  if (state.pendingTransition === null) return unchanged(state);
  if (state.pendingTransition.type !== transition.type) return unchanged(state);
  if (state.pendingTransition.scheduledRevision !== transition.scheduledRevision) {
    return unchanged(state);
  }

  // 꺼졌거나 보호 중이면 예약만 조용히 버린다. 창은 절대 건드리지 않는다.
  if (!isSidePinResponsive(state)) {
    return { next: bump(state, { pendingTransition: null }), commands: [] };
  }

  const revision = state.revision + 1;

  if (transition.type === 'reveal') {
    return beginOpen(state, ctx, state.openReason ?? 'hover');
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
        pendingHostOperations: withPending(
          withoutKind(state.pendingHostOperations, 'show-panel'),
          pendingOf('collapse-panel', ctx, revision, true),
        ),
        hostError: { operationId: ctx.operationId, code: 'SHOW_TIMEOUT' },
      }),
      commands: [hostCommand('collapse-panel', ctx, revision)],
    };
  }

  if (transition.type === 'collapse') {
    return {
      next: bump(state, {
        pendingTransition: null,
        pendingHostOperations: withPending(
          state.pendingHostOperations,
          pendingOf('collapse-panel', ctx, revision),
        ),
      }),
      commands: [hostCommand('collapse-panel', ctx, revision)],
    };
  }

  return {
    next: bump(state, {
      pendingTransition: null,
      pendingHostOperations: withPending(
        state.pendingHostOperations,
        pendingOf('dispose-panel', ctx, revision),
      ),
    }),
    commands: [hostCommand('dispose-panel', ctx, revision)],
  };
}

function onPanelPainted(
  state: SidePinRuntimeState,
  operationId: string,
  requestedRevision: number,
): SidePinTransitionResult {
  // 꺼졌거나 잠금·절전·전체화면 중에는 어떤 알림이 와도 열지 않는다.
  if (!isSidePinResponsive(state)) return unchanged(state);
  // 여는 중이 아니라면 이미 취소된 요청의 늦은 알림이다.
  if (state.surface !== 'opening') return unchanged(state);

  const pending = findPending(state, operationId, requestedRevision);
  if (pending === undefined || pending.kind !== 'show-panel') return unchanged(state);

  return {
    next: bump(state, {
      surface: 'expanded',
      activeZone: 'both',
      panelLifecycle: 'visible',
      pendingTransition: null,
      pendingHostOperations: withoutKind(withoutPending(state, operationId), 'prepare-panel'),
      hostError: null,
    }),
    commands: cancelIfScheduled(state),
  };
}

function onHostFailure(
  state: SidePinRuntimeState,
  pending: SidePinPendingHostOperation,
  remaining: readonly SidePinPendingHostOperation[],
  code: string,
  ctx: SidePinTransitionContext,
): SidePinTransitionResult {
  const hostError = { operationId: pending.operationId, code };
  const revision = state.revision + 1;

  // 펼치기에 실패했으면 절대 expanded로 두지 않고 손잡이 상태로 되돌린다.
  // 상태만 바꾸는 것으로는 부족하다 — 반쯤 펼쳐진 창이 화면에 남을 수 있으므로
  // 실제로 접으라고 시켜야 한다.
  if (pending.kind === 'show-panel') {
    return {
      next: bump(state, {
        surface: 'collapsed',
        openReason: null,
        activeZone: null,
        pendingTransition: null,
        pendingHostOperations: withPending(
          remaining,
          pendingOf('collapse-panel', ctx, revision, true),
        ),
        hostError,
      }),
      commands: [...cancelIfScheduled(state), hostCommand('collapse-panel', ctx, revision)],
    };
  }

  if (pending.kind === 'prepare-panel') {
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
      commands: cancelIfScheduled(state),
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
      commands: cancelIfScheduled(state),
    };
  }

  // 위치를 다시 잡는 데 실패했다. 어디에 그려야 할지 모르는 채로 띄워 두면
  // 화면 밖이나 엉뚱한 모니터에 걸쳐 남을 수 있으므로 일단 숨긴다.
  //
  // 이때 보호 상태로 표시하는 것이 중요하다. 그냥 숨기기만 하면 손잡이가 사라진 채
  // 다시 나타날 길이 없어져, "접힌 손잡이가 늘 보인다"는 약속이 영영 깨진다.
  if (pending.kind === 'reposition-all') {
    return {
      next: bump(state, {
        surface: 'collapsed',
        openReason: null,
        activeZone: null,
        pendingTransition: null,
        pendingHostOperations: withPending(
          withoutKind(remaining, 'show-panel'),
          pendingOf('hide-all', ctx, revision, true),
        ),
        protectedReason: 'adapter-unhealthy',
        hostError,
      }),
      commands: [...cancelIfScheduled(state), hostCommand('hide-all', ctx, revision)],
    };
  }

  return { next: bump(state, { pendingHostOperations: remaining, hostError }), commands: [] };
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
    return onHostFailure(state, pending, remaining, event.code ?? 'unknown', ctx);
  }

  switch (pending.kind) {
    case 'prepare-panel': {
      // 창이 준비됐다. 여는 중이었다면 이제 보여달라고 한다.
      if (state.surface !== 'opening' || !isSidePinResponsive(state)) {
        return {
          next: bump(state, { panelLifecycle: 'ready', pendingHostOperations: remaining }),
          commands: [],
        };
      }
      const revision = state.revision + 1;
      const reason = state.openReason ?? 'hover';
      return {
        next: bump(state, {
          panelLifecycle: 'ready',
          pendingHostOperations: withPending(remaining, pendingOf('show-panel', ctx, revision)),
        }),
        commands: [hostCommand('show-panel', ctx, revision, focusFor(reason))],
      };
    }

    case 'collapse-panel': {
      // 꺼졌거나 보호 중이면 절대 다시 열지 않는다.
      // 이 검사가 없으면 잠금 직전에 예약된 접힘이 완료되면서 다시 펼침을 예약하고,
      // 잠금 화면 위로 메모가 노출되는 길이 열린다.
      const canReopen =
        isSidePinResponsive(state) &&
        isPointerInsideSidePin(state.pointerRegion) &&
        pending.userInitiated !== true;

      const revision = state.revision + 1;
      const transition = canReopen
        ? scheduleOf('reveal', revision, ctx.nowMs, SIDE_PIN_REVEAL_DELAY_MS)
        : scheduleOf('dispose-panel', revision, ctx.nowMs, SIDE_PIN_DISPOSE_DELAY_MS);
      return {
        next: bump(state, {
          surface: 'collapsed',
          openReason: canReopen ? 'hover' : null,
          activeZone: null,
          panelLifecycle: canReopen ? 'ready' : 'cooldown',
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
  if (!isSidePinResponsive(state)) return unchanged(state);

  if (state.pinnedZone === zone) {
    // 여는 중에 같은 지점을 다시 눌렀다 → 여는 것 자체를 취소한다.
    // 고정만 풀고 열기를 그대로 두면, 늦게 도착한 "그렸다" 알림에 패널이 혼자 열린다.
    if (state.surface === 'opening') {
      return abandonOpen(state, ctx, { pinnedZone: 'none' });
    }
    return scheduleCollapse({ ...state, pinnedZone: 'none' }, ctx, { pinnedZone: 'none' });
  }

  // 이미 펼쳐져 있으면 포커스만 옮기고, 아니면 연다.
  if (state.surface === 'expanded') {
    const revision = state.revision + 1;
    return {
      next: bump(state, {
        pinnedZone: zone,
        openReason: 'click',
        pendingTransition: null,
        pendingHostOperations: withPending(
          state.pendingHostOperations,
          pendingOf('focus-panel', ctx, revision),
        ),
      }),
      commands: [...cancelIfScheduled(state), hostCommand('focus-panel', ctx, revision)],
    };
  }

  return beginOpen(state, ctx, 'click', { pinnedZone: zone });
}

function onEditorActivityChanged(
  state: SidePinRuntimeState,
  activity: SidePinRuntimeState['editorActivity'],
  ctx: SidePinTransitionContext,
): SidePinTransitionResult {
  if (!isSidePinResponsive(state)) return unchanged(state);
  if (state.editorActivity === activity) return unchanged(state);

  // 편집을 시작했으면 예약된 접힘을 취소한다 — 쓰던 메모가 사라지면 안 된다.
  if (isEditorBusy(activity)) {
    if (state.pendingTransition?.type !== 'collapse') {
      return { next: bump(state, { editorActivity: activity }), commands: [] };
    }
    return {
      next: bump(state, { editorActivity: activity, pendingTransition: null }),
      commands: [{ type: 'cancel-schedule' }],
    };
  }

  // 편집이 끝났고 포인터도 밖이면 그때부터 접힘 시간을 잰다.
  return scheduleCollapse({ ...state, editorActivity: activity }, ctx, {
    editorActivity: activity,
  });
}

// ─── 진입점 ────────────────────────────────────────────────────

export function resolveSidePinTransition(
  state: SidePinRuntimeState,
  event: SidePinEvent,
  ctx: SidePinTransitionContext,
): SidePinTransitionResult {
  switch (event.type) {
    case 'enabled-changed': {
      if (state.enabled === event.enabled) return unchanged(state);
      const revision = state.revision + 1;
      const kind: SidePinHostOperationKind = event.enabled ? 'ensure-rail' : 'destroy-all';
      return {
        next: {
          ...INITIAL_SIDE_PIN_RUNTIME_STATE,
          enabled: event.enabled,
          revision,
          pendingHostOperations: [pendingOf(kind, ctx, revision, true)],
        },
        commands: [...cancelIfScheduled(state), hostCommand(kind, ctx, revision)],
      };
    }

    case 'force-protect': {
      if (!state.enabled) return unchanged(state);
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
          pendingHostOperations: withPending(
            withoutKind(state.pendingHostOperations, 'show-panel', 'prepare-panel'),
            pendingOf('hide-all', ctx, revision, true),
          ),
          protectedReason: event.reason,
        }),
        commands: [...cancelIfScheduled(state), hostCommand('hide-all', ctx, revision)],
      };
    }

    case 'protect-released': {
      if (state.protectedReason === null) return unchanged(state);
      const revision = state.revision + 1;
      return {
        next: bump(state, {
          protectedReason: null,
          // 지난 숨김 요청은 지운다. 그 완료가 나중에 도착해 손잡이를 다시 숨기면
          // 복구할 길이 없어진다.
          pendingHostOperations: withPending(
            withoutKind(state.pendingHostOperations, 'hide-all'),
            pendingOf('ensure-rail', ctx, revision, true),
          ),
        }),
        commands: [hostCommand('ensure-rail', ctx, revision)],
      };
    }

    case 'layout-changed': {
      if (!isSidePinResponsive(state)) return unchanged(state);
      const revision = state.revision + 1;
      return {
        next: bump(state, {
          pendingHostOperations: withPending(
            state.pendingHostOperations,
            pendingOf('reposition-all', ctx, revision),
          ),
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
      if (!isSidePinResponsive(state)) return unchanged(state);
      // 편집 중이라면 Esc는 메모 편집기 것이다. 여기까지 오지 않아야 정상이다.
      if (isEditorBusy(state.editorActivity)) return unchanged(state);
      if (state.surface === 'collapsed' && state.pinnedZone === 'none') return unchanged(state);
      // 호버로만 열린 창은 포커스가 없다. 그때의 Esc는 다른 앱에서 누른 것이므로
      // 남의 키 입력으로 옆핀을 닫지 않는다. 호버 창은 포인터 이탈로만 닫힌다.
      if (!state.hasWindowFocus && state.pinnedZone === 'none') return unchanged(state);
      return closeNow(state, ctx, { pinnedZone: 'none' });
    }

    case 'outside-click': {
      if (!isSidePinResponsive(state)) return unchanged(state);
      if (state.pinnedZone !== 'none') return unchanged(state);
      if (isEditorBusy(state.editorActivity)) return unchanged(state);
      // 호버로만 열린(포커스 없는) 창은 바깥 클릭을 근거로 삼지 않는다.
      if (!state.hasWindowFocus || state.surface !== 'expanded') return unchanged(state);
      return closeNow(state, ctx);
    }

    case 'shortcut-toggle': {
      if (!isSidePinResponsive(state)) return unchanged(state);
      if (state.surface === 'expanded' || state.surface === 'opening') {
        return closeNow(state, ctx, { pinnedZone: 'none' });
      }
      return beginOpen(state, ctx, 'shortcut');
    }

    default: {
      // 새 이벤트를 추가하고 여기 분기를 빠뜨리면 컴파일이 실패하도록 둔다.
      const exhaustive: never = event;
      void exhaustive;
      return unchanged(state);
    }
  }
}
