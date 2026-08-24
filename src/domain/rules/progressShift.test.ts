import { describe, it, expect } from 'vitest';
import { planProgressShift } from './progressShift';
import type { ProgressEntry, ProgressStatus } from '@domain/entities/CurriculumProgress';

/**
 * 월·수 두 번 수업하는 반의 3주치 수업일.
 * 08-17(월) 1교시 · 08-19(수) 2교시 · 08-24(월) 1교시 · 08-26(수) 2교시 · 08-31(월) 1교시
 */
const LESSON_DAYS = [
  { date: '2026-08-17', periods: [1] },
  { date: '2026-08-19', periods: [2] },
  { date: '2026-08-24', periods: [1] },
  { date: '2026-08-26', periods: [2] },
  { date: '2026-08-31', periods: [1] },
];

const e = (
  id: string,
  date: string,
  period: number,
  status: ProgressStatus = 'planned',
): ProgressEntry => ({
  id,
  classId: 'c1',
  date,
  period,
  unit: '단원',
  lesson: `${id}차시`,
  status,
  note: '',
});

const shift = (entries: readonly ProgressEntry[], from = { date: '2026-08-17', period: 1 }) =>
  planProgressShift({ entries, classId: 'c1', from, lessonDays: LESSON_DAYS });

describe('planProgressShift', () => {
  it('앵커부터 뒤의 예정 진도가 다음 수업일로 한 칸씩 밀린다', () => {
    const plan = shift([e('1', '2026-08-17', 1), e('2', '2026-08-19', 2), e('3', '2026-08-24', 1)]);

    expect(plan.moved.map((m) => `${m.id}@${m.date}:${m.period}`)).toEqual([
      '1@2026-08-19:2',
      '2@2026-08-24:1',
      '3@2026-08-26:2',
    ]);
    expect(plan.overflowCount).toBe(0);
  });

  it('앵커보다 앞에 있는 진도는 건드리지 않는다', () => {
    const plan = shift([e('1', '2026-08-17', 1), e('2', '2026-08-24', 1)], {
      date: '2026-08-24',
      period: 1,
    });
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0]?.entry.id).toBe('2');
  });

  it("'완료'와 '미실시'는 옮기지 않는다 — 그날 있었던 일의 기록이라서", () => {
    const plan = shift([
      e('done', '2026-08-17', 1, 'completed'),
      e('skip', '2026-08-19', 2, 'skipped'),
      e('plan', '2026-08-24', 1),
    ]);
    expect(plan.rows.map((r) => r.entry.id)).toEqual(['plan']);
    expect(plan.moved.map((m) => `${m.id}@${m.date}`)).toEqual(['plan@2026-08-26']);
  });

  it('옮기지 않는 항목이 앉은 자리는 건너뛰고 그 다음 수업일로 간다', () => {
    // 08-19 는 완료라 자리가 차 있다 → 08-17 의 예정은 08-19 를 건너뛰고 08-24 로
    const plan = shift([e('plan', '2026-08-17', 1), e('done', '2026-08-19', 2, 'completed')]);
    expect(plan.moved.map((m) => `${m.id}@${m.date}:${m.period}`)).toEqual(['plan@2026-08-24:1']);
  });

  it('학기 마지막 수업일을 넘어가는 건은 옮기지 않고 세어서 알려 준다', () => {
    const plan = shift([e('1', '2026-08-26', 2), e('2', '2026-08-31', 1)]);

    // 08-26 → 08-31 은 되지만, 08-31 뒤에는 자리가 없다
    expect(plan.moved.map((m) => `${m.id}@${m.date}`)).toEqual(['1@2026-08-31']);
    expect(plan.overflowCount).toBe(1);
    expect(plan.rows.find((r) => r.entry.id === '2')?.blocked).toBe('pastTermEnd');
  });

  it('밀려나는 건도 미리보기 줄에는 남는다 (조용히 버리지 않는다)', () => {
    const plan = shift([e('2', '2026-08-31', 1)]);
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0]?.to).toBeNull();
    expect(plan.moved).toEqual([]);
  });

  it('시간표에 없는 자리에 남은 기록은 옮길 근거가 없어 건너뛴다', () => {
    // 08-18(화)은 이 반 수업일이 아니다
    const plan = shift([e('orphan', '2026-08-18', 5)], { date: '2026-08-17', period: 1 });
    expect(plan.rows[0]?.blocked).toBe('noSlot');
    expect(plan.moved).toEqual([]);
  });

  it("'완료'와 같은 칸에 겹친 '예정'은 noSlot 이 아니라 다음 빈 수업일로 밀린다", () => {
    // 08-19 에 완료와 예정이 겹쳐 있다 — 예정의 자리는 held 지만 실제 수업 자리다.
    // '수업일 아님'(noSlot)으로 보내면 원인과 문구가 어긋난다.
    const plan = shift([e('done', '2026-08-19', 2, 'completed'), e('stacked', '2026-08-19', 2)]);
    expect(plan.rows[0]?.blocked).toBeUndefined();
    expect(plan.moved.map((m) => `${m.id}@${m.date}:${m.period}`)).toEqual([
      'stacked@2026-08-24:1',
    ]);
  });

  it('겹친 예정도 두 칸 이상(steps) 밀 수 있다', () => {
    const plan = planProgressShift({
      entries: [e('done', '2026-08-19', 2, 'completed'), e('stacked', '2026-08-19', 2)],
      classId: 'c1',
      from: { date: '2026-08-17', period: 1 },
      lessonDays: LESSON_DAYS,
      steps: 2,
    });
    expect(plan.moved.map((m) => `${m.id}@${m.date}`)).toEqual(['stacked@2026-08-26']);
  });

  it('겹친 예정 뒤에 빈 수업일이 없으면 noSlot 이 아니라 학기 밖(pastTermEnd)이다', () => {
    const plan = shift([e('done', '2026-08-31', 1, 'completed'), e('stacked', '2026-08-31', 1)]);
    expect(plan.rows[0]?.blocked).toBe('pastTermEnd');
    expect(plan.moved).toEqual([]);
  });

  it('겹친 예정이 밀리면 그 뒤 예정과의 자리 배분도 이어진다', () => {
    // 08-17 완료+예정 겹침, 08-19 에 별도 예정 — 겹친 것이 08-19 로 가면 그 자리 예정은 08-24 로.
    const plan = shift([
      e('done', '2026-08-17', 1, 'completed'),
      e('stacked', '2026-08-17', 1),
      e('next', '2026-08-19', 2),
    ]);
    expect(plan.moved.map((m) => `${m.id}@${m.date}`)).toEqual([
      'stacked@2026-08-19',
      'next@2026-08-24',
    ]);
    expect(plan.collisions).toEqual([]);
  });

  it('다른 반 진도는 대상이 아니다', () => {
    const other = { ...e('x', '2026-08-17', 1), classId: 'c2' };
    const plan = shift([other, e('mine', '2026-08-19', 2)]);
    expect(plan.rows.map((r) => r.entry.id)).toEqual(['mine']);
  });

  it('옮길 것이 없으면 빈 계획 (화면이 창을 열지 않게)', () => {
    expect(shift([]).rows).toEqual([]);
    expect(shift([e('done', '2026-08-17', 1, 'completed')]).rows).toEqual([]);
  });

  it('steps 로 두 칸 이상도 밀 수 있다', () => {
    const plan = planProgressShift({
      entries: [e('1', '2026-08-17', 1)],
      classId: 'c1',
      from: { date: '2026-08-17', period: 1 },
      lessonDays: LESSON_DAYS,
      steps: 2,
    });
    expect(plan.moved[0]?.date).toBe('2026-08-24');
  });

  it('학기가 꽉 차 마지막 자리가 겹치면 막지 않고 어디가 겹치는지 알려 준다', () => {
    // 수업일 5칸에 예정 5건 — 한 칸 밀면 마지막 08-31 에 두 건이 앉는다
    const plan = shift([
      e('1', '2026-08-17', 1),
      e('2', '2026-08-19', 2),
      e('3', '2026-08-24', 1),
      e('4', '2026-08-26', 2),
      e('5', '2026-08-31', 1),
    ]);

    // 밀기 자체는 막지 않는다 — 막으면 가장 흔한 경우에 기능이 통째로 무용해진다
    expect(plan.moved).toHaveLength(4);
    expect(plan.overflowCount).toBe(1);
    expect(plan.collisions).toEqual([{ date: '2026-08-31', period: 1 }]);
  });

  it('자리가 넉넉하면 겹침이 없다', () => {
    const plan = shift([e('1', '2026-08-17', 1), e('2', '2026-08-19', 2)]);
    expect(plan.collisions).toEqual([]);
  });

  it('겹치는 자리가 여럿이어도 자리마다 한 번씩만 보고한다', () => {
    // 08-31 에 이미 두 건이 있고, 08-26 것이 그 위로 또 올라온다
    const plan = shift([
      e('a', '2026-08-26', 2),
      e('b', '2026-08-31', 1),
      { ...e('c', '2026-08-31', 1), id: 'c' },
    ]);
    expect(plan.collisions.filter((c) => c.date === '2026-08-31')).toHaveLength(1);
  });

  it('다른 반에 같은 단원·차시가 있으면(팬아웃 사본 짐작) 건수를 알려 준다', () => {
    // '1차시'가 c2 반에도 있다 — 화면이 "이 반만 밀린다"를 미리 알리는 데 쓴다.
    const copy = { ...e('1', '2026-08-18', 3), id: 'copy', classId: 'c2' };
    const plan = shift([e('1', '2026-08-17', 1), e('2', '2026-08-19', 2), copy]);
    expect(plan.otherClassCopyCount).toBe(1);
  });

  it('다른 반에 같은 내용이 없으면 사본 건수는 0 이다', () => {
    const other = { ...e('x', '2026-08-18', 3), classId: 'c2', lesson: '전혀 다른 차시' };
    const plan = shift([e('1', '2026-08-17', 1), other]);
    expect(plan.otherClassCopyCount).toBe(0);
  });

  it('단원·차시가 둘 다 빈 항목은 사본으로 세지 않는다 (아무하고나 겹치므로)', () => {
    const blankMine = { ...e('1', '2026-08-17', 1), unit: '', lesson: '' };
    const blankOther = { ...e('x', '2026-08-18', 3), classId: 'c2', unit: '', lesson: '' };
    const plan = shift([blankMine, blankOther]);
    expect(plan.otherClassCopyCount).toBe(0);
  });

  it('내용·상태는 그대로 두고 날짜·교시만 바꾼다', () => {
    const plan = shift([e('1', '2026-08-17', 1)]);
    expect(plan.moved[0]).toEqual(
      expect.objectContaining({
        id: '1',
        classId: 'c1',
        unit: '단원',
        lesson: '1차시',
        status: 'planned',
      }),
    );
  });
});
