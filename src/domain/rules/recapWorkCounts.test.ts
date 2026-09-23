import { describe, it, expect } from 'vitest';
import type { ProgressEntry } from '@domain/entities/CurriculumProgress';
import type { ConsultationSchedule } from '@domain/entities/Consultation';
import type { Todo } from '@domain/entities/Todo';
import {
  clampRangeToToday,
  combineConsultationCount,
  completedLessonsByClass,
  countCompletedLessons,
  countCompletedTodos,
  countConsultationBookings,
  isPartialTodoTerm,
  pngWorkCountItems,
  schedulesInRange,
  workCountItems,
  workCountLine,
} from './recapWorkCounts';

const WEEK = { start: '2026-09-21', end: '2026-09-27' };

function lesson(p: Partial<ProgressEntry>): ProgressEntry {
  return {
    id: Math.random().toString(36).slice(2),
    classId: 'c1',
    date: '2026-09-22',
    period: 1,
    unit: '',
    lesson: '',
    status: 'completed',
    note: '',
    ...p,
  } as ProgressEntry;
}

function todo(p: Partial<Todo>): Todo {
  return {
    id: Math.random().toString(36).slice(2),
    text: '공문 회신',
    completed: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...p,
  };
}

/** 로컬 시각(한국 기준 시험에서도 날짜가 밀리지 않게) → ISO */
function localIso(date: string, hh = 10): string {
  return new Date(`${date}T${String(hh).padStart(2, '0')}:00:00`).toISOString();
}

describe('clampRangeToToday', () => {
  it('오늘 뒤는 자른다', () => {
    expect(clampRangeToToday(WEEK, '2026-09-23')).toEqual({
      start: '2026-09-21',
      end: '2026-09-23',
    });
  });
  it('기간이 통째로 미래면 null', () => {
    expect(clampRangeToToday(WEEK, '2026-09-20')).toBeNull();
  });
});

describe('수업 차시', () => {
  const entries = [
    lesson({ date: '2026-09-21' }),
    lesson({ date: '2026-09-22', classId: 'c2' }),
    lesson({ date: '2026-09-22', status: 'planned' }),
    lesson({ date: '2026-09-23', status: 'skipped' }),
    lesson({ date: '2026-09-28' }),
  ];
  it('완료이고 기간 안인 것만 센다', () => {
    expect(countCompletedLessons(entries, WEEK)).toBe(2);
  });
  it('반별로 나누고 0인 반은 없다', () => {
    const byClass = completedLessonsByClass(entries, WEEK);
    expect([...byClass.entries()]).toEqual([
      ['c1', 1],
      ['c2', 1],
    ]);
  });
});

describe('끝낸 할 일', () => {
  it('완료 시각의 로컬 날짜가 기간 안인 것만, 보관한 것도 센다', () => {
    const todos = [
      todo({ completedAt: localIso('2026-09-22') }),
      todo({ completedAt: localIso('2026-09-23'), archivedAt: localIso('2026-09-24') }),
      todo({ completedAt: localIso('2026-09-28') }),
      todo({}), // 완료 시각 없음(옛 할 일)
      todo({ completed: false, completedAt: localIso('2026-09-22') }),
    ];
    expect(countCompletedTodos(todos, WEEK, null)).toBe(2);
  });

  it('기록 시작일보다 앞선 완료 시각은 세지 않는다(구글이 준 옛 시각)', () => {
    const todos = [
      todo({ completedAt: localIso('2026-09-21') }),
      todo({ completedAt: localIso('2026-09-24') }),
    ];
    expect(countCompletedTodos(todos, WEEK, '2026-09-23')).toBe(1);
  });

  it('기록 시작일을 읽을 수 없으면(null) 거르지 않는다', () => {
    const todos = [todo({ completedAt: localIso('2026-09-21') })];
    expect(countCompletedTodos(todos, WEEK, null)).toBe(1);
  });
});

describe('상담 예약', () => {
  function schedule(dates: string[]): ConsultationSchedule {
    return {
      id: dates.join(','),
      dates: dates.map((date) => ({ date })),
    } as unknown as ConsultationSchedule;
  }

  it('기간 안 날짜가 있는 일정만 묻는다', () => {
    const inside = schedule(['2026-09-20', '2026-09-22']);
    const outside = schedule(['2026-10-01']);
    expect(schedulesInRange([inside, outside], WEEK)).toEqual([inside]);
  });

  const detailA = {
    slots: [
      { id: 's1', date: '2026-09-22', status: 'booked' as const },
      { id: 's2', date: '2026-09-22', status: 'available' as const },
      { id: 's3', date: '2026-09-29', status: 'booked' as const },
      { id: 's4', date: '2026-09-24', status: 'blocked' as const },
    ],
    bookings: [{ slotId: 's1' }, { slotId: 's3' }, { slotId: 's4' }],
  };
  const detailB = {
    slots: [{ id: 't1', date: '2026-09-23', status: 'booked' as const }],
    bookings: [{ slotId: 't1' }, { slotId: 'gone' }],
  };

  it('예약된 칸의 날짜로 센다 — 기간 밖·막은 칸·사라진 칸은 세지 않는다', () => {
    expect(countConsultationBookings([detailA, detailB], WEEK)).toBe(2);
  });

  it('일정 하나라도 못 가져오면 상담 항목 전체가 없다(null)', () => {
    expect(combineConsultationCount([detailA, null], WEEK)).toBeNull();
    expect(combineConsultationCount([detailA, detailB], WEEK)).toBe(2);
  });

  it('물을 일정이 없으면 0', () => {
    expect(combineConsultationCount([], WEEK)).toBe(0);
  });
});

describe('숫자 줄', () => {
  it('0 과 가져오지 못한 상담(null)은 뺀다', () => {
    expect(workCountItems({ lessons: 18, todos: 0, consultations: null })).toEqual([
      { kind: 'lessons', count: 18 },
    ]);
  });

  it('셋 다 없으면 줄이 없다', () => {
    expect(workCountLine(workCountItems({ lessons: 0, todos: 0, consultations: 0 }))).toBeNull();
  });

  it('수업 · 끝낸 할 일 · 상담 순서', () => {
    expect(workCountLine(workCountItems({ lessons: 18, todos: 9, consultations: 3 }))).toBe(
      '수업 18차시 · 끝낸 할 일 9개 · 상담 3건',
    );
  });

  it('학기 중간부터 센 학기면 그림에서 할 일을 뺀다', () => {
    const counts = { lessons: 312, todos: 42, consultations: 17 };
    expect(workCountLine(pngWorkCountItems(counts, true))).toBe('수업 312차시 · 상담 17건');
    expect(workCountLine(pngWorkCountItems(counts, false))).toBe(
      '수업 312차시 · 끝낸 할 일 42개 · 상담 17건',
    );
  });
});

describe('할 일 첫 학기', () => {
  it('학기가 기록 시작일보다 먼저 시작했으면 부분 학기', () => {
    expect(isPartialTodoTerm('2026-08-17', '2026-09-24')).toBe(true);
  });
  it('기록 시작일 뒤에 시작한 학기는 온전하다', () => {
    expect(isPartialTodoTerm('2027-03-02', '2026-09-24')).toBe(false);
  });
  it('기록 시작일을 읽을 수 없으면 부분 학기로 본다', () => {
    expect(isPartialTodoTerm('2027-03-02', null)).toBe(true);
  });
});
