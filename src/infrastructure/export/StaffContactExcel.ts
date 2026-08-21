/**
 * 교직원 연락처 엑셀 — 빈 양식 만들기 · 현재 명부 내보내기 · 파일 읽기.
 *
 * 해석 규칙(어떤 머리글을 무엇으로 볼지, 무엇이 오류인지)은 전부
 * `@domain/rules/staffContactImportRules`에 있다. 여기서는 **엑셀 파일과
 * 글자 표(2차원 배열) 사이를 오가는 일만** 한다.
 */
import ExcelJS from 'exceljs';
import type { StaffContact } from '@domain/entities/StaffContact';
import {
  STAFF_IMPORT_HEADERS,
  STAFF_IMPORT_FIELD_ORDER,
  EXAMPLE_ROW_PREFIX,
  findStaffHeaderRow,
  type StaffField,
} from '@domain/rules/staffContactImportRules';

const SHEET_NAME = '교직원 연락처';
const GUIDE_SHEET_NAME = '작성 안내';

/** 열 너비 — 이름은 좁게, 메모는 넓게. */
const COLUMN_WIDTHS: Record<StaffField, number> = {
  name: 12,
  position: 10,
  department: 14,
  subject: 12,
  homeroom: 10,
  mobile: 16,
  officePhone: 12,
  email: 24,
  memo: 30,
};

/**
 * 글자로 취급해야 하는 열.
 *
 * 엑셀은 "01012345678"을 숫자로 보고 **앞의 0을 지워 버린다.** 그러면 번호가
 * 통째로 망가진다. 양식 단계에서 이 열들을 텍스트 서식(`@`)으로 못 박아 둔다.
 */
const TEXT_FIELDS: readonly StaffField[] = ['mobile', 'officePhone', 'homeroom'];

function applyHeaderStyle(cell: ExcelJS.Cell): void {
  cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFBFDBFE' } },
    left: { style: 'thin', color: { argb: 'FFBFDBFE' } },
    bottom: { style: 'thin', color: { argb: 'FFBFDBFE' } },
    right: { style: 'thin', color: { argb: 'FFBFDBFE' } },
  };
}

