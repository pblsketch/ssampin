import { useState, useCallback, useRef, useEffect } from 'react';
import { ToolLayout } from './ToolLayout';
import QRCode from 'qrcode';
import { useAnalytics } from '@adapters/hooks/useAnalytics';

interface ToolSurveyProps {
  onBack: () => void;
  isFullscreen: boolean;
}

type ViewMode = 'create' | 'surveying' | 'results';

interface SurveyResponse {
  id: string;
  text: string;
  submittedAt: number;
}

const MAX_LENGTH_OPTIONS = [50, 100, 200, 500] as const;

const EXAMPLE_QUESTIONS = [
  '이번 수업에서 가장 기억에 남는 내용은?',
  '이 주제에 대해 어떻게 생각하나요?',
  '오늘 수업에서 궁금한 점이 있나요?',
  '이번 활동에서 배운 점을 한 문장으로 정리해보세요.',
  '수업 개선을 위한 아이디어가 있나요?',
];

/* ───────────────── Create View ───────────────── */

interface CreateViewProps {
  isFullscreen: boolean;
  onStart: (question: string, maxLength: number) => void;
}

function CreateView({ isFullscreen, onStart }: CreateViewProps) {
  const [question, setQuestion] = useState('');
  const [maxLength, setMaxLength] = useState<number>(200);
  const [exampleIdx, setExampleIdx] = useState(-1);

  const canStart = question.trim().length > 0;

  const handleExampleClick = useCallback(() => {
    const nextIdx = (exampleIdx + 1) % EXAMPLE_QUESTIONS.length;
    setExampleIdx(nextIdx);
    setQuestion(EXAMPLE_QUESTIONS[nextIdx]!);
  }, [exampleIdx]);

  const handleStart = useCallback(() => {
    if (!canStart) return;
    onStart(question.trim(), maxLength);
  }, [canStart, question, maxLength, onStart]);

  return (
    <div className={`w-full max-w-2xl mx-auto flex flex-col ${isFullscreen ? 'h-full min-h-0 gap-4' : 'gap-6'}`}>
      {/* Question input */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="질문을 입력하세요"
            className="flex-1 bg-sp-card border border-sp-border rounded-xl px-4 py-3 text-xl text-sp-text placeholder-sp-muted focus:border-sp-accent focus:outline-none transition-colors"
            maxLength={100}
            onKeyDown={(e) => { if (e.key === 'Enter' && canStart) handleStart(); }}
          />
          <button
            onClick={handleExampleClick}
            className="shrink-0 px-3 py-3 rounded-xl bg-sp-card border border-sp-border text-sp-muted hover:text-yellow-400 hover:border-yellow-400/30 transition-all"
            title="예시 질문"
          >
            💡
          </button>
        </div>
      </div>

      {/* Max length selector */}
      <div className="flex flex-col gap-2">
        <span className="text-sm text-sp-muted font-medium">최대 글자 수</span>
        <div className="flex gap-2">
          {MAX_LENGTH_OPTIONS.map((len) => (
            <button
              key={len}
              onClick={() => setMaxLength(len)}
              className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
                maxLength === len
                  ? 'bg-sp-accent/20 border-sp-accent text-sp-accent'
                  : 'bg-sp-card border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent/50'
              }`}
            >
              {len}자
            </button>
          ))}
        </div>
      </div>

      {/* Start button */}
      <button
        onClick={handleStart}
        disabled={!canStart}
        className="w-full py-3.5 rounded-xl bg-sp-accent text-white font-bold text-lg hover:bg-sp-accent/80 transition-colors shadow-lg shadow-sp-accent/20 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
      >
        📝 설문 시작
      </button>
    </div>
  );
}

/* ───────────────── Live Survey Panel ───────────────── */

interface LiveSurveyPanelProps {
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

function LiveSurveyPanel({
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
}: LiveSurveyPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fullscreenCanvasRef = useRef<HTMLCanvasElement>(null);
  const displayUrl = tunnelUrl ?? `http://${selectedIP}:${serverInfo.port}`;

  // Generate QR code
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

  // Generate fullscreen QR
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

  // Fullscreen QR overlay
  if (showQRFullscreen) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white cursor-pointer"
        onClick={onToggleQRFullscreen}
      >
        <canvas ref={fullscreenCanvasRef} className="mb-6" />
        <p className="text-gray-800 text-xl font-bold mb-2">📝 설문 참여하기</p>
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
          학생 설문 종료
        </button>
      </div>

      <div className="flex items-center gap-4">
        {/* QR Code */}
        <div className="bg-white rounded-lg p-2">
          <canvas ref={canvasRef} />
        </div>

        {/* URL + IP selector + Tunnel */}
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

/* ───────────────── Response Card ───────────────── */

interface ResponseCardProps {
  response: SurveyResponse;
  index: number;
  isNew: boolean;
  isFullscreen: boolean;
}

function ResponseCard({ response, index, isNew, isFullscreen }: ResponseCardProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger entrance animation on next tick
    const timer = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={`bg-sp-card border border-sp-border rounded-xl p-4 transition-all duration-300 ${
        isNew && !visible ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
      } ${isFullscreen ? '' : ''}`}
    >
      <div className="flex items-start gap-3">
        <span className={`shrink-0 font-mono text-sp-muted font-bold ${isFullscreen ? 'text-base' : 'text-sm'}`}>
          #{index}
        </span>
        <p className={`text-sp-text flex-1 leading-relaxed ${isFullscreen ? 'text-lg' : 'text-base'}`}>
          {response.text}
        </p>
      </div>
    </div>
  );
}

/* ───────────────── Surveying View ───────────────── */

interface SurveyingViewProps {
  question: string;
  responses: SurveyResponse[];
  isFullscreen: boolean;
  isLiveMode: boolean;
  liveServerInfo: { port: number; localIPs: string[] } | null;
  connectedStudents: number;
  selectedIP: string;
  onSelectIP: (ip: string) => void;
  onStartLive: () => void;
  onStopLive: () => void;
  showQRFullscreen: boolean;
  onToggleQRFullscreen: () => void;
  liveError: string | null;
  onFinish: () => void;
  onReset: () => void;
  // Tunnel props
  tunnelUrl: string | null;
  tunnelLoading: boolean;
  tunnelError: string | null;
  onStartTunnel: () => void;
}

function SurveyingView({
  question,
  responses,
  isFullscreen,
  isLiveMode,
  liveServerInfo,
  connectedStudents,
  selectedIP,
  onSelectIP,
  onStartLive,
  onStopLive,
  showQRFullscreen,
  onToggleQRFullscreen,
  liveError,
  onFinish,
  onReset,
  tunnelUrl,
  tunnelLoading,
  tunnelError,
  onStartTunnel,
}: SurveyingViewProps) {
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const prevCountRef = useRef(0);

  // Track newly added responses for animation
  useEffect(() => {
    if (responses.length > prevCountRef.current) {
      const added = responses.slice(0, responses.length - prevCountRef.current);
      setNewIds(new Set(added.map((r) => r.id)));
      const timer = setTimeout(() => setNewIds(new Set()), 400);
      prevCountRef.current = responses.length;
      return () => clearTimeout(timer);
    }
    prevCountRef.current = responses.length;
  }, [responses]);

  const handleReset = useCallback(() => {
    if (responses.length > 0) {
      if (!window.confirm('모든 응답을 초기화하고 설문을 처음부터 시작하시겠습니까?')) return;
    }
    onReset();
  }, [responses.length, onReset]);

  return (
    <div className="w-full flex flex-col h-full min-h-0 gap-4">
      {/* Question */}
      <div className="text-center shrink-0">
        <h2 className={`font-bold text-sp-text ${isFullscreen ? 'text-4xl' : 'text-2xl'}`}>
          {question}
        </h2>
      </div>

      {/* Live survey panel */}
      {isLiveMode && liveServerInfo && (
        <LiveSurveyPanel
          serverInfo={liveServerInfo}
          connectedStudents={connectedStudents}
          selectedIP={selectedIP}
          onSelectIP={onSelectIP}
          onStop={onStopLive}
          isFullscreen={isFullscreen}
          showQRFullscreen={showQRFullscreen}
          onToggleQRFullscreen={onToggleQRFullscreen}
          tunnelUrl={tunnelUrl}
          tunnelLoading={tunnelLoading}
          tunnelError={tunnelError}
          onStartTunnel={onStartTunnel}
        />
      )}

      {/* Live error */}
      {liveError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm shrink-0">
          {liveError}
        </div>
      )}

      {/* Response feed */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3">
        {responses.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sp-muted text-center">
              아직 응답이 없습니다.<br />
              <span className="text-sm">학생들이 응답하면 여기에 표시됩니다.</span>
            </p>
          </div>
        ) : (
          responses.map((response, idx) => (
            <ResponseCard
              key={response.id}
              response={response}
              index={responses.length - idx}
              isNew={newIds.has(response.id)}
              isFullscreen={isFullscreen}
            />
          ))
        )}
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-between shrink-0 pb-1">
        <span className="text-sp-muted text-sm font-medium">
          📝 <span className="text-sp-text font-bold">{responses.length}개</span> 응답
        </span>

        <div className="flex items-center gap-2">
          {/* Student live survey toggle */}
          <button
            onClick={isLiveMode ? onStopLive : onStartLive}
            className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
              isLiveMode
                ? 'bg-green-500/20 border-green-500/30 text-green-400 hover:bg-green-500/30'
                : 'bg-sp-card border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-text/5'
            }`}
          >
            {isLiveMode ? `📱 학생 설문 중 (${connectedStudents}명)` : '📱 학생 설문'}
          </button>

          <button
            onClick={onFinish}
            className="px-4 py-2 rounded-xl bg-sp-accent text-white font-bold hover:bg-sp-accent/80 transition-all text-sm"
          >
            설문 종료
          </button>

          <button
            onClick={handleReset}
            className="px-4 py-2 rounded-xl bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-all text-sm font-medium"
          >
            🗑️ 초기화
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────── Results View ───────────────── */

interface ResultsViewProps {
  question: string;
  responses: SurveyResponse[];
  isFullscreen: boolean;
  onNewSurvey: () => void;
}

function ResultsView({ question, responses, isFullscreen, onNewSurvey }: ResultsViewProps) {
  return (
    <div className="w-full flex flex-col h-full min-h-0 gap-6">
      {/* Question */}
      <div className="text-center shrink-0">
        <h2 className={`font-bold text-sp-text ${isFullscreen ? 'text-4xl' : 'text-2xl'}`}>
          {question}
        </h2>
      </div>

      {/* All responses */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3">
        {responses.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sp-muted">응답이 없습니다.</p>
          </div>
        ) : (
          responses.map((response, idx) => (
            <div
              key={response.id}
              className="bg-sp-card border border-sp-border rounded-xl p-4"
            >
              <div className="flex items-start gap-3">
                <span className={`shrink-0 font-mono text-sp-muted font-bold ${isFullscreen ? 'text-base' : 'text-sm'}`}>
                  #{responses.length - idx}
                </span>
                <p className={`text-sp-text flex-1 leading-relaxed ${isFullscreen ? 'text-lg' : 'text-base'}`}>
                  {response.text}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Total */}
      <div className="text-center shrink-0">
        <span className="text-sp-muted">
          총 <span className="text-sp-text font-bold text-lg">{responses.length}개</span> 응답
        </span>
      </div>

      {/* Bottom buttons */}
      <div className="flex items-center justify-center gap-3 shrink-0 pb-1">
        <button
          onClick={onNewSurvey}
          className="px-5 py-2.5 rounded-xl bg-sp-accent text-white font-bold hover:bg-sp-accent/80 transition-all text-sm"
        >
          🆕 새 설문
        </button>
      </div>
    </div>
  );
}

/* ──────────────── Main Component ──────────────── */

export function ToolSurvey({ onBack, isFullscreen }: ToolSurveyProps) {
  const { track } = useAnalytics();
  useEffect(() => {
    track('tool_use', { tool: 'survey' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [viewMode, setViewMode] = useState<ViewMode>('create');
  const [question, setQuestion] = useState('');
  const [maxLength, setMaxLength] = useState(200);
  const [responses, setResponses] = useState<SurveyResponse[]>([]);

  // Live mode state
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [liveServerInfo, setLiveServerInfo] = useState<{ port: number; localIPs: string[] } | null>(null);
  const [connectedStudents, setConnectedStudents] = useState(0);
  const [selectedIP, setSelectedIP] = useState('');
  const [showQRFullscreen, setShowQRFullscreen] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  // Tunnel state
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [tunnelLoading, setTunnelLoading] = useState(false);
  const [tunnelError, setTunnelError] = useState<string | null>(null);

  const handleStart = useCallback((q: string, ml: number) => {
    setQuestion(q);
    setMaxLength(ml);
    setResponses([]);
    setViewMode('surveying');
  }, []);

  const handleStartLive = useCallback(async () => {
    if (!window.electronAPI?.startLiveSurvey) {
      setLiveError('학생 설문 기능은 데스크톱 앱에서만 사용할 수 있습니다.');
      return;
    }
    try {
      setLiveError(null);
      const info = await window.electronAPI.startLiveSurvey({ question, maxLength });
      if (info.localIPs.length === 0) {
        setLiveError('Wi-Fi에 연결되어 있지 않습니다. 학생들과 같은 네트워크에 연결해주세요.');
        return;
      }
      setLiveServerInfo(info);
      setSelectedIP(info.localIPs[0]!);
      setIsLiveMode(true);
      setConnectedStudents(0);
    } catch {
      setLiveError('학생 설문 서버를 시작할 수 없습니다.');
    }
  }, [question, maxLength]);

  const handleStopLive = useCallback(async () => {
    if (window.electronAPI?.stopLiveSurvey) {
      await window.electronAPI.stopLiveSurvey();
    }
    setIsLiveMode(false);
    setLiveServerInfo(null);
    setConnectedStudents(0);
    setShowQRFullscreen(false);
    setLiveError(null);
    setTunnelUrl(null);
    setTunnelLoading(false);
    setTunnelError(null);
  }, []);

  const handleStartTunnel = useCallback(async () => {
    if (!window.electronAPI?.surveyTunnelStart) {
      setTunnelError('인터넷 공유 기능은 데스크톱 앱에서만 사용할 수 있습니다.');
      return;
    }
    try {
      setTunnelLoading(true);
      setTunnelError(null);

      // 바이너리가 없으면 설치 (첫 사용 시)
      const available = await window.electronAPI.surveyTunnelAvailable();
      if (!available) {
        await window.electronAPI.surveyTunnelInstall();
      }

      const result = await window.electronAPI.surveyTunnelStart();
      setTunnelUrl(result.tunnelUrl);
    } catch {
      setTunnelError('인터넷 연결에 실패했습니다. 네트워크를 확인해주세요.');
    } finally {
      setTunnelLoading(false);
    }
  }, []);

  const handleFinish = useCallback(() => {
    if (isLiveMode) {
      handleStopLive();
    }
    setViewMode('results');
  }, [isLiveMode, handleStopLive]);

  const handleReset = useCallback(() => {
    if (isLiveMode) {
      handleStopLive();
    }
    setViewMode('create');
    setQuestion('');
    setMaxLength(200);
    setResponses([]);
  }, [isLiveMode, handleStopLive]);

  const handleToggleQRFullscreen = useCallback(() => {
    setShowQRFullscreen((prev) => !prev);
  }, []);

  const handleSelectIP = useCallback((ip: string) => {
    setSelectedIP(ip);
  }, []);

  // Live survey IPC event listeners
  useEffect(() => {
    if (!isLiveMode || !window.electronAPI) return;

    const unsubSubmitted = window.electronAPI.onLiveSurveyStudentSubmitted?.((data) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setResponses((prev) => [
        { id, text: data.text, submittedAt: Date.now() },
        ...prev,
      ]);
    });

    const unsubCount = window.electronAPI.onLiveSurveyConnectionCount?.((data) => {
      setConnectedStudents(data.count);
    });

    return () => {
      unsubSubmitted?.();
      unsubCount?.();
    };
  }, [isLiveMode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (window.electronAPI?.stopLiveSurvey) {
        window.electronAPI.stopLiveSurvey();
      }
    };
  }, []);

  return (
    <ToolLayout title="주관식 설문" emoji="📝" onBack={onBack} isFullscreen={isFullscreen}>
      {viewMode === 'create' && (
        <CreateView isFullscreen={isFullscreen} onStart={handleStart} />
      )}
      {viewMode === 'surveying' && (
        <SurveyingView
          question={question}
          responses={responses}
          isFullscreen={isFullscreen}
          isLiveMode={isLiveMode}
          liveServerInfo={liveServerInfo}
          connectedStudents={connectedStudents}
          selectedIP={selectedIP}
          onSelectIP={handleSelectIP}
          onStartLive={handleStartLive}
          onStopLive={handleStopLive}
          showQRFullscreen={showQRFullscreen}
          onToggleQRFullscreen={handleToggleQRFullscreen}
          liveError={liveError}
          onFinish={handleFinish}
          onReset={handleReset}
          tunnelUrl={tunnelUrl}
          tunnelLoading={tunnelLoading}
          tunnelError={tunnelError}
          onStartTunnel={handleStartTunnel}
        />
      )}
      {viewMode === 'results' && (
        <ResultsView
          question={question}
          responses={responses}
          isFullscreen={isFullscreen}
          onNewSurvey={handleReset}
        />
      )}
    </ToolLayout>
  );
}
