import { useEffect } from 'react';
import { useSoundStore } from '@adapters/stores/useSoundStore';
import { useTimerLocalStore, TIMER_LOCAL_KEY } from '@adapters/stores/useTimerLocalStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';

const SOUND_SETTINGS_KEY = 'sound-settings';

/**
 * 본문 창 ↔ 쌤도구 팝업 창 사이에서 도구가 쓰는 값을 맞춘다(ADR-139).
 *
 * - `sound-settings`(🔊 음소거): 한 창에서 끄면 다른 창에서 도는 타이머도 조용해진다.
 *   ⚠️ 이 키를 동기화 목록(`syncRegistry.ts`)에 넣어 해결하지 않는다 — 그러면 음소거가
 *   다른 **기기**까지 동기화된다. `reloadStores` 는 목록에 있는 파일만 다시 읽으므로 여기서 따로 처리한다.
 * - `timer-local`(마지막 시간·최근 이름·발표 명단): 같은 키를 두 창이 쓴다.
 * - `settings`: 팝업 창에는 `reloadStores` 구독이 없으므로 `reloadSettings` 로 켠다
 *   (본문 창은 이미 `reloadStores` 가 settings 를 다시 읽는다).
 *
 * Electron 은 데이터 변경 알림(`onDataChanged`), 웹은 다른 탭의 localStorage 변경(`storage`)을 쓴다.
 */
export function useToolWindowDataSync(options: { readonly reloadSettings: boolean }): void {
  const { reloadSettings } = options;

  useEffect(() => {
    const handle = (key: string): void => {
      if (key === SOUND_SETTINGS_KEY) {
        void useSoundStore.getState().reload();
      } else if (key === TIMER_LOCAL_KEY) {
        void useTimerLocalStore.getState().reload();
      } else if (key === 'settings' && reloadSettings) {
        void useSettingsStore.getState().load(true);
      }
    };

    const api = window.electronAPI;
    const unsubscribe = api?.onDataChanged ? api.onDataChanged(handle) : undefined;

    const onStorage = (event: StorageEvent): void => {
      if (event.key === null || !event.key.startsWith('ssampin_')) return;
      handle(event.key.slice('ssampin_'.length));
    };
    window.addEventListener('storage', onStorage);

    return () => {
      unsubscribe?.();
      window.removeEventListener('storage', onStorage);
    };
  }, [reloadSettings]);
}
