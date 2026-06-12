import { rgb, type PDFPage } from 'pdf-lib';
import type { RubricFeedbackDoc } from '@domain/rules/rubricRules';
import {
  createPdfContext,
  drawText,
  safeWidth,
  saveToArrayBuffer,
  type PdfContext,
} from './pdfDocBuilder';

/**
 * 수행평가 학생 평가지 → PDF (FR-6, A4 portrait).
 *
 * 학교 현장에서 실제 쓰는 수행평가 채점기준표 양식을 따른다:
 *   ① 가운데 제목 + "수행평가 평가지" 부제
 *   ② 인적사항 괘선 행 (수업반 | 번호 | 이름)
 *   ③ 본문 괘선 표 — [평가 요소 | 평가 기준 | 배점 | 받은 점수]
 *      · 평가 기준 칸에 수준 목록(받은 수준 ●, 나머지 ○) + 성취 설명 + 특이사항 메모
 *      · 요소마다 수준 개수가 달라(D7) 행 높이가 가변
 *   ④ 합계 행 (배점 합 = 만점, 받은 점수 합)
 *   ⑤ 총평 괘선 칸 (비어 있으면 손글씨 기입용 빈 칸으로 출력)
 *
 * - 점수 포함 토글 OFF 면 도메인 데이터에 점수가 없어 배점/받은 점수 열 자체가 생략된다.
 * - 학생 1명당 1페이지 기본 — 넘치면 표 머리글을 다시 그려 다음 페이지로 잇는다.
 * - 체크 표시는 한글 폰트 글리프가 보장되는 ●/○ 문자를 사용.
 */

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

const LINE_H = 12;
const CELL_PAD = 5;

const COLOR_TEXT = rgb(0.07, 0.09, 0.12);
const COLOR_MUTED = rgb(0.42, 0.45, 0.5);
const COLOR_LINE = rgb(0.35, 0.38, 0.42);
const COLOR_HEADER_FILL = rgb(0.93, 0.94, 0.96);

export interface RubricFeedbackPdfInput {
  /** 루브릭 제목 — 평가지 제목으로 사용 */
  readonly title: string;
  /** 수업반 표시 이름 (예: 2학년 3반 국어) */
  readonly className?: string;
  readonly docs: readonly RubricFeedbackDoc[];
}

/** 한글 텍스트 폭 기준 줄바꿈 — 공백 없는 문장도 글자 단위로 안전하게 감싼다 */
function wrapText(
  ctx: PdfContext,
  text: string,
  size: number,
  maxWidth: number,
  bold = false,
): string[] {
  const font = bold ? ctx.fonts.bold : ctx.fonts.regular;
  const lines: string[] = [];
  for (const rawLine of text.split('\n')) {
    let current = '';
    for (const ch of rawLine) {
      const candidate = current + ch;
      if (safeWidth(font, candidate, size) > maxWidth && current.length > 0) {
        lines.push(current);
        current = ch;
      } else {
        current = candidate;
      }
    }
    lines.push(current);
  }
  return lines;
}

interface Cursor {
  page: PDFPage;
  y: number;
}

/** 열 좌표 (x = 왼쪽 경계, w = 폭). 점수 미포함이면 score/earned 가 없다. */
interface Columns {
  readonly criterion: { x: number; w: number };
  readonly standard: { x: number; w: number };
  readonly score?: { x: number; w: number };
  readonly earned?: { x: number; w: number };
}

function computeColumns(includeScores: boolean): Columns {
  const criterionW = 86;
  if (!includeScores) {
    return {
      criterion: { x: MARGIN, w: criterionW },
      standard: { x: MARGIN + criterionW, w: CONTENT_W - criterionW },
    };
  }
  const scoreW = 44;
  const earnedW = 56;
  const standardW = CONTENT_W - criterionW - scoreW - earnedW;
  return {
    criterion: { x: MARGIN, w: criterionW },
    standard: { x: MARGIN + criterionW, w: standardW },
    score: { x: MARGIN + criterionW + standardW, w: scoreW },
    earned: { x: MARGIN + criterionW + standardW + scoreW, w: earnedW },
  };
}

/** 괘선 가로줄 */
function hLine(page: PDFPage, y: number, x1 = MARGIN, x2 = PAGE_W - MARGIN): void {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.7, color: COLOR_LINE });
}

