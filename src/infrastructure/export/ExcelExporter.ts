import ExcelJS from 'exceljs';
import type { ClassScheduleData, TeacherScheduleData } from '@domain/entities/Timetable';
import type { SeatingData } from '@domain/entities/Seating';
import type { Student } from '@domain/entities/Student';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';
import type { StudentRecord, AttendanceStats } from '@domain/entities/StudentRecord';
import type { RecordCategoryItem } from '@domain/valueObjects/RecordCategory';
import { getAttendanceStats, filterByStudent, filterByCategory, sortByDateDesc } from '@domain/rules/studentRecordRules';
import { buildPairGroups, adjustPairGroupsForRow } from '@domain/rules/seatingLayoutRules';
import type { SubjectColorMap } from '@domain/valueObjects/SubjectColor';
import { getSubjectArgb, getClassroomArgb } from '@domain/valueObjects/SubjectColor';

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

export async function exportRosterToExcel(students: readonly Student[]): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('명렬표');

  const headerRow = ws.addRow(['번호', '이름', '학생 연락처', '보호자1 관계', '보호자1 연락처', '보호자2 관계', '보호자2 연락처', '생년월일', '비고']);
  headerRow.eachCell((cell) => applyHeaderStyle(cell));

  ws.getColumn(1).width = 8;
  ws.getColumn(2).width = 16;
  ws.getColumn(3).width = 18;
  ws.getColumn(4).width = 12;
  ws.getColumn(5).width = 18;
  ws.getColumn(6).width = 12;
  ws.getColumn(7).width = 18;
  ws.getColumn(8).width = 14;
  ws.getColumn(9).width = 10;

  const sorted = [...students].sort((a, b) => (a.studentNumber ?? 0) - (b.studentNumber ?? 0));

  for (const student of sorted) {
    const numberStr = String(student.studentNumber ?? '').padStart(2, '0');
    const remarks = student.isVacant ? '결번' : '';
    const bgColor = student.isVacant ? 'FFEEEEEE' : undefined;

    const row = ws.addRow([
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
): Promise<Array<{ name: string; studentNumber: number; phone: string; parentPhone: string; parentPhoneLabel?: string; parentPhone2?: string; parentPhone2Label?: string; birthDate?: string; isVacant: boolean }>> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const ws = workbook.worksheets[0];
  const result: Array<{ name: string; studentNumber: number; phone: string; parentPhone: string; parentPhoneLabel?: string; parentPhone2?: string; parentPhone2Label?: string; birthDate?: string; isVacant: boolean }> = [];

  if (!ws) return result;

  // ── 헤더 자동 감지 ──
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
      if (/^(번호|No|no|#|학번)$/i.test(val)) numCol = colNumber;
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

    // 이름 없이 번호만 있는 경우 (결번 가능성)
    const remarks = String(row.getCell(remarksCol).value ?? '').trim();
    const isVacant = remarks.includes('결번');
    if (!name && !isVacant) return;

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
