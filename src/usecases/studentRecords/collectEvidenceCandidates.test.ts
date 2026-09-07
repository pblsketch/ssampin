/**
 * collectEvidenceCandidates — 거울 카드 후보(설계서 record-evidence-board-v2 §4-1).
 *
 * 잠그는 것: 이미 저장된 sourceId 는 빠진다 · 다른 학생 것은 애초에 없다 · 날짜 내림차순(없는 것은 뒤) ·
 * 점수·석차 숫자는 본문에 없다(변환은 evidenceImport 가 보장하지만, 합쳐진 결과에서 한 번 더 본다).
 */
import { describe, it, expect } from 'vitest';
import type { ObservationRecord } from '@domain/entities/Observation';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import type { Rubric, RubricGrading } from '@domain/entities/Rubric';
import type {
  AssessmentPlanItem,
  PerformanceAssessmentResult,
  SemesterGradeResult,
} from '@domain/entities/GradeAnalysis';
import type { ObservationAttachment } from '@domain/entities/ObservationAttachment';
import type { Assignment, Submission } from '@domain/entities/Assignment';
import {
  collectEvidenceCandidates,
  listEvidenceCandidates,
  isMirrorEligibleStudentRecord,
  type CollectEvidenceCandidatesInput,
} from './collectEvidenceCandidates';

const obs = (
  p: Partial<ObservationRecord> & Pick<ObservationRecord, 'id' | 'studentId' | 'date'>,
): ObservationRecord => ({
  classId: 'c1',
  authorId: 't',
  content: `관찰 ${p.id}`,
  tags: ['개념 설명'],
  visibility: 'private',
  createdAt: 1,
  updatedAt: 1,
  ...p,
});

const RUBRIC: Rubric = {
  id: 'rb1',
  classId: 'c1',
  title: '토론 평가',
  criteria: [
    {
      id: 'cr1',
      name: '주장의 명확성',
      order: 0,
      levels: [
        { id: 'l1', name: '탁월함', score: 10, description: '근거가 풍부함' },
        { id: 'l2', name: '보통', score: 5 },
      ],
    },
  ],
  createdAt: '2026-03-01',
  updatedAt: '2026-03-01',
};

const GRADING: RubricGrading = {
  id: 'g1',
  rubricId: 'rb1',
  classId: 'c1',
  studentId: '3-1-3',
  status: 'graded',
  marks: { cr1: 'l1' },
  criterionNotes: { cr1: '반론에 침착하게 대응' },
  overallFeedback: '논리적 사고가 돋보임',
  gradedAt: '2026-06-10T00:00:00Z',
};

const PLAN = {
  id: 'p1',
  subject: '국어',
  title: '발표 수행',
  plannedAt: '2026-05-02',
} as AssessmentPlanItem;

const PERF: PerformanceAssessmentResult = {
  id: 'pr1',
  assessmentId: 'p1',
  studentKey: '3-1-3',
  score: 97,
  evidenceNote: '발표 구성이 체계적이었음',
  confirmed: true,
};

const SEMESTER: SemesterGradeResult = {
  id: 'sg1',
  teachingClassId: 'c1',
  semester: '1',
  studentKey: '3-1-3',
  convertedScore: 38,
  rawScore: 91,
  achievementLevel: 'A',
  rank: 4,
  subjectAverage: 72,
  confirmed: true,
};

const ATT: ObservationAttachment = {
  id: 'att1',
  observationId: 'o-A-old',
  fileName: '활동사진.jpg',
  mimeType: 'image/jpeg',
  kind: 'image',
  byteSize: 1234,
  storageRef: 'obs-attachments/att1.jpg',
  extractedText: '모둠 발표 장면',
  source: 'student',
  createdAt: '2026-06-01T01:00:00Z',
};

const ASSIGNMENT = { id: 'a1', title: '독서 감상문' } as Assignment;
const SUB: Submission = {
  id: 'sub1',
  assignmentId: 'a1',
  studentNumber: 3,
  studentName: '김지훈',
  submittedAt: '2026-06-20T09:30:00Z',
  fileName: '감상문.pdf',
  fileSize: 482910,
  textContent: '책을 읽고 느낀 점을 정리했다',
  isLate: false,
};

function input(p: Partial<CollectEvidenceCandidatesInput> = {}): CollectEvidenceCandidatesInput {
  return {
    student: { studentRef: 'tc:c1:3-1-3', number: 3, studentKey: '3-1-3' },
    context: 'teaching',
    classId: 'c1',
    observations: [
      obs({ id: 'o-A-new', studentId: '3-1-3', date: '2026-06-18' }),
      obs({ id: 'o-A-old', studentId: '3-1-3', date: '2026-06-01' }),
      obs({ id: 'o-B', studentId: '3-1-4', date: '2026-06-19', content: 'B학생 관찰' }),
      obs({ id: 'o-A-otherClass', studentId: '3-1-3', classId: 'c2', date: '2026-06-30' }),
    ],
    studentRecords: [],
    rubrics: [RUBRIC],
    gradings: [GRADING, { ...GRADING, id: 'g-B', studentId: '3-1-4' }],
    plans: [PLAN],
    performanceResults: [PERF, { ...PERF, id: 'pr-B', studentKey: '3-1-4' }],
    semesterResults: [SEMESTER, { ...SEMESTER, id: 'sg-B', studentKey: '3-1-4' }],
    attachments: [ATT],
    submissions: [
      { studentId: 's3', studentNumber: 3, submission: SUB },
      {
        studentId: 's4',
        studentNumber: 4,
        submission: { ...SUB, id: 'sub-B', studentNumber: 4, studentName: '박서연' },
      },
      { studentId: 's5', studentNumber: 5 },
    ],
    assignments: [ASSIGNMENT],
    storedSourceIds: new Set(),
    ...p,
  };
}