/** 괘선 세로줄 */
function vLine(page: PDFPage, x: number, yTop: number, yBottom: number): void {
  page.drawLine({
    start: { x, y: yTop },
    end: { x, y: yBottom },
    thickness: 0.7,
    color: COLOR_LINE,
  });
}

/** 표의 모든 열 경계 x 좌표 (왼쪽 끝 ~ 오른쪽 끝) */
function columnBoundaries(cols: Columns): number[] {
  const xs = [MARGIN, cols.standard.x];
  if (cols.score !== undefined) xs.push(cols.score.x);
  if (cols.earned !== undefined) xs.push(cols.earned.x);
  xs.push(PAGE_W - MARGIN);
  return xs;
}

export async function exportRubricFeedbackToPdf(
  input: RubricFeedbackPdfInput,
): Promise<ArrayBuffer> {
  const ctx = await createPdfContext();
  ctx.doc.setTitle(`${input.title} 평가지`);
  ctx.doc.setAuthor('쌤핀');
  ctx.doc.setCreator('쌤핀 (SsamPin)');
  ctx.doc.setCreationDate(new Date());

  for (const doc of input.docs) {
    renderStudent(ctx, input, doc);
  }
  // 출력 대상이 비어도 유효한 PDF 가 되도록 페이지 1장 보장
  if (ctx.doc.getPageCount() === 0) {
    ctx.doc.addPage([PAGE_W, PAGE_H]);
  }
  return saveToArrayBuffer(ctx.doc);
}

function newPage(ctx: PdfContext): Cursor {
  const page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  return { page, y: PAGE_H - MARGIN };
}

/** 표 머리글 행 — 새 페이지로 이어질 때마다 다시 그린다 */
function drawTableHeader(ctx: PdfContext, cursor: Cursor, cols: Columns): Cursor {
  const h = 20;
  const top = cursor.y;
  const bottom = top - h;

  cursor.page.drawRectangle({
    x: MARGIN,
    y: bottom,
    width: CONTENT_W,
    height: h,
    color: COLOR_HEADER_FILL,
  });
  hLine(cursor.page, top);
  hLine(cursor.page, bottom);
  for (const x of columnBoundaries(cols)) {
    vLine(cursor.page, x, top, bottom);
  }

  const textY = bottom + (h - 9.5) / 2 + 1;
  const center = (col: { x: number; w: number }, label: string) =>
    drawText(cursor.page, label, {
      x: col.x + col.w / 2,
      y: textY,
      font: ctx.fonts.bold,
      size: 9.5,
      align: 'center',
      color: COLOR_TEXT,
    });
  center(cols.criterion, '평가 요소');
  center(cols.standard, '평가 기준');
  if (cols.score !== undefined) center(cols.score, '배점');
  if (cols.earned !== undefined) center(cols.earned, '받은 점수');

  return { page: cursor.page, y: bottom };
}

/** 평가 기준 칸에 들어갈 줄 — 수준별 본문 + 메모 */
interface StandardLine {
  readonly text: string;
  readonly bold: boolean;
  readonly muted: boolean;
  /** 이 줄이 수준의 첫 줄이면 배점 칸에 표기할 점수 */
  readonly scoreAtLine?: number;
}

function buildStandardLines(
  ctx: PdfContext,
  block: RubricFeedbackDoc['blocks'][number],
  maxWidth: number,
): StandardLine[] {
  const lines: StandardLine[] = [];
  for (const level of block.levels) {
    const mark = level.checked ? '●' : '○';
    const body =
      level.description !== undefined
        ? `${mark} ${level.name} — ${level.description}`
        : `${mark} ${level.name}`;
    const wrapped = wrapText(ctx, body, 9, maxWidth, level.checked);
    wrapped.forEach((text, i) => {
      lines.push({
        text,
        bold: level.checked,
        muted: !level.checked,
        ...(i === 0 && level.score !== null ? { scoreAtLine: level.score } : {}),
      });
    });
  }
  if (block.note !== undefined) {
    for (const text of wrapText(ctx, `메모: ${block.note}`, 9, maxWidth)) {
      lines.push({ text, bold: false, muted: false });
    }
  }
  return lines;
}

