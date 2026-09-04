/**
 * evidenceImport — 흩어진 데이터 → 근거 변환 + 점수 미포함 회귀 가드.
 *
 * 핵심 회귀(P2): 수행평가·성적의 점수/배점 숫자는 근거 본문에 절대 들어가면 안 된다
 * (근거는 get_record_evidence 로 AI 에 노출 → GradeAnalysis 제1원칙·브릿지 점수 제외 정책).
 */
import { describe, it, expect } from 'vitest';
import type { Submission, Assignment } from '@domain/entities/Assignment';
import type { ObservationAttachment } from '@domain/entities/ObservationAttachment';
import type { Rubric, RubricGrading } from '@domain/entities/Rubric';
import type {
  PerformanceAssessmentResult,
  AssessmentPlanItem,
} from '@domain/entities/GradeAnalysis';
import type { SemesterGradeResult } from '@domain/entities/GradeAnalysis';
import { hasProhibitedTerms } from '@domain/rules/prohibitedRecordTerms';
import {
  submissionToEvidence,
  attachmentToEvidence,
  rubricGradingToEvidence,
  gradeToEvidence,
  semesterGradeToEvidence,
} from './evidenceImport';

describe('submissionToEvidence', () => {
  const assignment = { id: 'a1', title: '독서 감상문' } as Assignment;
  const sub: Submission = {
    id: 'sub1',
    assignmentId: 'a1',
    studentNumber: 3,
    studentName: '홍길동',
    submittedAt: '2026-06-20T09:30:00Z',
    fileName: '감상문.pdf',
    fileSize: 482910,
    textContent: '책을 읽고 느낀 점을 정리했다',
    isLate: false,
  };

  it('텍스트 내용·파일명·과제 제목을 담고 파일 크기 숫자는 넣지 않는다', () => {
    const ev = submissionToEvidence(sub, assignment);
    expect(ev.sourceType).toBe('assignment');
    expect(ev.sourceId).toBe('sub1');
    expect(ev.date).toBe('2026-06-20');
    expect(ev.content).toContain('독서 감상문');
    expect(ev.content).toContain('책을 읽고');
    expect(ev.content).toContain('감상문.pdf');
    expect(ev.content).not.toContain('482910'); // 파일 크기 숫자 미포함
  });

  it('제출 **파일의 본문**이 실린다 — 첨부로 올렸을 때와 같은 대우(T5)', () => {
    const ev = submissionToEvidence(
      { ...sub, extractedText: '주제를 정한 까닭과 실험 과정을 적었다' },
      assignment,
    );
    expect(ev.content).toContain('주제를 정한 까닭과 실험 과정을 적었다');
    expect(ev.content).toContain('감상문.pdf'); // 파일명은 그대로
    expect(ev.content).not.toContain('본문 추출 안 됨');
  });

  it('지각 표시는 본문이 실려도 그대로 남는다', () => {
    const ev = submissionToEvidence(
      { ...sub, isLate: true, extractedText: '늦게 낸 보고서 본문' },
      assignment,
    );
    expect(ev.content).toContain('늦게 낸 보고서 본문');
    expect(ev.content).toContain('(지각 제출)');
  });

  it('사진 제출은 "추출 불가"를 남긴다 — 파일명만 남기면 아무도 이유를 모른다', () => {
    const ev = submissionToEvidence(
      { ...sub, fileName: '활동사진.jpg', extractedText: undefined },
      assignment,
    );
    expect(ev.content).toContain('활동사진.jpg');
    expect(ev.content).toContain('(사진 파일 — 본문 추출 불가)');
  });

  it('문서인데 본문을 못 뽑았으면 "본문 추출 안 됨"을 남긴다', () => {
    const ev = submissionToEvidence({ ...sub, extractedText: undefined }, assignment);
    expect(ev.content).toContain('(본문 추출 안 됨)');
  });

  it('텍스트만 낸 제출(파일 없음)에는 추출 관련 문구를 붙이지 않는다', () => {
    const ev = submissionToEvidence({ ...sub, fileName: null }, assignment);
    expect(ev.content).toContain('책을 읽고');
    expect(ev.content).not.toContain('본문 추출');
    expect(ev.content).not.toContain('제출 파일:');
  });

  it('기재 금지 항목이 **파일 본문**에 있어도 저장 관문이 잡는다(excludedFromAi 자동 표시)', () => {
    // 근거 저장(useRecordEvidenceStore.add/addMany)은 content 에 hasProhibitedTerms 를 태워
    // 걸리면 excludedFromAi:true 를 붙이고, 브릿지 get_record_evidence 가 그 근거를 내보내지
    // 않는다(ADR-072 결정 5). 본문이 content 에 실리므로 그 관문이 본문에도 그대로 적용된다.
    const clean = submissionToEvidence({ ...sub, extractedText: '실험 설계를 다시 고쳤다' });
    expect(hasProhibitedTerms(clean.content)).toBe(false);

    const dirty = submissionToEvidence({
      ...sub,
      extractedText: '교내 과학경진대회에서 최우수상을 받았다',
    });
    expect(hasProhibitedTerms(dirty.content)).toBe(true);
  });
});

