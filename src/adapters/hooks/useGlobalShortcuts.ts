import { useEffect, useRef } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useQuickAddStore } from '@adapters/stores/useQuickAddStore';
import type { QuickAddKind } from '@adapters/stores/useQuickAddStore';
import { matchesCombo } from './shortcut/keyNormalize';

const COMMAND_TO_KIND: Record<string, QuickAddKind> = {
  'quickAdd.todo': 'todo',
  'quickAdd.event': 'event',
  'quickAdd.memo': 'memo',
  'quickAdd.note': 'note',
  'quickAdd.bookmark': 'bookmark',
  // 'sticker-picker:toggle'은 QuickAdd가 아닌 별도 윈도우 토글이므로 여기 매핑하지 않음.
  // settings.shortcuts.bindings 에는 포함되어 syncShortcuts IPC로 메인에 전달되며,
  // 메인 프로세스의 triggerShortcut()이 stickerPickerWindow 토글을 직접 처리한다.
};

/**
 * 전역 퀵애드 단축키 훅.
 *
 * - Settings의 shortcuts.bindings를 구독하여 keydown으로 매칭
 * - Ctrl+Alt 조합은 input/textarea 포커스 가드 예외 (타이핑 방해 안 함)
 * - Electron 메인 프로세스의 globalShortcut → IPC 'shortcut:triggered' 수신
 * - 두 경로의 이중 트리거를 150ms debounce로 방지
 */
export function useGlobalShortcuts(): void {
  const settings = useSettingsStore((s) => s.settings);
  const lastFiredAtRef = useRef<{ kind: QuickAddKind | null; at: number }>({ kind: null, at: 0 });

  const fire = (kind: QuickAddKind): void => {
    const now = Date.now();
    const last = lastFiredAtRef.current;
    if (last.kind === kind && now - last.at < 150) return; // 이중 트리거 방지
    lastFiredAtRef.current = { kind, at: now };
    useQuickAddStore.getState().open(kind);
  };

  // Renderer keydown
  useEffect(() => {
    const lastStickerFiredAt = { at: 0 };

    const handler = (e: KeyboardEvent): void => {
      const bindings = useSettingsStore.getState().settings.shortcuts?.bindings;
      if (!bindings) return;

      for (const [commandId, binding] of Object.entries(bindings)) {
        if (!binding.enabled) continue;
        if (!matchesCombo(e, binding.combo)) continue;

        // sticker-picker:toggle 은 별도 윈도우 토글 — main process IPC로 위임.
        // globalShortcut 등록이 실패한 환경(다른 앱이 단축키 선점)에서도
        // 메인 윈도우 포커스 상태에서는 정상 동작하도록 보장.
        if (commandId === 'sticker-picker:toggle') {
          const now = Date.now();
          if (now - lastStickerFiredAt.at < 250) return; // globalShortcut과 이중 트리거 방지
          lastStickerFiredAt.at = now;
          e.preventDefault();
          void window.electronAPI?.sticker?.triggerToggle?.();
          return;
        }

        const kind = COMMAND_TO_KIND[commandId];
        if (!kind) continue;

        // input/textarea 가드: shift+alt를 동시에 누르지 않은 단순 modifier 조합만 가드
        // (Ctrl+Alt 조합은 타이핑 방해 안 하므로 가드 없음)
        const target = e.target as HTMLElement | null;
        const isTyping = target && (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target.isContentEditable
        );
        const hasAlt = e.altKey;
        if (isTyping && !hasAlt) continue; // Ctrl+T 같은 단순 조합은 타이핑 보호

        e.preventDefault();
        fire(kind);
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Electron main → renderer IPC
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onShortcutTriggered) return;
    const unsubscribe = api.onShortcutTriggered((commandId: string) => {
      const kind = COMMAND_TO_KIND[commandId];
      if (!kind) return;
      fire(kind);
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Electron main에 settings 동기화 신호 송신
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.syncShortcuts) return;
    const sc = settings.shortcuts;
    if (!sc) return;
    const payload = {
      globalEnabled: sc.globalEnabled,
      bindings: Object.entries(sc.bindings).map(([id, b]) => ({
        id,
        combo: b.combo,
        enabled: b.enabled,
      })),
    };
    void api.syncShortcuts(payload);
  }, [settings.shortcuts]);
}
