/**
 * 발표 타이머 상태와 순서(ADR-139).
 *
 * - 상태는 여덟 가지다. 키(Space·→)와 교실 화면의 '다음 동작' 단추는 이 파일의 표 하나를 따른다.
 * - 실행 순서는 준비 순서와 따로 둔다. [나중에]·[건너뛰기]는 실행 순서만 바꾸고,
 *   [처음으로]를 누르면 준비 순서로 돌아간다.
 * - 기록은 이름과 쓴 시간뿐이다. 순위·정렬·색은 화면에서도 만들지 않는다(ADR-134).
 */

export type PresentationPhase =
  | 'setup'
  | 'talk'
  | 'talk-paused'
  | 'talk-ended'
  | 'qna'
  | 'qna-paused'
  | 'qna-ended'
  | 'all-done';

export type PresentationAction =
  | 'start'
  | 'pause'
  | 'resume'
  | 'finishTalk'
  | 'startQna'
  | 'finishQna'
  | 'next'
  | 'none';

/** 발표가 어떻게 끝났는가 — 시간 다 됨 / [발표 마침]. */
export type TalkEndReason = 'time-up' | 'finished-early';

/** 화면 이동 안내·창 X 자동 팝업에서 "진행 중"으로 보는 상태. */
export function isPresentationBusy(phase: PresentationPhase): boolean {
  return phase !== 'setup' && phase !== 'all-done';
}

/** 카운트다운이 도는(시간이 흐르는) 상태. */
export function isPresentationCounting(phase: PresentationPhase): boolean {
  return phase === 'talk' || phase === 'qna';
}

/** Space 가 할 일. */
export function spaceAction(phase: PresentationPhase, qnaEnabled: boolean): PresentationAction {
  switch (phase) {
    case 'setup':
      return 'start';
    case 'talk':
    case 'qna':
      return 'pause';
    case 'talk-paused':
    case 'qna-paused':
      return 'resume';
    case 'talk-ended':
      return qnaEnabled ? 'startQna' : 'next';
    case 'qna-ended':
      return 'next';
    case 'all-done':
      return 'none';
  }
}

/** → 키가 할 일. */
export function arrowAction(phase: PresentationPhase): PresentationAction {
  switch (phase) {
    case 'talk':
    case 'talk-paused':
      return 'finishTalk';
    case 'talk-ended':
    case 'qna-ended':
      return 'next';
    case 'qna':
    case 'qna-paused':
      return 'finishQna';
    case 'setup':
    case 'all-done':
      return 'none';
  }
}

/** 교실 화면에 함께 보이는 '다음 동작' 단추 하나. */
export function classroomNextAction(
  phase: PresentationPhase,
  qnaEnabled: boolean,
): PresentationAction {
  if (phase === 'talk-ended') return qnaEnabled ? 'startQna' : 'next';
  return arrowAction(phase);
}

// ── 실행 순서 ───────────────────────────────────────────────────────────

export interface PresentationRecord {
  readonly presenterId: string;
  readonly status: 'presented' | 'skipped';
  /** 발표에 쓴 시간(초). 질문 시간은 넣지 않는다. 건너뛴 학생은 0. */
  readonly usedSeconds: number;
  /** 넘긴 시간(초). 넘기지 않았으면 0. */
  readonly overSeconds: number;
}

export interface PresentationRun {
  /** 실행 순서(발표자 id). 준비 순서의 복사본에서 시작한다. */
  readonly order: readonly string[];
  /** 지금 차례의 위치. order.length 이상이면 모두 끝. */
  readonly index: number;
  /** 한 번 미룬 학생. 한 학생은 한 번만 미룰 수 있다. */
  readonly deferredIds: readonly string[];
  /** 끝난 차례대로 쌓인 기록. */
  readonly records: readonly PresentationRecord[];
}

export function startPresentationRun(setupOrder: readonly string[]): PresentationRun {
  return { order: [...setupOrder], index: 0, deferredIds: [], records: [] };
}

export function currentPresenterId(run: PresentationRun): string | null {
  return run.order[run.index] ?? null;
}

export function nextPresenterId(run: PresentationRun): string | null {
  return run.order[run.index + 1] ?? null;
}

export function isRunFinished(run: PresentationRun): boolean {
  return run.index >= run.order.length;
}

/** [나중에]를 쓸 수 있는가 — 아직 미룬 적이 없고, 뒤에 다른 학생이 남아 있을 때. */
export function canDeferCurrent(run: PresentationRun): boolean {
  const current = currentPresenterId(run);
  if (current === null) return false;
  if (run.deferredIds.includes(current)) return false;
  return run.index < run.order.length - 1;
}

/**
 * 지금 학생을 실행 순서 맨 뒤로 보낸다. 미루기 전에 흐른 시간은 버린다(기록하지 않는다).
 * 쓸 수 없으면 그대로 돌려준다.
 */
export function deferCurrent(run: PresentationRun): PresentationRun {
  if (!canDeferCurrent(run)) return run;
  const current = currentPresenterId(run)!;
  const order = [...run.order.slice(0, run.index), ...run.order.slice(run.index + 1), current];
  return { ...run, order, deferredIds: [...run.deferredIds, current] };
}

/** 지금 학생을 이번 발표에서 뺀다. 기록에는 '건너뜀'. */
export function skipCurrent(run: PresentationRun): PresentationRun {
  const current = currentPresenterId(run);
  if (current === null) return run;
  return {
    ...run,
    index: run.index + 1,
    records: [
      ...run.records,
      { presenterId: current, status: 'skipped', usedSeconds: 0, overSeconds: 0 },
    ],
  };
}

/** 지금 학생의 발표를 기록하고 다음 차례로 넘긴다. */
export function completeCurrent(
  run: PresentationRun,
  usage: { readonly usedSeconds: number; readonly overSeconds: number },
): PresentationRun {
  const current = currentPresenterId(run);
  if (current === null) return run;
  return {
    ...run,
    index: run.index + 1,
    records: [
      ...run.records,
      {
        presenterId: current,
        status: 'presented',
        usedSeconds: Math.max(0, Math.floor(usage.usedSeconds)),
        overSeconds: Math.max(0, Math.floor(usage.overSeconds)),
      },
    ],
  };
}

/**
 * 발표에 쓴 시간 계산.
 *
 * - 시간 다 됨: 발표 시간 + 선생님이 넘길 때까지의 초과
 * - [발표 마침]: 실제로 흐른 시간(발표 시간 − 남은 시간). 초과 없음
 * - 자동 진행으로 넘어가며 기다린 2초는 초과로 세지 않는다 → 호출하는 쪽이 overtime 0 을 넘긴다
 */
export function talkUsage(input: {
  readonly durationSeconds: number;
  readonly reason: TalkEndReason;
  /** [발표 마침]을 누른 순간의 남은 초. */
  readonly remainingAtEnd: number;
  /** 시간이 다 된 뒤 넘길 때까지 흐른 초. */
  readonly overtimeSeconds: number;
}): { readonly usedSeconds: number; readonly overSeconds: number } {
  const duration = Math.max(0, input.durationSeconds);
  if (input.reason === 'finished-early') {
    const used = Math.min(duration, Math.max(0, duration - Math.max(0, input.remainingAtEnd)));
    return { usedSeconds: used, overSeconds: 0 };
  }
  const over = Math.max(0, input.overtimeSeconds);
  return { usedSeconds: duration + over, overSeconds: over };
}
