import { HwpxDocument, fetchSkeletonHwpx, loadSkeletonHwpx } from '@ubermensch1218/hwpxcore';
import type { ClassScheduleData, TeacherScheduleData } from '@domain/entities/Timetable';
import type { SeatingData } from '@domain/entities/Seating';
import type { Student } from '@domain/entities/Student';

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

  // 가로 방향 설정 (레이아웃 치수를 가로로 직접 지정)
  const section = doc.section(0);
  section.properties.setPageSize({
    width: 84188,    // 297mm → 가로 레이아웃 너비
    height: 59528,   // 210mm → 가로 레이아웃 높이
    orientation: 'LANDSCAPE',
  });
  section.properties.setPageMargins({
    top: 4252,     // 15mm
    bottom: 4252,  // 15mm
    left: 5669,    // 20mm
    right: 5669,   // 20mm
    header: 2835,  // 10mm
    footer: 2835,  // 10mm
  });

  const titleCharId = doc.ensureRunStyle({ bold: true, fontSize: 14 });
  const centerParaId = doc.ensureParaStyle({ alignment: 'CENTER' });
  const boardCharId = doc.ensureRunStyle({ bold: true, fontSize: 10 });
  const rosterCharId = doc.ensureRunStyle({ fontSize: 7 });
  const rosterHeaderCharId = doc.ensureRunStyle({ bold: true, fontSize: 7 });

  while (doc.paragraphs.length > 0) {
    doc.removeParagraph(0, 0);
  }

  // 제목
  const title = formatSeatingTitleHwpx(className);
  doc.addParagraph(title, {
    charPrIdRef: titleCharId,
    paraPrIdRef: centerParaId,
  });

  doc.addParagraph();

  // 학생 정렬
  const rosterStudents = [...students]
    .filter((s) => !s.isVacant)
    .sort((a, b) => (a.studentNumber ?? 0) - (b.studentNumber ?? 0));

  const seatGridRows = seating.rows;
  const seatCols = seating.cols;
  const seatVisualRows = seatGridRows + 1; // 그리드 행 + 교탁

  // 셀 크기 상수 (hwpUnits, 1mm ≈ 283.46)
  const SEAT_W = 5386;    // 19mm
  const SEAT_H = 5953;    // 21mm
  const ROSTER_NUM_W = 2920;  // 10.3mm
  const ROSTER_NAME_W = 4394; // 15.5mm
  const ROSTER_H = 992;       // 3.5mm
  const GAP_W = 600;          // ~2mm 간격

  // 테이블 행 수 = 명렬표 행 수 (헤더 + 학생 데이터)
  // 좌석 셀은 세로 병합하여 크게 표시
  const totalRows = Math.max(rosterStudents.length + 1, seatVisualRows);
  const gapCol = seatCols;
  const rosterCol = seatCols + 1;
  const totalCols = seatCols + 1 + 2; // 좌석 + 간격 + 번호 + 이름

  const tablePara = doc.addParagraph();
  const table = tablePara.addTable(totalRows, totalCols);
  table.pageBreak = 'NONE';

  // 열 너비
  for (let c = 0; c < seatCols; c++) {
    table.setColumnWidth(c, SEAT_W);
  }
  table.setColumnWidth(gapCol, GAP_W);
  table.setColumnWidth(rosterCol, ROSTER_NUM_W);
  table.setColumnWidth(rosterCol + 1, ROSTER_NAME_W);

  // ── 좌석 그리드: 각 좌석 행을 여러 실제 행에 걸쳐 세로 병합 ──
  const rowsPerSeat = Math.floor(totalRows / seatVisualRows);
  const remainder = totalRows % seatVisualRows;

  let actualRow = 0;
  for (let v = 0; v < seatVisualRows; v++) {
    const span = rowsPerSeat + (v < remainder ? 1 : 0);
    const endRow = actualRow + span - 1;

    if (v < seatGridRows) {
      // 좌석 행 (뒷자리가 위)
      const seatDataR = seatGridRows - 1 - v;
      for (let c = 0; c < seatCols; c++) {
        if (span > 1) {
          table.mergeCells(actualRow, c, endRow, c);
        }
        const studentId = seating.seats[seatDataR]?.[c] ?? null;
        const student = getStudent(studentId);
        table.setCellText(actualRow, c, student?.name ?? '');
        // 좌석 셀 크기 + 가운데 정렬
        const seatCell = table.cell(actualRow, c);
        seatCell.setSize(SEAT_W, SEAT_H);
        seatCell.vertAlign = 'CENTER';
        applyCellStyle(table, actualRow, c, { paraPrId: centerParaId });
      }
    } else {
      // 교탁 행
      if (seatCols > 1) {
        table.mergeCells(actualRow, 0, endRow, seatCols - 1);
      } else if (span > 1) {
        table.mergeCells(actualRow, 0, endRow, 0);
      }
      table.setCellText(actualRow, 0, '[ 교 탁 ]');
      const gyotakCell = table.cell(actualRow, 0);
      gyotakCell.setSize(SEAT_W * seatCols, SEAT_H);
      gyotakCell.vertAlign = 'CENTER';
      applyCellStyle(table, actualRow, 0, { charPrId: boardCharId, paraPrId: centerParaId });
    }

    actualRow = endRow + 1;
  }

  // 간격열 전체 병합
  table.mergeCells(0, gapCol, totalRows - 1, gapCol);

  // ── 명렬표 (오른쪽, 작은 글씨, 셀 크기 고정) ──
  table.setCellText(0, rosterCol, '번호');
  table.setCellText(0, rosterCol + 1, '이름');
  const rNumH = table.cell(0, rosterCol);
  rNumH.setSize(ROSTER_NUM_W, ROSTER_H);
  rNumH.vertAlign = 'CENTER';
  const rNameH = table.cell(0, rosterCol + 1);
  rNameH.setSize(ROSTER_NAME_W, ROSTER_H);
  rNameH.vertAlign = 'CENTER';
  applyCellStyle(table, 0, rosterCol, { charPrId: rosterHeaderCharId, paraPrId: centerParaId });
  applyCellStyle(table, 0, rosterCol + 1, { charPrId: rosterHeaderCharId, paraPrId: centerParaId });

  rosterStudents.forEach((student, i) => {
    const r = i + 1;
    const num = String(student.studentNumber ?? '').padStart(2, '0');
    table.setCellText(r, rosterCol, num);
    table.setCellText(r, rosterCol + 1, student.name);

    const numCell = table.cell(r, rosterCol);
    numCell.setSize(ROSTER_NUM_W, ROSTER_H);
    numCell.vertAlign = 'CENTER';
    const nameCell = table.cell(r, rosterCol + 1);
    nameCell.setSize(ROSTER_NAME_W, ROSTER_H);
    nameCell.vertAlign = 'CENTER';

    applyCellStyle(table, r, rosterCol, { charPrId: rosterCharId, paraPrId: centerParaId });
    applyCellStyle(table, r, rosterCol + 1, { charPrId: rosterCharId, paraPrId: centerParaId });
  });

  // 명렬표 아래 빈 영역 병합 (학생 수 < totalRows인 경우)
  if (rosterStudents.length + 1 < totalRows) {
    table.mergeCells(rosterStudents.length + 1, rosterCol, totalRows - 1, rosterCol + 1);
  }

  return doc.save();
}
