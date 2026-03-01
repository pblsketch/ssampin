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

export async function exportSeatingToExcel(
  seating: SeatingData,
  getStudent: (id: string | null) => Student | undefined,
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('좌석 배치도');

  // Title
  ws.addRow(['좌석 배치도']);
  ws.mergeCells(1, 1, 1, seating.cols);
  const titleCell = ws.getCell(1, 1);
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Teacher position (칠판)
  ws.addRow([]);
  ws.addRow(['칠 판']);
  ws.mergeCells(3, 1, 3, seating.cols);
  const boardCell = ws.getCell(3, 1);
  boardCell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  boardCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF64748B' } };
  boardCell.alignment = { horizontal: 'center', vertical: 'middle' };

  ws.addRow([]);

  // Seats
  for (let r = 0; r < seating.rows; r++) {
    const rowData: string[] = [];
    for (let c = 0; c < seating.cols; c++) {
      const studentId = seating.seats[r]?.[c] ?? null;
      const student = getStudent(studentId);
      rowData.push(student ? student.name : '');
    }
    const excelRow = ws.addRow(rowData);
    excelRow.height = 30;
    excelRow.eachCell((cell) => {
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
    });
  }

  // Set column widths
  for (let c = 1; c <= seating.cols; c++) {
    ws.getColumn(c).width = 12;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
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
