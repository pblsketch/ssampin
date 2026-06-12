'use client';

/**
 * 포스트잇 TTS 낭독 — speechSynthesis 래퍼 (attention kind='tts')
 *
 * - ko 음성 열거 → 첫 한국어 음성을 기본 음성으로 사용
 * - 한국어 음성이 없으면 브라우저 기본 음성으로 폴백 (호출 측에 fallbackUsed 통지)
 * - voiceschanged 대응: 목록이 비어 있으면 이벤트/타임아웃까지 대기
 * - rate 0.95 · lang 'ko-KR' · 낭독 길이 기반 watchdog 타임아웃(실패해도 반드시 resolve)
 * - unlockTts: 사용자 제스처 안에서 무음 발화 1회 → autoplay 정책 해제
 *   (AudioContext unlock과 별개 — speechSynthesis는 자체 제스처 요구)
 */

import { useCallback, useEffect, useRef } from 'react';

const VOICES_WAIT_TIMEOUT_MS = 1500;
const WATCHDOG_BASE_MS = 8000;
const WATCHDOG_PER_CHAR_MS = 350;
const WATCHDOG_MAX_MS = 120000;
const TTS_RATE = 0.95;

export interface TtsSpeakResult {
  /** 끝까지(또는 정상 종료 이벤트까지) 낭독했는가 */
  readonly spoken: boolean;
  /** 한국어 음성이 없어 브라우저 기본 음성으로 읽었는가 */
  readonly fallbackUsed: boolean;
}

export interface MemoTts {
  /** 텍스트 낭독 — 종료/오류/타임아웃 시 반드시 resolve. 진행 중 낭독은 취소된다 */
  readonly speakText: (text: string) => Promise<TtsSpeakResult>;
  /** 진행 중 낭독 즉시 취소 */
  readonly cancelSpeech: () => void;
  /** 사용자 제스처 안에서 호출 — 무음 발화로 speechSynthesis 활성화 */
  readonly unlockTts: () => void;
}

function getSynth(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null;
  return 'speechSynthesis' in window ? window.speechSynthesis : null;
}

function isKoreanVoice(voice: SpeechSynthesisVoice): boolean {
  return voice.lang.toLowerCase().replace('_', '-').startsWith('ko');
}

/** ko 음성 목록 — 비동기 로드 대응으로 voiceschanged/타임아웃까지 대기. */
function loadKoreanVoices(synth: SpeechSynthesis): Promise<SpeechSynthesisVoice[]> {
  const immediate = synth.getVoices().filter(isKoreanVoice);
  if (immediate.length > 0) {
    return Promise.resolve(immediate);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      synth.removeEventListener('voiceschanged', onChange);
      clearTimeout(timer);
      resolve(synth.getVoices().filter(isKoreanVoice));
    };
    const onChange = () => {
      const list = synth.getVoices().filter(isKoreanVoice);
      if (list.length > 0) finish();
    };
    const timer = setTimeout(finish, VOICES_WAIT_TIMEOUT_MS);
    synth.addEventListener('voiceschanged', onChange);
  });
}

export function useMemoTts(): MemoTts {
  // Chrome utterance GC 버그 방어 — 발화 중 utterance 참조 유지
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    return () => {
      getSynth()?.cancel();
    };
  }, []);

  const cancelSpeech = useCallback(() => {
    getSynth()?.cancel();
  }, []);

  const unlockTts = useCallback(() => {
    const synth = getSynth();
    if (!synth) return;
    try {
      const utterance = new SpeechSynthesisUtterance(' ');
      utterance.volume = 0;
      utterance.lang = 'ko-KR';
      synth.speak(utterance);
    } catch {
      /* 미지원 환경 — TTS 신호는 speakText 단계에서 spoken=false 처리 */
    }
  }, []);

  const speakText = useCallback(async (text: string): Promise<TtsSpeakResult> => {
    const synth = getSynth();
    const trimmed = text.trim();
    if (!synth || trimmed.length === 0) {
      return { spoken: false, fallbackUsed: false };
    }

    synth.cancel(); // 진행 중 낭독 취소 — 새 신호가 항상 우선

    const koVoices = await loadKoreanVoices(synth);
    const voice = koVoices[0] ?? null;
    const fallbackUsed = voice === null;

    return new Promise<TtsSpeakResult>((resolve) => {
      let settled = false;
      const settle = (spoken: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        if (utteranceRef.current === utterance) utteranceRef.current = null;
        resolve({ spoken, fallbackUsed });
      };

      // 낭독 실패/이벤트 유실 시에도 반드시 종료 — 팝업이 영원히 안 닫히는 일 방지
      const watchdog = setTimeout(
        () => {
          try {
            synth.cancel();
          } catch {
            /* 무시 */
          }
          settle(false);
        },
        Math.min(WATCHDOG_MAX_MS, WATCHDOG_BASE_MS + trimmed.length * WATCHDOG_PER_CHAR_MS),
      );

      const utterance = new SpeechSynthesisUtterance(trimmed);
      utterance.lang = 'ko-KR';
      utterance.rate = TTS_RATE;
      if (voice) utterance.voice = voice;
      utterance.onend = () => settle(true);
      utterance.onerror = () => settle(false);

      utteranceRef.current = utterance;
      synth.speak(utterance);
    });
  }, []);

  return { speakText, cancelSpeech, unlockTts };
}
