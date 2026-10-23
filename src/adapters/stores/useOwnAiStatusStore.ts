/**
 * "내 AI" 연결 상태 — 화면 여러 곳이 **같은 값**을 본다.
 *
 * 설정 > AI 연결 카드가 설치·로그인을 진행하고, 오른쪽 AI 패널과 사이드바 진입점은
 * "연결된 것이 있는가"만 묻는다. 각자 IPC 를 부르면 값이 어긋나므로 한 곳에 둔다.
 *
 * ★저장하지 않는다. 설치·로그인의 정본은 이 컴퓨터의 CLI 라, 앱을 켤 때마다 다시 묻는다.
 * ★토큰·계정 정보는 없다 — 여기 있는 건 상태 이름·버전·모델뿐이다.
 */
import { useEffect, useMemo } from 'react';
import { create } from 'zustand';

import {
  OWN_AI_PROVIDERS,
  type OwnAiConnection,
  type OwnAiProviderId,
} from '@domain/entities/OwnAiProvider';
import type { AiRunProviderId } from '@domain/entities/ApiKeyProvider';
import { useApiKeyStatusStore } from './useApiKeyStatusStore';
import { useAssistStore } from './useAssistStore';

export interface OwnAiUsage {
  /** 0~1. 5시간 창 소진율. 모르면 null */
  readonly fiveHourUtilization: number | null;
  /** epoch seconds. 모르면 null */
  readonly resetsAt: number | null;
}

type Connections = Readonly<Record<OwnAiProviderId, OwnAiConnection | null>>;

interface OwnAiStatusState {
  /** 공급자별 마지막으로 확인한 상태. `null` = 아직 안 물어봤다. */
  readonly connections: Connections;
  /** IPC 통로가 있는가(데스크톱 앱). `null` = 아직 모름, `false` = 브라우저 모드. */
  readonly available: boolean | null;
  readonly checking: boolean;
  /** 마지막 실행이 알려 준 남은 사용량(claude `rate_limit_event`). */
  readonly usage: OwnAiUsage | null;
}

interface OwnAiStatusActions {
  /** 모든 공급자 상태를 다시 묻는다. 통로가 없으면 `available:false` 로 끝난다. */
  refresh: () => Promise<void>;
  /** 한 공급자만 다시 묻는다(카드의 [다시 확인]). */
  refreshOne: (provider: OwnAiProviderId) => Promise<void>;
  setConnection: (connection: OwnAiConnection) => void;
  setUsage: (fiveHourUtilization: number | null, resetsAt: number | null) => void;
}

const EMPTY_CONNECTIONS: Connections = { claude: null, codex: null };

export const useOwnAiStatusStore = create<OwnAiStatusState & OwnAiStatusActions>()((set) => ({
  connections: EMPTY_CONNECTIONS,
  available: null,
  checking: false,
  usage: null,

  refresh: async () => {
    const api = window.electronAPI?.ownAi;
    if (!api) {
      set({ available: false, checking: false });
      return;
    }
    set({ available: true, checking: true });
    try {
      // ★고른 모델을 앱 쪽에 먼저 알린다.
      //   모델 선택은 이 화면이 저장하지만(앱을 껐다 켜도 남는다), 실제로 CLI 를 띄우는
      //   쪽은 그 값을 기억하지 않는다. 알려 주지 않으면 화면은 "Opus"라고 적혀 있는데
      //   실제로는 기본 모델로 돌아가는, 눈으로는 못 잡는 어긋남이 생긴다.
      const models = useAssistStore.getState().ownAiModels;
      await Promise.all(
        OWN_AI_PROVIDERS.map((p) => Promise.resolve(api.setModel(p, models[p])).catch(() => false)),
      );

      const all = await api.statusAll();
      set((s) => {
        const next: Record<OwnAiProviderId, OwnAiConnection | null> = { ...s.connections };
        for (const c of all) next[c.provider] = c;
        return { connections: next, checking: false };
      });
    } catch {
      // 상태는 미확정으로 둔다 — 카드가 "확인 중"을 계속 보여 주지 않도록 checking 만 내린다.
      set({ checking: false });
    }
  },

  refreshOne: async (provider) => {
    const api = window.electronAPI?.ownAi;
    if (!api) {
      set({ available: false });
      return;
    }
    try {
      const c = await api.status(provider);
      set((s) => ({ available: true, connections: { ...s.connections, [provider]: c } }));
    } catch {
      /* 무시 — 이전 값을 그대로 둔다 */
    }
  },

  setConnection: (connection) =>
    set((s) => ({ connections: { ...s.connections, [connection.provider]: connection } })),

  setUsage: (fiveHourUtilization, resetsAt) => set({ usage: { fiveHourUtilization, resetsAt } }),
}));

