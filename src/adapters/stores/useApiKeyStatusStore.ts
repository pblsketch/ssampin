/**
 * 내 API 키(BYOK) 상태 — 설정 카드·AI 패널·생기부 패널이 **같은 값**을 본다 (ADR-143).
 *
 * ★키 원문은 여기 없다. main 이 주는 것은 "어느 서비스에 키가 있다 + 끝 4자리 + 고른 모델"뿐이다.
 * ★저장하지 않는다(persist 없음). 정본은 main 의 금고라, 앱을 켤 때마다 다시 묻는다.
 */
import { useEffect } from 'react';
import { create } from 'zustand';

import type {
  ApiKeyModelOption,
  ApiKeySaveResult,
  ApiKeyServiceId,
  ApiKeyStatusSnapshot,
} from '@domain/entities/ApiKeyProvider';

type ModelsState =
  | { readonly state: 'loading' }
  | { readonly state: 'ready'; readonly models: readonly ApiKeyModelOption[] }
  | { readonly state: 'error'; readonly reason: string };

interface ApiKeyStatusState {
  /** IPC 통로가 있는가(데스크톱 앱). `null` = 아직 모름, `false` = 브라우저 모드 */
  readonly available: boolean | null;
  readonly snapshot: ApiKeyStatusSnapshot | null;
  readonly models: Readonly<Partial<Record<ApiKeyServiceId, ModelsState>>>;
}

interface ApiKeyStatusActions {
  refresh: () => Promise<void>;
  /** [연결 확인] — 서비스에 키를 확인받고 저장한다. 결과를 그대로 돌려준다 */
  save: (service: ApiKeyServiceId, key: string) => Promise<ApiKeySaveResult>;
  remove: (service: ApiKeyServiceId) => Promise<void>;
  setActive: (service: ApiKeyServiceId, model: string) => Promise<void>;
  loadModels: (service: ApiKeyServiceId, force?: boolean) => Promise<void>;
  openKeyPage: (service: ApiKeyServiceId) => Promise<void>;
}

function api() {
  return typeof window === 'undefined' ? undefined : window.electronAPI?.apiKey;
}

export const useApiKeyStatusStore = create<ApiKeyStatusState & ApiKeyStatusActions>()(
  (set, get) => ({
    available: null,
    snapshot: null,
    models: {},

    refresh: async () => {
      const a = api();
      if (!a) {
        set({ available: false });
        return;
      }
      try {
        set({ available: true, snapshot: await a.status() });
      } catch {
        set({ available: true });
      }
    },

    save: async (service, key) => {
      const a = api();
      if (!a) return { ok: false, reason: 'key-missing' };
      const r = await a.save(service, key);
      if (r.ok) {
        set((s) => ({
          snapshot: r.status,
          models: { ...s.models, [service]: { state: 'ready', models: r.models } },
        }));
      }
      return r;
    },

    remove: async (service) => {
      const a = api();
      if (!a) return;
      const snapshot = await a.remove(service);
      set((s) => {
        const models = { ...s.models };
        delete models[service];
        return { snapshot, models };
      });
    },

    setActive: async (service, model) => {
      const a = api();
      if (!a) return;
      set({ snapshot: await a.setActive(service, model) });
    },

    loadModels: async (service, force = false) => {
      const a = api();
      if (!a) return;
      const current = get().models[service];
      if (!force && current?.state === 'ready') return;
      set((s) => ({ models: { ...s.models, [service]: { state: 'loading' } } }));
      try {
        const r = await a.models(service, force);
        set((s) => ({
          models: {
            ...s.models,
            [service]: r.ok
              ? { state: 'ready', models: r.models }
              : { state: 'error', reason: r.reason },
          },
        }));
      } catch {
        set((s) => ({
          models: { ...s.models, [service]: { state: 'error', reason: 'key-network' } },
        }));
      }
    },

    openKeyPage: async (service) => {
      await api()?.openKeyPage(service);
    },
  }),
);

/** 지금 AI 기능들이 쓸 서비스·모델. 키가 없거나 안 골랐으면 null */
export function useApiKeyActive() {
  return useApiKeyStatusStore((s) => s.snapshot?.active ?? null);
}

/** 화면이 처음 뜰 때 한 번 묻는다. (키는 앱 안에서만 바뀌므로 창 전환마다 물을 필요가 없다) */
export function useApiKeyStatusRefresh(active: boolean): void {
  const refresh = useApiKeyStatusStore((s) => s.refresh);
  const loaded = useApiKeyStatusStore((s) => s.snapshot !== null || s.available === false);
  useEffect(() => {
    if (!active || loaded) return;
    void refresh();
  }, [active, loaded, refresh]);
}
