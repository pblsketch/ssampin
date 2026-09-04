import { useMemo, useState } from 'react';
import type { InquiryThread } from '@domain/entities/InquiryThread';
import type { RecordEvidence } from '@domain/entities/RecordEvidence';
import {
  buildThreadTimeline,
  competencyKeywordExample,
  competencyKeywordHasField,
  emptyLinkHints,
  EMPTY_LINK_HELPS,
  EMPTY_LINK_LABELS,
} from '@domain/rules/threadSuggest';
import { EVIDENCE_SOURCE_LABELS } from '@domain/entities/RecordEvidence';

/** YYYY-MM-DD → 'M/D'. 날짜가 없으면 빈 문자열(줄기에서 빠지지는 않는다). */
function shortDate(date?: string): string {
  if (!date) return '';
  const [, mm, dd] = date.split('-');
  return mm && dd ? `${Number(mm)}/${Number(dd)}` : date;
}

interface InquiryThreadPanelProps {
  readonly thread: InquiryThread;
  /** 이 주제에 묶인 근거(호출자가 이미 학생·주제로 걸러서 준다). */
  readonly evidence: readonly RecordEvidence[];
  /** 수업반 과목명 — 역량 키워드 예시 문구에 쓴다. */
  readonly subject?: string;
  onPatch: (patch: {
    title?: string;
    keywords?: readonly string[];
    competencyKeywords?: readonly string[];
    nextNotes?: string;
    status?: 'open' | 'closed';
  }) => void;
  onRemove: () => void;
  /** 근거를 이 주제에서 빼 미분류로 되돌린다. */
  onUnlink: (evidenceId: string) => void;
}

/**
 * 탐구 흐름(주제) 한 개의 **시간순 줄기** 화면.
 *
 * 왜 이 화면이 필요한가: 좋은 세특은 활동 나열이 아니라 질문으로 이어진 하나의 서사다. 낱장이
 * 창고에 한 줄로 쌓여 있으면 그 순서를 교사가 머릿속에서 세워야 하고, AI 는 자루째 받는다.
 * 이 화면은 묶인 근거를 날짜순으로 세워 **이야기의 모양**을 눈에 보이게 한다
 * (`docs/03-analysis/record-draft-flow-v2-inquiry-thread.analysis.md` §5-1·§5-4).
 *
 * 불가침:
 *  - **빈 고리 힌트는 경고가 아니다.** 채움률·점수를 만들지 않고, 비어 있으면 아무 말도 안 한다.
 *  - **역량 키워드는 교사가 적는다.** AI 가 짓지 않고, 분야 붙이기는 권유일 뿐 막지 않는다.
 *  - 근거 목록 위에 펼쳐지는 인라인 패널이다(모달 아님) — 근거를 보면서 고칠 수 있어야 한다.
 */
