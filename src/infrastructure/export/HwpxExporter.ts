import { HwpxDocument, fetchSkeletonHwpx, loadSkeletonHwpx } from '@ubermensch1218/hwpxcore';
import JSZip from 'jszip';
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

/**
 * hwpxcore bug workaround: secPr (section properties including page size,
 * margins, orientation) lives inside the first paragraph's <hp:run> in
 * section0.xml.  When we call removeParagraph() to clear content, the secPr
 * is destroyed and doc.save() does not regenerate it.
 *
 * Fix: extract the skeleton's first <hp:p> (which holds secPr in its run),
 * patch pagePr/margin, strip colPr and linesegarray remnants, then inject
 * as a dedicated paragraph before the content paragraphs after doc.save().
 * Hangul requires secPr to live in its own <hp:p> — injecting into an
 * existing content run does NOT produce landscape orientation.
 */
async function buildSecPrParagraph(opts: {
  landscape: 'WIDELY' | 'NARROWLY';
  width: number;
  height: number;
  margin: { top: number; bottom: number; left: number; right: number; header: number; footer: number };
}): Promise<string | null> {
  const skelBytes = loadSkeletonHwpx();
  const zip = await JSZip.loadAsync(skelBytes);
  const sectionFile = zip.file('Contents/section0.xml');
  if (!sectionFile) return null;
  const xml = await sectionFile.async('string');

  // The skeleton's first <hp:p> contains <hp:run> with <hp:secPr>
  const match = xml.match(/<hp:p [^>]*>[\s\S]*?<\/hp:p>/);
  if (!match) return null;

  let para = match[0];

  // Patch pagePr attributes
  para = para.replace(
    /<hp:pagePr[^>]*>/,
    `<hp:pagePr landscape="${opts.landscape}" width="${opts.width}" height="${opts.height}" gutterType="LEFT_ONLY">`,
  );
  // Patch margin (keep original format — do NOT add gutter="0" as it breaks landscape)
  para = para.replace(
    /<hp:margin[^>]*\/>/,
    `<hp:margin header="${opts.margin.header}" footer="${opts.margin.footer}" left="${opts.margin.left}" right="${opts.margin.right}" top="${opts.margin.top}" bottom="${opts.margin.bottom}"/>`,
  );

  // IMPORTANT: Keep colPr and linesegarray in the secPr paragraph!
  // Hangul requires these elements for landscape orientation to work.
  // They are only stripped from content paragraphs in saveWithSectionProps().

  return para;
}

/**
 * Save the document and inject the secPr paragraph as a dedicated <hp:p>
 * before the first content paragraph in section0.xml.  Also removes any
 * linesegarray and colPr remnants from content paragraphs.
 */
