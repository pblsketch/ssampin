import React, { Fragment, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { ToolLayout } from './ToolLayout';
import type { MultiSurveyQuestionType, MultiSurveySubmission } from '@domain/entities/MultiSurvey';
import QRCode from 'qrcode';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import { LiveSessionClient } from '@infrastructure/supabase/LiveSessionClient';
import { buildWordFrequency, type WordEntry } from '@adapters/utils/wordFrequency';
import { TemplateSaveModal, TemplateLoadDropdown, ResultSaveButton, PastResultsView } from './TemplateManager';
import { useToolTemplateStore } from '@adapters/stores/useToolTemplateStore';
import type { ToolTemplate } from '@domain/entities/ToolTemplate';

interface ToolMultiSurveyProps {
  onBack: () => void;
  isFullscreen: boolean;
}

type Phase = 'create' | 'running' | 'results';

interface EditableOption {
  id: string;
  text: string;
}

interface EditableQuestion {
  id: string;
  type: MultiSurveyQuestionType;
  question: string;
  required: boolean;
  options: EditableOption[];
  maxLength: number;
  scaleMin: number;
  scaleMax: number;
  scaleMinLabel: string;
  scaleMaxLabel: string;
}

const OPTION_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f97316', '#a855f7', '#06b6d4'];

const MAX_QUESTIONS = 10;
const MAX_OPTIONS = 6;
const MIN_OPTIONS = 2;

const QUESTION_TYPE_LABELS: Record<MultiSurveyQuestionType, string> = {
  'single-choice': '단일선택',
  'multi-choice': '복수선택',
  'text': '주관식',
  'scale': '척도',
};

const QUESTION_TYPE_ICONS: Record<MultiSurveyQuestionType, string> = {
  'single-choice': '◉',
  'multi-choice': '☑',
  'text': '✏️',
  'scale': '📏',
};

const MAX_LENGTH_OPTIONS = [50, 100, 200, 500] as const;

const SCALE_RANGE_OPTIONS = [
  { min: 1, max: 3, label: '1~3' },
  { min: 1, max: 5, label: '1~5' },
  { min: 1, max: 10, label: '1~10' },
] as const;

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultOption(index: number): EditableOption {
  return { id: uid(), text: index === 0 ? '' : '' };
}

function defaultQuestion(): EditableQuestion {
  return {
    id: uid(),
    type: 'single-choice',
    question: '',
    required: true,
    options: [defaultOption(0), defaultOption(1)],
    maxLength: 200,
    scaleMin: 1,
    scaleMax: 5,
    scaleMinLabel: '',
    scaleMaxLabel: '',
  };
}

interface TemplateQuestion {
  type: MultiSurveyQuestionType;
  question: string;
  options?: string[];
  required: boolean;
  maxLength?: number;
  scaleMin?: number;
  scaleMax?: number;
  scaleMinLabel?: string;
  scaleMaxLabel?: string;
}

interface Template {
  label: string;
  questions: TemplateQuestion[];
}

const TEMPLATES: Template[] = [
  {
    label: '찬성·반대',
    questions: [{ type: 'single-choice', question: '이 주제에 찬성하나요?', options: ['찬성', '반대', '모르겠어요'], required: true }],
  },
  {
    label: '이해도 확인',
    questions: [
      { type: 'single-choice', question: '오늘 수업 내용을 얼마나 이해했나요?', options: ['완벽히 이해', '대부분 이해', '조금 어려움', '잘 모르겠음'], required: true },
      { type: 'text', question: '어떤 부분이 가장 어려웠나요?', required: false, maxLength: 200 },
    ],
  },
  {
    label: '출구조사',
    questions: [
      { type: 'scale', question: '오늘 수업 만족도는?', scaleMin: 1, scaleMax: 5, scaleMinLabel: '매우 불만족', scaleMaxLabel: '매우 만족', required: true },
      { type: 'text', question: '오늘 수업에서 배운 점을 한 줄로 써보세요.', required: true, maxLength: 100 },
    ],
  },
  {
    label: '수업 피드백',
    questions: [
      { type: 'scale', question: '수업 난이도는 어떠했나요?', scaleMin: 1, scaleMax: 5, scaleMinLabel: '너무 쉬움', scaleMaxLabel: '너무 어려움', required: true },
      { type: 'multi-choice', question: '수업에서 좋았던 점은? (복수 선택 가능)', options: ['설명이 명확했어요', '활동이 재미있었어요', '적절한 속도였어요', '실생활과 연결됐어요'], required: false },
      { type: 'text', question: '다음 수업에 바라는 점이 있나요?', required: false, maxLength: 200 },
    ],
  },
];

function templateToEditable(tq: TemplateQuestion): EditableQuestion {
  return {
    id: uid(),
    type: tq.type,
    question: tq.question,
    required: tq.required,
    options: tq.options ? tq.options.map((t) => ({ id: uid(), text: t })) : [defaultOption(0), defaultOption(1)],
    maxLength: tq.maxLength ?? 200,
    scaleMin: tq.scaleMin ?? 1,
    scaleMax: tq.scaleMax ?? 5,
    scaleMinLabel: tq.scaleMinLabel ?? '',
    scaleMaxLabel: tq.scaleMaxLabel ?? '',
  };
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* ─────────────────── Question Card (Create) ─────────────────── */

interface QuestionCardProps {
  q: EditableQuestion;
  index: number;
  total: number;
  onChange: (id: string, patch: Partial<EditableQuestion>) => void;
  onDelete: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
}

function QuestionCard({ q, index, total, onChange, onDelete, onMoveUp, onMoveDown }: QuestionCardProps) {
  const handleTypeChange = useCallback((type: MultiSurveyQuestionType) => {
    const patch: Partial<EditableQuestion> = { type };
    if ((type === 'single-choice' || type === 'multi-choice') && q.options.length < MIN_OPTIONS) {
      patch.options = [defaultOption(0), defaultOption(1)];
    }
    onChange(q.id, patch);
  }, [q.id, q.options.length, onChange]);

  const handleOptionChange = useCallback((optId: string, text: string) => {
    onChange(q.id, {
      options: q.options.map((o) => (o.id === optId ? { ...o, text } : o)),
    });
  }, [q.id, q.options, onChange]);

  const handleAddOption = useCallback(() => {
    if (q.options.length >= MAX_OPTIONS) return;
    onChange(q.id, { options: [...q.options, { id: uid(), text: '' }] });
  }, [q.id, q.options, onChange]);

  const handleRemoveOption = useCallback((optId: string) => {
    if (q.options.length <= MIN_OPTIONS) return;
    onChange(q.id, { options: q.options.filter((o) => o.id !== optId) });
  }, [q.id, q.options, onChange]);

  const isChoiceType = q.type === 'single-choice' || q.type === 'multi-choice';

  return (
    <div className="bg-sp-card border border-sp-border rounded-xl p-4 flex flex-col gap-3">
      {/* Header: number badge + move + delete */}
      <div className="flex items-center gap-2">
        <span className="px-2.5 py-0.5 rounded-lg bg-sp-accent/20 text-sp-accent text-xs font-bold">
          Q{index + 1}
        </span>
        <div className="flex-1" />
        <button
          onClick={() => onMoveUp(q.id)}
          disabled={index === 0}
          className="w-7 h-7 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-all flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed text-xs"
          title="위로 이동"
        >
          ▲
        </button>
        <button
          onClick={() => onMoveDown(q.id)}
          disabled={index === total - 1}
          className="w-7 h-7 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-all flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed text-xs"
          title="아래로 이동"
        >
          ▼
        </button>
        <button
          onClick={() => onDelete(q.id)}
          disabled={total <= 1}
          className="w-7 h-7 rounded-lg text-sp-muted hover:text-red-400 hover:bg-red-500/10 transition-all flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed text-xs"
          title="삭제"
        >
          🗑
        </button>
      </div>

      {/* Type selector */}
      <div className="flex gap-1.5">
        {(['single-choice', 'multi-choice', 'text', 'scale'] as MultiSurveyQuestionType[]).map((t) => (
          <button
            key={t}
            onClick={() => handleTypeChange(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              q.type === t
                ? 'bg-sp-accent/20 border border-sp-accent text-sp-accent'
                : 'bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent/50'
            }`}
          >
            {QUESTION_TYPE_ICONS[t]} {QUESTION_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Question text */}
      <textarea
        value={q.question}
        onChange={(e) => onChange(q.id, { question: e.target.value })}
        placeholder="질문을 입력하세요"
        rows={2}
        className="w-full bg-sp-bg border border-sp-border rounded-lg px-3 py-2 text-sp-text placeholder-sp-muted focus:border-sp-accent focus:outline-none transition-colors resize-none text-sm"
        maxLength={200}
      />

      {/* Type-specific fields */}
      {isChoiceType && (
        <div className="flex flex-col gap-2">
          {q.options.map((opt, oi) => (
            <div key={opt.id} className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded-full shrink-0"
                style={{ backgroundColor: OPTION_COLORS[oi % OPTION_COLORS.length] }}
              />
              <input
                type="text"
                value={opt.text}
                onChange={(e) => handleOptionChange(opt.id, e.target.value)}
                placeholder={`선택지 ${oi + 1}`}
                className="flex-1 bg-sp-bg border border-sp-border rounded-lg px-3 py-1.5 text-sm text-sp-text placeholder-sp-muted focus:border-sp-accent focus:outline-none transition-colors"
                maxLength={50}
              />
              <button
                onClick={() => handleRemoveOption(opt.id)}
                disabled={q.options.length <= MIN_OPTIONS}
                className="shrink-0 w-7 h-7 rounded-lg text-sp-muted hover:text-red-400 hover:bg-red-500/10 transition-all flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed text-xs"
              >
                ✕
              </button>
            </div>
          ))}
          {q.options.length < MAX_OPTIONS && (
            <button
              onClick={handleAddOption}
              className="self-start px-3 py-1.5 rounded-lg border border-dashed border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent transition-all text-xs"
            >
              + 선택지 추가
            </button>
          )}
        </div>
      )}

      {q.type === 'text' && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-sp-muted">최대 글자 수:</span>
          <div className="flex gap-1.5">
            {MAX_LENGTH_OPTIONS.map((len) => (
              <button
                key={len}
                onClick={() => onChange(q.id, { maxLength: len })}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  q.maxLength === len
                    ? 'bg-sp-accent/20 border border-sp-accent text-sp-accent'
                    : 'bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text'
                }`}
              >
                {len}자
              </button>
            ))}
          </div>
        </div>
      )}

      {q.type === 'scale' && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-sp-muted">범위:</span>
            <div className="flex gap-1.5">
              {SCALE_RANGE_OPTIONS.map((r) => (
                <button
                  key={r.label}
                  onClick={() => onChange(q.id, { scaleMin: r.min, scaleMax: r.max })}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    q.scaleMin === r.min && q.scaleMax === r.max
                      ? 'bg-sp-accent/20 border border-sp-accent text-sp-accent'
                      : 'bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={q.scaleMinLabel}
              onChange={(e) => onChange(q.id, { scaleMinLabel: e.target.value })}
              placeholder="최솟값 라벨 (선택)"
              className="flex-1 bg-sp-bg border border-sp-border rounded-lg px-3 py-1.5 text-xs text-sp-text placeholder-sp-muted focus:border-sp-accent focus:outline-none transition-colors"
              maxLength={20}
            />
            <span className="text-sp-muted text-xs">~</span>
            <input
              type="text"
              value={q.scaleMaxLabel}
              onChange={(e) => onChange(q.id, { scaleMaxLabel: e.target.value })}
              placeholder="최댓값 라벨 (선택)"
              className="flex-1 bg-sp-bg border border-sp-border rounded-lg px-3 py-1.5 text-xs text-sp-text placeholder-sp-muted focus:border-sp-accent focus:outline-none transition-colors"
              maxLength={20}
            />
          </div>
        </div>
      )}

      {/* Required toggle */}
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={q.required}
          onChange={(e) => onChange(q.id, { required: e.target.checked })}
          className="w-4 h-4 rounded border-sp-border text-sp-accent focus:ring-sp-accent bg-sp-bg"
        />
        <span className="text-xs text-sp-muted">필수 응답</span>
      </label>
    </div>
  );
}

/* ─────────────────── Create View ─────────────────── */

interface CreateViewProps {
  isFullscreen: boolean;
  onStart: (title: string, questions: EditableQuestion[]) => void;
  stepMode: boolean;
  onStepModeChange: (v: boolean) => void;
  useStopwords: boolean;
  onUseStopwordsChange: (v: boolean) => void;
  editingTemplateId: string | null;
  onSetEditingTemplateId: (id: string | null) => void;
  onLoadFromTemplate: (template: ToolTemplate) => void;
  showSaveModal: boolean;
  onOpenSaveModal: () => void;
  onCloseSaveModal: () => void;
  onSaveTemplate: (name: string, title: string, questions: EditableQuestion[]) => void;
  showPastResults: boolean;
  onShowPastResults: () => void;
  onHidePastResults: () => void;
  externalTitle: string | null;
  externalQuestions: EditableQuestion[] | null;
  onTemplateApplied: () => void;
}

function CreateView({ isFullscreen, onStart, stepMode, onStepModeChange, useStopwords, onUseStopwordsChange, editingTemplateId: _editingTemplateId, onSetEditingTemplateId: _onSetEditingTemplateId, onLoadFromTemplate, showSaveModal, onOpenSaveModal, onCloseSaveModal, onSaveTemplate, showPastResults, onShowPastResults, onHidePastResults, externalTitle, externalQuestions, onTemplateApplied }: CreateViewProps) {
  const [title, setTitle] = useState('');
  const [questions, setQuestions] = useState<EditableQuestion[]>([defaultQuestion()]);

  useEffect(() => {
    if (externalTitle !== null) {
      setTitle(externalTitle);
      onTemplateApplied();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalTitle]);

  useEffect(() => {
    if (externalQuestions !== null) {
      setQuestions(externalQuestions);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalQuestions]);

  const handleChange = useCallback((id: string, patch: Partial<EditableQuestion>) => {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }, []);

  const handleDelete = useCallback((id: string) => {
    setQuestions((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((q) => q.id !== id);
    });
  }, []);

  const handleMoveUp = useCallback((id: string) => {
    setQuestions((prev) => {
      const idx = prev.findIndex((q) => q.id === id);
      if (idx <= 0) return prev;
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx]!, next[idx - 1]!];
      return next;
    });
  }, []);

  const handleMoveDown = useCallback((id: string) => {
    setQuestions((prev) => {
      const idx = prev.findIndex((q) => q.id === id);
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1]!, next[idx]!];
      return next;
    });
  }, []);

  const handleAddQuestion = useCallback(() => {
    if (questions.length >= MAX_QUESTIONS) return;
    setQuestions((prev) => [...prev, defaultQuestion()]);
  }, [questions.length]);

  const handleTemplate = useCallback((template: Template) => {
    setTitle('');
    setQuestions(template.questions.map(templateToEditable));
  }, []);

  const handleLoadFromTemplate = useCallback((tmpl: ToolTemplate) => {
    onLoadFromTemplate(tmpl);
    if (tmpl.config.type !== 'multi-survey') return;
    const cfg = tmpl.config;
    setTitle(cfg.title);
    setQuestions(cfg.questions.map((q) => ({
      id: q.id,
      type: q.type,
      question: q.question,
      required: q.required,
      options: q.options.map((o) => ({ ...o })),
      maxLength: q.maxLength,
      scaleMin: q.scaleMin,
      scaleMax: q.scaleMax,
      scaleMinLabel: q.scaleMinLabel,
      scaleMaxLabel: q.scaleMaxLabel,
    })));
  }, [onLoadFromTemplate]);

  const canStart = questions.every((q) => {
    if (!q.question.trim()) return false;
    if (q.type === 'single-choice' || q.type === 'multi-choice') {
      const filledOptions = q.options.filter((o) => o.text.trim());
      if (filledOptions.length < MIN_OPTIONS) return false;
    }
    return true;
  });

  const handleStart = useCallback(() => {
    if (!canStart) return;
    onStart(title.trim(), questions);
  }, [canStart, title, questions, onStart]);

  return (
    <div className={`w-full max-w-2xl mx-auto flex flex-col ${isFullscreen ? 'h-full min-h-0 gap-3' : 'gap-4'}`}>
      {/* Title */}
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="설문 제목 (선택사항)"
        className="w-full bg-sp-card border border-sp-border border-l-4 border-l-sp-accent rounded-xl px-4 py-3 text-xl font-bold text-sp-text placeholder-sp-muted focus:border-sp-accent focus:outline-none transition-colors shrink-0"
        maxLength={100}
      />

      {/* Templates */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-sp-muted font-medium">빠른 템플릿:</span>
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATES.map((t) => (
            <button
              key={t.label}
              onClick={() => handleTemplate(t)}
              className="px-3 py-1.5 rounded-lg bg-sp-card border border-sp-border text-xs text-sp-muted hover:text-sp-text hover:border-sp-accent/50 transition-all"
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Question list */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3">
        {questions.map((q, idx) => (
          <QuestionCard
            key={q.id}
            q={q}
            index={idx}
            total={questions.length}
            onChange={handleChange}
            onDelete={handleDelete}
            onMoveUp={handleMoveUp}
            onMoveDown={handleMoveDown}
          />
        ))}
      </div>

      {/* Response mode + stopword */}
      <div className="flex items-center justify-between flex-wrap gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-sp-muted font-medium">응답 모드:</span>
          <button
            onClick={() => onStepModeChange(false)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${!stepMode ? 'bg-sp-accent/20 border-sp-accent text-sp-accent' : 'bg-sp-card border-sp-border text-sp-muted hover:text-sp-text'}`}
          >
            📜 전체 한 화면
          </button>
          <button
            onClick={() => onStepModeChange(true)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${stepMode ? 'bg-sp-accent/20 border-sp-accent text-sp-accent' : 'bg-sp-card border-sp-border text-sp-muted hover:text-sp-text'}`}
          >
            ➡️ 문항별 순서
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm text-sp-muted cursor-pointer">
          <input
            type="checkbox"
            checked={useStopwords}
            onChange={(e) => onUseStopwordsChange(e.target.checked)}
            className="rounded"
          />
          🔤 조사·접속사 제외 (은, 는, 이, 가...)
        </label>
      </div>

      {/* Template manager row */}
      <div className="flex items-center gap-2 shrink-0">
        <TemplateLoadDropdown toolType="multi-survey" onLoad={handleLoadFromTemplate} />
        <button
          onClick={onOpenSaveModal}
          disabled={!canStart}
          className="px-4 py-2 rounded-xl bg-sp-card border border-sp-border text-sm text-sp-muted hover:text-sp-text hover:border-sp-accent/50 transition-all disabled:opacity-40"
        >
          💾 현재 문항 저장
        </button>
        <button
          onClick={onShowPastResults}
          className="px-4 py-2 rounded-xl bg-sp-card border border-sp-border text-sm text-sp-muted hover:text-sp-text hover:border-sp-accent/50 transition-all"
        >
          📊 지난 결과
        </button>
      </div>

      {/* Add question */}
      {questions.length < MAX_QUESTIONS && (
        <button
          onClick={handleAddQuestion}
          className="w-full py-2.5 rounded-xl border border-dashed border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent transition-all text-sm font-medium shrink-0"
        >
          + 문항 추가 ({questions.length}/{MAX_QUESTIONS})
        </button>
      )}

      {/* Start button */}
      <button
        onClick={handleStart}
        disabled={!canStart}
        className="w-full py-3.5 rounded-xl bg-sp-accent text-white font-bold text-lg hover:bg-sp-accent/80 transition-colors shadow-lg shadow-sp-accent/20 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
      >
        📋 설문 시작
      </button>

      <TemplateSaveModal open={showSaveModal} onClose={onCloseSaveModal} onSave={(name) => onSaveTemplate(name, title, questions)} />
      {showPastResults && (
        <PastResultsView toolType="multi-survey" onClose={onHidePastResults} />
      )}
    </div>
  );
}

/* ─────────────────── Live Panel ─────────────────── */

interface LivePanelProps {
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

function LivePanel({
  serverInfo,
  connectedStudents,
  onStop,
  isFullscreen: _isFullscreen,
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
        <p className="text-gray-800 text-xl font-bold mb-2">📋 설문 참여하기</p>
        <p className="text-gray-600 text-lg font-mono">{displayUrl}</p>
        {tunnelUrl && (
          <p className="text-blue-500 text-sm mt-1">인터넷 모드 (Wi-Fi 불필요)</p>
        )}
        <p className="text-gray-400 text-sm mt-4">화면을 클릭하면 돌아갑니다</p>
      </div>
    );
  }

  return (
    <div className="bg-sp-card border border-sp-border rounded-xl p-4 flex flex-col items-center gap-3 shrink-0">
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
              {customCodeError && <p className="text-red-400 text-xs">{customCodeError}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────── Running View ─────────────────── */

interface RunningViewProps {
  title: string;
  questions: EditableQuestion[];
  submissions: MultiSurveySubmission[];
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
}

function RunningView({
  title,
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
}: RunningViewProps) {
  const handleReset = useCallback(() => {
    if (submissions.length > 0) {
      if (!window.confirm('모든 응답을 초기화하고 설문을 처음부터 시작하시겠습니까?')) return;
    }
    onReset();
  }, [submissions.length, onReset]);

  return (
    <div className="w-full flex flex-col h-full min-h-0 gap-4">
      {/* Header */}
      <div className="text-center shrink-0">
        {title && (
          <h2 className={`font-bold text-sp-text ${isFullscreen ? 'text-3xl' : 'text-xl'}`}>
            {title}
          </h2>
        )}
        <p className="text-sp-muted text-sm mt-1">{questions.length}개 문항</p>
      </div>

      {/* Live panel */}
      {isLiveMode && liveServerInfo && (
        <LivePanel
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

      {/* Submission feed */}
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

      {/* Bottom bar */}
      <div className="flex items-center justify-between shrink-0 pb-1">
        <span className="text-sp-muted text-sm font-medium">
          📋 <span className="text-sp-text font-bold">{submissions.length}명</span> 응답
        </span>
        <div className="flex items-center gap-2">
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
            설문 종료 → 결과 보기
          </button>
          <button
            onClick={handleReset}
            className="px-4 py-2 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-400 hover:bg-orange-500/20 transition-all text-sm font-medium"
          >
            🗑️ 초기화
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────── Results View ─────────────────── */

function TextResultWithCloud({
  questionId,
  submissions,
  useStopwords,
  onUseStopwordsChange,
  subTab,
  onSubTabChange,
  selectedWord,
  onSelectWord,
}: {
  questionId: string;
  submissions: MultiSurveySubmission[];
  useStopwords: boolean;
  onUseStopwordsChange: (v: boolean) => void;
  subTab: 'cloud' | 'list';
  onSubTabChange: (tab: 'cloud' | 'list') => void;
  selectedWord: string | null;
  onSelectWord: (word: string | null) => void;
}) {
  const texts = useMemo(() => {
    const result: string[] = [];
    for (const sub of submissions) {
      const ans = sub.answers.find((a) => a.questionId === questionId);
      if (ans && typeof ans.value === 'string' && ans.value.trim()) result.push(ans.value);
    }
    return result;
  }, [submissions, questionId]);

  const wordEntries = useMemo(() => buildWordFrequency(texts, useStopwords), [texts, useStopwords]);

  const filteredTexts = useMemo(() => {
    if (!selectedWord) return [];
    return texts.filter((t) => t.toLowerCase().includes(selectedWord.toLowerCase()));
  }, [texts, selectedWord]);

  return (
    <div className="flex flex-col gap-3">
      {/* Sub-tabs */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onSubTabChange('cloud')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${subTab === 'cloud' ? 'bg-sp-accent/20 border-sp-accent text-sp-accent' : 'bg-sp-card border-sp-border text-sp-muted'}`}
        >
          ☁️ 워드클라우드
        </button>
        <button
          onClick={() => onSubTabChange('list')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${subTab === 'list' ? 'bg-sp-accent/20 border-sp-accent text-sp-accent' : 'bg-sp-card border-sp-border text-sp-muted'}`}
        >
          📄 응답 목록
        </button>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-sp-muted cursor-pointer">
          <input type="checkbox" checked={useStopwords} onChange={(e) => onUseStopwordsChange(e.target.checked)} />
          조사·접속사 제외
        </label>
      </div>

      {subTab === 'cloud' ? (
        <div className="flex flex-wrap items-center justify-center gap-3 p-4 min-h-[120px] bg-sp-bg rounded-xl">
          {wordEntries.length === 0 ? (
            <p className="text-sp-muted text-sm">텍스트 응답이 없습니다.</p>
          ) : (
            wordEntries.map((entry) => (
              <span
                key={entry.word}
                onClick={() => onSelectWord(entry.word)}
                style={{ fontSize: `${getFontSize(entry.count, wordEntries)}px`, color: entry.color, transform: `rotate(${entry.rotation}deg)`, cursor: 'pointer' }}
                className="inline-block font-bold select-none transition-all hover:opacity-80"
              >
                {entry.word}
              </span>
            ))
          )}
        </div>
      ) : (
        <div className="max-h-48 overflow-y-auto flex flex-col gap-2">
          {texts.length === 0 ? (
            <p className="text-sp-muted text-sm">응답이 없습니다.</p>
          ) : (
            texts.map((t, idx) => (
              <div key={idx} className="bg-sp-bg rounded-lg px-3 py-2 flex items-start gap-2">
                <span className="text-sp-muted text-xs font-mono shrink-0">#{texts.length - idx}</span>
                <p className="text-sp-text text-sm leading-relaxed">{t}</p>
              </div>
            ))
          )}
        </div>
      )}

      {/* Selected word overlay */}
      {selectedWord && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => onSelectWord(null)}>
          <div className="bg-sp-card border border-sp-border rounded-2xl p-6 max-w-lg w-full max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sp-text font-bold">&ldquo;{selectedWord}&rdquo; 포함 응답</h3>
              <button onClick={() => onSelectWord(null)} className="text-sp-muted hover:text-sp-text">✕</button>
            </div>
            {filteredTexts.map((text, i) => (
              <div key={i} className="bg-sp-bg rounded-xl p-3 mb-2 text-sp-text text-sm leading-relaxed">
                {text}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function getFontSize(count: number, entries: WordEntry[]): number {
  if (entries.length === 0) return 14;
  const counts = entries.map((e) => e.count);
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  if (max === min) return 36;
  return 14 + ((count - min) / (max - min)) * 46;
}

interface ResultsViewProps {
  title: string;
  questions: EditableQuestion[];
  submissions: MultiSurveySubmission[];
  isFullscreen: boolean;
  onNewSurvey: () => void;
  useStopwords: boolean;
  onUseStopwordsChange: (v: boolean) => void;
  textSubTab: Record<string, 'cloud' | 'list'>;
  onTextSubTabChange: (v: Record<string, 'cloud' | 'list'>) => void;
  selectedWord: { questionId: string; word: string } | null;
  onSelectedWordChange: (v: { questionId: string; word: string } | null) => void;
  resultSaveButton: React.ReactNode;
}

function ChoiceBarChart({ options, counts, total }: { options: EditableOption[]; counts: Map<string, number>; total: number }) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((opt, idx) => {
        const count = counts.get(opt.id) ?? 0;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        const color = OPTION_COLORS[idx % OPTION_COLORS.length]!;
        return (
          <div key={opt.id} className="flex items-center gap-3">
            <span className="text-sp-text text-sm w-28 shrink-0 truncate">{opt.text}</span>
            <div className="flex-1 h-7 bg-sp-bg rounded-lg overflow-hidden relative">
              <div
                className="h-full rounded-lg transition-all duration-500"
                style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: hexToRgba(color, 0.6) }}
              />
              <span className="absolute inset-y-0 right-2 flex items-center text-xs text-sp-muted font-medium">
                {count}표 ({pct}%)
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ScaleResult({ question, submissions }: { question: EditableQuestion; submissions: MultiSurveySubmission[] }) {
  const values: number[] = [];
  for (const sub of submissions) {
    const ans = sub.answers.find((a) => a.questionId === question.id);
    if (ans && typeof ans.value === 'number') values.push(ans.value);
  }
  const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;

  // Distribution
  const dist = new Map<number, number>();
  for (let i = question.scaleMin; i <= question.scaleMax; i++) dist.set(i, 0);
  for (const v of values) dist.set(v, (dist.get(v) ?? 0) + 1);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="text-3xl font-bold text-sp-accent">{avg.toFixed(1)}</span>
        <span className="text-sp-muted text-sm">/ {question.scaleMax} 평균</span>
        <span className="text-sp-muted text-xs ml-auto">{values.length}명 응답</span>
      </div>
      <div className="flex items-end gap-1.5 h-20">
        {Array.from(dist.entries()).map(([val, count]) => {
          const maxCount = Math.max(...Array.from(dist.values()), 1);
          const heightPct = (count / maxCount) * 100;
          return (
            <div key={val} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-xs text-sp-muted">{count}</span>
              <div className="w-full rounded-t-md bg-sp-accent/30 relative" style={{ height: `${Math.max(heightPct, 4)}%` }}>
                <div
                  className="absolute inset-0 rounded-t-md bg-sp-accent/60"
                  style={{ height: '100%' }}
                />
              </div>
              <span className="text-xs text-sp-muted">{val}</span>
            </div>
          );
        })}
      </div>
      {(question.scaleMinLabel || question.scaleMaxLabel) && (
        <div className="flex justify-between text-xs text-sp-muted">
          <span>{question.scaleMinLabel}</span>
          <span>{question.scaleMaxLabel}</span>
        </div>
      )}
    </div>
  );
}



function ResultsView({ title, questions, submissions, isFullscreen, onNewSurvey, useStopwords, onUseStopwordsChange, textSubTab, onTextSubTabChange, selectedWord, onSelectedWordChange, resultSaveButton }: ResultsViewProps) {
  return (
    <div className="w-full flex flex-col h-full min-h-0 gap-4">
      {/* Header */}
      <div className="text-center shrink-0">
        {title && (
          <h2 className={`font-bold text-sp-text ${isFullscreen ? 'text-3xl' : 'text-xl'}`}>
            {title}
          </h2>
        )}
        <p className="text-sp-muted text-sm mt-1">
          총 <span className="text-sp-text font-bold">{submissions.length}명</span> 응답
        </p>
      </div>

      {/* Per-question results */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4">
        {questions.map((q, idx) => {
          const isChoiceType = q.type === 'single-choice' || q.type === 'multi-choice';

          // Build counts for choice types
          let choiceCounts = new Map<string, number>();
          let choiceTotal = 0;
          if (isChoiceType) {
            for (const opt of q.options) choiceCounts.set(opt.id, 0);
            for (const sub of submissions) {
              const ans = sub.answers.find((a) => a.questionId === q.id);
              if (!ans) continue;
              if (q.type === 'single-choice' && typeof ans.value === 'string') {
                choiceCounts.set(ans.value, (choiceCounts.get(ans.value) ?? 0) + 1);
                choiceTotal++;
              } else if (q.type === 'multi-choice' && Array.isArray(ans.value)) {
                for (const v of ans.value) {
                  choiceCounts.set(v, (choiceCounts.get(v) ?? 0) + 1);
                }
                choiceTotal++;
              }
            }
          }

          return (
            <div key={q.id} className="bg-sp-card border border-sp-border rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-lg bg-sp-accent/20 text-sp-accent text-xs font-bold">
                  Q{idx + 1}
                </span>
                <span className="text-xs text-sp-muted">{QUESTION_TYPE_LABELS[q.type]}</span>
              </div>
              <h3 className="text-sp-text font-medium">{q.question}</h3>

              {isChoiceType && (
                <ChoiceBarChart options={q.options} counts={choiceCounts} total={choiceTotal} />
              )}
              {q.type === 'text' && (
                <TextResultWithCloud
                  questionId={q.id}
                  submissions={submissions}
                  useStopwords={useStopwords}
                  onUseStopwordsChange={onUseStopwordsChange}
                  subTab={textSubTab[q.id] ?? 'cloud'}
                  onSubTabChange={(tab) => onTextSubTabChange({ ...textSubTab, [q.id]: tab })}
                  selectedWord={selectedWord?.questionId === q.id ? selectedWord.word : null}
                  onSelectWord={(word) => onSelectedWordChange(word ? { questionId: q.id, word } : null)}
                />
              )}
              {q.type === 'scale' && (
                <ScaleResult question={q} submissions={submissions} />
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom */}
      <div className="flex items-center justify-center gap-3 shrink-0 pb-1">
        {resultSaveButton}
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

/* ─────────────────── Main Component ─────────────────── */

export function ToolMultiSurvey({ onBack, isFullscreen }: ToolMultiSurveyProps) {
  const { track } = useAnalytics();
  useEffect(() => {
    track('tool_use', { tool: 'multi-survey' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [phase, setPhase] = useState<Phase>('create');
  const [title, setTitle] = useState('');
  const [questions, setQuestions] = useState<EditableQuestion[]>([defaultQuestion()]);
  const [submissions, setSubmissions] = useState<MultiSurveySubmission[]>([]);

  // Template state
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [showPastResults, setShowPastResults] = useState(false);
  // Used to push loaded template data into CreateView's local state
  const [pendingTitle, setPendingTitle] = useState<string | null>(null);
  const [pendingQuestions, setPendingQuestions] = useState<EditableQuestion[] | null>(null);

  // Word cloud / step mode state
  const [stepMode, setStepMode] = useState(false);
  const [useStopwords, setUseStopwords] = useState(true);
  const [textSubTab, setTextSubTab] = useState<Record<string, 'cloud' | 'list'>>({});
  const [selectedWord, setSelectedWord] = useState<{ questionId: string; word: string } | null>(null);

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

  // Short URL state
  const [shortUrl, setShortUrl] = useState<string | null>(null);
  const [shortCode, setShortCode] = useState<string | null>(null);
  const [customCodeInput, setCustomCodeInput] = useState('');
  const [customCodeError, setCustomCodeError] = useState<string | null>(null);
  const liveSessionClientRef = useRef(new LiveSessionClient());

  const handleSaveTemplate = useCallback((name: string, t: string, qs: EditableQuestion[]) => {
    const config = {
      type: 'multi-survey' as const,
      title: t,
      questions: qs.map((q) => ({
        id: q.id,
        type: q.type,
        question: q.question,
        required: q.required,
        options: q.options.map((o) => ({ id: o.id, text: o.text })),
        maxLength: q.maxLength,
        scaleMin: q.scaleMin,
        scaleMax: q.scaleMax,
        scaleMinLabel: q.scaleMinLabel,
        scaleMaxLabel: q.scaleMaxLabel,
      })),
      stepMode,
      useStopwords,
    };
    if (editingTemplateId) {
      void useToolTemplateStore.getState().updateTemplate(editingTemplateId, { name, config });
    } else {
      void useToolTemplateStore.getState().addTemplate(name, 'multi-survey', config);
    }
    setShowSaveModal(false);
    setEditingTemplateId(null);
  }, [stepMode, useStopwords, editingTemplateId]);

  const handleLoadTemplate = useCallback((template: ToolTemplate) => {
    if (template.config.type !== 'multi-survey') return;
    const cfg = template.config;
    setTitle(cfg.title);
    const loadedQuestions = cfg.questions.map((q) => ({
      id: q.id,
      type: q.type,
      question: q.question,
      required: q.required,
      options: q.options.map((o) => ({ ...o })),
      maxLength: q.maxLength,
      scaleMin: q.scaleMin,
      scaleMax: q.scaleMax,
      scaleMinLabel: q.scaleMinLabel,
      scaleMaxLabel: q.scaleMaxLabel,
    }));
    setQuestions(loadedQuestions);
    setPendingTitle(cfg.title);
    setPendingQuestions(loadedQuestions);
    setEditingTemplateId(template.id);
  }, []);

  const handleStart = useCallback((t: string, qs: EditableQuestion[]) => {
    setTitle(t);
    setQuestions(qs);
    setSubmissions([]);
    setPhase('running');
  }, []);

  const handleStartLive = useCallback(async () => {
    if (!window.electronAPI?.startLiveMultiSurvey) {
      setLiveError('학생 설문 기능은 데스크톱 앱에서만 사용할 수 있습니다.');
      return;
    }
    try {
      setLiveError(null);
      const surveyQuestions = questions.map((q) => ({
        id: q.id,
        type: q.type,
        question: q.question,
        required: q.required,
        ...(q.type === 'single-choice' || q.type === 'multi-choice'
          ? { options: q.options.filter((o) => o.text.trim()).map((o) => ({ id: o.id, text: o.text.trim() })) }
          : {}),
        ...(q.type === 'text' ? { maxLength: q.maxLength } : {}),
        ...(q.type === 'scale'
          ? { scaleMin: q.scaleMin, scaleMax: q.scaleMax, scaleMinLabel: q.scaleMinLabel, scaleMaxLabel: q.scaleMaxLabel }
          : {}),
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const info = await (window.electronAPI.startLiveMultiSurvey as any)({ questions: surveyQuestions, stepMode });
      if (info.localIPs.length === 0) {
        setLiveError('Wi-Fi에 연결되어 있지 않습니다. 학생들과 같은 네트워크에 연결해주세요.');
        return;
      }
      setLiveServerInfo(info);
      setIsLiveMode(true);
      setConnectedStudents(0);
    } catch {
      setLiveError('학생 설문 서버를 시작할 수 없습니다.');
      return;
    }
    setTunnelLoading(true);
    setTunnelError(null);
    try {
      const available = await window.electronAPI?.multiSurveyTunnelAvailable?.();
      if (!available) await window.electronAPI?.multiSurveyTunnelInstall?.();
      const result = await window.electronAPI?.multiSurveyTunnelStart?.();
      if (result) {
        setTunnelUrl(result.tunnelUrl);
        setShortUrl(null);
        setShortCode(null);
        void liveSessionClientRef.current.registerSession(result.tunnelUrl).then((session) => {
          if (session) {
            setShortUrl(session.shortUrl);
            setShortCode(session.code);
          }
        });
      }
    } catch {
      setTunnelError('인터넷 연결에 실패했습니다. Wi-Fi로 접속하거나 네트워크를 확인해주세요.');
    } finally {
      setTunnelLoading(false);
    }
  }, [questions, stepMode]);

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

  const handleStopLive = useCallback(async () => {
    if (window.electronAPI?.stopLiveMultiSurvey) {
      await window.electronAPI.stopLiveMultiSurvey();
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
  }, []);

  const handleFinish = useCallback(() => {
    if (isLiveMode) {
      handleStopLive();
    }
    setPhase('results');
  }, [isLiveMode, handleStopLive]);

  const handleReset = useCallback(() => {
    if (isLiveMode) {
      handleStopLive();
    }
    setPhase('create');
    setTitle('');
    setQuestions([defaultQuestion()]);
    setSubmissions([]);
  }, [isLiveMode, handleStopLive]);

  const handleToggleQRFullscreen = useCallback(() => {
    setShowQRFullscreen((prev) => !prev);
  }, []);

  // IPC listeners
  useEffect(() => {
    if (!isLiveMode || !window.electronAPI) return;

    const unsubSubmitted = window.electronAPI.onLiveMultiSurveyStudentSubmitted?.((data: { answers: { questionId: string; value: string | string[] | number }[]; submissionId: string }) => {
      const submission: MultiSurveySubmission = {
        id: data.submissionId,
        answers: data.answers.map((a) => ({ questionId: a.questionId, value: a.value })),
        submittedAt: Date.now(),
      };
      setSubmissions((prev) => [submission, ...prev]);
    });

    const unsubCount = window.electronAPI.onLiveMultiSurveyConnectionCount?.((data: { count: number }) => {
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
      if (window.electronAPI?.stopLiveMultiSurvey) {
        window.electronAPI.stopLiveMultiSurvey();
      }
    };
  }, []);

  return (
    <ToolLayout title="복합 유형 설문" emoji="📋" onBack={onBack} isFullscreen={isFullscreen}>
      <div className="flex items-center justify-center gap-2 py-2 shrink-0">
        {[
          { key: 'create', label: '문항 작성' },
          { key: 'running', label: '응답 수집' },
          { key: 'results', label: '결과' },
        ].map((step, i) => {
          const isActive = phase === step.key;
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
      {phase === 'create' && (
        <CreateView
          isFullscreen={isFullscreen}
          onStart={handleStart}
          stepMode={stepMode}
          onStepModeChange={setStepMode}
          useStopwords={useStopwords}
          onUseStopwordsChange={setUseStopwords}
          editingTemplateId={editingTemplateId}
          onSetEditingTemplateId={setEditingTemplateId}
          onLoadFromTemplate={handleLoadTemplate}
          showSaveModal={showSaveModal}
          onOpenSaveModal={() => { setEditingTemplateId(editingTemplateId); setShowSaveModal(true); }}
          onCloseSaveModal={() => setShowSaveModal(false)}
          onSaveTemplate={handleSaveTemplate}
          showPastResults={showPastResults}
          onShowPastResults={() => setShowPastResults(true)}
          onHidePastResults={() => setShowPastResults(false)}
          externalTitle={pendingTitle}
          externalQuestions={pendingQuestions}
          onTemplateApplied={() => { setPendingTitle(null); setPendingQuestions(null); }}
        />
      )}
      {phase === 'running' && (
        <RunningView
          title={title}
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
        />
      )}
      {phase === 'results' && (
        <ResultsView
          title={title}
          questions={questions}
          submissions={submissions}
          isFullscreen={isFullscreen}
          onNewSurvey={handleReset}
          useStopwords={useStopwords}
          onUseStopwordsChange={setUseStopwords}
          textSubTab={textSubTab}
          onTextSubTabChange={setTextSubTab}
          selectedWord={selectedWord}
          onSelectedWordChange={setSelectedWord}
          resultSaveButton={
            <ResultSaveButton
              toolType="multi-survey"
              defaultName={title || '복합 설문'}
              resultData={{
                type: 'multi-survey' as const,
                title,
                questions: questions.map((q) => ({
                  id: q.id,
                  type: q.type,
                  question: q.question,
                  required: q.required,
                  options: q.options.map((o) => ({ id: o.id, text: o.text })),
                  maxLength: q.maxLength,
                  scaleMin: q.scaleMin,
                  scaleMax: q.scaleMax,
                  scaleMinLabel: q.scaleMinLabel,
                  scaleMaxLabel: q.scaleMaxLabel,
                })),
                submissions: submissions.map((s) => ({
                  id: s.id,
                  answers: s.answers.map((a) => ({ questionId: a.questionId, value: a.value })),
                  submittedAt: s.submittedAt,
                })),
              }}
            />
          }
        />
      )}
    </ToolLayout>
  );
}
