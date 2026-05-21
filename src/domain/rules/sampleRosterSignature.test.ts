import { describe, it, expect } from 'vitest';
import { SAMPLE_ROSTER_SIGNATURE, isSampleRoster, hasUserDataMarks } from './sampleRosterSignature';
import type { Student } from '@domain/entities/Student';

/**
 * 시그니처 그대로의 35명을 Student[] 형태로 빚어내는 헬퍼.
 * 기본적으로 phone/parentPhone은 빈 문자열, isVacant는 false.
 */
function buildSampleStudents(): Student[] {
  return SAMPLE_ROSTER_SIGNATURE.map((s) => ({
    id: s.id,
    name: s.name,
    studentNumber: s.studentNumber,
    phone: '',
    parentPhone: '',
    isVacant: false,
  }));
}

describe('isSampleRoster — 가드 A·B·C 통합', () => {
  it('SAMPLE 35명 정확 일치 → true', () => {
    const students = buildSampleStudents();
    expect(isSampleRoster(students)).toBe(true);
  });

  it('SAMPLE 35명 중 첫 학생(김민지)의 이름만 변경 → false (가드 C — name 매칭 실패)', () => {
    const students = buildSampleStudents();
    students[0] = { ...students[0]!, name: '김민준' };
    expect(isSampleRoster(students)).toBe(false);
  });

  it('첫 학생 id가 s01 → student-001 로 바뀜 → false (가드 B — id 매칭 실패)', () => {
    const students = buildSampleStudents();
    students[0] = { ...students[0]!, id: 'student-001' };
    expect(isSampleRoster(students)).toBe(false);
  });

  it('34명 (마지막 한 명 삭제) → false (가드 A — 길이 mismatch)', () => {
    const students = buildSampleStudents().slice(0, 34);
    expect(students).toHaveLength(34);
    expect(isSampleRoster(students)).toBe(false);
  });

  it('36명 (한 명 추가) → false (가드 A — 길이 mismatch)', () => {
    const students = buildSampleStudents();
    students.push({
      id: 's36',
      name: '신규학생',
      studentNumber: 36,
      phone: '',
      parentPhone: '',
      isVacant: false,
    });
    expect(students).toHaveLength(36);
    expect(isSampleRoster(students)).toBe(false);
  });
});

describe('hasUserDataMarks — 가드 E', () => {
  it('모두 빈 값(phone="" 등) → false', () => {
    const students = buildSampleStudents();
    expect(hasUserDataMarks(students)).toBe(false);
  });

  it('김민지(첫 학생) phone에 "010-1234-5678" 입력 → true', () => {
    const students = buildSampleStudents();
    students[0] = { ...students[0]!, phone: '010-1234-5678' };
    expect(hasUserDataMarks(students)).toBe(true);
  });
});
