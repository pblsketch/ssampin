/**
 * 스프레드시트 바이트 → 2차원 격자 로더 (infrastructure).
 *
 * 1순위: exceljs로 진짜 .xlsx(zip 기반)를 읽는다.
 * 2순위: 실패하면(나이스가 흔히 주는 'HTML 표를 .xls로 저장'한 파일 등) HTML 표 파싱으로 복원.
 * 둘 다 아니면(진짜 바이너리 .xls 등) 원래 오류를 그대로 던져 상위에서 안내한다.
 *
 * 격자만 만들고, 레이아웃 인식·파싱은 도메인 규칙에 위임한다(neis*ImportRules).
 */
import ExcelJS from 'exceljs';
import { decodeSheetBytes, looksLikeHtmlTable, parseHtmlTableToGrid } from './htmlTableGrid';

export interface SheetGrid {
  /** 0-based 2차원 셀 배열(상위 행부터). */
  readonly rows: unknown[][];
  /** 시트명(.xlsx만 존재, HTML 폴백은 빈 문자열). 단일 과목 시트의 대체 과목명 등에 쓰임. */
  readonly sheetName: string;
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

/**
 * 파일 바이트를 격자로 변환한다. .xlsx 우선, 실패 시 HTML 표 폴백.
 * 빈 워크북이면 rows=[] 를 돌려준다. 두 방식 모두 실패하면 throw(상위 catch에서 안내).
 */
export async function loadSheetGrid(buffer: ArrayBuffer): Promise<SheetGrid> {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const ws = workbook.worksheets[0];
    if (ws === undefined) return { rows: [], sheetName: '' };

    const rows: unknown[][] = [];
    ws.eachRow({ includeEmpty: true }, (row) => {
      const values = Array.isArray(row.values) ? row.values : [];
      // exceljs의 row.values는 1-based(인덱스 0은 비어 있음) → 0-based로 정규화
      rows.push(values.slice(1).map((v) => cellValue(v)));
    });
    return { rows, sheetName: ws.name };
  } catch (err) {
    // .xlsx(zip)가 아니면 나이스가 흔히 주는 'HTML 표를 .xls로 저장'한 파일일 수 있음 → 표 파싱 시도.
    const text = decodeSheetBytes(buffer);
    if (looksLikeHtmlTable(text)) {
      const rows = parseHtmlTableToGrid(text);
      if (rows.length > 0) return { rows, sheetName: '' };
    }
    throw err; // 진짜 못 읽는 형식(바이너리 .xls 등)은 그대로 상위에서 처리
  }
}
