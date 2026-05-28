/**
 * prerenderTemplatePreviews — Phase 2C v2 client-side pre-render (PRD US-2C-10).
 *
 * 왜 client-side 인가?
 *   - PoC A0-1 에서 pdfjs-dist 가 Deno Edge Function 환경에서 동작하지 않음을 확인.
 *   - 학생 hot-path 는 PNG 만 GET — Edge Function 호출 0회, 운영 비용 0 정책 유지.
 *   - 교사 publish 시점에만 1회 발생하므로 브라우저 부담 허용.
 *
 * 동작:
 *   1. signature-templates Storage 의 원본 PDF 를 fetch (signed URL 또는 service_role).
 *   2. pdfjs-dist 5.x 로 페이지 전체 PNG 렌더 (~1024px wide).
 *   3. 각 region 의 정규화 좌표를 페이지 PNG 위에서 crop → region cutout PNG.
 *   4. upload-signature-preview Edge Function 으로 base64 PNG 업로드.
 *   5. 학생 hot-path 는 publicUrl 을 직접 GET (PUBLIC bucket — migration 031).
 *
 * 출력 storagePath:
 *   - 페이지: signature-previews/{requestId}/v{regionVersion}/page-{i}.png
 *   - 영역  : signature-previews/{requestId}/v{regionVersion}/region-{regionId}.png
 *
 * 멱등성 (upsert): 같은 (requestId, regionVersion) 으로 두 번 실행해도 같은 결과.
 */
import type { PdfTemplate, SignatureRegion } from '@domain/entities/SignatureRequest';

export interface PrerenderProgress {
  readonly stage: 'fetch-pdf' | 'render-pages' | 'crop-regions' | 'upload' | 'done';
  readonly current: number;
  readonly total: number;
  readonly label?: string;
}

export interface PrerenderInput {
  readonly requestId: string;
  readonly regionVersion: number;
  readonly pdfTemplate: PdfTemplate;
  /** signature-templates Storage 의 원본 PDF (Blob 또는 fetch 가능한 URL) */
  readonly pdfSource: Blob | string;
  readonly regions: readonly SignatureRegion[];
  /** Edge Function 호출 어댑터 (테스트 가능성 + Supabase 결합 최소화) */
  readonly uploadPng: (input: {
    readonly kind: 'page' | 'region';
    readonly pageIndex?: number;
    readonly regionId?: string;
    readonly base64Png: string;
  }) => Promise<{ readonly storagePath: string; readonly publicUrl: string }>;
  readonly onProgress?: (progress: PrerenderProgress) => void;
  /** 렌더 폭 (기본 1024px). 학생 페이지 표시 폭 (~720px) 보다 약간 크게. */
  readonly renderWidth?: number;
}

export interface PrerenderOutput {
  readonly pageUrls: readonly { readonly pageIndex: number; readonly publicUrl: string }[];
  readonly regionUrls: readonly { readonly regionId: string; readonly publicUrl: string }[];
}

const DEFAULT_RENDER_WIDTH = 1024;

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('FileReader 결과가 문자열이 아닙니다.'));
        return;
      }
      resolve(result.replace(/^data:[^,]+,/, ''));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Blob 읽기 실패'));
    reader.readAsDataURL(blob);
  });
}

async function fetchPdfBytes(source: Blob | string): Promise<Uint8Array> {
  if (typeof source === 'string') {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`PDF fetch 실패 (HTTP ${response.status})`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }
  const arrayBuffer = await source.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

interface RenderedPage {
  readonly pageIndex: number;
  readonly pngBlob: Blob;
  readonly width: number;
  readonly height: number;
}

async function renderPdfPagesToPng(
  pdfBytes: Uint8Array,
  pageCount: number,
  renderWidth: number,
  onProgress?: (current: number, total: number) => void,
): Promise<readonly RenderedPage[]> {
  // pdfjs-dist 5.x 동적 import — PdfJsThumbnailer 와 동일 패턴.
  // @ts-expect-error pdfjs-dist 5.x subpath types not exported
  const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default as string;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  // pdfjs 가 transfer 하므로 복사본 사용
  const dataCopy = new Uint8Array(new ArrayBuffer(pdfBytes.byteLength));
  dataCopy.set(pdfBytes);
  const loadingTask = pdfjs.getDocument({ data: dataCopy, verbosity: 0 });
  const doc = await loadingTask.promise;

  const results: RenderedPage[] = [];
  for (let i = 0; i < pageCount; i++) {
    const page = await doc.getPage(i + 1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = renderWidth / baseViewport.width;
    const viewport = page.getViewport({ scale });
    const width = Math.max(1, Math.floor(viewport.width));
    const height = Math.max(1, Math.floor(viewport.height));

    let blob: Blob | null = null;
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('OffscreenCanvas 2D context 획득 실패');
      await page.render({ canvasContext: ctx, viewport }).promise;
      blob = await canvas.convertToBlob({ type: 'image/png' });
    } else {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas 2D context 획득 실패');
      await page.render({ canvasContext: ctx, viewport }).promise;
      blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png'),
      );
    }
    if (!blob) throw new Error(`page ${i} PNG 변환 실패`);
    results.push({ pageIndex: i, pngBlob: blob, width, height });
    onProgress?.(i + 1, pageCount);
  }
  return results;
}

