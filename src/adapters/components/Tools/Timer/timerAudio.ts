import type { AlarmSoundId, PreWarningSoundId, TimerAlarmRepeat } from '@domain/entities/Settings';
import { useSoundStore } from '@adapters/stores/useSoundStore';

// ─── 알람음 프리셋 정보 ───────────────────────────────────
export interface AlarmPreset {
  id: AlarmSoundId;
  label: string;
  icon: string;
  description: string;
}

export const ALARM_PRESETS: AlarmPreset[] = [
  { id: 'beep', label: '기본 알림', icon: 'notifications', description: '삐삐삐' },
  { id: 'school-bell', label: '학교 종', icon: 'school', description: '댕동댕동' },
  { id: 'alarm-clock', label: '알람 시계', icon: 'alarm', description: '따르릉' },
  { id: 'gentle-chime', label: '부드러운 차임', icon: 'music_note', description: '도미솔도~' },
  { id: 'buzzer', label: '버저', icon: 'campaign', description: '부우우~' },
];

// ─── 예고 알림 프리셋 정보 ────────────────────────────────────
export interface PreWarningPreset {
  id: PreWarningSoundId;
  label: string;
  icon: string;
  description: string;
}

export const PRE_WARNING_PRESETS: PreWarningPreset[] = [
  { id: 'gentle-chime', label: '부드러운 차임', icon: 'music_note', description: '도미솔~' },
  { id: 'soft-bell', label: '작은 종소리', icon: 'notifications_none', description: '딩~' },
  { id: 'tick-tock', label: '째깍째깍', icon: 'timer', description: '똑딱똑딱' },
];

export const PRE_WARNING_TIMES = [30, 60, 120, 180] as const;

export const BOOST_OPTIONS = [1, 2, 3, 4] as const;

// ─── Web Audio 합성 함수들 ─────────────────────────────────

// ─── 재생 중인 소리 추적 ────────────────────────────────────
// 🔊 음소거를 켜는 순간 이미 울리던 소리도 멈춰야 하고(긴 '내 파일' 알람 포함),
// 반복 알람은 [확인]·리셋·다음으로 넘김·팝업 이관 때 즉시 멈춰야 한다(ADR-139).
// 그래서 만든 AudioContext·Audio 를 모두 모아 두었다가 한 번에 멈춘다.

const activeContexts = new Set<AudioContext>();
const activeAudioElements = new Set<HTMLAudioElement>();

function createCtx(): AudioContext {
  const ctx = new AudioContext();
  activeContexts.add(ctx);
  const originalClose = ctx.close.bind(ctx);
  ctx.close = () => {
    activeContexts.delete(ctx);
    return ctx.state === 'closed' ? Promise.resolve() : originalClose();
  };
  return ctx;
}

/** 지금 울리고 있는 소리만 멈춘다(예약된 반복은 그대로). */
function stopPlayingSounds(): void {
  for (const ctx of Array.from(activeContexts)) {
    try {
      void ctx.close();
    } catch {
      /* 이미 닫혔다 */
    }
  }
  activeContexts.clear();
  for (const audio of Array.from(activeAudioElements)) {
    try {
      audio.pause();
    } catch {
      /* ignore */
    }
  }
  activeAudioElements.clear();
}

/** 지금 울리는 타이머 소리와 예약된 반복 알람을 모두 멈춘다(🔊 음소거 때). */
export function stopAllTimerSounds(): void {
  for (const stop of Array.from(activeSequences)) stop();
  stopPlayingSounds();
}

/** 🔊 가 꺼져 있는가. 꺼져 있으면 알람·예고·전환음을 울리지 않는다(미리듣기는 예외). */
export function isToolSoundMuted(): boolean {
  return !useSoundStore.getState().settings.enabled;
}

let muteWatcherInstalled = false;
function installMuteWatcher(): void {
  if (muteWatcherInstalled) return;
  muteWatcherInstalled = true;
  useSoundStore.subscribe((state, prev) => {
    if (prev.settings.enabled && !state.settings.enabled) stopAllTimerSounds();
  });
}

function createBoostedGain(ctx: AudioContext, volume: number, boost: number): GainNode {
  const gain = ctx.createGain();
  gain.gain.value = volume * boost;

  if (boost > 1) {
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -6;
    compressor.ratio.value = 4;
    compressor.knee.value = 10;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;
    gain.connect(compressor);
    compressor.connect(ctx.destination);
  } else {
    gain.connect(ctx.destination);
  }

  return gain;
}

function playBeep(volume: number, boost: number): void {
  try {
    const ctx = createCtx();
    const gain = createBoostedGain(ctx, volume, boost);

    const playOne = (delay: number) => {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 880;
      osc.connect(gain);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.2);
    };
    playOne(0);
    playOne(0.4);
    playOne(0.8);

    setTimeout(() => ctx.close(), 1500);
  } catch {
    /* Audio not supported */
  }
}

