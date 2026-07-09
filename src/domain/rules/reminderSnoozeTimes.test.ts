import { describe, it, expect } from 'vitest';
import { computeSnoozeUntil } from './reminderSnoozeTimes';

describe('computeSnoozeUntil', () => {
  it('hour1: 1시간 뒤', () => {
    const now = new Date(2026, 6, 8, 10, 0, 0, 0);
    expect(computeSnoozeUntil(now, 'hour1')).toBe(now.getTime() + 60 * 60 * 1000);
  });

  it('afternoon: 오후 3시 전이면 오늘 15:00', () => {
    const now = new Date(2026, 6, 8, 10, 0, 0, 0);
    expect(computeSnoozeUntil(now, 'afternoon')).toBe(new Date(2026, 6, 8, 15, 0, 0, 0).getTime());
  });

  it('afternoon: 오후 3시 이후면 2시간 뒤로 폴백', () => {
    const now = new Date(2026, 6, 8, 16, 0, 0, 0);
    expect(computeSnoozeUntil(now, 'afternoon')).toBe(now.getTime() + 2 * 60 * 60 * 1000);
  });

  it('tomorrow: 내일 08:00 (항상 미래)', () => {
    const now = new Date(2026, 6, 8, 22, 0, 0, 0);
    const until = computeSnoozeUntil(now, 'tomorrow');
    expect(until).toBe(new Date(2026, 6, 9, 8, 0, 0, 0).getTime());
    expect(until).toBeGreaterThan(now.getTime());
  });
});
