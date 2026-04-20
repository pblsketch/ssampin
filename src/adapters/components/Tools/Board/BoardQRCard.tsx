/**
 * BoardQRCard — QR 코드 + URL + 세션 코드 + 복사 버튼 (Design §5.4)
 *
 * StartBoardSession이 생성한 qrDataUrl (data:image/png;base64,...)을 그대로 img에 바인딩.
 * 교사가 QR을 빔프로젝터에 띄우거나 URL/코드를 복사해 전달.
 */
import { useState } from 'react';

interface BoardQRCardProps {
  readonly publicUrl: string;
  readonly sessionCode: string;
  readonly authToken: string;
  readonly qrDataUrl: string;
}

export function BoardQRCard({
  publicUrl,
  sessionCode,
  authToken,
  qrDataUrl,
}: BoardQRCardProps): JSX.Element {
  const fullUrl = `${publicUrl}?t=${authToken}&code=${sessionCode}`;

  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopyStatus('copied');
      window.setTimeout(() => setCopyStatus('idle'), 1500);
    } catch {
      setCopyStatus('failed');
      window.setTimeout(() => setCopyStatus('idle'), 2000);
    }
  }

  return (
    <div className="bg-sp-card rounded-xl p-5">
      <div className="flex items-start gap-5">
        {/* QR 코드 */}
        <div className="flex-shrink-0 bg-white rounded-lg p-2">
          <img
            src={qrDataUrl}
            alt="보드 접속 QR 코드"
            className="block w-40 h-40"
            draggable={false}
          />
        </div>

        {/* 코드·URL·복사 */}
        <div className="flex-1 min-w-0 space-y-3">
          <div>
            <div className="text-xs text-sp-muted mb-1">세션 코드</div>
            <div className="text-3xl font-bold tracking-[0.15em] text-sp-text font-mono">
              {sessionCode}
            </div>
          </div>

          <div>
            <div className="text-xs text-sp-muted mb-1">접속 URL</div>
            <div className="text-xs text-sp-text break-all bg-sp-bg/60 rounded p-2 font-mono select-all">
              {fullUrl}
            </div>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="w-full px-3 py-2 rounded-lg bg-sp-border/40 text-sp-text text-sm hover:bg-sp-border/60 flex items-center justify-center gap-1"
          >
            <span className="material-symbols-outlined text-icon-sm">content_copy</span>
            {copyStatus === 'copied' ? '복사됨!' : copyStatus === 'failed' ? '복사 실패' : 'URL 복사'}
          </button>

          <div className="text-[11px] text-sp-muted">
            학생이 QR을 스캔하거나 URL을 직접 입력해 접속할 수 있어요.
          </div>
        </div>
      </div>
    </div>
  );
}
