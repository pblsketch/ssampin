import { describe, it, expect } from 'vitest';
import {
  DAY_LABELS,
  DEFAULT_MAX_COUNT,
  formatDateStr,
  parseDateStr,
  isSameDay,
  getCalendarDays,
  enumerateRange,
  getThisWeekDates,
  getNextWeekDates,
  formatDateKR,
  formatDateChip,
} from './calendarUtils';

describe('calendarUtils', () => {
  describe('상수', () => {
    it('DAY_LABELS는 일~토 7개', () => {
      expect(DAY_LABELS).toEqual(['일', '월', '화', '수', '목', '금', '토']);
    });

    it('DEFAULT_MAX_COUNT는 30', () => {
      expect(DEFAULT_MAX_COUNT).toBe(30);
    });
  });

  describe('formatDateStr', () => {
    it('YYYY-MM-DD 포맷으로 변환', () => {
      const d = new Date(2026, 4, 5); // May 5, 2026 (month is 0-based)
      expect(formatDateStr(d)).toBe('2026-05-05');
    });

    it('월/일 한자릿수 zero-pad', () => {
      const d = new Date(2026, 0, 1); // Jan 1, 2026
      expect(formatDateStr(d)).toBe('2026-01-01');
    });

    it('12월 31일 보존', () => {
      const d = new Date(2026, 11, 31);
      expect(formatDateStr(d)).toBe('2026-12-31');
    });
  });

  describe('parseDateStr', () => {
    it('ISO 날짜를 로컬 자정 Date로 변환', () => {
      const d = parseDateStr('2026-05-05');
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(4);
      expect(d.getDate()).toBe(5);
      expect(d.getHours()).toBe(0);
    });

    it('formatDateStr 라운드트립', () => {
      const original = '2026-05-15';
      expect(formatDateStr(parseDateStr(original))).toBe(original);
    });
  });

  describe('isSameDay', () => {
    it('같은 날짜는 true', () => {
      expect(isSameDay(new Date(2026, 4, 5, 10), new Date(2026, 4, 5, 23))).toBe(true);
    });

    it('다른 날짜는 false', () => {
      expect(isSameDay(new Date(2026, 4, 5), new Date(2026, 4, 6))).toBe(false);
    });

    it('연/월/일 중 하나만 달라도 false', () => {
      expect(isSameDay(new Date(2026, 4, 5), new Date(2027, 4, 5))).toBe(false);
      expect(isSameDay(new Date(2026, 4, 5), new Date(2026, 5, 5))).toBe(false);
    });
  });

  describe('getCalendarDays', () => {
    it('항상 42 셀 반환 (6주 × 7일)', () => {
      expect(getCalendarDays(2026, 4)).toHaveLength(42);
      expect(getCalendarDays(2026, 1)).toHaveLength(42); // Feb (단달)
      expect(getCalendarDays(2026, 0)).toHaveLength(42); // Jan
    });

    it('현재 월의 1일이 정확한 위치에 있음', () => {
      // 2026년 5월 1일 = 금요일 (getDay=5)
      const days = getCalendarDays(2026, 4);
      const firstOfMonth = days.find((d) => d.getDate() === 1 && d.getMonth() === 4);
      expect(firstOfMonth).toBeDefined();
      expect(firstOfMonth!.getDay()).toBe(5); // 금요일
    });

    it('첫 셀은 일요일 (getDay=0)', () => {
      const days = getCalendarDays(2026, 4);
      expect(days[0]!.getDay()).toBe(0);
    });

    it('마지막 셀은 토요일 (getDay=6)', () => {
      const days = getCalendarDays(2026, 4);
      expect(days[41]!.getDay()).toBe(6);
    });

    it('비현재월 spillover 포함', () => {
      const days = getCalendarDays(2026, 4); // May 2026
      const nonCurrentCount = days.filter((d) => d.getMonth() !== 4).length;
      expect(nonCurrentCount).toBeGreaterThan(0);
    });
  });

  describe('enumerateRange', () => {
    it('inclusive 범위 반환', () => {
      expect(enumerateRange('2026-05-01', '2026-05-03')).toEqual([
        '2026-05-01',
        '2026-05-02',
        '2026-05-03',
      ]);
    });

    it('start === end 면 1일 배열', () => {
      expect(enumerateRange('2026-05-05', '2026-05-05')).toEqual(['2026-05-05']);
    });

    it('start > end 면 빈 배열', () => {
      expect(enumerateRange('2026-05-05', '2026-05-04')).toEqual([]);
    });

    it('월 경계 건너뛰기', () => {
      const result = enumerateRange('2026-04-30', '2026-05-02');
      expect(result).toEqual(['2026-04-30', '2026-05-01', '2026-05-02']);
    });

    it('연 경계 건너뛰기', () => {
      const result = enumerateRange('2026-12-31', '2027-01-02');
      expect(result).toEqual(['2026-12-31', '2027-01-01', '2027-01-02']);
    });

    it('윤년 2월 처리 (2024년)', () => {
      const result = enumerateRange('2024-02-28', '2024-03-01');
      expect(result).toEqual(['2024-02-28', '2024-02-29', '2024-03-01']);
    });
  });

  describe('getThisWeekDates', () => {
    it('기준일이 일요일이면 그 일요일부터 시작', () => {
      // 2026년 5월 3일 = 일요일
      const sunday = new Date(2026, 4, 3);
      const result = getThisWeekDates(sunday);
      expect(result).toHaveLength(7);
      expect(result[0]).toBe('2026-05-03');
      expect(result[6]).toBe('2026-05-09');
    });

    it('주중 어느 날을 기준으로 해도 같은 주 반환', () => {
      const wednesday = new Date(2026, 4, 6); // 수요일
      const result = getThisWeekDates(wednesday);
      expect(result[0]).toBe('2026-05-03'); // 그 주 일요일
      expect(result[6]).toBe('2026-05-09'); // 그 주 토요일
    });

    it('weekdaysOnly=true 시 월~금 5일', () => {
      const sunday = new Date(2026, 4, 3);
      const result = getThisWeekDates(sunday, true);
      expect(result).toHaveLength(5);
      expect(result[0]).toBe('2026-05-04'); // 월
      expect(result[4]).toBe('2026-05-08'); // 금
    });
  });

  describe('getNextWeekDates', () => {
    it('다음 주 일요일부터 시작', () => {
      const sunday = new Date(2026, 4, 3);
      const result = getNextWeekDates(sunday);
      expect(result).toHaveLength(7);
      expect(result[0]).toBe('2026-05-10');
      expect(result[6]).toBe('2026-05-16');
    });

    it('weekdaysOnly=true 시 다음 주 월~금', () => {
      const sunday = new Date(2026, 4, 3);
      const result = getNextWeekDates(sunday, true);
      expect(result).toHaveLength(5);
      expect(result[0]).toBe('2026-05-11');
      expect(result[4]).toBe('2026-05-15');
    });
  });

  describe('formatDateKR', () => {
    it('M월 D일 포맷', () => {
      expect(formatDateKR('2026-05-05')).toBe('5월 5일');
    });

    it('한자릿수 월·일 패딩 없음', () => {
      expect(formatDateKR('2026-01-01')).toBe('1월 1일');
    });

    it('두자릿수 보존', () => {
      expect(formatDateKR('2026-12-31')).toBe('12월 31일');
    });
  });

  describe('formatDateChip', () => {
    it('M/D 짧은 포맷', () => {
      expect(formatDateChip('2026-05-05')).toBe('5/5');
    });

    it('한자릿수 월·일 패딩 없음', () => {
      expect(formatDateChip('2026-01-01')).toBe('1/1');
    });
  });
});
