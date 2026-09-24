import type { TimerStepDefinition } from '@domain/entities/Settings';
import { MAX_TIMER_SECONDS } from '@domain/rules/timerRules';
import {
  canSkipLastStep,
  MAX_STEP_REPEAT,
  MAX_STEPS,
  MAX_TIMER_NAME_LENGTH,
  MIN_STEP_SECONDS,
} from '@domain/rules/timerSettings';
import { TimerSwitch } from './TimerControls';

/**
 * 단계 타이머 순서 만들기(ADR-139, spec 7-1, 설계 10-1).
 * 순서 이름 · 단계(이름·분·초·위아래·삭제) · 단계 추가 · 반복 · 마지막 단계 건너뛰기.
 */

export interface StepDraft {
  /** 저장된 순서면 그 id, 새 순서면 null. */
  readonly id: string | null;
  readonly name: string;
  readonly steps: readonly TimerStepDefinition[];
  readonly repeat: number;
  readonly skipLastStepOnFinalRound: boolean;
  /** 예시에서 연 순서(저장하면 내 순서가 된다). */
  readonly fromExample?: boolean;
}

let stepSeq = 0;
export function newStepId(): string {
  stepSeq += 1;
  return `step-${Date.now()}-${stepSeq}`;
}

/** 조건이 깨지면 '마지막 단계 건너뛰기'는 저절로 꺼진다(spec 7-1). */
export function fixDraft(draft: StepDraft): StepDraft {
  const skip = draft.skipLastStepOnFinalRound && canSkipLastStep(draft.steps.length, draft.repeat);
  return skip === draft.skipLastStepOnFinalRound
    ? draft
    : { ...draft, skipLastStepOnFinalRound: skip };
}

export function isStepValid(step: TimerStepDefinition): boolean {
  return step.seconds >= MIN_STEP_SECONDS && step.seconds <= MAX_TIMER_SECONDS;
}

function NumberCell({
  value,
  max,
  label,
  onChange,
}: {
  readonly value: number;
  readonly max: number;
  readonly label: string;
  readonly onChange: (v: number) => void;
}): JSX.Element {
  return (
    <label className="flex items-center gap-1">
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        value={value}
        aria-label={label}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          onChange(Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0);
        }}
        className="w-14 px-1.5 py-1.5 bg-sp-bg border border-sp-border rounded-lg text-center text-sm font-mono text-sp-text focus:border-sp-accent focus:outline-none"
      />
      <span className="text-xs text-sp-muted">{label}</span>
    </label>
  );
}

