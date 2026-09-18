import { describe, it, expect } from 'vitest';
import {
  COMCIGAN_WEEKLY_REASON,
  buildComciganWeeklyOverrides,
  inferWeeklyKind,
  isWeekendDate,
  parseClassCellKey,
  parseTeacherCellKey,
  reconcileComciganWeeklyOverrides,
  removeComciganWeeklyOverrides,
  weekFridayOf,
  weekMondayOf,
} from './comciganWeeklyOverrides';
import type { WeeklyOverrideDraft } from './comciganWeeklyOverrides';
import type { TimetableChange } from './timetableDiff';
import type { TimetableOverride } from '@domain/entities/Timetable';

// 기준 주: 2026-09-14(월) ~ 2026-09-18(금)
const MON = new Date(2026, 8, 14);
const WED = new Date(2026, 8, 16);
const SAT = new Date(2026, 8, 19);
const SUN = new Date(2026, 8, 20);

const change = (partial: Partial<TimetableChange>): TimetableChange => ({
  day: partial.day ?? '수',
  period: partial.period ?? 3,
  before: partial.before ?? '',
  after: partial.after ?? '',
});

describe('weekMondayOf', () => {
  it('월요일은 그 자신', () => {
    expect(weekMondayOf(MON)).toBe('2026-09-14');
  });

  it('주중 아무 날이나 그 주 월요일', () => {
    expect(weekMondayOf(WED)).toBe('2026-09-14');
    expect(weekMondayOf(new Date(2026, 8, 18))).toBe('2026-09-14');
  });

  it('토요일은 같은 주 월요일', () => {
    expect(weekMondayOf(SAT)).toBe('2026-09-14');
  });

  it('일요일은 그 전 월요일 (시간표 화면과 같은 규칙)', () => {
    expect(weekMondayOf(SUN)).toBe('2026-09-14');
  });

  it('달·해 경계를 넘어도 맞다', () => {
    // 2027-01-01은 금요일 → 그 주 월요일은 2026-12-28
    expect(weekMondayOf(new Date(2027, 0, 1))).toBe('2026-12-28');
  });
});

describe('isWeekendDate', () => {
  it('토·일만 주말', () => {
    expect(isWeekendDate(SAT)).toBe(true);
    expect(isWeekendDate(SUN)).toBe(true);
    expect(isWeekendDate(WED)).toBe(false);
  });
});

describe('셀 표기 파싱', () => {
  it('교사 셀: 과목@교실', () => {
    expect(parseTeacherCellKey('수학@3-1')).toEqual({ subject: '수학', classroom: '3-1' });
  });

  it('교사 셀: 교실 없음', () => {
    expect(parseTeacherCellKey('수학')).toEqual({ subject: '수학', classroom: '' });
  });

  it('교사 셀: 합반 교실 구분 문자를 보존한다', () => {
    expect(parseTeacherCellKey('체육@1-1·1-2')).toEqual({
      subject: '체육',
      classroom: '1-1·1-2',
    });
  });

  it('교사 셀: 빈 칸', () => {
    expect(parseTeacherCellKey('')).toEqual({ subject: '', classroom: '' });
  });

  it('학급 셀: 과목/교사', () => {
    expect(parseClassCellKey('수학/홍*동')).toEqual({ subject: '수학', teacher: '홍*동' });
  });

  it('학급 셀: 교사 없음', () => {
    expect(parseClassCellKey('창체')).toEqual({ subject: '창체', teacher: '' });
  });
});

describe('inferWeeklyKind', () => {
  it('수업이 없어지면 자습', () => {
    expect(inferWeeklyKind('수학@3-1', '')).toBe('cancel');
  });

  it('없던 수업이 생기면 보강', () => {
    expect(inferWeeklyKind('', '수학@3-1')).toBe('substitute');
  });

  it('과목이 바뀌면 교체', () => {
    expect(inferWeeklyKind('수학@3-1', '영어@3-2')).toBe('swap');
  });
});

