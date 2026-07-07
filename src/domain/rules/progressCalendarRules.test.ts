import { describe, it, expect } from 'vitest';
import { buildWeeklyProgressGrid, summarizeClassProgress, cellKey } from './progressCalendarRules';
import { findMatchingClass } from './matchingRules';
import type { TeachingClass } from '@domain/entities/TeachingClass';
import type { ProgressEntry } from '@domain/entities/CurriculumProgress';
import type { TeacherPeriod } from '@domain/entities/Timetable';

/* ── 픽스처 헬퍼 ── */

function makeClass(id: string, name: string, subject: string): TeachingClass {
  return {
    id,
    name,
    subject,
    students: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeEntry(
  partial: Partial<ProgressEntry> & Pick<ProgressEntry, 'classId' | 'date' | 'period'>,
): ProgressEntry {
  return {
    id: `${partial.classId}-${partial.date}-${partial.period}`,
    unit: '2단원',
    lesson: '약수의 의미',
    status: 'planned',
    note: '',
    ...partial,
  };
}

const slot = (subject: string, classroom: string): TeacherPeriod => ({ subject, classroom });

describe('buildWeeklyProgressGrid', () => {
  // 월(2026-03-02) 1교시 = 수학/1-3, 화(2026-03-03) 2교시 = 영어/2-1
  const classes = [makeClass('c1', '1-3', '수학'), makeClass('c2', '2-1', '영어')];
  const weekDates = ['2026-03-02', '2026-03-03'];
  const periods = [1, 2];
  const dayTeacherSchedules: ReadonlyArray<ReadonlyArray<TeacherPeriod | null>> = [
    [slot('수학', '1-3'), null], // 월: 1교시 수학, 2교시 공강
    [null, slot('영어', '2-1')], // 화: 1교시 공강, 2교시 영어
  ];

  it('실 픽스처: 각 칸의 matchedClass가 기대 classId와 일치한다', () => {
    const grid = buildWeeklyProgressGrid({
      weekDates,
      periods,
      dayTeacherSchedules,
      progressEntries: [],
      classes,
    });

    expect(grid.get(cellKey(0, 1))?.matchedClass?.id).toBe('c1'); // 월 1교시 → 1-3 수학
    expect(grid.get(cellKey(0, 2))?.matchedClass).toBeNull(); // 월 2교시 공강
    expect(grid.get(cellKey(1, 1))?.matchedClass).toBeNull(); // 화 1교시 공강
    expect(grid.get(cellKey(1, 2))?.matchedClass?.id).toBe('c2'); // 화 2교시 → 2-1 영어
  });

  it('해당 반·날짜·교시의 진도 기록만 그 칸에 배치한다', () => {
    const entries = [
      makeEntry({ classId: 'c1', date: '2026-03-02', period: 1, status: 'completed' }),
      makeEntry({ classId: 'c2', date: '2026-03-03', period: 2, status: 'planned' }),
      makeEntry({ classId: 'c1', date: '2026-03-09', period: 1 }), // 다른 주 → 어느 칸에도 없음
    ];
    const grid = buildWeeklyProgressGrid({
      weekDates,
      periods,
      dayTeacherSchedules,
      progressEntries: entries,
      classes,
    });

    expect(grid.get(cellKey(0, 1))?.entries).toHaveLength(1);
    expect(grid.get(cellKey(0, 1))?.entries[0]?.status).toBe('completed');
    expect(grid.get(cellKey(1, 2))?.entries).toHaveLength(1);
    // 공강 칸은 진도 없음
    expect(grid.get(cellKey(0, 2))?.entries).toHaveLength(0);
  });

  it('공강(slot null) 칸은 matchedClass null·entries 빈 배열', () => {
    const grid = buildWeeklyProgressGrid({
      weekDates,
      periods,
      dayTeacherSchedules,
      progressEntries: [makeEntry({ classId: 'c1', date: '2026-03-02', period: 2 })],
      classes,
    });
    const cell = grid.get(cellKey(0, 2));
    expect(cell?.slot).toBeNull();
    expect(cell?.matchedClass).toBeNull();
    expect(cell?.entries).toHaveLength(0);
  });

  it('위임 증명: 모든 칸의 matchedClass가 findMatchingClass 직접 호출 결과와 동일', () => {
    const grid = buildWeeklyProgressGrid({
      weekDates,
      periods,
      dayTeacherSchedules,
      progressEntries: [],
      classes,
    });
    for (const cell of grid.values()) {
      const expected = cell.slot
        ? (findMatchingClass(classes, cell.slot.classroom, cell.slot.subject)?.id ?? null)
        : null;
      expect(cell.matchedClass?.id ?? null).toBe(expected);
    }
  });

  it('같은 날짜·교시에 여러 반이 매칭 가능해도 findMatchingClass 우선순위(정확 이름 먼저)를 따른다', () => {
    // 1-3, 1-3B 두 반이 있고 슬롯 classroom이 "1-3"이면 정확 일치가 우선
    const twoClasses = [makeClass('c1', '1-3', '수학'), makeClass('c3', '1-3B', '수학')];
    const grid = buildWeeklyProgressGrid({
      weekDates: ['2026-03-02'],
      periods: [1],
      dayTeacherSchedules: [[slot('수학', '1-3')]],
      progressEntries: [],
      classes: twoClasses,
    });
    expect(grid.get(cellKey(0, 1))?.matchedClass?.id).toBe('c1');
  });

  it('빈 입력(반·시간표 없음)에도 격자 크기는 weekDates × periods로 채워진다', () => {
    const grid = buildWeeklyProgressGrid({
      weekDates,
      periods,
      dayTeacherSchedules: [],
      progressEntries: [],
      classes: [],
    });
    expect(grid.size).toBe(4); // 2일 × 2교시
    for (const cell of grid.values()) {
      expect(cell.matchedClass).toBeNull();
    }
  });
});

describe('summarizeClassProgress', () => {
  it('완료/예정/미실시 집계와 진도율(%)을 계산한다', () => {
    const entries = [
      makeEntry({ classId: 'c1', date: '2026-03-02', period: 1, status: 'completed' }),
      makeEntry({ classId: 'c1', date: '2026-03-03', period: 1, status: 'completed' }),
      makeEntry({ classId: 'c1', date: '2026-03-04', period: 1, status: 'planned' }),
      makeEntry({ classId: 'c1', date: '2026-03-05', period: 1, status: 'skipped' }),
    ];
    const s = summarizeClassProgress(entries);
    expect(s.total).toBe(4);
    expect(s.completed).toBe(2);
    expect(s.planned).toBe(1);
    expect(s.skipped).toBe(1);
    expect(s.percent).toBe(50);
  });

  it('빈 배열은 전부 0·진도율 0', () => {
    const s = summarizeClassProgress([]);
    expect(s).toEqual({ total: 0, completed: 0, planned: 0, skipped: 0, percent: 0 });
  });
});
