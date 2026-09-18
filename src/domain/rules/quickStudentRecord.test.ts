import { describe, it, expect } from 'vitest';
import type { Student } from '@domain/entities/Student';
import type { TeachingClass, TeachingClassStudent } from '@domain/entities/TeachingClass';
import {
  buildQuickRecordCandidates,
  buildTodayRecordMarks,
  candidatesForClass,
  filterQuickRecordCandidates,
  sharedQuickRecordContexts,
  splitTodayLessons,
  type TodayLesson,
} from './quickStudentRecord';

function student(id: string, name: string, number: number, extra: Partial<Student> = {}): Student {
  return { id, name, studentNumber: number, ...extra };
}

function tcStudent(
  number: number,
  name: string,
  extra: Partial<TeachingClassStudent> = {},
): TeachingClassStudent {
  return { number, name, ...extra };
}

function teachingClass(
  id: string,
  name: string,
  subject: string,
  students: readonly TeachingClassStudent[],
  extra: Partial<TeachingClass> = {},
): TeachingClass {
  return {
    id,
    name,
    subject,
    students,
    createdAt: '2026-03-02T00:00:00.000Z',
    updatedAt: '2026-03-02T00:00:00.000Z',
    ...extra,
  };
}

describe('buildQuickRecordCandidates', () => {
  it('담임만 있는 학생은 담임 맥락 하나만 갖는다', () => {
    const out = buildQuickRecordCandidates({
      homeroom: { className: '3', grade: '2', students: [student('s1', '김한결', 1)] },
      teachingClasses: [],
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.contexts).toHaveLength(1);
    expect(out[0]!.contexts[0]).toMatchObject({
      kind: 'homeroom',
      contextId: 'homeroom',
      studentRef: 's1',
      label: '담임 · 2-3',
    });
  });

  it('교과만 있는 학생은 수업반 맥락만 갖는다', () => {
    const out = buildQuickRecordCandidates({
      homeroom: null,
      teachingClasses: [teachingClass('c1', '2-5', '국어', [tcStudent(7, '이서준')])],
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.contexts).toEqual([
      {
        kind: 'teaching',
        contextId: 'c1',
        studentRef: '7',
        label: '국어 · 2-5',
        className: '2-5',
        subject: '국어',
      },
    ]);
  });

  it('같은 반·번호·이름이면 담임과 교과 맥락이 한 학생으로 합쳐진다', () => {
    const out = buildQuickRecordCandidates({
      homeroom: { className: '3', grade: '2', students: [student('s1', '김한결', 1)] },
      teachingClasses: [teachingClass('c1', '2-3', '국어', [tcStudent(1, '김한결')])],
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.contexts.map((c) => c.label)).toEqual(['담임 · 2-3', '국어 · 2-3']);
  });

  it('같은 학생이 여러 수업반에 있으면 수업반마다 별개 선택지로 남는다', () => {
    const out = buildQuickRecordCandidates({
      homeroom: null,
      teachingClasses: [
        teachingClass('c1', '2-3', '국어', [tcStudent(1, '김한결', { grade: 2, classNum: 3 })]),
        teachingClass('c2', '2-3', '문학', [tcStudent(1, '김한결', { grade: 2, classNum: 3 })]),
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.contexts.map((c) => c.contextId)).toEqual(['c1', 'c2']);
  });

  it('반을 알 수 없는 수업반 학생은 담임 학생과 합치지 않는다 — 동명이인 오합침 방지', () => {
    const out = buildQuickRecordCandidates({
      homeroom: { className: '3', grade: '2', students: [student('s1', '김한결', 1)] },
      teachingClasses: [teachingClass('c1', '공국2', '국어', [tcStudent(1, '김한결')])],
    });
    expect(out).toHaveLength(2);
    expect(out.every((c) => c.contexts.length === 1)).toBe(true);
  });

  it('비활성 학생과 보관된 수업반은 새 기록 후보가 아니다', () => {
    const out = buildQuickRecordCandidates({
      homeroom: {
        className: '3',
        grade: '2',
        students: [
          student('s1', '전출학생', 1, { status: 'transferred' }),
          student('s2', '남은학생', 2),
        ],
      },
      teachingClasses: [
        teachingClass('c1', '2-5', '국어', [tcStudent(7, '이서준')], {
          archived: true,
          archivedAt: '2026-03-01T00:00:00.000Z',
        }),
      ],
    });
    expect(out.map((c) => c.name)).toEqual(['남은학생']);
  });

  it('번호 오름차순으로 정렬한다 — 배열 위치를 번호로 쓰지 않는다', () => {
    const out = buildQuickRecordCandidates({
      homeroom: {
        className: '3',
        grade: '2',
        students: [student('s1', '가', 12), student('s2', '나', 3)],
      },
      teachingClasses: [],
    });
    expect(out.map((c) => c.number)).toEqual([3, 12]);
  });
});

describe('filterQuickRecordCandidates', () => {
  const candidates = buildQuickRecordCandidates({
    homeroom: {
      className: '3',
      grade: '2',
      students: [student('s1', '김한결', 1), student('s2', '이서준', 12)],
    },
    teachingClasses: [],
  });

  it('이름 일부로 찾는다', () => {
    expect(filterQuickRecordCandidates(candidates, '서준').map((c) => c.name)).toEqual(['이서준']);
  });

  it('번호로 찾는다', () => {
    expect(filterQuickRecordCandidates(candidates, '12').map((c) => c.name)).toEqual(['이서준']);
  });

  it('빈 검색어는 전체를 돌려준다', () => {
    expect(filterQuickRecordCandidates(candidates, '  ')).toHaveLength(2);
  });
});

describe('sharedQuickRecordContexts', () => {
  const candidates = buildQuickRecordCandidates({
    homeroom: {
      className: '3',
      grade: '2',
      students: [student('s1', '김한결', 1), student('s2', '이서준', 2)],
    },
    teachingClasses: [
      teachingClass('c1', '2-3', '국어', [tcStudent(1, '김한결'), tcStudent(2, '이서준')]),
      teachingClass('c2', '2-5', '국어', [tcStudent(9, '박도윤', { grade: 2, classNum: 5 })]),
    ],
  });

  it('전원에게 있는 맥락만 남기고 학생별 저장 대상을 함께 준다', () => {
    const selected = candidates.filter((c) => c.name === '김한결' || c.name === '이서준');
    const shared = sharedQuickRecordContexts(selected);
    expect(shared.map((s) => s.contextId)).toEqual(['homeroom', 'c1']);
    expect(shared[0]!.members.map((m) => m.studentRef)).toEqual(['s1', 's2']);
    expect(shared[1]!.members.map((m) => m.studentRef)).toEqual(['1', '2']);
  });

  it('공통 맥락이 없으면 빈 배열이다', () => {
    const selected = candidates.filter((c) => c.name === '김한결' || c.name === '박도윤');
    expect(sharedQuickRecordContexts(selected)).toEqual([]);
  });

  it('선택이 없으면 빈 배열이다', () => {
    expect(sharedQuickRecordContexts([])).toEqual([]);
  });
});

describe('buildTodayRecordMarks', () => {
  const candidates = buildQuickRecordCandidates({
    homeroom: { className: '3', grade: '2', students: [student('s1', '김한결', 1)] },
    teachingClasses: [teachingClass('c1', '2-3', '국어', [tcStudent(1, '김한결')])],
  });
  const identity = candidates[0]!.identity;

  it('출결과 비출결을 구별한다', () => {
    const marks = buildTodayRecordMarks({
      candidates,
      homeroomRecords: [{ studentId: 's1', category: 'attendance', date: '2026-09-15' }],
      observationRecords: [],
      today: '2026-09-15',
    });
    expect(marks.get(identity)).toEqual({ attendance: true, note: false });
  });

  it('교과 관찰기록은 비출결 표시로 잡힌다', () => {
    const marks = buildTodayRecordMarks({
      candidates,
      homeroomRecords: [],
      observationRecords: [{ studentId: '1', classId: 'c1', date: '2026-09-15' }],
      today: '2026-09-15',
    });
    expect(marks.get(identity)).toEqual({ attendance: false, note: true });
  });

  it('다른 수업반의 관찰기록은 이 맥락으로 새어 들어오지 않는다', () => {
    const marks = buildTodayRecordMarks({
      candidates,
      homeroomRecords: [],
      observationRecords: [{ studentId: '1', classId: 'other', date: '2026-09-15' }],
      today: '2026-09-15',
    });
    expect(marks.has(identity)).toBe(false);
  });

  it('어제 기록은 오늘 표시가 아니다', () => {
    const marks = buildTodayRecordMarks({
      candidates,
      homeroomRecords: [{ studentId: 's1', category: 'life', date: '2026-09-14' }],
      observationRecords: [],
      today: '2026-09-15',
    });
    expect(marks.has(identity)).toBe(false);
  });
});

describe('splitTodayLessons', () => {
  const lesson = (
    period: number,
    start: number,
    end: number,
    classId: string | null,
  ): TodayLesson => ({
    period,
    subject: '국어',
    classroom: '2-3',
    classId,
    startMinutes: start,
    endMinutes: end,
  });
  const lessons = [lesson(1, 540, 590, 'c1'), lesson(3, 660, 710, 'c2'), lesson(5, 780, 830, 'c3')];

  it('수업 중이면 현재와 다음을 모두 준다', () => {
    const out = splitTodayLessons(lessons, 670);
    expect(out.current?.period).toBe(3);
    expect(out.next?.period).toBe(5);
    expect(out.rest.map((l) => l.period)).toEqual([1]);
  });

  it('쉬는 시간에는 현재가 없고 다음만 있다', () => {
    const out = splitTodayLessons(lessons, 600);
    expect(out.current).toBeNull();
    expect(out.next?.period).toBe(3);
    expect(out.rest.map((l) => l.period)).toEqual([1, 5]);
  });

  it('오늘 수업이 끝나면 현재도 다음도 없다', () => {
    const out = splitTodayLessons(lessons, 900);
    expect(out.current).toBeNull();
    expect(out.next).toBeNull();
    expect(out.rest).toHaveLength(3);
  });

  it('오늘 수업이 없으면 모두 비어 있다', () => {
    const out = splitTodayLessons([], 600);
    expect(out.current).toBeNull();
    expect(out.next).toBeNull();
    expect(out.rest).toEqual([]);
  });
});

describe('candidatesForClass', () => {
  it('그 수업반 맥락을 가진 학생만 남는다', () => {
    const candidates = buildQuickRecordCandidates({
      homeroom: { className: '9', grade: '2', students: [student('s1', '담임학생', 1)] },
      teachingClasses: [teachingClass('c1', '2-5', '국어', [tcStudent(7, '수업학생')])],
    });
    expect(candidatesForClass(candidates, 'c1').map((c) => c.name)).toEqual(['수업학생']);
  });
});
