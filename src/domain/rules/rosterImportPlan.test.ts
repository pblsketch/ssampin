import { describe, it, expect } from 'vitest';
import { planImport } from './rosterImportPlan';
import type { Student } from '@domain/entities/Student';
import type { ImportReadyStudent } from './rosterImportRules';

function student(partial: Partial<Student> & Pick<Student, 'id' | 'name'>): Student {
  return {
    studentNumber: 1,
    phone: '',
    parentPhone: '',
    isVacant: false,
    ...partial,
  };
}

function imp(partial: Partial<ImportReadyStudent> & Pick<ImportReadyStudent, 'name' | 'studentNumber'>): ImportReadyStudent {
  return {
    phone: '',
    parentPhone: '',
    parentPhoneLabel: '',
    parentPhone2: '',
    parentPhone2Label: '',
    birthDate: '',
    isVacant: false,
    ...partial,
  };
}

describe('planImport', () => {
  it('완전 매칭 (이름+학번 일치) → matched, id 보존', () => {
    const existing = [student({ id: 'e1', name: '김철수', studentNumber: 1 })];
    const imported = [imp({ name: '김철수', studentNumber: 1 })];
    const result = planImport(existing, imported);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]!.existingId).toBe('e1');
    expect(result.conflicts).toHaveLength(0);
    expect(result.newOnly).toHaveLength(0);
  });

  it('학번 같음 이름 다름 → conflict name_changed', () => {
    const existing = [student({ id: 'e1', name: '김철수', studentNumber: 1 })];
    const imported = [imp({ name: '김민수', studentNumber: 1 })];
    const result = planImport(existing, imported);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.type).toBe('name_changed');
    expect(result.conflicts[0]!.existing.id).toBe('e1');
    expect(result.conflicts[0]!.key).toBe('e1:name_changed');
  });

  it('이름 같음 학번 다름 (활성) → conflict number_changed', () => {
    const existing = [student({ id: 'e1', name: '김철수', studentNumber: 5 })];
    const imported = [imp({ name: '김철수', studentNumber: 99 })];
    const result = planImport(existing, imported);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.type).toBe('number_changed');
    expect(result.conflicts[0]!.existing.id).toBe('e1');
  });

  it('이름 같은 비활성 학생만 있음 → conflict returning_inactive', () => {
    const existing = [
      student({ id: 'e1', name: '이영희', studentNumber: 2, status: 'transferred', isVacant: true }),
    ];
    const imported = [imp({ name: '이영희', studentNumber: 7 })];
    const result = planImport(existing, imported);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.type).toBe('returning_inactive');
    expect(result.conflicts[0]!.existing.id).toBe('e1');
  });

  it('완전 신규 → newOnly', () => {
    const existing = [student({ id: 'e1', name: '김철수', studentNumber: 1 })];
    const imported = [imp({ name: '신학생', studentNumber: 99 })];
    const result = planImport(existing, imported);
    expect(result.newOnly).toHaveLength(1);
    expect(result.newOnly[0]!.name).toBe('신학생');
    expect(result.matched).toHaveLength(0);
    expect(result.conflicts).toHaveLength(0);
  });

  it('동일 매칭 학생 중복 사용 방지 (usedExistingIds)', () => {
    const existing = [student({ id: 'e1', name: '김철수', studentNumber: 1 })];
    const imported = [
      imp({ name: '김철수', studentNumber: 1 }),  // 이름+학번 매칭 → matched
      imp({ name: '김철수', studentNumber: 99 }), // 이름만 매칭 시도, 그러나 e1은 이미 사용됨
    ];
    const result = planImport(existing, imported);
    expect(result.matched).toHaveLength(1);   // 첫 번째만 매칭
    expect(result.newOnly).toHaveLength(1);   // 두 번째는 신규
    expect(result.newOnly[0]!.studentNumber).toBe(99);
  });

  it('이름 trim — 좌우 공백 무시', () => {
    const existing = [student({ id: 'e1', name: '김철수', studentNumber: 1 })];
    const imported = [imp({ name: '  김철수  ', studentNumber: 1 })];
    const result = planImport(existing, imported);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]!.existingId).toBe('e1');
  });

  it('빈 입력 → 빈 결과', () => {
    expect(planImport([], [])).toEqual({ matched: [], conflicts: [], newOnly: [] });
  });

  it('기존 비어있고 신규만 가져오기 → 모두 newOnly', () => {
    const imported = [
      imp({ name: '신학생A', studentNumber: 1 }),
      imp({ name: '신학생B', studentNumber: 2 }),
    ];
    const result = planImport([], imported);
    expect(result.newOnly).toHaveLength(2);
    expect(result.matched).toHaveLength(0);
    expect(result.conflicts).toHaveLength(0);
  });

  it('복합 시나리오 — matched + name_changed + number_changed + newOnly', () => {
    const existing = [
      student({ id: 'e1', name: '김철수', studentNumber: 1 }),  // matched
      student({ id: 'e2', name: '박민수', studentNumber: 3 }),  // name_changed
      student({ id: 'e3', name: '이영희', studentNumber: 5 }),  // number_changed
    ];
    const imported = [
      imp({ name: '김철수', studentNumber: 1 }),    // → matched
      imp({ name: '박지수', studentNumber: 3 }),    // → name_changed (학번 3 같음)
      imp({ name: '이영희', studentNumber: 99 }),   // → number_changed (이름 같음)
      imp({ name: '신학생', studentNumber: 50 }),   // → newOnly
    ];
    const result = planImport(existing, imported);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]!.existingId).toBe('e1');
    expect(result.conflicts).toHaveLength(2);
    const types = result.conflicts.map((c) => c.type).sort();
    expect(types).toEqual(['name_changed', 'number_changed']);
    expect(result.newOnly).toHaveLength(1);
    expect(result.newOnly[0]!.name).toBe('신학생');
  });

  it('비활성 학생 같은 학번 + 같은 이름 → matched (학번 일치 우선)', () => {
    // 비활성이라도 학번+이름 정확히 일치하면 matched. 사용자가 "재입력"이라고 보면 일관됨.
    const existing = [
      student({ id: 'e1', name: '이영희', studentNumber: 2, status: 'withdrawn', isVacant: true }),
    ];
    const imported = [imp({ name: '이영희', studentNumber: 2 })];
    const result = planImport(existing, imported);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]!.existingId).toBe('e1');
  });
});
