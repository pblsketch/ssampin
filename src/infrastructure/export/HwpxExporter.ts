import type { ClassScheduleData, TeacherScheduleData } from '@domain/entities/Timetable';
import type { SeatingData } from '@domain/entities/Seating';
import type { Student } from '@domain/entities/Student';

const DAYS = ['월', '화', '수', '목', '금'] as const;

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildHtmlTable(headers: string[], rows: string[][]): string {
  let html = '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:\'Noto Sans KR\',sans-serif">';
  html += '<tr>';
  for (const h of headers) {
    html += `<th style="background:#3B82F6;color:#fff;padding:8px;text-align:center">${escapeHtml(h)}</th>`;
  }
  html += '</tr>';
  for (const row of rows) {
    html += '<tr>';
    for (const cell of row) {
      html += `<td style="padding:8px;text-align:center">${escapeHtml(cell)}</td>`;
    }
    html += '</tr>';
  }
  html += '</table>';
  return html;
}

export function exportClassScheduleToHtml(
  schedule: ClassScheduleData,
  maxPeriods: number,
): string {
  const headers = ['교시', ...DAYS];
  const rows: string[][] = [];
  for (let p = 0; p < maxPeriods; p++) {
    rows.push([
      `${p + 1}교시`,
      ...DAYS.map((day) => schedule[day]?.[p] ?? ''),
    ]);
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>학급 시간표</title></head><body>
<h2>학급 시간표</h2>
${buildHtmlTable(headers, rows)}
</body></html>`;
}

export function exportTeacherScheduleToHtml(
  schedule: TeacherScheduleData,
  maxPeriods: number,
): string {
  const headers = ['교시', ...DAYS];
  const rows: string[][] = [];
  for (let p = 0; p < maxPeriods; p++) {
    rows.push([
      `${p + 1}교시`,
      ...DAYS.map((day) => {
        const period = schedule[day]?.[p];
        return period ? `${period.subject} (${period.classroom})` : '';
      }),
    ]);
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>교사 시간표</title></head><body>
<h2>교사 시간표</h2>
${buildHtmlTable(headers, rows)}
</body></html>`;
}

export function exportSeatingToHtml(
  seating: SeatingData,
  getStudent: (id: string | null) => Student | undefined,
): string {
  const headers: string[] = [];
  for (let c = 0; c < seating.cols; c++) {
    headers.push(`${c + 1}열`);
  }

  const rows: string[][] = [];
  for (let r = 0; r < seating.rows; r++) {
    const row: string[] = [];
    for (let c = 0; c < seating.cols; c++) {
      const studentId = seating.seats[r]?.[c] ?? null;
      const student = getStudent(studentId);
      row.push(student?.name ?? '');
    }
    rows.push(row);
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>좌석 배치도</title></head><body>
<h2>좌석 배치도</h2>
<div style="text-align:center;background:#64748B;color:#fff;padding:8px;margin-bottom:4px;font-weight:bold">칠 판</div>
${buildHtmlTable(headers, rows)}
</body></html>`;
}
