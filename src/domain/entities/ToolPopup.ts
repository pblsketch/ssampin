/**
 * 쌤도구 팝업 — 별도 창으로 띄울 수 있는 도구와 창 사양.
 *
 * domain 레이어라 외부 의존성을 가지지 않는다. 여기의 id 문자열은
 * adapters 의 `TOOL_REGISTRY` 키와 같아야 하며, 그 대응은
 * `toolPopupRegistry.test.ts` 가 기계로 확인한다.
 *
 * 설계: docs/02-design/features/tool-popup.design.md §2, §6
 */

/** 팝업 창으로 띄울 수 있는 도구 9종 (1차 범위). */
export const POPUP_TOOL_IDS = [
  'tool-timer',
  'tool-random',
  'tool-traffic-light',
  'tool-scoreboard',
  'tool-roulette',
  'tool-dice',
  'tool-coin',
  'tool-qrcode',
  'tool-work-symbols',
] as const;

export type PopupToolId = (typeof POPUP_TOOL_IDS)[number];

/** 팝업 창의 기본 크기와 최소 크기(픽셀). */
export interface ToolPopupWindowSpec {
  readonly width: number;
  readonly height: number;
  readonly minWidth: number;
  readonly minHeight: number;
}

/** 팝업 열기 요청의 결과. 실패하면 부르는 쪽이 원래 실행을 되살린다. */
export type ToolPopupOpenResult =
  | { readonly ok: true; readonly focusedExisting: boolean }
  | { readonly ok: false; readonly reason: ToolPopupFailureReason };

export type ToolPopupFailureReason =
  | 'unsupported-tool'
  | 'window-create-failed'
  | 'ready-timeout'
  | 'load-failed'
  | 'blocked-by-browser'
  | 'unavailable';
