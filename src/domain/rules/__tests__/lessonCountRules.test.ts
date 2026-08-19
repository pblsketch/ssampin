import { describe, it, expect } from 'vitest';
import { estimateLessonCount, findNextLessonDate } from '../lessonCountRules';
import { buildLessonDayIndex, buildLessonDayIndexResult } from '../buildLessonDayIndex';
import type { LessonDayEntry } from '../buildLessonDayIndex';
import type { LessonDayEvent } from '../lessonDayExclusion';
import type { TeacherScheduleData } from '@domain/entities/Timetable';
import type { TeachingClass } from '@domain/entities/TeachingClass';

/** 월 2교시 · 목 3교시에 이 반 수업이 있는 교사 시간표. */
const TEACHER_SCHEDULE: TeacherScheduleData = {
  월: [null, { subject: '국어', classroom: '3학년 1반' }, null, null, null, null],
  화: [null, null, null, null, null, null],
  수: [null, null, null, null, null, null],
  목: [null, null, { subject: '국어', classroom: '3학년 1반' }, null, null, null],
  금: [null, null, null, null, null, null],
};

const CLASS: TeachingClass = {
  id: 'tc-1',
  name: '3학년 1반',
  subject: '국어',
  students: [],
  createdAt: '2026-03-02T00:00:00.000Z',
  updatedAt: '2026-03-02T00:00:00.000Z',
};

/** 2026-09-01 ~ 2026-09-30 구간의 실제 색인. */
function septemberIndex(): ReadonlyMap<string, LessonDayEntry> {
  return buildLessonDayIndex({
    termStart: '2026-09-01',
    termEnd: '2026-09-30',
    teacherSchedule: TEACHER_SCHEDULE,
    classSchedule: {},
    overrides: [],
    classes: [CLASS],
    targetClassId: 'tc-1',
  });
}

function evtMap(entries: Readonly<Record<string, readonly LessonDayEvent[]>>) {
  return new Map(Object.entries(entries));
}

describe('estimateLessonCount — A-a1: 결정론', () => {
  it('같은 입력이면 항상 같은 결과가 나온다', () => {
    const input = { lessonDayIndex: septemberIndex(), todayIso: '2026-09-15' };
    const a = estimateLessonCount(input);
    const b = estimateLessonCount(input);
    expect(a).toEqual(b);
  });

  it('9월 한 달, 월·목 각 1교시 → 8일 8교시', () => {
    const got = estimateLessonCount({ lessonDayIndex: septemberIndex(), todayIso: '2026-09-30' });
    expect(got.status).toBe('ok');
    expect(got.lessonDays).toHaveLength(8);
    expect(got.totalPeriods).toBe(8);
  });
});

describe('estimateLessonCount — A-a2: 공휴일만큼 교시 수 합계가 준다', () => {
  it('월요일 2일 + 목요일 1일이 공휴일이면 그 3일의 교시 수만큼 빠진다', () => {
    const index = septemberIndex();
    const before = estimateLessonCount({ lessonDayIndex: index, todayIso: '2026-09-30' });

    const holidays = new Map([
      ['2026-09-07', '임시공휴일'], // 월
      ['2026-09-14', '임시공휴일'], // 월
      ['2026-09-03', '임시공휴일'], // 목
    ]);
    const after = estimateLessonCount({
      lessonDayIndex: index,
      todayIso: '2026-09-30',
      holidayNameByDate: holidays,
    });

    // 하루 1교시씩이므로 3교시가 준다. "총 개수 - 3"이 아니라 교시 수 합계 기준이다.
    const removedPeriods = ['2026-09-07', '2026-09-14', '2026-09-03'].reduce(
      (sum, d) => sum + (index.get(d)?.periods.length ?? 0),
      0,
    );
    expect(after.totalPeriods).toBe(before.totalPeriods - removedPeriods);
    expect(after.excludedDays).toHaveLength(3);
  });

  it('하루에 2교시 연강이면 그날 제외로 2교시가 빠진다', () => {
    const index = new Map<string, LessonDayEntry>([
      ['2026-09-07', { periods: [2, 3], matchStage: 1 }],
      ['2026-09-14', { periods: [2], matchStage: 1 }],
    ]);
    const got = estimateLessonCount({
      lessonDayIndex: index,
      todayIso: '2026-09-30',
      holidayNameByDate: new Map([['2026-09-07', '임시공휴일']]),
    });
    expect(got.totalPeriods).toBe(1);
    expect(got.excludedDays[0]?.periods).toEqual([2, 3]);
  });
});

