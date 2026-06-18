/**
 * 성적 엑셀 파서 (infrastructure) — xlsx 바이트 → 행렬 → 도메인 파싱.
 *
 * 계획서: docs/01-plan/features/grade-analysis.plan.md (§8.1)
 * exceljs로 워크북을 읽어 2차원 셀 배열로 변환한 뒤, 컬럼 자동 인식·파싱은
 * 도메인 규칙(gradeImportRules)에 위임한다. 학생 점수는 로컬에서만 처리한다.
 */
import ExcelJS from 'exceljs';
import {
  autoDetectColumns,
  parseScoreRows,
  type DetectedGradeColumns,
  type ParsedScoreRow,
} from '@domain/rules/gradeImportRules';

export interface GradeExcelParseResult {
  readonly columns: DetectedGradeColumns | null;
  readonly records: readonly ParsedScoreRow[];
  /** 자동 인식 실패 시 수동 매핑용 원본 행렬(상위 일부) */
  readonly rawRows: readonly (readonly unknown[])[];
}

/** exceljs 셀 값(서식·수식·리치텍스트)을 원시값으로 정규화. */
function cellValue(value: unknown): unknown {
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if ('result' in obj) return obj.result;
    if ('text' in obj) return obj.text;
    if (Array.isArray(obj.richText)) {
      return obj.richText.map((part) => String((part as { text?: unknown }).text ?? '')).join('');
    }
  }
  return value;
}

/** xlsx ArrayBuffer를 읽어 첫 시트를 2차원 배열로 변환하고 점수 행을 파싱한다. */
export async function parseGradeExcel(buffer: ArrayBuffer): Promise<GradeExcelParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const ws = workbook.worksheets[0];
  if (ws === undefined) {
    return { columns: null, records: [], rawRows: [] };
  }

  const rows: unknown[][] = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const values = Array.isArray(row.values) ? row.values : [];
    // exceljs의 row.values는 1-based(인덱스 0은 비어 있음) → 0-based로 정규화
    rows.push(values.slice(1).map((v) => cellValue(v)));
  });

  const columns = autoDetectColumns(rows);
  const records = columns ? parseScoreRows(rows, columns) : [];
  return { columns, records, rawRows: rows.slice(0, 15) };
}
