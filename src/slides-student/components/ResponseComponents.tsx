/**
 * 학생 응답 컴포넌트 3종 (poll/text/wordcloud).
 *
 * 각각 독립 컴포넌트로 작성. SlidePage에서 OverlayConfig.type으로 분기.
 */

import { useState } from 'react';

// ─────────────────────────────────────────────────────────────
// PollResponse
// ─────────────────────────────────────────────────────────────

interface PollOption {
  readonly id: string;
  readonly label: string;
}

export interface PollResponseProps {
  readonly question: string;
  readonly options: readonly PollOption[];
  readonly multiSelect: boolean;
  readonly disabled: boolean;
  readonly onSubmit: (data: { type: 'poll'; selectedOptionIds: string[] }) => void;
}

export function PollResponse({
  question,
  options,
  multiSelect,
  disabled,
  onSubmit,
}: PollResponseProps): JSX.Element {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (multiSelect) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      } else {
        next.clear();
        next.add(id);
      }
      return next;
    });
  };

  const handleSubmit = (): void => {
    if (selected.size === 0 || disabled) return;
    onSubmit({ type: 'poll', selectedOptionIds: Array.from(selected) });
  };

  return (
    <div className="space-y-4">
      {question.length > 0 && (
        <p className="text-base font-bold text-slate-100">{question}</p>
      )}
      <div className="space-y-2">
        {options.map((opt) => {
          const isSelected = selected.has(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => toggle(opt.id)}
              disabled={disabled}
              className={`w-full text-left px-4 py-3 rounded-xl border transition-colors text-sm ${
                isSelected
                  ? 'border-blue-400 bg-blue-500/15 text-blue-100'
                  : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-500'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              aria-pressed={isSelected}
            >
              <span className="inline-block w-5 h-5 rounded-full border border-current mr-2 align-middle relative">
                {isSelected && (
                  <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
                    ●
                  </span>
                )}
              </span>
              {opt.label || `선택지 ${opt.id}`}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={disabled || selected.size === 0}
        className="w-full px-4 py-3 bg-blue-500 text-white font-bold rounded-xl text-sm hover:bg-blue-500/90 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed"
      >
        답 제출
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TextResponse
// ─────────────────────────────────────────────────────────────

export interface TextResponseProps {
  readonly prompt: string;
  readonly maxLength: number;
  readonly disabled: boolean;
  readonly onSubmit: (data: { type: 'text'; value: string }) => void;
}

export function TextResponse({
  prompt,
  maxLength,
  disabled,
  onSubmit,
}: TextResponseProps): JSX.Element {
  const [value, setValue] = useState('');

  const handleSubmit = (): void => {
    const trimmed = value.trim();
    if (trimmed.length === 0 || disabled) return;
    onSubmit({ type: 'text', value: trimmed });
  };

  return (
    <div className="space-y-4">
      {prompt.length > 0 && (
        <p className="text-base font-bold text-slate-100">{prompt}</p>
      )}
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value.slice(0, maxLength))}
        disabled={disabled}
        rows={4}
        maxLength={maxLength}
        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-blue-500 disabled:opacity-50"
        placeholder="여기에 답을 적어주세요"
      />
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {value.length} / {maxLength}자
        </span>
      </div>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={disabled || value.trim().length === 0}
        className="w-full px-4 py-3 bg-blue-500 text-white font-bold rounded-xl text-sm hover:bg-blue-500/90 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed"
      >
        답 제출
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// WordCloudResponse
// ─────────────────────────────────────────────────────────────

export interface WordCloudResponseProps {
  readonly prompt: string;
  readonly maxKeywords: number;
  readonly disabled: boolean;
  readonly onSubmit: (data: { type: 'wordcloud'; keywords: string[] }) => void;
}

export function WordCloudResponse({
  prompt,
  maxKeywords,
  disabled,
  onSubmit,
}: WordCloudResponseProps): JSX.Element {
  const [keywords, setKeywords] = useState<string[]>(['']);

  const updateAt = (i: number, value: string): void => {
    setKeywords((prev) => prev.map((k, idx) => (idx === i ? value.slice(0, 50) : k)));
  };

  const addKeyword = (): void => {
    if (keywords.length >= maxKeywords) return;
    setKeywords((prev) => [...prev, '']);
  };

  const removeAt = (i: number): void => {
    if (keywords.length <= 1) return;
    setKeywords((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleSubmit = (): void => {
    const filtered = keywords.map((k) => k.trim()).filter((k) => k.length > 0);
    if (filtered.length === 0 || disabled) return;
    onSubmit({ type: 'wordcloud', keywords: filtered });
  };

  return (
    <div className="space-y-4">
      {prompt.length > 0 && (
        <p className="text-base font-bold text-slate-100">{prompt}</p>
      )}
      <div className="space-y-2">
        {keywords.map((kw, i) => (
          <div key={i} className="flex gap-2">
            <input
              type="text"
              value={kw}
              onChange={(e) => updateAt(i, e.target.value)}
              disabled={disabled}
              maxLength={50}
              className="flex-1 px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-blue-500 disabled:opacity-50"
              placeholder={`키워드 ${i + 1}`}
            />
            {keywords.length > 1 && (
              <button
                type="button"
                onClick={() => removeAt(i)}
                disabled={disabled}
                className="px-2 text-slate-500 hover:text-red-400 disabled:cursor-not-allowed"
                aria-label="키워드 삭제"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
      {keywords.length < maxKeywords && (
        <button
          type="button"
          onClick={addKeyword}
          disabled={disabled}
          className="w-full px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs hover:bg-slate-700 disabled:opacity-50"
        >
          + 키워드 추가 ({keywords.length}/{maxKeywords})
        </button>
      )}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={
          disabled || keywords.every((k) => k.trim().length === 0)
        }
        className="w-full px-4 py-3 bg-blue-500 text-white font-bold rounded-xl text-sm hover:bg-blue-500/90 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed"
      >
        답 제출
      </button>
    </div>
  );
}