describe('collectEvidenceCandidates', () => {
  it('★이미 근거로 저장된 sourceId 는 후보에 없다', () => {
    const before = collectEvidenceCandidates(input());
    expect(before.map((c) => c.sourceId)).toContain('o-A-new');
    expect(before.map((c) => c.sourceId)).toContain('g1');

    const after = collectEvidenceCandidates(input({ storedSourceIds: new Set(['o-A-new', 'g1']) }));
    expect(after.map((c) => c.sourceId)).not.toContain('o-A-new');
    expect(after.map((c) => c.sourceId)).not.toContain('g1');
    expect(after).toHaveLength(before.length - 2);
  });

  it('★다른 학생 것은 0건 — 관찰·채점·성적·제출 어느 출처에서도 (다른 수업반의 같은 학생도 뺀다)', () => {
    const out = collectEvidenceCandidates(input());
    const ids = out.map((c) => c.sourceId);
    expect(ids).not.toContain('o-B');
    expect(ids).not.toContain('o-A-otherClass');
    expect(ids).not.toContain('g-B');
    expect(ids).not.toContain('pr-B');
    expect(ids).not.toContain('sg-B');
    expect(ids).not.toContain('sub-B');
    expect(out.map((c) => c.content).join('\n')).not.toContain('B학생');
    expect(out.map((c) => c.content).join('\n')).not.toContain('박서연');
    // 이 학생 것은 출처마다 들어 있다.
    expect(ids).toEqual(
      expect.arrayContaining(['o-A-new', 'o-A-old', 'g1', 'pr1', 'sg1', 'att1', 'sub1']),
    );
  });

  it('날짜 내림차순이고 날짜 없는 것은 뒤로 간다 — 같은 날짜는 출처·sourceId 순으로 고정', () => {
    const out = collectEvidenceCandidates(input());
    const dates = out.map((c) => c.date);
    const dated = dates.filter((d): d is string => d !== undefined);
    const undatedIdx = dates.findIndex((d) => d === undefined);
    // 날짜 있는 것이 먼저, 없는 것(성취도)이 맨 뒤.
    expect(undatedIdx).toBe(dated.length);
    expect(dates.slice(undatedIdx).every((d) => d === undefined)).toBe(true);
    expect([...dated].sort((a, b) => b.localeCompare(a))).toEqual(dated);
    expect(out[0]?.sourceId).toBe('sub1'); // 6/20
    expect(out[1]?.sourceId).toBe('o-A-new'); // 6/18
    // 같은 입력이면 같은 순서.
    expect(collectEvidenceCandidates(input()).map((c) => c.sourceId)).toEqual(
      out.map((c) => c.sourceId),
    );
  });

  it('★점수·석차·배점·파일 크기 숫자가 본문에 실리지 않는다', () => {
    const text = collectEvidenceCandidates(input())
      .map((c) => c.content)
      .join('\n');
    expect(text).toContain('성취도 A');
    expect(text).toContain('탁월함');
    for (const n of ['97', '91', '38', '72', '10', '482910', '1234']) {
      expect(text, `${n} 이 본문에 실렸다`).not.toContain(n);
    }
    expect(text).not.toMatch(/석차|rank/);
  });

  it('담임 컨텍스트는 누가기록·과제 제출만 본다(studentId 로 잇는다)', () => {
    const rec: StudentRecord = {
      id: 'sr1',
      studentId: 's3',
      category: '상담',
      subcategory: '학생상담',
      content: '진로 고민을 나눔',
      date: '2026-06-05',
      createdAt: '2026-06-05T00:00:00Z',
      slots: ['질문'],
    };
    const out = collectEvidenceCandidates(
      input({
        context: 'homeroom',
        student: { studentRef: 's3', number: 3, studentId: 's3' },
        studentRecords: [rec, { ...rec, id: 'sr-B', studentId: 's4' }],
      }),
    );
    expect(out.map((c) => c.sourceId)).toEqual(['sub1', 'sr1']);
    expect(out[1]).toMatchObject({ source: 'studentRecord', label: '학생상담', slots: ['질문'] });
  });

  it('listEvidenceCandidates 는 한 출처만, 저장 여부를 보지 않고 원본 순서대로 준다(가져오기 서랍용)', () => {
    const out = listEvidenceCandidates(input(), 'observation');
    expect(out.map((c) => c.sourceId)).toEqual(['o-A-new', 'o-A-old']);
    expect(out[0]).toMatchObject({
      source: 'observation',
      sourceType: 'observation',
      label: '개념 설명',
    });
  });
});

describe('isMirrorEligibleStudentRecord — 자동 거울 적격 (AC-17)', () => {
  it('★출결은 제외한다 — 지각·결석은 생기부 근거가 아니다', () => {
    expect(isMirrorEligibleStudentRecord({ category: 'attendance', content: '지각' })).toBe(false);
  });

  it('★공백 본문은 제외한다 — 담임은 분류만 저장하는 업무가 있다', () => {
    expect(isMirrorEligibleStudentRecord({ category: 'counseling', content: '   ' })).toBe(false);
    expect(isMirrorEligibleStudentRecord({ category: 'counseling', content: '' })).toBe(false);
  });

  it('본문이 있는 비출결 기록은 적격이다', () => {
    expect(isMirrorEligibleStudentRecord({ category: 'counseling', content: '상담함' })).toBe(true);
  });

  it('★장면을 안 골랐다고 제외하지 않는다', () => {
    // 슬롯 미선택은 제외 조건이 아니다(계획 §5.3).
    expect(isMirrorEligibleStudentRecord({ category: 'observation', content: '관찰' })).toBe(true);
  });
});
