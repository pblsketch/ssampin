import { HwpxDocument, fetchSkeletonHwpx, loadSkeletonHwpx } from '@ubermensch1218/hwpxcore';
import type { ClassScheduleData, TeacherScheduleData } from '@domain/entities/Timetable';
import type { SeatingData } from '@domain/entities/Seating';
import type { Student } from '@domain/entities/Student';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import type { RecordCategoryItem } from '@domain/valueObjects/RecordCategory';
import {
  getAttendanceStats,
  sortByDateDesc,
  filterByStudent,
  filterByCategory,
} from '@domain/rules/studentRecordRules';

const DAYS = ['월', '화', '수', '목', '금'] as const;

let skeletonReady = false;

async function ensureSkeleton(): Promise<void> {
  if (skeletonReady) return;
  try {
    loadSkeletonHwpx();
    skeletonReady = true;
  } catch {
    await fetchSkeletonHwpx('./Skeleton.hwpx');
    skeletonReady = true;
  }
}

async function createDoc(): Promise<HwpxDocument> {
  await ensureSkeleton();
  return HwpxDocument.open(loadSkeletonHwpx());
}

function findChildByLocalName(parent: Element, name: string): Element | null {
  const children = parent.childNodes;
  for (let i = 0; i < children.length; i++) {
    const child = children.item(i);
    if (child && child.nodeType === 1) {
      const el = child as Element;
      const local = el.localName || el.tagName.split(':').pop() || el.tagName;
      if (local === name) return el;
    }
  }
  return null;
}

function applyCellStyle(
  table: ReturnType<HwpxDocument['tables'][number]['cell']>['table'],
  row: number,
  col: number,
  opts: { charPrId?: string; paraPrId?: string },
): void {
  const cell = table.cell(row, col);
  const subList = findChildByLocalName(cell.element, 'subList');
  if (!subList) return;
  const para = findChildByLocalName(subList, 'p');
  if (!para) return;
  if (opts.paraPrId) {
    para.setAttribute('paraPrIDRef', opts.paraPrId);
  }
  if (opts.charPrId) {
    const run = findChildByLocalName(para, 'run');
    if (run) {
      run.setAttribute('charPrIDRef', opts.charPrId);
    }
  }
}

function applyStyleToAllCells(
  table: ReturnType<HwpxDocument['tables'][number]['cell']>['table'],
  rows: number,
  cols: number,
  opts: { charPrId?: string; paraPrId?: string },
): void {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      applyCellStyle(table, r, c, opts);
    }
  }
}

export async function exportClassScheduleToHwpx(
  schedule: ClassScheduleData,
  maxPeriods: number,
): Promise<Uint8Array> {
  const doc = await createDoc();

  const titleCharId = doc.ensureRunStyle({ bold: true, fontSize: 16 });
  const centerParaId = doc.ensureParaStyle({ alignment: 'CENTER' });
  const headerCharId = doc.ensureRunStyle({ bold: true, fontSize: 10 });

  while (doc.paragraphs.length > 0) {
    doc.removeParagraph(0, 0);
  }

  doc.addParagraph('학급 시간표', {
    charPrIdRef: titleCharId,
    paraPrIdRef: centerParaId,
  });

  doc.addParagraph();

  const totalRows = maxPeriods + 1;
  const totalCols = DAYS.length + 1;
  const tablePara = doc.addParagraph();
  const table = tablePara.addTable(totalRows, totalCols);

  // 헤더 행
  table.setCellText(0, 0, '교시');
  for (const [d, day] of DAYS.entries()) {
    table.setCellText(0, d + 1, day);
  }

  // 데이터 행
  for (let p = 0; p < maxPeriods; p++) {
    table.setCellText(p + 1, 0, `${p + 1}교시`);
    for (const [d, day] of DAYS.entries()) {
      const cp = schedule[day]?.[p];
      const text = cp ? (cp.teacher ? `${cp.subject} (${cp.teacher})` : cp.subject) : '';
      table.setCellText(p + 1, d + 1, text);
    }
  }

  // 전체 셀 가운데 정렬
  applyStyleToAllCells(table, totalRows, totalCols, { paraPrId: centerParaId });
  // 헤더 행 볼드
  for (let c = 0; c < totalCols; c++) {
    applyCellStyle(table, 0, c, { charPrId: headerCharId });
  }

  return doc.save();
}

