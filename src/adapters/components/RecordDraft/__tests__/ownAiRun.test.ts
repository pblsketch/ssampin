import { describe, expect, it, vi } from 'vitest';
import { askOnce, type OwnAiRunApi } from '../ownAiRun';
import type { OwnAiRunEvent } from '@domain/entities/OwnAiProvider';

function apiWith(run: OwnAiRunApi['run'], emitFromRun = false): OwnAiRunApi {
  const handlers = new Set<(event: unknown) => void>();
  return {
    run: vi.fn(async (payload) => {
      const result = await run(payload);
      if (emitFromRun) {
        for (const handler of handlers) {
          handler({ type: 'error', runId: payload.runId, kind: 'busy' } satisfies OwnAiRunEvent);
        }
      }
      return result;
    }),
    onEvent: (handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
}

describe('askOnce 실행 오류 전달', () => {
  it('ownAi:run이 반환한 busy 갈래를 crashed로 바꾸지 않는다', async () => {
    const api = apiWith(async () => ({ ok: false, reason: 'busy' }));

    await expect(askOnce(api, 'claude', '초안')).rejects.toBe('busy');
  });

  it('실행 이벤트로 도착한 busy 갈래도 그대로 전달한다', async () => {
    const api = apiWith(async () => ({ ok: true }), true);

    await expect(askOnce(api, 'claude', '초안')).rejects.toBe('busy');
  });

  it('알 수 없는 실행 이유만 crashed로 정리한다', async () => {
    const api = apiWith(async () => ({ ok: false, reason: 'unknown-reason' }));

    await expect(askOnce(api, 'claude', '초안')).rejects.toBe('crashed');
  });
});
