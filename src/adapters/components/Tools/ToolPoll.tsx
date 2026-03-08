import { useState, useCallback, useRef, useEffect } from 'react';
import { ToolLayout } from './ToolLayout';
import type { PollOption } from '@domain/entities/Poll';
import QRCode from 'qrcode';
import { useAnalytics } from '@adapters/hooks/useAnalytics';

interface ToolPollProps {
  onBack: () => void;
  isFullscreen: boolean;
}

type ViewMode = 'create' | 'voting' | 'results';

const OPTION_COLORS = [
  '#3b82f6', // 파랑
  '#ef4444', // 빨강
  '#22c55e', // 초록
  '#f97316', // 주황
  '#a855f7', // 보라
  '#06b6d4', // 하늘
];

const EXAMPLE_QUESTIONS = [
  '오늘 수업 이해도는?',
  '이 방법에 동의하나요?',
  '어떤 주제를 더 배우고 싶나요?',
  '오늘 수업 재미있었나요?',
  '모둠 활동 참여도는?',
];

interface Preset {
  emoji: string;
  label: string;
  options: string[];
}

const PRESETS: Preset[] = [
  { emoji: '👍', label: '찬성/반대', options: ['찬성', '반대'] },
  { emoji: '😀', label: '만족도', options: ['매우 만족', '만족', '보통', '불만족'] },
  { emoji: '📊', label: '이해도', options: ['완벽히 이해', '대체로 이해', '조금 어려움', '모르겠음'] },
  { emoji: '🔢', label: '1~5점', options: ['1점', '2점', '3점', '4점', '5점'] },
];

function makeOption(index: number, text: string): PollOption {
  return {
    id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
    text,
    votes: 0,
    color: OPTION_COLORS[index % OPTION_COLORS.length]!,
  };
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* ───────────────── Create View ───────────────── */

interface CreateViewProps {
  isFullscreen: boolean;
  onStart: (question: string, options: PollOption[]) => void;
}

function CreateView({ isFullscreen, onStart }: CreateViewProps) {
  const [question, setQuestion] = useState('');
  const [optionTexts, setOptionTexts] = useState<string[]>(['', '']);
  const [exampleIdx, setExampleIdx] = useState(-1);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const canStart = question.trim().length > 0 && optionTexts.filter((t) => t.trim().length > 0).length >= 2;

  const handleOptionChange = useCallback((index: number, value: string) => {
    setOptionTexts((prev) => prev.map((t, i) => (i === index ? value : t)));
  }, []);

  const handleAddOption = useCallback(() => {
    if (optionTexts.length >= 6) return;
    setOptionTexts((prev) => [...prev, '']);
    // Focus new input after render
    setTimeout(() => {
      inputRefs.current[optionTexts.length]?.focus();
    }, 50);
  }, [optionTexts.length]);

  const handleRemoveOption = useCallback((index: number) => {
    if (optionTexts.length <= 2) return;
    setOptionTexts((prev) => prev.filter((_, i) => i !== index));
  }, [optionTexts.length]);

  const handleOptionKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (index < optionTexts.length - 1) {
        inputRefs.current[index + 1]?.focus();
      } else if (optionTexts.length < 6) {
        handleAddOption();
      }
    }
  }, [optionTexts.length, handleAddOption]);

  const handlePreset = useCallback((preset: Preset) => {
    setOptionTexts(preset.options);
  }, []);

  const handleExampleClick = useCallback(() => {
    const nextIdx = (exampleIdx + 1) % EXAMPLE_QUESTIONS.length;
    setExampleIdx(nextIdx);
    setQuestion(EXAMPLE_QUESTIONS[nextIdx]!);
  }, [exampleIdx]);

  const handleStart = useCallback(() => {
    if (!canStart) return;
    const validOptions = optionTexts
      .map((text, i) => ({ text: text.trim(), i }))
      .filter((o) => o.text.length > 0);
    const pollOptions = validOptions.map((o, idx) => makeOption(idx, o.text));
    onStart(question.trim(), pollOptions);
  }, [canStart, question, optionTexts, onStart]);

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
            className="flex-1 bg-sp-card border border-sp-border rounded-xl px-4 py-3 text-xl text-white placeholder-sp-muted focus:border-sp-accent focus:outline-none transition-colors"
            maxLength={100}
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

      {/* Option inputs */}
      <div className="flex flex-col gap-2">
        <span className="text-sm text-sp-muted font-medium">선택지</span>
        <div className="flex flex-col gap-2">
          {optionTexts.map((text, index) => (
            <div key={index} className="flex items-center gap-2">
              {/* Color dot */}
              <div
                className="w-5 h-5 rounded-full shrink-0"
                style={{ backgroundColor: OPTION_COLORS[index % OPTION_COLORS.length] }}
              />
              <input
                ref={(el) => { inputRefs.current[index] = el; }}
                type="text"
                value={text}
                onChange={(e) => handleOptionChange(index, e.target.value)}
                onKeyDown={(e) => handleOptionKeyDown(e, index)}
                placeholder={`선택지 ${index + 1}`}
                className="flex-1 bg-sp-card border border-sp-border rounded-lg px-3 py-2 text-white placeholder-sp-muted focus:border-sp-accent focus:outline-none transition-colors"
                maxLength={50}
              />
              <button
                onClick={() => handleRemoveOption(index)}
                disabled={optionTexts.length <= 2}
                className="shrink-0 w-8 h-8 rounded-lg text-sp-muted hover:text-red-400 hover:bg-red-500/10 transition-all flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        {optionTexts.length < 6 && (
          <button
            onClick={handleAddOption}
            className="self-start px-4 py-2 rounded-lg border border-dashed border-sp-border text-sp-muted hover:text-white hover:border-sp-accent transition-all text-sm"
          >
            + 선택지 추가
          </button>
        )}
      </div>

      {/* Presets */}
      <div className="flex flex-col gap-2">
        <span className="text-sm text-sp-muted font-medium">빠른 생성</span>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => handlePreset(preset)}
              className="px-4 py-2 rounded-xl bg-sp-card border border-sp-border text-sm text-sp-muted hover:text-white hover:border-sp-accent/50 transition-all"
            >
              {preset.emoji} {preset.label}
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
        📊 투표 시작!
      </button>
    </div>
  );
}

