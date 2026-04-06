import type { KeyboardShortcut } from '../types';

export type Tab = 'timer' | 'stopwatch' | 'presentation';
export type TimerState = 'idle' | 'running' | 'paused' | 'finished';
export type StopwatchState = 'idle' | 'running' | 'paused';

export interface LapRecord {
  index: number;
  elapsed: number;
  diff: number;
}

export const PRESETS = [
  { label: '1분', seconds: 60 },
  { label: '3분', seconds: 180 },
  { label: '5분', seconds: 300 },
  { label: '10분', seconds: 600 },
  { label: '15분', seconds: 900 },
  { label: '30분', seconds: 1800 },
];

export type { KeyboardShortcut };
