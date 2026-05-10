/**
 * PDF → PNG (모든 페이지) 렌더러 (renderer 전용 헬퍼).
 *
 * - pdfjs-dist + OffscreenCanvas로 각 페이지를 PNG로 변환.
 * - 메인 프로세스로 보내기 전에 renderer에서 처리(메인에 canvas 의존성 없음).
 * - Plan §3 캡: 50MB 입력, 100 페이지.
 *
 * 사용처: useInteractiveLessonStore.connectPdf → IPC `slides-source:render-pdf`
 */

const MAX_PDF_BYTES = 50 * 1024 * 1024; // 50MB
const MAX_PAGES = 100;
const TARGET_WIDTH = 1280; // 슬라이드 표준 (1280×720~960 — pdfjs viewport scale 자동 계산)

export interface PdfRenderProgress {
  readonly current: number;
  readonly total: number;
}

export interface PdfRenderedPage {
  readonly pageId: string;
  readonly pngBytes: Uint8Array;
}

export interface PdfRenderResult {
  readonly contentHash: string;
  readonly pages: readonly PdfRenderedPage[];
}

/**
 * PDF 바이트를 받아 모든 페이지를 PNG로 렌더 후 contentHash와 함께 반환.
 *
 * @throws Error — 50MB 초과, 100 페이지 초과, 렌더 실패
 */
export async function renderPdfToPngPages(
  bytes: Uint8Array,
  onProgress?: (p: PdfRenderProgress) => void,
): Promise<PdfRenderResult> {
  if (bytes.byteLength > MAX_PDF_BYTES) {
    throw new Error(
      `PDF 파일이 너무 큽니다 (${(bytes.byteLength / 1024 / 1024).toFixed(1)}MB). 최대 50MB까지 지원됩니다.`,
    );
  }
  if (bytes.byteLength === 0) {
    throw new Error('PDF 파일이 비어 있습니다.');
  }

  // SHA-256 → 첫 16바이트(32 hex chars)를 contentHash로 사용
  const contentHash = await sha256Hex(bytes, 32);

  // pdfjs-dist 동적 import (코드 스플릿)
  // @ts-expect-error pdfjs-dist 5.x subpath types not exported
  const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
  const workerUrl = (
    await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  ).default as string;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  // pdfjs는 입력 버퍼를 worker로 transfer → 원본 보존을 위해 복사본 사용
  const dataCopy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  dataCopy.set(bytes);

  const loadingTask = pdfjs.getDocument({ data: dataCopy, verbosity: 0 });
  const doc = await loadingTask.promise;

  if (doc.numPages === 0) {
    throw new Error('PDF에 페이지가 없습니다.');
  }
  if (doc.numPages > MAX_PAGES) {
    throw new Error(
      `PDF 페이지가 너무 많습니다 (${doc.numPages}장). 최대 ${MAX_PAGES}장까지 지원됩니다.`,
    );
  }

  const pages: PdfRenderedPage[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    onProgress?.({ current: pageNum, total: doc.numPages });
    const page = await doc.getPage(pageNum);
    const viewport0 = page.getViewport({ scale: 1 });
    const scale = TARGET_WIDTH / viewport0.width;
    const viewport = page.getViewport({ scale });

    const width = Math.max(1, Math.floor(viewport.width));
    const height = Math.max(1, Math.floor(viewport.height));

    let pngBlob: Blob | null = null;
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('OffscreenCanvas 2D context를 사용할 수 없습니다.');
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      pngBlob = await canvas.convertToBlob({ type: 'image/png' });
    } else {
      // 폴백: DOM canvas (test 환경 등)
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context를 사용할 수 없습니다.');
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      pngBlob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png'),
      );
    }

    if (!pngBlob) throw new Error(`${pageNum}페이지 PNG 변환 실패`);
    const ab = await pngBlob.arrayBuffer();
    pages.push({
      pageId: `p${pageNum}`,
      pngBytes: new Uint8Array(ab),
    });
  }

  return { contentHash, pages };
}

/** SHA-256 hex 첫 N자 (Web Crypto API 사용 — Electron renderer 지원) */
async function sha256Hex(bytes: Uint8Array, length: number): Promise<string> {
  // ArrayBuffer로 명시 복사 — TS strict는 SharedArrayBuffer 가능성을 거부.
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  const buf = await crypto.subtle.digest('SHA-256', ab);
  const arr = Array.from(new Uint8Array(buf));
  return arr.map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, length);
}
