/**
 * 담임 학급 성적(전과목) — NEIS 산출 자료 import 결과. 도메인 엔티티.
 *
 * 계획서: docs/01-plan/features/grade-analysis.plan.md (§4.1, §7.3)
 * - 담임은 타 교과 점수를 직접 가질 수 없어 NEIS 산출물(성적일람표/교과학습발달상황)을
 *   수기 import해 채운다. 학생 점수는 로컬 전용(네트워크 전송 없음).
 * - import한 성취도/석차등급은 기관 산출값을 그대로 보관한다(자체 재계산 금지).
 */

/** 과목 계열. */
export type SubjectCategory = '국어' | '수학' | '영어' | '사회' | '과학' | '기타';

/** 학생 한 명의 한 과목 성적 행(기관 산출값). */
export interface TranscriptSubjectRow {
  readonly subject: string;
  readonly category: SubjectCategory;
  readonly rawScore?: number;
  readonly subjectMean?: number;
  readonly stdDev?: number;
  /** 성취도 A~E (기관 산출값) */
  readonly achievement?: string;
  readonly rank?: number;
  readonly tieCount?: number;
  readonly totalStudents?: number;
  /** 석차등급 (기관 산출값) */
  readonly rankGrade?: number;
}

/** 학생 한 명의 전과목 성적(특정 학기). */
export interface StudentTranscript {
  readonly studentKey: string;
  /** 담임 화면 표시용 — 로컬 전용 */
  readonly studentName: string;
  readonly term: string;
  readonly subjects: readonly TranscriptSubjectRow[];
}

/** 담임 학급 전과목 성적 저장 단위(로컬 JSON). */
export interface ImportedTranscriptData {
  readonly students: readonly StudentTranscript[];
}
