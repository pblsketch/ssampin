/**
 * 수업반 사진 명렬표로 **명단까지** 들어가는지.
 *
 * 실제 신고(2026-08-20): 명단이 빈 수업반에 사진 명렬표를 넣었더니
 * `사진 0장을 넣었어요 (22장은 명단과 맞지 않아 넣지 못했어요)` 만 뜨고 아무 일도 안 났다.
 * 창에는 "이 수업반 명단에 반영합니다", 버튼에는 "명단에 반영 (22명)" 이라고 적혀 있었다.
 */
import { describe, it, expect } from 'vitest';
import type { TeachingClassStudent } from '@domain/entities/TeachingClass';
import { mergeRosterFromPhotoRoster } from '../teachingClassRosterMerge';

const NAMES = [
  { studentNumber: 2, name: '권지민', grade: 3, classNum: 1 },
  { studentNumber: 5, name: '박지효', grade: 3, classNum: 1 },
  { studentNumber: 5, name: '김예림', grade: 3, classNum: 2 },
];

describe('mergeRosterFromPhotoRoster', () => {
  it('★명단이 비어 있으면 파일의 학생이 전부 들어간다 (신고된 그 경우)', () => {
    const result = mergeRosterFromPhotoRoster([], NAMES);
    expect(result.added).toBe(3);
    expect(result.students.map((s) => s.name)).toEqual(['권지민', '박지효', '김예림']);
  });

  it('★번호가 같아도 반이 다르면 둘 다 들어간다', () => {
    const result = mergeRosterFromPhotoRoster([], NAMES);
    const fives = result.students.filter((s) => s.number === 5);
    expect(fives.map((s) => s.classNum)).toEqual([1, 2]);
  });

  it('★이미 있는 학생의 이름은 파일 값으로 갈아 끼우지 않는다 (출결이 번호에 묶여 있다)', () => {
    const existing: TeachingClassStudent[] = [{ number: 2, name: '옛이름', grade: 3, classNum: 1 }];
    const result = mergeRosterFromPhotoRoster(existing, [NAMES[0]!]);
    expect(result.added).toBe(0);
    expect(result.students[0]!.name).toBe('옛이름');
    expect(result.students).toBe(existing); // 저장조차 하지 않는다
  });

  it('일부만 겹치면 없는 학생만 더한다', () => {
    const existing: TeachingClassStudent[] = [{ number: 2, name: '권지민', grade: 3, classNum: 1 }];
    const result = mergeRosterFromPhotoRoster(existing, NAMES);
    expect(result.added).toBe(2);
    expect(result.students).toHaveLength(3);
  });

  it('학년 → 반 → 번호 순으로 정렬된다', () => {
    const result = mergeRosterFromPhotoRoster([], [...NAMES].reverse());
    expect(result.students.map((s) => `${s.grade}-${s.classNum}-${s.number}`)).toEqual([
      '3-1-2',
      '3-1-5',
      '3-2-5',
    ]);
  });

  it('파일 안에 같은 학생이 두 번 있어도 한 번만 더한다', () => {
    const result = mergeRosterFromPhotoRoster([], [NAMES[0]!, NAMES[0]!]);
    expect(result.added).toBe(1);
  });

  it('담임 명렬표(소속 없음)도 번호로 처리된다', () => {
    const result = mergeRosterFromPhotoRoster([], [{ studentNumber: 1, name: '강나영' }]);
    expect(result.added).toBe(1);
    expect(result.students[0]).toEqual({ number: 1, name: '강나영' });
  });
});
