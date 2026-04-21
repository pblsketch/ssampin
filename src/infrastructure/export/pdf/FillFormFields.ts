import {
  PDFDocument,
  PDFCheckBox,
  PDFTextField,
  type PDFForm,
} from 'pdf-lib';
import { embedKoreanFonts } from './FontRegistry';
import type { PdfFormFillInput, PdfOptions } from './types';

/**
 * AcroForm PDF mail-merge.
 *
 * 동작:
 *   1) 각 row 마다 원본 PDF 를 로드하여 독립된 사본을 만든다.
 *   2) 사본의 폼 필드에 값을 주입한다.
 *   3) Korean 폰트를 임베딩하고 `form.updateFieldAppearances(font)` 로 외관 재생성.
 *   4) `form.flatten()` — 필드 값을 페이지 content stream 으로 굽고 폼 구조 제거.
 *   5) 최종 문서에 사본의 모든 페이지를 copy 해 붙인다.
 *
 * 이렇게 하는 이유: AcroForm 은 document-scope 라 같은 이름의 필드끼리 값이 공유됨.
 * 단순 append 로는 mail-merge 가 불가능하고, row 별 독립 copy 후 flatten 이 필요하다.
 */
export async function fillFormFields(
  input: PdfFormFillInput,
  options?: PdfOptions,
): Promise<ArrayBuffer> {
  const { sourcePdf, rows, fieldMap } = input;

  if (!sourcePdf || sourcePdf.byteLength === 0) {
    throw new Error('fillFormFields: sourcePdf 가 비어 있습니다.');
  }
  if (rows.length === 0) {
    throw new Error('fillFormFields: rows 가 최소 1개 이상이어야 합니다.');
  }

  // 0) 원본에 AcroForm 이 있는지 먼저 점검. 필드 0개면 의미 없으므로 에러.
  {
    const probe = await PDFDocument.load(sourcePdf);
    const probeForm = probe.getForm();
    if (probeForm.getFields().length === 0) {
      throw new Error(
        'fillFormFields: 원본 PDF 에 AcroForm 필드가 없습니다. ' +
          '폼이 있는 PDF 를 지정하거나 renderTemplate 사용을 검토하세요.',
      );
    }
  }

  const finalDoc = await PDFDocument.create();
  if (options?.title) finalDoc.setTitle(options.title);
  finalDoc.setAuthor(options?.author ?? '쌤핀');

  for (const row of rows) {
    const perRow = await PDFDocument.load(sourcePdf);

    // 한글 폰트 임베딩 — updateFieldAppearances 가 이 폰트로 외관 재생성.
    const { regular: koreanFont } = await embedKoreanFonts(perRow);

    const form = perRow.getForm();
    applyRowToForm(form, row, fieldMap);

    // 폰트 외관 재생성 후 flatten.
    form.updateFieldAppearances(koreanFont);
    form.flatten();

    const pageIndices = perRow.getPageIndices();
    const copiedPages = await finalDoc.copyPages(perRow, pageIndices);
    for (const page of copiedPages) finalDoc.addPage(page);
  }

  const bytes = await finalDoc.save();
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

/**
 * row 값을 form 의 필드에 적용.
 *
 * 필드 이름 해석 우선순위:
 *   1) fieldMap[pdfFieldName] 이 있으면 row[fieldMap[pdfFieldName]] 사용
 *   2) 아니면 row[pdfFieldName] 직접 사용
 *
 * 지원 필드 타입: PDFTextField, PDFCheckBox. 그 외는 조용히 skip.
 * 제공된 row 에 해당 키가 없으면 해당 필드 skip (원본 값 유지).
 */
function applyRowToForm(
  form: PDFForm,
  row: Record<string, string | boolean>,
  fieldMap: Record<string, string> | undefined,
): void {
  for (const field of form.getFields()) {
    const name = field.getName();
    const rowKey = fieldMap?.[name] ?? name;
    if (!(rowKey in row)) continue;
    const value = row[rowKey];

    if (field instanceof PDFTextField) {
      field.setText(String(value));
    } else if (field instanceof PDFCheckBox) {
      if (value === true) field.check();
      else if (value === false) field.uncheck();
    }
    // 그 외 (radio, dropdown, signature 등) 은 현재 미지원.
  }
}