export async function exportTeacherScheduleToHwpx(
  schedule: TeacherScheduleData,
  maxPeriods: number,
): Promise<Uint8Array> {
  const doc = await createDoc();

  const titleCharId = doc.ensureRunStyle({ bold: true, fontSize: 16 });
  const centerParaId = doc.ensureParaStyle({ alignment: 'CENTER' });
  const headerCharId = doc.ensureRunStyle({ bold: true, fontSize: 10 });

  while (doc.paragraphs.length > 0) {
    doc.removeParagraph(0, 0);
  }

  doc.addParagraph('교사 시간표', {
    charPrIdRef: titleCharId,
    paraPrIdRef: centerParaId,
  });

  doc.addParagraph();

  const totalRows = maxPeriods + 1;
  const totalCols = DAYS.length + 1;
  const tablePara = doc.addParagraph();
  const table = tablePara.addTable(totalRows, totalCols);

  table.setCellText(0, 0, '교시');
  for (const [d, day] of DAYS.entries()) {
    table.setCellText(0, d + 1, day);
  }

  for (let p = 0; p < maxPeriods; p++) {
    table.setCellText(p + 1, 0, `${p + 1}교시`);
    for (const [d, day] of DAYS.entries()) {
      const period = schedule[day]?.[p];
      const text = period ? `${period.subject} (${period.classroom})` : '';
      table.setCellText(p + 1, d + 1, text);
    }
  }

  // 전체 셀 가운데 정렬
  applyStyleToAllCells(table, totalRows, totalCols, { paraPrId: centerParaId });
  // 헤더 행 볼드
  for (let c = 0; c < totalCols; c++) {
    applyCellStyle(table, 0, c, { charPrId: headerCharId });
  }

  return doc.save();
}

function formatSeatingTitleHwpx(className: string): string {
  if (!className) return '자리배치표';
  const m = className.match(/^(\d+)\s*-\s*(\d+)$/);
  if (m) return `${m[1]}학년 ${m[2]}반 자리배치표`;
  return `${className} 자리배치표`;
}

