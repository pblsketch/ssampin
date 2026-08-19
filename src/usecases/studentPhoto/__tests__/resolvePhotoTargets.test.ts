/**
 * 사진 ↔ 확정된 학생 연결.
 *
 * 파일을 읽을 때 검산으로 걸러 낸 "얼굴과 이름이 어긋나는" 사고가
 * **저장 직전 이 단계에서 다시 열릴 수 있다.** 그래서 조금이라도 애매하면 붙이지 않는다.
 */
import { describe, it, expect } from 'vitest';
import type { Student } from '@domain/entities/Student';
import { resolvePhotoTargets, type PhotoTargetCandidate } from '../resolvePhotoTargets';

function student(id: string, studentNumber: number, name: string): Student {
  return { id, name, studentNumber };
}

function photo(studentNumber: number, name: string, seed = 1): PhotoTargetCandidate {
  return {
    studentNumber,
    name,
    bytes: new Uint8Array([0xff, 0xd8, seed]),
    mimeType: 'image/jpeg',
  };
}

describe('resolvePhotoTargets', () => {
  it('학번과 이름이 모두 같으면 그 학생의 불변 id 에 붙인다', () => {
    const students = [student('id-1', 1, '강나영'), student('id-2', 2, '김가영')];
    const result = resolvePhotoTargets(students, [photo(1, '강나영'), photo(2, '김가영', 2)]);

    expect(result.unresolved).toEqual([]);
    expect(result.resolved.map((r) => r.studentId)).toEqual(['id-1', 'id-2']);
    expect(result.resolved[1]!.bytes[2]).toBe(2);
  });

  it('이름의 띄어쓰기 차이는 무시한다', () => {
    const students = [student('id-1', 1, '남궁 민수')];
    const result = resolvePhotoTargets(students, [photo(1, '남궁민수')]);
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0]!.studentId).toBe('id-1');
  });

  it('★학번은 같은데 이름이 다르면 붙이지 않는다 (다른 학생일 수 있다)', () => {
    const students = [student('id-1', 1, '김민수')];
    const result = resolvePhotoTargets(students, [photo(1, '김민서')]);

    expect(result.resolved).toEqual([]);
    expect(result.unresolved).toEqual([{ studentNumber: 1, name: '김민서', reason: 'NO_MATCH' }]);
  });

  it('★이름은 같은데 학번이 다르면 붙이지 않는다', () => {
    const students = [student('id-1', 5, '강나영')];
    const result = resolvePhotoTargets(students, [photo(1, '강나영')]);
    expect(result.resolved).toEqual([]);
    expect(result.unresolved[0]!.reason).toBe('NO_MATCH');
  });

  it('★같은 번호·같은 이름이 둘이면 고르지 않고 넘긴다', () => {
    const students = [student('id-1', 1, '강나영'), student('id-2', 1, '강나영')];
    const result = resolvePhotoTargets(students, [photo(1, '강나영')]);

    expect(result.resolved).toEqual([]);
    expect(result.unresolved[0]!.reason).toBe('AMBIGUOUS');
  });

  it('한 학생에게 사진이 두 번 붙지 않는다', () => {
    const students = [student('id-1', 1, '강나영')];
    const result = resolvePhotoTargets(students, [photo(1, '강나영', 1), photo(1, '강나영', 2)]);

    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0]!.bytes[2]).toBe(1);
    expect(result.unresolved[0]!.reason).toBe('NO_MATCH');
  });

  it('명단에 없는 학생의 사진은 목록으로 돌려준다 (붙이지 못한 사진 안내용)', () => {
    const students = [student('id-1', 1, '강나영')];
    const result = resolvePhotoTargets(students, [photo(1, '강나영'), photo(9, '없는학생')]);

    expect(result.resolved).toHaveLength(1);
    expect(result.unresolved).toEqual([{ studentNumber: 9, name: '없는학생', reason: 'NO_MATCH' }]);
  });

  it('학번이 없는 학생은 연결 대상이 아니다', () => {
    const students: Student[] = [{ id: 'id-1', name: '강나영' }];
    const result = resolvePhotoTargets(students, [photo(1, '강나영')]);
    expect(result.resolved).toEqual([]);
  });

  it('사진이 없으면 아무것도 하지 않는다', () => {
    const result = resolvePhotoTargets([student('id-1', 1, '강나영')], []);
    expect(result).toEqual({ resolved: [], unresolved: [] });
  });
});
