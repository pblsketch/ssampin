import { useState, useRef, useEffect, useCallback } from 'react';
import QRCode from 'qrcode';
import { SITE_URL } from '@config/siteUrl';

interface MobileShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShared?: (method: 'native' | 'kakao' | 'clipboard' | 'qr') => void;
}

const SHARE_TITLE = '쌤핀 — 선생님을 위한 무료 대시보드';
const SHARE_TEXT = '시간표, 자리배치, 출결, 수업 도구를 하나로. 무료, 광고 없음!';
const SHARE_CLIPBOARD = `쌤핀 — 선생님을 위한 무료 대시보드 앱이에요.\n시간표, 자리배치, 출결, 수업 도구를 하나로 쓸 수 있어요.\n무료, 광고 없음! 👉 ${SITE_URL}`;

/** 모바일 공유 모달 — Web Share API 우선, 폴백으로 카카오/링크복사/QR */
export function MobileShareModal({ isOpen, onClose, onShared }: MobileShareModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrReady, setQrReady] = useState(false);
  const [copied, setCopied] = useState(false);

  const kakaoAvailable = typeof window !== 'undefined' && !!window.Kakao;

  // QR 생성
  useEffect(() => {
    if (!isOpen) { setQrReady(false); return; }
    const canvas = canvasRef.current;
    if (!canvas) return;
    QRCode.toCanvas(
      canvas,
      SITE_URL,
      { width: 160, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } },
      (err) => { if (!err) setQrReady(true); },
    );
  }, [isOpen]);

  // Web Share API (네이티브 공유)
  const handleNativeShare = useCallback(async () => {
    if (!navigator.share) return false;
    try {
      await navigator.share({ title: SHARE_TITLE, text: SHARE_TEXT, url: SITE_URL });
      onShared?.('native');
      onClose();
      return true;
    } catch {
      return false;
    }
  }, [onClose, onShared]);

  const handleKakao = useCallback(() => {
    if (!window.Kakao?.Share) return;
    const key = import.meta.env.VITE_KAKAO_JS_KEY as string | undefined;
    if (key && !window.Kakao.isInitialized()) {
      window.Kakao.init(key);
    }
    window.Kakao.Share.sendDefault({
      objectType: 'feed',
      content: {
        title: SHARE_TITLE,
        description: SHARE_TEXT,
        imageUrl: `${SITE_URL}/images/share-thumb.png`,
        link: { mobileWebUrl: SITE_URL, webUrl: SITE_URL },
      },
      buttons: [{ title: '다운로드하기', link: { mobileWebUrl: SITE_URL, webUrl: SITE_URL } }],
    });
    onShared?.('kakao');
  }, [onShared]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(SHARE_CLIPBOARD);
    setCopied(true);
    onShared?.('clipboard');
    setTimeout(() => setCopied(false), 2000);
  }, [onShared]);

  const handleQrDownload = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = '쌤핀_QR.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    onShared?.('qr');
  }, [onShared]);

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} />

      {/* Bottom sheet */}
      <div className="fixed inset-x-0 bottom-0 z-50 animate-slide-up">
        <div className="bg-white dark:bg-slate-800 rounded-t-2xl shadow-2xl max-h-[85dvh] overflow-y-auto" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
          </div>

          {/* Header */}
          <div className="px-5 pb-4 pt-2">
            <h2 className="text-lg font-bold text-sp-text">동료 선생님께 추천</h2>
            <p className="text-xs text-sp-muted mt-1">쌤핀이 도움이 되셨다면 알려주세요!</p>
          </div>

          {/* Actions */}
          <div className="px-5 pb-4 space-y-2.5">
            {/* 네이티브 공유 (가능한 경우) */}
            {typeof navigator.share === 'function' && (
              <button
                onClick={() => void handleNativeShare()}
                className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl bg-blue-500 text-white font-medium text-sm active:scale-[0.98] transition-transform"
              >
                <span className="material-symbols-outlined text-[20px]">share</span>
                공유하기
              </button>
            )}

            {/* 카카오톡 */}
            {kakaoAvailable && (
              <button
                onClick={handleKakao}
                className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl bg-[#FEE500] text-[#391B1B] font-medium text-sm active:scale-[0.98] transition-transform"
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
              className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl glass-card text-sp-text font-medium text-sm active:scale-[0.98] transition-transform"
            >
              <span className="material-symbols-outlined text-[20px] text-blue-500">
                {copied ? 'check' : 'content_copy'}
              </span>
              {copied ? '복사되었습니다!' : '링크 복사'}
            </button>
          </div>

          {/* QR */}
          <div className="px-5 pb-6 flex flex-col items-center border-t border-slate-200 dark:border-slate-700 pt-4">
            <p className="text-xs text-sp-muted mb-3">옆 반 선생님 폰으로 바로 스캔!</p>
            <div className="bg-white rounded-xl p-3">
              <canvas ref={canvasRef} className="block" />
            </div>
            <button
              onClick={handleQrDownload}
              disabled={!qrReady}
              className="mt-3 px-3 py-1.5 text-xs text-sp-muted border border-slate-300 dark:border-slate-600 rounded-lg flex items-center gap-1 disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[14px]">download</span>
              QR 저장
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
