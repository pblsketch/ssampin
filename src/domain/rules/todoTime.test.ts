/**
 * 시각 변환 시험.
 *
 * ★ 핵심: **실행 머신의 시간대와 무관하게 같은 값**이 나와야 한다. 개발자 PC(KST)와
 *   CI(UTC)에서 결과가 갈리면 알림이 몇 시간씩 어긋난다.
 *   그래서 기대값은 `Date` 로 만들지 않고 **손으로 계산한 상수**로 못 박는다.
 */
import { describe, it, expect } from 'vitest';
import { wallClockToEpochMs } from './todoTime';

/** 1970-01-01T00:00 UTC */
const EPOCH = 0;
const HOUR = 3600_000;
const DAY = 86_400_000;

describe('wallClockToEpochMs — 기준점', () => {
  it('UTC(오프셋 0)의 에포크 자정은 0이다', () => {
    expect(wallClockToEpochMs('1970-01-01', '00:00', 0)).toBe(EPOCH);
  });

  it('한국(+540)의 1970-01-01 09:00 은 에포크와 같은 순간이다', () => {
    expect(wallClockToEpochMs('1970-01-01', '09:00', 540)).toBe(EPOCH);
  });

  it('오프셋이 클수록(동쪽) 같은 벽시계 시각은 더 이른 절대 시각이다', () => {
    const utc = wallClockToEpochMs('2026-08-21', '14:00', 0);
    const kst = wallClockToEpochMs('2026-08-21', '14:00', 540);
    const est = wallClockToEpochMs('2026-08-21', '14:00', -300);
    expect(kst).toBe((utc ?? 0) - 9 * HOUR);
    expect(est).toBe((utc ?? 0) + 5 * HOUR);
  });

  it('오프셋 0 / +540 / −300 모두에서 값이 나온다 (계획서 완료 판정 10)', () => {
    for (const offset of [0, 540, -300]) {
      expect(wallClockToEpochMs('2026-08-21', '09:00', offset)).not.toBeNull();
    }
  });
});

describe('wallClockToEpochMs — 날짜 계산', () => {
  it('하루 뒤는 정확히 86,400,000ms 뒤다', () => {
    const a = wallClockToEpochMs('2026-08-21', '09:00', 540) ?? 0;
    const b = wallClockToEpochMs('2026-08-22', '09:00', 540) ?? 0;
    expect(b - a).toBe(DAY);
  });

  it('윤년 2월 29일을 인정한다 (2024)', () => {
    expect(wallClockToEpochMs('2024-02-29', '00:00', 0)).not.toBeNull();
  });

  it('평년 2월 29일은 없는 날짜로 본다 (2026)', () => {
    expect(wallClockToEpochMs('2026-02-29', '00:00', 0)).toBeNull();
  });

  it('100의 배수 해는 윤년이 아니다 (1900)', () => {
    expect(wallClockToEpochMs('1900-02-29', '00:00', 0)).toBeNull();
  });

  it('400의 배수 해는 윤년이다 (2000)', () => {
    expect(wallClockToEpochMs('2000-02-29', '00:00', 0)).not.toBeNull();
  });

  it('윤일을 건너뛰어도 하루 간격이 유지된다', () => {
    const feb28 = wallClockToEpochMs('2024-02-28', '00:00', 0) ?? 0;
    const feb29 = wallClockToEpochMs('2024-02-29', '00:00', 0) ?? 0;
    const mar01 = wallClockToEpochMs('2024-03-01', '00:00', 0) ?? 0;
    expect(feb29 - feb28).toBe(DAY);
    expect(mar01 - feb29).toBe(DAY);
  });

  it('에포크 이전 날짜도 음수로 계산된다', () => {
    const v = wallClockToEpochMs('1969-12-31', '00:00', 0);
    expect(v).toBe(-DAY);
  });

  it('세기를 넘어가도 하루 간격이 유지된다', () => {
    const a = wallClockToEpochMs('1999-12-31', '23:00', 0) ?? 0;
    const b = wallClockToEpochMs('2000-01-01', '23:00', 0) ?? 0;
    expect(b - a).toBe(DAY);
  });
});

describe('wallClockToEpochMs — 잘못된 입력은 null', () => {
  it.each([
    ['2026-8-21', '09:00', '월이 한 자리'],
    ['20260821', '09:00', '하이픈 없음'],
    ['2026-13-01', '09:00', '13월'],
    ['2026-00-10', '09:00', '0월'],
    ['2026-08-32', '09:00', '32일'],
    ['2026-08-00', '09:00', '0일'],
    ['2026-04-31', '09:00', '4월 31일'],
    ['', '09:00', '빈 날짜'],
  ])('날짜 "%s" → null (%s)', (dateStr, timeStr) => {
    expect(wallClockToEpochMs(dateStr, timeStr, 540)).toBeNull();
  });

  it.each([
    ['9:00', '시가 한 자리'],
    ['24:00', '24시'],
    ['09:60', '60분'],
    ['0900', '콜론 없음'],
    ['', '빈 시각'],
  ])('시각 "%s" → null (%s)', (timeStr) => {
    expect(wallClockToEpochMs('2026-08-21', timeStr, 540)).toBeNull();
  });

  it('오프셋이 숫자가 아니면 null', () => {
    expect(wallClockToEpochMs('2026-08-21', '09:00', Number.NaN)).toBeNull();
  });

  it('23:59 는 유효하다 (경계)', () => {
    expect(wallClockToEpochMs('2026-08-21', '23:59', 540)).not.toBeNull();
  });
});
