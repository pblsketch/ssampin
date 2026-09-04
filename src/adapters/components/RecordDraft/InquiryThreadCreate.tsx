import { useMemo, useState } from 'react';
import {
  topicTitleCandidates,
  type TopicTitleCandidate,
  type TopicTitleSources,
} from '@domain/rules/topicKeywordSources';

/** 후보가 어디서 왔는지 — 교사가 "내가 정한 이름"임을 알아보게 한다. */
const SOURCE_LABELS: Readonly<Record<TopicTitleCandidate['source'], string>> = {
  assessment: '수행평가',
  assignment: '과제',
  standard: '성취기준',
};

interface InquiryThreadCreateProps {
  readonly sources: TopicTitleSources;
  /** 이미 있는 주제 이름 — 같은 이름을 또 만들지 않게 후보에서 뺀다. */
  readonly existingTitles: readonly string[];
  onCreate: (title: string) => void;
  onCancel: () => void;
}

/**
 * 새 주제 만들기 — **이름 후보를 먼저 보여 준다.**
 *
 * 후보 1순위는 **수행평가 이름**이다(오너 결정 2026-09-04). 교사가 평가계획서에 이미 정해 둔
 * 이름이라 학기 내내 같은 말로 부르고, 학생·AI·교사가 같은 것을 가리키게 된다. 그다음이 과제
 * 제목, 마지막이 성취기준 키워드다.
 *
 * ★루브릭 **요소** 이름("자료 해석")은 여기 오지 않는다 — 그건 주제 이름이 아니라 "이것도 이
 * 주제?" 를 띄우는 **매칭 키워드**다(분석 §5-3-c 2).
 */
export function InquiryThreadCreate({
  sources,
  existingTitles,
  onCreate,
  onCancel,
}: InquiryThreadCreateProps) {
  const [text, setText] = useState('');

  const candidates = useMemo(() => {
    const taken = new Set(existingTitles.map((t) => t.trim()));
    return topicTitleCandidates(sources).filter((c) => !taken.has(c.title));
  }, [sources, existingTitles]);

  const submit = (title: string): void => {
    const v = title.trim();
    if (v.length === 0) return;
    onCreate(v);
    setText('');
  };

  return (
    <div
      data-sp-floating
      className="flex flex-col gap-2 rounded-xl bg-sp-surface p-3 ring-1 ring-sp-border"
    >
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-base text-sp-accent">account_tree</span>
        <p className="text-xs font-semibold text-sp-text">새 주제 만들기</p>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-2 py-1 text-[0.65rem] font-medium text-sp-muted hover:text-sp-text"
        >
          닫기
        </button>
      </div>

      {candidates.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-[0.65rem] text-sp-muted">
            이미 정해 두신 이름에서 고르면 학기 내내 같은 말로 부를 수 있습니다.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {candidates.slice(0, 12).map((c) => (
              <button
                key={`${c.source}:${c.title}`}
                type="button"
                onClick={() => submit(c.title)}
                className="inline-flex items-center gap-1 rounded-full bg-sp-card px-2.5 py-1 text-[0.7rem] font-medium text-sp-text ring-1 ring-sp-border transition-colors hover:bg-sp-accent/10 hover:text-sp-accent hover:ring-sp-accent/30"
              >
                <span className="text-[0.6rem] text-sp-muted">{SOURCE_LABELS[c.source]}</span>
                {c.title}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-[0.65rem] text-sp-muted">
          가져올 수 있는 이름이 아직 없습니다 — 수행평가나 과제를 만들면 여기 후보로 뜹니다. 직접
          적으셔도 됩니다.
        </p>
      )}

      <div className="flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit(text);
            }
            if (e.key === 'Escape') onCancel();
          }}
          placeholder="직접 적기 — 예: 할인 문구와 선택"
          aria-label="새 주제 이름"
          className="min-w-0 flex-1 rounded-lg border border-sp-border bg-sp-card px-3 py-1.5 text-xs text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none focus:ring-2 focus:ring-sp-accent/30"
        />
        <button
          type="button"
          onClick={() => submit(text)}
          disabled={text.trim().length === 0}
          className="shrink-0 rounded-lg bg-sp-accent px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-sp-accent/90 disabled:opacity-40"
        >
          만들기
        </button>
      </div>
    </div>
  );
}
