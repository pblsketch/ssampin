/**
 * @vitest-environment jsdom
 *
 * 이 화면이 없으면 D6("[실행] 을 눌러야 저장된다")이 말뿐이 된다 — main 은 409 를 주고
 * 제안을 보내는데 받는 화면이 없으면 제안이 조용히 사라진다. 그 상태를 막는 테스트다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { OwnAiProposalCards } from '../OwnAiProposalCards';

const applyLiveSyncWrite = vi.hoisted(() => vi.fn());
vi.mock('@usecases/aiBridge/applyLiveSyncWrite', () => ({ applyLiveSyncWrite }));
vi.mock('@adapters/hooks/useAiBridgeLiveSync', () => ({ buildLiveSyncDeps: () => ({}) }));

/** main 이 보내는 제안을 흉내 낸다. */
let emit: ((payload: unknown) => void) | null = null;

function proposal(over: Record<string, unknown> = {}) {
  return {
    proposalId: 'p-1',
    request: {
      domain: 'todos',
      op: 'create',
      idempotencyKey: 'k-1',
      data: { text: '수행평가 채점하기' },
    },
    ...over,
  };
}

beforeEach(() => {
  applyLiveSyncWrite.mockReset();
  applyLiveSyncWrite.mockResolvedValue({ ok: true });
  emit = null;
  (globalThis as { electronAPI?: unknown }).electronAPI = {
    ownAi: {
      onWriteProposal(handler: (payload: unknown) => void) {
        emit = handler;
        return () => {
          emit = null;
        };
      },
    },
  };
});

afterEach(() => {
  cleanup();
  delete (globalThis as { electronAPI?: unknown }).electronAPI;
});

describe('내 AI 저장 제안 카드', () => {
  it('제안이 없으면 아무것도 그리지 않는다', () => {
    const { container } = render(<OwnAiProposalCards />);
    expect(container.innerHTML).toBe('');
  });

  it('제안이 오면 무엇을 하려는지와 출처 안내를 보여 준다', async () => {
    render(<OwnAiProposalCards />);
    act(() => emit?.(proposal()));

    expect(await screen.findByText('할 일 추가')).toBeTruthy();
    expect(screen.getByText('수행평가 채점하기')).toBeTruthy();
    expect(screen.getByText(/다른 AI 앱에서 온 요청일 수 있어요/)).toBeTruthy();
  });

  it('★카드를 그리기만 하고 저장하지 않는다 — [실행] 을 눌러야 저장된다', async () => {
    render(<OwnAiProposalCards />);
    act(() => emit?.(proposal()));
    await screen.findByText('할 일 추가');

    expect(applyLiveSyncWrite).not.toHaveBeenCalled();
  });

  it('[실행] 을 누르면 기존 저장 경로로 넘긴다', async () => {
    render(<OwnAiProposalCards />);
    act(() => emit?.(proposal()));
    await screen.findByText('할 일 추가');

    await userEvent.click(screen.getByRole('button', { name: '실행' }));

    await waitFor(() => expect(applyLiveSyncWrite).toHaveBeenCalledTimes(1));
    expect(applyLiveSyncWrite.mock.calls[0]?.[0]).toMatchObject({
      domain: 'todos',
      op: 'create',
      idempotencyKey: 'k-1',
    });
  });

  it('[취소] 를 누르면 카드가 사라지고 아무것도 저장되지 않는다', async () => {
    render(<OwnAiProposalCards />);
    act(() => emit?.(proposal()));
    await screen.findByText('할 일 추가');

    await userEvent.click(screen.getByRole('button', { name: '취소' }));

    await waitFor(() => expect(screen.queryByText('할 일 추가')).toBeNull());
    expect(applyLiveSyncWrite).not.toHaveBeenCalled();
  });

  it('★[실행] 을 빠르게 두 번 눌러도 한 번만 저장한다', async () => {
    render(<OwnAiProposalCards />);
    act(() => emit?.(proposal()));
    await screen.findByText('할 일 추가');

    const btn = screen.getByRole('button', { name: '실행' });
    await Promise.all([userEvent.click(btn), userEvent.click(btn)]);

    await waitFor(() => expect(applyLiveSyncWrite).toHaveBeenCalledTimes(1));
  });
});
