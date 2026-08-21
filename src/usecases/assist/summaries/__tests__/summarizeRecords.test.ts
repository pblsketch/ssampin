import { describe, expect, it } from 'vitest';
import { summarizeRecords } from '../summarizeRecords';
import type { RecordLike } from '../summarizeRecords';

describe('summarizeRecords', () => {
  it('학급·기간에 맞는 기록만 카테고리별로 집계한다', () => {
    const records: RecordLike[] = [
      { category: '상담', date: '2026-08-05', classId: 'c1' },
      { category: '상담', date: '2026-08-10', classId: 'c1' },
      { category: '관찰', date: '2026-08-15', classId: 'c1' },
      // 기간 밖
      { category: '상담', date: '2026-07-01', classId: 'c1' },
      // 다른 학급
      { category: '상담', date: '2026-08-10', classId: 'c2' },
    ];

    const result = summarizeRecords(records, {
      classId: 'c1',
      className: '1학년 2반',
      periodFrom: '2026-08-01',
      periodTo: '2026-08-21',
      periodLabel: '2026-08-01 ~ 2026-08-21',
    });

    expect(result.className).toBe('1학년 2반');
    expect(result.period).toBe('2026-08-01 ~ 2026-08-21');
    expect(result.total).toBe(3);
    expect(result.byCategory).toEqual(
      expect.arrayContaining([
        { category: '상담', count: 2 },
        { category: '관찰', count: 1 },
      ]),
    );
    expect(result.byCategory).toHaveLength(2);
  });

  it('빈 배열이면 예외 없이 total 0과 빈 byCategory를 반환한다', () => {
    const result = summarizeRecords([], {
      classId: 'c1',
      className: '1학년 2반',
      periodFrom: '2026-08-01',
      periodTo: '2026-08-21',
      periodLabel: '2026-08-01 ~ 2026-08-21',
    });

    expect(result.total).toBe(0);
    expect(result.byCategory).toEqual([]);
  });

  it('반환 객체에 스키마 밖 키가 없다', () => {
    const result = summarizeRecords([], {
      classId: 'c1',
      className: '1학년 2반',
      periodFrom: '2026-08-01',
      periodTo: '2026-08-21',
      periodLabel: '2026-08-01 ~ 2026-08-21',
    });

    expect(Object.keys(result).sort()).toEqual(
      ['byCategory', 'className', 'period', 'total'].sort(),
    );
  });
});
