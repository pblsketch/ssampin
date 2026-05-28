/**
 * compose-signed-pdf — Phase 2C US-2C-12 결과 PDF 합성 Edge Function.
 *
 * 흐름
 *   1. 교사가 adminKey 와 함께 호출 → signature_requests.admin_key 검증.
 *   2. signature-templates bucket 의 원본 PDF + signature-images bucket 의 서명 PNG 들 fetch.
 *   3. pdf-lib + @pdf-lib/fontkit + Noto Sans KR 으로 region 좌표에 서명 이미지 stamp.
 *   4. 한글 footer (제출 현황 N/M YYYY-MM-DD HH:MM) 각 페이지 하단에 렌더.
 *   5. setKeywords/setProducer 메타 — 시각 워터마크는 부재 (제1 원칙).
 *   6. signature-results bucket 에 `{requestId}/v{version}.pdf` 업로드 (idempotent upsert).
 *   7. signature_compositions INSERT (RETURNING) — 새 version = MAX(version)+1.
 *   8. 응답: { version, storagePath, fileName, submissionCount, participantCount, composedAt }.
 *
 * 정책 (1차)
 *   - 시각 워터마크 부재 (행정용 표시는 메타데이터 only)
 *   - 자필 서명과 동등한 법적 효력 비주장 (Keywords '법적효력없음')
 *   - 외부 SaaS 미사용 (pdf-lib + fontkit 만)
 *   - 파일명: {sanitized_title}_쌤핀_행정용_v{n}.pdf  — 행정 시스템 인덱스 친화
 *
 * PoC A0-2 baseline (poc-compose-stress 검증 완료): 80 영역 × 10 페이지 < 50s, < 256MB.
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'https://esm.sh/pdf-lib@1.17.1';
import fontkit from 'https://esm.sh/@pdf-lib/fontkit@1.1.1';
import {
  corsHeaders,
  errorResponse,
  internalErrorResponse,
  jsonResponse,
} from '../_shared/cors.ts';
import { checkRateLimit, clientIpFrom } from '../_shared/rateLimit.ts';
import { timingSafeEqual } from '../_shared/hash.ts';
import { isValidRequestId, isValidTemplateStoragePath } from '../_shared/validators.ts';

/**
 * Noto Sans KR Regular 폰트 로드 (UltraQA Q3 보강).
 * - 기본 URL: notofonts GitHub raw (PoC 와 동일)
 * - ENV `NOTO_FONT_URL` override 가능 (운영자가 self-hosted endpoint 지정)
 * - 다운로드 후 SHA-256 integrity 검증 — 변조 시 throw
 * - 검증 통과 시에만 모듈 캐시 적재 (오염된 fetch 가 영구 캐시되는 사고 방지)
 */
const DEFAULT_NOTO_FONT_URL =
  'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/SubsetOTF/KR/NotoSansKR-Regular.otf';

/** _assets/NotoSansKR-Regular.otf 의 SHA-256 (4.6MB). fetch 응답이 이와 다르면 reject. */
const NOTO_FONT_SHA256 = '69975a0ac8472717870aefeab0a4d52739308d90856b9955313b2ad5e0148d68';

let cachedFontBytes: Uint8Array | null = null;

