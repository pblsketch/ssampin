import { describe, it, expect, beforeEach } from 'vitest';
import { createDesktopWidgetManager } from './desktopWidgetManager';

/**
 * Phase 2: no-op DesktopWidgetManager 검증.
 *
 * 이 테스트는 win32 기반 native 구현을 검증하지 않고, 모든 환경에서 안전하게
 * 동작하는 facade 동작만 확인한다 (vitest는 보통 비Win32 CI에서도 실행됨).
 *
 * BrowserWindow는 실제 Electron runtime에서만 존재하므로 캐스팅으로 더미를 만든다.
 */

// any 금지 컨벤션 준수 — 최소 단위로 부분 캐스팅
const fakeWindow = {} as unknown as Parameters<ReturnType<typeof createDesktopWidgetManager>['enable']>[0];

describe('createDesktopWidgetManager (no-op)', () => {
  let manager: ReturnType<typeof createDesktopWidgetManager>;

  beforeEach(() => {
    manager = createDesktopWidgetManager();
  });

  describe('enable()', () => {
    it('항상 ok:false를 반환한다 (Phase 2 단계)', async () => {
      const result = await manager.enable(fakeWindow);
      expect(result.ok).toBe(false);
    });

    it('fallbackMode를 항상 normal로 반환한다', async () => {
      const result = await manager.enable(fakeWindow);
      if (!result.ok) {
        expect(result.fallbackMode).toBe('normal');
      } else {
        // ok:true는 PR-2 Phase 4+에서만. 현 단계에서는 도달 불가.
        throw new Error('no-op manager가 ok:true를 반환했다 — 의도되지 않은 동작');
      }
    });

    it('reason 문자열을 비워두지 않는다 (진단 로그용)', async () => {
      const result = await manager.enable(fakeWindow);
      if (!result.ok) {
        expect(typeof result.reason).toBe('string');
        expect(result.reason.length).toBeGreaterThan(0);
      }
    });

    it('비Win32 플랫폼에서 platform-not-win32 사유를 반환한다', async () => {
      // 현재 vitest 실행 플랫폼에 따라 분기
      const result = await manager.enable(fakeWindow);
      if (!result.ok) {
        if (process.platform === 'win32') {
          expect(result.reason).toMatch(/not-implemented|native-load-failed/);
        } else {
          expect(result.reason).toBe('platform-not-win32');
        }
      }
    });
  });

  describe('disable()', () => {
    it('비활성 상태에서 호출해도 throw하지 않는다 (idempotent)', () => {
      expect(() => manager.disable()).not.toThrow();
      expect(() => manager.disable()).not.toThrow();
    });
  });

  describe('updateWidgetBounds()', () => {
    it('no-op 호출이 throw하지 않는다', () => {
      expect(() => manager.updateWidgetBounds(fakeWindow)).not.toThrow();
    });
  });

  describe('healthCheck()', () => {
    it('항상 ok:false를 반환한다', async () => {
      const result = await manager.healthCheck(fakeWindow);
      expect(result.ok).toBe(false);
    });
  });

  describe('isEnabled()', () => {
    it('초기값은 false', () => {
      expect(manager.isEnabled()).toBe(false);
    });

    it('enable() 후에도 no-op은 false (실제 attach 없음)', async () => {
      await manager.enable(fakeWindow);
      expect(manager.isEnabled()).toBe(false);
    });

    it('disable() 후에도 false', async () => {
      await manager.enable(fakeWindow);
      manager.disable();
      expect(manager.isEnabled()).toBe(false);
    });
  });

  describe('setHeaderRegions() — Phase 7-C', () => {
    it('빈 배열 호출이 throw하지 않는다', () => {
      expect(() => manager.setHeaderRegions([], fakeWindow)).not.toThrow();
    });

    it('rect 1개 호출이 throw하지 않는다', () => {
      expect(() =>
        manager.setHeaderRegions(
          [{ x: 0, y: 0, width: 100, height: 50 }],
          fakeWindow,
        ),
      ).not.toThrow();
    });

    it('연속 호출이 idempotent', () => {
      expect(() => {
        manager.setHeaderRegions([{ x: 0, y: 0, width: 100, height: 50 }], fakeWindow);
        manager.setHeaderRegions([{ x: 10, y: 10, width: 80, height: 40 }], fakeWindow);
        manager.setHeaderRegions([], fakeWindow);
      }).not.toThrow();
    });

    it('Phase 7-C 회귀 fix: excludeDipRects 인자가 옵셔널이고 throw하지 않는다', () => {
      expect(() =>
        manager.setHeaderRegions(
          [{ x: 0, y: 0, width: 100, height: 50 }],
          fakeWindow,
          [{ x: 80, y: 0, width: 20, height: 50 }],
        ),
      ).not.toThrow();
    });

    it('Phase 7-C 회귀 fix: excludeDipRects 빈 배열 호출이 throw하지 않는다', () => {
      expect(() =>
        manager.setHeaderRegions(
          [{ x: 0, y: 0, width: 100, height: 50 }],
          fakeWindow,
          [],
        ),
      ).not.toThrow();
    });

    it('Phase 7-C 회귀 fix: excludeDipRects 미전달도 backward-compatible', () => {
      // 3rd 인자 생략 — 기존 호출처(excludeRects 모르는 코드)와 호환되어야 함.
      expect(() =>
        manager.setHeaderRegions(
          [{ x: 0, y: 0, width: 100, height: 50 }],
          fakeWindow,
        ),
      ).not.toThrow();
    });
  });

  describe('singleton 안전성', () => {
    it('createDesktopWidgetManager()를 여러 번 호출해도 충돌하지 않는다', () => {
      const m1 = createDesktopWidgetManager();
      const m2 = createDesktopWidgetManager();
      expect(m1).not.toBe(m2); // 별도 인스턴스
      expect(typeof m1.enable).toBe('function');
      expect(typeof m2.enable).toBe('function');
    });
  });
});
