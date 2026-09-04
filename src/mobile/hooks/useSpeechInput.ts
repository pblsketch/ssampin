/**
 * 말로 남기기(모바일) — 브라우저 받아쓰기(Web Speech API).
 *
 * ## 데스크톱과 무엇이 다른가
 *
 * 데스크톱(Electron)에서는 이 API 가 **동작하지 않는다**(구글 음성 서버 키가 없다).
 * 그래서 데스크톱은 OS 받아쓰기를 대신 켜 주기만 하고, 글자는 앱을 거치지 않는다.
 * 반대로 모바일 크롬·사파리에서는 이 API 가 동작하므로 **앱이 직접 결과를 받는다** —
 * 그래서 모바일에만 진짜 "듣는 중" 표시를 둘 수 있다(데스크톱에서 그 표시는 거짓말이 된다).
 *
 * ## 음성은 어디로 가는가
 *
 * 브라우저가 만든 사람(구글·애플)의 서버로 간다. 쌤핀 서버로는 가지 않는다.
 * 학생 이름이 말에 섞이므로 설정에 그 사실을 한 줄로 적어 둔다(`VoiceInputNoticeSection`).
 *
 * ## 왜 `onend` 에서 다시 켜는가
 *
 * `continuous = true` 로 둬도 **아이폰 사파리는 말이 잠깐 끊기면 스스로 멈춘다.**
 * 선생님이 [멈춤]을 누르지 않았는데 조용히 꺼지면 "말했는데 안 적혔다"가 된다.
 * 그래서 멈추라고 한 적이 없으면 다시 켠다. 권한이 거부됐을 때는 의도를 지우므로
 * 무한 재시도로 돌지 않는다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

// ─── Web Speech 최소 타입 ───
// TypeScript 기본 DOM 타입에 SpeechRecognition 이 없다. 공용 선언 파일(`global.d.ts`)은
// 여러 작업이 함께 건드리는 파일이라, 이 훅에서만 쓰는 모양을 여기 둔다. `any` 는 쓰지 않는다.
interface SpeechAlternativeLike {
  readonly transcript: string;
}
interface SpeechResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SpeechAlternativeLike;
}
interface SpeechResultListLike {
  readonly length: number;
  readonly [index: number]: SpeechResultLike;
}
interface SpeechResultEventLike {
  readonly resultIndex: number;
  readonly results: SpeechResultListLike;
}
interface SpeechErrorEventLike {
  readonly error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechResultEventLike) => void) | null;
  onerror: ((e: SpeechErrorEventLike) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** 브라우저가 받아쓰기를 지원하는가 — 아니면 버튼을 아예 그리지 않는다. */
export function isSpeechInputSupported(): boolean {
  return recognitionCtor() !== null;
}

/** 실패 사유를 선생님 말로 옮긴다. 원인을 모르면 "다시 눌러 보라"고 한다. */
function errorMessage(code: string): string | null {
  switch (code) {
    case 'no-speech':
      // 말이 잠깐 없었을 뿐이다. 오류로 보여 주지 않는다.
      return null;
    case 'not-allowed':
    case 'service-not-allowed':
      return '마이크 사용이 허용되지 않았어요. 브라우저 설정에서 이 사이트의 마이크를 허용해 주세요.';
    case 'audio-capture':
      return '마이크를 찾지 못했어요. 다른 앱이 마이크를 쓰고 있는지 확인해 주세요.';
    case 'network':
      return '인터넷이 끊겨 받아쓰기를 할 수 없어요. 연결을 확인해 주세요.';
    case 'aborted':
      return null;
    default:
      return '받아쓰기를 계속할 수 없어요. 잠시 뒤에 다시 눌러 주세요.';
  }
}

export interface UseSpeechInput {
  /** 이 브라우저에서 쓸 수 있는가. false 면 버튼을 숨긴다. */
  readonly supported: boolean;
  readonly listening: boolean;
  /** 아직 확정되지 않은 말. 칸에 넣지 않고 따로 흐리게 보여 준다. */
  readonly interim: string;
  /** 한국어 안내 한 줄. 없으면 null. */
  readonly error: string | null;
  readonly start: () => void;
  readonly stop: () => void;
}

/**
 * @param onCommit 확정된 말이 나올 때마다 불린다. 칸에 이어 붙이는 일은 화면이 한다
 *   (커서 위치·글자 수 상한은 화면 사정이라 훅이 정할 일이 아니다).
 */
export function useSpeechInput(onCommit: (text: string) => void): UseSpeechInput {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  /** 선생님이 [멈춤]을 누르지 않았는가 — `onend` 에서 다시 켤지 판단하는 값. */
  const wantsToListenRef = useRef(false);
  /** 최신 콜백을 쓰되, 콜백이 바뀔 때마다 인식기를 새로 만들지는 않는다. */
  const onCommitRef = useRef(onCommit);
  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  const supported = recognitionCtor() !== null;

  const stop = useCallback((): void => {
    wantsToListenRef.current = false;
    setListening(false);
    setInterim('');
    const r = recognitionRef.current;
    recognitionRef.current = null;
    if (r) {
      r.onresult = null;
      r.onerror = null;
      r.onend = null;
      try {
        r.stop();
      } catch {
        // 이미 멈춘 인식기를 멈추면 던지는 브라우저가 있다. 멈추는 게 목적이라 무시한다.
      }
    }
  }, []);

  const startInternal = useCallback((): void => {
    const Ctor = recognitionCtor();
    if (Ctor === null) return;

    const r = new Ctor();
    r.lang = 'ko-KR';
    r.continuous = true;
    r.interimResults = true;

    r.onresult = (e): void => {
      let pending = '';
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const result = e.results[i];
        if (result === undefined) continue;
        const text = result[0]?.transcript ?? '';
        if (text === '') continue;
        if (result.isFinal) onCommitRef.current(text);
        else pending += text;
      }
      setInterim(pending);
    };

    r.onerror = (e): void => {
      const msg = errorMessage(e.error);
      if (msg !== null) {
        // 되살릴 수 없는 실패다 — 다시 켜지 않는다.
        wantsToListenRef.current = false;
        setError(msg);
        setListening(false);
        setInterim('');
      }
    };

    r.onend = (): void => {
      setInterim('');
      // 아이폰 사파리는 말이 끊기면 스스로 멈춘다. 멈추라고 한 적이 없으면 이어서 켠다.
      if (wantsToListenRef.current) {
        try {
          r.start();
          return;
        } catch {
          wantsToListenRef.current = false;
        }
      }
      setListening(false);
    };

    recognitionRef.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      wantsToListenRef.current = false;
      setListening(false);
      setError('받아쓰기를 시작하지 못했어요. 잠시 뒤에 다시 눌러 주세요.');
    }
  }, []);

  const start = useCallback((): void => {
    if (wantsToListenRef.current) return;
    setError(null);
    wantsToListenRef.current = true;
    startInternal();
  }, [startInternal]);

  // 화면이 사라질 때 마이크를 반드시 놓는다 — 안 놓으면 시트를 닫아도 계속 듣는다.
  useEffect(() => stop, [stop]);

  return { supported, listening, interim, error, start, stop };
}
