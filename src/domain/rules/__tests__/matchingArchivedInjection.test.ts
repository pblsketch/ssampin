/**
 * S1.2b — findMatchingClass 호출처의 filterActiveClasses 주입 검증.
 *
 * 고교학점제 표준 케이스: 같은 이름·과목의 반이 (보관된 1학기 반, 새 2학기 반)으로
 * 공존한다. findMatchingClass는 첫 매치 승리라, 주입이 없으면 더 이른 createdAt/낮은
 * order의 보관된 반이 이겨 **새 진도·알림이 보관된 반에 기록**된다(plan ⑳).
 * 시그니처는 바꾸지 않는다 — 호출처가 활성 후보만 넘긴다. 활성 후보가 없으면 null(폴백 없음).
 */
import { describe, it, expect } from 'vitest';
import type { TeachingClass } from '@domain/entities/TeachingClass';
import type { TeacherPeriod } from '@domain/entities/Timetable';
import { detectJustFinishedClass } from '../reminderClassMatch';
import { buildWeeklyProgressGrid, cellKey } from '../progressCalendarRules';

function makeClass(overrides: Partial<TeachingClass> = {}): TeachingClass {
  return {
    id: 'tc-1',
    name: '3-1',
    subject: '통합과학',
    students: [],
    createdAt: '2026-03-02T00:00:00.000Z',
    updatedAt: '2026-03-02T00:00:00.000Z',
    ...overrides,
  };
}

// 보관된 1학기 반이 정렬상 항상 앞서는 최악 배치: 더 이른 createdAt + 더 낮은 order
const archivedOld = makeClass({
  id: 'old',
  order: 0,
  createdAt: '2026-03-02T00:00:00.000Z',
  archived: true,
  archivedAt: '2026-08-20T00:00:00.000Z',
  archivedTerm: '2026-1',
});
const activeNew = makeClass({ id: 'new', order: 5, createdAt: '2026-08-21T00:00:00.000Z' });

const SLOT: TeacherPeriod = { subject: '통합과학', classroom: '3-1' };

describe('detectJustFinishedClass — 보관된 반 제외', () => {
  const periodTimes = [{ period: 1, start: '09:00', end: '09:50' }];
  const justAfter = new Date(2026, 8, 1, 9, 55); // 1교시 종료 5분 뒤

  it('같은 이름의 (보관, 활성) 쌍에서 정렬과 무관하게 활성 반을 고른다', () => {
    expect(
      detectJustFinishedClass([SLOT], [archivedOld, activeNew], periodTimes, justAfter)?.id,
    ).toBe('new');
    // 배열 순서를 뒤집어도 동일
    expect(
      detectJustFinishedClass([SLOT], [activeNew, archivedOld], periodTimes, justAfter)?.id,
    ).toBe('new');
  });

  it('활성 후보가 없으면 null (보관된 반으로 폴백하지 않음)', () => {
    expect(detectJustFinishedClass([SLOT], [archivedOld], periodTimes, justAfter)).toBeNull();
  });

  it('보관된 반이 없으면 기존 동작 그대로', () => {
    expect(detectJustFinishedClass([SLOT], [activeNew], periodTimes, justAfter)?.id).toBe('new');
  });
});

describe('buildWeeklyProgressGrid — 보관된 반 제외', () => {
  const input = {
    weekDates: ['2026-09-01'],
    periods: [1],
    dayTeacherSchedules: [[SLOT]],
    progressEntries: [],
    classes: [archivedOld, activeNew],
  };

  it('격자 칸이 활성 반에 결합한다', () => {
    const grid = buildWeeklyProgressGrid(input);
    expect(grid.get(cellKey(0, 1))?.matchedClass?.id).toBe('new');
  });

  it('활성 후보가 없으면 매칭 없음(보관된 반으로 폴백하지 않음)', () => {
    const grid = buildWeeklyProgressGrid({ ...input, classes: [archivedOld] });
    expect(grid.get(cellKey(0, 1))?.matchedClass ?? null).toBeNull();
  });
});