function playSchoolBell(volume: number, boost: number): void {
  try {
    const ctx = createCtx();
    const gain = createBoostedGain(ctx, volume * 0.7, boost);

    const notes = [523, 659, 523, 659];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      const env = ctx.createGain();
      env.gain.setValueAtTime(0, ctx.currentTime + i * 0.5);
      env.gain.linearRampToValueAtTime(1, ctx.currentTime + i * 0.5 + 0.05);
      env.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.5 + 0.45);

      osc.connect(env);
      env.connect(gain);
      osc.start(ctx.currentTime + i * 0.5);
      osc.stop(ctx.currentTime + i * 0.5 + 0.5);
    });

    setTimeout(() => ctx.close(), 3000);
  } catch {
    /* Audio not supported */
  }
}

function playAlarmClock(volume: number, boost: number): void {
  try {
    const ctx = createCtx();
    const gain = createBoostedGain(ctx, volume * 0.6, boost);

    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < 4; i++) {
        const t = round * 1.0 + i * 0.2;
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = i % 2 === 0 ? 1000 : 800;
        osc.connect(gain);
        osc.start(ctx.currentTime + t);
        osc.stop(ctx.currentTime + t + 0.1);
      }
    }

    setTimeout(() => ctx.close(), 3000);
  } catch {
    /* Audio not supported */
  }
}

function playGentleChime(volume: number, boost: number): void {
  try {
    const ctx = createCtx();
    const gain = createBoostedGain(ctx, volume * 0.5, boost);

    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      const env = ctx.createGain();
      env.gain.setValueAtTime(0, ctx.currentTime + i * 0.35);
      env.gain.linearRampToValueAtTime(1, ctx.currentTime + i * 0.35 + 0.05);
      env.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.35 + 0.6);

      osc.connect(env);
      env.connect(gain);
      osc.start(ctx.currentTime + i * 0.35);
      osc.stop(ctx.currentTime + i * 0.35 + 0.7);
    });

    setTimeout(() => ctx.close(), 3000);
  } catch {
    /* Audio not supported */
  }
}

function playBuzzer(volume: number, boost: number): void {
  try {
    const ctx = createCtx();
    const gain = createBoostedGain(ctx, volume * 0.4, boost);

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 220;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, ctx.currentTime);
    env.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.1);
    env.gain.setValueAtTime(1, ctx.currentTime + 1.2);
    env.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5);

    osc.connect(env);
    env.connect(gain);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 1.5);

    setTimeout(() => ctx.close(), 2500);
  } catch {
    /* Audio not supported */
  }
}

// ─── 예고 알림음 ─────────────────────────────────────────────

function playSoftBell(volume: number, boost: number): void {
  try {
    const ctx = createCtx();
    const gain = createBoostedGain(ctx, volume * 0.4, boost);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 523;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, ctx.currentTime);
    env.gain.linearRampToValueAtTime(0.8, ctx.currentTime + 0.05);
    env.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.5);

    osc.connect(env);
    env.connect(gain);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 1.5);

    setTimeout(() => ctx.close(), 2000);
  } catch {
    /* Audio not supported */
  }
}

function playTickTock(volume: number, boost: number): void {
  try {
    const ctx = createCtx();
    const gain = createBoostedGain(ctx, volume * 0.3, boost);

    for (let i = 0; i < 4; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = i % 2 === 0 ? 800 : 600;

      const env = ctx.createGain();
      env.gain.setValueAtTime(0, ctx.currentTime + i * 0.4);
      env.gain.linearRampToValueAtTime(0.6, ctx.currentTime + i * 0.4 + 0.02);
      env.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.4 + 0.15);

      osc.connect(env);
      env.connect(gain);
      osc.start(ctx.currentTime + i * 0.4);
      osc.stop(ctx.currentTime + i * 0.4 + 0.2);
    }

    setTimeout(() => ctx.close(), 2500);
  } catch {
    /* Audio not supported */
  }
}

function playCustomAudio(dataUrl: string, volume: number, boost: number): void {
  try {
    const audio = new Audio(dataUrl);
    activeAudioElements.add(audio);
    audio.addEventListener('ended', () => activeAudioElements.delete(audio));
    if (boost > 1) {
      const ctx = createCtx();
      const source = ctx.createMediaElementSource(audio);
      const gain = createBoostedGain(ctx, volume, boost);
      source.connect(gain);
      void audio.play();
      audio.addEventListener('ended', () => void ctx.close());
    } else {
      audio.volume = volume;
      void audio.play();
    }
  } catch {
    /* Audio not supported */
  }
}

// ─── 단계 전환음 ─────────────────────────────────────────────

/** 단계 타이머에서 다음 단계로 넘어갈 때의 짧은 소리(두 음). */
function playStepChime(volume: number, boost: number): void {
  try {
    const ctx = createCtx();
    const gain = createBoostedGain(ctx, volume * 0.45, boost);
    [784, 1047].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const env = ctx.createGain();
      const t = ctx.currentTime + i * 0.18;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(1, t + 0.03);
      env.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
      osc.connect(env);
      env.connect(gain);
      osc.start(t);
      osc.stop(t + 0.45);
    });
    setTimeout(() => void ctx.close(), 1200);
  } catch {
    /* Audio not supported */
  }
}

// ─── 디스패처 ─────────────────────────────────────────────