async function saveWithSectionProps(
  doc: HwpxDocument,
  secPrParagraph: string | null,
): Promise<Uint8Array> {
  const savedBytes = await doc.save();
  if (!secPrParagraph) return savedBytes;

  const zip = await JSZip.loadAsync(savedBytes);
  const sectionFile = zip.file('Contents/section0.xml');
  if (!sectionFile) return savedBytes;

  let sectionXml = await sectionFile.async('string');

  // 1) Remove any existing secPr
  sectionXml = sectionXml.replace(/<hp:secPr[\s\S]*?<\/hp:secPr>/g, '');

  // 2) Remove linesegarray (portrait layout cache from skeleton)
  sectionXml = sectionXml.replace(/<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>/g, '');

  // 3) Remove colPr ctrl remnants from skeleton
  sectionXml = sectionXml.replace(/<hp:ctrl><hp:colPr[^/]*\/><\/hp:ctrl>/g, '');

  // 4) Inject the secPr paragraph before the first content <hp:p>
  const firstPIdx = sectionXml.indexOf('<hp:p ');
  if (firstPIdx >= 0) {
    sectionXml = sectionXml.slice(0, firstPIdx)
      + secPrParagraph
      + sectionXml.slice(firstPIdx);
  }

  zip.file('Contents/section0.xml', sectionXml);
  return await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
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

/**
 * Configure a table element for absolute positioning on the page.
 * Sets textWrap, noAdjust attributes on the <tbl> element and
 * updates/creates <sz> and <pos> child elements for precise placement.
 */
function setTableAbsolutePosition(
  tableElement: Element,
  opts: {
    textWrap: string;
    width: number;
    height: number;
    horzOffset: number;
    vertOffset: number;
    horzRelTo: string;
    vertRelTo: string;
    flowWithText?: string;
    allowOverlap?: string;
  },
): void {
  const HP_NS = 'http://www.hancom.co.kr/hwpml/2011/paragraph';

  // Set table-level attributes for floating
  tableElement.setAttribute('textWrap', opts.textWrap);
  tableElement.setAttribute('textFlow', 'BOTH_SIDES');
  tableElement.setAttribute('noAdjust', '1');

  // Update <sz> child element
  const szEl = findChildByLocalName(tableElement, 'sz');
  if (szEl) {
    szEl.setAttribute('width', String(opts.width));
    szEl.setAttribute('widthRelTo', 'ABSOLUTE');
    szEl.setAttribute('height', String(opts.height));
    szEl.setAttribute('heightRelTo', 'ABSOLUTE');
    szEl.setAttribute('protect', '0');
  }

  // Update <pos> child element
  let posEl = findChildByLocalName(tableElement, 'pos');
  if (!posEl) {
    const ownerDoc = tableElement.ownerDocument!;
    posEl = ownerDoc.createElementNS(HP_NS, 'pos');
    // Insert after <sz> if it exists, otherwise prepend
    const afterSz = szEl?.nextSibling ?? tableElement.firstChild;
    if (afterSz) {
      tableElement.insertBefore(posEl, afterSz);
    } else {
      tableElement.appendChild(posEl);
    }
  }
  posEl.setAttribute('treatAsChar', '0');
  posEl.setAttribute('affectLSpacing', '0');
  posEl.setAttribute('flowWithText', opts.flowWithText ?? '1');
  posEl.setAttribute('allowOverlap', opts.allowOverlap ?? '0');
  posEl.setAttribute('holdAnchorAndSO', '0');
  posEl.setAttribute('vertRelTo', opts.vertRelTo);
  posEl.setAttribute('horzRelTo', opts.horzRelTo);
  posEl.setAttribute('vertAlign', 'TOP');
  posEl.setAttribute('horzAlign', 'LEFT');
  posEl.setAttribute('vertOffset', String(opts.vertOffset));
  posEl.setAttribute('horzOffset', String(opts.horzOffset));
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

  // ── Page setup: A4 Landscape ──
  // Hangul uses landscape="WIDELY" for landscape orientation.
  // Width/height are swapped compared to portrait A4.
  const section = doc.section(0);
  section.properties.setPageSize({
    width: 84188,
    height: 59528,
    orientation: 'WIDELY',
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

  // Border fill styles — noBorder MUST be created first so the skeleton's
  // default borderFill (id=3, no borders) is assigned to noBorder, not solidBorder.
  const noBorder = doc.oxml.ensureBorderFillStyle({
    sides: {
      left: { type: 'NONE', width: '0.12 mm', color: '#000000' },
      right: { type: 'NONE', width: '0.12 mm', color: '#000000' },
      top: { type: 'NONE', width: '0.12 mm', color: '#000000' },
      bottom: { type: 'NONE', width: '0.12 mm', color: '#000000' },
    },
  });
  const solidBorder = doc.oxml.ensureBorderFillStyle({
    sides: {
      left: { type: 'SOLID', width: '0.12 mm', color: '#000000' },
      right: { type: 'SOLID', width: '0.12 mm', color: '#000000' },
      top: { type: 'SOLID', width: '0.12 mm', color: '#000000' },
      bottom: { type: 'SOLID', width: '0.12 mm', color: '#000000' },
    },
  });
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

  // Build secPr paragraph from skeleton (will be injected after doc.save())
  const secPrParagraph = await buildSecPrParagraph({
    landscape: 'WIDELY',
    width: 84188,
    height: 59528,
    margin: { top: 2834, bottom: 2834, left: 2834, right: 2834, header: 2834, footer: 1417 },
  });

  while (doc.paragraphs.length > 0) {
    doc.removeParagraph(0, 0);
  }

  // ── Sorted roster ──
  const rosterStudents = [...students]
    .filter((s) => !s.isVacant)
    .sort((a, b) => (a.studentNumber ?? 0) - (b.studentNumber ?? 0));

  // ── Title — tables are anchored to this paragraph ──
  const title = formatSeatingTitleHwpx(className);
  const titlePara = doc.addParagraph(title, {
    charPrIdRef: titleCharId,
    paraPrIdRef: centerParaId,
  });

  // ══════════════════════════════════════════════════════════════
  //  TABLE 1: Seating Chart
  // ══════════════════════════════════════════════════════════════

  // Column layout:
  //   Left half seats with gaps, center aisle (3 cols), right half seats with gaps
  let leftCols = Math.ceil(seatCols / 2);
  let rightCols = seatCols - leftCols;

  // Build column descriptor array
  // Each entry: { type: 'seat'|'gap'|'aisle', seatIdx?: number }
  interface ColDesc {
    type: 'seat' | 'gap' | 'aisle';
    seatIdx?: number;
  }
  const colDescs: ColDesc[] = [];
  const isPairMode = !!seating.pairMode;

  // 짝꿍 모드: 좌우 반전(미러링)을 고려한 짝 그룹 정렬
  // mirroredPairOf: 테이블 seatIdx → 미러링 후 UI 짝 그룹 번호
  const mirroredPairOf = (idx: number) => Math.floor((seatCols - 1 - idx) / 2);

  if (isPairMode && leftCols > 0 && leftCols < seatCols) {
    // 복도(aisle)가 미러링된 짝 그룹을 가르지 않도록 leftCols 조정
    if (mirroredPairOf(leftCols - 1) === mirroredPairOf(leftCols)) {
      const optionA = leftCols - 1;
      const optionB = leftCols + 1;
      const validA = optionA > 0;
      const validB = optionB < seatCols;
      if (validA && validB) {
        const balanceA = Math.abs(optionA - (seatCols - optionA));
        const balanceB = Math.abs(optionB - (seatCols - optionB));
        leftCols = balanceA < balanceB ? optionA : optionB;
      } else if (validA) {
        leftCols = optionA;
      } else if (validB) {
        leftCols = optionB;
      }
      rightCols = seatCols - leftCols;
    }
  }

  if (isPairMode) {
    // 짝꿍 모드: 미러링된 짝 그룹 기준으로 gap 배치
    // Left half
    for (let i = 0; i < leftCols; i++) {
      if (i > 0 && mirroredPairOf(i) !== mirroredPairOf(i - 1)) {
        colDescs.push({ type: 'gap' });
      }
      colDescs.push({ type: 'seat', seatIdx: i });
    }
    // Center aisle
    colDescs.push({ type: 'aisle' });
    // Right half
    for (let i = 0; i < rightCols; i++) {
      const seatIdx = leftCols + i;
      if (i > 0 && mirroredPairOf(seatIdx) !== mirroredPairOf(seatIdx - 1)) {
        colDescs.push({ type: 'gap' });
      }
      colDescs.push({ type: 'seat', seatIdx });
    }
  } else {
    // 일반 모드: 매 좌석 사이에 gap
    // Left half
    for (let i = 0; i < leftCols; i++) {
      if (i > 0) colDescs.push({ type: 'gap' });
      colDescs.push({ type: 'seat', seatIdx: i });
    }
    // Center aisle
    colDescs.push({ type: 'aisle' });
    // Right half
    for (let i = 0; i < rightCols; i++) {
      if (i > 0) colDescs.push({ type: 'gap' });
      colDescs.push({ type: 'seat', seatIdx: leftCols + i });
    }
  }

  const tableCols = colDescs.length;

  // Rows: seatGridRows seat rows + 1 separator row + 1 교탁 row = seatGridRows + 2
  const seatTableRows = seatGridRows + 2;
  const separatorRow = seatGridRows;
  const gyotakRow = seatGridRows + 1;

  // Column widths — gaps and aisle are fixed-size, seat width is dynamic
  const GAP_W = 1303;
  const AISLE_W = GAP_W; // same width for uniform spacing

  // Seating table width — reduced to fit seating + roster side-by-side on one page
  const ROSTER_GAP = 2500;
  const SEAT_TABLE_TARGET_W = 52000;

  // Dynamically compute seat column width so the table fits exactly
  const seatColIndices: number[] = [];
  let numGapCols = 0;
  let numAisleCols = 0;
  for (let ci = 0; ci < tableCols; ci++) {
    const desc = colDescs[ci]!;
    if (desc.type === 'seat') seatColIndices.push(ci);
    else if (desc.type === 'gap') numGapCols++;
    else numAisleCols++;
  }
  const numSeatCols = seatColIndices.length;
  const fixedWidth = numGapCols * GAP_W + numAisleCols * AISLE_W;
  const availableForSeats = SEAT_TABLE_TARGET_W - fixedWidth;
  const SEAT_W = Math.floor(availableForSeats / numSeatCols);
  const lastSeatColIdx = seatColIndices[seatColIndices.length - 1]!;
  const lastSeatW = availableForSeats - SEAT_W * (numSeatCols - 1);

  const seatTable = titlePara.addTable(seatTableRows, tableCols);
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
  // Creates a second paragraph from scratch to avoid cloneNode issues
  // (cloning copies linesegarray with invalid layout data that crashes Hangul)
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

    // Remove linesegarray from first paragraph if present
    const firstLsa = findChildByLocalName(firstPara, 'linesegarray');
    if (firstLsa) firstPara.removeChild(firstLsa);

    // Build second paragraph from scratch (not cloneNode)
    const ownerDoc = subList.ownerDocument!;
    const ns = firstPara.namespaceURI!;
    const newPara = ownerDoc.createElementNS(ns, 'p');
    newPara.setAttribute('paraPrIDRef', paraPrId);
    newPara.setAttribute('styleIDRef', '0');
    newPara.setAttribute('pageBreak', '0');
    newPara.setAttribute('columnBreak', '0');
    newPara.setAttribute('merged', '0');
    newPara.setAttribute('id', String(Math.floor(Math.random() * 2000000000)));

    const newRun = ownerDoc.createElementNS(ns, 'run');
    newRun.setAttribute('charPrIDRef', line2CharPrId);
    const newT = ownerDoc.createElementNS(ns, 't');
    newT.textContent = line2;
    newRun.appendChild(newT);
    newPara.appendChild(newRun);

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
        // 좌우 반전: 교사 관점(UI) → 학생 관점(인쇄물)
        const mirroredColIdx = seatCols - 1 - desc.seatIdx!;
        const studentId = seatRow ? (seatRow[mirroredColIdx] ?? null) : null;
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

    // Style center aisle column (single column, no merge needed)
    const aisleStart = colDescs.findIndex((d) => d.type === 'aisle');
    if (aisleStart >= 0) {
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

  // ── 교탁 area (single row with horizontal merges) ──
  // hwpxcore bug: rowSpan merges that consume ALL cells in a row produce
  // an empty <tr> which Hangul rejects. Use horizontal-only merges instead.
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

  // Initialize all cells in 교탁 row
  for (let ci = 0; ci < tableCols; ci++) {
    seatTable.setCellText(gyotakRow, ci, '');
  }

  // Region 1: Left empty block (noBorder)
  if (gLeftEmptyEnd >= 0) {
    seatTable.mergeCells(gyotakRow, 0, gyotakRow, gLeftEmptyEnd);
    seatTable.cell(gyotakRow, 0).borderFillIDRef = noBorder;
    seatTable.cell(gyotakRow, 0).setSize(SEAT_W, GYOTAK_H);
  }

  // Region 2: Left gap column (rightOnlyBorder)
  if (gLeftGapCol >= 0) {
    seatTable.cell(gyotakRow, gLeftGapCol).borderFillIDRef = rightOnlyBorder;
    seatTable.cell(gyotakRow, gLeftGapCol).setSize(GAP_W, GYOTAK_H);
  }

  // Region 3: 교탁 center
  seatTable.mergeCells(gyotakRow, gyotakStartCol, gyotakRow, gyotakEndCol);
  seatTable.cell(gyotakRow, gyotakStartCol).borderFillIDRef = solidBorder;
  seatTable.cell(gyotakRow, gyotakStartCol).vertAlign = 'CENTER';
  seatTable.cell(gyotakRow, gyotakStartCol).setSize(SEAT_W * 2 + AISLE_W, GYOTAK_H);
  seatTable.setCellText(gyotakRow, gyotakStartCol, '교 탁');
  applyCellStyle(seatTable, gyotakRow, gyotakStartCol, {
    charPrId: boardCharId,
    paraPrId: centerParaId,
  });

  // Region 4: Right gap column (leftOnlyBorder)
  if (gRightGapCol >= 0) {
    seatTable.cell(gyotakRow, gRightGapCol).borderFillIDRef = leftOnlyBorder;
    seatTable.cell(gyotakRow, gRightGapCol).setSize(GAP_W, GYOTAK_H);
  }

  // Region 5: Right empty block (noBorder)
  if (gRightEmptyStart <= tableCols - 1) {
    seatTable.mergeCells(gyotakRow, gRightEmptyStart, gyotakRow, tableCols - 1);
    seatTable.cell(gyotakRow, gRightEmptyStart).borderFillIDRef = noBorder;
    seatTable.cell(gyotakRow, gRightEmptyStart).setSize(SEAT_W, GYOTAK_H);
  }

  // ── Seating table absolute positioning (left side of page) ──
  // PAGE-relative positioning with flowWithText=0 ensures both tables
  // stay on the same page regardless of paragraph flow.
  const seatTableHeight = seatGridRows * seatH + 2745 + GYOTAK_H;
  setTableAbsolutePosition(seatTable.element, {
    textWrap: 'IN_FRONT_OF_TEXT',
    width: SEAT_TABLE_TARGET_W,
    height: seatTableHeight,
    horzOffset: 2834,
    vertOffset: 8500,
    horzRelTo: 'PAGE',
    vertRelTo: 'PAGE',
    flowWithText: '0',
    allowOverlap: '1',
  });

  // ══════════════════════════════════════════════════════════════
  //  TABLE 0: Student Roster (명렬표) — placed beside seating table
  // ══════════════════════════════════════════════════════════════

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

  // Add roster table to the title paragraph — both tables use PAGE-relative
  // positioning with flowWithText=0 to stay on the same page.
  const rosterTable = titlePara.addTable(rosterTableRows, ROSTER_COLS);
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

  // ── Roster table absolute positioning (right side of page) ──
  const ROSTER_W = ROSTER_NUM_W + ROSTER_NAME_W + ROSTER_GENDER_W;
  const rosterTotalHeight = ROSTER_HEADER_H * 2 + dataRows * ROSTER_DATA_H;
  const rosterHorzOffset = 2834 + SEAT_TABLE_TARGET_W + ROSTER_GAP; // from page edge
  setTableAbsolutePosition(rosterTable.element, {
    textWrap: 'IN_FRONT_OF_TEXT',
    width: ROSTER_W,
    height: rosterTotalHeight,
    horzOffset: rosterHorzOffset,
    vertOffset: 5668,
    horzRelTo: 'PAGE',
    vertRelTo: 'PAGE',
    flowWithText: '0',
    allowOverlap: '1',
  });

  return await saveWithSectionProps(doc, secPrParagraph);
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