describe('estimateLessonCount — A-a10: 시간표를 모르면 0이 아니라 "모른다"', () => {
  it('색인이 비어 있으면 noTimetable', () => {
    const got = estimateLessonCount({ lessonDayIndex: new Map(), todayIso: '2026-09-15' });
    expect(got.status).toBe('noTimetable');
    expect(got.totalPeriods).toBe(0);
  });

  it('보관된 반은 계산 대상이 아니다 — 시간표 등록을 시키면 안 된다 (A-a7)', () => {
    // 빈 색인을 전부 noTimetable로 뭉개면, 시간표가 멀쩡한 선생님이 보관한 반을 열었을 때
    // "시간표를 먼저 등록해 주세요"라는 엉뚱한 안내를 받는다.
    const { index, unavailable } = buildLessonDayIndexResult({
      termStart: '2026-09-01',
      termEnd: '2026-09-30',
      teacherSchedule: TEACHER_SCHEDULE,
      classSchedule: {},
      overrides: [],
      classes: [{ ...CLASS, archived: true }],
      targetClassId: 'tc-1',
    });
    expect(unavailable).toBe('archivedClass');
    expect(
      estimateLessonCount({
        lessonDayIndex: index,
        todayIso: '2026-09-15',
        indexUnavailable: unavailable,
      }).status,
    ).toBe('archivedClass');
  });

  it('학기 날짜가 잘못되면 invalidTerm — 시간표 문제가 아니다', () => {
    const { index, unavailable } = buildLessonDayIndexResult({
      termStart: '2026-09-30',
      termEnd: '2026-09-01', // 뒤집힘
      teacherSchedule: TEACHER_SCHEDULE,
      classSchedule: {},
      overrides: [],
      classes: [CLASS],
      targetClassId: 'tc-1',
    });
    expect(unavailable).toBe('invalidTerm');
    expect(
      estimateLessonCount({
        lessonDayIndex: index,
        todayIso: '2026-09-15',
        indexUnavailable: unavailable,
      }).status,
    ).toBe('invalidTerm');
  });

  it('반을 못 찾으면 classNotFound', () => {
    const { unavailable } = buildLessonDayIndexResult({
      termStart: '2026-09-01',
      termEnd: '2026-09-30',
      teacherSchedule: TEACHER_SCHEDULE,
      classSchedule: {},
      overrides: [],
      classes: [CLASS],
      targetClassId: 'tc-없음',
    });
    expect(unavailable).toBe('classNotFound');
  });

  it('정상 계산이면 unavailable 이 null 이다', () => {
    const { unavailable } = buildLessonDayIndexResult({
      termStart: '2026-09-01',
      termEnd: '2026-09-30',
      teacherSchedule: TEACHER_SCHEDULE,
      classSchedule: {},
      overrides: [],
      classes: [CLASS],
      targetClassId: 'tc-1',
    });
    expect(unavailable).toBeNull();
    expect(
      estimateLessonCount({ lessonDayIndex: septemberIndex(), todayIso: '2026-09-15' }).status,
    ).toBe('ok');
  });

  it('기존 buildLessonDayIndex 래퍼는 색인만 돌려준다 (하위호환)', () => {
    expect(
      buildLessonDayIndex({
        termStart: '2026-09-01',
        termEnd: '2026-09-30',
        teacherSchedule: TEACHER_SCHEDULE,
        classSchedule: {},
        overrides: [],
        classes: [CLASS],
        targetClassId: 'tc-1',
      }).size,
    ).toBe(8);
  });
});

