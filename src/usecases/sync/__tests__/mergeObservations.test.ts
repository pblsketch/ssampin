import { describe, it, expect } from 'vitest';
import { mergeObservations } from '../SyncFromCloud';
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
