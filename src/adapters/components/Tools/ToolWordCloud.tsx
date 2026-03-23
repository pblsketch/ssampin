import { useState, useCallback, useRef, useEffect } from 'react';
import { ToolLayout } from './ToolLayout';
import type { KeyboardShortcut } from './types';
import QRCode from 'qrcode';
import { useAnalytics } from '@adapters/hooks/useAnalytics';

interface ToolWordCloudProps {
  onBack: () => void;
  isFullscreen: boolean;
}

type ViewMode = 'create' | 'live';

const WORD_COLORS = [
  '#60a5fa', '#f87171', '#34d399', '#fbbf24', '#a78bfa',
  '#fb923c', '#2dd4bf', '#f472b6', '#818cf8', '#4ade80',
];

const EXAMPLE_QUESTIONS = [
  '이 주제에 대해 떠오르는 단어는?',
  '수업 후 느낀 점 한 단어로?',
  '오늘 기분을 한 단어로!',
  '이번 학기 목표 키워드는?',
  '이 작품의 인상을 한 단어로?',
];

interface WordEntry {
  word: string;
  normalized: string;
  count: number;
  color: string;
  rotation: number;
}

function normalizeWord(word: string): string {
  return word.trim().replace(/\s+/g, ' ').toLowerCase();
}

/* ───────────────── Create View ───────────────── */

interface CreateViewProps {
  isFullscreen: boolean;
  onStart: (question: string, maxSubmissions: number) => void;
}

function CreateView({ isFullscreen, onStart }: CreateViewProps) {
  const [question, setQuestion] = useState('');
  const [maxSubmissions, setMaxSubmissions] = useState(5);

  const handleStart = () => {
    const q = question.trim();
    if (!q) return;
    onStart(q, maxSubmissions);
  };

  return (
    <div className={`flex flex-col items-center justify-center gap-6 py-8 ${isFullscreen ? 'px-12' : 'px-6'}`}>
      <div className="w-full max-w-xl">
        <label className="block text-sp-muted text-sm mb-2">질문</label>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleStart(); }}
          placeholder="학생들에게 물어볼 질문을 입력하세요"
          className="w-full px-4 py-3 rounded-xl bg-sp-bg border border-sp-border text-sp-text text-lg focus:border-sp-accent focus:outline-none transition-colors"
          autoFocus
        />
      </div>

      {/* Example questions */}
      <div className="flex flex-wrap gap-2 max-w-xl justify-center">
        {EXAMPLE_QUESTIONS.map((eq) => (
          <button
            key={eq}
            onClick={() => setQuestion(eq)}
            className="px-3 py-1.5 rounded-lg bg-sp-bg border border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent/50 text-sm transition-all"
          >
            {eq}
          </button>
        ))}
      </div>

      {/* Settings */}
      <div className="flex items-center gap-4 max-w-xl">
        <label className="text-sp-muted text-sm whitespace-nowrap">1인당 제출 횟수</label>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMaxSubmissions((v) => Math.max(1, v - 1))}
            className="w-8 h-8 rounded-lg bg-sp-bg border border-sp-border text-sp-muted hover:text-sp-text text-lg flex items-center justify-center transition-colors"
          >
            −
          </button>
          <span className="w-8 text-center text-sp-text font-bold">{maxSubmissions}</span>
          <button
            onClick={() => setMaxSubmissions((v) => Math.min(10, v + 1))}
            className="w-8 h-8 rounded-lg bg-sp-bg border border-sp-border text-sp-muted hover:text-sp-text text-lg flex items-center justify-center transition-colors"
          >
            +
          </button>
        </div>
      </div>

      {/* Start button */}
      <button
        onClick={handleStart}
        disabled={!question.trim()}
        className="px-8 py-4 rounded-xl bg-sp-accent hover:bg-blue-600 disabled:bg-sp-border disabled:text-sp-muted text-white font-bold text-lg transition-all"
      >
        ☁️ 워드클라우드 시작!
      </button>
    </div>
  );
}

/* ───────────────── Live Panel (QR + connection info) ───────────────── */

interface LivePanelProps {
  serverInfo: { port: number; localIPs: string[] };
  connectedStudents: number;
  selectedIP: string;
  onSelectIP: (ip: string) => void;
  onStop: () => void;
  isFullscreen: boolean;
  showQRFullscreen: boolean;
  onToggleQRFullscreen: () => void;
  // Tunnel props
  tunnelUrl: string | null;
  tunnelLoading: boolean;
  tunnelError: string | null;
  onStartTunnel: () => void;
}

