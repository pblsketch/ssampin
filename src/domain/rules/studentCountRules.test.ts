import { describe, it, expect } from 'vitest';
import { planStudentCountReduce } from './studentCountRules';
import type { Student, StudentStatus } from '@domain/entities/Student';

function s(
  partial: Partial<Student> & Pick<Student, 'id'> & { num: number; status?: StudentStatus; vacant?: boolean },
): Student {
  const { num, status, vacant, ...rest } = partial;
  return {
    name: `학생${num}`,
    studentNumber: num,
    phone: '',
    parentPhone: '',
    isVacant: vacant ?? false,
    ...(status ? { status } : {}),
    ...rest,
  };
}

describe('planStudentCountReduce', () => {
  it('targetCount >= current.length → safe (변경 없음)', () => {
    const current = [s({ id: 'a', num: 1 }), s({ id: 'b', num: 2 })];
    const plan = planStudentCountReduce(current, 5);
    expect(plan.kind).toBe('safe');
    if (plan.kind === 'safe') {
      expect(plan.newStudents).toEqual(current);
      expect(plan.removedInactive).toEqual([]);
    }
  });

  it('비활성만으로 충분 → safe', () => {
    // 5명 중 끝 2명이 비활성 → 3명으로 줄이기
    const current = [
      s({ id: 'a', num: 1 }),
      s({ id: 'b', num: 2 }),
      s({ id: 'c', num: 3 }),
      s({ id: 'd', num: 4, status: 'transferred', vacant: true }),
      s({ id: 'e', num: 5, status: 'withdrawn', vacant: true }),
    ];
    const plan = planStudentCountReduce(current, 3);
    expect(plan.kind).toBe('safe');
    if (plan.kind === 'safe') {
      expect(plan.newStudents.map((s) => s.id)).toEqual(['a', 'b', 'c']);
      expect(plan.removedInactive.map((s) => s.id)).toEqual(['e', 'd']);
    }
  });

  it('비활성으로 부족 → requiresConfirm', () => {
    // 5명 모두 활성 → 3명으로 줄이기. 활성 2명 제거 confirm 필요
    const current = [
      s({ id: 'a', num: 1 }),
      s({ id: 'b', num: 2 }),
      s({ id: 'c', num: 3 }),
      s({ id: 'd', num: 4 }),
      s({ id: 'e', num: 5 }),
    ];
    const plan = planStudentCountReduce(current, 3);
    expect(plan.kind).toBe('requiresConfirm');
    if (plan.kind === 'requiresConfirm') {
      expect(plan.removedInactive).toEqual([]);
      expect(plan.removedActive.map((s) => s.id)).toEqual(['e', 'd']);
      expect(plan.committed.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    }
  });

  it('비활성 + 활성 혼합 제거 필요 → requiresConfirm', () => {
    // 6명 중 끝번호 1명 비활성. 4명으로 줄이려면 비활성 1 + 활성 1 필요
    const current = [
      s({ id: 'a', num: 1 }),
      s({ id: 'b', num: 2 }),
      s({ id: 'c', num: 3 }),
      s({ id: 'd', num: 4 }),
      s({ id: 'e', num: 5 }),
      s({ id: 'f', num: 6, status: 'transferred', vacant: true }),
    ];
    const plan = planStudentCountReduce(current, 4);
    expect(plan.kind).toBe('requiresConfirm');
    if (plan.kind === 'requiresConfirm') {
      expect(plan.removedInactive.map((s) => s.id)).toEqual(['f']);
      expect(plan.removedActive.map((s) => s.id)).toEqual(['e']);
      expect(plan.committed.map((s) => s.id)).toEqual(['a', 'b', 'c', 'd']);
    }
  });

  it('학번 정렬 — 학번이 섞여 있어도 정렬 후 처리', () => {
    const current = [
      s({ id: 'c', num: 3 }),
      s({ id: 'a', num: 1 }),
      s({ id: 'b', num: 2 }),
    ];
    const plan = planStudentCountReduce(current, 2);
    expect(plan.kind).toBe('requiresConfirm');
    if (plan.kind === 'requiresConfirm') {
      expect(plan.removedActive.map((s) => s.id)).toEqual(['c']);
      expect(plan.committed.map((s) => s.id)).toEqual(['a', 'b']);
    }
  });

  it('targetCount = current.length → safe (변경 없음)', () => {
    const current = [s({ id: 'a', num: 1 }), s({ id: 'b', num: 2 })];
    const plan = planStudentCountReduce(current, 2);
    expect(plan.kind).toBe('safe');
  });

  it('비활성 학생이 중간에 있어도 끝번호 기준으로 동작', () => {
    // 1·2·3·4·5번 중 3번이 비활성. 4명으로 줄이려면 비활성 우선 → 3번 제거하면 안 되고 5번부터 봐야
    // 알고리즘은 끝번호부터 비활성 검사하므로 5번 (활성 → 패스), 4번 (활성 → 패스), 3번 (비활성 → 수집)
    const current = [
      s({ id: 'a', num: 1 }),
      s({ id: 'b', num: 2 }),
      s({ id: 'c', num: 3, status: 'transferred', vacant: true }),
      s({ id: 'd', num: 4 }),
      s({ id: 'e', num: 5 }),
    ];
    const plan = planStudentCountReduce(current, 4); // 1명 제거 필요
    expect(plan.kind).toBe('safe');
    if (plan.kind === 'safe') {
      expect(plan.removedInactive.map((s) => s.id)).toEqual(['c']);
      expect(plan.newStudents.map((s) => s.id)).toEqual(['a', 'b', 'd', 'e']);
    }
  });
});
