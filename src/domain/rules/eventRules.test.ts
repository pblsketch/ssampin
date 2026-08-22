import { describe, it, expect } from 'vitest';
import {
  isUrlLike,
  sanitizeEventTitle,
  parseLocalDate,
  getVisibleEvents,
  filterByCategory,
  sortByDate,
  isRecurring,
  getEventsForMonth,
  getEventsForDate,
  hasEventOnDate,
  getCategoriesOnDate,
  isMultiDayEvent,
  getMultiDayBarsForWeek,
  getMultiDayEventIdsOnDate,
  toDateKey,
  canMoveEventByDrag,
  moveEventToDate,
} from './eventRules';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';

let seq = 0;
function ev(extra: Partial<SchoolEvent> & Pick<SchoolEvent, 'date'>): SchoolEvent {
  return {
    id: extra.id ?? `e${seq++}`,
    title: extra.title ?? '행사',
    category: extra.category ?? 'school',
    ...extra,
  };
}

describe('isUrlLike / sanitizeEventTitle', () => {
  it('http(s)·webcal·ftp 로 시작하면 URL 로 본다 (앞뒤 공백 무시, 대소문자 무관)', () => {
    expect(isUrlLike('https://example.com')).toBe(true);
    expect(isUrlLike('  http://x ')).toBe(true);
    expect(isUrlLike('webcal://cal')).toBe(true);
    expect(isUrlLike('ftp://files')).toBe(true);
    expect(isUrlLike('HTTPS://X.COM')).toBe(true);
    expect(isUrlLike('학부모 상담')).toBe(false);
    expect(isUrlLike('자료: https://x')).toBe(false); // 중간에 있는 건 아님
  });

  it('빈 제목/공백/URL 은 "(제목 없음)" 으로 대체', () => {
    expect(sanitizeEventTitle('')).toBe('(제목 없음)');
    expect(sanitizeEventTitle('   ')).toBe('(제목 없음)');
    expect(sanitizeEventTitle('https://zoom.us/j/123')).toBe('(제목 없음)');
    expect(sanitizeEventTitle('운동회')).toBe('운동회');
  });
});

describe('parseLocalDate', () => {
  it('"YYYY-MM-DD" → 로컬 자정 Date', () => {
    const d = parseLocalDate('2026-03-09');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2); // 0-based → 3월
    expect(d.getDate()).toBe(9);
    expect(d.getHours()).toBe(0);
  });
});

describe('getVisibleEvents / filterByCategory', () => {
  it('isHidden 인 이벤트는 제외', () => {
    const events = [ev({ date: '2026-03-01' }), ev({ date: '2026-03-02', isHidden: true })];
    expect(getVisibleEvents(events)).toHaveLength(1);
    expect(getVisibleEvents(events)[0]!.date).toBe('2026-03-01');
  });

  it('카테고리 ID 로 필터', () => {
    const events = [
      ev({ date: '2026-03-01', category: 'exam' }),
      ev({ date: '2026-03-02', category: 'school' }),
      ev({ date: '2026-03-03', category: 'exam' }),
    ];
    expect(filterByCategory(events, 'exam')).toHaveLength(2);
    expect(filterByCategory(events, 'none')).toHaveLength(0);
  });
});

describe('sortByDate', () => {
  it('날짜 → sortOrder → id 순으로 정렬, 원본 불변', () => {
    const events = [
      ev({ id: 'c', date: '2026-03-10' }),
      ev({ id: 'a', date: '2026-03-05', sortOrder: 2 }),
      ev({ id: 'b', date: '2026-03-05', sortOrder: 1 }),
      ev({ id: 'd', date: '2026-03-05', sortOrder: 1 }), // b와 sortOrder 동률 → id 순 (b < d)
    ];
    const copy = [...events];
    const out = sortByDate(events);
    expect(out.map((e) => e.id)).toEqual(['b', 'd', 'a', 'c']);
    expect(events).toEqual(copy);
  });
});

