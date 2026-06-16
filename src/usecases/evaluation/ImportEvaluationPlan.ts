/**
 * 평가 운영계획 불러오기 유스케이스 — 학교 검색 → 목록 → 다운로드/파싱 흐름을 포트에 위임한다.
 *
 * 계획서: docs/01-plan/features/evaluation-rubric-import.plan.md (§7 usecases, §5 데이터 흐름)
 * 루브릭 초안화(planToRubricDraft)는 순수 도메인 서비스라 컴포넌트가 직접 호출한다
 * (기존 rubricRules 직접 사용 패턴과 동일).
 */
import type { IEvaluationPlanPort } from '@domain/ports/IEvaluationPlanPort';
import type {
  EvaluationPlanDoc,
  EvaluationSchool,
  ParsedEvaluationPlan,
} from '@domain/entities/EvaluationPlan';

export class ImportEvaluationPlan {
  constructor(private readonly port: IEvaluationPlanPort) {}

  searchSchools(name: string): Promise<readonly EvaluationSchool[]> {
    return this.port.searchSchools(name);
  }

  listDocs(
    shlIdfCd: string,
    schoolName: string,
    year: number,
  ): Promise<readonly EvaluationPlanDoc[]> {
    return this.port.listDocs(shlIdfCd, schoolName, year);
  }

  downloadAndParse(
    shlIdfCd: string,
    schoolName: string,
    year: number,
    doc: EvaluationPlanDoc,
    schoolKind?: string,
  ): Promise<ParsedEvaluationPlan> {
    return this.port.downloadAndParse(shlIdfCd, schoolName, year, doc, schoolKind);
  }
}