function LivePanel({
  serverInfo,
  connectedStudents,
  selectedIP,
  onSelectIP,
  onStop,
  isFullscreen,
  showQRFullscreen,
  onToggleQRFullscreen,
  tunnelUrl,
  tunnelLoading,
  tunnelError,
  onStartTunnel,
}: LivePanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fullscreenCanvasRef = useRef<HTMLCanvasElement>(null);
  const displayUrl = tunnelUrl ?? `http://${selectedIP}:${serverInfo.port}`;

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, displayUrl, {
        width: 200,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      }).catch(() => {/* ignore */});
    }
  }, [displayUrl]);

  useEffect(() => {
    if (showQRFullscreen && fullscreenCanvasRef.current) {
      QRCode.toCanvas(fullscreenCanvasRef.current, displayUrl, {
        width: 400,
        margin: 3,
        color: { dark: '#000000', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      }).catch(() => {/* ignore */});
    }
  }, [displayUrl, showQRFullscreen]);

  if (showQRFullscreen) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white cursor-pointer"
        onClick={onToggleQRFullscreen}
      >
        <canvas ref={fullscreenCanvasRef} className="mb-6" />
        <p className="text-gray-800 text-xl font-bold mb-2">☁️ 워드클라우드 참여하기</p>
        <p className="text-gray-600 text-lg font-mono">{displayUrl}</p>
        {tunnelUrl && (
          <p className="text-blue-500 text-sm mt-1">인터넷 모드 (Wi-Fi 불필요)</p>
        )}
        <p className="text-gray-400 text-sm mt-4">화면을 클릭하면 돌아갑니다</p>
      </div>
    );
  }

  return (
    <div className={`bg-sp-card border border-sp-border rounded-xl p-4 flex flex-col items-center gap-3 shrink-0 ${isFullscreen ? '' : ''}`}>
      <div className="flex items-center gap-2 w-full">
        <span className="text-green-400 text-sm font-bold">● LIVE</span>
        <span className="text-sp-muted text-sm">
          접속 학생: <span className="text-sp-text font-bold">{connectedStudents}명</span>
        </span>
        <div className="flex-1" />
        <button
          onClick={onToggleQRFullscreen}
          className="px-3 py-1.5 rounded-lg bg-sp-bg border border-sp-border text-sp-muted hover:text-sp-text text-xs transition-all"
          title="QR 코드 크게 보기"
        >
          🔍 크게
        </button>
        <button
          onClick={onStop}
          className="px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 text-xs font-medium transition-all"
        >
          종료
        </button>
      </div>

      <div className="flex items-center gap-4">
        <div className="bg-white rounded-lg p-2">
          <canvas ref={canvasRef} />
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sp-text font-mono text-sm break-all">{displayUrl}</p>
          {!tunnelUrl && serverInfo.localIPs.length > 1 && (
            <select
              value={selectedIP}
              onChange={(e) => onSelectIP(e.target.value)}
              className="bg-sp-bg border border-sp-border rounded-lg px-2 py-1.5 text-xs text-sp-text focus:border-sp-accent focus:outline-none"
            >
              {serverInfo.localIPs.map((ip) => (
                <option key={ip} value={ip}>{ip}</option>
              ))}
            </select>
          )}
          {tunnelUrl ? (
            <p className="text-blue-400 text-xs">
              🌐 인터넷 모드 — Wi-Fi 연결 불필요
            </p>
          ) : (
            <p className="text-sp-muted text-xs">
              학생들이 같은 Wi-Fi에서 QR을 스캔하세요
            </p>
          )}

          {/* Tunnel toggle */}
          {!tunnelUrl && (
            <button
              onClick={onStartTunnel}
              disabled={tunnelLoading}
              className="mt-1 px-3 py-1.5 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-400 hover:bg-blue-500/30 text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-wait"
            >
              {tunnelLoading ? '🔄 인터넷 연결 준비 중...' : '🌐 인터넷으로 공유'}
            </button>
          )}
          {tunnelError && (
            <p className="text-red-400 text-xs">{tunnelError}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────────────── Word Cloud Display ───────────────── */

interface WordCloudDisplayProps {
  words: WordEntry[];
  question: string;
  isFullscreen: boolean;
  totalSubmissions: number;
}

function WordCloudDisplay({ words, question, isFullscreen, totalSubmissions }: WordCloudDisplayProps) {
  const MIN_FONT = isFullscreen ? 18 : 14;
  const MAX_FONT = isFullscreen ? 96 : 64;
  const MAX_DISPLAY = 50;

  const displayWords = words.slice(0, MAX_DISPLAY);

  const minCount = displayWords.length > 0 ? Math.min(...displayWords.map((w) => w.count)) : 1;
  const maxCount = displayWords.length > 0 ? Math.max(...displayWords.map((w) => w.count)) : 1;

  const getFontSize = (count: number): number => {
    if (maxCount === minCount) return (MIN_FONT + MAX_FONT) / 2;
    return MIN_FONT + ((count - minCount) / (maxCount - minCount)) * (MAX_FONT - MIN_FONT);
  };

  if (displayWords.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-sp-muted">
        <span className={`${isFullscreen ? 'text-8xl' : 'text-6xl'} opacity-20`}>☁️</span>
        <p className={`${isFullscreen ? 'text-xl' : 'text-lg'}`}>
          학생들이 단어를 제출하면 여기에 표시됩니다
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Question */}
      <div className="text-center mb-4">
        <h2 className={`text-sp-text font-bold ${isFullscreen ? 'text-2xl' : 'text-xl'}`}>{question}</h2>
        <p className="text-sp-muted text-sm mt-1">
          총 {totalSubmissions}개 제출 · {words.length}개 고유 단어
        </p>
      </div>

      {/* Word cloud */}
      <div className={`flex-1 flex flex-wrap items-center justify-center content-center gap-3 ${isFullscreen ? 'gap-4 p-8' : 'p-4'} min-h-[200px]`}>
        {displayWords.map((entry) => (
          <span
            key={entry.normalized}
            className="inline-block font-bold cursor-default select-none transition-all duration-500 ease-out"
            style={{
              fontSize: `${getFontSize(entry.count)}px`,
              color: entry.color,
              transform: `rotate(${entry.rotation}deg)`,
              lineHeight: 1.2,
              animation: 'wordCloudEnter 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
            title={`${entry.word}: ${entry.count}회`}
          >
            {entry.word}
          </span>
        ))}
      </div>

      {/* CSS animation */}
      <style>{`
        @keyframes wordCloudEnter {
          from { opacity: 0; transform: scale(0.3); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

/* ───────────────── Main Component ───────────────── */

export function ToolWordCloud({ onBack, isFullscreen }: ToolWordCloudProps) {
  const { track } = useAnalytics();
  useEffect(() => {
    track('tool_use', { tool: 'wordcloud' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [viewMode, setViewMode] = useState<ViewMode>('create');
  const [question, setQuestion] = useState('');
  const [words, setWords] = useState<WordEntry[]>([]);
  const [totalSubmissions, setTotalSubmissions] = useState(0);

  // Live mode state
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [liveServerInfo, setLiveServerInfo] = useState<{ port: number; localIPs: string[] } | null>(null);
  const [connectedStudents, setConnectedStudents] = useState(0);
  const [selectedIP, setSelectedIP] = useState('');
  const [showQRFullscreen, setShowQRFullscreen] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [tunnelLoading, setTunnelLoading] = useState(false);
  const [tunnelError, setTunnelError] = useState<string | null>(null);

  // Color index tracker
  const colorIndexRef = useRef(0);

  const handleStart = useCallback(async (q: string, maxSubs: number) => {
    setQuestion(q);
    setWords([]);
    setTotalSubmissions(0);
    colorIndexRef.current = 0;

    if (!window.electronAPI?.startLiveWordCloud) {
      setLiveError('워드클라우드 기능은 데스크톱 앱에서만 사용할 수 있습니다.');
      setViewMode('live');
      return;
    }

    try {
      const info = await window.electronAPI.startLiveWordCloud({ question: q, maxSubmissions: maxSubs });

      if (info.localIPs.length === 0) {
        setLiveError('Wi-Fi에 연결되어 있지 않습니다. 네트워크에 연결한 뒤 다시 시도하세요.');
        setViewMode('live');
        return;
      }

      setLiveServerInfo(info);
      setSelectedIP(info.localIPs[0]!);
      setIsLiveMode(true);
      setLiveError(null);
      setViewMode('live');
    } catch {
      setLiveError('서버를 시작할 수 없습니다.');
      setViewMode('live');
    }
  }, []);

  const handleStopLive = useCallback(() => {
    if (window.electronAPI?.stopLiveWordCloud) {
      void window.electronAPI.stopLiveWordCloud();
    }
    setIsLiveMode(false);
    setLiveServerInfo(null);
    setConnectedStudents(0);
    setShowQRFullscreen(false);
    setTunnelUrl(null);
    setTunnelLoading(false);
    setTunnelError(null);
  }, []);

  const handleReset = useCallback(() => {
    handleStopLive();
    setViewMode('create');
    setWords([]);
    setTotalSubmissions(0);
    setLiveError(null);
    colorIndexRef.current = 0;
  }, [handleStopLive]);

  const handleStartTunnel = useCallback(async () => {
    if (!window.electronAPI?.wordcloudTunnelStart) {
      setTunnelError('인터넷 공유 기능은 데스크톱 앱에서만 사용할 수 있습니다.');
      return;
    }
    try {
      setTunnelLoading(true);
      setTunnelError(null);

      // 바이너리가 없으면 설치 (첫 사용 시)
      const available = await window.electronAPI.wordcloudTunnelAvailable();
      if (!available) {
        await window.electronAPI.wordcloudTunnelInstall();
      }

      const result = await window.electronAPI.wordcloudTunnelStart();
      setTunnelUrl(result.tunnelUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTunnelError(`인터넷 연결 실패: ${msg}`);
    } finally {
      setTunnelLoading(false);
    }
  }, []);

  // IPC event listeners
  useEffect(() => {
    if (!isLiveMode || !window.electronAPI) return;

    const unsubWord = window.electronAPI.onLiveWordCloudWordSubmitted?.((data) => {
      setTotalSubmissions((prev) => prev + 1);
      setWords((prev) => {
        const norm = normalizeWord(data.word);
        const existing = prev.find((w) => w.normalized === norm);
        if (existing) {
          return prev
            .map((w) =>
              w.normalized === norm ? { ...w, count: data.count } : w,
            )
            .sort((a, b) => b.count - a.count);
        } else {
          const newEntry: WordEntry = {
            word: data.word,
            normalized: norm,
            count: data.count,
            color: WORD_COLORS[colorIndexRef.current % WORD_COLORS.length]!,
            rotation: Math.round((Math.random() - 0.5) * 24),
          };
          colorIndexRef.current += 1;
          return [...prev, newEntry].sort((a, b) => b.count - a.count);
        }
      });
    });

    const unsubCount = window.electronAPI.onLiveWordCloudConnectionCount?.((data) => {
      setConnectedStudents(data.count);
    });

    return () => {
      unsubWord?.();
      unsubCount?.();
    };
  }, [isLiveMode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (window.electronAPI?.stopLiveWordCloud) {
        void window.electronAPI.stopLiveWordCloud();
      }
    };
  }, []);

  // Keyboard shortcuts
  const shortcuts: KeyboardShortcut[] = [
    {
      key: 'r',
      label: 'R',
      description: '초기화',
      handler: handleReset,
    },
  ];

  return (
    <ToolLayout
      title="워드클라우드"
      emoji="☁️"
      onBack={() => {
        handleStopLive();
        onBack();
      }}
      isFullscreen={isFullscreen}
      shortcuts={shortcuts}
    >
      <div className="flex flex-col h-full">
        {viewMode === 'create' && (
          <CreateView isFullscreen={isFullscreen} onStart={handleStart} />
        )}

        {viewMode === 'live' && (
          <div className="flex flex-col h-full gap-4 p-4">
            {/* Error message */}
            {liveError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
                <p className="text-red-400">{liveError}</p>
                <button
                  onClick={handleReset}
                  className="mt-3 px-4 py-2 rounded-lg bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text text-sm transition-all"
                >
                  돌아가기
                </button>
              </div>
            )}

            {/* Live panel with QR */}
            {isLiveMode && liveServerInfo && (
              <LivePanel
                serverInfo={liveServerInfo}
                connectedStudents={connectedStudents}
                selectedIP={selectedIP}
                onSelectIP={setSelectedIP}
                onStop={handleStopLive}
                isFullscreen={isFullscreen}
                showQRFullscreen={showQRFullscreen}
                onToggleQRFullscreen={() => setShowQRFullscreen((v) => !v)}
                tunnelUrl={tunnelUrl}
                tunnelLoading={tunnelLoading}
                tunnelError={tunnelError}
                onStartTunnel={handleStartTunnel}
              />
            )}

            {/* Word cloud display */}
            <WordCloudDisplay
              words={words}
              question={question}
              isFullscreen={isFullscreen}
              totalSubmissions={totalSubmissions}
            />

            {/* Bottom controls */}
            {!liveError && (
              <div className="flex items-center justify-center gap-3 py-2">
                <button
                  onClick={handleReset}
                  className="px-4 py-2 rounded-lg bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text text-sm transition-all"
                >
                  새로 시작
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </ToolLayout>
  );
}
