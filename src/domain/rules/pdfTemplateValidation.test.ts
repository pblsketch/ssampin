import { describe, expect, it, beforeAll } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  hasPdfMagicBytes,
  inspectPdfStructure,
  isPasswordProtectedError,
  MAX_PDF_FILE_BYTES,
  PDF_REJECT_COPY,
  PDF_WARN_COPY,
  validatePdfTemplateBytes,
} from './pdfTemplateValidation';

/**
 * fixture builder — pdf-lib 으로 작은 PDF 를 동적 생성. 실제 fixture 파일을 commit 하지
 * 않아도 검증 로직을 deterministic 하게 확인할 수 있다.
 */
async function buildPdf(options: {
  pageCount: number;
  orientations?: ('portrait' | 'landscape')[];
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const portraitSize: [number, number] = [595.28, 841.89]; // A4 portrait
  const landscapeSize: [number, number] = [841.89, 595.28]; // A4 landscape
  for (let i = 0; i < options.pageCount; i++) {
    const orientation = options.orientations?.[i] ?? 'portrait';
    doc.addPage(orientation === 'landscape' ? landscapeSize : portraitSize);
  }
  return doc.save();
}

/**
 * 정상 PDF 에 AcroForm + 활성 Fields 토큰 삽입. raw stream 끝에 추가해도 inspectPdfStructure
 * 의 정규식 패턴이 잡는다 (parse 자체는 무관 — 우리는 raw bytes 휴리스틱만 쓴다).
 */
function appendBytes(base: Uint8Array, tail: string): Uint8Array {
  const tailBytes = new TextEncoder().encode(tail);
  const combined = new Uint8Array(base.length + tailBytes.length);
  combined.set(base, 0);
  combined.set(tailBytes, base.length);
  return combined;
}

let validPdfBytes: Uint8Array;
let mixedOrientationPdfBytes: Uint8Array;
let elevenPagesPdfBytes: Uint8Array;
let signedPdfBytes: Uint8Array;
let acroformActivePdfBytes: Uint8Array;
let acroformEmptyPdfBytes: Uint8Array;

beforeAll(async () => {
  validPdfBytes = await buildPdf({ pageCount: 3 });
  mixedOrientationPdfBytes = await buildPdf({
    pageCount: 3,
    orientations: ['portrait', 'landscape', 'portrait'],
  });
  elevenPagesPdfBytes = await buildPdf({ pageCount: 11 });
  signedPdfBytes = appendBytes(
    await buildPdf({ pageCount: 1 }),
    '\n%comment /FT /Sig — Phase 2C PoC test fixture\n',
  );
  acroformActivePdfBytes = appendBytes(
    await buildPdf({ pageCount: 1 }),
    '\n%comment /AcroForm << /Fields [ 99 0 R ] >>\n',
  );
  acroformEmptyPdfBytes = appendBytes(
    await buildPdf({ pageCount: 1 }),
    '\n%comment /AcroForm << /Fields [ ] >>\n',
  );
});

describe('hasPdfMagicBytes', () => {
  it('정상 PDF 의 %PDF- magic 을 인식한다', () => {
    expect(hasPdfMagicBytes(validPdfBytes)).toBe(true);
  });

  it('PDF 가 아닌 bytes 는 false', () => {
    expect(hasPdfMagicBytes(new TextEncoder().encode('not a pdf'))).toBe(false);
  });

  it('빈 bytes 는 false', () => {
    expect(hasPdfMagicBytes(new Uint8Array(0))).toBe(false);
  });
});

describe('isPasswordProtectedError', () => {
  it('encryption 메시지를 인식한다', () => {
    expect(isPasswordProtectedError(new Error('Input document is encrypted'))).toBe(true);
  });

  it('password 메시지를 인식한다', () => {
    expect(isPasswordProtectedError(new Error('Password required'))).toBe(true);
  });

  it('관련 없는 에러는 false', () => {
    expect(isPasswordProtectedError(new Error('Failed to parse object'))).toBe(false);
  });
});

describe('inspectPdfStructure', () => {
  it('정상 PDF 는 signedPdf=false, acroformActive=false', () => {
    const { signedPdf, acroformActive } = inspectPdfStructure(validPdfBytes);
    expect(signedPdf).toBe(false);
    expect(acroformActive).toBe(false);
  });

  it('`/FT /Sig` 토큰을 가진 PDF 는 signedPdf=true', () => {
    expect(inspectPdfStructure(signedPdfBytes).signedPdf).toBe(true);
  });

  it('AcroForm + 비어있지 않은 Fields 는 acroformActive=true', () => {
    expect(inspectPdfStructure(acroformActivePdfBytes).acroformActive).toBe(true);
  });

  it('AcroForm + 빈 Fields[] 는 acroformActive=false (비활성 metadata 허용)', () => {
    expect(inspectPdfStructure(acroformEmptyPdfBytes).acroformActive).toBe(false);
  });

  it('SigFlags 비트 1 (signaturesExist) 도 signedPdf=true', () => {
    const bytes = appendBytes(validPdfBytes, '\n%comment /SigFlags 3 — append-only seal\n');
    expect(inspectPdfStructure(bytes).signedPdf).toBe(true);
  });
});

describe('validatePdfTemplateBytes — 6개 거절 케이스 + 정상 케이스', () => {
  it('정상 3페이지 PDF 는 통과 (ok=true, orientations=portrait*3, mixed=false)', async () => {
    const result = await validatePdfTemplateBytes(validPdfBytes);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pageCount).toBe(3);
      expect(result.orientations).toEqual(['portrait', 'portrait', 'portrait']);
      expect(result.mixedOrientation).toBe(false);
      expect(result.warning).toBeUndefined();
    }
  });

  it('빈 bytes 는 missing_pdf 거절', async () => {
    const result = await validatePdfTemplateBytes(new Uint8Array(0));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('missing_pdf');
      expect(result.message).toBe(PDF_REJECT_COPY.missing_pdf);
    }
  });

  it('10MB 초과는 too_large 거절', async () => {
    const large = new Uint8Array(MAX_PDF_FILE_BYTES + 1);
    large[0] = 0x25; // %
    large[1] = 0x50; // P
    large[2] = 0x44; // D
    large[3] = 0x46; // F
    large[4] = 0x2d; // -
    const result = await validatePdfTemplateBytes(large);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('too_large');
  });

  it('PDF 아닌 bytes 는 not_a_pdf 거절', async () => {
    const txt = new TextEncoder().encode('hello world this is not a pdf');
    const result = await validatePdfTemplateBytes(txt);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('not_a_pdf');
  });

  it('11페이지는 too_many_pages 거절', async () => {
    const result = await validatePdfTemplateBytes(elevenPagesPdfBytes);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('too_many_pages');
  });

  it('봉인 디지털 서명 (/FT /Sig) 은 signed_pdf 거절', async () => {
    const result = await validatePdfTemplateBytes(signedPdfBytes);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('signed_pdf');
  });

  it('AcroForm 활성 필드는 acroform_active 거절', async () => {
    const result = await validatePdfTemplateBytes(acroformActivePdfBytes);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('acroform_active');
  });

  it('mixed-orientation 은 warn (reject 아님)', async () => {
    const result = await validatePdfTemplateBytes(mixedOrientationPdfBytes);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mixedOrientation).toBe(true);
      expect(result.warning?.code).toBe('mixed_orientation');
      expect(result.warning?.message).toBe(PDF_WARN_COPY.mixed_orientation);
      expect(result.orientations).toEqual(['portrait', 'landscape', 'portrait']);
    }
  });

  it('비활성 AcroForm (빈 Fields) 만 있는 PDF 는 통과', async () => {
    const result = await validatePdfTemplateBytes(acroformEmptyPdfBytes);
    expect(result.ok).toBe(true);
  });
});