describe('buildComciganWeeklyOverrides', () => {
  it('교사 변동을 그 주 날짜의 교사 범위 항목으로 바꾼다', () => {
    const { weekMonday, drafts } = buildComciganWeeklyOverrides({
      baseDate: WED,
      teacherChanges: [change({ day: '화', period: 2, before: '', after: '수학@3-1' })],
      maxPeriods: 7,
    });
    expect(weekMonday).toBe('2026-09-14');
    expect(drafts).toEqual([
      {
        date: '2026-09-15',
        period: 2,
        subject: '수학',
        classroom: '3-1',
        kind: 'substitute',
        scope: 'teacher',
        reason: COMCIGAN_WEEKLY_REASON,
      },
    ]);
  });

  it('학급 변동은 담당 교사 이름을 담고 학급 범위로 만든다', () => {
    const { drafts } = buildComciganWeeklyOverrides({
      baseDate: WED,
      classChanges: [change({ day: '월', period: 1, before: '수학/김*수', after: '체육/최*아' })],
      maxPeriods: 7,
    });
    expect(drafts).toEqual([
      {
        date: '2026-09-14',
        period: 1,
        subject: '체육',
        substituteTeacher: '최*아',
        kind: 'swap',
        scope: 'class',
        reason: COMCIGAN_WEEKLY_REASON,
      },
    ]);
  });

  it('수업이 없어진 칸은 과목이 빈 자습 항목이 된다', () => {
    const { drafts } = buildComciganWeeklyOverrides({
      baseDate: WED,
      teacherChanges: [change({ day: '금', period: 4, before: '국어@2-3', after: '' })],
      maxPeriods: 7,
    });
    expect(drafts[0]).toMatchObject({
      date: '2026-09-18',
      period: 4,
      subject: '',
      kind: 'cancel',
      scope: 'teacher',
    });
  });

  it('주말에는 아무것도 등록하지 않는다', () => {
    const sat = buildComciganWeeklyOverrides({
      baseDate: SAT,
      teacherChanges: [change({ after: '수학@3-1' })],
      maxPeriods: 7,
    });
    const sun = buildComciganWeeklyOverrides({
      baseDate: SUN,
      teacherChanges: [change({ after: '수학@3-1' })],
      maxPeriods: 7,
    });
    expect(sat.drafts).toEqual([]);
    expect(sun.drafts).toEqual([]);
    expect(sat.weekMonday).toBe('2026-09-14');
  });

  it('저장된 교시 수를 넘는 칸은 버린다', () => {
    const { drafts } = buildComciganWeeklyOverrides({
      baseDate: WED,
      teacherChanges: [
        change({ day: '수', period: 8, after: '수학@3-1' }),
        change({ day: '수', period: 7, after: '영어@3-1' }),
      ],
      maxPeriods: 7,
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.period).toBe(7);
  });

  it('월~금이 아닌 요일은 버린다', () => {
    const { drafts } = buildComciganWeeklyOverrides({
      baseDate: WED,
      teacherChanges: [change({ day: '토', after: '수학@3-1' })],
      maxPeriods: 7,
    });
    expect(drafts).toEqual([]);
  });

  it('날짜·교시 순으로 정렬한다', () => {
    const { drafts } = buildComciganWeeklyOverrides({
      baseDate: WED,
      teacherChanges: [
        change({ day: '금', period: 1, after: 'A' }),
        change({ day: '월', period: 5, after: 'B' }),
        change({ day: '월', period: 2, after: 'C' }),
      ],
      maxPeriods: 7,
    });
    expect(drafts.map((d) => `${d.date}-${d.period}`)).toEqual([
      '2026-09-14-2',
      '2026-09-14-5',
      '2026-09-18-1',
    ]);
  });

  it('변동이 없으면 빈 목록', () => {
    const { drafts } = buildComciganWeeklyOverrides({ baseDate: WED, maxPeriods: 7 });
    expect(drafts).toEqual([]);
  });
});

describe('reconcileComciganWeeklyOverrides', () => {
  const NOW = '2026-09-16T09:00:00.000Z';
  const ids = () => {
    let i = 0;
    return () => `auto-${++i}`;
  };

  const ovr = (partial: Partial<TimetableOverride>): TimetableOverride => ({
    id: partial.id ?? 'x',
    date: partial.date ?? '2026-09-16',
    period: partial.period ?? 3,
    subject: partial.subject ?? '수학',
    createdAt: partial.createdAt ?? '2026-09-01T00:00:00.000Z',
    scope: partial.scope,
    kind: partial.kind,
    source: partial.source,
    substituteTeacher: partial.substituteTeacher,
  });

  const draft = (partial: Partial<WeeklyOverrideDraft>): WeeklyOverrideDraft => ({
    date: partial.date ?? '2026-09-16',
    period: partial.period ?? 3,
    subject: partial.subject ?? '영어',
    classroom: partial.classroom,
    substituteTeacher: partial.substituteTeacher,
    kind: partial.kind ?? 'swap',
    scope: partial.scope ?? 'teacher',
    reason: COMCIGAN_WEEKLY_REASON,
  });

  it('빈 상태에 초안을 등록한다', () => {
    const r = reconcileComciganWeeklyOverrides({
      existing: [],
      weekMonday: '2026-09-14',
      drafts: [draft({})],
      now: NOW,
      idFactory: ids(),
    });
    expect(r.applied).toBe(1);
    expect(r.skipped).toBe(0);
    expect(r.changed).toBe(true);
    expect(r.overrides[0]).toMatchObject({
      id: 'auto-1',
      date: '2026-09-16',
      period: 3,
      subject: '영어',
      scope: 'teacher',
      source: 'comcigan',
      reason: COMCIGAN_WEEKLY_REASON,
      createdAt: NOW,
    });
  });

  it('사용자가 직접 만든 변동이 있는 칸은 건너뛰고 그 항목을 남긴다', () => {
    const mine = ovr({ id: 'mine', date: '2026-09-16', period: 3, scope: 'teacher' });
    const r = reconcileComciganWeeklyOverrides({
      existing: [mine],
      weekMonday: '2026-09-14',
      drafts: [draft({ date: '2026-09-16', period: 3, scope: 'teacher' })],
      now: NOW,
      idFactory: ids(),
    });
    expect(r.applied).toBe(0);
    expect(r.skipped).toBe(1);
    expect(r.changed).toBe(false);
    expect(r.overrides).toEqual([mine]);
  });

  it('출처가 없는 기존 항목도 사용자 제작으로 보고 보존한다', () => {
    const legacy = ovr({ id: 'legacy', date: '2026-09-15', period: 2, scope: undefined });
    const r = reconcileComciganWeeklyOverrides({
      existing: [legacy],
      weekMonday: '2026-09-14',
      drafts: [draft({ date: '2026-09-15', period: 2, scope: 'class' })],
      now: NOW,
      idFactory: ids(),
    });
    // 범위가 없는(=공통) 사용자 항목은 교사·학급 양쪽 초안을 모두 막는다
    expect(r.skipped).toBe(1);
    expect(r.overrides).toEqual([legacy]);
  });

  it('교사·학급 초안은 같은 칸이어도 각각 저장된다', () => {
    const r = reconcileComciganWeeklyOverrides({
      existing: [],
      weekMonday: '2026-09-14',
      drafts: [
        draft({ date: '2026-09-16', period: 3, scope: 'teacher' }),
        draft({ date: '2026-09-16', period: 3, scope: 'class' }),
      ],
      now: NOW,
      idFactory: ids(),
    });
    expect(r.applied).toBe(2);
    expect(r.overrides.map((o) => o.scope)).toEqual(['teacher', 'class']);
  });

  it('그 주의 옛 컴시간 항목은 새 결과로 교체된다 (취소된 보강이 사라진다)', () => {
    const stale = ovr({ id: 'stale', date: '2026-09-17', period: 5, source: 'comcigan' });
    const r = reconcileComciganWeeklyOverrides({
      existing: [stale],
      weekMonday: '2026-09-14',
      drafts: [draft({ date: '2026-09-16', period: 1 })],
      now: NOW,
      idFactory: ids(),
    });
    expect(r.overrides.map((o) => o.id)).toEqual(['auto-1']);
    expect(r.changed).toBe(true);
  });

  it('지난 주 이전 컴시간 항목은 정리하고 사용자 항목은 남긴다', () => {
    const old = ovr({ id: 'old-auto', date: '2026-09-07', source: 'comcigan' });
    const oldMine = ovr({ id: 'old-mine', date: '2026-09-07' });
    const r = reconcileComciganWeeklyOverrides({
      existing: [old, oldMine],
      weekMonday: '2026-09-14',
      drafts: [],
      now: NOW,
      idFactory: ids(),
    });
    expect(r.overrides.map((o) => o.id)).toEqual(['old-mine']);
    expect(r.changed).toBe(true);
  });

  it('다음 주 이후 컴시간 항목은 건드리지 않는다', () => {
    const next = ovr({ id: 'next-week', date: '2026-09-22', source: 'comcigan' });
    const r = reconcileComciganWeeklyOverrides({
      existing: [next],
      weekMonday: '2026-09-14',
      drafts: [],
      now: NOW,
      idFactory: ids(),
    });
    expect(r.overrides.map((o) => o.id)).toEqual(['next-week']);
    expect(r.changed).toBe(false);
  });

  it('바뀔 것이 없으면 changed:false (저장하지 않는다)', () => {
    const r = reconcileComciganWeeklyOverrides({
      existing: [],
      weekMonday: '2026-09-14',
      drafts: [],
      now: NOW,
      idFactory: ids(),
    });
    expect(r.changed).toBe(false);
    expect(r.overrides).toEqual([]);
  });

  it('교실·교사 이름이 빈 값이면 필드를 만들지 않는다', () => {
    const r = reconcileComciganWeeklyOverrides({
      existing: [],
      weekMonday: '2026-09-14',
      drafts: [draft({ subject: '', classroom: '', substituteTeacher: '', kind: 'cancel' })],
      now: NOW,
      idFactory: ids(),
    });
    expect(r.overrides[0]).not.toHaveProperty('classroom');
    expect(r.overrides[0]).not.toHaveProperty('substituteTeacher');
  });
});

describe('removeComciganWeeklyOverrides', () => {
  const ovr = (partial: Partial<TimetableOverride>): TimetableOverride => ({
    id: partial.id ?? 'x',
    date: partial.date ?? '2026-09-16',
    period: partial.period ?? 3,
    subject: partial.subject ?? '수학',
    createdAt: '2026-09-01T00:00:00.000Z',
    source: partial.source,
  });

  it('그 주 컴시간 항목만 지운다', () => {
    const existing = [
      ovr({ id: 'auto-in-week', date: '2026-09-16', source: 'comcigan' }),
      ovr({ id: 'mine-in-week', date: '2026-09-16' }),
      ovr({ id: 'auto-other-week', date: '2026-09-23', source: 'comcigan' }),
    ];
    const r = removeComciganWeeklyOverrides(existing, '2026-09-14');
    expect(r.removed).toBe(1);
    expect(r.overrides.map((o) => o.id)).toEqual(['mine-in-week', 'auto-other-week']);
  });

  it('지울 것이 없으면 removed:0', () => {
    const r = removeComciganWeeklyOverrides([ovr({ id: 'mine' })], '2026-09-14');
    expect(r.removed).toBe(0);
  });
});

describe('weekFridayOf', () => {
  it('월요일 + 4일', () => {
    expect(weekFridayOf('2026-09-14')).toBe('2026-09-18');
  });

  it('달 경계를 넘어도 맞다', () => {
    expect(weekFridayOf('2026-09-28')).toBe('2026-10-02');
  });
});
