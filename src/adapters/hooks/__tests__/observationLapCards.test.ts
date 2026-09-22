/**
 * ADR-135 — 반 카드 칸 상태 조립(칠함·빈칸·빠짐·종·막 끝난 모습).
 */
import { describe, it, expect } from 'vitest';
import { buildLapCards, type BuildLapCardsInput } from '../observationLapCards';
import { DEFAULT_REMINDER_SETTINGS } from '@domain/entities/RecordReminder';
import { EMPTY_SCHOOL_CALENDAR } from '@domain/rules/schoolCalendarDays';
import type { Student } from '@domain/entities/Student';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import type { ObservationRecord } from '@domain/entities/Observation';
import type { TeachingClass } from '@domain/entities/TeachingClass';

const students: Student[] = [
  { id: 'a', name: '김가람', studentNumber: 1 },
  { id: 'b', name: '이나래', studentNumber: 2 },
  { id: 'c', name: '박다온', studentNumber: 3 },
];

function hr(
  studentId: string,
  date: string,
  category = 'life',
  createdAt = `${date}T01:00:00.000Z`,
): StudentRecord {
  return {
    id: `${studentId}-${date}-${category}`,
    studentId,
    category,
    subcategory: '일반',
    content: '내용',
    date,
    createdAt,
  } as StudentRecord;
}

function obs(classId: string, studentId: string, date: string): ObservationRecord {
  return {
    id: `${classId}-${studentId}-${date}`,
    studentId,
    classId,
    authorId: 't',
    date,
    content: '내용',
    tags: [],
    visibility: 'private',
    createdAt: 1,
    updatedAt: 1,
  };
}

function input(over: Partial<BuildLapCardsInput>): BuildLapCardsInput {
  return {
    homeroom: { title: '2학년 3반', students },
    classes: [],
    homeroomRecords: [],
    observationRecords: [],
    reminder: { ...DEFAULT_REMINDER_SETTINGS },
    reminderPaused: false,
    marks: [],
    term: '2026-2',
    termStart: '2026-08-18',
    today: '2026-09-23',
    now: new Date(2026, 8, 23, 12, 0),
    calendar: EMPTY_SCHOOL_CALENDAR,
    ...over,
  };
}

describe('담임 카드 칸', () => {
  it('이번 바퀴에 기록한 학생만 칠하고, 출결 기록은 세지 않는다', () => {
    const [card] = buildLapCards(
      input({ homeroomRecords: [hr('a', '2026-09-01'), hr('b', '2026-09-02', 'attendance')] }),
    );
    expect(card?.cells.map((c) => [c.label, c.state])).toEqual([
      ['1', 'filled'],
      ['2', 'empty'],
      ['3', 'empty'],
    ]);
    expect(card?.remaining).toBe(2);
    expect(card?.memberCount).toBe(3);
  });

  it("'당분간 빼기'한 학생은 빠짐 칸이 되고 구성원 수에서 빠진다", () => {
    const [card] = buildLapCards(
      input({
        reminder: { ...DEFAULT_REMINDER_SETTINGS, exclusions: [{ key: 'b', until: '2026-10-01' }] },
      }),
    );
    const b = card?.cells.find((c) => c.ref === 'b');
    expect(b?.state).toBe('excluded');
    expect(b?.excludedUntil).toBe('2026-10-01');
    expect(b?.bell).toBe(false);
    expect(card?.memberCount).toBe(2);
  });

  it('빼기 기간이 지나면 다시 빈칸', () => {
    const [card] = buildLapCards(
      input({
        reminder: { ...DEFAULT_REMINDER_SETTINGS, exclusions: [{ key: 'b', until: '2026-09-22' }] },
      }),
    );
    expect(card?.cells.find((c) => c.ref === 'b')?.state).toBe('empty');
  });

  it('구성원 모두 기록하면 막 끝난 모습 — 새 끝 지점을 계산해 둔다', () => {
    const [card] = buildLapCards(
      input({
        homeroomRecords: [hr('a', '2026-09-01'), hr('b', '2026-09-02'), hr('c', '2026-09-03')],
      }),
    );
    expect(card?.justFinished).toBe(true);
    expect(card?.cells.every((c) => c.state === 'filled')).toBe(true);
    expect(card?.newMark?.completed).toBe(1);
    expect(card?.newBoundaryRecordId).toBe('c-2026-09-03-life');
  });

  it('이름 표시 설정을 칸 이름에 적용한다', () => {
    const [card] = buildLapCards(
      input({ reminder: { ...DEFAULT_REMINDER_SETTINGS, nameExposure: 'initial' } }),
    );
    expect(card?.cells[0]?.displayName).toBe('김○○');
  });

  it('명렬표가 비면 담임 카드가 없다', () => {
    expect(buildLapCards(input({ homeroom: { title: '2학년 3반', students: [] } }))).toHaveLength(
      0,
    );
  });
});

