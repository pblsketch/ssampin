import { useState, useCallback, useRef, useEffect } from 'react';
import { ToolLayout } from '../ToolLayout';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import { useBoardSessionStore } from '@adapters/stores/useBoardSessionStore';
import { LiveSessionClient } from '@infrastructure/supabase/LiveSessionClient';
import { ResultSaveButton, PastResultsView } from '../TemplateManager';
import { DiscussionSetup } from './DiscussionSetup';
import { DiscussionLive } from './DiscussionLive';
import type { StudentState } from './DiscussionLive';
import type { ChatEntry } from './ChatPanel';

interface ToolValueLineProps {
  onBack: () => void;
  isFullscreen: boolean;
}

type ViewMode = 'setup' | 'live' | 'results';

function getYOffset(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return 20 + (Math.abs(hash) % 60);
}

export function ToolValueLine({ onBack, isFullscreen }: ToolValueLineProps) {
  const { track } = useAnalytics();
  useEffect(() => {
    track('tool_use', { tool: 'valueline-discussion' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [viewMode, setViewMode] = useState<ViewMode>('setup');
  const [showPastResults, setShowPastResults] = useState(false);
  const [topics, setTopics] = useState<string[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [students, setStudents] = useState<StudentState[]>([]);
  const [chats, setChats] = useState<ChatEntry[]>([]);
  const [connectionCount, setConnectionCount] = useState(0);

  // Tunnel state
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [tunnelLoading, setTunnelLoading] = useState(false);
  const [tunnelError, setTunnelError] = useState<string | null>(null);
  const [shortUrl, setShortUrl] = useState<string | null>(null);
  const [shortCode, setShortCode] = useState<string | null>(null);
  const [customCodeInput, setCustomCodeInput] = useState('');
  const [customCodeError, setCustomCodeError] = useState<string | null>(null);
  const [showQRFullscreen, setShowQRFullscreen] = useState(false);
  const [serverInfo, setServerInfo] = useState<{ port: number; localIPs: string[] } | null>(null);

  const liveSessionClientRef = useRef(new LiveSessionClient());

  const handleStart = useCallback(async (newTopics: string[]) => {
    // R-1/R-2 iter #1: 협업 보드가 실행 중이면 라이브 도구 시작 차단
    if (useBoardSessionStore.getState().active !== null) {
      setTunnelError('협업 보드가 실행 중입니다. 먼저 보드를 종료해주세요.');
      return;
    }

    setTopics(newTopics);
    setCurrentRound(0);
    setStudents([]);
    setChats([]);
    setConnectionCount(0);
    setViewMode('live');

    if (!window.electronAPI?.startDiscussion) return;

    try {
      const info = await window.electronAPI.startDiscussion({ toolType: 'valueline', topics: newTopics });
      setServerInfo(info);

      // Start tunnel
      setTunnelLoading(true);
      setTunnelError(null);
      try {
        const available = await window.electronAPI.discussionTunnelAvailable?.();
        if (!available) await window.electronAPI.discussionTunnelInstall?.();
        const result = await window.electronAPI.discussionTunnelStart?.();
        if (result) {
          setTunnelUrl(result.tunnelUrl);
          void liveSessionClientRef.current.registerSession(result.tunnelUrl).then((session) => {
            if (session) { setShortUrl(session.shortUrl); setShortCode(session.code); }
          });
        }
      } catch {
        setTunnelError('인터넷 연결에 실패했습니다. Wi-Fi로 접속하거나 네트워크를 확인해주세요.');
      } finally {
        setTunnelLoading(false);
      }
    } catch {
      // Browser fallback — no-op
    }
  }, []);

  const handleNextRound = useCallback(() => {
    setCurrentRound((prev) => Math.min(prev + 1, topics.length - 1));
    window.electronAPI?.discussionNextRound?.();
  }, [topics.length]);

  const handleEnd = useCallback(() => {
    window.electronAPI?.stopDiscussion?.();
    setViewMode('results');
  }, []);

  const handleNewDiscussion = useCallback(() => {
    setViewMode('setup');
    setTopics([]);
    setCurrentRound(0);
    setStudents([]);
    setChats([]);
    setConnectionCount(0);
    setTunnelUrl(null);
    setTunnelLoading(false);
    setTunnelError(null);
    setShortUrl(null);
    setShortCode(null);
    setCustomCodeInput('');
    setCustomCodeError(null);
    setShowQRFullscreen(false);
    setServerInfo(null);
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

  // IPC event listeners
  useEffect(() => {
    if (viewMode !== 'live' || !window.electronAPI) return;

    const unsubState = window.electronAPI.onDiscussionState?.((data: { students: StudentState[] }) => {
      setStudents(data.students);
    });
    const unsubChat = window.electronAPI.onDiscussionChat?.((data: ChatEntry) => {
      setChats((prev) => [...prev, data]);
    });
    const unsubCount = window.electronAPI.onDiscussionConnectionCount?.((count: number) => {
      setConnectionCount(count);
    });

    return () => { unsubState?.(); unsubChat?.(); unsubCount?.(); };
  }, [viewMode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      window.electronAPI?.stopDiscussion?.();
    };
  }, []);

  // Compute results
  const avgPosition = students.length > 0
    ? students.reduce((sum, s) => sum + s.position, 0) / students.length
    : 0.5;

  const opposeCnt = students.filter((s) => s.position < 0.35).length;
  const neutralCnt = students.filter((s) => s.position >= 0.35 && s.position <= 0.65).length;
  const agreeCnt = students.filter((s) => s.position > 0.65).length;

  return (
    <ToolLayout title="가치수직선 토론" emoji="📏" onBack={onBack} isFullscreen={isFullscreen} disableZoom>
      {showPastResults ? (
        <PastResultsView toolType='valueline-discussion' onClose={() => setShowPastResults(false)} />
      ) : viewMode === 'setup' ? (
        <DiscussionSetup
          toolType="valueline"
          onStart={(t) => { void handleStart(t); }}
          onShowPastResults={() => setShowPastResults(true)}
        />
      ) : viewMode === 'live' ? (
        <DiscussionLive
          toolType="valueline"
          topics={topics}
          currentRound={currentRound}
          students={students}
          chats={chats}
          connectionCount={connectionCount}
          onNextRound={handleNextRound}
          onEnd={handleEnd}
          isFullscreen={isFullscreen}
          tunnelUrl={tunnelUrl}
          tunnelLoading={tunnelLoading}
          tunnelError={tunnelError}
          shortUrl={shortUrl}
          shortCode={shortCode}
          customCodeInput={customCodeInput}
          customCodeError={customCodeError}
          onCustomCodeChange={setCustomCodeInput}
          onSetCustomCode={() => { void handleSetCustomCode(); }}
          showQRFullscreen={showQRFullscreen}
          onToggleQRFullscreen={() => setShowQRFullscreen((v) => !v)}
          serverInfo={serverInfo}
        >
          {/* Value Line Visualization — taller with gradient track */}
          <div className="relative w-full h-72 bg-sp-surface rounded-2xl border border-sp-border overflow-hidden">
            {/* Gradient track background */}
            <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-2 rounded-full bg-gradient-to-r from-red-500/30 via-sp-border/30 to-blue-500/30" />

            {/* Center line */}
            <div className="absolute left-1/2 top-4 bottom-4 w-px bg-sp-border/40 border-dashed" />

            {/* Position markers */}
            <div className="absolute left-[25%] top-4 bottom-4 w-px bg-sp-border/20" />
            <div className="absolute left-[75%] top-4 bottom-4 w-px bg-sp-border/20" />

            {/* Labels */}
            <div className="absolute left-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1">
              <span className="text-xs text-red-400 font-bold">반대</span>
              <span className="text-[10px] text-sp-muted">0%</span>
            </div>
            <div className="absolute left-1/2 -translate-x-1/2 bottom-2">
              <span className="text-[10px] text-sp-muted">50%</span>
            </div>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1">
              <span className="text-xs text-blue-400 font-bold">찬성</span>
              <span className="text-[10px] text-sp-muted">100%</span>
            </div>

            {/* Student icons */}
            {students.map((s) => (
              <div
                key={s.id}
                className="absolute transition-all duration-500 ease-out flex flex-col items-center group"
                style={{
                  left: `${Math.max(5, Math.min(95, s.position * 100))}%`,
                  top: `${getYOffset(s.id)}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold drop-shadow-lg"
                  style={{ backgroundColor: s.avatarColor || '#6366f1' }}
                >
                  {s.emoji || '?'}
                </div>
                <span className="text-[10px] text-sp-text bg-sp-card/90 px-1.5 py-0.5 rounded-md mt-0.5 border border-sp-border/50 shadow-sm whitespace-nowrap">
                  {s.name}
                </span>
              </div>
            ))}
          </div>
        </DiscussionLive>
      ) : (
        /* Results view */
        <div className="w-full flex flex-col h-full min-h-0 gap-6">
          <div className="text-center">
            <h2 className={`font-bold text-sp-text ${isFullscreen ? 'text-3xl' : 'text-2xl'}`}>
              토론 결과
            </h2>
            <p className="text-sp-muted text-sm mt-1">{topics.length}개 라운드 완료</p>
          </div>

          {/* Final value line */}
          <div className="relative w-full h-64 bg-sp-surface rounded-2xl border border-sp-border overflow-hidden">
            {/* Gradient track */}
            <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-2 rounded-full bg-gradient-to-r from-red-500/30 via-sp-border/30 to-blue-500/30" />
            <div className="absolute left-1/2 top-4 bottom-4 w-px bg-sp-border/40" />
            <div className="absolute left-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1">
              <span className="text-xs text-red-400 font-bold">반대</span>
            </div>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1">
              <span className="text-xs text-blue-400 font-bold">찬성</span>
            </div>
            {students.map((s) => (
              <div
                key={s.id}
                className="absolute transition-all duration-300 ease-out flex flex-col items-center"
                style={{
                  left: `${Math.max(5, Math.min(95, s.position * 100))}%`,
                  top: `${getYOffset(s.id)}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold"
                  style={{ backgroundColor: s.avatarColor || '#6366f1' }}
                >
                  {s.emoji || '?'}
                </div>
                <span className="text-[10px] text-sp-text bg-sp-card/90 px-1.5 py-0.5 rounded-md mt-0.5 border border-sp-border/50">
                  {s.name}
                </span>
              </div>
            ))}

            {/* Average position indicator */}
            {students.length > 0 && (
              <div
                className="absolute bottom-3 transition-all duration-500"
                style={{ left: `${avgPosition * 100}%`, transform: 'translateX(-50%)' }}
              >
                <div className="flex flex-col items-center">
                  <span className="text-[10px] text-sp-accent font-bold bg-sp-accent/10 px-2 py-0.5 rounded-full border border-sp-accent/30">
                    평균 {Math.round(avgPosition * 100)}%
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Summary stats — bar chart style */}
          <div className="bg-sp-card border border-sp-border rounded-xl p-5">
            <h3 className="text-sm font-bold text-sp-text mb-4">분포 요약</h3>
            <div className="space-y-3">
              {/* Oppose */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-red-400 font-bold w-12 text-right">반대</span>
                <div className="flex-1 h-6 bg-sp-bg rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-500/40 rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                    style={{ width: students.length > 0 ? `${(opposeCnt / students.length) * 100}%` : '0%' }}
                  >
                    {opposeCnt > 0 && <span className="text-[10px] text-red-300 font-bold">{opposeCnt}명</span>}
                  </div>
                </div>
                <span className="text-xs text-sp-muted w-8">{opposeCnt}명</span>
              </div>
              {/* Neutral */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-sp-muted font-bold w-12 text-right">중립</span>
                <div className="flex-1 h-6 bg-sp-bg rounded-full overflow-hidden">
                  <div
                    className="h-full bg-sp-border/60 rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                    style={{ width: students.length > 0 ? `${(neutralCnt / students.length) * 100}%` : '0%' }}
                  >
                    {neutralCnt > 0 && <span className="text-[10px] text-sp-muted font-bold">{neutralCnt}명</span>}
                  </div>
                </div>
                <span className="text-xs text-sp-muted w-8">{neutralCnt}명</span>
              </div>
              {/* Agree */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-blue-400 font-bold w-12 text-right">찬성</span>
                <div className="flex-1 h-6 bg-sp-bg rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500/40 rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                    style={{ width: students.length > 0 ? `${(agreeCnt / students.length) * 100}%` : '0%' }}
                  >
                    {agreeCnt > 0 && <span className="text-[10px] text-blue-300 font-bold">{agreeCnt}명</span>}
                  </div>
                </div>
                <span className="text-xs text-sp-muted w-8">{agreeCnt}명</span>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-sp-border flex items-center justify-between text-xs">
              <span className="text-sp-muted">참여 학생 <span className="text-sp-text font-bold">{students.length}명</span></span>
              <span className="text-sp-muted">
                평균 위치:
                <span className={`font-bold ml-1 ${avgPosition < 0.4 ? 'text-red-400' : avgPosition > 0.6 ? 'text-blue-400' : 'text-sp-text'}`}>
                  {avgPosition < 0.4 ? '반대 쪽' : avgPosition > 0.6 ? '찬성 쪽' : '중립'}
                  ({Math.round(avgPosition * 100)}%)
                </span>
              </span>
            </div>
          </div>

          {/* Bottom buttons */}
          <div className="flex items-center justify-center gap-3 shrink-0 pb-1">
            <button
              onClick={handleNewDiscussion}
              className="px-5 py-2.5 rounded-xl bg-sp-accent text-white font-bold hover:bg-sp-accent/80 transition-all text-sm"
            >
              새 토론
            </button>
            <ResultSaveButton
              toolType='valueline-discussion'
              defaultName={topics[0] ?? '가치수직선 토론'}
              resultData={{
                type: 'valueline-discussion',
                topics,
                rounds: topics.map((topic) => ({
                  topic,
                  students: students.map((s) => ({ name: s.name, emoji: s.emoji, position: s.position })),
                  chats: chats.map((c) => ({ name: c.name, emoji: c.emoji, text: c.text, time: c.time })),
                })),
              }}
            />
          </div>
        </div>
      )}
    </ToolLayout>
  );
}
