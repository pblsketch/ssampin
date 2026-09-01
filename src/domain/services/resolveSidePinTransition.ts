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
  type SidePinPointerRegion,
  type SidePinProtectReason,
  type SidePinRuntimeState,
  type SidePinZone,
} from '../entities/SidePinRuntimeState';
import type { SidePinCommand, SidePinEvent } from '../events/SidePinEvent';

/** 손잡이에 머물러야 펼쳐지는 시간 — 지나가다 스치는 것과 구분한다 */
export const SIDE_PIN_REVEAL_DELAY_MS = 180;

/** 패널 밖으로 나간 뒤 접히기까지 기다리는 시간 — 잠깐 벗어나도 안 닫히게 */
export const SIDE_PIN_COLLAPSE_DELAY_MS = 400;

/**
 * 나가는 연출에 주는 시간.
 *
 * 이 동안에는 **창을 줄이지 않는다** — 줄이면 패널이 손잡이 크기로 잘려 연출할 자리가 없다.
 * 들어올 때(220ms)보다 짧게 둔다. 닫는 동작은 이미 결정된 일이라 기다리는 느낌이 들면 안 된다.
 * `src/index.css`의 `sidepin-exit` 길이와 같아야 한다.
 */
export const SIDE_PIN_CLOSE_ANIMATION_MS = 180;

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
  userInitiated = false,
): SidePinPendingTransition {
  return { type, scheduledRevision: revision, dueAtMs: nowMs + delayMs, userInitiated };
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
 * 목록이 종류 수(10개)를 넘지 않게 하고, 취소된 요청의 늦은 응답이 짝을 잃어
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

/**
 * 어느 칸으로 들어왔는지 정한다.
 *
 * **다 그려진 뒤에 정하면 안 된다.** 패널이 뜨는 사이 마우스는 이미 패널 위나 바깥으로
 * 옮겨가 있어서, 처음 들어온 칸을 알 수 없다. 열기 시작하는 시점에 정해 그대로 들고 간다.
 *
 * 단축키처럼 가리킨 곳이 없으면 양쪽을 함께 연다 — 임의로 한쪽을 고르면
 * 사용자가 지정하지 않은 것을 앱이 정한 셈이 된다.
 */
function entryZoneOf(region: SidePinPointerRegion): SidePinZone {
  if (region === 'rail-widget' || region === 'panel-widget') return 'widget';
  if (region === 'rail-memo' || region === 'panel-memo') return 'memo';
  return 'both';
}

/** 예약을 취소해야 하면 취소 명령을 낸다 */
function cancelIfScheduled(state: SidePinRuntimeState): SidePinCommand[] {
  return state.pendingTransition !== null ? [{ type: 'cancel-schedule' }] : [];
}

/**
 * 추측으로 걸린 보호인가 — 되돌릴 수 있게 다뤄야 하는 등급.
 *
 * 전체화면 감지는 시스템 상태를 보고 "발표 중일 것"이라고 짐작하는 것이라 틀릴 수 있다.
 * 잠금·절전처럼 확실한 근거와 같이 취급하면 오탐 한 번이 쓰던 메모를 지운다.
 * 등급을 값 하나로 남겨 두면, 보호가 끝난 뒤의 처리(패널을 없앨지)도 이 판단만 보고 갈린다.
 */
function isSoftProtectReason(reason: SidePinProtectReason | null): boolean {
  return reason === 'fullscreen';
}

/**
 * 바깥의 보호 이유 추적기(`electron/sidePinProtection.ts`)가 관리하는 이유인가.
 *
 * 이 둘만 추적기가 등급을 매겨 보내므로, 등급이 내려오는 판단을 믿어도 되는 것도 이 둘뿐이다.
 * `adapter-unhealthy`는 전이 함수가 직접 세우고 추적기는 그 존재를 모른다 — 바깥 판단으로
 * 낮추면 **어댑터가 고장 난 채로 손잡이를 다시 내보내게 된다.**
 */
function isTrackedProtectReason(reason: SidePinProtectReason): boolean {
  return reason === 'lock' || reason === 'suspend' || reason === 'fullscreen';
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
      // patch보다 먼저 둔다 — 클릭처럼 칸을 명시하는 쪽이 이 판단을 덮을 수 있어야 한다.
      activeZone: entryZoneOf(state.pointerRegion),
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

/**
 * 지금 즉시 접는다 — 연출 없이.
 *
 * 오류·보호 상황(그리기 실패, 잠금·절전, 옆핀 끄기)에서 쓴다. 그때는 "부드럽게"보다
 * **지금 당장 가리기**가 먼저다.
 */
function collapseImmediately(
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
 * 사용자가 직접 닫았다 (Esc·단축키·고정 해제) — 나가는 연출을 거친다.
 *
 * **창을 아직 줄이지 않는다.** 여기서 바로 줄이면 패널이 손잡이 크기로 잘려,
 * 나가는 연출을 할 자리가 없다. 연출이 끝나면(`close-animation` 타이머) 그때 줄인다.
 *
 * 아직 펼쳐지지 않았다면 연출할 것도 없으므로 곧바로 접는다.
 */
function closeNow(
  state: SidePinRuntimeState,
  ctx: SidePinTransitionContext,
  patch: Partial<SidePinRuntimeState> = {},
): SidePinTransitionResult {
  if (state.surface !== 'expanded') return collapseImmediately(state, ctx, patch);

  const revision = state.revision + 1;
  const transition = scheduleOf(
    'close-animation',
    revision,
    ctx.nowMs,
    SIDE_PIN_CLOSE_ANIMATION_MS,
    true,
  );
  return {
    next: bump(state, {
      ...patch,
      surface: 'closing',
      openReason: null,
      pendingTransition: transition,
      // 여는 중이던 요청이 남아 있으면 연출 도중에 패널이 되살아난다.
      pendingHostOperations: withoutKind(state.pendingHostOperations, 'show-panel'),
    }),
    commands: [...cancelIfScheduled(state), { type: 'schedule', transition }],
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

  // 나가는 연출 도중에 다시 들어왔다 → 접기를 되돌린다.
  //
  // 창도 화면도 아직 그대로라 되돌리는 값이 싸다. 그냥 두면 손잡이 크기로 줄었다가
  // 곧바로 다시 펼쳐져, 스쳐 지나갈 때마다 창이 두 번 요동친다.
  //
  // 단, 사용자가 직접 닫은 경우(Esc·닫기 버튼)는 되돌리지 않는다. 그때 마우스는
  // 대개 패널 위에 있어서, 되돌리면 닫을 방법이 없어진다.
  if (inside && state.surface === 'closing') {
    if (state.pendingTransition?.userInitiated === true) {
      return { next: bump(state, { pointerRegion: region }), commands: [] };
    }
    return {
      next: bump(state, { pointerRegion: region, surface: 'expanded', pendingTransition: null }),
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
    // 아직 창을 줄이지 않는다. 나가는 연출에 자리를 내주고, 연출이 끝나면 그때 줄인다.
    const closing = scheduleOf('close-animation', revision, ctx.nowMs, SIDE_PIN_CLOSE_ANIMATION_MS);
    return {
      next: bump(state, { surface: 'closing', pendingTransition: closing }),
      commands: [{ type: 'schedule', transition: closing }],
    };
  }

  if (transition.type === 'close-animation') {
    // 연출이 끝났다. 이제 창을 손잡이 크기로 줄인다.
    //
    // 사용자가 직접 닫았다면 그 사실을 창 조작에 실어 보낸다. 그러지 않으면 접기가
    // 끝나는 순간 "커서가 안에 있으니 다시 열기"가 발동해, Esc로 닫아도 곧바로 되열린다.
    return {
      next: bump(state, {
        surface: 'collapsed',
        openReason: null,
        activeZone: null,
        pendingTransition: null,
        pendingHostOperations: withPending(
          state.pendingHostOperations,
          pendingOf('collapse-panel', ctx, revision, transition.userInitiated === true),
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
      // activeZone은 열기 시작할 때 정해 뒀다. 여기서 덮으면 어느 칸으로 들어왔는지가
      // 사라져, 두 손잡이 버튼이 똑같은 결과를 낸다.
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

      // 추측 등급(전체화면)으로 가려진 동안에는 패널을 없앨 예약을 아예 만들지 않는다.
      //
      // 이 예약은 보호 중에 터지면 버려지지만, 보호가 풀린 직후 10초 안에 터지면
      // 그때는 그대로 실행되어 창이 파괴된다(§보호 해제 참고). 만들지 않는 쪽이 가장 단순하다.
      // 확실한 등급(잠금·절전)은 어차피 `hide-all`로 창이 이미 없으므로 그대로 둔다.
      // 쓰는 중이면 패널을 없앨 예약을 걸지 않는다 — 경로를 가리지 않는다.
      //
      // 예약이 터지면 창이 파괴되고, 그때 화면 쪽 정리가 돌지 않아 **쓰던 내용이 그대로
      // 사라진다.** 순한 보호로 가려진 동안은 위 분기가 막아 주지만, 보호가 먼저 풀린 뒤
      // 뒤늦게 도착한 접힘 결과는 그 분기를 못 타고 예약을 건다(발표를 막 끝낸 그 순간이다).
      // "쓰는 중이면 없애지 않는다"는 규칙 하나면 어느 경로로 와도 막힌다.
      const busyEditing = isEditorBusy(state.editorActivity);

      if (!canReopen && (isSoftProtectReason(state.protectedReason) || busyEditing)) {
        return {
          next: bump(state, {
            surface: 'collapsed',
            openReason: null,
            activeZone: null,
            // 없앨 예정이 아니므로 'cooldown'이 아니라 살아 있는 창 그대로 적는다.
            panelLifecycle: 'ready',
            pendingTransition: null,
            pendingHostOperations: withoutKind(remaining, 'prepare-panel'),
          }),
          commands: cancelIfScheduled(state),
        };
      }

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
        next: bump(state, {
          panelLifecycle: 'absent',
          // 안전망: 창이 사라졌으면 "쓰는 중"도 함께 사라져야 한다.
          //
          // 패널 창은 파괴될 때 화면 쪽 정리를 거치지 않아 "이제 안 쓴다"는 신호를
          // 보내지 못한다. 그 값이 남으면 붙잡아 둘 이유(`shouldHoldOpen`)가 영영 참이라
          // 옆핀이 다시는 접히지 않는다. 어느 경로로 파기됐든 여기서 되돌린다.
          editorActivity: 'idle',
          pendingHostOperations: remaining,
        }),
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

    /**
     * 둘 다 감췄다 — 손잡이도 안 보이고 패널도 안 보이지만 **패널 창은 살아 있다.**
     *
     * `collapse-panel`과 달리 **파기를 예약하지 않는다.** 그것이 이 명령의 존재 이유다.
     * 발표가 끝나면 `protect-released`가 `ensure-rail`로 손잡이를 되돌리고, 그때
     * 패널 창이 그대로 있어야 쓰던 글이 살아 있다. 여기서 10초 파기를 걸면
     * 발표가 10초만 넘어가도 결국 글이 날아가 순한 등급이 무의미해진다.
     */
    case 'conceal-all':
      return {
        next: bump(state, {
          surface: 'collapsed',
          openReason: null,
          activeZone: null,
          // 창을 파괴하지 않았으므로 'absent'로 내리지 않는다. 이미 'absent'였다면
          // (force에서 내려온 경우) 그 사실을 그대로 잇는다.
          panelLifecycle: state.panelLifecycle === 'absent' ? 'absent' : 'ready',
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

/**
 * 볼 칸만 바꾼다 — 접힌 띠를 눌렀을 때.
 *
 * **여닫지 않는다.** 접혀 있으면 아무 일도 하지 않는데, 손잡이가 이미 "어느 칸으로
 * 열지"를 정하는 통로라서다. 여기서 열기까지 하면 같은 일을 하는 길이 둘이 된다.
 *
 * 닫히는 중(`closing`)에도 하지 않는다. 사라질 화면의 배치를 고치는 셈이고,
 * 되돌아온 뒤 무엇이 보일지가 손잡이가 아니라 마지막 클릭에 좌우된다.
 */
function onFocusZone(state: SidePinRuntimeState, zone: SidePinZone): SidePinTransitionResult {
  if (!isSidePinResponsive(state)) return unchanged(state);
  if (state.surface !== 'expanded' && state.surface !== 'opening') return unchanged(state);
  if (state.activeZone === zone) return unchanged(state);
  return { next: bump(state, { activeZone: zone }), commands: [] };
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
        // 펼쳐진 상태에서 다른 칸을 누르면 그 칸으로 무게중심을 옮긴다.
        activeZone: zone,
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

  // 누른 칸이 곧 들어온 칸이다 — 마우스 위치보다 명시적인 의사표시라 이쪽을 따른다.
  return beginOpen(state, ctx, 'click', { pinnedZone: zone, activeZone: zone });
}

function onEditorActivityChanged(
  state: SidePinRuntimeState,
  activity: SidePinRuntimeState['editorActivity'],
  ctx: SidePinTransitionContext,
): SidePinTransitionResult {
  if (!isSidePinResponsive(state)) {
    /**
     * 🚨 보호 중이라도 **"이제 안 쓴다"는 사실은 받아 적는다.** 창은 건드리지 않는다.
     *
     * `soft-protect` 는 `editorActivity` 를 일부러 안 지운다(쓰던 글을 지키려고).
     * 그런데 화면 쪽은 보호가 걸리면 편집기를 닫고 `'idle'` 을 보낸다
     * (`SidePinMemoZone.tsx` 의 "보호 상태가 되면 목록으로 돌린다").
     * 그 보고를 여기서 통째로 버리면, 보호가 풀린 뒤에도 `'editing'` 이 남는다.
     * **다시 보내 주는 곳이 없다** — 화면 쪽 effect 의 입력값이 그대로라 재실행되지 않는다.
     * 그러면 `shouldHoldOpen` 이 영영 참이라 **패널이 다시는 자동으로 안 접히고**
     * 파기 예약도 안 걸려 창이 그대로 남는다.
     *
     * `force-protect` 는 스스로 `'idle'` 로 밀어 버려서 이 구멍이 없었다. 순한 등급을
     * 만들면서 생긴 자리다.
     *
     * 올라가는 쪽(`idle → editing`)은 받지 않는다. 숨어 있는 동안 새로 쓰기 시작할
     * 방법이 없고, 받아 두면 보호가 풀리는 순간 접힘이 막힌다.
     */
    if (isEditorBusy(activity)) return unchanged(state);
    if (state.editorActivity === activity) return unchanged(state);
    return { next: bump(state, { editorActivity: activity }), commands: [] };
  }
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
      if (state.enabled === event.enabled) {
        if (!event.enabled || state.protectedReason !== null) return unchanged(state);

        const revision = state.revision + 1;
        const kind: SidePinHostOperationKind = 'ensure-rail';
        return {
          next: {
            ...INITIAL_SIDE_PIN_RUNTIME_STATE,
            enabled: true,
            revision,
            pendingHostOperations: [pendingOf(kind, ctx, revision, true)],
          },
          commands: [...cancelIfScheduled(state), hostCommand(kind, ctx, revision)],
        };
      }
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

    /**
     * 추측(전체화면 감지)으로 가린다 — `force-protect`의 순한 등급.
     *
     * `force-protect`와 다른 곳은 셋뿐이고, 셋 다 "판단이 틀렸을 때 되돌릴 수 있는가"에서 나온다.
     * 1. `editorActivity`를 **건드리지 않는다** — 이 등급이 존재하는 유일한 이유다.
     * 2. `hide-all`이 아니라 `conceal-all` — 손잡이까지 감추되 **패널 창은 파괴하지 않는다.**
     *    ⚠️ `collapse-panel`을 쓰면 안 된다. 그 명령은 이름과 달리 `rail.showInactive()`를 불러
     *    **손잡이를 보이게 한다** — 실제로 그렇게 만들었다가 발표 중에 손잡이가 화면에 남았다
     *    (2026-09-01 실기기). 되돌릴 길은 손잡이를 남기는 것이 아니라, 발표가 끝나면
     *    `protect-released`가 `ensure-rail`로 자동으로 되돌리는 것이다.
     * 3. `panelLifecycle`은 `'absent'`가 아니라 `'ready'` — 패널 창이 파괴되지 않고 살아 있다.
     *
     * 나머지(펼침 취소·고정 해제·예약 취소·들어오던 열기 요청 제거)는 force와 똑같다.
     * 특히 `show-panel`·`prepare-panel` 대기를 지우지 않으면, 가린 뒤에 도착한 열기 응답이
     * 보호를 뚫고 패널을 띄운다.
     *
     * ## 확실한 등급(force)에서 순한 등급으로 **내려오는** 것은 허용한다
     *
     * 잠금과 발표가 겹쳤다가 잠금만 풀린 경우다. 이때 그냥 무시하면 `protectedReason`이
     * `'lock'`에 멈춰 **손잡이가 사라진 채로 발표가 끝날 때까지 남는다** — 선생님은
     * 옆핀을 되돌릴 방법이 화면에 없다(계획서 D2 "되돌아올 수 있는가" 위반).
     *
     * 내려와도 안전한 근거: 이 이벤트는 **추적기가 남은 이유 중 최고 등급이 soft일 때만**
     * 보낸다. 즉 여기 도달했다는 것은 잠금·절전이 이미 다 풀렸다는 뜻이다.
     * 잠금이 아직 살아 있으면 추적기가 force를 돌려주므로 이 자리에 오지 않는다.
     */
    case 'soft-protect': {
      if (!state.enabled) return unchanged(state);
      // 이미 순한 보호가 걸려 있으면 다시 할 일이 없다.
      if (isSoftProtectReason(state.protectedReason)) return unchanged(state);
      // 추적기가 다루지 않는 이유(어댑터 이상 등)는 **절대 낮추지 않는다.**
      // 그런 이유는 전이 함수가 직접 세운 것이라, 바깥의 등급 판단이 그 사정을 모른다.
      if (state.protectedReason !== null && !isTrackedProtectReason(state.protectedReason)) {
        return unchanged(state);
      }

      const revision = state.revision + 1;
      return {
        next: bump(state, {
          surface: 'collapsed',
          openReason: null,
          activeZone: null,
          // 고정은 **그대로 둔다.** 이 등급은 추측으로 걸리고 가릴 때는 한 번만 보고 가리므로
          // 헛짚는 일이 있는데, 그때마다 사용자가 맞춰 둔 고정을 말없이 풀어 버리면
          // "오탐의 대가가 싸다"는 이 등급의 전제가 깨진다. 보호 중에는 어차피
          // `isSidePinResponsive` 가 거짓이라 고정값이 아무 일도 하지 않는다.
          //
          // ⚠️ `panelLifecycle` 은 **단정하지 않고 있는 그대로 잇는다.**
          // 확실한 등급(force)에서 내려온 경우 패널 창은 이미 파괴돼 'absent' 인데,
          // 여기서 'ready' 라고 적으면 나중에 호버가 준비 단계를 건너뛰고
          // **없는 창에 대고 "보여줘"를 보낸다.**
          panelLifecycle: state.panelLifecycle === 'absent' ? 'absent' : 'ready',
          pendingTransition: null,
          // editorActivity는 그대로 둔다. 쓰던 글이 살아 있어야 오탐의 대가가 싸진다.
          pendingHostOperations: withPending(
            withoutKind(state.pendingHostOperations, 'show-panel', 'prepare-panel'),
            // 사용자가 닫은 것으로 표시한다 — 안 그러면 접힘 완료가
            // "커서가 안에 있으니 다시 열기"로 이어져 발표 화면 위에 패널이 되살아난다.
            pendingOf('conceal-all', ctx, revision, true),
          ),
          protectedReason: event.reason,
        }),
        commands: [...cancelIfScheduled(state), hostCommand('conceal-all', ctx, revision)],
      };
    }

    case 'protect-released': {
      if (state.protectedReason === null) return unchanged(state);
      const revision = state.revision + 1;
      /**
       * 🚨 예약된 패널 파기를 **여기서** 지운다.
       *
       * 보호 중에는 10초짜리 파기 예약이 터져도 `onTimerFired`가 조용히 버린다.
       * 위험한 자리는 그 다음이다 — 보호가 풀린 **직후 10초** 안에 예약이 터지면
       * 그때는 반응하는 상태라 파기가 그대로 실행되어 패널 창이 사라지고,
       * 쓰던 글이 그 순간 날아간다. 발표를 끝낸 직후가 정확히 그 구간이다.
       *
       * 예약을 만들지 않는 쪽(`collapse-panel` 처리)만으로는 부족하다.
       * 다른 경로로 걸린 예약이 보호 중에 남아 있을 수 있다.
       */
      const disposeScheduled = state.pendingTransition?.type === 'dispose-panel';
      const commands: SidePinCommand[] = [];
      if (disposeScheduled) commands.push({ type: 'cancel-schedule' });
      commands.push(hostCommand('ensure-rail', ctx, revision));
      return {
        next: bump(state, {
          protectedReason: null,
          pendingTransition: disposeScheduled ? null : state.pendingTransition,
          // 지난 숨김 요청은 지운다. 그 완료가 나중에 도착해 손잡이를 다시 숨기면
          // 복구할 길이 없어진다.
          //
          // ⚠️ `conceal-all`도 반드시 함께 지운다. 숨기는 명령이 둘이 됐는데 하나만
          // 지우면, 늦게 도착한 완료가 방금 되돌린 손잡이를 다시 감춘다.
          pendingHostOperations: withPending(
            withoutKind(state.pendingHostOperations, 'hide-all', 'conceal-all'),
            pendingOf('ensure-rail', ctx, revision, true),
          ),
        }),
        commands,
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

    case 'focus-zone':
      return onFocusZone(state, event.zone);

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

    case 'close-requested': {
      if (!isSidePinResponsive(state)) return unchanged(state);
      const forced = event.force === true;
      // 메모를 쓰는 중이면 편집기가 먼저 처리한다(저장·확인). 여기서 닫지 않는다.
      //
      // 단, 사용자가 "지금 가리기"를 직접 누른 경우(`force`)는 예외다. 위젯을 열면
      // 편집 중으로 잡히는데, 급히 가려야 하는 순간이 정확히 그때라 무반응이면
      // 단추가 고장 난 것으로 보인다. 명시적으로 누른 경우에만 방어를 건너뛴다 —
      // 자동 접힘은 예전 그대로 쓰던 글을 지킨다.
      if (!forced && isEditorBusy(state.editorActivity)) return unchanged(state);
      if (state.surface === 'collapsed') return unchanged(state);
      // 접으면서 편집 표시도 되돌린다. 남겨 두면 붙잡아 둘 이유가 계속 참이라
      // 다음부터는 마우스를 빼도 옆핀이 접히지 않는다.
      return closeNow(
        state,
        ctx,
        forced ? { pinnedZone: 'none', editorActivity: 'idle' } : { pinnedZone: 'none' },
      );
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
