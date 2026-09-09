/**
 * 쌤도구 팝업 창 관리자.
 *
 * 도구 하나당 창 하나만 만든다. 이미 있으면 새로 만들지 않고 그 창을 앞으로 가져온다.
 * 상태를 넘겨받은 창이 **화면 준비를 마쳤다고 알릴 때까지** 열기 요청을 성공으로 돌려주지 않는다
 * — 그래야 보낸 쪽이 실행을 안전하게 놓을 수 있다(실패하면 원래 창이 되살린다).
 *
 * 설계: docs/02-design/features/tool-popup.design.md §4, §5
 */
import type {
  PopupToolId,
  ToolPopupOpenResult,
  ToolPopupWindowSpec,
} from '../src/domain/entities/ToolPopup';
import {
  buildToolPopupQuery,
  isPopupToolId,
  resolveToolPopupSpec,
} from '../src/domain/rules/toolPopupRules';

/** 창 준비 대기 상한. 이 시간을 넘기면 창을 정리하고 실패로 돌려준다. */
export const TOOL_POPUP_READY_TIMEOUT_MS = 10_000;

/**
 * 관리자가 쓰는 창의 최소 모습. 실제로는 electron `BrowserWindow` 지만,
 * 테스트에서 가짜 창을 넣을 수 있도록 좁은 계약만 요구한다.
 */
export interface ToolPopupWindowLike {
  readonly webContentsId: number;
  loadPopup(query: string): void;
  show(): void;
  focus(): void;
  restoreIfMinimized(): void;
  setAlwaysOnTop(flag: boolean): void;
  destroy(): void;
  isDestroyed(): boolean;
  /** 창이 닫혔을 때 알려준다. 관리자가 목록에서 지운다. */
  onClosed(handler: () => void): void;
  /** 화면 로드가 실패했을 때 알려준다. */
  onLoadFailed(handler: (reason: string) => void): void;
}

export interface ToolPopupWindowFactory {
  create(toolId: PopupToolId, spec: ToolPopupWindowSpec): ToolPopupWindowLike;
}

export interface ToolPopupManagerOptions {
  readonly factory: ToolPopupWindowFactory;
  /** 열린 도구 목록이 바뀔 때마다 부른다(다른 창에 알리기 위해). */
  onChanged?(openToolIds: readonly PopupToolId[]): void;
  /** 테스트에서 대기 시간을 줄이기 위한 주입점. */
  readonly readyTimeoutMs?: number;
  now?(): number;
}

interface PendingReady {
  resolve(result: ToolPopupOpenResult): void;
  timer: ReturnType<typeof setTimeout> | null;
}

interface PopupEntry {
  readonly toolId: PopupToolId;
  readonly window: ToolPopupWindowLike;
  pending: PendingReady | null;
}

interface StoredHandoff {
  readonly toolId: PopupToolId;
  readonly snapshot: unknown;
  readonly capturedAt: number;
}

/** 팝업 창이 가져가는 스냅샷 봉투. */
export interface ClaimedHandoff {
  readonly snapshot: unknown;
  readonly capturedAt: number;
}

export interface ToolPopupManager {
  open(toolId: unknown, snapshot: unknown, capturedAt: number): Promise<ToolPopupOpenResult>;
  /** 팝업 창이 스냅샷을 **1회만** 가져간다. 두 번째부터는 null. */
  claimHandoff(handoffId: unknown, webContentsId: number): ClaimedHandoff | null;
  /** 팝업 창이 "준비 끝"을 알린다. 등록되지 않은 창이면 false. */
  markReady(webContentsId: number): boolean;
  focus(toolId: unknown): boolean;
  close(toolId: unknown): boolean;
  setAlwaysOnTop(toolId: unknown, flag: boolean): boolean;
  /** 발신 창에서 도구를 역조회한다 — 본문 복귀 요청의 인자를 믿지 않기 위해. */
  resolveToolIdByWebContents(webContentsId: number): PopupToolId | null;
  listOpen(): readonly PopupToolId[];
  getWindows(): readonly ToolPopupWindowLike[];
  closeAll(): void;
}

