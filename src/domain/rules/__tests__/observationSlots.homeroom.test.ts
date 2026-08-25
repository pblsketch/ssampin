import { describe, expect, it } from 'vitest';
import { normalizeSlots, HOMEROOM_SLOTS, TEACHING_SLOTS } from '@domain/rules/observationSlots';

/**
 * 담임 누가기록 저장 경로가 지켜야 할 불변식.
 *
 * ★InputMode 는 slots 를 tags 와 **다른 칸**에 넣는다. 담임의 tags 는 이미 "세부 분류"라
 * (InlineRecordEditor.tsx) 섞이면 세부 분류 목록에 장면이 끼어든다.
 */
describe('담임 슬롯 — 저장 전 정규화', () => {
  it('교과 어휘를 담임 맥락에 넣으면 전부 걸러진다', () => {
    expect(normalizeSlots([...TEACHING_SLOTS], 'homeroom')).toEqual([]);
  });

  it('담임 어휘는 그대로 통과한다', () => {
    expect(normalizeSlots(['학급 역할', '변화'], 'homeroom')).toEqual(['학급 역할', '변화']);
  });

  it('★전부 걸러지면 빈 배열이다 — 호출자는 이때 칸을 만들지 않아야 한다', () => {
    // InputMode 는 normalizedSlots.length > 0 일 때만 slots 를 넣는다(부재 != 빈 배열).
    const normalized = normalizeSlots(['질문'], 'homeroom');
    expect(normalized).toEqual([]);
    const patch = { ...(normalized.length > 0 ? { slots: normalized } : {}) };
    expect('slots' in patch).toBe(false);
  });

  it('담임에는 변화 슬롯이 있고 교과에는 없다', () => {
    expect(HOMEROOM_SLOTS).toContain('변화');
    expect(TEACHING_SLOTS as readonly string[]).not.toContain('변화');
  });
});
