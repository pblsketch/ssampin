import { describe, it, expect } from 'vitest';
import {
  calculateDDay,
  isTodayEvent,
  isAlertTarget,
  getUpcomingEvents,
  getTodayEvents,
  formatDDay,
  sortDDayItems,
} from './ddayRules';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';
import type { DDayItem } from '@domain/entities/DDay';

function event(date: string, extra: Partial<SchoolEvent> = {}): SchoolEvent {
  return {
    id: `e-${date}-${extra.title ?? ''}`,
    title: extra.title ?? '행사',
    date,
    category: 'school',
    ...extra,
  };
}

function ddayItem(targetDate: string, extra: Partial<DDayItem> = {}): DDayItem {
  return {
    id: `d-${targetDate}`,
    title: '디데이',
    targetDate,
    emoji: '📌',
    color: 'blue',
    pinned: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

// 기준일: 2026-03-05 (수요일), 시각 무관
const TODAY = new Date(2026, 2, 5, 14, 30);

describe('calculateDDay', () => {
  it('미래 날짜는 양수, 오늘은 0, 과거는 음수 (시각은 무시)', () => {
    expect(calculateDDay('2026-03-10', TODAY)).toBe(5);
    expect(calculateDDay('2026-03-05', TODAY)).toBe(0);
    expect(calculateDDay('2026-03-01', TODAY)).toBe(-4);
    expect(calculateDDay('2026-03-06', new Date(2026, 2, 5, 23, 59))).toBe(1);
  });

  it('달·해를 넘어가도 일수로 계산한다', () => {
    expect(calculateDDay('2026-04-04', TODAY)).toBe(30);
    expect(calculateDDay('2025-12-31', new Date(2026, 0, 1))).toBe(-1);
  });
});

describe('isTodayEvent', () => {
  it('단일 일정은 날짜가 오늘과 같을 때만 true', () => {
    expect(isTodayEvent(event('2026-03-05'), TODAY)).toBe(true);
    expect(isTodayEvent(event('2026-03-06'), TODAY)).toBe(false);
    expect(isTodayEvent(event('2026-03-04'), TODAY)).toBe(false);
  });

  it('여러 날 일정은 오늘이 [date, endDate] 범위 안이면 true', () => {
    expect(isTodayEvent(event('2026-03-03', { endDate: '2026-03-07' }), TODAY)).toBe(true);
    expect(isTodayEvent(event('2026-03-05', { endDate: '2026-03-09' }), TODAY)).toBe(true);
    expect(isTodayEvent(event('2026-03-01', { endDate: '2026-03-04' }), TODAY)).toBe(false);
    expect(isTodayEvent(event('2026-03-06', { endDate: '2026-03-09' }), TODAY)).toBe(false);
  });
});

describe('isAlertTarget', () => {
  it('D-0, D-1, D-3 인 일정만 알림 대상', () => {
    expect(isAlertTarget(event('2026-03-05'), TODAY)).toBe(true); // D-0
    expect(isAlertTarget(event('2026-03-06'), TODAY)).toBe(true); // D-1
    expect(isAlertTarget(event('2026-03-08'), TODAY)).toBe(true); // D-3
    expect(isAlertTarget(event('2026-03-07'), TODAY)).toBe(false); // D-2
    expect(isAlertTarget(event('2026-03-09'), TODAY)).toBe(false); // D-4
    expect(isAlertTarget(event('2026-03-04'), TODAY)).toBe(false); // D+1 (지남)
  });
});

describe('getUpcomingEvents', () => {
  it('D-1 ~ D-7 만 포함하고 D-Day 가까운 순으로 정렬한다 (D-0·D-8·과거 제외)', () => {
    const events = [
      event('2026-03-05', { title: 'today' }), // D-0 제외
      event('2026-03-12', { title: 'd7' }), // D-7
      event('2026-03-06', { title: 'd1' }), // D-1
      event('2026-03-13', { title: 'd8' }), // D-8 제외
      event('2026-03-09', { title: 'd4' }), // D-4
      event('2026-03-01', { title: 'past' }), // 과거 제외
    ];
    const result = getUpcomingEvents(events, TODAY);
    expect(result.map((r) => r.event.title)).toEqual(['d1', 'd4', 'd7']);
    expect(result.map((r) => r.dday)).toEqual([1, 4, 7]);
  });

  it('해당 범위 이벤트가 없으면 빈 배열', () => {
    expect(getUpcomingEvents([event('2026-03-05'), event('2026-04-01')], TODAY)).toEqual([]);
  });
});

describe('getTodayEvents', () => {
  it('오늘에 해당하는 일정(단일·여러 날 포함)만 반환', () => {
    const events = [
      event('2026-03-05', { title: 'a' }),
      event('2026-03-02', { endDate: '2026-03-06', title: 'b' }),
      event('2026-03-10', { title: 'c' }),
    ];
    expect(
      getTodayEvents(events, TODAY)
        .map((e) => e.title)
        .sort(),
    ).toEqual(['a', 'b']);
  });
});

describe('formatDDay', () => {
  it('0 → D-Day, 양수 → D-N, 음수 → D+N', () => {
    expect(formatDDay(0)).toBe('D-Day');
    expect(formatDDay(7)).toBe('D-7');
    expect(formatDDay(-3)).toBe('D+3');
  });
});

describe('sortDDayItems', () => {
  it('고정(pinned) 우선 → 미래 우선 → D-Day 가까운 순 → 과거는 뒤', () => {
    const items = [
      ddayItem('2026-03-01', { title: 'past' }),
      ddayItem('2026-03-20', { title: 'future-far' }),
      ddayItem('2026-03-06', { title: 'future-near' }),
      ddayItem('2026-02-01', { title: 'pinned-past', pinned: true }),
      ddayItem('2026-03-10', { title: 'pinned-future', pinned: true }),
    ];
    const sorted = sortDDayItems(items, TODAY);
    // pinned 둘이 먼저(그 안에서 미래 우선), 그다음 미래(가까운 순), 마지막 과거
    expect(sorted.map((i) => i.title)).toEqual([
      'pinned-future',
      'pinned-past',
      'future-near',
      'future-far',
      'past',
    ]);
  });

  it('원본 배열을 변형하지 않는다', () => {
    const items = [ddayItem('2026-03-10'), ddayItem('2026-03-01')];
    const copy = [...items];
    sortDDayItems(items, TODAY);
    expect(items).toEqual(copy);
  });
});
