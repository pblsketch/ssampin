import { useState, useMemo, useCallback } from 'react';
import type { MultiSurveySubmission, MultiSurveyQuestion } from '@domain/entities/MultiSurvey';
import { FeedbackWallCard } from './FeedbackWallCard';

interface FeedbackWallViewProps {
  readonly title: string;
  readonly questions: readonly MultiSurveyQuestion[];
  readonly submissions: readonly MultiSurveySubmission[];
  readonly isFullscreen: boolean;
  readonly onClose: () => void;
}

/**
 * 교사 프로젝터용 라이브 피드백 월.
 * 실시간 설문 `running` 단계에서 토글되며, 텍스트 응답을 포스트잇 카드로 쌓아 보여준다.
 * WebSocket IPC 변경 없이 submissions 배열 변화만 구독한다.
 */
export function FeedbackWallView({
  title,
  questions,
  submissions,
  isFullscreen,
  onClose,
}: FeedbackWallViewProps) {
  // 텍스트 질문만 대상 (choice/scale은 워드월에 부적합)
  const textQuestions = useMemo(
    () => questions.filter((q) => q.type === 'text'),
    [questions],
  );

  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(
    textQuestions[0]?.id ?? null,
  );
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [expandedText, setExpandedText] = useState<string | null>(null);

  const toggleHighlight = useCallback((key: string) => {
    setHighlighted((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const togglePin = useCallback((key: string) => {
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // 선택된 텍스트 질문의 응답을 최신순 + 고정된 것 위로
  const cards = useMemo(() => {
    if (!selectedQuestionId) return [];
    const items: { submissionId: string; text: string; submittedAt: number; cardId: string }[] = [];
    for (const sub of submissions) {
      const ans = sub.answers.find((a) => a.questionId === selectedQuestionId);
      if (!ans || typeof ans.value !== 'string') continue;
      const trimmed = ans.value.trim();
      if (trimmed === '') continue;
      items.push({
        submissionId: sub.id,
        text: trimmed,
        submittedAt: sub.submittedAt,
        cardId: `${sub.id}:${selectedQuestionId}`,
      });
    }
    // 고정된 카드 우선, 나머지는 최신순
    items.sort((a, b) => {
      const aPinned = pinned.has(a.cardId);
      const bPinned = pinned.has(b.cardId);
      if (aPinned !== bPinned) return aPinned ? -1 : 1;
      return b.submittedAt - a.submittedAt;
    });
    return items;
  }, [selectedQuestionId, submissions, pinned]);

  // 텍스트 질문이 없으면 빈 상태 안내
  if (textQuestions.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-sp-bg p-8 text-center">
        <p className="text-lg font-semibold text-sp-text">피드백 월에 표시할 질문이 없어요</p>
        <p className="text-sm text-sp-muted">텍스트(주관식) 질문이 하나 이상 있어야 라이브 월로 볼 수 있어요</p>
        <button
          onClick={onClose}
          className="rounded-lg border border-sp-border bg-sp-card px-4 py-2 text-sm text-sp-text hover:border-sp-accent"
        >
          돌아가기
        </button>
      </div>
    );
  }

  const selectedQuestion = textQuestions.find((q) => q.id === selectedQuestionId);

  return (
    <div className="flex h-full flex-col bg-sp-bg">
      {/* 베타 안내 — Phase 1+2 범위 (프로젝터 풀스크린 모드에서는 숨김) */}
      {!isFullscreen && (
        <div className="shrink-0 bg-sp-card/60 border-b border-amber-400/30 px-5 py-2.5 flex items-start gap-2.5">
          <span className="material-symbols-outlined text-amber-400 text-icon-sm mt-0.5">science</span>
          <div className="text-[13px] text-sp-text leading-relaxed">
            <span className="inline-block text-[10px] font-extrabold tracking-wider px-2 py-[3px] mr-2 rounded bg-amber-400 text-amber-950 align-middle">
              BETA
            </span>
            "발제 피드백 응답 모아보기"는 아직 개선 중이에요. Phase 3(고급 필터·정렬 등)는 다음 업데이트에 포함 예정이며, 불편한 점은{' '}
            <a
              href="https://forms.gle/o1X4zLYocUpFKCzy7"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-300 underline underline-offset-2 font-semibold hover:text-amber-200 transition-colors"
            >
              피드백 남기기
            </a>
            로 알려주세요.
          </div>
        </div>
      )}

      {/* 상단 바 */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-sp-border bg-sp-card px-5 py-3">
        <div className="min-w-0 flex-1">
          {title && (
            <p className="truncate text-xs text-sp-muted">{title}</p>
          )}
          <p className={`truncate font-bold text-sp-text ${isFullscreen ? 'text-2xl' : 'text-base'}`}>
            📋 {selectedQuestion?.question ?? '피드백 월'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-sp-surface px-3 py-1 text-sm font-medium text-sp-text">
            {cards.length}개 응답
          </span>
          <button
            onClick={onClose}
            className="rounded-lg border border-sp-border bg-sp-surface px-3 py-1.5 text-sm text-sp-muted transition hover:text-sp-text"
          >
            폼 뷰로
          </button>
        </div>
      </div>

      {/* 질문 선택 탭 (2개 이상일 때만) */}
      {textQuestions.length > 1 && (
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-sp-border bg-sp-card px-5 py-1.5">
          {textQuestions.map((q) => {
            const active = q.id === selectedQuestionId;
            return (
              <button
                key={q.id}
                onClick={() => setSelectedQuestionId(q.id)}
                className={`shrink-0 rounded-md px-3 py-1 text-xs font-medium transition ${
                  active
                    ? 'bg-sp-accent text-white'
                    : 'text-sp-muted hover:text-sp-text'
                }`}
                title={q.question}
              >
                Q{questions.indexOf(q) + 1}. {q.question.length > 20 ? q.question.slice(0, 20) + '…' : q.question}
                <span className="ml-1 opacity-70">({
                  submissions.filter((s) => {
                    const a = s.answers.find((aa) => aa.questionId === q.id);
                    return a && typeof a.value === 'string' && a.value.trim() !== '';
                  }).length
                })</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 카드 그리드 */}
      <div className="flex-1 min-h-0 overflow-auto p-5">
        {cards.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sp-muted">
            <span className="text-5xl" aria-hidden>
              ⏳
            </span>
            <p className="text-sm">응답이 들어오면 여기에 카드로 쌓여요</p>
            <p className="text-xs">학생들이 QR 코드로 접속해 응답을 제출해주세요</p>
          </div>
        ) : (
          <div className={`grid gap-3 ${isFullscreen ? 'grid-cols-4' : 'grid-cols-3'}`}>
            {cards.map((c, i) => (
              <FeedbackWallCard
                key={c.cardId}
                submissionId={c.submissionId}
                text={c.text}
                index={i}
                highlighted={highlighted.has(c.cardId)}
                pinned={pinned.has(c.cardId)}
                onToggleHighlight={() => toggleHighlight(c.cardId)}
                onTogglePin={() => togglePin(c.cardId)}
                onExpand={() => setExpandedText(c.text)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 전체보기 모달 */}
      {expandedText && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-8"
          onClick={() => setExpandedText(null)}
        >
          <div className="max-w-3xl rounded-xl bg-white p-8 shadow-2xl">
            <p className="whitespace-pre-wrap text-xl leading-relaxed text-gray-900">
              {expandedText}
            </p>
            <button
              onClick={() => setExpandedText(null)}
              className="mt-4 rounded-lg bg-gray-800 px-4 py-2 text-sm text-white transition hover:bg-gray-700"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
