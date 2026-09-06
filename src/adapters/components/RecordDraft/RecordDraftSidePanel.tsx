import { useMemo, type ReactNode } from 'react';
import type { RecordArea, RecordDraft } from '@domain/entities/RecordDraft';
import { EVIDENCE_SOURCE_LABELS, type RecordEvidence } from '@domain/entities/RecordEvidence';
import type { InquiryThread } from '@domain/entities/InquiryThread';
import type { ObservationRecord } from '@domain/entities/Observation';
import { isClassified } from '@domain/rules/threadSuggest';
import type { EvidenceCandidate } from '@usecases/studentRecords/collectEvidenceCandidates';

export type SidePanelTab = 'ai' | 'evidence';

interface RecordDraftSidePanelProps {
  readonly studentName: string | null;
  readonly area: RecordArea;
  readonly tab: SidePanelTab;
  readonly onTabChange: (tab: SidePanelTab) => void;
  /** 이 학생·이 영역의 근거. */
  readonly evidences: readonly RecordEvidence[];
  /** 거울 카드 — 아직 근거로 안 넣은 원본 기록(영역 무관). 미분류 수에 더한다. 기본 빈 목록. */
  readonly mirrors?: readonly EvidenceCandidate[];
  /** 이 학생의 주제. */
  readonly threads: readonly InquiryThread[];
  readonly draft?: RecordDraft;
  readonly obsById: ReadonlyMap<string, ObservationRecord>;
  readonly onOpenBoard: () => void;
  /** 「AI 초안」 탭 본문 — 부모가 재료를 다 넣어 만든 `RecordDraftAiPanel`. */
  readonly aiPanel: ReactNode;
}

/** YYYY-MM-DD → 'M/D'. */
function shortDate(date?: string): string {
  if (!date) return '';
  const [, mm, dd] = date.split('-');
  return mm && dd ? `${Number(mm)}/${Number(dd)}` : date;
}

/**
 * 오른쪽 패널 — 고른 학생의 [AI 초안 | 근거] (설계서 §4·§5).
 *
 * 학생·영역은 부모(`RecordDraftView`)의 `selectedStudentRef`·`activeArea` 를 **props 로 받는다** —
 * 여기서 `students[0]` 로 시작하지 않는다(P1: 두 화면이 학생 선택을 공유하지 않던 문제).
 */
