import { describe, it, expect } from 'vitest';
import { DEFAULT_REMINDER_SETTINGS, type ReminderStudent } from '../entities/RecordReminder';
import type { TeachingClass } from '../entities/TeachingClass';
import type { PeriodTime } from '../valueObjects/PeriodTime';
import { scopedReminderConfig } from './observationFocus';
import { EMPTY_SCHOOL_CALENDAR } from './schoolCalendarDays';
import {
  advanceTodayStudents,
  emptyTodayStudents,
  endedLessonsToday,
  isTodayStudentsVisible,
  mergeTodayStudents,
  parseTodayStudents,
  pickStaleRefs,
  refsRecordedToday,
  todayStudentCaps,
  type PickPool,
} from './todayStudents';

const TODAY = '2026-09-23'; // 수요일
const NOW = new Date(2026, 8, 23, 15, 0);

function pool(
  lastDates: Record<string, string | null>,
  opts: { staleDays?: number; focused?: string[]; names?: Record<string, string> } = {},
): PickPool {
  const roster: ReminderStudent[] = Object.keys(lastDates).map((id) => ({
    id,
    name: opts.names?.[id] ?? id,
  }));
  return {
    roster,
    provider: (id) => lastDates[id] ?? null,
    config: {
      excludedStudentIds: [],
      focusedStudentIds: opts.focused ?? [],
      staleDays: opts.staleDays ?? 14,
    },
  };
}

describe('하루 인원은 알림 강도를 따른다', () => {
  it('가볍게 1·2 / 보통 2·3 / 꼼꼼히 3·5', () => {
    expect(todayStudentCaps({ preset: 'light', perNudge: 1 })).toEqual({ homeroom: 1, subject: 2 });
    expect(todayStudentCaps({ preset: 'normal', perNudge: 1 })).toEqual({
      homeroom: 2,
      subject: 3,
    });
    expect(todayStudentCaps({ preset: 'thorough', perNudge: 2 })).toEqual({
      homeroom: 3,
      subject: 5,
    });
  });

  it('직접 설정은 한 번에 물어볼 학생 수와 그 두 배(최대 6)', () => {
    expect(todayStudentCaps({ preset: 'custom', perNudge: 1 })).toEqual({
      homeroom: 1,
      subject: 2,
    });
    expect(todayStudentCaps({ preset: 'custom', perNudge: 3 })).toEqual({
      homeroom: 3,
      subject: 6,
    });
    expect(todayStudentCaps({ preset: 'custom', perNudge: 9 })).toEqual({
      homeroom: 3,
      subject: 6,
    });
  });
});

describe('보이는 조건', () => {
  const base = {
    cheerEnabled: true,
    reminder: { enabled: true, weekdays: [] as number[] },
    weekday: 3,
    schoolDay: true,
    reminderPaused: false,
    resting: false,
  };
  it('모두 만족하면 보인다', () => expect(isTodayStudentsVisible(base)).toBe(true));
  it('응원·잔디가 꺼져 있으면 없다', () =>
    expect(isTodayStudentsVisible({ ...base, cheerEnabled: false })).toBe(false));
  it('기록 알림이 꺼져 있으면 없다', () =>
    expect(isTodayStudentsVisible({ ...base, reminder: { enabled: false, weekdays: [] } })).toBe(
      false,
    ));
  it('알림 요일이 아니면 없다(요일을 안 골랐으면 매일)', () => {
    expect(isTodayStudentsVisible({ ...base, reminder: { enabled: true, weekdays: [2, 4] } })).toBe(
      false,
    );
    expect(isTodayStudentsVisible({ ...base, reminder: { enabled: true, weekdays: [3] } })).toBe(
      true,
    );
  });
  it('등교일이 아니거나 일시정지·쉬는 날이면 없다', () => {
    expect(isTodayStudentsVisible({ ...base, schoolDay: false })).toBe(false);
    expect(isTodayStudentsVisible({ ...base, reminderPaused: true })).toBe(false);
    expect(isTodayStudentsVisible({ ...base, resting: true })).toBe(false);
  });
});

