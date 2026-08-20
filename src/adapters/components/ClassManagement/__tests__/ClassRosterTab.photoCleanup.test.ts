/**
 * 수업반 명단에서 학생이 빠지면 그 학생의 얼굴 사진도 함께 파기되는지.
 *
 * ## 왜 중요한가
 *
 * 빠뜨리면 **앱 어디에도 안 보이는 얼굴 사진이 컴퓨터·클라우드에 남는다.**
 * 담임 명렬은 처음부터 이렇게 하고 있었는데 수업반만 빠져 있었다
 * (수업반 사진 지원을 나중에 붙이면서 생긴 구멍, 2026-08-20 발견).
 * 개인정보 처리방침이 "명단에서 지우면 사진도 지워진다"고 약속하므로 사실이어야 한다.
 *
 * 화면 전체를 띄우는 대신, 화면이 쓰는 **계산 규칙**(누가 빠졌는가 → 어떤 사진 열쇠인가)을
 * 고정한다. 이 계산이 틀리면 엉뚱한 학생 사진이 지워지거나 아무것도 안 지워진다.
 */
import { describe, it, expect } from 'vitest';
import { studentKey, type TeachingClassStudent } from '@domain/entities/TeachingClass';
import { photoSubjectKey } from '@domain/rules/studentPhotoRules';

/** ClassRosterTab.persistStudents 가 쓰는 것과 같은 계산 */
function removedPhotoKeys(
  classId: string,
  before: readonly TeachingClassStudent[],
  after: readonly TeachingClassStudent[],
): string[] {
  const surviving = new Set(after.map(studentKey));
  return before
    .filter((s) => !surviving.has(studentKey(s)))
    .map((s) => photoSubjectKey('teaching-class', classId, studentKey(s)));
}

const A: TeachingClassStudent = { number: 2, name: '권지민', grade: 3, classNum: 1 };
const B: TeachingClassStudent = { number: 5, name: '박지효', grade: 3, classNum: 1 };
const C: TeachingClassStudent = { number: 5, name: '김예림', grade: 3, classNum: 2 };

describe('수업반에서 학생이 빠지면 사진도 파기한다', () => {
  it('★한 명을 지우면 그 학생 사진만 지운다', () => {
    expect(removedPhotoKeys('tc-1', [A, B], [A])).toEqual(['tc-1--3-1-5']);
  });

  it('★번호가 같아도 반이 다르면 엉뚱한 학생이 지워지지 않는다', () => {
    // 3학년 1반 5번만 빠졌다 — 2반 5번은 그대로 있어야 한다
    expect(removedPhotoKeys('tc-1', [B, C], [C])).toEqual(['tc-1--3-1-5']);
  });

  it('★명단을 통째로 갈아 끼우면(엑셀 가져오기) 옛 학생이 전부 지워진다', () => {
    expect(removedPhotoKeys('tc-1', [A, B, C], [])).toHaveLength(3);
  });

  it('아무도 안 빠졌으면 지울 것이 없다 (괜히 파기하지 않는다)', () => {
    expect(removedPhotoKeys('tc-1', [A, B], [A, B])).toEqual([]);
  });

  it('★수업반이 다르면 열쇠가 갈린다 (한 반 정리가 다른 반을 건드리지 않는다)', () => {
    const a = removedPhotoKeys('tc-1', [A], []);
    const b = removedPhotoKeys('tc-2', [A], []);
    expect(a[0]).not.toBe(b[0]);
  });

  it('학생이 새로 들어오기만 하면 지울 것이 없다', () => {
    expect(removedPhotoKeys('tc-1', [A], [A, B])).toEqual([]);
  });
});
