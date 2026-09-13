import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssistRequestPayload } from '@domain/ports/AssistPort';
import { OwnAiAssistPort } from '../OwnAiAssistPort';

const PAYLOAD: AssistRequestPayload = {
  installId: 'test-install',
  turns: [{ role: 'user', content: '질문' }],
  toolResults: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OwnAiAssistPort 실행 상태 정리', () => {
  it('IPC run Promise가 거부되면 이후 cancel이 예전 runId를 보내지 않는다', async () => {
    const cancel = vi.fn();
    const onEvent = vi.fn(() => () => undefined);
    vi.stubGlobal('electronAPI', {
      ownAi: {
        run: vi.fn(async () => {
          throw new Error('IPC 연결 끊김');
        }),
        cancel,
        onEvent,
      },
    });
    const port = new OwnAiAssistPort({ provider: 'claude' });

    await expect(port.ask(PAYLOAD)).rejects.toThrow('IPC 연결 끊김');
    port.cancel();

    expect(cancel).not.toHaveBeenCalled();
  });
});
