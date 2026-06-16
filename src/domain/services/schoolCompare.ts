/**
 * 같은 시·군·구·학교급 학교들의 핵심 지표를 비교표로 정리 — 순수 도메인.
 * 학년별·학급별 학생수(apiType 09) 응답 list 를 입력으로 받는다(추가 네트워크 호출 없음).
 */
import { isSameSchoolName } from './schoolIdentify';

export interface SchoolCompareRow {
  readonly schoolName: string;
  readonly isOurs: boolean;
  readonly studentsTotal: number | null;
  readonly classesTotal: number | null;
  readonly studentsPerClass: number | null;
  readonly teachers: number | null;
  readonly studentsPerTeacher: number | null;
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * 09(학년별·학급별 학생수) 지역 list → 학교별 비교 행.
 * 컬럼: COL_S_SUM(총학생수)·COL_C_SUM(총학급수)·COL_SUM(학급당 인원)·TEACH_CNT(교원수)·TEACH_CAL(교원1인당).
 * 학생수 내림차순 정렬, 빈 학교명 제외.
 */
export function buildSchoolComparison(
  rows: readonly Record<string, unknown>[],
  ourSchoolName: string,
): SchoolCompareRow[] {
  return rows
    .map((r) => ({
      schoolName: String(r.SCHUL_NM ?? '').trim(),
      isOurs: isSameSchoolName(String(r.SCHUL_NM ?? ''), ourSchoolName),
      studentsTotal: num(r.COL_S_SUM),
      classesTotal: num(r.COL_C_SUM),
      studentsPerClass: num(r.COL_SUM),
      teachers: num(r.TEACH_CNT),
      studentsPerTeacher: num(r.TEACH_CAL),
    }))
    .filter((x) => x.schoolName.length > 0)
    .sort((a, b) => (b.studentsTotal ?? 0) - (a.studentsTotal ?? 0));
}
