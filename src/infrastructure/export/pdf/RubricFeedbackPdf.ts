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
 * 수행평가 피드백 문서 → PDF (FR-6, A4 portrait).
 *
 * - 학생 1명당 1페이지 기본 — 내용이 넘치면 같은 학생의 페이지를 이어서 추가.
 * - 요소마다 수준 개수가 달라(D7) 단일 표가 불가능하므로 "요소 단위 블록"으로 그린다:
 *   요소 이름 → 수준 목록(체크 ●, 미체크 ○) → 체크된 수준의 성취 설명 → 특이사항 메모.
 * - 점수 표시는 도메인 데이터가 결정 — score/total/maxScore 가 null 이면 그릴 수 없다.
 * - 체크 표시는 한글 폰트 글리프가 보장되는 ●/○ 문자를 사용 (✓ 류는 서브셋 폰트 누락 위험).
 */

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 52;
const CONTENT_W = PAGE_W - MARGIN * 2;

const COLOR_TEXT = rgb(0.07, 0.09, 0.12);
const COLOR_MUTED = rgb(0.45, 0.48, 0.53);
const COLOR_ACCENT = rgb(0.23, 0.51, 0.96);
const COLOR_LINE = rgb(0.85, 0.87, 0.9);

export interface RubricFeedbackPdfInput {
  /** 루브릭 제목 — 각 학생 페이지 상단에 반복 */
  readonly title: string;
  /** 학급 표시용 이름 (예: 2학년 3반 국어) — 비우면 생략 */
  readonly className?: string;
  readonly docs: readonly RubricFeedbackDoc[];
}

/** 한글 텍스트 폭 기준 줄바꿈 — 공백이 없는 문장도 글자 단위로 안전하게 감싼다 */
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

