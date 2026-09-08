/**
 * 학생 번호 무결성 회귀 테스트 (2026-09-08 검토 A·B·C·D·E).
 *
 * ★ `docs/03-analysis/student-number-audit-20260908.cjs` 는 **결함을 재현**하는 스크립트다.
 *   그 스크립트가 통과하면 결함이 살아 있다는 뜻이다. 이 파일은 반대로 **올바른 동작**을 고정한다.
 *   수정이 되돌아가면 여기가 빨개진다.
 */
import { describe, it, expect } from 'vitest';
import {
  rosterNumberOf,
  numberRoster,
  numberActiveRoster,
  activeRosterNumbers,
} from '@domain/rules/rosterNumbering';
import {
  hasConflictingAffiliation,
  matchSubmissionsToStudents,
} from '@domain/rules/submissionMatching';
import type { Student } from '@domain/entities/Student';

/* ─────────── 공통 가상 명단 ─────────── */

const roster: Student[] = [
  { id: 'a', name: '가상가', studentNumber: 1, status: 'active' },
  { id: 'b', name: '가상나', studentNumber: 2, status: 'transferred' },
  { id: 'c', name: '가상다', studentNumber: 3, status: 'active' },
];

describe('A. 결번 뒤 번호가 밀리지 않는다 — rosterNumbering', () => {
  it('2번 전출 → 남은 학생은 1번·3번 그대로', () => {
    expect(numberActiveRoster(roster).map((e) => e.number)).toEqual([1, 3]);
  });

  it('결번 행을 아예 지워도(1·3만 남음) 3번은 3번이다', () => {
    const deleted: Student[] = [roster[0]!, roster[2]!];
    expect(numberActiveRoster(deleted).map((e) => e.number)).toEqual([1, 3]);
  });

  it('명단 정렬이 바뀌어도 이름↔번호 짝이 유지된다', () => {
    const shuffled = [roster[2]!, roster[0]!, roster[1]!];
    const byName = new Map(numberActiveRoster(shuffled).map((e) => [e.student.name, e.number]));
    expect(byName.get('가상가')).toBe(1);
    expect(byName.get('가상다')).toBe(3);
  });

  it('전출 학생이 쓰던 번호는 번호 없는 학생에게 넘어가지 않는다', () => {
    const withMissing: Student[] = [
      ...roster,
      { id: 'd', name: '가상라', status: 'active' }, // 번호 없음
    ];
    const numbers = numberActiveRoster(withMissing).map((e) => e.number);
    expect(numbers).not.toContain(2); // 2번은 전출 학생이 예약해 둔 자리
    expect(numbers).toEqual([1, 3, 4]);
  });

  it('번호가 아예 없는 명단은 예전처럼 1..N (하위 호환)', () => {
    const noNumbers: Student[] = [
      { id: 'x', name: '가상하나' },
      { id: 'y', name: '가상둘' },
    ];
    expect(numberActiveRoster(noNumbers).map((e) => e.number)).toEqual([1, 2]);
  });

  it('번호 중복은 조용히 넘어가지 않고 새 번호로 갈라진다', () => {
    const dup: Student[] = [
      { id: 'p', name: '가상피', studentNumber: 5, status: 'active' },
      { id: 'q', name: '가상큐', studentNumber: 5, status: 'active' },
    ];
    const out = numberRoster(dup);
    expect(new Set(out.map((e) => e.number)).size).toBe(2);
    expect(out.every((e) => e.filled)).toBe(true); // 화면이 "채운 번호"라고 알 수 있다
  });

  it('수업반은 number, 담임은 studentNumber 를 읽는다', () => {
    expect(rosterNumberOf({ number: 7 })).toBe(7);
    expect(rosterNumberOf({ studentNumber: 9 })).toBe(9);
    expect(rosterNumberOf({ studentNumber: 0 })).toBeUndefined();
    expect(rosterNumberOf({})).toBeUndefined();
  });
});

describe('D. 결번이 있어도 마지막 번호까지 살아 있다 — activeRosterNumbers', () => {
  it('1~33 중 2명 비활성 → 활성 31명이지만 32·33 은 그대로 있고 결번은 없다', () => {
    const big: Student[] = Array.from({ length: 33 }, (_, i) => ({
      id: `s${i + 1}`,
      name: `가상${i + 1}`,
      studentNumber: i + 1,
      status: i + 1 === 4 || i + 1 === 17 ? ('transferred' as const) : ('active' as const),
    }));
    const numbers = activeRosterNumbers(big);
    expect(numbers).toHaveLength(31);
    expect(numbers).toContain(32);
    expect(numbers).toContain(33);
    expect(numbers).not.toContain(4);
    expect(numbers).not.toContain(17);
  });
});

