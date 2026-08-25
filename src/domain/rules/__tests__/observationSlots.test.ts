import { describe, expect, it } from 'vitest';
import {
  TEACHING_SLOTS,
  HOMEROOM_SLOTS,
  slotsForContext,
  allSlotsForContext,
  isValidSlot,
  normalizeSlots,
  countSlots,
  emptySlots,
} from '@domain/rules/observationSlots';

describe('관찰 슬롯 — 어휘와 맥락', () => {
  it('교과와 담임은 서로 다른 어휘를 쓴다', () => {
    expect(slotsForContext('teaching')).toBe(TEACHING_SLOTS);
    expect(slotsForContext('homeroom')).toBe(HOMEROOM_SLOTS);
    // 세특과 행특은 필요한 장면이 다르다 — 겹치는 이름이 없어야 섞여도 구분된다.
    const overlap = TEACHING_SLOTS.filter((s) => (HOMEROOM_SLOTS as readonly string[]).includes(s));
    expect(overlap).toEqual([]);
  });

  it('담임 어휘에는 변화 슬롯이 있다 — 변화 서사의 근거 표식', () => {
    // 시기 대비 근거가 없는데 변화를 지어내는 것을 데이터로 막기 위한 장치(실측 D 사례).
    expect(HOMEROOM_SLOTS).toContain('변화');
  });

  it('맥락이 다른 슬롯은 유효하지 않다', () => {
    expect(isValidSlot('질문', 'teaching')).toBe(true);
    expect(isValidSlot('질문', 'homeroom')).toBe(false);
    expect(isValidSlot('학급 역할', 'homeroom')).toBe(true);
    expect(isValidSlot('학급 역할', 'teaching')).toBe(false);
  });
});

describe('normalizeSlots — 저장 직전 정규화', () => {
  it('중복을 없애고 첫 등장 순서를 지킨다', () => {
    expect(normalizeSlots(['시도', '질문', '시도'], 'teaching')).toEqual(['시도', '질문']);
  });

  it('맥락에 없는 값은 버린다', () => {
    expect(normalizeSlots(['질문', '학급 역할', '융합'], 'teaching')).toEqual(['질문', '융합']);
  });

  it('빈 배열은 정상이다 — 슬롯 미선택은 막지 않는다', () => {
    // 슬롯을 필수로 만들면 입력이 막히고, 그게 기록이 안 쌓이는 길이다(ADR-072 결정 6).
    expect(normalizeSlots([], 'teaching')).toEqual([]);
    expect(normalizeSlots(['없는슬롯'], 'teaching')).toEqual([]);
  });
});

describe('countSlots / emptySlots — 현황 집계', () => {
  const recs = [
    { slots: ['질문', '시도'] },
    { slots: ['질문'] },
    { slots: undefined }, // 구 데이터 — 슬롯 부재
    {}, // 슬롯 칸 자체가 없음
  ];

  it('전 슬롯을 키로 포함하고 0 건도 센다', () => {
    const c = countSlots(recs, 'teaching');
    expect(c['질문']).toBe(2);
    expect(c['시도']).toBe(1);
    expect(c['시행착오']).toBe(0);
    expect(Object.keys(c)).toHaveLength(TEACHING_SLOTS.length);
  });

  it('구 데이터(슬롯 부재)에서 터지지 않는다', () => {
    expect(() => countSlots([{}, { slots: undefined }], 'homeroom')).not.toThrow();
  });

  it('빈 슬롯을 표시 순서대로 돌려준다 — 알림 문구가 결정론적이도록', () => {
    expect(emptySlots(recs, 'teaching')).toEqual(['시행착오', '산출물', '피드백', '융합']);
  });

  it('기록이 없으면 전 슬롯이 빈 슬롯이다', () => {
    expect(emptySlots([], 'homeroom')).toEqual([...HOMEROOM_SLOTS]);
  });
});

describe('직접 추가한 슬롯 — 쓰는 데는 차별이 없고, 알림만 기본 어휘를 본다', () => {
  const custom = ['협업', '발표'];

  it('칩 목록에 기본 뒤로 이어 붙는다', () => {
    const all = allSlotsForContext('teaching', custom);
    expect(all.slice(0, TEACHING_SLOTS.length)).toEqual([...TEACHING_SLOTS]);
    expect(all).toContain('협업');
  });

  it('기본과 겹치거나 빈 값은 걸러진다', () => {
    expect(allSlotsForContext('teaching', ['질문', '  ', ''])).toEqual([...TEACHING_SLOTS]);
  });

  it('저장·집계에는 기본과 똑같이 포함된다', () => {
    expect(normalizeSlots(['협업', '질문'], 'teaching', custom)).toEqual(['협업', '질문']);
    const c = countSlots([{ slots: ['협업'] }], 'teaching', custom);
    expect(c['협업']).toBe(1);
  });

  it('★알림의 빈 슬롯에는 들어가지 않는다 — 직접 만든 칸을 재촉하지 않는다', () => {
    // 재촉하면 빈 슬롯이 항상 많아져 알림이 의미를 잃고, 선생님이 알림을 꺼 버린다.
    expect(emptySlots([], 'teaching')).toEqual([...TEACHING_SLOTS]);
    expect(emptySlots([], 'teaching')).not.toContain('협업');
  });

  it('추가 목록이 없으면 기본만 유효하다', () => {
    expect(normalizeSlots(['협업'], 'teaching')).toEqual([]);
  });
});

describe('D7 — 프로토타입 오염 방지', () => {
  it("'toString' 같은 이름의 커스텀 슬롯이 유령 키를 만들지 않는다", () => {
    const c = countSlots([{ slots: ['toString'] }], 'teaching');
    // 기본 어휘에만 키가 있어야 한다 — 'toString' 은 커스텀 목록에 없으므로 세지 않는다.
    expect(Object.keys(c).sort()).toEqual([...TEACHING_SLOTS].sort());
  });

  it('커스텀으로 등록하면 정상적으로 센다', () => {
    const c = countSlots([{ slots: ['toString'] }], 'teaching', ['toString']);
    expect(c['toString']).toBe(1);
  });
});