describe('attachmentToEvidence', () => {
  it('출처 라벨·파일명·추출 원문을 담는다', () => {
    const att: ObservationAttachment = {
      id: 'att1',
      observationId: 'o1',
      fileName: '활동사진.jpg',
      mimeType: 'image/jpeg',
      kind: 'image',
      byteSize: 1234,
      storageRef: 'obs-attachments/att1.jpg',
      extractedText: '모둠 발표 장면',
      source: 'student',
      createdAt: '2026-06-18T01:00:00Z',
    };
    const ev = attachmentToEvidence(att);
    expect(ev.sourceType).toBe('attachment');
    expect(ev.content).toContain('학생 제출물');
    expect(ev.content).toContain('활동사진.jpg');
    expect(ev.content).toContain('모둠 발표 장면');
    expect(ev.content).not.toContain('1234'); // byteSize 숫자 미포함
  });
});

describe('rubricGradingToEvidence — 점수 미포함', () => {
  const rubric: Rubric = {
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
  const grading: RubricGrading = {
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

  it('수준 이름·설명·메모·총평을 담되 배점 숫자(10/5)는 절대 넣지 않는다', () => {
    const ev = rubricGradingToEvidence(grading, rubric);
    expect(ev.sourceType).toBe('evaluation');
    expect(ev.content).toContain('주장의 명확성');
    expect(ev.content).toContain('탁월함');
    expect(ev.content).toContain('근거가 풍부함');
    expect(ev.content).toContain('반론에 침착하게');
    expect(ev.content).toContain('논리적 사고가 돋보임');
    expect(ev.content).not.toContain('10'); // 배점 숫자 미포함
    expect(ev.content).not.toContain('5');
  });
});

describe('gradeToEvidence — 점수 미포함', () => {
  const plan = {
    id: 'p1',
    subject: '국어',
    title: '발표 수행',
    plannedAt: '2026-05-02',
  } as AssessmentPlanItem;

  it('교사 서술 메모만 담고 score 숫자는 절대 넣지 않는다', () => {
    const perf: PerformanceAssessmentResult = {
      id: 'pr1',
      assessmentId: 'p1',
      studentKey: '3-1-3',
      score: 97,
      evidenceNote: '발표 구성이 체계적이었음',
      memo: '목소리가 또렷함',
      confirmed: true,
    };
    const ev = gradeToEvidence(perf, plan);
    expect(ev.sourceType).toBe('evaluation');
    expect(ev.content).toContain('국어 발표 수행');
    expect(ev.content).toContain('발표 구성이 체계적');
    expect(ev.content).toContain('목소리가 또렷함');
    expect(ev.content).not.toContain('97'); // score 숫자 미포함
  });

  it('서술이 없으면 제목만(빈 점수 노출 없음)', () => {
    const perf: PerformanceAssessmentResult = {
      id: 'pr2',
      assessmentId: 'p1',
      studentKey: '3-1-4',
      score: 88,
      confirmed: false,
    };
    const ev = gradeToEvidence(perf, plan);
    expect(ev.content).not.toContain('88');
  });
});

describe('semesterGradeToEvidence — 성취도만, 점수 미포함', () => {
  const base: SemesterGradeResult = {
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

  it('성취도(A) 는 담되 원점수·환산점·석차·평균 숫자는 절대 넣지 않는다', () => {
    const ev = semesterGradeToEvidence(base, '국어');
    expect(ev).not.toBeNull();
    expect(ev!.sourceType).toBe('evaluation');
    expect(ev!.content).toContain('성취도 A');
    expect(ev!.content).toContain('국어');
    expect(ev!.content).not.toContain('91'); // rawScore
    expect(ev!.content).not.toContain('38'); // convertedScore
    expect(ev!.content).not.toContain('72'); // subjectAverage
    expect(ev!.content).not.toContain('4'); // rank
  });

  it('성취도가 없으면 null(빈/점수형 근거 방지)', () => {
    const { achievementLevel: _omit, ...noLevel } = base;
    expect(semesterGradeToEvidence(noLevel as SemesterGradeResult)).toBeNull();
  });

  it('숫자가 섞인 비정상 성취도 값은 오염으로 보고 null', () => {
    expect(semesterGradeToEvidence({ ...base, achievementLevel: '91점' })).toBeNull();
  });
});
