import { describe, expect, it } from 'vitest';
import {
  buildExcludedTimesByDate,
  computeAvailableRanges,
  computeBreakPresets,
  computeDefaultExclusionKeys,
  computeDefaultExclusions,
  exclusionKey,
  parseExclusionKey,
  periodNumberOf,
  classTimeRangesFor,
  findClassTimeOpenSlots,
  splitRangeByClassTime,
  type PresetTimeSlice,
} from './consultationTimetableRules';

// ── 헬퍼 ─────────────────────────────────────────────────────────────

/**
 * 4교시 + 쉬는 시간 + 점심 + 조례 전/종례 후 로 이뤄진 표준 프리셋.
 * 화면의 computeBreakPresets 가 만들어 내는 모양과 같다.
 */
const PRESETS: readonly PresetTimeSlice[] = [
  { id: 'before-school', startTime: '08:40', endTime: '09:00' },
  { id: 'period-1', startTime: '09:00', endTime: '09:50' },
  { id: 'break-1', startTime: '09:50', endTime: '10:00' },
  { id: 'period-2', startTime: '10:00', endTime: '10:50' },
  { id: 'lunch', startTime: '10:50', endTime: '11:50' },
  { id: 'period-3', startTime: '11:50', endTime: '12:40' },
  { id: 'break-3', startTime: '12:40', endTime: '12:50' },
  { id: 'period-4', startTime: '12:50', endTime: '13:40' },
  { id: 'after-school', startTime: '13:40', endTime: '14:10' },
];

function ids(set: ReadonlySet<string>): string[] {
  return [...set].sort();
}

// ── 키 형식 ──────────────────────────────────────────────────────────

describe('exclusionKey / parseExclusionKey', () => {
  it('왕복해도 원래 값이 나온다', () => {
    const cases: readonly [string, string][] = [
      ['2026-03-02', 'period-3'],
      ['2026-03-02', 'lunch'],
      ['2026-12-31', 'before-school'],
      ['2026-06-01', 'break-10'],
    ];
    for (const [date, presetId] of cases) {
      expect(parseExclusionKey(exclusionKey(date, presetId))).toEqual({ date, presetId });
    }
  });

  it('구분자가 없으면 날짜를 빈 문자열로 돌려준다 (옛 형식 키 방어)', () => {
    expect(parseExclusionKey('period-3')).toEqual({ date: '', presetId: 'period-3' });
  });
});

describe('periodNumberOf', () => {
  it('수업 교시만 번호를 돌려준다', () => {
    expect(periodNumberOf('period-3')).toBe(3);
    expect(periodNumberOf('period-11')).toBe(11);
    expect(periodNumberOf('lunch')).toBeNull();
    expect(periodNumberOf('break-3')).toBeNull();
    expect(periodNumberOf('before-school')).toBeNull();
    expect(periodNumberOf('after-school')).toBeNull();
  });
});

// ── 기본 제외 계산 ───────────────────────────────────────────────────

describe('computeDefaultExclusions', () => {
  it('classOnly — 공강이 아닌 수업 교시만 제외한다', () => {
    const result = computeDefaultExclusions({
      presets: PRESETS,
      freePeriods: new Set([2, 3]), // 2·3교시 공강
      mode: 'classOnly',
    });
    expect(ids(result)).toEqual(['period-1', 'period-4']);
  });

  it('classOnly — 쉬는 시간·점심은 상담 가능으로 남긴다', () => {
    const result = computeDefaultExclusions({
      presets: PRESETS,
      freePeriods: new Set<number>(),
      mode: 'classOnly',
    });
    expect(result.has('lunch')).toBe(false);
    expect(result.has('break-1')).toBe(false);
    expect(result.has('break-3')).toBe(false);
  });

  it('freeOnly — 수업 + 쉬는 시간 + 점심을 제외해 공강만 남긴다', () => {
    const result = computeDefaultExclusions({
      presets: PRESETS,
      freePeriods: new Set([2]), // 2교시만 공강
      mode: 'freeOnly',
    });
    expect(ids(result)).toEqual([
      'break-1',
      'break-3',
      'lunch',
      'period-1',
      'period-3',
      'period-4',
    ]);
  });

  it('freeOnly 에서도 조례 전·종례 후는 언제나 남긴다', () => {
    const result = computeDefaultExclusions({
      presets: PRESETS,
      freePeriods: new Set<number>(),
      mode: 'freeOnly',
    });
    expect(result.has('before-school')).toBe(false);
    expect(result.has('after-school')).toBe(false);
  });

  it('★ freePeriods 가 null(시간표 없는 날)이면 아무것도 제외하지 않는다', () => {
    // 토·일에 주말 시간표를 안 켠 경우. 빈 Set 으로 다루면 전부 막혀 슬롯이 0개가 된다.
    for (const mode of ['classOnly', 'freeOnly'] as const) {
      const result = computeDefaultExclusions({ presets: PRESETS, freePeriods: null, mode });
      expect(result.size).toBe(0);
    }
  });

  it('★ null(시간표 없음)과 빈 Set(공강 0교시)은 다른 결과를 낸다', () => {
    const noTimetable = computeDefaultExclusions({
      presets: PRESETS,
      freePeriods: null,
      mode: 'classOnly',
    });
    const noFreePeriod = computeDefaultExclusions({
      presets: PRESETS,
      freePeriods: new Set<number>(),
      mode: 'classOnly',
    });
    expect(noTimetable.size).toBe(0);
    expect(ids(noFreePeriod)).toEqual(['period-1', 'period-2', 'period-3', 'period-4']);
  });
});

