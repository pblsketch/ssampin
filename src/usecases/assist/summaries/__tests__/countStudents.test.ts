import { describe, expect, it } from 'vitest';
import { countStudents } from '../countStudents';

describe('countStudents', () => {
  it('학생 배열의 길이와 학급명을 반환한다', () => {
    const students = [{ number: 1 }, { number: 2 }, { number: 3 }];
    const result = countStudents(students, '1학년 2반');

    expect(result).toEqual({ className: '1학년 2반', count: 3 });
  });

  it('빈 배열이면 예외 없이 count 0을 반환한다', () => {
    const result = countStudents([], '1학년 2반');

    expect(result).toEqual({ className: '1학년 2반', count: 0 });
  });

  it('반환 객체에 스키마 밖 키가 없다', () => {
    const result = countStudents([], '1학년 2반');

    expect(Object.keys(result).sort()).toEqual(['className', 'count'].sort());
  });
});