describe('종(기록 알림이 부를 학생)', () => {
  const reminderOn = {
    ...DEFAULT_REMINDER_SETTINGS,
    enabled: true,
    targets: ['homeroom' as const],
    staleDays: 14,
  };

  it('알림이 켜져 있고 오래 기록하지 않은 빈칸에만 단다', () => {
    const [card] = buildLapCards(
      input({
        reminder: reminderOn,
        homeroomRecords: [hr('a', '2026-09-20'), hr('b', '2026-06-01')],
      }),
    );
    // a: 칠해짐(종 없음) · b: 이번 학기 기록 없음 + 오래됨(종) · c: 기록 없음(종)
    expect(card?.cells.map((c) => c.bell)).toEqual([false, true, true]);
  });

  it('알림이 꺼졌거나 일시정지 중이면 달지 않는다', () => {
    const off = buildLapCards(input({ reminder: { ...reminderOn, enabled: false } }))[0];
    const paused = buildLapCards(input({ reminder: reminderOn, reminderPaused: true }))[0];
    expect(off?.cells.some((c) => c.bell)).toBe(false);
    expect(paused?.cells.some((c) => c.bell)).toBe(false);
  });

  it('알림 대상이 아닌 카드에는 달지 않는다', () => {
    const [card] = buildLapCards(input({ reminder: { ...reminderOn, targets: ['subject'] } }));
    expect(card?.cells.some((c) => c.bell)).toBe(false);
  });

  it('막 끝난 모습에서는 달지 않는다', () => {
    const [card] = buildLapCards(
      input({
        reminder: reminderOn,
        homeroomRecords: [hr('a', '2026-09-01'), hr('b', '2026-09-02'), hr('c', '2026-09-03')],
      }),
    );
    expect(card?.cells.some((c) => c.bell)).toBe(false);
  });

  it('방학 날은 공백 날수에 넣지 않는다', () => {
    const vacationDays = new Set<string>();
    for (let d = 2; d <= 20; d++) vacationDays.add(`2026-09-${String(d).padStart(2, '0')}`);
    const [card] = buildLapCards(
      input({
        reminder: { ...reminderOn, staleDays: 5 },
        homeroom: { title: '2학년 3반', students: [students[0]!, students[1]!] },
        homeroomRecords: [hr('a', '2026-09-22'), hr('b', '2026-09-01')],
        termStart: '2026-09-22',
        calendar: { ...EMPTY_SCHOOL_CALENDAR, vacationDays },
      }),
    );
    // b 는 이번 학기(9/22~) 기록이 없어 빈칸이지만, 방학을 빼면 공백 3일 → 종 없음
    expect(card?.cells.find((c) => c.ref === 'b')?.state).toBe('empty');
    expect(card?.cells.find((c) => c.ref === 'b')?.bell).toBe(false);
  });
});

describe('수업반 카드', () => {
  const cls = (id: string, name: string, list: TeachingClass['students']): TeachingClass =>
    ({ id, name, subject: '국어', students: list }) as TeachingClass;

  it('담임 카드 다음에 넘겨받은 반 순서대로, 학생이 없는 반은 뺀다', () => {
    const cards = buildLapCards(
      input({
        classes: [cls('c1', '2-3', [{ number: 1, name: '가' }]), cls('c2', '2-4', [])],
      }),
    );
    expect(cards.map((c) => c.card)).toEqual(['homeroom', 'subject:c1']);
    expect(cards[1]?.title).toBe('2-3 국어');
    expect(cards[1]?.contextKind).toBe('teaching');
    expect(cards[1]?.contextId).toBe('c1');
  });

  it('빼기 key 는 반마다 따로 — 다른 반의 같은 번호에 번지지 않는다', () => {
    const cards = buildLapCards(
      input({
        homeroom: null,
        classes: [
          cls('c1', '2-3', [{ number: 1, name: '가' }]),
          cls('c2', '2-4', [{ number: 1, name: '나' }]),
        ],
        reminder: {
          ...DEFAULT_REMINDER_SETTINGS,
          exclusions: [{ key: 'subject:c1:1', until: '2026-10-01' }],
        },
      }),
    );
    expect(cards[0]?.cells[0]?.state).toBe('excluded');
    expect(cards[1]?.cells[0]?.state).toBe('empty');
    expect(cards[1]?.cells[0]?.exclusionKey).toBe('subject:c2:1');
  });

  it('그 반 관찰 기록만 칠한다', () => {
    const cards = buildLapCards(
      input({
        homeroom: null,
        classes: [
          cls('c1', '2-3', [
            { number: 1, name: '가' },
            { number: 2, name: '나' },
          ]),
        ],
        observationRecords: [obs('c1', '1', '2026-09-10'), obs('c9', '2', '2026-09-10')],
      }),
    );
    expect(cards[0]?.cells.map((c) => c.state)).toEqual(['filled', 'empty']);
  });

  it('여러 학급이 섞인 반은 섞임 표시, 칸에 "반-번호"', () => {
    const [card] = buildLapCards(
      input({
        homeroom: null,
        classes: [
          cls('c1', '선택 국어', [
            { number: 5, name: '가', grade: 2, classNum: 3 },
            { number: 5, name: '나', grade: 2, classNum: 4 },
          ]),
        ],
      }),
    );
    expect(card?.mixed).toBe(true);
    expect(card?.cells.map((c) => c.label)).toEqual(['3-5', '4-5']);
  });

  it('명렬표 번호가 겹쳐도 칸은 모두 그리고 이름표는 겹치지 않는다', () => {
    const [card] = buildLapCards(
      input({
        homeroom: null,
        classes: [
          cls('c1', '2-3', [
            { number: 3, name: '가' },
            { number: 3, name: '나' },
          ]),
        ],
      }),
    );
    expect(card?.cells).toHaveLength(2);
    const labels = card?.cells.map((c) => c.label) ?? [];
    expect(new Set(labels).size).toBe(2);
  });
});
