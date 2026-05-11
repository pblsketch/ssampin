import { describe, it, expect } from 'vitest';
import {
  getKoreanHolidays,
  getHolidayName,
  getHolidayMapForMonth,
  type HolidayInfo,
} from './holidayRules';

function names(holidays: readonly HolidayInfo[], date: string): string[] {
  return holidays.filter((h) => h.date === date).map((h) => h.name);
}

describe('getKoreanHolidays — 양력 고정 공휴일', () => {
  const h2025 = getKoreanHolidays(2025);

  it('8종 양력 고정 공휴일이 모두 포함된다', () => {
    expect(getHolidayName('2025-01-01', h2025)).toBe('신정');
    expect(getHolidayName('2025-03-01', h2025)).toBe('삼일절');
    expect(names(h2025, '2025-05-05')).toContain('어린이날');
    expect(getHolidayName('2025-06-06', h2025)).toBe('현충일');
    expect(getHolidayName('2025-08-15', h2025)).toBe('광복절');
    expect(getHolidayName('2025-10-03', h2025)).toBe('개천절');
    expect(getHolidayName('2025-10-09', h2025)).toBe('한글날');
    expect(getHolidayName('2025-12-25', h2025)).toBe('성탄절');
  });

  it('모든 날짜가 YYYY-MM-DD 형식이다', () => {
    for (const h of h2025) {
      expect(h.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(h.name.length).toBeGreaterThan(0);
    }
  });

  it('LUNAR_TABLE 에 없는 연도(2020)는 양력 고정 공휴일만 + 음력 공휴일 없음', () => {
    const h2020 = getKoreanHolidays(2020);
    expect(getHolidayName('2020-01-01', h2020)).toBe('신정');
    expect(h2020.some((h) => h.name === '설날')).toBe(false);
    expect(h2020.some((h) => h.name === '추석')).toBe(false);
    expect(h2020.some((h) => h.name === '부처님오신날')).toBe(false);
  });
});

describe('getKoreanHolidays — 음력 기반 공휴일 (2025)', () => {
  const h2025 = getKoreanHolidays(2025);

  it('설날 당일(01-29)과 전날·다음날 연휴(01-28, 01-30)', () => {
    expect(getHolidayName('2025-01-29', h2025)).toBe('설날');
    expect(getHolidayName('2025-01-28', h2025)).toBe('설날 연휴');
    expect(getHolidayName('2025-01-30', h2025)).toBe('설날 연휴');
  });

  it('부처님오신날(2025-05-05) — 어린이날과 같은 날에 둘 다 존재', () => {
    expect(names(h2025, '2025-05-05')).toEqual(
      expect.arrayContaining(['어린이날', '부처님오신날']),
    );
  });

  it('추석 당일(10-06)과 전날·다음날 연휴(10-05, 10-07)', () => {
    expect(getHolidayName('2025-10-06', h2025)).toBe('추석');
    expect(getHolidayName('2025-10-05', h2025)).toBe('추석 연휴');
    expect(getHolidayName('2025-10-07', h2025)).toBe('추석 연휴');
  });

  it('2026년 음력 공휴일도 LUNAR_TABLE 대로 계산된다', () => {
    const h2026 = getKoreanHolidays(2026);
    expect(getHolidayName('2026-02-17', h2026)).toBe('설날');
    expect(getHolidayName('2026-05-24', h2026)).toBe('부처님오신날');
    expect(getHolidayName('2026-09-25', h2026)).toBe('추석');
  });
});

describe('getKoreanHolidays — 대체공휴일 (2025)', () => {
  const h2025 = getKoreanHolidays(2025);

  it('삼일절(2025-03-01 토요일) → 2025-03-03(월) 대체공휴일', () => {
    const sub = h2025.find((h) => h.date === '2025-03-03');
    expect(sub).toBeDefined();
    expect(sub!.isSubstitute).toBe(true);
    expect(sub!.name).toContain('삼일절');
  });

  it('추석 연휴에 일요일(2025-10-05)이 포함 → 2025-10-08 대체공휴일', () => {
    const sub = h2025.find((h) => h.date === '2025-10-08');
    expect(sub).toBeDefined();
    expect(sub!.isSubstitute).toBe(true);
    expect(sub!.name).toContain('추석');
  });

  it('설날 연휴(2025-01-28~30)에는 일요일이 없으므로 설날 대체공휴일은 없다', () => {
    expect(h2025.some((h) => h.name.includes('설날') && h.isSubstitute)).toBe(false);
  });

  it('평일에 떨어지는 어린이날(2025-05-05 월)에는 대체공휴일이 없다', () => {
    expect(h2025.some((h) => h.name.includes('어린이날') && h.isSubstitute)).toBe(false);
  });
});

describe('getHolidayName', () => {
  const h2025 = getKoreanHolidays(2025);

  it('공휴일이면 이름, 아니면 null', () => {
    expect(getHolidayName('2025-01-01', h2025)).toBe('신정');
    expect(getHolidayName('2025-07-04', h2025)).toBeNull();
    expect(getHolidayName('2025-02-01', h2025)).toBeNull();
  });

  it('빈 목록이면 항상 null', () => {
    expect(getHolidayName('2025-01-01', [])).toBeNull();
  });
});

describe('getHolidayMapForMonth', () => {
  it('month 는 0-based — 0 = 1월', () => {
    const jan = getHolidayMapForMonth(2025, 0);
    expect(jan.get('2025-01-01')).toBe('신정');
    expect(jan.get('2025-01-28')).toBe('설날 연휴');
    expect(jan.get('2025-01-29')).toBe('설날');
    expect(jan.get('2025-01-30')).toBe('설날 연휴');
  });

  it('해당 월의 날짜만 포함한다', () => {
    const jan = getHolidayMapForMonth(2025, 0);
    for (const date of jan.keys()) {
      expect(date.startsWith('2025-01-')).toBe(true);
    }
  });

  it('같은 날에 공휴일이 둘이면 첫 번째 것만 표시한다 (2025-05-05 → 어린이날)', () => {
    const may = getHolidayMapForMonth(2025, 4);
    expect(may.get('2025-05-05')).toBe('어린이날');
  });

  it('공휴일이 없는 월(2025년 7월)은 빈 맵', () => {
    const jul = getHolidayMapForMonth(2025, 6);
    expect(jul.size).toBe(0);
  });
});
