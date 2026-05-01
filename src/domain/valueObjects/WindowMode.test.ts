import { describe, expect, test } from 'vitest';
import { isValidWindowMode, WINDOW_MODES, type WindowMode } from './WindowMode';

describe('WindowMode value object', () => {
  test('TC-01: WINDOW_MODES는 icon, widget, main 3개를 포함한다', () => {
    expect(WINDOW_MODES).toEqual(['icon', 'widget', 'main']);
  });

  test('TC-01a: isValidWindowMode("icon") === true', () => {
    expect(isValidWindowMode('icon')).toBe(true);
  });

  test('TC-01b: isValidWindowMode("widget") === true', () => {
    expect(isValidWindowMode('widget')).toBe(true);
  });

  test('TC-01c: isValidWindowMode("main") === true', () => {
    expect(isValidWindowMode('main')).toBe(true);
  });

  test('TC-01d: 알 수 없는 값은 false', () => {
    expect(isValidWindowMode('tray')).toBe(false);
    expect(isValidWindowMode('floating')).toBe(false);
    expect(isValidWindowMode('')).toBe(false);
    expect(isValidWindowMode(null)).toBe(false);
    expect(isValidWindowMode(undefined)).toBe(false);
    expect(isValidWindowMode(123)).toBe(false);
  });

  test('TC-01e: type narrowing 동작 — isValidWindowMode 통과 시 WindowMode 타입', () => {
    const value: unknown = 'icon';
    if (isValidWindowMode(value)) {
      // 컴파일 타임 검증: value는 WindowMode 타입이어야 함
      const narrowed: WindowMode = value;
      expect(narrowed).toBe('icon');
    }
  });
});
