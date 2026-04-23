import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

function copyText(text: string): void {
  void navigator.clipboard.writeText(text);
}

export interface RealtimeWallLiveSharePanelProps {
  readonly title: string;
  readonly connectedStudents: number;
  readonly displayUrl: string | null;
  readonly fullUrl: string | null;
  readonly shortUrl: string | null;
  readonly shortCode: string | null;
  readonly tunnelLoading: boolean;
  readonly tunnelError: string | null;
  readonly customCodeInput: string;
  readonly customCodeError: string | null;
  readonly showQRFullscreen: boolean;
  readonly onToggleQRFullscreen: () => void;
  readonly onStop: () => void;
  readonly onRetryTunnel: () => void;
  readonly onCustomCodeChange: (value: string) => void;
  readonly onSetCustomCode: () => void;
  /** 설정 드로어 열기 (v1.13 Stage C) */
  readonly onOpenSettings: () => void;
}

export function RealtimeWallLiveSharePanel({
  title,
  connectedStudents,
  displayUrl,
  fullUrl,
  shortUrl,
  shortCode,
  tunnelLoading,
  tunnelError,
  customCodeInput,
  customCodeError,
  showQRFullscreen,
  onToggleQRFullscreen,
  onStop,
  onRetryTunnel,
  onCustomCodeChange,
  onSetCustomCode,
  onOpenSettings,
}: RealtimeWallLiveSharePanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fullscreenCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !displayUrl || showQRFullscreen) return;
    void QRCode.toCanvas(canvasRef.current, displayUrl, {
      width: 170,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    });
  }, [displayUrl, showQRFullscreen]);

  useEffect(() => {
    if (!fullscreenCanvasRef.current || !displayUrl || !showQRFullscreen) return;
    void QRCode.toCanvas(fullscreenCanvasRef.current, displayUrl, {
      width: 360,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    });
  }, [displayUrl, showQRFullscreen]);

  if (showQRFullscreen && displayUrl) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white text-center"
        onClick={onToggleQRFullscreen}
      >
        <canvas ref={fullscreenCanvasRef} />
        <p className="mt-6 text-2xl font-bold text-gray-900">{title}</p>
        <p className="mt-2 font-mono text-lg text-gray-600">{displayUrl}</p>
        <p className="mt-4 text-sm text-gray-400">화면을 클릭하면 돌아갑니다.</p>
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-sp-border bg-sp-card p-4">
      {/* 헤더: 접속 현황 + 버튼 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.4)]" />
          <h2 className="text-sm font-bold text-sp-text">학생 참여 중</h2>
          <span className="rounded-full bg-sp-surface px-2 py-0.5 text-xs tabular-nums text-sp-muted">
            {connectedStudents}명 접속
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleQRFullscreen}
            disabled={!displayUrl}
            className="flex items-center gap-1.5 rounded-lg border border-sp-border bg-sp-surface px-3 py-1.5 text-xs text-sp-muted transition hover:border-sp-accent hover:text-sp-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-[14px]">qr_code</span>
            QR 크게 보기
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            title="담벼락 설정"
            aria-label="담벼락 설정 열기"
            className="flex items-center gap-1.5 rounded-lg border border-sp-border bg-sp-surface px-2.5 py-1.5 text-xs text-sp-muted transition hover:border-sp-accent hover:text-sp-accent"
          >
            <span className="material-symbols-outlined text-[14px]">settings</span>
          </button>
          <button
            type="button"
            onClick={onStop}
            className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/15"
          >
            <span className="material-symbols-outlined text-[14px]">stop_circle</span>
            참여 종료
          </button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[160px_minmax(0,1fr)]">
        {/* QR 코드 */}
        <div className="flex items-center justify-center rounded-lg bg-white p-2">
          {displayUrl ? (
            <canvas ref={canvasRef} />
          ) : tunnelLoading ? (
            <div className="py-4 text-xs text-gray-500">QR 준비 중...</div>
          ) : (
            <div className="px-3 py-4 text-center text-xs text-gray-500">주소 생성 실패</div>
          )}
        </div>

        {/* 주소 정보 */}
        <div className="space-y-2.5">
          {tunnelLoading && (
            <div className="flex items-center gap-2 rounded-lg border border-sp-border bg-sp-surface px-3 py-2.5 text-xs text-sp-muted">
              <span className="material-symbols-outlined animate-spin text-[14px] text-blue-400">progress_activity</span>
              외부 접속 주소를 만드는 중입니다. 잠시만 기다려주세요.
            </div>
          )}

          {/* primary 주소 — 크게 강조 */}
          {displayUrl && (
            <div className="rounded-lg border border-sp-accent/30 bg-sp-accent/5 px-3 py-2.5">
              <p className="mb-1 text-[11px] font-medium text-sp-accent/70">학생에게 공유할 주소</p>
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate font-mono text-sm font-bold text-sp-accent">
                  {displayUrl}
                </p>
                <button
                  type="button"
                  onClick={() => copyText(displayUrl)}
                  className="shrink-0 rounded-md border border-sp-accent/30 bg-sp-accent/10 px-2.5 py-1 text-xs font-medium text-sp-accent transition hover:bg-sp-accent/20"
                >
                  복사
                </button>
              </div>
            </div>
          )}

          {/* 전체 주소 — 보조 */}
          {fullUrl && fullUrl !== shortUrl && (
            <div className="rounded-lg border border-sp-border bg-sp-surface px-3 py-2">
              <p className="mb-0.5 text-[10px] text-sp-muted/70">원본 주소</p>
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate font-mono text-xs text-sp-muted">
                  {fullUrl}
                </p>
                <button
                  type="button"
                  onClick={() => copyText(fullUrl)}
                  className="shrink-0 rounded-md border border-sp-border px-2 py-1 text-[10px] text-sp-muted transition hover:border-sp-accent hover:text-sp-accent"
                >
                  복사
                </button>
              </div>
            </div>
          )}

          {/* 짧은 주소 커스텀 */}
          {shortUrl && (
            <div className="rounded-lg border border-sp-border bg-sp-surface px-3 py-2.5">
              <div className="mb-2 flex items-center gap-2">
                <p className="text-[11px] text-sp-muted">짧은 코드 변경</p>
                {shortCode && (
                  <span className="rounded-full border border-sp-accent/20 bg-sp-accent/10 px-2 py-0.5 text-[10px] font-bold text-sp-accent">
                    현재: {shortCode}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={customCodeInput}
                  onChange={(event) => onCustomCodeChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') onSetCustomCode();
                  }}
                  placeholder="예: 2반-토론"
                  maxLength={30}
                  className="min-w-0 flex-1 rounded-lg border border-sp-border bg-sp-bg px-3 py-1.5 text-xs text-sp-text outline-none transition focus:border-sp-accent"
                />
                <button
                  type="button"
                  onClick={onSetCustomCode}
                  disabled={!customCodeInput.trim()}
                  className="shrink-0 rounded-lg border border-sp-accent/40 bg-sp-accent/10 px-3 py-1.5 text-xs font-medium text-sp-accent transition hover:bg-sp-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  변경
                </button>
              </div>
              {customCodeError && (
                <p className="mt-1.5 text-[11px] text-red-400">{customCodeError}</p>
              )}
            </div>
          )}

          {tunnelError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs text-red-300">
              <p>{tunnelError}</p>
              <button
                type="button"
                onClick={onRetryTunnel}
                className="mt-1.5 rounded-md border border-red-400/40 px-2.5 py-1 text-[11px] font-medium text-red-200 transition hover:bg-red-500/10"
              >
                다시 시도
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