// ── 날짜별 계산 (이 작업의 핵심) ─────────────────────────────────────

describe('computeDefaultExclusionKeys', () => {
  it('★ 요일이 다른 두 날짜는 각자의 시간표로 계산된다 (회귀 방지)', () => {
    // 고치기 전에는 첫 날짜(월)의 결과를 화요일에도 그대로 복사해서,
    // 교사가 수업 중인 화요일 3교시에 학부모 예약이 들어올 수 있었다.
    const monday = '2026-03-02';
    const tuesday = '2026-03-03';

    const keys = computeDefaultExclusionKeys({
      dates: [monday, tuesday],
      presets: PRESETS,
      freePeriodsByDate: new Map([
        [monday, new Set([3])], // 월: 3교시 공강
        [tuesday, new Set([1])], // 화: 1교시 공강
      ]),
      mode: 'classOnly',
    });

    // 월요일 — 3교시는 열려 있고 1교시는 막힌다
    expect(keys.has(exclusionKey(monday, 'period-3'))).toBe(false);
    expect(keys.has(exclusionKey(monday, 'period-1'))).toBe(true);

    // 화요일 — 정반대여야 한다
    expect(keys.has(exclusionKey(tuesday, 'period-3'))).toBe(true);
    expect(keys.has(exclusionKey(tuesday, 'period-1'))).toBe(false);
  });

  it('시간표를 모르는 날짜는 제외하지 않는다', () => {
    const keys = computeDefaultExclusionKeys({
      dates: ['2026-03-02', '2026-03-07'], // 07 은 토요일 — 지도에 없음
      presets: PRESETS,
      freePeriodsByDate: new Map([['2026-03-02', new Set([1])]]),
      mode: 'classOnly',
    });
    expect([...keys].every((k) => parseExclusionKey(k).date === '2026-03-02')).toBe(true);
  });

  it('지도에 null 로 들어 있는 날짜도 제외하지 않는다', () => {
    const keys = computeDefaultExclusionKeys({
      dates: ['2026-03-07'],
      presets: PRESETS,
      freePeriodsByDate: new Map([['2026-03-07', null]]),
      mode: 'classOnly',
    });
    expect(keys.size).toBe(0);
  });

  it('빈 날짜 문자열은 건너뛴다 (날짜를 아직 안 고른 줄)', () => {
    const keys = computeDefaultExclusionKeys({
      dates: ['', '2026-03-02'],
      presets: PRESETS,
      freePeriodsByDate: new Map([['2026-03-02', new Set<number>()]]),
      mode: 'classOnly',
    });
    expect([...keys].every((k) => parseExclusionKey(k).date === '2026-03-02')).toBe(true);
  });
});

// ── 제외 키 → 날짜별 시간 구간 ───────────────────────────────────────

