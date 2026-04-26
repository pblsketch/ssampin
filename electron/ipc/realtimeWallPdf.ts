/**
 * v2.1 신규 — 학생 PDF 업로드 IPC 채널 (Plan §7.2 결정 #7 / Design v2.1 §7.1 / §9.7).
 *
 * 채널: `realtime-wall:upload-pdf`
 * 흐름: Renderer (학생 entry) → Main → magic byte 검증 → 임시 디렉토리 저장 → file:// URL 반환
 *
 * PDF는 WebSocket으로 base64 broadcast 안 함 (페이로드 폭증 방지).
 * Main 프로세스가 file:// URL만 발급 → WebSocket에는 URL만 broadcast.
 *
 * 보안:
 *   - magic byte `%PDF-` 검증
 *   - 파일명 sanitize (path traversal 방지)
 *   - UUID prefix로 충돌 방지
 *   - 임시 디렉토리만 사용 (사용자 데이터 디렉토리 격리)
 *   - max 10MB
 */

import { app, ipcMain } from 'electron';
import { writeFile, mkdir, readdir, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const PDF_TEMP_DIR_NAME = 'ssampin-realtime-wall-pdf';
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
const PDF_FILE_PREFIX_BYTES = 5;

function getPdfTempDir(): string {
  return join(app.getPath('temp'), PDF_TEMP_DIR_NAME);
}

function sanitizeFilename(filename: string): string {
  // 영숫자 + 한글 + . _ - 만 허용. path traversal 차단.
  const cleaned = filename.replace(/[^\w가-힣.\-]/g, '_').slice(0, 100);
  // .pdf 확장자 강제
  if (!cleaned.toLowerCase().endsWith('.pdf')) {
    return `${cleaned}.pdf`;
  }
  return cleaned;
}

export function registerRealtimeWallPdfHandlers(): void {
  ipcMain.handle(
    'realtime-wall:upload-pdf',
    async (
      _event,
      args: { bytes: Uint8Array; filename: string },
    ): Promise<{ fileUrl: string; filename: string }> => {
      if (!args || !args.bytes || typeof args.filename !== 'string') {
        throw new Error('PDF 업로드 인자가 잘못되었습니다.');
      }

      const bytes =
        args.bytes instanceof Uint8Array
          ? Buffer.from(args.bytes)
          : Buffer.from(args.bytes as unknown as ArrayBufferLike);

      // 1. magic byte 검증
      if (bytes.length < PDF_FILE_PREFIX_BYTES) {
        throw new Error('PDF 파일이 너무 작습니다.');
      }
      const head = bytes.subarray(0, PDF_FILE_PREFIX_BYTES);
      if (!head.equals(PDF_MAGIC)) {
        throw new Error('올바른 PDF 파일이 아닙니다.');
      }
      // 2. 크기 검증
      if (bytes.length > MAX_PDF_BYTES) {
        throw new Error(`PDF가 너무 큽니다. (최대 ${MAX_PDF_BYTES / 1024 / 1024}MB)`);
      }

      // 3. 파일명 sanitize + UUID prefix (충돌 방지 + 학생 입력 신뢰 X)
      const safeFilename = `${randomUUID()}-${sanitizeFilename(args.filename)}`;
      const tempDir = getPdfTempDir();
      const fullPath = join(tempDir, safeFilename);

      // 4. 임시 디렉토리 생성 + 저장
      await mkdir(tempDir, { recursive: true });
      await writeFile(fullPath, bytes);

      // 5. file:// URL 반환 (Windows 경로 → file:/// 변환)
      const fileUrl = pathToFileUrl(fullPath);
      return { fileUrl, filename: safeFilename };
    },
  );
}

/**
 * 임시 PDF 디렉토리 cleanup (보드 close 시 호출 권장).
 * Phase B에서는 단순 helper로만 export — Phase A/D에서 closeSession 통합 시점에 호출.
 *
 * - olderThanMs: 기본 6시간 (현재 라이브 세션 + 여유)
 *
 * Design §9.7 (옵션) — OS 정책 의존 → 명시적 cleanup으로 디스크 누적 방어
 */
export async function cleanupRealtimeWallPdfTempDir(
  olderThanMs: number = 6 * 60 * 60 * 1000,
): Promise<void> {
  const tempDir = getPdfTempDir();
  try {
    const entries = await readdir(tempDir);
    const cutoff = Date.now() - olderThanMs;
    for (const entry of entries) {
      const fullPath = join(tempDir, entry);
      try {
        const s = await stat(fullPath);
        if (s.isFile() && s.mtimeMs < cutoff) {
          await unlink(fullPath);
        }
      } catch {
        // 개별 실패 swallow
      }
    }
  } catch {
    // 디렉토리 미존재 등 — 무시
  }
}

function pathToFileUrl(absolutePath: string): string {
  // Windows: C:\Users\... → file:///C:/Users/...
  // Posix:   /tmp/... → file:///tmp/...
  const normalized = absolutePath.replace(/\\/g, '/');
  if (normalized.startsWith('/')) {
    return `file://${normalized}`;
  }
  return `file:///${normalized}`;
}
