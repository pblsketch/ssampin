/**
 * 쌤도구 팝업 — 허용목록·창 사양·주소(쿼리) 규칙.
 *
 * 창을 만드는 쪽(electron)과 창 안에서 도구를 고르는 쪽(렌더러)이 **같은 판정**을
 * 쓰도록 여기 한 곳에 둔다. 허용목록 밖 문자열이나 외부 URL 은 어느 쪽에서도 통과하지 못한다.
 *
 * 설계: docs/02-design/features/tool-popup.design.md §5, §6
 */
import type { PopupToolId, ToolPopupWindowSpec } from '../entities/ToolPopup';
import { POPUP_TOOL_IDS } from '../entities/ToolPopup';

/** 팝업 렌더러 진입점을 고르는 `mode` 값. */
export const TOOL_POPUP_MODE = 'toolPopup';

const POPUP_TOOL_ID_SET: ReadonlySet<string> = new Set<string>(POPUP_TOOL_IDS);

export function isPopupToolId(value: unknown): value is PopupToolId {
  return typeof value === 'string' && POPUP_TOOL_ID_SET.has(value);
}

/**
 * 도구별 창 크기. 작은 창에서도 조작 버튼에 닿아야 하므로 최소 크기를 따로 둔다.
 * 전체 배율 축소로 대체하지 않는다(글씨·버튼이 너무 작아진다).
 */
export const TOOL_POPUP_WINDOW_SPECS: Readonly<Record<PopupToolId, ToolPopupWindowSpec>> = {
  'tool-timer': { width: 560, height: 720, minWidth: 420, minHeight: 560 },
  'tool-random': { width: 620, height: 760, minWidth: 460, minHeight: 600 },
  'tool-traffic-light': { width: 420, height: 620, minWidth: 340, minHeight: 480 },
  'tool-scoreboard': { width: 900, height: 680, minWidth: 620, minHeight: 520 },
  'tool-roulette': { width: 640, height: 760, minWidth: 520, minHeight: 620 },
  'tool-dice': { width: 560, height: 660, minWidth: 420, minHeight: 520 },
  'tool-coin': { width: 460, height: 600, minWidth: 360, minHeight: 460 },
  'tool-qrcode': { width: 560, height: 720, minWidth: 460, minHeight: 600 },
  'tool-work-symbols': { width: 620, height: 680, minWidth: 460, minHeight: 520 },
};

export function resolveToolPopupSpec(toolId: PopupToolId): ToolPopupWindowSpec {
  return TOOL_POPUP_WINDOW_SPECS[toolId];
}

export interface ToolPopupQuery {
  readonly toolId: PopupToolId;
  /** 넘겨받을 스냅샷 표. 없으면 빈 상태로 새로 시작한다. */
  readonly handoffId: string | null;
}

/** 창 주소에 붙일 질의 문자열(`?` 없이)을 만든다. */
export function buildToolPopupQuery(query: ToolPopupQuery): string {
  const params = new URLSearchParams();
  params.set('mode', TOOL_POPUP_MODE);
  params.set('tool', query.toolId);
  if (query.handoffId !== null && query.handoffId !== '') {
    params.set('handoff', query.handoffId);
  }
  return params.toString();
}

/**
 * 창 주소에서 팝업 대상을 읽는다.
 * mode 가 다르거나 도구가 허용목록 밖이면 null — 창 안에서도 한 번 더 막는다.
 */
export function parseToolPopupQuery(search: string): ToolPopupQuery | null {
  const params = new URLSearchParams(search);
  if (params.get('mode') !== TOOL_POPUP_MODE) return null;
  const toolId = params.get('tool');
  if (!isPopupToolId(toolId)) return null;
  const handoffId = params.get('handoff');
  return {
    toolId,
    handoffId: handoffId !== null && handoffId !== '' ? handoffId : null,
  };
}