export function StepSequenceEditor({
  draft,
  onChange,
}: {
  readonly draft: StepDraft;
  readonly onChange: (next: StepDraft) => void;
}): JSX.Element {
  const update = (patch: Partial<StepDraft>): void => onChange(fixDraft({ ...draft, ...patch }));
  const setStep = (index: number, patch: Partial<TimerStepDefinition>): void =>
    update({ steps: draft.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
  const move = (index: number, dir: -1 | 1): void => {
    const target = index + dir;
    if (target < 0 || target >= draft.steps.length) return;
    const next = [...draft.steps];
    [next[index], next[target]] = [next[target]!, next[index]!];
    update({ steps: next });
  };
  const showSkip = canSkipLastStep(draft.steps.length, draft.repeat);

  return (
    <div className="w-full max-w-2xl flex flex-col gap-3">
      <input
        type="text"
        value={draft.name}
        maxLength={MAX_TIMER_NAME_LENGTH}
        onChange={(e) => update({ name: e.target.value })}
        placeholder="순서 이름 (예: 생각-짝-나누기)"
        aria-label="순서 이름"
        className="w-full px-4 py-2.5 bg-sp-bg border border-sp-border rounded-xl text-lg font-bold text-sp-text placeholder:text-sp-muted placeholder:font-normal focus:border-sp-accent focus:outline-none"
      />
      <ol className="flex flex-col gap-2">
        {draft.steps.map((step, index) => {
          const minutes = Math.floor(step.seconds / 60);
          const seconds = step.seconds % 60;
          const invalid = !isStepValid(step);
          return (
            <li
              key={step.id}
              className={`flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-sp-card border ${
                invalid ? 'border-sp-error' : 'border-sp-border'
              }`}
            >
              <span className="w-6 text-center text-xs text-sp-muted tabular-nums">
                {index + 1}
              </span>
              <input
                type="text"
                value={step.name}
                maxLength={MAX_TIMER_NAME_LENGTH}
                onChange={(e) => setStep(index, { name: e.target.value })}
                placeholder={`${index + 1}단계`}
                aria-label={`${index + 1}단계 이름`}
                className="flex-1 min-w-[120px] px-2.5 py-1.5 bg-sp-bg border border-sp-border rounded-lg text-sm text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none"
              />
              <NumberCell
                value={minutes}
                max={99}
                label="분"
                onChange={(m) => setStep(index, { seconds: m * 60 + seconds })}
              />
              <NumberCell
                value={seconds}
                max={59}
                label="초"
                onChange={(sec) => setStep(index, { seconds: minutes * 60 + sec })}
              />
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={`${index + 1}단계를 위로`}
                  className="p-1 rounded text-sp-muted hover:text-sp-text disabled:opacity-30"
                >
                  <span className="material-symbols-outlined text-icon-md">keyboard_arrow_up</span>
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === draft.steps.length - 1}
                  aria-label={`${index + 1}단계를 아래로`}
                  className="p-1 rounded text-sp-muted hover:text-sp-text disabled:opacity-30"
                >
                  <span className="material-symbols-outlined text-icon-md">
                    keyboard_arrow_down
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => update({ steps: draft.steps.filter((_, i) => i !== index) })}
                  disabled={draft.steps.length <= 1}
                  aria-label={`${index + 1}단계 삭제`}
                  className="p-1 rounded text-sp-muted hover:text-sp-error disabled:opacity-30"
                >
                  <span className="material-symbols-outlined text-icon-md">close</span>
                </button>
              </div>
              {invalid && (
                <p className="w-full text-xs text-sp-error pl-8">
                  5초부터 99분 59초까지 정할 수 있어요
                </p>
              )}
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        onClick={() =>
          update({ steps: [...draft.steps, { id: newStepId(), name: '', seconds: 60 }] })
        }
        disabled={draft.steps.length >= MAX_STEPS}
        className="w-full py-2.5 rounded-xl border border-dashed border-sp-border text-sm text-sp-muted hover:text-sp-text hover:border-sp-accent disabled:opacity-40 flex items-center justify-center gap-1"
      >
        <span className="material-symbols-outlined text-icon-md">add</span>
        {draft.steps.length >= MAX_STEPS ? `최대 ${MAX_STEPS}단계까지 만들 수 있어요` : '단계 추가'}
      </button>
      <div className="flex items-center justify-between gap-3 px-1">
        <span className="text-sm text-sp-text">전체 반복</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => update({ repeat: Math.max(1, draft.repeat - 1) })}
            disabled={draft.repeat <= 1}
            aria-label="반복 줄이기"
            className="w-8 h-8 rounded-lg bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text disabled:opacity-30 flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-icon-md">remove</span>
          </button>
          <span className="w-12 text-center text-sm font-bold text-sp-text tabular-nums">
            {draft.repeat}바퀴
          </span>
          <button
            type="button"
            onClick={() => update({ repeat: Math.min(MAX_STEP_REPEAT, draft.repeat + 1) })}
            disabled={draft.repeat >= MAX_STEP_REPEAT}
            aria-label="반복 늘리기"
            className="w-8 h-8 rounded-lg bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text disabled:opacity-30 flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-icon-md">add</span>
          </button>
        </div>
      </div>
      {showSkip && (
        <div className="flex items-center justify-between gap-3 px-1">
          <span className="text-sm text-sp-text">
            마지막 바퀴의 마지막 단계 건너뛰기
            <span className="block text-xs text-sp-muted">
              예: 마지막 바퀴 뒤 '자리 이동'을 생략
            </span>
          </span>
          <TimerSwitch
            checked={draft.skipLastStepOnFinalRound}
            label="마지막 바퀴의 마지막 단계 건너뛰기"
            onChange={(skipLastStepOnFinalRound) => update({ skipLastStepOnFinalRound })}
          />
        </div>
      )}
    </div>
  );
}
