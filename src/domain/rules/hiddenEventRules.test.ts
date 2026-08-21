import { describe, it, expect } from 'vitest';
import {
  getRestorableHiddenEvents,
  countByReason,
  willReappearAsDuplicate,
} from './hiddenEventRules';
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

describe('getRestorableHiddenEvents', () => {
  it('숨기지 않은 일정은 목록에 넣지 않는다', () => {
    const items = getRestorableHiddenEvents([
      ev({ date: '2026-10-05' }),
      ev({ date: '2026-10-06', isHidden: true }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]!.event.date).toBe('2026-10-06');
  });

  it('외부 구독 캘린더 일정은 되돌릴 수 없으니 보여 주지 않는다', () => {
    const items = getRestorableHiddenEvents([
      ev({ id: 'ext:1', date: '2026-10-05', isHidden: true }),
    ]);
    expect(items).toEqual([]);
  });

  it('최근에 치운 것부터 보여 준다', () => {
    const items = getRestorableHiddenEvents([
      ev({ id: 'old', date: '2026-10-05', isHidden: true, hiddenAt: '2026-08-01T00:00:00.000Z' }),
      ev({ id: 'new', date: '2026-10-05', isHidden: true, hiddenAt: '2026-08-21T00:00:00.000Z' }),
    ]);
    expect(items.map((i) => i.event.id)).toEqual(['new', 'old']);
  });

  it('숨긴 시각을 모르는 옛 데이터는 일정 날짜가 늦은 것부터 보여 준다', () => {
    const items = getRestorableHiddenEvents([
      ev({ id: 'a', date: '2026-03-01', isHidden: true }),
      ev({ id: 'b', date: '2026-12-01', isHidden: true }),
    ]);
    expect(items.map((i) => i.event.id)).toEqual(['b', 'a']);
  });

  it('이유가 없는 옛 데이터는 unknown 으로 둔다 — 목록에서 빼지 않는다', () => {
    const items = getRestorableHiddenEvents([ev({ date: '2026-10-05', isHidden: true })]);
    expect(items[0]!.reason).toBe('unknown');
  });
});

describe('countByReason / willReappearAsDuplicate', () => {
  it('이유별로 센다', () => {
    const items = getRestorableHiddenEvents([
      ev({ date: '2026-10-05', isHidden: true, hiddenReason: 'manual' }),
      ev({ date: '2026-10-06', isHidden: true, hiddenReason: 'duplicate' }),
      ev({ date: '2026-10-07', isHidden: true, hiddenReason: 'duplicate' }),
      ev({ date: '2026-10-08', isHidden: true }),
    ]);
    expect(countByReason(items)).toEqual({ manual: 1, duplicate: 2, unknown: 1 });
  });

  it('중복이라 접은 것만 "되돌리면 다시 겹친다"로 표시한다', () => {
    const [dup, manual] = getRestorableHiddenEvents([
      ev({
        date: '2026-10-06',
        isHidden: true,
        hiddenReason: 'duplicate',
        hiddenAt: '2026-08-21T02:00:00.000Z',
      }),
      ev({
        date: '2026-10-05',
        isHidden: true,
        hiddenReason: 'manual',
        hiddenAt: '2026-08-21T01:00:00.000Z',
      }),
    ]);
    expect(willReappearAsDuplicate(dup!)).toBe(true);
    expect(willReappearAsDuplicate(manual!)).toBe(false);
  });
});