function renderStudent(
  ctx: PdfContext,
  input: RubricFeedbackPdfInput,
  doc: RubricFeedbackDoc,
): void {
  const includeScores = doc.maxScore !== null;
  const cols = computeColumns(includeScores);
  let cursor = newPage(ctx);

  // ── ① 제목 ──
  drawText(cursor.page, input.title, {
    x: PAGE_W / 2,
    y: cursor.y - 16,
    font: ctx.fonts.bold,
    size: 16,
    align: 'center',
    color: COLOR_TEXT,
    maxWidth: CONTENT_W,
  });
  drawText(cursor.page, '수행평가 평가지', {
    x: PAGE_W / 2,
    y: cursor.y - 30,
    font: ctx.fonts.regular,
    size: 9.5,
    align: 'center',
    color: COLOR_MUTED,
  });
  cursor = { page: cursor.page, y: cursor.y - 44 };

  // ── ② 인적사항 행 (수업반 | 번호 | 이름) ──
  const infoH = 24;
  const infoTop = cursor.y;
  const infoBottom = infoTop - infoH;
  const numberW = 90;
  const nameW = 150;
  const classW = CONTENT_W - numberW - nameW;
  hLine(cursor.page, infoTop);
  hLine(cursor.page, infoBottom);
  const infoXs = [MARGIN, MARGIN + classW, MARGIN + classW + numberW, PAGE_W - MARGIN];
  for (const x of infoXs) vLine(cursor.page, x, infoTop, infoBottom);

  const infoTextY = infoBottom + (infoH - 10) / 2 + 1;
  const infoCell = (x: number, label: string, value: string) => {
    drawText(cursor.page, label, {
      x: x + CELL_PAD,
      y: infoTextY,
      font: ctx.fonts.regular,
      size: 8.5,
      color: COLOR_MUTED,
    });
    drawText(cursor.page, value, {
      x: x + CELL_PAD + 34,
      y: infoTextY,
      font: ctx.fonts.bold,
      size: 10,
      color: COLOR_TEXT,
      maxWidth: x === MARGIN ? classW - 44 : undefined,
    });
  };
  infoCell(MARGIN, '수업반', input.className ?? '');
  infoCell(MARGIN + classW, '번호', `${doc.studentNumber}번`);
  infoCell(MARGIN + classW + numberW, '이름', doc.studentName);
  cursor = { page: cursor.page, y: infoBottom - 10 };

  // ── ③ 본문 표 ──
  cursor = drawTableHeader(ctx, cursor, cols);
  const standardTextW = cols.standard.w - CELL_PAD * 2;

  doc.blocks.forEach((block) => {
    const standardLines = buildStandardLines(ctx, block, standardTextW);
    const criterionLines = wrapText(
      ctx,
      block.criterionName,
      9,
      cols.criterion.w - CELL_PAD * 2,
      true,
    );
    const lineCount = Math.max(standardLines.length, criterionLines.length, 1);
    const rowH = lineCount * LINE_H + CELL_PAD * 2;

    // 페이지 넘침 — 새 페이지에 표 머리글부터 다시
    if (cursor.y - rowH < MARGIN + 20) {
      cursor = newPage(ctx);
      cursor = drawTableHeader(ctx, cursor, cols);
    }

    const top = cursor.y;
    const bottom = top - rowH;
    hLine(cursor.page, bottom);
    for (const x of columnBoundaries(cols)) {
      vLine(cursor.page, x, top, bottom);
    }

    // 평가 요소 (세로 중앙 정렬)
    const criterionStartY = top - CELL_PAD - 9 - ((lineCount - criterionLines.length) * LINE_H) / 2;
    criterionLines.forEach((line, i) => {
      drawText(cursor.page, line, {
        x: cols.criterion.x + CELL_PAD,
        y: criterionStartY - i * LINE_H,
        font: ctx.fonts.bold,
        size: 9,
        color: COLOR_TEXT,
      });
    });

    // 평가 기준 + 배점
    standardLines.forEach((line, i) => {
      const y = top - CELL_PAD - 9 - i * LINE_H;
      drawText(cursor.page, line.text, {
        x: cols.standard.x + CELL_PAD,
        y,
        font: line.bold ? ctx.fonts.bold : ctx.fonts.regular,
        size: 9,
        color: line.muted ? COLOR_MUTED : COLOR_TEXT,
      });
      if (cols.score !== undefined && line.scoreAtLine !== undefined) {
        drawText(cursor.page, String(line.scoreAtLine), {
          x: cols.score.x + cols.score.w / 2,
          y,
          font: line.bold ? ctx.fonts.bold : ctx.fonts.regular,
          size: 9,
          align: 'center',
          color: line.muted ? COLOR_MUTED : COLOR_TEXT,
        });
      }
    });

    // 받은 점수 (행 세로 중앙)
    if (cols.earned !== undefined) {
      const checked = block.levels.find((l) => l.checked);
      if (checked !== undefined && checked.score !== null) {
        drawText(cursor.page, `${checked.score}`, {
          x: cols.earned.x + cols.earned.w / 2,
          y: bottom + rowH / 2 - 4.5,
          font: ctx.fonts.bold,
          size: 10.5,
          align: 'center',
          color: COLOR_TEXT,
        });
      }
    }

    cursor = { page: cursor.page, y: bottom };
  });

  // ── ④ 합계 행 ──
  if (includeScores && cols.score !== undefined && cols.earned !== undefined) {
    const h = 22;
    if (cursor.y - h < MARGIN) {
      cursor = newPage(ctx);
      cursor = drawTableHeader(ctx, cursor, cols);
    }
    const top = cursor.y;
    const bottom = top - h;
    hLine(cursor.page, bottom);
    // 합계 행은 [합계(요소+기준 병합) | 배점 합 | 받은 점수 합]
    vLine(cursor.page, MARGIN, top, bottom);
    vLine(cursor.page, cols.score.x, top, bottom);
    vLine(cursor.page, cols.earned.x, top, bottom);
    vLine(cursor.page, PAGE_W - MARGIN, top, bottom);

    const textY = bottom + (h - 9.5) / 2 + 1;
    drawText(cursor.page, '합계', {
      x: cols.criterion.x + (cols.criterion.w + cols.standard.w) / 2,
      y: textY,
      font: ctx.fonts.bold,
      size: 9.5,
      align: 'center',
      color: COLOR_TEXT,
    });
    drawText(cursor.page, String(doc.maxScore ?? ''), {
      x: cols.score.x + cols.score.w / 2,
      y: textY,
      font: ctx.fonts.bold,
      size: 9.5,
      align: 'center',
      color: COLOR_TEXT,
    });
    drawText(cursor.page, doc.isAbsent ? '결시' : doc.total !== null ? String(doc.total) : '', {
      x: cols.earned.x + cols.earned.w / 2,
      y: textY,
      font: ctx.fonts.bold,
      size: 10.5,
      align: 'center',
      color: COLOR_TEXT,
    });
    cursor = { page: cursor.page, y: bottom };
  }

  // 결시 안내 (점수 미포함 출력에서도 보이도록 표 아래 한 줄)
  if (doc.isAbsent) {
    drawText(cursor.page, '※ 결시 — 이 평가에 응시하지 않았습니다.', {
      x: MARGIN,
      y: cursor.y - 14,
      font: ctx.fonts.regular,
      size: 8.5,
      color: COLOR_MUTED,
    });
    cursor = { page: cursor.page, y: cursor.y - 18 };
  }

  cursor = { page: cursor.page, y: cursor.y - 12 };

  // ── ⑤ 총평 칸 (내용이 없어도 손글씨 기입용 빈 칸으로 출력) ──
  const feedbackLines =
    doc.overallFeedback !== undefined
      ? wrapText(ctx, doc.overallFeedback, 9.5, CONTENT_W - cols.criterion.w - CELL_PAD * 2)
      : [];
  const boxH = Math.max(52, feedbackLines.length * LINE_H + CELL_PAD * 2 + 4);
  if (cursor.y - boxH < MARGIN) {
    cursor = newPage(ctx);
  }
  const boxTop = cursor.y;
  const boxBottom = boxTop - boxH;
  hLine(cursor.page, boxTop);
  hLine(cursor.page, boxBottom);
  vLine(cursor.page, MARGIN, boxTop, boxBottom);
  vLine(cursor.page, MARGIN + cols.criterion.w, boxTop, boxBottom);
  vLine(cursor.page, PAGE_W - MARGIN, boxTop, boxBottom);
  drawText(cursor.page, '총평', {
    x: MARGIN + cols.criterion.w / 2,
    y: boxTop - boxH / 2 - 4,
    font: ctx.fonts.bold,
    size: 9.5,
    align: 'center',
    color: COLOR_TEXT,
  });
  feedbackLines.forEach((line, i) => {
    drawText(cursor.page, line, {
      x: MARGIN + cols.criterion.w + CELL_PAD,
      y: boxTop - CELL_PAD - 9.5 - i * LINE_H,
      font: ctx.fonts.regular,
      size: 9.5,
      color: COLOR_TEXT,
    });
  });
}
