import { useState, useCallback, useRef, useEffect, Fragment } from 'react';
import { ToolLayout } from './ToolLayout';
import QRCode from 'qrcode';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import { LiveSessionClient } from '@infrastructure/supabase/LiveSessionClient';
import { TemplateSaveModal, TemplateLoadDropdown, ResultSaveButton, PastResultsView } from './TemplateManager';
import { useToolTemplateStore } from '@adapters/stores/useToolTemplateStore';
import type { ToolTemplate } from '@domain/entities/ToolTemplate';
import type { MultiSurveyQuestion } from '@domain/entities/MultiSurvey';
import { TeacherControlPanel } from './TeacherControlPanel';
import type { RosterEntry, TextAnswerEntry } from './TeacherControlPanel';

interface ToolSurveyProps {
  onBack: () => void;
  isFullscreen: boolean;
}

type ViewMode = 'create' | 'surveying' | 'results';

interface SurveyQuestion {
  id: string;
  question: string;
  maxLength: number;
}

interface SurveySubmission {
  id: string;
  answers: { questionId: string; text: string }[];
  submittedAt: number;
}

const MAX_LENGTH_OPTIONS = [50, 100, 200, 500] as const;
const MAX_QUESTIONS = 10;

const EXAMPLE_QUESTIONS = [
  '이번 수업에서 가장 기억에 남는 내용은?',
  '이 주제에 대해 어떻게 생각하나요?',
  '오늘 수업에서 궁금한 점이 있나요?',
  '이번 활동에서 배운 점을 한 문장으로 정리해보세요.',
  '수업 개선을 위한 아이디어가 있나요?',
];

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultSurveyQuestion(): SurveyQuestion {
  return { id: uid(), question: '', maxLength: 200 };
}

/* ───────────────── Create View ───────────────── */

interface CreateViewProps {
  isFullscreen: boolean;
  onStart: (questions: SurveyQuestion[]) => void;
  onSaveRequest?: (question: string, maxLength: number) => void;
  onLoadTemplate?: (template: ToolTemplate) => void;
  loadedDraft?: { question: string; maxLength: number } | null;
  onShowPastResults?: () => void;
  stepMode: boolean;
  onStepModeChange: (v: boolean) => void;
}

