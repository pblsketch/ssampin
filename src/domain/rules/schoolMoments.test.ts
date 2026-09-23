import { describe, it, expect } from 'vitest';
import { buildSchoolCalendarDays, type SchoolCalendarEvent } from './schoolCalendarDays';
import { momentOfDay, termFirstDay, type MomentEvent, type MomentInput } from './schoolMoments';

const NO_CAL = buildSchoolCalendarDays([], []);

function cal(events: SchoolCalendarEvent[] = [], holidays: string[] = []) {
  return buildSchoolCalendarDays(events, holidays);
}

function input(date: string, p: Partial<MomentInput> = {}): MomentInput {
  return {
    date,
    events: [],
    calendar: NO_CAL,
    termStartDates: undefined,
    isHighSchool: false,
    ...p,
  };
}

const ev = (title: string, date: string): MomentEvent => ({ title, date });

describe('학기 첫날', () => {
  it('등록된 개학일이 그날이면 인사', () => {
    const m = momentOfDay(input('2026-08-17', { termStartDates: { '2026-2': '2026-08-17' } }));
    expect(m?.kind).toBe('termStart');
    expect(m?.look).toBe('season');
  });

  it('등록이 없으면 학사일정의 개학·시업식 가운데 가장 이른 날', () => {
    const events = [ev('2학기 개학식', '2026-08-18'), ev('개학식', '2027-02-03')];
    expect(momentOfDay(input('2026-08-18', { events }))?.kind).toBe('termStart');
    expect(momentOfDay(input('2027-02-03', { events }))).toBeNull();
  });

  it('1학기 첫날은 시업식으로 올라와도 잡는다', () => {
    expect(momentOfDay(input('2026-03-03', { events: [ev('시업식', '2026-03-03')] }))?.kind).toBe(
      'termStart',
    );
  });

  it('1·2월 날짜는 학기 첫날이 아니다(겨울방학 뒤 잠깐 등교)', () => {
    const events = [ev('개학식', '2027-02-03')];
    expect(
      termFirstDay('2026-2', { start: '2026-08-01', end: '2027-02-28' }, events, undefined),
    ).toBeNull();
    expect(momentOfDay(input('2027-02-03', { events }))).toBeNull();
  });

  it('등록도 학사일정도 없으면 달력으로 짐작하지 않는다(3월 2일 인사 없음)', () => {
    expect(momentOfDay(input('2026-03-02'))).toBeNull();
  });
});

describe('방학 전날·입학식·졸업식', () => {
  it('방학식 날', () => {
    const events = [ev('여름방학식', '2026-07-17')];
    const m = momentOfDay(input('2026-07-17', { events }));
    expect(m).toMatchObject({ kind: 'vacationEve', title: '여름방학식', look: 'season' });
  });

  it('종업식도 방학 전날이다', () => {
    expect(momentOfDay(input('2027-02-12', { events: [ev('종업식', '2027-02-12')] }))?.kind).toBe(
      'vacationEve',
    );
  });

  it('입학식과 시업식이 같은 날이면 입학식이 이긴다', () => {
    const events = [ev('입학식', '2026-03-03'), ev('시업식', '2026-03-03')];
    expect(momentOfDay(input('2026-03-03', { events }))).toMatchObject({
      kind: 'ceremony',
      look: 'flag',
    });
  });

  it('졸업식은 2월이어도 인사한다', () => {
    expect(momentOfDay(input('2027-02-10', { events: [ev('졸업식', '2027-02-10')] }))?.kind).toBe(
      'ceremony',
    );
  });
});

describe('스승의 날', () => {
  it('5월 15일이 등교일이면 그날', () => {
    const m = momentOfDay(input('2026-05-15'));
    expect(m).toMatchObject({ kind: 'teachersDay', look: 'flower', targetDate: '2026-05-15' });
  });

  it('주말이면 바로 앞 등교일(2027-05-15 토 → 5-14 금)', () => {
    expect(momentOfDay(input('2027-05-14'))?.kind).toBe('teachersDay');
    expect(momentOfDay(input('2027-05-15'))).toBeNull();
  });

  it('앞 날도 쉬는 날이면 더 앞으로(공휴일)', () => {
    const c = cal([], ['2027-05-14']);
    expect(momentOfDay(input('2027-05-13', { calendar: c }))?.kind).toBe('teachersDay');
  });
});

describe('수능', () => {
  it('고등학교면 수능 전 마지막 등교일(2026-11-19 목 → 11-18 수)', () => {
    const m = momentOfDay(input('2026-11-18', { isHighSchool: true }));
    expect(m).toMatchObject({ kind: 'suneungEve', look: 'headband', targetDate: '2026-11-19' });
  });

  it('수능날 당일은 인사하지 않는다', () => {
    expect(momentOfDay(input('2026-11-19', { isHighSchool: true }))).toBeNull();
  });

  it('전날이 재량휴업이면 그 앞 등교일', () => {
    const c = cal([{ title: '재량휴업일', date: '2026-11-18', group: 'vacation' }]);
    expect(momentOfDay(input('2026-11-17', { isHighSchool: true, calendar: c }))?.kind).toBe(
      'suneungEve',
    );
  });

  it('고등학교가 아니면 없다', () => {
    expect(momentOfDay(input('2026-11-18', { isHighSchool: false }))).toBeNull();
  });

  it('날짜표에 없는 해는 없다', () => {
    expect(
      momentOfDay(input('2028-11-15', { isHighSchool: true, suneungDates: ['2026-11-19'] })),
    ).toBeNull();
  });
});

