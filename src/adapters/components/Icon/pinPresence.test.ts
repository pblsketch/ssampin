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

  it('급식 메뉴가 있으면 급식 줄을 추가한다 (점심 전)', () => {
    const now = new Date(2026, 5, 23, 10, 20, 0);
    const info = derivePinInfo({
      now,
      periodTimes,
      teacherSchedule,
      todos: [],
      events: [],
      lunchMenu: '김치찌개, 제육볶음',
      lunchAfterPeriod: 3, // 3교시(11:50) 직후 점심
    });
    const summary = buildSummary(info);
    expect(summary.lines.some((l) => l.startsWith('급식: 김치찌개'))).toBe(true);
  });

  it('점심 시작 1시간이 지난 급식 줄은 숨긴다', () => {
    const now = new Date(2026, 5, 23, 14, 0, 0); // 점심(11:50) 130분 후
    const info = derivePinInfo({
      now,
      periodTimes,
      teacherSchedule,
      todos: [],
      events: [],
      lunchMenu: '김치찌개',
      lunchAfterPeriod: 3,
    });
    expect(buildSummary(info).lines.some((l) => l.startsWith('급식:'))).toBe(false);
  });
});

describe('derivePinInfo — 아침 브리핑 재료 (v2.2.7)', () => {
  it('오늘 수업 수와 첫 수업을 계산한다 (빈 교시 제외)', () => {
    const now = new Date(2026, 5, 23, 8, 20, 0);
    const info = derivePinInfo({ now, periodTimes, teacherSchedule, todos: [], events: [] });
    expect(info.todayClassCount).toBe(2); // 수학 + 과학 (2교시는 빈 교시)
    expect(info.firstClass?.number).toBe(1);
    expect(info.firstClass?.subject).toBe('수학');
  });

  it('주말이면 수업 수 0, 첫 수업 없음', () => {
    const sat = new Date(2026, 5, 27, 9, 0, 0);
    const info = derivePinInfo({ now: sat, periodTimes, teacherSchedule, todos: [], events: [] });
    expect(info.todayClassCount).toBe(0);
    expect(info.firstClass).toBeNull();
  });
});

describe('decidePeek — 아침 브리핑 (v2.2.7)', () => {
  it('첫 수업 30분 전이면 오늘 수업 개수와 함께 브리핑한다', () => {
    const now = new Date(2026, 5, 23, 8, 35, 0); // 1교시(09:00) 25분 전
    const info = derivePinInfo({ now, periodTimes, teacherSchedule, todos: [], events: [] });
    expect(decidePeek(info)).toEqual({
      state: 'wave',
      text: '오늘 수업 2개 · 첫 수업 1교시 수학 · 2-3 (25분 후)',
    });
  });

  it('5분 이내로 임박하면 아침 브리핑 대신 "곧 시작" 알림이 이긴다', () => {
    const now = new Date(2026, 5, 23, 8, 56, 0); // 4분 전
    const info = derivePinInfo({ now, periodTimes, teacherSchedule, todos: [], events: [] });
    expect(decidePeek(info)?.text).toBe('곧 1교시 수학 · 2-3');
  });

  it('첫 수업이 아닌 수업 앞에서는 아침 브리핑을 하지 않는다', () => {
    const now = new Date(2026, 5, 23, 10, 40, 0); // 3교시(11:00) 20분 전, 2교시 빈 교시 중
    const info = derivePinInfo({ now, periodTimes, teacherSchedule, todos: [], events: [] });
    expect(decidePeek(info)).toBeNull(); // 3교시는 첫 수업이 아님 — 브리핑 없음
  });

  it('마감 할 일이 있어도 아침 브리핑 창에서는 브리핑이 우선한다', () => {
    const now = new Date(2026, 5, 23, 8, 35, 0);
    const todos: Todo[] = [todo({ text: '성적 입력', dueDate: '2026-06-20' })];
    const info = derivePinInfo({ now, periodTimes, teacherSchedule, todos, events: [] });
    expect(decidePeek(info)?.text.startsWith('오늘 수업 2개')).toBe(true);
  });
});

describe('decidePeek — 급식 브리핑 (v2.2.7)', () => {
  it('점심 60분 전부터 급식 메뉴를 알린다 (할 일보다 우선)', () => {
    const now = new Date(2026, 5, 23, 11, 10, 0); // 3교시 진행 중, 점심(11:50) 40분 전
    const todos: Todo[] = [todo({ text: '성적 입력', dueDate: '2026-06-20' })];
    const info = derivePinInfo({
      now,
      periodTimes,
      teacherSchedule,
      todos,
      events: [],
      lunchMenu: '김치찌개, 제육볶음, 사과',
      lunchAfterPeriod: 3,
    });
    expect(decidePeek(info)).toEqual({
      state: 'jump',
      text: '오늘 급식 · 김치찌개, 제육볶음, 사과',
    });
  });

  it('점심이 이미 시작했으면 급식 알림은 없다', () => {
    const now = new Date(2026, 5, 23, 12, 10, 0); // 점심(11:50) 시작 후
    const info = derivePinInfo({
      now,
      periodTimes,
      teacherSchedule,
      todos: [],
      events: [],
      lunchMenu: '김치찌개',
      lunchAfterPeriod: 3,
    });
    expect(decidePeek(info)).toBeNull();
  });

  it('점심 시각을 모르면(lunchAfterPeriod·폴백 없음) 급식 알림은 없지만 요약에는 남는다', () => {
    const now = new Date(2026, 5, 23, 11, 10, 0);
    const info = derivePinInfo({
      now,
      periodTimes,
      teacherSchedule,
      todos: [],
      events: [],
      lunchMenu: '김치찌개',
    });
    expect(decidePeek(info)).toBeNull();
    expect(buildSummary(info).lines.some((l) => l.startsWith('급식:'))).toBe(true);
  });

  it('레거시 lunchStart "HH:mm" 폴백으로도 시각을 계산한다', () => {
    const now = new Date(2026, 5, 23, 11, 40, 0);
    const info = derivePinInfo({
      now,
      periodTimes,
      teacherSchedule,
      todos: [],
      events: [],
      lunchMenu: '비빔밥',
      lunchStartFallback: '12:10',
    });
    expect(info.lunch?.minutesUntil).toBe(30);
    expect(decidePeek(info)?.text).toBe('오늘 급식 · 비빔밥');
  });
});
