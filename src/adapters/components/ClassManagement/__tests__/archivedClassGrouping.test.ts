/**
 * 보관 섹션 2단 그룹화 — archivedTerm(학기) → groupId(교실) (P1 S1.3 AC-8).
 *
 * 계획: docs/01-plan/features/school-year-archive.plan.md §4 S1.3 ②
 * 핵심 불변식: 어떤 항목도 그룹화 과정에서 사라지지 않는다
 * (groupId 없으면 '기타', archivedTerm 없으면 '학기 미상' — 숨김 금지).
 */
import { describe, it, expect } from 'vitest';
import type { TeachingClass } from '@domain/entities/TeachingClass';
import { groupArchivedClasses, UNKNOWN_TERM_KEY, LOOSE_ROOM_KEY } from '../ArchivedClassesSection';

function makeArchived(overrides: Partial<TeachingClass> & { id: string }): TeachingClass {
  return {
    name: '3학년 2반',
    subject: '통합과학',
    students: [],
    archived: true,
    archivedAt: '2026-08-06T00:00:00.000Z',
    archivedTerm: '2026-1',
    createdAt: '2026-03-02T00:00:00.000Z',
    updatedAt: '2026-08-06T00:00:00.000Z',
    ...overrides,
  };
}

describe('groupArchivedClasses', () => {
  it('학기 → 교실(groupId) 2단으로 묶고, 교실 라벨은 반 이름을 쓴다', () => {
    const groups = groupArchivedClasses([
      makeArchived({ id: 'a', groupId: 'g1', name: '3학년 2반', subject: '통합과학' }),
      makeArchived({ id: 'b', groupId: 'g1', name: '3학년 2반', subject: '통합사회' }),
      makeArchived({ id: 'c', groupId: 'g2', name: '3학년 5반', subject: '통합과학' }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe('2026학년도 1학기');
    expect(groups[0]?.rooms.map((r) => r.label)).toEqual(['3학년 2반', '3학년 5반']);
    expect(groups[0]?.rooms[0]?.classes.map((c) => c.subject)).toEqual(['통합과학', '통합사회']);
  });

  it('학기는 최신순, 학기 미상은 마지막', () => {
    const groups = groupArchivedClasses([
      makeArchived({ id: 'old', archivedTerm: '2025-2' }),
      makeArchived({ id: 'new', archivedTerm: '2026-1' }),
      makeArchived({ id: 'legacy', archivedTerm: undefined }),
    ]);

    expect(groups.map((g) => g.key)).toEqual(['2026-1', '2025-2', UNKNOWN_TERM_KEY]);
    expect(groups[2]?.label).toBe('학기 미상');
  });

  it('groupId 없는 단독 반은 "기타"로 모으되 목록 마지막에 둔다', () => {
    const groups = groupArchivedClasses([
      makeArchived({ id: 'loose', groupId: undefined, name: '동아리반', subject: '스포츠' }),
      makeArchived({ id: 'roomed', groupId: 'g1', name: '3학년 2반' }),
    ]);

    const rooms = groups[0]?.rooms ?? [];
    expect(rooms.map((r) => r.key)).toEqual(['g1', LOOSE_ROOM_KEY]);
    expect(rooms[1]?.label).toBe('기타');
  });

  it('어떤 항목도 사라지지 않는다 — 입력 합계 = 그룹화 결과 합계', () => {
    const input = [
      makeArchived({ id: 'a', groupId: 'g1' }),
      makeArchived({ id: 'b', groupId: undefined }),
      makeArchived({ id: 'c', archivedTerm: undefined, groupId: undefined }),
      makeArchived({ id: 'd', archivedTerm: undefined, groupId: 'g9' }),
    ];

    const groups = groupArchivedClasses(input);
    const flattened = groups.flatMap((g) => g.rooms.flatMap((r) => r.classes.map((c) => c.id)));

    expect(flattened).toHaveLength(input.length);
    expect(new Set(flattened)).toEqual(new Set(['a', 'b', 'c', 'd']));
  });
});
