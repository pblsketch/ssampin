/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readStoredConsent } from './usePiiConsentMount';

/**
 * usePiiConsentMount logic test
 *
 * Acceptance: 'first PII entry triggers ConsentModal once; persisted mode prevents re-trigger'
 *
 * 본 테스트는 localStorage flag 동작과 readStoredConsent 헬퍼만 검증.
 * Hook 자체의 useState/useEffect는 React Testing Library 부재로 SSR snapshot 외 검증 X.
 * recordConsent.execute 호출은 단위 모킹 부담이 커 통합 테스트로 위임.
 */

const STORAGE_KEY = 'pii_consent_v1';

beforeEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('readStoredConsent', () => {
  it('returns null when localStorage 키 미설정 (첫 진입)', () => {
    expect(readStoredConsent()).toBeNull();
  });

  it('returns persisted mode when 영속 동의가 저장되어 있음', () => {
    window.localStorage.setItem(STORAGE_KEY, 'persisted');
    expect(readStoredConsent()).toBe('persisted');
  });

  it('returns session-only mode', () => {
    window.localStorage.setItem(STORAGE_KEY, 'session-only');
    expect(readStoredConsent()).toBe('session-only');
  });

  it('returns denied mode', () => {
    window.localStorage.setItem(STORAGE_KEY, 'denied');
    expect(readStoredConsent()).toBe('denied');
  });

  it('returns null for invalid stored value (corrupt flag)', () => {
    window.localStorage.setItem(STORAGE_KEY, 'invalid-mode');
    expect(readStoredConsent()).toBeNull();
  });

  it('returns null when window is undefined (SSR fallback)', () => {
    vi.stubGlobal('window', undefined);
    expect(readStoredConsent()).toBeNull();
  });

  it('returns null when localStorage throws (private/restricted)', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('SecurityError');
        },
      },
    });
    expect(readStoredConsent()).toBeNull();
  });
});
