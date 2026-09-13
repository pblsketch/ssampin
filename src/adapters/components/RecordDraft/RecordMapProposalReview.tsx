import { useMemo, useState, type ReactElement } from 'react';
import type { InquiryThread, NarrativeScene } from '@domain/entities/InquiryThread';
import { EVIDENCE_SOURCE_LABELS, type RecordEvidence } from '@domain/entities/RecordEvidence';
import type {
  RecordMapScaffoldPolicy,
  RecordMapScaffoldSnapshot,
  RecordMapStudentProposal,
  RecordMapTemporaryTopic,
} from '@domain/entities/RecordMapProposal';
import { frameForArea, frameRoleLabel, sceneDisplayLabel } from '@domain/rules/narrativeFrames';

export interface RecordMapProposalReviewBlockers {
  readonly unresolvedScaffold: boolean;
  readonly missingEvidenceIds: readonly string[];
  readonly incomplete: boolean;
}

export function recordMapProposalReviewBlockers(
  proposal: RecordMapStudentProposal,
  evidences: readonly RecordEvidence[],
  policy: RecordMapScaffoldPolicy,
): RecordMapProposalReviewBlockers {
  const known = new Set(evidences.map((item) => item.id));
  const referenced = new Set([
    ...(proposal.requestEvidence?.includedEvidenceIds ?? []),
    ...proposal.topics.flatMap((topic) => topic.scenes.flatMap((scene) => scene.evidenceIds)),
    ...proposal.unplacedEvidence.map((item) => item.evidenceId),
  ]);
  const placed = new Set(
    proposal.topics.flatMap((topic) => topic.scenes.flatMap((scene) => scene.evidenceIds)),
  );
  const unplaced = new Set(proposal.unplacedEvidence.map((item) => item.evidenceId));
  const includedIncomplete = (proposal.requestEvidence?.includedEvidenceIds ?? []).some(
    (id) => placed.has(id) === unplaced.has(id),
  );
  return {
    unresolvedScaffold:
      policy.kind !== 'existing' &&
      proposal.topics.some((topic) => topic.scaffold.scaffoldId === null),
    missingEvidenceIds: [...referenced].filter((id) => !known.has(id)),
    incomplete:
      proposal.runStatus !== 'generated' ||
      includedIncomplete ||
      (proposal.requestEvidence?.excludedCounts.tooLong ?? 0) > 0,
  };
}

interface EvidenceDetailProps {
  readonly evidenceId: string;
  readonly evidence: RecordEvidence | undefined;
  readonly order: number;
}