export async function exportSeatingToHwpx(
  seating: SeatingData,
  getStudent: (id: string | null) => Student | undefined,
  students: readonly Student[],
  className: string,
): Promise<Uint8Array> {
  const doc = await createDoc();

  // ── Page setup: A4 portrait ──
  const section = doc.section(0);
  section.properties.setPageSize({
    width: 59528,
    height: 84188,
    orientation: 'PORTRAIT',
  });
  section.properties.setPageMargins({
    top: 2834,
    bottom: 2834,
    left: 2834,
    right: 2834,
    header: 2834,
    footer: 1417,
  });

  // ── Styles ──
  const centerParaId = doc.ensureParaStyle({ alignment: 'CENTER' });
  const titleCharId = doc.ensureRunStyle({ bold: true, fontSize: 16 });
  const boardCharId = doc.ensureRunStyle({ bold: true, fontSize: 14 });
  const rosterHeaderCharId = doc.ensureRunStyle({ bold: true, fontSize: 9 });
  const rosterCharId = doc.ensureRunStyle({ fontSize: 9 });

  // Border fill styles
  const solidBorder = doc.oxml.ensureBorderFillStyle({
    sides: {
      left: { type: 'SOLID', width: '0.12 mm', color: '#000000' },
      right: { type: 'SOLID', width: '0.12 mm', color: '#000000' },
      top: { type: 'SOLID', width: '0.12 mm', color: '#000000' },
      bottom: { type: 'SOLID', width: '0.12 mm', color: '#000000' },
    },
  });
  const noBorder = doc.ensureBasicBorderFill();
  const gapBorder = doc.oxml.ensureBorderFillStyle({
    sides: {
      left: { type: 'SOLID', width: '0.12 mm', color: '#000000' },
      right: { type: 'SOLID', width: '0.12 mm', color: '#000000' },
      top: { type: 'NONE', width: '0.12 mm', color: '#000000' },
      bottom: { type: 'NONE', width: '0.12 mm', color: '#000000' },
    },
  });
  const leftOnlyBorder = doc.oxml.ensureBorderFillStyle({
    sides: {
      left: { type: 'SOLID', width: '0.12 mm', color: '#000000' },
      right: { type: 'NONE', width: '0.12 mm', color: '#000000' },
      top: { type: 'NONE', width: '0.12 mm', color: '#000000' },
      bottom: { type: 'NONE', width: '0.12 mm', color: '#000000' },
    },
  });
  const rightOnlyBorder = doc.oxml.ensureBorderFillStyle({
    sides: {
      left: { type: 'NONE', width: '0.12 mm', color: '#000000' },
      right: { type: 'SOLID', width: '0.12 mm', color: '#000000' },
      top: { type: 'NONE', width: '0.12 mm', color: '#000000' },
      bottom: { type: 'NONE', width: '0.12 mm', color: '#000000' },
    },
  });

  // ── Row-count-dependent sizing ──
  const seatGridRows = seating.rows;
  const seatCols = seating.cols;

  let seatH: number;
  let numberFontSize: number;
  let nameFontSize: number;
  if (seatGridRows <= 5) {
    seatH = 6649;
    numberFontSize = 9;
    nameFontSize = 18;
  } else if (seatGridRows === 6) {
    seatH = 5800;
    numberFontSize = 8;
    nameFontSize = 16;
  } else {
    seatH = 5200;
    numberFontSize = 8;
    nameFontSize = 14;
  }

  const numberCharId = doc.ensureRunStyle({ fontSize: numberFontSize });
  const nameCharId = doc.ensureRunStyle({ bold: true, fontSize: nameFontSize });

  while (doc.paragraphs.length > 0) {
    doc.removeParagraph(0, 0);
  }

  // ── Sorted roster ──
  const rosterStudents = [...students]
    .filter((s) => !s.isVacant)
    .sort((a, b) => (a.studentNumber ?? 0) - (b.studentNumber ?? 0));

  // ── Title ──
  const title = formatSeatingTitleHwpx(className);
  doc.addParagraph(title, {
    charPrIdRef: titleCharId,
    paraPrIdRef: centerParaId,
  });
  doc.addParagraph();

  // ══════════════════════════════════════════════════════════════
  //  TABLE 1: Seating Chart
  // ══════════════════════════════════════════════════════════════

  // Column layout:
  //   Left half seats with gaps, center aisle (3 cols), right half seats with gaps
  const leftCols = Math.ceil(seatCols / 2);
  const rightCols = seatCols - leftCols;

  // Build column descriptor array
  // Each entry: { type: 'seat'|'gap'|'aisle', seatIdx?: number }
  interface ColDesc {
    type: 'seat' | 'gap' | 'aisle';
    seatIdx?: number;
  }
  const colDescs: ColDesc[] = [];

  // Left half
  for (let i = 0; i < leftCols; i++) {
    if (i > 0) colDescs.push({ type: 'gap' });
    colDescs.push({ type: 'seat', seatIdx: i });
  }
  // Center aisle (3 columns)
  colDescs.push({ type: 'aisle' });
  colDescs.push({ type: 'aisle' });
  colDescs.push({ type: 'aisle' });
  // Right half
  for (let i = 0; i < rightCols; i++) {
    if (i > 0) colDescs.push({ type: 'gap' });
    colDescs.push({ type: 'seat', seatIdx: leftCols + i });
  }

  const tableCols = colDescs.length;

  // Rows: seatGridRows seat rows + 1 separator row + 2 교탁 rows = seatGridRows + 3
  const seatTableRows = seatGridRows + 3;
  const separatorRow = seatGridRows;
  const gyotakRow1 = seatGridRows + 1;
  const gyotakRow2 = seatGridRows + 2;

  // Column widths
  const SEAT_W = 9364;
  const GAP_W = 1303;
  const AISLE_W = 1305;

  // Calculate the last seat col width to fill remaining space
  // Total used by non-last-seat columns:
  let usedWidth = 0;
  const seatColIndices: number[] = [];
  for (let ci = 0; ci < tableCols; ci++) {
    const desc = colDescs[ci]!;
    if (desc.type === 'seat') {
      seatColIndices.push(ci);
      usedWidth += SEAT_W;
    } else if (desc.type === 'gap') {
      usedWidth += GAP_W;
    } else {
      usedWidth += AISLE_W;
    }
  }
  // Adjust last seat column to fill page width (53860)
  const PAGE_W = 53860;
  const lastSeatColIdx = seatColIndices[seatColIndices.length - 1]!;
  const lastSeatW = SEAT_W + (PAGE_W - usedWidth);

  const seatPara = doc.addParagraph();
  const seatTable = seatPara.addTable(seatTableRows, tableCols);
  seatTable.pageBreak = 'NONE';

  // Set column widths
  for (let ci = 0; ci < tableCols; ci++) {
    const desc = colDescs[ci]!;
    if (desc.type === 'seat') {
      seatTable.setColumnWidth(ci, ci === lastSeatColIdx ? lastSeatW : SEAT_W);
    } else if (desc.type === 'gap') {
      seatTable.setColumnWidth(ci, GAP_W);
    } else {
      seatTable.setColumnWidth(ci, AISLE_W);
    }
  }

  // Helper: set two-line cell content (number + name)
  function setCellTwoLines(
    table: typeof seatTable,
    row: number,
    col: number,
    line1: string,
    line1CharPrId: string,
    line2: string,
    line2CharPrId: string,
    paraPrId: string,
  ): void {
    table.setCellText(row, col, line1);
    applyCellStyle(table, row, col, { charPrId: line1CharPrId, paraPrId });

    const cell = table.cell(row, col);
    const subList = findChildByLocalName(cell.element, 'subList');
    if (!subList) return;
    const firstPara = findChildByLocalName(subList, 'p');
    if (!firstPara) return;
    const newPara = firstPara.cloneNode(true) as Element;
    newPara.setAttribute('paraPrIDRef', paraPrId);
    const run = findChildByLocalName(newPara, 'run');
    if (run) {
      run.setAttribute('charPrIDRef', line2CharPrId);
      const t = findChildByLocalName(run, 't');
      if (t) t.textContent = line2;
    }
    const paraId = String(Date.now() + Math.random());
    newPara.setAttribute('id', paraId);
    subList.appendChild(newPara);
  }

  // ── Seat rows (back → front display: row 0 of display = highest grid row) ──
  for (let displayRow = 0; displayRow < seatGridRows; displayRow++) {
    const dataRow = seatGridRows - 1 - displayRow;

    for (let ci = 0; ci < tableCols; ci++) {
      const desc = colDescs[ci]!;
      const cell = seatTable.cell(displayRow, ci);

      if (desc.type === 'seat') {
        const seatRow = seating.seats[dataRow];
        const studentId = seatRow ? (seatRow[desc.seatIdx!] ?? null) : null;
        const student = getStudent(studentId);
        cell.borderFillIDRef = solidBorder;
        cell.setMargin({ left: 510, right: 510, top: 141, bottom: 141 });
        cell.setSize(ci === lastSeatColIdx ? lastSeatW : SEAT_W, seatH);
        cell.vertAlign = 'CENTER';

        if (student) {
          const num = String(student.studentNumber ?? '');
          setCellTwoLines(
            seatTable, displayRow, ci,
            num, numberCharId,
            student.name, nameCharId,
            centerParaId,
          );
        } else {
          seatTable.setCellText(displayRow, ci, '');
          applyCellStyle(seatTable, displayRow, ci, { paraPrId: centerParaId });
        }
      } else if (desc.type === 'gap') {
        cell.borderFillIDRef = gapBorder;
        cell.setSize(GAP_W, seatH);
        seatTable.setCellText(displayRow, ci, '');
      } else {
        // Aisle columns — will be merged
        cell.setSize(AISLE_W, seatH);
        seatTable.setCellText(displayRow, ci, '');
      }
    }

    // Merge center aisle columns for this row
    const aisleStart = colDescs.findIndex((d) => d.type === 'aisle');
    if (aisleStart >= 0) {
      seatTable.mergeCells(displayRow, aisleStart, displayRow, aisleStart + 2);
      seatTable.cell(displayRow, aisleStart).borderFillIDRef = gapBorder;
    }
  }

  // ── Separator row (full-width merge, no borders) ──
  for (let ci = 0; ci < tableCols; ci++) {
    const sepDesc = colDescs[ci]!;
    seatTable.setCellText(separatorRow, ci, '');
    seatTable.cell(separatorRow, ci).setSize(
      sepDesc.type === 'seat'
        ? (ci === lastSeatColIdx ? lastSeatW : SEAT_W)
        : sepDesc.type === 'gap' ? GAP_W : AISLE_W,
      2745,
    );
  }
  seatTable.mergeCells(separatorRow, 0, separatorRow, tableCols - 1);
  seatTable.cell(separatorRow, 0).borderFillIDRef = noBorder;

  // ── 교탁 area (rows gyotakRow1, gyotakRow2) ──
  // 5 regions: [left empty] [left gap] [교탁 center] [right gap] [right empty]
  // 교탁 spans from the innermost left seat through the aisle to the innermost right seat
  const lastLeftSeatCol = seatColIndices[leftCols - 1]!;
  const firstRightSeatCol = seatColIndices[leftCols]!;
  const gyotakStartCol = lastLeftSeatCol;
  const gyotakEndCol = firstRightSeatCol;

  // Gap columns adjacent to the 교탁 region
  const gLeftGapCol = gyotakStartCol > 0 && colDescs[gyotakStartCol - 1]?.type === 'gap'
    ? gyotakStartCol - 1 : -1;
  const gRightGapCol = gyotakEndCol < tableCols - 1 && colDescs[gyotakEndCol + 1]?.type === 'gap'
    ? gyotakEndCol + 1 : -1;

  const gLeftEmptyEnd = gLeftGapCol > 0 ? gLeftGapCol - 1 : gyotakStartCol - 1;
  const gRightEmptyStart = gRightGapCol >= 0 ? gRightGapCol + 1 : gyotakEndCol + 1;

  const GYOTAK_H = 5971;

  // Initialize all cells in 교탁 rows
  for (let row = gyotakRow1; row <= gyotakRow2; row++) {
    for (let ci = 0; ci < tableCols; ci++) {
      seatTable.setCellText(row, ci, '');
    }
  }

  // Region 1: Left empty block (rowSpan=2, noBorder)
  if (gLeftEmptyEnd >= 0) {
    seatTable.mergeCells(gyotakRow1, 0, gyotakRow2, gLeftEmptyEnd);
    seatTable.cell(gyotakRow1, 0).borderFillIDRef = noBorder;
    seatTable.cell(gyotakRow1, 0).setSize(SEAT_W, GYOTAK_H);
  }

  // Region 2: Left gap column (rightOnlyBorder)
  if (gLeftGapCol >= 0) {
    seatTable.mergeCells(gyotakRow1, gLeftGapCol, gyotakRow2, gLeftGapCol);
    seatTable.cell(gyotakRow1, gLeftGapCol).borderFillIDRef = rightOnlyBorder;
    seatTable.cell(gyotakRow1, gLeftGapCol).setSize(GAP_W, GYOTAK_H);
  }

  // Region 3: 교탁 center (inner-left seat + aisle cols + inner-right seat, rowSpan=2)
  seatTable.mergeCells(gyotakRow1, gyotakStartCol, gyotakRow2, gyotakEndCol);
  seatTable.cell(gyotakRow1, gyotakStartCol).borderFillIDRef = solidBorder;
  seatTable.cell(gyotakRow1, gyotakStartCol).vertAlign = 'CENTER';
  seatTable.cell(gyotakRow1, gyotakStartCol).setSize(SEAT_W * 2 + AISLE_W * 3, GYOTAK_H);
  seatTable.setCellText(gyotakRow1, gyotakStartCol, '교 탁');
  applyCellStyle(seatTable, gyotakRow1, gyotakStartCol, {
    charPrId: boardCharId,
    paraPrId: centerParaId,
  });

  // Region 4: Right gap column (leftOnlyBorder)
  if (gRightGapCol >= 0) {
    seatTable.mergeCells(gyotakRow1, gRightGapCol, gyotakRow2, gRightGapCol);
    seatTable.cell(gyotakRow1, gRightGapCol).borderFillIDRef = leftOnlyBorder;
    seatTable.cell(gyotakRow1, gRightGapCol).setSize(GAP_W, GYOTAK_H);
  }

  // Region 5: Right empty block (rowSpan=2, noBorder)
  if (gRightEmptyStart <= tableCols - 1) {
    seatTable.mergeCells(gyotakRow1, gRightEmptyStart, gyotakRow2, tableCols - 1);
    seatTable.cell(gyotakRow1, gRightEmptyStart).borderFillIDRef = noBorder;
    seatTable.cell(gyotakRow1, gRightEmptyStart).setSize(SEAT_W, GYOTAK_H);
  }

  // ══════════════════════════════════════════════════════════════
  //  TABLE 0: Student Roster (명렬표) — placed after seating table
  // ══════════════════════════════════════════════════════════════

  doc.addParagraph();

  const MIN_DATA_ROWS = 30;
  const dataRows = Math.max(rosterStudents.length, MIN_DATA_ROWS);
  const rosterTableRows = dataRows + 2; // header row + column header row + data rows
  const ROSTER_COLS = 3; // 번호, 이름, 성별

  // Extract class number from className for header
  let classLabel = className || '';
  const classMatch = className.match(/^(\d+)\s*-\s*(\d+)$/);
  if (classMatch) {
    classLabel = `${classMatch[2]}반`;
  } else if (className) {
    classLabel = `${className}`;
  }

  const ROSTER_NUM_W = 2949;
  const ROSTER_NAME_W = 6628;
  const ROSTER_GENDER_W = 2949;
  const ROSTER_HEADER_H = 1850;
  const ROSTER_DATA_H = 1410;

  const rosterPara = doc.addParagraph();
  const rosterTable = rosterPara.addTable(rosterTableRows, ROSTER_COLS);
  rosterTable.pageBreak = 'NONE';

  // Column widths
  rosterTable.setColumnWidth(0, ROSTER_NUM_W);
  rosterTable.setColumnWidth(1, ROSTER_NAME_W);
  rosterTable.setColumnWidth(2, ROSTER_GENDER_W);

  // Row 0: Class header (merged across 3 cols)
  rosterTable.setCellText(0, 0, classLabel);
  rosterTable.setCellText(0, 1, '');
  rosterTable.setCellText(0, 2, '');
  rosterTable.mergeCells(0, 0, 0, 2);
  rosterTable.cell(0, 0).borderFillIDRef = solidBorder;
  rosterTable.cell(0, 0).setSize(ROSTER_NUM_W + ROSTER_NAME_W + ROSTER_GENDER_W, ROSTER_HEADER_H);
  rosterTable.cell(0, 0).vertAlign = 'CENTER';
  applyCellStyle(rosterTable, 0, 0, { charPrId: rosterHeaderCharId, paraPrId: centerParaId });

  // Row 1: Column headers
  rosterTable.setCellText(1, 0, '번호');
  rosterTable.setCellText(1, 1, '이름');
  rosterTable.setCellText(1, 2, '성별');
  for (let c = 0; c < ROSTER_COLS; c++) {
    rosterTable.cell(1, c).borderFillIDRef = solidBorder;
    rosterTable.cell(1, c).setSize(
      c === 0 ? ROSTER_NUM_W : c === 1 ? ROSTER_NAME_W : ROSTER_GENDER_W,
      ROSTER_HEADER_H,
    );
    rosterTable.cell(1, c).vertAlign = 'CENTER';
    applyCellStyle(rosterTable, 1, c, { charPrId: rosterHeaderCharId, paraPrId: centerParaId });
  }

  // Data rows
  for (let i = 0; i < dataRows; i++) {
    const r = i + 2;
    const student = i < rosterStudents.length ? rosterStudents[i] : undefined;
    const num = student ? String(student.studentNumber ?? '') : '';
    const name = student?.name ?? '';

    rosterTable.setCellText(r, 0, num);
    rosterTable.setCellText(r, 1, name);
    rosterTable.setCellText(r, 2, ''); // 성별 — Student has no gender field

    for (let c = 0; c < ROSTER_COLS; c++) {
      rosterTable.cell(r, c).borderFillIDRef = solidBorder;
      rosterTable.cell(r, c).setSize(
        c === 0 ? ROSTER_NUM_W : c === 1 ? ROSTER_NAME_W : ROSTER_GENDER_W,
        ROSTER_DATA_H,
      );
      rosterTable.cell(r, c).vertAlign = 'CENTER';
      applyCellStyle(rosterTable, r, c, { charPrId: rosterCharId, paraPrId: centerParaId });
    }
  }

  return await doc.save();
}

