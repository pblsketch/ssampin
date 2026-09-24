import { describe, it, expect } from 'vitest';
import {
  advanceStepsBy,
  expandStepSlots,
  hasNextSlot,
  hasPreviousSlot,
  isSkipLastEffective,
  remainingActivitySeconds,
  slotSeconds,
  stepDisplayName,
  type StepPlan,
} from './timerSteps';

const THINK_PAIR_SHARE: StepPlan = {
  steps: [
    { id: 'a', name: '생각하기', seconds: 120 },
    { id: 'b', name: '짝과 나누기', seconds: 180 },
    { id: 'c', name: '', seconds: 120 },
  ],
  repeat: 1,
  skipLastStepOnFinalRound: false,
};

const ROTATION: StepPlan = {
  steps: [
    { id: 'work', name: '모둠 활동', seconds: 300 },
    { id: 'move', name: '자리 이동', seconds: 60 },
  ],
  repeat: 4,
  skipLastStepOnFinalRound: true,
};

describe('expandStepSlots — 순서 펼치기', () => {
  it('반복 없이 단계 수만큼', () => {
    expect(expandStepSlots(THINK_PAIR_SHARE)).toHaveLength(3);
  });

  it('반복 × 단계, 마지막 바퀴 마지막 단계는 건너뛴다', () => {
    const slots = expandStepSlots(ROTATION);
    expect(slots).toHaveLength(7);
    expect(slots.at(-1)).toEqual({ round: 3, stepIndex: 0 });
  });

  it('건너뛰기가 꺼져 있으면 전부', () => {
    expect(expandStepSlots({ ...ROTATION, skipLastStepOnFinalRound: false })).toHaveLength(8);
  });

  it('단계 하나에 건너뛰기를 켜도 무시한다(마지막 바퀴가 비지 않게)', () => {
    const plan: StepPlan = {
      steps: [{ id: 'x', name: '', seconds: 60 }],
      repeat: 3,
      skipLastStepOnFinalRound: true,
    };
    expect(isSkipLastEffective(plan)).toBe(false);
    expect(expandStepSlots(plan)).toHaveLength(3);
  });
});

describe('이전·다음', () => {
  it('첫 칸에는 이전이 없고 마지막 칸에는 다음이 없다', () => {
    expect(hasPreviousSlot(0)).toBe(false);
    expect(hasPreviousSlot(1)).toBe(true);
    expect(hasNextSlot(ROTATION, 5)).toBe(true);
    // 건너뛰기가 켜져 있으면 마지막 칸은 마지막 바퀴의 '모둠 활동'(6번)이다.
    expect(hasNextSlot(ROTATION, 6)).toBe(false);
  });
});

describe('남은 활동 시간', () => {
  it('지금 칸의 남은 시간 + 뒤 칸들', () => {
    expect(remainingActivitySeconds(THINK_PAIR_SHARE, 0, 100)).toBe(100 + 180 + 120);
    expect(remainingActivitySeconds(THINK_PAIR_SHARE, 2, 30)).toBe(30);
  });
});

describe('advanceStepsBy — 흐른 시간만큼 앞으로', () => {
  it('경계를 넘지 않으면 남은 시간만 준다', () => {
    const result = advanceStepsBy(THINK_PAIR_SHARE, 0, 120, 20);
    expect(result).toMatchObject({
      slotIndex: 0,
      remaining: 100,
      finished: false,
      boundariesCrossed: 0,
    });
  });

  it('정확히 끝나면 다음 단계의 처음이다', () => {
    const result = advanceStepsBy(THINK_PAIR_SHARE, 0, 30, 30);
    expect(result).toMatchObject({ slotIndex: 1, remaining: 180, boundariesCrossed: 1 });
  });

  it('한 번에 여러 경계를 넘는다(팝업으로 옮기는 사이)', () => {
    // 1번 칸 남은 10초 + 2번 칸 120초를 지나 3초 더
    const result = advanceStepsBy(
      {
        ...THINK_PAIR_SHARE,
        steps: [...THINK_PAIR_SHARE.steps, { id: 'd', name: '', seconds: 60 }],
      },
      1,
      10,
      133,
    );
    expect(result).toMatchObject({
      slotIndex: 3,
      remaining: 57,
      boundariesCrossed: 2,
      finished: false,
    });
  });

  it('마지막 칸을 지나면 끝나고 더 흐른 초를 돌려준다', () => {
    const result = advanceStepsBy(THINK_PAIR_SHARE, 2, 5, 12);
    expect(result).toEqual({
      slotIndex: 2,
      remaining: 0,
      finished: true,
      boundariesCrossed: 0,
      overflowSeconds: 7,
    });
  });
});

describe('단계 이름', () => {
  it('비어 있으면 "N단계"', () => {
    expect(stepDisplayName(THINK_PAIR_SHARE.steps[2]!, 2)).toBe('3단계');
    expect(stepDisplayName(THINK_PAIR_SHARE.steps[0]!, 0)).toBe('생각하기');
  });

  it('칸 길이', () => {
    expect(slotSeconds(ROTATION, 1)).toBe(60);
    expect(slotSeconds(ROTATION, 99)).toBe(0);
  });
});