/* ───────────────── Live Vote Panel ───────────────── */

interface LiveVotePanelProps {
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

function LiveVotePanel({
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
}: LiveVotePanelProps) {
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
        <p className="text-gray-800 text-xl font-bold mb-2">📊 투표 참여하기</p>
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
          접속 학생: <span className="text-white font-bold">{connectedStudents}명</span>
        </span>
        <div className="flex-1" />
        <button
          onClick={onToggleQRFullscreen}
          className="px-3 py-1.5 rounded-lg bg-sp-bg border border-sp-border text-sp-muted hover:text-white text-xs transition-all"
          title="QR 코드 크게 보기"
        >
          🔍 크게
        </button>
        <button
          onClick={onStop}
          className="px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 text-xs font-medium transition-all"
        >
          학생 투표 종료
        </button>
      </div>

      <div className="flex items-center gap-4">
        {/* QR Code */}
        <div className="bg-white rounded-lg p-2">
          <canvas ref={canvasRef} />
        </div>

        {/* URL + IP selector + Tunnel */}
        <div className="flex flex-col gap-2">
          <p className="text-white font-mono text-sm break-all">{displayUrl}</p>
          {!tunnelUrl && serverInfo.localIPs.length > 1 && (
            <select
              value={selectedIP}
              onChange={(e) => onSelectIP(e.target.value)}
              className="bg-sp-bg border border-sp-border rounded-lg px-2 py-1.5 text-xs text-white focus:border-sp-accent focus:outline-none"
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

/* ───────────────── Voting View ───────────────── */

interface VotingViewProps {
  question: string;
  options: PollOption[];
  isOpen: boolean;
  showResults: boolean;
  isFullscreen: boolean;
  onVote: (optionId: string, delta: number) => void;
  onToggleResults: () => void;
  onClose: () => void;
  onReset: () => void;
  onShowFinalResults: () => void;
  onDirectInput: (optionId: string) => void;
  // Live vote props
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
  // Tunnel props
  tunnelUrl: string | null;
  tunnelLoading: boolean;
  tunnelError: string | null;
  onStartTunnel: () => void;
}

function VotingView({
  question,
  options,
  isOpen,
  showResults,
  isFullscreen,
  onVote,
  onToggleResults,
  onClose,
  onReset,
  onShowFinalResults,
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
  tunnelUrl,
  tunnelLoading,
  tunnelError,
  onStartTunnel,
}: VotingViewProps) {
  const totalVotes = options.reduce((sum, o) => sum + o.votes, 0);
  const maxVotes = Math.max(...options.map((o) => o.votes), 1);
  const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set());
  const animTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const longPressTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [directInputId, setDirectInputId] = useState<string | null>(null);
  const [directInputValue, setDirectInputValue] = useState('');
  const directInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timers = animTimers.current;
    const lpTimers = longPressTimers.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      lpTimers.forEach((t) => clearTimeout(t));
    };
  }, []);

