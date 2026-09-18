'use client';

import { useEffect, useRef, useState } from 'react';
import { checkRollupRefresh, requestRollupRefresh } from '../actions';

type Phase =
  | { kind: 'idle' }
  | { kind: 'waiting'; baseline: string | null; startedAt: number; alreadyRunning: boolean }
  | { kind: 'done'; message: string }
  | { kind: 'failed'; message: string };

const POLL_MS = 10_000;
/** 갱신은 예약 1분 + 실행 2~3분(2026-09 실측 151초). 넉넉히 두고 넘으면 멈춘 것으로 본다. */
const GIVE_UP_MS = 8 * 60_000;

/** KST 07~09시 — 정기 갱신도 쉬는 출근 피크(2026-09-08 DB 먹통이 이 시간대 갱신에서 났다). */
function isCommutePeak(): boolean {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul',
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(new Date()),
  );
  return hour >= 7 && hour < 10;
}

/** 헤더 "집계 기준" 옆의 수동 갱신 버튼. 예약만 하고, 끝날 때까지 10초마다 확인한다. */
export default function RefreshButton() {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [elapsed, setElapsed] = useState(0);
  // 상태값은 비동기로 바뀌어 빠른 두 번 누르기를 못 막는다 — ref 로 막는다.
  const requesting = useRef(false);

  useEffect(() => {
    if (phase.kind !== 'waiting') return;
    const { baseline, startedAt } = phase;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const clock = setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000);

    const poll = async () => {
      if (stopped) return;
      try {
        const result = await checkRollupRefresh(baseline);
        if (stopped) return;
        if (result.state === 'done') {
          const secs =
            result.durationMs != null ? ` (${Math.round(result.durationMs / 1000)}초 걸림)` : '';
          setPhase({ kind: 'done', message: `갱신 완료${secs}` });
          return;
        }
        if (result.state === 'failed') {
          setPhase({ kind: 'failed', message: `갱신 실패: ${result.error}` });
          return;
        }
      } catch {
        // 일시적인 네트워크 오류는 다음 확인에서 다시 본다.
      }
      if (Date.now() - startedAt > GIVE_UP_MS) {
        setPhase({
          kind: 'failed',
          message: '8분이 지나도 끝나지 않았습니다. 잠시 뒤 새로고침해 확인해 주세요.',
        });
        return;
      }
      timer = setTimeout(poll, POLL_MS);
    };
    timer = setTimeout(poll, POLL_MS);

    return () => {
      stopped = true;
      clearInterval(clock);
      if (timer) clearTimeout(timer);
    };
  }, [phase]);

  const start = async () => {
    if (requesting.current || phase.kind === 'waiting') return;
    if (
      isCommutePeak() &&
      !window.confirm(
        '지금은 출근 시간대(07~10시)라 앱 사용이 몰립니다. 이때 갱신하면 DB가 느려질 수 있습니다(9/8 장애가 이 시간대였습니다). 그래도 지금 갱신할까요?',
      )
    ) {
      return;
    }
    requesting.current = true;
    try {
      const res = await requestRollupRefresh();
      if (!res.ok) {
        setPhase({ kind: 'failed', message: res.error });
        return;
      }
      setElapsed(0);
      setPhase({
        kind: 'waiting',
        baseline: res.baseline,
        startedAt: Date.now(),
        alreadyRunning: res.state === 'running',
      });
    } catch {
      setPhase({
        kind: 'failed',
        message: '갱신을 예약하지 못했습니다. 다시 로그인한 뒤 시도해 주세요.',
      });
    } finally {
      requesting.current = false;
    }
  };

  const waiting = phase.kind === 'waiting';
  let note: string | null = null;
  if (phase.kind === 'waiting') {
    note = phase.alreadyRunning
      ? `이미 진행 중인 갱신을 기다리는 중 · ${elapsed}초`
      : `1분 안에 시작해 2~3분 걸립니다 · ${elapsed}초`;
  } else if (phase.kind === 'done' || phase.kind === 'failed') {
    note = phase.message;
  }

  return (
    <>
      <button
        type="button"
        onClick={start}
        disabled={waiting}
        className="ml-2 px-2.5 py-1 rounded-md bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white disabled:opacity-60 disabled:cursor-wait transition"
      >
        {waiting ? '갱신 중…' : '지금 갱신'}
      </button>
      <span
        role="status"
        className={`ml-2 ${phase.kind === 'failed' ? 'text-red-400' : phase.kind === 'done' ? 'text-emerald-400' : 'text-gray-500'}`}
      >
        {note}
      </span>
    </>
  );
}
