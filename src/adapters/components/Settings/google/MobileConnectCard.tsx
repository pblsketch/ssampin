import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { MOBILE_URL } from '@config/siteUrl';

/**
 * "모바일 연결" 상설 카드 — Google 계정 연결 여부와 무관하게 항상 노출된다.
 * QR/주소는 MobileAnnouncementBanner와 동일한 `qrcode` 패키지 사용 방식을 재사용.
 */
export function MobileConnectCard() {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(MOBILE_URL, {
      width: 176,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    }).then((url) => {
      if (active) setQrDataUrl(url);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="rounded-xl bg-sp-card ring-1 ring-sp-border p-5">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-violet-500/10 text-violet-400">
          <span className="material-symbols-outlined">smartphone</span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-sp-text">모바일 연결</h3>
          <p className="text-xs text-sp-muted mt-0.5">교실에서도 시간표·출결·메모를 확인하세요</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
        {qrDataUrl && (
          <img
            src={qrDataUrl}
            alt="쌤핀 모바일 접속 QR 코드"
            className="w-32 h-32 rounded-lg shrink-0 ring-1 ring-sp-border"
          />
        )}
        <div className="flex-1 min-w-0 w-full space-y-3">
          <div className="rounded-lg bg-sp-surface px-3 py-2 text-center sm:text-left">
            <p className="text-xs text-sp-muted">휴대폰 브라우저에서 접속</p>
            <p className="text-sm font-mono font-semibold text-sp-text">
              {MOBILE_URL.replace('https://', '')}
            </p>
          </div>
          <ol className="space-y-1.5 text-xs text-sp-muted">
            <li className="flex items-start gap-2">
              <span className="font-bold text-sp-accent shrink-0">1.</span>
              <span>폰에서 QR 코드를 스캔하거나 위 주소로 접속하세요</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold text-sp-accent shrink-0">2.</span>
              <span>이 PC와 같은 Google 계정으로 로그인하세요</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold text-sp-accent shrink-0">3.</span>
              <span>홈 화면에 추가하면 앱처럼 바로 열 수 있어요</span>
            </li>
          </ol>
        </div>
      </div>
    </section>
  );
}
