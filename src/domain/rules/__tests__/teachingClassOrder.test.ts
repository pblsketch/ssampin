import { describe, it, expect } from 'vitest';
import type { TeachingClass } from '@domain/entities/TeachingClass';
import { sortTeachingClasses } from '../teachingClassOrder';

function makeClass(overrides: Partial<TeachingClass> = {}): TeachingClass {
  return {
    id: 'tc-1',
    name: '3학년 1반',
    subject: '수학',
    students: [],
    createdAt: '2026-03-02T00:00:00.000Z',
    updatedAt: '2026-03-02T00:00:00.000Z',
    ...overrides,
  };
}

describe('sortTeachingClasses', () => {
  it('배열 순서가 아니라 order 값을 따른다', () => {
    // 재배치는 저장 파일의 배열 순서를 바꾸지 않고 order 숫자만 갱신한다.
    // 사용자 신고(2026-08-24)의 재현: PC에서 2-7을 맨 뒤로 보냈는데
    // 파일 배열은 2-7,2-8,2-9 그대로다.
    const fileOrder = [
      makeClass({ id: 'c7', name: '2-7', order: 2 }),
      makeClass({ id: 'c8', name: '2-8', order: 0 }),
      makeClass({ id: 'c9', name: '2-9', order: 1 }),
    ];

    expect(sortTeachingClasses(fileOrder).map((c) => c.name)).toEqual(['2-8', '2-9', '2-7']);
  });

  it('order 가 없는 반은 맨 뒤로 보내고, 그들끼리는 생성순으로 둔다', () => {
    const list = [
      makeClass({ id: 'new-b', createdAt: '2026-04-02T00:00:00.000Z' }),
      makeClass({ id: 'ordered', order: 5 }),
      makeClass({ id: 'new-a', createdAt: '2026-04-01T00:00:00.000Z' }),
    ];

    expect(sortTeachingClasses(list).map((c) => c.id)).toEqual(['ordered', 'new-a', 'new-b']);
  });

  it('order 가 같으면 생성순으로 가른다', () => {
    const list = [
      makeClass({ id: 'late', order: 0, createdAt: '2026-03-05T00:00:00.000Z' }),
      makeClass({ id: 'early', order: 0, createdAt: '2026-03-01T00:00:00.000Z' }),
    ];

    expect(sortTeachingClasses(list).map((c) => c.id)).toEqual(['early', 'late']);
  });

  it('원본 배열을 건드리지 않는다', () => {
    const list = [makeClass({ id: 'b', order: 1 }), makeClass({ id: 'a', order: 0 })];
    const before = list.map((c) => c.id);

    sortTeachingClasses(list);

    expect(list.map((c) => c.id)).toEqual(before);
  });

  it('보관된 반도 걸러내지 않는다 — 정렬만 한다(필터는 archive 규칙 몫)', () => {
    const list = [
      makeClass({ id: 'archived', order: 0, archived: true }),
      makeClass({ id: 'active', order: 1 }),
    ];

    expect(sortTeachingClasses(list).map((c) => c.id)).toEqual(['archived', 'active']);
  });
});
