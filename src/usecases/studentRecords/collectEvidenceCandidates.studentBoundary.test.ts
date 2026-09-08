/**
 * 근거 후보의 **학생 경계** 회귀 테스트 (2026-09-08 검토 E).
 *
 * 재현 스크립트(`docs/03-analysis/student-number-audit-20260908.cjs`)는 "다른 반 3번 학생의 과제가
 * 이 학생 후보로 온다"를 확인했다. 여기서는 반대로 **오지 않는다**를 고정한다.
 */
import { describe, it, expect } from 'vitest';
import type { Assignment, Submission } from '@domain/entities/Assignment';
import {
  listEvidenceCandidates,
  type CollectEvidenceCandidatesInput,
} from './collectEvidenceCandidates';

const SUB: Submission = {
  id: 'sub-x',
  assignmentId: 'assignment-other',
  studentId: 'tc-class-other-1-1-3',
  studentNumber: 3,
  studentName: '가상다른반',
  studentGrade: '1',
  studentClass: '1',
  submittedAt: '2026-09-08T00:00:00Z',
  fileName: null,
  fileSize: 0,
  textContent: '다른 반 학생이 쓴 글',
  isLate: false,
};

const otherClassAssignment = {
  id: 'assignment-other',
  title: '다른 수업반 과제',
  target: {
    type: 'teaching',
    name: '다른 수업반',
    teachingClassId: 'class-other',
    students: [
      { id: 'tc-class-other-1-1-3', number: 3, name: '가상다른반', grade: 1, classNum: 1 },
    ],
  },
} as unknown as Assignment;

const myClassAssignment = {
  id: 'assignment-mine',
  title: '우리 수업반 과제',
  target: {
    type: 'teaching',
    name: '우리 수업반',
    teachingClassId: 'class-mine',
    students: [{ id: 'tc-class-mine-1-2-3', number: 3, name: '가상우리반', grade: 1, classNum: 2 }],
  },
} as unknown as Assignment;

function input(p: Partial<CollectEvidenceCandidatesInput> = {}): CollectEvidenceCandidatesInput {
  return {
    student: { studentRef: 'tc:class-mine:1-2-3', number: 3, studentKey: '1-2-3' },
    context: 'teaching',
    classId: 'class-mine',
    observations: [],
    studentRecords: [],
    rubrics: [],
    gradings: [],
    plans: [],
    performanceResults: [],
    semesterResults: [],
    attachments: [],
    submissions: [],
    assignments: [],
    storedSourceIds: new Set(),
    ...p,
  };
}

describe('E. 다른 학생 과제가 근거 후보로 오지 않는다', () => {
  it('다른 수업반 같은 번호(3번) 학생의 과제는 0건', () => {
    const out = listEvidenceCandidates(
      input({
        submissions: [{ studentId: SUB.studentId!, studentNumber: 3, submission: SUB }],
        assignments: [otherClassAssignment],
      }),
      'submission',
    );
    expect(out).toHaveLength(0);
  });

  it('같은 반 안이라도 소속(학년-반)이 다른 3번은 0건', () => {
    const mixed = {
      ...myClassAssignment,
      target: {
        ...myClassAssignment.target,
        students: [
          { id: 'tc-class-mine-1-9-3', number: 3, name: '가상섞인반', grade: 1, classNum: 9 },
        ],
      },
    } as unknown as Assignment;
    const out = listEvidenceCandidates(
      input({
        submissions: [
          {
            studentId: 'tc-class-mine-1-9-3',
            studentNumber: 3,
            submission: { ...SUB, id: 'sub-mixed', assignmentId: 'assignment-mine' },
          },
        ],
        assignments: [mixed],
      }),
      'submission',
    );
    expect(out).toHaveLength(0);
  });

  it('본인 과제는 그대로 후보로 나온다 — 과도 차단 방지', () => {
    const out = listEvidenceCandidates(
      input({
        submissions: [
          {
            studentId: 'tc-class-mine-1-2-3',
            studentNumber: 3,
            submission: {
              ...SUB,
              id: 'sub-mine',
              assignmentId: 'assignment-mine',
              studentId: 'tc-class-mine-1-2-3',
              studentClass: '2',
              textContent: '내가 쓴 글',
            },
          },
        ],
        assignments: [myClassAssignment],
      }),
      'submission',
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.content).toContain('내가 쓴 글');
  });

  it('과제 정보를 못 찾으면 추측하지 않고 0건', () => {
    const out = listEvidenceCandidates(
      input({
        submissions: [{ studentId: 'tc-class-mine-1-2-3', studentNumber: 3, submission: SUB }],
        assignments: [],
      }),
      'submission',
    );
    expect(out).toHaveLength(0);
  });

  it('담임 화면은 학생 id 로만 잇는다 — 번호가 같아도 다른 id 는 0건', () => {
    const homeroomAssignment = {
      id: 'assignment-homeroom',
      title: '담임 과제',
      target: {
        type: 'class',
        name: '우리 반',
        students: [{ id: 'student-b', number: 3, name: '가상나' }],
      },
    } as unknown as Assignment;
    const base = {
      ...input(),
      context: 'homeroom' as const,
      student: { studentRef: 'hr:student-a', number: 3, studentId: 'student-a' },
      assignments: [homeroomAssignment],
    };
    expect(
      listEvidenceCandidates(
        {
          ...base,
          submissions: [
            {
              studentId: 'student-b',
              studentNumber: 3,
              submission: { ...SUB, id: 'sub-b', assignmentId: 'assignment-homeroom' },
            },
          ],
        },
        'submission',
      ),
    ).toHaveLength(0);
    expect(
      listEvidenceCandidates(
        {
          ...base,
          submissions: [
            {
              studentId: 'student-a',
              studentNumber: 3,
              submission: { ...SUB, id: 'sub-a', assignmentId: 'assignment-homeroom' },
            },
          ],
        },
        'submission',
      ),
    ).toHaveLength(1);
  });
});
