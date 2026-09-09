/**
 * 쌤도구 팝업 — 창 사이를 옮기는 동안 흐른 시간을 반영하는 계산.
 *
 * 상태를 옮기는 데는 시간이 걸린다(창 만들기 + 화면 준비). 그동안에도 수업 시간은 흐르므로,
 * 받는 쪽은 "찍은 시각"부터 "지금"까지를 더해서 복원해야 한다. 그렇지 않으면 시간이 뒤로 간다.
 *
 * 설계: docs/02-design/features/tool-popup.design.md §3, §4
 */

export type CountdownRunState = 'idle' | 'running' | 'paused' | 'finished';
export type StopwatchRunState = 'idle' | 'running' | 'paused';

export interface CountdownSnapshot {
  readonly state: CountdownRunState;
  /** 찍은 시점의 남은 초. */
  readonly remaining: number;
  readonly capturedAt: number;
}

export interface CountdownRestore {
  readonly state: CountdownRunState;
  readonly remaining: number;
  /**
   * 옮기는 사이에 0 에 도달했으면 true.
   * 받는 쪽이 이때 **한 번만** 알람을 울린다(보낸 쪽은 이미 정지했다).
   */
  readonly alarmDueDuringTransfer: boolean;
}

/**
 * 카운트다운(일반 타이머·발표 타이머)을 복원한다.
 * `running` 일 때만 시간이 흐른다. 멈춰 있던 것은 그대로 둔다.
 */
export function advanceCountdown(snapshot: CountdownSnapshot, now: number): CountdownRestore {
  if (snapshot.state !== 'running') {
    return {
      state: snapshot.state,
      remaining: Math.max(0, snapshot.remaining),
      alarmDueDuringTransfer: false,
    };
  }
  const elapsed = elapsedSeconds(snapshot.capturedAt, now);
  const next = snapshot.remaining - elapsed;
  if (next <= 0) {
    return { state: 'finished', remaining: 0, alarmDueDuringTransfer: true };
  }
  return { state: 'running', remaining: next, alarmDueDuringTransfer: false };
}

export interface StopwatchSnapshot {
  readonly state: StopwatchRunState;
  /** 찍은 시점까지의 경과 시간(ms). */
  readonly elapsedMs: number;
  readonly capturedAt: number;
}

export interface StopwatchRestore {
  readonly state: StopwatchRunState;
  readonly elapsedMs: number;
}

/** 스톱워치를 복원한다. 돌고 있었다면 옮기는 사이의 시간도 경과에 더한다. */
export function advanceStopwatch(snapshot: StopwatchSnapshot, now: number): StopwatchRestore {
  const base = Math.max(0, snapshot.elapsedMs);
  if (snapshot.state !== 'running') {
    return { state: snapshot.state, elapsedMs: base };
  }
  return { state: 'running', elapsedMs: base + elapsedMillis(snapshot.capturedAt, now) };
}

/**
 * 찍은 시각이 미래이거나(시계 되감김) 값이 이상하면 0으로 본다 —
 * 시간이 거꾸로 흘러 남은 시간이 늘어나는 일을 막는다.
 */
function elapsedMillis(capturedAt: number, now: number): number {
  if (!Number.isFinite(capturedAt) || !Number.isFinite(now)) return 0;
  return Math.max(0, now - capturedAt);
}

function elapsedSeconds(capturedAt: number, now: number): number {
  return Math.floor(elapsedMillis(capturedAt, now) / 1000);
}
