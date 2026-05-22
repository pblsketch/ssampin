/**
 * useDesktopWidgetContextStore 단위 테스트 — G009-electron-readonly-shim.
 *
 * 기본값 false 확인 + setIsDesktopWidget true/false 전환 확인.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useDesktopWidgetContextStore } from './useDesktopWidgetContextStore';

describe('useDesktopWidgetContextStore', () => {
  beforeEach(() => {
    // 각 테스트 전 초기 상태로 리셋
    useDesktopWidgetContextStore.setState({ isDesktopWidget: false });
  });

  it('기본값은 false', () => {
    expect(useDesktopWidgetContextStore.getState().isDesktopWidget).toBe(false);
  });

  it('setIsDesktopWidget(true) → isDesktopWidget이 true로 변경', () => {
    useDesktopWidgetContextStore.getState().setIsDesktopWidget(true);
    expect(useDesktopWidgetContextStore.getState().isDesktopWidget).toBe(true);
  });

  it('setIsDesktopWidget(false) → isDesktopWidget이 false로 복원', () => {
    useDesktopWidgetContextStore.getState().setIsDesktopWidget(true);
    useDesktopWidgetContextStore.getState().setIsDesktopWidget(false);
    expect(useDesktopWidgetContextStore.getState().isDesktopWidget).toBe(false);
  });
});