function CreateView({ isFullscreen, onStart, onSaveRequest, onLoadTemplate, loadedDraft, onShowPastResults, stepMode, onStepModeChange }: CreateViewProps) {
  const [questions, setQuestions] = useState<SurveyQuestion[]>([defaultSurveyQuestion()]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [exampleIdx, setExampleIdx] = useState(-1);

  // Apply loadedDraft when it changes
  useEffect(() => {
    if (!loadedDraft) return;
    setQuestions([{ id: uid(), question: loadedDraft.question, maxLength: loadedDraft.maxLength }]);
    setActiveIdx(0);
  }, [loadedDraft]);

  const canStart = questions.some((q) => q.question.trim().length > 0);

  const updateQuestion = useCallback((idx: number, patch: Partial<SurveyQuestion>) => {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  }, []);

  const addQuestion = useCallback(() => {
    setQuestions((prev) => {
      if (prev.length >= MAX_QUESTIONS) return prev;
      const next = [...prev, defaultSurveyQuestion()];
      setActiveIdx(next.length - 1);
      return next;
    });
  }, []);

  const removeQuestion = useCallback((idx: number) => {
    setQuestions((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((_, i) => i !== idx);
      setActiveIdx((cur) => Math.min(cur, next.length - 1));
      return next;
    });
  }, []);

  const moveQuestion = useCallback((idx: number, dir: -1 | 1) => {
    setQuestions((prev) => {
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target]!, next[idx]!];
      setActiveIdx(target);
      return next;
    });
  }, []);

  const handleExampleClick = useCallback(() => {
    const nextIdx = (exampleIdx + 1) % EXAMPLE_QUESTIONS.length;
    setExampleIdx(nextIdx);
    updateQuestion(activeIdx, { question: EXAMPLE_QUESTIONS[nextIdx]! });
  }, [exampleIdx, activeIdx, updateQuestion]);

  const handleStart = useCallback(() => {
    if (!canStart) return;
    const valid = questions.filter((q) => q.question.trim().length > 0);
    onStart(valid);
  }, [canStart, questions, onStart]);

  const active = questions[activeIdx];

  return (
    <div className={`w-full max-w-2xl mx-auto flex flex-col ${isFullscreen ? 'h-full min-h-0 gap-4' : 'gap-5'}`}>
      {/* Question tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {questions.map((q, idx) => (
          <button
            key={q.id}
            onClick={() => setActiveIdx(idx)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              idx === activeIdx
                ? 'bg-sp-accent/20 border border-sp-accent text-sp-accent'
                : q.question.trim()
                  ? 'bg-sp-card border border-sp-border text-sp-text hover:border-sp-accent/50'
                  : 'bg-sp-card border border-sp-border text-sp-muted hover:border-sp-accent/50'
            }`}
          >
            Q{idx + 1}
          </button>
        ))}
        {questions.length < MAX_QUESTIONS && (
          <button
            onClick={addQuestion}
            className="px-3 py-1.5 rounded-xl border border-dashed border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent text-sm transition-all"
          >
            + 문항 추가
          </button>
        )}
      </div>

      {/* Active question editor */}
      {active && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sp-muted text-sm font-bold shrink-0">Q{activeIdx + 1}</span>
            <input
              type="text"
              value={active.question}
              onChange={(e) => updateQuestion(activeIdx, { question: e.target.value })}
              placeholder="질문을 입력하세요"
              className="flex-1 bg-sp-bg border border-sp-border rounded-xl px-4 py-3 text-xl text-sp-text placeholder-sp-muted focus:border-sp-accent focus:outline-none transition-colors"
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

          {/* Max length selector */}
          <div className="flex flex-col gap-2">
            <span className="text-sm text-sp-muted font-medium">최대 글자 수</span>
            <div className="flex gap-2">
              {MAX_LENGTH_OPTIONS.map((len) => (
                <button
                  key={len}
                  onClick={() => updateQuestion(activeIdx, { maxLength: len })}
                  className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
                    active.maxLength === len
                      ? 'bg-sp-accent/20 border-sp-accent text-sp-accent'
                      : 'bg-sp-card border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent/50'
                  }`}
                >
                  {len}자
                </button>
              ))}
            </div>
            <p className="text-xs text-sp-muted mt-1">
              {active.maxLength <= 50 ? '짧은 한 문장' : active.maxLength <= 100 ? '1~2문장 분량' : active.maxLength <= 200 ? '2~3문장 분량' : '긴 서술형'}
            </p>
          </div>

          {/* Move / Delete buttons */}
          {questions.length > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => moveQuestion(activeIdx, -1)}
                disabled={activeIdx === 0}
                className="px-3 py-1.5 rounded-lg bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text text-sm disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                ↑ 위로
              </button>
              <button
                onClick={() => moveQuestion(activeIdx, 1)}
                disabled={activeIdx === questions.length - 1}
                className="px-3 py-1.5 rounded-lg bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text text-sm disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                ↓ 아래로
              </button>
              <div className="flex-1" />
              <button
                onClick={() => removeQuestion(activeIdx)}
                className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 text-sm transition-all"
              >
                🗑️ 삭제
              </button>
            </div>
          )}
        </div>
      )}

      {/* 내 템플릿 */}
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        {onLoadTemplate && (
          <TemplateLoadDropdown toolType="survey" onLoad={onLoadTemplate} />
        )}
        {onSaveRequest && (
          <button
            onClick={() => {
              const activeQ = questions[activeIdx];
              if (activeQ) onSaveRequest(activeQ.question, activeQ.maxLength);
            }}
            disabled={!canStart}
            className="px-4 py-2 rounded-xl bg-sp-card border border-sp-border text-sm text-sp-muted hover:text-sp-text hover:border-sp-accent/50 transition-all disabled:opacity-40"
          >
            💾 현재 문항 저장
          </button>
        )}
        {onShowPastResults && (
          <button
            onClick={onShowPastResults}
            className="px-4 py-2 rounded-xl bg-sp-card border border-sp-border text-sm text-sp-muted hover:text-sp-text hover:border-sp-accent/50 transition-all"
          >
            📊 지난 결과
          </button>
        )}
      </div>

      {/* Question summary preview */}
      {questions.length > 1 && (
        <div className="bg-sp-bg border border-sp-border rounded-xl p-3 mt-3">
          <p className="text-xs text-sp-muted mb-2 font-medium">전체 문항 미리보기</p>
          <div className="flex flex-col gap-1">
            {questions.map((q, i) => (
              <p key={i} className={`text-xs ${q.question.trim() ? 'text-sp-text' : 'text-red-400'}`}>
                Q{i + 1}. {q.question.trim() || '(질문 미입력)'}
                <span className="text-sp-muted ml-1">({q.maxLength}자)</span>
              </p>
            ))}
          </div>
        </div>
      )}

      {/* stepMode 토글 — 다문항일 때만 표시 */}
      {questions.length >= 2 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-sp-muted font-medium shrink-0">응답 모드:</span>
          <button
            type="button"
            onClick={() => onStepModeChange(false)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
              !stepMode
                ? 'bg-sp-accent/20 border-sp-accent text-sp-accent'
                : 'bg-sp-card border-sp-border text-sp-muted hover:text-sp-text'
            }`}
          >
            📜 전체 한 화면
          </button>
          <button
            type="button"
            onClick={() => onStepModeChange(true)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
              stepMode
                ? 'bg-sp-accent/20 border-sp-accent text-sp-accent'
                : 'bg-sp-card border-sp-border text-sp-muted hover:text-sp-text'
            }`}
          >
            👨‍🏫 교사 주도 진행
          </button>
        </div>
      )}

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

function LiveSurveyPanel({
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
}: LiveSurveyPanelProps) {
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
        <p className="text-gray-800 text-xl font-bold mb-2">📝 설문 참여하기</p>
        <p className="text-gray-600 text-lg font-mono">{displayUrl}</p>
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

/* ───────────────── Surveying View ───────────────── */

interface SurveyingViewProps {
  questions: SurveyQuestion[];
  submissions: SurveySubmission[];
  isFullscreen: boolean;
  isLiveMode: boolean;
  liveServerInfo: { port: number; localIPs: string[] } | null;
  connectedStudents: number;
  onStartLive: () => void;
  onStopLive: () => void;
  showQRFullscreen: boolean;
  onToggleQRFullscreen: () => void;
  liveError: string | null;
  onFinish: () => void;
  onReset: () => void;
  tunnelUrl: string | null;
  tunnelLoading: boolean;
  tunnelError: string | null;
  shortUrl: string | null;
  shortCode: string | null;
  customCodeInput: string;
  customCodeError: string | null;
  onCustomCodeChange: (v: string) => void;
  onSetCustomCode: () => void;
  // 교사 주도 진행 모드
  stepMode: boolean;
  teacherPhase: 'lobby' | 'open' | 'revealed' | 'ended';
  teacherQuestionIndex: number;
  teacherTotalConnected: number;
  teacherTotalAnswered: number;
  teacherAggregated: AggregatedResult | undefined;
  teacherRoster: RosterEntry[];
  teacherTextDetail: TextAnswerEntry[] | undefined;
  onTeacherActivate: () => void;
  onTeacherReveal: () => void;
  onTeacherAdvance: () => void;
  onTeacherPrev: () => void;
  onTeacherReopen: () => void;
  onTeacherEnd: () => void;
}

function SurveyingView({
  questions,
  submissions,
  isFullscreen,
  isLiveMode,
  liveServerInfo,
  connectedStudents,
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
  shortUrl,
  shortCode,
  customCodeInput,
  customCodeError,
  onCustomCodeChange,
  onSetCustomCode,
  stepMode,
  teacherPhase,
  teacherQuestionIndex,
  teacherTotalConnected,
  teacherTotalAnswered,
  teacherAggregated,
  teacherRoster,
  teacherTextDetail,
  onTeacherActivate,
  onTeacherReveal,
  onTeacherAdvance,
  onTeacherPrev,
  onTeacherReopen,
  onTeacherEnd,
}: SurveyingViewProps) {
  // SurveyQuestion → MultiSurveyQuestion 변환 (TeacherControlPanel 전달용)
  const convertedQuestions: MultiSurveyQuestion[] = questions.map((q) => ({
    id: q.id,
    type: 'text' as const,
    question: q.question,
    required: true,
    maxLength: q.maxLength,
  }));

  const handleReset = useCallback(() => {
    if (submissions.length > 0) {
      if (!window.confirm('모든 응답을 초기화하고 설문을 처음부터 시작하시겠습니까?')) return;
    }
    onReset();
  }, [submissions.length, onReset]);

  const showTeacherPanel = isLiveMode && stepMode && questions.length >= 2;

  return (
    <div className="w-full flex flex-col h-full min-h-0 gap-4">
      {/* Header — teacher-driven 모드에서는 TeacherControlPanel이 자체 헤더를 가지므로 숨김 */}
      {!showTeacherPanel && (
        <div className="text-center shrink-0">
          {questions.length === 1 ? (
            <h2 className={`font-bold text-sp-text ${isFullscreen ? 'text-4xl' : 'text-2xl'}`}>
              {questions[0]!.question}
            </h2>
          ) : (
            <>
              <h2 className={`font-bold text-sp-text ${isFullscreen ? 'text-3xl' : 'text-xl'}`}>
                주관식 설문 진행 중
              </h2>
              <p className="text-sp-muted text-sm mt-1">{questions.length}개 문항</p>
            </>
          )}
        </div>
      )}

      {/* Live survey panel — stepMode=true 라이브에서는 숨김 (QR/URL은 학생 초대 모달로 이동) */}
      {isLiveMode && liveServerInfo && !showTeacherPanel && (
        <LiveSurveyPanel
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

      {liveError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm shrink-0">
          {liveError}
        </div>
      )}

      {/* 교사 주도 진행 패널 — 다문항 + stepMode + 라이브 중일 때 메인 영역 전체 차지 */}
      {showTeacherPanel && (
        <div className="flex-1 min-h-0 flex flex-col">
          <TeacherControlPanel
            phase={teacherPhase}
            currentQuestionIndex={teacherQuestionIndex}
            totalQuestions={questions.length}
            totalConnected={teacherTotalConnected}
            totalAnswered={teacherTotalAnswered}
            currentQuestion={convertedQuestions[teacherQuestionIndex]}
            aggregated={teacherAggregated}
            roster={teacherRoster}
            textAnswerDetail={teacherTextDetail}
            liveDisplayUrl={shortUrl ?? tunnelUrl ?? undefined}
            liveFullUrl={tunnelUrl ?? undefined}
            liveShortUrl={shortUrl ?? undefined}
            liveTunnelLoading={tunnelLoading}
            onActivate={onTeacherActivate}
            onReveal={onTeacherReveal}
            onAdvance={onTeacherAdvance}
            onPrev={onTeacherPrev}
            onReopen={onTeacherReopen}
            onEnd={onTeacherEnd}
          />
        </div>
      )}

      {/* Submission feed — stepMode=false 또는 단문항일 때만 (회귀 방지) */}
      {!showTeacherPanel && (
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
          {submissions.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sp-muted text-center">
                아직 응답이 없습니다.<br />
                <span className="text-sm">학생들이 응답하면 여기에 표시됩니다.</span>
              </p>
            </div>
          ) : (
            submissions.map((sub, idx) => (
              <div
                key={sub.id}
                className="bg-sp-card border border-sp-border rounded-lg px-4 py-2.5 flex items-center gap-3"
              >
                <span className="text-sp-accent font-mono text-sm font-bold">
                  #{submissions.length - idx}
                </span>
                <span className="text-sp-text text-sm">학생 제출 완료</span>
                <span className="text-sp-muted text-xs ml-auto">
                  {new Date(sub.submittedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Bottom bar — teacher-driven 모드에서는 숨김 (세션 종료는 TeacherControlPanel에서) */}
      {!showTeacherPanel && (
        <div className="flex items-center justify-between shrink-0 pb-1">
          <span className="text-sp-muted text-sm font-medium">
            📝 <span className="text-sp-text font-bold">{submissions.length}명</span> 응답
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
              className="px-4 py-2 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-400 hover:bg-orange-500/20 transition-all text-sm font-bold"
            >
              설문 종료 → 결과 보기
            </button>

            <button
              onClick={handleReset}
              className="px-4 py-2 rounded-xl bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-all text-sm font-medium"
            >
              🗑️ 초기화
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────────── Results View ───────────────── */

interface ResultsViewProps {
  questions: SurveyQuestion[];
  submissions: SurveySubmission[];
  isFullscreen: boolean;
  onNewSurvey: () => void;
  resultSaveButton?: React.ReactNode;
  /** 교사 주도 모드(stepMode=true) 세션에서 수집된 문항별 aggregated 답변.
   *  존재하면 submissions 기반 목록을 완전히 대체해서 표시한다. (Bug #B) */
  teacherAggregatedByQuestion?: Record<string, AggregatedResult>;
  /** 교사 주도 모드 총 접속 학생 수(헤더 표시용) */
  teacherTotalConnected?: number;
}

function ResultsView({ questions, submissions, isFullscreen, onNewSurvey, resultSaveButton, teacherAggregatedByQuestion, teacherTotalConnected }: ResultsViewProps) {
  // 교사 주도 모드 집계가 있으면 submissions 기반 로직을 우회한다.
  const hasTeacherAggregated = teacherAggregatedByQuestion !== undefined
    && Object.keys(teacherAggregatedByQuestion).length > 0;
  const headerTotal = hasTeacherAggregated
    ? (teacherTotalConnected ?? 0)
    : submissions.length;

  // 교사 집계에서 문항별 답변 리스트 추출 (주관식만 사용)
  const getTeacherTexts = (qId: string): string[] | null => {
    const agg = teacherAggregatedByQuestion?.[qId];
    if (!agg) return null;
    if ('answers' in agg) return agg.answers;
    return null;
  };

  return (
    <div className="w-full flex flex-col h-full min-h-0 gap-6">
      {/* Single question: show question as header */}
      {questions.length === 1 && (
        <div className="text-center shrink-0">
          <h2 className={`font-bold text-sp-text ${isFullscreen ? 'text-4xl' : 'text-2xl'}`}>
            {questions[0]!.question}
          </h2>
        </div>
      )}

      {/* Responses */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4">
        {hasTeacherAggregated ? (
          /* 교사 주도 모드: 각 문항의 aggregated.answers 를 그대로 렌더 */
          questions.length === 1 ? (
            (() => {
              const texts = getTeacherTexts(questions[0]!.id) ?? [];
              if (texts.length === 0) {
                return (
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-sp-muted">응답이 없습니다.</p>
                  </div>
                );
              }
              return texts.map((text, idx) => (
                <div
                  key={`teacher-${idx}`}
                  className="bg-sp-card border border-sp-border rounded-xl p-4"
                >
                  <div className="flex items-start gap-3">
                    <span className={`shrink-0 font-mono text-sp-muted font-bold ${isFullscreen ? 'text-base' : 'text-sm'}`}>
                      #{texts.length - idx}
                    </span>
                    <p className={`text-sp-text flex-1 leading-relaxed ${isFullscreen ? 'text-lg' : 'text-base'}`}>
                      {text}
                    </p>
                  </div>
                </div>
              ));
            })()
          ) : (
            questions.map((q, qIdx) => {
              const texts = getTeacherTexts(q.id) ?? [];
              return (
                <div key={q.id} className="flex flex-col gap-2">
                  <h3 className={`font-bold text-sp-text ${isFullscreen ? 'text-xl' : 'text-lg'}`}>
                    Q{qIdx + 1}. {q.question}
                  </h3>
                  <div className="flex flex-col gap-2 ml-2">
                    {texts.length === 0 ? (
                      <p className="text-sp-muted text-sm ml-2">응답이 없습니다.</p>
                    ) : (
                      texts.map((text, tIdx) => (
                        <div
                          key={`teacher-${q.id}-${tIdx}`}
                          className="bg-sp-card border border-sp-border rounded-lg px-4 py-3"
                        >
                          <div className="flex items-start gap-3">
                            <span className="shrink-0 font-mono text-sp-muted font-bold text-sm">
                              #{texts.length - tIdx}
                            </span>
                            <p className="text-sp-text flex-1 leading-relaxed text-base">
                              {text}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })
          )
        ) : submissions.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sp-muted">응답이 없습니다.</p>
          </div>
        ) : questions.length === 1 ? (
          /* Single question — flat list like before */
          submissions.map((sub, idx) => {
            const answer = sub.answers.find((a) => a.questionId === questions[0]!.id);
            return (
              <div
                key={sub.id}
                className="bg-sp-card border border-sp-border rounded-xl p-4"
              >
                <div className="flex items-start gap-3">
                  <span className={`shrink-0 font-mono text-sp-muted font-bold ${isFullscreen ? 'text-base' : 'text-sm'}`}>
                    #{submissions.length - idx}
                  </span>
                  <p className={`text-sp-text flex-1 leading-relaxed ${isFullscreen ? 'text-lg' : 'text-base'}`}>
                    {answer?.text ?? ''}
                  </p>
                </div>
              </div>
            );
          })
        ) : (
          /* Multi question — group by question */
          questions.map((q, qIdx) => (
            <div key={q.id} className="flex flex-col gap-2">
              <h3 className={`font-bold text-sp-text ${isFullscreen ? 'text-xl' : 'text-lg'}`}>
                Q{qIdx + 1}. {q.question}
              </h3>
              <div className="flex flex-col gap-2 ml-2">
                {submissions.map((sub, sIdx) => {
                  const answer = sub.answers.find((a) => a.questionId === q.id);
                  if (!answer || !answer.text.trim()) return null;
                  return (
                    <div
                      key={sub.id}
                      className="bg-sp-card border border-sp-border rounded-lg px-4 py-3"
                    >
                      <div className="flex items-start gap-3">
                        <span className="shrink-0 font-mono text-sp-muted font-bold text-sm">
                          #{submissions.length - sIdx}
                        </span>
                        <p className="text-sp-text flex-1 leading-relaxed text-base">
                          {answer.text}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {submissions.every((sub) => !sub.answers.find((a) => a.questionId === q.id)?.text.trim()) && (
                  <p className="text-sp-muted text-sm ml-2">응답이 없습니다.</p>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Total */}
      <div className="text-center shrink-0">
        <span className="text-sp-muted">
          총 <span className="text-sp-text font-bold text-lg">{headerTotal}명</span> 응답
        </span>
      </div>

      {/* Bottom buttons */}
      <div className="flex items-center justify-center gap-3 shrink-0 pb-1 flex-wrap">
        <button
          onClick={onNewSurvey}
          className="px-5 py-2.5 rounded-xl bg-sp-accent text-white font-bold hover:bg-sp-accent/80 transition-all text-sm"
        >
          🆕 새 설문
        </button>
        {resultSaveButton}
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
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [showPastResults, setShowPastResults] = useState(false);
  const [loadedDraft, setLoadedDraft] = useState<{ question: string; maxLength: number } | null>(null);
  const [pendingSave, setPendingSave] = useState<{ question: string; maxLength: number } | null>(null);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [submissions, setSubmissions] = useState<SurveySubmission[]>([]);

  // Live mode state
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [liveServerInfo, setLiveServerInfo] = useState<{ port: number; localIPs: string[] } | null>(null);
  const [connectedStudents, setConnectedStudents] = useState(0);
  const [showQRFullscreen, setShowQRFullscreen] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  // Tunnel state
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [tunnelLoading, setTunnelLoading] = useState(false);
  const [tunnelError, setTunnelError] = useState<string | null>(null);
  const [shortUrl, setShortUrl] = useState<string | null>(null);
  const [shortCode, setShortCode] = useState<string | null>(null);
  const [customCodeInput, setCustomCodeInput] = useState('');
  const [customCodeError, setCustomCodeError] = useState<string | null>(null);
  const liveSessionClientRef = useRef(new LiveSessionClient());

  // stepMode — 다문항 + 교사 주도 진행 모드 (기본값 false, 기존 동작 유지)
  const [stepMode, setStepMode] = useState(false);

  // 교사 주도 진행 모드 상태 (stepMode=true + 다문항일 때 활성)
  const [teacherPhase, setTeacherPhase] = useState<'lobby' | 'open' | 'revealed' | 'ended'>('lobby');
  const [teacherQuestionIndex, setTeacherQuestionIndex] = useState(0);
  const [teacherTotalConnected, setTeacherTotalConnected] = useState(0);
  const [teacherTotalAnswered, setTeacherTotalAnswered] = useState(0);
  const [teacherAggregated, setTeacherAggregated] = useState<AggregatedResult | undefined>(undefined);
  const [teacherRoster, setTeacherRoster] = useState<RosterEntry[]>([]);
  const [teacherTextDetail, setTeacherTextDetail] = useState<TextAnswerEntry[] | undefined>(undefined);
  // Bug #B: 교사 주도 모드에서 각 문항의 REVEALED 시점에 수신한 aggregated.answers를
  // 문항ID 기준으로 누적한다. 세션 종료 후 ResultsView가 submissions 대신 이 집계를 우선 사용.
  const [teacherAggregatedByQuestion, setTeacherAggregatedByQuestion] = useState<Record<string, AggregatedResult>>({});
  // phase-changed 콜백에서 최신 questions 배열 참조용 ref
  const questionsRef = useRef<SurveyQuestion[]>([]);
  useEffect(() => { questionsRef.current = questions; }, [questions]);

  const isMultiQuestion = questions.length > 1;

  const handleStart = useCallback((qs: SurveyQuestion[]) => {
    setQuestions(qs);
    setSubmissions([]);
    setTeacherAggregatedByQuestion({});
    setViewMode('surveying');
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
          type: 'text' as const,
          question: q.question,
          required: true,
          maxLength: q.maxLength,
        }));
        const info = await window.electronAPI.startLiveMultiSurvey({ questions: surveyQuestions, stepMode });
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
        // Single question: use liveSurvey IPC
        if (!window.electronAPI?.startLiveSurvey) {
          setLiveError('학생 설문 기능은 데스크톱 앱에서만 사용할 수 있습니다.');
          return;
        }
        const q = questions[0]!;
        const info = await window.electronAPI.startLiveSurvey({ question: q.question, maxLength: q.maxLength });
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
          const available = await window.electronAPI.surveyTunnelAvailable();
          if (!available) await window.electronAPI.surveyTunnelInstall();
          const result = await window.electronAPI.surveyTunnelStart();
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
  }, [questions, isMultiQuestion, stepMode]);

  const handleStopLive = useCallback(async () => {
    if (isMultiQuestion) {
      if (window.electronAPI?.stopLiveMultiSurvey) await window.electronAPI.stopLiveMultiSurvey();
    } else {
      if (window.electronAPI?.stopLiveSurvey) await window.electronAPI.stopLiveSurvey();
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
    // 교사 주도 진행 모드 상태 초기화
    setTeacherPhase('lobby');
    setTeacherQuestionIndex(0);
    setTeacherTotalConnected(0);
    setTeacherTotalAnswered(0);
    setTeacherAggregated(undefined);
    setTeacherRoster([]);
    setTeacherTextDetail(undefined);
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
    setQuestions([]);
    setSubmissions([]);
    setTeacherAggregatedByQuestion({});
  }, [isLiveMode, handleStopLive]);

  const handleToggleQRFullscreen = useCallback(() => {
    setShowQRFullscreen((prev) => !prev);
  }, []);

  const handleSaveTemplate = useCallback((name: string, question: string, maxLength: number) => {
    const config = { type: 'survey' as const, question, maxLength };
    if (editingTemplateId) {
      void useToolTemplateStore.getState().updateTemplate(editingTemplateId, { name, config });
    } else {
      void useToolTemplateStore.getState().addTemplate(name, 'survey', config);
    }
    setShowSaveModal(false);
    setEditingTemplateId(null);
  }, [editingTemplateId]);

  const handleSaveRequest = useCallback((question: string, maxLength: number) => {
    setPendingSave({ question, maxLength });
    setEditingTemplateId(null);
    setShowSaveModal(true);
  }, []);

  const handleLoadTemplate = useCallback((template: ToolTemplate) => {
    if (template.config.type !== 'survey') return;
    setLoadedDraft({ question: template.config.question, maxLength: template.config.maxLength });
    setEditingTemplateId(template.id);
  }, []);

  // Live survey IPC event listeners
  useEffect(() => {
    if (!isLiveMode || !window.electronAPI) return;

    if (isMultiQuestion) {
      // Multi-question: listen to liveMultiSurvey events
      const unsubSubmitted = window.electronAPI.onLiveMultiSurveyStudentSubmitted?.((data) => {
        const id = data.submissionId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const answers = data.answers.map((a) => ({
          questionId: a.questionId,
          text: typeof a.value === 'string' ? a.value : String(a.value),
        }));
        setSubmissions((prev) => [{ id, answers, submittedAt: Date.now() }, ...prev]);
      });
      const unsubCount = window.electronAPI.onLiveMultiSurveyConnectionCount?.((data) => {
        setConnectedStudents(data.count);
      });
      return () => { unsubSubmitted?.(); unsubCount?.(); };
    } else {
      // Single question: use liveSurvey events
      const questionId = questions[0]!.id;
      const unsubSubmitted = window.electronAPI.onLiveSurveyStudentSubmitted?.((data) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        setSubmissions((prev) => [
          { id, answers: [{ questionId, text: data.text }], submittedAt: Date.now() },
          ...prev,
        ]);
      });
      const unsubCount = window.electronAPI.onLiveSurveyConnectionCount?.((data) => {
        setConnectedStudents(data.count);
      });
      return () => { unsubSubmitted?.(); unsubCount?.(); };
    }
  }, [isLiveMode, isMultiQuestion, questions]);

  // 교사 주도 진행 모드 IPC 구독 (stepMode=true + 다문항 + 라이브 중에만)
  useEffect(() => {
    if (!isLiveMode || !stepMode || questions.length < 2 || !window.electronAPI) return;

    const unsubPhase = window.electronAPI.onLiveMultiSurveyPhaseChanged((data) => {
      setTeacherPhase(data.phase);
      setTeacherQuestionIndex(data.currentQuestionIndex);
      setTeacherTotalAnswered(data.totalAnswered);
      setTeacherTotalConnected(data.totalConnected);
      setTeacherAggregated(data.aggregated);

      // Bug #B: phase='revealed' 진입 시 해당 문항의 확정 aggregated를 문항ID별로 누적 저장.
      // 세션 종료 후 ResultsView는 이 집계를 submissions 대신 우선 사용해 교사 주도 모드의
      // 학생 답변을 기존 결과 화면에 정상 표시한다.
      if (data.phase === 'revealed' && data.aggregated) {
        const qIdx = data.currentQuestionIndex;
        const currentQuestions = questionsRef.current;
        const qId = currentQuestions[qIdx]?.id;
        if (qId) {
          const agg = data.aggregated;
          setTeacherAggregatedByQuestion((prev) => ({ ...prev, [qId]: agg }));
        }
      }
    });

    const unsubRoster = window.electronAPI.onLiveMultiSurveyRoster((data) => {
      setTeacherRoster(
        data.roster.map((r) => ({
          sessionId: r.sessionId,
          nickname: r.nickname,
          answeredCurrent: r.answeredQuestions.includes(teacherQuestionIndex),
        })),
      );
    });

    const unsubAnswered = window.electronAPI.onLiveMultiSurveyStudentAnswered((data) => {
      setTeacherTotalAnswered(data.totalAnswered);
      setTeacherTotalConnected(data.totalConnected);
      if (data.aggregatedPreview) setTeacherAggregated(data.aggregatedPreview);
    });

    const unsubTextDetail = window.electronAPI.onLiveMultiSurveyTextAnswerDetail((data) => {
      setTeacherTextDetail(data.entries);
    });

    const unsubConnCount = window.electronAPI.onLiveMultiSurveyConnectionCount((data) => {
      setTeacherTotalConnected(data.count);
    });

    return () => {
      unsubPhase();
      unsubRoster();
      unsubAnswered();
      unsubTextDetail();
      unsubConnCount();
    };
  }, [isLiveMode, stepMode, questions.length, teacherQuestionIndex]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (window.electronAPI?.stopLiveSurvey) window.electronAPI.stopLiveSurvey();
      if (window.electronAPI?.stopLiveMultiSurvey) window.electronAPI.stopLiveMultiSurvey();
    };
  }, []);

  return (
    <ToolLayout title="주관식 설문" emoji="📝" onBack={onBack} isFullscreen={isFullscreen}>
      {!showPastResults && (
        <div className="flex items-center justify-center gap-2 py-2 shrink-0">
          {[
            { key: 'create', label: '문항 작성' },
            { key: 'surveying', label: '응답 수집' },
            { key: 'results', label: '결과' },
          ].map((step, i) => {
            const isActive = viewMode === step.key;
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
      )}
      {showPastResults ? (
        <PastResultsView toolType="survey" onClose={() => setShowPastResults(false)} />
      ) : viewMode === 'create' && (
        <CreateView
          isFullscreen={isFullscreen}
          onStart={handleStart}
          onSaveRequest={handleSaveRequest}
          onLoadTemplate={handleLoadTemplate}
          loadedDraft={loadedDraft}
          onShowPastResults={() => setShowPastResults(true)}
          stepMode={stepMode}
          onStepModeChange={setStepMode}
        />
      )}
      {!showPastResults && viewMode === 'surveying' && (
        <SurveyingView
          questions={questions}
          submissions={submissions}
          isFullscreen={isFullscreen}
          isLiveMode={isLiveMode}
          liveServerInfo={liveServerInfo}
          connectedStudents={connectedStudents}
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
          shortUrl={shortUrl}
          shortCode={shortCode}
          customCodeInput={customCodeInput}
          customCodeError={customCodeError}
          onCustomCodeChange={setCustomCodeInput}
          onSetCustomCode={handleSetCustomCode}
          stepMode={stepMode}
          teacherPhase={teacherPhase}
          teacherQuestionIndex={teacherQuestionIndex}
          teacherTotalConnected={teacherTotalConnected}
          teacherTotalAnswered={teacherTotalAnswered}
          teacherAggregated={teacherAggregated}
          teacherRoster={teacherRoster}
          teacherTextDetail={teacherTextDetail}
          onTeacherActivate={() => { void window.electronAPI?.liveMultiSurveyActivateSession(); }}
          onTeacherReveal={() => { void window.electronAPI?.liveMultiSurveyReveal(); }}
          onTeacherAdvance={() => { void window.electronAPI?.liveMultiSurveyAdvance(); }}
          onTeacherPrev={() => { void window.electronAPI?.liveMultiSurveyPrev(); }}
          onTeacherReopen={() => { void window.electronAPI?.liveMultiSurveyReopen(); }}
          onTeacherEnd={() => {
            void window.electronAPI?.liveMultiSurveyEndSession();
            void handleStopLive();
          }}
        />
      )}
      {!showPastResults && viewMode === 'results' && (
        <ResultsView
          questions={questions}
          submissions={submissions}
          isFullscreen={isFullscreen}
          onNewSurvey={handleReset}
          teacherAggregatedByQuestion={teacherAggregatedByQuestion}
          teacherTotalConnected={teacherTotalConnected}
          resultSaveButton={
            <ResultSaveButton
              toolType="survey"
              defaultName={questions[0]?.question ?? ''}
              resultData={{
                type: 'survey' as const,
                question: questions[0]?.question ?? '',
                responses: submissions.map((s) => ({
                  text: s.answers.map((a) => a.text).join(' / '),
                  submittedAt: s.submittedAt,
                })),
              }}
            />
          }
        />
      )}
      <TemplateSaveModal
        open={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        onSave={(name) => {
          if (pendingSave) {
            handleSaveTemplate(name, pendingSave.question, pendingSave.maxLength);
          }
        }}
      />
    </ToolLayout>
  );
}
