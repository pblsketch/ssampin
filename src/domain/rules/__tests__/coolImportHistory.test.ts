/**
 * 가져온 쪽지 기록 규칙 테스트.
 *
 * 잠그는 계약 — **같은 항목이 두 번 등록되는 걸 알아챌 수 있어야 한다.**
 * 이 기록이 없으면 목록을 다시 열었을 때 이미 가져온 쪽지를 구분할 방법이 없다.
 */
import { describe, it, expect } from 'vitest';
import {
  EMPTY_COOL_HISTORY,
  addRecords,
  importKey,
  importedKeySet,
  importedMessageKeys,
  prune,
  sanitizeHistory,
} from '@domain/rules/coolImportHistory';
import type { CoolImportItem } from '@domain/entities/CoolMessage';

const NOW = new Date(2026, 7, 23, 10, 0);

function item(overrides: Partial<CoolImportItem> = {}): CoolImportItem {
  return {
    sourceMessageKey: 1,
    title: '학폭위 심의',
    start: new Date(2026, 7, 27, 14, 0),
    end: null,
    allDay: false,
    target: 'event',
    ...overrides,
  };
}

describe('기록 더하기', () => {
  it('가져온 항목이 기록된다', () => {
    const h = addRecords(EMPTY_COOL_HISTORY, [item()], NOW);
    expect(h.records).toHaveLength(1);
    expect(h.records[0]!.messageKey).toBe(1);
    expect(h.records[0]!.target).toBe('event');
  });

  it('★ 같은 항목을 또 넣어도 기록은 하나뿐이다', () => {
    let h = addRecords(EMPTY_COOL_HISTORY, [item()], NOW);
    h = addRecords(h, [item()], new Date(2026, 7, 24, 10, 0));
    expect(h.records).toHaveLength(1);
    // 처음 가져온 시각이 남는다
    expect(h.records[0]!.importedAt).toBe(NOW.toISOString());
  });

  it('★ 같은 쪽지의 다른 날짜는 따로 센다', () => {
    const h = addRecords(
      EMPTY_COOL_HISTORY,
      [item(), item({ start: new Date(2026, 7, 31, 9, 0) })],
      NOW,
    );
    expect(h.records).toHaveLength(2);
  });

  it('★ 같은 날짜라도 일정과 할일은 따로 센다 ("둘 다" 대응)', () => {
    const h = addRecords(EMPTY_COOL_HISTORY, [item(), item({ target: 'todo' })], NOW);
    expect(h.records).toHaveLength(2);
    expect(h.records.map((r) => r.target).sort()).toEqual(['event', 'todo']);
  });

  it('다른 쪽지의 같은 시각은 따로 센다', () => {
    const h = addRecords(EMPTY_COOL_HISTORY, [item(), item({ sourceMessageKey: 2 })], NOW);
    expect(h.records).toHaveLength(2);
  });

  it('한 번에 여러 건을 넣어도 중복은 걸러진다', () => {
    const h = addRecords(EMPTY_COOL_HISTORY, [item(), item(), item()], NOW);
    expect(h.records).toHaveLength(1);
  });
});

describe('조회', () => {
  it('이미 가져온 항목인지 알 수 있다', () => {
    const h = addRecords(EMPTY_COOL_HISTORY, [item()], NOW);
    const keys = importedKeySet(h);
    expect(keys.has(importKey(1, new Date(2026, 7, 27, 14, 0).toISOString(), 'event'))).toBe(true);
    expect(keys.has(importKey(1, new Date(2026, 7, 27, 14, 0).toISOString(), 'todo'))).toBe(false);
    expect(keys.has(importKey(2, new Date(2026, 7, 27, 14, 0).toISOString(), 'event'))).toBe(false);
  });

  it('어떤 쪽지에서 가져간 적이 있는지 알 수 있다 (목록 배지용)', () => {
    const h = addRecords(EMPTY_COOL_HISTORY, [item(), item({ sourceMessageKey: 7 })], NOW);
    const msgs = importedMessageKeys(h);
    expect(msgs.has(1)).toBe(true);
    expect(msgs.has(7)).toBe(true);
    expect(msgs.has(99)).toBe(false);
  });
});

describe('오래된 기록 정리', () => {
  it('400일이 지난 기록은 버린다', () => {
    const old = new Date(2025, 0, 1);
    let h = addRecords(EMPTY_COOL_HISTORY, [item()], old);
    expect(h.records).toHaveLength(1);
    h = prune(h, NOW);
    expect(h.records).toHaveLength(0);
  });

  it('최근 기록은 남긴다', () => {
    const recent = new Date(2026, 6, 1);
    let h = addRecords(EMPTY_COOL_HISTORY, [item()], recent);
    h = prune(h, NOW);
    expect(h.records).toHaveLength(1);
  });

  it('새로 넣을 때도 자동으로 정리된다', () => {
    const old = addRecords(
      EMPTY_COOL_HISTORY,
      [item({ sourceMessageKey: 100 })],
      new Date(2024, 0, 1),
    );
    const h = addRecords(old, [item()], NOW);
    expect(h.records).toHaveLength(1);
    expect(h.records[0]!.messageKey).toBe(1);
  });

  it('시각을 못 읽는 기록은 버린다', () => {
    const broken = {
      records: [{ messageKey: 1, startsAt: 'x', target: 'event' as const, importedAt: '언젠가' }],
    };
    expect(prune(broken, NOW).records).toHaveLength(0);
  });
});

describe('★ 저장 파일이 망가져도 앱이 죽지 않는다', () => {
  it('별별 쓰레기가 들어와도 빈 기록으로 돌려준다', () => {
    for (const raw of [null, undefined, 0, 'abc', [], {}, { records: null }, { records: 'x' }]) {
      expect(sanitizeHistory(raw)).toEqual(EMPTY_COOL_HISTORY);
    }
  });

  it('망가진 항목만 골라 버리고 멀쩡한 건 살린다', () => {
    const raw = {
      records: [
        {
          messageKey: 1,
          startsAt: '2026-08-27T05:00:00.000Z',
          target: 'event',
          importedAt: '2026-08-23T01:00:00.000Z',
        },
        { messageKey: 'x', startsAt: 'a', target: 'event', importedAt: 'b' }, // 번호가 문자열
        { messageKey: 2, startsAt: '', target: 'todo', importedAt: 'b' }, // 시각 비었음
        { messageKey: 3, startsAt: 'a', target: '메모', importedAt: 'b' }, // 모르는 대상
        null,
        'nope',
      ],
    };
    const clean = sanitizeHistory(raw);
    expect(clean.records).toHaveLength(1);
    expect(clean.records[0]!.messageKey).toBe(1);
  });
});