export async function exportRubricFeedbackToPdf(
  input: RubricFeedbackPdfInput,
): Promise<ArrayBuffer> {
  const ctx = await createPdfContext();
  ctx.doc.setTitle(`${input.title} 피드백`);
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

/** 남은 공간이 부족하면 페이지를 이어서 추가 (학생 1명당 1페이지 '기본') */
function ensureSpace(ctx: PdfContext, cursor: Cursor, needed: number): Cursor {
  if (cursor.y - needed < MARGIN) {
    return newPage(ctx);
  }
  return cursor;
}

function drawWrapped(
  ctx: PdfContext,
  cursor: Cursor,
  text: string,
  opts: {
    x: number;
    size: number;
    bold?: boolean;
    color?: ReturnType<typeof rgb>;
    lineGap?: number;
  },
): Cursor {
  const maxWidth = PAGE_W - MARGIN - opts.x;
  const lines = wrapText(ctx, text, opts.size, maxWidth, opts.bold ?? false);
  let c = cursor;
  for (const line of lines) {
    c = ensureSpace(ctx, c, opts.size + 4);
    drawText(c.page, line, {
      x: opts.x,
      y: c.y - opts.size,
      font: opts.bold ? ctx.fonts.bold : ctx.fonts.regular,
      size: opts.size,
      color: opts.color ?? COLOR_TEXT,
    });
    c = { page: c.page, y: c.y - opts.size - (opts.lineGap ?? 4) };
  }
  return c;
}

function renderStudent(
  ctx: PdfContext,
  input: RubricFeedbackPdfInput,
  doc: RubricFeedbackDoc,
): void {
  let cursor = newPage(ctx);

  // ── 헤더: 루브릭 제목 + 학생 정보 ──
  cursor = drawWrapped(ctx, cursor, input.title, { x: MARGIN, size: 17, bold: true, lineGap: 6 });
  const studentLine = `${doc.studentNumber}번 ${doc.studentName}`;
  const headerRight = input.className !== undefined ? `${input.className}` : '';
  drawText(cursor.page, studentLine, {
    x: MARGIN,
    y: cursor.y - 12,
    font: ctx.fonts.bold,
    size: 12,
    color: COLOR_ACCENT,
  });
  if (headerRight.length > 0) {
    drawText(cursor.page, headerRight, {
      x: PAGE_W - MARGIN,
      y: cursor.y - 12,
      font: ctx.fonts.regular,
      size: 10,
      align: 'right',
      color: COLOR_MUTED,
    });
  }
  cursor = { page: cursor.page, y: cursor.y - 24 };

  // 헤더 구분선
  cursor.page.drawLine({
    start: { x: MARGIN, y: cursor.y },
    end: { x: PAGE_W - MARGIN, y: cursor.y },
    thickness: 1,
    color: COLOR_LINE,
  });
  cursor = { page: cursor.page, y: cursor.y - 16 };

  // ── 결시 (D8) ──
  if (doc.isAbsent) {
    cursor = drawWrapped(ctx, cursor, '결시 — 이 평가에 응시하지 않았습니다.', {
      x: MARGIN,
      size: 11,
      color: COLOR_MUTED,
    });
    return;
  }

  // ── 요소 단위 블록 (D7) ──
  doc.blocks.forEach((block, index) => {
    cursor = ensureSpace(ctx, cursor, 60);
    cursor = drawWrapped(ctx, cursor, `${index + 1}. ${block.criterionName}`, {
      x: MARGIN,
      size: 11.5,
      bold: true,
      lineGap: 6,
    });

    for (const level of block.levels) {
      const mark = level.checked ? '●' : '○';
      const scoreText = level.score !== null ? ` (${level.score}점)` : '';
      cursor = drawWrapped(ctx, cursor, `${mark} ${level.name}${scoreText}`, {
        x: MARGIN + 14,
        size: 10,
        bold: level.checked,
        color: level.checked ? COLOR_TEXT : COLOR_MUTED,
        lineGap: 3,
      });
      if (level.checked && level.description !== undefined) {
        cursor = drawWrapped(ctx, cursor, level.description, {
          x: MARGIN + 30,
          size: 9.5,
          color: COLOR_MUTED,
          lineGap: 3,
        });
      }
    }

    if (block.note !== undefined) {
      cursor = { page: cursor.page, y: cursor.y - 2 };
      cursor = drawWrapped(ctx, cursor, `메모: ${block.note}`, {
        x: MARGIN + 14,
        size: 9.5,
        color: COLOR_TEXT,
        lineGap: 3,
      });
    }

    cursor = { page: cursor.page, y: cursor.y - 12 };
  });

  // ── 총평 (D6) ──
  if (doc.overallFeedback !== undefined) {
    cursor = ensureSpace(ctx, cursor, 50);
    cursor = drawWrapped(ctx, cursor, '총평', { x: MARGIN, size: 11.5, bold: true, lineGap: 6 });
    cursor = drawWrapped(ctx, cursor, doc.overallFeedback, {
      x: MARGIN + 14,
      size: 10,
      lineGap: 4,
    });
    cursor = { page: cursor.page, y: cursor.y - 8 };
  }

  // ── 합계 (점수 포함 토글 ON + 체크 존재 시에만 데이터가 존재) ──
  if (doc.total !== null && doc.maxScore !== null) {
    cursor = ensureSpace(ctx, cursor, 30);
    cursor.page.drawLine({
      start: { x: MARGIN, y: cursor.y },
      end: { x: PAGE_W - MARGIN, y: cursor.y },
      thickness: 1,
      color: COLOR_LINE,
    });
    cursor = { page: cursor.page, y: cursor.y - 8 };
    drawText(cursor.page, `합계 ${doc.total}점 / 만점 ${doc.maxScore}점`, {
      x: PAGE_W - MARGIN,
      y: cursor.y - 12,
      font: ctx.fonts.bold,
      size: 12,
      align: 'right',
      color: COLOR_ACCENT,
      maxWidth: CONTENT_W,
    });
  }
}
