/**
 * Phase 2C Step C — validate-pdf-upload Edge Function (PRD US-2C-08).
 *
 * 교사가 직접 업로드한 PDF 양식을 검증 후 Supabase Storage `signature-templates/` 에 저장.
 * 검증 사항 (Plan AC-2):
 *   1. 파일 크기 > 10MB → reject
 *   2. 페이지 수 > 10 → reject
 *   3. 패스워드 보호 PDF → reject (pdf-lib load 가 encrypted 이면 throw)
 *   4. 봉인 디지털 서명 PDF (`/Sig` 객체) → reject
 *   5. AcroForm 활성 필드 PDF → reject (비활성 metadata 만 있으면 허용)
 *   6. mixed-orientation (portrait + landscape 혼합) → **warn** (reject 아님, 교사 확인 프롬프트)
 *
 * 응답: { ok, code, message?, warning?, pdfTemplate?: PdfTemplate }
 *   - ok=true + pdfTemplate: 검증 통과 + Storage 업로드 완료
 *   - ok=true + warning: mixed-orientation 경고 (계속 진행 가능, UI 가 confirm 받기)
 *   - ok=false + code/message: 거절 (한국어 안내 카피)
 *
 * 같은 검증 로직의 순수 함수 버전은 src/domain/rules/pdfTemplateValidation.ts 에서 따로 테스트.
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PDFDocument } from 'https://esm.sh/pdf-lib@1.17.1';
import {
  corsHeaders,
  errorResponse,
  internalErrorResponse,
  jsonResponse,
} from '../_shared/cors.ts';
import { checkRateLimit, clientIpFrom } from '../_shared/rateLimit.ts';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_PAGE_COUNT = 10;
const SIGNATURE_TEMPLATES_BUCKET = 'signature-templates';

interface ValidateRequest {
  readonly teacherId?: string;
  readonly fileName?: string;
  readonly pdfBase64?: string;
}

/**
 * 거절 코드 — 각 케이스마다 한국어 안내 카피.
 */
const REJECT_COPY: Record<string, string> = {
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
  upload_failed: '업로드 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.',
};

const MIXED_ORIENTATION_WARN_COPY =
  '가로/세로 혼합 양식이에요. Pattern 2 자동복제는 페이지 단위로만 작동합니다. 그대로 진행할까요?';

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/^data:[^,]+,/, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

interface PageInspection {
  readonly pageCount: number;
  readonly orientations: readonly ('portrait' | 'landscape')[];
  readonly mixedOrientation: boolean;
}

function inspectPages(doc: PDFDocument): PageInspection {
  const pageCount = doc.getPageCount();
  const orientations: ('portrait' | 'landscape')[] = [];
  for (let i = 0; i < pageCount; i++) {
    const page = doc.getPage(i);
    const { width, height } = page.getSize();
    orientations.push(height >= width ? 'portrait' : 'landscape');
  }
  const mixedOrientation = orientations.includes('portrait') && orientations.includes('landscape');
  return { pageCount, orientations, mixedOrientation };
}

/**
 * AcroForm + 봉인 서명 검사. pdf-lib 의 raw catalog API 를 사용하지 못하는 경우를 대비해
 * raw bytes 의 `/AcroForm` 과 `/Sig` 토큰을 보조 휴리스틱으로 같이 본다.
 *
 * - signedPdf: PDF 어딘가에 `/FT /Sig` 또는 `/SigFlags 3` (Append-only 봉인) 검출
 * - acroformActive: AcroForm.Fields 가 비어있지 않거나 (raw 휴리스틱) `/AcroForm` 토큰이
 *   `/Fields [` 배열을 동반하는 경우
 *
 * 비활성 metadata only AcroForm (예: 한국 정부 양식이 `/AcroForm <<>>` 만 두는 경우) 은
 * `/Fields` 가 비어 있으므로 통과.
 */
interface PdfStructureFlags {
  readonly signedPdf: boolean;
  readonly acroformActive: boolean;
}

