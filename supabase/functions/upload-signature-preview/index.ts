/**
 * upload-signature-preview — 클라이언트 사이드 pre-render PNG 업로드 (Phase 2C v2)
 *
 * 교사 브라우저가 pdfjs-dist 5.x 로 렌더링한 페이지 PNG / region cutout PNG 를
 * base64 로 보내면, service_role 권한으로 signature-previews bucket 에 업로드한다.
 * 학생 hot-path 는 PNG 를 직접 GET (Edge Function 0회) — 비용 0 정책 유지.
 *
 * 입력: { requestId, regionVersion, kind: 'page'|'region', pageIndex?, regionId?, base64Png }
 * 출력: { storagePath, publicUrl }
 *
 * RLS: signature-previews bucket 은 service_role only write + public read (migration 031).
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  corsHeaders,
  errorResponse,
  internalErrorResponse,
  jsonResponse,
} from '../_shared/cors.ts';
import { checkRateLimit, clientIpFrom } from '../_shared/rateLimit.ts';

interface UploadBody {
  readonly requestId?: string;
  readonly regionVersion?: number;
  readonly kind?: 'page' | 'region';
  readonly pageIndex?: number;
  readonly regionId?: string;
  readonly base64Png?: string;
}

const MAX_PNG_BYTES = 5_242_880; // 5MB (migration 031 bucket 한도와 일치)
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REGION_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function isPng(bytes: Uint8Array): boolean {
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return errorResponse('POST only', 405);
  }

  try {
    const body = (await req.json()) as UploadBody;

    if (!body.requestId || !REQUEST_ID_PATTERN.test(body.requestId)) {
      return errorResponse('requestId 가 UUID 형식이어야 합니다.', 400);
    }
    if (
      typeof body.regionVersion !== 'number' ||
      !Number.isInteger(body.regionVersion) ||
      body.regionVersion < 0 ||
      body.regionVersion > 1_000_000
    ) {
      return errorResponse('regionVersion 이 0 이상의 정수여야 합니다.', 400);
    }
    if (body.kind !== 'page' && body.kind !== 'region') {
      return errorResponse('kind 가 page 또는 region 이어야 합니다.', 400);
    }
    if (body.kind === 'page') {
      if (
        typeof body.pageIndex !== 'number' ||
        !Number.isInteger(body.pageIndex) ||
        body.pageIndex < 0 ||
        body.pageIndex > 50
      ) {
        return errorResponse('pageIndex 가 0~50 사이여야 합니다.', 400);
      }
    } else {
      if (!body.regionId || !REGION_ID_PATTERN.test(body.regionId)) {
        return errorResponse('regionId 가 누락되었거나 형식이 잘못되었습니다.', 400);
      }
    }
    if (typeof body.base64Png !== 'string' || body.base64Png.length === 0) {
      return errorResponse('base64Png 가 누락되었습니다.', 400);
    }

    let pngBytes: Uint8Array;
    try {
      pngBytes = base64ToBytes(body.base64Png);
    } catch {
      return errorResponse('base64Png 디코딩 실패.', 400);
    }
    if (pngBytes.byteLength > MAX_PNG_BYTES) {
      return errorResponse('PNG 가 너무 큽니다 (5MB 한도).', 400);
    }
    if (!isPng(pngBytes)) {
      return errorResponse('PNG 시그니처가 아닙니다.', 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Rate limit — 100 회 / 시간 (10페이지 × 10영역 = 100 업로드 1회분 여유).
    const clientIP = clientIpFrom(req);
    const isLimited = await checkRateLimit(supabase, 'upload-signature-preview', [
      { identifier: clientIP, windowMs: 3_600_000, max: 200 },
    ]);
    if (isLimited) {
      return errorResponse('요청이 너무 많습니다.', 429);
    }

    const fileName =
      body.kind === 'page'
        ? `page-${String(body.pageIndex).padStart(3, '0')}.png`
        : `region-${body.regionId}.png`;
    const storagePath = `${body.requestId}/v${body.regionVersion}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('signature-previews')
      .upload(storagePath, pngBytes, {
        contentType: 'image/png',
        upsert: true,
      });
    if (uploadError) {
      return internalErrorResponse('upload-signature-preview upload', uploadError);
    }

    const { data: urlData } = supabase.storage.from('signature-previews').getPublicUrl(storagePath);

    return jsonResponse({
      storagePath,
      publicUrl: urlData.publicUrl,
    });
  } catch (err) {
    return internalErrorResponse('upload-signature-preview', err);
  }
});
