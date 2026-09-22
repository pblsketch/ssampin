/**
 * ADR-135 — 학사일정 조립: 나이스 학교 일정만 쓰고, 학사일정이 없으면 공휴일도 넣지 않는다.
 */
import { describe, it, expect } from 'vitest';
import {
  buildSchoolCalendarFromEvents,
  toSchoolCalendarEvents,
} from '../useObservationCheerContext';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';

const neis = (
  id: string,
  title: string,
  date: string,
  endDate?: string,
  extra: Partial<SchoolEvent> = {},
): SchoolEvent =>
  ({
    id,
    title,
    date,
    ...(endDate !== undefined ? { endDate } : {}),
    category: 'school',
    source: 'neis',
    ...extra,
  }) as SchoolEvent;

const TODAY = new Date(2026, 8, 23);

describe('나이스 학교 일정만 쓴다', () => {
  it('선생님이 만든 일정·구글 일정은 제목에 방학·평가가 있어도 쓰지 않는다', () => {
    const events = [
      { id: 'm', title: '가족 여름방학', date: '2026-09-01', category: 'personal' } as SchoolEvent,
      {
        id: 'g',
        title: '중간평가 준비',
        date: '2026-09-02',
        category: 'school',
        source: 'google',
      } as unknown as SchoolEvent,
      neis('n', '2학기 중간고사', '2026-10-05', '2026-10-07'),
    ];
    expect(toSchoolCalendarEvents(events).map((e) => e.title)).toEqual(['2학기 중간고사']);
  });

  it('숨긴 나이스 일정은 뺀다', () => {
    const events = [neis('n', '겨울방학', '2026-12-24', '2027-02-28', { isHidden: true })];
    expect(toSchoolCalendarEvents(events)).toHaveLength(0);
  });

  it('나이스 원본 행사명과 휴업일 구분으로 분류한다', () => {
    const [ev] = toSchoolCalendarEvents([
      neis('n', '바꾼 제목', '2026-10-09', undefined, {
        neis: { eventName: '한글날', subtractDayType: '공휴일' },
      } as Partial<SchoolEvent>),
    ]);
    expect(ev?.title).toBe('한글날');
    expect(ev?.group).toBe('holiday');
  });
});

describe('학사일정이 없을 때', () => {
  it('공휴일도 넣지 않는다 — 추석 주를 쉬는 주로 치지 않는다', () => {
    const cal = buildSchoolCalendarFromEvents([], TODAY);
    expect(cal.vacationDays.size).toBe(0);
    expect(cal.examDays.size).toBe(0);
    expect(cal.holidayDays.size).toBe(0);
  });

  it('선생님 일정만 있어도 없는 것으로 본다', () => {
    const cal = buildSchoolCalendarFromEvents(
      [{ id: 'm', title: '여름방학', date: '2026-08-01', category: 'personal' } as SchoolEvent],
      TODAY,
    );
    expect(cal.vacationDays.size).toBe(0);
    expect(cal.holidayDays.size).toBe(0);
  });
});

describe('학사일정이 있을 때', () => {
  it('여러 날 방학을 끝 날까지 펼치고 공휴일을 함께 넣는다', () => {
    const cal = buildSchoolCalendarFromEvents(
      [
        neis('v', '여름방학', '2026-07-20', '2026-08-16'),
        neis('e', '1학기 기말고사', '2026-07-01', '2026-07-03'),
      ],
      TODAY,
    );
    expect(cal.vacationDays.has('2026-07-20')).toBe(true);
    expect(cal.vacationDays.has('2026-08-16')).toBe(true);
    expect(cal.vacationDays.has('2026-08-17')).toBe(false);
    expect(cal.examDays.has('2026-07-02')).toBe(true);
    // 추석(2026-09-25 전후) 같은 법정 공휴일이 들어온다
    expect(cal.holidayDays.size).toBeGreaterThan(0);
    expect(cal.holidayDays.has('2026-10-03')).toBe(true);
  });
});
