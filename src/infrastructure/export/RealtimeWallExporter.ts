/**
 * RealtimeWallExporter — 실시간 담벼락 PDF / Excel 내보내기.
 *
 * 입력은 도메인 use case `exportRealtimeWallBoard()` 결과(`RealtimeWallExportRows`).
 * 어댑터 레이어에서:
 *   1) usecase로 도메인 데이터를 평면 행으로 변환
 *   2) 본 모듈의 `exportRealtimeWallToExcel` / `exportRealtimeWallToPdf` 호출
 *   3) Save Dialog → writeFile (Electron) 또는 download anchor (브라우저)
 *
 * Clean Architecture:
 *   - 본 모듈은 infrastructure. 외부 라이브러리(exceljs/pdf-lib) 사용 OK.
 *   - 어댑터에서는 domain 타입(`RealtimeWallExportRows`)만 본 모듈에 넘긴다.
 */

import ExcelJS from 'exceljs';
import type { RealtimeWallExportRows } from '@domain/rules/realtimeWallExportRules';
import {
  createPdfContext,
  drawText,
  rgb,
  saveToArrayBuffer,
  type PdfContext,
} from './pdf/pdfDocBuilder';

/* ──────────────────────────────────────────────────────────────────────── */
/*  Excel                                                                   */
/* ──────────────────────────────────────────────────────────────────────── */

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
  cell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
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

const STATUS_BG: Record<string, string> = {
  '승인': 'FFD1FAE5',
  '대기': 'FFFEF3C7',
  '숨김': 'FFF3F4F6',
  '작성자 숨김': 'FFFEE2E2',
};

