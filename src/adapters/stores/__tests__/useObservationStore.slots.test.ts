/**
 * useObservationStore — 관찰 슬롯 저장 경로 테스트.
 *
 * 회귀 방어(설계서 §3):
 *   - ★슬롯 미선택은 **필드 부재**로 저장한다. 빈 배열로 넣으면 병합에서 다른 기기의 슬롯을 덮는다.
 *   - 슬롯은 tags·category 와 섞이지 않는다(직교 축).
 *   - 맥락(교과)에 없는 값은 저장 전에 걸러진다.
 *   - 교사가 직접 추가한 슬롯은 기본과 똑같이 저장된다.
 *
 * container 의 observationRepository 를 인메모리 가짜로 모킹한다(useRecordEvidenceStore.test 패턴).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ObservationData, ObservationRecord } from '@domain/entities/Observation';

const { observationRepoFake } = vi.hoisted(() => {
  const fake: {
    stored: ObservationData | null;
    getObservations(): Promise<ObservationData | null>;
    saveObservations(data: ObservationData): Promise<void>;
  } = {
    stored: null,
    async getObservations() {
      return this.stored ? { ...this.stored, records: [...this.stored.records] } : null;
    },
    async saveObservations(data) {
      this.stored = { ...data, records: [...data.records] };
    },
  };
  return { observationRepoFake: fake };
});

vi.mock('@adapters/di/container', () => ({ observationRepository: observationRepoFake }));

import { useObservationStore } from '@adapters/stores/useObservationStore';

const base = { studentId: 's1', classId: 'c1', date: '2026-08-25', content: '내용', tags: [] };
const saved = (): readonly ObservationRecord[] => observationRepoFake.stored?.records ?? [];

beforeEach(async () => {
  observationRepoFake.stored = null;
  useObservationStore.setState({
    records: [],
    customTags: [],
    customCategories: [],
    customSlots: [],
    loaded: false,
  });
  await useObservationStore.getState().load(true);
});

describe('슬롯 저장 — 부재 ≠ 빈 배열', () => {
  it('★슬롯을 안 고르면 slots 칸 자체가 없다', async () => {
    await useObservationStore.getState().addRecord({ ...base, slots: [] });
    expect('slots' in saved()[0]!).toBe(false);
  });

  it('★slots 를 아예 안 넘겨도 칸이 없다', async () => {
    await useObservationStore.getState().addRecord(base);
    expect('slots' in saved()[0]!).toBe(false);
  });

  it('고른 슬롯은 그대로 저장된다', async () => {
    await useObservationStore.getState().addRecord({ ...base, slots: ['질문', '시행착오'] });
    expect(saved()[0]?.slots).toEqual(['질문', '시행착오']);
  });
});

describe('슬롯은 tags·category 와 섞이지 않는다', () => {
  it('슬롯이 tags 배열로 새지 않는다', async () => {
    await useObservationStore
      .getState()
      .addRecord({ ...base, tags: ['교과역량'], category: '수업 관찰', slots: ['질문'] });
    const rec = saved()[0]!;
    expect(rec.tags).toEqual(['교과역량']);
    expect(rec.category).toBe('수업 관찰');
    expect(rec.slots).toEqual(['질문']);
  });
});

describe('정규화', () => {
  it('교과 맥락에 없는 슬롯(담임 어휘)은 걸러진다', async () => {
    await useObservationStore.getState().addRecord({ ...base, slots: ['질문', '학급 역할'] });
    expect(saved()[0]?.slots).toEqual(['질문']);
  });

  it('전부 걸러지면 칸 자체가 없다', async () => {
    await useObservationStore.getState().addRecord({ ...base, slots: ['학급 역할'] });
    expect('slots' in saved()[0]!).toBe(false);
  });

  it('중복은 하나로 줄인다', async () => {
    await useObservationStore.getState().addRecord({ ...base, slots: ['시도', '시도'] });
    expect(saved()[0]?.slots).toEqual(['시도']);
  });
});

describe('교사가 직접 추가한 슬롯', () => {
  it('추가 후에는 기본 슬롯과 똑같이 저장된다', async () => {
    await useObservationStore.getState().addCustomSlot('협업');
    expect(useObservationStore.getState().customSlots).toContain('협업');
    await useObservationStore.getState().addRecord({ ...base, slots: ['협업', '질문'] });
    expect(saved()[0]?.slots).toEqual(['협업', '질문']);
  });

  it('추가하지 않은 값은 저장되지 않는다', async () => {
    await useObservationStore.getState().addRecord({ ...base, slots: ['협업'] });
    expect('slots' in saved()[0]!).toBe(false);
  });

  it('customSlots 가 파일에 남아 다음 로드에서 살아난다', async () => {
    await useObservationStore.getState().addCustomSlot('협업');
    expect(observationRepoFake.stored?.customSlots).toEqual(['협업']);
  });
});
