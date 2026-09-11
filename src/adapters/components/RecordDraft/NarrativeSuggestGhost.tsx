/**
 * AI 서사 초안 미리보기(ADR-103 §5-5) — **점선**으로만 뜬다. [적용] 전에는 저장 0회다.
 *
 * ★왜 점선인가: 이 화면의 다른 모든 칸은 "이미 저장된 것"이다. 제안이 같은 모양으로 뜨면 교사는
 *   무엇이 저장됐고 무엇이 제안인지 구별할 수 없다. 테두리 하나로 그 경계를 만든다.
 * ★모델이 쓴 이유 문장을 함께 보여 준다. [적용]하면 그 문장이 **장면 메모로 저장**되기 때문에
 *   (오너 결정 2026-09-10) 저장 전에 읽을 기회를 준다.
 * ★[적용]은 되묻지 않는다. 지금 놓인 장면이 통째로 바뀌지만 근거는 하나도 지워지지 않고,
 *   되돌리려면 다시 배열하면 된다. 대신 무엇이 바뀌는지 문장으로 먼저 말한다.
 */
import type { ReactElement } from 'react';

import type { NarrativeSceneSuggestion } from '@domain/rules/narrativeSuggestionParser';
import { frameRoleLabel, type NarrativeFrameId } from '@domain/rules/narrativeFrames';
import { RECORD_MODULES } from '@domain/rules/recordStyleCatalog';
import { ROLE_DOT } from '@adapters/components/RecordDraft/narrativeRoleStyles';
import { boardBtn } from '@adapters/components/RecordDraft/evidenceBoardStyles';
import {
  EVALUATION_EMPTY_LONG,
  EVALUATION_SYNTH_NOTE,
} from '@adapters/components/RecordDraft/evaluationGuide';

export interface NarrativeSuggestGhostProps {
  readonly frame: NarrativeFrameId;
  readonly threadTitle: string;
  readonly scenes: readonly NarrativeSceneSuggestion[];
  /** 이음말 제안. 앞 주제가 있을 때만 부모가 넘긴다. */
  readonly linkNote?: string;
  /** 근거 id → 본문. 화면에 보여 줄 만큼만 부모가 준다. */
  readonly contentOf: (evidenceId: string) => string;
  readonly applying?: boolean;
  onApply: () => void;
  onDismiss: () => void;
}

export function NarrativeSuggestGhost({
  frame,
  threadTitle,
  scenes,
  linkNote,
  contentOf,
  applying = false,
  onApply,
  onDismiss,
}: NarrativeSuggestGhostProps): ReactElement {
  const placed = scenes.reduce((n, sc) => n + sc.evidenceIds.length, 0);
  return (
    <section
      data-testid="narrative-suggest-ghost"
      aria-label={`${threadTitle} AI 장면 배치 제안, 장면 ${scenes.length}개`}
      className="flex flex-col gap-2 rounded-xl p-3 outline-dashed outline-1 outline-blue-500/40"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden="true" className="material-symbols-outlined text-sm text-sp-accent">
          auto_awesome
        </span>
        <span className="text-xs font-semibold text-sp-accent">
          AI 장면 배치 제안 · 장면 {scenes.length}개 · 근거 {placed}건 옮김
          {linkNote !== undefined && linkNote.trim().length > 0 && ' · 이음말 1'}
        </span>
        <span className="text-xs text-sp-muted">점선은 아직 저장 전입니다</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onApply}
          disabled={applying}
          className="rounded-lg bg-sp-accent px-3 py-1 text-xs font-semibold text-sp-accent-fg transition-colors hover:opacity-90 disabled:opacity-40"
        >
          {applying ? '적용하는 중…' : '이 배치 적용'}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          disabled={applying}
          className={`${boardBtn} text-sp-muted hover:text-sp-text disabled:opacity-40`}
        >
          무시
        </button>
      </div>

      <p className="text-xs leading-relaxed text-sp-muted">
        적용하면 지금 놓인 장면이 이 차례로 바뀝니다. 근거는 지워지지 않고 자리만 옮겨집니다. AI 가
        쓴 이유는 장면 메모로 함께 저장되며, 카드에 표시가 붙습니다.
      </p>

      <ol className="flex flex-col gap-1.5">
        {scenes.map((sc, i) => {
          const slot = frameRoleLabel(frame, sc.role);
          const detail = sc.moduleId === undefined ? null : RECORD_MODULES[sc.moduleId].label;
          return (
            <li
              key={`${sc.role}-${i}`}
              className="flex flex-col gap-1 rounded-lg border border-dashed border-sp-border bg-sp-card px-2.5 py-2"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-sp-text">{i + 1}</span>
                <span aria-hidden="true" className={`h-2 w-2 rounded-full ${ROLE_DOT[sc.role]}`} />
                <span className="text-xs font-semibold text-sp-text">
                  {slot}
                  {detail !== null && <span className="font-medium text-sp-muted">: {detail}</span>}
                </span>
                <div className="flex-1" />
                <span className="text-xs text-sp-muted">근거 {sc.evidenceIds.length}건</span>
              </div>
              {sc.note !== undefined && (
                <p className="text-xs leading-relaxed text-sp-muted">
                  <span className="font-medium">AI 가 읽은 것: </span>
                  {sc.note}
                </p>
              )}
              {/* 평가 자리에 놓을 기록이 없으면 비워 두고, 초안에서 어떻게 채워지는지 말한다(ADR-109). */}
              {sc.role === 'evaluation' && sc.evidenceIds.length === 0 && (
                <p data-suggest-eval-empty="" className="text-xs leading-relaxed text-sp-muted">
                  {EVALUATION_EMPTY_LONG}
                </p>
              )}
              {sc.evidenceIds.length > 0 && (
                <ul className="flex flex-col gap-0.5">
                  {sc.evidenceIds.map((id) => (
                    <li key={id} className="line-clamp-1 text-xs text-sp-text">
                      · {contentOf(id)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>

      {/* 평가 줄이 없는 제안도 적용하면 맨 앞에 빈 평가 자리가 선다(`applyNarrativeDraft`). 미리 말해 둔다. */}
      {!scenes.some((sc) => sc.role === 'evaluation') && (
        <p data-suggest-eval-empty="" className="text-xs leading-relaxed text-sp-muted">
          평가 자리는 맨 앞에 빈 채로 세웁니다. {EVALUATION_SYNTH_NOTE}
        </p>
      )}

      {linkNote !== undefined && (
        <p className="text-xs leading-relaxed text-sp-muted">
          <span className="font-medium">이음말 제안: </span>
          {linkNote}
        </p>
      )}
    </section>
  );
}
