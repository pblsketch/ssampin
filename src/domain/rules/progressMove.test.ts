import { describe, it, expect } from 'vitest';
import { canDropProgressCell, planProgressMove } from './progressMove';
import type { WeeklyProgressCell } from './progressCalendarRules';
import type { ProgressEntry } from '@domain/entities/CurriculumProgress';
import type { TeachingClass } from '@domain/entities/TeachingClass';

const CLASS_A: TeachingClass = {
  id: 'a',
  name: '1-7',
  subject: '공국2',
  students: [],
  createdAt: '2026-03-02T00:00:00.000Z',
  updatedAt: '2026-03-02T00:00:00.000Z',
};
const CLASS_B: TeachingClass = { ...CLASS_A, id: 'b', name: '1-8' };

const entry = (over: Partial<ProgressEntry> = {}): ProgressEntry => ({
  id: 'e1',
  classId: 'a',
  date: '2026-08-17',
  period: 1,
  unit: '음운의 변동',
  lesson: '1차시',
  status: 'planned',
  note: '',
  ...over,
});

const cell = (over: Partial<WeeklyProgressCell> = {}): WeeklyProgressCell => ({
  dayIndex: 0,
  period: 1,
  date: '2026-08-17',
  slot: { subject: '공국2', classroom: '1-7' },
  matchedClass: CLASS_A,
  entries: [],
  ...over,
});

/** 진도 1건이 든 출발 칸 (월 1교시) */
const source = (entries: readonly ProgressEntry[] = [entry()]) => cell({ entries: [...entries] });

/** 같은 반 수업이 있는 빈 도착 칸 (화 3교시) */
const target = (over: Partial<WeeklyProgressCell> = {}) =>
  cell({ dayIndex: 1, period: 3, date: '2026-08-18', ...over });

describe('canDropProgressCell', () => {
  it('같은 반 수업이 있는 다른 칸이면 놓을 수 있다', () => {
    expect(canDropProgressCell(source(), target())).toEqual({ ok: true });
  });

  it('출발 칸에 진도가 없으면 옮길 것이 없다', () => {
    const result = canDropProgressCell(cell({ entries: [] }), target());
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain('옮길 진도가 없어요');
  });

  it('공강·미매칭 칸에는 놓을 수 없다', () => {
    const result = canDropProgressCell(source(), target({ matchedClass: null, slot: null }));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain('수업이 없는 칸');
  });

  it('다른 반 칸에는 놓을 수 없다 — 놓으면 캘린더에서 사라지기 때문', () => {
    const result = canDropProgressCell(source(), target({ matchedClass: CLASS_B }));
    expect(result.ok).toBe(false);
    // 어느 반 칸인지 알려 줘야 선생님이 왜 막혔는지 안다
    expect(result.ok === false && result.reason).toContain('1-8');
  });

  it('원래 자리에는 놓을 수 없다 (바뀌는 것이 없다)', () => {
    expect(canDropProgressCell(source(), source()).ok).toBe(false);
  });

  it('날짜가 같아도 교시가 다르면 놓을 수 있다', () => {
    expect(canDropProgressCell(source(), target({ date: '2026-08-17', period: 5 })).ok).toBe(true);
  });
});

describe('planProgressMove', () => {
  it('날짜·교시만 놓은 칸으로 바뀌고 내용은 그대로다', () => {
    const plan = planProgressMove(source(), target());
    expect(plan?.moved).toEqual([
      expect.objectContaining({
        id: 'e1',
        classId: 'a',
        date: '2026-08-18',
        period: 3,
        unit: '음운의 변동',
        lesson: '1차시',
        status: 'planned',
      }),
    ]);
    expect(plan?.swapped).toEqual([]);
  });

  it('한 칸에 진도가 여러 건이면 보이는 대로 전부 함께 옮긴다', () => {
    const plan = planProgressMove(source([entry(), entry({ id: 'e2' })]), target());
    expect(plan?.moved.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(plan?.moved.every((e) => e.date === '2026-08-18' && e.period === 3)).toBe(true);
  });

  it('놓은 칸에 이미 진도가 있으면 덮어쓰지 않고 출발 칸으로 맞바꾼다', () => {
    const existing = entry({ id: 'e2', date: '2026-08-18', period: 3, lesson: '2차시' });
    const plan = planProgressMove(source(), target({ entries: [existing] }));

    expect(plan?.moved[0]).toEqual(
      expect.objectContaining({ id: 'e1', date: '2026-08-18', period: 3 }),
    );
    // 원래 그 칸에 있던 것은 사라지지 않고 출발 자리로 간다
    expect(plan?.swapped).toEqual([
      expect.objectContaining({ id: 'e2', date: '2026-08-17', period: 1, lesson: '2차시' }),
    ]);
  });

  it('옮기는 항목이 도착 칸에도 잡혀 있으면 맞바꿈에서 제외한다 (날짜 두 번 덮임 방지)', () => {
    const self = entry();
    const plan = planProgressMove(source([self]), target({ entries: [self] }));
    expect(plan?.swapped).toEqual([]);
    expect(plan?.moved[0]?.date).toBe('2026-08-18');
  });

  it('놓을 수 없으면 null (호출부가 아무 것도 하지 않게)', () => {
    expect(planProgressMove(source(), target({ matchedClass: CLASS_B }))).toBeNull();
    expect(planProgressMove(source(), target({ matchedClass: null, slot: null }))).toBeNull();
    expect(planProgressMove(source(), source())).toBeNull();
    expect(planProgressMove(cell({ entries: [] }), target())).toBeNull();
  });
});
