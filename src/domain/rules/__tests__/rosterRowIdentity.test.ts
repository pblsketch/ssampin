/**
 * 명렬표 한 줄을 가리키는 열쇠와 이름표.
 *
 * 실제 신고(2026-08-20): 수업반 사진 명렬표 미리보기에서 **여러 학생에게 같은 얼굴**이 떴다
 * (5번 두 명이 같은 사진, 14번 세 명이 같은 사진). 원인은 사진을 **번호만으로** 기억한 것 —
 * 수업반은 여러 반이 섞여 번호가 겹치므로 뒤 학생이 앞 학생을 덮어썼다.
 * 같은 신고에 "수업반은 학년·반·번호·이름이 다 떠야 한다"도 함께 들어왔다.
 */
import { describe, it, expect } from 'vitest';
import { rosterRowKey, rosterRowLabel, compareRosterRows } from '../rosterNameCell';

describe('rosterRowKey', () => {
  it('★번호가 같아도 반이 다르면 열쇠가 갈린다 (사진이 서로 덮이지 않게)', () => {
    const a = rosterRowKey({ studentNumber: 5, grade: 3, classNum: 1 });
    const b = rosterRowKey({ studentNumber: 5, grade: 3, classNum: 2 });
    expect(a).not.toBe(b);
  });

  it('★같은 학생이면 같은 열쇠 (사진이 붙어야 한다)', () => {
    expect(rosterRowKey({ studentNumber: 5, grade: 3, classNum: 1 })).toBe(
      rosterRowKey({ studentNumber: 5, grade: 3, classNum: 1 }),
    );
  });

  it('담임(소속 없음)은 번호가 곧 열쇠', () => {
    expect(rosterRowKey({ studentNumber: 7 })).toBe('7');
  });

  it('★수업반 22명이 전부 다른 열쇠를 갖는다', () => {
    const rows = Array.from({ length: 22 }, (_, i) => ({
      studentNumber: (i % 8) + 1, // 번호는 일부러 겹치게
      grade: 3,
      classNum: Math.floor(i / 8) + 1,
    }));
    expect(new Set(rows.map(rosterRowKey)).size).toBe(22);
  });
});

describe('rosterRowLabel', () => {
  it('★수업반은 학년·반·번호·이름이 모두 보인다', () => {
    expect(rosterRowLabel({ studentNumber: 2, name: '권지민', grade: 3, classNum: 1 })).toBe(
      '3학년 1반 2번 권지민',
    );
  });

  it('담임은 번호와 이름만 (없는 소속을 지어내지 않는다)', () => {
    expect(rosterRowLabel({ studentNumber: 1, name: '강나영' })).toBe('1번 강나영');
  });
});

describe('compareRosterRows', () => {
  it('학년 → 반 → 번호 순', () => {
    const rows = [
      { studentNumber: 2, grade: 3, classNum: 2 },
      { studentNumber: 9, grade: 3, classNum: 1 },
      { studentNumber: 1, grade: 2, classNum: 5 },
    ];
    expect(
      [...rows].sort(compareRosterRows).map((r) => `${r.grade}-${r.classNum}-${r.studentNumber}`),
    ).toEqual(['2-5-1', '3-1-9', '3-2-2']);
  });
});
