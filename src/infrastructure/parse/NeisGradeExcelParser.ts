/**
 * 성적 엑셀 파서 (infrastructure) — xlsx 바이트 → 행렬 → 도메인 파싱.
 *
 * 계획서: docs/01-plan/features/grade-analysis.plan.md (§8.1)
 * exceljs로 워크북을 읽어 2차원 셀 배열로 변환한 뒤, 컬럼 자동 인식·파싱은
 * 도메인 규칙(gradeImportRules)에 위임한다. 학생 점수는 로컬에서만 처리한다.
 */
import {
  autoDetectColumns,
  parseScoreRows,
  type DetectedGradeColumns,
  type ParsedScoreRow,
} from '@domain/rules/gradeImportRules';
import { loadSheetGrid } from './sheetGrid';

export interface GradeExcelParseResult {
  readonly columns: DetectedGradeColumns | null;
  readonly records: readonly ParsedScoreRow[];
  /** 자동 인식 실패 시 수동 매핑용 원본 행렬(상위 일부) */
  readonly rawRows: readonly (readonly unknown[])[];
}

/** 파일 바이트를 읽어 첫 표를 2차원 배열로 변환하고 점수 행을 파싱한다(.xlsx + HTML .xls 폴백). */
export async function parseGradeExcel(buffer: ArrayBuffer): Promise<GradeExcelParseResult> {
  const { rows } = await loadSheetGrid(buffer);
  if (rows.length === 0) {
    return { columns: null, records: [], rawRows: [] };
  }

  const columns = autoDetectColumns(rows);
  const records = columns ? parseScoreRows(rows, columns) : [];
  return { columns, records, rawRows: rows.slice(0, 15) };
}
