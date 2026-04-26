import { useState, useRef, useEffect } from 'react';
import QRCode from 'qrcode';
import type { Assignment } from '@domain/entities/Assignment';
import { useToastStore } from '@adapters/components/common/Toast';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import { Modal } from '@adapters/components/common/Modal';
import { IconButton } from '@adapters/components/common/IconButton';

interface ShareLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignment: Assignment;
}

export function ShareLinkModal({ isOpen, onClose, assignment }: ShareLinkModalProps) {
  const showToast = useToastStore((s) => s.show);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const { track } = useAnalytics();

  // 숏링크가 있으면 우선 사용
  const displayUrl = assignment.shortUrl ?? assignment.shareUrl;

  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    QRCode.toCanvas(
      canvas,
      displayUrl,
      {
        width: 200,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: '#000000', light: '#ffffff' },
      },
      (err) => {
        if (!err) {
          setQrDataUrl(canvas.toDataURL('image/png'));
          track('assignment_share', { method: 'qr' });
        }
      },
    );
  }, [isOpen, displayUrl]);

  async function handleCopyLink() {
    await navigator.clipboard.writeText(displayUrl);
    showToast('링크가 복사되었습니다', 'success');
    track('assignment_share', { method: 'copy' });
  }

  function handleDownloadQR() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `${assignment.title}_QR.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="과제 공유" srOnlyTitle size="md">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-sp-border/40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-sp-accent/10">
              <span className="material-symbols-outlined text-sp-accent">share</span>
            </div>
            <h3 className="text-lg font-bold text-sp-text">과제 공유</h3>
          </div>
          <IconButton icon="close" label="닫기" variant="ghost" size="md" onClick={onClose} />
        </div>

          {/* Body */}
          <div className="px-6 py-6 flex flex-col items-center">
            {/* Assignment title */}
            <p className="text-base font-medium text-sp-text mb-5 flex items-center gap-2">
              <span>📝</span>
              <span>{assignment.title}</span>
            </p>

            {/* QR Code */}
            <div className="bg-white rounded-xl p-4 mb-5">
              <canvas ref={canvasRef} className="block" />
            </div>

            {/* Share URL */}
            <p className="text-sm text-sp-text break-all text-center mb-1 px-4 select-all font-medium">
              {displayUrl}
            </p>
            {assignment.shortUrl && (
              <p className="text-xs text-sp-muted/60 break-all text-center mb-6 px-4">
                {assignment.shareUrl}
              </p>
            )}
            {!assignment.shortUrl && <div className="mb-6" />}

            {/* Action buttons */}
            <div className="flex items-center gap-3 w-full justify-center">
              <button
                onClick={() => void handleCopyLink()}
                className="px-5 py-2.5 bg-sp-accent text-sp-accent-fg rounded-lg hover:bg-sp-accent/90 transition-colors flex items-center gap-2 text-sm font-medium"
              >
                <span className="material-symbols-outlined text-icon">content_copy</span>
                링크 복사
              </button>
              <button
                onClick={handleDownloadQR}
                disabled={!qrDataUrl}
                className="px-5 py-2.5 bg-sp-card border border-sp-border rounded-lg text-sp-text hover:bg-sp-border/40 transition-colors flex items-center gap-2 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-icon">download</span>
                QR 다운로드
              </button>
            </div>

            {/* Help text */}
            <p className="text-xs text-sp-muted/60 text-center mt-5">
              학생들에게 QR코드를 보여주거나 링크를 공유하세요.
            </p>
          </div>
      </div>
    </Modal>
  );
}
