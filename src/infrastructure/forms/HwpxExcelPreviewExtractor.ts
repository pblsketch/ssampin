import type { FormFormat } from '@domain/entities/FormTemplate';
import type { IPreviewExtractor, PreviewResult } from '@domain/ports/IFormPorts';

const PREVIEW_LIMIT = 80;

/**
 * HWPX / Excel 서식의 첫 페이지 텍스트를 발췌한다.
 * PDF 는 썸네일이 있으므로 textPreview 는 빈 문자열 반환.
 * 모든 예외는 swallow — 실패 시 textPreview='' 로 폴백.
 */
export class HwpxExcelPreviewExtractor implements IPreviewExtractor {
  async extract(format: FormFormat, bytes: Uint8Array): Promise<PreviewResult> {
    if (format === 'hwpx') return this.extractHwpx(bytes);
    if (format === 'excel') return this.extractExcel(bytes);
    // pdf: 썸네일에 맡김
    return { textPreview: '' };
  }

  private async extractHwpx(bytes: Uint8Array): Promise<PreviewResult> {
    try {
      const { HwpxDocument } = await import('@ubermensch1218/hwpxcore');
      const doc = await HwpxDocument.open(bytes);
      const paragraphs = doc.paragraphs.slice(0, 10);
      const text = paragraphs
        .map((p) => {
          try {
            return p.text ?? '';
          } catch {
            return '';
          }
        })
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, PREVIEW_LIMIT);
      const pageCount = doc.paragraphs.length > 0 ? 1 : 0;
      return { textPreview: text, meta: { pageCount } };
    } catch (err) {
      console.warn('[HwpxExcelPreviewExtractor] hwpx 프리뷰 실패:', err);
      return { textPreview: '' };
    }
  }

  private async extractExcel(bytes: Uint8Array): Promise<PreviewResult> {
    try {
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      await workbook.xlsx.load(ab as ArrayBuffer);
      const sheets = workbook.worksheets;
      const sheetCount = sheets.length;
      const first = sheets[0];
      let text = '';
      if (first) {
        const rows: string[] = [];
        // 처음 3행만
        for (let r = 1; r <= Math.min(3, first.rowCount); r++) {
          const row = first.getRow(r);
          const cells: string[] = [];
          row.eachCell({ includeEmpty: false }, (cell) => {
            const v = cell.value;
            if (v === null || v === undefined) return;
            if (typeof v === 'object' && 'richText' in (v as object)) {
              // RichText
              const rt = (v as { richText: Array<{ text: string }> }).richText;
              cells.push(rt.map((r) => r.text).join(''));
            } else if (typeof v === 'object' && 'text' in (v as object)) {
              cells.push(String((v as { text: unknown }).text ?? ''));
            } else {
              cells.push(String(v));
            }
          });
          if (cells.length > 0) rows.push(cells.join(' '));
        }
        text = rows.join(' ').replace(/\s+/g, ' ').trim().slice(0, PREVIEW_LIMIT);
      }
      return { textPreview: text, meta: { sheetCount } };
    } catch (err) {
      console.warn('[HwpxExcelPreviewExtractor] excel 프리뷰 실패:', err);
      return { textPreview: '' };
    }
  }
}
