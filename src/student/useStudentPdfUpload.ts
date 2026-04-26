import { useCallback, useState } from 'react';
import { REALTIME_WALL_MAX_PDF_BYTES } from '@domain/rules/realtimeWallRules';

/**
 * v2.1 신규 — 학생 PDF 업로드 훅 (Design v2.1 §7.1 / §9.7).
 *
 * 학생 entry는 브라우저(또는 cloudflared 터널 너머)에서 동작하므로 직접 IPC를
 * 호출할 수 없다. 따라서 학생 측은 base64 data URL을 만들어 WebSocket submit
 * 메시지에 포함시키고, **Main 서버가 magic byte 검증 + 임시 디렉토리 저장 +
 * file:// URL 발급** 후 broadcast 시 URL로 교체한다.
 *
 * 보안 (Design §9.7):
 *   - 클라이언트 magic byte 사전 검증 (서버도 동일 검사 — 이중)
 *   - max 10MB 사전 검증
 *   - 파일명은 학생이 입력한 그대로 서버에 전달, 서버가 sanitize + UUID prefix
 */

interface UseStudentPdfUploadResult {
  /**
   * @returns base64 data URL + 원본 filename (서버 송신용)
   */
  readonly read: (file: File) => Promise<{ pdfDataUrl: string; pdfFilename: string }>;
  readonly isReading: boolean;
  readonly error: string | null;
  readonly clearError: () => void;
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const PDF_DATA_URL_PREFIX = 'data:application/pdf;base64,';

export function useStudentPdfUpload(): UseStudentPdfUploadResult {
  const [isReading, setIsReading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const read = useCallback(
    async (file: File): Promise<{ pdfDataUrl: string; pdfFilename: string }> => {
      setError(null);

      if (
        file.type !== 'application/pdf' &&
        !file.name.toLowerCase().endsWith('.pdf')
      ) {
        const msg = 'PDF 파일만 첨부할 수 있어요.';
        setError(msg);
        throw new Error(msg);
      }
      if (file.size > REALTIME_WALL_MAX_PDF_BYTES) {
        const maxMB = (REALTIME_WALL_MAX_PDF_BYTES / 1024 / 1024).toFixed(0);
        const msg = `PDF는 최대 ${maxMB}MB까지 첨부할 수 있어요.`;
        setError(msg);
        throw new Error(msg);
      }

      setIsReading(true);
      try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);

        // 클라이언트 magic byte 사전 검증
        if (bytes.length < 5 || !PDF_MAGIC.every((b, i) => bytes[i] === b)) {
          const msg = '올바른 PDF 파일이 아니에요.';
          setError(msg);
          throw new Error(msg);
        }

        // base64 변환
        const base64 = arrayBufferToBase64(buffer);
        const pdfDataUrl = `${PDF_DATA_URL_PREFIX}${base64}`;
        return { pdfDataUrl, pdfFilename: file.name };
      } catch (e) {
        if (e instanceof Error) throw e;
        const msg = 'PDF 처리에 실패했어요.';
        setError(msg);
        throw new Error(msg);
      } finally {
        setIsReading(false);
      }
    },
    [],
  );

  const clearError = useCallback(() => setError(null), []);

  return { read, isReading, error, clearError };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  if (typeof btoa !== 'undefined') {
    return btoa(binary);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(binary, 'binary').toString('base64');
  }
  throw new Error('base64 encoder not available');
}
