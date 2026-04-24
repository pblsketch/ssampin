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
    const handler = (e: KeyboardEvent): void => {
      const bindings = useSettingsStore.getState().settings.shortcuts?.bindings;
      if (!bindings) return;

      for (const [commandId, binding] of Object.entries(bindings)) {
        if (!binding.enabled) continue;
        const kind = COMMAND_TO_KIND[commandId];
        if (!kind) continue;
        if (!matchesCombo(e, binding.combo)) continue;

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
