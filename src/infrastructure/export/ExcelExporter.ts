import ExcelJS from 'exceljs';
import type { ClassScheduleData, TeacherScheduleData, TeacherPeriod } from '@domain/entities/Timetable';
import type { SeatingData } from '@domain/entities/Seating';
import type { Student } from '@domain/entities/Student';
import { STUDENT_STATUS_LABELS } from '@domain/entities/Student';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';
import type { StudentRecord, AttendanceStats } from '@domain/entities/StudentRecord';
import type { RecordCategoryItem } from '@domain/valueObjects/RecordCategory';
import { getAttendanceStats, filterByStudent, filterByCategory, sortByDateDesc } from '@domain/rules/studentRecordRules';
import { buildPairGroups, adjustPairGroupsForRow } from '@domain/rules/seatingLayoutRules';
import type { SubjectColorMap } from '@domain/valueObjects/SubjectColor';
import { getSubjectArgb, getClassroomArgb } from '@domain/valueObjects/SubjectColor';
import type { AttendanceRecord, AttendanceStatus } from '@domain/entities/Attendance';
import { formatPeriodLabel } from '@domain/entities/Attendance';
import type { TeachingClassStudent } from '@domain/entities/TeachingClass';
import { studentKey } from '@domain/entities/TeachingClass';
import type { GroupResult } from '@domain/rules/groupingRules';
import { DEFAULT_OBSERVATION_TAGS } from '@domain/entities/Observation';
import type {
  ToolResult,
  MultiSurveyResultData,
  PollResultData,
  SurveyResultData,
  WordCloudResultData,
} from '@domain/entities/ToolResult';
import type { MultiSurveyTemplateQuestion } from '@domain/entities/ToolTemplate';
import { aggregateAll, totalParticipants, completionRate } from '@domain/rules/toolResultAggregation';
import { serializeAnswerCell, formatSubmissionLabel } from '@domain/rules/toolResultSerialization';

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
  subjectColors?: SubjectColorMap,
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
      ...DAYS.map((day) => {
        const cp = schedule[day]?.[p];
        if (!cp) return '';
        return cp.teacher ? `${cp.subject} (${cp.teacher})` : cp.subject;
      }),
    ]);
    row.eachCell((cell, colNum) => {
      if (colNum === 1) {
        applyHeaderStyle(cell);
      } else {
        const val = cell.value as string;
        const subject = val.split(' (')[0] ?? '';
        applyCellStyle(cell, getSubjectArgb(subject, subjectColors));
      }
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

export async function exportTeacherScheduleToExcel(
  schedule: TeacherScheduleData,
  maxPeriods: number,
  subjectColors?: SubjectColorMap,
  colorBy?: 'subject' | 'classroom',
  classroomColors?: SubjectColorMap,
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('교사 시간표');

  const headerRow = ws.addRow(['교시', ...DAYS]);
  headerRow.eachCell((cell) => applyHeaderStyle(cell));
  ws.getColumn(1).width = 8;
  DAYS.forEach((_, i) => { ws.getColumn(i + 2).width = 18; });

  for (let p = 0; p < maxPeriods; p++) {
    const periods = DAYS.map((day) => schedule[day]?.[p] ?? null);
    const row = ws.addRow([
      `${p + 1}교시`,
      ...periods.map((period) => {
        if (!period) return '';
        return `${period.subject} (${period.classroom})`;
      }),
    ]);
    row.eachCell((cell, colNum) => {
      if (colNum === 1) {
        applyHeaderStyle(cell);
      } else {
        const period = periods[colNum - 2] ?? null;
        if (!period) {
          applyCellStyle(cell);
          return;
        }
        const argb = colorBy === 'classroom'
          ? getClassroomArgb(period.classroom, classroomColors) ?? getSubjectArgb(period.subject, subjectColors)
          : getSubjectArgb(period.subject, subjectColors);
        applyCellStyle(cell, argb);
      }
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

/* ── 교사 시간표 엑셀 업로드/다운로드 ── */

/**
 * 교사 시간표 양식 다운로드
 * schedule이 있으면 기존 데이터를 "학반 과목" 형태로 채워서 내보낸다.
 */
export async function exportTeacherTimetableTemplate(
  maxPeriods: number,
  days: readonly string[] = DAYS,
  schedule?: TeacherScheduleData,
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('교사 시간표');

  const headerRow = ws.addRow(['교시', ...days]);
  headerRow.eachCell((cell) => applyHeaderStyle(cell));
  ws.getColumn(1).width = 8;
  for (let i = 2; i <= days.length + 1; i++) {
    ws.getColumn(i).width = 16;
  }

  for (let p = 0; p < maxPeriods; p++) {
    const cells = days.map((day) => {
      const period = schedule?.[day]?.[p];
      if (!period) return '';
      return `${period.classroom} ${period.subject}`.trim();
    });
    const row = ws.addRow([p + 1, ...cells]);
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(1).font = { bold: true };
  }

  ws.addRow([]);
  ws.addRow(['※ 입력 형식: "학반 과목" (예: 302 언매, 1-3 수학)']);
  ws.addRow(['※ 공강은 빈 칸으로 두세요']);
  ws.addRow(['※ 컴시간에서 내보내기한 파일도 업로드 가능합니다']);

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

/**
 * 교사 시간표 엑셀 파싱 (쌤핀 양식 + 컴시간 양식 자동 감지)
 */
export async function parseTeacherTimetableFromExcel(
  buffer: ArrayBuffer,
): Promise<TeacherScheduleData> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const ws = workbook.worksheets[0];
  if (!ws) return {};

  const headerRow = findHeaderRow(ws);
  if (headerRow === -1) return {};

  if (detectComTimeFormat(ws, headerRow)) {
    return parseComTimeFormat(ws, headerRow);
  }
  return parseSsampinFormat(ws, headerRow);
}

const DAY_TOKENS = ['월', '화', '수', '목', '금', '토'] as const;

/**
 * 요일 헤더 행 찾기
 *
 * 제목/정보 행이 앞에 올 수 있으므로 상위 20행을 스캔하여
 * 서로 다른 열에 2개 이상의 요일 마커(월/화/수/목/금/토)가 있는 행을 헤더로 판정.
 * 실패 시 -1.
 */
function findHeaderRow(ws: ExcelJS.Worksheet): number {
  const maxScan = Math.min(ws.rowCount, 20);
  for (let r = 1; r <= maxScan; r++) {
    const row = ws.getRow(r);
    const found = new Set<string>();
    row.eachCell({ includeEmpty: false }, (cell) => {
      const val = String(cell.value ?? '').trim();
      if (!val) return;
      for (const d of DAY_TOKENS) {
        if (val === d || val.startsWith(d) || val === `${d}요일`) found.add(d);
      }
    });
    if (found.size >= 2) return r;
  }
  return -1;
}

/** 컴시간 양식 감지: 헤더 바로 아래 행의 1열이 "1(08:40)" 패턴 */
function detectComTimeFormat(ws: ExcelJS.Worksheet, headerRow: number): boolean {
  const cell = String(ws.getRow(headerRow + 1).getCell(1).value ?? '');
  return /^\d+\s*\(\d{1,2}:\d{2}\)/.test(cell);
}

function buildDayColMap(ws: ExcelJS.Worksheet, headerRow: number): Record<string, number> {
  const dayColMap: Record<string, number> = {};
  ws.getRow(headerRow).eachCell((cell, colNumber) => {
    const val = String(cell.value ?? '').trim();
    for (const d of DAY_TOKENS) {
      if (val === d || val === `${d}요일` || val.startsWith(d)) {
        if (!(d in dayColMap)) dayColMap[d] = colNumber;
      }
    }
  });
  return dayColMap;
}

function extractCellText(cellValue: unknown): string {
  if (typeof cellValue === 'object' && cellValue !== null && 'richText' in cellValue) {
    return (cellValue as { richText: { text: string }[] }).richText
      .map((r) => r.text)
      .join('');
  }
  return String(cellValue ?? '').trim();
}

/** 컴시간 양식 파싱 */
function parseComTimeFormat(ws: ExcelJS.Worksheet, headerRow: number): TeacherScheduleData {
  const dayColMap = buildDayColMap(ws, headerRow);
  const days = DAY_TOKENS.filter((d) => d in dayColMap);
  const data: Record<string, (TeacherPeriod | null)[]> = {};
  for (const day of days) data[day] = [];

  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRow) return;

    const periodRaw = String(row.getCell(1).value ?? '');
    const periodMatch = periodRaw.match(/^(\d+)/);
    if (!periodMatch) return;

    const periodIdx = parseInt(periodMatch[1]!, 10) - 1;

    for (const day of days) {
      const colNum = dayColMap[day]!;
      const text = extractCellText(row.getCell(colNum).value);

      while (data[day]!.length <= periodIdx) data[day]!.push(null);

      if (!text) {
        data[day]![periodIdx] = null;
      } else {
        const parsed = parseTeacherCell(text);
        data[day]![periodIdx] = parsed
          ? { classroom: parsed.classroom, subject: parsed.subject }
          : null;
      }
    }
  });

  return data as TeacherScheduleData;
}

/** 쌤핀 기본 양식 파싱 */
function parseSsampinFormat(ws: ExcelJS.Worksheet, headerRow: number): TeacherScheduleData {
  const dayColMap = buildDayColMap(ws, headerRow);
  const days = DAY_TOKENS.filter((d) => d in dayColMap);
  const data: Record<string, (TeacherPeriod | null)[]> = {};
  for (const day of days) data[day] = [];

  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRow) return;

    const periodRaw = row.getCell(1).value;
    // "1교시" 또는 숫자
    const periodStr = String(periodRaw ?? '').replace('교시', '').trim();
    const period = parseInt(periodStr, 10);
    if (isNaN(period) || period <= 0) return;

    const periodIdx = period - 1;

    for (const day of days) {
      const text = extractCellText(row.getCell(dayColMap[day]!).value);

      while (data[day]!.length <= periodIdx) data[day]!.push(null);

      if (!text) {
        data[day]![periodIdx] = null;
      } else {
        const parsed = parseTeacherCell(text);
        data[day]![periodIdx] = parsed
          ? { classroom: parsed.classroom, subject: parsed.subject }
          : null;
      }
    }
  });

  return data as TeacherScheduleData;
}

