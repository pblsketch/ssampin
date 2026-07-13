import type {
  ObservationRecord,
  ObservationData,
  ObservationTombstone,
} from '@domain/entities/Observation';
import { OBSERVATION_TOMBSTONE_TTL_MS } from '@domain/entities/Observation';
import type { IObservationRepository } from '@domain/repositories/IObservationRepository';

/**
 * 저장 데이터 조립: 삭제 전파 툼스톤 관리 (attendance buildAttendanceSaveData 패턴).
 * - 이번 저장에서 사라진 id → 툼스톤 추가(삭제 시각 기록)
 * - 다시 등장한 id → 툼스톤 제거(재작성이 삭제를 이김)
 * - TTL(90일) 지난 툼스톤 → 정리(GC)
 * 모든 수업 기록 저장 경로(add/update/delete/deleteByClassId/saveCustomTags/saveCustomCategories)가
 * 이 함수를 거친다. 봉투는 명시 재조립 — 호출자가 스프레드로 실어온 낡은 deleted 가 새지 않게 한다.
 *
 * 불변식: 모든 관찰 기록 write 경로는 저장 전에 updatedAt(ms)을 세팅해야 한다
 * (현재 useObservationStore·useMobileObservationStore 가 add/update 시 Date.now() 스탬프).
 * updatedAt 없는 레코드는 병합에서 0(최고참)으로 취급돼 어떤 툼스톤에도 진다 —
 * 새 write 경로를 추가할 때 이 스탬프를 빠뜨리면 "재작성이 삭제를 이김" 판정이 깨진다.
 */
export function buildObservationSaveData(
  existing: ObservationData | null,
  next: ObservationData,
  now: number = Date.now(),
): ObservationData {
  const existingRecords = existing?.records ?? [];
  const nextIds = new Set(next.records.map((r) => r.id));
  const cutoff = now - OBSERVATION_TOMBSTONE_TTL_MS;

  // 기존 툼스톤 승계 — 재등장(부활) id 와 TTL 경과분은 제거
  const carried = (existing?.deleted ?? []).filter(
    (t) => !nextIds.has(t.id) && t.deletedAt > cutoff,
  );
  const carriedIds = new Set(carried.map((t) => t.id));

  // 이번 저장에서 사라진 id → 새 툼스톤
  const newTombstones: ObservationTombstone[] = existingRecords
    .filter((r) => !nextIds.has(r.id) && !carriedIds.has(r.id))
    .map((r) => ({ id: r.id, deletedAt: now }));

  const deleted = [...carried, ...newTombstones];
  const envelope: ObservationData = {
    records: next.records,
    ...(next.customTags ? { customTags: next.customTags } : {}),
    ...(next.customCategories ? { customCategories: next.customCategories } : {}),
  };
  return deleted.length > 0 ? { ...envelope, deleted } : envelope;
}

export class ManageObservations {
  constructor(private readonly repository: IObservationRepository) {}

  async getAll(): Promise<ObservationData> {
    const data = await this.repository.getObservations();
    return data ?? { records: [], customTags: [] };
  }

  async add(record: ObservationRecord): Promise<void> {
    const data = await this.getAll();
    const updated: ObservationData = {
      ...data,
      records: [...data.records, record],
    };
    await this.repository.saveObservations(buildObservationSaveData(data, updated));
  }

  async update(record: ObservationRecord): Promise<void> {
    const data = await this.getAll();
    const updated: ObservationData = {
      ...data,
      records: data.records.map((r) => (r.id === record.id ? record : r)),
    };
    await this.repository.saveObservations(buildObservationSaveData(data, updated));
  }

  async delete(id: string): Promise<void> {
    const data = await this.getAll();
    const updated: ObservationData = {
      ...data,
      records: data.records.filter((r) => r.id !== id),
    };
    await this.repository.saveObservations(buildObservationSaveData(data, updated));
  }

  async saveCustomTags(tags: readonly string[]): Promise<void> {
    const data = await this.getAll();
    const updated: ObservationData = { ...data, customTags: tags };
    await this.repository.saveObservations(buildObservationSaveData(data, updated));
  }

  async saveCustomCategories(categories: readonly string[]): Promise<void> {
    const data = await this.getAll();
    const updated: ObservationData = { ...data, customCategories: categories };
    await this.repository.saveObservations(buildObservationSaveData(data, updated));
  }

  async deleteByClassId(classId: string): Promise<void> {
    const data = await this.getAll();
    const updated: ObservationData = {
      ...data,
      records: data.records.filter((r) => r.classId !== classId),
    };
    await this.repository.saveObservations(buildObservationSaveData(data, updated));
  }
}