export async function exportRealtimeWallToExcel(
  data: RealtimeWallExportRows,
): Promise<ArrayBuffer> {
  const { meta, rows } = data;
  const { options } = meta;
  const workbook = new ExcelJS.Workbook();

  /* ── Sheet 1: 카드 ── */
  const ws = workbook.addWorksheet('카드 모음');

  const headers: string[] = ['#'];
  if (meta.layoutLabel === '칸반') headers.push('컬럼');
  if (options.includeAuthor) headers.push('작성자');
  if (options.includeContent) {
    headers.push('내용');
    headers.push('링크');
  }
  headers.push('상태');
  headers.push('하트');
  headers.push('댓글 수');
  if (options.includeTimestamp) headers.push('제출 시각');

  const headerRow = ws.addRow(headers);
  headerRow.eachCell((cell) => applyHeaderStyle(cell));

  // 컬럼 너비 — 헤더 순서와 동일하게 적용
  let colIdx = 1;
  ws.getColumn(colIdx++).width = 5; // #
  if (meta.layoutLabel === '칸반') ws.getColumn(colIdx++).width = 16;
  if (options.includeAuthor) ws.getColumn(colIdx++).width = 14;
  if (options.includeContent) {
    ws.getColumn(colIdx++).width = 60;
    ws.getColumn(colIdx++).width = 30;
  }
  ws.getColumn(colIdx++).width = 10;
  ws.getColumn(colIdx++).width = 6;
  ws.getColumn(colIdx++).width = 8;
  if (options.includeTimestamp) ws.getColumn(colIdx++).width = 18;

  for (const row of rows) {
    const cells: (string | number)[] = [row.index];
    if (meta.layoutLabel === '칸반') cells.push(row.columnTitle);
    if (options.includeAuthor) cells.push(row.nickname);
    if (options.includeContent) {
      cells.push(row.pinned ? `📌 ${row.text}` : row.text);
      cells.push(row.linkUrl);
    }
    cells.push(row.status);
    cells.push(row.hearts);
    cells.push(row.commentCount);
    if (options.includeTimestamp) cells.push(row.submittedAtLabel);

    const excelRow = ws.addRow(cells);
    const bg = STATUS_BG[row.status];
    excelRow.eachCell((cell) => applyCellStyle(cell, bg));
  }

  /* ── Sheet 2: 댓글 (옵션) ── */
  if (options.includeComments) {
    const wsc = workbook.addWorksheet('댓글');
    const commentHeaders: string[] = ['카드 #'];
    if (options.includeAuthor) commentHeaders.push('작성자');
    commentHeaders.push('댓글 내용');
    if (options.includeTimestamp) commentHeaders.push('작성 시각');

    const ch = wsc.addRow(commentHeaders);
    ch.eachCell((cell) => applyHeaderStyle(cell));

    let cIdx = 1;
    wsc.getColumn(cIdx++).width = 7;
    if (options.includeAuthor) wsc.getColumn(cIdx++).width = 14;
    wsc.getColumn(cIdx++).width = 60;
    if (options.includeTimestamp) wsc.getColumn(cIdx++).width = 18;

    for (const row of rows) {
      for (const comment of row.comments) {
        const cells: (string | number)[] = [row.index];
        if (options.includeAuthor) cells.push(comment.nickname);
        cells.push(comment.text);
        if (options.includeTimestamp) cells.push(comment.submittedAtLabel);
        const excelRow = wsc.addRow(cells);
        excelRow.eachCell((cell) => applyCellStyle(cell));
      }
    }
  }

  /* ── Sheet 3: 요약 ── */
  const wsm = workbook.addWorksheet('요약');
  const metaRows: Array<[string, string | number]> = [
    ['제목', meta.title],
    ['레이아웃', meta.layoutLabel],
    ['총 카드', meta.totalCards],
    ['승인 카드', meta.approvedCards],
    ['숨김 카드', meta.hiddenCards],
    ['생성 시각', meta.generatedAtLabel],
  ];
  wsm.getColumn(1).width = 14;
  wsm.getColumn(2).width = 40;
  for (const [label, value] of metaRows) {
    const r = wsm.addRow([label, value]);
    r.getCell(1).font = { bold: true };
    r.eachCell((cell) => applyCellStyle(cell));
  }

  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  PDF                                                                     */
/* ──────────────────────────────────────────────────────────────────────── */

const A4_PORTRAIT: [number, number] = [595, 842];
const MARGIN = 36;

function drawHeaderArea(
  page: import('pdf-lib').PDFPage,
  ctx: PdfContext,
  meta: RealtimeWallExportRows['meta'],
): number {
  const { width, height } = page.getSize();
  drawText(page, meta.title, {
    x: width / 2,
    y: height - MARGIN - 4,
    font: ctx.fonts.bold,
    size: 18,
    align: 'center',
    maxWidth: width - MARGIN * 2,
  });
  drawText(page, `${meta.layoutLabel} · 카드 ${meta.totalCards}장 (승인 ${meta.approvedCards} / 숨김 ${meta.hiddenCards})`, {
    x: width / 2,
    y: height - MARGIN - 24,
    font: ctx.fonts.regular,
    size: 9,
    align: 'center',
    color: rgb(0.4, 0.45, 0.55),
  });
  drawText(page, `생성: ${meta.generatedAtLabel}`, {
    x: width - MARGIN,
    y: height - MARGIN - 24,
    font: ctx.fonts.regular,
    size: 8,
    align: 'right',
    color: rgb(0.55, 0.6, 0.7),
  });
  page.drawLine({
    start: { x: MARGIN, y: height - MARGIN - 32 },
    end: { x: width - MARGIN, y: height - MARGIN - 32 },
    thickness: 0.7,
    color: rgb(0.7, 0.75, 0.82),
  });
  return height - MARGIN - 44;
}

/**
 * 단순 텍스트 wrap (길이 기반). pdf-lib는 native wrap이 없으므로
 * font widthOfText 기준으로 자체 래핑.
 */
function wrapText(
  text: string,
  maxWidth: number,
  font: import('pdf-lib').PDFFont,
  size: number,
): string[] {
  if (!text) return [''];
  const lines: string[] = [];
  const paragraphs = text.replace(/\r\n/g, '\n').split('\n');
  for (const para of paragraphs) {
    if (para.length === 0) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const char of para) {
      const tentative = current + char;
      let width = 0;
      try {
        width = font.widthOfTextAtSize(tentative, size);
      } catch {
        width = tentative.length * size * 0.55;
      }
      if (width > maxWidth && current.length > 0) {
        lines.push(current);
        current = char;
      } else {
        current = tentative;
      }
    }
    if (current.length > 0) lines.push(current);
  }
  return lines.length > 0 ? lines : [''];
}

const STATUS_FILL_PDF: Record<string, ReturnType<typeof rgb>> = {
  '승인': rgb(0.82, 0.98, 0.9),
  '대기': rgb(0.99, 0.95, 0.78),
  '숨김': rgb(0.95, 0.96, 0.97),
  '작성자 숨김': rgb(0.99, 0.89, 0.89),
};

