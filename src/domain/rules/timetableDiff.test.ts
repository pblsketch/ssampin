import { describe, it, expect } from 'vitest';
import { diffTeacherSchedule, diffClassSchedule } from './timetableDiff';
import type { TeacherScheduleData, ClassScheduleData } from '../entities/Timetable';

describe('diffTeacherSchedule — 교사 시간표 변경 감지', () => {
  it('동일한 시간표는 changed:false', () => {
    const a: TeacherScheduleData = {
      월: [{ subject: '국어', classroom: '1-1' }, null],
      화: [{ subject: '수학', classroom: '2-3' }],
    };
    const b: TeacherScheduleData = {
      월: [{ subject: '국어', classroom: '1-1' }, null],
      화: [{ subject: '수학', classroom: '2-3' }],
    };
    expect(diffTeacherSchedule(a, b)).toEqual({ changed: false, changes: [] });
  });

  it('한 교시 과목이 바뀌면 changed:true + 정확한 change 항목', () => {
    const a: TeacherScheduleData = { 월: [{ subject: '국어', classroom: '1-1' }] };
    const b: TeacherScheduleData = { 월: [{ subject: '문학', classroom: '1-1' }] };
    const result = diffTeacherSchedule(a, b);
    expect(result.changed).toBe(true);
    expect(result.changes).toEqual([
      { day: '월', period: 1, before: '국어@1-1', after: '문학@1-1' },
    ]);
  });

  it('교실 병합 순서만 다르면 changed:false (합반 정규화)', () => {
    const a: TeacherScheduleData = { 월: [{ subject: '체육', classroom: '1-1·1-2' }] };
    const b: TeacherScheduleData = { 월: [{ subject: '체육', classroom: '1-2·1-1' }] };
    expect(diffTeacherSchedule(a, b).changed).toBe(false);
  });

  it('끝쪽 공강 패딩 길이차만 있으면 changed:false', () => {
    const a: TeacherScheduleData = { 월: [{ subject: '국어', classroom: '1-1' }] };
    const b: TeacherScheduleData = {
      월: [{ subject: '국어', classroom: '1-1' }, null, null],
    };
    expect(diffTeacherSchedule(a, b).changed).toBe(false);
  });

  it('공강↔수업 변경은 감지한다', () => {
    const a: TeacherScheduleData = { 월: [null] };
    const b: TeacherScheduleData = { 월: [{ subject: '보강', classroom: '3-1' }] };
    const result = diffTeacherSchedule(a, b);
    expect(result.changed).toBe(true);
    expect(result.changes[0]).toEqual({ day: '월', period: 1, before: '', after: '보강@3-1' });
  });
});

describe('diffClassSchedule — 학급 시간표 변경 감지', () => {
  it('빈 칸 패딩 길이차는 무시한다', () => {
    const a: ClassScheduleData = {
      월: [
        { subject: '국어', teacher: '김철*' },
        { subject: '', teacher: '' },
      ],
    };
    const b: ClassScheduleData = { 월: [{ subject: '국어', teacher: '김철*' }] };
    expect(diffClassSchedule(a, b).changed).toBe(false);
  });

  it('담당 교사가 바뀌면 changed:true', () => {
    const a: ClassScheduleData = { 월: [{ subject: '수학', teacher: '이영*' }] };
    const b: ClassScheduleData = { 월: [{ subject: '수학', teacher: '박민*' }] };
    const result = diffClassSchedule(a, b);
    expect(result.changed).toBe(true);
    expect(result.changes[0]).toEqual({
      day: '월',
      period: 1,
      before: '수학/이영*',
      after: '수학/박민*',
    });
  });
});
