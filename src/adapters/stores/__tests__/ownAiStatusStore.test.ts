/**
 * "내 AI" 연결 상태 스토어.
 *
 * ★가장 중요한 것: **고른 모델을 앱 쪽에 다시 알린다.** 모델 선택은 이 화면이 저장하지만
 *   CLI 를 띄우는 쪽은 앱을 껐다 켜면 잊는다. 알리지 않으면 화면과 실제가 어긋난다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { useOwnAiStatusStore } from '../useOwnAiStatusStore';
import { useAssistStore } from '../useAssistStore';
import type { OwnAiConnection } from '@domain/entities/OwnAiProvider';

const setModel = vi.fn();
const statusAll = vi.fn();
const status = vi.fn();

function connected(provider: 'claude' | 'codex', model = ''): OwnAiConnection {
  return { provider, state: 'connected', version: '2.1.258', model };
}

beforeEach(() => {
  setModel.mockReset().mockResolvedValue(true);
  statusAll.mockReset().mockResolvedValue([]);
  status.mockReset();
  (globalThis as { window?: unknown }).window = globalThis;
  (globalThis as { electronAPI?: unknown }).electronAPI = {
    ownAi: { setModel, statusAll, status },
  };
  useOwnAiStatusStore.setState({ connections: { claude: null, codex: null }, available: null });
  useAssistStore.setState({ ownAiModels: { claude: '', codex: '' } });
});

afterEach(() => {
  delete (globalThis as { electronAPI?: unknown }).electronAPI;
});

describe('상태 다시 묻기', () => {
  it('★앱을 껐다 켜도 고른 모델이 실제 실행에 반영되게 다시 알린다', async () => {
    useAssistStore.setState({ ownAiModels: { claude: 'opus', codex: 'gpt-5-codex' } });

    await useOwnAiStatusStore.getState().refresh();

    expect(setModel).toHaveBeenCalledWith('claude', 'opus');
    expect(setModel).toHaveBeenCalledWith('codex', 'gpt-5-codex');
  });

  it('받은 상태를 공급자별로 담는다', async () => {
    statusAll.mockResolvedValue([
      connected('claude'),
      { provider: 'codex', state: 'not-installed' },
    ]);

    await useOwnAiStatusStore.getState().refresh();

    const { connections } = useOwnAiStatusStore.getState();
    expect(connections.claude?.state).toBe('connected');
    expect(connections.codex?.state).toBe('not-installed');
  });

  it('모델 알리기가 실패해도 상태 확인은 계속한다', async () => {
    setModel.mockRejectedValue(new Error('구버전'));
    statusAll.mockResolvedValue([connected('claude')]);

    await useOwnAiStatusStore.getState().refresh();

    expect(useOwnAiStatusStore.getState().connections.claude?.state).toBe('connected');
    expect(useOwnAiStatusStore.getState().checking).toBe(false);
  });

  it('통로가 없으면(브라우저 모드) 아무것도 부르지 않는다', async () => {
    delete (globalThis as { electronAPI?: unknown }).electronAPI;

    await useOwnAiStatusStore.getState().refresh();

    expect(useOwnAiStatusStore.getState().available).toBe(false);
    expect(setModel).not.toHaveBeenCalled();
  });

  it('확인이 실패해도 "확인 중"에 갇히지 않는다', async () => {
    statusAll.mockRejectedValue(new Error('boom'));

    await useOwnAiStatusStore.getState().refresh();

    expect(useOwnAiStatusStore.getState().checking).toBe(false);
  });
});
