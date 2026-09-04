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
import { useLayoutEffect, useMemo, useState } from 'react';

import { AssistThread } from './AssistThread';
import type { AssistWriteProposal } from '@domain/entities/AssistWrite';
import { OutboundLine } from './OutboundLine';
import type { KeywordGroup } from '@domain/privacy/types';
import { WindowDragStrip } from '@adapters/components/common/WindowDragStrip';
import {
  ASSIST_MAX_QUESTION_CHARS,
  removeFinding,
  type AssistInputFinding,
} from '@domain/rules/screenAssistInput';
import { useAssistStore } from '@adapters/stores/useAssistStore';
import {
  useConnectedOwnAiProviders,
  useOwnAiStatusStore,
} from '@adapters/stores/useOwnAiStatusStore';
import { answererLabel } from './answererLabels';
import { OwnAiProposalCards } from './OwnAiProposalCards';

/**
 * 제안 칩 — **장식이 아니라 1층 방어**다.
 *
 * 누르면 미리 정해진 안전한 질문이 그대로 나가므로 자유 타이핑 자체가 줄어든다.
 * 계획서는 이걸 "우회·완곡 표현에 대한 유일한 실질 방어"라고 부른다(§5.7.2).
 */
/**
 * 입력칸 예시 질문.
 *
 * ★반드시 의도 규칙(INTENT_RULES)에 걸리는 문장이어야 한다. 예전 예시는
 * "오늘 3학년 2반 출결 어때요?"였는데, 출결 조회는 담임 반 고정이라 **되지 않는
 * 것을 앱이 권하는** 꼴이었다(2026-08-23 신고). 출결 기록 자체가 담임 반 것만
 * 있으므로(명렬표·기록이 담임 학급 단위) 다른 반 출결은 보여줄 데이터가 없다.
 * `assistIntent.test.ts` 가 이 문장이 규칙에 걸리는지 지킨다.
 */
export const ASSIST_PLACEHOLDER_EXAMPLE = '오늘 우리 반 출결 어때요?';

export const SUGGESTIONS: readonly string[] = [
  '오늘 우리 반 출결',
  '이번 달 기록 몇 건',
  '이번 주 할 일',
  '담당 학급 목록',
];

interface Props {
  /** 칩이나 입력창에서 질문이 확정됐을 때. 도구 실행은 바깥(유스케이스)이 한다. */
  readonly onAsk: (question: string) => void;
  /**
   * 미리보기 카드의 [실행]을 눌렀을 때(Phase 3).
   *
   * ★저장은 이 콜백을 받은 **바깥**에서만 일어난다. 화면은 "눌렸다"만 알리고,
   * 무엇을 저장할지는 이미 만들어진 제안이 들고 있다.
   */
  readonly onRunProposal?: (turnId: string, proposal: AssistWriteProposal) => void;
  /** 묶음 중 한 건만 저장(말로 쓴 글을 학생별로 나눈 카드용). 턴 상태를 건드리지 않는다. */
  readonly onRunOne?: (proposal: AssistWriteProposal) => Promise<{ ok: boolean; message: string }>;
  /**
   * 학생 명단. 「나갈 문장」 줄이 **실제로 나갈 문장**을 미리 만들어 보여주는 데 쓴다.
   * domain 은 스토어를 import 하지 않으므로 컨테이너가 만들어 내려준다.
   */
  readonly roster: readonly KeywordGroup[];
}

/**
 * 이 패널이 차지한 폭을 화면 전체에 알리는 CSS 변수.
 *
 * 이 패널은 본문을 **밀어내지만**, 화면에 고정(`position: fixed`)된 것들은 밀리지 않는다.
 * 우하단 도우미 버튼이 그래서 패널의 보내기 버튼 위에 겹쳤다(2026-08-23 신고).
 * 폭을 상수로 베껴 쓰면 창 크기별 폭(w-96 / max-[1280px]:w-80)과 조용히 어긋나므로,
 * **실제로 그려진 폭**을 재서 알린다. 패널이 닫히면 값도 같이 사라진다.
 */
export const DOCK_WIDTH_VAR = '--sp-assist-dock-width';

