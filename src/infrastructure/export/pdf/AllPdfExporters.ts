import type { PDFPage } from 'pdf-lib';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';
import type { ClassScheduleData, TeacherScheduleData } from '@domain/entities/Timetable';
import type { Student } from '@domain/entities/Student';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import type { RecordCategoryItem } from '@domain/valueObjects/RecordCategory';
import { DAYS_OF_WEEK } from '@domain/valueObjects/DayOfWeek';
import {
  createPdfContext,
  drawText,
  rgb,
  saveToArrayBuffer,
  safeWidth,
  type PdfContext,
} from './pdfDocBuilder';

const A4_PORTRAIT: [number, number] = [595, 842];
const A4_LANDSCAPE: [number, number] = [842, 595];
const MARGIN = 36;

function setMetadata(doc: import('pdf-lib').PDFDocument, title: string): void {
  doc.setTitle(title);
  doc.setAuthor('쌤핀');
  doc.setCreator('쌤핀 (SsamPin)');
  doc.setProducer('쌤핀 (SsamPin) - pdf-lib');
  doc.setCreationDate(new Date());
}

function drawHeader(page: PDFPage, ctx: PdfContext, title: string): number {
  const { width, height } = page.getSize();
  drawText(page, title, {
    x: width / 2,
    y: height - MARGIN - 4,
    font: ctx.fonts.bold,
    size: 18,
    align: 'center',
  });
  drawText(page, `생성일: ${formatDate(new Date())}`, {
    x: width - MARGIN,
    y: height - MARGIN - 22,
    font: ctx.fonts.regular,
    size: 9,
    align: 'right',
    color: rgb(0.4, 0.45, 0.55),
  });
  page.drawLine({
    start: { x: MARGIN, y: height - MARGIN - 30 },
    end: { x: width - MARGIN, y: height - MARGIN - 30 },
    thickness: 0.7,
    color: rgb(0.7, 0.75, 0.82),
  });
  return height - MARGIN - 46;
}

// =================== 학교 일정 ===================
export async function exportEventsToPdf(
  events: readonly SchoolEvent[],
): Promise<ArrayBuffer> {
  const ctx = await createPdfContext();
  setMetadata(ctx.doc, '학교 일정');
  const sorted = [...events]
    .filter((e) => !e.isHidden)
    .sort((a, b) => a.date.localeCompare(b.date));

  const cols = [
    { key: '날짜', w: 110 },
    { key: '시간', w: 65 },
    { key: '제목', w: 195 },
    { key: '장소', w: 80 },
    { key: '비고', w: 73 },
  ];
  const rowH = 20;
  const pageSize = A4_PORTRAIT;
  const tableLeft = MARGIN;
  let page = ctx.doc.addPage(pageSize);
  let y = drawHeader(page, ctx, '학교 일정');

  // 헤더 행
  const drawTableHeader = (): void => {
    let x = tableLeft;
    for (const c of cols) {
      page.drawRectangle({
        x,
        y: y - rowH,
        width: c.w,
        height: rowH,
        color: rgb(0.93, 0.95, 0.98),
        borderColor: rgb(0.75, 0.79, 0.84),
        borderWidth: 0.5,
      });
      drawText(page, c.key, {
        x: x + c.w / 2,
        y: y - rowH + 6,
        font: ctx.fonts.bold,
        size: 10,
        align: 'center',
        maxWidth: c.w - 6,
      });
      x += c.w;
    }
    y -= rowH;
  };
  drawTableHeader();

  for (const e of sorted) {
    if (y - rowH < MARGIN + 20) {
      page = ctx.doc.addPage(pageSize);
      y = drawHeader(page, ctx, '학교 일정 (계속)');
      drawTableHeader();
    }
    const dateStr =
      e.endDate && e.endDate !== e.date
        ? `${e.date} ~ ${e.endDate.slice(5)}` // 같은 해면 '월-일' 만
        : e.date;
    const row = [
      dateStr,
      e.time ?? (e.startTime ? `${e.startTime}${e.endTime ? `~${e.endTime}` : ''}` : ''),
      e.title,
      e.location ?? '',
      e.description ?? '',
    ];
    let x = tableLeft;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i]!;
      page.drawRectangle({
        x,
        y: y - rowH,
        width: c.w,
        height: rowH,
        borderColor: rgb(0.82, 0.85, 0.89),
        borderWidth: 0.4,
      });
      drawText(page, row[i]!.replace(/\n/g, ' '), {
        x: x + 4,
        y: y - rowH + 6,
        font: ctx.fonts.regular,
        size: 9,
        align: 'left',
        maxWidth: c.w - 8,
      });
      x += c.w;
    }
    y -= rowH;
  }

  return saveToArrayBuffer(ctx.doc);
}