async function computeSha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function loadKoreanFont(): Promise<Uint8Array> {
  if (cachedFontBytes) return cachedFontBytes;
  const url = Deno.env.get('NOTO_FONT_URL') ?? DEFAULT_NOTO_FONT_URL;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Noto Sans KR fetch 실패: HTTP ${res.status} (${url})`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const actualHash = await computeSha256Hex(bytes);
  if (actualHash !== NOTO_FONT_SHA256) {
    // 캐시 적재 금지 — 오염된 응답이 다음 요청에 영구 영향 X.
    throw new Error(
      `Noto Sans KR integrity 검증 실패 (expected=${NOTO_FONT_SHA256.slice(0, 12)}…, got=${actualHash.slice(0, 12)}…). NOTO_FONT_URL 을 신뢰 가능한 mirror 로 교체하세요.`,
    );
  }
  cachedFontBytes = bytes;
  return cachedFontBytes;
}

interface ComposeBody {
  readonly requestId?: string;
  readonly adminKey?: string;
}

interface RegionRow {
  readonly id: string;
  readonly pageIndex: number;
  readonly rect: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  readonly participantId: string;
  readonly signatureKind: string;
}

const MAX_PARTICIPANTS = 200;
const MAX_REGIONS = 1000;

/**
 * 파일명용 한글/영문/숫자만 남기고 나머지 → '_'. 길이 60자 한도.
 * 행정 시스템 다수가 ASCII-only 인덱스를 쓰지만, 한글은 OS·브라우저 다운로드 단계에서
 * Content-Disposition filename* (RFC 5987) 로 안전 전달되므로 한글 보존을 우선시한다.
 */
function sanitizeFileNameSegment(title: string): string {
  const cleaned = title
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}_\-\s]/gu, '')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned.slice(0, 60) || 'signature';
}

function formatFooterTimestamp(
  submittedCount: number,
  requiredCount: number,
): {
  text: string;
  iso: string;
} {
  const now = new Date();
  // Asia/Seoul (UTC+9) — Edge Function 환경의 Deno 는 timezone 불명확, 명시 offset 적용.
  const seoul = new Date(now.getTime() + 9 * 3600 * 1000);
  const sy = seoul.getUTCFullYear();
  const smm = String(seoul.getUTCMonth() + 1).padStart(2, '0');
  const sdd = String(seoul.getUTCDate()).padStart(2, '0');
  const shh = String(seoul.getUTCHours()).padStart(2, '0');
  const smin = String(seoul.getUTCMinutes()).padStart(2, '0');
  return {
    text: `제출 현황 ${submittedCount}/${requiredCount}  ${sy}-${smm}-${sdd} ${shh}:${smin}`,
    iso: now.toISOString(),
  };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return errorResponse('POST only', 405);
  }

  try {
    const body = (await req.json()) as ComposeBody;
    if (!isValidRequestId(body.requestId)) {
      return errorResponse('requestId 가 UUID 형식이어야 합니다.', 400);
    }
    if (!body.adminKey || typeof body.adminKey !== 'string' || body.adminKey.length < 8) {
      return errorResponse('adminKey 가 필요합니다.', 403);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Rate limit — 합성은 비싼 작업. 분당 5회, 시간당 30회.
    const clientIP = clientIpFrom(req);
    const isLimited = await checkRateLimit(supabase, 'compose-signed-pdf', [
      { identifier: clientIP, windowMs: 60_000, max: 5 },
      { identifier: clientIP, windowMs: 3_600_000, max: 30 },
    ]);
    if (isLimited) {
      return errorResponse('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', 429);
    }

    // 1) 요청 + adminKey 검증
    const { data: request, error: requestError } = await supabase
      .from('signature_requests')
      .select('id,title,admin_key,status,pdf_template,regions,region_version')
      .eq('id', body.requestId)
      .single();

    if (requestError || !request) {
      return errorResponse('서명 요청을 찾을 수 없습니다.', 404);
    }
    if (
      typeof request.admin_key !== 'string' ||
      !timingSafeEqual(request.admin_key, body.adminKey)
    ) {
      return errorResponse('adminKey 가 일치하지 않습니다.', 403);
    }
    if (request.status !== 'active' && request.status !== 'closed') {
      return errorResponse(`상태가 ${request.status} 인 요청은 합성할 수 없습니다.`, 409);
    }

    const pdfTemplate = request.pdf_template as { storagePath?: string; pageCount?: number } | null;
    const regions = (Array.isArray(request.regions) ? request.regions : []) as readonly RegionRow[];
    if (!pdfTemplate || !pdfTemplate.pageCount) {
      return errorResponse('PDF 양식이 업로드되지 않아 합성할 수 없습니다.', 400);
    }
    // UltraQA Q1: path traversal · cross-tenant 차단 — 발급 시 검증된 형식만 허용.
    if (!isValidTemplateStoragePath(pdfTemplate.storagePath)) {
      return errorResponse('pdf_template.storagePath 가 안전하지 않습니다.', 400);
    }
    if (regions.length === 0) {
      return errorResponse('서명 영역이 설정되지 않아 합성할 수 없습니다.', 400);
    }
    if (regions.length > MAX_REGIONS) {
      return errorResponse(`서명 영역이 너무 많습니다 (>${MAX_REGIONS}).`, 400);
    }

    // 2) 참여자 + 제출 동시 fetch (병렬)
    const [{ data: participantsRaw, error: pErr }, { data: submissionsRaw, error: sErr }] =
      await Promise.all([
        supabase.from('signature_participants').select('id').eq('request_id', body.requestId),
        supabase
          .from('signature_submissions')
          .select('participant_id,signature_kind,signature_image_path,signature_image_mime')
          .eq('request_id', body.requestId),
      ]);
    if (pErr) return internalErrorResponse('compose-signed-pdf participants', pErr);
    if (sErr) return internalErrorResponse('compose-signed-pdf submissions', sErr);

    const participantCount = (participantsRaw ?? []).length;
    if (participantCount > MAX_PARTICIPANTS) {
      return errorResponse(`참여자가 너무 많습니다 (>${MAX_PARTICIPANTS}).`, 400);
    }

    const submissionByKey = new Map<string, { storagePath: string; mime: string }>();
    for (const sub of submissionsRaw ?? []) {
      const key = `${sub.participant_id}|${sub.signature_kind}`;
      submissionByKey.set(key, {
        storagePath: sub.signature_image_path,
        mime: sub.signature_image_mime,
      });
    }

    // 3) 템플릿 PDF 다운로드
    const { data: templateBlob, error: dlError } = await supabase.storage
      .from('signature-templates')
      .download(pdfTemplate.storagePath.replace(/^signature-templates\//, ''));
    if (dlError || !templateBlob) {
      return internalErrorResponse('compose-signed-pdf template download', dlError);
    }
    const templateBytes = new Uint8Array(await templateBlob.arrayBuffer());

    // 4) Region 별 서명 이미지 병렬 다운로드 (제출 안 된 region 은 빈자리로 유지)
    const regionImageBytes = new Map<string, { bytes: Uint8Array; mime: string }>();
    await Promise.all(
      regions.map(async (region) => {
        const key = `${region.participantId}|${region.signatureKind}`;
        const sub = submissionByKey.get(key);
        if (!sub) return;
        const path = sub.storagePath.replace(/^signature-images\//, '');
        const { data: imgBlob, error: imgErr } = await supabase.storage
          .from('signature-images')
          .download(path);
        if (imgErr || !imgBlob) return; // 미서명 처리 — 박스 점선만 남김
        regionImageBytes.set(region.id, {
          bytes: new Uint8Array(await imgBlob.arrayBuffer()),
          mime: sub.mime,
        });
      }),
    );

    // 5) pdf-lib 합성
    const doc = await PDFDocument.load(templateBytes);
    doc.registerFontkit(fontkit);
    doc.setKeywords(['행정용', '법적효력없음', '쌤핀']);
    doc.setProducer('쌤핀 행정용');
    doc.setCreator('쌤핀');
    doc.setTitle(String(request.title ?? '서명받기 결과'));

    const fontBytes = await loadKoreanFont();
    const korFont: PDFFont = await doc.embedFont(fontBytes, { subset: true });
    const latinFont: PDFFont = await doc.embedFont(StandardFonts.Helvetica);

    const pages = doc.getPages();
    if (pages.length < pdfTemplate.pageCount) {
      return errorResponse(
        `템플릿 PDF 페이지 수 (${pages.length}) 가 메타데이터 (${pdfTemplate.pageCount}) 와 불일치합니다.`,
        409,
      );
    }

    // region stamp — y 좌표는 PDF 좌표계 (bottom-up) 이므로 region.rect.y 가 top-down 0~1 임을 변환.
    for (const region of regions) {
      const page = pages[region.pageIndex];
      if (!page) continue;
      const { width: pw, height: ph } = page.getSize();
      const x = region.rect.x * pw;
      const w = region.rect.w * pw;
      const h = region.rect.h * ph;
      const yTop = region.rect.y * ph;
      const y = ph - yTop - h; // top-down → bottom-up
      const img = regionImageBytes.get(region.id);
      if (img) {
        try {
          // UltraQA Q2: WebP 는 pdf-lib 미지원 — submit-signature 가 PNG 만 받도록 좁혀졌으므로
          // 여기서는 PNG 만 embed. 만약 legacy WebP submission 이 남아 있다면 outer catch 가
          // 빈 박스 fallback 처리 + 운영자가 console.error 로그로 인지.
          if (img.mime !== 'image/png') {
            console.warn(
              `[compose-signed-pdf] region(${region.id}) MIME=${img.mime} not embeddable — skipping`,
            );
            throw new Error(`unsupported mime ${img.mime}`);
          }
          const embedded = await doc.embedPng(img.bytes);
          page.drawImage(embedded, { x, y, width: w, height: h });
        } catch {
          // 디코딩 실패 시 빈 박스로 fallback (회귀 가드와 호환)
          page.drawRectangle({
            x,
            y,
            width: w,
            height: h,
            borderColor: rgb(0.7, 0.7, 0.7),
            borderWidth: 0.4,
          });
        }
      } else {
        page.drawRectangle({
          x,
          y,
          width: w,
          height: h,
          borderColor: rgb(0.75, 0.75, 0.75),
          borderWidth: 0.4,
        });
      }
    }

    // footer (모든 페이지) — 한글 제출 현황 + 메타 시각
    const submittedCount = submissionByKey.size;
    const requiredCount = regions.length;
    const footer = formatFooterTimestamp(submittedCount, requiredCount);
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i]!;
      const { width: pw } = page.getSize();
      page.drawText(footer.text, {
        x: 30,
        y: 18,
        size: 8,
        font: korFont,
        color: rgb(0.4, 0.4, 0.4),
      });
      page.drawText(`p.${i + 1}/${pages.length}`, {
        x: pw - 60,
        y: 18,
        size: 8,
        font: latinFont,
        color: rgb(0.4, 0.4, 0.4),
      });
    }

    const outputBytes = await doc.save();

    // 6) version 결정 + upload + INSERT — race condition (동시 2 호출 시 같은 nextVersion 시도) 에 대비해
    //    최대 3회 재시도 (PRIMARY KEY (request_id, version) unique_violation 23505 캐치).
    const sanitized = sanitizeFileNameSegment(String(request.title ?? 'signature'));
    let nextVersion = 0;
    let storagePath = '';
    let fileName = '';
    let inserted = false;
    for (let attempt = 1; attempt <= 3 && !inserted; attempt++) {
      const { data: latest, error: latestErr } = await supabase
        .from('signature_compositions')
        .select('version')
        .eq('request_id', body.requestId)
        .order('version', { ascending: false })
        .limit(1);
      if (latestErr) {
        return internalErrorResponse('compose-signed-pdf latest version', latestErr);
      }
      nextVersion = (latest?.[0]?.version ?? 0) + 1;
      fileName = `${sanitized}_쌤핀_행정용_v${nextVersion}.pdf`;
      storagePath = `${body.requestId}/v${nextVersion}.pdf`;

      // upload 는 upsert=true 라 같은 path 에 두 번 써도 멱등. INSERT 에서 충돌 시 다음 attempt.
      const { error: upError } = await supabase.storage
        .from('signature-results')
        .upload(storagePath, outputBytes, {
          contentType: 'application/pdf',
          upsert: true,
        });
      if (upError) return internalErrorResponse('compose-signed-pdf upload', upError);

      const { error: insErr } = await supabase.from('signature_compositions').insert({
        request_id: body.requestId,
        version: nextVersion,
        storage_path: `signature-results/${storagePath}`,
        file_size_bytes: outputBytes.byteLength,
        submission_count: submittedCount,
        participant_count: participantCount,
        composed_at: footer.iso,
      });
      if (!insErr) {
        inserted = true;
        break;
      }
      const code = (insErr as { code?: string }).code;
      if (code !== '23505') {
        // unique_violation 외의 에러는 즉시 실패.
        return internalErrorResponse('compose-signed-pdf composition insert', insErr);
      }
      // 23505 — 동시 합성으로 같은 version 점유됨. 다음 attempt 에서 재계산.
      console.warn(
        `[compose-signed-pdf] version ${nextVersion} race (attempt ${attempt}/3) — retrying`,
      );
    }
    if (!inserted) {
      return errorResponse('동시 합성 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', 409);
    }

    // 7) signed URL 발급 — signature-results 가 private bucket 이므로 클라이언트는 이 URL 로만 접근.
    //    TTL 300초 = 5분 (useSignatureRequestStore.ComposedPdfCacheEntry 기본 TTL 과 일치).
    const SIGNED_URL_TTL_SECONDS = 300;
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('signature-results')
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
    if (signedUrlError || !signedUrlData) {
      return internalErrorResponse(
        'compose-signed-pdf signed url',
        signedUrlError ?? new Error('signedUrl 발급 실패'),
      );
    }

    return jsonResponse({
      ok: true,
      version: nextVersion,
      storagePath: `signature-results/${storagePath}`,
      fileName,
      signedUrl: signedUrlData.signedUrl,
      signedUrlExpiresInSeconds: SIGNED_URL_TTL_SECONDS,
      submissionCount: submittedCount,
      participantCount,
      composedAt: footer.iso,
    });
  } catch (err) {
    return internalErrorResponse('compose-signed-pdf', err);
  }
});
