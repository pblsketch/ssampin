/**
 * 쓰기 게이트 — 구독 CLI 가 요청한 저장을 "제안"으로 바꿔 두는 대기줄(순수 상태 기계).
 *
 * ★설계가 실측으로 뒤집힌 자리(ADR-082 C3′):
 *
 * 브릿지 쓰기는 파일을 툭 떨어뜨리는 게 아니라 **앱으로 오는 차단형 loopback HTTP** 다
 * (브릿지 쪽 12초, 앱 쪽 10초 — 둘 다 번들에 박힌 상수). 그래서 "도구 호출을 열어 둔 채
 * 선생님 승인을 기다린다"는 성립하지 않는다. 대신 앱은 **즉시 409 로 답하고**(모델에게는
 * "승인 대기 중"이라고 말해 준다) 요청을 이 대기줄에 넣는다. 선생님이 [실행] 을 누르면
 * 그때 기존 저장 경로로 적용한다.
 *
 * ★만료는 "거절"이다 — 답이 없으면 저장하지 않는다(안전한 쪽으로 실패).
 *
 * ★이 파일은 도메인이다. 외부 의존성 import 금지. 요청 타입을 제네릭으로 받는 이유도 같다 —
 *   렌더러 타입(`LiveSyncWriteRequest`)도 electron 타입(`ApplyWriteRequest`)도 import 하지 않는다.
 */

/** 대기줄에 넣을 수 있는 최소 조건 — 같은 요청을 두 번 세지 않기 위한 키. */
export interface HasIdempotencyKey {
  readonly idempotencyKey: string;
}

export type OwnAiProposalState = 'pending' | 'applied' | 'rejected' | 'expired';

export interface OwnAiProposal<T extends HasIdempotencyKey> {
  readonly proposalId: string;
  readonly request: T;
  /** 어디서 온 요청인지 아직 못 가른다 — 카드에 "다른 AI 앱일 수 있어요"를 적기 위한 값. */
  readonly source: 'unknown';
  readonly createdAt: number;
  readonly state: OwnAiProposalState;
}

/** 선생님이 답하지 않으면 이만큼 뒤에 스스로 사라진다. */
export const OWN_AI_PROPOSAL_TTL_MS = 120_000;

export interface OwnAiWriteGateState<T extends HasIdempotencyKey> {
  readonly proposals: readonly OwnAiProposal<T>[];
}

export function emptyWriteGate<T extends HasIdempotencyKey>(): OwnAiWriteGateState<T> {
  return { proposals: [] };
}

/** 아직 답을 기다리는 제안들. */
export function pendingProposals<T extends HasIdempotencyKey>(
  state: OwnAiWriteGateState<T>,
): readonly OwnAiProposal<T>[] {
  return state.proposals.filter((p) => p.state === 'pending');
}

/**
 * 제안을 넣는다. **같은 `idempotencyKey` 가 이미 대기 중이면 카드를 늘리지 않는다** —
 * 모델이 "승인 대기 중" 문구를 보고 다시 시도해도 화면에 같은 카드가 쌓이지 않게.
 */
export function enqueueProposal<T extends HasIdempotencyKey>(
  state: OwnAiWriteGateState<T>,
  proposal: OwnAiProposal<T>,
): OwnAiWriteGateState<T> {
  const dup = state.proposals.some(
    (p) => p.state === 'pending' && p.request.idempotencyKey === proposal.request.idempotencyKey,
  );
  if (dup) return state;
  return { proposals: [...state.proposals, proposal] };
}

function settle<T extends HasIdempotencyKey>(
  state: OwnAiWriteGateState<T>,
  proposalId: string,
  next: Exclude<OwnAiProposalState, 'pending'>,
): OwnAiWriteGateState<T> {
  let changed = false;
  const proposals = state.proposals.map((p) => {
    if (p.proposalId !== proposalId || p.state !== 'pending') return p;
    changed = true;
    return { ...p, state: next };
  });
  return changed ? { proposals } : state;
}

/** [실행] — 실제 저장은 호출자가 기존 경로로 한다. 여기서는 상태만 옮긴다. */
export function markApplied<T extends HasIdempotencyKey>(
  state: OwnAiWriteGateState<T>,
  proposalId: string,
): OwnAiWriteGateState<T> {
  return settle(state, proposalId, 'applied');
}

/** [취소] */
export function markRejected<T extends HasIdempotencyKey>(
  state: OwnAiWriteGateState<T>,
  proposalId: string,
): OwnAiWriteGateState<T> {
  return settle(state, proposalId, 'rejected');
}

/** 시간이 지난 제안을 만료시킨다. 만료는 곧 거절이다 — 아무것도 저장하지 않는다. */
export function expireProposals<T extends HasIdempotencyKey>(
  state: OwnAiWriteGateState<T>,
  now: number,
  ttlMs: number = OWN_AI_PROPOSAL_TTL_MS,
): OwnAiWriteGateState<T> {
  let changed = false;
  const proposals = state.proposals.map((p) => {
    if (p.state !== 'pending' || now - p.createdAt < ttlMs) return p;
    changed = true;
    return { ...p, state: 'expired' as const };
  });
  return changed ? { proposals } : state;
}

/** 끝난 제안을 치운다(화면에서 사라진 뒤 상태만 남지 않게). */
export function pruneSettled<T extends HasIdempotencyKey>(
  state: OwnAiWriteGateState<T>,
): OwnAiWriteGateState<T> {
  const proposals = state.proposals.filter((p) => p.state === 'pending');
  return proposals.length === state.proposals.length ? state : { proposals };
}

/** 브릿지에게 즉시 돌려줄 문구. 모델이 이걸 읽고 재시도하지 않도록 분명히 적는다. */
export const OWN_AI_WRITE_PENDING_MESSAGE =
  '선생님 승인 대기 중 — 화면의 미리보기 카드에서 [실행]을 누르면 저장됩니다. 다시 시도하지 마세요.';

/** 앱이 브릿지에 돌려주는 상태 코드(HTTP 의미 그대로). */
export const OWN_AI_WRITE_PENDING_STATUS = 409;

/**
 * 구독 실행이 "활성"인가 — 이 순간 들어온 쓰기를 제안으로 돌릴지 정한다.
 *
 * ★`activeUntil` 은 **대입만 한다**. `Math.max()` 로 갱신하면 `max(Infinity, …)` 가 계속
 * `Infinity` 라 실행이 끝나도 영원히 409 가 되어, 선생님이 다른 AI 앱에서 하는 저장까지
 * 앱 재시작 전까지 전부 막힌다.
 */
export function isOwnAiActive(activeUntil: number, now: number): boolean {
  return now < activeUntil;
}

/**
 * 실행이 끝난 뒤에도 잠깐 활성으로 둔다.
 *
 * 브릿지는 stdin 이 닫힌 뒤 **진행 중이던 요청만 끝내고** 죽는다. 그 요청의 상한이 12초라,
 * 자식이 죽은 뒤 12초 안에 도착하는 늦은 쓰기가 있을 수 있다. 15초는 그 위의 여유값이다.
 */
export const OWN_AI_ACTIVE_GRACE_MS = 15_000;

export function graceUntil(now: number): number {
  return now + OWN_AI_ACTIVE_GRACE_MS;
}
