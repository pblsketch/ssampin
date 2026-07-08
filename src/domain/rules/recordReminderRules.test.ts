import { describe, it, expect } from 'vitest';
import {
  daysSinceLastRecord,
  rankStalestStudents,
  applyRotation,
  pickDueStudents,
  isWithinDoNotDisturb,
  resolvePromptText,
  maskName,
  studentDedupKey,
  buildForwardSchedule,
  formatDateStr,
} from './recordReminderRules';
import { DEFAULT_REMINDER_SETTINGS } from '../entities/RecordReminder';
import type { ReminderSettings, ReminderStudent } from '../entities/RecordReminder';

/** 마지막 기록일 맵으로 provider 생성. */
function providerOf(map: Record<string, string | null>) {
  return (studentId: string): string | null => map[studentId] ?? null;
}

const cfg = (patch: Partial<ReminderSettings> = {}): ReminderSettings => ({
  ...DEFAULT_REMINDER_SETTINGS,
  ...patch,
});

const students: ReminderStudent[] = [
  { id: 'a', name: '김서연' },
  { id: 'b', name: '이준호' },
  { id: 'c', name: '박민지' },
];

describe('daysSinceLastRecord', () => {
  const now = new Date(2026, 6, 8, 10, 0); // 2026-07-08

  it('기록이 전무하면 Infinity', () => {
    expect(daysSinceLastRecord(providerOf({}), 'a', now)).toBe(Number.POSITIVE_INFINITY);
  });

  it('오늘 기록이면 0', () => {
    expect(daysSinceLastRecord(providerOf({ a: '2026-07-08' }), 'a', now)).toBe(0);
  });

  it('N일 전 기록이면 N', () => {
    expect(daysSinceLastRecord(providerOf({ a: '2026-07-01' }), 'a', now)).toBe(7);
  });

  it('잘못된 날짜 문자열은 Infinity로 안전 처리', () => {
    expect(daysSinceLastRecord(providerOf({ a: 'bad-date' }), 'a', now)).toBe(
      Number.POSITIVE_INFINITY,
    );
  });
});

