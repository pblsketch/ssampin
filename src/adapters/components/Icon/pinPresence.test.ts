import { describe, it, expect } from 'vitest';
import { derivePinInfo, decidePeek, buildSummary } from './pinPresence';
import type { Todo } from '@domain/entities/Todo';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';
import type { TeacherScheduleData } from '@domain/entities/Timetable';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';

// 2026-06-23 = 화요일
const periodTimes: PeriodTime[] = [
  { period: 1, start: '09:00', end: '09:50' },
  { period: 2, start: '10:00', end: '10:50' },
  { period: 3, start: '11:00', end: '11:50' },
];

// 1교시 수학(2-3반), 2교시 빈 교시, 3교시 과학(과학실)
const teacherSchedule: TeacherScheduleData = {
  화: [{ subject: '수학', classroom: '2-3' }, null, { subject: '과학', classroom: '과학실' }],
};

function todo(partial: Partial<Todo> & Pick<Todo, 'text'>): Todo {
  return {
    id: `t-${partial.text}`,
    completed: false,
    createdAt: '2026-06-01T00:00:00.000Z',
    ...partial,
  };
}

function event(partial: Partial<SchoolEvent> & Pick<SchoolEvent, 'title' | 'date'>): SchoolEvent {
  return {
    id: `e-${partial.title}`,
    category: 'etc',
    ...partial,
  };
}

describe('derivePinInfo — 다음 수업', () => {
  it('쉬는 시간(수업 5분 전)에 다음 수업 과목+교실+남은 분을 계산한다', () => {
    const now = new Date(2026, 5, 23, 8, 56, 0); // 08:56, 1교시(09:00) 4분 전
    const info = derivePinInfo({ now, periodTimes, teacherSchedule, todos: [], events: [] });
    expect(info.current).toBeNull();
    expect(info.next).toEqual({ number: 1, subject: '수학', classroom: '2-3', minutesUntil: 4 });
  });

  it('빈 교시는 건너뛰고 다음으로 실제 수업이 있는 교시를 찾는다', () => {
    const now = new Date(2026, 5, 23, 10, 20, 0); // 2교시(빈 교시) 진행 중
    const info = derivePinInfo({ now, periodTimes, teacherSchedule, todos: [], events: [] });
    // 현재 2교시는 과목 없음(빈 교시), 다음은 3교시 과학
    expect(info.next?.subject).toBe('과학');
    expect(info.next?.number).toBe(3);
  });

  it('주말이면 수업 정보가 없다', () => {
    const sat = new Date(2026, 5, 27, 9, 0, 0); // 토요일
    const info = derivePinInfo({ now: sat, periodTimes, teacherSchedule, todos: [], events: [] });
    expect(info.current).toBeNull();
    expect(info.next).toBeNull();
  });
});

describe('derivePinInfo — 마감 할 일', () => {
  it('미완료 + 오늘까지 마감만 세고, 지난 마감 수와 가장 급한 항목을 뽑는다', () => {
    const now = new Date(2026, 5, 23, 14, 0, 0);
    const todos: Todo[] = [
      todo({ text: '시험지 인쇄', dueDate: '2026-06-23' }),
      todo({ text: '성적 입력', dueDate: '2026-06-20' }), // 지난 마감
      todo({ text: '완료된 것', dueDate: '2026-06-23', completed: true }),
      todo({ text: '미래 할 일', dueDate: '2026-06-30' }), // 아직 마감 아님
    ];
    const info = derivePinInfo({ now, periodTimes, teacherSchedule, todos, events: [] });
    expect(info.dueTodos.count).toBe(2);
    expect(info.dueTodos.overdueCount).toBe(1);
    expect(info.dueTodos.topText).toBe('성적 입력'); // 가장 이른 마감
  });
});

describe('derivePinInfo — 다가오는 일정', () => {
  it('오늘 아직 안 지난 일정을 시간순으로 골라 남은 분을 계산한다', () => {
    const now = new Date(2026, 5, 23, 13, 0, 0);
    const events: SchoolEvent[] = [
      event({ title: '학부모 상담', date: '2026-06-23', time: '13:20' }),
      event({ title: '이미 지난 회의', date: '2026-06-23', time: '09:00' }),
    ];
    const info = derivePinInfo({ now, periodTimes, teacherSchedule, todos: [], events });
    expect(info.nextEvent?.title).toBe('학부모 상담');
    expect(info.nextEvent?.today).toBe(true);
    expect(info.nextEvent?.minutesUntil).toBe(20);
  });
});

describe('decidePeek — 우선순위', () => {
  it('수업 5분 내면 손 흔들기(wave)로 알린다', () => {
    const now = new Date(2026, 5, 23, 8, 56, 0);
    const info = derivePinInfo({ now, periodTimes, teacherSchedule, todos: [], events: [] });
    expect(decidePeek(info)).toEqual({ state: 'wave', text: '곧 1교시 수학 · 2-3' });
  });

  it('임박한 수업이 없고 마감 할 일이 있으면 점프(jump)로 알린다', () => {
    const now = new Date(2026, 5, 23, 14, 0, 0);
    const todos: Todo[] = [todo({ text: '성적 입력', dueDate: '2026-06-20' })];
    const info = derivePinInfo({ now, periodTimes, teacherSchedule, todos, events: [] });
    expect(decidePeek(info)).toEqual({ state: 'jump', text: '할 일 1개 · 성적 입력' });
  });

  it('알릴 게 없으면 null(평상시 idle)', () => {
    const now = new Date(2026, 5, 23, 14, 0, 0);
    const info = derivePinInfo({ now, periodTimes, teacherSchedule, todos: [], events: [] });
    expect(decidePeek(info)).toBeNull();
  });
});

describe('buildSummary', () => {
  it('현재 수업을 제목으로, 다음 수업을 보조 줄로 보여준다', () => {
    const now = new Date(2026, 5, 23, 9, 10, 0); // 1교시 진행 중
    const info = derivePinInfo({ now, periodTimes, teacherSchedule, todos: [], events: [] });
    const summary = buildSummary(info);
    expect(summary.title).toBe('1교시 수학 · 2-3');
    expect(summary.lines.some((l) => l.startsWith('다음: 3교시 과학'))).toBe(true);
  });
});
