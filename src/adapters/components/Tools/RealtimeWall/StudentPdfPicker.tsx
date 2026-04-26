import { useStudentPdfUpload } from '@student/useStudentPdfUpload';
import { REALTIME_WALL_MAX_PDF_BYTES } from '@domain/rules/realtimeWallRules';

/**
 * v2.1 신규 — 학생 PDF 첨부 picker (Plan §7.2 결정 #7 / Design v2.1 §5.12).
 *
 * - PDF 1개 (max 10MB)
 * - 학생 entry는 base64 data URL을 만들어 WebSocket submit 메시지에 포함
 *   (Main 서버가 magic byte 검증 + 임시 디렉토리 저장 + file:// URL 발급 →
 *    broadcast 시 URL로 교체)
 * - 카드 표시 단계에서는 file:// URL이지만, 모달 입력 단계에서는 base64
 */

interface StudentPdfPickerProps {
  /** 모달 입력 단계 — base64 data URL (또는 첨부 후 file:// URL 보존) */
  readonly pdfDataUrl: string | undefined;
  readonly pdfFilename: string | undefined;
  /** 학생이 PDF를 선택하면 base64 data URL + filename으로 전달 */
  readonly onPick: (info: { pdfDataUrl: string; pdfFilename: string }) => void;
  readonly onRemove: () => void;
  readonly disabled?: boolean;
}

export function StudentPdfPicker({
  pdfDataUrl,
  pdfFilename,
  onPick,
  onRemove,
  disabled = false,
}: StudentPdfPickerProps) {
  const { read, isReading, error } = useStudentPdfUpload();
  const maxMB = (REALTIME_WALL_MAX_PDF_BYTES / 1024 / 1024).toFixed(0);

  const handleFile = async (file: File | null | undefined) => {
    if (!file) return;
    try {
      const result = await read(file);
      onPick(result);
    } catch {
      // useStudentPdfUpload가 error state 갱신
    }
  };

  if (pdfDataUrl) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-sp-border bg-sp-card p-2">
        <span
          className="text-sm text-sp-text truncate"
          title={pdfFilename ?? 'document.pdf'}
        >
          📄 {pdfFilename ?? 'document.pdf'}
        </span>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="ml-auto text-xs text-rose-400 hover:text-rose-500 disabled:opacity-50"
          aria-label="PDF 제거"
        >
          ✕ 제거
        </button>
      </div>
    );
  }

  return (
    <div>
      <label
        className={[
          'inline-flex items-center gap-2 rounded-lg border border-dashed border-sp-border bg-sp-card/50 px-4 py-2 text-sm text-sp-muted',
          disabled || isReading
            ? 'opacity-50 cursor-not-allowed'
            : 'cursor-pointer hover:bg-sp-card',
        ].join(' ')}
      >
        📄 {isReading ? 'PDF 읽는 중...' : `PDF 첨부 (최대 ${maxMB}MB)`}
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => handleFile(e.target.files?.[0])}
          disabled={disabled || isReading}
          className="hidden"
        />
      </label>
      {error && (
        <p className="text-xs text-rose-400 mt-2" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
