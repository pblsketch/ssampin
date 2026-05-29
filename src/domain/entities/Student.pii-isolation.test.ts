import { describe, it, expect } from 'vitest';
import type { Student } from './Student';
import type { StudentPiiOverlay } from './StudentPiiOverlay';
import { emptyOverlay, hasAnyPii } from './StudentPiiOverlay';
import type { Gender } from '@domain/valueObjects/Gender';
import type { AcademicLevel } from '@domain/valueObjects/AcademicLevel';

/**
 * Student PII Isolation Test
 *
 * Acceptance: 'Student type does not allow gender/academicLevel assignment at compile time'
 *
 * 본 파일은 두 가지 보증을 검증한다:
 * 1. **컴파일 타임 격리** — Student 객체 리터럴에 gender/academicLevel을 넣으면 tsc 에러 (TypeScript noUnused/excess property check).
 * 2. **런타임 격리** — StudentPiiOverlay 헬퍼 함수가 정상 동작.
 *
 * 컴파일 타임 검증은 `@ts-expect-error` 마커로 확인한다 (마커가 사라지면 시그니처가 변경되어 PII 격리가 깨진 것).
 */
describe('Student type — PII isolation', () => {
  it('Student literal does NOT accept gender field (compile-time guarantee)', () => {
    // @ts-expect-error — Student 인터페이스에 gender 필드 없음. ADR Decision 1 (PII isolation by construction).
    const _illegalStudent: Student = { id: 's1', name: '테스트', gender: 'M' };
    expect(_illegalStudent.id).toBe('s1');
  });

  it('Student literal does NOT accept academicLevel field (compile-time guarantee)', () => {
    // @ts-expect-error — Student 인터페이스에 academicLevel 필드 없음. ADR Decision 1.
    const _illegalStudent: Student = { id: 's2', name: '테스트', academicLevel: 'A' };
    expect(_illegalStudent.id).toBe('s2');
  });

  it('StudentPiiOverlay 별도 aggregate에 PII 보관', () => {
    const g: Gender = 'M';
    const lv: AcademicLevel = 'A';
    const overlay: StudentPiiOverlay = {
      studentId: 's1',
      gender: g,
      academicLevel: lv,
    };
    expect(overlay.studentId).toBe('s1');
    expect(overlay.gender).toBe('M');
    expect(overlay.academicLevel).toBe('A');
  });

  it('Overlay gender/academicLevel은 optional (미지정 허용)', () => {
    const overlay: StudentPiiOverlay = { studentId: 's2' };
    expect(overlay.gender).toBeUndefined();
    expect(overlay.academicLevel).toBeUndefined();
  });

  it('emptyOverlay()는 studentId만 보유', () => {
    const overlay = emptyOverlay('s3');
    expect(overlay.studentId).toBe('s3');
    expect(hasAnyPii(overlay)).toBe(false);
  });

  it('hasAnyPii()는 gender 단독, academicLevel 단독, 둘 다, 둘 다 미지정을 정확히 구분', () => {
    expect(hasAnyPii({ studentId: 's1', gender: 'F' })).toBe(true);
    expect(hasAnyPii({ studentId: 's1', academicLevel: 'B' })).toBe(true);
    expect(hasAnyPii({ studentId: 's1', gender: 'M', academicLevel: 'C' })).toBe(true);
    expect(hasAnyPii({ studentId: 's1' })).toBe(false);
  });

});