export async function exportRealtimeWallToPdf(
  data: RealtimeWallExportRows,
): Promise<ArrayBuffer> {
  const { meta, rows } = data;
  const { options } = meta;
  const ctx = await createPdfContext();
  ctx.doc.setTitle(`${meta.title} — 실시간 담벼락`);
  ctx.doc.setAuthor('쌤핀');
  ctx.doc.setCreator('쌤핀 (SsamPin)');
  ctx.doc.setProducer('쌤핀 (SsamPin) - pdf-lib');
  ctx.doc.setCreationDate(new Date());

  const pageSize = A4_PORTRAIT;
  let page = ctx.doc.addPage(pageSize);
  let y = drawHeaderArea(page, ctx, meta);

  const contentWidth = pageSize[0] - MARGIN * 2;
  const cardPadding = 8;
  const cardInnerWidth = contentWidth - cardPadding * 2;
  const baseFontSize = 10;
  const lineHeight = 13;
  const meta1Size = 9;

  const ensureSpace = (needed: number): void => {
    if (y - needed < MARGIN + 12) {
      page = ctx.doc.addPage(pageSize);
      y = drawHeaderArea(page, ctx, meta);
    }
  };

  if (rows.length === 0) {
    drawText(page, '내보낼 카드가 없습니다.', {
      x: pageSize[0] / 2,
      y: y - 30,
      font: ctx.fonts.regular,
      size: 12,
      align: 'center',
      color: rgb(0.5, 0.55, 0.62),
    });
    return saveToArrayBuffer(ctx.doc);
  }

  for (const row of rows) {
    // 헤더 라인
    const headerParts: string[] = [`#${row.index}`];
    if (row.columnTitle) headerParts.push(`[${row.columnTitle}]`);
    if (options.includeAuthor && row.nickname) headerParts.push(row.nickname);
    headerParts.push(row.status);
    if (row.pinned) headerParts.push('📌');
    if (row.hearts > 0) headerParts.push(`♥ ${row.hearts}`);

    const headerText = headerParts.join('  ·  ');
    const metaLine = options.includeTimestamp && row.submittedAtLabel
      ? row.submittedAtLabel
      : '';

    const bodyLines = options.includeContent && row.text
      ? wrapText(row.text, cardInnerWidth, ctx.fonts.regular, baseFontSize)
      : [];

    const linkLines = options.includeContent && row.linkUrl
      ? wrapText(`🔗 ${row.linkUrl}`, cardInnerWidth, ctx.fonts.regular, meta1Size)
      : [];

    const commentLines: { author: string; text: string[] }[] = [];
    if (options.includeComments) {
      for (const c of row.comments) {
        const prefix = options.includeAuthor && c.nickname ? `${c.nickname}: ` : '';
        const wrapped = wrapText(`${prefix}${c.text}`, cardInnerWidth - 12, ctx.fonts.regular, meta1Size);
        commentLines.push({ author: c.nickname, text: wrapped });
      }
    }

    // 카드 박스 높이 계산
    const headerH = 18;
    const metaH = metaLine ? 14 : 0;
    const bodyH = bodyLines.length * lineHeight;
    const linkH = linkLines.length * (lineHeight - 1);
    const commentsHeaderH = commentLines.length > 0 ? 14 : 0;
    const commentsBodyH = commentLines.reduce((sum, c) => sum + c.text.length * (lineHeight - 1), 0);
    const cardH = headerH + metaH + bodyH + linkH + commentsHeaderH + commentsBodyH + cardPadding * 2 + 4;

    ensureSpace(cardH + 8);

    // 카드 배경
    const fill = STATUS_FILL_PDF[row.status] ?? rgb(0.97, 0.98, 0.99);
    page.drawRectangle({
      x: MARGIN,
      y: y - cardH,
      width: contentWidth,
      height: cardH,
      color: fill,
      borderColor: rgb(0.75, 0.79, 0.84),
      borderWidth: 0.5,
    });

    let cy = y - cardPadding - 4;

    // 헤더 텍스트
    drawText(page, headerText, {
      x: MARGIN + cardPadding,
      y: cy - 10,
      font: ctx.fonts.bold,
      size: 11,
      maxWidth: cardInnerWidth,
    });
    cy -= headerH;

    if (metaLine) {
      drawText(page, metaLine, {
        x: MARGIN + cardPadding,
        y: cy - 8,
        font: ctx.fonts.regular,
        size: meta1Size,
        color: rgb(0.45, 0.5, 0.58),
        maxWidth: cardInnerWidth,
      });
      cy -= metaH;
    }

    // 본문
    for (const line of bodyLines) {
      drawText(page, line, {
        x: MARGIN + cardPadding,
        y: cy - lineHeight + 3,
        font: ctx.fonts.regular,
        size: baseFontSize,
        maxWidth: cardInnerWidth,
      });
      cy -= lineHeight;
    }

    // 링크
    for (const line of linkLines) {
      drawText(page, line, {
        x: MARGIN + cardPadding,
        y: cy - (lineHeight - 1) + 2,
        font: ctx.fonts.regular,
        size: meta1Size,
        color: rgb(0.2, 0.45, 0.85),
        maxWidth: cardInnerWidth,
      });
      cy -= lineHeight - 1;
    }

    // 댓글
    if (commentLines.length > 0) {
      drawText(page, `💬 댓글 ${commentLines.length}개`, {
        x: MARGIN + cardPadding,
        y: cy - 10,
        font: ctx.fonts.bold,
        size: meta1Size,
        color: rgb(0.4, 0.45, 0.55),
        maxWidth: cardInnerWidth,
      });
      cy -= commentsHeaderH;

      for (const c of commentLines) {
        for (const line of c.text) {
          drawText(page, `· ${line}`, {
            x: MARGIN + cardPadding + 8,
            y: cy - (lineHeight - 1) + 2,
            font: ctx.fonts.regular,
            size: meta1Size,
            color: rgb(0.3, 0.35, 0.45),
            maxWidth: cardInnerWidth - 12,
          });
          cy -= lineHeight - 1;
        }
      }
    }

    y -= cardH + 8;
  }

  return saveToArrayBuffer(ctx.doc);
}
