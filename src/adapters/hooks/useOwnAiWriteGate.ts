/**
 * "내 AI로 실행" 중에 온 저장 요청을 **제안**으로 받아 두고, 선생님이 [실행]을 눌렀을 때만
 * 실제로 저장하는 훅.
 *
 * ★왜 이 모양인가(ADR-082 D6 보정):
 * 브릿지 쓰기는 앱으로 오는 **차단형 loopback HTTP** 라 승인을 기다릴 수 없다
 * (브릿지 12초·앱 10초가 번들 상수). 그래서 main 이 **즉시 409** 로 답하고 제안만 넘긴다.
 * 여기서는 그 제안을 줄 세워 두었다가, [실행] 때 **기존 저장 경로**(`applyLiveSyncWrite`)로
 * 적용한다 — 두 경로가 어긋나지 않게 `buildLiveSyncDeps()` 를 같이 쓴다.
 *
 * ★만료는 곧 거절이다. 답이 없으면 아무것도 저장하지 않는다.
 *
 * ★출처를 아직 못 가른다. 활성 중에는 설정에 등록된 **다른 AI 앱**(Claude Desktop 등)의
 * 저장 요청도 제안으로 바뀐다. 그래서 카드에 "다른 AI 앱에서 온 요청일 수 있어요"를 적는다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  emptyWriteGate,
  enqueueProposal,
  expireProposals,
  markApplied,
  markRejected,
  pendingProposals,
  pruneSettled,
  OWN_AI_PROPOSAL_TTL_MS,
  type OwnAiProposal,
} from '@domain/rules/ownAiWriteGate';
import {
  applyLiveSyncWrite,
  type LiveSyncWriteRequest,
  type LiveSyncWriteResult,
} from '@usecases/aiBridge/applyLiveSyncWrite';
import { buildLiveSyncDeps } from '@adapters/hooks/useAiBridgeLiveSync';

/** 만료된 제안을 치우는 주기. TTL 자체는 도메인이 정한다. */
const SWEEP_MS = 5_000;

/** main → 렌더러로 오는 제안 한 건. */
interface IncomingProposal {
  readonly proposalId?: unknown;
  readonly request?: unknown;
  readonly source?: unknown;
}

interface OwnAiBridgeApi {
  onWriteProposal(handler: (payload: unknown) => void): () => void;
}

function bridgeApi(): OwnAiBridgeApi | null {
  const api = (globalThis as { electronAPI?: { ownAi?: OwnAiBridgeApi } }).electronAPI?.ownAi;
  return api ?? null;
}

function toProposal(raw: unknown, now: number): OwnAiProposal<LiveSyncWriteRequest> | null {
  const p = raw as IncomingProposal;
  if (typeof p?.proposalId !== 'string') return null;
  const req = p.request as LiveSyncWriteRequest | undefined;
  if (!req || typeof req.idempotencyKey !== 'string') return null;
  return {
    proposalId: p.proposalId,
    request: req,
    source: 'unknown',
    createdAt: now,
    state: 'pending',
  };
}

export interface OwnAiWriteGate {
  /** 화면에 띄울 제안들(대기 중인 것만). */
  readonly pending: readonly OwnAiProposal<LiveSyncWriteRequest>[];
  /** [실행] — 여기서 처음으로 실제 저장이 일어난다. */
  readonly apply: (proposalId: string) => Promise<LiveSyncWriteResult | null>;
  /** [취소] */
  readonly reject: (proposalId: string) => void;
}

export function useOwnAiWriteGate(): OwnAiWriteGate {
  const [state, setState] = useState(() => emptyWriteGate<LiveSyncWriteRequest>());
  /**
   * 지금 저장 중인 제안.
   *
   * ★상태(useState)만으로는 두 번 누르기를 못 막는다 — React 상태 갱신은 비동기라
   * 빠르게 두 번 누르면 두 호출이 **같은 옛 상태**를 보고 둘 다 통과한다(테스트로 확인).
   * 즉시 반영되는 ref 로 막는다.
   */
  const inFlight = useRef<Set<string>>(new Set());

  useEffect(() => {
    const api = bridgeApi();
    if (!api) return;
    return api.onWriteProposal((raw) => {
      const proposal = toProposal(raw, Date.now());
      if (!proposal) return;
      // 같은 idempotencyKey 가 대기 중이면 카드를 늘리지 않는다 —
      // 모델이 "승인 대기 중" 문구를 보고 다시 시도해도 화면이 쌓이지 않게.
      setState((s) => enqueueProposal(s, proposal));
    });
  }, []);

  // 만료 청소. 만료는 거절이므로 아무것도 저장하지 않는다.
  useEffect(() => {
    const timer = setInterval(() => {
      setState((s) => pruneSettled(expireProposals(s, Date.now(), OWN_AI_PROPOSAL_TTL_MS)));
    }, SWEEP_MS);
    return () => clearInterval(timer);
  }, []);

  const apply = useCallback(
    async (proposalId: string): Promise<LiveSyncWriteResult | null> => {
      if (inFlight.current.has(proposalId)) return null;
      const target = state.proposals.find(
        (p) => p.proposalId === proposalId && p.state === 'pending',
      );
      if (!target) return null;

      inFlight.current.add(proposalId);
      setState((s) => markApplied(s, proposalId));
      try {
        return await applyLiveSyncWrite(target.request, buildLiveSyncDeps());
      } catch {
        return { ok: false, status: 500, error: '저장하지 못했어요.' };
      } finally {
        inFlight.current.delete(proposalId);
      }
    },
    [state],
  );

  const reject = useCallback((proposalId: string) => {
    setState((s) => markRejected(s, proposalId));
  }, []);

  const pending = useMemo(() => pendingProposals(state), [state]);

  return { pending, apply, reject };
}
