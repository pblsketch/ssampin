import { describe, it, expect } from 'vitest';
import { gradeStudentKey, parseGradeStudentKey } from './studentGradeKeyRules';

describe('gradeStudentKey — 학생 키 생성', () => {
  it('학년·반 있으면 g-c-n-name', () => {
    expect(gradeStudentKey({ grade: 2, classNum: 3, number: 5, name: '홍길동' })).toBe(
      '2-3-5-홍길동',
    );
  });

  it('학년·반 없으면 n-name', () => {
    expect(gradeStudentKey({ number: 5, name: '김철수' })).toBe('5-김철수');
  });

  it('이름 공백은 제거', () => {
    expect(gradeStudentKey({ grade: 1, classNum: 1, number: 1, name: '홍 길동' })).toBe(
      '1-1-1-홍길동',
    );
  });
});

describe('parseGradeStudentKey — 키 파싱', () => {
  it('4필드 라운드트립', () => {
    expect(parseGradeStudentKey('2-3-5-홍길동')).toEqual({
      grade: 2,
      classNum: 3,
      number: 5,
      name: '홍길동',
    });
  });

  it('2필드 라운드트립', () => {
    expect(parseGradeStudentKey('5-김철수')).toEqual({ number: 5, name: '김철수' });
  });

  it('이름에 하이픈이 있어도 복원', () => {
    expect(parseGradeStudentKey('2-3-5-홍-길동')).toEqual({
      grade: 2,
      classNum: 3,
      number: 5,
      name: '홍-길동',
    });
  });

  it('형식이 아니면 null', () => {
    expect(parseGradeStudentKey('garbage')).toBeNull();
    expect(parseGradeStudentKey('')).toBeNull();
  });
});
