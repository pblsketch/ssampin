/**
 * "내 AI로 실행" 중에 온 저장 요청을 카드로 보여 주고, [실행]을 받는다.
 *
 * ★기존 제안 카드(`ProposalCard`)와 다른 자리인 이유: 저건 **이 대화의 턴에 매달린** 제안이고,
 * 이건 main 이 브릿지에서 받아 넘긴 요청이라 어느 턴에도 속하지 않는다. 억지로 턴에 붙이면
 * "누가 언제 부탁한 것인가"가 흐려진다.
 *
 * ★출처를 아직 못 가른다 — 구독 실행 중에는 다른 AI 앱의 저장 요청도 여기로 온다.
 * 그래서 카드에 그 사실을 적는다.
 */
import { useOwnAiWriteGate } from '@adapters/hooks/useOwnAiWriteGate';
import {
  proposalPreview,
  proposalTitle,
  OWN_AI_PROPOSAL_SOURCE_NOTE,
} from '@domain/rules/ownAiProposalLabels';

export function OwnAiProposalCards() {
  const { pending, apply, reject } = useOwnAiWriteGate();
  if (pending.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 border-t border-sp-border px-4 py-3">
      {pending.map((p) => {
        const preview = proposalPreview(p.request.data);
        return (
          <div key={p.proposalId} className="rounded-xl border border-sp-border bg-sp-bg p-3">
            <p className="text-sm font-sp-semibold text-sp-text">
              {proposalTitle(p.request.domain, p.request.op)}
            </p>
            {preview.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {preview.map((line, i) => (
                  <li key={i} className="text-sm text-sp-text">
                    {line}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-xs text-sp-muted">{OWN_AI_PROPOSAL_SOURCE_NOTE}</p>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void apply(p.proposalId)}
                className="rounded-lg bg-sp-accent px-3 py-1.5 text-sm font-sp-semibold text-sp-accent-fg"
              >
                실행
              </button>
              <button
                type="button"
                onClick={() => reject(p.proposalId)}
                className="rounded-lg border border-sp-border bg-sp-bg px-3 py-1.5 text-sm text-sp-text"
              >
                취소
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
