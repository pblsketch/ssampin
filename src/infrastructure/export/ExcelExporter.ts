import ExcelJS from 'exceljs';
import type { ClassScheduleData, TeacherScheduleData } from '@domain/entities/Timetable';
import type { SeatingData } from '@domain/entities/Seating';
import type { Student } from '@domain/entities/Student';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';

const SUBJECT_COLORS: Record<string, string> = {
  '국어': 'FFFDE68A',
  '영어': 'FFA7F3D0',
  '수학': 'FF93C5FD',
  '과학': 'FFC4B5FD',
  '사회': 'FFFED7AA',
  '체육': 'FFFCA5A5',
  '음악': 'FFF9A8D4',
  '미술': 'FFA5B4FC',
  '창체': 'FF99F6E4',
  '자율': 'FF99F6E4',
};

const DAYS = ['월', '화', '수', '목', '금'] as const;

function applyHeaderStyle(cell: ExcelJS.Cell): void {
  cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  };
}

function applyCellStyle(cell: ExcelJS.Cell, bgColor?: string): void {
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  };
  if (bgColor) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
  }
}

export async function exportClassScheduleToExcel(
  schedule: ClassScheduleData,
  maxPeriods: number,
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('학급 시간표');

  // Header row
  const headerRow = ws.addRow(['교시', ...DAYS]);
  headerRow.eachCell((cell) => applyHeaderStyle(cell));
  ws.getColumn(1).width = 8;
  DAYS.forEach((_, i) => { ws.getColumn(i + 2).width = 14; });

  // Data rows
  for (let p = 0; p < maxPeriods; p++) {
    const row = ws.addRow([
      `${p + 1}교시`,
      ...DAYS.map((day) => schedule[day]?.[p] ?? ''),
    ]);
    row.eachCell((cell, colNum) => {
      if (colNum === 1) {
        applyHeaderStyle(cell);
      } else {
        const subject = cell.value as string;
        applyCellStyle(cell, SUBJECT_COLORS[subject]);
      }
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

export async function exportTeacherScheduleToExcel(
  schedule: TeacherScheduleData,
  maxPeriods: number,
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('교사 시간표');

  const headerRow = ws.addRow(['교시', ...DAYS]);
  headerRow.eachCell((cell) => applyHeaderStyle(cell));
  ws.getColumn(1).width = 8;
  DAYS.forEach((_, i) => { ws.getColumn(i + 2).width = 18; });

  for (let p = 0; p < maxPeriods; p++) {
    const row = ws.addRow([
      `${p + 1}교시`,
      ...DAYS.map((day) => {
        const period = schedule[day]?.[p];
        if (!period) return '';
        return `${period.subject} (${period.classroom})`;
      }),
    ]);
    row.eachCell((cell, colNum) => {
      if (colNum === 1) {
        applyHeaderStyle(cell);
      } else {
        const val = cell.value as string;
        const subject = val.split(' (')[0] ?? '';
        applyCellStyle(cell, SUBJECT_COLORS[subject]);
      }
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

function formatSeatingTitle(className: string): string {
  if (!className) return '자리배치표';
  const m = className.match(/^(\d+)\s*-\s*(\d+)$/);
  if (m) return `${m[1]}학년 ${m[2]}반 자리배치표`;
  return `${className} 자리배치표`;
}

export async function exportSeatingToExcel(
  seating: SeatingData,
  getStudent: (id: string | null) => Student | undefined,
  students: readonly Student[],
  className: string,
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('학급 자리 배치도');

  // 가로 방향, 한 페이지에 맞춤
  ws.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
  };

  const rosterColStart = seating.cols + 2; // 1-indexed; cols+1 은 간격열

  // Row 1: 제목
  const title = formatSeatingTitle(className);
  ws.addRow([title]);
  ws.mergeCells(1, 1, 1, seating.cols);
  const titleCell = ws.getCell(1, 1);
  titleCell.font = { bold: true, size: 16 };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 2: 빈 행
  ws.addRow([]);

  const gridStartRow = 3;

  // 좌석 그리드 (앱과 동일한 순서, 앞줄이 위)
  for (let displayR = 0; displayR < seating.rows; displayR++) {
    const actualR = displayR;
    const rowData: string[] = [];
    for (let c = 0; c < seating.cols; c++) {
      const studentId = seating.seats[actualR]?.[c] ?? null;
      const student = getStudent(studentId);
      rowData.push(student ? student.name : '');
    }
    const excelRow = ws.addRow(rowData);
    excelRow.height = 30;
    excelRow.eachCell((cell, colNum) => {
      if (colNum <= seating.cols) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        };
        if (cell.value) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
          cell.font = { bold: true };
        }
      }
    });
  }

  // 빈 행 + 교탁 (그리드 아래)
  const gyotakRowNum = gridStartRow + seating.rows;
  ws.addRow([]);
  ws.mergeCells(gyotakRowNum, 1, gyotakRowNum, seating.cols);
  const gyotakCell = ws.getCell(gyotakRowNum, 1);
  gyotakCell.value = '[ 교 탁 ]';
  gyotakCell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  gyotakCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF64748B' } };
  gyotakCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // 명렬표 (오른쪽)
  const sorted = [...students]
    .filter((s) => !s.isVacant)
    .sort((a, b) => (a.studentNumber ?? 0) - (b.studentNumber ?? 0));

  // 명렬표 헤더
  const rosterTitleCell = ws.getCell(gridStartRow - 1, rosterColStart);
  rosterTitleCell.value = formatSeatingTitle(className).replace('자리배치표', '명렬표');
  rosterTitleCell.font = { bold: true, size: 11 };
  rosterTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.mergeCells(gridStartRow - 1, rosterColStart, gridStartRow - 1, rosterColStart + 1);

  const rosterNumHeader = ws.getCell(gridStartRow, rosterColStart);
  rosterNumHeader.value = '번호';
  applyHeaderStyle(rosterNumHeader);

  const rosterNameHeader = ws.getCell(gridStartRow, rosterColStart + 1);
  rosterNameHeader.value = '이름';
  applyHeaderStyle(rosterNameHeader);

  // 명렬표 데이터
  sorted.forEach((student, i) => {
    const rowNum = gridStartRow + 1 + i;

    const numCell = ws.getCell(rowNum, rosterColStart);
    numCell.value = String(student.studentNumber ?? '').padStart(2, '0');
    applyCellStyle(numCell);

    const nameCell = ws.getCell(rowNum, rosterColStart + 1);
    nameCell.value = student.name;
    applyCellStyle(nameCell);
  });

  // 열 너비 설정
  for (let c = 1; c <= seating.cols; c++) {
    ws.getColumn(c).width = 12;
  }
  ws.getColumn(seating.cols + 1).width = 3;       // 간격열
  ws.getColumn(rosterColStart).width = 6;          // 번호
  ws.getColumn(rosterColStart + 1).width = 12;     // 이름

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

export async function exportRosterToExcel(students: readonly Student[]): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('명렬표');

  const headerRow = ws.addRow(['번호', '이름', '학생 연락처', '학부모 연락처', '비고']);
  headerRow.eachCell((cell) => applyHeaderStyle(cell));

  ws.getColumn(1).width = 8;
  ws.getColumn(2).width = 16;
  ws.getColumn(3).width = 18;
  ws.getColumn(4).width = 18;
  ws.getColumn(5).width = 10;

  const sorted = [...students].sort((a, b) => (a.studentNumber ?? 0) - (b.studentNumber ?? 0));

  for (const student of sorted) {
    const numberStr = String(student.studentNumber ?? '').padStart(2, '0');
    const remarks = student.isVacant ? '결번' : '';
    const bgColor = student.isVacant ? 'FFEEEEEE' : undefined;

    const row = ws.addRow([
      numberStr,
      student.name,
      student.phone ?? '',
      student.parentPhone ?? '',
      remarks,
    ]);
    row.eachCell((cell) => applyCellStyle(cell, bgColor));
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

export async function parseRosterFromExcel(
  buffer: ArrayBuffer,
): Promise<Array<{ name: string; studentNumber: number; phone: string; parentPhone: string; isVacant: boolean }>> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const ws = workbook.worksheets[0];
  const result: Array<{ name: string; studentNumber: number; phone: string; parentPhone: string; isVacant: boolean }> = [];

  if (!ws) return result;

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header

    const numRaw = row.getCell(1).value;
    const studentNumber = parseInt(String(numRaw ?? ''), 10);
    if (isNaN(studentNumber)) return;

    const name = String(row.getCell(2).value ?? '');
    const phone = String(row.getCell(3).value ?? '');
    const parentPhone = String(row.getCell(4).value ?? '');
    const remarks = String(row.getCell(5).value ?? '');
    const isVacant = remarks.includes('결번');

    result.push({ name, studentNumber, phone, parentPhone, isVacant });
  });

  return result;
}

export interface ParsedExcelEvent {
  readonly title: string;
  readonly date: string;
  readonly endDate?: string;
  readonly categoryName: string;
  readonly time?: string;
  readonly location?: string;
  readonly description?: string;
  readonly isDDay?: boolean;
  readonly recurrence?: 'weekly' | 'monthly' | 'yearly';
}

export async function generateEventsTemplateExcel(): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();

  // Sheet 1: 일정 양식
  const ws = workbook.addWorksheet('일정 양식');

  const headers = ['날짜', '종료일', '제목', '카테고리', '시간', '장소', '설명', 'D-Day', '반복'];
  const headerRow = ws.addRow(headers);
  headerRow.eachCell((cell) => applyHeaderStyle(cell));

  ws.getColumn(1).width = 14;
  ws.getColumn(2).width = 14;
  ws.getColumn(3).width = 24;
  ws.getColumn(4).width = 12;
  ws.getColumn(5).width = 16;
  ws.getColumn(6).width = 16;
  ws.getColumn(7).width = 30;
  ws.getColumn(8).width = 8;
  ws.getColumn(9).width = 10;

  const examples: string[][] = [
    ['2026-03-02', '', '1학기 시작', '학교', '', '', '2026학년도 1학기 개학일', 'O', ''],
    ['2026-04-07', '2026-04-11', '학부모 상담 주간', '학급', '', '각 교실', '담임 학부모 개별 상담', '', ''],
    ['2026-03-18', '', '교과협의회', '부서', '15:00 - 16:00', '교무실', '', '', ''],
    ['2026-03-28', '', '나무학교 프로그램', '나무학교', '09:00', '', '생태 체험 학습', '', '매주'],
    ['2026-05-20', '', '체육대회', '학교', '', '운동장', '전교생 체육대회', 'O', ''],
    ['2026-03-05', '', '방과후 담임 회의', '기타', '16:30 - 17:30', '회의실', '', '', '매월'],
  ];

  for (const example of examples) {
    const row = ws.addRow(example);
    row.eachCell((cell) => applyCellStyle(cell));
  }

  // Sheet 2: 작성 안내
  const guide = workbook.addWorksheet('작성 안내');

  const titleRow = guide.addRow(['쌤핀 일정 가져오기 양식 작성 안내']);
  const titleCell = titleRow.getCell(1);
  titleCell.font = { bold: true, size: 14 };

  guide.addRow([]);

  const sectionRow = guide.addRow(['각 열 설명:']);
  sectionRow.getCell(1).font = { bold: true };

  const instructions: string[][] = [
    ['날짜', '필수. YYYY-MM-DD 형식 (예: 2026-03-02)'],
    ['종료일', '선택. 여러 날에 걸친 일정일 경우 YYYY-MM-DD'],
    ['제목', '필수. 일정 제목'],
    ['카테고리', '필수. 학교, 학급, 부서, 나무학교, 기타 중 선택 (직접 입력도 가능)'],
    ['시간', '선택. HH:mm 또는 HH:mm - HH:mm 형식'],
    ['장소', '선택. 장소명'],
    ['설명', '선택. 상세 설명'],
    ['D-Day', '선택. O 입력 시 D-Day 카운트 표시'],
    ['반복', '선택. 매주, 매월, 매년 중 선택'],
  ];

  for (const [col, desc] of instructions) {
    const row = guide.addRow([col, desc]);
    row.getCell(1).font = { bold: true };
  }

  guide.getColumn(1).width = 14;
  guide.getColumn(2).width = 60;

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

function formatExcelDate(value: ExcelJS.CellValue): string {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const str = String(value ?? '').trim();
  return str;
}

export async function parseEventsFromExcel(
  buffer: ArrayBuffer,
): Promise<{ events: ParsedExcelEvent[]; categoryNames: string[] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const ws = workbook.worksheets[0];
  const events: ParsedExcelEvent[] = [];
  const categorySet = new Set<string>();

  if (!ws) return { events, categoryNames: [] };

  const recurrenceMap: Record<string, 'weekly' | 'monthly' | 'yearly'> = {
    '매주': 'weekly',
    '매월': 'monthly',
    '매년': 'yearly',
  };

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header

    const dateVal = row.getCell(1).value;
    const date = formatExcelDate(dateVal);
    if (!date) return;

    const title = String(row.getCell(3).value ?? '').trim();
    if (!title) return;

    const categoryName = String(row.getCell(4).value ?? '').trim() || '기타';
    categorySet.add(categoryName);

    const endDateVal = row.getCell(2).value;
    const endDate = formatExcelDate(endDateVal);

    const time = String(row.getCell(5).value ?? '').trim();
    const location = String(row.getCell(6).value ?? '').trim();
    const description = String(row.getCell(7).value ?? '').trim();

    const dDayRaw = String(row.getCell(8).value ?? '').trim();
    const isDDay = dDayRaw === 'O' || dDayRaw === 'o' || dDayRaw === '\u25CB';

    const recurrenceRaw = String(row.getCell(9).value ?? '').trim();
    const recurrence = recurrenceMap[recurrenceRaw];

    const event: ParsedExcelEvent = {
      title,
      date,
      categoryName,
      ...(endDate ? { endDate } : {}),
      ...(time ? { time } : {}),
      ...(location ? { location } : {}),
      ...(description ? { description } : {}),
      ...(isDDay ? { isDDay: true } : {}),
      ...(recurrence ? { recurrence } : {}),
    };

    events.push(event);
  });

  return { events, categoryNames: Array.from(categorySet) };
}

export async function exportEventsToExcel(
  events: readonly SchoolEvent[],
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('학교 일정');

  const headerRow = ws.addRow(['날짜', '제목', '카테고리', '시간', '장소', '설명']);
  headerRow.eachCell((cell) => applyHeaderStyle(cell));

  ws.getColumn(1).width = 14;
  ws.getColumn(2).width = 24;
  ws.getColumn(3).width = 12;
  ws.getColumn(4).width = 16;
  ws.getColumn(5).width = 16;
  ws.getColumn(6).width = 30;

  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));

  for (const event of sorted) {
    const dateStr = event.endDate ? `${event.date} ~ ${event.endDate}` : event.date;
    const row = ws.addRow([
      dateStr,
      event.title,
      event.category,
      event.time ?? '',
      event.location ?? '',
      event.description ?? '',
    ]);
    row.eachCell((cell) => applyCellStyle(cell));
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}
