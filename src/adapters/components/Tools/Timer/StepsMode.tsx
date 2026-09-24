import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TimerStepSequence } from '@domain/entities/Settings';
import {
  canAdjustSeconds,
  endClockTime,
  getTimerColorLevel,
  isPreWarningArmed,
  warningThresholdSeconds,
} from '@domain/rules/timerRules';
import {
  MAX_STEP_SEQUENCES,
  normalizeStepSequence,
  trimTimerName,
} from '@domain/rules/timerSettings';
import {
  advanceStepsBy,
  expandStepSlots,
  hasNextSlot,
  hasPreviousSlot,
  remainingActivitySeconds,
  slotSeconds,
  stepDisplayName,
  type StepPlan,
} from '@domain/rules/timerSteps';
import { transferElapsedSeconds } from '@domain/rules/toolPopupSession';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useSoundStore } from '@adapters/stores/useSoundStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { useToolPopupInitial, useToolPopupSlot } from '../popup/toolPopupSession';
import { ClassroomOverlay } from './ClassroomOverlay';
import {
  StepSequenceEditor,
  fixDraft,
  isStepValid,
  newStepId,
  type StepDraft,
} from './StepSequenceEditor';
import { AdjustButton } from './TimerControls';
import { TimerDial } from './TimerDial';
import { TimerEndOverlay } from './TimerEndOverlay';
import { TimerSoundSettings } from './TimerSoundSettings';
import { playStepTransitionSound, startAlarmSequence, type AlarmStopHandle } from './timerAudio';
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
 * 단계 타이머(ADR-139, spec 7, 설계 10장).
 *
 * 생각 2분 → 짝 토의 3분 → 발표 1분처럼 단계가 끝나면 짧은 전환음과 함께 다음 단계가
 * **자동으로** 시작된다(오너 결정). 예고 알림은 모든 단계마다(단계가 예고 시점보다 짧으면 건너뜀),
 * 마지막 바퀴의 마지막 단계가 끝나면 종료 알람과 초과 시간.
 */

type RunState = 'idle' | 'running' | 'paused' | 'finished';

interface StepRun {
  readonly plan: StepPlan;
  readonly name: string;
  readonly slotIndex: number;
  readonly remaining: number;
  readonly state: RunState;
  readonly finishedAt: number | null;
}

/** 팝업으로 옮길 때 함께 가는 단계 타이머 상태. */
export interface StepsSnapshot {
  readonly view: 'list' | 'edit' | 'run';
  readonly draft: StepDraft | null;
  readonly run: StepRun | null;
}

const EXAMPLES: readonly StepDraft[] = [
  {
    id: null,
    fromExample: true,
    name: '생각-짝-나누기',
    steps: [
      { id: 'ex-think', name: '생각하기', seconds: 120 },
      { id: 'ex-pair', name: '짝과 나누기', seconds: 180 },
      { id: 'ex-share', name: '전체 나누기', seconds: 120 },
    ],
    repeat: 1,
    skipLastStepOnFinalRound: false,
  },
  {
    id: null,
    fromExample: true,
    name: '모둠 순환',
    steps: [
      { id: 'ex-work', name: '모둠 활동', seconds: 300 },
      { id: 'ex-move', name: '자리 이동', seconds: 60 },
    ],
    repeat: 4,
    skipLastStepOnFinalRound: true,
  },
];

function toDraft(seq: TimerStepSequence): StepDraft {
  return {
    id: seq.id,
    name: seq.name,
    steps: seq.steps,
    repeat: seq.repeat,
    skipLastStepOnFinalRound: seq.skipLastStepOnFinalRound,
  };
}

function emptyDraft(): StepDraft {
  return {
    id: null,
    name: '',
    steps: [
      { id: newStepId(), name: '', seconds: 120 },
      { id: newStepId(), name: '', seconds: 180 },
    ],
    repeat: 1,
    skipLastStepOnFinalRound: false,
  };
}

