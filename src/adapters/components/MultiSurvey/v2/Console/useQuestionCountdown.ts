/**
 * useQuestionCountdown — 문항 열림(open) 시 타이머 카운트다운 훅.
 *
 * 책임:
 * - phase === 'open' && enabled && timerSeconds > 0 일 때 1초 간격 감소.
 * - questionIndex 변경 시 카운트 리셋 (다음 문항으로 이동).
 * - phase !== 'open' 이면 interval 정지.
 * - 0초 도달 시 onExpire 콜백 정확히 1회 호출 (ref 가드 — 중복 reveal 방지).
 *   phase가 이미 'open'이 아니면 no-op.
 *
 * NOT 책임:
 * - phase 전이 — LiveConsoleContainer.handleAdvance 가 담당.
 * - 학생 페이지 타이머 — liveMultiSurveyHTML.ts 인라인 JS 담당.
 */

import { useEffect, useRef, useState } from 'react';
import type { LivePhase } from '@domain/entities/multiSurvey/LiveSession';

interface UseQuestionCountdownOptions {
  /** 현재 라이브 phase */
  readonly phase: LivePhase;
  /** 현재 문항 인덱스 — 변경 시 카운트 리셋 */
  readonly questionIndex: number;
  /** 문항 타이머 초 (0 이하면 비활성) */
  readonly timerSeconds: number;
  /**
   * 카운트다운 활성화 여부.
   * 일반적으로 survey.responseOpts.autoAdvance 값을 전달.
   * false면 interval이 실행되지 않음.
   */
  readonly enabled: boolean;
  /**
   * 0초 도달 시 1회 호출되는 콜백.
   * reveal 전이 경로(handleAdvance)를 이 콜백에서 호출할 것.
   */
  readonly onExpire: () => void;
}

interface UseQuestionCountdownResult {
  /** 현재 남은 초 (0 이상). enabled=false 또는 phase!=='open'이면 timerSeconds 그대로. */
  readonly remainingSeconds: number;
}

export function useQuestionCountdown({
  phase,
  questionIndex,
  timerSeconds,
  enabled,
  onExpire,
}: UseQuestionCountdownOptions): UseQuestionCountdownResult {
  const [remainingSeconds, setRemainingSeconds] = useState(timerSeconds);

  // onExpire를 ref로 보관 — 클로저 stale 방지
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  // 만료 콜백 중복 호출 방지 ref
  const expiredRef = useRef(false);

  // questionIndex 또는 phase 변경 시 카운트 리셋
  useEffect(() => {
    setRemainingSeconds(timerSeconds);
    expiredRef.current = false;
  }, [questionIndex, timerSeconds]);

  // phase !== 'open' 이면 카운트 리셋 (정지)
  useEffect(() => {
    if (phase !== 'open') {
      setRemainingSeconds(timerSeconds);
      expiredRef.current = false;
    }
  }, [phase, timerSeconds]);

  // 카운트다운 interval
  useEffect(() => {
    // 비활성 조건: enabled=false / phase!=='open' / timerSeconds<=0
    if (!enabled || phase !== 'open' || timerSeconds <= 0) {
      return;
    }

    // 초기값 설정 (questionIndex·phase 리셋 effect와 충돌 없이 동기화)
    setRemainingSeconds(timerSeconds);
    expiredRef.current = false;

    const intervalId = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          // 0초 도달 — onExpire 1회만 (expiredRef 가드)
          if (!expiredRef.current) {
            expiredRef.current = true;
            // onExpire 호출을 큐에 올림 (setState 배치 사이클 밖에서 실행)
            Promise.resolve().then(() => {
              onExpireRef.current();
            });
          }
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
    // phase/questionIndex 변경 시 이전 interval cleanup → 재기동
  }, [enabled, phase, questionIndex, timerSeconds]);

  return { remainingSeconds };
}