describe('buildExcludedTimesByDate', () => {
  it('날짜별로 갈라서 담는다', () => {
    const result = buildExcludedTimesByDate({
      excludedKeys: new Set([
        exclusionKey('2026-03-02', 'period-1'),
        exclusionKey('2026-03-03', 'period-3'),
      ]),
      presets: PRESETS,
    });

    expect(result.get('2026-03-02')).toEqual([{ startTime: '09:00', endTime: '09:50' }]);
    expect(result.get('2026-03-03')).toEqual([{ startTime: '11:50', endTime: '12:40' }]);
  });

  it('교사가 직접 넣은 제외를 같은 날짜에 합친다', () => {
    const result = buildExcludedTimesByDate({
      excludedKeys: new Set([exclusionKey('2026-03-02', 'period-1')]),
      presets: PRESETS,
      customByDate: new Map([['2026-03-02', [{ startTime: '15:00', endTime: '16:00' }]]]),
    });

    const list = result.get('2026-03-02') ?? [];
    expect(list).toHaveLength(2);
    expect(list).toContainEqual({ startTime: '09:00', endTime: '09:50' });
    expect(list).toContainEqual({ startTime: '15:00', endTime: '16:00' });
  });

  it('프리셋에 없는 키는 조용히 버린다 (교시 설정이 바뀐 경우)', () => {
    const result = buildExcludedTimesByDate({
      excludedKeys: new Set([
        exclusionKey('2026-03-02', 'period-9'), // PRESETS 에 없다
        exclusionKey('2026-03-02', 'period-1'),
      ]),
      presets: PRESETS,
    });
    expect(result.get('2026-03-02')).toEqual([{ startTime: '09:00', endTime: '09:50' }]);
  });

  it('제외가 없는 날짜는 지도에 아예 안 들어간다', () => {
    const result = buildExcludedTimesByDate({ excludedKeys: new Set(), presets: PRESETS });
    expect(result.size).toBe(0);
  });
});

// ── 남은 시간 계산 (옮겨 온 함수) ────────────────────────────────────

describe('computeAvailableRanges', () => {
  it('제외가 없으면 범위 전체가 한 덩어리로 남는다', () => {
    expect(computeAvailableRanges('09:00', '17:00', [])).toEqual([
      { startTime: '09:00', endTime: '17:00' },
    ]);
  });

  it('가운데를 빼면 두 덩어리로 갈라진다', () => {
    expect(
      computeAvailableRanges('09:00', '12:00', [{ startTime: '10:00', endTime: '10:50' }]),
    ).toEqual([
      { startTime: '09:00', endTime: '10:00' },
      { startTime: '10:50', endTime: '12:00' },
    ]);
  });

  it('맞닿은 제외 구간은 하나로 붙어 잘린다', () => {
    expect(
      computeAvailableRanges('09:00', '12:00', [
        { startTime: '10:00', endTime: '10:50' },
        { startTime: '10:50', endTime: '11:40' },
      ]),
    ).toEqual([
      { startTime: '09:00', endTime: '10:00' },
      { startTime: '11:40', endTime: '12:00' },
    ]);
  });

  it('서로 겹치는 제외 구간도 안전하다', () => {
    expect(
      computeAvailableRanges('09:00', '12:00', [
        { startTime: '10:00', endTime: '11:00' },
        { startTime: '10:30', endTime: '11:30' },
      ]),
    ).toEqual([
      { startTime: '09:00', endTime: '10:00' },
      { startTime: '11:30', endTime: '12:00' },
    ]);
  });

  it('범위 밖으로 삐져나간 제외 구간도 안전하다', () => {
    expect(
      computeAvailableRanges('09:00', '12:00', [{ startTime: '08:00', endTime: '10:00' }]),
    ).toEqual([{ startTime: '10:00', endTime: '12:00' }]);
    expect(
      computeAvailableRanges('09:00', '12:00', [{ startTime: '11:00', endTime: '23:00' }]),
    ).toEqual([{ startTime: '09:00', endTime: '11:00' }]);
  });

  it('범위를 통째로 덮으면 남는 구간이 없다', () => {
    expect(
      computeAvailableRanges('09:00', '12:00', [{ startTime: '09:00', endTime: '12:00' }]),
    ).toEqual([]);
  });

  it('시작이 종료보다 늦거나 같으면 빈 배열', () => {
    expect(computeAvailableRanges('12:00', '09:00', [])).toEqual([]);
    expect(computeAvailableRanges('09:00', '09:00', [])).toEqual([]);
  });

  it('범위 경계에 딱 맞는 제외는 경계만 깎는다', () => {
    expect(
      computeAvailableRanges('09:00', '12:00', [{ startTime: '09:00', endTime: '09:30' }]),
    ).toEqual([{ startTime: '09:30', endTime: '12:00' }]);
  });
});

// ── 하루 시간대 목록 만들기 ─────────────────────────────────────────

