import { useCallback, useEffect, useRef, useState } from 'react';
import type { TimerAlarmRepeat } from '@domain/entities/Settings';
import {
  canAdjustSeconds,
  clampTimerSeconds,
  endClockTime,
  getTimerColorLevel,
  isPreWarningArmed,
  warningThresholdSeconds,
} from '@domain/rules/timerRules';
import { advanceCountdown } from '@domain/rules/toolPopupSession';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useSoundStore } from '@adapters/stores/useSoundStore';
import { useTimerLocalStore } from '@adapters/stores/useTimerLocalStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { useToolPopupInitial, useToolPopupSlot } from '../popup/toolPopupSession';
import type { TimerState } from './types';
import { ActivityNameInput } from './ActivityNameInput';
import { ClassroomOverlay } from './ClassroomOverlay';
import { CustomTimeModal } from './CustomTimeModal';
import { ADJUST_AMOUNTS, AdjustButton } from './TimerControls';
import { TimerDial } from './TimerDial';
import { TimerEndOverlay } from './TimerEndOverlay';
import { TimerPresetBar } from './TimerPresetBar';
import { TimerSoundSettings } from './TimerSoundSettings';
import { startAlarmSequence, type AlarmStopHandle } from './timerAudio';
import {
  useIsClassroomOpen,
  useReportTimerStatus,
  useTimerModeKeydown,
  useTimerShell,
  useTimerVariant,
} from './timerShellContext';
import { useElementSize } from './useElementSize';
import { useTimerAlarm } from './useTimerAlarm';
import { useTimerStageSize } from './useTimerStageSize';
import { useTimerToolSettings } from './useTimerToolSettings';

/** 팝업으로 옮길 때 함께 가는 타이머 상태. */
export interface TimerModeSnapshot {
  readonly totalSeconds: number;
  readonly remaining: number;
  readonly state: TimerState;
  readonly selectedPreset: number;
  /** 활동 이름(ADR-139). 옛 버전 스냅샷에는 없다. */
  readonly activityName?: string;
  /** 0 에 닿은 시각 — 초과 시간을 이어 센다. */
  readonly finishedAt?: number | null;
}

const DEFAULT_SECONDS = 300;
/** 이 폭보다 좁으면 ± 단추를 원 아래로 내린다(조정 가능). */
const NARROW_LAYOUT_WIDTH = 640;
/** 넓은 창에서 원 양옆 ± 칸 폭과, 원 크기를 잴 때 양쪽에서 뺄 자리(칸 + 사이 간격 24px). */
const ADJUST_COLUMN_WIDTH = 84;
const WIDE_SIDE_SPACE = ADJUST_COLUMN_WIDTH + 24;

