/**
 * 쌤핀 AI — 시간표·진도 요약 (브릿지 동등화 Phase 1 슬라이스 2)
 *
 * 두 도구가 공유하는 함정을 본다.
 * ① 기간이 길어져도 **서버 상한 안에 들어가야** 한다 — 잘랐으면 잘랐다고 말해야 한다.
 * ② 앱이 이미 아는 사실(요일·변동 시간표·학급 이름)을 **모델 추측에 맡기지 않는다.**
 */
import { describe, expect, it } from 'vitest';

import type { TeacherPeriod } from '@domain/entities/Timetable';
import { summarizeProgress } from '../summarizeProgress';
import { summarizeTimetable } from '../summarizeTimetable';

const SCHEDULE: Readonly<Record<string, readonly (TeacherPeriod | null)[]>> = {
  // 1교시 수학 · 2교시 없음 · 3교시 자습(과목 빈칸) · 4교시 과학
  '2026-08-24': [
    { subject: '수학', classroom: '3-2' },
    null,
    { subject: '', classroom: '' },
    { subject: '과학', classroom: '과학실' },
  ],
  '2026-08-25': [null, { subject: '수학', classroom: '2-1' }],
};

const getDay = (date: string): readonly (TeacherPeriod | null)[] => SCHEDULE[date] ?? [];

describe('summarizeTimetable', () => {
  it('빈 교시·자습은 담지 않고, 교시 번호는 1부터 센다', () => {
    const out = summarizeTimetable(getDay, { from: '2026-08-24', to: '2026-08-25' });

    expect(out.items.map((i) => [i.date, i.periodNo, i.subject])).toEqual([
      ['2026-08-24', 1, '수학'],
      ['2026-08-24', 4, '과학'],
      ['2026-08-25', 2, '수학'],
    ]);
    expect(out.truncated).toBe(false);
  });

  it('★요일을 앱이 붙인다 — 모델은 며칠이 무슨 요일인지 모른다', () => {
    const out = summarizeTimetable(getDay, { from: '2026-08-24', to: '2026-08-25' });
    expect(out.items[0]?.day).toBe('월');
    expect(out.items[2]?.day).toBe('화');
  });

  it('수업 없는 날(주말·방학)은 조용히 건너뛴다', () => {
    const out = summarizeTimetable(getDay, { from: '2026-08-22', to: '2026-08-23' });
    expect(out.items).toEqual([]);
    expect(out.period).toBe('2026-08-22 ~ 2026-08-23');
  });

  it('★날 수 상한에 걸리면 truncated 로 드러낸다 — 조용한 절단은 "다 봤다"로 읽힌다', () => {
    const out = summarizeTimetable(getDay, {
      from: '2026-08-24',
      to: '2026-09-30',
      maxDays: 1,
    });
    expect(out.items.every((i) => i.date === '2026-08-24')).toBe(true);
    expect(out.truncated).toBe(true);
  });

  it('★칸 수 상한도 따로 있다 — 날 수만 막으면 서버 상한(4,000자)을 넘긴다', () => {
    const out = summarizeTimetable(getDay, {
      from: '2026-08-24',
      to: '2026-08-25',
      maxItems: 2,
    });
    expect(out.items).toHaveLength(2);
    expect(out.truncated).toBe(true);
  });
});

const ENTRIES = [
  {
    classId: 'c1',
    date: '2026-08-24',
    period: 3,
    unit: '2단원 함수',
    lesson: '1차시',
    status: 'completed',
    note: '연습문제까지',
  },
  {
    classId: 'c2',
    date: '2026-08-20',
    period: 1,
    unit: '1단원 집합',
    lesson: '4차시',
    status: 'planned',
    note: '',
  },
  {
    classId: 'gone',
    date: '2026-08-21',
    period: 2,
    unit: '3단원',
    lesson: '2차시',
    status: 'skipped',
    note: '',
  },
];

const NAMES = { c1: '3학년 2반', c2: '2학년 5반' };

describe('summarizeProgress', () => {
  it('기간으로 거르고 날짜·교시 순으로 정렬한다', () => {
    const out = summarizeProgress(ENTRIES, {
      from: '2026-08-01',
      to: '2026-08-31',
      classNames: NAMES,
    });

    expect(out.total).toBe(3);
    expect(out.items.map((i) => i.date)).toEqual(['2026-08-20', '2026-08-21', '2026-08-24']);
    expect(out.period).toBe('2026-08-01 ~ 2026-08-31');
  });

  it('★학급은 UUID 가 아니라 이름으로 나간다', () => {
    const out = summarizeProgress(ENTRIES, {
      from: '2026-08-24',
      to: '2026-08-24',
      classNames: NAMES,
    });
    expect(out.items[0]?.className).toBe('3학년 2반');
    expect(JSON.stringify(out)).not.toContain('c1');
  });

  it('지워진 학급의 기록도 버리지 않는다 — 건수가 틀어지면 답이 틀린다', () => {
    const out = summarizeProgress(ENTRIES, {
      from: '2026-08-21',
      to: '2026-08-21',
      classNames: NAMES,
    });
    expect(out.items[0]?.className).toBe('(삭제된 학급)');
  });

  it('학급 이름으로 좁힐 수 있다', () => {
    const out = summarizeProgress(ENTRIES, {
      from: '2026-08-01',
      to: '2026-08-31',
      classNames: NAMES,
      className: '2학년 5반',
    });
    expect(out.items).toHaveLength(1);
    expect(out.total).toBe(1);
  });

  it('★건수 상한을 넘겨도 total 은 사실 그대로다', () => {
    const out = summarizeProgress(ENTRIES, {
      from: '2026-08-01',
      to: '2026-08-31',
      classNames: NAMES,
      maxItems: 1,
    });
    expect(out.items).toHaveLength(1);
    expect(out.total).toBe(3);
    expect(out.truncated).toBe(true);
  });

  it('긴 메모는 잘라서 담는다 — 서버 상한을 넘기면 요청이 통째로 거절된다', () => {
    const out = summarizeProgress([{ ...ENTRIES[0]!, note: '가'.repeat(500) }], {
      from: '2026-08-01',
      to: '2026-08-31',
      classNames: NAMES,
      maxNoteChars: 10,
    });
    expect(out.items[0]?.note).toBe(`${'가'.repeat(10)}…`);
  });
});
