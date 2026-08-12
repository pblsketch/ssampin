/**
 * 옆핀이 지금 어떤 상태인지 — 실행 중에만 존재하고 저장하지 않는 값.
 *
 * 앱을 다시 켜면 항상 접힌 손잡이부터 시작한다. 고정(pin) 상태를 저장하면
 * 사용자가 왜 패널이 열린 채로 떠 있는지 모른 채 앱을 켜게 된다.
 *
 * 한 개의 열거형에 모든 경우를 몰아넣지 않고 축을 나눈 이유:
 * "펼쳐져 있다"와 "메모를 편집 중이다"와 "포인터가 어디 있다"는 서로 독립이라,
 * 한 열거형으로 묶으면 조합이 폭발하고 빠뜨린 경우가 생긴다.
 */

/** 패널이 접혀 있는지 펼쳐져 있는지 */
export type SidePinSurface = 'collapsed' | 'expanded';

/** 왜 열렸는지 — 호버로 열린 창은 포커스를 가지지 않는다 */
export type SidePinOpenReason = 'hover' | 'click' | 'shortcut' | null;

export type SidePinZone = 'widget' | 'memo' | 'both';

export type SidePinPinnedZone = 'none' | SidePinZone;

/**
 * 포인터가 옆핀의 어느 부분에 있는지.
 *
 * 손잡이와 패널을 오갈 때 잠깐 `outside`를 지나가는데, 이걸 "밖으로 나갔다"로
 * 처리하면 패널이 깜빡이며 접힌다. 그래서 위치를 이 단계로 구분해서 본다.
 */
export type SidePinPointerRegion =
  | 'outside'
  | 'rail-widget'
  | 'rail-memo'
  | 'panel-widget'
  | 'panel-memo';

/** 패널 콘텐츠 창의 수명 단계 */
export type SidePinPanelLifecycle = 'absent' | 'preparing' | 'ready' | 'visible' | 'cooldown';

/**
 * 메모 편집기가 지금 무엇을 하고 있는지.
 *
 * idle이 아니면 패널을 자동으로 접지 않는다. 쓰던 메모가 사라지는 것이
 * 사용자에게 가장 나쁜 결과다.
 */
export type MemoEditorActivity = 'idle' | 'editing' | 'saving' | 'dialog-open' | 'save-error';

/** 예약된 지연 동작 */
export interface SidePinPendingTransition {
  /**
   * `show-timeout`은 "보여줘"라고 했는데 그려졌다는 답이 끝내 오지 않는 경우를 위한 감시다.
   * 이게 없으면 렌더러가 죽었을 때 패널은 떠 있는데 상태는 영영 접힌 것으로 남는다.
   */
  readonly type: 'reveal' | 'collapse' | 'dispose-panel' | 'show-timeout';
  /**
   * 예약할 때의 revision.
   *
   * 타이머가 터졌을 때 이 값이 현재 revision과 다르면, 예약 이후에 다른 일이
   * 벌어졌다는 뜻이므로 그냥 버린다. 늦게 도착한 타이머가 최신 상태를 덮어쓰는 것을 막는다.
   */
  readonly scheduledRevision: number;
  readonly dueAtMs: number;
}

/** 창을 실제로 조작하는 명령의 종류 */
export type SidePinHostOperationKind =
  | 'ensure-rail'
  | 'prepare-panel'
  | 'show-panel'
  | 'collapse-panel'
  | 'dispose-panel'
  | 'hide-all'
  | 'reposition-all'
  | 'focus-panel'
  | 'destroy-all';

/** 결과를 기다리는 중인 창 조작 */
export interface SidePinPendingHostOperation {
  readonly operationId: string;
  readonly kind: SidePinHostOperationKind;
  readonly requestedRevision: number;
  /**
   * 사용자가 직접 닫아서 나간 명령인가 (Esc·단축키·고정 해제).
   *
   * 자동으로 접히는 것과 구분해야 한다. 자동 접힘은 접히는 사이에 커서가 돌아오면
   * 다시 열어 주는 게 맞지만, 사용자가 Esc를 눌러 닫은 것은 커서가 패널 위에 있어도
   * 다시 열면 안 된다. 방금 닫은 창이 혼자 되살아나면 Esc가 안 먹는 것으로 보인다.
   */
  readonly userInitiated?: boolean;
}

export interface SidePinHostError {
  readonly operationId: string;
  readonly code: string;
}

export interface SidePinRuntimeState {
  readonly surface: SidePinSurface;
  readonly openReason: SidePinOpenReason;
  readonly activeZone: SidePinZone | null;
  readonly pinnedZone: SidePinPinnedZone;
  readonly pointerRegion: SidePinPointerRegion;
  readonly panelLifecycle: SidePinPanelLifecycle;
  readonly pendingTransition: SidePinPendingTransition | null;
  readonly pendingHostOperations: readonly SidePinPendingHostOperation[];
  readonly hostError: SidePinHostError | null;
  readonly hasWindowFocus: boolean;
  readonly editorActivity: MemoEditorActivity;
  /** 이 상태의 판번호. 상태가 바뀔 때마다 1씩 오른다. */
  readonly revision: number;
  /** 보호 상태(잠금·절전·전체화면·다른 가상 데스크톱)에서는 손잡이도 숨긴다 */
  readonly protectedReason: SidePinProtectReason | null;
}

/** 옆핀을 강제로 숨겨야 하는 이유 */
export type SidePinProtectReason =
  | 'lock'
  | 'suspend'
  | 'fullscreen'
  | 'virtual-desktop-hidden'
  | 'adapter-unhealthy';

/** 앱을 막 켰을 때의 상태 — 항상 접힌 손잡이부터 */
export const INITIAL_SIDE_PIN_RUNTIME_STATE: SidePinRuntimeState = {
  surface: 'collapsed',
  openReason: null,
  activeZone: null,
  pinnedZone: 'none',
  pointerRegion: 'outside',
  panelLifecycle: 'absent',
  pendingTransition: null,
  pendingHostOperations: [],
  hostError: null,
  hasWindowFocus: false,
  editorActivity: 'idle',
  revision: 0,
  protectedReason: null,
};

/** 포인터가 옆핀 안(손잡이 또는 패널) 어딘가에 있는가 */
export function isPointerInsideSidePin(region: SidePinPointerRegion): boolean {
  return region !== 'outside';
}

/** 메모 편집기가 무언가 하고 있어서 패널을 접으면 안 되는 상태인가 */
export function isEditorBusy(activity: MemoEditorActivity): boolean {
  return activity !== 'idle';
}
