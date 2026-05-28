/**
 * Phase 2C Step C — 교사 PDF 양식 업로드 패널 (PRD US-2C-08 AC-2).
 *
 * - 파일 선택 (`.pdf` accept) + 클라이언트 사전 검증 (`validatePdfTemplateBytes`) 으로
 *   네트워크 비용 없는 빠른 거절 안내
 * - Edge Function `validate-pdf-upload` 호출 (Supabase 가 설정된 경우) → Storage 업로드
 * - 거절 시 한국어 카피, mixed-orientation 시 confirm 프롬프트, 성공 시 onUploaded
 *   콜백으로 PdfTemplate 전달
 * - Supabase 미설정 환경에서는 client-side 검증만 통과한 가짜 PdfTemplate 으로 폴백 — UI
 *   미리보기는 가능하지만 발급 단계에서 Supabase 가 필요함을 안내
 */
import { useCallback, useState } from 'react';
import type { PdfTemplate } from '@domain/entities/SignatureRequest';
import {
  PDF_REJECT_COPY,
  PDF_WARN_COPY,
  type PdfRejectCode,
  type PdfWarnCode,
  validatePdfTemplateBytes,
} from '@domain/rules/pdfTemplateValidation';
import {
  SupabaseSignatureAdminClient,
  isSupabaseConfigured,
  type ValidatePdfUploadResponse,
} from '@infrastructure/supabase/SignatureSupabaseClient';
import { SIGNATURE_LEGAL_DISCLAIMER } from './signatureLegalCopy';

const adminClient = new SupabaseSignatureAdminClient();

export interface SignaturePdfUploadPanelProps {
  readonly teacherId?: string;
  readonly onUploaded: (pdfTemplate: PdfTemplate) => void;
  readonly initialPdfTemplate?: PdfTemplate;
}

type RejectInfo = { readonly code: PdfRejectCode; readonly message: string };
type WarnInfo = { readonly code: PdfWarnCode; readonly message: string };

