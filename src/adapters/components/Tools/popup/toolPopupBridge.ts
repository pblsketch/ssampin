import type {
  PopupToolId,
  ToolPopupFailureReason,
  ToolPopupOpenResult,
} from '@domain/entities/ToolPopup';
import {
  buildToolPopupQuery,
  isPopupToolId,
  resolveToolPopupSpec,
} from '@domain/rules/toolPopupRules';

/**
 * 쌤도구 팝업 — 창을 여는 통로.
 *
 * 데스크톱 앱에서는 Electron 이 진짜 창을 만들고, 개발용 브라우저에서는 `window.open` 으로
 * 대신한다. 브라우저는 항상 위·창 위치를 보장하지 않으므로 그 기능을 숨긴다.
 * **브라우저 확인은 데스크톱 앱 검증을 대체하지 않는다.**
 *
 * 설계: docs/02-design/features/tool-popup.design.md §8
 */

export interface ClaimedToolPopupHandoff {
  readonly snapshot: unknown;
  readonly capturedAt: number;
}

export interface ToolPopupReturnPayload {
  readonly toolId: PopupToolId;
  readonly snapshot: unknown;
  readonly capturedAt: number;
}

export interface ToolPopupBridge {
  readonly supportsAlwaysOnTop: boolean;
  open(toolId: PopupToolId, snapshot: unknown, capturedAt: number): Promise<ToolPopupOpenResult>;
  claimHandoff(handoffId: string): Promise<ClaimedToolPopupHandoff | null>;
  markReady(): Promise<void>;
  focus(toolId: PopupToolId): Promise<boolean>;
  close(toolId?: PopupToolId): Promise<boolean>;
  setAlwaysOnTop(toolId: PopupToolId | null, flag: boolean): Promise<boolean>;
  list(): Promise<readonly PopupToolId[]>;
  returnToMain(snapshot: unknown, capturedAt: number): Promise<boolean>;
  onChanged(callback: (openToolIds: readonly PopupToolId[]) => void): () => void;
  onReturned(callback: (payload: ToolPopupReturnPayload) => void): () => void;
}

const BROWSER_CHANNEL = 'ssampin-tool-popup';
const BROWSER_HANDOFF_PREFIX = 'ssampin.toolPopupHandoff.';
const BROWSER_READY_TIMEOUT_MS = 10_000;

function onlyPopupIds(values: unknown): readonly PopupToolId[] {
  if (!Array.isArray(values)) return [];
  return values.filter((value): value is PopupToolId => isPopupToolId(value));
}

type ElectronToolPopupApi = NonNullable<NonNullable<Window['electronAPI']>['toolPopup']>;

function createElectronBridge(popup: ElectronToolPopupApi): ToolPopupBridge {
  return {
    supportsAlwaysOnTop: true,
    async open(toolId, snapshot, capturedAt) {
      const result = await popup.open(toolId, snapshot, capturedAt);
      if (result.ok === true) {
        return { ok: true, focusedExisting: result.focusedExisting === true };
      }
      return { ok: false, reason: normalizeReason(result.reason) };
    },
    claimHandoff: (handoffId) => popup.claimHandoff(handoffId),
    markReady: async () => {
      await popup.markReady();
    },
    focus: (toolId) => popup.focus(toolId),
    close: (toolId) => popup.close(toolId),
    setAlwaysOnTop: (toolId, flag) => popup.setAlwaysOnTop(toolId, flag),
    list: async () => onlyPopupIds(await popup.list()),
    returnToMain: (snapshot, capturedAt) => popup.returnToMain(snapshot, capturedAt),
    onChanged: (callback) => popup.onChanged((ids) => callback(onlyPopupIds(ids))),
    onReturned: (callback) =>
      popup.onReturned((payload) => {
        if (!isPopupToolId(payload.toolId)) return;
        callback({
          toolId: payload.toolId,
          snapshot: payload.snapshot,
          capturedAt: payload.capturedAt,
        });
      }),
  };
}

