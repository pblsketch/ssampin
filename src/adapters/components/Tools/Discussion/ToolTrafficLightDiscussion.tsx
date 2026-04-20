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

interface ToolTrafficLightDiscussionProps {
  onBack: () => void;
  isFullscreen: boolean;
}

type ViewMode = 'setup' | 'live' | 'results';

const SIGNALS = [
  { key: 'red', label: '반대', color: 'red', bgClass: 'bg-red-500/20', borderClass: 'border-red-500', textClass: 'text-red-500' },
  { key: 'yellow', label: '보류', color: 'yellow', bgClass: 'bg-yellow-500/20', borderClass: 'border-yellow-500', textClass: 'text-yellow-500' },
  { key: 'green', label: '찬성', color: 'green', bgClass: 'bg-green-500/20', borderClass: 'border-green-500', textClass: 'text-green-500' },
] as const;

export function ToolTrafficLightDiscussion({ onBack, isFullscreen }: ToolTrafficLightDiscussionProps) {
  const { track } = useAnalytics();
  useEffect(() => {
    track('tool_use', { tool: 'trafficlight-discussion' });
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
      const info = await window.electronAPI.startDiscussion({ toolType: 'trafficlight', topics: newTopics });
      setServerInfo(info);

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

  // Count students per signal
  const getSignalCount = (signal: string) => students.filter((s) => s.signal === signal).length;
  const getSignalStudents = (signal: string) => students.filter((s) => s.signal === signal);
  const undecidedCount = students.filter((s) => !s.signal || s.signal === '' || s.signal === 'none').length;
  const totalResponded = students.length - undecidedCount;

  return (
    <ToolLayout title="신호등 토론" emoji="🚦" onBack={onBack} isFullscreen={isFullscreen} disableZoom>
      {showPastResults ? (
        <PastResultsView toolType='trafficlight-discussion' onClose={() => setShowPastResults(false)} />
      ) : viewMode === 'setup' ? (
        <DiscussionSetup
          toolType="trafficlight"
          onStart={(t) => { void handleStart(t); }}
          onShowPastResults={() => setShowPastResults(true)}
        />
      ) : viewMode === 'live' ? (
        <DiscussionLive
          toolType="trafficlight"
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
          {/* Traffic Light Visualization */}
          <div className="flex flex-col items-center gap-4">
            <div className="flex justify-center gap-10">
              {SIGNALS.map(({ key, label, bgClass, borderClass, textClass }) => {
                const count = getSignalCount(key);
                const signalStudents = getSignalStudents(key);
                return (
                  <div key={key} className="flex flex-col items-center gap-3">
                    <div
                      className={`w-32 h-32 rounded-full ${bgClass} border-4 ${borderClass} flex items-center justify-center transition-all duration-300 ${count > 0 ? 'scale-100 shadow-lg' : 'scale-95 opacity-70'}`}
                      style={count > 0 ? { boxShadow: `0 0 20px ${key === 'red' ? 'rgba(239,68,68,0.3)' : key === 'yellow' ? 'rgba(234,179,8,0.3)' : 'rgba(34,197,94,0.3)'}` } : undefined}
                    >
                      <span className={`text-3xl font-bold ${textClass}`}>{count}</span>
                    </div>
                    <span className={`text-sm font-bold ${textClass}`}>{label}</span>
                    <div className="flex flex-wrap justify-center gap-1 max-w-[9rem]">
                      {signalStudents.map((s) => (
                        <div key={s.id} className="flex flex-col items-center group">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold group-hover:scale-125 transition-transform"
                            style={{ backgroundColor: s.avatarColor || '#6366f1' }}
                            title={s.name}
                          >
                            {s.emoji || '?'}
                          </div>
                          <span className="text-[9px] text-sp-muted opacity-0 group-hover:opacity-100 transition-opacity">{s.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Undecided indicator */}
            {undecidedCount > 0 && (
              <div className="flex items-center gap-2 text-xs text-sp-muted bg-sp-card/50 px-3 py-1.5 rounded-full border border-sp-border/50">
                <span className="material-symbols-outlined text-icon-sm">hourglass_empty</span>
                <span>미응답 <span className="text-sp-text font-bold">{undecidedCount}명</span></span>
              </div>
            )}
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

          {/* Summary bar chart */}
          <div className="bg-sp-card border border-sp-border rounded-xl p-5">
            <h3 className="text-sm font-bold text-sp-text mb-4">응답 분포</h3>
            {/* Horizontal stacked bar */}
            {totalResponded > 0 && (
              <div className="w-full h-8 rounded-full overflow-hidden flex mb-4">
                {getSignalCount('red') > 0 && (
                  <div
                    className="bg-red-500 flex items-center justify-center transition-all duration-500"
                    style={{ width: `${(getSignalCount('red') / totalResponded) * 100}%` }}
                  >
                    <span className="text-white text-xs font-bold">{getSignalCount('red')}</span>
                  </div>
                )}
                {getSignalCount('yellow') > 0 && (
                  <div
                    className="bg-yellow-500 flex items-center justify-center transition-all duration-500"
                    style={{ width: `${(getSignalCount('yellow') / totalResponded) * 100}%` }}
                  >
                    <span className="text-white text-xs font-bold">{getSignalCount('yellow')}</span>
                  </div>
                )}
                {getSignalCount('green') > 0 && (
                  <div
                    className="bg-green-500 flex items-center justify-center transition-all duration-500"
                    style={{ width: `${(getSignalCount('green') / totalResponded) * 100}%` }}
                  >
                    <span className="text-white text-xs font-bold">{getSignalCount('green')}</span>
                  </div>
                )}
              </div>
            )}
            {/* Legend */}
            <div className="flex items-center justify-center gap-6">
              {SIGNALS.map(({ key, label, textClass }) => (
                <div key={key} className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${key === 'red' ? 'bg-red-500' : key === 'yellow' ? 'bg-yellow-500' : 'bg-green-500'}`} />
                  <span className={`text-xs font-bold ${textClass}`}>{label}</span>
                  <span className="text-xs text-sp-muted">
                    {getSignalCount(key)}명
                    {totalResponded > 0 && ` (${Math.round((getSignalCount(key) / totalResponded) * 100)}%)`}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-sp-border flex items-center justify-between text-xs text-sp-muted">
              <span>참여 학생: <span className="text-sp-text font-bold">{students.length}명</span></span>
              {undecidedCount > 0 && <span>미응답: <span className="text-sp-text font-bold">{undecidedCount}명</span></span>}
            </div>
          </div>

          {/* Final traffic light circles */}
          <div className="flex justify-center gap-10">
            {SIGNALS.map(({ key, label, bgClass, borderClass, textClass }) => {
              const count = getSignalCount(key);
              const signalStudents = getSignalStudents(key);
              return (
                <div key={key} className="flex flex-col items-center gap-3">
                  <div
                    className={`w-28 h-28 rounded-full ${bgClass} border-4 ${borderClass} flex items-center justify-center`}
                  >
                    <span className={`text-2xl font-bold ${textClass}`}>{count}</span>
                  </div>
                  <span className={`text-sm font-bold ${textClass}`}>{label}</span>
                  <div className="flex flex-wrap justify-center gap-1 max-w-[8rem]">
                    {signalStudents.map((s) => (
                      <div key={s.id} className="flex flex-col items-center">
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                          style={{ backgroundColor: s.avatarColor || '#6366f1' }}
                        >
                          {s.emoji || '?'}
                        </div>
                        <span className="text-[10px] text-sp-muted">{s.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Student list */}
          {students.length > 0 && (
            <div className="bg-sp-card border border-sp-border rounded-xl p-4">
              <h3 className="text-sm font-bold text-sp-text mb-3">참여 학생 ({students.length}명)</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {students.map((s) => {
                  const sig = SIGNALS.find((sg) => sg.key === s.signal);
                  return (
                    <div key={s.id} className="flex items-center gap-2 text-sm">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                        style={{ backgroundColor: s.avatarColor || '#6366f1' }}
                      >
                        {s.emoji || '?'}
                      </div>
                      <span className="text-sp-text">{s.name}</span>
                      {sig ? (
                        <span className={`text-xs font-medium ${sig.textClass}`}>
                          {sig.label}
                        </span>
                      ) : (
                        <span className="text-xs text-sp-muted">미응답</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Bottom buttons */}
          <div className="flex items-center justify-center gap-3 shrink-0 pb-1">
            <button
              onClick={handleNewDiscussion}
              className="px-5 py-2.5 rounded-xl bg-sp-accent text-white font-bold hover:bg-sp-accent/80 transition-all text-sm"
            >
              새 토론
            </button>
            <ResultSaveButton
              toolType='trafficlight-discussion'
              defaultName={topics[0] ?? '신호등 토론'}
              resultData={{
                type: 'trafficlight-discussion',
                topics,
                rounds: topics.map((topic) => ({
                  topic,
                  students: students.map((s) => ({ name: s.name, emoji: s.emoji, signal: s.signal })),
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