describe('computeBreakPresets', () => {
  const PERIODS = [
    { period: 1, start: '09:00', end: '09:50' },
    { period: 2, start: '10:00', end: '10:50' },
    { period: 3, start: '11:50', end: '12:40' },
  ];

  it('교시 설정이 없으면 빈 배열', () => {
    expect(computeBreakPresets([])).toEqual([]);
  });

  it('조례 전 · 교시 · 쉬는 시간 · 종례 후를 순서대로 만든다', () => {
    const ids = computeBreakPresets(PERIODS, '10:50', '11:50').map((p) => p.id);
    expect(ids).toEqual([
      'before-school',
      'period-1',
      'break-1',
      'period-2',
      'lunch',
      'period-3',
      'after-school',
    ]);
  });

  it('조례 전은 1교시 20분 전부터, 종례 후는 마지막 교시 30분 뒤까지', () => {
    const presets = computeBreakPresets(PERIODS, '10:50', '11:50');
    expect(presets[0]).toMatchObject({ id: 'before-school', startTime: '08:40', endTime: '09:00' });
    expect(presets[presets.length - 1]).toMatchObject({
      id: 'after-school',
      startTime: '12:40',
      endTime: '13:10',
    });
  });

  it('점심 설정이 없으면 30분 이상인 가장 긴 간격을 점심으로 본다', () => {
    const ids = computeBreakPresets(PERIODS).map((p) => p.id);
    expect(ids).toContain('lunch'); // 10:50~11:50 (60분) 이 가장 길다
    expect(ids.filter((id) => id === 'lunch')).toHaveLength(1);
  });

  it('교시 순서가 뒤섞여 들어와도 시각 순으로 정렬한다', () => {
    const shuffled = [PERIODS[2]!, PERIODS[0]!, PERIODS[1]!];
    expect(computeBreakPresets(shuffled, '10:50', '11:50').map((p) => p.id)).toEqual(
      computeBreakPresets(PERIODS, '10:50', '11:50').map((p) => p.id),
    );
  });

  it('교시가 하나면 쉬는 시간 없이 조례 전·교시·종례 후만', () => {
    expect(
      computeBreakPresets([{ period: 1, start: '09:00', end: '09:50' }]).map((p) => p.id),
    ).toEqual(['before-school', 'period-1', 'after-school']);
  });
});

// ── 편집 화면의 "수업 빼기" ──────────────────────────────────────────

describe('splitRangeByClassTime', () => {
  it('그 날 수업 중인 교시만 빼고 나눈다', () => {
    const ranges = splitRangeByClassTime({
      startTime: '09:00',
      endTime: '14:00',
      presets: PRESETS,
      freePeriods: new Set([3]), // 3교시만 공강
    });
    // 1·2·4교시(수업)는 빠지고, 쉬는시간·점심·3교시·종례 후는 남는다
    expect(ranges).toEqual([
      { startTime: '09:50', endTime: '10:00' },
      { startTime: '10:50', endTime: '12:50' }, // 점심 + 3교시(공강) + 쉬는시간이 이어짐
      { startTime: '13:40', endTime: '14:00' },
    ]);
  });

  it('★ 요일이 다르면 다른 결과가 나온다 (같은 시간 범위여도)', () => {
    const mon = splitRangeByClassTime({
      startTime: '09:00',
      endTime: '14:00',
      presets: PRESETS,
      freePeriods: new Set([3]),
    });
    const tue = splitRangeByClassTime({
      startTime: '09:00',
      endTime: '14:00',
      presets: PRESETS,
      freePeriods: new Set([1]),
    });
    expect(mon).not.toEqual(tue);
    // 화요일은 1교시가 공강이라 09:00 부터 열린다
    expect(tue[0]).toEqual({ startTime: '09:00', endTime: '10:00' });
  });

  it('시간표가 없는 날(null)이면 원래 범위를 그대로 돌려준다', () => {
    expect(
      splitRangeByClassTime({
        startTime: '09:00',
        endTime: '17:00',
        presets: PRESETS,
        freePeriods: null,
      }),
    ).toEqual([{ startTime: '09:00', endTime: '17:00' }]);
  });

  it('범위가 수업과 하나도 안 겹치면 그대로 둔다', () => {
    expect(
      splitRangeByClassTime({
        startTime: '15:00',
        endTime: '17:00',
        presets: PRESETS,
        freePeriods: new Set([1]),
      }),
    ).toEqual([{ startTime: '15:00', endTime: '17:00' }]);
  });

  it('범위 전체가 수업이면 빈 배열 (호출자가 "남는 시간 없음"으로 안내한다)', () => {
    expect(
      splitRangeByClassTime({
        startTime: '09:00',
        endTime: '09:50',
        presets: PRESETS,
        freePeriods: new Set<number>(),
      }),
    ).toEqual([]);
  });
});

// ── 만든 뒤 안전망: 수업과 겹치는 슬롯 찾기 ─────────────────────────