describe('isRecurring', () => {
  // 2026-03-09 = 월요일
  it('recurrence 가 없으면 false', () => {
    expect(isRecurring(ev({ date: '2026-03-09' }), new Date(2026, 2, 16))).toBe(false);
  });

  it('원본 날짜 자신·시작일 이전 날짜에는 false', () => {
    const e = ev({ date: '2026-03-09', recurrence: 'weekly' });
    expect(isRecurring(e, new Date(2026, 2, 9))).toBe(false); // 원본 당일
    expect(isRecurring(e, new Date(2026, 2, 2))).toBe(false); // 시작 전
  });

  it('weekly — 같은 요일에만 true', () => {
    const e = ev({ date: '2026-03-09', recurrence: 'weekly' }); // 월
    expect(isRecurring(e, new Date(2026, 2, 16))).toBe(true); // 다음 주 월
    expect(isRecurring(e, new Date(2026, 2, 23))).toBe(true);
    expect(isRecurring(e, new Date(2026, 2, 15))).toBe(false); // 일요일
  });

  it('monthly — 같은 일자에만 true', () => {
    const e = ev({ date: '2026-03-10', recurrence: 'monthly' });
    expect(isRecurring(e, new Date(2026, 3, 10))).toBe(true); // 4/10
    expect(isRecurring(e, new Date(2026, 3, 11))).toBe(false);
  });

  it('yearly — 같은 월/일에만 true', () => {
    const e = ev({ date: '2026-03-10', recurrence: 'yearly' });
    expect(isRecurring(e, new Date(2027, 2, 10))).toBe(true); // 2027-03-10
    expect(isRecurring(e, new Date(2027, 3, 10))).toBe(false);
  });

  it('excludeDates 에 포함된 날짜는 false', () => {
    const e = ev({ date: '2026-03-09', recurrence: 'weekly', excludeDates: ['2026-03-16'] });
    expect(isRecurring(e, new Date(2026, 2, 16))).toBe(false);
    expect(isRecurring(e, new Date(2026, 2, 23))).toBe(true);
  });
});

describe('getEventsForMonth', () => {
  it('해당 월에 걸치는 이벤트만 (month 는 0-based)', () => {
    const events = [
      ev({ id: 'in', date: '2026-03-15' }),
      ev({ id: 'spanInto', date: '2026-02-25', endDate: '2026-03-05' }),
      ev({ id: 'spanOut', date: '2026-03-28', endDate: '2026-04-03' }),
      ev({ id: 'before', date: '2026-02-10' }),
      ev({ id: 'after', date: '2026-04-20' }),
    ];
    const ids = getEventsForMonth(events, 2026, 2)
      .map((e) => e.id)
      .sort();
    expect(ids).toEqual(['in', 'spanInto', 'spanOut']);
  });
});

describe('getEventsForDate / hasEventOnDate / getCategoriesOnDate', () => {
  const events = [
    ev({ id: 'single', date: '2026-03-10', category: 'school' }),
    ev({ id: 'range', date: '2026-03-08', endDate: '2026-03-12', category: 'exam' }),
    ev({ id: 'weekly', date: '2026-03-09', recurrence: 'weekly', category: 'class' }), // 월요일 반복
    ev({
      id: 'weeklyExcluded',
      date: '2026-03-02',
      recurrence: 'weekly',
      excludeDates: ['2026-03-16'],
      category: 'etc',
    }),
  ];

  it('단일·범위·반복 이벤트를 모두 잡는다', () => {
    // 3/10 (화): single + range
    expect(
      getEventsForDate(events, new Date(2026, 2, 10))
        .map((e) => e.id)
        .sort(),
    ).toEqual(['range', 'single']);
    // 3/16 (월): weekly 반복 (weeklyExcluded 는 excludeDates 로 제외)
    expect(getEventsForDate(events, new Date(2026, 2, 16)).map((e) => e.id)).toEqual(['weekly']);
  });

  it('hasEventOnDate', () => {
    expect(hasEventOnDate(events, new Date(2026, 2, 10))).toBe(true);
    // 2026-06-07 = 일요일 → 주간 반복(월요일) 대상이 아니므로 이벤트 없음
    expect(hasEventOnDate(events, new Date(2026, 5, 7))).toBe(false);
  });

  it('getCategoriesOnDate — 중복 제거', () => {
    expect([...getCategoriesOnDate(events, new Date(2026, 2, 10))].sort()).toEqual([
      'exam',
      'school',
    ]);
    expect(getCategoriesOnDate(events, new Date(2026, 5, 7))).toEqual([]);
  });
});

describe('isMultiDayEvent', () => {
  it('endDate 가 있고 date 와 다르면 true', () => {
    expect(isMultiDayEvent(ev({ date: '2026-03-01', endDate: '2026-03-03' }))).toBe(true);
    expect(isMultiDayEvent(ev({ date: '2026-03-01', endDate: '2026-03-01' }))).toBe(false);
    expect(isMultiDayEvent(ev({ date: '2026-03-01' }))).toBe(false);
  });
});

