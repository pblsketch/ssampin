import { describe, it, expect } from 'vitest';
import {
  detectStudentNumberIssues,
  assignSequentialNumbers,
  type StudentNumberEntry,
} from './studentNumberRules';

describe('detectStudentNumberIssues — 번호 누락/중복 탐지', () => {
  it('고유한 1..N 번호는 문제 없음', () => {
    const students: StudentNumberEntry[] = [{ number: 1 }, { number: 2 }, { number: 3 }];
    const r = detectStudentNumberIssues(students);
    expect(r.hasCollisionRisk).toBe(false);
    expect(r.missingCount).toBe(0);
    expect(r.duplicateKeys).toHaveLength(0);
  });

  it('번호 미입력(undefined)을 누락으로 집계', () => {
    const students: StudentNumberEntry[] = [{ number: 1 }, {}, {}];
    const r = detectStudentNumberIssues(students);
    expect(r.missingCount).toBe(2);
    expect(r.hasCollisionRisk).toBe(true);
  });

  it('번호 0 도 누락으로 집계 (모바일 ?? 0 뭉개짐 대응)', () => {
    const students: StudentNumberEntry[] = [{ number: 0 }, { number: 0 }];
    const r = detectStudentNumberIssues(students);
    expect(r.missingCount).toBe(2);
    expect(r.duplicateKeys).toContain('0');
    expect(r.hasCollisionRisk).toBe(true);
  });

  it('같은 번호 중복을 duplicateKeys 로 보고', () => {
    const students: StudentNumberEntry[] = [{ number: 5 }, { number: 5 }, { number: 6 }];
    const r = detectStudentNumberIssues(students);
    expect(r.duplicateKeys).toEqual(['5']);
    expect(r.hasCollisionRisk).toBe(true);
  });

  it('학년-반이 다르면 같은 번호라도 충돌 아님', () => {
    const students: StudentNumberEntry[] = [
      { number: 1, grade: 1, classNum: 1 },
      { number: 1, grade: 1, classNum: 2 },
    ];
    const r = detectStudentNumberIssues(students);
    expect(r.hasCollisionRisk).toBe(false);
  });

  it('같은 학년-반에서 번호 중복이면 충돌', () => {
    const students: StudentNumberEntry[] = [
      { number: 1, grade: 1, classNum: 3 },
      { number: 1, grade: 1, classNum: 3 },
    ];
    const r = detectStudentNumberIssues(students);
    expect(r.duplicateKeys).toEqual(['1-3-1']);
    expect(r.hasCollisionRisk).toBe(true);
  });
});

describe('assignSequentialNumbers — 신규 명렬표 순번 재부여', () => {
  it('학년/반 없는 명단은 전체 1..N', () => {
    const out = assignSequentialNumbers([{ name: 'a' }, { name: 'b' }, { name: 'c' }] as never);
    expect(out.map((s) => s.number)).toEqual([1, 2, 3]);
  });

  it('학년-반 그룹별로 각각 1..N', () => {
    const students: StudentNumberEntry[] = [
      { grade: 1, classNum: 1 },
      { grade: 1, classNum: 1 },
      { grade: 1, classNum: 2 },
    ];
    const out = assignSequentialNumbers(students);
    expect(out.map((s) => s.number)).toEqual([1, 2, 1]);
  });

  it('중복/누락 번호를 고유하게 정리한다', () => {
    const students: StudentNumberEntry[] = [{ number: 5 }, { number: 5 }, {}];
    const out = assignSequentialNumbers(students);
    expect(detectStudentNumberIssues(out).hasCollisionRisk).toBe(false);
    expect(out.map((s) => s.number)).toEqual([1, 2, 3]);
  });

  it('원본 순서·다른 필드를 보존한다', () => {
    const students = [
      { number: 9, name: '가', grade: 2, classNum: 4 },
      { number: 9, name: '나', grade: 2, classNum: 4 },
    ];
    const out = assignSequentialNumbers(students);
    expect(out.map((s) => s.name)).toEqual(['가', '나']);
    expect(out.map((s) => s.number)).toEqual([1, 2]);
  });
});
