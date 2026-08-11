import { describe, it, expect } from 'vitest';
import { addDays, resolveFanoutPlacement } from './progressFanout';

/** 요일별 수업 교시 표로 lessonPeriodsOn 콜백을 만든다 (0=일 ... 6=토) */
function scheduleByWeekday(table: Record<number, readonly number[]>) {
  return (date: string): readonly number[] => {
    const day = new Date(date + 'T00:00:00').getDay();
    return table[day] ?? [];
  };
}

const noneOccupied = () => false;

// 2026-08-11 = 화요일
const TUE = '2026-08-11';

describe('addDays', () => {
  it('월말을 넘겨도 로컬 날짜 기준으로 더한다', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays(TUE, 0)).toBe(TUE);
  });
});

describe('resolveFanoutPlacement', () => {
  it('같은 날 같은 교시에 수업이 있으면 그대로 배정한다', () => {
    const result = resolveFanoutPlacement({
      anchorDate: TUE,
      anchorPeriod: 3,
      lessonPeriodsOn: scheduleByWeekday({ 2: [3, 6] }),
      isOccupied: noneOccupied,
    });
    expect(result).toEqual({ ok: true, date: TUE, period: 3, kind: 'same-slot' });
  });

  it('같은 날이지만 교시가 다르면 그 반의 교시로 옮긴다', () => {
    const result = resolveFanoutPlacement({
      anchorDate: TUE,
      anchorPeriod: 3,
      lessonPeriodsOn: scheduleByWeekday({ 2: [5] }),
      isOccupied: noneOccupied,
    });
    expect(result).toEqual({ ok: true, date: TUE, period: 5, kind: 'same-day' });
  });

  it('그 날 수업이 없으면 가장 가까운 다음 수업으로 민다', () => {
    // 화요일 기준, 대상 반은 목요일(4) 2교시에만 수업
    const result = resolveFanoutPlacement({
      anchorDate: TUE,
      anchorPeriod: 3,
      lessonPeriodsOn: scheduleByWeekday({ 4: [2] }),
      isOccupied: noneOccupied,
    });
    expect(result).toEqual({ ok: true, date: '2026-08-13', period: 2, kind: 'next-lesson' });
  });

  it('이미 진도가 있는 자리는 건너뛰고 다음 수업으로 이어진다', () => {
    const table = scheduleByWeekday({ 2: [3], 4: [2] });
    const occupied = new Set([`${TUE}:3`]);
    const result = resolveFanoutPlacement({
      anchorDate: TUE,
      anchorPeriod: 3,
      lessonPeriodsOn: table,
      isOccupied: (d, p) => occupied.has(`${d}:${p}`),
    });
    expect(result).toEqual({ ok: true, date: '2026-08-13', period: 2, kind: 'next-lesson' });
  });

  it('같은 날 다른 빈 교시가 있으면 다음 주로 넘어가지 않는다', () => {
    const occupied = new Set([`${TUE}:3`]);
    const result = resolveFanoutPlacement({
      anchorDate: TUE,
      anchorPeriod: 3,
      lessonPeriodsOn: scheduleByWeekday({ 2: [3, 6] }),
      isOccupied: (d, p) => occupied.has(`${d}:${p}`),
    });
    expect(result).toEqual({ ok: true, date: TUE, period: 6, kind: 'same-day' });
  });

  it('시간표 매칭이 전혀 없으면 원본 날짜·교시를 그대로 쓴다', () => {
    const result = resolveFanoutPlacement({
      anchorDate: TUE,
      anchorPeriod: 3,
      lessonPeriodsOn: () => [],
      isOccupied: noneOccupied,
    });
    expect(result).toEqual({ ok: true, date: TUE, period: 3, kind: 'no-timetable' });
  });

  it('시간표도 없고 원본 자리마저 차 있으면 중복으로 보고한다', () => {
    const result = resolveFanoutPlacement({
      anchorDate: TUE,
      anchorPeriod: 3,
      lessonPeriodsOn: () => [],
      isOccupied: () => true,
    });
    expect(result).toEqual({ ok: false, reason: 'duplicate' });
  });

  it('검색 기간 안의 수업 자리가 모두 차 있으면 중복으로 보고한다', () => {
    const result = resolveFanoutPlacement({
      anchorDate: TUE,
      anchorPeriod: 3,
      lessonPeriodsOn: scheduleByWeekday({ 2: [3] }),
      isOccupied: () => true,
      searchDays: 14,
    });
    expect(result).toEqual({ ok: false, reason: 'duplicate' });
  });

  it('검색 기간 안에 수업이 하나도 없으면 시간표 미등록으로 보고 원본 자리를 쓴다', () => {
    // 수업이 검색 창(7일) 밖에만 있는 경우 — 엉뚱한 먼 날짜로 밀지 않는다
    const result = resolveFanoutPlacement({
      anchorDate: TUE,
      anchorPeriod: 3,
      lessonPeriodsOn: (date) => (date === '2026-09-30' ? [1] : []),
      isOccupied: noneOccupied,
      searchDays: 7,
    });
    expect(result).toEqual({ ok: true, date: TUE, period: 3, kind: 'no-timetable' });
  });
});
