import { useRef, useEffect, useState, useCallback } from 'react';
import QRCode from 'qrcode';
import { ChatPanel } from './ChatPanel';
import type { ChatEntry } from './ChatPanel';

interface StudentState {
  id: string;
  name: string;
  emoji: string;
  avatarColor: string;
  connected: boolean;
  position: number;
  signal: string;
}

interface DiscussionLiveProps {
  toolType: 'valueline' | 'trafficlight';
  topics: string[];
  currentRound: number;
  students: StudentState[];
  chats: ChatEntry[];
  connectionCount: number;
  onNextRound: () => void;
  onEnd: () => void;
  isFullscreen: boolean;
  // QR/tunnel state
  tunnelUrl: string | null;
  tunnelLoading: boolean;
  tunnelError: string | null;
  shortUrl: string | null;
  shortCode: string | null;
  customCodeInput: string;
  customCodeError: string | null;
  onCustomCodeChange: (v: string) => void;
  onSetCustomCode: () => void;
  showQRFullscreen: boolean;
  onToggleQRFullscreen: () => void;
  serverInfo: { port: number; localIPs: string[] } | null;
  // Render the tool-specific visualization area
  children: React.ReactNode;
}

export type { StudentState };

export function DiscussionLive({
  toolType,
  topics,
  currentRound,
  students,
  chats,
  connectionCount,
  onNextRound,
  onEnd,
  isFullscreen,
  tunnelUrl,
  tunnelLoading,
  tunnelError,
  shortUrl,
  shortCode,
  customCodeInput,
  customCodeError,
  onCustomCodeChange,
  onSetCustomCode,
  showQRFullscreen,
  onToggleQRFullscreen,
  serverInfo,
  children,
}: DiscussionLiveProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fullscreenCanvasRef = useRef<HTMLCanvasElement>(null);
  const [copiedField, setCopiedField] = useState<'tunnel' | 'short' | null>(null);
  const displayUrl = shortUrl ?? tunnelUrl ?? '';

  const handleCopy = useCallback((text: string, field: 'tunnel' | 'short') => {
    void navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  }, []);
  const isLastRound = currentRound >= topics.length - 1;
  const toolLabel = toolType === 'valueline' ? '가치수직선' : '신호등';

  useEffect(() => {
    if (canvasRef.current && displayUrl) {
      QRCode.toCanvas(canvasRef.current, displayUrl, {
        width: 120,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      }).catch(() => {/* ignore */});
    }
  }, [displayUrl]);

  useEffect(() => {
    if (showQRFullscreen && fullscreenCanvasRef.current && displayUrl) {
      QRCode.toCanvas(fullscreenCanvasRef.current, displayUrl, {
        width: 400,
        margin: 3,
        color: { dark: '#000000', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      }).catch(() => {/* ignore */});
    }
  }, [displayUrl, showQRFullscreen]);

  // QR fullscreen overlay
  if (showQRFullscreen) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white cursor-pointer"
        onClick={onToggleQRFullscreen}
      >
        <canvas ref={fullscreenCanvasRef} className="mb-6" />
        <p className="text-gray-800 text-xl font-bold mb-2">{toolLabel} 토론 참여하기</p>
        <p className="text-gray-600 text-lg font-mono">{displayUrl}</p>
        <p className="text-gray-400 text-sm mt-4">화면을 클릭하면 돌아갑니다</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 h-full gap-4">
      {/* Main area */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {/* Top bar */}
        <div className={`flex items-center gap-3 shrink-0 ${isFullscreen ? 'mb-2' : 'mb-3'}`}>
          <span className="text-xs bg-sp-accent/20 text-sp-accent px-2.5 py-1 rounded-full font-medium">
            라운드 {currentRound + 1}/{topics.length}
          </span>
          <h2 className={`font-bold text-sp-text flex-1 ${isFullscreen ? 'text-2xl' : 'text-xl'}`}>
            {topics[currentRound] ?? ''}
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-sp-muted text-xs">
              <span className="material-symbols-outlined text-icon-sm align-middle mr-0.5">group</span>
              <span className="text-sp-text font-bold">{students.length}</span>명 참여
            </span>
            <span className="text-green-400 text-xs font-bold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              LIVE
            </span>
          </div>
        </div>

        {/* Tool-specific visualization */}
        <div className="flex-1 min-h-0 flex items-center justify-center">
          {children}
        </div>

        {/* QR panel — compact horizontal layout */}
        <div className="shrink-0 mt-3 bg-sp-card/80 border border-sp-border rounded-xl px-4 py-3">
          <div className="flex items-center gap-4">
            {displayUrl && (
              <div className="bg-white rounded-lg p-1.5 shrink-0">
                <canvas ref={canvasRef} />
              </div>
            )}

            <div className="flex flex-col gap-1.5 flex-1 min-w-0">
              {tunnelLoading ? (
                <div className="flex items-center gap-2 text-blue-400 text-xs">
                  <span className="animate-spin">⏳</span>
                  <span>인터넷 연결 준비 중...</span>
                </div>
              ) : tunnelUrl ? (
                <div className="flex items-center gap-1.5">
                  <p className="text-sp-text font-mono text-xs break-all flex-1 truncate">{tunnelUrl}</p>
                  <button
                    onClick={() => handleCopy(tunnelUrl, 'tunnel')}
                    className="shrink-0 p-1 rounded-md hover:bg-sp-text/10 text-sp-muted hover:text-sp-text transition-colors"
                    title="주소 복사"
                  >
                    <span className={`material-symbols-outlined text-icon-sm ${copiedField === 'tunnel' ? 'text-green-400' : ''}`}>
                      {copiedField === 'tunnel' ? 'check' : 'content_copy'}
                    </span>
                  </button>
                </div>
              ) : tunnelError ? (
                <div className="flex flex-col gap-0.5">
                  <p className="text-red-400 text-xs">{tunnelError}</p>
                  <p className="text-sp-muted text-caption">
                    Wi-Fi 직접 접속: http://{serverInfo?.localIPs[0] ?? '...'}:{serverInfo?.port ?? ''}
                  </p>
                </div>
              ) : null}

              {shortUrl && (
                <div className="flex items-center gap-2 border-t border-sp-border/50 pt-1.5">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <span className="text-caption text-sp-muted shrink-0">짧은 주소</span>
                    <p className="text-sp-accent font-bold text-xs font-mono truncate">{shortUrl}</p>
                    <button
                      onClick={() => handleCopy(shortUrl, 'short')}
                      className="shrink-0 p-0.5 rounded-md hover:bg-sp-text/10 text-sp-muted hover:text-sp-text transition-colors"
                      title="주소 복사"
                    >
                      <span className={`material-symbols-outlined text-icon-sm ${copiedField === 'short' ? 'text-green-400' : ''}`}>
                        {copiedField === 'short' ? 'check' : 'content_copy'}
                      </span>
                    </button>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      type="text"
                      value={customCodeInput}
                      onChange={(e) => onCustomCodeChange(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') onSetCustomCode(); }}
                      placeholder={shortCode ?? '코드'}
                      maxLength={30}
                      className="w-24 bg-sp-bg border border-sp-border rounded-lg px-2 py-1 text-caption text-sp-text placeholder-sp-muted focus:border-sp-accent focus:outline-none"
                    />
                    <button
                      onClick={onSetCustomCode}
                      disabled={!customCodeInput.trim()}
                      className="px-2 py-1 rounded-lg bg-sp-accent/20 border border-sp-accent/30 text-sp-accent text-caption font-medium hover:bg-sp-accent/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      변경
                    </button>
                  </div>
                </div>
              )}
              {customCodeError && (
                <p className="text-red-400 text-caption">{customCodeError}</p>
              )}
            </div>
          </div>
        </div>

        {/* Bottom controls */}
        <div className="flex items-center justify-between shrink-0 mt-2 pb-1">
          <div className="flex items-center gap-3">
            <span className="text-sp-muted text-xs">
              접속 <span className="text-sp-text font-bold">{connectionCount}명</span>
            </span>
            <button
              onClick={onToggleQRFullscreen}
              className="px-2.5 py-1 rounded-lg bg-sp-bg border border-sp-border text-sp-muted hover:text-sp-text text-xs transition-all"
              title="QR 코드 크게 보기"
            >
              <span className="material-symbols-outlined text-icon-sm align-middle">zoom_in</span> 크게
            </button>
          </div>
          <div className="flex items-center gap-2">
            {!isLastRound && (
              <button
                onClick={onNextRound}
                className="px-4 py-2 rounded-xl bg-sp-accent/20 border border-sp-accent/30 text-sp-accent font-medium text-sm hover:bg-sp-accent/30 transition-all"
              >
                다음 라운드 →
              </button>
            )}
            <button
              onClick={onEnd}
              className="px-4 py-2 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 text-sm font-medium transition-all"
            >
              종료
            </button>
          </div>
        </div>
      </div>

      {/* Chat panel with student stance data */}
      <ChatPanel chats={chats} students={students} toolType={toolType} />
    </div>
  );
}
