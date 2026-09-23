/**
 * ADR-137 — 한 주 정리·학기 돌아보기 뷰모델. 지난 학기는 그 학기에 기록이 있던 카드(보관한 반 포함),
 * 명렬을 알 수 없으면 저장된 끝 지점 수만 센다.
 */
import { describe, it, expect } from 'vitest';
import { buildTermRecap, buildWeekRecap, type BuildTermRecapInput } from '../observationRecap';
import type { LapCardViewModel } from '../observationLapCards';
import { EMPTY_SCHOOL_CALENDAR } from '@domain/rules/schoolCalendarDays';
import { homeroomEntries } from '@domain/rules/observationEntries';
import type { Student } from '@domain/entities/Student';
import type { TeachingClass } from '@domain/entities/TeachingClass';

const students: Student[] = [
  { id: 'a', name: '김가람', studentNumber: 1 },
  { id: 'b', name: '이나래', studentNumber: 2 },
];

function hr(studentId: string, date: string, slots?: string[], category = 'life') {
  return {
    id: `${studentId}-${date}-${category}`,
    studentId,
    category,
    date,
    createdAt: `${date}T01:00:00.000Z`,
    ...(slots ? { slots } : {}),
  };
}

function ob(classId: string, studentId: string, date: string, slots?: string[]) {
  return {
    id: `${classId}-${studentId}-${date}`,
    studentId,
    classId,
    date,
    createdAt: 1,
    ...(slots ? { slots } : {}),
  };
}

const archived = {
  id: 'old',
  name: '1-2',
  subject: '국어',
  students: [
    { number: 1, name: '가' },
    { number: 2, name: '나' },
  ],
  archived: true,
  archivedTerm: '2026-1',
  createdAt: '2026-03-02T00:00:00.000Z',
  updatedAt: '2026-03-02T00:00:00.000Z',
} as TeachingClass;

function base(over: Partial<BuildTermRecapInput>): BuildTermRecapInput {
  return {
    term: '2026-2',
    termStart: '2026-08-18',
    termEnd: '2027-03-01',
    today: '2026-12-30',
    currentTerm: '2026-2',
    homeroomTitle: '담임 · 2학년 3반',
    students,
    classes: [archived],
    homeroomRecords: [],
    observationRecords: [],
    marks: [],
    cal: EMPTY_SCHOOL_CALENDAR,
    currentCards: [],
    ...over,
  };
}

describe('한 주 정리', () => {
  it('그 주 기록이 없으면 조각이 없다(0일·0명을 알리지 않는다)', () => {
    expect(buildWeekRecap('2026-09-21', '2026-09-25', [], EMPTY_SCHOOL_CALENDAR)).toBeNull();
    const r = buildWeekRecap(
      '2026-09-21',
      '2026-09-25',
      homeroomEntries([hr('a', '2026-09-22'), hr('b', '2026-09-22', undefined, 'attendance')]),
      EMPTY_SCHOOL_CALENDAR,
    );
    expect(r?.metStudents).toBe(1);
    expect(r?.cells.map((c) => c.state)).toEqual(['empty', 'recorded', 'empty', 'empty', 'future']);
  });
});

describe('학기 돌아보기 — 이번 학기', () => {
  const card: LapCardViewModel = {
    card: 'homeroom',
    contextKind: 'homeroom',
    contextId: 'homeroom',
    title: '담임 · 2학년 3반',
    mixed: false,
    cells: [
      {
        ref: 'a',
        label: '1',
        displayName: '김가람',
        state: 'filled',
        bell: false,
        exclusionKey: 'a',
        excludedUntil: null,
        focused: false,
      },
      {
        ref: 'b',
        label: '2',
        displayName: '이나래',
        state: 'empty',
        bell: false,
        exclusionKey: 'b',
        excludedUntil: null,
        focused: false,
      },
    ],
    memberCount: 2,
    remaining: 1,
    completedLaps: 2,
    justFinished: false,
    newMark: null,
    newBoundaryRecordId: null,
  };

  it('지금 반 카드로 바퀴·장면·초안 준비를 만든다 — 출결·오늘 뒤 기록은 세지 않는다', () => {
    const recap = buildTermRecap(
      base({
        currentCards: [card],
        homeroomRecords: [
          hr('a', '2026-09-01', ['학습 태도']),
          hr('a', '2026-10-01', ['인성·관계']),
          hr('a', '2026-11-01', ['진로']),
          hr('b', '2026-11-02', ['진로']),
          hr('b', '2026-11-03', ['변화'], 'attendance'),
          hr('b', '2027-01-10', ['학급 역할']),
        ],
      }),
    );
    expect(recap.isCurrent).toBe(true);
    expect(recap.termLabel).toBe('2026학년도 2학기');
    expect(recap.lapTotal).toBe(2);
    const c = recap.cards[0]!;
    expect(c.scenes.topScenes).toEqual(['진로', '학습 태도']);
    expect(c.scenes.emptyDefaultScenes).toEqual(['학급 역할', '변화', '아쉬운 점']);
    expect(c.readiness).toEqual({
      readyCount: 1,
      notReady: [{ ref: 'b', label: '2', displayName: '이나래' }],
    });
    expect(recap.recordedWeeks).toBe(4);
  });
});

describe('학기 돌아보기 — 지난 학기', () => {
  it('그 학기에 기록이 있던 카드 — 보관한 수업반도, 초안 준비는 없다', () => {
    const recap = buildTermRecap(
      base({
        term: '2026-1',
        termStart: '2026-03-02',
        termEnd: '2026-08-17',
        observationRecords: [ob('old', '1', '2026-04-01'), ob('old', '2', '2026-04-02')],
        homeroomRecords: [hr('a', '2026-05-01')],
      }),
    );
    expect(recap.isCurrent).toBe(false);
    expect(recap.cards.map((c) => [c.title, c.completedLaps, c.readiness])).toEqual([
      ['담임 · 2학년 3반', 0, null],
      ['1-2 국어', 1, null],
    ]);
  });

  it('지난 학년도 담임반은 지금 명렬로 계산하지 않고 저장된 끝 지점 수만', () => {
    const recap = buildTermRecap(
      base({
        term: '2025-2',
        termStart: '2025-08-18',
        termEnd: '2026-03-01',
        currentTerm: '2026-1',
        classes: [],
        homeroomRecords: [hr('a', '2025-09-01'), hr('b', '2025-09-02')],
        marks: [
          {
            card: 'homeroom',
            term: '2025-2',
            completed: 3,
            boundary: { date: '2025-12-01', createdAt: 0, recordId: 'x' },
          },
        ],
      }),
    );
    expect(recap.cards).toHaveLength(1);
    expect(recap.cards[0]?.completedLaps).toBe(3);
    expect(recap.lapTotal).toBe(3);
  });

  it('기록이 없던 반은 나오지 않는다', () => {
    const recap = buildTermRecap(
      base({ term: '2026-1', termStart: '2026-03-02', termEnd: '2026-08-17' }),
    );
    expect(recap.cards).toHaveLength(0);
    expect(recap.lapTotal).toBe(0);
  });
});
