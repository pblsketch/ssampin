import type { GradeAnalysisData } from '../entities/GradeAnalysis';

/**
 * 성적 분석 데이터 저장소 (로컬 JSON 'grade-analysis' 키).
 * 학생 점수는 로컬 전용 — 클라우드 동기화(syncRegistry) 대상에 넣지 않는다.
 */
export interface IGradeAnalysisRepository {
  load(): Promise<GradeAnalysisData | null>;
  save(data: GradeAnalysisData): Promise<void>;
}
