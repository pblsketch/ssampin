/**
 * NEIS 전과목 성적 일람표 파서 (infrastructure) — xlsx 바이트 → 행렬 → 도메인 파싱.
 *
 * 계획서: docs/01-plan/features/grade-analysis.plan.md (§7.3, Phase 6 / Step 3)
 * exceljs로 첫 시트를 2차원 셀 배열로 변환한 뒤, 레이아웃 인식·파싱은 도메인 규칙
 * (neisTranscriptImportRules)에 위임한다. 학생 점수는 로컬에서만 처리(네트워크 전송 없음).
 */
import type { StudentTranscript } from '@domain/entities/ImportedTranscript';
import {
  detectTranscriptLayout,
  parseTranscriptRows,
  type TranscriptLayout,
} from '@domain/rules/neisTranscriptImportRules';
import { loadSheetGrid } from './sheetGrid';

export interface TranscriptExcelParseResult {
  readonly students: readonly StudentTranscript[];
  readonly layout: TranscriptLayout | null;
  /** 인식 실패 시 진단용 원본 행렬(상위 일부) */
  readonly rawRows: readonly (readonly unknown[])[];
  /** 감지/지정된 학기 표기 */
  readonly term: string;
}

/** 상위 행에서 "2026학년도 1학기" 류 학기 표기를 추출. 실패 시 null. */
function detectTerm(rows: readonly (readonly unknown[])[]): string | null {
  for (let r = 0; r < Math.min(5, rows.length); r += 1) {
    const row = rows[r];
    if (row === undefined) continue;
    for (const cell of row) {
      const s = String(cell ?? '');
      const m = s.match(/(\d{4})\s*학년도?.{0,6}?([1-2])\s*학기/);
      if (m) return `${m[1]} ${m[2]}학기`;
    }
  }
  return null;
}

/**
 * xlsx ArrayBuffer를 읽어 첫 시트를 전과목 일람표로 파싱한다.
 * term 미지정 시 시트 상단에서 학기 표기를 추론하고, 과목명이 비면 시트명을 대체로 쓴다.
 */
export async function parseTranscriptExcel(
  buffer: ArrayBuffer,
  options: { term?: string } = {},
): Promise<TranscriptExcelParseResult> {
  // .xlsx 우선, 실패 시 'HTML 표를 .xls로 저장'한 나이스 파일 폴백(sheetGrid가 처리).
  const { rows, sheetName } = await loadSheetGrid(buffer);
  if (rows.length === 0) {
    return { students: [], layout: null, rawRows: [], term: options.term ?? '' };
  }

  const term = options.term ?? detectTerm(rows) ?? '';
  const layout = detectTranscriptLayout(rows);
  const students = layout
    ? parseTranscriptRows(rows, layout, { term, fallbackSubject: sheetName })
    : [];

  return { students, layout, rawRows: rows.slice(0, 15), term };
}
