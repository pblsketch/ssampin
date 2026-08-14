/**
 * 옆핀 상태를 바꿀 수 있는 모든 입력 — 닫힌 목록.
 *
 * 상태를 바꾸는 통로를 여기 하나로 묶은 이유: 화면·Electron·타이머가 각자
 * 자기 판단으로 상태를 고치면, 나중에 "왜 패널이 닫혔지"를 추적할 수 없다.
 * 판단은 전부 `resolveSidePinTransition` 한 곳에서 한다.
 *
 * 물리 입력(포인터·포커스)과 제품 의도(고정·편집)를 구분해 둔 이유는,
 * 물리 입력은 창이 보고하고 제품 의도는 화면이 보내는 서로 다른 경로이기 때문이다.
 */
import type {
  MemoEditorActivity,
  SidePinHostOperationKind,
  SidePinPendingTransition,
  SidePinPointerRegion,
  SidePinProtectReason,
  SidePinZone,
} from '../entities/SidePinRuntimeState';

/** 창 조작 명령의 처리 결과 */
export type SidePinHostResultStatus = 'applied' | 'stale' | 'failed';

export type SidePinEvent =
  // ── 물리 입력: 창이 보고한다 ──
  /** 포인터가 옆핀의 다른 부분으로 이동했다 */
  | { readonly type: 'pointer-region-changed'; readonly region: SidePinPointerRegion }
  /** 옆핀 창이 포커스를 얻거나 잃었다 */
  | { readonly type: 'window-focus-changed'; readonly focused: boolean }
  /** 옆핀 바깥을 클릭했다 */
  | { readonly type: 'outside-click' }
  /** Esc를 눌렀다 (메모 편집기가 이미 소비한 경우에는 오지 않는다) */
  | { readonly type: 'escape-pressed' }
  /**
   * 패널의 닫기 버튼을 눌렀다.
   *
   * Esc와 따로 두는 이유: Esc는 "포커스를 가진 창"의 키 입력이라 남의 앱에서 누른 것과
   * 구분해야 하지만, 닫기 버튼은 이 창을 직접 누른 것이라 포커스 여부를 따질 필요가 없다.
   * 하나로 합치면 호버로 열린 패널에서 닫기 버튼이 먹통이 된다.
   */
  | { readonly type: 'close-requested' }

  // ── 제품 의도: 화면이 보낸다 ──
  /** 손잡이·영역 헤더·고정 아이콘을 클릭해 고정을 켜고 껐다 */
  | { readonly type: 'toggle-pin'; readonly zone: SidePinZone }
  /** 메모 편집기의 상태가 바뀌었다 */
  | { readonly type: 'editor-activity-changed'; readonly activity: MemoEditorActivity }
  /** 단축키로 열고 닫는다 */
  | { readonly type: 'shortcut-toggle' }

  // ── 예약된 지연 동작이 만료됐다 ──
  | { readonly type: 'timer-fired'; readonly transition: SidePinPendingTransition }

  // ── 창 조작의 결과와 창이 보내는 알림 ──
  | {
      readonly type: 'host-operation-result';
      readonly operationId: string;
      readonly requestedRevision: number;
      readonly status: SidePinHostResultStatus;
      readonly code?: string;
    }
  /** 패널이 실제로 화면에 그려졌다 — 펼침을 확정하는 유일한 근거 */
  | {
      readonly type: 'panel-painted';
      readonly operationId: string;
      readonly requestedRevision: number;
    }

  // ── 시스템 보호 ──
  /** 잠금·절전·전체화면·다른 가상 데스크톱 — 즉시 숨겨야 한다 */
  | { readonly type: 'force-protect'; readonly reason: SidePinProtectReason }
  /** 보호 상태가 풀렸다 */
  | { readonly type: 'protect-released' }

  // ── 화면 배치 ──
  /** 모니터 연결·해제·배율 변경 등으로 위치를 다시 잡아야 한다 */
  | { readonly type: 'layout-changed' }

  // ── 설정 ──
  | { readonly type: 'enabled-changed'; readonly enabled: boolean };

/**
 * 전이 함수가 바깥세상에 시키는 일.
 *
 * 도메인은 타이머를 직접 걸거나 창을 직접 만지지 않는다. 무엇을 해야 하는지만
 * 돌려주고, 실제 실행은 controller가 한다. 그래야 시간과 창 없이 규칙만 테스트할 수 있다.
 */
export type SidePinCommand =
  /** 지연 동작을 예약하라 */
  | { readonly type: 'schedule'; readonly transition: SidePinPendingTransition }
  /** 예약된 지연 동작을 취소하라 */
  | { readonly type: 'cancel-schedule' }
  /** 창을 조작하라 */
  | {
      readonly type: 'host';
      readonly kind: SidePinHostOperationKind;
      readonly operationId: string;
      readonly requestedRevision: number;
      /** show-panel에서 포커스까지 가져갈지 — 호버로 열 때는 false */
      readonly focus?: boolean;
    };
