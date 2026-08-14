import { describe, it, expect } from 'vitest';
import {
  PERIOD_LABEL_MAX_LENGTH,
  normalizePeriodLabel,
  resolvePeriodLabel,
  resolvePeriodShortLabel,
} from './periodLabel';
import type { PeriodTime } from '../valueObjects/PeriodTime';
import {
  PERIOD_MORNING,
  PERIOD_CLOSING,
  formatPeriodLabel,
  formatPeriodShort,
} from '../entities/Attendance';

const times: readonly PeriodTime[] = [
  { period: 1, start: '08:50', end: '09:40' },
  { period: 2, start: '09:50', end: '10:40', label: '창체' },
  { period: 3, start: '10:50', end: '11:40', label: '   ' },
];

describe('normalizePeriodLabel', () => {
  it('빈 값·공백만·null·undefined는 모두 undefined', () => {
    expect(normalizePeriodLabel('')).toBeUndefined();
    expect(normalizePeriodLabel('   ')).toBeUndefined();
    expect(normalizePeriodLabel(undefined)).toBeUndefined();
    expect(normalizePeriodLabel(null)).toBeUndefined();
  });

  it('앞뒤 공백을 제거한다', () => {
    expect(normalizePeriodLabel('  창체 ')).toBe('창체');
  });

  it('상한을 넘는 이름은 잘라낸다', () => {
    expect(PERIOD_LABEL_MAX_LENGTH).toBe(6);
    expect(normalizePeriodLabel('일이삼사오육칠')).toBe('일이삼사오육');
    expect(normalizePeriodLabel('일이삼사오육')).toBe('일이삼사오육');
  });
});

describe('resolvePeriodLabel', () => {
  it('이름이 있으면 이름을 쓴다', () => {
    expect(resolvePeriodLabel(2, times)).toBe('창체');
  });

  it('이름이 없으면 기본 라벨', () => {
    expect(resolvePeriodLabel(1, times)).toBe('1교시');
  });

  it('공백만 저장된 이름은 없는 것으로 본다', () => {
    expect(resolvePeriodLabel(3, times)).toBe('3교시');
  });

  it('periodTimes를 넘기지 않으면 기본 라벨 (하위 호환)', () => {
    expect(resolvePeriodLabel(5)).toBe('5교시');
  });

  it('periodTimes에 없는 교시도 기본 라벨', () => {
    expect(resolvePeriodLabel(9, times)).toBe('9교시');
  });
});

describe('resolvePeriodShortLabel', () => {
  it('이름이 있으면 이름, 없으면 번호만', () => {
    expect(resolvePeriodShortLabel(2, times)).toBe('창체');
    expect(resolvePeriodShortLabel(1, times)).toBe('1');
    expect(resolvePeriodShortLabel(5)).toBe('5');
  });
});

describe('Attendance의 교시 라벨 위임', () => {
  it('조회·종례 특례는 이름 설정과 무관하게 유지된다', () => {
    const withPseudoLabels: readonly PeriodTime[] = [
      ...times,
      { period: PERIOD_MORNING, start: '08:30', end: '08:40', label: '무시됨' },
      { period: PERIOD_CLOSING, start: '16:00', end: '16:10', label: '무시됨' },
    ];
    expect(formatPeriodLabel(PERIOD_MORNING, withPseudoLabels)).toBe('조회');
    expect(formatPeriodLabel(PERIOD_CLOSING, withPseudoLabels)).toBe('종례');
    expect(formatPeriodShort(PERIOD_MORNING, withPseudoLabels)).toBe('조회');
    expect(formatPeriodShort(PERIOD_CLOSING, withPseudoLabels)).toBe('종례');
  });

  it('일반 교시는 이름을 반영한다', () => {
    expect(formatPeriodLabel(2, times)).toBe('창체');
    expect(formatPeriodShort(2, times)).toBe('창체');
  });

  it('periodTimes 없이 호출하면 기존 동작 그대로 (하위 호환)', () => {
    expect(formatPeriodLabel(1)).toBe('1교시');
    expect(formatPeriodShort(1)).toBe('1');
    expect(formatPeriodLabel(PERIOD_MORNING)).toBe('조회');
  });
});