/**
 * 셀 텍스트에서 학반 + 과목 추출
 *
 * 지원 형태:
 * - "301\nJ_심국" → classroom: "3-1", subject: "심국" (컴시간 줄바꿈)
 * - "302 언매" → classroom: "3-2", subject: "언매" (쌤핀 양식)
 * - "1-3 수학" → classroom: "1-3", subject: "수학"
 * - "언매 (3-2)" → classroom: "3-2", subject: "언매" (기존 내보내기 형식)
 */
function parseTeacherCell(text: string): { classroom: string; subject: string } | null {
  const trimmed = text.trim();

  // 기존 내보내기 형식: "과목 (학급)"
  const exportMatch = trimmed.match(/^(.+?)\s*\((.+?)\)$/);
  if (exportMatch) {
    const subject = exportMatch[1]!.trim();
    const classroom = normalizeClassroom(exportMatch[2]!.trim());
    if (subject) return { classroom, subject };
  }

  // 줄바꿈으로 분리 (컴시간)
  const lines = trimmed.split(/[\n\r]+/).map((s) => s.trim()).filter(Boolean);

  if (lines.length >= 2) {
    const classroom = normalizeClassroom(lines[0]!);
    const subject = normalizeSubject(lines[1]!);
    return { classroom, subject };
  }

  if (lines.length === 1) {
    // "302 언매" 또는 "1-3 수학"
    const match = lines[0]!.match(/^(\d{3}|\d+-\d+)\s+(.+)$/);
    if (match) {
      return {
        classroom: normalizeClassroom(match[1]!),
        subject: normalizeSubject(match[2]!),
      };
    }
  }

  return null;
}

/** 학반 정규화: "301" → "3-1", "3-2" → "3-2" */
function normalizeClassroom(raw: string): string {
  const t = raw.trim();
  if (/^\d+-\d+$/.test(t)) return t;
  if (/^\d{3}$/.test(t)) {
    const grade = t[0];
    const cls = parseInt(t.substring(1), 10);
    return `${grade}-${cls}`;
  }
  return t;
}