  useEffect(() => {
    if (directInputId && directInputRef.current) {
      directInputRef.current.focus();
      directInputRef.current.select();
    }
  }, [directInputId]);

  const handleVoteClick = useCallback((optionId: string) => {
    if (!isOpen) return;
    onVote(optionId, 1);

    setAnimatingIds((prev) => {
      const next = new Set(prev);
      next.add(optionId);
      return next;
    });
    const existing = animTimers.current.get(optionId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      setAnimatingIds((prev) => {
        const next = new Set(prev);
        next.delete(optionId);
        return next;
      });
      animTimers.current.delete(optionId);
    }, 300);
    animTimers.current.set(optionId, timer);
  }, [isOpen, onVote]);

  const handlePointerDown = useCallback((optionId: string) => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      const opt = options.find((o) => o.id === optionId);
      setDirectInputValue(opt ? String(opt.votes) : '0');
      setDirectInputId(optionId);
      longPressTimers.current.delete(optionId);
    }, 500);
    longPressTimers.current.set(optionId, timer);
  }, [isOpen, options]);

  const handlePointerUp = useCallback((optionId: string) => {
    const timer = longPressTimers.current.get(optionId);
    if (timer) {
      clearTimeout(timer);
      longPressTimers.current.delete(optionId);
    }
  }, []);

  const handleDirectInputConfirm = useCallback(() => {
    if (directInputId === null) return;
    const val = parseInt(directInputValue, 10);
    if (!isNaN(val) && val >= 0) {
      const opt = options.find((o) => o.id === directInputId);
      if (opt) {
        onVote(directInputId, val - opt.votes);
      }
    }
    setDirectInputId(null);
    setDirectInputValue('');
  }, [directInputId, directInputValue, options, onVote]);

  return (
    <div className="w-full flex flex-col h-full min-h-0 gap-4">
      {/* Question */}
      <div className="text-center shrink-0">
        <h2 className={`font-bold text-white ${isFullscreen ? 'text-4xl' : 'text-2xl'}`}>
          {question}
        </h2>
      </div>

      {/* Live vote panel */}
      {isLiveMode && liveServerInfo && (
        <LiveVotePanel
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

      {/* Live vote error */}
      {liveError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm shrink-0">
          {liveError}
        </div>
      )}

      {/* Option cards */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3">
        {options.map((option) => {
          const percent = totalVotes > 0 ? (option.votes / totalVotes) * 100 : 0;
          const barWidth = totalVotes > 0 ? (option.votes / maxVotes) * 100 : 0;
          const isAnimating = animatingIds.has(option.id);

          return (
            <div
              key={option.id}
              className={`relative bg-sp-card border border-sp-border rounded-xl overflow-hidden transition-all ${
                isOpen ? 'cursor-pointer hover:border-white/20 active:scale-[0.99]' : ''
              } ${isFullscreen ? 'py-5 px-6' : 'py-4 px-5'}`}
              onClick={() => handleVoteClick(option.id)}
              onPointerDown={() => handlePointerDown(option.id)}
              onPointerUp={() => handlePointerUp(option.id)}
              onPointerLeave={() => handlePointerUp(option.id)}
            >
              {/* Background bar (only when results visible) */}
              {showResults && (
                <div
                  className="absolute inset-y-0 left-0 transition-all duration-500 ease-out"
                  style={{
                    width: `${barWidth}%`,
                    backgroundColor: hexToRgba(option.color, 0.15),
                  }}
                />
              )}

              <div className="relative flex items-center gap-3">
                {/* Color dot + text */}
                <div
                  className="w-4 h-4 rounded-full shrink-0"
                  style={{ backgroundColor: option.color }}
                />
                <span className={`font-medium text-white flex-1 ${isFullscreen ? 'text-2xl' : 'text-xl'}`}>
                  {option.text}
                </span>

                {/* +1 button */}
                {isOpen && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleVoteClick(option.id);
                    }}
                    className={`shrink-0 rounded-lg font-bold transition-all active:scale-95 ${
                      isFullscreen ? 'px-5 py-2 text-lg' : 'px-4 py-1.5 text-sm'
                    }`}
                    style={{
                      backgroundColor: hexToRgba(option.color, 0.2),
                      color: option.color,
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = hexToRgba(option.color, 0.35);
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = hexToRgba(option.color, 0.2);
                    }}
                  >
                    +1
                  </button>
                )}

                {/* Vote count badge */}
                <span
                  className={`shrink-0 font-bold font-mono transition-transform duration-300 ${
                    isAnimating ? 'scale-125' : 'scale-100'
                  } ${isFullscreen ? 'text-2xl min-w-[3rem] text-right' : 'text-lg min-w-[2.5rem] text-right'}`}
                  style={{ color: option.color }}
                >
                  {option.votes}
                </span>

                {/* Percent (when results visible) */}
                {showResults && totalVotes > 0 && (
                  <span className="shrink-0 text-sp-muted text-sm min-w-[3rem] text-right">
                    {percent.toFixed(0)}%
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Direct input modal */}
      {directInputId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setDirectInputId(null)}>
          <div className="bg-sp-card border border-sp-border rounded-2xl p-6 w-72 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-bold text-lg text-center">몇 명?</h3>
            <input
              ref={directInputRef}
              type="number"
              value={directInputValue}
              onChange={(e) => setDirectInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleDirectInputConfirm();
                if (e.key === 'Escape') setDirectInputId(null);
              }}
              min={0}
              className="bg-sp-bg border border-sp-border rounded-xl px-4 py-3 text-2xl text-white text-center font-mono focus:border-sp-accent focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setDirectInputId(null)}
                className="flex-1 py-2.5 rounded-xl bg-sp-bg border border-sp-border text-sp-muted hover:text-white transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleDirectInputConfirm}
                className="flex-1 py-2.5 rounded-xl bg-sp-accent text-white font-bold hover:bg-sp-accent/80 transition-colors"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <div className="flex items-center justify-between shrink-0 pb-1">
        <span className="text-sp-muted text-sm font-medium">
          총 <span className="text-white font-bold">{totalVotes}표</span>
        </span>
        {/* Student live vote toggle */}
        <button
          onClick={isLiveMode ? onStopLive : onStartLive}
          className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
            isLiveMode
              ? 'bg-green-500/20 border-green-500/30 text-green-400 hover:bg-green-500/30'
              : 'bg-sp-card border-sp-border text-sp-muted hover:text-white hover:bg-white/5'
          }`}
        >
          {isLiveMode ? `📱 학생 투표 중 (${connectedStudents}명)` : '📱 학생 투표'}
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleResults}
            className="px-4 py-2 rounded-xl bg-sp-card border border-sp-border text-sp-muted hover:text-white hover:bg-white/5 transition-all text-sm font-medium"
          >
            {showResults ? '👁️ 결과 숨기기' : '👁️ 결과 보기'}
          </button>
          {isOpen ? (
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-sp-card border border-sp-border text-sp-muted hover:text-white hover:bg-white/5 transition-all text-sm font-medium"
            >
              🔒 투표 종료
            </button>
          ) : (
            <button
              onClick={onShowFinalResults}
              className="px-4 py-2 rounded-xl bg-sp-accent text-white font-bold hover:bg-sp-accent/80 transition-all text-sm"
            >
              📊 결과 보기
            </button>
          )}
          <button
            onClick={onReset}
            className="px-4 py-2 rounded-xl bg-sp-card border border-sp-border text-sp-muted hover:text-white hover:bg-white/5 transition-all text-sm font-medium"
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
  options: PollOption[];
  isFullscreen: boolean;
  onRevote: () => void;
  onNewPoll: () => void;
}

function ResultsView({ question, options, isFullscreen, onRevote, onNewPoll }: ResultsViewProps) {
  const totalVotes = options.reduce((sum, o) => sum + o.votes, 0);
  const maxVotes = Math.max(...options.map((o) => o.votes), 1);
  const [animated, setAnimated] = useState(false);

  // Find winner(s)
  const winnerVotes = Math.max(...options.map((o) => o.votes));

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="w-full flex flex-col h-full min-h-0 gap-6">
      {/* Question */}
      <div className="text-center shrink-0">
        <h2 className={`font-bold text-white ${isFullscreen ? 'text-4xl' : 'text-2xl'}`}>
          {question}
        </h2>
      </div>

      {/* Bar chart */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 justify-center">
        {options.map((option, index) => {
          const percent = totalVotes > 0 ? (option.votes / totalVotes) * 100 : 0;
          const barWidth = totalVotes > 0 ? (option.votes / maxVotes) * 100 : 0;
          const isWinner = option.votes === winnerVotes && totalVotes > 0;

          return (
            <div
              key={option.id}
              className="flex flex-col gap-1"
              style={{
                animationDelay: `${index * 100}ms`,
              }}
            >
              {/* Label */}
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: option.color }}
                />
                <span className={`font-medium text-white ${isFullscreen ? 'text-xl' : 'text-base'}`}>
                  {option.text}
                </span>
                {isWinner && <span className="text-yellow-400">👑</span>}
              </div>

              {/* Bar */}
              <div className="flex items-center gap-3">
                <div className={`flex-1 rounded-lg overflow-hidden ${isWinner ? 'h-10' : 'h-8'} bg-sp-bg`}>
                  <div
                    className="h-full rounded-lg flex items-center px-3 transition-all duration-[800ms] ease-out"
                    style={{
                      width: animated ? `${Math.max(barWidth, 2)}%` : '0%',
                      backgroundColor: hexToRgba(option.color, isWinner ? 0.5 : 0.35),
                      borderWidth: isWinner ? '2px' : '0',
                      borderColor: option.color,
                      transitionDelay: `${index * 100}ms`,
                    }}
                  >
                    {barWidth > 15 && (
                      <span className="text-sm font-medium text-white whitespace-nowrap">
                        {option.votes}표 ({percent.toFixed(0)}%)
                      </span>
                    )}
                  </div>
                </div>
                {barWidth <= 15 && (
                  <span className="text-sm text-sp-muted shrink-0 min-w-[5rem]">
                    {option.votes}표 ({percent.toFixed(0)}%)
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Total */}
      <div className="text-center shrink-0">
        <span className="text-sp-muted">
          총 <span className="text-white font-bold text-lg">{totalVotes}표</span>
        </span>
      </div>

      {/* Bottom buttons */}
      <div className="flex items-center justify-center gap-3 shrink-0 pb-1">
        <button
          onClick={onRevote}
          className="px-5 py-2.5 rounded-xl bg-sp-card border border-sp-border text-sp-muted hover:text-white hover:bg-white/5 transition-all text-sm font-medium"
        >
          📊 다시 투표
        </button>
        <button
          onClick={onNewPoll}
          className="px-5 py-2.5 rounded-xl bg-sp-accent text-white font-bold hover:bg-sp-accent/80 transition-all text-sm"
        >
          🆕 새 투표
        </button>
      </div>
    </div>
  );
}

/* ──────────────── Main Component ──────────────── */

export function ToolPoll({ onBack, isFullscreen }: ToolPollProps) {
  const { track } = useAnalytics();
  useEffect(() => {
    track('tool_use', { tool: 'vote' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [viewMode, setViewMode] = useState<ViewMode>('create');
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<PollOption[]>([]);
  const [isOpen, setIsOpen] = useState(true);
  const [showResults, setShowResults] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [liveServerInfo, setLiveServerInfo] = useState<{ port: number; localIPs: string[] } | null>(null);
  const [connectedStudents, setConnectedStudents] = useState(0);
  const [selectedIP, setSelectedIP] = useState('');
  const [showQRFullscreen, setShowQRFullscreen] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [tunnelLoading, setTunnelLoading] = useState(false);
  const [tunnelError, setTunnelError] = useState<string | null>(null);

  const handleStart = useCallback((q: string, opts: PollOption[]) => {
    setQuestion(q);
    setOptions(opts);
    setIsOpen(true);
    setShowResults(false);
    setViewMode('voting');
  }, []);

  const handleVote = useCallback((optionId: string, delta: number) => {
    setOptions((prev) =>
      prev.map((o) => {
        if (o.id !== optionId) return o;
        const newVotes = Math.max(0, o.votes + delta);
        return { ...o, votes: newVotes };
      })
    );
  }, []);

  const handleToggleResults = useCallback(() => {
    setShowResults((prev) => !prev);
  }, []);

  const handleShowFinalResults = useCallback(() => {
    setViewMode('results');
  }, []);

  const handleRevote = useCallback(() => {
    setOptions((prev) => prev.map((o) => ({ ...o, votes: 0 })));
    setIsOpen(true);
    setShowResults(false);
    setViewMode('voting');
  }, []);

  const handleDirectInput = useCallback((optionId: string) => {
    // Handled inside VotingView via long-press
    void optionId;
  }, []);

  const handleStartLive = useCallback(async () => {
    if (!window.electronAPI?.startLiveVote) {
      setLiveError('학생 투표 기능은 데스크톱 앱에서만 사용할 수 있습니다.');
      return;
    }
    try {
      setLiveError(null);
      const data = options.map((o) => ({ id: o.id, text: o.text, color: o.color }));
      const info = await window.electronAPI.startLiveVote({ question, options: data });
      if (info.localIPs.length === 0) {
        setLiveError('Wi-Fi에 연결되어 있지 않습니다. 학생들과 같은 네트워크에 연결해주세요.');
        return;
      }
      setLiveServerInfo(info);
      setSelectedIP(info.localIPs[0]!);
      setIsLiveMode(true);
      setConnectedStudents(0);
    } catch {
      setLiveError('학생 투표 서버를 시작할 수 없습니다.');
    }
  }, [question, options]);

  const handleStopLive = useCallback(async () => {
    if (window.electronAPI?.stopLiveVote) {
      await window.electronAPI.stopLiveVote();
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
    if (!window.electronAPI?.tunnelStart) {
      setTunnelError('인터넷 공유 기능은 데스크톱 앱에서만 사용할 수 있습니다.');
      return;
    }
    try {
      setTunnelLoading(true);
      setTunnelError(null);

      // 바이너리가 없으면 설치 (첫 사용 시)
      const available = await window.electronAPI.tunnelAvailable();
      if (!available) {
        await window.electronAPI.tunnelInstall();
      }

      const result = await window.electronAPI.tunnelStart();
      setTunnelUrl(result.tunnelUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTunnelError(`인터넷 연결 실패: ${msg}`);
    } finally {
      setTunnelLoading(false);
    }
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    if (isLiveMode) {
      handleStopLive();
    }
  }, [isLiveMode, handleStopLive]);

  const handleReset = useCallback(() => {
    if (isLiveMode) {
      handleStopLive();
    }
    setViewMode('create');
    setQuestion('');
    setOptions([]);
    setIsOpen(true);
    setShowResults(false);
  }, [isLiveMode, handleStopLive]);

  const handleToggleQRFullscreen = useCallback(() => {
    setShowQRFullscreen((prev) => !prev);
  }, []);

  const handleSelectIP = useCallback((ip: string) => {
    setSelectedIP(ip);
  }, []);

  // Live vote IPC event listeners
  useEffect(() => {
    if (!isLiveMode || !window.electronAPI) return;

    const unsubVoted = window.electronAPI.onLiveVoteStudentVoted?.((data) => {
      handleVote(data.optionId, 1);
    });

    const unsubCount = window.electronAPI.onLiveVoteConnectionCount?.((data) => {
      setConnectedStudents(data.count);
    });

    return () => {
      unsubVoted?.();
      unsubCount?.();
    };
  }, [isLiveMode, handleVote]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (window.electronAPI?.stopLiveVote) {
        window.electronAPI.stopLiveVote();
      }
    };
  }, []);

  return (
    <ToolLayout title="투표" emoji="📊" onBack={onBack} isFullscreen={isFullscreen}>
      {viewMode === 'create' && (
        <CreateView isFullscreen={isFullscreen} onStart={handleStart} />
      )}
      {viewMode === 'voting' && (
        <VotingView
          question={question}
          options={options}
          isOpen={isOpen}
          showResults={showResults}
          isFullscreen={isFullscreen}
          onVote={handleVote}
          onToggleResults={handleToggleResults}
          onClose={handleClose}
          onReset={handleReset}
          onShowFinalResults={handleShowFinalResults}
          onDirectInput={handleDirectInput}
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
          tunnelUrl={tunnelUrl}
          tunnelLoading={tunnelLoading}
          tunnelError={tunnelError}
          onStartTunnel={handleStartTunnel}
        />
      )}
      {viewMode === 'results' && (
        <ResultsView
          question={question}
          options={options}
          isFullscreen={isFullscreen}
          onRevote={handleRevote}
          onNewPoll={handleReset}
        />
      )}
    </ToolLayout>
  );
}
