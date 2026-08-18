/**
 * 근거 자료 일괄 등록용 엑셀 — 양식 생성 + 업로드 파싱.
 *
 * 설계: 엑셀에는 "관찰 내용"만 받고, 생기부 유형 분류는 업로드 후 앱(미분류 탭 인라인 토글)에서 한다.
 * 오매칭 방지: 숨김 "식별키" 열에 studentRef 를 미리 채워 정확히 연결한다(없으면 번호/성명 폴백).
 * 한 칸 안에서 줄바꿈하면 줄마다 별도 근거로 분리한다(매핑 단계에서 처리).
 *
 * exceljs 사용 패턴은 ExcelExporter.ts(exportRosterToExcel/parseRosterFromExcel)와 동일.
 */
import ExcelJS from 'exceljs';
import JSZip from 'jszip';

/** 업로드 엑셀 읽기 실패 종류 — UI 메시지 분기용. */
export type ExcelReadErrorKind = 'not-xlsx' | 'unreadable';

/**
 * 업로드 엑셀을 exceljs 로 읽지 못했을 때의 분류된 오류.
 * - `not-xlsx`: zip(=xlsx) 구조 자체가 아님(구형 .xls·CSV·HTML·잘린 파일 등).
 * - `unreadable`: zip 은 맞지만 살균 후에도 exceljs 가 읽지 못함(원인 불명).
 */
export class ExcelReadError extends Error {
  readonly kind: ExcelReadErrorKind;
  constructor(kind: ExcelReadErrorKind, cause?: unknown) {
    super(kind === 'not-xlsx' ? 'NOT_XLSX' : 'UNREADABLE');
    this.name = 'ExcelReadError';
    this.kind = kind;
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

// XML 1.0 이 허용하지 않는 제어문자(탭 \x09·줄바꿈 \x0A·CR \x0D 는 보존).
// HWP·PDF·웹에서 복사한 텍스트를 셀에 붙여넣으면 흔히 섞여 들어오며, 셀 값으로는
// 보이지 않지만 저장 시 일부 앱은 원시 문자로 기록 → exceljs(saxes)가 "disallowed character"로 거부한다.
// eslint-disable-next-line no-control-regex
const ILLEGAL_XML_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;

/**
 * 업로드 버퍼를 워크북으로 적재 — 1차 직접 시도, 실패 시 XML 내 불법 제어문자를
 * 제거하고 재시도한다. zip 구조 자체가 깨졌으면 살균이 불가능하므로 분류된 오류를 던진다.
 *
 * 설계 근거: 정상 파일은 1차에서 그대로 통과(추가 비용 0). 실패 경로에서만 JSZip 으로
 * 풀어 .xml 파트의 불법 문자를 지운 뒤 재적재하므로, '붙여넣기 때 섞인 제어문자' 때문에
 * 업로드가 통째로 실패하던 문제를 사용자 개입 없이 복구한다.
 */
async function loadEvidenceWorkbook(buffer: ArrayBuffer): Promise<ExcelJS.Workbook> {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    return workbook;
  } catch (firstErr) {
    // zip 으로조차 풀리지 않으면 xlsx 가 아님(구형 .xls·CSV·HTML·손상 파일).
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(buffer);
    } catch {
      throw new ExcelReadError('not-xlsx', firstErr);
    }
    // 모든 xml 파트에서 불법 제어문자 제거.
    let sanitizedAny = false;
    for (const name of Object.keys(zip.files)) {
      if (!name.endsWith('.xml')) continue;
      const entry = zip.file(name);
      if (!entry) continue;
      const xml = await entry.async('string');
      const cleaned = xml.replace(ILLEGAL_XML_CHARS, '');
      if (cleaned !== xml) {
        zip.file(name, cleaned);
        sanitizedAny = true;
      }
    }
    if (!sanitizedAny) {
      // 불법 문자 문제가 아니었음 — 살균으로 고칠 수 없는 원인.
      throw new ExcelReadError('unreadable', firstErr);
    }
    const repaired = await zip.generateAsync({ type: 'arraybuffer' });
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(repaired);
      return workbook;
    } catch (secondErr) {
      throw new ExcelReadError('unreadable', secondErr);
    }
  }
}

/** 양식에 미리 채울 학생(식별키 = studentRef). */
export interface EvidenceTemplateStudent {
  readonly studentRef: string;
  readonly number: number;
  readonly name: string;
}

/** 업로드 엑셀에서 파싱한 한 행(헤더 제외). content 는 줄바꿈 포함 원문. */
export interface ParsedEvidenceRow {
  readonly rowNumber: number;
  readonly studentRef?: string;
  readonly studentNumber?: number;
  readonly name?: string;
  readonly date?: string;
  readonly content: string;
}

const THIN = { style: 'thin' as const };
const BORDER = { top: THIN, bottom: THIN, left: THIN, right: THIN };

function styleHeader(cell: ExcelJS.Cell): void {
  cell.font = { bold: true };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
  cell.border = BORDER;
}

function styleCell(cell: ExcelJS.Cell): void {
  cell.border = BORDER;
  cell.alignment = { vertical: 'top', wrapText: true };
}

