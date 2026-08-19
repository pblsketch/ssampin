import { describe, it, expect } from 'vitest';
import { computeBulkFillTargets, BULK_FILL_MAX } from './PlannedBulkFillModal';

/**
 * 일괄 생성 판정 계약 (C-c5~C-c8).
 *
 * 대량 생성이라 실수의 값이 크다 — 두 번 누르면 진도표가 두 배가 되고, 지난 수업에 '예정'이
 * 깔리면 지우는 데 그만큼의 클릭이 든다. 그래서 판정을 렌더 밖 순수 함수로 두고 여기서 잠근다.
 */

const TODAY = '2026-09-15';

function day(date: string, ...periods: number[]) {
  return { date, periods };
}

describe('computeBulkFillTargets — 지난 날짜는 만들지 않는다', () => {
  it('오늘 이전은 대상이 아니다', () => {
    const { targets } = computeBulkFillTargets([day('2026-09-10', 2)], [], TODAY);
    expect(targets).toEqual([]);
  });

  it('오늘 당일도 대상이 아니다 — 오늘 수업은 이미 했거나 하는 중이다', () => {
    const { targets } = computeBulkFillTargets([day(TODAY, 2)], [], TODAY);
    expect(targets).toEqual([]);
  });

  it('오늘 이후만 대상이다', () => {
    const { targets } = computeBulkFillTargets(
      [day('2026-09-10', 2), day(TODAY, 2), day('2026-09-17', 3)],
      [],
      TODAY,
    );
    expect(targets).toEqual([{ date: '2026-09-17', period: 3 }]);
  });
});

describe('computeBulkFillTargets — C-c6: 이미 있는 자리는 건너뛰고 개수를 보고한다', () => {
  it('같은 (날짜, 교시)에 기록이 있으면 건너뛴다', () => {
    const { targets, skipped } = computeBulkFillTargets(
      [day('2026-09-17', 3), day('2026-09-21', 2)],
      [{ date: '2026-09-17', period: 3 }],
      TODAY,
    );
    expect(targets).toEqual([{ date: '2026-09-21', period: 2 }]);
    expect(skipped).toBe(1);
  });

  it('같은 날 다른 교시는 건너뛰지 않는다', () => {
    const { targets, skipped } = computeBulkFillTargets(
      [day('2026-09-17', 2, 3)],
      [{ date: '2026-09-17', period: 2 }],
      TODAY,
    );
    expect(targets).toEqual([{ date: '2026-09-17', period: 3 }]);
    expect(skipped).toBe(1);
  });

  it('두 번 눌러도 두 배가 되지 않는다 — 두 번째엔 전부 건너뛴다', () => {
    const days = [day('2026-09-17', 2), day('2026-09-21', 2)];
    const first = computeBulkFillTargets(days, [], TODAY);
    // 1차 생성 결과를 기존 기록으로 되먹인다
    const second = computeBulkFillTargets(days, first.targets, TODAY);
    expect(first.targets).toHaveLength(2);
    expect(second.targets).toEqual([]);
    expect(second.skipped).toBe(2);
  });
});

describe('computeBulkFillTargets — 연강과 빈 날', () => {
  it('하루 2교시 연강이면 두 자리를 만든다', () => {
    const { targets } = computeBulkFillTargets([day('2026-09-17', 2, 3)], [], TODAY);
    expect(targets).toEqual([
      { date: '2026-09-17', period: 2 },
      { date: '2026-09-17', period: 3 },
    ]);
  });

  it('수업일이 없으면 빈 결과', () => {
    expect(computeBulkFillTargets([], [], TODAY)).toEqual({ targets: [], skipped: 0 });
  });
});

describe('computeBulkFillTargets — C-c8: 상한 판정에 쓰는 개수가 정확하다', () => {
  it('상한을 넘으면 화면이 막을 수 있도록 실제 개수를 그대로 돌려준다', () => {
    // 상한 판정은 화면이 하되, 그 근거가 되는 개수는 여기서 정확해야 한다.
    const days = Array.from({ length: BULK_FILL_MAX + 5 }, (_, i) => {
      const d = new Date('2026-09-16T00:00:00');
      d.setDate(d.getDate() + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate(),
      ).padStart(2, '0')}`;
      return day(iso, 1);
    });
    const { targets } = computeBulkFillTargets(days, [], TODAY);
    expect(targets.length).toBe(BULK_FILL_MAX + 5);
    expect(targets.length).toBeGreaterThan(BULK_FILL_MAX);
  });

  it('상한값은 주 4회 × 15주 = 60이다', () => {
    expect(BULK_FILL_MAX).toBe(60);
  });
});