describe('getMultiDayBarsForWeek', () => {
  // 주: 일 2026-03-15 ~ 토 2026-03-21 (DST 경계 회피)
  const weekStart = new Date(2026, 2, 15);
  const weekEnd = new Date(2026, 2, 21);

  it('주 안의 다일 이벤트는 startCol·span·row 가 계산되고 연속 플래그는 false', () => {
    const { bars } = getMultiDayBarsForWeek(
      [ev({ id: 'm', date: '2026-03-16', endDate: '2026-03-18' })], // 월~수
      weekStart,
      weekEnd,
    );
    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({
      eventId: 'm',
      startCol: 1, // 월
      span: 3, // 월·화·수
      isContinuation: false,
      isContinued: false,
      row: 0,
    });
  });

  it('이전 주에서 이어지는 이벤트 → isContinuation, startCol 0 으로 클램프', () => {
    const { bars } = getMultiDayBarsForWeek(
      [ev({ id: 'prev', date: '2026-03-12', endDate: '2026-03-16' })],
      weekStart,
      weekEnd,
    );
    expect(bars[0]).toMatchObject({
      isContinuation: true,
      isContinued: false,
      startCol: 0,
      span: 2,
    });
  });

  it('다음 주로 이어지는 이벤트 → isContinued, 마지막 열까지만 클램프', () => {
    const { bars } = getMultiDayBarsForWeek(
      [ev({ id: 'next', date: '2026-03-20', endDate: '2026-03-25' })],
      weekStart,
      weekEnd,
    );
    expect(bars[0]).toMatchObject({
      isContinuation: false,
      isContinued: true,
      startCol: 5,
      span: 2,
    });
  });

  it('한 칸에 3개가 겹치면 2개만 표시되고 나머지는 overflowCounts 에 반영', () => {
    const sameDay = '2026-03-17'; // 화요일 → col 2
    const { bars, overflowCounts } = getMultiDayBarsForWeek(
      [
        ev({ id: 'a', date: sameDay }),
        ev({ id: 'b', date: sameDay }),
        ev({ id: 'c', date: sameDay }),
      ],
      weekStart,
      weekEnd,
    );
    expect(bars).toHaveLength(2);
    expect(overflowCounts[2]).toBe(1);
    expect(overflowCounts[0]).toBe(0);
  });
});

describe('getMultiDayEventIdsOnDate', () => {
  it('해당 날짜를 포함하는 다일 이벤트 ID 만 반환 (단일 이벤트 제외)', () => {
    const events = [
      ev({ id: 'multi', date: '2026-03-08', endDate: '2026-03-12' }),
      ev({ id: 'single', date: '2026-03-10' }),
      ev({ id: 'other', date: '2026-04-01', endDate: '2026-04-03' }),
    ];
    expect(getMultiDayEventIdsOnDate(events, new Date(2026, 2, 10))).toEqual(['multi']);
    expect(getMultiDayEventIdsOnDate(events, new Date(2026, 2, 20))).toEqual([]);
  });
});

describe('toDateKey / canMoveEventByDrag / moveEventToDate', () => {
  it('toDateKey 는 로컬 기준 YYYY-MM-DD 로 0 을 채워 만든다', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toDateKey(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('반복 일정과 생일은 드래그로 옮길 수 없다', () => {
    expect(canMoveEventByDrag(ev({ date: '2026-03-10', recurrence: 'weekly' })).ok).toBe(false);
    expect(canMoveEventByDrag(ev({ date: '2026-03-10', source: 'birthday' })).ok).toBe(false);
    expect(canMoveEventByDrag(ev({ date: '2026-03-10' })).ok).toBe(true);
  });

  it('하루짜리 일정은 놓은 날짜로 이동한다', () => {
    const moved = moveEventToDate(ev({ date: '2026-03-10' }), '2026-03-10', '2026-03-17');
    expect(moved?.date).toBe('2026-03-17');
    expect(moved?.endDate).toBeUndefined();
  });

  it('여러 날 일정은 기간 길이를 유지한 채 통째로 밀린다', () => {
    const moved = moveEventToDate(
      ev({ date: '2026-03-08', endDate: '2026-03-12' }),
      '2026-03-10', // 가운데를 잡아도 잡은 날 기준으로 이동량이 정해진다
      '2026-03-13',
    );
    expect(moved?.date).toBe('2026-03-11');
    expect(moved?.endDate).toBe('2026-03-15');
  });

  it('월·연을 넘어가도 날짜가 정상 계산된다', () => {
    expect(moveEventToDate(ev({ date: '2026-12-30' }), '2026-12-30', '2027-01-02')?.date).toBe(
      '2027-01-02',
    );
    expect(moveEventToDate(ev({ date: '2026-01-31' }), '2026-01-31', '2026-02-01')?.date).toBe(
      '2026-02-01',
    );
  });

  it('같은 날에 놓거나 옮길 수 없는 일정이면 null 을 준다', () => {
    expect(moveEventToDate(ev({ date: '2026-03-10' }), '2026-03-10', '2026-03-10')).toBeNull();
    expect(
      moveEventToDate(
        ev({ date: '2026-03-10', recurrence: 'monthly' }),
        '2026-03-10',
        '2026-03-11',
      ),
    ).toBeNull();
  });

  it('나이스 일정을 옮기면 isModified 가 서서 다음 동기화에 되돌아가지 않는다', () => {
    const moved = moveEventToDate(
      ev({ date: '2026-03-10', source: 'neis' }),
      '2026-03-10',
      '2026-03-11',
    );
    expect(moved?.isModified).toBe(true);
  });
});