async function cropRegionFromPage(page: RenderedPage, region: SignatureRegion): Promise<Blob> {
  const cropX = Math.round(region.rect.x * page.width);
  const cropY = Math.round(region.rect.y * page.height);
  const cropW = Math.max(1, Math.round(region.rect.w * page.width));
  const cropH = Math.max(1, Math.round(region.rect.h * page.height));

  // ImageBitmap 으로 디코딩한 다음 OffscreenCanvas 에 crop drawImage.
  const bitmap = await createImageBitmap(page.pngBlob);
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(cropW, cropH);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('crop canvas 2D ctx 실패');
      ctx.drawImage(bitmap, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      return await canvas.convertToBlob({ type: 'image/png' });
    }
    const canvas = document.createElement('canvas');
    canvas.width = cropW;
    canvas.height = cropH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('crop canvas 2D ctx 실패');
    ctx.drawImage(bitmap, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('crop PNG 변환 실패'))), 'image/png'),
    );
  } finally {
    bitmap.close?.();
  }
}

/**
 * PDF → 페이지 PNG + region cutout PNG 를 일괄 렌더 → Storage 업로드.
 * 학생 hot-path 에서 즉시 GET 가능한 publicUrl 들을 반환한다.
 */
export async function prerenderTemplatePreviews(input: PrerenderInput): Promise<PrerenderOutput> {
  const renderWidth = input.renderWidth ?? DEFAULT_RENDER_WIDTH;
  const pageCount = input.pdfTemplate.pageCount;
  const regionCount = input.regions.length;

  input.onProgress?.({ stage: 'fetch-pdf', current: 0, total: 1 });
  const pdfBytes = await fetchPdfBytes(input.pdfSource);

  input.onProgress?.({ stage: 'render-pages', current: 0, total: pageCount });
  const pages = await renderPdfPagesToPng(pdfBytes, pageCount, renderWidth, (cur, tot) =>
    input.onProgress?.({ stage: 'render-pages', current: cur, total: tot }),
  );

  // 1) 페이지 PNG 업로드 (병렬 4개)
  const pageUploads = pages.map(async (page) => {
    const base64 = await blobToBase64(page.pngBlob);
    const result = await input.uploadPng({
      kind: 'page',
      pageIndex: page.pageIndex,
      base64Png: base64,
    });
    return { pageIndex: page.pageIndex, publicUrl: result.publicUrl };
  });

  // 2) region cutout 업로드 — pageIndex 별로 묶어서 page 의 ImageBitmap 재사용
  const regionsByPage = new Map<number, SignatureRegion[]>();
  for (const region of input.regions) {
    const list = regionsByPage.get(region.pageIndex) ?? [];
    list.push(region);
    regionsByPage.set(region.pageIndex, list);
  }

  const regionUploads: Promise<{ regionId: string; publicUrl: string }>[] = [];
  let regionDone = 0;
  for (const page of pages) {
    const regions = regionsByPage.get(page.pageIndex) ?? [];
    for (const region of regions) {
      regionUploads.push(
        (async () => {
          const cropBlob = await cropRegionFromPage(page, region);
          const base64 = await blobToBase64(cropBlob);
          const result = await input.uploadPng({
            kind: 'region',
            regionId: region.id,
            base64Png: base64,
          });
          regionDone += 1;
          input.onProgress?.({
            stage: 'crop-regions',
            current: regionDone,
            total: regionCount,
            label: region.id,
          });
          return { regionId: region.id, publicUrl: result.publicUrl };
        })(),
      );
    }
  }

  const pageUrls = await Promise.all(pageUploads);
  const regionUrls = await Promise.all(regionUploads);

  input.onProgress?.({
    stage: 'done',
    current: pageUrls.length + regionUrls.length,
    total: pageUrls.length + regionUrls.length,
  });

  return { pageUrls, regionUrls };
}