function EvidenceDetail({ evidenceId, evidence, order }: EvidenceDetailProps): ReactElement {
  const [expanded, setExpanded] = useState(false);
  if (evidence === undefined) {
    return (
      <li
        role="alert"
        className="rounded-lg border border-sp-error bg-sp-error/10 p-3 text-sm text-sp-error"
      >
        근거 {order} · 원본을 찾을 수 없음 ({evidenceId})
      </li>
    );
  }
  const source = EVIDENCE_SOURCE_LABELS[evidence.sourceType ?? 'manual'];
  return (
    <li className="rounded-lg border border-sp-border bg-sp-bg">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-sm text-sp-text"
      >
        <span className="min-w-0">
          <span className="font-medium">근거 {order}</span>
          <span className="ml-2 text-xs text-sp-muted">{evidenceId}</span>
          <span className="mt-1 block truncate text-sp-muted">{evidence.content}</span>
        </span>
        <span aria-hidden="true" className="material-symbols-outlined text-base text-sp-muted">
          {expanded ? 'expand_less' : 'expand_more'}
        </span>
      </button>
      {expanded && (
        <div className="space-y-2 border-t border-sp-border px-3 py-3 text-sm">
          <p className="whitespace-pre-wrap leading-relaxed text-sp-text">{evidence.content}</p>
          <p className="text-xs text-sp-muted">
            {evidence.date ?? '날짜 없음'} · {source}
          </p>
          {evidence.note && (
            <p className="rounded-lg bg-sp-surface p-2 text-sp-text">
              <span className="font-medium">선생님 기록 메모:</span> {evidence.note}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

interface SceneBlockProps {
  readonly scene: NarrativeScene;
  readonly frame: ReturnType<typeof frameForArea>;
  readonly evidenceById: ReadonlyMap<string, RecordEvidence>;
  readonly proposed: boolean;
}

function SceneBlock({ scene, frame, evidenceById, proposed }: SceneBlockProps): ReactElement {
  return (
    <li className="rounded-xl border border-sp-border bg-sp-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium text-sp-text">{sceneDisplayLabel(frame, scene)}</p>
        <span className="rounded-full border border-sp-border px-2 py-0.5 text-xs text-sp-muted">
          {frameRoleLabel(frame, scene.role)}
        </span>
      </div>
      {scene.leadIn && (
        <p className="mt-2 text-sm text-sp-muted">
          <span className="font-medium text-sp-text">앞 장면 이음말:</span> {scene.leadIn}
        </p>
      )}
      {scene.note && (
        <p className="mt-2 text-sm text-sp-muted">
          <span className="font-medium text-sp-text">
            {proposed || scene.noteSource === 'ai' ? 'AI 제안 메모' : '선생님 메모'}:
          </span>{' '}
          {scene.note}
        </p>
      )}
      {scene.evidenceFocus?.map((focus) => (
        <p key={focus.evidenceId} className="mt-2 text-sm text-sp-text">
          근거별 해석 ({focus.evidenceId}): {focus.note}
        </p>
      ))}
      {scene.evidenceIds.length === 0 ? (
        <p className="mt-3 text-sm text-sp-muted">연결된 근거 없음</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {scene.evidenceIds.map((id, index) => (
            <EvidenceDetail
              key={`${id}-${index}`}
              evidenceId={id}
              evidence={evidenceById.get(id)}
              order={index + 1}
            />
          ))}
        </ol>
      )}
    </li>
  );
}

interface ProposedTopicProps {
  readonly topic: RecordMapTemporaryTopic;
  readonly policy: RecordMapScaffoldPolicy;
  readonly proposal: RecordMapStudentProposal;
  readonly evidenceById: ReadonlyMap<string, RecordEvidence>;
}

function scaffoldName(policy: RecordMapScaffoldPolicy, id: string | null): string {
  if (id === null) return '뼈대 선택 필요';
  if (policy.kind === 'fixed') return policy.scaffold.id === id ? policy.scaffold.name : id;
  if (policy.kind === 'existing')
    return id === policy.defaultScaffold.id ? policy.defaultScaffold.name : '기존 구성';
  return policy.candidates.find((item) => item.id === id)?.name ?? id;
}

function ProposedTopic({
  topic,
  policy,
  proposal,
  evidenceById,
}: ProposedTopicProps): ReactElement {
  const linked = topic.link
    ? proposal.topics.find((candidate) => candidate.id === topic.link?.fromTopicId)
    : undefined;
  const frame = frameForArea(proposal.context.area);
  return (
    <article className="rounded-xl border border-sp-border bg-sp-card p-4">
      <h4 className="font-semibold text-sp-text">{topic.title}</h4>
      <p className="mt-1 text-sm text-sp-muted">
        뼈대: {scaffoldName(policy, topic.scaffold.scaffoldId)}
      </p>
      {topic.scaffold.reason && (
        <p className="mt-1 text-sm text-sp-muted">선택 이유: {topic.scaffold.reason}</p>
      )}
      {linked && (
        <p className="mt-2 rounded-lg bg-sp-surface p-2 text-sm text-sp-muted">
          <span className="font-medium text-sp-text">앞 주제:</span> {linked.title}
          {topic.link?.note ? ` · ${topic.link.note}` : ''}
        </p>
      )}
      <ol className="mt-3 space-y-3">
        {topic.scenes.map((scene) => (
          <SceneBlock
            key={scene.id}
            scene={scene}
            frame={frame}
            evidenceById={evidenceById}
            proposed
          />
        ))}
      </ol>
    </article>
  );
}

export interface RecordMapProposalReviewProps {
  readonly proposal: RecordMapStudentProposal;
  readonly policy: RecordMapScaffoldPolicy;
  readonly evidences: readonly RecordEvidence[];
  readonly threads: readonly InquiryThread[];
  readonly scaffoldCandidates: readonly RecordMapScaffoldSnapshot[];
  readonly sourceChanged: boolean;
  readonly busy?: boolean;
  onRerunSource: () => void;
  onRerunWithScaffold: (scaffoldId: string, topicId: string) => void;
}

export function RecordMapProposalReview(props: RecordMapProposalReviewProps): ReactElement {
  const [view, setView] = useState<'proposal' | 'current'>('proposal');
  const [scaffoldId, setScaffoldId] = useState('');
  const [topicId, setTopicId] = useState('');
  const evidenceById = useMemo(
    () => new Map(props.evidences.map((item) => [item.id, item])),
    [props.evidences],
  );
  const blockers = recordMapProposalReviewBlockers(props.proposal, props.evidences, props.policy);
  const currentThreads = props.threads.filter(
    (thread) =>
      thread.studentRef === props.proposal.context.studentRef &&
      (thread.classId ?? '') === (props.proposal.context.classId ?? '') &&
      (props.proposal.context.term === undefined ||
        thread.term === undefined ||
        thread.term === props.proposal.context.term),
  );
  const currentEvidence = props.evidences.filter(
    (item) =>
      item.studentRef === props.proposal.context.studentRef &&
      (item.classId ?? '') === (props.proposal.context.classId ?? ''),
  );
  const currentPlacedIds = new Set(
    currentThreads.flatMap((thread) => (thread.scenes ?? []).flatMap((scene) => scene.evidenceIds)),
  );
  const currentUnplacedEvidence = currentEvidence.filter((item) => !currentPlacedIds.has(item.id));
  const audit = props.proposal.requestEvidence;

  return (
    <div>
      <div role="group" aria-label="지도 비교" className="flex gap-2">
        <button
          type="button"
          aria-pressed={view === 'proposal'}
          onClick={() => setView('proposal')}
          className={`rounded-lg px-3 py-2 text-sm font-medium ${view === 'proposal' ? 'bg-sp-accent text-sp-accent-fg' : 'border border-sp-border text-sp-text'}`}
        >
          AI 제안
        </button>
        <button
          type="button"
          aria-pressed={view === 'current'}
          onClick={() => setView('current')}
          className={`rounded-lg px-3 py-2 text-sm font-medium ${view === 'current' ? 'bg-sp-accent text-sp-accent-fg' : 'border border-sp-border text-sp-text'}`}
        >
          현재 지도
        </button>
      </div>

      {audit && (
        <p className="mt-3 text-xs text-sp-muted">
          AI에 포함 {audit.includedEvidenceIds.length}건 · 교사 제외 {audit.excludedCounts.teacher}
          건 · 빈 내용 {audit.excludedCounts.empty}건 · 금지 표현 {audit.excludedCounts.prohibited}
          건 · 너무 긴 자료 {audit.excludedCounts.tooLong}건 · 생략 메모 {audit.suppressedMemoCount}
          건
        </p>
      )}
      {props.proposal.warnings.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-lg border border-sp-highlight bg-sp-highlight/10 p-3 text-sm text-sp-text">
          {props.proposal.warnings.map((warning, index) => (
            <li key={`${warning}-${index}`}>확인: {warning}</li>
          ))}
        </ul>
      )}
      {blockers.missingEvidenceIds.length > 0 && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-sp-error bg-sp-error/10 p-3 text-sm text-sp-error"
        >
          원본 근거 {blockers.missingEvidenceIds.length}건을 찾을 수 없어 검토와 적용을 진행할 수
          없습니다.
        </p>
      )}
      {(audit?.excludedCounts.tooLong ?? 0) > 0 && (
        <p role="alert" className="mt-3 text-sm text-sp-error">
          너무 길어 보내지 못한 근거가 있습니다. 해당 근거의 분량을 정리한 뒤 다시 제안해 주세요.
        </p>
      )}
      {props.sourceChanged && (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-sp-error bg-sp-error/10 p-3 text-sm text-sp-error"
        >
          <p>제안을 만든 뒤 원본 자료가 바뀌었습니다.</p>
          <button
            type="button"
            disabled={props.busy}
            onClick={props.onRerunSource}
            className="mt-2 rounded-lg border border-sp-error px-3 py-2 font-medium disabled:opacity-40"
          >
            현재 자료로 이 학생 다시 만들기
          </button>
        </div>
      )}
      {blockers.unresolvedScaffold && (
        <div className="mt-3 rounded-lg border border-sp-highlight bg-sp-highlight/10 p-3 text-sm text-sp-text">
          <p className="font-medium">뼈대 선택 필요</p>
          <select
            aria-label="다시 제안할 주제"
            value={topicId}
            onChange={(event) => setTopicId(event.target.value)}
            className="mt-2 rounded-lg border border-sp-border bg-sp-card px-3 py-2"
          >
            <option value="">주제를 골라 주세요</option>
            {props.proposal.topics
              .filter((topic) => topic.scaffold.scaffoldId === null)
              .map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.title}
                </option>
              ))}
          </select>
          <div className="mt-2 flex flex-wrap gap-2">
            <select
              aria-label="다시 제안할 뼈대"
              value={scaffoldId}
              onChange={(event) => setScaffoldId(event.target.value)}
              className="min-w-48 rounded-lg border border-sp-border bg-sp-card px-3 py-2"
            >
              <option value="">뼈대를 골라 주세요</option>
              {props.scaffoldCandidates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={props.busy || scaffoldId.length === 0 || topicId.length === 0}
              onClick={() => props.onRerunWithScaffold(scaffoldId, topicId)}
              className="rounded-lg border border-sp-accent px-3 py-2 font-medium text-sp-accent disabled:opacity-40"
            >
              이 뼈대로 다시 제안
            </button>
          </div>
        </div>
      )}

      {view === 'proposal' ? (
        <div className="mt-4 space-y-4">
          {props.proposal.topics.map((topic) => (
            <ProposedTopic
              key={topic.id}
              topic={topic}
              policy={props.policy}
              proposal={props.proposal}
              evidenceById={evidenceById}
            />
          ))}
          {props.proposal.unplacedEvidence.length > 0 && (
            <section className="rounded-xl border border-sp-border bg-sp-card p-4">
              <h4 className="font-semibold text-sp-text">자리 미정</h4>
              <ul className="mt-3 space-y-2">
                {props.proposal.unplacedEvidence.map((item, index) => (
                  <li key={`${item.evidenceId}-${index}`}>
                    <EvidenceDetail
                      evidenceId={item.evidenceId}
                      evidence={evidenceById.get(item.evidenceId)}
                      order={index + 1}
                    />
                    <p className="mt-1 text-sm text-sp-muted">놓지 못한 이유: {item.reason}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {currentThreads.map((thread) => (
            <article key={thread.id} className="rounded-xl border border-sp-border bg-sp-card p-4">
              <h4 className="font-semibold text-sp-text">{thread.title}</h4>
              {thread.link && (
                <p className="mt-2 text-sm text-sp-muted">
                  앞 주제 연결:{' '}
                  {currentThreads.find((item) => item.id === thread.link?.fromThreadId)?.title ??
                    '연결된 주제'}
                  {thread.link.note ? ` · ${thread.link.note}` : ''}
                </p>
              )}
              <ol className="mt-3 space-y-3">
                {(thread.scenes ?? []).map((scene) => (
                  <SceneBlock
                    key={scene.id}
                    scene={scene}
                    frame={frameForArea(props.proposal.context.area)}
                    evidenceById={evidenceById}
                    proposed={false}
                  />
                ))}
              </ol>
            </article>
          ))}
          {currentUnplacedEvidence.length > 0 && (
            <section className="rounded-xl border border-sp-border bg-sp-card p-4">
              <h4 className="font-semibold text-sp-text">현재 자리 미정·미분류 근거</h4>
              <ol className="mt-3 space-y-2">
                {currentUnplacedEvidence.map((item, index) => (
                  <EvidenceDetail
                    key={item.id}
                    evidenceId={item.id}
                    evidence={item}
                    order={index + 1}
                  />
                ))}
              </ol>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
