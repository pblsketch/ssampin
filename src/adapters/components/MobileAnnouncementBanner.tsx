import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { MOBILE_URL } from '@config/siteUrl';
const DISMISS_KEY = 'mobile-banner-dismissed';

export function MobileAnnouncementBanner() {
  const [visible, setVisible] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (!dismissed) setVisible(true);
  }, []);

  useEffect(() => {
    QRCode.toDataURL(MOBILE_URL, {
      width: 200,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    }).then(setQrDataUrl);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <>
      {/* 배너 */}
      <div className="bg-sp-accent text-white px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-base">📱</span>
          <span>
            <strong>쌤핀 모바일</strong>이 출시됐어요! 교실에서도 시간표·출결·메모를 확인하세요
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowModal(true)}
            className="px-3 py-1 rounded-full bg-white/20 hover:bg-white/30 text-xs font-medium transition-colors"
          >
            더 알아보기
          </button>
          <button
            onClick={dismiss}
            className="p-1 hover:bg-white/20 rounded transition-colors text-white/70 hover:text-white"
            title="닫기"
          >
            <span className="material-symbols-outlined text-icon-md">close</span>
          </button>
        </div>
      </div>

      {/* 안내 모달 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-sp-surface rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="text-center mb-6">
              <div className="text-4xl mb-2">📱</div>
              <h2 className="text-xl font-bold text-sp-text">쌤핀 모바일</h2>
              <p className="text-sp-muted text-sm mt-1">교무실 PC의 데이터를 모바일에서도!</p>
            </div>

            <div className="space-y-2 mb-6">
              {[
                '오늘 시간표 확인',
                '출결 체크 (담임/수업)',
                '메모 확인·작성',
                '할 일 관리',
                '일정 확인',
              ].map((feature) => (
                <div key={feature} className="flex items-center gap-2 text-sm text-sp-text">
                  <span className="text-green-500">✅</span>
                  <span>{feature}</span>
                </div>
              ))}
            </div>

            <div className="bg-blue-500/10 rounded-xl p-4 mb-6">
              <p className="text-blue-400 text-sm font-medium mb-1">🔄 Google Drive로 자동 동기화</p>
              <p className="text-sp-muted text-xs">PC에서 입력한 데이터가 모바일에 자동 반영돼요</p>
            </div>

            <div className="border border-sp-border rounded-xl p-4 mb-6">
              <p className="text-sp-text text-sm font-bold mb-3">📲 설치 방법</p>
              <ol className="space-y-2 text-sm text-sp-muted">
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 font-bold shrink-0">1.</span>
                  <span>핸드폰으로 <strong className="text-sp-text">{MOBILE_URL.replace('https://', '')}</strong> 접속</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 font-bold shrink-0">2.</span>
                  <span>Google 계정으로 로그인</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 font-bold shrink-0">3.</span>
                  <span>&quot;홈 화면에 추가&quot; 탭</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 font-bold shrink-0">4.</span>
                  <span>PC에서 Google Drive 동기화 켜기</span>
                </li>
              </ol>
            </div>

            {qrDataUrl && (
              <div className="flex justify-center mb-4">
                <img src={qrDataUrl} alt="쌤핀 모바일 QR 코드" className="w-36 h-36 rounded-lg" />
              </div>
            )}

            <button
              onClick={() => setShowModal(false)}
              className="w-full py-3 rounded-xl bg-sp-accent text-white font-medium hover:bg-sp-accent/90 transition-colors"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </>
  );
}