describe('estimateLessonCount — 지난 수업과 남은 수업', () => {
  it('오늘까지는 지난 수업, 내일부터는 남은 수업', () => {
    const got = estimateLessonCount({ lessonDayIndex: septemberIndex(), todayIso: '2026-09-15' });
    // 9/15까지: 3, 7, 10, 14 → 4교시 / 이후: 17, 21, 24, 28 → 4교시
    expect(got.pastPeriods).toBe(4);
    expect(got.remainingPeriods).toBe(4);
    expect(got.totalPeriods).toBe(8);
  });

  it('오늘 수업이 있으면 지난 쪽에 포함된다', () => {
    const got = estimateLessonCount({ lessonDayIndex: septemberIndex(), todayIso: '2026-09-07' });
    expect(got.pastPeriods).toBe(2); // 9/3, 9/7
  });

  it('A-a9: 미래 구간이 있으면 예상 표시가 켜진다', () => {
    expect(
      estimateLessonCount({ lessonDayIndex: septemberIndex(), todayIso: '2026-09-15' })
        .hasFutureEstimate,
    ).toBe(true);
  });

  it('학기가 다 지났으면 예상 표시가 꺼진다', () => {
    expect(
      estimateLessonCount({ lessonDayIndex: septemberIndex(), todayIso: '2026-12-31' })
        .hasFutureEstimate,
    ).toBe(false);
  });
});

describe('estimateLessonCount — 넣은 날도 열어 보인다', () => {
  it('수업일마다 매칭 근거(matchStage)가 함께 온다', () => {
    const got = estimateLessonCount({ lessonDayIndex: septemberIndex(), todayIso: '2026-09-30' });
    expect(got.lessonDays.every((d) => d.matchStage === 1)).toBe(true);
  });

  it('시험·행사는 빼지 않고 확인 표시로만 붙는다', () => {
    const got = estimateLessonCount({
      lessonDayIndex: septemberIndex(),
      todayIso: '2026-09-30',
      eventsByDate: evtMap({
        '2026-09-07': [{ title: '중간고사', group: 'exam' }],
        '2026-09-10': [{ title: '체육대회', group: 'event' }],
      }),
    });
    expect(got.totalPeriods).toBe(8); // 하나도 빠지지 않았다
    expect(got.lessonDays.find((d) => d.date === '2026-09-07')?.notices[0]?.kind).toBe('exam');
    expect(got.lessonDays.find((d) => d.date === '2026-09-10')?.notices[0]?.kind).toBe('event');
  });

  it('결과는 날짜순이다', () => {
    const got = estimateLessonCount({ lessonDayIndex: septemberIndex(), todayIso: '2026-09-30' });
    const dates = got.lessonDays.map((d) => d.date);
    expect(dates).toEqual([...dates].sort());
  });
});

describe('estimateLessonCount — 사용자 정정', () => {
  it('"수업했어요"로 되살리면 교시 수가 그만큼 늘어난다', () => {
    const index = septemberIndex();
    const holidays = new Map([['2026-09-07', '임시공휴일']]);

    const excluded = estimateLessonCount({
      lessonDayIndex: index,
      todayIso: '2026-09-30',
      holidayNameByDate: holidays,
    });
    const restored = estimateLessonCount({
      lessonDayIndex: index,
      todayIso: '2026-09-30',
      holidayNameByDate: holidays,
      adjustmentByDate: new Map([['2026-09-07', 'hasLesson']]),
    });

    expect(restored.totalPeriods).toBe(excluded.totalPeriods + 1);
  });

  it('"수업 없었어요"로 빼면 뺀 날 목록에 사유가 남는다', () => {
    const got = estimateLessonCount({
      lessonDayIndex: septemberIndex(),
      todayIso: '2026-09-30',
      adjustmentByDate: new Map([['2026-09-07', 'noLesson']]),
    });
    expect(got.totalPeriods).toBe(7);
    expect(got.excludedDays[0]?.exclusion.reason).toBe('userMarkedNoLesson');
  });

  it('뺀 날에는 되살렸을 때 살아날 교시가 함께 온다', () => {
    const got = estimateLessonCount({
      lessonDayIndex: septemberIndex(),
      todayIso: '2026-09-30',
      holidayNameByDate: new Map([['2026-09-07', '임시공휴일']]),
    });
    expect(got.excludedDays[0]?.periods).toEqual([2]);
    expect(got.excludedDays[0]?.exclusion.userOverridable).toBe(true);
  });
});

