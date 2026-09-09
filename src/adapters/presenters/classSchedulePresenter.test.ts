import { describe, it, expect } from 'vitest';
import { toClassScheduleLabel, MATCH_STAGE_NOTE } from './classSchedulePresenter';
import type { WeeklyLessonSlotsResult } from '@domain/rules/weeklyLessonSlots';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';

const 수3금5: WeeklyLessonSlotsResult = {
  slots: [
    { day: '수', period: 3 },
    { day: '금', period: 5 },
  ],
  matchStage: 1,
};

describe('toClassScheduleLabel', () => {
  it('찾은 칸을 좁은 목록용 한 줄과 완전한 문장으로 만든다', () => {
    const label = toClassScheduleLabel(수3금5);

    expect(label).not.toBeNull();
    expect(label?.label).toBe('수3 · 금5');
    expect(label?.fullText).toBe('매주 수요일 3교시, 금요일 5교시 수업');
    expect(label?.uncertain).toBe(false);
    expect(label?.confidenceNote).toBeUndefined();
  });

  it('같은 요일 여러 교시는 쉼표로 묶는다', () => {
    const label = toClassScheduleLabel({
      slots: [
        { day: '월', period: 2 },
        { day: '월', period: 3 },
        { day: '목', period: 1 },
      ],
      matchStage: 1,
    });

    expect(label?.label).toBe('월2,3 · 목1');
    expect(label?.fullText).toBe('매주 월요일 2교시·3교시, 목요일 1교시 수업');
  });

  it('학교가 붙인 교시 이름을 그대로 쓴다 — 없는 이름을 만들어내지 않는다', () => {
    const periodTimes: readonly PeriodTime[] = [
      { period: 3, start: '11:00', end: '11:50', label: '창체' },
    ];

    const label = toClassScheduleLabel(수3금5, periodTimes);

    // '수창체'처럼 붙이면 요일과 교시 경계가 사라진다 — 이름 붙은 교시만 한 칸 띄운다.
    expect(label?.label).toBe('수 창체 · 금5');
    expect(label?.fullText).toBe('매주 수요일 창체, 금요일 5교시 수업');
  });

  it('숫자 교시는 붙여 쓴다 — 쉼표를 이름으로 착각하지 않는다', () => {
    const label = toClassScheduleLabel({
      slots: [
        { day: '월', period: 2 },
        { day: '월', period: 3 },
      ],
      matchStage: 1,
    });

    expect(label?.label).toBe('월2,3');
  });

  it('교실명만 맞아 찾았으면 덜 확실하다고 알린다(2단계)', () => {
    const label = toClassScheduleLabel({ ...수3금5, matchStage: 2 });

    expect(label?.uncertain).toBe(true);
    expect(label?.confidenceNote).toBe(MATCH_STAGE_NOTE[2]);
    expect(label?.fullText).toContain(MATCH_STAGE_NOTE[2]);
  });

  it('담임반 시간표로 추정했으면 그 사실을 알린다(3단계)', () => {
    const label = toClassScheduleLabel({ ...수3금5, matchStage: 3 });

    expect(label?.uncertain).toBe(true);
    expect(label?.confidenceNote).toBe(MATCH_STAGE_NOTE[3]);
  });

  it('찾은 칸이 없으면 null — 목록에 "시간표 없음"을 반복 출력하지 않는다', () => {
    expect(toClassScheduleLabel({ slots: [], matchStage: null })).toBeNull();
    // 방어: 단계는 있는데 칸이 비어 있는 모순 입력도 줄을 그리지 않는다.
    expect(toClassScheduleLabel({ slots: [], matchStage: 1 })).toBeNull();
  });
});
