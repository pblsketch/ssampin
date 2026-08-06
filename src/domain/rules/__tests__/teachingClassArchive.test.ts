import { describe, it, expect } from 'vitest';
import type { TeachingClass } from '@domain/entities/TeachingClass';
import {
  isTeachingClassArchived,
  filterActiveClasses,
  filterArchivedClasses,
  archiveTeachingClass,
  unarchiveTeachingClass,
  shouldPropagateToSibling,
} from '../teachingClassArchive';

function makeClass(overrides: Partial<TeachingClass> = {}): TeachingClass {
  return {
    id: 'tc-1',
    name: '3학년 1반',
    subject: '통합과학',
    students: [],
    createdAt: '2026-03-02T00:00:00.000Z',
    updatedAt: '2026-03-02T00:00:00.000Z',
    ...overrides,
  };
}

describe('isTeachingClassArchived', () => {
  it('archived=true만 보관으로 판정한다 (undefined/false=활성)', () => {
    expect(isTeachingClassArchived(makeClass())).toBe(false);
    expect(isTeachingClassArchived(makeClass({ archived: false }))).toBe(false);
    expect(isTeachingClassArchived(makeClass({ archived: true }))).toBe(true);
  });
});

describe('archiveTeachingClass', () => {
  it('archived/archivedAt/archivedTerm을 세우고 나머지 필드는 보존한다', () => {
    const now = new Date(2026, 8, 4, 10, 30); // 2026-09-04 = 2학기
    const original = makeClass({ groupId: 'g-1', order: 2 });
    const archived = archiveTeachingClass(original, now);

    expect(archived.archived).toBe(true);
    expect(archived.archivedAt).toBe(now.toISOString());
    expect(archived.archivedTerm).toBe('2026-2');
    // 나머지 필드 보존
    expect(archived.id).toBe(original.id);
    expect(archived.groupId).toBe('g-1');
    expect(archived.order).toBe(2);
    expect(archived.updatedAt).toBe(original.updatedAt); // 스탬프는 저장 경로 담당
  });

  it('1학기 날짜면 archivedTerm이 1학기 라벨', () => {
    const archived = archiveTeachingClass(makeClass(), new Date(2026, 3, 1)); // 4월
    expect(archived.archivedTerm).toBe('2026-1');
  });
});

describe('unarchiveTeachingClass', () => {
  it('archived만 내리고 archivedAt/archivedTerm은 복원 이력으로 남긴다', () => {
    const archived = archiveTeachingClass(makeClass({ order: 0 }), new Date(2026, 8, 4));
    const restored = unarchiveTeachingClass(archived, 5);

    expect(restored.archived).toBe(false);
    expect(restored.archivedAt).toBe(archived.archivedAt); // 지우지 않음
    expect(restored.archivedTerm).toBe(archived.archivedTerm); // 지우지 않음
  });

  it('복원 위치는 활성 목록 맨 아래 (order = maxActiveOrder + 1)', () => {
    const archived = archiveTeachingClass(makeClass({ order: 0 }), new Date(2026, 8, 4));
    expect(unarchiveTeachingClass(archived, 5).order).toBe(6);
    expect(unarchiveTeachingClass(archived, -1).order).toBe(0); // 활성이 없으면 0
  });
});

describe('filterActiveClasses / filterArchivedClasses', () => {
  const active = makeClass({ id: 'a' });
  const archivedFalse = makeClass({ id: 'b', archived: false });
  const archived = makeClass({ id: 'c', archived: true });

  it('활성/보관을 정확히 가른다', () => {
    const list = [active, archivedFalse, archived];
    expect(filterActiveClasses(list).map((c) => c.id)).toEqual(['a', 'b']);
    expect(filterArchivedClasses(list).map((c) => c.id)).toEqual(['c']);
  });

  it('보관된 반이 없으면 동작이 완전히 동일하다 (기존 데이터 무영향)', () => {
    const list = [active, archivedFalse];
    expect(filterActiveClasses(list)).toEqual(list);
    expect(filterArchivedClasses(list)).toEqual([]);
  });
});

describe('shouldPropagateToSibling — 그룹 쓰기 전파 술어', () => {
  it('활성 + shared(기본)면 전파한다', () => {
    expect(shouldPropagateToSibling(makeClass())).toBe(true);
    expect(shouldPropagateToSibling(makeClass({ studentSyncMode: 'shared' }))).toBe(true);
  });

  it('independent 형제는 전파하지 않는다 (기존 규칙 정본화)', () => {
    expect(shouldPropagateToSibling(makeClass({ studentSyncMode: 'independent' }))).toBe(false);
  });

  it('보관된 형제는 전파하지 않는다 (보관 무결성)', () => {
    expect(shouldPropagateToSibling(makeClass({ archived: true }))).toBe(false);
    expect(shouldPropagateToSibling(makeClass({ archived: true, studentSyncMode: 'shared' }))).toBe(
      false,
    );
  });
});
