/**
 * @vitest-environment jsdom
 *
 * 제안 게이트 훅 — "[실행] 을 누르기 전에는 저장되지 않는다"를 화면 쪽에서도 고정한다.
 *
 * main 쪽 계약은 `electron/ipc/ownAiGate.contract.test.ts` 가 지킨다. 이 파일은 그다음,
 * 렌더러가 제안을 받아 카드로 세우고 [실행] 때만 실제 저장을 부르는지 본다.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const h = vi.hoisted(() => ({
  handler: null as null | ((payload: unknown) => void),
  offCalls: 0,
  applyCalls: [] as unknown[],
  applyResult: { ok: true, ref: 'k1' } as unknown,
  applyThrows: false,
  depsCalls: 0,
}));

vi.mock('@usecases/aiBridge/applyLiveSyncWrite', () => ({
  applyLiveSyncWrite: async (req: unknown) => {
    h.applyCalls.push(req);
    if (h.applyThrows) throw new Error('저장 실패');
    return h.applyResult;
  },
}));

vi.mock('@adapters/hooks/useAiBridgeLiveSync', () => ({
  buildLiveSyncDeps: () => {
    h.depsCalls += 1;
    return {};
  },
}));

import { useOwnAiWriteGate } from '@adapters/hooks/useOwnAiWriteGate';
import { OWN_AI_PROPOSAL_TTL_MS } from '@domain/rules/ownAiWriteGate';

function proposal(id: string, key: string): unknown {
  return {
    proposalId: id,
    request: { domain: 'todos', op: 'create', idempotencyKey: key, data: { text: '가정통신문' } },
    source: 'unknown',
  };
}

beforeEach(() => {
  h.handler = null;
  h.offCalls = 0;
  h.applyCalls.length = 0;
  h.applyThrows = false;
  h.depsCalls = 0;
  (globalThis as { electronAPI?: unknown }).electronAPI = {
    ownAi: {
      onWriteProposal: (fn: (p: unknown) => void) => {
        h.handler = fn;
        return () => {
          h.offCalls += 1;
        };
      },
    },
  };
});

afterEach(() => {
  delete (globalThis as { electronAPI?: unknown }).electronAPI;
  vi.useRealTimers();
});

describe('제안을 받아 카드로 세운다', () => {
  it('들어온 제안이 대기 목록에 쌓인다', () => {
    const { result } = renderHook(() => useOwnAiWriteGate());
    act(() => h.handler?.(proposal('p1', 'k1')));
    expect(result.current.pending).toHaveLength(1);
    expect(result.current.pending[0]?.proposalId).toBe('p1');
  });

  it('★받기만 해서는 아무것도 저장되지 않는다', () => {
    const { result } = renderHook(() => useOwnAiWriteGate());
    act(() => h.handler?.(proposal('p1', 'k1')));
    expect(h.applyCalls).toHaveLength(0);
    expect(result.current.pending).toHaveLength(1);
  });

  it('모양이 깨진 제안은 무시한다', () => {
    const { result } = renderHook(() => useOwnAiWriteGate());
    act(() => {
      h.handler?.({ proposalId: 123 });
      h.handler?.({ proposalId: 'p', request: {} });
      h.handler?.(null);
    });
    expect(result.current.pending).toHaveLength(0);
  });

  it('같은 요청이 다시 와도 카드가 늘지 않는다 — 모델이 재시도해도 한 장', () => {
    const { result } = renderHook(() => useOwnAiWriteGate());
    act(() => {
      h.handler?.(proposal('p1', 'k1'));
      h.handler?.(proposal('p2', 'k1'));
    });
    expect(result.current.pending).toHaveLength(1);
  });

  it('언마운트하면 구독을 끊는다', () => {
    const { unmount } = renderHook(() => useOwnAiWriteGate());
    unmount();
    expect(h.offCalls).toBe(1);
  });
});

describe('[실행] 을 눌러야 저장된다', () => {
  it('★[실행] 때 처음으로 기존 저장 경로가 불린다', async () => {
    const { result } = renderHook(() => useOwnAiWriteGate());
    act(() => h.handler?.(proposal('p1', 'k1')));

    await act(async () => {
      await result.current.apply('p1');
    });

    expect(h.applyCalls).toHaveLength(1);
    // 두 경로가 어긋나지 않게 같은 store 묶음을 쓴다
    expect(h.depsCalls).toBe(1);
    expect(result.current.pending).toHaveLength(0);
  });

  it('두 번 눌러도 두 번 저장되지 않는다', async () => {
    const { result } = renderHook(() => useOwnAiWriteGate());
    act(() => h.handler?.(proposal('p1', 'k1')));

    await act(async () => {
      await Promise.all([result.current.apply('p1'), result.current.apply('p1')]);
    });

    expect(h.applyCalls).toHaveLength(1);
  });

  it('없는 제안을 실행하면 아무 일도 없다', async () => {
    const { result } = renderHook(() => useOwnAiWriteGate());
    let r: unknown;
    await act(async () => {
      r = await result.current.apply('없음');
    });
    expect(r).toBeNull();
    expect(h.applyCalls).toHaveLength(0);
  });

  it('저장이 실패해도 던지지 않고 결과로 알린다', async () => {
    h.applyThrows = true;
    const { result } = renderHook(() => useOwnAiWriteGate());
    act(() => h.handler?.(proposal('p1', 'k1')));

    const results: ({ ok?: boolean } | null)[] = [];
    await act(async () => {
      results.push((await result.current.apply('p1')) as { ok?: boolean } | null);
    });
    expect(results[0]?.ok).toBe(false);
  });
});

describe('[취소] 와 만료는 저장하지 않는다', () => {
  it('취소하면 카드가 사라지고 저장은 없다', () => {
    const { result } = renderHook(() => useOwnAiWriteGate());
    act(() => h.handler?.(proposal('p1', 'k1')));
    act(() => result.current.reject('p1'));

    expect(result.current.pending).toHaveLength(0);
    expect(h.applyCalls).toHaveLength(0);
  });

  it('★답이 없으면 만료된다 — 만료는 곧 거절이라 아무것도 저장되지 않는다', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useOwnAiWriteGate());
    act(() => h.handler?.(proposal('p1', 'k1')));
    expect(result.current.pending).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(OWN_AI_PROPOSAL_TTL_MS + 6_000);
    });

    expect(result.current.pending).toHaveLength(0);
    expect(h.applyCalls).toHaveLength(0);
  });
});

describe('통로가 없으면(브라우저 모드) 조용히 아무 일도 하지 않는다', () => {
  it('electronAPI 가 없어도 터지지 않는다', () => {
    delete (globalThis as { electronAPI?: unknown }).electronAPI;
    const { result } = renderHook(() => useOwnAiWriteGate());
    expect(result.current.pending).toEqual([]);
  });
});
