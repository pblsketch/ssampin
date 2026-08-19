import { describe, it, expect } from 'vitest';
import { buildLessonDayIndex, type LessonDayIndexInput } from '../buildLessonDayIndex';
import type {
  TeacherScheduleData,
  ClassScheduleData,
  TimetableOverride,
} from '@domain/entities/Timetable';
import type { TeachingClass } from '@domain/entities/TeachingClass';

/** 3학년 1반 국어를 월(2교시)·목(3교시)에 가르치는 교사 시간표. */
function teacherSchedule(): TeacherScheduleData {
  const empty = [null, null, null, null, null, null];
  return {
    월: [null, { subject: '국어', classroom: '3학년 1반' }, null, null, null, null],
    화: empty,
    수: empty,
    목: [null, null, { subject: '국어', classroom: '3학년 1반' }, null, null, null],
    금: empty,
  };
}

const EMPTY_CLASS_SCHEDULE: ClassScheduleData = {};

function cls(overrides: Partial<TeachingClass> = {}): TeachingClass {
  return {
    id: 'tc-1',
    name: '3학년 1반',
    subject: '국어',
    students: [],
    createdAt: '2026-03-02T00:00:00.000Z',
    updatedAt: '2026-03-02T00:00:00.000Z',
    ...overrides,
  };
}

function baseInput(over: Partial<LessonDayIndexInput> = {}): LessonDayIndexInput {
  return {
    termStart: '2026-09-01',
    termEnd: '2026-09-30',
    teacherSchedule: teacherSchedule(),
    classSchedule: EMPTY_CLASS_SCHEDULE,
    overrides: [],
    classes: [cls()],
    targetClassId: 'tc-1',
    ...over,
  };
}

describe('buildLessonDayIndex — 기본 동작', () => {
  it('시간표가 준 요일에만 수업일이 잡힌다', () => {
    const idx = buildLessonDayIndex(baseInput());
    // 2026년 9월의 월요일: 7, 14, 21, 28 / 목요일: 3, 10, 17, 24
    const dates = [...idx.keys()].sort();
    expect(dates).toEqual([
      '2026-09-03',
      '2026-09-07',
      '2026-09-10',
      '2026-09-14',
      '2026-09-17',
      '2026-09-21',
      '2026-09-24',
      '2026-09-28',
    ]);
  });

  it('요일별 교시 번호가 맞는다', () => {
    const idx = buildLessonDayIndex(baseInput());
    expect(idx.get('2026-09-07')?.periods).toEqual([2]); // 월요일 2교시
    expect(idx.get('2026-09-03')?.periods).toEqual([3]); // 목요일 3교시
  });

  it('수업 없는 날은 키 자체가 없다', () => {
    const idx = buildLessonDayIndex(baseInput());
    expect(idx.has('2026-09-01')).toBe(false); // 화요일
  });

  it('주말은 기본적으로 잡히지 않는다', () => {
    const idx = buildLessonDayIndex(baseInput());
    expect(idx.has('2026-09-05')).toBe(false); // 토요일
    expect(idx.has('2026-09-06')).toBe(false); // 일요일
  });
});