describe('고르는 기준은 기록 알림과 같다', () => {
  it('문턱 이상만, 오래된 순 → 관심 먼저 → 이름순', () => {
    const p = pool(
      { a: '2026-09-01', b: '2026-09-01', c: null, d: '2026-09-20' },
      { focused: ['b'], names: { a: '가', b: '나', c: '다', d: '라' } },
    );
    expect(pickStaleRefs(p, 5, NOW, EMPTY_SCHOOL_CALENDAR)).toEqual(['c', 'b', 'a']);
  });

  it('관심 학생은 절반 문턱에서 뽑힌다', () => {
    const p = pool({ a: '2026-09-15', b: '2026-09-15' }, { focused: ['a'] });
    expect(pickStaleRefs(p, 5, NOW, EMPTY_SCHOOL_CALENDAR)).toEqual(['a']);
  });

  it('빼기가 이긴다 — 옛 빼기 목록에 있으면 관심 학생이어도 뽑지 않는다', () => {
    const rr = {
      ...DEFAULT_REMINDER_SETTINGS,
      staleDays: 14,
      focusedStudentIds: ['a'],
      excludedStudentIds: ['a'],
    };
    const p: PickPool = {
      roster: [
        { id: 'a', name: '가' },
        { id: 'b', name: '나' },
      ],
      provider: () => null,
      config: scopedReminderConfig(rr, { kind: 'homeroom' }),
    };
    expect(pickStaleRefs(p, 5, NOW, EMPTY_SCHOOL_CALENDAR)).toEqual(['b']);
  });

  it('수업반 관심은 반 범위 key 를 좁힌 설정으로 적용된다', () => {
    const rr = { ...DEFAULT_REMINDER_SETTINGS, staleDays: 14, focusedStudentIds: ['subject:c1:5'] };
    const p: PickPool = {
      roster: [
        { id: '5', name: '가' },
        { id: '6', name: '나' },
      ],
      provider: () => '2026-09-15',
      config: scopedReminderConfig(rr, { kind: 'subject', classId: 'c1' }),
    };
    expect(pickStaleRefs(p, 5, NOW, EMPTY_SCHOOL_CALENDAR)).toEqual(['5']);
  });
});

function cls(id: string, name: string): TeachingClass {
  return {
    id,
    name,
    subject: '국어',
    students: [],
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z',
  };
}

const PERIODS: PeriodTime[] = [
  { period: 1, start: '09:00', end: '09:50' },
  { period: 2, start: '10:00', end: '10:50' },
  { period: 3, start: '11:00', end: '11:50' },
  { period: 4, start: '12:00', end: '12:50' },
];

describe('끝난 수업', () => {
  it('끝 시각을 안 적은 교시는 끝났다고 보지 않는다', () => {
    const classes = [cls('c1', '2-1')];
    const slots = [{ subject: '국어', classroom: '2-1' }];
    const periods = [{ period: 1, start: '', end: '' }];
    expect(endedLessonsToday(slots, classes, periods, new Date(2026, 8, 23, 8, 0))).toEqual([]);
  });

  it('끝난 수업만, 끝난 순서, 같은 반은 한 번, 보관한 반은 뺀다', () => {
    const classes = [cls('c1', '2-1'), cls('c2', '2-2'), { ...cls('c3', '2-3'), archived: true }];
    const slots = [
      { subject: '국어', classroom: '2-2' },
      { subject: '국어', classroom: '2-1' },
      { subject: '국어', classroom: '2-2' },
      { subject: '국어', classroom: '2-3' },
    ];
    expect(endedLessonsToday(slots, classes, PERIODS, new Date(2026, 8, 23, 9, 49))).toEqual([]);
    expect(endedLessonsToday(slots, classes, PERIODS, new Date(2026, 8, 23, 11, 55))).toEqual([
      { classId: 'c2', endMinutes: 590 },
      { classId: 'c1', endMinutes: 650 },
    ]);
    expect(
      endedLessonsToday(slots, classes, PERIODS, new Date(2026, 8, 23, 13, 0)).map(
        (l) => l.classId,
      ),
    ).toEqual(['c2', 'c1']);
  });
});

