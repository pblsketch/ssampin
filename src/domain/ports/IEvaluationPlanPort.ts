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
  /** 연도별 첨부파일 목록(없으면 빈 배열). item 으로 평가계획/편제표(교육과정 편성·운영) 구분. */
  listDocs(
    shlIdfCd: string,
    schoolName: string,
    year: number,
    item?: 'evaluation' | 'curriculum',
  ): Promise<readonly EvaluationPlanDoc[]>;
  /** 특정 첨부파일 다운로드 + 파싱 + 평가영역 구조화. schoolKind 로 학년 상한을 정한다. */
  downloadAndParse(
    shlIdfCd: string,
    schoolName: string,
    year: number,
    doc: EvaluationPlanDoc,
    schoolKind?: string,
  ): Promise<ParsedEvaluationPlan>;
  /** 편제표 등 비평가 항목: 다운로드 + 마크다운(HTML 표) 반환(구조화 안 함). */
  downloadCurriculumDoc(
    shlIdfCd: string,
    schoolName: string,
    year: number,
    doc: EvaluationPlanDoc,
  ): Promise<{ filename: string; markdown: string; needsOcr: boolean }>;
}
