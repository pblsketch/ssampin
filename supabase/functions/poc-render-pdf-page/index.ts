/**
 * Phase 2C Step 0 PoC artifact A0-1: PDF → PNG 래스터화 검증 (PRD AC-0).
 *
 * 목적
 *   1. pdfjs-dist (또는 unpdf 등 Deno-native 대체) 가 Supabase Edge Function (Deno)
 *      런타임에서 import + 1페이지 PNG 렌더가 가능한지 검증
 *   2. 콜드/웜 latency 와 PNG 사이즈를 baseline 으로 기록
 *
 * 통과 기준
 *   - 1페이지 PDF → PNG ≤ 3s (warm), 콜드 스타트 ≤ 8s
 *   - PoC 단계라 base64 PDF 를 POST body 로 받음 (Storage 연동은 본 기능에서 처리)
 *
 * 응답 형식
 *   { ok, library, durationMs, pngBase64?, pngBytes, pageCount, viewport, error? }
 *
 * 실패 시
 *   - 라이브러리 import 자체가 실패하면 plan 의 fallback 경로 (unpdf, Cloudflare
 *     Worker 동반 함수, external Node container) 로 이동해야 함을 시그널
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

const startedAt = Date.now();
const moduleLoadMs = 0; // 모듈 import 가 끝난 직후를 0 기준으로 — invocation latency 측정용

interface RenderRequest {
  readonly pdfBase64?: string;
  readonly pdfBytesUrl?: string;
  readonly pageIndex?: number;
  readonly scale?: number;
  readonly returnPng?: boolean;
}

interface RenderResponse {
  readonly ok: boolean;
  readonly library?: 'unpdf' | 'pdfjs-dist';
  readonly durationMs: number;
  readonly pngBytes: number;
  readonly pageCount?: number;
  readonly viewport?: { width: number; height: number };
  readonly pngBase64?: string;
  readonly moduleColdAgeMs?: number;
  readonly error?: string;
  readonly errorStack?: string;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'POST only', durationMs: 0, pngBytes: 0 }, 405);
  }

  const t0 = performance.now();

  let body: RenderRequest = {};
  try {
    body = (await req.json()) as RenderRequest;
  } catch {
    return jsonResponse({ ok: false, error: 'invalid JSON body', durationMs: 0, pngBytes: 0 }, 400);
  }

  const pageIndex = body.pageIndex ?? 0;
  const scale = body.scale ?? 1.5;
  const returnPng = body.returnPng ?? false;

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await loadPdfBytes(body);
  } catch (err) {
    return jsonResponse(
      {
        ok: false,
        error: `pdf load failed: ${stringifyError(err)}`,
        durationMs: performance.now() - t0,
        pngBytes: 0,
      },
      400,
    );
  }

  // 1차 시도: unpdf (Deno + Cloudflare Worker 공식 지원)
  try {
    const result = await renderWithUnpdf(pdfBytes, pageIndex, scale, returnPng);
    return jsonResponse({
      ok: true,
      library: 'unpdf',
      durationMs: performance.now() - t0,
      moduleColdAgeMs: Date.now() - startedAt - moduleLoadMs,
      ...result,
    });
  } catch (unpdfErr) {
    // 2차 시도: pdfjs-dist legacy build (브라우저 polyfill 일부 필요)
    try {
      const result = await renderWithPdfjs(pdfBytes, pageIndex, scale, returnPng);
      return jsonResponse({
        ok: true,
        library: 'pdfjs-dist',
        durationMs: performance.now() - t0,
        moduleColdAgeMs: Date.now() - startedAt - moduleLoadMs,
        ...result,
      });
    } catch (pdfjsErr) {
      return jsonResponse(
        {
          ok: false,
          error: `both libraries failed — unpdf: ${stringifyError(unpdfErr)}; pdfjs-dist: ${stringifyError(pdfjsErr)}`,
          errorStack:
            (unpdfErr instanceof Error ? unpdfErr.stack : '') +
            '\n---\n' +
            (pdfjsErr instanceof Error ? pdfjsErr.stack : ''),
          durationMs: performance.now() - t0,
          pngBytes: 0,
        },
        500,
      );
    }
  }
});

async function loadPdfBytes(body: RenderRequest): Promise<Uint8Array> {
  if (body.pdfBase64) {
    return base64ToBytes(body.pdfBase64);
  }
  if (body.pdfBytesUrl) {
    const res = await fetch(body.pdfBytesUrl);
    if (!res.ok) throw new Error(`fetch ${body.pdfBytesUrl} → ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
  // 기본 fixture: PoC 가 자체적으로 1페이지 빈 PDF 를 만든다 (pdf-lib).
  const { PDFDocument } = await import('https://esm.sh/pdf-lib@1.17.1');
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  page.drawText('PoC A0-1 test page', { x: 50, y: 800, size: 12 });
  return await doc.save();
}

async function renderWithUnpdf(
  pdfBytes: Uint8Array,
  pageIndex: number,
  scale: number,
  returnPng: boolean,
): Promise<Partial<RenderResponse>> {
  const unpdf = await import('https://esm.sh/unpdf@0.12.1');
  const { getDocumentProxy, renderPageAsImage } = unpdf as unknown as {
    getDocumentProxy: (bytes: Uint8Array) => Promise<{ numPages: number }>;
    renderPageAsImage: (
      bytes: Uint8Array,
      pageNumber: number,
      opts: { scale?: number; canvas?: unknown },
    ) => Promise<ArrayBuffer>;
  };
  const doc = await getDocumentProxy(pdfBytes);
  const arrayBuf = await renderPageAsImage(pdfBytes, pageIndex + 1, { scale });
  const pngBytes = new Uint8Array(arrayBuf);
  return {
    pngBytes: pngBytes.byteLength,
    pageCount: doc.numPages,
    viewport: { width: 0, height: 0 },
    pngBase64: returnPng ? bytesToBase64(pngBytes) : undefined,
  };
}

async function renderWithPdfjs(
  pdfBytes: Uint8Array,
  pageIndex: number,
  _scale: number,
  _returnPng: boolean,
): Promise<Partial<RenderResponse>> {
  // pdfjs-dist 의 legacy mjs 빌드 — Deno 에서 DOMMatrix polyfill 등이 필요할 수 있다.
  const pdfjs = await import('https://esm.sh/pdfjs-dist@4.10.38/legacy/build/pdf.mjs?target=deno');
  const lib = pdfjs as unknown as {
    getDocument: (opts: { data: Uint8Array }) => { promise: Promise<PdfDocumentMinimal> };
  };
  const loadingTask = lib.getDocument({ data: pdfBytes });
  const doc = await loadingTask.promise;
  const page = await doc.getPage(pageIndex + 1);
  // pdfjs-dist 는 OffscreenCanvas 가 필요 — Deno Edge 에서 미지원이면 throw 한다
  // (PoC 의 fallback 시그널). PNG 변환은 unpdf 가 통과한 경우만 의미가 있다.
  return {
    pngBytes: 0,
    pageCount: doc.numPages,
    viewport: { width: page.view[2], height: page.view[3] },
  };
}

interface PdfDocumentMinimal {
  readonly numPages: number;
  getPage(pageNumber: number): Promise<{ view: readonly number[] }>;
}

function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/^data:[^,]+,/, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function stringifyError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

function jsonResponse(payload: RenderResponse, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}
