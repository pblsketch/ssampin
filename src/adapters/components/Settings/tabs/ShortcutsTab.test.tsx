/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { DEFAULT_SHORTCUTS, useSettingsStore } from '@adapters/stores/useSettingsStore';
import { ShortcutsTab } from './ShortcutsTab';
import { useToastStore } from '@adapters/components/common/Toast';

const originalState = useSettingsStore.getState();
const setShortcut = vi.fn().mockResolvedValue(undefined);
const toggleGlobalShortcuts = vi.fn().mockResolvedValue(undefined);
const resetShortcuts = vi.fn().mockResolvedValue(undefined);
const originalToastState = useToastStore.getState();

beforeEach(() => {
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] });
  useSettingsStore.setState({
    settings: { ...originalState.settings, shortcuts: DEFAULT_SHORTCUTS },
    setShortcut,
    toggleGlobalShortcuts,
    resetShortcuts,
  });
});

afterEach(() => {
  cleanup();
  useSettingsStore.setState(originalState, true);
  useToastStore.setState(originalToastState, true);
  Reflect.deleteProperty(window, 'electronAPI');
});

describe('설정 단축키 탭', () => {
  test('기존 여섯 기능과 옆핀을 모두 표시한다', () => {
    render(<ShortcutsTab />);

    for (const label of [
      '할일 추가',
      '일정 추가',
      '메모 추가',
      '노트 새 페이지',
      '즐겨찾기 추가',
      '내 이모티콘 피커 열기/닫기',
      '옆핀 열기/닫기',
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(
      screen
        .getByRole('switch', { name: '옆핀 열기/닫기 단축키 활성화' })
        .getAttribute('aria-checked'),
    ).toBe('true');
  });

  test('옆핀 개별 활성화 설정을 같은 저장 경로로 보낸다', () => {
    render(<ShortcutsTab />);

    fireEvent.click(screen.getByRole('switch', { name: '옆핀 열기/닫기 단축키 활성화' }));

    expect(setShortcut).toHaveBeenCalledWith('sidePin:toggle', 'mod+alt+p', false);
  });

  test('옆핀 키 조합을 바꾸면 sidePin 명령 ID로 저장한다', () => {
    render(<ShortcutsTab />);
    const row = screen.getByText('옆핀 열기/닫기').closest('.h-14');
    expect(row).not.toBeNull();

    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: '변경' }));
    fireEvent.keyDown(window, { key: 'u', ctrlKey: true, altKey: true });

    expect(setShortcut).toHaveBeenCalledWith('sidePin:toggle', 'mod+alt+u');
  });

  test('글로벌 토글도 접근 가능한 이름과 저장 경로를 가진다', () => {
    render(<ShortcutsTab />);

    fireEvent.click(screen.getByRole('switch', { name: '글로벌 단축키 활성화' }));

    expect(toggleGlobalShortcuts).toHaveBeenCalledWith(false);
  });

  test('표기만 다른 같은 조합으로 변경하면 충돌을 알리고 저장하지 않는다', () => {
    render(<ShortcutsTab />);
    const row = screen.getByText('옆핀 열기/닫기').closest('.h-14');

    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: '변경' }));
    fireEvent.keyDown(window, { key: 't', ctrlKey: true, altKey: true });

    expect(setShortcut).not.toHaveBeenCalled();
    expect(useToastStore.getState().toasts.at(-1)?.message).toContain('할일 추가');
  });

  test('충돌하는 비활성 단축키는 다시 켜지지 않는다', () => {
    useSettingsStore.setState({
      settings: {
        ...originalState.settings,
        shortcuts: {
          ...DEFAULT_SHORTCUTS,
          bindings: {
            ...DEFAULT_SHORTCUTS.bindings,
            'sidePin:toggle': { combo: 'ctrl+alt+t', enabled: false },
          },
        },
      },
    });
    render(<ShortcutsTab />);

    fireEvent.click(screen.getByRole('switch', { name: '옆핀 열기/닫기 단축키 활성화' }));

    expect(setShortcut).not.toHaveBeenCalled();
    expect(useToastStore.getState().toasts.at(-1)?.message).toContain('할일 추가');
  });

  test('일반 문자 하나는 저장하지 않고 키 입력 대기를 유지한다', () => {
    const setShortcutCaptureActive = vi.fn();
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { setShortcutCaptureActive },
    });
    render(<ShortcutsTab />);
    const row = screen.getByText('옆핀 열기/닫기').closest('.h-14');

    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: '변경' }));
    fireEvent.keyDown(window, { key: 'a' });

    expect(setShortcut).not.toHaveBeenCalled();
    expect(within(row as HTMLElement).getByText('키를 누르세요…')).toBeTruthy();
    expect(setShortcutCaptureActive).toHaveBeenCalledWith(true);
    expect(useToastStore.getState().toasts.at(-1)?.message).toContain('Ctrl/Cmd 또는 Alt');
  });
});
