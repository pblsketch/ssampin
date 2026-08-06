/**
 * 구조 승계(S4.3) 계획 규칙 테스트 — 이름·과목·그룹 구조만 승계, 학생·좌석 제외,
 * 이미 보관된(archived) 반 제외, 관대 파싱(throw 금지).
 */
import { describe, expect, it } from 'vitest';
import { planClassStructureCarryover } from '../classStructureCarryover';

describe('planClassStructureCarryover', () => {
  it('같은 groupId + 같은 이름의 반들을 그룹 1개(과목 목록)로 묶는다', () => {
    const plan = planClassStructureCarryover({
      classes: [
        {
          id: 'a',
          name: '3학년 2반',
          subject: '통합과학',
          groupId: 'g1',
          order: 0,
          createdAt: '1',
        },
        {
          id: 'b',
          name: '3학년 2반',
          subject: '통합사회',
          groupId: 'g1',
          order: 1,
          createdAt: '2',
        },
        { id: 'c', name: '1학년 5반', subject: '물리', order: 2, createdAt: '3' },
      ],
    });
    expect(plan.groups).toEqual([{ name: '3학년 2반', subjects: ['통합과학', '통합사회'] }]);
    expect(plan.singles).toEqual([{ name: '1학년 5반', subject: '물리' }]);
    expect(plan.totalClassCount).toBe(3);
  });

  it('archived: true인 반(이미 보관된 지난 학기 반)은 제외한다', () => {
    const plan = planClassStructureCarryover({
      classes: [
        { id: 'a', name: '2학년 1반', subject: '수학', archived: true },
        { id: 'b', name: '2학년 3반', subject: '수학' },
      ],
    });
    expect(plan.totalClassCount).toBe(1);
    expect(plan.singles).toEqual([{ name: '2학년 3반', subject: '수학' }]);
  });

  it('학생·좌석 데이터는 계획에 실리지 않는다(구조만)', () => {
    const plan = planClassStructureCarryover({
      classes: [
        {
          id: 'a',
          name: '1학년 1반',
          subject: '국어',
          students: [{ number: 1, name: '김학생' }],
          seating: { rows: 4, cols: 5, seats: [] },
        },
      ],
    });
    expect(plan.singles).toEqual([{ name: '1학년 1반', subject: '국어' }]);
    expect(JSON.stringify(plan)).not.toContain('김학생');
    expect(JSON.stringify(plan)).not.toContain('seats');
  });

  it('구성원이 1개뿐인 그룹·이름이 갈리는 그룹은 이름을 바꾸지 않고 단독 반으로 승계한다', () => {
    const plan = planClassStructureCarryover({
      classes: [
        { id: 'a', name: '2학년 2반', subject: '음악', groupId: 'solo' },
        { id: 'b', name: '심화반 A', subject: '영어', groupId: 'g2' },
        { id: 'c', name: '심화반 B', subject: '영어', groupId: 'g2' },
      ],
    });
    expect(plan.groups).toEqual([]);
    expect(plan.singles).toEqual([
      { name: '2학년 2반', subject: '음악' },
      { name: '심화반 A', subject: '영어' },
      { name: '심화반 B', subject: '영어' },
    ]);
  });

  it('order ?? Infinity → createdAt 순서(기존 스토어 정렬 규칙)를 따른다', () => {
    const plan = planClassStructureCarryover({
      classes: [
        { id: 'a', name: '뒤', subject: 's', createdAt: '2026-02' },
        { id: 'b', name: '앞', subject: 's', order: 0, createdAt: '2026-03' },
        { id: 'c', name: '중간', subject: 's', createdAt: '2026-01' },
      ],
    });
    expect(plan.singles.map((s) => s.name)).toEqual(['앞', '중간', '뒤']);
  });

  it('관대 파싱 — 배열 루트 허용, 이름 없는 항목·비객체·손상 입력에 throw하지 않는다', () => {
    expect(
      planClassStructureCarryover([
        { id: 'a', name: '1반', subject: '' },
        { id: 'b', subject: '이름 없음' },
        'raw',
        null,
      ]).totalClassCount,
    ).toBe(1);
    expect(planClassStructureCarryover(null).totalClassCount).toBe(0);
    expect(planClassStructureCarryover(undefined).totalClassCount).toBe(0);
    expect(planClassStructureCarryover('broken').totalClassCount).toBe(0);
    expect(planClassStructureCarryover({ classes: 'not-array' }).totalClassCount).toBe(0);
  });
});
