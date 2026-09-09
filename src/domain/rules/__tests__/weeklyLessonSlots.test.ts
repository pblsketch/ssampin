import { describe, it, expect } from 'vitest';
import {
  getWeeklyLessonSlots,
  groupWeeklyLessonSlotsByDay,
  type WeeklyLessonSlotsInput,
} from '../weeklyLessonSlots';
import type { ClassScheduleData, TeacherScheduleData } from '@domain/entities/Timetable';

const EMPTY_DAY = [null, null, null, null, null, null, null];

function teacherSchedule(over: Partial<TeacherScheduleData> = {}): TeacherScheduleData {
  return {
    월: EMPTY_DAY,
    화: EMPTY_DAY,
    수: EMPTY_DAY,
    목: EMPTY_DAY,
    금: EMPTY_DAY,
    ...over,
  };
}

function baseInput(over: Partial<WeeklyLessonSlotsInput> = {}): WeeklyLessonSlotsInput {
  return {
    className: '3-1',
    classSubject: '국어',
    teacherSchedule: teacherSchedule(),
    classSchedule: {},
    ...over,
  };
}

describe('getWeeklyLessonSlots', () => {
  it('교실명과 과목이 모두 맞으면 1단계로 요일·교시를 찾는다', () => {
    const result = getWeeklyLessonSlots(
      baseInput({
        teacherSchedule: teacherSchedule({
          수: [null, null, { subject: '국어', classroom: '3-1' }, null, null, null, null],
          금: [null, null, null, null, { subject: '국어', classroom: '3-1' }, null, null],
        }),
      }),
    );

    expect(result.matchStage).toBe(1);
    expect(result.slots).toEqual([
      { day: '수', period: 3 },
      { day: '금', period: 5 },
    ]);
  });

  it('요일은 월→금, 교시는 오름차순으로 돌려준다', () => {
    const result = getWeeklyLessonSlots(
      baseInput({
        teacherSchedule: teacherSchedule({
          금: [{ subject: '국어', classroom: '3-1' }, null, null, null, null, null, null],
          월: [
            null,
            { subject: '국어', classroom: '3-1' },
            { subject: '국어', classroom: '3-1' },
            null,
            null,
            null,
            null,
          ],
        }),
      }),
    );

    expect(result.slots).toEqual([
      { day: '월', period: 2 },
      { day: '월', period: 3 },
      { day: '금', period: 1 },
    ]);
  });

  it('과목명이 달라도 교실명이 맞으면 2단계로 찾는다', () => {
    const result = getWeeklyLessonSlots(
      baseInput({
        classSubject: '문학',
        teacherSchedule: teacherSchedule({
          화: [null, { subject: '독서와 작문', classroom: '3-1' }, null, null, null, null, null],
        }),
      }),
    );

    expect(result.matchStage).toBe(2);
    expect(result.slots).toEqual([{ day: '화', period: 2 }]);
  });

  it('1단계가 한 칸이라도 걸리면 2단계 후보는 섞이지 않는다', () => {
    // 같은 교실에 과목이 다른 칸(목4)이 함께 있어도, 정확히 맞는 칸(월1)만 남아야 한다.
    const result = getWeeklyLessonSlots(
      baseInput({
        teacherSchedule: teacherSchedule({
          월: [{ subject: '국어', classroom: '3-1' }, null, null, null, null, null, null],
          목: [null, null, null, { subject: '체육', classroom: '3-1' }, null, null, null],
        }),
      }),
    );

    expect(result.matchStage).toBe(1);
    expect(result.slots).toEqual([{ day: '월', period: 1 }]);
  });

  it('교사 시간표에 없으면 담임반 시간표에서 과목으로 추정한다(3단계)', () => {
    const classSchedule: ClassScheduleData = {
      월: [
        { subject: '수학', teacher: '김선생' },
        { subject: '국어', teacher: '박선생' },
      ],
      수: [{ subject: '국어', teacher: '박선생' }],
    };

    const result = getWeeklyLessonSlots(baseInput({ classSchedule }));

    expect(result.matchStage).toBe(3);
    expect(result.slots).toEqual([
      { day: '월', period: 2 },
      { day: '수', period: 1 },
    ]);
  });

  it('아무 데서도 못 찾으면 빈 목록과 null을 돌려준다', () => {
    const result = getWeeklyLessonSlots(baseInput());
    expect(result.slots).toEqual([]);
    expect(result.matchStage).toBeNull();
  });

  it('주말 수업 설정이 없으면 토·일 칸은 무시한다', () => {
    const withSaturday = teacherSchedule({
      토: [{ subject: '국어', classroom: '3-1' }, null, null, null, null, null, null],
    });

    expect(getWeeklyLessonSlots(baseInput({ teacherSchedule: withSaturday })).slots).toEqual([]);

    const result = getWeeklyLessonSlots(
      baseInput({ teacherSchedule: withSaturday, weekendDays: ['토'] }),
    );
    expect(result.slots).toEqual([{ day: '토', period: 1 }]);
  });

  it('학급명과 과목이 모두 비어 있으면 계산하지 않는다', () => {
    const result = getWeeklyLessonSlots(
      baseInput({
        className: '',
        classSubject: '',
        teacherSchedule: teacherSchedule({
          월: [{ subject: '국어', classroom: '3-1' }, null, null, null, null, null, null],
        }),
      }),
    );
    expect(result.slots).toEqual([]);
    expect(result.matchStage).toBeNull();
  });
});

describe('groupWeeklyLessonSlotsByDay', () => {
  it('같은 요일 교시를 묶고 오름차순으로 정렬한다', () => {
    const groups = groupWeeklyLessonSlotsByDay([
      { day: '월', period: 3 },
      { day: '목', period: 1 },
      { day: '월', period: 2 },
    ]);

    expect(groups).toEqual([
      { day: '월', periods: [2, 3] },
      { day: '목', periods: [1] },
    ]);
  });

  it('같은 요일·같은 교시가 두 번 들어와도 한 번만 센다', () => {
    const groups = groupWeeklyLessonSlotsByDay([
      { day: '화', period: 4 },
      { day: '화', period: 4 },
    ]);
    expect(groups).toEqual([{ day: '화', periods: [4] }]);
  });
});