/** 과목명 정규화: "J_심국" → "심국", "언매" → "언매" */
function normalizeSubject(raw: string): string {
  const t = raw.trim();
  const m = t.match(/^[A-Z]_(.+)$/i);
  if (m) return m[1]!;
  return t;
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

  const isPairMode = !!seating.pairMode;
  const oddMode = seating.oddColumnMode ?? 'single';

  // 짝꿍 모드: 짝 그룹 사이에 빈 gap 열 삽입
  const colMap: Array<{ type: 'seat'; col: number } | { type: 'gap' }> = [];
  if (isPairMode) {
    const groups = buildPairGroups(seating.cols, oddMode);
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi]!;
      if (gi > 0) colMap.push({ type: 'gap' });
      for (let c = g.startCol; c <= g.endCol; c++) {
        colMap.push({ type: 'seat', col: c });
      }
    }
  } else {
    for (let c = 0; c < seating.cols; c++) {
      colMap.push({ type: 'seat', col: c });
    }
  }
  const totalExcelCols = colMap.length;

  // 짝수 열 + triple 모드에서 행별 3인 조정 여부
  const useRowAdjust = isPairMode && oddMode === 'triple' && seating.cols % 2 === 0;
  const baseGroups = useRowAdjust ? buildPairGroups(seating.cols, 'single') : [];

  const rosterColStart = totalExcelCols + 2; // 1-indexed; +1 은 간격열

  // Row 1: 제목
  const title = formatSeatingTitle(className);
  ws.addRow([title]);
  ws.mergeCells(1, 1, 1, totalExcelCols);
  const titleCell = ws.getCell(1, 1);
  titleCell.font = { bold: true, size: 16 };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 2: 빈 행
  ws.addRow([]);

  const gridStartRow = 3;

  // 좌석 그리드 (뒷자리가 위, 앞자리가 아래)
  for (let displayR = 0; displayR < seating.rows; displayR++) {
    const actualR = seating.rows - 1 - displayR;
    const rowData: string[] = [];
    for (const desc of colMap) {
      if (desc.type === 'gap') {
        rowData.push('');
      } else {
        const mirroredCol = seating.cols - 1 - desc.col;
        const studentId = seating.seats[actualR]?.[mirroredCol] ?? null;
        const student = getStudent(studentId);
        rowData.push(student ? student.name : '');
      }
    }
    const excelRow = ws.addRow(rowData);
    excelRow.height = 30;
    for (let i = 0; i < colMap.length; i++) {
      const excelColNum = i + 1;
      const cell = ws.getCell(excelRow.number, excelColNum);
      if (colMap[i]!.type === 'gap') {
        // gap 열: 테두리 없음
        continue;
      }
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

    // 짝수 열 triple 모드: 행별로 3인 그룹이 형성되면 gap 및 인접 좌석 테두리 연결
    if (useRowAdjust) {
      const seatRowData = seating.seats[actualR] ?? [];
      const adjustedGroups = adjustPairGroupsForRow(baseGroups, seatRowData);

      if (adjustedGroups.length !== baseGroups.length) {
        const thinBorder = { style: 'thin' as const, color: { argb: 'FFD1D5DB' } };
        for (const adjGroup of adjustedGroups) {
          if (adjGroup.size <= 2) continue;
          // 학생이 있는 그룹만 처리
          let hasStudents = false;
          for (let c = adjGroup.startCol; c <= adjGroup.endCol; c++) {
            if (seatRowData[c] != null) { hasStudents = true; break; }
          }
          if (!hasStudents) continue;
          // 이 triple 그룹 범위 안에 있는 gap의 인접 좌석 테두리 연결
          for (let ci = 0; ci < colMap.length; ci++) {
            if (colMap[ci]!.type !== 'gap') continue;
            let prevCol = -1;
            let nextCol = -1;
            let prevCi = -1;
            let nextCi = -1;
            for (let pi = ci - 1; pi >= 0; pi--) {
              const d = colMap[pi]!;
              if (d.type === 'seat') { prevCol = d.col; prevCi = pi; break; }
            }
            for (let ni = ci + 1; ni < colMap.length; ni++) {
              const d = colMap[ni]!;
              if (d.type === 'seat') { nextCol = d.col; nextCi = ni; break; }
            }
            if (prevCol < 0 || nextCol < 0) continue;
            // 좌우 반전 적용: colMap 열 → 실제 데이터 열
            const prevMirCol = seating.cols - 1 - prevCol;
            const nextMirCol = seating.cols - 1 - nextCol;
            if (
              prevMirCol >= adjGroup.startCol && prevMirCol <= adjGroup.endCol &&
              nextMirCol >= adjGroup.startCol && nextMirCol <= adjGroup.endCol
            ) {
              // 이전 좌석: 오른쪽 테두리 제거
              const prevCell = ws.getCell(excelRow.number, prevCi + 1);
              prevCell.border = { top: thinBorder, bottom: thinBorder, left: thinBorder };
              // 다음 좌석: 왼쪽 테두리 제거
              const nextCell = ws.getCell(excelRow.number, nextCi + 1);
              nextCell.border = { top: thinBorder, bottom: thinBorder, right: thinBorder };
            }
          }
        }
      }
    }
  }

  // 빈 행 + 교탁 (그리드 아래)
  const gyotakRowNum = gridStartRow + seating.rows;
  ws.addRow([]);
  ws.mergeCells(gyotakRowNum, 1, gyotakRowNum, totalExcelCols);
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
  for (let i = 0; i < colMap.length; i++) {
    const excelColNum = i + 1;
    ws.getColumn(excelColNum).width = colMap[i]!.type === 'gap' ? 2 : 12;
  }
  ws.getColumn(totalExcelCols + 1).width = 3;       // 간격열
  ws.getColumn(rosterColStart).width = 6;            // 번호
  ws.getColumn(rosterColStart + 1).width = 12;       // 이름

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

export async function exportRosterToExcel(
  students: readonly Student[],
  grade?: string,
  className?: string,
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('명렬표');

  const headerRow = ws.addRow([
    '학년', '반', '번호', '성명',
    '학생 연락처', '보호자1 관계', '보호자1 연락처',
    '보호자2 관계', '보호자2 연락처', '생년월일', '비고',
  ]);
  headerRow.eachCell((cell) => applyHeaderStyle(cell));

  ws.getColumn(1).width = 8;   // 학년
  ws.getColumn(2).width = 8;   // 반
  ws.getColumn(3).width = 8;   // 번호
  ws.getColumn(4).width = 16;  // 성명
  ws.getColumn(5).width = 18;  // 학생 연락처
  ws.getColumn(6).width = 12;  // 보호자1 관계
  ws.getColumn(7).width = 18;  // 보호자1 연락처
  ws.getColumn(8).width = 12;  // 보호자2 관계
  ws.getColumn(9).width = 18;  // 보호자2 연락처
  ws.getColumn(10).width = 14; // 생년월일
  ws.getColumn(11).width = 10; // 비고

  // "3학년 4반" 같은 합성 문자열에서 학년/반 숫자 분리
  let gradeStr = grade ?? '';
  let classStr = className ?? '';
  if (!gradeStr && classStr) {
    const m = classStr.match(/(\d+)\s*학년\s*(\d+)\s*반/);
    if (m) {
      gradeStr = m[1] ?? '';
      classStr = m[2] ?? '';
    }
  }

  const sorted = [...students].sort((a, b) => (a.studentNumber ?? 0) - (b.studentNumber ?? 0));

  for (const student of sorted) {
    const numberStr = String(student.studentNumber ?? '').padStart(2, '0');
    const remarks = student.status && student.status !== 'active'
      ? STUDENT_STATUS_LABELS[student.status] + (student.statusNote ? ` (${student.statusNote})` : '')
      : student.isVacant ? '결번' : '';
    const bgColor = (student.status && student.status !== 'active') || student.isVacant ? 'FFEEEEEE' : undefined;

    const row = ws.addRow([
      gradeStr,
      classStr,
      numberStr,
      student.name,
      student.phone ?? '',
      student.parentPhoneLabel ?? '',
      student.parentPhone ?? '',
      student.parentPhone2Label ?? '',
      student.parentPhone2 ?? '',
      student.birthDate ?? '',
      remarks,
    ]);
    row.eachCell((cell) => applyCellStyle(cell, bgColor));
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

export async function parseRosterFromExcel(
  buffer: ArrayBuffer,
): Promise<Array<{ name: string; studentNumber: number; phone: string; parentPhone: string; parentPhoneLabel?: string; parentPhone2?: string; parentPhone2Label?: string; birthDate?: string; isVacant: boolean; grade?: string; className?: string }>> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const ws = workbook.worksheets[0];
  const result: Array<{ name: string; studentNumber: number; phone: string; parentPhone: string; parentPhoneLabel?: string; parentPhone2?: string; parentPhone2Label?: string; birthDate?: string; isVacant: boolean; grade?: string; className?: string }> = [];

  if (!ws) return result;

  // ── 헤더 자동 감지 ──
  let gradeCol = -1;
  let classCol = -1;
  let numCol = 1;
  let nameCol = 2;
  let phoneCol = 3;
  let parentPhoneLabelCol = 4; // 보호자1 관계
  let parentPhoneCol = 5; // 보호자1 연락처 (새 형식: 4=관계, 5=연락처)
  let parentPhone2LabelCol = 6; // 보호자2 관계
  let parentPhone2Col = 7; // 보호자2 연락처
  let birthDateCol = 8; // 생년월일
  let remarksCol = 9;

  const headerRow = ws.getRow(1);
  if (headerRow) {
    headerRow.eachCell((cell, colNumber) => {
      const val = String(cell.value ?? '').trim().replace(/\s/g, '');
      if (/^(학년|grade)$/i.test(val)) gradeCol = colNumber;
      else if (/^(반|학급|class|className)$/i.test(val)) classCol = colNumber;
      else if (/^(번호|No|no|#|학번)$/i.test(val)) numCol = colNumber;
      else if (/^(이름|성명|학생명|name)$/i.test(val)) nameCol = colNumber;
      else if (/^(전화|연락처|학생연락처|학생전화|phone)$/i.test(val)) phoneCol = colNumber;
      else if (/^(보호자1?관계|관계|relationship)$/i.test(val)) parentPhoneLabelCol = colNumber;
      else if (/^(학부모|보호자|학부모연락처|보호자연락처|보호자1연락처|parentPhone)$/i.test(val)) parentPhoneCol = colNumber;
      else if (/^(보호자2관계)$/i.test(val)) parentPhone2LabelCol = colNumber;
      else if (/^(보호자2|보호자2연락처|parentPhone2)$/i.test(val)) parentPhone2Col = colNumber;
      else if (/^(생년월일|생일|birthDate|birthday|birth)$/i.test(val)) birthDateCol = colNumber;
      else if (/^(비고|remarks|메모|결번)$/i.test(val)) remarksCol = colNumber;
    });
  }

  // ── 헤더 유무 판단 ──
  const firstCellValue = String(headerRow?.getCell(numCol).value ?? '');
  const hasHeader = isNaN(parseInt(firstCellValue, 10));
  const startRow = hasHeader ? 2 : 1;

  ws.eachRow((row, rowNumber) => {
    if (rowNumber < startRow) return;

    const numRaw = row.getCell(numCol).value;
    const studentNumber = parseInt(String(numRaw ?? ''), 10);
    const hasValidNumber = !isNaN(studentNumber) && studentNumber > 0;

    const name = String(row.getCell(nameCol).value ?? '').trim();

    // 번호도 없고 이름도 없으면 스킵
    if (!hasValidNumber && !name) return;

    // 이름 없이 번호만 있는 경우 — NEIS 양식은 성명 없이 번호만 있을 수 있음
    const remarks = String(row.getCell(remarksCol).value ?? '').trim();
    const isVacant = remarks.includes('결번');
    if (!name && !isVacant && !hasValidNumber) return;

    const rowGrade = gradeCol > 0 ? String(row.getCell(gradeCol).value ?? '').trim() : undefined;
    const rowClassName = classCol > 0 ? String(row.getCell(classCol).value ?? '').trim() : undefined;

    const phone = String(row.getCell(phoneCol).value ?? '').trim();
    const parentPhoneLabel = String(row.getCell(parentPhoneLabelCol).value ?? '').trim();
    const parentPhone = String(row.getCell(parentPhoneCol).value ?? '').trim();
    const parentPhone2Label = String(row.getCell(parentPhone2LabelCol).value ?? '').trim();
    const parentPhone2 = String(row.getCell(parentPhone2Col).value ?? '').trim();

    let birthDate = '';
    const rawBirth = row.getCell(birthDateCol).value;
    if (rawBirth instanceof Date) {
      const y = rawBirth.getFullYear();
      const m = String(rawBirth.getMonth() + 1).padStart(2, '0');
      const d = String(rawBirth.getDate()).padStart(2, '0');
      birthDate = `${y}-${m}-${d}`;
    } else if (rawBirth) {
      birthDate = String(rawBirth).trim();
    }

    result.push({
      name,
      studentNumber: hasValidNumber ? studentNumber : -1,
      phone,
      parentPhone,
      ...(parentPhoneLabel ? { parentPhoneLabel } : {}),
      ...(parentPhone2 ? { parentPhone2 } : {}),
      ...(parentPhone2Label ? { parentPhone2Label } : {}),
      ...(birthDate ? { birthDate } : {}),
      isVacant,
      ...(rowGrade !== undefined ? { grade: rowGrade } : {}),
      ...(rowClassName !== undefined ? { className: rowClassName } : {}),
    });
  });

  // 번호 없는 학생(-1)에 자동 번호 부여
  let autoNum = 1;
  const usedNumbers = new Set(result.filter(s => s.studentNumber > 0).map(s => s.studentNumber));
  for (const student of result) {
    if (student.studentNumber === -1) {
      while (usedNumbers.has(autoNum)) autoNum++;
      student.studentNumber = autoNum;
      usedNumbers.add(autoNum);
      autoNum++;
    }
  }

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

const COUNSELING_METHOD_MAP: Record<string, string> = {
  phone: '전화',
  face: '대면',
  online: '온라인',
  visit: '가정방문',
  text: '문자',
  other: '기타',
};

const CATEGORY_ROW_COLORS: Record<string, string> = {
  attendance: 'FFFEE2E2',
  counseling: 'FFDBEAFE',
  life: 'FFD1FAE5',
};

export async function exportStudentRecordsToExcel(
  records: readonly StudentRecord[],
  students: readonly Student[],
  categories: readonly RecordCategoryItem[],
  period?: { start: string; end: string },
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();

  // Filter records by period if provided
  const filteredRecords = period
    ? records.filter((r) => r.date >= period.start && r.date <= period.end)
    : records;

  // Helper maps
  const studentMap = new Map<string, Student>(students.map((s) => [s.id, s]));
  const categoryMap = new Map<string, string>(categories.map((c) => [c.id, c.name]));

  // ─── Sheet 1: 전체 기록 ────────────────────────────────────────────────────
  const ws1 = workbook.addWorksheet('전체 기록');

  const sheet1Headers = ['날짜', '학생', '카테고리', '서브카테고리', '상담방법', '내용', '후속조치'];
  const sheet1HeaderRow = ws1.addRow(sheet1Headers);
  sheet1HeaderRow.eachCell((cell) => applyHeaderStyle(cell));

  ws1.getColumn(1).width = 14;
  ws1.getColumn(2).width = 12;
  ws1.getColumn(3).width = 14;
  ws1.getColumn(4).width = 16;
  ws1.getColumn(5).width = 12;
  ws1.getColumn(6).width = 40;
  ws1.getColumn(7).width = 20;

  const sortedRecords = [...filteredRecords].sort((a, b) => b.date.localeCompare(a.date));

  for (const record of sortedRecords) {
    const student = studentMap.get(record.studentId);
    const studentName = student?.name ?? '';
    const categoryName = categoryMap.get(record.category) ?? record.category;
    const method = record.method ? (COUNSELING_METHOD_MAP[record.method] ?? '') : '';
    const bgColor = CATEGORY_ROW_COLORS[record.category] ?? 'FFF3F4F6';

    const row = ws1.addRow([
      record.date,
      studentName,
      categoryName,
      record.subcategory,
      method,
      record.content,
      '',
    ]);
    row.eachCell((cell) => applyCellStyle(cell, bgColor));
    // Left-align content column
    ws1.getCell(row.number, 6).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  }

  // ─── Sheet 2: 출결 통계 ───────────────────────────────────────────────────
  const ws2 = workbook.addWorksheet('출결 통계');

  const sheet2Headers = ['번호', '이름', '결석', '지각', '조퇴', '결과', '합계'];
  const sheet2HeaderRow = ws2.addRow(sheet2Headers);
  sheet2HeaderRow.eachCell((cell) => applyHeaderStyle(cell));

  ws2.getColumn(1).width = 8;
  ws2.getColumn(2).width = 12;
  ws2.getColumn(3).width = 8;
  ws2.getColumn(4).width = 8;
  ws2.getColumn(5).width = 8;
  ws2.getColumn(6).width = 8;
  ws2.getColumn(7).width = 8;

  const activeStudents = [...students]
    .filter((s) => !s.isVacant)
    .sort((a, b) => (a.studentNumber ?? 0) - (b.studentNumber ?? 0));

  let totalAbsent = 0;
  let totalLate = 0;
  let totalEarlyLeave = 0;
  let totalResultAbsent = 0;
  let totalSum = 0;

  for (const student of activeStudents) {
    const stats: AttendanceStats = getAttendanceStats(filteredRecords, student.id);
    const sum = stats.absent + stats.late + stats.earlyLeave + stats.resultAbsent;

    totalAbsent += stats.absent;
    totalLate += stats.late;
    totalEarlyLeave += stats.earlyLeave;
    totalResultAbsent += stats.resultAbsent;
    totalSum += sum;

    const row = ws2.addRow([
      String(student.studentNumber ?? '').padStart(2, '0'),
      student.name,
      stats.absent,
      stats.late,
      stats.earlyLeave,
      stats.resultAbsent,
      sum,
    ]);
    row.eachCell((cell) => applyCellStyle(cell));

    // Highlight absent >= 3
    if (stats.absent >= 3) {
      ws2.getCell(row.number, 3).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFEE2E2' },
      };
    }
  }

  // Bottom totals row
  const totalRow = ws2.addRow(['합계', '', totalAbsent, totalLate, totalEarlyLeave, totalResultAbsent, totalSum]);
  totalRow.eachCell((cell) => applyHeaderStyle(cell));

  // ─── Sheet 3: 학생별 요약 ─────────────────────────────────────────────────
  const ws3 = workbook.addWorksheet('학생별 요약');

  const sheet3Headers = ['번호', '이름', '총기록', '출결', '상담', '생활', '최근기록일'];
  const sheet3HeaderRow = ws3.addRow(sheet3Headers);
  sheet3HeaderRow.eachCell((cell) => applyHeaderStyle(cell));

  ws3.getColumn(1).width = 8;
  ws3.getColumn(2).width = 12;
  ws3.getColumn(3).width = 8;
  ws3.getColumn(4).width = 8;
  ws3.getColumn(5).width = 8;
  ws3.getColumn(6).width = 8;
  ws3.getColumn(7).width = 14;

  for (const student of activeStudents) {
    const studentRecords = filteredRecords.filter((r) => r.studentId === student.id);
    const totalCount = studentRecords.length;
    const attendanceCount = studentRecords.filter((r) => r.category === 'attendance').length;
    const counselingCount = studentRecords.filter((r) => r.category === 'counseling').length;
    const lifeCount = studentRecords.filter((r) => r.category === 'life').length;

    const latestDate = studentRecords.reduce<string>((latest, r) => {
      return r.date > latest ? r.date : latest;
    }, '');

    const row = ws3.addRow([
      String(student.studentNumber ?? '').padStart(2, '0'),
      student.name,
      totalCount,
      attendanceCount,
      counselingCount,
      lifeCount,
      latestDate,
    ]);
    row.eachCell((cell) => applyCellStyle(cell));
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

function getEventGradeText(event: SchoolEvent): string {
  if (!event.neis?.gradeYn) return '';
  const { grade1, grade2, grade3 } = event.neis.gradeYn;
  if (grade1 && grade2 && grade3) return '전학년';
  const grades: string[] = [];
  if (grade1) grades.push('1');
  if (grade2) grades.push('2');
  if (grade3) grades.push('3');
  return grades.join(',');
}

function getEventSourceText(event: SchoolEvent): string {
  switch (event.source) {
    case 'neis': return 'NEIS';
    case 'google': return '구글';
    default: return '쌤핀';
  }
}

export async function exportEventsToExcel(
  events: readonly SchoolEvent[],
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('학교 일정');

  const headerRow = ws.addRow(['날짜', '제목', '카테고리', '시간', '장소', '설명', '해당학년', '출처']);
  headerRow.eachCell((cell) => applyHeaderStyle(cell));

  ws.getColumn(1).width = 14;
  ws.getColumn(2).width = 24;
  ws.getColumn(3).width = 12;
  ws.getColumn(4).width = 16;
  ws.getColumn(5).width = 16;
  ws.getColumn(6).width = 30;
  ws.getColumn(7).width = 10;
  ws.getColumn(8).width = 8;

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
      getEventGradeText(event),
      getEventSourceText(event),
    ]);
    row.eachCell((cell) => applyCellStyle(cell));
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

/**
 * 학생별 기록 정리 — 학생별 시트 Excel
 */
export async function exportRecordsForSchoolReport(
  records: readonly StudentRecord[],
  students: readonly Student[],
  categories: readonly RecordCategoryItem[],
  options?: {
    period?: { start: string; end: string };
    categoryIds?: string[];
  },
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();

  // 기간 필터
  let filteredRecords: readonly StudentRecord[] = options?.period
    ? records.filter((r) => r.date >= options.period!.start && r.date <= options.period!.end)
    : records;

  // 카테고리 필터
  if (options?.categoryIds && options.categoryIds.length > 0) {
    const catSet = new Set(options.categoryIds);
    filteredRecords = filteredRecords.filter((r) => catSet.has(r.category));
  }

  const categoryMap = new Map<string, string>(categories.map((c) => [c.id, c.name]));

  const activeStudents = [...students]
    .filter((s) => !s.isVacant)
    .sort((a, b) => (a.studentNumber ?? 0) - (b.studentNumber ?? 0));

  for (const student of activeStudents) {
    const numStr = String(student.studentNumber ?? '').padStart(2, '0');
    // Excel 시트명 제한: 31자, []:/*? 불가
    const sheetName = `${numStr}_${student.name}`.replace(/[[\]:/*?\\]/g, '').slice(0, 31);
    const ws = workbook.addWorksheet(sheetName);

    ws.getColumn(1).width = 14;
    ws.getColumn(2).width = 14;
    ws.getColumn(3).width = 14;
    ws.getColumn(4).width = 40;
    ws.getColumn(5).width = 20;

    // 학생 정보
    const infoRow1 = ws.addRow(['학생 정보', `${numStr}번 ${student.name}`]);
    infoRow1.getCell(1).font = { bold: true, size: 11 };
    infoRow1.getCell(2).font = { size: 11 };

    ws.addRow([]);

    // 출결 현황
    const attendanceHeaderRow = ws.addRow(['[출결 현황]']);
    attendanceHeaderRow.getCell(1).font = { bold: true, size: 11, color: { argb: 'FF3B82F6' } };

    const attHeaders = ws.addRow(['결석', '지각', '조퇴', '결과', '합계']);
    attHeaders.eachCell((cell) => applyHeaderStyle(cell));

    const stats: AttendanceStats = getAttendanceStats(filteredRecords, student.id);
    const attSum = stats.absent + stats.late + stats.earlyLeave + stats.resultAbsent;
    const attDataRow = ws.addRow([stats.absent, stats.late, stats.earlyLeave, stats.resultAbsent, attSum]);
    attDataRow.eachCell((cell) => applyCellStyle(cell));

    ws.addRow([]);

    // 상담 기록
    const counselingRecords = sortByDateDesc(
      filterByCategory(filterByStudent(filteredRecords, student.id), 'counseling'),
    );
    const counselingHeaderRow = ws.addRow(['[상담 기록]']);
    counselingHeaderRow.getCell(1).font = { bold: true, size: 11, color: { argb: 'FF3B82F6' } };

    if (counselingRecords.length > 0) {
      const cHeaders = ws.addRow(['날짜', '구분', '상담방법', '내용', '후속조치']);
      cHeaders.eachCell((cell) => applyHeaderStyle(cell));

      for (const rec of counselingRecords) {
        const method = rec.method ? (COUNSELING_METHOD_MAP[rec.method] ?? '') : '';
        const cRow = ws.addRow([rec.date, rec.subcategory, method, rec.content, '']);
        cRow.eachCell((cell) => applyCellStyle(cell, CATEGORY_ROW_COLORS['counseling']));
        ws.getCell(cRow.number, 4).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      }
    } else {
      ws.addRow(['기록 없음']);
    }

    ws.addRow([]);

    // 생활/관찰 기록
    const lifeRecords = sortByDateDesc(
      filterByCategory(filterByStudent(filteredRecords, student.id), 'life'),
    );
    const lifeHeaderRow = ws.addRow(['[생활/관찰]']);
    lifeHeaderRow.getCell(1).font = { bold: true, size: 11, color: { argb: 'FF3B82F6' } };

    if (lifeRecords.length > 0) {
      const lHeaders = ws.addRow(['날짜', '구분', '내용']);
      lHeaders.eachCell((cell) => applyHeaderStyle(cell));

      for (const rec of lifeRecords) {
        const lRow = ws.addRow([rec.date, rec.subcategory, rec.content]);
        lRow.eachCell((cell) => applyCellStyle(cell, CATEGORY_ROW_COLORS['life']));
        ws.getCell(lRow.number, 3).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      }
    } else {
      ws.addRow(['기록 없음']);
    }

    ws.addRow([]);

    // 기타 기록 (출결, 상담, 생활 이외)
    const otherRecords = sortByDateDesc(
      filterByStudent(filteredRecords, student.id).filter(
        (r) => r.category !== 'attendance' && r.category !== 'counseling' && r.category !== 'life',
      ),
    );

    if (otherRecords.length > 0) {
      const etcHeaderRow = ws.addRow(['[기타 기록]']);
      etcHeaderRow.getCell(1).font = { bold: true, size: 11, color: { argb: 'FF3B82F6' } };

      const eHeaders = ws.addRow(['날짜', '구분', '내용']);
      eHeaders.eachCell((cell) => applyHeaderStyle(cell));

      for (const rec of otherRecords) {
        const catName = categoryMap.get(rec.category) ?? rec.category;
        const eRow = ws.addRow([rec.date, `${catName} - ${rec.subcategory}`, rec.content]);
        eRow.eachCell((cell) => applyCellStyle(cell, 'FFF3F4F6'));
        ws.getCell(eRow.number, 3).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      }
    }
  }

  const reportBuffer = await workbook.xlsx.writeBuffer();
  return reportBuffer as ArrayBuffer;
}

const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: '출석',
  absent: '결석',
  late: '지각',
  earlyLeave: '조퇴',
  classAbsence: '결과',
};

const ATTENDANCE_STATUS_BG: Record<AttendanceStatus, string> = {
  present: 'FFD1FAE5',
  absent: 'FFFEE2E2',
  late: 'FFFEF3C7',
  earlyLeave: 'FFFFEDD5',
  classAbsence: 'FFEDE9FE',
};

export async function exportAttendanceToExcel(
  records: readonly AttendanceRecord[],
  students: readonly TeachingClassStudent[],
  className: string,
  period?: { start: string; end: string },
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();

  const filtered = period
    ? records.filter((r) => r.date >= period.start && r.date <= period.end)
    : records;

  const dates = [...new Set(filtered.map((r) => r.date))].sort();

  const activeStudents = [...students]
    .filter((s) => !s.isVacant)
    .sort((a, b) => {
      if ((a.grade ?? 0) !== (b.grade ?? 0)) return (a.grade ?? 0) - (b.grade ?? 0);
      if ((a.classNum ?? 0) !== (b.classNum ?? 0)) return (a.classNum ?? 0) - (b.classNum ?? 0);
      return a.number - b.number;
    });

  const sheetPrefix = className ? `${className} ` : '';

  const ws1 = workbook.addWorksheet(`${sheetPrefix}출결 현황`.slice(0, 31));

  const headers1 = [
    '번호', '이름',
    ...dates.map((d) => {
      const m = parseInt(d.slice(5, 7), 10);
      const day = parseInt(d.slice(8, 10), 10);
      return `${m}/${day}`;
    }),
    '출석', '결석', '지각', '조퇴', '결과',
  ];
  const headerRow1 = ws1.addRow(headers1);
  headerRow1.eachCell((cell) => applyHeaderStyle(cell));

  ws1.getColumn(1).width = 6;
  ws1.getColumn(2).width = 10;
  for (let i = 3; i <= dates.length + 2; i++) {
    ws1.getColumn(i).width = 6;
  }
  for (let i = dates.length + 3; i <= dates.length + 7; i++) {
    ws1.getColumn(i).width = 6;
  }

  for (const student of activeStudents) {
    const stats: Record<AttendanceStatus, number> = {
      present: 0, absent: 0, late: 0, earlyLeave: 0, classAbsence: 0,
    };

    const rowData: (string | number)[] = [student.number, student.name];

    for (const date of dates) {
      const dayRecords = filtered.filter((r) => r.date === date);
      const studentRecord = dayRecords
        .flatMap((r) => [...r.students])
        .find((s) => studentKey(s) === studentKey(student));

      if (studentRecord) {
        const label = ATTENDANCE_STATUS_LABEL[studentRecord.status];
        rowData.push(label);
        stats[studentRecord.status]++;
      } else {
        rowData.push('');
      }
    }

    rowData.push(stats.present, stats.absent, stats.late, stats.earlyLeave, stats.classAbsence);

    const row = ws1.addRow(rowData);

    for (let i = 0; i < dates.length; i++) {
      const cell = row.getCell(i + 3);
      const val = String(cell.value ?? '');
      const statusEntry = Object.entries(ATTENDANCE_STATUS_LABEL).find(([, l]) => l === val);
      if (statusEntry) {
        const status = statusEntry[0] as AttendanceStatus;
        applyCellStyle(cell, ATTENDANCE_STATUS_BG[status]);
        cell.font = { size: 9 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else {
        applyCellStyle(cell);
      }
    }

    for (let i = dates.length; i < dates.length + 5; i++) {
      applyCellStyle(row.getCell(i + 3));
    }
    applyCellStyle(row.getCell(1));
    applyCellStyle(row.getCell(2));
    row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
  }

  const ws2 = workbook.addWorksheet(`${sheetPrefix}통계 요약`.slice(0, 31));

  const headers2 = ['번호', '이름', '총 수업일', '출석', '결석', '지각', '조퇴', '결과', '출석률'];
  const headerRow2 = ws2.addRow(headers2);
  headerRow2.eachCell((cell) => applyHeaderStyle(cell));

  ws2.getColumn(1).width = 6;
  ws2.getColumn(2).width = 10;
  for (let i = 3; i <= 9; i++) ws2.getColumn(i).width = 10;

  for (const student of activeStudents) {
    const allRecords = filtered
      .flatMap((r) => [...r.students])
      .filter((s) => studentKey(s) === studentKey(student));

    const total = allRecords.length;
    const stats: Record<AttendanceStatus, number> = {
      present: 0, absent: 0, late: 0, earlyLeave: 0, classAbsence: 0,
    };
    for (const r of allRecords) stats[r.status]++;

    const rate = total > 0 ? Math.round((stats.present / total) * 100) : 0;

    const row = ws2.addRow([
      student.number,
      student.name,
      total,
      stats.present,
      stats.absent,
      stats.late,
      stats.earlyLeave,
      stats.classAbsence,
      `${rate}%`,
    ]);
    row.eachCell((cell) => applyCellStyle(cell));
    row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };

    if (rate < 80 && total > 0) {
      row.getCell(9).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFEE2E2' },
      };
    }
  }

  const ws3 = workbook.addWorksheet(`${sheetPrefix}전체 기록`.slice(0, 31));

  const headers3 = ['날짜', '교시', '번호', '이름', '상태', '사유', '메모'];
  const headerRow3 = ws3.addRow(headers3);
  headerRow3.eachCell((cell) => applyHeaderStyle(cell));

  ws3.getColumn(1).width = 12;
  ws3.getColumn(2).width = 6;
  ws3.getColumn(3).width = 6;
  ws3.getColumn(4).width = 10;
  ws3.getColumn(5).width = 8;
  ws3.getColumn(6).width = 10;
  ws3.getColumn(7).width = 20;

  const sortedRecords = [...filtered].sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return a.period - b.period;
  });

  for (const record of sortedRecords) {
    for (const sa of record.students) {
      if (sa.status === 'present') continue;

      const student = activeStudents.find((s) => studentKey(s) === studentKey(sa));
      const row = ws3.addRow([
        record.date,
        formatPeriodLabel(record.period),
        sa.number,
        student?.name ?? '',
        ATTENDANCE_STATUS_LABEL[sa.status],
        sa.reason ?? '',
        sa.memo ?? '',
      ]);
      row.eachCell((cell) => applyCellStyle(cell));
      row.getCell(7).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

export async function generateTeachingClassRosterTemplate(): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('수업반 명렬표');

  // Column widths
  ws.getColumn(1).width = 8;  // 학년
  ws.getColumn(2).width = 8;  // 반
  ws.getColumn(3).width = 8;  // 번호
  ws.getColumn(4).width = 16; // 이름
  ws.getColumn(5).width = 12; // 비고

  // Header row
  const headers = ['학년', '반', '번호', '이름', '비고'];
  const headerRow = ws.addRow(headers);
  headerRow.height = 22;
  headerRow.eachCell((cell) => applyHeaderStyle(cell));

  // Example rows (light gray text)
  const examples = [
    [2, 3, 1, '홍길동', ''],
    [2, 5, 2, '김철수', ''],
    ['', '', 3, '', '결번'],
  ];

  for (const exampleData of examples) {
    const row = ws.addRow(exampleData);
    row.height = 20;
    row.eachCell({ includeEmpty: true }, (cell) => {
      applyCellStyle(cell);
      cell.font = { color: { argb: 'FFAAAAAA' }, italic: true };
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

export async function parseTeachingClassRosterFromExcel(
  buffer: ArrayBuffer,
): Promise<TeachingClassStudent[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const ws = workbook.worksheets[0];
  const result: TeachingClassStudent[] = [];

  if (!ws) return result;

  // ── 헤더 자동 감지 ──
  let numCol = 1;
  let nameCol = 2;
  let gradeCol = -1;
  let classCol = -1;
  let remarksCol = -1;

  const headerRow = ws.getRow(1);
  if (headerRow) {
    headerRow.eachCell((cell, colNumber) => {
      const val = String(cell.value ?? '').trim().replace(/\s/g, '');
      if (/^(번호|No|no|#|학번)$/i.test(val)) numCol = colNumber;
      else if (/^(이름|성명|학생명|name)$/i.test(val)) nameCol = colNumber;
      else if (/^(학년|grade)$/i.test(val)) gradeCol = colNumber;
      else if (/^(반|학급|class)$/i.test(val)) classCol = colNumber;
      else if (/^(비고|remarks|메모|결번)$/i.test(val)) remarksCol = colNumber;
    });
  }

  // ── 헤더 유무 판단 ──
  const firstCellValue = String(headerRow?.getCell(numCol).value ?? '');
  const hasHeader = isNaN(parseInt(firstCellValue, 10));
  const startRow = hasHeader ? 2 : 1;

  const mutableResult: Array<{
    number: number;
    name: string;
    memo?: string;
    grade?: number;
    classNum?: number;
    isVacant?: boolean;
  }> = [];

  ws.eachRow((row, rowNumber) => {
    if (rowNumber < startRow) return;

    const numRaw = row.getCell(numCol).value;
    const parsedNumber = parseInt(String(numRaw ?? ''), 10);
    const hasValidNumber = !isNaN(parsedNumber) && parsedNumber > 0;

    const name = String(row.getCell(nameCol).value ?? '').trim();

    // 번호도 없고 이름도 없으면 스킵
    if (!hasValidNumber && !name) return;

    const remarks = remarksCol > 0 ? String(row.getCell(remarksCol).value ?? '').trim() : '';
    const isVacant = remarks.includes('결번') || (!name && hasValidNumber);

    const gradeRaw = gradeCol > 0 ? parseInt(String(row.getCell(gradeCol).value ?? ''), 10) : NaN;
    const classRaw = classCol > 0 ? parseInt(String(row.getCell(classCol).value ?? ''), 10) : NaN;

    mutableResult.push({
      number: hasValidNumber ? parsedNumber : -1,
      name,
      ...(remarks && !isVacant ? { memo: remarks } : {}),
      ...(!isNaN(gradeRaw) && gradeRaw > 0 ? { grade: gradeRaw } : {}),
      ...(!isNaN(classRaw) && classRaw > 0 ? { classNum: classRaw } : {}),
      ...(isVacant ? { isVacant: true } : {}),
    });
  });

  // 번호 없는 학생(-1)에 자동 번호 부여
  let autoNum = 1;
  const usedNumbers = new Set(mutableResult.filter(s => s.number > 0).map(s => s.number));
  for (const student of mutableResult) {
    if (student.number === -1) {
      while (usedNumbers.has(autoNum)) autoNum++;
      student.number = autoNum;
      usedNumbers.add(autoNum);
      autoNum++;
    }
  }

  for (const s of mutableResult) {
    result.push(s as TeachingClassStudent);
  }

  return result;
}

/**
 * 모둠 편성 결과를 Excel로 내보내기
 */
export async function exportGroupingToExcel(
  groups: readonly GroupResult[],
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('모둠 편성');

  // 제목
  const titleRow = ws.addRow(['모둠 편성 결과']);
  titleRow.font = { bold: true, size: 16 };
  ws.mergeCells(1, 1, 1, groups.length);
  titleRow.alignment = { horizontal: 'center' };
  ws.addRow([]);

  // 모둠 헤더
  const headerRow = ws.addRow(groups.map((g) => g.leaderName ? `${g.label} (모둠장: ${g.leaderName})` : g.label));
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
    cell.alignment = { horizontal: 'center' };
    cell.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    };
  });

  // 인원수 행
  const countRow = ws.addRow(groups.map((g) => `${g.members.length}명`));
  countRow.eachCell((cell) => {
    cell.font = { size: 10, color: { argb: 'FF666666' } };
    cell.alignment = { horizontal: 'center' };
    cell.border = {
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    };
  });

  // 멤버 행들
  const maxMembers = Math.max(...groups.map((g) => g.members.length));
  for (let row = 0; row < maxMembers; row++) {
    const dataRow = ws.addRow(groups.map((g) => {
      const m = g.members[row];
      if (!m) return '';
      const prefix = m.number != null ? `${m.number}번 ` : '';
      const suffix = m.name === g.leaderName ? ' ★' : '';
      const roleSuffix = m.role ? ` (${m.role})` : '';
      return `${prefix}${m.name}${suffix}${roleSuffix}`;
    }));
    dataRow.eachCell((cell, colNumber) => {
      const group = groups[colNumber - 1];
      const member = group?.members[row];
      cell.alignment = { horizontal: 'center' };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        left: { style: 'thin' },
        right: { style: 'thin' },
      };
      if (member?.name === group?.leaderName) {
        cell.font = { bold: true, color: { argb: 'FFD97706' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7ED' } };
      }
    });
  }

  // 열 너비 자동 조정
  for (let i = 1; i <= groups.length; i++) {
    ws.getColumn(i).width = 18;
  }

  return await wb.xlsx.writeBuffer() as ArrayBuffer;
}

/* ────────────────────────────────────────────────── */
/* 관찰 기록 내보내기                                    */
/* ────────────────────────────────────────────────── */

export interface ObservationExportRecord {
  readonly studentNumber: number;
  readonly studentName: string;
  readonly date: string;
  readonly tags: readonly string[];
  readonly content: string;
}

// 태그별 배경색 (ARGB)
const TAG_FILL_COLORS: Record<string, string> = {
  '교과역량': 'FFDBEAFE',
  '학습태도': 'FFDCFCE7',
  '진로흥미': 'FFEDE9FE',
  '특이사항': 'FFFEF3C7',
};
const TAG_FILL_DEFAULT = 'FFF1F5F9';

export async function exportObservationsToExcel(
  records: readonly ObservationExportRecord[],
  className: string,
  period?: { start: string; end: string },
  filterTags?: string[],
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();

  const periodFiltered = period
    ? records.filter((r) => r.date >= period.start && r.date <= period.end)
    : records;

  // 태그 필터: filterTags가 있으면 해당 태그 중 하나라도 포함된 기록만
  const filtered = filterTags && filterTags.length > 0
    ? periodFiltered.filter((r) => r.tags.some((t) => filterTags.includes(t)))
    : periodFiltered;

  const sorted = [...filtered].sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    return a.studentNumber - b.studentNumber;
  });

  // Sheet 1: 날짜순 전체기록
  const sheetName = `${className} 관찰기록`.slice(0, 31);
  const ws = workbook.addWorksheet(sheetName);

  const headers = ['번호', '이름', '날짜', '태그', '관찰 내용'];
  const headerRow = ws.addRow(headers);
  headerRow.eachCell((cell) => applyHeaderStyle(cell));

  ws.getColumn(1).width = 6;
  ws.getColumn(2).width = 10;
  ws.getColumn(3).width = 12;
  ws.getColumn(4).width = 20;
  ws.getColumn(5).width = 60;

  for (const record of sorted) {
    const tagText = record.tags.join(', ');
    const row = ws.addRow([
      record.studentNumber,
      record.studentName,
      record.date,
      tagText,
      record.content,
    ]);
    // 태그 셀 배경색: 첫 번째 태그 기준
    const firstTag = record.tags[0] ?? '';
    const tagBg = TAG_FILL_COLORS[firstTag] ?? TAG_FILL_DEFAULT;
    row.eachCell((cell, colNumber) => {
      if (colNumber === 4) {
        applyCellStyle(cell, tagBg);
      } else if (colNumber === 5) {
        applyCellStyle(cell);
        cell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
      } else {
        applyCellStyle(cell);
      }
    });
  }

  // Sheet 2: 학생별 요약 (태그별 기록 수 컬럼 포함)
  const ws2 = workbook.addWorksheet(`${className} 학생별 요약`.slice(0, 31));
  const knownTags: string[] = [...DEFAULT_OBSERVATION_TAGS];
  const headers2 = ['번호', '이름', '기록 수', '최근 기록일', ...knownTags, '기타'];
  const headerRow2 = ws2.addRow(headers2);
  headerRow2.eachCell((cell) => applyHeaderStyle(cell));

  ws2.getColumn(1).width = 6;
  ws2.getColumn(2).width = 10;
  ws2.getColumn(3).width = 10;
  ws2.getColumn(4).width = 14;
  knownTags.forEach((_, i) => { ws2.getColumn(5 + i).width = 12; });
  ws2.getColumn(5 + knownTags.length).width = 12;

  const studentMap = new Map<number, {
    name: string;
    count: number;
    lastDate: string;
    tags: Map<string, number>;
  }>();

  for (const r of sorted) {
    const existing = studentMap.get(r.studentNumber);
    if (existing) {
      existing.count++;
      if (r.date > existing.lastDate) existing.lastDate = r.date;
      for (const t of r.tags) {
        existing.tags.set(t, (existing.tags.get(t) ?? 0) + 1);
      }
    } else {
      const tags = new Map<string, number>();
      for (const t of r.tags) tags.set(t, 1);
      studentMap.set(r.studentNumber, {
        name: r.studentName,
        count: 1,
        lastDate: r.date,
        tags,
      });
    }
  }

  const studentEntries = [...studentMap.entries()].sort(([a], [b]) => a - b);
  for (const [num, info] of studentEntries) {
    const tagCounts = knownTags.map((tag) => info.tags.get(tag) ?? 0);
    const otherCount = [...info.tags.entries()]
      .filter(([tag]) => !knownTags.includes(tag))
      .reduce((sum, [, cnt]) => sum + cnt, 0);
    const row = ws2.addRow([num, info.name, info.count, info.lastDate, ...tagCounts, otherCount]);
    row.eachCell((cell, colNumber) => {
      // 태그별 컬럼에 배경색 적용
      const tagIndex = colNumber - 5; // 5번 컬럼부터 태그
      if (tagIndex >= 0 && tagIndex < knownTags.length) {
        const tag = knownTags[tagIndex] ?? '';
        const bg = TAG_FILL_COLORS[tag] ?? TAG_FILL_DEFAULT;
        applyCellStyle(cell, bg);
      } else {
        applyCellStyle(cell);
      }
    });
  }

  return await workbook.xlsx.writeBuffer() as ArrayBuffer;
}

/* ────────────────────────────────────────────────────────────────────── */
/*  설문·도구 결과 엑셀 내보내기 (SpreadsheetView · PastResultsView 공용) */
/* ────────────────────────────────────────────────────────────────────── */

const QUESTION_TYPE_LABEL: Record<MultiSurveyTemplateQuestion['type'], string> = {
  'single-choice': '단일 선택',
  'multi-choice': '복수 선택',
  'text': '텍스트',
  'scale': '척도',
};

/** 간이 토크나이저 — 공백/구두점 분리, 한글 2자 이상만 채택 */
function tokenizeForWordFrequency(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,.!?;:"'()[\]{}<>~`@#$%^&*+=/\\|\-—–]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2);
}

/** 요약 통계 문자열 생성 (Sheet 1 D열용) */
function formatAggregateSummary(
  question: MultiSurveyTemplateQuestion,
  data: MultiSurveyResultData,
): string {
  const aggs = aggregateAll(data);
  const agg = aggs.find((a) => a.questionId === question.id);
  if (!agg) return '';

  if (agg.type === 'choice') {
    return agg.counts
      .filter((c) => c.count > 0)
      .map((c) => `${c.optionText}: ${c.count}명 (${Math.round(c.ratio * 100)}%)`)
      .join(' · ');
  }
  if (agg.type === 'scale') {
    if (agg.total === 0) return '응답 없음';
    return `평균 ${agg.avg.toFixed(2)} · 중앙값 ${agg.median} · 응답 ${agg.total}명`;
  }
  return `응답 ${agg.total}개`;
}

/** Sheet 1: 요약 */
function addMultiSurveySummarySheet(
  workbook: ExcelJS.Workbook,
  data: MultiSurveyResultData,
): void {
  const ws = workbook.addWorksheet('요약');
  const headerRow = ws.addRow(['번호', '질문', '유형', '통계']);
  headerRow.eachCell((cell) => applyHeaderStyle(cell));
  ws.getColumn(1).width = 6;
  ws.getColumn(2).width = 40;
  ws.getColumn(3).width = 12;
  ws.getColumn(4).width = 60;

  // 메타 정보 (참여 · 완료율)
  const participants = totalParticipants(data);
  const completion = Math.round(completionRate(data) * 100);
  const metaRow = ws.addRow(['', `총 참여: ${participants}명 · 완료율: ${completion}%`, '', '']);
  metaRow.eachCell((cell) => applyCellStyle(cell));
  ws.mergeCells(metaRow.number, 2, metaRow.number, 4);

  data.questions.forEach((q, i) => {
    const row = ws.addRow([
      i + 1,
      q.question,
      QUESTION_TYPE_LABEL[q.type],
      formatAggregateSummary(q, data),
    ]);
    row.eachCell((cell) => applyCellStyle(cell));
    row.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  });
}

/** Sheet 2: 전체 응답 (피벗 테이블 — 행=응답자, 열=질문) */
function addMultiSurveyResponsesSheet(
  workbook: ExcelJS.Workbook,
  data: MultiSurveyResultData,
  anonymous: boolean,
): void {
  const ws = workbook.addWorksheet('전체 응답');

  // 헤더: 응답자 | 제출 시각 | Q1 | Q2 | ...
  const header = [
    '응답자',
    '제출 시각',
    ...data.questions.map((q, i) => `Q${i + 1}. ${q.question}`),
  ];
  const headerRow = ws.addRow(header);
  headerRow.eachCell((cell) => applyHeaderStyle(cell));
  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 20;
  data.questions.forEach((_, i) => {
    ws.getColumn(i + 3).width = 30;
  });

  // anonymous 플래그는 현재 동작에 영향 없음 (Phase 1 단일 분기)
  // 향후 로그인 기능 도입 시 이름 노출 분기에 활용
  void anonymous;

  data.submissions.forEach((sub, subIdx) => {
    const submittedAt = new Date(sub.submittedAt);
    const timeStr = `${submittedAt.getFullYear()}-${String(submittedAt.getMonth() + 1).padStart(2, '0')}-${String(submittedAt.getDate()).padStart(2, '0')} ${String(submittedAt.getHours()).padStart(2, '0')}:${String(submittedAt.getMinutes()).padStart(2, '0')}`;

    const cells: (string | number | null)[] = [
      formatSubmissionLabel(subIdx),
      timeStr,
    ];
    for (const q of data.questions) {
      const answer = sub.answers.find((a) => a.questionId === q.id);
      const { raw } = serializeAnswerCell(q, answer);
      cells.push(raw);
    }
    const row = ws.addRow(cells);
    row.eachCell((cell, colNum) => {
      // 미응답(null) 셀은 회색 배경
      if (cell.value === null && colNum > 2) {
        applyCellStyle(cell, 'FFF3F4F6');
      } else {
        applyCellStyle(cell);
      }
    });
    row.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  });
}

/** Sheet 3: 워드 빈도 (텍스트 질문이 1개 이상일 때만 생성) */
function addMultiSurveyWordFrequencySheet(
  workbook: ExcelJS.Workbook,
  data: MultiSurveyResultData,
): void {
  const textQuestions = data.questions.filter((q) => q.type === 'text');
  if (textQuestions.length === 0) return;

  const freq = new Map<string, number>();
  for (const sub of data.submissions) {
    for (const q of textQuestions) {
      const ans = sub.answers.find((a) => a.questionId === q.id);
      if (!ans || typeof ans.value !== 'string') continue;
      for (const word of tokenizeForWordFrequency(ans.value)) {
        freq.set(word, (freq.get(word) ?? 0) + 1);
      }
    }
  }
  if (freq.size === 0) return;

  const ws = workbook.addWorksheet('워드 빈도');
  const headerRow = ws.addRow(['단어', '빈도']);
  headerRow.eachCell((cell) => applyHeaderStyle(cell));
  ws.getColumn(1).width = 30;
  ws.getColumn(2).width = 10;

  [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .forEach(([word, count]) => {
      const row = ws.addRow([word, count]);
      row.eachCell((cell) => applyCellStyle(cell));
    });
}

/** multi-survey 3시트 한 번에 추가 */
function addMultiSurveySheets(
  workbook: ExcelJS.Workbook,
  data: MultiSurveyResultData,
  anonymous: boolean,
): void {
  addMultiSurveySummarySheet(workbook, data);
  addMultiSurveyResponsesSheet(workbook, data, anonymous);
  addMultiSurveyWordFrequencySheet(workbook, data);
}

function addPollSheet(workbook: ExcelJS.Workbook, data: PollResultData): void {
  const ws = workbook.addWorksheet('투표 결과');
  const header = ws.addRow(['옵션', '투표수', '비율']);
  header.eachCell((cell) => applyHeaderStyle(cell));
  ws.getColumn(1).width = 30;
  ws.getColumn(2).width = 10;
  ws.getColumn(3).width = 10;

  // 질문 메타 행
  const qRow = ws.addRow([data.question, '', '']);
  qRow.eachCell((cell) => applyCellStyle(cell));
  ws.mergeCells(qRow.number, 1, qRow.number, 3);

  const total = data.totalVotes;
  for (const opt of data.options) {
    const ratio = total === 0 ? 0 : Math.round((opt.votes / total) * 100);
    const row = ws.addRow([opt.text, opt.votes, `${ratio}%`]);
    row.eachCell((cell) => applyCellStyle(cell));
  }

  const totalRow = ws.addRow(['총 투표수', total, '']);
  totalRow.eachCell((cell) => applyHeaderStyle(cell));
}

function addSurveySheet(workbook: ExcelJS.Workbook, data: SurveyResultData): void {
  const ws = workbook.addWorksheet('설문 응답');
  const header = ws.addRow(['응답자', '제출 시각', '응답']);
  header.eachCell((cell) => applyHeaderStyle(cell));
  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 20;
  ws.getColumn(3).width = 60;

  // 질문 메타
  const qRow = ws.addRow([data.question, '', '']);
  qRow.eachCell((cell) => applyCellStyle(cell));
  ws.mergeCells(qRow.number, 1, qRow.number, 3);

  data.responses.forEach((r, idx) => {
    const d = new Date(r.submittedAt);
    const time = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const row = ws.addRow([formatSubmissionLabel(idx), time, r.text]);
    row.eachCell((cell) => applyCellStyle(cell));
    row.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  });
}

function addWordCloudSheet(workbook: ExcelJS.Workbook, data: WordCloudResultData): void {
  const ws = workbook.addWorksheet('워드 클라우드');
  const header = ws.addRow(['단어', '빈도']);
  header.eachCell((cell) => applyHeaderStyle(cell));
  ws.getColumn(1).width = 30;
  ws.getColumn(2).width = 10;

  const qRow = ws.addRow([data.question, '']);
  qRow.eachCell((cell) => applyCellStyle(cell));
  ws.mergeCells(qRow.number, 1, qRow.number, 2);

  for (const w of [...data.words].sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))) {
    const row = ws.addRow([w.word, w.count]);
    row.eachCell((cell) => applyCellStyle(cell));
  }

  const totalRow = ws.addRow(['총 응답자', data.totalSubmissions]);
  totalRow.eachCell((cell) => applyHeaderStyle(cell));
}

/**
 * multi-survey 결과 데이터(순수)를 엑셀로 내보낸다.
 * ToolMultiSurvey.results 단계에서 사용 — ToolResult 껍데기 불필요.
 */
export async function exportMultiSurveyDataToExcel(
  data: MultiSurveyResultData,
  options?: { anonymous?: boolean },
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  addMultiSurveySheets(workbook, data, options?.anonymous ?? true);
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

/**
 * 저장된 ToolResult 를 엑셀로 내보낸다 (PastResultsView 경로).
 * `result.data.type`에 따라 시트 구성이 달라진다.
 */
export async function exportToolResultToExcel(
  result: ToolResult,
  options?: { anonymous?: boolean },
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const d = result.data;
  switch (d.type) {
    case 'multi-survey':
      addMultiSurveySheets(workbook, d, options?.anonymous ?? true);
      break;
    case 'poll':
      addPollSheet(workbook, d);
      break;
    case 'survey':
      addSurveySheet(workbook, d);
      break;
    case 'wordcloud':
      addWordCloudSheet(workbook, d);
      break;
    case 'valueline-discussion':
    case 'trafficlight-discussion':
      throw new Error(`이 도구 타입은 엑셀 내보내기를 아직 지원하지 않습니다: ${d.type}`);
  }
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}
