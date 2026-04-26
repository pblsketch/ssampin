import { useState, useRef, useEffect, useCallback } from 'react';
import QRCode from 'qrcode';
import { SITE_URL } from '@config/siteUrl';
import { useToastStore } from '@adapters/components/common/Toast';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import { useShareStore } from '@adapters/stores/useShareStore';
import { kakaoShare } from '@infrastructure/share/KakaoShareAdapter';
import { Modal } from '@adapters/components/common/Modal';

const SHARE_TEXT = `쌤핀 — 선생님을 위한 무료 대시보드 앱이에요.\n시간표, 자리배치, 출결, 수업 도구를 하나로 쓸 수 있어요.\n무료, 광고 없음! 👉 ${SITE_URL}`;

export function ShareModal() {
  const { isModalOpen, modalTrigger, closeModal, incrementSharedCount } = useShareStore();
  const showToast = useToastStore((s) => s.show);
  const { track } = useAnalytics();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const isElectron = !!window.electronAPI;
  const kakaoAvailable = kakaoShare.isAvailable();

  // 모달 열릴 때 analytics + QR 생성
  useEffect(() => {
    if (!isModalOpen) return;
    track('share_modal_open', { trigger: modalTrigger });

    const canvas = canvasRef.current;
    if (!canvas) return;
    QRCode.toCanvas(
      canvas,
      SITE_URL,
      { width: 180, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } },
      (err) => {
        if (!err) setQrDataUrl(canvas.toDataURL('image/png'));
      },
    );
  }, [isModalOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleKakao = useCallback(() => {
    const ok = kakaoShare.share();
    if (ok) {
      track('share_click', { method: 'kakao' });
      incrementSharedCount();
    } else {
      // 폴백: 링크 복사
      void navigator.clipboard.writeText(SHARE_TEXT);
      showToast('카카오톡을 열 수 없어 링크가 복사되었습니다', 'info');
      track('share_click', { method: 'clipboard' });
      incrementSharedCount();
    }
  }, [track, incrementSharedCount, showToast]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(SHARE_TEXT);
    showToast('복사되었습니다! 카톡이나 단톡방에 붙여넣기 해보세요 😊', 'success');
    track('share_click', { method: 'clipboard' });
    incrementSharedCount();
  }, [showToast, track, incrementSharedCount]);

  const handleQrDownload = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = '쌤핀_QR.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    track('share_click', { method: 'qr' });
    incrementSharedCount();
  }, [track, incrementSharedCount]);

  return (
    <Modal isOpen={isModalOpen} onClose={closeModal} title="동료 선생님께 추천" srOnlyTitle size="md">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-sp-border/40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <span className="material-symbols-outlined text-amber-400">mail</span>
            </div>
            <h3 className="text-lg font-bold text-sp-text">동료 선생님께 추천</h3>
          </div>
          <button onClick={closeModal} aria-label="닫기" className="p-2 rounded-lg hover:bg-sp-border/30 transition-colors">
            <span className="material-symbols-outlined text-sp-muted">close</span>
          </button>
        </div>

          {/* Body */}
          <div className="px-6 py-6 flex flex-col items-center">
            <p className="text-sm text-sp-muted text-center mb-6">
              쌤핀이 도움이 되셨다면, 동료 선생님께도 알려주세요!
            </p>

            {/* 공유 수단 */}
            <div className="flex flex-col gap-3 w-full">
              {/* 카카오톡 (Electron에서는 숨김) */}
              {!isElectron && kakaoAvailable && (
                <button
                  onClick={handleKakao}
                  className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-[#FEE500] text-[#391B1B] hover:brightness-95 transition-all w-full text-left font-medium text-sm"
                >
                  <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="#391B1B">
                    <path d="M12 3C6.48 3 2 6.48 2 10.5c0 2.58 1.69 4.84 4.22 6.13-.13.47-.84 3.03-.87 3.22 0 0-.02.13.05.18.07.05.16.02.16.02.21-.03 2.46-1.62 3.48-2.33.63.09 1.28.14 1.96.14 5.52 0 10-3.48 10-7.86S17.52 3 12 3z" />
                  </svg>
                  카카오톡으로 공유
                </button>
              )}

              {/* 링크 복사 */}
              <button
                onClick={() => void handleCopy()}
                className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-sp-accent text-sp-accent-fg hover:bg-sp-accent/90 transition-all w-full text-left font-medium text-sm"
              >
                <span className="material-symbols-outlined text-icon-lg">content_copy</span>
                링크 복사
              </button>

              {/* QR 코드 */}
              <div className="flex flex-col items-center mt-3">
                <p className="text-xs text-sp-muted mb-3">옆 자리 선생님 폰으로 바로 스캔!</p>
                <div className="bg-white rounded-xl p-3">
                  <canvas ref={canvasRef} className="block" />
                </div>
                <button
                  onClick={handleQrDownload}
                  disabled={!qrDataUrl}
                  className="mt-3 px-4 py-2 text-xs text-sp-muted hover:text-sp-text border border-sp-border rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-40"
                >
                  <span className="material-symbols-outlined text-icon-sm">download</span>
                  QR 이미지 저장
                </button>
              </div>
            </div>
          </div>
      </div>
    </Modal>
  );
}
