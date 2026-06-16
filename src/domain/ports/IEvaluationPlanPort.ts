/**
 * 학교 평가 운영계획 불러오기 포트 — 도메인이 정의하고 infrastructure 가 구현한다.
 *
 * 계획서: docs/01-plan/features/evaluation-rubric-import.plan.md (§8)
 * 외부 통신(학교알리미 검색·목록·다운로드)은 electron main 에서만 일어나며,
 * 구현 어댑터(SchoolInfoEvaluationAdapter)가 electronAPI 를 통해 위임한다.
 * domain 레이어이므로 외부 타입을 import 하지 않는다.
 */
import type {
  EvaluationPlanDoc,
  EvaluationSchool,
  ParsedEvaluationPlan,
} from '../entities/EvaluationPlan';

export interface IEvaluationPlanPort {
  /** 학교명 전국 검색 → SHL_IDF_CD 확보(인증키 불필요). */
  searchSchools(name: string): Promise<readonly EvaluationSchool[]>;
  /** 연도별 평가계획 첨부파일 목록(없으면 빈 배열). */
  listDocs(
    shlIdfCd: string,
    schoolName: string,
    year: number,
  ): Promise<readonly EvaluationPlanDoc[]>;
  /** 특정 첨부파일 다운로드 + 파싱 + 평가영역 구조화. */
  downloadAndParse(
    shlIdfCd: string,
    schoolName: string,
    year: number,
    doc: EvaluationPlanDoc,
  ): Promise<ParsedEvaluationPlan>;
}
