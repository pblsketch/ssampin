import { useEffect, useRef, useState } from 'react';

/**
 * Uint8Array.prototype.toHex / fromHex 폴리필.
 *
 * ES 2024 Stage 3 proposal (uint8array-base64). Chrome 140+ 부터 네이티브 지원.
 * Electron 32 (Chromium 128) 에는 없음 → pdfjs-dist 5.x 가 document fingerprint
 * 계산 시 `uint8array.toHex()` 를 호출하면 `TypeError: n.toHex is not a function`.
 *
 * 참조: https://github.com/tc39/proposal-arraybuffer-base64
 */
function polyfillUint8ArrayToHex(): void {
  const proto = Uint8Array.prototype as Uint8Array & {
    toHex?: () => string;
    toBase64?: () => string;
  };
  if (typeof proto.toHex !== 'function') {
    Object.defineProperty(proto, 'toHex', {
      value(this: Uint8Array): string {
        let out = '';
        for (let i = 0; i < this.length; i++) {
          out += this[i]!.toString(16).padStart(2, '0');
        }
        return out;
      },
      writable: true,
      configurable: true,
    });
  }
  if (typeof proto.toBase64 !== 'function') {
    Object.defineProperty(proto, 'toBase64', {
      value(this: Uint8Array): string {
        let bin = '';
        for (let i = 0; i < this.length; i++) {
          bin += String.fromCharCode(this[i]!);
        }
        return typeof btoa !== 'undefined'
          ? btoa(bin)
          : Buffer.from(bin, 'binary').toString('base64');
      },
      writable: true,
      configurable: true,
    });
  }
}

interface PdfCanvasPreviewProps {
  /** PDF 바이트. null 이면 '로딩 중' UI 표시. */
  pdfBytes: ArrayBuffer | null;
  /** 수평/수직 최대 렌더 크기 (px). 기본 600. */
  maxSize?: number;
}

/**
 * pdfjs-dist 를 이용해 PDF 첫 페이지를 canvas 로 렌더하는 프리뷰 컴포넌트.
 *
 * - Vite 환경: pdf.worker.min.mjs 를 `?url` suffix 로 URL 취득 → GlobalWorkerOptions.workerSrc 설정.
 * - Electron 환경도 동일 (worker 파일이 dist/ 에 포함됨).
 * - 페이지 수 2장 이상이면 안내 텍스트를 함께 표시.
 */
export function PdfCanvasPreview({
  pdfBytes,
  maxSize = 600,
}: PdfCanvasPreviewProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pdfBytes) return;

    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;

    const run = async (): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        // 안전망: pdfjs 4.x 는 feature-detect 후 fallback 제공하지만, 향후 5.x 로 다시
        // 올릴 경우를 대비해 Uint8Array.prototype.toHex/toBase64 폴리필을 유지.
        // (ES 2024 Stage 3 proposal — Chrome 140+ 부터 네이티브, Electron 32/Chromium 128 없음.)
        polyfillUint8ArrayToHex();
        // 동적 import — pdfjs-dist 를 사용하지 않는 다른 프리뷰 케이스에서는 로드 안 됨
        // @ts-expect-error pdfjs-dist 5.x subpath types not exported
        const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
        // worker URL — Vite ?url import (브라우저가 로드 가능한 경로)
        const workerUrl = (
          await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
        ).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

        // pdfjs 는 전달된 버퍼를 worker 로 transfer 하여 detach 시킴 →
        // 원본 pdfBytes 를 재사용(다운로드 등)하려면 복사본을 넘긴다.
        const dataCopy = new Uint8Array(new ArrayBuffer(pdfBytes.byteLength));
        dataCopy.set(new Uint8Array(pdfBytes));
        const loadingTask = pdfjs.getDocument({
          data: dataCopy,
          verbosity: 0,
        });
        const doc = await loadingTask.promise;
        if (cancelled) return;
        setPageCount(doc.numPages);

        const page = await doc.getPage(1);
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        // devicePixelRatio 보정 후 maxSize 내에 들어가도록 scale 계산
        const viewport0 = page.getViewport({ scale: 1 });
        const scale = Math.min(
          maxSize / viewport0.width,
          maxSize / viewport0.height,
        );
        const viewport = page.getViewport({ scale });

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        canvas.style.width = `${Math.round(viewport.width)}px`;
        canvas.style.height = `${Math.round(viewport.height)}px`;

        renderTask = page.render({ canvasContext: ctx, viewport, canvas }) as { cancel: () => void; promise: Promise<void> };
        await renderTask.promise;
        if (cancelled) return;
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdfBytes, maxSize]);

  if (!pdfBytes) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-400">
        <span className="material-symbols-outlined animate-spin text-5xl mb-3">
          progress_activity
        </span>
        <p className="font-medium">PDF 생성 중...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-red-500">
        <span className="material-symbols-outlined text-5xl mb-3">error</span>
        <p className="font-medium">미리보기 렌더 실패</p>
        <p className="text-xs text-slate-500 mt-1 max-w-md text-center">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {loading && (
        <p className="text-sm text-slate-500">렌더 중...</p>
      )}
      <canvas
        ref={canvasRef}
        className="border border-slate-300 rounded shadow-sm bg-white"
      />
      {pageCount > 1 && (
        <p className="text-xs text-slate-500">
          첫 페이지만 미리보기 (전체 {pageCount}페이지)
        </p>
      )}
    </div>
  );
}
