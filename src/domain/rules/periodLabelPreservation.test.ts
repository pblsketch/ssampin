import { describe, it, expect } from 'vitest';
import { mergePeriodLabels, renumberPeriodsKeepingLabels } from './periodLabel';
import { periodTimesToSettingsPatch } from './comciganRules';
import {
  generatePeriodTimes,
  getDefaultPreset,
  shiftPeriodsFrom,
  moveLunchToAfterPeriod,
} from './periodRules';
import type { PeriodTime } from '../valueObjects/PeriodTime';

/**
 * 교시 이름이 "붙였는데 나중에 사라지는" 사고를 막는 계약.
 * 교시 배열을 통째로 갈아끼우는 경로가 7개라, 그중 하나만 놓쳐도 조용히 이름이 날아간다.
 */

const named: readonly PeriodTime[] = [
  { period: 1, start: '08:50', end: '09:40' },
  { period: 2, start: '09:50', end: '10:40', label: '창체' },
  { period: 3, start: '10:50', end: '11:40', label: '동아리' },
];

describe('mergePeriodLabels', () => {
  it('next의 시각을 쓰되 같은 번호의 기존 이름을 승계한다', () => {
    const next: PeriodTime[] = [
      { period: 1, start: '09:00', end: '09:50' },
      { period: 2, start: '10:00', end: '10:50' },
      { period: 3, start: '11:00', end: '11:50' },
    ];
    const merged = mergePeriodLabels(named, next);
    expect(merged.map((p) => p.start)).toEqual(['09:00', '10:00', '11:00']);
    expect(merged.map((p) => p.label)).toEqual([undefined, '창체', '동아리']);
  });

  it('next에만 있는 교시는 이름 없이 남는다', () => {
    const next: PeriodTime[] = [
      { period: 1, start: '09:00', end: '09:50' },
      { period: 4, start: '12:00', end: '12:50' },
    ];
    expect(mergePeriodLabels(named, next)[1]?.label).toBeUndefined();
  });

  it('prev에만 있던 교시의 이름은 다른 번호로 옮겨붙지 않는다', () => {
    const next: PeriodTime[] = [{ period: 1, start: '09:00', end: '09:50' }];
    const merged = mergePeriodLabels(named, next);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.label).toBeUndefined();
  });

  it('next가 이미 이름을 갖고 있으면 그쪽이 이긴다', () => {
    const next: PeriodTime[] = [{ period: 2, start: '10:00', end: '10:50', label: '보충' }];
    expect(mergePeriodLabels(named, next)[0]?.label).toBe('보충');
  });

  it('빈 문자열로 저장된 과거 이름은 승계하지 않는다', () => {
    const prev: PeriodTime[] = [{ period: 1, start: '08:50', end: '09:40', label: '   ' }];
    const next: PeriodTime[] = [{ period: 1, start: '09:00', end: '09:50' }];
    expect(mergePeriodLabels(prev, next)[0]).not.toHaveProperty('label');
  });
});

describe('renumberPeriodsKeepingLabels — 삭제 후 재번호', () => {
  it('이름은 번호가 아니라 남은 행을 따라간다', () => {
    // 1교시를 지우면 "창체"(옛 2교시)가 1교시가 되어야 한다.
    const remaining = named.slice(1);
    const renumbered = renumberPeriodsKeepingLabels(remaining);
    expect(renumbered).toEqual([
      { period: 1, start: '09:50', end: '10:40', label: '창체' },
      { period: 2, start: '10:50', end: '11:40', label: '동아리' },
    ]);
  });
});

describe('컴시간 교시 시각 불러오기', () => {
  it('이름을 붙인 뒤 컴시간에서 시각을 불러와도 이름이 유지된다', () => {
    const patch = periodTimesToSettingsPatch(
      {
        periodTimes: [
          { period: 1, start: '09:00', end: '09:45' },
          { period: 2, start: '09:55', end: '10:40' },
          { period: 3, start: '10:50', end: '11:35' },
        ],
        lunchAfterPeriod: null,
      },
      named,
    );
    expect(patch.periodTimes.map((p) => p.start)).toEqual(['09:00', '09:55', '10:50']);
    expect(patch.periodTimes.map((p) => p.label)).toEqual([undefined, '창체', '동아리']);
  });

  it('현재 교시를 넘기지 않으면 기존과 동일하게 동작한다 (하위 호환)', () => {
    const parsed = {
      periodTimes: [{ period: 1, start: '09:00', end: '09:45' }],
      lunchAfterPeriod: null,
    };
    expect(periodTimesToSettingsPatch(parsed).periodTimes[0]?.label).toBeUndefined();
  });
});

describe('시각을 만지는 경로에서도 이름이 살아남는다', () => {
  // 회귀: PeriodTime 을 `{ period, start, end }` 리터럴로 다시 만들면 label 이 조용히 사라진다.
  // 실제로 시각 편집·점심 이동 경로 7곳이 이 방식이었다. 전부 스프레드로 바꿨다.
  const lunchable: readonly PeriodTime[] = [
    { period: 1, start: '08:50', end: '09:40' },
    { period: 2, start: '09:50', end: '10:40', label: '창체' },
    { period: 3, start: '10:50', end: '11:40', label: '동아리' },
    { period: 4, start: '11:50', end: '12:40', label: '보충' },
  ];

  it('shiftPeriodsFrom — 평행 이동해도 이름이 유지된다', () => {
    const shifted = shiftPeriodsFrom(lunchable, 1, 30);
    expect(shifted.map((p) => p.label)).toEqual([undefined, '창체', '동아리', '보충']);
    expect(shifted[1]?.start).toBe('10:20');
  });

  it('moveLunchToAfterPeriod — 점심 위치를 옮겨도 이름이 유지된다', () => {
    const result = moveLunchToAfterPeriod(lunchable, 2, 3, 50);
    expect(result.status).toBe('moved');
    expect(result.periodTimes.map((p) => p.label)).toEqual([undefined, '창체', '동아리', '보충']);
  });
});

describe('프리셋 자동 생성', () => {
  it('자동 생성으로 시각을 다시 만들어도 이름이 살아남는다', () => {
    const generated = mergePeriodLabels(named, generatePeriodTimes(getDefaultPreset('middle')));
    expect(generated[1]?.label).toBe('창체');
    expect(generated[2]?.label).toBe('동아리');
    // 시각은 프리셋 값으로 새로 잡힌다
    expect(generated[0]?.start).toBe('08:50');
  });
});
