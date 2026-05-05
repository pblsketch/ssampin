import { describe, it, expect } from 'vitest';
import { normalizeDesktopMode } from './Settings';

describe('normalizeDesktopMode', () => {
  describe('정식 값 보존', () => {
    it("'normal'을 그대로 반환한다", () => {
      expect(normalizeDesktopMode('normal')).toBe('normal');
    });

    it("'topmost'를 그대로 반환한다", () => {
      expect(normalizeDesktopMode('topmost')).toBe('topmost');
    });

    it("'native-desktop'을 그대로 반환한다 (platformIsWin32 미지정)", () => {
      expect(normalizeDesktopMode('native-desktop')).toBe('native-desktop');
    });

    it("Win32에서 'native-desktop'을 보존한다", () => {
      expect(normalizeDesktopMode('native-desktop', true)).toBe('native-desktop');
    });
  });

  describe('알 수 없는 값 fallback', () => {
    it('undefined → normal', () => {
      expect(normalizeDesktopMode(undefined)).toBe('normal');
    });

    it('null → normal', () => {
      expect(normalizeDesktopMode(null)).toBe('normal');
    });

    it('빈 문자열 → normal', () => {
      expect(normalizeDesktopMode('')).toBe('normal');
    });

    it("legacy 'floating' alias → normal (호출자가 사전 매핑하지 않은 경우)", () => {
      expect(normalizeDesktopMode('floating')).toBe('normal');
    });

    it("legacy 'auto' → normal", () => {
      expect(normalizeDesktopMode('auto')).toBe('normal');
    });

    it("legacy 'desktop' → normal", () => {
      expect(normalizeDesktopMode('desktop')).toBe('normal');
    });

    it("legacy 'behind' → normal", () => {
      expect(normalizeDesktopMode('behind')).toBe('normal');
    });

    it('숫자/객체 등 타입 위반 → normal', () => {
      expect(normalizeDesktopMode(0)).toBe('normal');
      expect(normalizeDesktopMode(123)).toBe('normal');
      expect(normalizeDesktopMode({})).toBe('normal');
      expect(normalizeDesktopMode([])).toBe('normal');
    });
  });

  describe('platformIsWin32=false 강제 다운그레이드', () => {
    it("비Win32에서 'native-desktop'은 'normal'로 강제 변환된다", () => {
      expect(normalizeDesktopMode('native-desktop', false)).toBe('normal');
    });

    it("비Win32에서도 'topmost'는 보존된다 (alwaysOnTop은 모든 OS 지원)", () => {
      expect(normalizeDesktopMode('topmost', false)).toBe('topmost');
    });

    it("비Win32에서 unknown 값은 여전히 'normal'", () => {
      expect(normalizeDesktopMode('unknown', false)).toBe('normal');
    });
  });
});