describe('학교 행사', () => {
  it('고른 낱말이 든 행사는 첫날에 인사하고 제목을 넘긴다', () => {
    const events = [ev('체육대회', '2026-10-08'), ev('체육대회', '2026-10-09')];
    expect(momentOfDay(input('2026-10-08', { events }))).toMatchObject({
      kind: 'schoolEvent',
      title: '체육대회',
      look: 'flag',
    });
    expect(momentOfDay(input('2026-10-09', { events }))).toBeNull();
  });

  it('같은 이름은 그 학기에 한 번 — 다음 학기에는 다시', () => {
    const events = [
      ev('현장체험학습', '2026-04-10'),
      ev('현장체험학습', '2026-06-12'),
      ev('현장체험학습', '2026-10-16'),
    ];
    expect(momentOfDay(input('2026-04-10', { events }))?.kind).toBe('schoolEvent');
    expect(momentOfDay(input('2026-06-12', { events }))).toBeNull();
    expect(momentOfDay(input('2026-10-16', { events }))?.kind).toBe('schoolEvent');
  });

  it('고른 낱말이 없는 행사는 인사하지 않는다', () => {
    expect(
      momentOfDay(input('2026-10-08', { events: [ev('학부모 상담 주간', '2026-10-08')] })),
    ).toBeNull();
  });
});

describe('등교일에만', () => {
  it('주말 행사에는 인사하지 않는다', () => {
    expect(momentOfDay(input('2026-10-10', { events: [ev('축제', '2026-10-10')] }))).toBeNull();
  });

  it('방학 날에는 인사하지 않는다', () => {
    const c = cal([
      { title: '여름방학', date: '2026-07-20', endDate: '2026-08-14', group: 'vacation' },
    ]);
    expect(
      momentOfDay(input('2026-07-22', { calendar: c, events: [ev('수학여행', '2026-07-22')] })),
    ).toBeNull();
  });
});

describe('학기 창 — 오늘이 든 학기로 옮긴다', () => {
  // 1학기 개학일만 등록하면 앱 학기는 2학기 내내 1학기로 나온다. 그래도 2학기 인사는 나가야 한다.
  const only1 = { '2026-1': '2026-03-03' };

  it('2학기 개학식을 잡는다', () => {
    const events = [ev('2학기 개학식', '2026-08-18')];
    expect(momentOfDay(input('2026-08-18', { events, termStartDates: only1 }))).toMatchObject({
      kind: 'termStart',
      term: '2026-2',
    });
  });

  it('2학기 행사를 잡는다', () => {
    const events = [ev('체육대회', '2026-10-08')];
    expect(momentOfDay(input('2026-10-08', { events, termStartDates: only1 }))?.term).toBe(
      '2026-2',
    );
  });

  it('겨울방학식은 2학기로 본다', () => {
    const events = [ev('겨울방학식', '2026-12-31')];
    expect(momentOfDay(input('2026-12-31', { events, termStartDates: only1 }))).toMatchObject({
      kind: 'vacationEve',
      term: '2026-2',
    });
  });
});

describe('그 밖의 경계', () => {
  it('등록 개학일이 학사일정의 개학보다 이긴다', () => {
    const events = [ev('개학식', '2026-08-18')];
    const tsd = { '2026-2': '2026-08-17' };
    expect(momentOfDay(input('2026-08-17', { events, termStartDates: tsd }))?.kind).toBe(
      'termStart',
    );
    expect(momentOfDay(input('2026-08-18', { events, termStartDates: tsd }))).toBeNull();
  });

  it("'방학·개학 안내'처럼 방학이 함께 적힌 제목은 학기 첫날로 보지 않는다", () => {
    expect(
      momentOfDay(input('2026-08-18', { events: [ev('방학·개학 안내', '2026-08-18')] })),
    ).toBeNull();
  });

  it('행사 낱말 여섯 가지를 모두 잡는다', () => {
    for (const title of [
      '체육대회',
      '가을 운동회',
      '2학년 수학여행',
      '학교 축제',
      '현장체험학습',
      '봄 소풍',
    ]) {
      expect(momentOfDay(input('2026-10-08', { events: [ev(title, '2026-10-08')] }))?.kind).toBe(
        'schoolEvent',
      );
    }
  });

  it('방학 전날이 학교 행사보다 이긴다', () => {
    const events = [ev('여름방학식', '2026-07-17'), ev('학교 축제', '2026-07-17')];
    expect(momentOfDay(input('2026-07-17', { events }))?.kind).toBe('vacationEve');
  });

  it('수능 전날이 스승의 날보다 이긴다(날짜가 겹치는 가상의 표)', () => {
    const m = momentOfDay(
      input('2026-05-15', { isHighSchool: true, suneungDates: ['2026-05-18'] }),
    );
    expect(m?.kind).toBe('suneungEve');
  });

  it('스승의 날 앞 등교일이 7일보다 멀면 인사하지 않는다', () => {
    const c = cal([
      { title: '재량휴업', date: '2026-05-06', endDate: '2026-05-15', group: 'vacation' },
    ]);
    expect(momentOfDay(input('2026-05-05', { calendar: c }))).toBeNull();
    expect(momentOfDay(input('2026-05-04', { calendar: c }))).toBeNull();
  });

  it('수능 앞 등교일이 7일보다 멀면 인사하지 않는다', () => {
    const c = cal([
      { title: '재량휴업', date: '2026-11-11', endDate: '2026-11-18', group: 'vacation' },
    ]);
    expect(momentOfDay(input('2026-11-10', { isHighSchool: true, calendar: c }))).toBeNull();
  });

  it('학사일정이 없으면 방학 전날·행사·입학식은 없고 스승의 날은 있다', () => {
    expect(momentOfDay(input('2026-07-17'))).toBeNull();
    expect(momentOfDay(input('2026-05-15'))?.kind).toBe('teachersDay');
  });
});
