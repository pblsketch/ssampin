import { describe, expect, it } from 'vitest';
import {
  HOMEROOM_PRESETS,
  TEACHING_PRESETS,
  TERM_REVIEW_PRESETS,
  isPresetUsed,
  presetToQuestion,
  presetsForContext,
  uncoveredSlots,
} from '@domain/rules/selfAssessmentPresets';
import { HOMEROOM_SLOTS, TEACHING_SLOTS, isValidSlot } from '@domain/rules/observationSlots';
import { normalizeSelfAssessmentQuestions } from '@domain/entities/SelfAssessment';

describe('추천 문항의 슬롯은 관찰 슬롯과 같은 축이다', () => {
  it('교과 추천의 슬롯이 모두 교과 관찰 슬롯이다', () => {
    for (const p of TEACHING_PRESETS) {
      expect(isValidSlot(p.slot, 'teaching'), `${p.slot} 이 교과 슬롯이 아니다`).toBe(true);
    }
  });

  it('담임 추천의 슬롯이 모두 담임 관찰 슬롯이다', () => {
    for (const p of HOMEROOM_PRESETS) {
      expect(isValidSlot(p.slot, 'homeroom'), `${p.slot} 이 담임 슬롯이 아니다`).toBe(true);
    }
  });

  it('학기말 회고 추천도 교과 슬롯을 쓴다', () => {
    for (const p of TERM_REVIEW_PRESETS) {
      expect(isValidSlot(p.slot, 'teaching')).toBe(true);
    }
  });

  it('★추천이 정규화를 통과해도 슬롯이 살아남는다 — 축이 어긋나면 여기서 떨어진다', () => {
    const questions = TEACHING_PRESETS.slice(0, 6).map((p, i) => presetToQuestion(p, `q${i}`));
    const out = normalizeSelfAssessmentQuestions(questions, 'teaching');
    expect(out).toHaveLength(6);
    expect(out.every((x) => x.slot !== undefined)).toBe(true);
  });
});

describe('추천 목록의 모양', () => {
  it('교과·담임 추천이 각 기본 슬롯 수만큼 있고 순서가 같다', () => {
    expect(TEACHING_PRESETS.map((p) => p.slot)).toEqual([...TEACHING_SLOTS]);
    expect(HOMEROOM_PRESETS.map((p) => p.slot)).toEqual([...HOMEROOM_SLOTS]);
  });

  it('물음이 비어 있고 끝맺음이 없는 것을 막는다 — 학생에게 그대로 보이는 글이다', () => {
    // 물음표로 끝나는 것("무엇이 궁금했나요?")과 청유형으로 끝나는 것("적어 주세요.") 둘 다 정상이다.
    for (const p of [...TEACHING_PRESETS, ...HOMEROOM_PRESETS, ...TERM_REVIEW_PRESETS]) {
      expect(p.prompt.trim().length).toBeGreaterThan(0);
      expect(p.prompt, `"${p.prompt}" 에 끝맺음이 없다`).toMatch(/[?.]$/);
    }
  });

  it('맥락별로 다른 목록을 준다', () => {
    expect(presetsForContext('teaching')).toBe(TEACHING_PRESETS);
    expect(presetsForContext('homeroom')).toBe(HOMEROOM_PRESETS);
  });
});

describe('presetToQuestion', () => {
  it('id 는 호출자가 준 값을 쓴다 — 도메인은 무작위 값을 만들지 않는다', () => {
    const out = presetToQuestion(TEACHING_PRESETS[0]!, 'given-id');
    expect(out.id).toBe('given-id');
    expect(out.prompt).toBe(TEACHING_PRESETS[0]!.prompt);
    expect(out.slot).toBe(TEACHING_PRESETS[0]!.slot);
  });
});

describe('isPresetUsed', () => {
  it('물음 원문이 같으면 이미 쓴 것으로 본다', () => {
    const p = TEACHING_PRESETS[0]!;
    expect(isPresetUsed(p, [presetToQuestion(p, 'a')])).toBe(true);
  });

  it('교사가 문구를 고쳤으면 다른 문항으로 본다', () => {
    const p = TEACHING_PRESETS[0]!;
    expect(isPresetUsed(p, [{ id: 'a', prompt: `${p.prompt} 덧붙임`, slot: p.slot }])).toBe(false);
  });
});

describe('uncoveredSlots', () => {
  it('아직 아무 문항도 겨냥하지 않은 갈래를 표시 순서대로 준다', () => {
    const questions = [presetToQuestion(TEACHING_PRESETS[0]!, 'a')];
    expect(uncoveredSlots(questions, 'teaching')).toEqual(TEACHING_SLOTS.slice(1));
  });

  it('문항이 없으면 기본 슬롯 전부', () => {
    expect(uncoveredSlots([], 'homeroom')).toEqual([...HOMEROOM_SLOTS]);
  });

  it('슬롯 없는 문항은 아무 갈래도 덮지 않는다', () => {
    expect(uncoveredSlots([{ id: 'a', prompt: '직접 쓴 물음' }], 'teaching')).toEqual([
      ...TEACHING_SLOTS,
    ]);
  });
});
