import { describe, it, expect, beforeEach } from 'vitest';
import {
  useRecordReminderStore,
  isReminderPaused,
  isReminderSnoozed,
} from './useRecordReminderStore';

describe('isReminderPaused / isReminderSnoozed (순수 gate)', () => {
  const now = 1_000_000;

  it('null 이면 항상 false', () => {
    expect(isReminderPaused(null, now)).toBe(false);
    expect(isReminderSnoozed(null, now)).toBe(false);
  });

  it('미래 만료면 true (아직 정지/스누즈 중)', () => {
    expect(isReminderPaused(now + 1000, now)).toBe(true);
    expect(isReminderSnoozed(now + 1000, now)).toBe(true);
  });

  it('과거 만료면 false (이미 해제)', () => {
    expect(isReminderPaused(now - 1000, now)).toBe(false);
    expect(isReminderSnoozed(now - 1000, now)).toBe(false);
  });
});

describe('useRecordReminderStore actions', () => {
  beforeEach(() => {
    useRecordReminderStore.getState().reset();
  });

  it('skipStudent 는 dedup 키를 추가하고 멱등이다', () => {
    const { skipStudent } = useRecordReminderStore.getState();
    skipStudent('a', '2026-07-08');
    skipStudent('a', '2026-07-08'); // 중복 호출
    skipStudent('b', '2026-07-08');
    expect(useRecordReminderStore.getState().skippedKeys).toEqual(['a:2026-07-08', 'b:2026-07-08']);
  });

  it('advanceCursor 는 커서를 전진시킨다', () => {
    useRecordReminderStore.getState().advanceCursor();
    useRecordReminderStore.getState().advanceCursor(3);
    expect(useRecordReminderStore.getState().rotationCursor).toBe(4);
  });

  it('pauseForWeek 후 clearPause 로 해제', () => {
    useRecordReminderStore.getState().pauseForWeek();
    expect(useRecordReminderStore.getState().pausedUntil).not.toBeNull();
    useRecordReminderStore.getState().clearPause();
    expect(useRecordReminderStore.getState().pausedUntil).toBeNull();
  });

  it('snooze 는 미래 시각을 설정한다', () => {
    const before = Date.now();
    useRecordReminderStore.getState().snooze(2);
    const until = useRecordReminderStore.getState().snoozeUntil;
    expect(until).not.toBeNull();
    expect(until!).toBeGreaterThan(before);
  });
});
