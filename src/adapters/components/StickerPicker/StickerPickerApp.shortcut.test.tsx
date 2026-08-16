/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const load = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@adapters/stores/useStickerStore', () => ({
  useStickerStore: (selector: (state: { load: typeof load }) => unknown) => selector({ load }),
}));
vi.mock('@adapters/hooks/useThemeApplier', () => ({ useThemeApplier: vi.fn() }));
vi.mock('./StickerPicker', () => ({
  StickerPicker: ({ isOpen }: { isOpen: boolean }) => (
    <div data-testid="sticker-picker-state">{isOpen ? '열림' : '닫힘'}</div>
  ),
}));

import { StickerPickerApp } from './StickerPickerApp';

let shortcutHandler: ((commandId: string) => void) | undefined;

beforeEach(() => {
  shortcutHandler = undefined;
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      onShortcutTriggered: (callback: (commandId: string) => void) => {
        shortcutHandler = callback;
        return vi.fn();
      },
      sticker: {},
    },
  });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'electronAPI');
  vi.clearAllMocks();
});

describe('이모티콘 피커 단축키 표시 상태', () => {
  test('토글로 닫힌 뒤 show 명령을 받으면 반드시 열린다', () => {
    render(<StickerPickerApp />);
    expect(screen.getByTestId('sticker-picker-state').textContent).toBe('열림');

    act(() => shortcutHandler?.('sticker-picker:toggle'));
    expect(screen.getByTestId('sticker-picker-state').textContent).toBe('닫힘');

    act(() => shortcutHandler?.('sticker-picker:show'));
    expect(screen.getByTestId('sticker-picker-state').textContent).toBe('열림');
  });
});
