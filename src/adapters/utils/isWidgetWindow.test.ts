import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isWidgetWindow } from './isWidgetWindow';

/**
 * isWidgetWindow / RosterPage.pii-gate 핵심 검증
 *
 * Acceptance: 'PII reveal/edit only in main window; widget detection prevents PII mount' (Decision 9)
 *
 * Note: 본 테스트는 RosterPage 자체 e2e 대신 위젯 감지 도메인 로직을 검증.
 * Component-level e2e는 RTL 부재로 별도 진행하지 않음 (Pre-mortem #1과 직접 무관).
 */

let originalWindow: typeof globalThis.window | undefined;

beforeEach(() => {
  originalWindow = globalThis.window;
});

afterEach(() => {
  if (originalWindow === undefined) {
    // @ts-expect-error — node 환경에선 window 미존재
    delete globalThis.window;
  } else {
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
  }
});

function setWindow(loc: Partial<Location>): void {
  const win = {
    location: {
      hash: '',
      search: '',
      ...loc,
    } as Location,
  } as Window & typeof globalThis;
  Object.defineProperty(globalThis, 'window', { value: win, configurable: true });
}

describe('isWidgetWindow', () => {
  it('returns false in node env (typeof window === undefined)', () => {
    // @ts-expect-error — node env
    delete globalThis.window;
    expect(isWidgetWindow()).toBe(false);
  });

  it('returns false for main window route', () => {
    setWindow({ hash: '#/roster' });
    expect(isWidgetWindow()).toBe(false);
  });

  it('returns true when hash === #/widget', () => {
    setWindow({ hash: '#/widget' });
    expect(isWidgetWindow()).toBe(true);
  });

  it('returns true when hash === #widget (App.tsx::isWidgetMode 패턴) — Decision 9 회귀 보호', () => {
    setWindow({ hash: '#widget' });
    expect(isWidgetWindow()).toBe(true);
  });

  it('returns true when hash starts with #/widget/...', () => {
    setWindow({ hash: '#/widget/clock' });
    expect(isWidgetWindow()).toBe(true);
  });

  it('returns true when search contains mode=widget', () => {
    setWindow({ hash: '#/home', search: '?mode=widget' });
    expect(isWidgetWindow()).toBe(true);
  });

  it('returns false for unrelated query strings', () => {
    setWindow({ hash: '#/home', search: '?tab=1' });
    expect(isWidgetWindow()).toBe(false);
  });
});
