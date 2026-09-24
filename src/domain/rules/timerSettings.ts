/**
 * 쌤도구 타이머 설정 — 기본값과 합치고 범위 밖 값을 바로잡는다(ADR-139).
 *
 * settings 파일은 옛 버전·다른 기기가 쓴 값일 수 있다. 읽을 때마다 이 함수를 거쳐
 * 화면이 범위 밖 값(프리셋 0개, 99:59 초과, 이름 없는 순서)을 만나지 않게 한다.
 */
import type {
  PresentationPreWarningSettings,
  TimerAlarmRepeat,
  TimerDisplayStyle,
  TimerStepDefinition,
  TimerStepSequence,
  TimerToolSettings,
} from '../entities/Settings';
import { MAX_TIMER_SECONDS } from './timerRules';

export const DEFAULT_TIMER_PRESETS: readonly number[] = [60, 180, 300, 600, 900, 1800];
export const MAX_TIMER_PRESETS = 8;
export const MIN_PRESET_SECONDS = 5;
export const MIN_STEP_SECONDS = 5;
export const MAX_STEPS = 20;
export const MAX_STEP_SEQUENCES = 20;
export const MAX_STEP_REPEAT = 10;
export const MAX_TIMER_NAME_LENGTH = 20;
export const PRESENTATION_PRE_WARNING_TIMES = [10, 30, 60] as const;

export const DEFAULT_PRESENTATION_PRE_WARNING: PresentationPreWarningSettings = {
  enabled: true,
  secondsBefore: 30,
};

export const DEFAULT_TIMER_TOOL_SETTINGS: TimerToolSettings = {
  presets: DEFAULT_TIMER_PRESETS,
  displayStyle: 'ring',
  alarmRepeat: 'once',
  presentationPreWarning: DEFAULT_PRESENTATION_PRE_WARNING,
  stepSequences: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidSeconds(value: unknown, min: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= min &&
    value <= MAX_TIMER_SECONDS
  );
}

/** 이름을 앞뒤 공백 없이 20자로 자른다. */
export function trimTimerName(name: string): string {
  return Array.from(name.trim()).slice(0, MAX_TIMER_NAME_LENGTH).join('');
}

/**
 * 프리셋 목록을 바로잡는다 — 5초~99:59 정수만, 중복 없이, 짧은 순, 최대 8개.
 * 남는 것이 없으면 기본 목록을 쓴다.
 */
export function normalizePresets(raw: unknown): readonly number[] {
  if (!Array.isArray(raw)) return DEFAULT_TIMER_PRESETS;
  const valid = raw.filter((v): v is number => isValidSeconds(v, MIN_PRESET_SECONDS));
  const unique = Array.from(new Set(valid))
    .sort((a, b) => a - b)
    .slice(0, MAX_TIMER_PRESETS);
  return unique.length > 0 ? unique : DEFAULT_TIMER_PRESETS;
}

/** 프리셋 하나를 더할 수 있는가(범위·중복·개수). */
export function canAddPreset(presets: readonly number[], seconds: number): boolean {
  return (
    isValidSeconds(seconds, MIN_PRESET_SECONDS) &&
    !presets.includes(seconds) &&
    presets.length < MAX_TIMER_PRESETS
  );
}

/** 프리셋 하나를 더한 목록(짧은 순). 더할 수 없으면 그대로. */
export function addPreset(presets: readonly number[], seconds: number): readonly number[] {
  if (!canAddPreset(presets, seconds)) return presets;
  return [...presets, seconds].sort((a, b) => a - b);
}

/** 프리셋 하나를 뺀 목록. 마지막 하나는 빼지 않는다(1개 이상 유지). */
export function removePreset(presets: readonly number[], seconds: number): readonly number[] {
  if (presets.length <= 1) return presets;
  return presets.filter((p) => p !== seconds);
}

function normalizeDisplayStyle(raw: unknown): TimerDisplayStyle {
  return raw === 'pie' ? 'pie' : 'ring';
}