describe('buildLessonDayIndex — matchStage 구분', () => {
  it('교실명 + 과목이 모두 맞으면 1단계', () => {
    const idx = buildLessonDayIndex(baseInput());
    expect(idx.get('2026-09-07')?.matchStage).toBe(1);
  });

  it('과목이 다르고 교실명만 맞으면 2단계', () => {
    const idx = buildLessonDayIndex(
      baseInput({
        teacherSchedule: {
          월: [null, { subject: '문학', classroom: '3학년 1반' }, null, null, null, null],
          화: [],
          수: [],
          목: [],
          금: [],
        },
      }),
    );
    expect(idx.get('2026-09-07')?.matchStage).toBe(2);
  });

  it('교사 시간표에 없고 담임반 시간표로만 맞으면 3단계', () => {
    const idx = buildLessonDayIndex(
      baseInput({
        teacherSchedule: { 월: [], 화: [], 수: [], 목: [], 금: [] },
        classSchedule: {
          월: [
            { subject: '수학', teacher: '김' },
            { subject: '국어', teacher: '이' },
          ],
          화: [],
          수: [],
          목: [],
          금: [],
        },
      }),
    );
    expect(idx.get('2026-09-07')?.matchStage).toBe(3);
    expect(idx.get('2026-09-07')?.periods).toEqual([2]);
  });

  it('교실명 부분 일치가 과대 매칭을 낼 수 있다는 사실이 2단계로 드러난다', () => {
    // '3-1'은 '3-10'의 앞부분이라 부분 문자열로 걸린다 — 다른 반 수업이 이 반 차시로 들어온다.
    // 이 계획은 매칭 함수를 고치지 않는 대신 matchStage를 열어 사용자가 볼 수 있게 한다.
    const idx = buildLessonDayIndex(
      baseInput({
        classes: [cls({ name: '3-1' })],
        teacherSchedule: {
          월: [null, { subject: '문학', classroom: '3-10' }, null, null, null, null],
          화: [],
          수: [],
          목: [],
          금: [],
        },
      }),
    );
    expect(idx.get('2026-09-07')?.matchStage).toBe(2);
  });

  it('반 이름이 완전히 다르면 매칭되지 않는다 (대조군)', () => {
    const idx = buildLessonDayIndex(
      baseInput({
        classes: [cls({ name: '3학년 1반' })],
        teacherSchedule: {
          월: [null, { subject: '문학', classroom: '3학년 10반' }, null, null, null, null],
          화: [],
          수: [],
          목: [],
          금: [],
        },
      }),
    );
    expect(idx.has('2026-09-07')).toBe(false);
  });
});

describe('buildLessonDayIndex — 변동 시간표(override)', () => {
  it('그날 수업이 취소되면 그 날짜가 빠진다', () => {
    const overrides: readonly TimetableOverride[] = [
      {
        id: 'ov-1',
        date: '2026-09-07',
        period: 2,
        subject: '', // 빈 과목 = 자습/공강
        createdAt: '2026-09-01T00:00:00.000Z',
      },
    ];
    const idx = buildLessonDayIndex(baseInput({ overrides }));
    expect(idx.has('2026-09-07')).toBe(false);
    expect(idx.has('2026-09-14')).toBe(true); // 다른 월요일은 그대로
  });

  it('보강으로 다른 날에 수업이 생기면 그 날짜가 들어온다', () => {
    const overrides: readonly TimetableOverride[] = [
      {
        id: 'ov-2',
        date: '2026-09-01', // 화요일 — 원래 수업 없음
        period: 4,
        subject: '국어',
        classroom: '3학년 1반',
        createdAt: '2026-09-01T00:00:00.000Z',
      },
    ];
    const idx = buildLessonDayIndex(baseInput({ overrides }));
    expect(idx.get('2026-09-01')?.periods).toEqual([4]);
  });

  it('학급 시간표에만 적용되는 변동은 교사 시간표를 건드리지 않는다', () => {
    const overrides: readonly TimetableOverride[] = [
      {
        id: 'ov-3',
        date: '2026-09-07',
        period: 2,
        subject: '',
        scope: 'class',
        createdAt: '2026-09-01T00:00:00.000Z',
      },
    ];
    const idx = buildLessonDayIndex(baseInput({ overrides }));
    expect(idx.has('2026-09-07')).toBe(true);
  });
});