export function SignaturePdfUploadPanel({
  teacherId,
  onUploaded,
  initialPdfTemplate,
}: SignaturePdfUploadPanelProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [reject, setReject] = useState<RejectInfo | null>(null);
  const [warning, setWarning] = useState<WarnInfo | null>(null);
  const [pdfTemplate, setPdfTemplate] = useState<PdfTemplate | null>(initialPdfTemplate ?? null);
  const [pendingTemplateAfterWarn, setPendingTemplateAfterWarn] = useState<PdfTemplate | null>(
    null,
  );

  const reset = useCallback(() => {
    setReject(null);
    setWarning(null);
    setPendingTemplateAfterWarn(null);
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      reset();
      setFileName(file.name);
      setPdfTemplate(null);

      const bytes = new Uint8Array(await file.arrayBuffer());
      // 1) client-side 사전 검증 — 네트워크 비용 0
      const local = await validatePdfTemplateBytes(bytes);
      if (!local.ok) {
        setReject({ code: local.code, message: local.message });
        return;
      }

      // 2) Supabase 미설정 환경 — 미리보기 가능한 가짜 PdfTemplate 반환
      if (!isSupabaseConfigured()) {
        const localTemplate: PdfTemplate = {
          storagePath: `signature-templates/local-preview/${crypto.randomUUID()}.pdf`,
          pageCount: local.pageCount,
          fileSize: local.fileSize,
          uploadedAt: new Date().toISOString(),
        };
        if (local.warning) {
          setWarning({ code: local.warning.code, message: local.warning.message });
          setPendingTemplateAfterWarn(localTemplate);
          return;
        }
        setPdfTemplate(localTemplate);
        onUploaded(localTemplate);
        return;
      }

      // 3) Edge Function 호출 → Storage 업로드
      setIsUploading(true);
      try {
        const response: ValidatePdfUploadResponse = await adminClient.uploadPdfTemplate(
          file,
          teacherId,
        );
        if (!response.ok) {
          setReject({ code: response.code, message: response.message });
          return;
        }
        if (response.warning) {
          setWarning({ code: response.warning.code, message: response.warning.message });
          setPendingTemplateAfterWarn(response.pdfTemplate);
          return;
        }
        setPdfTemplate(response.pdfTemplate);
        onUploaded(response.pdfTemplate);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setReject({ code: 'invalid_base64', message: message || PDF_REJECT_COPY.invalid_base64 });
      } finally {
        setIsUploading(false);
      }
    },
    [onUploaded, reset, teacherId],
  );

  const handleConfirmWarning = useCallback(() => {
    if (pendingTemplateAfterWarn) {
      setPdfTemplate(pendingTemplateAfterWarn);
      onUploaded(pendingTemplateAfterWarn);
      setPendingTemplateAfterWarn(null);
      setWarning(null);
    }
  }, [onUploaded, pendingTemplateAfterWarn]);

  const handleCancelWarning = useCallback(() => {
    setPendingTemplateAfterWarn(null);
    setWarning(null);
    setFileName(null);
  }, []);

  return (
    <section
      className="rounded-2xl border border-sp-border bg-sp-card p-5 shadow-sp-sm"
      data-testid="signature-pdf-upload-panel"
    >
      <header className="mb-3">
        <p className="text-xs font-sp-semibold text-sp-accent">PDF 양식 업로드</p>
        <h3 className="mt-1 text-base font-sp-bold text-sp-text">
          교사가 만든 PDF 양식을 업로드해 주세요
        </h3>
        <p className="mt-2 text-xs leading-relaxed text-sp-muted">
          10MB 이하 / 10페이지 이하 / 비밀번호·디지털 서명·활성 양식 필드 없는 PDF 만 업로드할 수
          있습니다.
        </p>
        {/* US-2C-14: 발급 화면 — 학생 동의 표 · 결과 PDF 툴팁과 동일 카피 */}
        <p
          className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800"
          data-testid="signature-legal-disclaimer-issue"
        >
          {SIGNATURE_LEGAL_DISCLAIMER}
        </p>
      </header>

      <label
        className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed px-4 py-3 transition-colors ${
          isUploading
            ? 'cursor-not-allowed border-sp-border bg-sp-surface/40 text-sp-muted'
            : 'border-sp-accent/40 bg-sp-surface/60 text-sp-text hover:border-sp-accent'
        }`}
      >
        <span className="text-sm font-sp-semibold">
          {isUploading
            ? '업로드 중...'
            : pdfTemplate
              ? `선택됨: ${fileName ?? 'unknown.pdf'} (${pdfTemplate.pageCount}페이지)`
              : fileName
                ? `선택됨: ${fileName}`
                : 'PDF 파일 선택'}
        </span>
        <input
          type="file"
          accept="application/pdf,.pdf"
          disabled={isUploading}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
            event.target.value = ''; // 같은 파일 재선택 허용
          }}
          aria-label="PDF 양식 파일 선택"
        />
      </label>

      {reject && (
        <p
          role="alert"
          className="mt-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-700"
          data-testid="pdf-upload-reject"
        >
          {reject.message}
        </p>
      )}

      {warning && (
        <div
          role="alertdialog"
          aria-labelledby="pdf-upload-warning-title"
          className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-xs leading-relaxed text-amber-800"
          data-testid="pdf-upload-warning"
        >
          <p id="pdf-upload-warning-title" className="font-sp-bold">
            확인이 필요해요
          </p>
          <p className="mt-1">{warning.message}</p>
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={handleCancelWarning}
              className="rounded-lg border border-amber-400 px-3 py-1 text-xs font-sp-semibold text-amber-800 hover:bg-amber-100"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleConfirmWarning}
              className="rounded-lg border border-amber-500 bg-amber-500 px-3 py-1 text-xs font-sp-bold text-white hover:bg-amber-600"
              data-testid="pdf-upload-warning-confirm"
            >
              계속 진행
            </button>
          </div>
        </div>
      )}

      {pdfTemplate && (
        <p
          className="mt-3 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-700"
          data-testid="pdf-upload-success"
        >
          {`업로드 완료 — ${pdfTemplate.pageCount}페이지, ${(pdfTemplate.fileSize / 1024).toFixed(0)}KB`}
        </p>
      )}

      <p className="mt-3 text-xs leading-relaxed text-sp-muted">
        업로드 후 다음 단계에서 사각형을 드래그해 각 참여자에게 서명 위치를 지정합니다.
        {!isSupabaseConfigured() && (
          <span className="ml-1 text-amber-700">
            (Supabase 환경 변수가 비어 있어 로컬 미리보기로만 동작합니다.)
          </span>
        )}
      </p>

      <p className="sr-only" aria-live="polite">
        {isUploading
          ? '업로드 진행 중'
          : reject
            ? `업로드 거절: ${reject.message}`
            : warning
              ? `경고: ${warning.message}`
              : pdfTemplate
                ? `업로드 완료, ${pdfTemplate.pageCount}페이지`
                : ''}
      </p>
    </section>
  );
}

export { PDF_REJECT_COPY, PDF_WARN_COPY };