function setupSheet(ws: ExcelJS.Worksheet): void {
  ws.columns = STAFF_IMPORT_FIELD_ORDER.map((field) => ({
    width: COLUMN_WIDTHS[field],
    style: TEXT_FIELDS.includes(field) ? { numFmt: '@' } : undefined,
  }));

  const headerRow = ws.addRow(STAFF_IMPORT_FIELD_ORDER.map((f) => STAFF_IMPORT_HEADERS[f]));
  headerRow.height = 22;
  headerRow.eachCell(applyHeaderStyle);
  // 머리글을 고정해 아래로 스크롤해도 어떤 열인지 보이게 한다.
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

const GUIDE_LINES: readonly string[] = [
  '교직원 연락처 일괄 등록 — 작성 안내',
  '',
  '1. "교직원 연락처" 시트에 한 줄에 한 명씩 입력하세요.',
  '2. 이름만 반드시 채우면 됩니다. 나머지는 아는 것만 적으세요.',
  `3. ${EXAMPLE_ROW_PREFIX}로 시작하는 줄은 보기용입니다. 지우지 않아도 등록되지 않습니다.`,
  '4. 열 순서를 바꾸거나 필요 없는 열을 지워도 됩니다. 머리글 이름으로 알아서 찾습니다.',
  '5. 머리글 위에 학교 이름 같은 제목 줄이 있어도 괜찮습니다.',
  '',
  '[전화번호 주의]',
  '· 휴대폰·내선 열은 반드시 "텍스트" 서식으로 두세요.',
  '· 숫자 서식이면 엑셀이 010의 앞 0을 지워 010-1234-5678이 1012345678이 됩니다.',
  '· 이 양식은 이미 텍스트로 맞춰 두었습니다. 다른 파일에서 붙여넣을 때만 주의하세요.',
  '',
  '[머리글로 쓸 수 있는 다른 표현]',
  '· 이름 → 성명, 교사명',
  '· 휴대폰 → 휴대전화, 핸드폰, 연락처, 전화번호',
  '· 내선번호 → 내선, 사무실, 교무실',
  '· 부서 → 소속, 소속부서',
  '· 메모 → 비고, 특이사항',
  '',
  '[불러온 뒤]',
  '· 등록 전에 미리보기로 몇 명이 들어오는지 확인할 수 있습니다.',
  '· 이름과 휴대폰이 모두 같으면 같은 사람으로 보고 내용을 새로 고칩니다.',
  '· 이름이 같아도 휴대폰이 다르면 다른 사람으로 봅니다(동명이인 보호).',
];

function addGuideSheet(workbook: ExcelJS.Workbook): void {
  const guide = workbook.addWorksheet(GUIDE_SHEET_NAME);
  guide.columns = [{ width: 80 }];
  GUIDE_LINES.forEach((line, i) => {
    const row = guide.addRow([line]);
    if (i === 0) row.getCell(1).font = { bold: true, size: 13 };
    else if (line.startsWith('[')) row.getCell(1).font = { bold: true };
  });
}

/**
 * 빈 양식을 만든다 — 머리글 + 예시 한 줄 + 작성 안내 시트.
 *
 * 예시 줄 이름에 `(예시)`를 붙이므로, 사용자가 지우지 않고 올려도 등록되지 않는다.
 */
export async function exportStaffContactTemplate(): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet(SHEET_NAME);
  setupSheet(ws);

  const example = ws.addRow([
    `${EXAMPLE_ROW_PREFIX} 홍길동`,
    '부장',
    '3학년부',
    '수학',
    '3-1',
    '010-1234-5678',
    '1502',
    'hong@school.kr',
    '수요일 오후 출장 잦음',
  ]);
  example.eachCell((cell) => {
    cell.font = { italic: true, color: { argb: 'FF9CA3AF' } };
  });

  addGuideSheet(workbook);
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

/** 지금 등록된 명부를 엑셀로 내보낸다 — 백업하거나, 고쳐서 다시 올릴 때 쓴다. */
export async function exportStaffContacts(contacts: readonly StaffContact[]): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet(SHEET_NAME);
  setupSheet(ws);

  for (const c of contacts) {
    ws.addRow([
      c.name,
      c.position ?? '',
      c.department ?? '',
      c.subject ?? '',
      c.homeroom ?? '',
      c.mobile ?? '',
      c.officePhone ?? '',
      c.email ?? '',
      c.memo ?? '',
    ]);
  }

  addGuideSheet(workbook);
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

// ─────────────────────────────────────────────────────────────
// 읽기
// ─────────────────────────────────────────────────────────────

/**
 * 엑셀이 숫자로 바꿔 버린 전화번호에서 앞의 0을 되살릴 자릿수.
 *
 * 010-1234-5678을 숫자로 저장하면 1012345678(10자리),
 * 031-123-4567은 311234567(9자리)이 된다. 둘 다 앞에 0이 있어야 맞는 번호다.
 * 8자리 이하는 지역번호 없는 시내번호(1234-5678)나 내선일 수 있어 건드리지 않는다.
 */
const DROPPED_ZERO_DIGIT_LENGTHS: ReadonlySet<number> = new Set([9, 10]);

/** 셀 하나를 글자로 바꾼다. 숫자·날짜·수식·서식 있는 글자를 모두 다룬다. */
function cellToText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';

  if (typeof value === 'string') return value.trim();

  if (typeof value === 'number') {
    const text = String(value);
    // 전화번호에서 앞의 0이 날아간 경우를 되살린다.
    if (Number.isInteger(value) && value > 0 && DROPPED_ZERO_DIGIT_LENGTHS.has(text.length)) {
      return `0${text}`;
    }
    return text;
  }

  if (typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  if (typeof value === 'object') {
    if ('richText' in value) {
      return value.richText
        .map((r) => r.text)
        .join('')
        .trim();
    }
    if ('text' in value) return String(value.text).trim();
    if ('result' in value) return cellToText(value.result as ExcelJS.CellValue);
    if ('hyperlink' in value) return String(value.hyperlink).trim();
  }

  return String(value).trim();
}

/** 워크시트 하나를 글자 표로 바꾼다. */
function sheetToGrid(ws: ExcelJS.Worksheet): string[][] {
  const grid: string[][] = [];
  const columnCount = Math.max(ws.columnCount, STAFF_IMPORT_FIELD_ORDER.length);

  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const cells: string[] = [];
    for (let col = 1; col <= columnCount; col++) {
      cells.push(cellToText(row.getCell(col).value));
    }
    // eachRow는 1부터 세므로 배열 자리를 맞춘다 (빈 앞줄도 그대로 보존).
    grid[rowNumber - 1] = cells;
  });

  for (let i = 0; i < grid.length; i++) {
    grid[i] ??= [];
  }
  return grid;
}

/**
 * 엑셀 파일을 글자 표로 읽는다.
 *
 * 시트가 여러 장이면 **이름 열이 있는 첫 시트**를 고른다. 우리 양식은 뒤에
 * "작성 안내" 시트가 붙어 있고, 학교에서 쓰던 파일도 앞에 표지 시트가 있는 일이 흔하다.
 */
export async function parseStaffContactsFromExcel(buffer: ArrayBuffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const grids = workbook.worksheets.map(sheetToGrid);
  const withHeader = grids.find((g) => findStaffHeaderRow(g) !== -1);
  return withHeader ?? grids[0] ?? [];
}