interface PlayOptions {
  /**
   * 🔊 음소거와 관계없이 울린다. 알람음 패널의 **미리듣기**처럼 선생님이 직접 누른 소리에만 쓴다.
   */
  readonly ignoreMute?: boolean;
}

export function playPreWarningSound(
  soundId: PreWarningSoundId,
  volume: number,
  boost: number,
  options: PlayOptions = {},
): void {
  installMuteWatcher();
  if (!options.ignoreMute && isToolSoundMuted()) return;
  switch (soundId) {
    case 'gentle-chime':
      playGentleChime(volume * 0.6, boost);
      break;
    case 'soft-bell':
      playSoftBell(volume, boost);
      break;
    case 'tick-tock':
      playTickTock(volume, boost);
      break;
  }
}

export function playAlarmSound(
  soundId: AlarmSoundId,
  volume: number,
  boost: number,
  customDataUrl: string | null,
  options: PlayOptions = {},
): void {
  installMuteWatcher();
  if (!options.ignoreMute && isToolSoundMuted()) return;
  switch (soundId) {
    case 'beep':
      playBeep(volume, boost);
      break;
    case 'school-bell':
      playSchoolBell(volume, boost);
      break;
    case 'alarm-clock':
      playAlarmClock(volume, boost);
      break;
    case 'gentle-chime':
      playGentleChime(volume, boost);
      break;
    case 'buzzer':
      playBuzzer(volume, boost);
      break;
    case 'custom':
      if (customDataUrl) playCustomAudio(customDataUrl, volume, boost);
      else playBeep(volume, boost);
      break;
  }
}

/** 단계 타이머 전환음. 🔊 음소거를 따른다. */
export function playStepTransitionSound(volume: number, boost: number): void {
  installMuteWatcher();
  if (isToolSoundMuted()) return;
  playStepChime(volume, boost);
}

// ─── 종료 알람 반복 ─────────────────────────────────────────

/** '확인할 때까지' 반복 간격(ms). 조정 가능. */
export const ALARM_REPEAT_INTERVAL_MS = 3000;
/** '확인할 때까지'가 스스로 멈추는 한도(ms). 조정 가능. */
export const ALARM_REPEAT_MAX_MS = 5 * 60 * 1000;

const activeSequences = new Set<() => void>();

/** 반복 알람을 멈추는 손잡이. 여러 번 불러도 안전하다. */
export type AlarmStopHandle = () => void;

/**
 * 종료 알람을 반복 설정대로 울린다. 돌려받은 함수를 부르면 **즉시** 멈춘다
 * ([확인]·리셋·다음으로 넘김·팝업 이관·화면이 사라질 때).
 * 🔊 가 꺼지면 스스로 멈춘다.
 */
export function startAlarmSequence(repeat: TimerAlarmRepeat, play: () => void): AlarmStopHandle {
  installMuteWatcher();
  const timers: ReturnType<typeof setTimeout>[] = [];
  let stopped = false;
  const stop: AlarmStopHandle = () => {
    if (stopped) return;
    stopped = true;
    for (const t of timers) clearTimeout(t);
    activeSequences.delete(stop);
  };
  activeSequences.add(stop);

  const playIfLive = (): void => {
    if (!stopped) play();
  };
  playIfLive();

  if (repeat === 'three') {
    timers.push(setTimeout(playIfLive, ALARM_REPEAT_INTERVAL_MS));
    timers.push(
      setTimeout(() => {
        playIfLive();
        activeSequences.delete(stop);
      }, ALARM_REPEAT_INTERVAL_MS * 2),
    );
  } else if (repeat === 'untilConfirm') {
    const count = Math.floor(ALARM_REPEAT_MAX_MS / ALARM_REPEAT_INTERVAL_MS);
    for (let i = 1; i <= count; i += 1) {
      timers.push(setTimeout(playIfLive, ALARM_REPEAT_INTERVAL_MS * i));
    }
    timers.push(setTimeout(stop, ALARM_REPEAT_MAX_MS + 1));
  } else {
    activeSequences.delete(stop);
  }
  return () => {
    stop();
    stopPlayingSounds();
  };
}

// ─── 커스텀 오디오 저장/로드 유틸 ────────────────────────────

export async function saveCustomAudio(name: string, dataUrl: string): Promise<void> {
  const json = JSON.stringify({ name, dataUrl });
  const api = window.electronAPI;
  if (api) {
    await api.writeData('custom-alarm', json);
  } else {
    localStorage.setItem('ssampin_custom-alarm', json);
  }
}

export async function loadCustomAudio(): Promise<{ name: string; dataUrl: string } | null> {
  const api = window.electronAPI;
  let raw: string | null = null;
  if (api) {
    raw = await api.readData('custom-alarm');
  } else {
    raw = localStorage.getItem('ssampin_custom-alarm');
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { name: string; dataUrl: string };
  } catch {
    return null;
  }
}

export async function deleteCustomAudio(): Promise<void> {
  const api = window.electronAPI;
  if (api) {
    await api.writeData('custom-alarm', '');
  } else {
    localStorage.removeItem('ssampin_custom-alarm');
  }
}
