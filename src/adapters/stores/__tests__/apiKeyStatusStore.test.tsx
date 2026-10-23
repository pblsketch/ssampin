/** @vitest-environment jsdom */
/**
 * 내 API 키 상태 — ★고른 키가 있으면 모든 AI 기능의 고르기 목록에 "내 API 키"가 뜬다(ADR-143).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useApiKeyStatusStore } from '../useApiKeyStatusStore';
import {
  useConnectedOwnAiProviders,
  useOwnAiReady,
  useOwnAiStatusStore,
} from '../useOwnAiStatusStore';
import { useAssistStore } from '../useAssistStore';
import type { ApiKeyStatusSnapshot } from '@domain/entities/ApiKeyProvider';

const SNAP_ACTIVE: ApiKeyStatusSnapshot = {
  encryptionAvailable: true,
  services: [{ service: 'gemini', configured: true, hint: '••••abcd', persisted: true }],
  active: { service: 'gemini', model: 'models/gemini-flash-latest' },
};

const status = vi.fn();
const save = vi.fn();
const remove = vi.fn();

beforeEach(() => {
  status.mockReset().mockResolvedValue(SNAP_ACTIVE);
  save.mockReset();
  remove.mockReset();
  (window as { electronAPI?: unknown }).electronAPI = { apiKey: { status, save, remove } };
  useApiKeyStatusStore.setState({ available: null, snapshot: null, models: {} });
  useOwnAiStatusStore.setState({ connections: { claude: null, codex: null } });
  useAssistStore.setState({ ownAiEnabled: true });
});

afterEach(() => {
  delete (window as { electronAPI?: unknown }).electronAPI;
});

describe('고르기 목록', () => {
  it('고른 키가 있으면 apikey 가 들어가고, 내 AI 준비가 된다', async () => {
    await useApiKeyStatusStore.getState().refresh();
    const { result } = renderHook(() => ({
      list: useConnectedOwnAiProviders(),
      ready: useOwnAiReady(),
    }));
    expect(result.current.list).toEqual(['apikey']);
    expect(result.current.ready).toBe(true);
  });

  it('키가 없으면(또는 고른 모델이 없으면) 들어가지 않는다', async () => {
    status.mockResolvedValue({ ...SNAP_ACTIVE, active: null });
    await useApiKeyStatusStore.getState().refresh();
    const { result } = renderHook(() => useConnectedOwnAiProviders());
    expect(result.current).toEqual([]);
  });

  it('구독 CLI 와 함께면 CLI 다음에 온다', async () => {
    await useApiKeyStatusStore.getState().refresh();
    useOwnAiStatusStore.setState({
      connections: {
        claude: { provider: 'claude', state: 'connected', version: '2.1.258', model: '' },
        codex: null,
      },
    });
    const { result } = renderHook(() => useConnectedOwnAiProviders());
    expect(result.current).toEqual(['claude', 'apikey']);
  });
});

describe('스토어 동작', () => {
  it('통로가 없으면(브라우저) available=false', async () => {
    delete (window as { electronAPI?: unknown }).electronAPI;
    await useApiKeyStatusStore.getState().refresh();
    expect(useApiKeyStatusStore.getState().available).toBe(false);
  });

  it('저장에 성공하면 상태와 모델 목록을 담는다 — 키는 담지 않는다', async () => {
    save.mockResolvedValue({
      ok: true,
      status: SNAP_ACTIVE,
      models: [
        { id: 'models/gemini-flash-latest', label: 'Gemini Flash (늘 최신)', recommended: true },
      ],
    });
    const r = await useApiKeyStatusStore.getState().save('gemini', 'AIza-secret-value-1234567890');
    expect(r.ok).toBe(true);
    const state = useApiKeyStatusStore.getState();
    expect(state.snapshot?.active?.service).toBe('gemini');
    expect(state.models.gemini).toMatchObject({ state: 'ready' });
    expect(JSON.stringify(state)).not.toContain('AIza-secret');
  });

  it('지우면 그 서비스의 모델 목록도 버린다', async () => {
    useApiKeyStatusStore.setState({
      snapshot: SNAP_ACTIVE,
      models: { gemini: { state: 'ready', models: [] } },
    });
    remove.mockResolvedValue({ ...SNAP_ACTIVE, services: [], active: null });
    await useApiKeyStatusStore.getState().remove('gemini');
    expect(useApiKeyStatusStore.getState().models.gemini).toBeUndefined();
    expect(useApiKeyStatusStore.getState().snapshot?.active).toBeNull();
  });
});