export function RecordDraftSidePanel({
  studentName,
  area,
  tab,
  onTabChange,
  evidences,
  mirrors = [],
  threads,
  draft,
  obsById,
  onOpenBoard,
  aiPanel,
}: RecordDraftSidePanelProps) {
  const threadIdSet = useMemo(() => new Set(threads.map((t) => t.id)), [threads]);
  /** 주제별 묶음 — open 먼저, closed 뒤. 마지막이 미분류. */
  const groups = useMemo(() => {
    const ordered = [...threads].sort((a, b) =>
      a.status === b.status ? 0 : a.status === 'open' ? -1 : 1,
    );
    const byThread = ordered.map((t) => ({
      id: t.id,
      title: t.status === 'closed' ? `${t.title} (닫힘)` : t.title,
      items: evidences.filter((e) => e.threadId === t.id),
    }));
    // 미분류 = 저장 미분류 + 거울(보드의 미분류 열과 같은 수). 거울은 보기만 하는 것이라 저장되지 않았다.
    const unclassified: EvidenceLine[] = [
      ...evidences.filter((e) => !isClassified(e, threadIdSet)).map(lineOf),
      ...mirrors.map(mirrorLineOf),
    ];
    return { byThread: byThread.filter((g) => g.items.length > 0), unclassified };
  }, [threads, evidences, mirrors, threadIdSet]);

  const tabBtn = (id: SidePanelTab, label: string): ReactNode => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => onTabChange(id)}
      className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
        tab === id
          ? 'border-sp-accent font-bold text-sp-text'
          : 'border-transparent font-medium text-sp-muted hover:text-sp-text'
      }`}
    >
      {label}
    </button>
  );

  return (
    <aside
      aria-label="고른 학생 패널"
      className="flex min-h-0 w-[380px] shrink-0 flex-col border-l border-sp-border bg-sp-card"
    >
      <div className="flex items-center gap-1 border-b border-sp-border px-2" role="tablist">
        {tabBtn('ai', 'AI 초안')}
        {tabBtn('evidence', '근거')}
        <span className="ml-auto truncate pr-2 text-xs text-sp-muted">{studentName ?? ''}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {studentName === null ? (
          <p className="px-3 py-8 text-center text-sm text-sp-muted">
            학생 행을 누르면 여기서 AI 초안과 근거를 봅니다.
          </p>
        ) : tab === 'ai' ? (
          aiPanel
        ) : (
          <div className="flex flex-col gap-3 p-3" data-area={area}>
            <div className="flex items-center gap-2">
              <span className="text-xs text-sp-muted">
                이 영역의 근거 <b className="text-sp-text">{evidences.length}건</b>
              </span>
              <button
                type="button"
                onClick={onOpenBoard}
                className="ml-auto flex items-center gap-1 rounded-lg bg-blue-500/10 px-2.5 py-1.5 text-xs font-medium text-sp-accent ring-1 ring-blue-500/20 hover:bg-blue-500/20"
              >
                근거 정리 보드로
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </button>
            </div>
            {evidences.length === 0 && mirrors.length === 0 ? (
              <p className="text-xs text-sp-muted">아직 근거가 없습니다. 보드에서 모아 보세요.</p>
            ) : (
              <>
                {groups.byThread.map((g) => (
                  <section key={g.id} className="flex flex-col gap-1">
                    <h4 className="text-xs font-semibold text-sp-text">
                      {g.title}{' '}
                      <span className="font-normal text-sp-muted">{g.items.length}건</span>
                    </h4>
                    <EvidenceList items={g.items.map(lineOf)} />
                  </section>
                ))}
                {groups.unclassified.length > 0 && (
                  <section className="flex flex-col gap-1">
                    <h4 className="text-xs font-semibold text-sp-muted">
                      미분류 <span className="font-normal">{groups.unclassified.length}건</span>
                    </h4>
                    <EvidenceList items={groups.unclassified} />
                  </section>
                )}
              </>
            )}
            {/* AI 브릿지가 초안에 남긴 관찰기록 근거(`basisObservationIds`) — 행에서 여기로 옮겼다. */}
            {draft && draft.basisObservationIds.length > 0 && (
              <section className="flex flex-col gap-1">
                <h4 className="flex items-center gap-1 text-xs font-semibold text-sp-text">
                  <span className="material-symbols-outlined text-sm">link</span>
                  초안이 딛고 선 관찰기록 {draft.basisObservationIds.length}건
                </h4>
                <ul className="flex flex-col gap-1">
                  {draft.basisObservationIds.map((id, i) => {
                    const obs = obsById.get(id);
                    return (
                      <li
                        key={id}
                        className="rounded-lg bg-sp-surface px-2 py-1.5 text-xs text-sp-text ring-1 ring-sp-border"
                      >
                        {obs ? (
                          <>
                            <span className="text-sp-muted">{shortDate(obs.date)} · </span>
                            {obs.content}
                          </>
                        ) : (
                          `관찰기록 ${i + 1}`
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

/** 목록 한 줄 — 저장 근거와 거울이 같은 모양으로 보인다. */
interface EvidenceLine {
  readonly key: string;
  readonly date?: string;
  readonly sourceLabel: string;
  readonly excluded: boolean;
  readonly content: string;
}

function lineOf(e: RecordEvidence): EvidenceLine {
  return {
    key: e.id,
    ...(e.date !== undefined ? { date: e.date } : {}),
    sourceLabel: EVIDENCE_SOURCE_LABELS[e.sourceType ?? 'manual'],
    excluded: e.excludedFromAi === true,
    content: e.content,
  };
}

function mirrorLineOf(c: EvidenceCandidate): EvidenceLine {
  return {
    key: `mirror:${c.sourceId}`,
    ...(c.date !== undefined ? { date: c.date } : {}),
    sourceLabel: EVIDENCE_SOURCE_LABELS[c.sourceType],
    excluded: false,
    content: c.content,
  };
}

function EvidenceList({ items }: { readonly items: readonly EvidenceLine[] }) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((e) => (
        <li
          key={e.key}
          className="rounded-lg bg-sp-surface px-2 py-1.5 text-xs leading-relaxed text-sp-text ring-1 ring-sp-border"
        >
          <span className="text-sp-muted">
            {e.date ? `${shortDate(e.date)} · ` : ''}
            {e.sourceLabel}
            {e.excluded ? ' · AI 제외' : ''} ·{' '}
          </span>
          {e.content}
        </li>
      ))}
    </ul>
  );
}
