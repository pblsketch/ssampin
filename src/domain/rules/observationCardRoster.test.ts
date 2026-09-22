import { describe, it, expect } from 'vitest';
import type { Student } from '../entities/Student';
import type { TeachingClassStudent } from '../entities/TeachingClass';
import { homeroomTiles, subjectTiles, teachingClassTitle } from './observationCardRoster';

describe('담임반 칸', () => {
  it('번호순, 재학 중인 학생만, 배열 위치가 아니라 명렬표 번호', () => {
    const students: Student[] = [
      { id: 'b', name: '나', studentNumber: 2 },
      { id: 'a', name: '가', studentNumber: 1 },
      { id: 'c', name: '다', studentNumber: 3, status: 'transferred' },
      { id: 'd', name: '라', studentNumber: 4 },
    ];
    const tiles = homeroomTiles(students);
    expect(tiles.map((t) => [t.ref, t.label])).toEqual([
      ['a', '1'],
      ['b', '2'],
      ['d', '4'],
    ]);
  });
});

describe('수업반 칸', () => {
  it('한 반이면 번호만 적는다', () => {
    const students: TeachingClassStudent[] = [
      { number: 2, name: '나' },
      { number: 1, name: '가' },
    ];
    expect(subjectTiles(students).map((t) => [t.ref, t.label])).toEqual([
      ['1', '1'],
      ['2', '2'],
    ]);
  });

  it('여러 학급이 섞인 반은 "반-번호"로 적고 반 → 번호 순', () => {
    const students: TeachingClassStudent[] = [
      { number: 15, name: '가', grade: 2, classNum: 4 },
      { number: 15, name: '나', grade: 2, classNum: 3 },
      { number: 2, name: '다', grade: 2, classNum: 4 },
    ];
    const tiles = subjectTiles(students);
    expect(tiles.map((t) => t.label)).toEqual(['3-15', '4-2', '4-15']);
    expect(tiles.map((t) => t.ref)).toEqual(['2-3-15', '2-4-2', '2-4-15']);
  });

  it('학년까지 섞인 반은 "학년-반-번호"로 적는다 — 1학년 3반과 2학년 3반이 겹치지 않게', () => {
    const students: TeachingClassStudent[] = [
      { number: 15, name: '가', grade: 2, classNum: 3 },
      { number: 15, name: '나', grade: 1, classNum: 3 },
    ];
    expect(subjectTiles(students).map((t) => t.label)).toEqual(['1-3-15', '2-3-15']);
  });

  it('재학 중이 아닌 학생은 칸이 없다', () => {
    const students: TeachingClassStudent[] = [
      { number: 1, name: '가' },
      { number: 2, name: '나', status: 'withdrawn' },
    ];
    expect(subjectTiles(students)).toHaveLength(1);
  });
});

describe('수업반 카드 이름', () => {
  it('반 이름에 과목이 들어 있으면 다시 붙이지 않는다', () => {
    expect(teachingClassTitle('2-3', '국어')).toBe('2-3 국어');
    expect(teachingClassTitle('선택 문학', '문학')).toBe('선택 문학');
    expect(teachingClassTitle('2-3', ' ')).toBe('2-3');
    expect(teachingClassTitle('', '국어')).toBe('국어');
  });
});
