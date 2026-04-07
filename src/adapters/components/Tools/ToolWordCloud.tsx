import { useState, useCallback, useMemo, useRef, useEffect, Fragment } from 'react';
import { ToolLayout } from './ToolLayout';
import { PresetSelector } from './PresetSelector';
import type { KeyboardShortcut } from './types';
import QRCode from 'qrcode';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import type { WordCloudSession, WordCloudGroup } from '@domain/entities/WordCloudSession';
import { useWordCloudHistoryStore } from '@adapters/stores/useWordCloudHistoryStore';
import { OrganizeView } from './WordCloud/OrganizeView';
import { LiveSessionClient } from '@infrastructure/supabase/LiveSessionClient';

interface ToolWordCloudProps {
  onBack: () => void;
  isFullscreen: boolean;
}

type ViewMode = 'create' | 'live' | 'organize' | 'history';

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
  onShowHistory: () => void;
}

function CreateView({ isFullscreen, onStart, onShowHistory }: CreateViewProps) {
  const [question, setQuestion] = useState('');
  const [maxSubmissions, setMaxSubmissions] = useState(5);
  const [savedQuestions, setSavedQuestions] = useState<readonly string[]>(EXAMPLE_QUESTIONS);

  const handleLoadPreset = useCallback((items: readonly string[]) => {
    setSavedQuestions(items);
  }, []);

  const currentItems = useMemo(() => {
    const items = [...savedQuestions];
    const q = question.trim();
    if (q && !items.includes(q)) {
      items.push(q);
    }
    return items;
  }, [savedQuestions, question]);

  const handleStart = () => {
    const q = question.trim();
    if (!q) return;
    onStart(q, maxSubmissions);
  };

  return (
    <div className={`w-full max-w-2xl mx-auto flex flex-col gap-6 ${isFullscreen ? 'px-12 py-6' : 'px-6 py-4'}`}>
      <div className="w-full">
        <label className="block text-sp-muted text-sm mb-2">질문</label>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleStart(); }}
          placeholder="학생들에게 물어볼 질문을 입력하세요"
          className="w-full px-4 py-3 rounded-xl bg-sp-bg border border-sp-border text-sp-text text-xl placeholder-sp-muted focus:border-sp-accent focus:outline-none transition-colors"
          autoFocus
        />
      </div>

      {/* 프리셋 저장/불러오기 + 자주 쓰는 질문 */}
      <div className="w-full">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sp-muted text-sm">자주 쓰는 질문</span>
          <PresetSelector
            type="wordcloud"
            currentItems={currentItems}
            onLoad={handleLoadPreset}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {savedQuestions.map((eq) => (
            <button
              key={eq}
              onClick={() => setQuestion(eq)}
              className="px-3 py-1.5 rounded-lg bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent/50 text-sm transition-all"
            >
              {eq}
            </button>
          ))}
        </div>
      </div>

      {/* Settings */}
      <div className="flex items-center gap-4">
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

      {/* History — secondary link */}
      <div className="flex justify-center">
        <button
          onClick={onShowHistory}
          className="flex items-center gap-1.5 text-sp-muted hover:text-sp-text text-sm transition-colors"
        >
          <span className="material-symbols-outlined text-icon-md">history</span>
          세션 기록
        </button>
      </div>

      {/* Start button — full width primary */}
      <button
        onClick={handleStart}
        disabled={!question.trim()}
        className="w-full py-3.5 rounded-xl bg-sp-accent text-white font-bold text-lg hover:bg-sp-accent/80 transition-colors shadow-lg shadow-sp-accent/20 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
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
  onStop: () => void;
  isFullscreen: boolean;
  showQRFullscreen: boolean;
  onToggleQRFullscreen: () => void;
  // Tunnel props
  tunnelUrl: string | null;
  tunnelLoading: boolean;
  tunnelError: string | null;
  shortUrl: string | null;
  shortCode: string | null;
  customCodeInput: string;
  customCodeError: string | null;
  onCustomCodeChange: (v: string) => void;
  onSetCustomCode: () => void;
}

