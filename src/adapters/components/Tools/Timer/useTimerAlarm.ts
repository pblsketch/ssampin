import { useCallback, useEffect, useRef } from 'react';
import { create } from 'zustand';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import {
  deleteCustomAudio,
  loadCustomAudio,
  playAlarmSound,
  playPreWarningSound,
  saveCustomAudio,
} from './timerAudio';

/**
 * 선생님이 등록한 '내 파일' 알람음 — 탭들이 함께 본다.
 * 탭마다 따로 읽으면, 알람음 패널에서 새 파일을 고른 뒤 다른 탭의 알람은 옛 파일(또는 기본음)로 울린다.
 * (예전 발표 타이머는 아예 파일을 넘기지 않아 늘 기본음이었다 — 결함 2)
 */
interface CustomAlarmAudioState {
  readonly dataUrl: string | null;
  readonly loaded: boolean;
  load(): Promise<void>;
  save(name: string, dataUrl: string): Promise<void>;
  clear(): Promise<void>;
}

export const useCustomAlarmAudioStore = create<CustomAlarmAudioState>((set, get) => ({
  dataUrl: null,
  loaded: false,
  load: async () => {
    if (get().loaded) return;
    const data = await loadCustomAudio().catch(() => null);
    set({ dataUrl: data?.dataUrl ? data.dataUrl : null, loaded: true });
  },
  save: async (name, dataUrl) => {
    set({ dataUrl, loaded: true });
    await saveCustomAudio(name, dataUrl);
  },
  clear: async () => {
    set({ dataUrl: null, loaded: true });
    await deleteCustomAudio();
  },
}));

/**
 * 타이머 알람을 울리는 손잡이. 설정이 바뀌어도 돌고 있는 interval 이 옛 값을 쓰지 않도록
 * 늘 최신 값을 ref 로 읽는다.
 */
export function useTimerAlarm(): {
  /** 종료 알람을 한 번 울린다(반복은 startAlarmSequence 가 이 함수를 여러 번 부른다). */
  readonly playAlarmOnce: () => void;
  /** 타이머 탭 예고 알림음을 울린다. */
  readonly playPreWarning: () => void;
} {
  const alarm = useSettingsStore((s) => s.settings.alarmSound);
  const dataUrl = useCustomAlarmAudioStore((s) => s.dataUrl);
  const load = useCustomAlarmAudioStore((s) => s.load);
  useEffect(() => {
    void load();
  }, [load]);

  const latest = useRef({ alarm, dataUrl });
  latest.current = { alarm, dataUrl };

  const playAlarmOnce = useCallback(() => {
    const { alarm: a, dataUrl: url } = latest.current;
    playAlarmSound(a.selectedSound, a.volume, a.boost, url);
  }, []);

  const playPreWarning = useCallback(() => {
    const { alarm: a } = latest.current;
    playPreWarningSound(a.preWarning.sound, a.volume, a.boost);
  }, []);

  return { playAlarmOnce, playPreWarning };
}
