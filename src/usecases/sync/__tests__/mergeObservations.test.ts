import { describe, it, expect } from 'vitest';
import { mergeObservations } from '../SyncFromCloud';
import { buildObservationSaveData } from '@usecases/classManagement/ManageObservations';
import { OBSERVATION_TOMBSTONE_TTL_MS } from '@domain/entities/Observation';
import type { ObservationData, ObservationRecord } from '@domain/entities/Observation';

function obs(
  partial: Partial<ObservationRecord> & Pick<ObservationRecord, 'id'>,
): ObservationRecord {
  return {
    studentId: 's1',
    classId: 'c1',
    authorId: 'me',
    date: '2026-07-10',
    content: '수업 참여 우수',
    tags: [],
    visibility: 'private',
    createdAt: 1_000,
    updatedAt: 1_000,
    ...partial,
  };
}

describe('mergeObservations — 수업 기록 레코드 단위 병합', () => {
  it('한쪽에만 있는 기록은 양쪽 모두 보존된다 (통째 덮어쓰기 유실 제거)', () => {
    const local: ObservationData = { records: [obs({ id: 'a' }), obs({ id: 'b' })] };
    const remote: ObservationData = { records: [obs({ id: 'c' })] };
    const merged = mergeObservations(local, remote, true);
    expect(merged.records.map((r) => r.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('구/빈 리모트 파일이 최신 판정을 받아도 로컬 기록이 유실되지 않는다 (2026-07-13 유실 시나리오)', () => {
    const local: ObservationData = {
      records: [obs({ id: 'a' }), obs({ id: 'b' }), obs({ id: 'c' })],
    };
    const remote: ObservationData = { records: [] };
    const merged = mergeObservations(local, remote, true);
    expect(merged.records).toHaveLength(3);
  });

  it('같은 id는 updatedAt(ms)이 최신인 쪽이 이긴다 — remote 최신', () => {
    const local: ObservationData = {
      records: [obs({ id: 'a', content: '옛 내용', updatedAt: 1_000 })],
    };
    const remote: ObservationData = {
      records: [obs({ id: 'a', content: '새 내용', updatedAt: 2_000 })],
    };
    const merged = mergeObservations(local, remote, false);
    expect(merged.records).toHaveLength(1);
    expect(merged.records[0]!.content).toBe('새 내용');
  });

  it('같은 id에서 local이 최신이면 preferRemote=true여도 local이 이긴다', () => {
    const local: ObservationData = {
      records: [obs({ id: 'a', content: '최신 로컬', updatedAt: 3_000 })],
    };
    const remote: ObservationData = {
      records: [obs({ id: 'a', content: '옛 리모트', updatedAt: 2_000 })],
    };
    const merged = mergeObservations(local, remote, true);
    expect(merged.records[0]!.content).toBe('최신 로컬');
  });

  it('updatedAt 동률이면 preferRemote 판정을 따른다', () => {
    const local: ObservationData = {
      records: [obs({ id: 'a', content: '로컬', updatedAt: 1_000 })],
    };
    const remote: ObservationData = {
      records: [obs({ id: 'a', content: '리모트', updatedAt: 1_000 })],
    };
    expect(mergeObservations(local, remote, true).records[0]!.content).toBe('리모트');
    expect(mergeObservations(local, remote, false).records[0]!.content).toBe('로컬');
  });

  it('customTags/customCategories는 합집합 — 빈 배열이 커스텀을 지우지 않는다', () => {
    const local: ObservationData = {
      records: [],
      customTags: ['발표력', '협동'],
      customCategories: ['프로젝트'],
    };
    const remote: ObservationData = {
      records: [],
      customTags: [],
    };
    const merged = mergeObservations(local, remote, true);
    expect(merged.customTags).toEqual(['발표력', '협동']);
    expect(merged.customCategories).toEqual(['프로젝트']);
  });

  it('customTags는 순서 보존 합집합(중복 제거)으로 합쳐진다', () => {
    const local: ObservationData = { records: [], customTags: ['발표력', '협동'] };
    const remote: ObservationData = { records: [], customTags: ['협동', '리더십'] };
    const merged = mergeObservations(local, remote, true);
    expect(merged.customTags).toEqual(['발표력', '협동', '리더십']);
  });

  it('local이 null(최초 다운로드)이면 remote 내용이 그대로 채택된다', () => {
    const remote: ObservationData = {
      records: [obs({ id: 'a' })],
      customTags: ['발표력'],
    };
    const merged = mergeObservations(null, remote, true);
    expect(merged.records).toHaveLength(1);
    expect(merged.customTags).toEqual(['발표력']);
  });
});

describe('mergeObservations — 삭제 전파(툼스톤)', () => {
  it('한쪽에서 지운 기록은 상대 기기 병합에서 부활하지 않는다 (삭제 전파)', () => {
    // 리모트가 id 'a'를 3000 시점에 삭제, 로컬엔 옛 사본(updatedAt 2000)이 남아 있음
    const local: ObservationData = { records: [obs({ id: 'a', updatedAt: 2_000 })] };
    const remote: ObservationData = { records: [], deleted: [{ id: 'a', deletedAt: 3_000 }] };
    const merged = mergeObservations(local, remote, true);
    expect(merged.records).toHaveLength(0);
    expect(merged.deleted).toEqual([{ id: 'a', deletedAt: 3_000 }]);
  });

  it('삭제 이후에 다시 수정된 기록은 살아남는다 (재작성이 삭제를 이김)', () => {
    const local: ObservationData = { records: [obs({ id: 'a', updatedAt: 4_000 })] };
    const remote: ObservationData = { records: [], deleted: [{ id: 'a', deletedAt: 3_000 }] };
    const merged = mergeObservations(local, remote, true);
    expect(merged.records.map((r) => r.id)).toEqual(['a']);
    expect(merged.deleted).toBeUndefined();
  });

  it('updatedAt과 deletedAt이 동률이면 삭제가 이긴다', () => {
    const local: ObservationData = { records: [obs({ id: 'a', updatedAt: 3_000 })] };
    const remote: ObservationData = { records: [], deleted: [{ id: 'a', deletedAt: 3_000 }] };
    const merged = mergeObservations(local, remote, true);
    expect(merged.records).toHaveLength(0);
  });

  it('양쪽 툼스톤은 id별 최신 deletedAt으로 합쳐진다', () => {
    const local: ObservationData = { records: [], deleted: [{ id: 'a', deletedAt: 1_000 }] };
    const remote: ObservationData = { records: [], deleted: [{ id: 'a', deletedAt: 5_000 }] };
    const merged = mergeObservations(local, remote, true);
    expect(merged.deleted).toEqual([{ id: 'a', deletedAt: 5_000 }]);
  });

  it('legacy 파일(툼스톤 없음)끼리 병합하면 deleted 필드가 생성되지 않는다', () => {
    const merged = mergeObservations({ records: [obs({ id: 'a' })] }, { records: [] }, true);
    expect('deleted' in merged).toBe(false);
  });
});

describe('buildObservationSaveData — 저장 시 툼스톤 관리', () => {
  const NOW = 10_000;

  it('이번 저장에서 사라진 id에 툼스톤을 남긴다', () => {
    const existing: ObservationData = { records: [obs({ id: 'a' }), obs({ id: 'b' })] };
    const next: ObservationData = { records: [obs({ id: 'a' })] };
    const saved = buildObservationSaveData(existing, next, NOW);
    expect(saved.records.map((r) => r.id)).toEqual(['a']);
    expect(saved.deleted).toEqual([{ id: 'b', deletedAt: NOW }]);
  });

  it('다시 등장한 id의 툼스톤은 제거된다 (재작성이 삭제를 이김)', () => {
    const existing: ObservationData = {
      records: [],
      deleted: [{ id: 'a', deletedAt: 5_000 }],
    };
    const next: ObservationData = { records: [obs({ id: 'a' })] };
    const saved = buildObservationSaveData(existing, next, NOW);
    expect(saved.records.map((r) => r.id)).toEqual(['a']);
    expect('deleted' in saved).toBe(false);
  });

  it('기존 툼스톤은 승계되고 TTL(90일) 경과분은 정리된다', () => {
    const now = OBSERVATION_TOMBSTONE_TTL_MS + 1_000_000;
    const fresh = { id: 'fresh', deletedAt: now - 1_000 };
    const expired = { id: 'expired', deletedAt: 999_999 }; // cutoff(=1,000,000) 이전
    const existing: ObservationData = { records: [], deleted: [fresh, expired] };
    const next: ObservationData = { records: [] };
    const saved = buildObservationSaveData(existing, next, now);
    expect(saved.deleted).toEqual([fresh]);
  });

  it('호출자가 스프레드로 실어온 낡은 next.deleted는 무시된다 (existing 기준 재계산)', () => {
    const existing: ObservationData = { records: [obs({ id: 'a' })] };
    const next: ObservationData = {
      records: [obs({ id: 'a' })],
      deleted: [{ id: 'ghost', deletedAt: 1 }],
    };
    const saved = buildObservationSaveData(existing, next, NOW);
    expect('deleted' in saved).toBe(false);
  });

  it('삭제가 없으면 legacy 형태 그대로 deleted 필드를 만들지 않는다', () => {
    const existing: ObservationData = { records: [obs({ id: 'a' })], customTags: ['발표력'] };
    const next: ObservationData = { ...existing, records: [obs({ id: 'a' }), obs({ id: 'b' })] };
    const saved = buildObservationSaveData(existing, next, NOW);
    expect('deleted' in saved).toBe(false);
    expect(saved.customTags).toEqual(['발표력']);
  });
});

describe('관찰 슬롯 — 기기 간 병합', () => {
  it('★교사가 추가한 슬롯은 합집합이다 — 한쪽 기기의 저장이 다른 쪽 슬롯을 지우지 않는다', () => {
    // 덮이면 그 슬롯이 붙은 기록만 남고 목록에서는 고를 수 없게 된다.
    const local: ObservationData = { records: [], customSlots: ['협업'] };
    const remote: ObservationData = { records: [], customSlots: ['발표'] };
    expect(mergeObservations(local, remote, false).customSlots).toEqual(['협업', '발표']);
  });

  it('한쪽에만 커스텀 슬롯이 있으면 그대로 살아남는다', () => {
    const local: ObservationData = { records: [], customSlots: ['협업'] };
    const remote: ObservationData = { records: [] };
    expect(mergeObservations(local, remote, true).customSlots).toEqual(['협업']);
    expect(
      mergeObservations({ records: [] }, { records: [], customSlots: ['발표'] }, false).customSlots,
    ).toEqual(['발표']);
  });

  it('양쪽 모두 커스텀 슬롯이 없으면 칸을 만들지 않는다', () => {
    const merged = mergeObservations({ records: [] }, { records: [] }, false);
    expect('customSlots' in merged).toBe(false);
  });

  it('기록의 슬롯은 레코드 단위 최신 우선을 따른다(tags 와 같은 규칙)', () => {
    const local: ObservationData = {
      records: [obs({ id: 'a', slots: ['질문'], updatedAt: 2_000 })],
    };
    const remote: ObservationData = {
      records: [obs({ id: 'a', slots: ['시행착오'], updatedAt: 3_000 })],
    };
    expect(mergeObservations(local, remote, false).records[0]?.slots).toEqual(['시행착오']);
  });

  it('슬롯 없는 구 기록과 슬롯 있는 기록이 섞여도 각자 보존된다', () => {
    const local: ObservationData = { records: [obs({ id: 'old' })] };
    const remote: ObservationData = { records: [obs({ id: 'new', slots: ['시도'] })] };
    const merged = mergeObservations(local, remote, false);
    const old = merged.records.find((r) => r.id === 'old');
    expect(old && 'slots' in old).toBe(false);
    expect(merged.records.find((r) => r.id === 'new')?.slots).toEqual(['시도']);
  });
});