function LivePanel({
  serverInfo,
  connectedStudents,
  onStop,
  isFullscreen,
  showQRFullscreen,
  onToggleQRFullscreen,
  tunnelUrl,
  tunnelLoading,
  tunnelError,
  shortUrl,
  shortCode,
  customCodeInput,
  customCodeError,
  onCustomCodeChange,
  onSetCustomCode,
}: LivePanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fullscreenCanvasRef = useRef<HTMLCanvasElement>(null);
  const displayUrl = shortUrl ?? tunnelUrl ?? '';

  useEffect(() => {
    if (displayUrl && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, displayUrl, {
        width: 200,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      }).catch(() => {/* ignore */});
    }
  }, [displayUrl]);

  useEffect(() => {
    if (showQRFullscreen && displayUrl && fullscreenCanvasRef.current) {
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
        onKeyDown={(e) => { if (e.key === 'Escape') onToggleQRFullscreen(); }}
        tabIndex={0}
        ref={(el) => el?.focus()}
      >
        {displayUrl && <canvas ref={fullscreenCanvasRef} className="mb-6" />}
        <p className="text-gray-800 text-xl font-bold mb-2">☁️ 워드클라우드 참여하기</p>
        {displayUrl && <p className="text-gray-600 text-lg font-mono">{displayUrl}</p>}
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
        {displayUrl && (
          <button
            onClick={onToggleQRFullscreen}
            className="px-3 py-1.5 rounded-lg bg-sp-bg border border-sp-border text-sp-muted hover:text-sp-text text-xs transition-all"
            title="QR 코드 크게 보기"
          >
            🔍 크게
          </button>
        )}
        <button
          onClick={onStop}
          className="px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 text-xs font-medium transition-all"
        >
          종료
        </button>
      </div>

      <div className="flex items-center gap-4">
        {displayUrl && (
          <div className="bg-white rounded-lg p-2">
            <canvas ref={canvasRef} />
          </div>
        )}
        <div className="flex flex-col gap-2">
          {tunnelLoading ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 text-blue-400 text-sm">
                <span className="animate-spin">⏳</span>
                <span>인터넷 연결 준비 중...</span>
              </div>
              <p className="text-sp-muted text-xs">보통 10초 이내 완료됩니다</p>
            </div>
          ) : tunnelUrl ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <p className="text-sp-text font-mono text-sm break-all flex-1">{tunnelUrl}</p>
                <button onClick={() => { void navigator.clipboard.writeText(tunnelUrl); }} className="shrink-0 p-1 rounded-md hover:bg-sp-text/10 text-sp-muted hover:text-sp-text transition-colors" title="주소 복사"><span className="material-symbols-outlined text-icon-sm">content_copy</span></button>
              </div>
              <p className="text-blue-400 text-xs">🌐 인터넷 모드 — Wi-Fi 불필요</p>
            </div>
          ) : tunnelError ? (
            <div className="flex flex-col gap-1">
              <p className="text-red-400 text-xs">{tunnelError}</p>
              <p className="text-sp-muted text-xs">Wi-Fi 직접 접속: http://{serverInfo.localIPs[0] ?? '...'}:{serverInfo.port}</p>
            </div>
          ) : null}
          {shortUrl && (
            <div className="mt-2 border-t border-sp-border pt-2 flex flex-col gap-2">
              <div>
                <p className="text-sp-muted text-xs mb-0.5">짧은 주소</p>
                <div className="flex items-center gap-1.5">
                  <p className="text-sp-accent font-bold text-sm font-mono flex-1">{shortUrl}</p>
                  <button onClick={() => { void navigator.clipboard.writeText(shortUrl); }} className="shrink-0 p-1 rounded-md hover:bg-sp-text/10 text-sp-muted hover:text-sp-text transition-colors" title="주소 복사"><span className="material-symbols-outlined text-icon-sm">content_copy</span></button>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={customCodeInput}
                  onChange={(e) => onCustomCodeChange(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') onSetCustomCode(); }}
                  placeholder={shortCode ?? '커스텀 코드'}
                  maxLength={30}
                  className="flex-1 bg-sp-bg border border-sp-border rounded-lg px-2 py-1 text-xs text-sp-text placeholder-sp-muted focus:border-sp-accent focus:outline-none"
                />
                <button
                  onClick={onSetCustomCode}
                  disabled={!customCodeInput.trim()}
                  className="px-2.5 py-1 rounded-lg bg-sp-accent/20 border border-sp-accent/30 text-sp-accent text-xs font-medium hover:bg-sp-accent/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  변경
                </button>
              </div>
              {customCodeError && <p className="text-red-400 text-xs">{customCodeError}</p>}
            </div>
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

function generateSessionId(): string {
  return `wc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/* ───────────────── History View ───────────────── */

interface HistoryViewProps {
  isFullscreen: boolean;
  onLoadSession: (session: WordCloudSession) => void;
  onBack: () => void;
}

function HistoryView({ isFullscreen, onLoadSession, onBack }: HistoryViewProps) {
  const sessions = useWordCloudHistoryStore((s) => s.sessions);
  const loaded = useWordCloudHistoryStore((s) => s.loaded);
  const load = useWordCloudHistoryStore((s) => s.load);
  const deleteSession = useWordCloudHistoryStore((s) => s.deleteSession);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  return (
    <div className={`flex flex-col gap-4 ${isFullscreen ? 'px-12 py-8' : 'px-6 py-4'}`}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-sp-text">세션 기록</h2>
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text text-sm transition-all"
        >
          <span className="material-symbols-outlined text-icon-md">arrow_back</span>
          돌아가기
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-sp-muted">
          <span className="material-symbols-outlined text-[48px] opacity-20 mb-3">history</span>
          <p>저장된 세션이 없습니다</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-4 p-4 bg-sp-card border border-sp-border rounded-xl hover:border-sp-accent/40 transition-all cursor-pointer"
              onClick={() => onLoadSession(s)}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sp-text font-medium truncate">{s.question}</p>
                <p className="text-sp-muted text-xs mt-1">
                  {s.words.length}개 단어 · {s.groups.length}개 그룹 · {new Date(s.createdAt).toLocaleDateString('ko-KR')}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSession(s.id);
                  }}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sp-muted hover:text-red-400 hover:bg-red-500/10 transition-all"
                  title="삭제"
                >
                  <span className="material-symbols-outlined text-icon-md">delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
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
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentGroups, setCurrentGroups] = useState<WordCloudGroup[]>([]);

  const addSession = useWordCloudHistoryStore((s) => s.addSession);
  const updateSession = useWordCloudHistoryStore((s) => s.updateSession);

  // Live mode state
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [liveServerInfo, setLiveServerInfo] = useState<{ port: number; localIPs: string[] } | null>(null);
  const [connectedStudents, setConnectedStudents] = useState(0);
  const [showQRFullscreen, setShowQRFullscreen] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [tunnelLoading, setTunnelLoading] = useState(false);
  const [tunnelError, setTunnelError] = useState<string | null>(null);

  const [shortUrl, setShortUrl] = useState<string | null>(null);
  const [shortCode, setShortCode] = useState<string | null>(null);
  const [customCodeInput, setCustomCodeInput] = useState('');
  const [customCodeError, setCustomCodeError] = useState<string | null>(null);
  const liveSessionClientRef = useRef(new LiveSessionClient());

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
      setIsLiveMode(true);
      setLiveError(null);
      setViewMode('live');

      // Auto-start tunnel
      setTunnelLoading(true);
      setTunnelError(null);
      try {
        const available = await window.electronAPI.wordcloudTunnelAvailable();
        if (!available) await window.electronAPI.wordcloudTunnelInstall();
        const result = await window.electronAPI.wordcloudTunnelStart();
        setTunnelUrl(result.tunnelUrl);
        setShortUrl(null);
        setShortCode(null);
        void liveSessionClientRef.current.registerSession(result.tunnelUrl).then((session) => {
          if (session) {
            setShortUrl(session.shortUrl);
            setShortCode(session.code);
          }
        });
      } catch {
        setTunnelError('인터넷 연결에 실패했습니다. Wi-Fi로 접속하거나 네트워크를 확인해주세요.');
      } finally {
        setTunnelLoading(false);
      }
    } catch {
      setLiveError('서버를 시작할 수 없습니다.');
      setViewMode('live');
    }
  }, []);

  const handleSetCustomCode = useCallback(async () => {
    if (!tunnelUrl || !customCodeInput.trim()) return;
    setCustomCodeError(null);
    try {
      const session = await liveSessionClientRef.current.setCustomCode(tunnelUrl, customCodeInput.trim());
      setShortUrl(session.shortUrl);
      setShortCode(session.code);
      setCustomCodeInput('');
    } catch (e) {
      setCustomCodeError(e instanceof Error ? e.message : '코드 변경에 실패했습니다');
    }
  }, [tunnelUrl, customCodeInput]);

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
    setShortUrl(null);
    setShortCode(null);
    setCustomCodeInput('');
    setCustomCodeError(null);
  }, []);

  const handleReset = useCallback(() => {
    handleStopLive();
    setViewMode('create');
    setWords([]);
    setTotalSubmissions(0);
    setLiveError(null);
    colorIndexRef.current = 0;
    setCurrentSessionId(null);
    setCurrentGroups([]);
  }, [handleStopLive]);

  const handleOrganize = useCallback(() => {
    handleStopLive();
    setViewMode('organize');
  }, [handleStopLive]);

  const handleSaveGroups = useCallback(async (groups: WordCloudGroup[]) => {
    setCurrentGroups(groups);
    const session: WordCloudSession = {
      id: currentSessionId ?? generateSessionId(),
      question,
      words: words.map((w) => ({ word: w.word, normalized: w.normalized, count: w.count })),
      groups,
      totalSubmissions,
      createdAt: new Date().toISOString(),
    };
    if (currentSessionId) {
      await updateSession(session);
    } else {
      setCurrentSessionId(session.id);
      await addSession(session);
    }
  }, [currentSessionId, question, words, totalSubmissions, addSession, updateSession]);

  const handleLoadSession = useCallback((session: WordCloudSession) => {
    setQuestion(session.question);
    setWords(
      session.words.map((w, i) => ({
        word: w.word,
        normalized: w.normalized,
        count: w.count,
        color: WORD_COLORS[i % WORD_COLORS.length]!,
        rotation: Math.round((Math.random() - 0.5) * 24),
      })),
    );
    setTotalSubmissions(session.totalSubmissions);
    setCurrentSessionId(session.id);
    setCurrentGroups([...session.groups.map((g) => ({ ...g, words: [...g.words] }))]);
    setViewMode('organize');
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
        {/* Mode indicator */}
        <div className="flex items-center justify-center gap-2 py-2 shrink-0">
          {([
            { key: 'create', label: '질문 설정' },
            { key: 'live', label: '응답 수집' },
            { key: 'organize', label: '결과' },
          ] as const).map((step, i) => {
            const isActive = viewMode === step.key || (viewMode === 'history' && step.key === 'organize');
            return (
              <Fragment key={step.key}>
                {i > 0 && <span className="text-sp-border">›</span>}
                <span className={`text-xs font-medium ${isActive ? 'text-sp-accent' : 'text-sp-muted'}`}>
                  {step.label}
                </span>
              </Fragment>
            );
          })}
        </div>

        {viewMode === 'create' && (
          <CreateView
            isFullscreen={isFullscreen}
            onStart={handleStart}
            onShowHistory={() => setViewMode('history')}
          />
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
                onStop={handleStopLive}
                isFullscreen={isFullscreen}
                showQRFullscreen={showQRFullscreen}
                onToggleQRFullscreen={() => setShowQRFullscreen((v) => !v)}
                tunnelUrl={tunnelUrl}
                tunnelLoading={tunnelLoading}
                tunnelError={tunnelError}
                shortUrl={shortUrl}
                shortCode={shortCode}
                customCodeInput={customCodeInput}
                customCodeError={customCodeError}
                onCustomCodeChange={setCustomCodeInput}
                onSetCustomCode={() => { void handleSetCustomCode(); }}
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
                  onClick={handleOrganize}
                  disabled={words.length === 0}
                  className="px-4 py-2 rounded-lg bg-sp-accent text-white text-sm font-medium hover:bg-sp-accent/80 transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-icon-md">category</span>
                  정리하기
                </button>
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
        {viewMode === 'organize' && (
          <OrganizeView
            words={words}
            question={question}
            totalSubmissions={totalSubmissions}
            isFullscreen={isFullscreen}
            initialGroups={currentGroups}
            onSave={handleSaveGroups}
            onBack={() => setViewMode(words.length > 0 ? 'live' : 'create')}
          />
        )}

        {viewMode === 'history' && (
          <HistoryView
            isFullscreen={isFullscreen}
            onLoadSession={handleLoadSession}
            onBack={() => setViewMode('create')}
          />
        )}
      </div>
    </ToolLayout>
  );
}