export async function exportEvidenceTemplateToExcel(
  students: readonly EvidenceTemplateStudent[],
  className?: string,
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('근거 입력');

  const header = ws.addRow(['식별키', '번호', '성명', '날짜', '관찰 내용']);
  header.eachCell((cell) => styleHeader(cell));
  ws.getColumn(1).hidden = true; // 식별키(studentRef) — 교사에게 숨김, 수정 금지
  ws.getColumn(1).width = 28;
  ws.getColumn(2).width = 8;
  ws.getColumn(3).width = 14;
  ws.getColumn(4).width = 14;
  ws.getColumn(5).width = 80;

  const sorted = [...students].sort((a, b) => a.number - b.number);
  for (const s of sorted) {
    const row = ws.addRow([s.studentRef, String(s.number).padStart(2, '0'), s.name, '', '']);
    row.eachCell((cell) => styleCell(cell));
  }

  // 안내 시트
  const guide = workbook.addWorksheet('작성 안내');
  const title = guide.addRow([`${className ? `${className} ` : ''}근거 자료 일괄 등록 양식`]);
  title.getCell(1).font = { bold: true, size: 14 };
  guide.addRow([]);
  const sectionRow = guide.addRow(['항목', '설명']);
  sectionRow.eachCell((cell) => styleHeader(cell));
  const instructions: string[][] = [
    [
      '번호 · 성명',
      '학생 명단이 미리 채워져 있습니다. 빈 칸으로 두면 그 학생은 등록되지 않습니다.',
    ],
    ['식별키(숨김 열)', '학생을 정확히 연결하는 코드입니다. 절대 수정·삭제하지 마세요.'],
    ['날짜', '선택 입력. YYYY-MM-DD 형식 (예: 2026-06-24). 비워도 됩니다.'],
    [
      '관찰 내용',
      '그 학생의 관찰·활동·사실을 적으세요. 한 칸 안에서 줄바꿈(Alt+Enter)하면 줄마다 별도 근거로 등록됩니다.',
    ],
    [
      '유형 분류',
      '자율·진로·행동특성 등 생기부 유형은 엑셀에 적지 않습니다. 업로드 후 쌤핀 "미분류"에서 클릭으로 지정하세요.',
    ],
    ['주의', '점수·석차 숫자는 적지 마세요(AI 노출 방지).'],
  ];
  for (const [k, v] of instructions) {
    const r = guide.addRow([k, v]);
    r.getCell(1).font = { bold: true };
    r.getCell(2).alignment = { wrapText: true, vertical: 'top' };
  }
  guide.getColumn(1).width = 16;
  guide.getColumn(2).width = 84;

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

/** exceljs 셀 값(문자열/숫자/날짜/리치텍스트/수식결과)을 텍스트로. 줄바꿈 보존. */
function cellToText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return isoDate(value);
  if (typeof value === 'object') {
    const o = value as {
      richText?: ReadonlyArray<{ text?: string }>;
      text?: string;
      result?: unknown;
    };
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text ?? '').join('');
    if (typeof o.text === 'string') return o.text;
    if (o.result !== undefined && o.result !== null) return String(o.result);
  }
  return '';
}

function isoDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function normalizeDate(raw: string): string | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (!m) return undefined;
  return `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`;
}

export async function parseEvidenceFromExcel(buffer: ArrayBuffer): Promise<ParsedEvidenceRow[]> {
  const workbook = await loadEvidenceWorkbook(buffer);
  const ws = workbook.worksheets[0];
  const result: ParsedEvidenceRow[] = [];
  if (!ws) return result;

  // 헤더 자동 감지(기본 위치 폴백).
  let keyCol = 1;
  let numCol = 2;
  let nameCol = 3;
  let dateCol = 4;
  let contentCol = 5;
  let detected = false;
  ws.getRow(1).eachCell((cell, c) => {
    const v = cellToText(cell.value).trim().replace(/\s/g, '');
    if (/^(식별키|식별코드|key)$/i.test(v)) {
      keyCol = c;
      detected = true;
    } else if (/^(번호|no|#|학번)$/i.test(v)) {
      numCol = c;
      detected = true;
    } else if (/^(이름|성명|학생명|name)$/i.test(v)) {
      nameCol = c;
      detected = true;
    } else if (/^(날짜|일자|date)$/i.test(v)) {
      dateCol = c;
      detected = true;
    } else if (/^(관찰내용|관찰|내용|근거|근거내용|content)$/i.test(v)) {
      contentCol = c;
      detected = true;
    }
  });
  const startRow = detected ? 2 : 1;

  ws.eachRow((row, rowNumber) => {
    if (rowNumber < startRow) return;
    const content = cellToText(row.getCell(contentCol).value);
    if (!content.trim()) return; // 내용 없는 행(미입력 학생) 건너뜀
    const studentRef = cellToText(row.getCell(keyCol).value).trim();
    const num = parseInt(cellToText(row.getCell(numCol).value), 10);
    const name = cellToText(row.getCell(nameCol).value).trim();
    const date = normalizeDate(cellToText(row.getCell(dateCol).value));
    result.push({
      rowNumber,
      content,
      ...(studentRef ? { studentRef } : {}),
      ...(Number.isNaN(num) ? {} : { studentNumber: num }),
      ...(name ? { name } : {}),
      ...(date ? { date } : {}),
    });
  });
  return result;
}
