import { useState, useCallback, useRef, useEffect } from 'react';
import { ToolLayout } from './ToolLayout';
import type { PollOption, PollQuestion } from '@domain/entities/Poll';
import QRCode from 'qrcode';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import { LiveSessionClient } from '@infrastructure/supabase/LiveSessionClient';

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

const MAX_QUESTIONS = 10;

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
  { emoji: '\u{1F44D}', label: '찬성/반대', options: ['찬성', '반대'] },
  { emoji: '\u{1F600}', label: '만족도', options: ['매우 만족', '만족', '보통', '불만족'] },
  { emoji: '\u{1F4CA}', label: '이해도', options: ['완벽히 이해', '대체로 이해', '조금 어려움', '모르겠음'] },
  { emoji: '\u{1F522}', label: '1~5점', options: ['1점', '2점', '3점', '4점', '5점'] },
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

interface QuestionDraft {
  id: string;
  question: string;
  optionTexts: string[];
}

function makeQuestionDraft(): QuestionDraft {
  return {
    id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    question: '',
    optionTexts: ['', ''],
  };
}

interface CreateViewProps {
  isFullscreen: boolean;
  onStart: (questions: PollQuestion[]) => void;
}

function CreateView({ isFullscreen, onStart }: CreateViewProps) {
  const [drafts, setDrafts] = useState<QuestionDraft[]>([makeQuestionDraft()]);
  const [exampleIdx, setExampleIdx] = useState(-1);
  const inputRefs = useRef<Map<string, (HTMLInputElement | null)[]>>(new Map());

  const canStart = drafts.some(
    (d) => d.question.trim().length > 0 && d.optionTexts.filter((t) => t.trim().length > 0).length >= 2
  );

  const updateDraft = useCallback((draftId: string, updater: (d: QuestionDraft) => QuestionDraft) => {
    setDrafts((prev) => prev.map((d) => (d.id === draftId ? updater(d) : d)));
  }, []);

  const handleOptionChange = useCallback((draftId: string, index: number, value: string) => {
    updateDraft(draftId, (d) => ({
      ...d,
      optionTexts: d.optionTexts.map((t, i) => (i === index ? value : t)),
    }));
  }, [updateDraft]);

  const handleAddOption = useCallback((draftId: string) => {
    setDrafts((prev) => {
      const draft = prev.find((d) => d.id === draftId);
      if (!draft || draft.optionTexts.length >= 6) return prev;
      return prev.map((d) => (d.id === draftId ? { ...d, optionTexts: [...d.optionTexts, ''] } : d));
    });
    setTimeout(() => {
      const refs = inputRefs.current.get(draftId);
      const draft = drafts.find((d) => d.id === draftId);
      if (refs && draft) refs[draft.optionTexts.length]?.focus();
    }, 50);
  }, [drafts]);

  const handleRemoveOption = useCallback((draftId: string, index: number) => {
    updateDraft(draftId, (d) => {
      if (d.optionTexts.length <= 2) return d;
      return { ...d, optionTexts: d.optionTexts.filter((_, i) => i !== index) };
    });
  }, [updateDraft]);

  const handleOptionKeyDown = useCallback((e: React.KeyboardEvent, draftId: string, index: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const draft = drafts.find((d) => d.id === draftId);
      if (!draft) return;
      if (index < draft.optionTexts.length - 1) {
        const refs = inputRefs.current.get(draftId);
        refs?.[index + 1]?.focus();
      } else if (draft.optionTexts.length < 6) {
        handleAddOption(draftId);
      }
    }
  }, [drafts, handleAddOption]);

  const handlePreset = useCallback((preset: Preset) => {
    // Apply preset to first draft
    if (drafts.length === 0) return;
    updateDraft(drafts[0]!.id, (d) => ({ ...d, optionTexts: [...preset.options] }));
  }, [drafts, updateDraft]);

  const handleExampleClick = useCallback(() => {
    const nextIdx = (exampleIdx + 1) % EXAMPLE_QUESTIONS.length;
    setExampleIdx(nextIdx);
    if (drafts.length > 0) {
      updateDraft(drafts[0]!.id, (d) => ({ ...d, question: EXAMPLE_QUESTIONS[nextIdx]! }));
    }
  }, [exampleIdx, drafts, updateDraft]);

  const handleAddQuestion = useCallback(() => {
    if (drafts.length >= MAX_QUESTIONS) return;
    setDrafts((prev) => [...prev, makeQuestionDraft()]);
  }, [drafts.length]);

  const handleRemoveQuestion = useCallback((draftId: string) => {
    if (drafts.length <= 1) return;
    setDrafts((prev) => prev.filter((d) => d.id !== draftId));
    inputRefs.current.delete(draftId);
  }, [drafts.length]);

  const handleMoveQuestion = useCallback((draftId: string, direction: -1 | 1) => {
    setDrafts((prev) => {
      const idx = prev.findIndex((d) => d.id === draftId);
      if (idx < 0) return prev;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx]!, next[idx]!];
      return next;
    });
  }, []);

  const handleStart = useCallback(() => {
    if (!canStart) return;
    const questions: PollQuestion[] = drafts
      .filter((d) => d.question.trim().length > 0 && d.optionTexts.filter((t) => t.trim().length > 0).length >= 2)
      .map((d) => {
        const validOptions = d.optionTexts
          .map((text) => text.trim())
          .filter((text) => text.length > 0);
        return {
          id: d.id,
          question: d.question.trim(),
          options: validOptions.map((text, idx) => makeOption(idx, text)),
        };
      });
    onStart(questions);
  }, [canStart, drafts, onStart]);

  return (
    <div className={`w-full max-w-2xl mx-auto flex flex-col ${isFullscreen ? 'h-full min-h-0 gap-4' : 'gap-6'}`}>
      {/* Questions */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4">
        {drafts.map((draft, qIdx) => {
          // Ensure refs array exists for this draft
          if (!inputRefs.current.has(draft.id)) {
            inputRefs.current.set(draft.id, []);
          }
          const refs = inputRefs.current.get(draft.id)!;

          return (
            <div key={draft.id} className="bg-sp-card border border-sp-border rounded-xl p-4 flex flex-col gap-3">
              {/* Question header */}
              <div className="flex items-center gap-2">
                {drafts.length > 1 && (
                  <span className="text-sp-accent font-bold text-sm">Q{qIdx + 1}</span>
                )}
                <input
                  type="text"
                  value={draft.question}
                  onChange={(e) => updateDraft(draft.id, (d) => ({ ...d, question: e.target.value }))}
                  placeholder="질문을 입력하세요"
                  className="flex-1 bg-sp-bg border border-sp-border rounded-xl px-4 py-3 text-xl text-sp-text placeholder-sp-muted focus:border-sp-accent focus:outline-none transition-colors"
                  maxLength={100}
                />
                {qIdx === 0 && (
                  <button
                    onClick={handleExampleClick}
                    className="shrink-0 px-3 py-3 rounded-xl bg-sp-bg border border-sp-border text-sp-muted hover:text-yellow-400 hover:border-yellow-400/30 transition-all"
                    title="예시 질문"
                  >
                    {'\u{1F4A1}'}
                  </button>
                )}
                {drafts.length > 1 && (
                  <>
                    <button
                      onClick={() => handleMoveQuestion(draft.id, -1)}
                      disabled={qIdx === 0}
                      className="shrink-0 w-8 h-8 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-all flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed text-sm"
                      title="위로 이동"
                    >
                      {'\u2191'}
                    </button>
                    <button
                      onClick={() => handleMoveQuestion(draft.id, 1)}
                      disabled={qIdx === drafts.length - 1}
                      className="shrink-0 w-8 h-8 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-all flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed text-sm"
                      title="아래로 이동"
                    >
                      {'\u2193'}
                    </button>
                    <button
                      onClick={() => handleRemoveQuestion(draft.id)}
                      className="shrink-0 w-8 h-8 rounded-lg text-sp-muted hover:text-red-400 hover:bg-red-500/10 transition-all flex items-center justify-center text-sm"
                      title="문항 삭제"
                    >
                      {'\u2715'}
                    </button>
                  </>
                )}
              </div>

              {/* Option inputs */}
              <div className="flex flex-col gap-2">
                <span className="text-sm text-sp-muted font-medium">선택지</span>
                <div className="flex flex-col gap-2">
                  {draft.optionTexts.map((text, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <div
                        className="w-5 h-5 rounded-full shrink-0"
                        style={{ backgroundColor: OPTION_COLORS[index % OPTION_COLORS.length] }}
                      />
                      <input
                        ref={(el) => { refs[index] = el; }}
                        type="text"
                        value={text}
                        onChange={(e) => handleOptionChange(draft.id, index, e.target.value)}
                        onKeyDown={(e) => handleOptionKeyDown(e, draft.id, index)}
                        placeholder={`선택지 ${index + 1}`}
                        className="flex-1 bg-sp-bg border border-sp-border rounded-lg px-3 py-2 text-sp-text placeholder-sp-muted focus:border-sp-accent focus:outline-none transition-colors"
                        maxLength={50}
                      />
                      <button
                        onClick={() => handleRemoveOption(draft.id, index)}
                        disabled={draft.optionTexts.length <= 2}
                        className="shrink-0 w-8 h-8 rounded-lg text-sp-muted hover:text-red-400 hover:bg-red-500/10 transition-all flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        {'\u2715'}
                      </button>
                    </div>
                  ))}
                </div>
                {draft.optionTexts.length < 6 && (
                  <button
                    onClick={() => handleAddOption(draft.id)}
                    className="self-start px-4 py-2 rounded-lg border border-dashed border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent transition-all text-sm"
                  >
                    + 선택지 추가
                  </button>
                )}
              </div>

              {/* Presets (first question only) */}
              {qIdx === 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-sm text-sp-muted font-medium">빠른 생성</span>
                  <div className="flex flex-wrap gap-2">
                    {PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        onClick={() => handlePreset(preset)}
                        className="px-4 py-2 rounded-xl bg-sp-bg border border-sp-border text-sm text-sp-muted hover:text-sp-text hover:border-sp-accent/50 transition-all"
                      >
                        {preset.emoji} {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add question button */}
      {drafts.length < MAX_QUESTIONS && (
        <button
          onClick={handleAddQuestion}
          className="w-full py-3 rounded-xl border border-dashed border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent transition-all text-sm font-medium"
        >
          + 문항 추가 ({drafts.length}/{MAX_QUESTIONS})
        </button>
      )}

      {/* Start button */}
      <button
        onClick={handleStart}
        disabled={!canStart}
        className="w-full py-3.5 rounded-xl bg-sp-accent text-white font-bold text-lg hover:bg-sp-accent/80 transition-colors shadow-lg shadow-sp-accent/20 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
      >
        {'\u{1F4CA}'} 설문 시작!
      </button>
    </div>
  );
}

/* ───────────────── Live Vote Panel ───────────────── */

interface LiveVotePanelProps {
  serverInfo: { port: number; localIPs: string[] };
  connectedStudents: number;
  onStop: () => void;
  isFullscreen: boolean;
  showQRFullscreen: boolean;
  onToggleQRFullscreen: () => void;
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

function LiveVotePanel({
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
}: LiveVotePanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fullscreenCanvasRef = useRef<HTMLCanvasElement>(null);
  const displayUrl = shortUrl ?? tunnelUrl ?? '';

  useEffect(() => {
    if (canvasRef.current && displayUrl) {
      QRCode.toCanvas(canvasRef.current, displayUrl, {
        width: 200,
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

  if (showQRFullscreen) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white cursor-pointer"
        onClick={onToggleQRFullscreen}
      >
        <canvas ref={fullscreenCanvasRef} className="mb-6" />
        <p className="text-gray-800 text-xl font-bold mb-2">{'\u{1F4CA}'} 설문 참여하기</p>
        <p className="text-gray-600 text-lg font-mono">{displayUrl}</p>
        <p className="text-gray-400 text-sm mt-4">화면을 클릭하면 돌아갑니다</p>
      </div>
    );
  }

  return (
    <div className={`bg-sp-card border border-sp-border rounded-xl p-4 flex flex-col items-center gap-3 shrink-0 ${isFullscreen ? '' : ''}`}>
      <div className="flex items-center gap-2 w-full">
        <span className="text-green-400 text-sm font-bold">{'\u25CF'} LIVE</span>
        <span className="text-sp-muted text-sm">
          접속 학생: <span className="text-sp-text font-bold">{connectedStudents}명</span>
        </span>
        <div className="flex-1" />
        <button
          onClick={onToggleQRFullscreen}
          className="px-3 py-1.5 rounded-lg bg-sp-bg border border-sp-border text-sp-muted hover:text-sp-text text-xs transition-all"
          title="QR 코드 크게 보기"
        >
          {'\u{1F50D}'} 크게
        </button>
        <button
          onClick={onStop}
          className="px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 text-xs font-medium transition-all"
        >
          학생 설문 종료
        </button>
      </div>

      <div className="flex items-center gap-4">
        <div className="bg-white rounded-lg p-2">
          <canvas ref={canvasRef} />
        </div>

        <div className="flex flex-col gap-2">
          {tunnelLoading ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 text-blue-400 text-sm">
                <span className="animate-spin">{'\u231B'}</span>
                <span>인터넷 연결 준비 중...</span>
              </div>
              <p className="text-sp-muted text-xs">보통 10초 이내 완료됩니다</p>
            </div>
          ) : tunnelUrl ? (
            <div className="flex flex-col gap-1">
              <p className="text-sp-text font-mono text-sm break-all">{tunnelUrl}</p>
              <p className="text-blue-400 text-xs">{'\u{1F310}'} 인터넷 모드 — Wi-Fi 불필요</p>
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
                <p className="text-sp-accent font-bold text-sm font-mono">{shortUrl}</p>
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
              {customCodeError && (
                <p className="text-red-400 text-xs">{customCodeError}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────────────── Voting View ───────────────── */

interface VotingViewProps {
  questions: PollQuestion[];
  isOpen: boolean;
  showResults: boolean;
  isFullscreen: boolean;
  onVote: (questionId: string, optionId: string, delta: number) => void;
  onToggleResults: () => void;
  onClose: () => void;
  onReset: () => void;
  onShowFinalResults: () => void;
  // Live vote props
  isLiveMode: boolean;
  liveServerInfo: { port: number; localIPs: string[] } | null;
  connectedStudents: number;
  onStartLive: () => void;
  onStopLive: () => void;
  showQRFullscreen: boolean;
  onToggleQRFullscreen: () => void;
  liveError: string | null;
  liveDisabled: boolean;
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

function VotingView({
  questions,
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
  onStartLive,
  onStopLive,
  showQRFullscreen,
  onToggleQRFullscreen,
  liveError,
  liveDisabled,
  tunnelUrl,
  tunnelLoading,
  tunnelError,
  shortUrl,
  shortCode,
  customCodeInput,
  customCodeError,
  onCustomCodeChange,
  onSetCustomCode,
}: VotingViewProps) {
  const totalVotesAll = questions.reduce((sum, q) => sum + q.options.reduce((s, o) => s + o.votes, 0), 0);
  const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set());
  const animTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const longPressTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [directInputKey, setDirectInputKey] = useState<{ questionId: string; optionId: string } | null>(null);
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
    if (directInputKey && directInputRef.current) {
      directInputRef.current.focus();
      directInputRef.current.select();
    }
  }, [directInputKey]);

  const handleVoteClick = useCallback((questionId: string, optionId: string) => {
    if (!isOpen) return;
    onVote(questionId, optionId, 1);

    const key = `${questionId}-${optionId}`;
    setAnimatingIds((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    const existing = animTimers.current.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      setAnimatingIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      animTimers.current.delete(key);
    }, 300);
    animTimers.current.set(key, timer);
  }, [isOpen, onVote]);

  const handlePointerDown = useCallback((questionId: string, optionId: string, currentVotes: number) => {
    if (!isOpen) return;
    const key = `${questionId}-${optionId}`;
    const timer = setTimeout(() => {
      setDirectInputValue(String(currentVotes));
      setDirectInputKey({ questionId, optionId });
      longPressTimers.current.delete(key);
    }, 500);
    longPressTimers.current.set(key, timer);
  }, [isOpen]);

  const handlePointerUp = useCallback((questionId: string, optionId: string) => {
    const key = `${questionId}-${optionId}`;
    const timer = longPressTimers.current.get(key);
    if (timer) {
      clearTimeout(timer);
      longPressTimers.current.delete(key);
    }
  }, []);

  const handleDirectInputConfirm = useCallback(() => {
    if (directInputKey === null) return;
    const val = parseInt(directInputValue, 10);
    if (!isNaN(val) && val >= 0) {
      const q = questions.find((qq) => qq.id === directInputKey.questionId);
      const opt = q?.options.find((o) => o.id === directInputKey.optionId);
      if (opt) {
        onVote(directInputKey.questionId, directInputKey.optionId, val - opt.votes);
      }
    }
    setDirectInputKey(null);
    setDirectInputValue('');
  }, [directInputKey, directInputValue, questions, onVote]);

  return (
    <div className="w-full flex flex-col h-full min-h-0 gap-4">
      {/* Live vote panel */}
      {isLiveMode && liveServerInfo && (
        <LiveVotePanel
          serverInfo={liveServerInfo}
          connectedStudents={connectedStudents}
          onStop={onStopLive}
          isFullscreen={isFullscreen}
          showQRFullscreen={showQRFullscreen}
          onToggleQRFullscreen={onToggleQRFullscreen}
          tunnelUrl={tunnelUrl}
          tunnelLoading={tunnelLoading}
          tunnelError={tunnelError}
          shortUrl={shortUrl}
          shortCode={shortCode}
          customCodeInput={customCodeInput}
          customCodeError={customCodeError}
          onCustomCodeChange={onCustomCodeChange}
          onSetCustomCode={onSetCustomCode}
        />
      )}

      {/* Live vote error */}
      {liveError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm shrink-0">
          {liveError}
        </div>
      )}

      {/* Question cards */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-6">
        {questions.map((q, qIdx) => {
          const totalVotes = q.options.reduce((sum, o) => sum + o.votes, 0);
          const maxVotes = Math.max(...q.options.map((o) => o.votes), 1);

          return (
            <div key={q.id} className="flex flex-col gap-3">
              {/* Question title */}
              <div className="text-center shrink-0">
                <h2 className={`font-bold text-sp-text ${isFullscreen ? 'text-4xl' : 'text-2xl'}`}>
                  {questions.length > 1 && <span className="text-sp-accent mr-2">Q{qIdx + 1}.</span>}
                  {q.question}
                </h2>
              </div>

              {/* Option cards */}
              <div className="flex flex-col gap-3">
                {q.options.map((option) => {
                  const percent = totalVotes > 0 ? (option.votes / totalVotes) * 100 : 0;
                  const barWidth = totalVotes > 0 ? (option.votes / maxVotes) * 100 : 0;
                  const animKey = `${q.id}-${option.id}`;
                  const isAnimating = animatingIds.has(animKey);

                  return (
                    <div
                      key={option.id}
                      className={`relative bg-sp-card border border-sp-border rounded-xl overflow-hidden transition-all ${
                        isOpen ? 'cursor-pointer hover:border-white/20 active:scale-[0.99]' : ''
                      } ${isFullscreen ? 'py-5 px-6' : 'py-4 px-5'}`}
                      onClick={() => handleVoteClick(q.id, option.id)}
                      onPointerDown={() => handlePointerDown(q.id, option.id, option.votes)}
                      onPointerUp={() => handlePointerUp(q.id, option.id)}
                      onPointerLeave={() => handlePointerUp(q.id, option.id)}
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
                        <div
                          className="w-4 h-4 rounded-full shrink-0"
                          style={{ backgroundColor: option.color }}
                        />
                        <span className={`font-medium text-sp-text flex-1 ${isFullscreen ? 'text-2xl' : 'text-xl'}`}>
                          {option.text}
                        </span>

                        {/* +1 button */}
                        {isOpen && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleVoteClick(q.id, option.id);
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

                        {/* Vote count badge (hidden when showResults is false) */}
                        {showResults && (
                          <span
                            className={`shrink-0 font-bold font-mono transition-transform duration-300 ${
                              isAnimating ? 'scale-125' : 'scale-100'
                            } ${isFullscreen ? 'text-2xl min-w-[3rem] text-right' : 'text-lg min-w-[2.5rem] text-right'}`}
                            style={{ color: option.color }}
                          >
                            {option.votes}
                          </span>
                        )}

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

              {/* Per-question total (when results visible and multi-question) */}
              {showResults && questions.length > 1 && (
                <div className="text-right">
                  <span className="text-sp-muted text-xs">
                    소계: <span className="text-sp-text font-bold">{totalVotes}표</span>
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Direct input modal */}
      {directInputKey !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setDirectInputKey(null)}>
          <div className="bg-sp-card border border-sp-border rounded-2xl p-6 w-72 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sp-text font-bold text-lg text-center">몇 명?</h3>
            <input
              ref={directInputRef}
              type="number"
              value={directInputValue}
              onChange={(e) => setDirectInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleDirectInputConfirm();
                if (e.key === 'Escape') setDirectInputKey(null);
              }}
              min={0}
              className="bg-sp-bg border border-sp-border rounded-xl px-4 py-3 text-2xl text-sp-text text-center font-mono focus:border-sp-accent focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setDirectInputKey(null)}
                className="flex-1 py-2.5 rounded-xl bg-sp-bg border border-sp-border text-sp-muted hover:text-sp-text transition-colors"
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
          총 <span className="text-sp-text font-bold">{totalVotesAll}표</span>
        </span>
        {/* Student live vote toggle */}
        <div className="relative group">
          <button
            onClick={isLiveMode ? onStopLive : onStartLive}
            disabled={liveDisabled && !isLiveMode}
            className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
              isLiveMode
                ? 'bg-green-500/20 border-green-500/30 text-green-400 hover:bg-green-500/30'
                : liveDisabled
                  ? 'bg-sp-card border-sp-border text-sp-muted opacity-50 cursor-not-allowed'
                  : 'bg-sp-card border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-text/5'
            }`}
          >
            {isLiveMode ? `\u{1F4F1} 학생 설문 중 (${connectedStudents}명)` : '\u{1F4F1} 학생 설문'}
          </button>
          {liveDisabled && !isLiveMode && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-sp-card border border-sp-border rounded-lg text-xs text-sp-muted whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              복수 문항에서는 학생 설문을 지원하지 않습니다
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleResults}
            className="px-4 py-2 rounded-xl bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-all text-sm font-medium"
          >
            {showResults ? '\u{1F441}\uFE0F 결과 숨기기' : '\u{1F441}\uFE0F 결과 보기'}
          </button>
          {isOpen ? (
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-all text-sm font-medium"
            >
              {'\u{1F512}'} 설문 종료
            </button>
          ) : (
            <button
              onClick={onShowFinalResults}
              className="px-4 py-2 rounded-xl bg-sp-accent text-white font-bold hover:bg-sp-accent/80 transition-all text-sm"
            >
              {'\u{1F4CA}'} 결과 보기
            </button>
          )}
          <button
            onClick={onReset}
            className="px-4 py-2 rounded-xl bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-all text-sm font-medium"
          >
            {'\u{1F5D1}\uFE0F'} 초기화
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────── Results View ───────────────── */

interface ResultsViewProps {
  questions: PollQuestion[];
  isFullscreen: boolean;
  onRevote: () => void;
  onNewPoll: () => void;
}

function ResultsView({ questions, isFullscreen, onRevote, onNewPoll }: ResultsViewProps) {
  const totalVotesAll = questions.reduce((sum, q) => sum + q.options.reduce((s, o) => s + o.votes, 0), 0);
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="w-full flex flex-col h-full min-h-0 gap-6">
      {/* Question results */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-8">
        {questions.map((q, qIdx) => {
          const totalVotes = q.options.reduce((sum, o) => sum + o.votes, 0);
          const maxVotes = Math.max(...q.options.map((o) => o.votes), 1);
          const winnerVotes = Math.max(...q.options.map((o) => o.votes));

          return (
            <div key={q.id} className="flex flex-col gap-4">
              {/* Question */}
              <div className="text-center shrink-0">
                <h2 className={`font-bold text-sp-text ${isFullscreen ? 'text-4xl' : 'text-2xl'}`}>
                  {questions.length > 1 && <span className="text-sp-accent mr-2">Q{qIdx + 1}.</span>}
                  {q.question}
                </h2>
              </div>

              {/* Bar chart */}
              <div className="flex flex-col gap-3 justify-center">
                {q.options.map((option, index) => {
                  const percent = totalVotes > 0 ? (option.votes / totalVotes) * 100 : 0;
                  const barWidth = totalVotes > 0 ? (option.votes / maxVotes) * 100 : 0;
                  const isWinner = option.votes === winnerVotes && totalVotes > 0;

                  return (
                    <div
                      key={option.id}
                      className="flex flex-col gap-1"
                      style={{ animationDelay: `${index * 100}ms` }}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: option.color }}
                        />
                        <span className={`font-medium text-sp-text ${isFullscreen ? 'text-xl' : 'text-base'}`}>
                          {option.text}
                        </span>
                        {isWinner && <span className="text-yellow-400">{'\u{1F451}'}</span>}
                      </div>

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
                              <span className="text-sm font-medium text-sp-text whitespace-nowrap">
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

              {/* Per-question total (multi-question) */}
              {questions.length > 1 && (
                <div className="text-center">
                  <span className="text-sp-muted text-sm">
                    소계: <span className="text-sp-text font-bold">{totalVotes}표</span>
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Total */}
      <div className="text-center shrink-0">
        <span className="text-sp-muted">
          총 <span className="text-sp-text font-bold text-lg">{totalVotesAll}표</span>
        </span>
      </div>

      {/* Bottom buttons */}
      <div className="flex items-center justify-center gap-3 shrink-0 pb-1">
        <button
          onClick={onRevote}
          className="px-5 py-2.5 rounded-xl bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-all text-sm font-medium"
        >
          {'\u{1F4CA}'} 다시 설문
        </button>
        <button
          onClick={onNewPoll}
          className="px-5 py-2.5 rounded-xl bg-sp-accent text-white font-bold hover:bg-sp-accent/80 transition-all text-sm"
        >
          {'\u{1F195}'} 새 설문
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
  const [questions, setQuestions] = useState<PollQuestion[]>([]);
  const [isOpen, setIsOpen] = useState(true);
  const [showResults, setShowResults] = useState(false);
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

  const isMultiQuestion = questions.length > 1;

  const handleStart = useCallback((qs: PollQuestion[]) => {
    setQuestions(qs);
    setIsOpen(true);
    setShowResults(false);
    setViewMode('voting');
  }, []);

  const handleVote = useCallback((questionId: string, optionId: string, delta: number) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== questionId) return q;
        return {
          ...q,
          options: q.options.map((o) => {
            if (o.id !== optionId) return o;
            const newVotes = Math.max(0, o.votes + delta);
            return { ...o, votes: newVotes };
          }),
        };
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
    setQuestions((prev) =>
      prev.map((q) => ({
        ...q,
        options: q.options.map((o) => ({ ...o, votes: 0 })),
      }))
    );
    setIsOpen(true);
    setShowResults(false);
    setViewMode('voting');
  }, []);

  const handleStartLive = useCallback(async () => {
    try {
      setLiveError(null);

      if (isMultiQuestion) {
        // Multi-question: use liveMultiSurvey IPC
        if (!window.electronAPI?.startLiveMultiSurvey) {
          setLiveError('학생 설문 기능은 데스크톱 앱에서만 사용할 수 있습니다.');
          return;
        }
        const surveyQuestions = questions.map((q) => ({
          id: q.id,
          type: 'single-choice' as const,
          question: q.question,
          required: true,
          options: q.options.map((o) => ({ id: o.id, text: o.text })),
        }));
        const info = await window.electronAPI.startLiveMultiSurvey({ questions: surveyQuestions });
        if (info.localIPs.length === 0) {
          setLiveError('Wi-Fi에 연결되어 있지 않습니다. 학생들과 같은 네트워크에 연결해주세요.');
          return;
        }
        setLiveServerInfo(info);
        setIsLiveMode(true);
        setConnectedStudents(0);
        setTunnelLoading(true);
        setTunnelError(null);
        try {
          const available = await window.electronAPI.multiSurveyTunnelAvailable();
          if (!available) await window.electronAPI.multiSurveyTunnelInstall();
          const result = await window.electronAPI.multiSurveyTunnelStart();
          setTunnelUrl(result.tunnelUrl);
          setShortUrl(null);
          setShortCode(null);
          void liveSessionClientRef.current.registerSession(result.tunnelUrl).then((session) => {
            if (session) { setShortUrl(session.shortUrl); setShortCode(session.code); }
          });
        } catch {
          setTunnelError('인터넷 연결에 실패했습니다. Wi-Fi로 접속하거나 네트워크를 확인해주세요.');
        } finally {
          setTunnelLoading(false);
        }
      } else {
        // Single question: use liveVote IPC
        if (!window.electronAPI?.startLiveVote) {
          setLiveError('학생 설문 기능은 데스크톱 앱에서만 사용할 수 있습니다.');
          return;
        }
        const firstQ = questions[0];
        if (!firstQ) return;
        const data = firstQ.options.map((o) => ({ id: o.id, text: o.text, color: o.color }));
        const info = await window.electronAPI.startLiveVote({ question: firstQ.question, options: data });
        if (info.localIPs.length === 0) {
          setLiveError('Wi-Fi에 연결되어 있지 않습니다. 학생들과 같은 네트워크에 연결해주세요.');
          return;
        }
        setLiveServerInfo(info);
        setIsLiveMode(true);
        setConnectedStudents(0);
        setTunnelLoading(true);
        setTunnelError(null);
        try {
          const available = await window.electronAPI.tunnelAvailable();
          if (!available) await window.electronAPI.tunnelInstall();
          const result = await window.electronAPI.tunnelStart();
          setTunnelUrl(result.tunnelUrl);
          setShortUrl(null);
          setShortCode(null);
          void liveSessionClientRef.current.registerSession(result.tunnelUrl).then((session) => {
            if (session) { setShortUrl(session.shortUrl); setShortCode(session.code); }
          });
        } catch {
          setTunnelError('인터넷 연결에 실패했습니다. Wi-Fi로 접속하거나 네트워크를 확인해주세요.');
        } finally {
          setTunnelLoading(false);
        }
      }
    } catch {
      setLiveError('학생 설문 서버를 시작할 수 없습니다.');
    }
  }, [questions, isMultiQuestion]);

  const handleStopLive = useCallback(async () => {
    if (isMultiQuestion) {
      if (window.electronAPI?.stopLiveMultiSurvey) await window.electronAPI.stopLiveMultiSurvey();
    } else {
      if (window.electronAPI?.stopLiveVote) await window.electronAPI.stopLiveVote();
    }
    setIsLiveMode(false);
    setLiveServerInfo(null);
    setConnectedStudents(0);
    setShowQRFullscreen(false);
    setLiveError(null);
    setTunnelUrl(null);
    setTunnelLoading(false);
    setTunnelError(null);
    setShortUrl(null);
    setShortCode(null);
    setCustomCodeInput('');
    setCustomCodeError(null);
  }, [isMultiQuestion]);

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
    setQuestions([]);
    setIsOpen(true);
    setShowResults(false);
  }, [isLiveMode, handleStopLive]);

  const handleToggleQRFullscreen = useCallback(() => {
    setShowQRFullscreen((prev) => !prev);
  }, []);

  // Live vote IPC event listeners — single question uses liveVote, multi uses liveMultiSurvey
  useEffect(() => {
    if (!isLiveMode || !window.electronAPI) return;

    if (isMultiQuestion) {
      // Multi-question: listen to liveMultiSurvey events
      const unsubSubmitted = window.electronAPI.onLiveMultiSurveyStudentSubmitted?.((data) => {
        for (const ans of data.answers) {
          if (typeof ans.value === 'string') {
            // single-choice: value is the optionId
            handleVote(ans.questionId, ans.value, 1);
          }
        }
      });
      const unsubCount = window.electronAPI.onLiveMultiSurveyConnectionCount?.((data) => {
        setConnectedStudents(data.count);
      });
      return () => { unsubSubmitted?.(); unsubCount?.(); };
    } else {
      // Single question: use liveVote events
      const firstQId = questions[0]?.id;
      if (!firstQId) return;
      const unsubVoted = window.electronAPI.onLiveVoteStudentVoted?.((data) => {
        handleVote(firstQId, data.optionId, 1);
      });
      const unsubCount = window.electronAPI.onLiveVoteConnectionCount?.((data) => {
        setConnectedStudents(data.count);
      });
      return () => { unsubVoted?.(); unsubCount?.(); };
    }
  }, [isLiveMode, isMultiQuestion, questions, handleVote]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (window.electronAPI?.stopLiveVote) window.electronAPI.stopLiveVote();
      if (window.electronAPI?.stopLiveMultiSurvey) window.electronAPI.stopLiveMultiSurvey();
    };
  }, []);

  return (
    <ToolLayout title="객관식 설문" emoji={'\u{1F4CA}'} onBack={onBack} isFullscreen={isFullscreen}>
      {viewMode === 'create' && (
        <CreateView isFullscreen={isFullscreen} onStart={handleStart} />
      )}
      {viewMode === 'voting' && (
        <VotingView
          questions={questions}
          isOpen={isOpen}
          showResults={showResults}
          isFullscreen={isFullscreen}
          onVote={handleVote}
          onToggleResults={handleToggleResults}
          onClose={handleClose}
          onReset={handleReset}
          onShowFinalResults={handleShowFinalResults}
          isLiveMode={isLiveMode}
          liveServerInfo={liveServerInfo}
          connectedStudents={connectedStudents}
          onStartLive={handleStartLive}
          onStopLive={handleStopLive}
          showQRFullscreen={showQRFullscreen}
          onToggleQRFullscreen={handleToggleQRFullscreen}
          liveError={liveError}
          liveDisabled={false}
          tunnelUrl={tunnelUrl}
          tunnelLoading={tunnelLoading}
          tunnelError={tunnelError}
          shortUrl={shortUrl}
          shortCode={shortCode}
          customCodeInput={customCodeInput}
          customCodeError={customCodeError}
          onCustomCodeChange={setCustomCodeInput}
          onSetCustomCode={handleSetCustomCode}
        />
      )}
      {viewMode === 'results' && (
        <ResultsView
          questions={questions}
          isFullscreen={isFullscreen}
          onRevote={handleRevote}
          onNewPoll={handleReset}
        />
      )}
    </ToolLayout>
  );
}
