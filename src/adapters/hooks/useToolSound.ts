import { useCallback, useRef, useEffect } from 'react';
import { useSoundStore } from '@adapters/stores/useSoundStore';
import { TOOL_SOUND_MAP } from '@domain/valueObjects/SoundSettings';
import type { ToolSoundConfig } from '@domain/valueObjects/SoundSettings';

interface UseToolSoundReturn {
  playProgress: () => void;
  playResult: () => void;
  stopAll: () => void;
}

export function useToolSound(toolId: string): UseToolSoundReturn {
  const config: ToolSoundConfig | undefined = TOOL_SOUND_MAP[toolId];
  const progressRef = useRef<HTMLAudioElement | null>(null);
  const resultRef = useRef<HTMLAudioElement | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Preload audio elements on mount
  useEffect(() => {
    if (!config) return;

    try {
      const progress = new Audio(config.progressSound);
      progress.loop = config.progressLoop;
      progress.preload = 'auto';
      progressRef.current = progress;
    } catch {
      // silently ignore
    }

    try {
      const result = new Audio(config.resultSound);
      result.preload = 'auto';
      resultRef.current = result;
    } catch {
      // silently ignore
    }

    return () => {
      progressRef.current?.pause();
      resultRef.current?.pause();
      progressRef.current = null;
      resultRef.current = null;
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, [config]);

  const playProgress = useCallback(() => {
    try {
      const { enabled, volume } = useSoundStore.getState().settings;
      if (!enabled || !progressRef.current) return;

      progressRef.current.volume = volume;
      progressRef.current.currentTime = 0;
      progressRef.current.play().catch(() => {});
    } catch {
      // silently ignore
    }
  }, []);

  const stopAll = useCallback(() => {
    try {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);

      const fadeDuration = config?.fadeDuration ?? 100;
      const audio = progressRef.current;
      if (!audio || audio.paused) return;

      // Quick fade out
      const steps = 5;
      const stepTime = fadeDuration / steps;
      const startVolume = audio.volume;
      let step = 0;

      const fade = () => {
        step++;
        audio.volume = Math.max(0, startVolume * (1 - step / steps));
        if (step >= steps) {
          audio.pause();
          audio.currentTime = 0;
          audio.volume = startVolume;
        } else {
          fadeTimerRef.current = setTimeout(fade, stepTime);
        }
      };
      fadeTimerRef.current = setTimeout(fade, stepTime);
    } catch {
      // silently ignore
    }
  }, [config?.fadeDuration]);

  const playResult = useCallback(() => {
    try {
      // Stop progress sound first
      stopAll();

      const { enabled, volume } = useSoundStore.getState().settings;
      if (!enabled || !resultRef.current) return;

      resultRef.current.volume = volume;
      resultRef.current.currentTime = 0;
      resultRef.current.play().catch(() => {});
    } catch {
      // silently ignore
    }
  }, [stopAll]);

  return { playProgress, playResult, stopAll };
}