describe('rankStalestStudents', () => {
  const now = new Date(2026, 6, 8, 10, 0);

  it('오래 안 본 학생이 먼저 온다', () => {
    const provider = providerOf({ a: '2026-07-07', b: '2026-06-01', c: '2026-07-08' });
    const ranked = rankStalestStudents(students, provider, cfg(), now);
    expect(ranked.map((r) => r.student.id)).toEqual(['b', 'a', 'c']);
  });

  it('제외 학생은 결과에서 빠진다', () => {
    const provider = providerOf({ a: '2026-06-01', b: '2026-06-01', c: '2026-06-01' });
    const ranked = rankStalestStudents(students, provider, cfg({ excludedStudentIds: ['b'] }), now);
    expect(ranked.map((r) => r.student.id)).not.toContain('b');
  });

  it('경과 일수가 같으면 관심 학생 → 이름 순', () => {
    const provider = providerOf({ a: '2026-07-01', b: '2026-07-01', c: '2026-07-01' });
    const ranked = rankStalestStudents(students, provider, cfg({ focusedStudentIds: ['c'] }), now);
    // c(관심) 먼저, 나머지는 이름 순(김서연 < 이준호)
    expect(ranked.map((r) => r.student.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('applyRotation', () => {
  it('cursor 위치부터 순회', () => {
    expect(applyRotation([1, 2, 3, 4], 2)).toEqual([3, 4, 1, 2]);
  });
  it('빈 배열은 빈 배열', () => {
    expect(applyRotation([], 3)).toEqual([]);
  });
  it('음수·초과 cursor는 modulo 보정', () => {
    expect(applyRotation([1, 2, 3], -1)).toEqual([3, 1, 2]);
    expect(applyRotation([1, 2, 3], 7)).toEqual([2, 3, 1]);
  });
});

describe('pickDueStudents', () => {
  const now = new Date(2026, 6, 8, 10, 0);

  it('공백 임계를 넘긴 학생만, perNudge 만큼', () => {
    const provider = providerOf({ a: '2026-06-01', b: '2026-06-10', c: '2026-07-08' });
    // staleDays=14 기준: a(37일)·b(28일) due, c(0일) 미달
    const due = pickDueStudents(students, provider, cfg({ perNudge: 1 }), 0, now);
    expect(due).toHaveLength(1);
    expect(due[0]!.student.id).toBe('a');
  });

  it('관심 학생은 임계 절반으로 더 빨리 잡힌다', () => {
    const provider = providerOf({ a: '2026-07-08', b: '2026-07-08', c: '2026-06-30' });
    // staleDays=14, c는 8일 경과 → 일반이면 미달이지만 관심이면 임계 7일 → due
    const due = pickDueStudents(
      students,
      provider,
      cfg({ perNudge: 3, focusedStudentIds: ['c'] }),
      0,
      now,
    );
    expect(due.map((r) => r.student.id)).toEqual(['c']);
  });
});

describe('isWithinDoNotDisturb', () => {
  it('같은 날 구간', () => {
    const at = (h: number, m: number) => new Date(2026, 6, 8, h, m);
    expect(isWithinDoNotDisturb(at(13, 0), '12:00', '14:00')).toBe(true);
    expect(isWithinDoNotDisturb(at(11, 0), '12:00', '14:00')).toBe(false);
  });

  it('자정 넘김 구간 (22:00~07:00)', () => {
    const at = (h: number, m: number) => new Date(2026, 6, 8, h, m);
    expect(isWithinDoNotDisturb(at(23, 0), '22:00', '07:00')).toBe(true);
    expect(isWithinDoNotDisturb(at(3, 0), '22:00', '07:00')).toBe(true);
    expect(isWithinDoNotDisturb(at(12, 0), '22:00', '07:00')).toBe(false);
  });

  it('null 이면 항상 false', () => {
    expect(isWithinDoNotDisturb(new Date(), null, '07:00')).toBe(false);
    expect(isWithinDoNotDisturb(new Date(), '22:00', null)).toBe(false);
  });
});

describe('resolvePromptText & maskName', () => {
  it('문구를 순환하며 {name} 치환', () => {
    expect(resolvePromptText(0, '김서연')).toContain('김서연');
    expect(resolvePromptText(0, '김서연')).not.toContain('{name}');
  });

  it('maskName full/initial/none', () => {
    expect(maskName('김서연', 'full')).toBe('김서연');
    expect(maskName('김서연', 'initial')).toBe('김○○');
    expect(maskName('김서연', 'none')).toBe('');
  });

  it('studentDedupKey 형식', () => {
    expect(studentDedupKey('a', '2026-07-08')).toBe('a:2026-07-08');
  });
});

describe('buildForwardSchedule', () => {
  const idFactory = (sid: string, date: string) => `${sid}@${date}`;
  const now = new Date(2026, 6, 8, 10, 0); // 2026-07-08 10:00

  it('공백 학생은 오늘 예정 시각에 예약, 최근 기록 학생은 제외', () => {
    const provider = providerOf({ a: '2026-06-01', b: '2026-07-08' });
    const items = buildForwardSchedule(
      [
        { id: 'a', name: '김서연' },
        { id: 'b', name: '이준호' },
      ],
      provider,
      cfg({ weekdays: [], perNudge: 2, horizonDays: 7 }),
      new Set(),
      0,
      now,
      idFactory,
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.body).toContain('김서연');
    // 오늘 16:00 예약
    expect(items[0]!.fireAt).toBe(new Date(2026, 6, 8, 16, 0).getTime());
    expect(items[0]!.studentDedupKey).toBe('a:2026-07-08');
  });

  it('[AC3-f] 자정 넘겨 임계에 도달할 학생을 미래 시각으로 미리 예약', () => {
    // c: 마지막 06-25, staleDays=14 → due 07-09(내일). 오늘 렌더러가 계산해도 내일 16:00로 예약돼야.
    const provider = providerOf({ c: '2026-06-25' });
    const items = buildForwardSchedule(
      [{ id: 'c', name: '박민지' }],
      provider,
      cfg({ weekdays: [], horizonDays: 7 }),
      new Set(),
      0,
      now,
      idFactory,
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.fireAt).toBe(new Date(2026, 6, 9, 16, 0).getTime());
  });

  it('오늘 발화 시각이 이미 지났으면 다음 유효일로', () => {
    const provider = providerOf({ a: '2026-06-01' });
    const lateNow = new Date(2026, 6, 8, 17, 0); // 16:00 지남
    const items = buildForwardSchedule(
      [{ id: 'a', name: '김서연' }],
      provider,
      cfg({ weekdays: [], horizonDays: 7 }),
      new Set(),
      0,
      lateNow,
      idFactory,
    );
    expect(items[0]!.fireAt).toBe(new Date(2026, 6, 9, 16, 0).getTime());
  });

  it('이미 발화한 dedup 키(firedKeys)는 건너뛴다', () => {
    const provider = providerOf({ a: '2026-06-01' });
    const items = buildForwardSchedule(
      [{ id: 'a', name: '김서연' }],
      provider,
      cfg({ weekdays: [], horizonDays: 7 }),
      new Set([studentDedupKey('a', formatDateStr(now))]),
      0,
      now,
      idFactory,
    );
    // 오늘은 스킵 → 다음 날로
    expect(items[0]!.fireAt).toBe(new Date(2026, 6, 9, 16, 0).getTime());
  });

  it('하루 발화 상한(dailyFireCap)을 넘지 않는다', () => {
    const many: ReminderStudent[] = [
      { id: 'a', name: '김' },
      { id: 'b', name: '이' },
      { id: 'c', name: '박' },
    ];
    const provider = providerOf({ a: '2026-06-01', b: '2026-06-01', c: '2026-06-01' });
    const items = buildForwardSchedule(
      many,
      provider,
      cfg({ weekdays: [], perNudge: 3, dailyFireCap: 2, horizonDays: 0 }),
      new Set(),
      0,
      now,
      idFactory,
    );
    // horizon 0 → 오늘만, cap 2 → 최대 2건
    expect(items.length).toBeLessThanOrEqual(2);
  });

  it('알림 시각이 방해금지 구간이면 그 날은 예약하지 않는다', () => {
    const provider = providerOf({ a: '2026-06-01' });
    const items = buildForwardSchedule(
      [{ id: 'a', name: '김서연' }],
      provider,
      cfg({
        weekdays: [],
        time: '23:00',
        doNotDisturbStart: '22:00',
        doNotDisturbEnd: '07:00',
        horizonDays: 0,
      }),
      new Set(),
      0,
      now,
      idFactory,
    );
    expect(items).toHaveLength(0);
  });

  it('nameExposure=none 이면 본문에 이름이 없다', () => {
    const provider = providerOf({ a: '2026-06-01' });
    const items = buildForwardSchedule(
      [{ id: 'a', name: '김서연' }],
      provider,
      cfg({ weekdays: [], nameExposure: 'none', horizonDays: 0 }),
      new Set(),
      0,
      now,
      idFactory,
    );
    expect(items[0]!.body).not.toContain('김서연');
    expect(items[0]!.body).toBe('기록할 학생이 있어요');
  });
});
