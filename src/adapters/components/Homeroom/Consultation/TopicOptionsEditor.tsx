import { useCallback, useMemo, useState } from 'react';
import type { ConsultationType } from '@domain/entities/Consultation';
import {
  MAX_TOPIC_OPTIONS,
  MAX_TOPIC_OPTION_LENGTH,
  normalizeTopicOptions,
} from '@domain/rules/consultationTopic';

/**
 * 상담 주제 선택지 편집기 — 새 상담 만들기·상담 수정 두 화면이 함께 쓴다.
 *
 * 여기서 만든 목록이 학부모·학생 예약 화면에 체크 목록으로 뜬다(복수 선택).
 * 비워 두면 예약 화면은 지금까지처럼 직접 적는 칸만 보여 준다.
 */

/** 유형별 추천 주제. 누르면 목록에 더해지고, 선생님이 지우거나 고칠 수 있다. */
const SUGGESTIONS: Record<ConsultationType, readonly string[]> = {
  parent: ['학교생활', '교우관계', '학습·성적', '진로·진학', '생활습관', '건강·정서'],
  student: ['학교생활', '교우관계', '공부 고민', '진로 고민', '마음 건강', '하고 싶은 이야기'],
};

interface TopicOptionsEditorProps {
  readonly type: ConsultationType;
  readonly value: readonly string[];
  readonly onChange: (next: readonly string[]) => void;
}

export function TopicOptionsEditor({ type, value, onChange }: TopicOptionsEditorProps) {
  const [draft, setDraft] = useState('');
  const isFull = value.length >= MAX_TOPIC_OPTIONS;

  const addTopic = useCallback(
    (raw: string) => {
      const next = normalizeTopicOptions([...value, raw]);
      if (next.length !== value.length) onChange(next);
    },
    [value, onChange],
  );

  const handleAddDraft = useCallback(() => {
    if (!draft.trim()) return;
    addTopic(draft);
    setDraft('');
  }, [draft, addTopic]);

  const removeTopic = useCallback(
    (topic: string) => {
      onChange(value.filter((t) => t !== topic));
    },
    [value, onChange],
  );

  const remainingSuggestions = useMemo(
    () => SUGGESTIONS[type].filter((s) => !value.includes(s)),
    [type, value],
  );

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="text-xs font-medium text-sp-muted" htmlFor="consultation-topic-option">
          상담 주제 선택지 (선택)
        </label>
        <span className="text-caption text-sp-muted">
          {value.length}/{MAX_TOPIC_OPTIONS}
        </span>
      </div>

      {/* 추가한 선택지 */}
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 mb-2">
          {value.map((topic) => (
            <li key={topic}>
              <span className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-lg border border-sp-accent bg-sp-surface text-sm text-sp-accent">
                {topic}
                <button
                  type="button"
                  onClick={() => removeTopic(topic)}
                  aria-label={`${topic} 선택지 빼기`}
                  className="w-5 h-5 flex items-center justify-center rounded text-sp-muted hover:text-sp-accent hover:bg-sp-card transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* 직접 추가 */}
      <div className="flex items-center gap-2">
        <input
          id="consultation-topic-option"
          type="text"
          value={draft}
          maxLength={MAX_TOPIC_OPTION_LENGTH}
          disabled={isFull}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            // 모달 전체 제출로 번지지 않게 여기서 끊는다.
            e.preventDefault();
            handleAddDraft();
          }}
          placeholder={isFull ? `선택지는 ${MAX_TOPIC_OPTIONS}개까지예요` : '예: 교우관계'}
          className="flex-1 bg-sp-surface border border-sp-border rounded-lg px-3 py-2.5 text-sm text-sp-text placeholder-sp-muted focus:border-sp-accent focus:outline-none transition-colors disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleAddDraft}
          disabled={isFull || !draft.trim()}
          className="px-3 py-2.5 rounded-lg border border-sp-border bg-sp-surface text-sm text-sp-text hover:border-sp-accent disabled:opacity-40 disabled:hover:border-sp-border transition-colors"
        >
          추가
        </button>
      </div>

      {/* 추천 주제 */}
      {!isFull && remainingSuggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <span className="text-caption text-sp-muted">추천</span>
          {remainingSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addTopic(s)}
              className="inline-flex items-center gap-0.5 pl-1.5 pr-2 py-1 rounded-lg border border-sp-border bg-sp-surface text-caption text-sp-muted hover:text-sp-text hover:border-sp-accent transition-colors"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              {s}
            </button>
          ))}
        </div>
      )}

      <p className="text-caption text-sp-muted mt-1.5">
        {type === 'parent' ? '학부모님이' : '학생이'} 예약할 때 여러 개 고를 수 있습니다. 비워 두면
        직접 적는 칸만 보입니다.
      </p>
    </div>
  );
}
