/**
 * 메타테스트: 미니앱 webview attach 강제 가드의 순수 로직.
 *
 * will-attach-webview 핸들러가 의존하는 두 순수 함수를 고정한다.
 *  1) hardenWebviewPreferences() — 모든 webview 에서 preload/preloadURL 삭제 + nodeIntegration=false +
 *     contextIsolation=true 를 강제(신뢰 경계를 main 이 보증).
 *  2) shouldBlockMiniAppAttach() — persist:miniapps 세션에 miniapp:// 아닌 src attach 를 거부하되,
 *     **기존 외부 쌤도구(persist:tools + https)는 절대 차단하지 않음**(회귀 고정).
 *
 * 설계 문서: docs/01-plan/features/miniapp-my-apps.plan.md §3, §7 (must-fix 메타테스트)
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({ protocol: {}, session: {} }));

import {
  hardenWebviewPreferences,
  shouldBlockMiniAppAttach,
  shouldBlockMiniAppNavigation,
  installMiniAppContentNavGuard,
} from './security-guards';
import type { WebContents } from 'electron';
import { MINIAPP_PARTITION } from './miniapp-protocol';

describe('hardenWebviewPreferences', () => {
  it('preload/preloadURL 삭제 + nodeIntegration=false + contextIsolation=true 강제', () => {
    const wp: Record<string, unknown> = {
      preload: '/evil/preload.js',
      preloadURL: 'file:///evil/preload.js',
      nodeIntegration: true,
      contextIsolation: false,
    };
    hardenWebviewPreferences(wp);
    expect('preload' in wp).toBe(false);
    expect('preloadURL' in wp).toBe(false);
    expect(wp['nodeIntegration']).toBe(false);
    expect(wp['contextIsolation']).toBe(true);
  });

  it('원래 preload 가 없어도 안전하게 하드닝(멱등)', () => {
    const wp: Record<string, unknown> = {};
    hardenWebviewPreferences(wp);
    expect(wp['nodeIntegration']).toBe(false);
    expect(wp['contextIsolation']).toBe(true);
  });
});

describe('shouldBlockMiniAppAttach', () => {
  it('miniapps partition + 비-miniapp:// src → 차단(true)', () => {
    expect(shouldBlockMiniAppAttach(MINIAPP_PARTITION, 'https://evil.example')).toBe(true);
    expect(shouldBlockMiniAppAttach(MINIAPP_PARTITION, 'file:///etc/passwd')).toBe(true);
  });

  it('miniapps partition + src 없음/빈 값 → 차단(true)', () => {
    expect(shouldBlockMiniAppAttach(MINIAPP_PARTITION, undefined)).toBe(true);
    expect(shouldBlockMiniAppAttach(MINIAPP_PARTITION, '')).toBe(true);
  });

  it('miniapps partition + miniapp:// src → 허용(false)', () => {
    expect(shouldBlockMiniAppAttach(MINIAPP_PARTITION, 'miniapp://app1/index.html')).toBe(false);
  });

  it('기존 외부 쌤도구(persist:tools + https) → 미차단(false) — 회귀 고정', () => {
    expect(shouldBlockMiniAppAttach('persist:tools', 'https://soopsori.example')).toBe(false);
    expect(shouldBlockMiniAppAttach('persist:tools', 'https://pblsketch.example')).toBe(false);
  });

  it('partition 미지정 → 미차단(false)', () => {
    expect(shouldBlockMiniAppAttach(undefined, 'https://any.example')).toBe(false);
  });
});

describe('shouldBlockMiniAppNavigation', () => {
  it('miniapp:// 내부 이동은 허용(false)', () => {
    expect(shouldBlockMiniAppNavigation('miniapp://app1/index.html')).toBe(false);
    expect(shouldBlockMiniAppNavigation('miniapp://app1/sub/page.html')).toBe(false);
  });

  it('외부/기타 스킴 이동은 차단(true)', () => {
    expect(shouldBlockMiniAppNavigation('https://evil.example')).toBe(true);
    expect(shouldBlockMiniAppNavigation('http://plain.example')).toBe(true);
    expect(shouldBlockMiniAppNavigation('file:///etc/passwd')).toBe(true);
    expect(shouldBlockMiniAppNavigation('about:blank')).toBe(true);
  });
});

describe('installMiniAppContentNavGuard', () => {
  function makeFakeContents() {
    let navHandler: ((e: { preventDefault: () => void }, url: string) => void) | null = null;
    let openHandler: ((d: { url: string }) => { action: string }) | null = null;
    const contents = {
      on: (event: string, handler: unknown) => {
        if (event === 'will-navigate') {
          navHandler = handler as typeof navHandler;
        }
      },
      setWindowOpenHandler: (handler: unknown) => {
        openHandler = handler as typeof openHandler;
      },
    };
    return {
      contents: contents as unknown as WebContents,
      getNav: () => navHandler,
      getOpen: () => openHandler,
    };
  }

  it('외부 https 이동은 preventDefault + openExternal 위임', () => {
    const openExternal = vi.fn();
    const fake = makeFakeContents();
    installMiniAppContentNavGuard(fake.contents, openExternal);

    const preventDefault = vi.fn();
    fake.getNav()!({ preventDefault }, 'https://evil.example');
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(openExternal).toHaveBeenCalledWith('https://evil.example');
  });

  it('miniapp:// 내부 이동은 막지 않음(preventDefault·openExternal 미호출)', () => {
    const openExternal = vi.fn();
    const fake = makeFakeContents();
    installMiniAppContentNavGuard(fake.contents, openExternal);

    const preventDefault = vi.fn();
    fake.getNav()!({ preventDefault }, 'miniapp://app1/index.html');
    expect(preventDefault).not.toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('file:// 이동은 차단하되 openExternal 위임은 안 함(http(s)만 위임)', () => {
    const openExternal = vi.fn();
    const fake = makeFakeContents();
    installMiniAppContentNavGuard(fake.contents, openExternal);

    const preventDefault = vi.fn();
    fake.getNav()!({ preventDefault }, 'file:///etc/passwd');
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('window.open은 항상 deny, https는 openExternal로 위임', () => {
    const openExternal = vi.fn();
    const fake = makeFakeContents();
    installMiniAppContentNavGuard(fake.contents, openExternal);

    const result = fake.getOpen()!({ url: 'https://ext.example' });
    expect(result).toEqual({ action: 'deny' });
    expect(openExternal).toHaveBeenCalledWith('https://ext.example');
  });
});
