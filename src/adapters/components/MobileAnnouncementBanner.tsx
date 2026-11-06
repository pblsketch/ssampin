import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { MOBILE_URL } from '@config/siteUrl';
import { useWindowControlsOverlay } from '@adapters/hooks/useWindowControlsOverlay';
const DISMISS_KEY = 'mobile-banner-dismissed';

export function MobileAnnouncementBanner() {
  const hasWindowControls = useWindowControlsOverlay();
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

  /*
    창 맨 위에 놓이는 줄이라, 윈도우에서는 화면 위에 떠 있는 창 버튼(최소화·최대화·닫기)
    바로 밑에 깔린다. 예전에는 [더 알아보기]·[✕]가 정확히 그 자리에 있어서 누르면 창이
    최소화되거나 닫혔고, 배너를 끌 방법도 없었다(2026-11-06 교사 신고).

    그래서 창 버튼이 떠 있을 때는 이 줄이 제목 표시줄 역할을 맡는다.
    - 오른쪽에 창 버튼 폭만큼 자리를 비운다. 폭은 OS 가 알려 주는 값으로 계산하고,
      값이 이상하게 와도 내용이 짜부라지지 않게 200px 로 묶는다.
    - 줄을 잡아 창을 옮길 수 있게 하고, 단추는 그 영역에서 뺀다.
    - 안내 창이 열려 있을 때는 끈다. 끌기 영역은 OS 가 따로 계산해서 화면 위에 덮인
      안내 창의 클릭까지 가로챈다.
  */
  const titleRowStyle: React.CSSProperties | undefined = hasWindowControls
    ? ({
        minHeight: 'env(titlebar-area-height, 32px)',
        paddingRight:
          'calc(min(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw), 200px) + 0.75rem)',
        WebkitAppRegion: showModal ? 'no-drag' : 'drag',
      } as React.CSSProperties)
    : undefined;
  const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

  return (
    <>
      {/* 배너 */}
      <div
        className="bg-sp-accent text-sp-accent-fg px-4 py-1.5 flex items-center justify-between gap-3 text-sm"
        style={titleRowStyle}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="material-symbols-outlined text-icon-md shrink-0" aria-hidden>
            smartphone
          </span>
          <span className="truncate">
            <strong>쌤핀 모바일</strong>이 출시됐어요! 교실에서도 시간표·출결·메모를 확인하세요
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowModal(true)}
            style={noDrag}
            className="px-3 py-0.5 rounded-full border border-current text-xs font-medium transition-colors hover:bg-sp-accent-fg hover:text-sp-accent"
          >
            더 알아보기
          </button>
          <button
            type="button"
            onClick={dismiss}
            style={noDrag}
            className="p-1 rounded-lg opacity-70 hover:opacity-100 transition-opacity"
            aria-label="모바일 안내 닫기"
            title="닫기"
          >
            <span className="material-symbols-outlined text-icon-md" aria-hidden>
              close
            </span>
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
              <p className="text-blue-400 text-sm font-medium mb-1">
                🔄 Google Drive로 자동 동기화
              </p>
              <p className="text-sp-muted text-xs">
                PC 데이터가 Google Drive를 거쳐 자동 동기화돼요 (몇 분 이내 반영)
              </p>
            </div>

            <div className="border border-sp-border rounded-xl p-4 mb-6">
              <p className="text-sp-text text-sm font-bold mb-3">📲 설치 방법</p>
              <ol className="space-y-2 text-sm text-sp-muted">
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 font-bold shrink-0">1.</span>
                  <span>
                    핸드폰으로{' '}
                    <strong className="text-sp-text">{MOBILE_URL.replace('https://', '')}</strong>{' '}
                    접속
                  </span>
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
              className="w-full py-3 rounded-xl bg-sp-accent text-sp-accent-fg font-medium hover:opacity-90 transition-opacity"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </>
  );
}
