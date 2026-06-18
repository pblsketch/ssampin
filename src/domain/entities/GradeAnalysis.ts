/**
 * 성적 분석 — 도메인 엔티티.
 *
 * 계획서: docs/01-plan/features/grade-analysis.plan.md (§4.1)
 * 제1원칙: 학생 점수는 로컬 전용(네트워크 전송 0). 이 엔티티는 외부 의존성 0.
 *
 * 설계 결정:
 * - 지필(정기시험)과 수행평가를 별도 결과 타입으로 분리한다(혼동·자동확정 방지).
 * - 결시/인정점은 코드+수동 입력으로만 다룬다(자동 산출 금지).
 * - 산출 결과(SemesterGradeResult)는 '미확정/확정'을 분리한다.
 */

/** 평가 종류 — 지필(정기시험) / 수행평가. */
export type AssessmentKind = 'written-exam' | 'performance';

/** 평가 항목 상태. */
export type AssessmentStatus = 'draft' | 'confirmed' | 'archived';

/** 결시 코드 — 없음/결시/인정/면제. */
export type AbsenceCode = 'none' | 'absent' | 'recognized' | 'exempt';

/** 평가 계획 1건(교과 수업반 스코프). */
export interface AssessmentPlanItem {
  readonly id: string;
  /** 소속 교과 수업반 (TeachingClass.id) */
  readonly teachingClassId: string;
  readonly semester: '1' | '2';
  readonly subject: string;
  readonly title: string;
  readonly kind: AssessmentKind;
  /** 평가 영역명 */
  readonly areaName: string;
  /** 평가 방법(선택) */
  readonly method?: string;
  readonly fullScore: number;
  /** 반영비율(%) */
  readonly weightPercent: number;
  /** 실시 예정일(선택) */
  readonly plannedAt?: string;
  readonly source: 'manual' | 'schoolinfo-draft' | 'schoolinfo-confirmed';
  readonly status: AssessmentStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** 지필(정기시험) 학생별 결과. */
export interface WrittenExamResult {
  readonly id: string;
  readonly assessmentId: string;
  readonly studentKey: string;
  readonly score: number | null;
  readonly absenceCode?: AbsenceCode;
  /** 인정점(수동 입력) */
  readonly recognizedScore?: number;
  readonly confirmed: boolean;
  readonly memo?: string;
}

/** 수행평가 학생별 결과(루브릭/과제 증거는 ID 참조만). */
export interface PerformanceAssessmentResult {
  readonly id: string;
  readonly assessmentId: string;
  readonly studentKey: string;
  readonly score: number | null;
  /** 기존 RubricGrading 참조(증거) */
  readonly rubricGradingId?: string;
  /** 기존 Assignment 참조(증거) */
  readonly assignmentId?: string;
  readonly submissionId?: string;
  readonly evidenceNote?: string;
  readonly confirmed: boolean;
  readonly memo?: string;
}

/** 학기 성적 산출 결과(미확정/확정 분리). */
export interface SemesterGradeResult {
  readonly id: string;
  readonly teachingClassId: string;
  readonly semester: '1' | '2';
  readonly studentKey: string;
  /** 환산점 합계 */
  readonly convertedScore: number;
  /** 원점수 */
  readonly rawScore: number;
  /** 성취도(추정, gradeStandardRules 산출) */
  readonly achievementLevel?: string;
  /** 석차등급(추정, 석차제 과목만) */
  readonly rank?: number;
  readonly subjectAverage?: number;
  readonly confirmed: boolean;
}

/** 로컬 JSON 저장 단위('grade-analysis' 키). */
export interface GradeAnalysisData {
  readonly plans: readonly AssessmentPlanItem[];
  readonly writtenResults: readonly WrittenExamResult[];
  readonly performanceResults: readonly PerformanceAssessmentResult[];
  readonly semesterResults: readonly SemesterGradeResult[];
}
