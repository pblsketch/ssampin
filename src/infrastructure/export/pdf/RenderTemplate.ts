import { generate } from '@pdfme/generator';
import { text } from '@pdfme/schemas';
import type { Template } from '@pdfme/common';
import { loadKoreanFontBuffers } from './FontRegistry';
import type { PdfOptions, PdfTemplateInput } from './types';

/**
 * pdfme 템플릿 + 데이터 → 한글 포함 PDF 생성.
 *
 * 동작:
 *   1) Noto Sans KR 서브셋 2종(Regular/Bold)을 캐시에서 로드.
 *   2) pdfme `generate()` 에 template/inputs/font/plugins 전달.
 *   3) (선택) title/author 지정 시 pdf-lib 로 메타데이터 후처리.
 *
 * 주의 (POC 학습 내용):
 *   - `basePdf.padding` 의 bottom 값을 초과하는 y 좌표에 필드를 두면 해당 필드가
 *     자동으로 다음 페이지로 밀림. 템플릿 작성자가 padding 내부에 필드를 위치시킬 것.
 */
export async function renderTemplate(
  input: PdfTemplateInput,
  options?: PdfOptions,
): Promise<ArrayBuffer> {
  if (!input.template) {
    throw new Error('renderTemplate: template 이 필요합니다.');
  }
  if (!Array.isArray(input.inputs) || input.inputs.length === 0) {
    throw new Error('renderTemplate: inputs 가 최소 1개 이상이어야 합니다.');
  }

  const buffers = await loadKoreanFontBuffers();

  const font = {
    NotoSansKR: {
      data: buffers.regular,
      fallback: true,
    },
    'NotoSansKR-Bold': {
      data: buffers.bold,
    },
  };

  const pdfBytes = await generate({
    template: input.template as Template,
    inputs: input.inputs,
    options: { font },
    plugins: { text },
  });

  if (options?.title || options?.author) {
    return applyMetadata(pdfBytes, options);
  }

  return toArrayBuffer(pdfBytes);
}

async function applyMetadata(
  pdfBytes: Uint8Array,
  options: PdfOptions,
): Promise<ArrayBuffer> {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.load(pdfBytes);
  if (options.title) doc.setTitle(options.title);
  doc.setAuthor(options.author ?? '쌤핀');
  const saved = await doc.save();
  return toArrayBuffer(saved);
}

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(
    u8.byteOffset,
    u8.byteOffset + u8.byteLength,
  ) as ArrayBuffer;
}
