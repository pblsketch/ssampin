import { describe, it, expect } from 'vitest';
import type { TimetableOverride, ClassPeriod, TeacherPeriod } from '@domain/entities/Timetable';
import {
  upsertOverride,
  mergeOverridesIntoTeacherSchedule,
  mergeOverridesIntoClassSchedule,
  filterOverridesInRange,
  dedupeOverridesKeepLatest,
} from './timetableRules';

const NOW = '2026-04-21T10:00:00.000Z';
const mkId = (() => {
  let i = 0;
  return () => `fake-id-${++i}`;
})();

const mkOverride = (partial: Partial<TimetableOverride>): TimetableOverride => ({
  id: partial.id ?? 'ovr-1',
  date: partial.date ?? '2026-04-22',
  period: partial.period ?? 3,
  subject: partial.subject ?? '수학',
  classroom: partial.classroom,
  reason: partial.reason,
  createdAt: partial.createdAt ?? '2026-04-20T09:00:00.000Z',
  updatedAt: partial.updatedAt,
  scope: partial.scope,
  kind: partial.kind,
  pairId: partial.pairId,
  substituteTeacher: partial.substituteTeacher,
});

describe('upsertOverride', () => {
  it('빈 배열에 새 항목 추가', () => {
    const { overrides, replacedId } = upsertOverride(
      [],
      { date: '2026-04-22', period: 3, subject: '수학' },
      NOW,
      () => 'id-new',
    );
    expect(overrides).toHaveLength(1);
    expect(overrides[0]).toMatchObject({
      id: 'id-new',
      date: '2026-04-22',
      period: 3,
      subject: '수학',
      createdAt: NOW,
    });
    expect(overrides[0]!.updatedAt).toBeUndefined();
    expect(replacedId).toBeNull();
  });

  it('같은 date+period 재호출 시 교체, 길이 불변', () => {
    const existing = [mkOverride({ id: 'keep-me', subject: '수학' })];
    const { overrides, replacedId } = upsertOverride(
      existing,
      { date: '2026-04-22', period: 3, subject: '영어' },
      NOW,
      () => 'should-not-use',
    );
    expect(overrides).toHaveLength(1);
    expect(overrides[0]!.id).toBe('keep-me');
    expect(overrides[0]!.subject).toBe('영어');
    expect(replacedId).toBe('keep-me');
  });

  it('교체 시 기존 createdAt 보존, updatedAt 갱신', () => {
    const existing = [mkOverride({ id: 'x', createdAt: '2026-01-01T00:00:00.000Z' })];
    const { overrides } = upsertOverride(
      existing,
      { date: existing[0]!.date, period: existing[0]!.period, subject: '변경' },
      NOW,
      () => 'unused',
    );
    expect(overrides[0]!.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(overrides[0]!.updatedAt).toBe(NOW);
  });

  it('다른 date 또는 다른 period는 새로 추가', () => {
    const existing = [mkOverride({ id: 'a', date: '2026-04-22', period: 3 })];
    const r1 = upsertOverride(
      existing,
      { date: '2026-04-23', period: 3, subject: '국어' },
      NOW,
      () => 'b',
    );
    expect(r1.overrides).toHaveLength(2);
    expect(r1.replacedId).toBeNull();

    const r2 = upsertOverride(
      existing,
      { date: '2026-04-22', period: 5, subject: '국어' },
      NOW,
      () => 'c',
    );
    expect(r2.overrides).toHaveLength(2);
    expect(r2.replacedId).toBeNull();
  });

  it('같은 date+period라도 scope가 다르면 별도 항목으로 공존', () => {
    const existing: readonly TimetableOverride[] = [];
    const r1 = upsertOverride(
      existing,
      { date: '2026-04-22', period: 3, subject: '자습', scope: 'teacher' },
      NOW,
      () => 'id-teacher',
    );
    const r2 = upsertOverride(
      r1.overrides,
      { date: '2026-04-22', period: 3, subject: '체육', scope: 'class' },
      NOW,
      () => 'id-class',
    );
    expect(r2.overrides).toHaveLength(2);
    expect(r2.replacedId).toBeNull();
  });
});

describe('mergeOverridesIntoTeacherSchedule', () => {
  const base: readonly (TeacherPeriod | null)[] = [
    { subject: '수학', classroom: '3-1' },
    { subject: '영어', classroom: '3-2' },
    { subject: '국어', classroom: '3-1' },
  ];

  it('override 없음 → base 그대로', () => {
    expect(mergeOverridesIntoTeacherSchedule(base, [])).toBe(base);
  });

  it('period=2 override → 1번 인덱스 치환', () => {
    const result = mergeOverridesIntoTeacherSchedule(base, [
      mkOverride({ period: 2, subject: '자습', classroom: '3-1' }),
    ]);
    expect(result[1]).toEqual({ subject: '자습', classroom: '3-1' });
    expect(result[0]).toEqual(base[0]);
    expect(result[2]).toEqual(base[2]);
  });

  it('subject="" → null (공강)', () => {
    const result = mergeOverridesIntoTeacherSchedule(base, [
      mkOverride({ period: 1, subject: '' }),
    ]);
    expect(result[0]).toBeNull();
  });

  it('period=0 또는 범위 밖 → 무시', () => {
    const result = mergeOverridesIntoTeacherSchedule(base, [
      mkOverride({ period: 0, subject: '무시' }),
      mkOverride({ period: 10, subject: '무시' }),
    ]);
    expect(result).toEqual(base);
  });

  it('classroom 미지정 override → 빈 문자열 폴백', () => {
    const result = mergeOverridesIntoTeacherSchedule(base, [
      mkOverride({ period: 1, subject: '체육', classroom: undefined }),
    ]);
    expect(result[0]).toEqual({ subject: '체육', classroom: '' });
  });

  it('scope="class" override는 교사 시간표에 적용되지 않는다', () => {
    const result = mergeOverridesIntoTeacherSchedule(base, [
      mkOverride({ period: 1, subject: '자습', scope: 'class' }),
    ]);
    expect(result).toEqual(base);
  });

  it('scope="teacher" override는 교사 시간표에 적용된다', () => {
    const result = mergeOverridesIntoTeacherSchedule(base, [
      mkOverride({ period: 1, subject: '체육', scope: 'teacher' }),
    ]);
    expect(result[0]).toEqual({ subject: '체육', classroom: '' });
  });
});

describe('mergeOverridesIntoClassSchedule', () => {
  const base: readonly ClassPeriod[] = [
    { subject: '수학', teacher: '김선생' },
    { subject: '영어', teacher: '이선생' },
    { subject: '국어', teacher: '박선생' },
  ];

  it('subject="" → {subject:"", teacher:""} (공강)', () => {
    const result = mergeOverridesIntoClassSchedule(base, [
      mkOverride({ period: 2, subject: '' }),
    ]);
    expect(result[1]).toEqual({ subject: '', teacher: '' });
  });

  it('scope="teacher" override는 학급 시간표에 적용되지 않는다', () => {
    const result = mergeOverridesIntoClassSchedule(base, [
      mkOverride({ period: 1, subject: '자습', scope: 'teacher' }),
    ]);
    expect(result).toEqual(base);
  });

  it('scope="class" override는 학급 시간표에 적용된다', () => {
    const result = mergeOverridesIntoClassSchedule(base, [
      mkOverride({ period: 1, subject: '자습', scope: 'class' }),
    ]);
    expect(result[0]).toEqual({ subject: '자습', teacher: '김선생' });
  });

  it('scope=undefined(레거시)는 both로 간주 → 학급에도 적용', () => {
    const result = mergeOverridesIntoClassSchedule(base, [
      mkOverride({ period: 1, subject: '자습' }),
    ]);
    expect(result[0]).toEqual({ subject: '자습', teacher: '김선생' });
  });

  it('override.subject 치환 시 기본 teacher 유지', () => {
    const result = mergeOverridesIntoClassSchedule(base, [
      mkOverride({ period: 1, subject: '체육' }),
    ]);
    expect(result[0]).toEqual({ subject: '체육', teacher: '김선생' });
  });

  it('base[idx]가 없으면 teacher 공란 fallback', () => {
    const shortBase: readonly ClassPeriod[] = [];
    const result = mergeOverridesIntoClassSchedule(shortBase, [
      mkOverride({ period: 1, subject: '체육' }),
    ]);
    expect(result).toEqual([]);
  });
});

describe('filterOverridesInRange', () => {
  const data = [
    mkOverride({ id: 'a', date: '2026-04-20' }),
    mkOverride({ id: 'b', date: '2026-04-22' }),
    mkOverride({ id: 'c', date: '2026-04-25' }),
    mkOverride({ id: 'd', date: '2026-05-01' }),
  ];

  it('from ≤ date ≤ to inclusive', () => {
    const result = filterOverridesInRange(data, '2026-04-22', '2026-04-25');
    expect(result.map((o) => o.id)).toEqual(['b', 'c']);
  });

  it('범위 밖 전부', () => {
    const result = filterOverridesInRange(data, '2027-01-01', '2027-12-31');
    expect(result).toEqual([]);
  });

  it('from === to → 해당 날짜만', () => {
    const result = filterOverridesInRange(data, '2026-04-22', '2026-04-22');
    expect(result.map((o) => o.id)).toEqual(['b']);
  });
});

describe('dedupeOverridesKeepLatest', () => {
  it('중복 없으면 원본 동일 순서', () => {
    const data = [
      mkOverride({ id: 'a', date: '2026-04-22', period: 1 }),
      mkOverride({ id: 'b', date: '2026-04-22', period: 2 }),
    ];
    const result = dedupeOverridesKeepLatest(data);
    expect(result.map((o) => o.id)).toEqual(['a', 'b']);
  });

  it('updatedAt > createdAt 최신 항목 승자', () => {
    const data = [
      mkOverride({ id: 'old', date: '2026-04-22', period: 1, createdAt: '2026-01-01T00:00:00.000Z' }),
      mkOverride({ id: 'new', date: '2026-04-22', period: 1, createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-04-01T00:00:00.000Z' }),
    ];
    const result = dedupeOverridesKeepLatest(data);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('new');
  });

  it('타임스탬프 동일 → id 사전순 가장 큰 것 승자', () => {
    const ts = '2026-04-01T00:00:00.000Z';
    const data = [
      mkOverride({ id: 'aaa', date: '2026-04-22', period: 1, createdAt: ts }),
      mkOverride({ id: 'zzz', date: '2026-04-22', period: 1, createdAt: ts }),
    ];
    const result = dedupeOverridesKeepLatest(data);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('zzz');
  });

  it('id까지 동일 → last-in-wins', () => {
    const ts = '2026-04-01T00:00:00.000Z';
    const data = [
      mkOverride({ id: 'same', date: '2026-04-22', period: 1, subject: '먼저', createdAt: ts }),
      mkOverride({ id: 'same', date: '2026-04-22', period: 1, subject: '나중', createdAt: ts }),
    ];
    const result = dedupeOverridesKeepLatest(data);
    expect(result).toHaveLength(1);
    expect(result[0]!.subject).toBe('나중');
  });

  it('서로 다른 date+period는 모두 보존', () => {
    const data = [
      mkOverride({ id: 'a', date: '2026-04-22', period: 1 }),
      mkOverride({ id: 'b', date: '2026-04-22', period: 2 }),
      mkOverride({ id: 'c', date: '2026-04-23', period: 1 }),
    ];
    const result = dedupeOverridesKeepLatest(data);
    expect(result).toHaveLength(3);
  });
});

// mkId 미사용 경고 방지
void mkId;
