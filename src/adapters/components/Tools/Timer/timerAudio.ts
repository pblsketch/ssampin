import type { AlarmSoundId, PreWarningSoundId } from '@domain/entities/Settings';

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

function createCtx(): AudioContext {
  return new AudioContext();
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
  } catch { /* Audio not supported */ }
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
  } catch { /* Audio not supported */ }
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
  } catch { /* Audio not supported */ }
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
  } catch { /* Audio not supported */ }
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
  } catch { /* Audio not supported */ }
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
  } catch { /* Audio not supported */ }
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
  } catch { /* Audio not supported */ }
}

function playCustomAudio(dataUrl: string, volume: number, boost: number): void {
  try {
    const audio = new Audio(dataUrl);
    if (boost > 1) {
      const ctx = new AudioContext();
      const source = ctx.createMediaElementSource(audio);
      const gain = createBoostedGain(ctx, volume, boost);
      source.connect(gain);
      audio.play();
      audio.addEventListener('ended', () => ctx.close());
    } else {
      audio.volume = volume;
      audio.play();
    }
  } catch { /* Audio not supported */ }
}

// ─── 디스패처 ─────────────────────────────────────────────

export function playPreWarningSound(soundId: PreWarningSoundId, volume: number, boost: number): void {
  switch (soundId) {
    case 'gentle-chime': playGentleChime(volume * 0.6, boost); break;
    case 'soft-bell': playSoftBell(volume, boost); break;
    case 'tick-tock': playTickTock(volume, boost); break;
  }
}

export function playAlarmSound(
  soundId: AlarmSoundId,
  volume: number,
  boost: number,
  customDataUrl: string | null,
): void {
  switch (soundId) {
    case 'beep': playBeep(volume, boost); break;
    case 'school-bell': playSchoolBell(volume, boost); break;
    case 'alarm-clock': playAlarmClock(volume, boost); break;
    case 'gentle-chime': playGentleChime(volume, boost); break;
    case 'buzzer': playBuzzer(volume, boost); break;
    case 'custom':
      if (customDataUrl) playCustomAudio(customDataUrl, volume, boost);
      else playBeep(volume, boost);
      break;
  }
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