// =================== 학급 시간표 ===================
export async function exportClassScheduleToPdf(
  schedule: ClassScheduleData,
  maxPeriods: number,
): Promise<ArrayBuffer> {
  const ctx = await createPdfContext();
  setMetadata(ctx.doc, '학급 시간표');
  const page = ctx.doc.addPage(A4_PORTRAIT);
  let yTop = drawHeader(page, ctx, '학급 시간표');

  return drawScheduleGrid(ctx, page, yTop, maxPeriods, (day, p) => {
    const pd = (schedule[day] ?? [])[p];
    if (!pd || !pd.subject) return null;
    return [pd.subject, pd.teacher || ''];
  });
}

// =================== 교사 시간표 ===================
export async function exportTeacherScheduleToPdf(
  schedule: TeacherScheduleData,
  maxPeriods: number,
): Promise<ArrayBuffer> {
  const ctx = await createPdfContext();
  setMetadata(ctx.doc, '교사 시간표');
  const page = ctx.doc.addPage(A4_PORTRAIT);
  let yTop = drawHeader(page, ctx, '교사 시간표');

  return drawScheduleGrid(ctx, page, yTop, maxPeriods, (day, p) => {
    const pd = (schedule[day] ?? [])[p];
    if (!pd || !pd.subject) return null;
    return [pd.subject, pd.classroom || ''];
  });
}

async function drawScheduleGrid(
  ctx: PdfContext,
  page: PDFPage,
  yTop: number,
  maxPeriods: number,
  cellData: (day: string, periodIndex: number) => readonly [string, string] | null,
): Promise<ArrayBuffer> {
  const { width } = page.getSize();
  const leftX = MARGIN;
  const tableW = width - MARGIN * 2;
  const periodColW = 40;
  const dayColW = (tableW - periodColW) / DAYS_OF_WEEK.length;
  const rowH = 50;
  const headerH = 26;

  // 헤더 행 (교시 + 요일)
  const drawCell = (
    x: number,
    y: number,
    w: number,
    h: number,
    text: string,
    bold = false,
    fill?: ReturnType<typeof rgb>,
  ): void => {
    page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      color: fill,
      borderColor: rgb(0.75, 0.79, 0.84),
      borderWidth: 0.5,
    });
    drawText(page, text, {
      x: x + w / 2,
      y: y + h / 2 - 4,
      font: bold ? ctx.fonts.bold : ctx.fonts.regular,
      size: 10,
      align: 'center',
      maxWidth: w - 4,
    });
  };

  // 헤더
  drawCell(leftX, yTop - headerH, periodColW, headerH, '교시', true, rgb(0.93, 0.95, 0.98));
  for (let i = 0; i < DAYS_OF_WEEK.length; i++) {
    drawCell(
      leftX + periodColW + dayColW * i,
      yTop - headerH,
      dayColW,
      headerH,
      DAYS_OF_WEEK[i]!,
      true,
      rgb(0.93, 0.95, 0.98),
    );
  }

  // 행
  for (let p = 0; p < maxPeriods; p++) {
    const rowY = yTop - headerH - rowH * (p + 1);
    drawCell(leftX, rowY, periodColW, rowH, `${p + 1}`, true, rgb(0.97, 0.98, 0.99));
    for (let di = 0; di < DAYS_OF_WEEK.length; di++) {
      const day = DAYS_OF_WEEK[di]!;
      const cx = leftX + periodColW + dayColW * di;
      page.drawRectangle({
        x: cx,
        y: rowY,
        width: dayColW,
        height: rowH,
        borderColor: rgb(0.82, 0.85, 0.89),
        borderWidth: 0.4,
      });
      const data = cellData(day, p);
      if (data) {
        const [subj, sub] = data;
        drawText(page, subj, {
          x: cx + dayColW / 2,
          y: rowY + rowH / 2 + 4,
          font: ctx.fonts.bold,
          size: 11,
          align: 'center',
          maxWidth: dayColW - 4,
        });
        if (sub) {
          drawText(page, sub, {
            x: cx + dayColW / 2,
            y: rowY + rowH / 2 - 10,
            font: ctx.fonts.regular,
            size: 9,
            align: 'center',
            maxWidth: dayColW - 4,
            color: rgb(0.4, 0.45, 0.55),
          });
        }
      }
    }
  }

  return saveToArrayBuffer(ctx.doc);
}

