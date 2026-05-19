/**
 * recordUtils 회귀 메타테스트.
 *
 * 본 테스트는 `createDateRange` 가 `enumerateRange` 로 위임된 후에도
 * 기존 호출 시그니처와 결과가 동일함을 보장한다 (Plan FR-13 회귀 방지).
 */
import { describe, expect, it } from 'vitest';
import { createDateRange } from './recordUtils';
import { enumerateRange } from '@adapters/components/common/calendarUtils';

describe('createDateRange (compat alias)', () => {
  it('enumerateRange 와 동일한 결과 — inclusive 범위', () => {
    expect(createDateRange('2026-05-01', '2026-05-05')).toEqual(
      enumerateRange('2026-05-01', '2026-05-05'),
    );
  });

  it('start === end → 1일 배열', () => {
    expect(createDateRange('2026-05-05', '2026-05-05')).toEqual(['2026-05-05']);
  });

  it('start > end → 빈 배열 (기존 동작 호환)', () => {
    // 기존 createDateRange 는 d <= endDate 조건이 시작부터 거짓이라 [] 반환했음.
    expect(createDateRange('2026-05-10', '2026-05-05')).toEqual([]);
  });

  it('월 경계 건너뛰기', () => {
    expect(createDateRange('2026-04-29', '2026-05-02')).toEqual([
      '2026-04-29',
      '2026-04-30',
      '2026-05-01',
      '2026-05-02',
    ]);
  });

  it('30일 범위 정확 길이', () => {
    expect(createDateRange('2026-05-01', '2026-05-30')).toHaveLength(30);
  });
});