describe('B. 다른 반 같은 번호는 다른 학생이다 — submissionMatching', () => {
  const students = [
    { id: 'x', name: '가상1반', number: 3, grade: 1, classNum: 1 },
    { id: 'y', name: '가상2반', number: 3, grade: 1, classNum: 2 },
  ];
  const submission = {
    id: 'sub-x',
    studentId: 'x',
    studentNumber: 3,
    studentGrade: '1',
    studentClass: '1',
  };

  it('1반 3번의 제출이 2반 3번에게 붙지 않는다', () => {
    const { byStudentId } = matchSubmissionsToStudents(students, [submission]);
    expect(byStudentId.get('x')?.id).toBe('sub-x');
    expect(byStudentId.get('y')).toBeUndefined();
  });

  it('학생 id 가 없어도 학년·반이 다르면 붙지 않는다', () => {
    const anon = { id: 'sub-anon', studentNumber: 3, studentGrade: '1', studentClass: '1' };
    const { byStudentId, unmatched } = matchSubmissionsToStudents(students, [anon]);
    expect(byStudentId.get('x')?.id).toBe('sub-anon');
    expect(byStudentId.get('y')).toBeUndefined();
    expect(unmatched).toHaveLength(0);
  });

  it('소속이 어긋난 제출물은 아무에게도 안 붙고 unmatched 로 나온다', () => {
    const foreign = { id: 'sub-9', studentNumber: 3, studentGrade: '2', studentClass: '9' };
    const { byStudentId, unmatched } = matchSubmissionsToStudents(students, [foreign]);
    expect(byStudentId.size).toBe(0);
    expect(unmatched.map((s) => s.id)).toEqual(['sub-9']);
  });

  it('소속 정보가 없는 구형 제출물은 같은 번호 학생이 둘이면 추측하지 않는다', () => {
    const legacy = { id: 'sub-old', studentNumber: 3 };
    const { byStudentId, unmatched } = matchSubmissionsToStudents(students, [legacy]);
    expect(byStudentId.size).toBe(0);
    expect(unmatched).toHaveLength(1);
  });

  it('담임반(소속 없는 명단)의 정상 제출은 그대로 붙는다 — 과도 차단 방지', () => {
    const homeroom = [
      { id: 'h1', name: '가상가', number: 1 },
      { id: 'h3', name: '가상다', number: 3 },
    ];
    const subs = [
      { id: 'sub-1', studentNumber: 1, studentName: '가상가' },
      { id: 'sub-3', studentNumber: 3, studentGrade: '1', studentClass: '5' },
    ];
    const { byStudentId, unmatched } = matchSubmissionsToStudents(homeroom, subs);
    expect(byStudentId.get('h1')?.id).toBe('sub-1');
    expect(byStudentId.get('h3')?.id).toBe('sub-3');
    expect(unmatched).toHaveLength(0);
  });

  it('제출물 하나는 학생 한 명에게만 붙는다', () => {
    const twins = [
      { id: 'm', name: '가상엠', number: 3 },
      { id: 'n', name: '가상엔', number: 3 },
    ];
    const { byStudentId } = matchSubmissionsToStudents(twins, [
      { id: 'sub-3', studentId: 'm', studentNumber: 3 },
    ]);
    expect(byStudentId.get('m')?.id).toBe('sub-3');
    expect(byStudentId.get('n')).toBeUndefined();
  });

  it('hasConflictingAffiliation 는 한쪽만 소속이 있을 때는 충돌로 보지 않는다', () => {
    expect(
      hasConflictingAffiliation(
        { id: 'a', number: 1 },
        { studentNumber: 1, studentGrade: '1', studentClass: '2' },
      ),
    ).toBe(false);
    expect(
      hasConflictingAffiliation(
        { id: 'a', number: 1, grade: 1, classNum: 1 },
        { studentNumber: 1, studentGrade: '1', studentClass: '2' },
      ),
    ).toBe(true);
  });
});