export function InquiryThreadPanel({
  thread,
  evidence,
  subject,
  onPatch,
  onRemove,
  onUnlink,
}: InquiryThreadPanelProps) {
  const [keywordInput, setKeywordInput] = useState('');
  const [competencyInput, setCompetencyInput] = useState('');
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const nodes = useMemo(() => buildThreadTimeline(evidence), [evidence]);
  const hints = useMemo(() => emptyLinkHints(nodes), [nodes]);
  const closed = thread.status === 'closed';

  const addKeyword = (): void => {
    const v = keywordInput.trim();
    if (v.length === 0) return;
    onPatch({ keywords: [...thread.keywords, v] });
    setKeywordInput('');
  };
  const removeKeyword = (k: string): void => {
    onPatch({ keywords: thread.keywords.filter((x) => x !== k) });
  };
  const addCompetency = (): void => {
    const v = competencyInput.trim();
    if (v.length === 0) return;
    onPatch({ competencyKeywords: [...(thread.competencyKeywords ?? []), v] });
    setCompetencyInput('');
  };
  const removeCompetency = (k: string): void => {
    onPatch({ competencyKeywords: (thread.competencyKeywords ?? []).filter((x) => x !== k) });
  };

  return (
    <section
      data-sp-floating
      aria-label={`${thread.title} 탐구 흐름`}
      className="flex flex-col gap-3 rounded-xl bg-sp-surface p-3 ring-1 ring-sp-border"
    >
      {/* 제목 + 상태 + 닫기/삭제 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="material-symbols-outlined text-base text-sp-accent">account_tree</span>
        {titleDraft === null ? (
          <button
            type="button"
            onClick={() => setTitleDraft(thread.title)}
            title="주제 이름 고치기"
            className="truncate rounded-md px-1 text-sm font-bold text-sp-text hover:bg-sp-card"
          >
            {thread.title}
          </button>
        ) : (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              const v = titleDraft.trim();
              if (v.length > 0 && v !== thread.title) onPatch({ title: v });
              setTitleDraft(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setTitleDraft(null);
            }}
            aria-label="주제 이름"
            className="min-w-0 flex-1 rounded-md border border-sp-border bg-sp-card px-2 py-1 text-sm font-bold text-sp-text focus:border-sp-accent focus:outline-none"
          />
        )}
        {closed && (
          <span className="rounded-full bg-sp-card px-2 py-0.5 text-[0.6rem] font-semibold text-sp-muted ring-1 ring-sp-border">
            닫힌 주제
          </span>
        )}
        <span className="text-xs text-sp-muted">{nodes.length}건</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => onPatch({ status: closed ? 'open' : 'closed' })}
          title={
            closed
              ? '다시 열면 새 근거를 이 주제로 묶을 수 있습니다.'
              : '학기가 끝난 주제를 닫습니다. 닫아도 근거는 그대로 남습니다.'
          }
          className="rounded-md px-2 py-1 text-[0.65rem] font-medium text-sp-muted ring-1 ring-sp-border transition-colors hover:text-sp-text"
        >
          {closed ? '주제 다시 열기' : '주제 닫기'}
        </button>
        {confirmRemove ? (
          <>
            <span className="text-[0.65rem] text-red-500">근거는 미분류로 돌아갑니다.</span>
            <button
              type="button"
              onClick={onRemove}
              className="rounded-md bg-red-500/10 px-2 py-1 text-[0.65rem] font-semibold text-red-500 ring-1 ring-red-500/20 hover:bg-red-500/20"
            >
              정말 삭제
            </button>
            <button
              type="button"
              onClick={() => setConfirmRemove(false)}
              className="rounded-md px-2 py-1 text-[0.65rem] font-medium text-sp-muted hover:text-sp-text"
            >
              취소
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmRemove(true)}
            className="rounded-md px-2 py-1 text-[0.65rem] font-medium text-red-500 ring-1 ring-red-500/20 transition-colors hover:bg-red-500/5"
          >
            주제 삭제
          </button>
        )}
      </div>

      {/* 매칭 키워드 — "이것도 이 주제?" 제안의 근거가 되는 낱말 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[0.65rem] text-sp-muted">키워드</span>
        {thread.keywords.map((k) => (
          <span
            key={k}
            className="inline-flex items-center gap-1 rounded-full bg-sp-accent/10 px-2 py-0.5 text-[0.65rem] font-medium text-sp-accent ring-1 ring-sp-accent/20"
          >
            {k}
            <button
              type="button"
              onClick={() => removeKeyword(k)}
              aria-label={`${k} 키워드 빼기`}
              className="material-symbols-outlined text-[0.8rem] leading-none hover:text-red-500"
            >
              close
            </button>
          </span>
        ))}
        <input
          value={keywordInput}
          onChange={(e) => setKeywordInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addKeyword();
            }
          }}
          onBlur={addKeyword}
          placeholder="낱말을 적고 Enter"
          aria-label="주제 키워드 추가"
          className="w-32 rounded-md border border-sp-border bg-sp-card px-2 py-0.5 text-[0.65rem] text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none"
        />
        {thread.keywords.length === 0 && (
          <span className="text-[0.6rem] text-sp-muted">
            키워드를 적으면 같은 낱말이 든 미분류 근거를 찾아 드립니다.
          </span>
        )}
      </div>

      {/* 시간순 줄기 */}
      {nodes.length === 0 ? (
        <p className="rounded-lg bg-sp-card px-3 py-4 text-center text-xs text-sp-muted ring-1 ring-sp-border">
          아직 이 주제에 묶은 근거가 없습니다. 아래 목록에서 근거를 골라 ‘주제로 묶기’를 누르거나
          끌어다 놓으세요.
        </p>
      ) : (
        <ol className="relative flex flex-col gap-1.5 pl-4">
          {/* 세로 줄기선 — 마디를 잇는 선 */}
          <span
            aria-hidden="true"
            className="absolute bottom-2 left-[0.3125rem] top-2 w-px bg-sp-border"
          />
          {nodes.map((n) => (
            <li key={n.evidenceId} className="relative flex items-start gap-2">
              <span
                aria-hidden="true"
                className="absolute -left-4 top-2 h-1.5 w-1.5 rounded-full bg-sp-accent"
              />
              <span className="w-9 shrink-0 pt-1.5 text-right text-[0.6rem] tabular-nums text-sp-muted">
                {shortDate(n.date)}
              </span>
              <div className="flex min-w-0 flex-1 items-start gap-2 rounded-lg bg-sp-card px-2.5 py-1.5 ring-1 ring-sp-border">
                {n.slot ? (
                  <span className="mt-0.5 shrink-0 rounded bg-sp-surface px-1.5 py-0.5 text-[0.6rem] font-medium text-sp-muted">
                    {n.slot}
                  </span>
                ) : (
                  <span className="mt-0.5 shrink-0 rounded bg-sp-surface px-1.5 py-0.5 text-[0.6rem] text-sp-muted">
                    {EVIDENCE_SOURCE_LABELS[n.sourceType]}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-xs text-sp-text" title={n.content}>
                  {n.content}
                </span>
                <button
                  type="button"
                  onClick={() => onUnlink(n.evidenceId)}
                  title="이 근거를 주제에서 빼 미분류로 되돌립니다(근거는 지워지지 않습니다)."
                  className="material-symbols-outlined shrink-0 text-sm text-sp-muted transition-colors hover:text-red-500"
                >
                  link_off
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {/* 빈 고리 힌트 — 경고가 아니라 다음 수업의 실마리 */}
      {hints.length > 0 && (
        <div className="flex flex-col gap-1 rounded-lg bg-sp-accent/5 px-3 py-2 ring-1 ring-sp-accent/20">
          {hints.map((code) => (
            <p key={code} className="flex items-start gap-1.5 text-[0.7rem] leading-snug">
              <span className="material-symbols-outlined text-sm text-sp-accent">lightbulb</span>
              <span className="text-sp-text">
                <b className="font-semibold">{EMPTY_LINK_LABELS[code]}</b>
                <span className="text-sp-muted"> — {EMPTY_LINK_HELPS[code]}</span>
              </span>
            </p>
          ))}
        </div>
      )}

      {/* 교사의 평가적 기술 — 역량 키워드 */}
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[0.65rem] text-sp-muted">역량 키워드(선생님이 적습니다)</span>
          {(thread.competencyKeywords ?? []).map((k) => (
            <span
              key={k}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-medium ring-1 ${
                competencyKeywordHasField(k)
                  ? 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/20'
                  : 'bg-sp-card text-sp-muted ring-sp-border'
              }`}
              title={
                competencyKeywordHasField(k)
                  ? '분야가 붙어 있어 이 학생의 것이 됩니다.'
                  : '분야를 붙이면 다른 학생에게 옮겨도 말이 되는 문장을 피할 수 있습니다.'
              }
            >
              {k}
              <button
                type="button"
                onClick={() => removeCompetency(k)}
                aria-label={`${k} 빼기`}
                className="material-symbols-outlined text-[0.8rem] leading-none hover:text-red-500"
              >
                close
              </button>
            </span>
          ))}
          <input
            value={competencyInput}
            onChange={(e) => setCompetencyInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCompetency();
              }
            }}
            onBlur={addCompetency}
            placeholder={competencyKeywordExample(subject)}
            aria-label="역량 키워드 추가"
            className="w-56 rounded-md border border-sp-border bg-sp-card px-2 py-0.5 text-[0.65rem] text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none"
          />
        </div>
        {competencyInput.trim().length > 0 && !competencyKeywordHasField(competencyInput) && (
          <p className="text-[0.6rem] text-sp-muted">
            ‘{competencyInput.trim()}’ 앞에 분야를 붙여 보세요 — 그래야 다른 학생 학생부에 옮겨도
            말이 되는 문장을 피할 수 있습니다.
          </p>
        )}
      </div>

      {/* 다음 탐구 메모 */}
      <label className="flex flex-col gap-1">
        <span className="text-[0.65rem] text-sp-muted">
          다음 탐구 메모 — 남은 질문, 다음 학기에 이어 볼 것
        </span>
        <textarea
          defaultValue={thread.nextNotes ?? ''}
          onBlur={(e) => {
            const v = e.target.value;
            if (v !== (thread.nextNotes ?? '')) onPatch({ nextNotes: v });
          }}
          placeholder="예: 광고 문구 규제 → 2학기 법과정치에서 이어 볼 것"
          className="min-h-[40px] w-full resize-y rounded-lg border border-sp-border bg-sp-card px-2.5 py-1.5 text-xs leading-relaxed text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none focus:ring-2 focus:ring-sp-accent/30"
        />
      </label>
    </section>
  );
}
