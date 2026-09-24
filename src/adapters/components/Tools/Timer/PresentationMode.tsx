import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  formatShortDuration,
  getTimerColorLevel,
  isPreWarningArmed,
  overtimeSeconds,
  warningThresholdSeconds,
} from '@domain/rules/timerRules';
import {
  arrowAction,
  canDeferCurrent,
  classroomNextAction,
  completeCurrent,
  currentPresenterId,
  deferCurrent,
  isPresentationBusy,
  isPresentationCounting,
  isRunFinished,
  nextPresenterId,
  skipCurrent,
  spaceAction,
  startPresentationRun,
  talkUsage,
  type PresentationAction,
  type PresentationPhase,
  type PresentationRun,
  type TalkEndReason,
} from '@domain/rules/presentationQueue';
import type { TimerPresentationRoster } from '@domain/rules/timerLocalState';
import { transferElapsedSeconds } from '@domain/rules/toolPopupSession';
import { useSoundStore } from '@adapters/stores/useSoundStore';
import { useTimerLocalStore } from '@adapters/stores/useTimerLocalStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { useToolPopupInitial, useToolPopupSlot } from '../popup/toolPopupSession';
import { ClassroomOverlay, type ClassroomNextAction } from './ClassroomOverlay';
import { PresentationSetup, type PresentationSetupValue } from './PresentationSetup';
import { TimerDial } from './TimerDial';
import { TimerEndOverlay } from './TimerEndOverlay';
import { MuteNotice } from './TimerSoundSettings';
import { startAlarmSequence, type AlarmStopHandle } from './timerAudio';
import {
  useIsClassroomOpen,
  useReportTimerStatus,
  useTimerModeKeydown,
  useTimerShell,
} from './timerShellContext';
import { useTimerAlarm } from './useTimerAlarm';
import { useTimerStageSize } from './useTimerStageSize';
import { useTimerToolSettings } from './useTimerToolSettings';

/**
 * 발표 타이머(ADR-139, spec 4, 설계 11장).
 *
 * - 상태 여덟 가지와 키는 `presentationQueue` 의 표 하나를 따른다(spec 4-4).
 * - 발표 종료 알람은 반복 설정과 관계없이 **한 번**만 — 발표 중인 학생을 끊지 않는다.
 *   질문 시간도 선생님이 눌러야 시작한다.
 * - 넘긴 시간은 작고 흐리게, 교실 화면에서는 숨긴다. 시간 기록은 눌러야 보이고 저장하지 않는다.
 *   색·순위·정렬은 만들지 않는다(ADR-134).
 * - 명단·순서·설정은 이 PC 에만 기억한다(`timer-local`). 동기화하지 않는다.
 */

const DEFAULT_DURATION = 180;
/** 자동 진행 대기(ms). */
const AUTO_ADVANCE_MS = 2000;

interface SerializedSetup {
  readonly presenters: PresentationSetupValue['presenters'];
  readonly order: readonly (readonly [string, number])[];
  readonly inputMode: PresentationSetupValue['inputMode'];
  readonly durationSeconds: number;
  readonly qnaSeconds: number | null;
  readonly autoAdvance: boolean;
}

/** 팝업으로 옮길 때 함께 가는 발표 타이머 상태. */
export interface PresentationSnapshot {
  readonly setup: SerializedSetup;
  readonly phase: PresentationPhase;
  readonly run: PresentationRun | null;
  readonly remaining: number;
  /** 발표 시간이 0 에 닿은 시각(초과 시간). [발표 마침]이면 null. */
  readonly talkEndedAt: number | null;
  readonly talkEndReason: TalkEndReason | null;
  readonly talkRemainingAtEnd: number;
  /** 질문 시간으로 넘어갈 때 확정한 발표 기록(질문이 끝나면 저장). */
  readonly pendingUsage: { readonly usedSeconds: number; readonly overSeconds: number } | null;
  readonly showRecords: boolean;
}