describe('하루 명단', () => {
  const caps = { homeroom: 2, subject: 3 };
  const input = {
    today: TODAY,
    now: NOW,
    cal: EMPTY_SCHOOL_CALENDAR,
    caps,
    homeroom: pool({ a: null, b: null, c: null }),
    endedClasses: [] as { classId: string; pool: PickPool }[],
  };

  it('담임은 처음 한 번 고르고 그날 바뀌지 않는다', () => {
    const first = advanceTodayStudents(null, input);
    expect(first.homeroom).toEqual(['a', 'b']);
    const again = advanceTodayStudents(first, {
      ...input,
      homeroom: pool({ x: null, y: null }),
    });
    expect(again).toBe(first);
  });

  it('고른 학생이 없어도 고른 것으로 친다 — 나중에 새로 채우지 않는다', () => {
    const first = advanceTodayStudents(null, { ...input, homeroom: pool({ a: TODAY }) });
    expect(first.homeroomPicked).toBe(true);
    expect(first.homeroom).toEqual([]);
    expect(advanceTodayStudents(first, input)).toBe(first);
  });

  it('날짜가 바뀌면 새로 고른다', () => {
    const first = advanceTodayStudents(null, input);
    const next = advanceTodayStudents(first, { ...input, today: '2026-09-24' });
    expect(next.date).toBe('2026-09-24');
    expect(next.homeroom).toEqual(['a', 'b']);
  });

  it('담임이 알림 대상이 아니면 고르지 않는다', () => {
    const s = advanceTodayStudents(null, { ...input, homeroom: null });
    expect(s.homeroomPicked).toBe(false);
  });

  it('수업반은 반마다 최대 1명, 끝난 순서대로, 합계에서 멈춘다', () => {
    const ended = ['c1', 'c2', 'c3', 'c4'].map((classId) => ({
      classId,
      pool: pool({ [`${classId}-a`]: null, [`${classId}-b`]: null }),
    }));
    const s = advanceTodayStudents(null, { ...input, homeroom: null, endedClasses: ended });
    expect(s.subject).toEqual([
      { classId: 'c1', ref: 'c1-a' },
      { classId: 'c2', ref: 'c2-a' },
      { classId: 'c3', ref: 'c3-a' },
    ]);
    expect(s.judgedClassIds).toEqual(['c1', 'c2', 'c3', 'c4']);
  });

  it('한 번 판단한 반은 다시 고르지 않는다(대상이 없었어도)', () => {
    const noneDue = [{ classId: 'c1', pool: pool({ x: TODAY }) }];
    const first = advanceTodayStudents(null, { ...input, homeroom: null, endedClasses: noneDue });
    expect(first.subject).toEqual([]);
    const later = advanceTodayStudents(first, {
      ...input,
      homeroom: null,
      endedClasses: [{ classId: 'c1', pool: pool({ y: null }) }],
    });
    expect(later).toBe(first);
  });

  it('두 창의 명단을 합칠 때 고른 것을 지우지 않는다', () => {
    const a = { ...emptyTodayStudents(TODAY), homeroomPicked: true, homeroom: ['h1'] };
    const b = {
      ...emptyTodayStudents(TODAY),
      subject: [{ classId: 'c1', ref: 'r' }],
      judgedClassIds: ['c1'],
    };
    const m = mergeTodayStudents(a, b);
    expect(m.homeroom).toEqual(['h1']);
    expect(m.subject).toEqual([{ classId: 'c1', ref: 'r' }]);
    expect(mergeTodayStudents({ ...a, date: '2026-09-22' }, b)).toBe(b);
  });

  it('깨진 저장값은 버린다', () => {
    expect(parseTodayStudents(null)).toBeNull();
    expect(parseTodayStudents({ date: 3 })).toBeNull();
    expect(
      parseTodayStudents({ date: TODAY, homeroom: ['a', 1], subject: [{ classId: 'c', ref: 2 }] }),
    ).toEqual({ ...emptyTodayStudents(TODAY), homeroom: ['a'] });
  });
});

describe('완료 표시', () => {
  it('기록 날짜가 오늘이거나 오늘 저장된 기록', () => {
    const todayMs = new Date(2026, 8, 23, 10, 0).getTime();
    const refs = refsRecordedToday(
      [
        { ref: 'a', date: TODAY, createdAt: 0 },
        { ref: 'b', date: '2026-09-20', createdAt: todayMs },
        { ref: 'c', date: '2026-09-20', createdAt: new Date(2026, 8, 20).getTime() },
      ],
      TODAY,
    );
    expect([...refs].sort()).toEqual(['a', 'b']);
  });
});