function normalizeReason(reason: string | undefined): ToolPopupFailureReason {
  switch (reason) {
    case 'unsupported-tool':
    case 'window-create-failed':
    case 'ready-timeout':
    case 'load-failed':
    case 'blocked-by-browser':
      return reason;
    default:
      return 'unavailable';
  }
}

interface BrowserMessage {
  readonly type: 'ready' | 'closed' | 'returned';
  readonly toolId: PopupToolId;
  readonly snapshot?: unknown;
  readonly capturedAt?: number;
}

/**
 * 개발용 브라우저 폴백.
 * 스냅샷은 localStorage 한 칸으로 넘기고 새 창이 1회 가져간다.
 * 준비·종료 신호는 BroadcastChannel 로 주고받는다.
 */
function createBrowserBridge(): ToolPopupBridge {
  const opened = new Map<PopupToolId, Window>();
  const changeListeners = new Set<(ids: readonly PopupToolId[]) => void>();
  const returnListeners = new Set<(payload: ToolPopupReturnPayload) => void>();
  let channel: BroadcastChannel | null = null;
  let handoffSeq = 0;

  function getChannel(): BroadcastChannel | null {
    if (typeof BroadcastChannel === 'undefined') return null;
    channel ??= new BroadcastChannel(BROWSER_CHANNEL);
    return channel;
  }

  function liveIds(): readonly PopupToolId[] {
    for (const [toolId, win] of [...opened]) {
      if (win.closed) opened.delete(toolId);
    }
    return [...opened.keys()];
  }

  function emitChanged(): void {
    const ids = liveIds();
    for (const listener of changeListeners) listener(ids);
  }

  getChannel()?.addEventListener('message', (event) => {
    const message = event.data as BrowserMessage | null;
    if (message === null || !isPopupToolId(message.toolId)) return;
    if (message.type === 'closed') {
      opened.delete(message.toolId);
      emitChanged();
      return;
    }
    if (message.type === 'returned') {
      for (const listener of returnListeners) {
        listener({
          toolId: message.toolId,
          snapshot: message.snapshot ?? null,
          capturedAt: message.capturedAt ?? Date.now(),
        });
      }
      opened.get(message.toolId)?.close();
      opened.delete(message.toolId);
      emitChanged();
    }
  });

  function waitForReady(toolId: PopupToolId, win: Window): Promise<ToolPopupOpenResult> {
    return new Promise((resolve) => {
      const bc = getChannel();
      let done = false;
      const finish = (result: ToolPopupOpenResult): void => {
        if (done) return;
        done = true;
        clearInterval(closedPoll);
        clearTimeout(timer);
        bc?.removeEventListener('message', onMessage);
        resolve(result);
      };
      const onMessage = (event: MessageEvent): void => {
        const message = event.data as BrowserMessage | null;
        if (message?.type === 'ready' && message.toolId === toolId) {
          finish({ ok: true, focusedExisting: false });
        }
      };
      bc?.addEventListener('message', onMessage);
      const closedPoll = setInterval(() => {
        if (win.closed) finish({ ok: false, reason: 'load-failed' });
      }, 200);
      const timer = setTimeout(() => {
        win.close();
        finish({ ok: false, reason: 'ready-timeout' });
      }, BROWSER_READY_TIMEOUT_MS);
      if (bc === null) {
        // BroadcastChannel 이 없는 오래된 브라우저에서는 준비 확인을 할 수 없다.
        // 이미 연 창을 그대로 두면 떠돌이 창이 남으므로 닫고 실패로 돌려준다.
        win.close();
        finish({ ok: false, reason: 'unavailable' });
      }
    });
  }

  return {
    // 브라우저는 창을 항상 위에 두는 것을 보장하지 않는다.
    supportsAlwaysOnTop: false,

    async open(toolId, snapshot, capturedAt) {
      const existing = opened.get(toolId);
      if (existing !== undefined && !existing.closed) {
        existing.focus();
        return { ok: true, focusedExisting: true };
      }
      handoffSeq += 1;
      const handoffId = `hoff-${Date.now()}-${handoffSeq}`;
      try {
        window.localStorage.setItem(
          `${BROWSER_HANDOFF_PREFIX}${handoffId}`,
          JSON.stringify({ toolId, snapshot, capturedAt }),
        );
      } catch {
        return { ok: false, reason: 'unavailable' };
      }
      const spec = resolveToolPopupSpec(toolId);
      const query = buildToolPopupQuery({ toolId, handoffId });
      const features = `popup=yes,width=${spec.width},height=${spec.height}`;
      const win = window.open(
        `${window.location.pathname}?${query}`,
        `ssampin-${toolId}`,
        features,
      );
      if (win === null) {
        window.localStorage.removeItem(`${BROWSER_HANDOFF_PREFIX}${handoffId}`);
        return { ok: false, reason: 'blocked-by-browser' };
      }
      opened.set(toolId, win);
      const result = await waitForReady(toolId, win);
      if (!result.ok) {
        window.localStorage.removeItem(`${BROWSER_HANDOFF_PREFIX}${handoffId}`);
        opened.delete(toolId);
      }
      emitChanged();
      return result;
    },

    async claimHandoff(handoffId) {
      const key = `${BROWSER_HANDOFF_PREFIX}${handoffId}`;
      const raw = window.localStorage.getItem(key);
      if (raw === null) return null;
      window.localStorage.removeItem(key);
      try {
        const parsed = JSON.parse(raw) as { snapshot: unknown; capturedAt: number };
        return { snapshot: parsed.snapshot, capturedAt: parsed.capturedAt };
      } catch {
        return null;
      }
    },

    async markReady() {
      const toolId = new URLSearchParams(window.location.search).get('tool');
      if (!isPopupToolId(toolId)) return;
      getChannel()?.postMessage({ type: 'ready', toolId } satisfies BrowserMessage);
      window.addEventListener('beforeunload', () => {
        getChannel()?.postMessage({ type: 'closed', toolId } satisfies BrowserMessage);
      });
    },

    async focus(toolId) {
      const win = opened.get(toolId);
      if (win === undefined || win.closed) return false;
      win.focus();
      return true;
    },

    async close(toolId) {
      if (toolId === undefined) {
        window.close();
        return true;
      }
      const win = opened.get(toolId);
      if (win === undefined) return false;
      win.close();
      opened.delete(toolId);
      emitChanged();
      return true;
    },

    async setAlwaysOnTop() {
      return false;
    },

    async list() {
      return liveIds();
    },

    async returnToMain(snapshot, capturedAt) {
      const toolId = new URLSearchParams(window.location.search).get('tool');
      if (!isPopupToolId(toolId)) return false;
      getChannel()?.postMessage({
        type: 'returned',
        toolId,
        snapshot,
        capturedAt,
      } satisfies BrowserMessage);
      window.close();
      return true;
    },

    onChanged(callback) {
      changeListeners.add(callback);
      return () => void changeListeners.delete(callback);
    },

    onReturned(callback) {
      returnListeners.add(callback);
      return () => void returnListeners.delete(callback);
    },
  };
}

let cached: ToolPopupBridge | null = null;

/** 지금 환경에 맞는 통로를 돌려준다. 창을 만들 수 없는 환경이면 전부 실패로 답한다. */
export function getToolPopupBridge(): ToolPopupBridge {
  if (cached !== null) return cached;
  if (typeof window === 'undefined') {
    cached = createUnavailableBridge();
    return cached;
  }
  const api = window.electronAPI?.toolPopup;
  cached = api !== undefined ? createElectronBridge(api) : createBrowserBridge();
  return cached;
}

/** 테스트에서 통로를 갈아 끼우기 위한 문. */
export function __setToolPopupBridgeForTest(bridge: ToolPopupBridge | null): void {
  cached = bridge;
}

function createUnavailableBridge(): ToolPopupBridge {
  return {
    supportsAlwaysOnTop: false,
    open: async () => ({ ok: false, reason: 'unavailable' }),
    claimHandoff: async () => null,
    markReady: async () => {},
    focus: async () => false,
    close: async () => false,
    setAlwaysOnTop: async () => false,
    list: async () => [],
    returnToMain: async () => false,
    onChanged: () => () => {},
    onReturned: () => () => {},
  };
}