function inspectStructure(pdfBytes: Uint8Array): PdfStructureFlags {
  const ascii = new TextDecoder('latin1').decode(pdfBytes);
  // 봉인 디지털 서명: `/Sig` 필드 또는 SigFlags 비트 1 (signaturesExist)
  const sigFieldType = /\/FT\s*\/Sig\b/.test(ascii);
  const sigFlagsBit = /\/SigFlags\s+([0-9]+)/.exec(ascii);
  const sigFlagsValue = sigFlagsBit ? parseInt(sigFlagsBit[1] ?? '0', 10) : 0;
  const signedPdf = sigFieldType || (sigFlagsValue & 0x01) === 0x01;
  // AcroForm 활성 — `/Fields` 배열이 비어있지 않은 패턴
  const acroformActive = /\/AcroForm\b[\s\S]{0,200}\/Fields\s*\[\s*[^\]\s]/.test(ascii);
  return { signedPdf, acroformActive };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return errorResponse('POST only', 405);
  }

  try {
    const body = (await req.json()) as ValidateRequest;
    if (!body.pdfBase64) {
      return rejectResponse('missing_pdf');
    }

    let pdfBytes: Uint8Array;
    try {
      pdfBytes = base64ToBytes(body.pdfBase64);
    } catch {
      return rejectResponse('invalid_base64');
    }
    if (pdfBytes.byteLength === 0) {
      return rejectResponse('missing_pdf');
    }
    if (pdfBytes.byteLength > MAX_FILE_BYTES) {
      return rejectResponse('too_large');
    }
    // PDF magic — '%PDF-'
    if (
      pdfBytes[0] !== 0x25 ||
      pdfBytes[1] !== 0x50 ||
      pdfBytes[2] !== 0x44 ||
      pdfBytes[3] !== 0x46 ||
      pdfBytes[4] !== 0x2d
    ) {
      return rejectResponse('not_a_pdf');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Rate limit — 같은 IP 분당 10회, 시간당 60회
    const clientIP = clientIpFrom(req);
    const isLimited = await checkRateLimit(supabase, 'validate-pdf-upload', [
      { identifier: clientIP, windowMs: 60_000, max: 10 },
      { identifier: clientIP, windowMs: 3_600_000, max: 60 },
    ]);
    if (isLimited) {
      return errorResponse('요청이 너무 많아요. 잠시 후 다시 시도해 주세요.', 429);
    }

    // PDF parse — 패스워드 보호 PDF 는 throw
    let doc: PDFDocument;
    try {
      doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/encrypt|password/i.test(msg)) {
        return rejectResponse('password_protected');
      }
      // PDF parse 실패 — 손상되었거나 형식이 다름
      return rejectResponse('not_a_pdf');
    }

    const { pageCount, orientations, mixedOrientation } = inspectPages(doc);
    if (pageCount > MAX_PAGE_COUNT) {
      return rejectResponse('too_many_pages');
    }

    const { signedPdf, acroformActive } = inspectStructure(pdfBytes);
    if (signedPdf) {
      return rejectResponse('signed_pdf');
    }
    if (acroformActive) {
      return rejectResponse('acroform_active');
    }

    // 검증 통과 — Storage 업로드
    const teacherId = body.teacherId?.trim() || `anon-${await sha256Hex(clientIP)}`;
    const templateId = crypto.randomUUID();
    const storagePath = `${teacherId}/${templateId}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from(SIGNATURE_TEMPLATES_BUCKET)
      .upload(storagePath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: false,
      });
    if (uploadError) {
      return internalErrorResponse(
        'validate-pdf-upload storage',
        uploadError,
        REJECT_COPY.upload_failed,
        500,
      );
    }

    const pdfTemplate = {
      storagePath: `${SIGNATURE_TEMPLATES_BUCKET}/${storagePath}`,
      pageCount,
      fileSize: pdfBytes.byteLength,
      uploadedAt: new Date().toISOString(),
    };

    const response: {
      ok: true;
      pdfTemplate: typeof pdfTemplate;
      orientations: readonly string[];
      warning?: { code: 'mixed_orientation'; message: string };
    } = {
      ok: true,
      pdfTemplate,
      orientations,
    };
    if (mixedOrientation) {
      response.warning = {
        code: 'mixed_orientation',
        message: MIXED_ORIENTATION_WARN_COPY,
      };
    }
    return jsonResponse(response);
  } catch (err) {
    return internalErrorResponse('validate-pdf-upload', err);
  }
});

function rejectResponse(code: keyof typeof REJECT_COPY): Response {
  return jsonResponse(
    {
      ok: false,
      code,
      message: REJECT_COPY[code],
    },
    400,
  );
}
