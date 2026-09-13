/**
 * NEIS 전과목 성적 일람표 파서 (infrastructure) — xlsx 바이트 → 행렬 → 도메인 파싱.
 *
 * 계획서: docs/01-plan/features/grade-analysis.plan.md (§7.3, Phase 6 / Step 3)
 * 성적 시트를 찾아 셀 배열로 변환한 뒤, 한 행/여러 행 인식·파싱은 도메인 규칙에
 * 위임한다. 학생 점수는 로컬에서만 처리(네트워크 전송 없음).
 */
import type { StudentTranscript } from '@domain/entities/ImportedTranscript';
import {
  detectTranscriptLayout,
  parseTranscriptRows,
  type TranscriptLayout,
} from '@domain/rules/neisTranscriptImportRules';
import { loadSheetGrids } from './sheetGrid';
import {
  detectTranscriptLedgerLayouts,
  parseTranscriptLedger,
  mergeTranscriptStudents,
  TranscriptConflictError,
  type TranscriptLedgerLayout,
} from '@domain/rules/neisTranscriptLedgerRules';

export interface TranscriptExcelParseResult {
  readonly students: readonly StudentTranscript[];
  readonly layout: TranscriptLayout | TranscriptLedgerLayout | null;
  readonly problem?: string;
  readonly sheetName?: string;
  readonly classLabel?: string;
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
 * 성적 시트가 하나인 파일을 전과목 일람표로 파싱한다.
 * term 미지정 시 시트 상단에서 학기 표기를 추론하고, 과목명이 비면 시트명을 대체로 쓴다.
 */
export async function parseTranscriptExcel(
  buffer: ArrayBuffer,
  options: { term?: string } = {},
): Promise<TranscriptExcelParseResult> {
  // .xlsx 우선, 실패 시 'HTML 표를 .xls로 저장'한 나이스 파일 폴백(sheetGrid가 처리).
  const sheets = await loadSheetGrids(buffer);
  const candidates = sheets
    .map(({ rows, sheetName }) => {
      const ledgers = detectTranscriptLedgerLayouts(rows);
      const layout = ledgers[0] ?? detectTranscriptLayout(rows);
      return { rows, sheetName, ledgers, layout };
    })
    .filter(({ layout }) => layout !== null);
  const empty = { students: [], layout: null, rawRows: [], term: options.term ?? '' };
  if (candidates.length > 1)
    return {
      ...empty,
      problem:
        '성적이 있는 시트가 여러 개예요. 가져올 한 학급·한 학기 시트만 새 엑셀 파일로 저장해 주세요.',
    };
  const candidate = candidates[0];
  if (!candidate) return { ...empty, rawRows: sheets[0]?.rows.slice(0, 15) ?? [] };
  const { rows, sheetName, ledgers, layout } = candidate;
  const term = options.term ?? detectTerm(rows) ?? '';
  const classes = new Set<string>();
  const terms = new Set<string>();
  for (const row of rows) {
    const line = row.map((cell) => String(cell ?? '')).join(' ');
    for (const m of line.matchAll(/(\d+)\s*학년\s*(\d+)\s*반/g))
      classes.add(`${m[1]}학년 ${m[2]}반`);
    for (const m of line.matchAll(/(\d{4})\s*학년도?.{0,6}?([12])\s*학기/g))
      terms.add(`${m[1]} ${m[2]}학기`);
  }
  const result = {
    layout,
    rawRows: rows.slice(0, 15),
    term: term || [...terms][0] || '',
    sheetName,
    classLabel: [...classes][0],
  };
  if (classes.size > 1 || terms.size > 1)
    return {
      ...result,
      students: [],
      problem: '여러 학급 또는 학기 자료가 한 시트에 있어요. 한 학급·한 학기 자료만 가져와 주세요.',
    };
  try {
    const students = ledgers.length
      ? parseTranscriptLedger(rows, ledgers, result.term)
      : mergeTranscriptStudents(
          parseTranscriptRows(rows, layout as TranscriptLayout, {
            term: result.term,
            fallbackSubject: sheetName,
          }),
        );
    return { ...result, students };
  } catch (error) {
    if (error instanceof TranscriptConflictError)
      return { ...result, students: [], problem: error.message };
    throw error;
  }
}
