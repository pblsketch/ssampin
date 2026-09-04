import { describe, it, expect } from 'vitest';
import {
  emptyWriteGate,
  enqueueProposal,
  expireProposals,
  graceUntil,
  isOwnAiActive,
  markApplied,
  markRejected,
  pendingProposals,
  pruneSettled,
  OWN_AI_ACTIVE_GRACE_MS,
  OWN_AI_PROPOSAL_TTL_MS,
  OWN_AI_WRITE_PENDING_STATUS,
  type OwnAiProposal,
} from '@domain/rules/ownAiWriteGate';

interface Req {
  readonly idempotencyKey: string;
  readonly domain: string;
}

function proposal(id: string, key: string, createdAt = 0): OwnAiProposal<Req> {
  return {
    proposalId: id,
    request: { idempotencyKey: key, domain: 'todos' },
    source: 'unknown',
    createdAt,
    state: 'pending',
  };
}

describe('제안 대기줄', () => {
  it('넣으면 대기 상태로 쌓인다', () => {
    const s = enqueueProposal(emptyWriteGate<Req>(), proposal('p1', 'k1'));
    expect(pendingProposals(s)).toHaveLength(1);
  });

  it('★같은 idempotencyKey 가 대기 중이면 카드를 늘리지 않는다 — 모델이 재시도해도 한 장', () => {
    let s = enqueueProposal(emptyWriteGate<Req>(), proposal('p1', 'k1'));
    s = enqueueProposal(s, proposal('p2', 'k1'));
    expect(pendingProposals(s)).toHaveLength(1);
  });

  it('이미 처리된 키는 새 제안을 막지 않는다', () => {
    let s = enqueueProposal(emptyWriteGate<Req>(), proposal('p1', 'k1'));
    s = markApplied(s, 'p1');
    s = enqueueProposal(s, proposal('p2', 'k1'));
    expect(pendingProposals(s)).toHaveLength(1);
    expect(pendingProposals(s)[0]?.proposalId).toBe('p2');
  });

  it('[실행]·[취소] 는 대기 중인 것만 옮긴다', () => {
    let s = enqueueProposal(emptyWriteGate<Req>(), proposal('p1', 'k1'));
    s = markApplied(s, 'p1');
    expect(s.proposals[0]?.state).toBe('applied');
    // 이미 끝난 것에 다시 [취소] 를 해도 상태가 뒤집히지 않는다
    const same = markRejected(s, 'p1');
    expect(same).toBe(s);
    expect(same.proposals[0]?.state).toBe('applied');
  });

  it('없는 제안을 처리하면 상태가 그대로다(참조까지 동일)', () => {
    const s = enqueueProposal(emptyWriteGate<Req>(), proposal('p1', 'k1'));
    expect(markApplied(s, 'nope')).toBe(s);
  });
});

describe('만료는 곧 거절이다', () => {
  it('TTL 을 넘기면 expired 로 바뀌고 아무것도 저장되지 않는다', () => {
    const s = enqueueProposal(emptyWriteGate<Req>(), proposal('p1', 'k1', 0));
    const after = expireProposals(s, OWN_AI_PROPOSAL_TTL_MS + 1);
    expect(after.proposals[0]?.state).toBe('expired');
    expect(pendingProposals(after)).toHaveLength(0);
  });

  it('TTL 안이면 그대로 대기한다', () => {
    const s = enqueueProposal(emptyWriteGate<Req>(), proposal('p1', 'k1', 0));
    expect(expireProposals(s, OWN_AI_PROPOSAL_TTL_MS - 1)).toBe(s);
  });

  it('끝난 제안은 치울 수 있다', () => {
    let s = enqueueProposal(emptyWriteGate<Req>(), proposal('p1', 'k1'));
    s = enqueueProposal(s, proposal('p2', 'k2'));
    s = markRejected(s, 'p1');
    expect(pruneSettled(s).proposals).toHaveLength(1);
  });
});

describe('활성 판정 — 유예창', () => {
  it('실행 중에는 활성이다', () => {
    expect(isOwnAiActive(Number.POSITIVE_INFINITY, Date.now())).toBe(true);
  });

  it('끝난 뒤 15초는 아직 활성이고, 그 뒤에는 아니다 — 늦은 쓰기(브릿지 상한 12초)를 덮는다', () => {
    const closedAt = 1_000_000;
    const until = graceUntil(closedAt);
    expect(OWN_AI_ACTIVE_GRACE_MS).toBeGreaterThan(12_000);
    expect(isOwnAiActive(until, closedAt + 14_000)).toBe(true);
    expect(isOwnAiActive(until, closedAt + 16_000)).toBe(false);
  });

  it('★유예값은 대입이지 max 가 아니다 — max 면 실행 후에도 영원히 409 가 된다', () => {
    const closedAt = 2_000_000;
    const wrong = Math.max(Number.POSITIVE_INFINITY, graceUntil(closedAt));
    expect(isOwnAiActive(wrong, closedAt + 10 ** 9)).toBe(true); // 잘못된 방식은 영원히 활성
    expect(isOwnAiActive(graceUntil(closedAt), closedAt + 10 ** 9)).toBe(false); // 올바른 방식
  });

  it('기본 비활성값(0)은 활성이 아니다', () => {
    expect(isOwnAiActive(0, Date.now())).toBe(false);
  });
});

describe('브릿지에 돌려주는 답', () => {
  it('409 로 즉시 답한다 — 도구 호출을 열어 두지 않는다', () => {
    expect(OWN_AI_WRITE_PENDING_STATUS).toBe(409);
  });
});
