// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import type { ProgressEntry } from '@domain/entities/CurriculumProgress';
import type { TeachingClass } from '@domain/entities/TeachingClass';
import { classLessonCounts, localWorkCounts, todoCountNote, weekDateRange } from '../recapWorkData';
import {
  markTodoCompletionSince,
  readTodoCompletionSince,
  TODO_COMPLETION_SINCE_KEY,
} from '@adapters/utils/todoCompletionSince';

const lesson = (classId: string, date: string): ProgressEntry =>
  ({
    id: `${classId}-${date}`,
    classId,
    date,
    period: 1,
    unit: '',
    lesson: '',
    status: 'completed',
    note: '',
  }) as ProgressEntry;

const cls = (id: string, name: string, subject: string, archived = false): TeachingClass =>
  ({
    id,
    name,
    subject,
    students: [],
    ...(archived ? { archived: true } : {}),
  }) as unknown as TeachingClass;

describe('recapWorkData', () => {
  it('한 주는 월~일', () => {
    expect(weekDateRange('2026-09-21')).toEqual({ start: '2026-09-21', end: '2026-09-27' });
  });

  it('통째로 미래인 주는 0, 상담은 늘 null(이 컴퓨터 자료가 아니다)', () => {
    const c = localWorkCounts(
      weekDateRange('2026-09-28'),
      '2026-09-25',
      [],
      [lesson('c1', '2026-09-29')],
      null,
    );
    expect(c).toEqual({ lessons: 0, todos: 0, consultations: null });
  });

  it('반별 줄 — 보관하지 않은 반 먼저, 이름이 같으면 과목을 붙이고, 0인 반은 뺀다', () => {
    const classes = [
      cls('old', '1-1', '국어', true),
      cls('a', '3-5', '국어'),
      cls('b', '3-5', '통합과학'),
      cls('z', '3-6', '국어'),
    ];
    const entries = [
      lesson('old', '2026-09-01'),
      lesson('b', '2026-09-02'),
      lesson('a', '2026-09-03'),
    ];
    const out = classLessonCounts(
      entries,
      { start: '2026-08-18', end: '2027-02-28' },
      '2026-09-25',
      classes,
    );
    expect(out.map((c) => `${c.name} ${c.count}`)).toEqual([
      '3-5 국어 1',
      '3-5 통합과학 1',
      '1-1 1',
    ]);
  });

  it('할 일 안내 — 0이면 없음, 온전한 학기면 없음, 날짜를 모르면 날짜 없이', () => {
    expect(todoCountNote('2026-08-18', '2026-09-24', 0)).toBeNull();
    expect(todoCountNote('2027-03-02', '2026-09-24', 5)).toBeNull();
    expect(todoCountNote('2026-08-18', '2026-09-24', 5)).toBe(
      '끝낸 할 일은 9월 24일부터 센 수예요',
    );
    expect(todoCountNote('2026-08-18', null, 5)).toBe(
      '끝낸 할 일은 이 기능이 생긴 뒤부터 센 수예요',
    );
  });
});

describe('할 일 완료 시각 기록 시작일', () => {
  afterEach(() => window.localStorage.removeItem(TODO_COMPLETION_SINCE_KEY));

  it('처음 한 번만 적고 바꾸지 않는다', () => {
    markTodoCompletionSince('2026-09-24');
    markTodoCompletionSince('2026-10-01');
    expect(readTodoCompletionSince()).toBe('2026-09-24');
  });

  it('깨진 값은 없는 것으로 보되 오늘로 덮지 않는다(덮으면 그 사이 끝낸 할 일이 조용히 빠진다)', () => {
    window.localStorage.setItem(TODO_COMPLETION_SINCE_KEY, 'garbage');
    expect(readTodoCompletionSince()).toBeNull();
    markTodoCompletionSince('2026-10-01');
    expect(window.localStorage.getItem(TODO_COMPLETION_SINCE_KEY)).toBe('garbage');
  });
});
