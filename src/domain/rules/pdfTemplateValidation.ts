/**
 * Phase 2C Step C — PDF 양식 업로드 검증 순수 함수 (PRD US-2C-08, AC-2).
 *
 * Edge Function `validate-pdf-upload` 와 클라이언트 UI 둘 다 호출 가능하도록 도메인 layer
 * 에 두고, fetch / Storage / Supabase 의존성은 caller 가 책임진다.
 *
 * 검증 사항:
 *   1. 파일 크기 > 10MB → reject (`too_large`)
 *   2. PDF magic byte (`%PDF-`) 부재 → reject (`not_a_pdf`)
 *   3. 페이지 수 > 10 → reject (`too_many_pages`)
 *   4. 패스워드 보호 PDF → reject (`password_protected`) — pdf-lib load 에러 메시지로 판별
 *   5. 봉인 디지털 서명 PDF (`/FT /Sig` 또는 `/SigFlags` 비트 1) → reject (`signed_pdf`)
 *   6. AcroForm 활성 필드 (`/AcroForm` + 비어있지 않은 `/Fields [`) → reject (`acroform_active`)
 *   7. mixed-orientation (portrait + landscape 혼합) → **warn** (reject 아님)
 *
 * 모든 검사는 동일 입력에 대해 deterministic 한 결과를 반환한다.
 */

import { PDFDocument } from 'pdf-lib';

export const MAX_PDF_FILE_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_PDF_PAGE_COUNT = 10;

export type PdfRejectCode =
  | 'missing_pdf'
  | 'invalid_base64'
  | 'too_large'
  | 'not_a_pdf'
  | 'password_protected'
  | 'too_many_pages'
  | 'signed_pdf'
  | 'acroform_active';

export type PdfWarnCode = 'mixed_orientation';

export const PDF_REJECT_COPY: Record<PdfRejectCode, string> = {
  missing_pdf: 'PDF 파일을 첨부해 주세요.',
  invalid_base64: 'PDF 파일을 다시 첨부해 주세요. (인코딩 오류)',
  too_large: 'PDF 파일이 10MB 를 넘습니다. 양식을 분리하거나 압축해 주세요.',
  not_a_pdf: 'PDF 파일만 업로드할 수 있어요. 다른 형식이면 변환 후 다시 시도해 주세요.',
  password_protected:
    '비밀번호가 걸린 PDF 는 사용할 수 없어요. 비밀번호를 풀어서 다시 업로드해 주세요.',
  too_many_pages: 'PDF 가 10페이지를 넘습니다. 양식을 줄이거나 분리해 주세요.',
  signed_pdf: '이미 디지털 서명이 봉인된 PDF 입니다. 빈 양식 (서명 없는 원본) 을 업로드해 주세요.',
  acroform_active:
    '입력 가능한 양식 필드가 들어 있는 PDF 입니다. 필드를 평면화한 PDF (인쇄용 형태) 를 업로드해 주세요.',
};

export const PDF_WARN_COPY: Record<PdfWarnCode, string> = {
  mixed_orientation:
    '가로/세로 혼합 양식이에요. Pattern 2 자동복제는 페이지 단위로만 작동합니다. 그대로 진행할까요?',
};

export type PageOrientation = 'portrait' | 'landscape';

export interface PdfValidationOk {
  readonly ok: true;
  readonly pageCount: number;
  readonly orientations: readonly PageOrientation[];
  readonly mixedOrientation: boolean;
  readonly fileSize: number;
  readonly warning?: { readonly code: PdfWarnCode; readonly message: string };
}

export interface PdfValidationReject {
  readonly ok: false;
  readonly code: PdfRejectCode;
  readonly message: string;
}

export type PdfValidationResult = PdfValidationOk | PdfValidationReject;

/** PDF magic byte (%PDF-) 검증. */
export function hasPdfMagicBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

/** pdf-lib load 에러 메시지를 검사해 password 보호 PDF 인지 판별. */
export function isPasswordProtectedError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /encrypt|password/i.test(message);
}

/**
 * 페이지 orientation + mixed orientation 검사. pdf-lib 의 page.getSize() 사용.
 */
export interface PageInspection {
  readonly pageCount: number;
  readonly orientations: readonly PageOrientation[];
  readonly mixedOrientation: boolean;
}