// =================== 담임 메모 ===================
export async function exportStudentRecordsToPdf(
  records: readonly StudentRecord[],
  students: readonly Student[],
  categories: readonly RecordCategoryItem[],
): Promise<ArrayBuffer> {
  const ctx = await createPdfContext();
  setMetadata(ctx.doc, '담임 메모');
  const pageSize = A4_PORTRAIT;
  let page = ctx.doc.addPage(pageSize);
  let y = drawHeader(page, ctx, '담임 메모');

  const studentMap = new Map(students.map((s) => [s.id, s]));
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

  const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date));

  const cols = [
    { key: '날짜', w: 75 },
    { key: '학생', w: 90 },
    { key: '분류', w: 90 },
    { key: '내용', w: 268 },
  ];
  const rowH = 22;
  const tableLeft = MARGIN;

  const drawTableHeader = (): void => {
    let x = tableLeft;
    for (const c of cols) {
      page.drawRectangle({
        x,
        y: y - rowH,
        width: c.w,
        height: rowH,
        color: rgb(0.93, 0.95, 0.98),
        borderColor: rgb(0.75, 0.79, 0.84),
        borderWidth: 0.5,
      });
      drawText(page, c.key, {
        x: x + c.w / 2,
        y: y - rowH + 7,
        font: ctx.fonts.bold,
        size: 10,
        align: 'center',
      });
      x += c.w;
    }
    y -= rowH;
  };
  drawTableHeader();

  for (const r of sorted) {
    if (y - rowH < MARGIN + 20) {
      page = ctx.doc.addPage(pageSize);
      y = drawHeader(page, ctx, '담임 메모 (계속)');
      drawTableHeader();
    }
    const student = studentMap.get(r.studentId);
    const catName = categoryMap.get(r.category) ?? r.category;
    const row = [
      r.date,
      student
        ? `${String(student.studentNumber ?? '').padStart(2, '0')} ${student.name}`
        : '미등록 학생',
      r.subcategory ? `${catName} / ${r.subcategory}` : catName,
      r.content || (r.followUp ?? ''),
    ];
    let x = tableLeft;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i]!;
      page.drawRectangle({
        x,
        y: y - rowH,
        width: c.w,
        height: rowH,
        borderColor: rgb(0.82, 0.85, 0.89),
        borderWidth: 0.4,
      });
      const text = row[i]!.replace(/\n/g, ' ');
      drawText(page, text, {
        x: x + 4,
        y: y - rowH + 7,
        font: ctx.fonts.regular,
        size: 9,
        align: 'left',
        maxWidth: c.w - 8,
      });
      x += c.w;
    }
    y -= rowH;
  }

  return saveToArrayBuffer(ctx.doc);
}

// helpers
function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

// prevent unused import warnings in future refactors
void A4_LANDSCAPE;
void safeWidth;
