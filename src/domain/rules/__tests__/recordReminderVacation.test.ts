import { describe, it, expect } from 'vitest';
import { DEFAULT_REMINDER_SETTINGS, type ReminderSettings } from '../../entities/RecordReminder';
import { buildForwardSchedule, daysSinceLastRecord, pickDueStudents } from '../recordReminderRules';
import { buildSchoolCalendarDays, EMPTY_SCHOOL_CALENDAR } from '../schoolCalendarDays';
import { nextTerm, termEndDate } from '../schoolTermStart';

/**
 * ADR-135 — 기록 알림의 공백 날수에서 방학 날을 뺀다. 학사일정이 없으면 예전 그대로다.
 */
const SUMMER = buildSchoolCalendarDays([
  { title: '여름방학', date: '2026-07-24', endDate: '2026-08-17', group: 'vacation' },
]);

const config: ReminderSettings = {
  ...DEFAULT_REMINDER_SETTINGS,
  enabled: true,
  staleDays: 14,
  perNudge: 3,
  weekdays: [],
  time: '16:00',
};

describe('공백 날수 — 방학 날 빼기', () => {
  const provider = (id: string) => (id === 's1' ? '2026-07-20' : null);
  const firstDay = new Date(2026, 7, 18, 9, 0); // 8/18 개학 첫날

  it('학사일정이 없으면 달력 날짜 그대로(예전 동작)', () => {
    expect(daysSinceLastRecord(provider, 's1', firstDay)).toBe(29);
    expect(daysSinceLastRecord(provider, 's1', firstDay, EMPTY_SCHOOL_CALENDAR)).toBe(29);
  });

  it('방학 날을 빼면 개학 첫날 공백이 짧다 — 한꺼번에 불리지 않는다', () => {
    expect(daysSinceLastRecord(provider, 's1', firstDay, SUMMER)).toBe(4);
    const due = pickDueStudents([{ id: 's1', name: '가' }], provider, config, 0, firstDay, SUMMER);
    expect(due).toHaveLength(0);
    const dueNoCal = pickDueStudents([{ id: 's1', name: '가' }], provider, config, 0, firstDay);
    expect(dueNoCal).toHaveLength(1);
  });

  it('기록 전무 학생은 늘 공백이다', () => {
    expect(daysSinceLastRecord(provider, 'none', firstDay, SUMMER)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('알림 예약 날짜 — 방학 날을 건너뛴다', () => {
  it('마지막 기록 + 공백 날수를 방학 날 빼고 계산한다', () => {
    const now = new Date(2026, 6, 22, 9, 0); // 7/22
    const provider = () => '2026-07-21';
    const items = buildForwardSchedule(
      [{ id: 's1', name: '가' }],
      provider,
      { ...config, horizonDays: 60, dailyFireCap: 3 },
      new Set(),
      0,
      now,
      (id, d) => `${id}:${d}`,
      SUMMER,
    );
    // 7/22·7/23 (2일) + 방학 건너뜀 + 8/18부터 12일 → 8/29
    expect(items[0]?.studentDedupKey).toBe('s1:2026-08-29');
  });

  it('학사일정이 없으면 예전처럼 달력 날짜로 예약한다', () => {
    const now = new Date(2026, 6, 22, 9, 0);
    const items = buildForwardSchedule(
      [{ id: 's1', name: '가' }],
      () => '2026-07-21',
      { ...config, horizonDays: 60 },
      new Set(),
      0,
      now,
      (id, d) => `${id}:${d}`,
    );
    expect(items[0]?.studentDedupKey).toBe('s1:2026-08-04');
  });
});

describe('다음 학기·학기 마지막 날', () => {
  it('다음 학기 라벨', () => {
    expect(nextTerm('2026-1')).toBe('2026-2');
    expect(nextTerm('2026-2')).toBe('2027-1');
    expect(nextTerm('엉망')).toBeNull();
  });

  it('학기 마지막 날 = 다음 학기 시작일의 전날(등록한 개학일 우선)', () => {
    expect(termEndDate('2026-2', undefined)).toBe('2027-02-28');
    expect(termEndDate('2026-1', undefined)).toBe('2026-07-31');
    expect(termEndDate('2026-1', { '2026-2': '2026-08-18' })).toBe('2026-08-17');
  });
});
