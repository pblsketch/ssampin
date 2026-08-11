import { describe, it, expect } from 'vitest';
import {
  neisTermAxisForDate,
  otherNeisTermAxis,
  getNextWeekRange,
  getCurrentWeekRange,
} from '@domain/entities/NeisTimetable';
import { academicTermForDate } from '@domain/rules/academicCalendar';

describe('neisTermAxisForDate — 조회 날짜에서 학년도·학기 파생', () => {
  it('3~7월은 1학기, 8~12월은 2학기, 1~2월은 직전 학년도 2학기', () => {
    expect(neisTermAxisForDate('20260302')).toEqual({ academicYear: '2026', semester: '1' });
    expect(neisTermAxisForDate('20260711')).toEqual({ academicYear: '2026', semester: '1' });
    // 8월은 2학기 — 대부분의 학교가 8월 중순에 개학하므로 이쪽을 먼저 조회한다.
    expect(neisTermAxisForDate('20260811')).toEqual({ academicYear: '2026', semester: '2' });
    expect(neisTermAxisForDate('20260901')).toEqual({ academicYear: '2026', semester: '2' });
    expect(neisTermAxisForDate('20261231')).toEqual({ academicYear: '2026', semester: '2' });
    // 1~2월은 겨울방학 = 직전 학년도의 2학기 (학년도가 한 해 뒤로 간다)
    expect(neisTermAxisForDate('20270115')).toEqual({ academicYear: '2026', semester: '2' });
    expect(neisTermAxisForDate('20270228')).toEqual({ academicYear: '2026', semester: '2' });
  });

  it('학사 달력 정본(academicTermForDate)과 항상 같은 답을 낸다 — 규칙 2벌 방지', () => {
    const dates = [
      '20260301',
      '20260430',
      '20260731',
      '20260801',
      '20260831',
      '20260901',
      '20261130',
      '20270101',
      '20270201',
    ];
    for (const yyyymmdd of dates) {
      const iso = `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6)}`;
      const axis = neisTermAxisForDate(yyyymmdd);
      expect(`${axis?.academicYear}-${axis?.semester}`).toBe(academicTermForDate(iso));
    }
  });

  it('형식이 아니면 null — 축을 지어내지 않는다', () => {
    expect(neisTermAxisForDate('2026-08-11')).toBeNull();
    expect(neisTermAxisForDate('')).toBeNull();
    expect(neisTermAxisForDate('20261301')).toBeNull(); // 13월
  });
});

describe('otherNeisTermAxis — 반대 학기 폴백 축', () => {
  it('학년도는 그대로 두고 학기만 뒤집는다', () => {
    expect(otherNeisTermAxis({ academicYear: '2026', semester: '1' })).toEqual({
      academicYear: '2026',
      semester: '2',
    });
    expect(otherNeisTermAxis({ academicYear: '2026', semester: '2' })).toEqual({
      academicYear: '2026',
      semester: '1',
    });
  });

  it('두 번 뒤집으면 원래 축', () => {
    const axis = { academicYear: '2026', semester: '1' } as const;
    expect(otherNeisTermAxis(otherNeisTermAxis(axis))).toEqual(axis);
  });
});

describe('getNextWeekRange — 다음 주 월~금', () => {
  it('이번 주보다 정확히 7일 뒤이고 월~금 5일 폭이다', () => {
    const now = getCurrentWeekRange();
    const next = getNextWeekRange();

    const toDate = (s: string) =>
      new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6)));
    const dayMs = 86400000;

    expect((toDate(next.fromDate).getTime() - toDate(now.fromDate).getTime()) / dayMs).toBe(7);
    expect((toDate(next.toDate).getTime() - toDate(next.fromDate).getTime()) / dayMs).toBe(4);
    expect(toDate(next.fromDate).getDay()).toBe(1); // 월요일
    expect(toDate(next.toDate).getDay()).toBe(5); // 금요일
  });
});
