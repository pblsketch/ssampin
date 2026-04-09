export interface SoundSettings {
  enabled: boolean;
  volume: number; // 0.0~1.0
}

export interface ToolSoundConfig {
  toolId: string;
  progressSound: string;   // public/sounds/ relative path
  resultSound: string;
  progressLoop: boolean;
  fadeDuration: number;     // ms
}

export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  enabled: true,
  volume: 0.75,
};

export const TOOL_SOUND_MAP: Record<string, ToolSoundConfig> = {
  random: {
    toolId: 'random',
    progressSound: '/sounds/draw-progress.wav',
    resultSound: '/sounds/draw-result.wav',
    progressLoop: true,
    fadeDuration: 100,
  },
  coin: {
    toolId: 'coin',
    progressSound: '/sounds/coin-spin.wav',
    resultSound: '/sounds/coin-land.wav',
    progressLoop: false,
    fadeDuration: 100,
  },
  dice: {
    toolId: 'dice',
    progressSound: '/sounds/dice-roll.wav',
    resultSound: '/sounds/dice-stop.wav',
    progressLoop: false,
    fadeDuration: 100,
  },
  roulette: {
    toolId: 'roulette',
    progressSound: '/sounds/roulette-spin.wav',
    resultSound: '/sounds/roulette-stop.wav',
    progressLoop: false,
    fadeDuration: 100,
  },
  seatPicker: {
    toolId: 'seatPicker',
    progressSound: '',
    resultSound: '/sounds/seat-assign.wav',
    progressLoop: false,
    fadeDuration: 0,
  },
  trafficLight: {
    toolId: 'trafficLight',
    progressSound: '',
    resultSound: '/sounds/traffic-beep.wav',
    progressLoop: false,
    fadeDuration: 0,
  },
  workSymbols: {
    toolId: 'workSymbols',
    progressSound: '',
    resultSound: '/sounds/symbol-switch.wav',
    progressLoop: false,
    fadeDuration: 0,
  },
};
