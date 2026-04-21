import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { loadKoreanFontBuffers } from './FontRegistry';

/**
 * 공통 pdf-lib 헬퍼: Korean font embed + drawText util.
 *
 * 모든 seating/events/schedule/records PDF exporter 가 공유.
 * subset: false — Electron/browser 번들 환경에서 pdf-lib+fontkit 의
 * re-subset 이 Hangul glyph 를 누락하는 문제를 회피.
 */
export interface PdfContext {
  doc: PDFDocument;
  fonts: { regular: PDFFont; bold: PDFFont };
}

export async function createPdfContext(): Promise<PdfContext> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const buffers = await loadKoreanFontBuffers();
  const regular = await doc.embedFont(buffers.regular, { subset: false });
  const bold = await doc.embedFont(buffers.bold, { subset: false });
  return { doc, fonts: { regular, bold } };
}

export async function saveToArrayBuffer(doc: PDFDocument): Promise<ArrayBuffer> {
  const bytes = await doc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export interface DrawTextOpts {
  x: number;
  y: number;
  font: PDFFont;
  size: number;
  align?: 'left' | 'center' | 'right';
  color?: ReturnType<typeof rgb>;
  maxWidth?: number;
}

/**
 * 안전한 텍스트 렌더. maxWidth 초과 시 폰트 크기를 축소(auto-shrink).
 * 이전의 char truncation 방식은 Korean subset 폰트에서 글자 손실을 일으켰음.
 */
export function drawText(page: PDFPage, text: string, opts: DrawTextOpts): void {
  let size = opts.size;
  let textWidth = safeWidth(opts.font, text, size);
  if (opts.maxWidth && textWidth > opts.maxWidth) {
    const ratio = opts.maxWidth / textWidth;
    size = Math.max(6, opts.size * ratio * 0.98);
    textWidth = safeWidth(opts.font, text, size);
  }
  let drawX = opts.x;
  if (opts.align === 'center') drawX = opts.x - textWidth / 2;
  else if (opts.align === 'right') drawX = opts.x - textWidth;
  page.drawText(text, {
    x: drawX,
    y: opts.y,
    size,
    font: opts.font,
    color: opts.color ?? rgb(0.07, 0.09, 0.12),
  });
}

export function safeWidth(font: PDFFont, text: string, size: number): number {
  try {
    const w = font.widthOfTextAtSize(text, size);
    return Number.isFinite(w) ? w : text.length * size * 0.6;
  } catch {
    return text.length * size * 0.6;
  }
}

export { rgb };