export function createToolPopupManager(options: ToolPopupManagerOptions): ToolPopupManager {
  const entries = new Map<PopupToolId, PopupEntry>();
  const handoffs = new Map<string, StoredHandoff>();
  const readyTimeoutMs = options.readyTimeoutMs ?? TOOL_POPUP_READY_TIMEOUT_MS;
  const now = options.now ?? ((): number => Date.now());
  let handoffSeq = 0;

  function listOpen(): readonly PopupToolId[] {
    return [...entries.values()]
      .filter((entry) => !entry.window.isDestroyed())
      .map((entry) => entry.toolId);
  }

  function notifyChanged(): void {
    options.onChanged?.(listOpen());
  }

  function settle(entry: PopupEntry, result: ToolPopupOpenResult): void {
    const pending = entry.pending;
    if (pending === null) return;
    entry.pending = null;
    if (pending.timer !== null) clearTimeout(pending.timer);
    pending.resolve(result);
  }

  function dropEntry(entry: PopupEntry): void {
    if (entries.get(entry.toolId) === entry) entries.delete(entry.toolId);
    for (const [id, handoff] of handoffs) {
      if (handoff.toolId === entry.toolId) handoffs.delete(id);
    }
  }

  function findEntryByWebContents(webContentsId: number): PopupEntry | null {
    for (const entry of entries.values()) {
      if (entry.window.webContentsId === webContentsId) return entry;
    }
    return null;
  }

  async function open(
    toolId: unknown,
    snapshot: unknown,
    capturedAt: number,
  ): Promise<ToolPopupOpenResult> {
    if (!isPopupToolId(toolId)) return { ok: false, reason: 'unsupported-tool' };

    const existing = entries.get(toolId);
    if (existing !== undefined && !existing.window.isDestroyed()) {
      // 같은 도구를 다시 열면 새 창을 만들지 않고 기존 창을 앞으로 가져온다.
      existing.window.restoreIfMinimized();
      existing.window.show();
      existing.window.focus();
      return { ok: true, focusedExisting: true };
    }

    let handoffId: string | null = null;
    if (snapshot !== undefined && snapshot !== null) {
      handoffSeq += 1;
      handoffId = `hoff-${now()}-${handoffSeq}`;
      handoffs.set(handoffId, { toolId, snapshot, capturedAt });
    }

    let win: ToolPopupWindowLike;
    try {
      win = options.factory.create(toolId, resolveToolPopupSpec(toolId));
    } catch {
      if (handoffId !== null) handoffs.delete(handoffId);
      return { ok: false, reason: 'window-create-failed' };
    }

    const entry: PopupEntry = { toolId, window: win, pending: null };
    entries.set(toolId, entry);

    const result = await new Promise<ToolPopupOpenResult>((resolve) => {
      const timer = setTimeout(() => {
        settle(entry, { ok: false, reason: 'ready-timeout' });
      }, readyTimeoutMs);
      if (typeof timer === 'object' && timer !== null && typeof timer.unref === 'function') {
        timer.unref();
      }
      entry.pending = { resolve, timer };

      win.onClosed(() => {
        settle(entry, { ok: false, reason: 'load-failed' });
        dropEntry(entry);
        notifyChanged();
      });
      win.onLoadFailed(() => {
        settle(entry, { ok: false, reason: 'load-failed' });
      });

      win.loadPopup(buildToolPopupQuery({ toolId, handoffId }));
    });

    if (!result.ok) {
      if (handoffId !== null) handoffs.delete(handoffId);
      if (!win.isDestroyed()) win.destroy();
      dropEntry(entry);
      notifyChanged();
      return result;
    }

    notifyChanged();
    return result;
  }

  return {
    open,

    claimHandoff(handoffId: unknown, webContentsId: number): ClaimedHandoff | null {
      if (typeof handoffId !== 'string' || handoffId === '') return null;
      const stored = handoffs.get(handoffId);
      if (stored === undefined) return null;
      // 요청한 창이 정말 그 도구의 팝업인지 확인한다. 표만 알면 아무나 가져가지 못한다.
      const entry = findEntryByWebContents(webContentsId);
      if (entry === null || entry.toolId !== stored.toolId) return null;
      handoffs.delete(handoffId);
      return { snapshot: stored.snapshot, capturedAt: stored.capturedAt };
    },

    markReady(webContentsId: number): boolean {
      const entry = findEntryByWebContents(webContentsId);
      if (entry === null) return false;
      if (!entry.window.isDestroyed()) {
        entry.window.show();
        entry.window.focus();
      }
      settle(entry, { ok: true, focusedExisting: false });
      return true;
    },

    focus(toolId: unknown): boolean {
      if (!isPopupToolId(toolId)) return false;
      const entry = entries.get(toolId);
      if (entry === undefined || entry.window.isDestroyed()) return false;
      entry.window.restoreIfMinimized();
      entry.window.show();
      entry.window.focus();
      return true;
    },

    close(toolId: unknown): boolean {
      if (!isPopupToolId(toolId)) return false;
      const entry = entries.get(toolId);
      if (entry === undefined) return false;
      settle(entry, { ok: false, reason: 'load-failed' });
      if (!entry.window.isDestroyed()) entry.window.destroy();
      dropEntry(entry);
      notifyChanged();
      return true;
    },

    setAlwaysOnTop(toolId: unknown, flag: boolean): boolean {
      if (!isPopupToolId(toolId)) return false;
      const entry = entries.get(toolId);
      if (entry === undefined || entry.window.isDestroyed()) return false;
      entry.window.setAlwaysOnTop(flag);
      return true;
    },

    resolveToolIdByWebContents(webContentsId: number): PopupToolId | null {
      return findEntryByWebContents(webContentsId)?.toolId ?? null;
    },

    listOpen,

    getWindows(): readonly ToolPopupWindowLike[] {
      return [...entries.values()].map((entry) => entry.window).filter((win) => !win.isDestroyed());
    },

    closeAll(): void {
      for (const entry of [...entries.values()]) {
        settle(entry, { ok: false, reason: 'load-failed' });
        if (!entry.window.isDestroyed()) entry.window.destroy();
        dropEntry(entry);
      }
      handoffs.clear();
      notifyChanged();
    },
  };
}
