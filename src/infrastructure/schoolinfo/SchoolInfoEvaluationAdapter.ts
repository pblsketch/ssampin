/**
 * IEvaluationPlanPort 구현 — 실제 통신/파싱은 Electron 메인 프로세스(safeFetch + kordoc)에
 * IPC로 위임하고, 파싱된 markdown 을 순수 도메인 파서(parseEvaluationPlan)로 구조화한다.
 *
 * 파일 경로·원본 bytes·downloadParams 는 메인이 보유하고 renderer 로 넘기지 않는다.
 * 데스크톱 앱이 아니면(브라우저) 사용 불가 — 명확한 안내 에러.
 */
import type { IEvaluationPlanPort } from '@domain/ports/IEvaluationPlanPort';
import type {
  EvaluationPlanDoc,
  EvaluationSchool,
  ParsedEvaluationPlan,
} from '@domain/entities/EvaluationPlan';
import { parseEvaluationPlan } from '@domain/services/evaluationTableParser';
import { parseScoringRubrics } from '@domain/services/scoringRubricParser';
import { gradesToCandidates } from '@domain/services/evaluationPlanMapping';

function api() {
  const e = typeof window !== 'undefined' ? window.electronAPI?.schoolinfoEvaluation : undefined;
  if (!e) {
    throw new Error('이 기능은 쌤핀 데스크톱 앱에서만 사용할 수 있어요.');
  }
  return e;
}

export class SchoolInfoEvaluationAdapter implements IEvaluationPlanPort {
  async searchSchools(name: string): Promise<readonly EvaluationSchool[]> {
    const r = await api().searchSchools(name);
    if (r.status === 'error') throw new Error(r.message || '학교 검색에 실패했어요.');
    return r.hits;
  }

  async listDocs(
    shlIdfCd: string,
    schoolName: string,
    year: number,
  ): Promise<readonly EvaluationPlanDoc[]> {
    const r = await api().listDocs({ shlIdfCd, schoolName, year });
    if (r.status === 'error') throw new Error(r.message || '평가계획 목록을 불러오지 못했어요.');
    return r.docs;
  }

  async downloadAndParse(
    shlIdfCd: string,
    schoolName: string,
    year: number,
    doc: EvaluationPlanDoc,
    schoolKind?: string,
  ): Promise<ParsedEvaluationPlan> {
    const r = await api().downloadDoc({ shlIdfCd, schoolName, year, seq: doc.seq });
    if (r.status === 'error') throw new Error(r.message || '파일을 불러오지 못했어요.');
    const filename = r.fileName || doc.filename;
    // 중·고는 1~3학년, 그 외(초/특수 등)는 1~6학년으로 학년 상한 클램프
    const maxGrade = schoolKind === '중학교' || schoolKind === '고등학교' ? 3 : 6;

    // 1순위: 채점기준표(=루브릭, 점수 포함). 없으면 단순 평가영역 목록을 후보로 변환.
    const scoringCandidates = parseScoringRubrics(r.markdown, { filename, maxGrade });
    let candidates = scoringCandidates;
    let grades: ParsedEvaluationPlan['grades'] = [];
    let isSingleSubject = false;
    if (candidates.length === 0) {
      const simple = parseEvaluationPlan(r.markdown, { filename, maxGrade });
      grades = simple.grades;
      isSingleSubject = simple.isSingleSubject;
      candidates = gradesToCandidates(simple.grades);
    }

    return {
      filename,
      markdown: r.markdown,
      candidates,
      grades,
      isSingleSubject,
      needsOcr: r.needsOcr,
    };
  }
}
