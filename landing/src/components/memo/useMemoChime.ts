'use client';

/**
 * 새 메모 알림 차임 — Web Audio 합성 (음원 파일 없음, plan.md SC-7)
 *
 * - 짧은 마림바풍 2음 (B5 → E6), OscillatorNode + 지수 감쇠 envelope
 * - 5초 스로틀 (연속 추가 시 1회만)
 * - 토글 ON 순간 무음 1회 재생으로 브라우저 autoplay 정책 해제
 * - localStorage 'ssampin-memo-sound' 영속
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'ssampin-memo-sound';
const CHIME_THROTTLE_MS = 5000;

interface WindowWithWebkitAudio extends Window {
  webkitAudioContext?: typeof AudioContext;
}

export interface MemoChime {
  /** 알림음 토글 상태 */
  readonly soundOn: boolean;
  /** 토글 (ON 전환 시 오디오 컨텍스트 활성화) */
  readonly toggleSound: () => void;
  /**
   * 차임 재생 — OFF면 무음, 5초 스로틀.
   * force=true: 교사의 명시적 [주목] 신호 — 스로틀 우회(토글 OFF 게이트는 유지)
   */
  readonly playChime: (force?: boolean) => void;
}

function createAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

/** 마림바풍 단일 음 — 짧은 어택 + 지수 감쇠 */
function playMarimbaNote(
  ctx: AudioContext,
  frequency: number,
  startAt: number,
  peakGain: number,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(frequency, startAt);

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peakGain, startAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.55);

  // 살짝 어두운 배음 — 마림바의 둥근 음색
  const overtone = ctx.createOscillator();
  const overtoneGain = ctx.createGain();
  overtone.type = 'sine';
  overtone.frequency.setValueAtTime(frequency * 4, startAt);
  overtoneGain.gain.setValueAtTime(0.0001, startAt);
  overtoneGain.gain.exponentialRampToValueAtTime(peakGain * 0.12, startAt + 0.01);
  overtoneGain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.18);

  osc.connect(gain).connect(ctx.destination);
  overtone.connect(overtoneGain).connect(ctx.destination);

  osc.start(startAt);
  osc.stop(startAt + 0.6);
  overtone.start(startAt);
  overtone.stop(startAt + 0.25);
}

export function useMemoChime(): MemoChime {
  const [soundOn, setSoundOn] = useState(false);
  const soundOnRef = useRef(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const lastPlayedAtRef = useRef(0);

  /* 저장된 설정 복원 */
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'on') {
        setSoundOn(true);
        soundOnRef.current = true;
      }
    } catch {
      /* localStorage 비활성 환경 — 기본 OFF 유지 */
    }
  }, []);

  /* 언마운트 시 오디오 컨텍스트 정리 */
  useEffect(() => {
    return () => {
      void ctxRef.current?.close().catch(() => undefined);
      ctxRef.current = null;
    };
  }, []);

  const ensureContext = useCallback((): AudioContext | null => {
    if (ctxRef.current === null) {
      ctxRef.current = createAudioContext();
    }
    const ctx = ctxRef.current;
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume().catch(() => undefined);
    }
    return ctx;
  }, []);

  const toggleSound = useCallback(() => {
    const next = !soundOnRef.current;
    soundOnRef.current = next;
    setSoundOn(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off');
    } catch {
      /* 영속 실패해도 세션 동작에는 지장 없음 */
    }

    if (next) {
      // 사용자 제스처 안에서 무음 1회 재생 → autoplay 정책 해제
      const ctx = ensureContext();
      if (ctx) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, ctx.currentTime);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.02);
      }
    }
  }, [ensureContext]);

  const playChime = useCallback(
    (force = false) => {
      if (!soundOnRef.current) return;

      const now = Date.now();
      if (!force && now - lastPlayedAtRef.current < CHIME_THROTTLE_MS) return;

      const ctx = ensureContext();
      if (!ctx) return;

      lastPlayedAtRef.current = now;
      const t = ctx.currentTime + 0.02;
      playMarimbaNote(ctx, 987.77, t, 0.22); // B5
      playMarimbaNote(ctx, 1318.51, t + 0.13, 0.18); // E6
    },
    [ensureContext],
  );

  return { soundOn, toggleSound, playChime };
}
