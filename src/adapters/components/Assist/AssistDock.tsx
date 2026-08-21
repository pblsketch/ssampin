/**
 * 쌤핀 AI — 도킹 패널
 *
 * ★본문을 **덮지 않고 밀어낸다.** 사이드바가 이미 그렇게 동작하므로 같은 방식을 쓴다
 * (`App.tsx` 의 flex row 안에 본문의 오른쪽 형제로 들어간다).
 * 기존 고객지원 챗봇은 우하단에 떠서 덮는다 — **다른 물건이라 다르게 만든다.**
 *
 * ★꺼져 있으면 아무것도 렌더하지 않는다(성공 기준 5).
 *
 * 설계: docs/02-design/features/inapp-ai-assist.design.md §3
 */
import { useMemo } from 'react';

import { AssistThread } from './AssistThread';
import { OutboundLine } from './OutboundLine';
import {
  ASSIST_MAX_QUESTION_CHARS,
  removeFinding,
  type AssistInputFinding,
} from '@domain/rules/screenAssistInput';
import { useAssistStore } from '@adapters/stores/useAssistStore';

/**
 * 제안 칩 — **장식이 아니라 1층 방어**다.
 *
 * 누르면 미리 정해진 안전한 질문이 그대로 나가므로 자유 타이핑 자체가 줄어든다.
 * 계획서는 이걸 "우회·완곡 표현에 대한 유일한 실질 방어"라고 부른다(§5.7.2).
 */
export const SUGGESTIONS: readonly string[] = [
  '오늘 우리 반 출결',
  '이번 달 기록 몇 건',
  '이번 주 할 일',
  '담당 학급 목록',
];

interface Props {
  /** 칩이나 입력창에서 질문이 확정됐을 때. 도구 실행은 바깥(유스케이스)이 한다. */
  readonly onAsk: (question: string) => void;
}

export function AssistDock({ onAsk }: Props) {
  const enabled = useAssistStore((s) => s.enabled);
  const open = useAssistStore((s) => s.open);
  const turns = useAssistStore((s) => s.turns);
  const draft = useAssistStore((s) => s.draft);
  const setDraft = useAssistStore((s) => s.setDraft);
  const setOpen = useAssistStore((s) => s.setOpen);

  const screening = useAssistStore((s) => s.screenDraft)();

  const canSend = draft.trim().length > 0;

  const remainingHint = useMemo(
    () => (turns.length === 0 ? '숫자는 이 컴퓨터에서 찾고, 설명만 AI가 씁니다' : ''),
    [turns.length],
  );

  // ★꺼져 있거나 닫혀 있으면 렌더 자체를 하지 않는다.
  if (!enabled || !open) return null;

  const send = (): void => {
    const question = draft.trim();
    if (question.length === 0) return;
    onAsk(question);
  };

  const handleRemoveFinding = (finding: AssistInputFinding): void => {
    setDraft(removeFinding(draft, finding));
  };

  return (
    <aside
      aria-label="쌤핀 AI"
      className="flex h-full w-96 shrink-0 flex-col border-l border-sp-border bg-sp-surface max-[1280px]:w-80"
    >
      {/* 헤더 */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-sp-border px-4">
        <span className="flex items-center gap-1.5 text-sm font-sp-semibold text-sp-text">
          <span aria-hidden="true">✦</span> 쌤핀 AI
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="쌤핀 AI 닫기"
          className="rounded-lg px-2 py-1 text-sp-muted hover:bg-sp-card hover:text-sp-text"
        >
          ✕
        </button>
      </header>

      {/* 스레드 또는 빈 상태 */}
      {turns.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
          <p className="text-sm text-sp-text">무엇을 도와드릴까요?</p>
          <p className="text-xs text-sp-muted">{remainingHint}</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((text) => (
              <button
                key={text}
                type="button"
                onClick={() => onAsk(text)}
                className="rounded-full border border-sp-border bg-sp-card px-3 py-1.5 text-xs text-sp-text hover:bg-sp-bg"
              >
                {text}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <AssistThread turns={turns} />
      )}

      {/* 입력부 */}
      <div className="shrink-0 border-t border-sp-border p-3">
        <OutboundLine text={draft} screening={screening} onRemoveFinding={handleRemoveFinding} />

        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // ★경고 상태에서도 Enter 가 그대로 동작한다.
            // 키보드만 쓰는 사람에게 차단이 생기면 안 된다.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          maxLength={ASSIST_MAX_QUESTION_CHARS}
          placeholder="예: 오늘 3학년 2반 출결 어때요?"
          aria-label="쌤핀 AI에게 물어보기"
          className="mt-2 max-h-[160px] min-h-[72px] w-full resize-none rounded-lg border border-sp-border bg-sp-bg px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted"
        />

        <div className="mt-2 flex items-center justify-between gap-2">
          {/* 상한에 가까워질 때만 알린다 — 평소에 숫자를 띄우면 글자 수를 세게 만든다. */}
          <span className="text-xs text-sp-muted">
            {draft.length > ASSIST_MAX_QUESTION_CHARS - 200
              ? `${ASSIST_MAX_QUESTION_CHARS - draft.length}자 더 쓸 수 있어요`
              : '이름은 보내기 전에 가려집니다'}
          </span>
          <button
            type="button"
            onClick={send}
            disabled={!canSend}
            className="rounded-lg bg-sp-accent px-3 py-1.5 text-xs font-sp-semibold text-sp-accent-fg disabled:opacity-50"
          >
            {screening.severity === null ? '보내기' : '그대로 보내기'}
          </button>
        </div>
      </div>
    </aside>
  );
}