describe('findNextLessonDate — C-c9: 수업 없는 날을 건너뛴다', () => {
  it('다음 수업일로 간다', () => {
    expect(findNextLessonDate({ fromIso: '2026-09-03', lessonDayIndex: septemberIndex() })).toBe(
      '2026-09-07',
    );
  });

  it('기준 날짜 자신은 결과가 아니다', () => {
    expect(findNextLessonDate({ fromIso: '2026-09-07', lessonDayIndex: septemberIndex() })).toBe(
      '2026-09-10',
    );
  });

  it('공휴일인 수업일은 건너뛴다', () => {
    expect(
      findNextLessonDate({
        fromIso: '2026-09-03',
        lessonDayIndex: septemberIndex(),
        holidayNameByDate: new Map([['2026-09-07', '임시공휴일']]),
      }),
    ).toBe('2026-09-10');
  });

  it('방학인 날도 건너뛴다', () => {
    expect(
      findNextLessonDate({
        fromIso: '2026-09-03',
        lessonDayIndex: septemberIndex(),
        eventsByDate: evtMap({ '2026-09-07': [{ title: '재량휴업일', group: 'vacation' }] }),
      }),
    ).toBe('2026-09-10');
  });

  it('사용자가 "수업 없었어요"로 표시한 날도 건너뛴다', () => {
    expect(
      findNextLessonDate({
        fromIso: '2026-09-03',
        lessonDayIndex: septemberIndex(),
        adjustmentByDate: new Map([['2026-09-07', 'noLesson']]),
      }),
    ).toBe('2026-09-10');
  });

  it('시험기간은 건너뛰지 않는다 — 자동 제외 대상이 아니다', () => {
    expect(
      findNextLessonDate({
        fromIso: '2026-09-03',
        lessonDayIndex: septemberIndex(),
        eventsByDate: evtMap({ '2026-09-07': [{ title: '중간고사', group: 'exam' }] }),
      }),
    ).toBe('2026-09-07');
  });

  it('뒤로도 갈 수 있다', () => {
    expect(
      findNextLessonDate({
        fromIso: '2026-09-10',
        lessonDayIndex: septemberIndex(),
        direction: 'backward',
      }),
    ).toBe('2026-09-07');
  });
});

describe('findNextLessonDate — C-c10: 못 찾으면 이동하지 않는다', () => {
  it('60일 안에 수업일이 없으면 null', () => {
    expect(
      findNextLessonDate({ fromIso: '2026-09-30', lessonDayIndex: septemberIndex() }),
    ).toBeNull();
  });

  it('찾는 기간을 좁히면 그 안에서만 본다', () => {
    expect(
      findNextLessonDate({ fromIso: '2026-09-03', lessonDayIndex: septemberIndex(), maxDays: 2 }),
    ).toBeNull();
  });

  it('색인이 비면 null', () => {
    expect(findNextLessonDate({ fromIso: '2026-09-03', lessonDayIndex: new Map() })).toBeNull();
  });

  it('날짜 형식이 틀리면 null (예외를 던지지 않는다)', () => {
    expect(
      findNextLessonDate({ fromIso: '2026/09/03', lessonDayIndex: septemberIndex() }),
    ).toBeNull();
  });
});
