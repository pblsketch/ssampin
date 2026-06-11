/**
 * 서명 등록부 → Excel(.xlsx) 보조 내보내기 (exceljs).
 *
 * Google 시트 내보내기(=IMAGE 수식)의 보조 경로다. 시트와 달리 셀 안에
 * 서명 PNG를 **직접 임베드**한다(오프라인/로컬 보관용). 법적 효력은 주장하지 않는다.
 *
 * 입력 계약:
 *  - columns: 동적 열 정의 (order 기준 정렬, signature 타입 = 이미지 임베드 대상)
 *  - rows[].cells: 컬럼 key → 텍스트 값
 *  - rows[].signatureUrl: (선택) 서명 PNG 공개 URL — 있으면 fetch 후 셀에 임베드,
 *    없으면 빈 셀로 둔다(회귀/누락 안전).
 *
 * exceljs는 infrastructure 레이어에서만 import한다(클린 아키텍처).
 */
import ExcelJS from 'exceljs';
import type { ColumnDef } from '@domain/entities/SignatureRoster';

/** 등록부 1행 입력 */
export interface ExcelRegisterRow {
  /** 컬럼 key → 텍스트 셀 값 */
  readonly cells: Record<string, string>;
  /** 서명 이미지 공개 URL (PNG). 있으면 해당 행 signature 열에 임베드. */
  readonly signatureUrl?: string;
}

/** exportRegisterToExcel 입력 */
export interface ExportRegisterToExcelInput {
  /** 스프레드시트/시트 제목 */
  readonly title: string;
  /** 상단 머리말 (병합 셀) */
  readonly headerText: string;
  /** 컬럼 정의 목록 (order 기준 정렬) */
  readonly columns: readonly ColumnDef[];
  /** 데이터 행 목록 */
  readonly rows: readonly ExcelRegisterRow[];
}

/** 서명 이미지 셀 크기(픽셀) — 행 높이/열 너비를 이에 맞춘다. */
const SIGNATURE_CELL_WIDTH_PX = 160;
const SIGNATURE_CELL_HEIGHT_PX = 64;
/** 이미지 임베드 시 셀 여백(픽셀) */
const SIGNATURE_IMAGE_PADDING_PX = 6;

/** Excel 행 높이 단위(pt) ← 픽셀. 96dpi 기준 1px ≈ 0.75pt. */
const PX_TO_ROW_HEIGHT_PT = 0.75;
/** Excel 열 너비 단위(문자) ← 픽셀. 대략 1문자 ≈ 7px. */
const PX_TO_COLUMN_WIDTH_CHAR = 1 / 7;

const HEADER_FILL_ARGB = 'FF3B82F6';
const BORDER_ARGB = 'FFD1D5DB';

function thinBorder(): Partial<ExcelJS.Borders> {
  const side = { style: 'thin' as const, color: { argb: BORDER_ARGB } };
  return { top: side, bottom: side, left: side, right: side };
}

function applyHeaderStyle(cell: ExcelJS.Cell): void {
  cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL_ARGB } };
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  cell.border = thinBorder();
}

function applyDataStyle(cell: ExcelJS.Cell): void {
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  cell.border = thinBorder();
}

/** data URL / http(s) URL → PNG 바이트 버퍼. 실패 시 null(임베드 생략). */
async function fetchPngBuffer(url: string): Promise<ArrayBuffer | null> {
  try {
    if (url.startsWith('data:')) {
      const comma = url.indexOf(',');
      if (comma < 0) return null;
      const base64 = url.slice(comma + 1);
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes.buffer;
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

/**
 * 서명 등록부를 xlsx로 만든다.
 *
 * 레이아웃:
 *  - 1행: 머리말(headerText) — 전체 열 병합
 *  - 2행: 컬럼 라벨 헤더
 *  - 3행~: 데이터행. signature 열은 signatureUrl PNG를 셀에 임베드.
 *
 * @returns xlsx ArrayBuffer (호출자가 Blob 다운로드)
 */
export async function exportRegisterToExcel(
  input: ExportRegisterToExcelInput,
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheetName = (input.title || '서명 등록부').replace(/[[\]:/*?\\]/g, '').slice(0, 31);
  const ws = workbook.addWorksheet(sheetName || '서명 등록부');

  const columns = [...input.columns].sort((a, b) => a.order - b.order);
  const signatureKeys = new Set(columns.filter((c) => c.type === 'signature').map((c) => c.key));
  const colCount = Math.max(columns.length, 1);

  // 열 너비: signature 열은 이미지 폭에 맞추고, 그 외는 14문자.
  columns.forEach((column, index) => {
    const col = ws.getColumn(index + 1);
    col.width = signatureKeys.has(column.key)
      ? SIGNATURE_CELL_WIDTH_PX * PX_TO_COLUMN_WIDTH_CHAR
      : 14;
  });

  let cursorRow = 1;

  // 1행: 머리말 (있을 때만, 전체 열 병합)
  if (input.headerText) {
    ws.mergeCells(cursorRow, 1, cursorRow, colCount);
    const headerCell = ws.getCell(cursorRow, 1);
    headerCell.value = input.headerText;
    headerCell.font = { bold: true, size: 12 };
    headerCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cursorRow += 1;
  }

  // 헤더행: 컬럼 라벨
  const labelRow = ws.getRow(cursorRow);
  columns.forEach((column, index) => {
    const cell = labelRow.getCell(index + 1);
    cell.value = column.label;
    applyHeaderStyle(cell);
  });
  cursorRow += 1;

  // 임베드할 이미지가 있는지 — 미리 PNG 버퍼를 병렬 fetch.
  const hasSignatureColumn = signatureKeys.size > 0;
  const pngBuffers = hasSignatureColumn
    ? await Promise.all(
        input.rows.map((row) =>
          row.signatureUrl ? fetchPngBuffer(row.signatureUrl) : Promise.resolve(null),
        ),
      )
    : [];

  // 데이터행
  input.rows.forEach((row, rowIndex) => {
    const excelRow = ws.getRow(cursorRow);
    const pngBuffer = pngBuffers[rowIndex] ?? null;
    let embedded = false;

    columns.forEach((column, colIndex) => {
      const cell = excelRow.getCell(colIndex + 1);
      if (signatureKeys.has(column.key)) {
        // signature 열: 텍스트는 비우고 이미지로 채운다(있을 때).
        cell.value = '';
        applyDataStyle(cell);
        if (pngBuffer) {
          const imageId = workbook.addImage({ buffer: pngBuffer, extension: 'png' });
          ws.addImage(imageId, {
            tl: {
              col: colIndex + SIGNATURE_IMAGE_PADDING_PX / SIGNATURE_CELL_WIDTH_PX,
              row: cursorRow - 1 + SIGNATURE_IMAGE_PADDING_PX / SIGNATURE_CELL_HEIGHT_PX,
            },
            ext: {
              width: SIGNATURE_CELL_WIDTH_PX - SIGNATURE_IMAGE_PADDING_PX * 2,
              height: SIGNATURE_CELL_HEIGHT_PX - SIGNATURE_IMAGE_PADDING_PX * 2,
            },
            editAs: 'oneCell',
          });
          embedded = true;
        }
      } else {
        cell.value = row.cells[column.key] ?? '';
        applyDataStyle(cell);
      }
    });

    // 서명 이미지를 임베드한 행은 이미지 높이에 맞춰 행 높이를 키운다.
    excelRow.height = embedded ? SIGNATURE_CELL_HEIGHT_PX * PX_TO_ROW_HEIGHT_PT : 22;
    cursorRow += 1;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}
