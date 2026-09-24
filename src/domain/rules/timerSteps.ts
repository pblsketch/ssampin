/**
 * 단계 타이머 진행 엔진(ADR-139).
 *
 * 순서(단계 목록 × 반복)를 한 줄로 펼쳐 "몇 번째 칸"으로 다룬다. 마지막 바퀴의 마지막 단계
 * 건너뛰기가 켜져 있으면 그 칸을 펼칠 때 빼 버린다 — 그러면 이전·다음·끝 판정이 모두
 * 같은 줄 위에서 저절로 맞는다.
 */
import type { TimerStepDefinition } from '../entities/Settings';
import { canSkipLastStep } from './timerSettings';

export interface StepPlan {
  readonly steps: readonly TimerStepDefinition[];
  readonly repeat: number;
  readonly skipLastStepOnFinalRound: boolean;
}

/** 펼친 줄의 한 칸 — 몇 번째 바퀴(0부터)의 몇 번째 단계(0부터). */
export interface StepSlot {
  readonly round: number;
  readonly stepIndex: number;
}

/** 화면에 부를 단계 이름. 비어 있으면 "N단계". */
export function stepDisplayName(step: TimerStepDefinition, stepIndex: number): string {
  const name = step.name.trim();
  return name !== '' ? name : `${stepIndex + 1}단계`;
}

function effectiveRepeat(plan: StepPlan): number {
  return Math.max(1, Math.floor(plan.repeat));
}

/** 건너뛰기 옵션이 실제로 적용되는가(조건이 깨졌으면 무시). */
export function isSkipLastEffective(plan: StepPlan): boolean {
  return plan.skipLastStepOnFinalRound && canSkipLastStep(plan.steps.length, effectiveRepeat(plan));
}

/** 순서를 한 줄로 펼친다. */
export function expandStepSlots(plan: StepPlan): readonly StepSlot[] {
  const repeat = effectiveRepeat(plan);
  const skipLast = isSkipLastEffective(plan);
  const slots: StepSlot[] = [];
  for (let round = 0; round < repeat; round += 1) {
    for (let stepIndex = 0; stepIndex < plan.steps.length; stepIndex += 1) {
      const isFinalSlot = round === repeat - 1 && stepIndex === plan.steps.length - 1;
      if (isFinalSlot && skipLast) continue;
      slots.push({ round, stepIndex });
    }
  }
  return slots;
}

/** 칸 번호의 단계 길이(초). 범위 밖이면 0. */
export function slotSeconds(plan: StepPlan, slotIndex: number): number {
  const slot = expandStepSlots(plan)[slotIndex];
  if (slot === undefined) return 0;
  return plan.steps[slot.stepIndex]?.seconds ?? 0;
}

export function hasPreviousSlot(slotIndex: number): boolean {
  return slotIndex > 0;
}

export function hasNextSlot(plan: StepPlan, slotIndex: number): boolean {
  return slotIndex < expandStepSlots(plan).length - 1;
}

/** 이 칸이 끝난 뒤 남은 칸들의 합(초) — 전체 활동이 끝나는 시각 계산용. */
export function secondsAfterSlot(plan: StepPlan, slotIndex: number): number {
  const slots = expandStepSlots(plan);
  let total = 0;
  for (let i = slotIndex + 1; i < slots.length; i += 1) {
    const slot = slots[i]!;
    total += plan.steps[slot.stepIndex]?.seconds ?? 0;
  }
  return total;
}

/** 지금 칸의 남은 초 + 뒤 칸들 — 전체 활동이 끝날 때까지 남은 초. */
export function remainingActivitySeconds(
  plan: StepPlan,
  slotIndex: number,
  remainingInSlot: number,
): number {
  return Math.max(0, remainingInSlot) + secondsAfterSlot(plan, slotIndex);
}

export interface StepAdvanceResult {
  readonly slotIndex: number;
  readonly remaining: number;
  /** 마지막 칸까지 다 끝났는가. */
  readonly finished: boolean;
  /** 지나간 단계 경계 수(마지막 칸의 끝은 세지 않는다). */
  readonly boundariesCrossed: number;
  /** finished 일 때 마지막 칸이 끝난 뒤 더 흐른 초(초과 시간 계산용). */
  readonly overflowSeconds: number;
}

/**
 * 흐른 초만큼 앞으로 보낸다. 팝업 이관처럼 한 번에 여러 경계를 넘는 경우도 다룬다.
 * 칸 사이 전환은 즉시 일어난다고 본다(쉬는 틈 없음).
 */
export function advanceStepsBy(
  plan: StepPlan,
  slotIndex: number,
  remaining: number,
  elapsedSeconds: number,
): StepAdvanceResult {
  const slots = expandStepSlots(plan);
  let index = Math.min(Math.max(0, slotIndex), Math.max(0, slots.length - 1));
  let left = Math.max(0, remaining);
  let elapsed = Math.max(0, Math.floor(elapsedSeconds));
  let crossed = 0;
  while (elapsed >= left) {
    elapsed -= left;
    if (index >= slots.length - 1) {
      return {
        slotIndex: index,
        remaining: 0,
        finished: true,
        boundariesCrossed: crossed,
        overflowSeconds: elapsed,
      };
    }
    index += 1;
    crossed += 1;
    left = slotSeconds(plan, index);
    if (left <= 0) break;
  }
  return {
    slotIndex: index,
    remaining: left - elapsed,
    finished: false,
    boundariesCrossed: crossed,
    overflowSeconds: 0,
  };
}
