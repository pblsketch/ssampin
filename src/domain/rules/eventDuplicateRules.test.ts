import { describe, it, expect } from 'vitest';
import { findDuplicateEventGroups, countDuplicateEvents } from './eventDuplicateRules';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';
import type { GradeYn } from '@domain/entities/NeisSchedule';

const ALL_GRADES: GradeYn = {
  grade1: true,
  grade2: true,
  grade3: true,
  grade4: false,
  grade5: false,
  grade6: false,
};

let seq = 0;
function ev(extra: Partial<SchoolEvent> & Pick<SchoolEvent, 'date'>): SchoolEvent {
  return {
    id: extra.id ?? `e${seq++}`,
    title: extra.title ?? '여름방학',
    category: extra.category ?? 'school',
    ...extra,
  };
}

/** 실제 제보(2026-08-21) 재현 — NEIS 원본 1 + 구글 사본 2 */
function reportedCase(): readonly SchoolEvent[] {
  return [
    ev({
      id: 'neis:1',
      title: '대체휴일',
      date: '2026-10-05',
      category: 'neis-schedule',
      source: 'neis',
      neis: {
        eventId: '20261005_abc',
        eventName: '대체휴일',
        schoolYear: '2026',
        gradeYn: ALL_GRADES,
        subtractDayType: '공휴일',
        loadDate: '20260101',
        lastSyncAt: '2026-08-20T00:00:00.000Z',
      },
    }),
    ev({
      id: 'gcal:a@gmail.com:x1',
      title: '대체휴일',
      date: '2026-10-05',
      category: 'a@gmail.com',
      source: 'google',
    }),
    ev({
      id: 'gcal:a@gmail.com:x2',
      title: '대체휴일',
      date: '2026-10-05',
      category: 'a@gmail.com',
      source: 'google',
    }),
  ];
}

describe('findDuplicateEventGroups', () => {
  it('중복이 없으면 빈 배열을 돌려준다', () => {
    const events = [
      ev({ date: '2026-08-01', title: '개학' }),
      ev({ date: '2026-08-02', title: '수업' }),
    ];
    expect(findDuplicateEventGroups(events)).toEqual([]);
  });

  it('NEIS 원본을 남기고 구글 사본만 접기 대상으로 고른다', () => {
    const groups = findDuplicateEventGroups(reportedCase());
    expect(groups).toHaveLength(1);
    expect(groups[0]!.keep.id).toBe('neis:1');
    expect(groups[0]!.duplicates.map((e) => e.id)).toEqual([
      'gcal:a@gmail.com:x1',
      'gcal:a@gmail.com:x2',
    ]);
    expect(countDuplicateEvents(groups)).toBe(2);
  });

  it('선생님이 직접 만든 일정이 있으면 그것을 남긴다', () => {
    const groups = findDuplicateEventGroups([
      ev({ id: 'g1', date: '2026-10-05', title: '대체휴일', source: 'google' }),
      ev({ id: 'mine', date: '2026-10-05', title: '대체휴일' }),
    ]);
    expect(groups[0]!.keep.id).toBe('mine');
    expect(groups[0]!.duplicates.map((e) => e.id)).toEqual(['g1']);
  });

  it('선생님이 직접 만든 일정끼리 겹치면 아무것도 접지 않는다', () => {
    const groups = findDuplicateEventGroups([
      ev({ id: 'mine1', date: '2026-10-05', title: '회의' }),
      ev({ id: 'mine2', date: '2026-10-05', title: '회의' }),
    ]);
    expect(groups).toEqual([]);
  });

  it('시간이 다르면 다른 일정으로 본다', () => {
    const groups = findDuplicateEventGroups([
      ev({ id: 'a', date: '2026-10-05', title: '회의', time: '09:00', source: 'google' }),
      ev({ id: 'b', date: '2026-10-05', title: '회의', time: '15:00', source: 'google' }),
    ]);
    expect(groups).toEqual([]);
  });

  it('제목의 앞뒤·연속 공백 차이는 같은 일정으로 본다', () => {
    const groups = findDuplicateEventGroups([
      ev({ id: 'n', date: '2026-10-05', title: '여름  방학', source: 'neis' }),
      ev({ id: 'g', date: '2026-10-05', title: ' 여름 방학 ', source: 'google' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.keep.id).toBe('n');
  });

  it('이미 숨긴 일정·반복 일정·외부 구독 캘린더는 건드리지 않는다', () => {
    const groups = findDuplicateEventGroups([
      ev({ id: 'n', date: '2026-10-05', title: '대체휴일', source: 'neis' }),
      ev({ id: 'hidden', date: '2026-10-05', title: '대체휴일', source: 'google', isHidden: true }),
      ev({
        id: 'rec',
        date: '2026-10-05',
        title: '대체휴일',
        source: 'google',
        recurrence: 'weekly',
      }),
      ev({ id: 'ext:1', date: '2026-10-05', title: '대체휴일', source: 'google' }),
    ]);
    expect(groups).toEqual([]);
  });

  it('여러 날에 걸친 중복은 날짜 순으로 돌려준다', () => {
    const groups = findDuplicateEventGroups([
      ev({ id: 'g2', date: '2026-08-08', title: '여름방학', source: 'google' }),
      ev({ id: 'n2', date: '2026-08-08', title: '여름방학', source: 'neis' }),
      ev({ id: 'g1', date: '2026-08-01', title: '여름방학', source: 'google' }),
      ev({ id: 'n1', date: '2026-08-01', title: '여름방학', source: 'neis' }),
    ]);
    expect(groups.map((g) => g.keep.date)).toEqual(['2026-08-01', '2026-08-08']);
  });
});