function usePublishDockWidth(): (node: HTMLElement | null) => void {
  // ★ref 가 아니라 state 로 받는다 — 패널은 닫혀 있는 동안 아예 그려지지 않으므로,
  //   ref 로 받으면 나중에 열려도 effect 가 다시 돌지 않는다.
  const [node, setNode] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!node) {
      root.style.removeProperty(DOCK_WIDTH_VAR);
      return;
    }

    const publish = () => root.style.setProperty(DOCK_WIDTH_VAR, `${node.offsetWidth}px`);
    publish();

    // jsdom 에는 ResizeObserver 가 없다. 없으면 한 번 알린 값으로 둔다.
    if (typeof ResizeObserver === 'undefined') {
      return () => root.style.removeProperty(DOCK_WIDTH_VAR);
    }
    const observer = new ResizeObserver(publish);
    observer.observe(node);
    return () => {
      observer.disconnect();
      root.style.removeProperty(DOCK_WIDTH_VAR);
    };
  }, [node]);

  return setNode;
}

export function AssistDock({ onAsk, onRunProposal, onRunOne, roster }: Props) {
  const enabled = useAssistStore((s) => s.enabled);
  const open = useAssistStore((s) => s.open);
  const turns = useAssistStore((s) => s.turns);
  const draft = useAssistStore((s) => s.draft);
  const setDraft = useAssistStore((s) => s.setDraft);
  const setOpen = useAssistStore((s) => s.setOpen);
  const clearConversation = useAssistStore((s) => s.clearConversation);

  const screening = useAssistStore((s) => s.screenDraft)();

  const dockRef = usePublishDockWidth();

  // 답을 기다리는 동안 새 질문을 막는다. 대화 이력을 싣기 시작하면서(ADR-067)
  // 진행 중에 겹쳐 보내면 이력이 반쪽으로 실리고, 서버 분당 상한(6회)도 쉽게 닿는다.
  const busy = turns.some((t) => t.status === 'thinking');
  const canSend = draft.trim().length > 0 && !busy;

  // "내 AI로 실행" — 연결된 공급자와 남은 사용량. 없으면 아래 UI 는 그리지 않는다.
  const provider = useAssistStore((s) => s.provider);
  const setProvider = useAssistStore((s) => s.setProvider);
  const connectedProviders = useConnectedOwnAiProviders();
  const usage = useOwnAiStatusStore((s) => s.usage);
  // ★[실행] 저장이 진행 중이면 [새 대화]를 잠근다 — 지우면 결과 문구가 적힐 턴이
  //   사라져 "저장은 됐는데 아무 말이 없는" 상태가 된다. 스토어(clearConversation)도
  //   같은 조건으로 거부하므로, 이 버튼은 그 사실을 눈에 보이게 하는 쪽이다.
  const saving = turns.some((t) => t.proposalState === 'running');

  const remainingHint = useMemo(
    () => (turns.length === 0 ? '숫자는 이 컴퓨터에서 찾고, 설명만 AI가 씁니다' : ''),
    [turns.length],
  );

  // ★꺼져 있거나 닫혀 있으면 렌더 자체를 하지 않는다.
  if (!enabled || !open) return null;

  const send = (): void => {
    const question = draft.trim();
    if (question.length === 0 || busy) return;
    onAsk(question);
  };

  const handleRemoveFinding = (finding: AssistInputFinding): void => {
    setDraft(removeFinding(draft, finding));
  };

  return (
    <aside
      ref={dockRef}
      aria-label="쌤핀 AI"
      className="flex h-full w-96 shrink-0 flex-col border-l border-sp-border bg-sp-surface max-[1280px]:w-80"
    >
      {/*
        창 조작 버튼(최소화·복구·닫기) 자리 비우기.

        이 패널은 본문 칸의 **오른쪽 형제**라, 본문 칸이 위에 둔 띠의 혜택을 못 받는다.
        그런데 창 버튼은 창 오른쪽 위에 떠 있으므로 정확히 이 패널 머리 위에 내려앉는다.
        그래서 패널의 닫기(✕)와 창의 닫기(✕)가 겹쳐 보였다(2026-08-23 신고).
        같은 띠를 여기에도 둬서 헤더를 그만큼 아래로 내린다.

        색은 주지 않는다(`surface` 미전달) — 이 패널이 이미 `bg-sp-surface` 라
        투명하게 두면 유리를 켜든 껐든 패널과 한 덩어리로 보인다.
      */}
      <WindowDragStrip />

      {/* 헤더 */}
      <header className="flex min-h-12 shrink-0 items-center justify-between gap-2 border-b border-sp-border px-4 py-2">
        <span className="flex shrink-0 items-center gap-1.5 text-sm font-sp-semibold text-sp-text">
          <span aria-hidden="true">✦</span> 쌤핀 AI
        </span>
        {/* flex-wrap: 공급자 고르기 + 사용량 뱃지 + 새 대화가 한꺼번에 뜨면(연결·한도근접·대화중)
            좁은 폭(max-[1280px]:w-80)에서 한 줄에 다 안 들어간다 — 넘치는 대신 다음 줄로 내린다. */}
        <div className="flex flex-wrap items-center justify-end gap-1">
          {/* 연결된 "내 AI"가 있을 때만 고르기가 보인다 — 없으면 예전과 똑같은 화면이다. */}
          {connectedProviders.length > 0 && (
            <label className="flex items-center gap-1 text-xs text-sp-muted">
              <span className="sr-only">답하는 AI 고르기</span>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as typeof provider)}
                disabled={busy}
                className="rounded-lg border border-sp-border bg-sp-bg px-1.5 py-0.5 text-xs text-sp-text disabled:opacity-50"
              >
                <option value="ssampin">{answererLabel('ssampin')}</option>
                {connectedProviders.map((p) => (
                  <option key={p} value={p}>
                    {answererLabel(p)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {/* 남은 사용량은 알 때만, 그것도 한도가 가까울 때만 말한다 — 평소엔 조용히 둔다. */}
          {usage?.fiveHourUtilization !== null &&
            usage !== null &&
            usage.fiveHourUtilization >= 0.8 && (
              <span className="rounded-lg bg-sp-card px-1.5 py-0.5 text-[0.65rem] text-sp-muted">
                한도 {Math.round(usage.fiveHourUtilization * 100)}% 사용
              </span>
            )}
          {/* 대화 이력이 답에 실리므로(ADR-067) 주제를 바꿀 때 비울 수단이 필요하다.
              지난 얘기가 계속 실리면 엉뚱한 맥락으로 답하고, 보내는 글자 수도 는다. */}
          {turns.length > 0 && (
            <button
              type="button"
              onClick={clearConversation}
              disabled={saving}
              title={saving ? '저장하는 중이에요. 잠시 뒤에 지울 수 있어요.' : undefined}
              className="rounded-lg px-2 py-1 text-xs text-sp-muted hover:bg-sp-card hover:text-sp-text disabled:opacity-50 disabled:hover:bg-transparent"
            >
              새 대화
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="쌤핀 AI 닫기"
            className="rounded-lg px-2 py-1 text-sp-muted hover:bg-sp-card hover:text-sp-text"
          >
            ✕
          </button>
        </div>
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
                disabled={busy}
                className="rounded-full border border-sp-border bg-sp-card px-3 py-1.5 text-xs text-sp-text hover:bg-sp-bg disabled:opacity-50"
              >
                {text}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <AssistThread turns={turns} onRunProposal={onRunProposal} onRunOne={onRunOne} />
      )}

      {/* "내 AI" 실행 중 브릿지가 보낸 저장 요청 — [실행] 을 눌러야 저장된다.
          입력부 바로 위에 둔다: 다음 질문을 치기 전에 반드시 눈에 들어와야 한다. */}
      <OwnAiProposalCards />

      {/* 입력부 */}
      <div className="shrink-0 border-t border-sp-border p-3">
        <OutboundLine
          text={draft}
          screening={screening}
          roster={roster}
          onRemoveFinding={handleRemoveFinding}
        />

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
          placeholder={`예: ${ASSIST_PLACEHOLDER_EXAMPLE}`}
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
