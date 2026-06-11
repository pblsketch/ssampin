'use client';

/**
 * 포스트잇 TTS 낭독 — speechSynthesis 래퍼 (attention kind='tts')
 *
 * - ko 음성 열거 → 이름 기반 남/여 분류 휴리스틱 (미분류는 여성 추정)
 * - 요청 성별 음성이 없으면 가용 ko 음성으로 폴백 (호출 측에 fallbackUsed 통지)
 * - voiceschanged 대응: 목록이 비어 있으면 이벤트/타임아웃까지 대기
 * - rate 0.95 · lang 'ko-KR' · 낭독 길이 기반 watchdog 타임아웃(실패해도 반드시 resolve)
 * - unlockTts: 사용자 제스처 안에서 무음 발화 1회 → autoplay 정책 해제
 *   (AudioContext unlock과 별개 — speechSynthesis는 자체 제스처 요구)
 */

import { useCallback, useEffect, useRef } from 'react';
import type { MemoTtsVoice } from './driveBoardApi';

const VOICES_WAIT_TIMEOUT_MS = 1500;
const WATCHDOG_BASE_MS = 8000;
const WATCHDOG_PER_CHAR_MS = 350;
const WATCHDOG_MAX_MS = 120000;
const TTS_RATE = 0.95;

/**
 * 알려진 한국어 음성 이름 토큰 (소문자 비교).
 * Azure/Edge: InJoon·BongJin·GookMin·Hyunsu(남) / SunHi·JiMin·SeoHyeon·SoonBok·YuJin(여)
 * Windows: Heami(여) · Apple: Yuna(여) · Chrome: "Google 한국의"(여) · AWS 계열: Seoyeon(여)
 */
const MALE_VOICE_TOKENS: readonly string[] = [
  'injoon',
  '인준',
  'hyunsu',
  '현수',
  'bongjin',
  '봉진',
  'gookmin',
  '국민',
  'minsu',
  '민수',
  'jinho',
  '진호',
  'male',
  '남성',
];

const FEMALE_VOICE_TOKENS: readonly string[] = [
  'sunhi',
  '선히',
  'heami',
  '해미',
  'yuna',
  '유나',
  'jimin',
  '지민',
  'seohyeon',
  '서현',
  'soonbok',
  '순복',
  'yujin',
  '유진',
  'seoyeon',
  '서연',
  'kyuri',
  '규리',
  'sora',
  '소라',
  'google 한국',
  'female',
  '여성',
];

export interface TtsSpeakResult {
  /** 끝까지(또는 정상 종료 이벤트까지) 낭독했는가 */
  readonly spoken: boolean;
  /** 요청 성별 음성이 없어 다른 음성/기본 음성으로 읽었는가 */
  readonly fallbackUsed: boolean;
}

export interface MemoTts {
  /** 텍스트 낭독 — 종료/오류/타임아웃 시 반드시 resolve. 진행 중 낭독은 취소된다 */
  readonly speakText: (text: string, preference: MemoTtsVoice) => Promise<TtsSpeakResult>;
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

/** 이름 기반 성별 분류 — 알려진 토큰 매칭, 미분류는 여성 추정(한국어 TTS 대다수가 여성) */
function classifyVoiceGender(voice: SpeechSynthesisVoice): MemoTtsVoice {
  const haystack = `${voice.name} ${voice.voiceURI}`.toLowerCase();
  if (MALE_VOICE_TOKENS.some((token) => haystack.includes(token))) return 'male';
  if (FEMALE_VOICE_TOKENS.some((token) => haystack.includes(token))) return 'female';
  return 'female';
}

/** ko 음성 목록 — 비어 있으면 voiceschanged/타임아웃까지 대기 (목록 비동기 로드 대응) */
function loadKoreanVoices(synth: SpeechSynthesis): Promise<SpeechSynthesisVoice[]> {
  const immediate = synth.getVoices().filter(isKoreanVoice);
  if (immediate.length > 0) return Promise.resolve(immediate);

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      synth.removeEventListener('voiceschanged', finish);
      clearTimeout(timer);
      resolve(synth.getVoices().filter(isKoreanVoice));
    };
    const timer = setTimeout(finish, VOICES_WAIT_TIMEOUT_MS);
    synth.addEventListener('voiceschanged', finish);
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

  const speakText = useCallback(
    async (text: string, preference: MemoTtsVoice): Promise<TtsSpeakResult> => {
      const synth = getSynth();
      const trimmed = text.trim();
      if (!synth || trimmed.length === 0) {
        return { spoken: false, fallbackUsed: false };
      }

      synth.cancel(); // 진행 중 낭독 취소 — 새 신호가 항상 우선

      const koVoices = await loadKoreanVoices(synth);
      let voice = koVoices.find((v) => classifyVoiceGender(v) === preference) ?? null;
      let fallbackUsed = false;
      if (voice === null) {
        voice = koVoices[0] ?? null; // 요청 성별이 없으면 가용 ko 음성
        fallbackUsed = true; // ko 음성조차 없으면 브라우저 기본 음성(lang 힌트만)
      }

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
    },
    [],
  );

  return { speakText, cancelSpeech, unlockTts };
}
