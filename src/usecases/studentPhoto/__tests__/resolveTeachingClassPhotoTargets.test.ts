/**
 * 수업반 사진 ↔ 수업반 학생 연결.
 *
 * 수업반 학생에게는 불변 id 가 없고 `학년-반-번호` 로만 구분한다.
 * 수업반 사진 명렬표에는 그 세 값이 그대로 적혀 있어(`3학년 1반 2번  권지민`) 바로 맞출 수 있다.
 * 다만 **이름까지 같아야** 붙인다 — 번호만 맞고 이름이 다르면 그 사이에 학생이 바뀐 것이다.
 */
import { describe, it, expect } from 'vitest';
import type { TeachingClassStudent } from '@domain/entities/TeachingClass';
import {
  resolveTeachingClassPhotoTargets,
  type TeachingClassPhotoInput,
} from '../resolveTeachingClassPhotoTargets';

function student(number: number, name: string, grade = 3, classNum = 1): TeachingClassStudent {
  return { number, name, grade, classNum };
}

function photo(
  studentNumber: number,
  name: string,
  grade = 3,
  classNum = 1,
  seed = 1,
): TeachingClassPhotoInput {
  return {
    studentNumber,
    name,
    grade,
    classNum,
    bytes: new Uint8Array([0xff, 0xd8, seed]),
    mimeType: 'image/jpeg',
  };
}

const CLASS_ID = 'tc-고전읽기';

describe('resolveTeachingClassPhotoTargets', () => {
  it('학년·반·번호와 이름이 모두 같으면 붙인다', () => {
    const students = [student(2, '권지민'), student(10, '안혜지', 3, 2)];
    const result = resolveTeachingClassPhotoTargets(CLASS_ID, students, [
      photo(2, '권지민'),
      photo(10, '안혜지', 3, 2, 2),
    ]);

    expect(result.unresolved).toEqual([]);
    expect(result.resolved.map((r) => r.subjectKey)).toEqual([
      'tc-고전읽기--3-1-2',
      'tc-고전읽기--3-2-10',
    ]);
  });

  it('★반이 다르면 같은 번호라도 섞이지 않는다', () => {
    // 수업반은 여러 반 학생이 섞이므로 번호만으로는 구분되지 않는다
    const students = [student(2, '권지민', 3, 1), student(2, '다른학생', 3, 2)];
    const result = resolveTeachingClassPhotoTargets(CLASS_ID, students, [
      photo(2, '권지민', 3, 1),
      photo(2, '다른학생', 3, 2, 2),
    ]);

    expect(result.resolved.map((r) => r.subjectKey)).toEqual([
      'tc-고전읽기--3-1-2',
      'tc-고전읽기--3-2-2',
    ]);
  });

  it('★번호는 같은데 이름이 다르면 붙이지 않는다 (그 사이에 학생이 바뀐 것)', () => {
    const result = resolveTeachingClassPhotoTargets(
      CLASS_ID,
      [student(2, '권지민')],
      [photo(2, '김민서')],
    );
    expect(result.resolved).toEqual([]);
    expect(result.unresolved[0]!.reason).toBe('NO_MATCH');
  });

  it('띄어쓰기 차이는 무시한다', () => {
    const result = resolveTeachingClassPhotoTargets(
      CLASS_ID,
      [student(2, '남궁 민수')],
      [photo(2, '남궁민수')],
    );
    expect(result.resolved).toHaveLength(1);
  });

  it('명단에 없는 학생은 목록으로 돌려준다', () => {
    const result = resolveTeachingClassPhotoTargets(
      CLASS_ID,
      [student(2, '권지민')],
      [photo(2, '권지민'), photo(99, '없는학생')],
    );
    expect(result.resolved).toHaveLength(1);
    expect(result.unresolved).toEqual([
      { studentNumber: 99, name: '없는학생', reason: 'NO_MATCH' },
    ]);
  });

  it('한 학생에게 사진이 두 번 붙지 않는다', () => {
    const result = resolveTeachingClassPhotoTargets(
      CLASS_ID,
      [student(2, '권지민')],
      [photo(2, '권지민', 3, 1, 1), photo(2, '권지민', 3, 1, 2)],
    );
    expect(result.resolved).toHaveLength(1);
    expect(result.unresolved).toHaveLength(1);
  });

  it('★같은 반 사진이라도 수업반이 다르면 키가 갈린다 (한 반 삭제가 다른 반을 건드리지 않게)', () => {
    const students = [student(2, '권지민')];
    const a = resolveTeachingClassPhotoTargets('tc-1', students, [photo(2, '권지민')]);
    const b = resolveTeachingClassPhotoTargets('tc-2', students, [photo(2, '권지민')]);
    expect(a.resolved[0]!.subjectKey).not.toBe(b.resolved[0]!.subjectKey);
  });

  it('사진이 없으면 아무것도 하지 않는다', () => {
    expect(resolveTeachingClassPhotoTargets(CLASS_ID, [student(2, '권지민')], [])).toEqual({
      resolved: [],
      unresolved: [],
    });
  });
});