export function isOwnAiConnected(
  c: OwnAiConnection | null | undefined,
): c is Extract<OwnAiConnection, { state: 'connected' }> {
  return c?.state === 'connected';
}

/**
 * 지금 AI 를 돌릴 수 있는 통로 목록(순서 고정) — 연결된 구독 CLI + 고른 모델이 있는 내 API 키.
 *
 * ★'apikey' 를 여기서 함께 돌려준다(ADR-143). AI 패널·생기부 초안·근거 보드·분량 조절이
 *   모두 이 목록으로 고르기 단추를 그리므로, 한 곳만 고쳐도 모든 AI 기능에서 키를 쓸 수 있다.
 * 배열 참조는 연결 상태나 고른 키가 바뀔 때만 바뀐다.
 */
export function useConnectedOwnAiProviders(): readonly AiRunProviderId[] {
  const connections = useOwnAiStatusStore((s) => s.connections);
  const apiKeyActive = useApiKeyStatusStore((s) => (s.snapshot?.active ?? null) !== null);
  return useMemo(() => {
    const cli: AiRunProviderId[] = OWN_AI_PROVIDERS.filter((p) => isOwnAiConnected(connections[p]));
    return apiKeyActive ? [...cli, 'apikey'] : cli;
  }, [connections, apiKeyActive]);
}

/** "내 AI" 로 답할 준비가 됐는가 = 실험실 스위치 ON + 연결된 구독 또는 고른 API 키. */
export function useOwnAiReady(): boolean {
  const enabled = useAssistStore((s) => s.ownAiEnabled);
  return enabled && useConnectedOwnAiProviders().length > 0;
}

/**
 * 창 전환마다 CLI 두 개를 띄우면 무겁다 — 이 간격 안의 재확인은 건너뛴다.
 *
 * ★10초였을 때 "AI 를 쓰려고 하면 터미널이 자꾸 깜빡인다"는 신고가 있었다(2026-09-06).
 * 로그인은 한 번 하면 유지되므로 자주 확인할 이유가 없다. 설치·로그인은 앱 밖에서
 * 끝나지만, 그때는 카드의 [다시 확인]이 캐시를 건너뛰고 곧바로 묻는다.
 */
const FOCUS_RECHECK_MIN_MS = 10 * 60_000;

/**
 * 상태를 **때맞춰** 다시 묻는다: 마운트 시 한 번 + 창이 다시 앞으로 올 때.
 * 설치·로그인은 쌤핀 밖(터미널·브라우저)에서 끝나므로, 돌아오는 순간이 확인할 때다.
 */
export function useOwnAiStatusRefresh(active: boolean): void {
  const refresh = useOwnAiStatusStore((s) => s.refresh);
  const refreshApiKey = useApiKeyStatusStore((s) => s.refresh);
  useEffect(() => {
    if (!active) return;
    void refresh();
    // 내 API 키 상태도 함께 — 키는 CLI 를 띄우지 않으니 가볍다.
    void refreshApiKey();
    let last = Date.now();
    const onFocus = (): void => {
      if (Date.now() - last < FOCUS_RECHECK_MIN_MS) return;
      // ★이미 연결된 것이 있으면 다시 묻지 않는다. 연결은 한 번 되면 유지되고,
      //   확인할 때마다 CLI 프로세스가 뜬다. 아직 연결이 없을 때만(= 설치·로그인을
      //   기다리는 상황) 창이 돌아온 것을 신호로 본다.
      const connections = useOwnAiStatusStore.getState().connections;
      if (OWN_AI_PROVIDERS.some((p) => isOwnAiConnected(connections[p]))) return;
      last = Date.now();
      void refresh();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [active, refresh, refreshApiKey]);
}
