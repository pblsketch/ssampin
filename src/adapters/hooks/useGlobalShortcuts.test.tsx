/** @vitest-environment jsdom */
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { DEFAULT_SHORTCUTS } from '@adapters/stores/useSettingsStore';
import { useQuickAddStore } from '@adapters/stores/useQuickAddStore';
import { useGlobalShortcuts } from './useGlobalShortcuts';
import { useToastStore } from '@adapters/components/common/Toast';

const originalSettings = useSettingsStore.getState().settings;
const originalQuickAddState = useQuickAddStore.getState();
const originalToastState = useToastStore.getState();

function setBindings(bindings: NonNullable<typeof originalSettings.shortcuts>['bindings']): void {
  useSettingsStore.setState({
    settings: {
      ...originalSettings,
      shortcuts: {
        globalEnabled: true,
        bindings,
      },
    },
  });
}

function keydown(
  key: string,
  options: { altKey?: boolean; shiftKey?: boolean } = {},
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    ctrlKey: true,
    altKey: options.altKey ?? false,
    shiftKey: options.shiftKey ?? false,
    cancelable: true,
  });
  act(() => window.dispatchEvent(event));
  return event;
}

beforeEach(() => setBindings({ 'sidePin:toggle': { combo: 'mod+alt+p', enabled: true } }));

afterEach(() => {
  cleanup();
  useSettingsStore.setState({ settings: originalSettings });
  useQuickAddStore.setState(originalQuickAddState, true);
  useToastStore.setState(originalToastState, true);
  Reflect.deleteProperty(window, 'electronAPI');
  vi.restoreAllMocks();
});

describe('useGlobalShortcuts 옆핀 배선', () => {
  test('설정한 키를 누르면 기본 동작을 막고 메인 프로세스에 토글을 한 번 보낸다', () => {
    const toggleShortcut = vi.fn();
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        sidePin: { toggleShortcut },
        syncShortcuts: vi.fn().mockResolvedValue({ registered: [], failed: [] }),
      },
    });
    renderHook(() => useGlobalShortcuts());

    const event = keydown('p', { altKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(toggleShortcut).toHaveBeenCalledTimes(1);
  });

  test('기존 퀵애드 단축키는 앱 내부 keydown과 main IPC가 겹쳐도 한 번만 연다', () => {
    setBindings({ 'quickAdd.todo': { combo: 'mod+alt+t', enabled: true } });
    const open = vi.fn();
    useQuickAddStore.setState({ open });
    let triggerFromMain: ((commandId: string) => void) | undefined;
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        onShortcutTriggered: (callback: (commandId: string) => void) => {
          triggerFromMain = callback;
          return vi.fn();
        },
        syncShortcuts: vi.fn().mockResolvedValue({ registered: [], failed: [] }),
      },
    });
    renderHook(() => useGlobalShortcuts());

    keydown('t', { altKey: true });
    act(() => triggerFromMain?.('quickAdd.todo'));

    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('todo');
  });

  test('기존 퀵애드 다섯 기능이 각각 설정된 조합으로 열린다', () => {
    setBindings(DEFAULT_SHORTCUTS.bindings);
    const open = vi.fn();
    useQuickAddStore.setState({ open });
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        syncShortcuts: vi.fn().mockResolvedValue({ registered: [], failed: [] }),
      },
    });
    renderHook(() => useGlobalShortcuts());

    for (const key of ['t', 'e', 'm', 'n', 'b']) keydown(key, { altKey: true });

    expect(open.mock.calls.map(([kind]) => kind)).toEqual([
      'todo',
      'event',
      'memo',
      'note',
      'bookmark',
    ]);
  });

  test('기존 이모티콘 단축키의 렌더러 폴백도 빠른 중복 입력을 한 번만 보낸다', () => {
    setBindings({ 'sticker-picker:toggle': { combo: 'mod+shift+e', enabled: true } });
    const triggerToggle = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        sticker: { triggerToggle },
        syncShortcuts: vi.fn().mockResolvedValue({ registered: [], failed: [] }),
      },
    });
    renderHook(() => useGlobalShortcuts());

    keydown('e', { shiftKey: true });
    keydown('e', { shiftKey: true });

    expect(triggerToggle).toHaveBeenCalledTimes(1);
  });

  test('개별 비활성화한 단축키는 실행하지 않는다', () => {
    setBindings({ 'sidePin:toggle': { combo: 'mod+alt+p', enabled: false } });
    const toggleShortcut = vi.fn();
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        sidePin: { toggleShortcut },
        syncShortcuts: vi.fn().mockResolvedValue({ registered: [], failed: [] }),
      },
    });
    renderHook(() => useGlobalShortcuts());

    const event = keydown('p', { altKey: true });

    expect(event.defaultPrevented).toBe(false);
    expect(toggleShortcut).not.toHaveBeenCalled();
  });

  test('설정의 일곱 명령을 메인 프로세스 등록 경로에 모두 동기화한다', () => {
    useSettingsStore.setState({
      settings: { ...originalSettings, shortcuts: DEFAULT_SHORTCUTS },
    });
    const syncShortcuts = vi.fn().mockResolvedValue({ registered: [], failed: [] });
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { syncShortcuts },
    });

    renderHook(() => useGlobalShortcuts());

    const payload = syncShortcuts.mock.calls[0]?.[0] as {
      bindings: Array<{ id: string }>;
    };
    expect(payload.bindings.map((binding) => binding.id).sort()).toEqual(
      Object.keys(DEFAULT_SHORTCUTS.bindings).sort(),
    );
  });

  test('시스템 등록에 실패한 단축키가 있으면 사용자에게 알린다', async () => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        syncShortcuts: vi.fn().mockResolvedValue({ registered: [], failed: ['sidePin:toggle'] }),
      },
    });

    renderHook(() => useGlobalShortcuts());

    await waitFor(() => {
      expect(useToastStore.getState().toasts.at(-1)?.message).toContain(
        '1개 단축키를 시스템에 등록하지 못했습니다',
      );
    });
  });
});