export function inspectPdfPages(doc: PDFDocument): PageInspection {
  const pageCount = doc.getPageCount();
  const orientations: PageOrientation[] = [];
  for (let i = 0; i < pageCount; i++) {
    const page = doc.getPage(i);
    const { width, height } = page.getSize();
    orientations.push(height >= width ? 'portrait' : 'landscape');
  }
  const mixedOrientation = orientations.includes('portrait') && orientations.includes('landscape');
  return { pageCount, orientations, mixedOrientation };
}

/**
 * raw bytes 의 `/Sig`, `/SigFlags`, `/AcroForm + /Fields [...]` 토큰 검사.
 *
 * - signedPdf: `/FT /Sig` 필드 또는 `/SigFlags 1|3` (signaturesExist 비트)
 * - acroformActive: `/AcroForm` dictionary 가 비어있지 않은 `/Fields` 배열을 가지고 있음
 *
 * 비활성 AcroForm (예: `/AcroForm <<>>` 만 있고 `/Fields` 비어 있음) 은 통과.
 */
export interface PdfStructureFlags {
  readonly signedPdf: boolean;
  readonly acroformActive: boolean;
}

export function inspectPdfStructure(bytes: Uint8Array): PdfStructureFlags {
  const ascii = new TextDecoder('latin1').decode(bytes);
  const sigFieldType = /\/FT\s*\/Sig\b/.test(ascii);
  const sigFlagsMatch = /\/SigFlags\s+([0-9]+)/.exec(ascii);
  const sigFlagsValue = sigFlagsMatch ? parseInt(sigFlagsMatch[1] ?? '0', 10) : 0;
  const signedPdf = sigFieldType || (sigFlagsValue & 0x01) === 0x01;
  // `/Fields` 배열이 비어있지 않은 패턴 — `[ <number> 0 R` 또는 `[ <<` 으로 시작
  const acroformActive = /\/AcroForm\b[\s\S]{0,400}\/Fields\s*\[\s*[^\]\s]/.test(ascii);
  return { signedPdf, acroformActive };
}

/**
 * 메인 검증 함수. caller 는 `pdfBytes` 를 받아 호출하면 된다.
 *
 * 실패 시 ok=false + 거절 코드/카피, 성공 시 ok=true + 페이지 메타. mixed-orientation
 * 은 warning 으로 첨부 (ok=true 유지).
 */
export async function validatePdfTemplateBytes(pdfBytes: Uint8Array): Promise<PdfValidationResult> {
  if (pdfBytes.byteLength === 0) {
    return { ok: false, code: 'missing_pdf', message: PDF_REJECT_COPY.missing_pdf };
  }
  if (pdfBytes.byteLength > MAX_PDF_FILE_BYTES) {
    return { ok: false, code: 'too_large', message: PDF_REJECT_COPY.too_large };
  }
  if (!hasPdfMagicBytes(pdfBytes)) {
    return { ok: false, code: 'not_a_pdf', message: PDF_REJECT_COPY.not_a_pdf };
  }

  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: false });
  } catch (err) {
    if (isPasswordProtectedError(err)) {
      return {
        ok: false,
        code: 'password_protected',
        message: PDF_REJECT_COPY.password_protected,
      };
    }
    return { ok: false, code: 'not_a_pdf', message: PDF_REJECT_COPY.not_a_pdf };
  }

  const { pageCount, orientations, mixedOrientation } = inspectPdfPages(doc);
  if (pageCount > MAX_PDF_PAGE_COUNT) {
    return { ok: false, code: 'too_many_pages', message: PDF_REJECT_COPY.too_many_pages };
  }

  const { signedPdf, acroformActive } = inspectPdfStructure(pdfBytes);
  if (signedPdf) {
    return { ok: false, code: 'signed_pdf', message: PDF_REJECT_COPY.signed_pdf };
  }
  if (acroformActive) {
    return { ok: false, code: 'acroform_active', message: PDF_REJECT_COPY.acroform_active };
  }

  return {
    ok: true,
    pageCount,
    orientations,
    mixedOrientation,
    fileSize: pdfBytes.byteLength,
    ...(mixedOrientation && {
      warning: {
        code: 'mixed_orientation' as const,
        message: PDF_WARN_COPY.mixed_orientation,
      },
    }),
  };
}
