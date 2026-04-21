import type { FormFormat } from '@domain/entities/FormTemplate';
import type { IThumbnailer } from '@domain/ports/IFormPorts';

/**
 * PDF 서식의 첫 페이지를 PNG 썸네일로 렌더링한다.
 * pdfjs-dist 5.x 를 동적 import 하여 코드 스플릿 (서식 페이지 진입 전에는 로드 안 됨).
 * 브라우저/Electron renderer 의 OffscreenCanvas 를 사용.
 */
export class PdfJsThumbnailer implements IThumbnailer {
  async generate(format: FormFormat, bytes: Uint8Array): Promise<Uint8Array | null> {
    if (format !== 'pdf') return null;

    try {
      // @ts-expect-error pdfjs-dist 5.x subpath types not exported
      const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default as string;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

      // pdfjs 는 전달된 버퍼를 worker 로 transfer → 원본 보존을 위해 복사본 사용
      const dataCopy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
      dataCopy.set(bytes);

      const loadingTask = pdfjs.getDocument({ data: dataCopy, verbosity: 0 });
      const doc = await loadingTask.promise;
      const page = await doc.getPage(1);
      const viewport = page.getViewport({ scale: 0.5 });

      // OffscreenCanvas 우선, 미지원 환경이면 일반 canvas 로 폴백
      const width = Math.max(1, Math.floor(viewport.width));
      const height = Math.max(1, Math.floor(viewport.height));

      let blob: Blob | null = null;
      if (typeof OffscreenCanvas !== 'undefined') {
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        await page.render({ canvasContext: ctx, viewport }).promise;
        blob = await canvas.convertToBlob({ type: 'image/png' });
      } else {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        await page.render({ canvasContext: ctx, viewport }).promise;
        blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((b) => resolve(b), 'image/png'),
        );
      }

      if (!blob) return null;
      const ab = await blob.arrayBuffer();
      return new Uint8Array(ab);
    } catch (err) {
      // 썸네일 실패는 앱 크래시로 번지지 않도록 swallow
      console.warn('[PdfJsThumbnailer] 썸네일 생성 실패:', err);
      return null;
    }
  }
}
