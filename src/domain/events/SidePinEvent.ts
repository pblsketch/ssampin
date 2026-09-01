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
   *
   * `force`는 "편집 중이라도 지금 가려라"는 뜻이다. 평소에는 편집 중이면 접지 않지만
   * (쓰던 글이 사라지는 것이 가장 나쁘다), 위젯을 열어 둔 채 이 버튼을 누른 사람은
   * **급히 화면을 가려야 하는 상황**이다. 그때 무반응이면 단추가 고장 난 것으로 보인다.
   * 사용자가 직접 누른 경우만 이 예외를 쓴다 — 자동 접힘은 예전처럼 편집을 지킨다.
   */
  | { readonly type: 'close-requested'; readonly force?: boolean }

  // ── 제품 의도: 화면이 보낸다 ──
  /** 손잡이·영역 헤더·고정 아이콘을 클릭해 고정을 켜고 껐다 */
  | { readonly type: 'toggle-pin'; readonly zone: SidePinZone }
  /**
   * 펼쳐진 패널에서 볼 칸만 바꾼다 — 접힌 띠를 눌렀을 때.
   *
   * `toggle-pin`과 나눈 이유: 저쪽은 고정까지 함께 걸고 창 포커스를 가져오지만,
   * 이쪽은 **무게중심만 옮긴다.** 띠를 눌렀다고 고정까지 걸리면 마우스를 빼도
   * 접히지 않아, 잠깐 보고 닫는다는 옆핀의 목적과 어긋난다.
   *
   * 열고 닫는 일은 하지 않는다(`surface` 불변). 이 이벤트에 여닫기까지 얹으면
   * "칸 바꾸기"와 "닫기"가 한 통로에 섞여 나중에 어느 쪽이 닫았는지 추적할 수 없다.
   */
  | { readonly type: 'focus-zone'; readonly zone: SidePinZone }
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
  /**
   * 잠금·절전처럼 **사용자가 확실히 자리에 없는** 근거 — 최대로 숨긴다.
   *
   * 쓰던 편집까지 버리고(`editorActivity: 'idle'`) 손잡이도 감춘다.
   * 판단이 틀릴 일이 없는 근거일 때만 쓴다.
   */
  | { readonly type: 'force-protect'; readonly reason: SidePinProtectReason }
  /**
   * 전체화면 감지처럼 **추측으로 판단한** 근거 — 가리되 되돌릴 수 있게 남긴다.
   *
   * 감지가 틀릴 수 있으므로 **쓰던 편집을 건드리지 않는다**(패널 창도 파괴하지 않는다).
   * 화면에서는 손잡이까지 완전히 감춘다 — 가리는 것이 이 기능의 목적이기 때문이다.
   * 되돌리기는 발표가 끝날 때 자동으로 된다(`protect-released` → `ensure-rail`).
   * 오탐을 줄이는 것보다 **오탐의 대가를 싸게** 만드는 쪽이 확실하다 —
   * 오탐 한 번이 쓰던 메모를 날리면 선생님은 기능 자체를 꺼 버린다.
   */
  | { readonly type: 'soft-protect'; readonly reason: SidePinProtectReason }
  /** 보호 상태가 풀렸다 */
  | { readonly type: 'protect-released' }

  // ── PIN 잠금 ──
  /**
   * 옆핀에서 PIN 을 풀었다. `atMs` 는 푼 시각.
   *
   * 시각을 이벤트가 싣고 오는 이유는 도메인이 `Date.now()` 를 부르면 순수 함수가 아니게 되기 때문이다.
   *
   * ⚠️ **"PIN 이 맞았다"는 판단은 화면 쪽이 한다.** 상태 기계는 그 말을 믿는다.
   * 이 프로젝트의 위협 모델은 **"화면을 보는 사람"**이지 악성 렌더러가 아니므로 받아들인다.
   * (악성 렌더러를 막으려면 해시 대조를 main 으로 옮겨야 하는데, 그건 다른 문제다.)
   */
  | { readonly type: 'pin-unlocked'; readonly atMs: number }
  /**
   * 다시 잠갔다 — 본 앱에서 **직접** "지금 잠그기"를 누른 경우다.
   *
   * ⚠️ **본 앱의 5분 자동 잠금은 여기로 오지 않는다. 오게 만들지도 말 것.**
   * 옆핀은 하루 종일 떠 있는 창이라, 시간이 지났다는 이유로 잠그기 시작하면
   * 위젯 칸이 온종일 자물쇠 그림이 되고 **선생님이 PIN 자체를 꺼 버린다** —
   * 그러면 대시보드 보호까지 0이 된다. 옆핀의 재잠금은 **사건**에만 건다
   * (보호가 걸렸다 풀릴 때, 그리고 [지금 가리기]를 직접 누를 때).
   *
   * **잠그는 방향만 창을 건너온다.** 푸는 방향은 전파하지 않는다 —
   * 화면에 떠 있는 옆핀이 저절로 열리는 경로를 만들지 않기 위해서다.
   */
  | { readonly type: 'pin-locked' }

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