describe('buildLessonDayIndex — 보관된 반과 잘못된 입력', () => {
  it('보관된 반은 계산 대상이 아니다 (빈 결과)', () => {
    const idx = buildLessonDayIndex(baseInput({ classes: [cls({ archived: true })] }));
    expect(idx.size).toBe(0);
  });

  it('대상 반이 목록에 없으면 빈 결과', () => {
    const idx = buildLessonDayIndex(baseInput({ targetClassId: 'tc-없음' }));
    expect(idx.size).toBe(0);
  });

  it('날짜 형식이 틀리면 빈 결과 (예외를 던지지 않는다)', () => {
    expect(buildLessonDayIndex(baseInput({ termStart: '2026/09/01' })).size).toBe(0);
    expect(buildLessonDayIndex(baseInput({ termEnd: '' })).size).toBe(0);
  });

  it('시작이 끝보다 늦으면 빈 결과', () => {
    expect(
      buildLessonDayIndex(baseInput({ termStart: '2026-09-30', termEnd: '2026-09-01' })).size,
    ).toBe(0);
  });

  it('시작과 끝이 같은 날이면 그 하루만 본다', () => {
    const idx = buildLessonDayIndex(baseInput({ termStart: '2026-09-07', termEnd: '2026-09-07' }));
    expect([...idx.keys()]).toEqual(['2026-09-07']);
  });

  it('구간이 지나치게 길어도 폭주하지 않는다 (상한 400일)', () => {
    const idx = buildLessonDayIndex(baseInput({ termStart: '2026-03-01', termEnd: '2030-03-01' }));
    // 400일 안의 월·목만 잡힌다 — 4년치가 아니라 상한에서 멈춘다
    expect(idx.size).toBeLessThanOrEqual(120);
    expect(idx.size).toBeGreaterThan(0);
  });
});

describe('buildLessonDayIndex — 주말 수업 설정', () => {
  it('토요일 수업을 켜면 토요일도 잡힌다', () => {
    const idx = buildLessonDayIndex(
      baseInput({
        weekendDays: ['토'],
        teacherSchedule: {
          ...teacherSchedule(),
          토: [{ subject: '국어', classroom: '3학년 1반' }, null, null, null, null, null],
        },
      }),
    );
    expect(idx.get('2026-09-05')?.periods).toEqual([1]);
  });
});

describe('buildLessonDayIndex — 성능 상한 (계획서 §5-5)', () => {
  it('학기 100일 × 변동 20건을 100ms 안에 처리한다', () => {
    const overrides: TimetableOverride[] = [];
    for (let i = 0; i < 20; i += 1) {
      const day = String(i + 1).padStart(2, '0');
      overrides.push({
        id: `ov-${i}`,
        date: `2026-09-${day}`,
        period: 2,
        subject: '국어',
        classroom: '3학년 1반',
        createdAt: '2026-09-01T00:00:00.000Z',
      });
    }

    const input = baseInput({ termStart: '2026-09-01', termEnd: '2026-12-09', overrides });

    const t0 = performance.now();
    const idx = buildLessonDayIndex(input);
    const elapsed = performance.now() - t0;

    expect(idx.size).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(100);
  });

  it('변동이 없는 날은 요일 결과를 재사용한다 — 100일이 7일치 계산으로 줄어든다', () => {
    // 재사용이 깨지면 이 테스트는 통과하지만 위 성능 테스트가 먼저 무너진다.
    // 여기서는 재사용이 결과를 바꾸지 않는다는 것만 잠근다.
    const withCache = buildLessonDayIndex(baseInput({ termEnd: '2026-12-09' }));
    const perDay = buildLessonDayIndex(
      baseInput({
        termEnd: '2026-12-09',
        // 모든 날짜에 무해한 변동(다른 학급 대상)을 깔아 캐시 경로를 우회시킨다
        overrides: [...Array(100).keys()].map((i) => {
          const d = new Date('2026-09-01T00:00:00');
          d.setDate(d.getDate() + i);
          const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          return {
            id: `noop-${i}`,
            date: iso,
            period: 99, // 존재하지 않는 교시 → 병합이 무시한다
            subject: '국어',
            createdAt: '2026-09-01T00:00:00.000Z',
          };
        }),
      }),
    );
    expect([...perDay.keys()].sort()).toEqual([...withCache.keys()].sort());
  });
});