describe('findClassTimeOpenSlots', () => {
  const MON = '2026-03-02';
  const TUE = '2026-03-03';

  /** 월=3교시 공강 / 화=1교시 공강 */
  const FREE = new Map<string, ReadonlySet<number> | null>([
    [MON, new Set([3])],
    [TUE, new Set([1])],
  ]);

  const slot = (
    id: string,
    date: string,
    startTime: string,
    endTime: string,
    status = 'available',
  ) => ({ id, date, startTime, endTime, status });

  it('수업과 겹치는 열린 슬롯만 골라낸다', () => {
    const res = findClassTimeOpenSlots({
      slots: [
        slot('a', MON, '09:00', '09:30'), // 1교시(수업) → 걸린다
        slot('b', MON, '11:50', '12:20'), // 3교시(공강) → 안 걸린다
        slot('c', MON, '10:50', '11:20'), // 점심 → 안 걸린다
      ],
      presets: PRESETS,
      freePeriodsByDate: FREE,
      bookedSlotIds: new Set(),
    });
    expect(res.openSlotIds).toEqual(['a']);
    expect(res.bookedSlotIds).toEqual([]);
  });

  it('★ 같은 시각이어도 요일이 다르면 결과가 다르다', () => {
    const res = findClassTimeOpenSlots({
      slots: [
        slot('mon-1', MON, '09:00', '09:30'), // 월 1교시 = 수업 → 걸린다
        slot('tue-1', TUE, '09:00', '09:30'), // 화 1교시 = 공강 → 안 걸린다
      ],
      presets: PRESETS,
      freePeriodsByDate: FREE,
      bookedSlotIds: new Set(),
    });
    expect(res.openSlotIds).toEqual(['mon-1']);
  });

  it('예약이 들어온 슬롯은 막을 수 없으므로 따로 돌려준다', () => {
    const res = findClassTimeOpenSlots({
      slots: [slot('booked', MON, '09:00', '09:30'), slot('open', MON, '10:00', '10:30')],
      presets: PRESETS,
      freePeriodsByDate: FREE,
      bookedSlotIds: new Set(['booked']),
    });
    expect(res.openSlotIds).toEqual(['open']);
    expect(res.bookedSlotIds).toEqual(['booked']);
  });

  it('이미 막혀 있는 슬롯은 알릴 것이 없다', () => {
    const res = findClassTimeOpenSlots({
      slots: [slot('blocked', MON, '09:00', '09:30', 'blocked')],
      presets: PRESETS,
      freePeriodsByDate: FREE,
      bookedSlotIds: new Set(),
    });
    expect(res.openSlotIds).toEqual([]);
    expect(res.bookedSlotIds).toEqual([]);
  });

  it('★ 시간표가 없는 날(null)은 막을 근거가 없으므로 하나도 안 걸린다', () => {
    const sat = '2026-03-07';
    const res = findClassTimeOpenSlots({
      slots: [slot('s1', sat, '09:00', '09:30'), slot('s2', sat, '13:00', '13:30')],
      presets: PRESETS,
      freePeriodsByDate: new Map([[sat, null]]),
      bookedSlotIds: new Set(),
    });
    expect(res.openSlotIds).toEqual([]);
  });

  it('지도에 아예 없는 날짜도 안 걸린다', () => {
    const res = findClassTimeOpenSlots({
      slots: [slot('x', '2026-05-05', '09:00', '09:30')],
      presets: PRESETS,
      freePeriodsByDate: FREE,
      bookedSlotIds: new Set(),
    });
    expect(res.openSlotIds).toEqual([]);
  });

  it('1분이라도 걸치면 잡고, 딱 맞닿기만 하면 안 잡는다', () => {
    const res = findClassTimeOpenSlots({
      slots: [
        slot('touch', MON, '09:50', '10:00'), // 1교시 끝나고 시작 → 안 걸린다
        slot('overlap', MON, '09:45', '10:00'), // 1교시 끝 5분 걸침 → 걸린다
      ],
      presets: PRESETS,
      freePeriodsByDate: FREE,
      bookedSlotIds: new Set(),
    });
    expect(res.openSlotIds).toEqual(['overlap']);
  });
});

describe('classTimeRangesFor', () => {
  it('수업 교시만 돌려준다 (공강·쉬는시간·점심·조례전후 제외)', () => {
    expect(classTimeRangesFor({ presets: PRESETS, freePeriods: new Set([2, 3]) })).toEqual([
      { startTime: '09:00', endTime: '09:50' }, // 1교시
      { startTime: '12:50', endTime: '13:40' }, // 4교시
    ]);
  });

  it('시간표가 없는 날은 빈 배열', () => {
    expect(classTimeRangesFor({ presets: PRESETS, freePeriods: null })).toEqual([]);
  });
});
