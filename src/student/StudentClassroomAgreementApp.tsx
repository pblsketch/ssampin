import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ClassroomAgreementClientMessage,
  ClassroomAgreementServerMessage,
} from '@shared/wsProtocol/classroomAgreement';
import {
  CLASSROOM_AGREEMENT_PROTOCOL_VERSION,
  ClassroomAgreementServerMessageSchema,
} from '@shared/wsProtocol/classroomAgreement';
import type { ClassroomAgreementPublicState } from '@usecases/classroomAgreement/ClassroomAgreementRealtimeSession';

const TOKEN_STORAGE_KEY = 'ssampin-classroom-agreement-token';
const NAME_STORAGE_KEY = 'ssampin-classroom-agreement-display-name';
const MAX_TEXT_LENGTH = 200;

type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

export function StudentClassroomAgreementApp() {
  const socketRef = useRef<WebSocket | null>(null);
  const phaseRef = useRef<ClassroomAgreementPublicState['phase'] | null>(null);
  const [displayName, setDisplayName] = useState(() => readSessionValue(NAME_STORAGE_KEY) ?? '');
  const [studentToken, setStudentToken] = useState<string | null>(() =>
    readSessionValue(TOKEN_STORAGE_KEY),
  );
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [publicState, setPublicState] = useState<ClassroomAgreementPublicState | null>(null);
  const [ifText, setIfText] = useState('');
  const [thenText, setThenText] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [refinementVotedCandidateIds, setRefinementVotedCandidateIds] = useState<string[]>([]);
  const [priorityVotedCandidateIds, setPriorityVotedCandidateIds] = useState<string[]>([]);
  const [selectedPriorityCandidateIds, setSelectedPriorityCandidateIds] = useState<string[]>([]);

  const closeSocket = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
  }, []);

  useEffect(() => closeSocket, [closeSocket]);

  useEffect(() => {
    phaseRef.current = publicState?.phase ?? null;
  }, [publicState?.phase]);

  const handleServerMessage = useCallback((message: ClassroomAgreementServerMessage) => {
    switch (message.type) {
      case 'session-joined':
        setStudentToken(message.studentToken);
        setDisplayName(message.displayName);
        writeSessionValue(TOKEN_STORAGE_KEY, message.studentToken);
        writeSessionValue(NAME_STORAGE_KEY, message.displayName);
        setNotice('참여가 연결되었습니다. 함께 약속을 제안해 주세요.');
        return;
      case 'session-state':
        setPublicState(message.state as ClassroomAgreementPublicState);
        return;
      case 'proposal-accepted':
        setSubmittedCount((count) => count + 1);
        setIfText('');
        setThenText('');
        setNotice('제안이 선생님 화면으로 전달되었습니다.');
        return;
      case 'input-rejected':
      case 'error':
        setNotice(message.message);
        return;
      case 'phase-changed':
        setPublicState((prev) => (prev ? { ...prev, phase: message.phase } : prev));
        return;
      case 'vote-accepted':
        if (phaseRef.current === 'refinementVoting') {
          setRefinementVotedCandidateIds((current) => [
            ...new Set([...current, ...message.candidateIds]),
          ]);
        }
        if (phaseRef.current === 'priorityVoting') {
          setPriorityVotedCandidateIds((current) => [
            ...new Set([...current, ...message.candidateIds]),
          ]);
          setSelectedPriorityCandidateIds([]);
        }
        setNotice('선택이 전달되었습니다.');
        return;
      case 'closed':
        setStatus('closed');
        setNotice('활동이 종료되었습니다.');
        return;
      default: {
        const exhaustive: never = message;
        return exhaustive;
      }
    }
  }, []);

  const connect = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) {
        setNotice('실명 또는 닉네임을 입력해 주세요.');
        return;
      }

      closeSocket();
      setStatus('connecting');
      setNotice(null);

      const ws = new WebSocket(buildClassroomAgreementWsUrl(window.location));
      socketRef.current = ws;

      ws.onopen = () => {
        setStatus('open');
        ws.send(
          JSON.stringify(
            buildJoinSessionMessage(trimmed, readSessionValue(TOKEN_STORAGE_KEY) ?? undefined),
          ),
        );
      };
      ws.onmessage = (event) => {
        const parsed = parseServerMessage(event.data);
        if (parsed) handleServerMessage(parsed);
      };
      ws.onerror = () => {
        setStatus('error');
        setNotice('연결 중 문제가 생겼습니다. 링크를 새로 열어 주세요.');
      };
      ws.onclose = () => {
        setStatus((prev) => (prev === 'closed' ? prev : 'closed'));
      };
    },
    [closeSocket, handleServerMessage],
  );

  const handleJoin = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      connect(displayName);
    },
    [connect, displayName],
  );

  const handleSubmitProposal = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN || !studentToken) {
        setNotice('먼저 활동에 참여해 주세요.');
        return;
      }
      const nextIf = ifText.trim();
      const nextThen = thenText.trim();
      if (!nextIf || !nextThen) {
        setNotice('상황과 행동을 모두 적어 주세요.');
        return;
      }
      const message: ClassroomAgreementClientMessage = {
        type: 'submit-proposal',
        studentToken,
        clientMessageId: makeClientMessageId(),
        ifText: nextIf,
        thenText: nextThen,
      };
      socketRef.current.send(JSON.stringify(message));
    },
    [ifText, thenText, studentToken],
  );

  const sendRefinementVote = useCallback(
    (candidateId: string, value: 'agree' | 'needsWork') => {
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN || !studentToken) {
        setNotice('먼저 활동에 참여해 주세요.');
        return;
      }
      socketRef.current.send(
        JSON.stringify(buildRefinementVoteMessage(studentToken, candidateId, value)),
      );
    },
    [studentToken],
  );

  const togglePriorityCandidate = useCallback(
    (candidateId: string) => {
      setSelectedPriorityCandidateIds((current) => {
        if (current.includes(candidateId)) {
          return current.filter((id) => id !== candidateId);
        }
        const limit = publicState?.settings.priorityVoteLimit ?? 0;
        if (current.length >= limit) {
          setNotice(`중요 약속은 ${limit}개까지 선택할 수 있습니다.`);
          return current;
        }
        return [...current, candidateId];
      });
    },
    [publicState?.settings.priorityVoteLimit],
  );

  const submitPriorityVote = useCallback(() => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN || !studentToken) {
      setNotice('먼저 활동에 참여해 주세요.');
      return;
    }
    if (selectedPriorityCandidateIds.length === 0) {
      setNotice('중요하다고 생각하는 약속을 선택해 주세요.');
      return;
    }
    socketRef.current.send(
      JSON.stringify(buildPriorityVoteMessage(studentToken, selectedPriorityCandidateIds)),
    );
  }, [selectedPriorityCandidateIds, studentToken]);

  const canSubmit =
    status === 'open' &&
    studentToken !== null &&
    publicState?.phase === 'collecting' &&
    submittedCount < (publicState?.settings.maxProposalsPerStudent ?? 0);

  if (!studentToken || status === 'idle') {
    return (
      <StudentAgreementShell>
        <form
          onSubmit={handleJoin}
          className="mx-auto flex max-w-md flex-col gap-5 rounded-2xl border border-sp-border bg-sp-card p-6"
        >
          <header className="text-center">
            <span className="material-symbols-outlined text-[48px] text-sp-accent">
              diversity_3
            </span>
            <h1 className="mt-2 text-2xl font-bold text-sp-text">교실 약속 정하기</h1>
            <p className="mt-2 text-sm leading-6 text-sp-muted">
              실명 또는 닉네임으로 참여하고, 함께 지킬 수 있는 약속을 제안해요.
            </p>
          </header>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-sp-text">실명 또는 닉네임</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={20}
              autoFocus
              className="rounded-xl border border-sp-border bg-sp-surface px-4 py-3 text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none"
              placeholder="예: 민수"
            />
          </label>
          {notice && <p className="text-sm text-red-300">{notice}</p>}
          <button
            type="submit"
            className="rounded-xl bg-sp-accent px-4 py-3 text-sm font-bold text-white transition hover:brightness-110"
          >
            참여하기
          </button>
        </form>
      </StudentAgreementShell>
    );
  }

  return (
    <StudentAgreementShell>
      <div className="mx-auto flex max-w-2xl flex-col gap-5">
        <section className="rounded-2xl border border-sp-border bg-sp-card p-5">
          <p className="text-sm font-semibold text-sp-accent">
            {publicState?.title ?? '교실 약속 정하기'}
          </p>
          <h1 className="mt-2 text-2xl font-bold text-sp-text">“만약 ___하면, 우리는 ___한다.”</h1>
          <p className="mt-2 text-sm leading-6 text-sp-muted">
            장면: {formatStudentActiveSceneLabel(publicState)} · 내 이름: {displayName}
          </p>
          <p className="mt-2 text-xs text-sp-muted">
            제안 {submittedCount}/{publicState?.settings.maxProposalsPerStudent ?? '-'}개
          </p>
        </section>

        {publicState?.phase === 'setup' && (
          <section className="rounded-2xl border border-sp-border bg-sp-card p-5 text-center">
            <span className="material-symbols-outlined text-[44px] text-sp-accent">hourglass</span>
            <h2 className="mt-2 text-lg font-bold text-sp-text">
              선생님이 제안 시간을 준비하고 있어요
            </h2>
            <p className="mt-2 text-sm leading-6 text-sp-muted">
              곧 “만약-그러면” 약속을 제안할 수 있습니다. 함께 다룰 장면을 떠올려 보세요.
            </p>
          </section>
        )}

        {publicState?.phase === 'collecting' && (
          <form
            onSubmit={handleSubmitProposal}
            className="rounded-2xl border border-sp-border bg-sp-card p-5"
          >
            <h2 className="text-lg font-bold text-sp-text">약속 제안하기</h2>
            <p className="mt-1 text-sm leading-6 text-sp-muted">
              완벽한 문장보다, 친구들이 바로 볼 수 있는 행동을 구체적으로 적어 보세요.
            </p>

            <div className="mt-5 grid gap-4">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-sp-text">만약 상황</span>
                <textarea
                  value={ifText}
                  onChange={(event) => setIfText(event.target.value.slice(0, MAX_TEXT_LENGTH))}
                  rows={3}
                  placeholder="예: 만약 친구가 발표하고 있으면"
                  className="rounded-xl border border-sp-border bg-sp-surface px-4 py-3 text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-sp-text">그러면 행동</span>
                <textarea
                  value={thenText}
                  onChange={(event) => setThenText(event.target.value.slice(0, MAX_TEXT_LENGTH))}
                  rows={3}
                  placeholder="예: 우리는 말을 끊지 않고 메모한다"
                  className="rounded-xl border border-sp-border bg-sp-surface px-4 py-3 text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none"
                />
              </label>
            </div>

            <div className="mt-5 rounded-xl bg-sp-surface p-4 text-sm text-sp-text">
              <span className="font-bold">미리 보기</span>
              <p className="mt-2 leading-6">
                {ifText.trim() || '만약 ___하면'}, {thenText.trim() || '우리는 ___한다'}.
              </p>
            </div>

            {notice && (
              <p className="mt-4 rounded-xl border border-sp-border bg-sp-surface p-3 text-sm text-sp-muted">
                {notice}
              </p>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="mt-5 w-full rounded-xl bg-sp-accent px-4 py-3 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              선생님 화면으로 보내기
            </button>
            {!canSubmit && (
              <p className="mt-3 text-center text-xs text-sp-muted">
                제안 시간이 아니거나 제안 수를 모두 사용했습니다.
              </p>
            )}
          </form>
        )}

        {publicState?.phase === 'teacherReview' && (
          <section className="rounded-2xl border border-sp-border bg-sp-card p-5 text-center">
            <span className="material-symbols-outlined text-[44px] text-sp-accent">
              rate_review
            </span>
            <h2 className="mt-2 text-lg font-bold text-sp-text">
              약속 후보를 함께 다듬는 중이에요
            </h2>
            <p className="mt-2 text-sm leading-6 text-sp-muted">
              선생님 화면에서 후보 문장을 정리하고 있습니다. 잠시 뒤 의견 확인이나 중요 약속 선택이
              열립니다.
            </p>
          </section>
        )}

        {publicState?.phase === 'refinementVoting' && (
          <section className="rounded-2xl border border-sp-border bg-sp-card p-5">
            <h2 className="text-lg font-bold text-sp-text">약속 후보 의견 확인</h2>
            <p className="mt-1 text-sm text-sp-muted">
              바로 함께 실행하기 좋은 문장인지 표시해 주세요.
            </p>
            <div className="mt-4 space-y-3">
              {publicState.candidates.map((candidate) => (
                <article
                  key={candidate.id}
                  className="rounded-xl border border-sp-border bg-sp-surface p-4"
                >
                  <p className="text-sm leading-6 text-sp-text">
                    {candidate.ifText}, {candidate.thenText}.
                  </p>
                  <p className="mt-2 text-xs text-sp-muted">
                    좋아요 {candidate.agreeCount} · 더 다듬기 {candidate.needsWorkCount}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => sendRefinementVote(candidate.id, 'agree')}
                      disabled={refinementVotedCandidateIds.includes(candidate.id)}
                      className="rounded-lg bg-sp-accent px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      함께 실행 가능
                    </button>
                    <button
                      type="button"
                      onClick={() => sendRefinementVote(candidate.id, 'needsWork')}
                      disabled={refinementVotedCandidateIds.includes(candidate.id)}
                      className="rounded-lg border border-sp-border px-3 py-2 text-xs font-bold text-sp-text disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      조금 더 다듬기
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {publicState?.phase === 'priorityVoting' && (
          <section className="rounded-2xl border border-sp-border bg-sp-card p-5">
            <h2 className="text-lg font-bold text-sp-text">중요 약속 선택</h2>
            <p className="mt-1 text-sm text-sp-muted">
              우리 반이 먼저 실천하면 좋을 약속을 {publicState.settings.priorityVoteLimit}개까지
              선택해 주세요.
            </p>
            <div className="mt-4 space-y-3">
              {publicState.candidates.map((candidate) => {
                const checked =
                  selectedPriorityCandidateIds.includes(candidate.id) ||
                  priorityVotedCandidateIds.includes(candidate.id);
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => togglePriorityCandidate(candidate.id)}
                    disabled={priorityVotedCandidateIds.includes(candidate.id)}
                    className={`w-full rounded-xl border p-4 text-left transition ${
                      checked
                        ? 'border-sp-accent bg-sp-accent/10'
                        : 'border-sp-border bg-sp-surface'
                    }`}
                  >
                    <span className="block text-sm leading-6 text-sp-text">
                      {candidate.ifText}, {candidate.thenText}.
                    </span>
                    <span className="mt-2 block text-xs text-sp-muted">
                      현재 선택 {candidate.priorityVoteCount}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={submitPriorityVote}
              disabled={selectedPriorityCandidateIds.length === 0}
              className="mt-5 w-full rounded-xl bg-sp-accent px-4 py-3 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              중요 약속 선택 보내기
            </button>
          </section>
        )}

        {publicState?.phase === 'finalized' && (
          <section className="rounded-2xl border border-sp-border bg-sp-card p-5">
            <h2 className="text-lg font-bold text-sp-text">완성된 교실 약속</h2>
            <p className="mt-1 text-sm leading-6 text-sp-muted">
              우리 반이 함께 고른 약속입니다. 선생님 화면에서 게시용 카드로 확인할 수 있어요.
            </p>
            <div className="mt-4 space-y-3">
              {publicState.candidates.length === 0 ? (
                <p className="rounded-xl bg-sp-surface p-4 text-sm text-sp-muted">
                  아직 확정된 약속이 없습니다.
                </p>
              ) : (
                publicState.candidates.map((candidate, index) => (
                  <article
                    key={candidate.id}
                    className="rounded-xl border border-sp-border bg-sp-surface p-4"
                  >
                    <p className="text-xs font-bold text-sp-accent">{index + 1}번 약속</p>
                    <p className="mt-2 text-sm leading-6 text-sp-text">
                      {candidate.ifText}, {candidate.thenText}.
                    </p>
                    <p className="mt-2 text-xs text-sp-muted">
                      중요 선택 {candidate.priorityVoteCount}
                    </p>
                  </article>
                ))
              )}
            </div>
          </section>
        )}
      </div>
    </StudentAgreementShell>
  );
}

export function buildClassroomAgreementWsUrl(
  location: Pick<Location, 'protocol' | 'host'>,
): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}`;
}

export function buildJoinSessionMessage(
  displayName: string,
  previousToken?: string,
): ClassroomAgreementClientMessage {
  return {
    type: 'join-session',
    protocolVersion: CLASSROOM_AGREEMENT_PROTOCOL_VERSION,
    displayName: displayName.trim(),
    previousToken,
  };
}

export function buildRefinementVoteMessage(
  studentToken: string,
  candidateId: string,
  value: 'agree' | 'needsWork',
): ClassroomAgreementClientMessage {
  return {
    type: 'submit-refinement-vote',
    studentToken,
    clientMessageId: makeClientMessageId(),
    candidateId,
    value,
  };
}

export function buildPriorityVoteMessage(
  studentToken: string,
  candidateIds: readonly string[],
): ClassroomAgreementClientMessage {
  return {
    type: 'submit-priority-vote',
    studentToken,
    clientMessageId: makeClientMessageId(),
    candidateIds: [...candidateIds],
  };
}

function parseServerMessage(raw: unknown): ClassroomAgreementServerMessage | null {
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    const result = ClassroomAgreementServerMessageSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function makeClientMessageId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatStudentActiveSceneLabel(publicState: ClassroomAgreementPublicState | null): string {
  if (!publicState) return '연결 중';
  return (
    publicState.scenes.find((scene) => scene.id === publicState.activeSceneId)?.label ??
    publicState.scenes[0]?.label ??
    '연결 중'
  );
}

function readSessionValue(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSessionValue(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // 참여 자체는 계속 진행한다.
  }
}

function StudentAgreementShell({ children }: { readonly children: React.ReactNode }) {
  return <div className="min-h-screen bg-sp-bg px-5 py-8 text-sp-text">{children}</div>;
}