export function TimerMode() {
  const variant = useTimerVariant();
  const shell = useTimerShell();
  const { timerTool, editable, update: updateTimerTool } = useTimerToolSettings();
  const alarmRepeat: TimerAlarmRepeat = variant === 'mobile' ? 'once' : timerTool.alarmRepeat;
  const displayStyle = timerTool.displayStyle;
  const preWarning = useSettingsStore((s) => s.settings.alarmSound.preWarning);
  const localLoaded = useTimerLocalStore((s) => s.loaded);
  const lastDuration = useTimerLocalStore((s) => s.state.lastDurationSeconds);
  const recentNames = useTimerLocalStore((s) => s.state.recentActivityNames);
  const showToast = useToastStore((s) => s.show);
  const { playAlarmOnce, playPreWarning } = useTimerAlarm();

  // ── 팝업에서 넘겨받은 상태 ─────────────────────────────────────
  const popupInitial = useToolPopupInitial<TimerModeSnapshot>('timer-countdown');
  const [restoredInitial] = useState(() =>
    popupInitial
      ? advanceCountdown(
          {
            state: popupInitial.data.state,
            remaining: popupInitial.data.remaining,
            capturedAt: popupInitial.capturedAt,
            finishedAt: popupInitial.data.finishedAt ?? null,
          },
          Date.now(),
        )
      : null,
  );

  const [totalSeconds, setTotalSecondsState] = useState(
    () => popupInitial?.data.totalSeconds ?? DEFAULT_SECONDS,
  );
  const [remaining, setRemainingState] = useState(
    () => restoredInitial?.remaining ?? popupInitial?.data.totalSeconds ?? DEFAULT_SECONDS,
  );
  const [state, setStateValue] = useState<TimerState>(() => restoredInitial?.state ?? 'idle');
  const [finishedAt, setFinishedAt] = useState<number | null>(
    () => restoredInitial?.finishedAt ?? null,
  );
  const [activityName, setActivityName] = useState(() => popupInitial?.data.activityName ?? '');
  const [showCustom, setShowCustom] = useState(false);
  const [showPreWarningBanner, setShowPreWarningBanner] = useState(false);

  // interval 이 옛 값을 보지 않도록 진짜 값은 ref 에 둔다(상태는 화면용).
  const totalRef = useRef(totalSeconds);
  const remainingRef = useRef(remaining);
  const stateRef = useRef(state);
  const setTotal = (v: number): void => {
    totalRef.current = v;
    setTotalSecondsState(v);
  };
  const setRemaining = (v: number): void => {
    remainingRef.current = v;
    setRemainingState(v);
  };
  const setState = (v: TimerState): void => {
    stateRef.current = v;
    setStateValue(v);
  };

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const alarmStopRef = useRef<AlarmStopHandle | null>(null);
  const bannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preWarningArmedRef = useRef(false);
  /** 선생님이 시간을 건드렸거나 넘겨받은 상태가 있으면 '마지막 시간'으로 덮지 않는다. */
  const touchedRef = useRef(popupInitial !== null);
  const preWarningRef = useRef(preWarning);
  preWarningRef.current = preWarning;
  const alarmRepeatRef = useRef(alarmRepeat);
  alarmRepeatRef.current = alarmRepeat;
  const activityNameRef = useRef(activityName);
  activityNameRef.current = activityName;

  // ── 마지막으로 시작한 시간 기억(spec 3-3) ────────────────────────
  useEffect(() => {
    void useTimerLocalStore.getState().load();
  }, []);
  useEffect(() => {
    if (!localLoaded || touchedRef.current || stateRef.current !== 'idle') return;
    if (lastDuration === null) return;
    touchedRef.current = true;
    setTotal(lastDuration);
    setRemaining(lastDuration);
  }, [localLoaded, lastDuration]);

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

  const hideBanner = useCallback(() => {
    if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);
    bannerTimeoutRef.current = null;
    setShowPreWarningBanner(false);
  }, []);

  const finish = useCallback(
    (at: number) => {
      clearTick();
      hideBanner();
      setRemaining(0);
      setState('finished');
      setFinishedAt(at);
      stopAlarm();
      alarmStopRef.current = startAlarmSequence(alarmRepeatRef.current, playAlarmOnce);
    },
    [clearTick, hideBanner, stopAlarm, playAlarmOnce],
  );

  const start = useCallback(
    (fromSeconds?: number) => {
      const startRemaining = fromSeconds ?? remainingRef.current;
      if (startRemaining <= 0) return;
      clearTick();
      if (stateRef.current === 'idle') {
        // 새로 시작 — 마지막 시간과 활동 이름을 이 기기에 기억한다.
        void useTimerLocalStore.getState().setLastDuration(totalRef.current);
        const name = activityNameRef.current.trim();
        if (name !== '') void useTimerLocalStore.getState().rememberActivityName(name);
        if (useSoundStore.getState().settings.enabled === false) {
          showToast('소리가 꺼져 있어요. 알람이 울리지 않아요.', 'info');
        }
      }
      touchedRef.current = true;
      setState('running');
      const pw = preWarningRef.current;
      preWarningArmedRef.current =
        pw.enabled && isPreWarningArmed(startRemaining, totalRef.current, pw.secondsBefore);

      let lastTick = Date.now();
      intervalRef.current = setInterval(() => {
        const now = Date.now();
        const delta = Math.floor((now - lastTick) / 1000);
        if (delta < 1) return;
        lastTick = now - ((now - lastTick) % 1000);
        const next = remainingRef.current - delta;
        const threshold = preWarningRef.current.secondsBefore;
        if (preWarningArmedRef.current && next > 0 && next <= threshold) {
          preWarningArmedRef.current = false;
          playPreWarning();
          setShowPreWarningBanner(true);
          if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);
          bannerTimeoutRef.current = setTimeout(() => setShowPreWarningBanner(false), 5000);
        }
        if (next <= 0) {
          finish(now + next * 1000);
          return;
        }
        setRemaining(next);
      }, 100);
    },
    [clearTick, finish, playPreWarning, showToast],
  );

  const pause = useCallback(() => {
    clearTick();
    setState('paused');
  }, [clearTick]);

  /** [확인]·리셋 — 설정 시간으로 되돌리고 알람을 멈춘다. */
  const reset = useCallback(() => {
    clearTick();
    stopAlarm();
    hideBanner();
    setState('idle');
    setRemaining(totalRef.current);
    setFinishedAt(null);
  }, [clearTick, stopAlarm, hideBanner]);

  const toggle = useCallback(() => {
    if (stateRef.current === 'running') pause();
    else if (stateRef.current !== 'finished') start();
  }, [pause, start]);

  const setDuration = useCallback(
    (seconds: number) => {
      clearTick();
      stopAlarm();
      hideBanner();
      touchedRef.current = true;
      const s = clampTimerSeconds(seconds);
      setTotal(s);
      setRemaining(s);
      setState('idle');
      setFinishedAt(null);
    },
    [clearTick, stopAlarm, hideBanner],
  );

  /** ± 조정. 대기 중에는 설정 시간이, 진행·일시정지 중에는 남은·전체 시간이 함께 바뀐다(spec 3-2). */
  const adjust = useCallback(
    (delta: number) => {
      const current = stateRef.current;
      if (current === 'finished') return;
      const cur = remainingRef.current;
      if (!canAdjustSeconds(cur, delta)) return;
      touchedRef.current = true;
      const nextRemaining = cur + delta;
      if (current === 'idle') {
        setTotal(nextRemaining);
        setRemaining(nextRemaining);
        return;
      }
      const nextTotal = clampTimerSeconds(totalRef.current + delta);
      setTotal(Math.max(nextTotal, nextRemaining));
      setRemaining(nextRemaining);
      const pw = preWarningRef.current;
      if (nextRemaining > pw.secondsBefore) {
        // 예고 시점 밖으로 늘렸으면 다시 울릴 수 있게 한다.
        preWarningArmedRef.current =
          pw.enabled &&
          isPreWarningArmed(nextRemaining, Math.max(nextTotal, nextRemaining), pw.secondsBefore);
        hideBanner();
      }
    },
    [hideBanner],
  );

  // ── 쌤도구 팝업 이관 ────────────────────────────────────────────
  // capture 는 **먼저 멈춘다**. 옮기는 동안 이 창에서 알람이 울리지 않고, 소유자가 언제나 한 곳뿐이다.
  const captureForPopup = useCallback((): TimerModeSnapshot => {
    clearTick();
    stopAlarm();
    hideBanner();
    const total = totalRef.current;
    return {
      totalSeconds: total,
      remaining: remainingRef.current,
      state: stateRef.current,
      selectedPreset: timerTool.presets.includes(total) ? total : -1,
      activityName: activityNameRef.current,
      finishedAt,
    };
  }, [clearTick, stopAlarm, hideBanner, timerTool.presets, finishedAt]);

  const applyRestored = useCallback(
    (
      restored: ReturnType<typeof advanceCountdown>,
      snapshot: { readonly totalSeconds: number; readonly activityName?: string },
    ) => {
      clearTick();
      stopAlarm();
      hideBanner();
      setTotal(snapshot.totalSeconds);
      setActivityName(snapshot.activityName ?? '');
      setRemaining(restored.remaining);
      setFinishedAt(restored.finishedAt);
      setState(restored.state);
      if (restored.state === 'running') {
        start(restored.remaining);
      } else if (restored.alarmDueDuringTransfer) {
        // 옮기는 사이에 끝났다 — 이 창에서 한 번만 알린다(보낸 창은 이미 멈췄다).
        alarmStopRef.current = startAlarmSequence(alarmRepeatRef.current, playAlarmOnce);
      }
    },
    [clearTick, stopAlarm, hideBanner, start, playAlarmOnce],
  );

  const resumeFromPopup = useCallback(
    (snapshot: TimerModeSnapshot, capturedAt: number) => {
      touchedRef.current = true;
      applyRestored(
        advanceCountdown(
          {
            state: snapshot.state,
            remaining: snapshot.remaining,
            capturedAt,
            finishedAt: snapshot.finishedAt ?? null,
          },
          Date.now(),
        ),
        snapshot,
      );
    },
    [applyRestored],
  );

  useToolPopupSlot<TimerModeSnapshot>('timer-countdown', {
    capture: captureForPopup,
    resume: resumeFromPopup,
  });

  // 넘겨받은 타이머가 돌고 있었으면 이 창에서 이어서 돌린다. 마운트 때 한 번만.
  useEffect(() => {
    if (restoredInitial === null || popupInitial === null) return;
    applyRestored(restoredInitial, popupInitial.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      clearTick();
      stopAlarm();
      if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);
    },
    [clearTick, stopAlarm],
  );

  // ── 틀에 알리기(탭 배지·화면 이동 안내·창 X·꺼짐 방지) ───────────────
  useReportTimerStatus('timer', {
    busy: state === 'running' || state === 'paused',
    awaitingConfirm: state === 'finished',
    running: state === 'running',
    badge:
      state === 'running' || state === 'paused'
        ? { kind: 'remaining', seconds: remaining }
        : state === 'finished'
          ? { kind: 'finished' }
          : null,
  });

  useTimerModeKeydown(
    'timer',
    (e) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (showCustom) return;
      if (e.key === ' ') {
        e.preventDefault();
        toggle();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        reset();
      } else if (e.key === 'Enter' && stateRef.current === 'finished') {
        e.preventDefault();
        reset();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        adjust(30);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        adjust(-30);
      }
    },
    [toggle, reset, adjust, showCustom],
  );

  // ── 화면 ────────────────────────────────────────────────────────
  const { ref: rowRef, size: rowSize } = useElementSize({ width: 800, height: 400 });
  const narrow = rowSize.width < NARROW_LAYOUT_WIDTH;
  const { stageRef, geometry } = useTimerStageSize(displayStyle);
  const level = getTimerColorLevel(remaining, totalSeconds, warningThresholdSeconds(preWarning));
  const classroomOpen = useIsClassroomOpen('timer');
  const paused = state === 'paused';
  const statusLine =
    state === 'running' ? (
      <span>{endClockTime(Date.now(), remaining)}에 끝나요</span>
    ) : paused ? (
      <span className="inline-flex items-center gap-1.5">
        <span className="material-symbols-outlined text-icon-md">pause_circle</span>
        잠시 멈춤
      </span>
    ) : null;

  const adjustDisabled = (delta: number): boolean =>
    state === 'finished' || !canAdjustSeconds(remaining, delta);

  const confirmButton = (
    <button
      type="button"
      onClick={reset}
      className="px-10 py-4 rounded-xl bg-sp-accent text-sp-accent-fg text-xl font-bold hover:brightness-110 transition"
    >
      확인
    </button>
  );

  return (
    <div className="relative flex flex-col items-center w-full h-full min-h-0 gap-4 rounded-2xl">
      {state === 'finished' && !classroomOpen && (
        <TimerEndOverlay
          finishedAt={finishedAt}
          digitFontSize={geometry.digitFontSize}
          actions={confirmButton}
        />
      )}

      <div className="shrink-0 w-full flex flex-col items-center gap-3">
        <TimerPresetBar
          presets={timerTool.presets}
          currentSeconds={totalSeconds}
          disabled={state === 'running'}
          editable={editable}
          onSelect={setDuration}
          onCustom={() => setShowCustom(true)}
          onChangePresets={(presets) => void updateTimerTool({ presets })}
        />
        <ActivityNameInput
          value={activityName}
          onChange={setActivityName}
          recentNames={recentNames}
        />
      </div>

      <div
        ref={rowRef}
        className={`relative flex-1 min-h-[220px] w-full flex items-center justify-center ${
          narrow ? 'flex-col gap-4' : 'flex-row gap-6'
        }`}
      >
        {!narrow && (
          // 넓은 창: 원 크기는 ± 칸 자리를 뺀 빈 공간으로 잰다. 스테이지를 따로 두어야 ± 칸이 화면 끝이 아니라
          // 원 바로 옆에 붙는다(원 칸이 flex-1 이면 ± 칸이 양 끝으로 밀린다).
          <div
            ref={stageRef}
            aria-hidden="true"
            className="absolute inset-y-0 pointer-events-none"
            style={{ left: WIDE_SIDE_SPACE, right: WIDE_SIDE_SPACE }}
          />
        )}
        {!narrow && (
          <div className="flex flex-col gap-2 shrink-0" style={{ width: ADJUST_COLUMN_WIDTH }}>
            {ADJUST_AMOUNTS.map((a) => (
              <AdjustButton
                key={`minus-${a.seconds}`}
                sign={-1}
                label={a.label}
                seconds={a.seconds}
                disabled={adjustDisabled(-a.seconds)}
                onClick={adjust}
                fill
              />
            ))}
          </div>
        )}
        <div
          ref={narrow ? stageRef : undefined}
          className={
            narrow
              ? 'relative flex-1 min-w-0 min-h-0 w-full h-full flex items-center justify-center'
              : 'relative shrink-0 flex items-center justify-center'
          }
        >
          <div className="relative">
            <TimerDial
              remaining={remaining}
              total={totalSeconds}
              level={level}
              displayStyle={displayStyle}
              geometry={geometry}
              paused={paused}
            />
            {/* 예고 띠는 원 안 숫자 위 빈자리에 — 원 바깥 위에 두면 원 테두리를 가린다. */}
            {showPreWarningBanner && state === 'running' && (
              <div className="absolute left-1/2 top-[16%] -translate-x-1/2 z-30 pointer-events-none">
                <div className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-sp-card border-2 border-sp-warning shadow-lg whitespace-nowrap">
                  <span className="material-symbols-outlined text-sp-warning text-icon-lg">
                    notifications_active
                  </span>
                  <span className="text-sm font-bold text-sp-warning">
                    {remaining >= 60 ? `${Math.ceil(remaining / 60)}분` : `${remaining}초`}{' '}
                    남았어요! 마무리 준비~
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
        {!narrow && (
          <div className="flex flex-col gap-2 shrink-0" style={{ width: ADJUST_COLUMN_WIDTH }}>
            {ADJUST_AMOUNTS.map((a) => (
              <AdjustButton
                key={`plus-${a.seconds}`}
                sign={1}
                label={a.label}
                seconds={a.seconds}
                disabled={adjustDisabled(a.seconds)}
                onClick={adjust}
                fill
              />
            ))}
          </div>
        )}
        {narrow && (
          <div className="grid grid-cols-4 gap-1.5 w-full max-w-[360px] shrink-0 px-2">
            {[...ADJUST_AMOUNTS].reverse().map((a) => (
              <AdjustButton
                key={`minus-${a.seconds}`}
                sign={-1}
                label={a.label}
                seconds={a.seconds}
                disabled={adjustDisabled(-a.seconds)}
                onClick={adjust}
                compact
              />
            ))}
            {ADJUST_AMOUNTS.map((a) => (
              <AdjustButton
                key={`plus-${a.seconds}`}
                sign={1}
                label={a.label}
                seconds={a.seconds}
                disabled={adjustDisabled(a.seconds)}
                onClick={adjust}
                compact
              />
            ))}
          </div>
        )}
      </div>

      <p className="shrink-0 h-6 text-sm text-sp-muted flex items-center" aria-live="polite">
        {statusLine}
      </p>

      <div className="shrink-0 flex items-center gap-6">
        <button
          type="button"
          onClick={reset}
          disabled={state === 'idle'}
          className="w-16 h-16 rounded-full bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent transition-colors flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
          title="처음으로 (R)"
          aria-label="처음으로"
        >
          <span className="material-symbols-outlined text-[28px]">restart_alt</span>
        </button>
        <button
          type="button"
          onClick={toggle}
          disabled={state === 'finished' || remaining <= 0}
          className="w-20 h-20 rounded-full bg-sp-accent text-sp-accent-fg flex items-center justify-center hover:brightness-110 transition shadow-lg disabled:opacity-30 disabled:cursor-not-allowed"
          title={state === 'running' ? '잠시 멈춤 (Space)' : '시작 (Space)'}
          aria-label={state === 'running' ? '잠시 멈춤' : '시작'}
        >
          <span className="material-symbols-outlined text-4xl">
            {state === 'running' ? 'pause' : 'play_arrow'}
          </span>
        </button>
        <div className="w-16 h-16" />
      </div>

      {/* 도는 동안에는 숨기되 자리는 남긴다 — 시작할 때 원이 밀려 움직이지 않게. */}
      <div
        className={`shrink-0 w-full ${state !== 'running' ? '' : 'invisible'}`}
        aria-hidden={state !== 'running' ? undefined : true}
      >
        <TimerSoundSettings preWarning="timer" showRepeat />
      </div>

      {showCustom && (
        <CustomTimeModal
          initialSeconds={totalSeconds}
          onConfirm={(seconds) => {
            setShowCustom(false);
            setDuration(seconds);
          }}
          onClose={() => setShowCustom(false)}
        />
      )}

      {classroomOpen && shell !== null && (
        <ClassroomOverlay
          onExit={shell.closeClassroom}
          displayStyle={displayStyle}
          top={
            activityName.trim() !== '' ? (
              <p className="text-3xl md:text-5xl font-bold text-sp-text">{activityName}</p>
            ) : undefined
          }
          bottom={statusLine ?? undefined}
          renderStage={(g) => (
            <TimerDial
              remaining={remaining}
              total={totalSeconds}
              level={level}
              displayStyle={displayStyle}
              geometry={g}
              paused={paused}
            />
          )}
          pause={state === 'finished' ? null : { paused: state !== 'running', onToggle: toggle }}
          overlay={
            state === 'finished' ? (
              <TimerEndOverlay finishedAt={finishedAt} digitFontSize={96} actions={confirmButton} />
            ) : undefined
          }
        />
      )}
    </div>
  );
}