function totalPlanSeconds(plan: StepPlan): number {
  return remainingActivitySeconds(plan, 0, slotSeconds(plan, 0));
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}분` : m === 0 ? `${s}초` : `${m}분 ${s}초`;
}

export function StepsMode() {
  const shell = useTimerShell();
  const { timerTool, editable, update: updateTimerTool } = useTimerToolSettings();
  const preWarning = useSettingsStore((s) => s.settings.alarmSound.preWarning);
  const showToast = useToastStore((s) => s.show);
  const { playAlarmOnce, playPreWarning } = useTimerAlarm();
  const volume = useSettingsStore((s) => s.settings.alarmSound.volume);
  const boost = useSettingsStore((s) => s.settings.alarmSound.boost);

  const popupInitial = useToolPopupInitial<StepsSnapshot>('timer-steps');
  const [view, setView] = useState<'list' | 'edit' | 'run'>(
    () => popupInitial?.data.view ?? 'list',
  );
  const [draft, setDraft] = useState<StepDraft | null>(() => popupInitial?.data.draft ?? null);
  const [run, setRunState] = useState<StepRun | null>(() => popupInitial?.data.run ?? null);
  const runRef = useRef(run);
  const setRun = (next: StepRun | null): void => {
    runRef.current = next;
    setRunState(next);
  };

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const alarmStopRef = useRef<AlarmStopHandle | null>(null);
  const preWarningArmedRef = useRef(false);
  const preWarningRef = useRef(preWarning);
  preWarningRef.current = preWarning;
  const alarmRepeatRef = useRef(timerTool.alarmRepeat);
  alarmRepeatRef.current = timerTool.alarmRepeat;
  const soundRef = useRef({ volume, boost });
  soundRef.current = { volume, boost };

  const clearTick = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);
  const stopAlarm = useCallback(() => {
    alarmStopRef.current?.();
    alarmStopRef.current = null;
  }, []);

  /** 이 칸에서 예고 알림이 울릴 수 있게 한다(단계가 예고 시점보다 짧으면 건너뜀). */
  const armPreWarning = useCallback((stepTotal: number, remainingNow: number) => {
    const pw = preWarningRef.current;
    preWarningArmedRef.current =
      pw.enabled && isPreWarningArmed(remainingNow, stepTotal, pw.secondsBefore);
  }, []);

  const finishRun = useCallback(
    (current: StepRun, at: number) => {
      clearTick();
      setRun({ ...current, remaining: 0, state: 'finished', finishedAt: at });
      stopAlarm();
      alarmStopRef.current = startAlarmSequence(alarmRepeatRef.current, playAlarmOnce);
    },
    [clearTick, stopAlarm, playAlarmOnce],
  );

  const startTicking = useCallback(() => {
    clearTick();
    let lastTick = Date.now();
    intervalRef.current = setInterval(() => {
      const current = runRef.current;
      if (current === null || current.state !== 'running') return;
      const now = Date.now();
      const delta = Math.floor((now - lastTick) / 1000);
      if (delta < 1) return;
      lastTick = now - ((now - lastTick) % 1000);
      const result = advanceStepsBy(current.plan, current.slotIndex, current.remaining, delta);
      if (result.finished) {
        finishRun(current, now - result.overflowSeconds * 1000);
        return;
      }
      if (result.boundariesCrossed > 0) {
        playStepTransitionSound(soundRef.current.volume, soundRef.current.boost);
        armPreWarning(slotSeconds(current.plan, result.slotIndex), result.remaining);
      }
      const threshold = preWarningRef.current.secondsBefore;
      if (preWarningArmedRef.current && result.remaining > 0 && result.remaining <= threshold) {
        preWarningArmedRef.current = false;
        playPreWarning();
      }
      setRun({ ...current, slotIndex: result.slotIndex, remaining: result.remaining });
    }, 100);
  }, [clearTick, finishRun, armPreWarning, playPreWarning]);

  const beginRun = useCallback(
    (source: StepDraft) => {
      const fixed = fixDraft(source);
      if (fixed.steps.length === 0 || !fixed.steps.every(isStepValid)) {
        showToast('단계 시간을 5초부터 99분 59초 사이로 맞춰 주세요', 'error');
        return;
      }
      const plan: StepPlan = {
        steps: fixed.steps,
        repeat: fixed.repeat,
        skipLastStepOnFinalRound: fixed.skipLastStepOnFinalRound,
      };
      clearTick();
      stopAlarm();
      setDraft(fixed);
      setRun({
        plan,
        name: trimTimerName(fixed.name) || '단계 타이머',
        slotIndex: 0,
        remaining: slotSeconds(plan, 0),
        state: 'idle',
        finishedAt: null,
      });
      setView('run');
    },
    [clearTick, stopAlarm, showToast],
  );

  const toggle = useCallback(() => {
    const current = runRef.current;
    if (current === null || current.state === 'finished') return;
    if (current.state === 'running') {
      clearTick();
      setRun({ ...current, state: 'paused' });
      return;
    }
    if (current.state === 'idle' && !useSoundStore.getState().settings.enabled) {
      showToast('소리가 꺼져 있어요. 알람이 울리지 않아요.', 'info');
    }
    // 시작·재개 — 이미 예고 시점 안에서 재개하면 이 단계의 예고는 울리지 않는다.
    armPreWarning(slotSeconds(current.plan, current.slotIndex), current.remaining);
    setRun({ ...current, state: 'running' });
    startTicking();
  }, [clearTick, armPreWarning, startTicking, showToast]);

  /** 처음으로 — 첫 단계 처음, 멈춘 상태. */
  const resetRun = useCallback(() => {
    const current = runRef.current;
    if (current === null) return;
    clearTick();
    stopAlarm();
    setRun({
      ...current,
      slotIndex: 0,
      remaining: slotSeconds(current.plan, 0),
      state: 'idle',
      finishedAt: null,
    });
  }, [clearTick, stopAlarm]);

  /** 이전·다음 단계 — 누른 단계의 처음부터(spec 7-2). 돌고 있었으면 계속 돈다. */
  const jump = useCallback(
    (dir: -1 | 1) => {
      const current = runRef.current;
      if (current === null || current.state === 'finished') return;
      const target = current.slotIndex + dir;
      if (dir < 0 && !hasPreviousSlot(current.slotIndex)) return;
      if (dir > 0 && !hasNextSlot(current.plan, current.slotIndex)) return;
      const remaining = slotSeconds(current.plan, target);
      armPreWarning(remaining, remaining);
      setRun({ ...current, slotIndex: target, remaining });
    },
    [armPreWarning],
  );

  /** ± — 현재 단계의 남은 시간만 바꾼다. 저장된 순서는 바뀌지 않는다. */
  const adjust = useCallback(
    (delta: number) => {
      const current = runRef.current;
      if (current === null || current.state === 'finished') return;
      if (!canAdjustSeconds(current.remaining, delta)) return;
      const remaining = current.remaining + delta;
      if (remaining > preWarningRef.current.secondsBefore) {
        armPreWarning(Math.max(slotSeconds(current.plan, current.slotIndex), remaining), remaining);
      }
      setRun({ ...current, remaining });
    },
    [armPreWarning],
  );

  const saveDraft = useCallback(async () => {
    if (draft === null) return;
    const name = trimTimerName(draft.name);
    if (name === '') {
      showToast('순서 이름을 적어 주세요', 'error');
      return;
    }
    if (!draft.steps.every(isStepValid)) {
      showToast('단계 시간을 5초부터 99분 59초 사이로 맞춰 주세요', 'error');
      return;
    }
    const existing = timerTool.stepSequences;
    const id = draft.id ?? `seq-${Date.now()}`;
    const candidate = normalizeStepSequence({ ...fixDraft(draft), id, name });
    if (candidate === null) return;
    const replaced = existing.some((s) => s.id === id);
    if (!replaced && existing.length >= MAX_STEP_SEQUENCES) {
      showToast(`순서는 ${MAX_STEP_SEQUENCES}개까지 저장할 수 있어요`, 'error');
      return;
    }
    const next = replaced
      ? existing.map((s) => (s.id === id ? candidate : s))
      : [...existing, candidate];
    await updateTimerTool({ stepSequences: next });
    setDraft({ ...draft, id, name, fromExample: false });
    showToast('순서를 저장했어요', 'success');
  }, [draft, timerTool.stepSequences, updateTimerTool, showToast]);

  const deleteSaved = useCallback(
    async (id: string) => {
      await updateTimerTool({ stepSequences: timerTool.stepSequences.filter((s) => s.id !== id) });
      setDraft(null);
      setView('list');
      showToast('순서를 지웠어요', 'info');
    },
    [timerTool.stepSequences, updateTimerTool, showToast],
  );

  // ── 쌤도구 팝업 이관 ────────────────────────────────────────────
  const captureForPopup = useCallback((): StepsSnapshot => {
    clearTick();
    stopAlarm();
    return { view, draft, run: runRef.current };
  }, [clearTick, stopAlarm, view, draft]);

  const applySnapshot = useCallback(
    (snapshot: StepsSnapshot, capturedAt: number) => {
      clearTick();
      stopAlarm();
      setView(snapshot.view);
      setDraft(snapshot.draft);
      const saved = snapshot.run;
      if (saved === null) {
        setRun(null);
        return;
      }
      if (saved.state !== 'running') {
        setRun(saved);
        return;
      }
      // 옮기는 사이에도 시간이 흐른다 — 경계를 넘었으면 그만큼 넘긴다(전환음은 울리지 않는다).
      const elapsed = transferElapsedSeconds(capturedAt, Date.now());
      const result = advanceStepsBy(saved.plan, saved.slotIndex, saved.remaining, elapsed);
      if (result.finished) {
        const at = Date.now() - result.overflowSeconds * 1000;
        setRun({
          ...saved,
          slotIndex: result.slotIndex,
          remaining: 0,
          state: 'finished',
          finishedAt: at,
        });
        alarmStopRef.current = startAlarmSequence(alarmRepeatRef.current, playAlarmOnce);
        return;
      }
      const next = { ...saved, slotIndex: result.slotIndex, remaining: result.remaining };
      setRun(next);
      armPreWarning(slotSeconds(saved.plan, result.slotIndex), result.remaining);
      startTicking();
    },
    [clearTick, stopAlarm, armPreWarning, startTicking, playAlarmOnce],
  );

  useToolPopupSlot<StepsSnapshot>('timer-steps', {
    capture: captureForPopup,
    resume: applySnapshot,
  });

  useEffect(() => {
    if (popupInitial === null) return;
    applySnapshot(popupInitial.data, popupInitial.capturedAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      clearTick();
      stopAlarm();
    },
    [clearTick, stopAlarm],
  );

  // ── 틀에 알리기 ────────────────────────────────────────────────
  const runState = run?.state ?? 'idle';
  useReportTimerStatus('steps', {
    busy: runState === 'running' || runState === 'paused',
    awaitingConfirm: runState === 'finished',
    running: runState === 'running',
    badge:
      run !== null && (runState === 'running' || runState === 'paused')
        ? { kind: 'remaining', seconds: run.remaining }
        : runState === 'finished'
          ? { kind: 'finished' }
          : null,
    classroomReady: view === 'run' && run !== null,
  });

  useTimerModeKeydown(
    'steps',
    (e) => {
      if (view !== 'run') return;
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === ' ') {
        e.preventDefault();
        toggle();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        resetRun();
      } else if (e.key === 'Enter' && runRef.current?.state === 'finished') {
        e.preventDefault();
        resetRun();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        jump(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        jump(-1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        adjust(30);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        adjust(-30);
      }
    },
    [view, toggle, resetRun, jump, adjust],
  );

  const { stageRef, geometry } = useTimerStageSize(timerTool.displayStyle);
  const classroomOpen = useIsClassroomOpen('steps');
  const slots = useMemo(() => (run ? expandStepSlots(run.plan) : []), [run]);

  // ── 목록 ───────────────────────────────────────────────────────
  if (view === 'list' || (view === 'run' && run === null) || (view === 'edit' && draft === null)) {
    const saved = timerTool.stepSequences;
    return (
      <div className="w-full max-w-2xl mx-auto flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-sp-text">
            {saved.length > 0 ? '저장한 순서' : '예시로 시작하기'}
          </h2>
          <button
            type="button"
            onClick={() => {
              setDraft(emptyDraft());
              setView('edit');
            }}
            className="px-4 py-2 rounded-xl bg-sp-accent text-sp-accent-fg text-sm font-bold flex items-center gap-1 hover:brightness-110 transition"
          >
            <span className="material-symbols-outlined text-icon-md">add</span>새 순서 만들기
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {(saved.length > 0 ? saved.map(toDraft) : EXAMPLES).map((d) => (
            <button
              key={d.id ?? d.name}
              type="button"
              onClick={() => {
                setDraft({
                  ...d,
                  steps: d.steps.map((s) => ({ ...s, id: d.fromExample ? newStepId() : s.id })),
                });
                setView('edit');
              }}
              className="w-full flex items-center justify-between p-4 rounded-xl bg-sp-card border border-sp-border hover:border-sp-accent text-left transition-colors"
            >
              <div className="min-w-0">
                <p className="text-sm font-bold text-sp-text flex items-center gap-2">
                  {d.name}
                  {d.fromExample && (
                    <span className="text-caption text-sp-muted border border-sp-border rounded-full px-1.5">
                      예시
                    </span>
                  )}
                </p>
                <p className="text-xs text-sp-muted truncate">
                  {d.steps.map((s, i) => stepDisplayName(s, i)).join(' → ')} ·{' '}
                  {d.repeat > 1 ? `${d.repeat}바퀴` : '1회'}
                </p>
              </div>
              <span className="material-symbols-outlined text-sp-muted">chevron_right</span>
            </button>
          ))}
        </div>
        {saved.length === 0 && (
          <p className="text-xs text-sp-muted text-center">
            예시를 열어 고친 뒤 [저장]하면 내 순서가 돼요.
          </p>
        )}
      </div>
    );
  }

  // ── 순서 만들기 ─────────────────────────────────────────────────
  if (view === 'edit' && draft !== null) {
    const total = totalPlanSeconds({
      steps: draft.steps,
      repeat: draft.repeat,
      skipLastStepOnFinalRound: draft.skipLastStepOnFinalRound,
    });
    return (
      <div className="w-full max-w-2xl mx-auto flex flex-col items-center gap-4">
        <div className="w-full flex items-center justify-between">
          <button
            type="button"
            onClick={() => setView('list')}
            className="flex items-center gap-1 text-sm text-sp-muted hover:text-sp-text"
          >
            <span className="material-symbols-outlined text-icon-md">arrow_back</span>
            순서 목록
          </button>
          <span className="text-xs text-sp-muted">전체 {formatDuration(total)}</span>
        </div>
        <StepSequenceEditor draft={draft} onChange={setDraft} />
        <div className="w-full max-w-2xl flex flex-wrap items-center gap-2">
          {editable && (
            <button
              type="button"
              onClick={() => void saveDraft()}
              className="flex-1 min-w-[120px] py-3 rounded-xl border border-sp-accent text-sp-accent font-bold hover:bg-sp-surface transition-colors"
            >
              저장
            </button>
          )}
          <button
            type="button"
            onClick={() => beginRun(draft)}
            className="flex-1 min-w-[120px] py-3 rounded-xl bg-sp-accent text-sp-accent-fg font-bold flex items-center justify-center gap-1 hover:brightness-110 transition"
          >
            <span className="material-symbols-outlined text-icon-lg">play_arrow</span>이 순서로 시작
          </button>
          {editable && draft.id !== null && (
            <button
              type="button"
              onClick={() => void deleteSaved(draft.id!)}
              className="px-4 py-3 rounded-xl text-sm text-sp-muted hover:text-sp-error"
            >
              순서 지우기
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── 진행 ───────────────────────────────────────────────────────
  const current = run!;
  const slot = slots[current.slotIndex];
  const step = slot ? current.plan.steps[slot.stepIndex] : undefined;
  const stepName = step && slot ? stepDisplayName(step, slot.stepIndex) : '';
  const nextSlot = slots[current.slotIndex + 1];
  const nextName =
    nextSlot !== undefined
      ? stepDisplayName(current.plan.steps[nextSlot.stepIndex]!, nextSlot.stepIndex)
      : null;
  const stepTotal = slotSeconds(current.plan, current.slotIndex);
  const level = getTimerColorLevel(
    current.remaining,
    stepTotal,
    warningThresholdSeconds(preWarning),
  );
  const paused = current.state === 'paused';
  const repeat = Math.max(1, current.plan.repeat);
  const positionLine = `${(slot?.stepIndex ?? 0) + 1}/${current.plan.steps.length}단계 · 다음: ${nextName ?? '끝'}${
    repeat > 1 ? ` · ${(slot?.round ?? 0) + 1}/${repeat}바퀴` : ''
  }`;
  const wholeRemaining = remainingActivitySeconds(
    current.plan,
    current.slotIndex,
    current.remaining,
  );
  const statusLine =
    current.state === 'running' ? (
      <span>전체 {endClockTime(Date.now(), wholeRemaining)}에 끝나요</span>
    ) : paused ? (
      <span className="inline-flex items-center gap-1.5">
        <span className="material-symbols-outlined text-icon-md">pause_circle</span>
        잠시 멈춤
      </span>
    ) : null;
  const canNext = hasNextSlot(current.plan, current.slotIndex);
  const confirmButton = (
    <button
      type="button"
      onClick={resetRun}
      className="px-10 py-4 rounded-xl bg-sp-accent text-sp-accent-fg text-xl font-bold hover:brightness-110 transition"
    >
      확인
    </button>
  );
  const roundButton =
    'w-14 h-14 rounded-full bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent transition-colors flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed';

  return (
    <div className="relative flex flex-col items-center w-full h-full min-h-0 gap-3 rounded-2xl">
      {current.state === 'finished' && !classroomOpen && (
        <TimerEndOverlay
          finishedAt={current.finishedAt}
          digitFontSize={geometry.digitFontSize}
          actions={confirmButton}
        />
      )}
      <div className="shrink-0 w-full max-w-2xl flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            clearTick();
            stopAlarm();
            setRun(null);
            setView('edit');
          }}
          disabled={current.state === 'running'}
          className="flex items-center gap-1 text-sm text-sp-muted hover:text-sp-text disabled:opacity-30"
        >
          <span className="material-symbols-outlined text-icon-md">edit</span>
          순서 고치기
        </button>
        <span className="text-xs text-sp-muted truncate">{current.name}</span>
      </div>
      <div className="shrink-0 flex flex-col items-center gap-1 text-center">
        <p className="text-2xl md:text-3xl font-bold text-sp-text">{stepName}</p>
        <p className="text-sm text-sp-muted">{positionLine}</p>
      </div>
      <div ref={stageRef} className="flex-1 min-h-[200px] w-full flex items-center justify-center">
        <TimerDial
          remaining={current.remaining}
          total={stepTotal}
          level={level}
          displayStyle={timerTool.displayStyle}
          geometry={geometry}
          paused={paused}
        />
      </div>
      <div className="shrink-0 flex flex-wrap items-center justify-center gap-1.5">
        {[-60, -30, 30, 60].map((delta) => (
          <AdjustButton
            key={delta}
            sign={delta > 0 ? 1 : -1}
            label={Math.abs(delta) === 60 ? '1분' : '30초'}
            seconds={Math.abs(delta)}
            disabled={current.state === 'finished' || !canAdjustSeconds(current.remaining, delta)}
            onClick={adjust}
          />
        ))}
      </div>
      <p className="shrink-0 h-6 text-sm text-sp-muted flex items-center" aria-live="polite">
        {statusLine}
      </p>
      <div className="shrink-0 flex items-center gap-4">
        <button
          type="button"
          onClick={() => jump(-1)}
          disabled={!hasPreviousSlot(current.slotIndex) || current.state === 'finished'}
          className={roundButton}
          title="이전 단계 (←)"
          aria-label="이전 단계"
        >
          <span className="material-symbols-outlined text-icon-xl">skip_previous</span>
        </button>
        <button
          type="button"
          onClick={resetRun}
          disabled={current.state === 'idle' && current.slotIndex === 0}
          className={roundButton}
          title="처음으로 (R)"
          aria-label="처음으로"
        >
          <span className="material-symbols-outlined text-icon-xl">restart_alt</span>
        </button>
        <button
          type="button"
          onClick={toggle}
          disabled={current.state === 'finished'}
          className="w-20 h-20 rounded-full bg-sp-accent text-sp-accent-fg flex items-center justify-center hover:brightness-110 transition shadow-lg disabled:opacity-30"
          title={current.state === 'running' ? '잠시 멈춤 (Space)' : '시작 (Space)'}
          aria-label={current.state === 'running' ? '잠시 멈춤' : '시작'}
        >
          <span className="material-symbols-outlined text-4xl">
            {current.state === 'running' ? 'pause' : 'play_arrow'}
          </span>
        </button>
        <button
          type="button"
          onClick={() => jump(1)}
          disabled={!canNext || current.state === 'finished'}
          className={roundButton}
          title="다음 단계 (→)"
          aria-label="다음 단계"
        >
          <span className="material-symbols-outlined text-icon-xl">skip_next</span>
        </button>
      </div>
      {/* 도는 동안에는 숨기되 자리는 남긴다 — 시작할 때 원이 밀려 움직이지 않게. */}
      <div
        className={`shrink-0 w-full ${current.state !== 'running' ? '' : 'invisible'}`}
        aria-hidden={current.state !== 'running' ? undefined : true}
      >
        <TimerSoundSettings preWarning="timer" showRepeat />
      </div>
      {classroomOpen && shell !== null && (
        <ClassroomOverlay
          onExit={shell.closeClassroom}
          displayStyle={timerTool.displayStyle}
          top={
            <>
              <p className="text-3xl md:text-5xl font-bold text-sp-text">{stepName}</p>
              <p className="text-lg md:text-2xl text-sp-muted">{positionLine}</p>
            </>
          }
          bottom={statusLine ?? undefined}
          renderStage={(g) => (
            <TimerDial
              remaining={current.remaining}
              total={stepTotal}
              level={level}
              displayStyle={timerTool.displayStyle}
              geometry={g}
              paused={paused}
            />
          )}
          pause={
            current.state === 'finished'
              ? null
              : { paused: current.state !== 'running', onToggle: toggle }
          }
          nextAction={
            canNext && current.state !== 'finished'
              ? { label: '다음 단계', icon: 'skip_next', onClick: () => jump(1) }
              : null
          }
          overlay={
            current.state === 'finished' ? (
              <TimerEndOverlay
                finishedAt={current.finishedAt}
                digitFontSize={96}
                actions={confirmButton}
              />
            ) : undefined
          }
        />
      )}
    </div>
  );
}