function serializeSetup(v: PresentationSetupValue): SerializedSetup {
  return {
    presenters: v.presenters,
    order: [...v.order.entries()],
    inputMode: v.inputMode,
    durationSeconds: v.durationSeconds,
    qnaSeconds: v.qnaSeconds,
    autoAdvance: v.autoAdvance,
  };
}

function deserializeSetup(s: SerializedSetup | TimerPresentationRoster): PresentationSetupValue {
  return {
    presenters: s.presenters,
    order: new Map(s.order),
    inputMode: s.inputMode,
    durationSeconds: s.durationSeconds,
    qnaSeconds: s.qnaSeconds,
    autoAdvance: s.autoAdvance,
  };
}

const EMPTY_SETUP: PresentationSetupValue = {
  presenters: [],
  order: new Map(),
  inputMode: 'custom',
  durationSeconds: DEFAULT_DURATION,
  qnaSeconds: null,
  autoAdvance: false,
};

export function PresentationMode() {
  const shell = useTimerShell();
  const { timerTool } = useTimerToolSettings();
  const presentationPw = timerTool.presentationPreWarning;
  const { playAlarmOnce, playPreWarning } = useTimerAlarm();
  const showToast = useToastStore((s) => s.show);
  const localLoaded = useTimerLocalStore((s) => s.loaded);
  const savedRoster = useTimerLocalStore((s) => s.state.presentationRoster);

  const popupInitial = useToolPopupInitial<PresentationSnapshot>('timer-presentation');
  const [setup, setSetup] = useState<PresentationSetupValue>(() =>
    popupInitial ? deserializeSetup(popupInitial.data.setup) : EMPTY_SETUP,
  );
  const [phase, setPhaseState] = useState<PresentationPhase>(
    () => popupInitial?.data.phase ?? 'setup',
  );
  const [run, setRunState] = useState<PresentationRun | null>(() => popupInitial?.data.run ?? null);
  const [remaining, setRemainingState] = useState(() => popupInitial?.data.remaining ?? 0);
  const [talkEndedAt, setTalkEndedAt] = useState<number | null>(
    () => popupInitial?.data.talkEndedAt ?? null,
  );
  const [talkEndReason, setTalkEndReason] = useState<TalkEndReason | null>(
    () => popupInitial?.data.talkEndReason ?? null,
  );
  const [showRecords, setShowRecords] = useState(() => popupInitial?.data.showRecords ?? false);

  const phaseRef = useRef(phase);
  const runRef = useRef(run);
  const remainingRef = useRef(remaining);
  const setupRef = useRef(setup);
  setupRef.current = setup;
  const talkEndedAtRef = useRef(talkEndedAt);
  talkEndedAtRef.current = talkEndedAt;
  const talkEndReasonRef = useRef(talkEndReason);
  talkEndReasonRef.current = talkEndReason;
  const talkRemainingAtEndRef = useRef(popupInitial?.data.talkRemainingAtEnd ?? 0);
  const pendingUsageRef = useRef(popupInitial?.data.pendingUsage ?? null);
  const setPhase = (v: PresentationPhase): void => {
    phaseRef.current = v;
    setPhaseState(v);
  };
  const setRun = (v: PresentationRun | null): void => {
    runRef.current = v;
    setRunState(v);
  };
  const setRemaining = (v: number): void => {
    remainingRef.current = v;
    setRemainingState(v);
  };

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const alarmStopRef = useRef<AlarmStopHandle | null>(null);
  const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preWarningArmedRef = useRef(false);
  const pwRef = useRef(presentationPw);
  pwRef.current = presentationPw;

  // ── 명단 기억(이 PC 에만, spec 4-2) ──────────────────────────────
  const restoredRosterRef = useRef(popupInitial !== null);
  useEffect(() => {
    void useTimerLocalStore.getState().load();
  }, []);
  useEffect(() => {
    if (!localLoaded || restoredRosterRef.current) return;
    restoredRosterRef.current = true;
    if (savedRoster !== null && phaseRef.current === 'setup')
      setSetup(deserializeSetup(savedRoster));
  }, [localLoaded, savedRoster]);

  const updateSetup = useCallback((patch: Partial<PresentationSetupValue>) => {
    const next = { ...setupRef.current, ...patch };
    setSetup(next);
    restoredRosterRef.current = true;
    const s = serializeSetup(next);
    void useTimerLocalStore.getState().setPresentationRoster(next.presenters.length > 0 ? s : null);
  }, []);

  const clearTick = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);
  const clearAutoAdvance = useCallback(() => {
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
  }, []);
  const stopAlarm = useCallback(() => {
    alarmStopRef.current?.();
    alarmStopRef.current = null;
  }, []);
  const stopAll = useCallback(() => {
    clearTick();
    clearAutoAdvance();
    stopAlarm();
  }, [clearTick, clearAutoAdvance, stopAlarm]);

  const orderedIds = useMemo(
    () =>
      setup.presenters
        .filter((p) => setup.order.has(p.id))
        .sort((a, b) => (setup.order.get(a.id) ?? 0) - (setup.order.get(b.id) ?? 0))
        .map((p) => p.id),
    [setup],
  );
  const nameOf = useCallback(
    (id: string | null): string => setup.presenters.find((p) => p.id === id)?.name ?? '',
    [setup.presenters],
  );

  // 아래 콜백들은 서로를 부른다 — 최신 함수를 ref 로 잇는다.
  const actionsRef = useRef<{
    onTalkTimeUp: (at: number) => void;
    onQnaTimeUp: () => void;
    next: (auto?: boolean) => void;
  }>({ onTalkTimeUp: () => undefined, onQnaTimeUp: () => undefined, next: () => undefined });

  const startCountdown = useCallback(
    (seconds: number, kind: 'talk' | 'qna', armFromSeconds?: number) => {
      clearTick();
      setRemaining(seconds);
      setPhase(kind);
      const pw = pwRef.current;
      preWarningArmedRef.current =
        kind === 'talk' &&
        pw.enabled &&
        isPreWarningArmed(
          armFromSeconds ?? seconds,
          setupRef.current.durationSeconds,
          pw.secondsBefore,
        );
      let lastTick = Date.now();
      intervalRef.current = setInterval(() => {
        const now = Date.now();
        const delta = Math.floor((now - lastTick) / 1000);
        if (delta < 1) return;
        lastTick = now - ((now - lastTick) % 1000);
        const next = remainingRef.current - delta;
        if (preWarningArmedRef.current && next > 0 && next <= pwRef.current.secondsBefore) {
          preWarningArmedRef.current = false;
          playPreWarning();
        }
        if (next <= 0) {
          clearTick();
          setRemaining(0);
          if (phaseRef.current === 'talk') actionsRef.current.onTalkTimeUp(now + next * 1000);
          else actionsRef.current.onQnaTimeUp();
          return;
        }
        setRemaining(next);
      }, 100);
    },
    [clearTick, playPreWarning],
  );

  const scheduleAutoAdvance = useCallback(() => {
    clearAutoAdvance();
    if (!setupRef.current.autoAdvance) return;
    autoAdvanceTimerRef.current = setTimeout(() => actionsRef.current.next(true), AUTO_ADVANCE_MS);
  }, [clearAutoAdvance]);

  const beginTalk = useCallback(
    (nextRun: PresentationRun) => {
      stopAll();
      setRun(nextRun);
      if (isRunFinished(nextRun)) {
        setPhase('all-done');
        setShowRecords(false);
        return;
      }
      setTalkEndedAt(null);
      setTalkEndReason(null);
      pendingUsageRef.current = null;
      startCountdown(setupRef.current.durationSeconds, 'talk');
    },
    [stopAll, startCountdown],
  );

  const onTalkTimeUp = useCallback(
    (at: number) => {
      setPhase('talk-ended');
      setTalkEndedAt(at);
      setTalkEndReason('time-up');
      talkRemainingAtEndRef.current = 0;
      stopAlarm();
      // 발표 중인 학생을 끊지 않도록 반복하지 않는다.
      alarmStopRef.current = startAlarmSequence('once', playAlarmOnce);
      if (setupRef.current.qnaSeconds === null) scheduleAutoAdvance();
    },
    [stopAlarm, playAlarmOnce, scheduleAutoAdvance],
  );

  const onQnaTimeUp = useCallback(() => {
    setPhase('qna-ended');
    stopAlarm();
    alarmStopRef.current = startAlarmSequence('once', playAlarmOnce);
    scheduleAutoAdvance();
  }, [stopAlarm, playAlarmOnce, scheduleAutoAdvance]);

  /** 지금 학생의 발표 기록(발표 끝 상태에서 넘어갈 때 확정). */
  const usageNow = useCallback((auto: boolean) => {
    return talkUsage({
      durationSeconds: setupRef.current.durationSeconds,
      reason: talkEndReasonRef.current ?? 'time-up',
      remainingAtEnd: talkRemainingAtEndRef.current,
      // 자동 진행으로 넘어가며 기다린 2초는 학생 탓이 아니다 — 초과로 세지 않는다.
      overtimeSeconds:
        auto || talkEndedAtRef.current === null
          ? 0
          : overtimeSeconds(talkEndedAtRef.current, Date.now()),
    });
  }, []);

  const next = useCallback(
    (auto = false) => {
      const current = runRef.current;
      if (current === null) return;
      const p = phaseRef.current;
      let usage: { usedSeconds: number; overSeconds: number } | null = null;
      if (p === 'talk-ended') usage = usageNow(auto);
      else if (p === 'qna-ended' || p === 'qna' || p === 'qna-paused')
        usage = pendingUsageRef.current;
      if (usage === null) return;
      beginTalk(completeCurrent(current, usage));
    },
    [usageNow, beginTalk],
  );

  actionsRef.current = { onTalkTimeUp, onQnaTimeUp, next };

  const start = useCallback(() => {
    if (orderedIds.length === 0) return;
    if (!useSoundStore.getState().settings.enabled) {
      showToast('소리가 꺼져 있어요. 알람이 울리지 않아요.', 'info');
    }
    setShowRecords(false);
    beginTalk(startPresentationRun(orderedIds));
  }, [orderedIds, beginTalk, showToast]);

  const pauseOrResume = useCallback(() => {
    const p = phaseRef.current;
    if (p === 'talk' || p === 'qna') {
      clearTick();
      setPhase(p === 'talk' ? 'talk-paused' : 'qna-paused');
    } else if (p === 'talk-paused' || p === 'qna-paused') {
      const kind = p === 'talk-paused' ? 'talk' : 'qna';
      startCountdown(remainingRef.current, kind, remainingRef.current);
    }
  }, [clearTick, startCountdown]);

  const finishTalkEarly = useCallback(() => {
    const p = phaseRef.current;
    if (p !== 'talk' && p !== 'talk-paused') return;
    clearTick();
    talkRemainingAtEndRef.current = remainingRef.current;
    setTalkEndReason('finished-early');
    setTalkEndedAt(null);
    setPhase('talk-ended');
    if (setupRef.current.qnaSeconds === null) scheduleAutoAdvance();
  }, [clearTick, scheduleAutoAdvance]);

  const startQna = useCallback(() => {
    const qna = setupRef.current.qnaSeconds;
    if (phaseRef.current !== 'talk-ended' || qna === null) return;
    stopAlarm();
    clearAutoAdvance();
    pendingUsageRef.current = usageNow(false);
    startCountdown(qna, 'qna');
  }, [stopAlarm, clearAutoAdvance, usageNow, startCountdown]);

  const finishQna = useCallback(() => {
    const p = phaseRef.current;
    if (p !== 'qna' && p !== 'qna-paused') return;
    clearTick();
    setPhase('qna-ended');
    scheduleAutoAdvance();
  }, [clearTick, scheduleAutoAdvance]);

  const deferNow = useCallback(() => {
    const current = runRef.current;
    if (current === null || !canDeferCurrent(current)) return;
    // 미루기 전에 흐른 시간은 버린다 — 나중 차례에 실제로 발표한 시간만 기록된다.
    beginTalk(deferCurrent(current));
  }, [beginTalk]);

  const skipNow = useCallback(() => {
    const current = runRef.current;
    if (current === null) return;
    beginTalk(skipCurrent(current));
  }, [beginTalk]);

  const resetAll = useCallback(() => {
    stopAll();
    setRun(null);
    setRemaining(0);
    setTalkEndedAt(null);
    setTalkEndReason(null);
    pendingUsageRef.current = null;
    setShowRecords(false);
    setPhase('setup');
  }, [stopAll]);

  const perform = useCallback(
    (action: PresentationAction) => {
      switch (action) {
        case 'start':
          start();
          break;
        case 'pause':
        case 'resume':
          pauseOrResume();
          break;
        case 'finishTalk':
          finishTalkEarly();
          break;
        case 'startQna':
          startQna();
          break;
        case 'finishQna':
          finishQna();
          break;
        case 'next':
          next(false);
          break;
        case 'none':
          break;
      }
    },
    [start, pauseOrResume, finishTalkEarly, startQna, finishQna, next],
  );

  // ── 쌤도구 팝업 이관 ────────────────────────────────────────────
  const captureForPopup = useCallback((): PresentationSnapshot => {
    stopAll();
    return {
      setup: serializeSetup(setupRef.current),
      phase: phaseRef.current,
      run: runRef.current,
      remaining: remainingRef.current,
      talkEndedAt: talkEndedAtRef.current,
      talkEndReason: talkEndReasonRef.current,
      talkRemainingAtEnd: talkRemainingAtEndRef.current,
      pendingUsage: pendingUsageRef.current,
      showRecords,
    };
  }, [stopAll, showRecords]);

  const applySnapshot = useCallback(
    (snapshot: PresentationSnapshot, capturedAt: number) => {
      stopAll();
      setSetup(deserializeSetup(snapshot.setup));
      setupRef.current = deserializeSetup(snapshot.setup);
      restoredRosterRef.current = true;
      setRun(snapshot.run);
      setTalkEndedAt(snapshot.talkEndedAt);
      talkEndedAtRef.current = snapshot.talkEndedAt;
      setTalkEndReason(snapshot.talkEndReason);
      talkEndReasonRef.current = snapshot.talkEndReason;
      talkRemainingAtEndRef.current = snapshot.talkRemainingAtEnd;
      pendingUsageRef.current = snapshot.pendingUsage;
      setShowRecords(snapshot.showRecords);
      setRemaining(snapshot.remaining);
      const p = snapshot.phase;
      if (!isPresentationCounting(p)) {
        setPhase(p);
        // 자동 진행을 기다리던 중에 옮겼으면 새 창에서 다시 기다린다(2초는 처음부터).
        const waitingForNext =
          p === 'qna-ended' || (p === 'talk-ended' && snapshot.setup.qnaSeconds === null);
        if (waitingForNext) scheduleAutoAdvance();
        return;
      }
      // 옮기는 사이에도 시간이 흐른다. 0 을 지났으면 이 창에서 한 번만 알린다.
      const left = snapshot.remaining - transferElapsedSeconds(capturedAt, Date.now());
      if (left > 0) {
        startCountdown(left, p === 'talk' ? 'talk' : 'qna', left);
        return;
      }
      setRemaining(0);
      if (p === 'talk') onTalkTimeUp(capturedAt + snapshot.remaining * 1000);
      else onQnaTimeUp();
    },
    [stopAll, startCountdown, onTalkTimeUp, onQnaTimeUp, scheduleAutoAdvance],
  );

  useToolPopupSlot<PresentationSnapshot>('timer-presentation', {
    capture: captureForPopup,
    resume: applySnapshot,
  });

  useEffect(() => {
    if (popupInitial === null) return;
    applySnapshot(popupInitial.data, popupInitial.capturedAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => stopAll, [stopAll]);

  // ── 틀에 알리기 ────────────────────────────────────────────────
  const ended = phase === 'talk-ended' || phase === 'qna-ended';
  useReportTimerStatus('presentation', {
    busy: isPresentationBusy(phase),
    awaitingConfirm: false,
    running: isPresentationCounting(phase),
    badge: ended
      ? { kind: 'finished' }
      : isPresentationBusy(phase)
        ? { kind: 'remaining', seconds: remaining }
        : null,
    classroomReady: isPresentationBusy(phase),
  });

  useTimerModeKeydown(
    'presentation',
    (e) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === ' ') {
        e.preventDefault();
        perform(spaceAction(phaseRef.current, setupRef.current.qnaSeconds !== null));
      } else if (e.key === 'ArrowRight' || e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        perform(arrowAction(phaseRef.current));
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        resetAll();
      }
    },
    [perform, resetAll],
  );

  const { stageRef, geometry } = useTimerStageSize(timerTool.displayStyle);
  const classroomOpen = useIsClassroomOpen('presentation');

  if (phase === 'setup') {
    return (
      <PresentationSetup
        value={setup}
        onChange={updateSetup}
        onStart={start}
        onClear={() => updateSetup({ presenters: [], order: new Map(), inputMode: 'custom' })}
      />
    );
  }

  // ── 진행 / 완료 ─────────────────────────────────────────────────
  const currentId = run ? currentPresenterId(run) : null;
  const nextId = run ? nextPresenterId(run) : null;
  const total = run?.order.length ?? 0;
  const position = run ? Math.min(run.index + 1, total) : 0;
  const qnaEnabled = setup.qnaSeconds !== null;
  const inQna = phase === 'qna' || phase === 'qna-paused' || phase === 'qna-ended';
  const countdownTotal = inQna ? (setup.qnaSeconds ?? 0) : setup.durationSeconds;
  const warningThreshold = inQna ? 0 : warningThresholdSeconds(presentationPw);
  const level = getTimerColorLevel(remaining, countdownTotal, warningThreshold);
  const paused = phase === 'talk-paused' || phase === 'qna-paused';

  const primary =
    'h-16 px-6 rounded-full bg-sp-accent text-sp-accent-fg font-bold flex items-center gap-2 hover:brightness-110 transition';
  const secondary =
    'px-4 py-2 rounded-full bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent text-sm flex items-center gap-1.5 transition-colors';

  const endActions = (
    <>
      {phase === 'talk-ended' && qnaEnabled && (
        <button type="button" className={primary} onClick={startQna}>
          <span className="material-symbols-outlined">forum</span>질문 시간
        </button>
      )}
      <button
        type="button"
        className={phase === 'talk-ended' && qnaEnabled ? secondary : primary}
        onClick={() => next(false)}
        title={nextId === null ? '마지막 발표자예요 — 누르면 발표 완료 (→)' : '다음 발표자 (→)'}
      >
        <span className="material-symbols-outlined">skip_next</span>
        다음 발표자
      </button>
    </>
  );
  const endTitle =
    phase === 'qna-ended'
      ? '질문 시간 끝'
      : talkEndReason === 'finished-early'
        ? '발표 마침'
        : '시간 종료';
  const endTone = endTitle === '시간 종료' ? 'alert' : 'calm';

  const nextActionFor = (action: PresentationAction): ClassroomNextAction | null => {
    switch (action) {
      case 'finishTalk':
        return { label: '발표 마침', icon: 'flag', onClick: finishTalkEarly };
      case 'startQna':
        return { label: '질문 시간', icon: 'forum', onClick: startQna };
      case 'finishQna':
        return { label: '질문 마침', icon: 'check_circle', onClick: finishQna };
      case 'next':
        return { label: '다음 발표자', icon: 'skip_next', onClick: () => next(false) };
      default:
        return null;
    }
  };

  if (phase === 'all-done') {
    const records = run?.records ?? [];
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-lg mx-auto py-8">
        <span className="material-symbols-outlined text-sp-success text-[72px]">check_circle</span>
        <p className="text-3xl font-bold text-sp-text">발표 완료!</p>
        <p className="text-sp-muted">
          {records.filter((r) => r.status === 'presented').length}명이 발표를 마쳤어요
        </p>
        {showRecords ? (
          <ul
            className="w-full divide-y divide-sp-border rounded-xl bg-sp-card border border-sp-border px-4"
            aria-label="발표 시간 기록"
          >
            {records.map((r) => (
              <li key={r.presenterId} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-sp-text">{nameOf(r.presenterId)}</span>
                <span className="text-sm tabular-nums text-sp-muted">
                  {r.status === 'skipped'
                    ? '건너뜀'
                    : `${formatShortDuration(r.usedSeconds)}${r.overSeconds > 0 ? ` +${formatShortDuration(r.overSeconds)}` : ''}`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <button type="button" className={secondary} onClick={() => setShowRecords(true)}>
            <span className="material-symbols-outlined text-icon-md">list_alt</span>
            시간 기록 보기
          </button>
        )}
        <button
          type="button"
          onClick={resetAll}
          className="px-8 py-3 rounded-xl bg-sp-accent text-sp-accent-fg font-medium hover:brightness-110 transition"
        >
          처음으로
        </button>
      </div>
    );
  }

  const presenterLine = (
    <div className="flex flex-col items-center gap-1 text-center">
      <p className="text-sm text-sp-muted">{inQna ? '질문 시간' : '현재 발표자'}</p>
      <p className="text-3xl md:text-4xl font-bold text-sp-text">{nameOf(currentId)}</p>
    </div>
  );

  return (
    <div className="relative flex flex-col items-center w-full h-full min-h-0 gap-3 rounded-2xl">
      {ended && !classroomOpen && (
        <TimerEndOverlay
          finishedAt={phase === 'talk-ended' ? talkEndedAt : null}
          title={endTitle}
          tone={endTone}
          overtimeStyle="small"
          flash={phase === 'talk-ended' && talkEndReason === 'time-up'}
          actions={endActions}
        />
      )}
      {/* 진행 막대 — 끝난 차례는 채우고 지금 차례는 강조(색으로 학생을 가리지 않는다) */}
      <div className="shrink-0 flex gap-1 w-full max-w-2xl" aria-hidden="true">
        {(run?.order ?? []).map((id, i) => (
          <div
            key={id}
            className={`h-1.5 rounded-full flex-1 ${
              i < (run?.index ?? 0)
                ? 'bg-sp-muted'
                : i === run?.index
                  ? 'bg-sp-accent'
                  : 'bg-sp-border'
            }`}
          />
        ))}
      </div>
      <p className="shrink-0 text-sm text-sp-muted">
        {position} / {total}
      </p>
      <div className="shrink-0">{presenterLine}</div>
      <div ref={stageRef} className="flex-1 min-h-[200px] w-full flex items-center justify-center">
        <TimerDial
          remaining={remaining}
          total={countdownTotal}
          level={level}
          displayStyle={timerTool.displayStyle}
          geometry={geometry}
          paused={paused}
        />
      </div>
      {nextId !== null && (
        <p className="shrink-0 text-sm text-sp-muted flex items-center gap-1.5">
          <span className="material-symbols-outlined text-icon-sm">arrow_forward</span>
          다음: {nameOf(nextId)}
        </p>
      )}
      <div className="shrink-0 flex items-center gap-3 flex-wrap justify-center">
        <button
          type="button"
          onClick={resetAll}
          className="w-16 h-16 rounded-full bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent transition-colors flex items-center justify-center"
          title="처음으로 (R)"
          aria-label="처음으로"
        >
          <span className="material-symbols-outlined text-icon-xl">restart_alt</span>
        </button>
        {(phase === 'talk' ||
          phase === 'talk-paused' ||
          phase === 'qna' ||
          phase === 'qna-paused') && (
          <button
            type="button"
            onClick={pauseOrResume}
            className="w-16 h-16 rounded-full bg-sp-card border border-sp-border text-sp-text hover:border-sp-accent flex items-center justify-center transition-colors"
            title={paused ? '다시 시작 (Space)' : '잠시 멈춤 (Space)'}
            aria-label={paused ? '다시 시작' : '잠시 멈춤'}
          >
            <span className="material-symbols-outlined text-3xl">
              {paused ? 'play_arrow' : 'pause'}
            </span>
          </button>
        )}
        {(phase === 'talk' || phase === 'talk-paused') && (
          <button type="button" className={primary} onClick={finishTalkEarly} title="발표 마침 (→)">
            <span className="material-symbols-outlined">flag</span>발표 마침
          </button>
        )}
        {(phase === 'qna' || phase === 'qna-paused') && (
          <button type="button" className={primary} onClick={finishQna} title="질문 마침 (→)">
            <span className="material-symbols-outlined">check_circle</span>질문 마침
          </button>
        )}
      </div>
      <div className="shrink-0">
        <MuteNotice />
      </div>
      {(phase === 'talk' || phase === 'talk-paused') && (
        <div className="shrink-0 flex items-center gap-2">
          {run !== null && canDeferCurrent(run) && (
            <button
              type="button"
              className={secondary}
              onClick={deferNow}
              title="이 학생을 맨 뒤로 보내고 다음 학생 시작"
            >
              <span className="material-symbols-outlined text-icon-md">move_down</span>나중에
            </button>
          )}
          <button type="button" className={secondary} onClick={skipNow} title="이번 발표에서 빼기">
            <span className="material-symbols-outlined text-icon-md">fast_forward</span>건너뛰기
          </button>
        </div>
      )}
      {classroomOpen && shell !== null && (
        <ClassroomOverlay
          onExit={shell.closeClassroom}
          displayStyle={timerTool.displayStyle}
          top={
            <>
              <p className="text-3xl md:text-5xl font-bold text-sp-text">{nameOf(currentId)}</p>
              <p className="text-lg md:text-2xl text-sp-muted">
                {inQna ? '질문 시간 · ' : ''}
                {position}/{total}
              </p>
            </>
          }
          renderStage={(g) => (
            <TimerDial
              remaining={remaining}
              total={countdownTotal}
              level={level}
              displayStyle={timerTool.displayStyle}
              geometry={g}
              paused={paused}
            />
          )}
          pause={
            phase === 'talk' || phase === 'talk-paused' || phase === 'qna' || phase === 'qna-paused'
              ? { paused, onToggle: pauseOrResume }
              : null
          }
          nextAction={nextActionFor(classroomNextAction(phase, qnaEnabled))}
          overlay={
            ended ? (
              // 교실 화면에서는 넘긴 시간을 아예 숨긴다(spec 4-5).
              <TimerEndOverlay
                finishedAt={phase === 'talk-ended' ? talkEndedAt : null}
                title={endTitle}
                tone={endTone}
                overtimeStyle="hidden"
                flash={false}
                actions={endActions}
              />
            ) : undefined
          }
        />
      )}
    </div>
  );
}
