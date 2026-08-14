import { describe, it, expect } from 'vitest';
import { periodToLabel } from './periodPresenter';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';

const times: readonly PeriodTime[] = [
  { period: 3, start: '10:50', end: '11:40' },
  { period: 4, start: '11:50', end: '12:40', label: '창체' },
  { period: 5, start: '13:40', end: '14:30', label: '동아리' },
];

describe('periodToLabel — 기존 특례 보존', () => {
  it('방과후·종일은 그대로', () => {
    expect(periodToLabel('afterSchool')).toBe('방과후');
    expect(periodToLabel('allDay')).toBe('종일');
    expect(periodToLabel('afterSchool', undefined, times)).toBe('방과후');
  });

  it('이름이 없으면 단일 교시는 "N교시"', () => {
    expect(periodToLabel('3')).toBe('3교시');
    expect(periodToLabel('3', undefined, times)).toBe('3교시');
  });

  it('이름이 없으면 범위는 "N~M교시"로 줄여 쓴다', () => {
    expect(periodToLabel('1', '2')).toBe('1~2교시');
    expect(periodToLabel('2', '3', times)).toBe('2~3교시');
  });

  it('periodEnd가 period와 같으면 범위로 표기하지 않는다', () => {
    expect(periodToLabel('3', '3')).toBe('3교시');
  });
});

describe('periodToLabel — 교시 이름 반영', () => {
  it('단일 교시에 이름이 있으면 이름을 쓴다', () => {
    expect(periodToLabel('4', undefined, times)).toBe('창체');
  });

  it('범위 양끝에 이름이 있으면 이름끼리 잇는다', () => {
    expect(periodToLabel('4', '5', times)).toBe('창체~동아리');
  });

  it('한쪽만 이름이 있으면 섞어서 표기한다', () => {
    expect(periodToLabel('3', '4', times)).toBe('3교시~창체');
  });
});