function normalizeAlarmRepeat(raw: unknown): TimerAlarmRepeat {
  return raw === 'three' || raw === 'untilConfirm' ? raw : 'once';
}

function normalizePresentationPreWarning(raw: unknown): PresentationPreWarningSettings {
  if (!isRecord(raw)) return DEFAULT_PRESENTATION_PRE_WARNING;
  const enabled =
    typeof raw['enabled'] === 'boolean' ? raw['enabled'] : DEFAULT_PRESENTATION_PRE_WARNING.enabled;
  const seconds = raw['secondsBefore'];
  const secondsBefore = (PRESENTATION_PRE_WARNING_TIMES as readonly unknown[]).includes(seconds)
    ? (seconds as PresentationPreWarningSettings['secondsBefore'])
    : DEFAULT_PRESENTATION_PRE_WARNING.secondsBefore;
  return { enabled, secondsBefore };
}

function normalizeStep(raw: unknown, index: number): TimerStepDefinition | null {
  if (!isRecord(raw)) return null;
  if (!isValidSeconds(raw['seconds'], MIN_STEP_SECONDS)) return null;
  const id = typeof raw['id'] === 'string' && raw['id'] !== '' ? raw['id'] : `step-${index + 1}`;
  const name = typeof raw['name'] === 'string' ? trimTimerName(raw['name']) : '';
  return { id, name, seconds: raw['seconds'] };
}

/** 반복 2 이상·단계 2개 이상일 때만 "마지막 단계 건너뛰기"를 켤 수 있다. */
export function canSkipLastStep(stepCount: number, repeat: number): boolean {
  return stepCount >= 2 && repeat >= 2;
}

/** 저장된 순서 하나를 바로잡는다. 이름이나 쓸 수 있는 단계가 없으면 버린다(null). */
export function normalizeStepSequence(raw: unknown): TimerStepSequence | null {
  if (!isRecord(raw)) return null;
  const name = typeof raw['name'] === 'string' ? trimTimerName(raw['name']) : '';
  if (name === '') return null;
  if (typeof raw['id'] !== 'string' || raw['id'] === '') return null;
  const rawSteps = Array.isArray(raw['steps']) ? raw['steps'] : [];
  const steps = rawSteps
    .map((s, i) => normalizeStep(s, i))
    .filter((s): s is TimerStepDefinition => s !== null)
    .slice(0, MAX_STEPS);
  if (steps.length === 0) return null;
  const rawRepeat = raw['repeat'];
  const repeat =
    typeof rawRepeat === 'number' && Number.isInteger(rawRepeat)
      ? Math.min(MAX_STEP_REPEAT, Math.max(1, rawRepeat))
      : 1;
  const skipLastStepOnFinalRound =
    raw['skipLastStepOnFinalRound'] === true && canSkipLastStep(steps.length, repeat);
  return { id: raw['id'], name, steps, repeat, skipLastStepOnFinalRound };
}

/**
 * settings 파일의 `timerTool` 값을 기본값과 합치고 범위 안으로 바로잡는다.
 * 값이 없거나 모양이 틀리면 기본값을 쓴다.
 */
export function normalizeTimerToolSettings(raw: unknown): TimerToolSettings {
  if (!isRecord(raw)) return DEFAULT_TIMER_TOOL_SETTINGS;
  const rawSequences = Array.isArray(raw['stepSequences']) ? raw['stepSequences'] : [];
  const seen = new Set<string>();
  const stepSequences: TimerStepSequence[] = [];
  for (const candidate of rawSequences) {
    const sequence = normalizeStepSequence(candidate);
    if (sequence === null || seen.has(sequence.id)) continue;
    seen.add(sequence.id);
    stepSequences.push(sequence);
    if (stepSequences.length >= MAX_STEP_SEQUENCES) break;
  }
  return {
    presets: normalizePresets(raw['presets']),
    displayStyle: normalizeDisplayStyle(raw['displayStyle']),
    alarmRepeat: normalizeAlarmRepeat(raw['alarmRepeat']),
    presentationPreWarning: normalizePresentationPreWarning(raw['presentationPreWarning']),
    stepSequences,
  };
}