const COUNSELING_METHOD_LABELS: Record<string, string> = {
  phone: '전화',
  face: '대면',
  online: '온라인',
  visit: '가정방문',
  text: '문자',
  other: '기타',
};

export async function exportStudentRecordsToHwpx(
  records: readonly StudentRecord[],
  students: readonly Student[],
  categories: readonly RecordCategoryItem[],
  settings: { schoolName: string; className: string; teacherName: string },
  period?: { start: string; end: string },
): Promise<Uint8Array> {
  // categories is reserved for future filtering; suppress unused-variable lint
  void (filterByCategory as unknown);
  void categories;

  const doc = await createDoc();

  const titleCharId = doc.ensureRunStyle({ bold: true, fontSize: 16 });
  const centerParaId = doc.ensureParaStyle({ alignment: 'CENTER' });
  const headerCharId = doc.ensureRunStyle({ bold: true, fontSize: 10 });
  const bodyCharId = doc.ensureRunStyle({ fontSize: 9 });
  const subHeaderCharId = doc.ensureRunStyle({ bold: true, fontSize: 11 });

  while (doc.paragraphs.length > 0) {
    doc.removeParagraph(0, 0);
  }

  // ── Page 1: Cover ──
  doc.addParagraph('담임 기록부', { charPrIdRef: titleCharId, paraPrIdRef: centerParaId });
  doc.addParagraph();
  doc.addParagraph(settings.schoolName || '학교명', { paraPrIdRef: centerParaId });
  doc.addParagraph(settings.className || '학급명', { paraPrIdRef: centerParaId });
  doc.addParagraph(`담임: ${settings.teacherName || '교사명'}`, { paraPrIdRef: centerParaId });
  if (period) {
    doc.addParagraph(`기간: ${period.start} ~ ${period.end}`, { paraPrIdRef: centerParaId });
  }

  // ── Pages 2+: Student-by-student records ──
  const activeStudents = [...students]
    .filter((s) => !s.isVacant)
    .sort((a, b) => (a.studentNumber ?? 0) - (b.studentNumber ?? 0));

  const RECORD_COLS = 5; // 날짜 | 구분 | 내용 | 상담방법 | 후속조치

  for (const student of activeStudents) {
    doc.addParagraph();
    doc.addParagraph(`${student.studentNumber}번 ${student.name}`, {
      charPrIdRef: subHeaderCharId,
    });

    let studentRecords = filterByStudent(records, student.id);

    if (period) {
      studentRecords = studentRecords.filter(
        (r) => r.date >= period.start && r.date <= period.end,
      );
    }

    studentRecords = sortByDateDesc(studentRecords);

    if (studentRecords.length === 0) {
      doc.addParagraph('기록 없음');
    } else {
      const rowCount = studentRecords.length + 1; // header + data rows
      const tablePara = doc.addParagraph();
      const table = tablePara.addTable(rowCount, RECORD_COLS);

      // Header row
      table.setCellText(0, 0, '날짜');
      table.setCellText(0, 1, '구분');
      table.setCellText(0, 2, '내용');
      table.setCellText(0, 3, '상담방법');
      table.setCellText(0, 4, '후속조치');

      // Data rows
      for (const [i, rec] of studentRecords.entries()) {
        const r = i + 1;
        const methodLabel = rec.method ? (COUNSELING_METHOD_LABELS[rec.method] ?? '') : '';
        table.setCellText(r, 0, rec.date);
        table.setCellText(r, 1, rec.subcategory);
        table.setCellText(r, 2, rec.content);
        table.setCellText(r, 3, methodLabel);
        table.setCellText(r, 4, '');
      }

      // Apply styles
      applyStyleToAllCells(table, rowCount, RECORD_COLS, { charPrId: bodyCharId });
      for (let c = 0; c < RECORD_COLS; c++) {
        applyCellStyle(table, 0, c, { charPrId: headerCharId, paraPrId: centerParaId });
      }
    }

    // Attendance summary for this student (uses all records, not date-filtered)
    const allStudentRecords = filterByStudent(records, student.id);
    const stats = getAttendanceStats(allStudentRecords, student.id);
    doc.addParagraph(
      `출결: 결석 ${stats.absent} / 지각 ${stats.late} / 조퇴 ${stats.earlyLeave} / 결과 ${stats.resultAbsent}`,
    );
    doc.addParagraph(); // separator
  }

  // ── Last page: Attendance summary table ──
  doc.addParagraph();
  doc.addParagraph('출결 현황표', { charPrIdRef: subHeaderCharId });

  const ATTENDANCE_COLS = 7; // 번호 | 이름 | 결석 | 지각 | 조퇴 | 결과 | 합계
  const attendanceRows = activeStudents.length + 1;
  const attendancePara = doc.addParagraph();
  const attendanceTable = attendancePara.addTable(attendanceRows, ATTENDANCE_COLS);

  // Header
  attendanceTable.setCellText(0, 0, '번호');
  attendanceTable.setCellText(0, 1, '이름');
  attendanceTable.setCellText(0, 2, '결석');
  attendanceTable.setCellText(0, 3, '지각');
  attendanceTable.setCellText(0, 4, '조퇴');
  attendanceTable.setCellText(0, 5, '결과');
  attendanceTable.setCellText(0, 6, '합계');

  // Data rows
  for (const [i, student] of activeStudents.entries()) {
    const r = i + 1;
    const st = getAttendanceStats(records, student.id);
    const total = st.absent + st.late + st.earlyLeave + st.resultAbsent;
    attendanceTable.setCellText(r, 0, String(student.studentNumber ?? ''));
    attendanceTable.setCellText(r, 1, student.name);
    attendanceTable.setCellText(r, 2, String(st.absent));
    attendanceTable.setCellText(r, 3, String(st.late));
    attendanceTable.setCellText(r, 4, String(st.earlyLeave));
    attendanceTable.setCellText(r, 5, String(st.resultAbsent));
    attendanceTable.setCellText(r, 6, String(total));
  }

  // Apply styles
  applyStyleToAllCells(attendanceTable, attendanceRows, ATTENDANCE_COLS, {
    charPrId: bodyCharId,
    paraPrId: centerParaId,
  });
  for (let c = 0; c < ATTENDANCE_COLS; c++) {
    applyCellStyle(attendanceTable, 0, c, { charPrId: headerCharId, paraPrId: centerParaId });
  }

  return doc.save();
}
