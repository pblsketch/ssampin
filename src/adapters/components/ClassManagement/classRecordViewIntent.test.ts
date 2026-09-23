// @vitest-environment jsdom
/**
 * ADR-137 — 수업 기록 보기 전환 요청: 한 번만 받고, 오래된 요청은 버린다.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { consumePendingClassRecordView, requestClassRecordView } from './classRecordViewIntent';

afterEach(() => {
  vi.useRealTimers();
  consumePendingClassRecordView();
});

describe('수업 기록 보기 전환 요청', () => {
  it('한 번만 받는다', () => {
    requestClassRecordView('draft');
    expect(consumePendingClassRecordView()).toBe('draft');
    expect(consumePendingClassRecordView()).toBeNull();
  });

  it('탭이 끝내 열리지 않아 오래 남은 요청은 나중에 받지 않는다', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 23, 10, 0, 0));
    requestClassRecordView('draft');
    vi.setSystemTime(new Date(2026, 8, 23, 10, 5, 0));
    expect(consumePendingClassRecordView()).toBeNull();
  });
});
