import type { ObservationRecord, ObservationData } from '@domain/entities/Observation';
import type { IObservationRepository } from '@domain/repositories/IObservationRepository';

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
    await this.repository.saveObservations(updated);
  }

  async update(record: ObservationRecord): Promise<void> {
    const data = await this.getAll();
    const updated: ObservationData = {
      ...data,
      records: data.records.map((r) => (r.id === record.id ? record : r)),
    };
    await this.repository.saveObservations(updated);
  }

  async delete(id: string): Promise<void> {
    const data = await this.getAll();
    const updated: ObservationData = {
      ...data,
      records: data.records.filter((r) => r.id !== id),
    };
    await this.repository.saveObservations(updated);
  }

  async saveCustomTags(tags: readonly string[]): Promise<void> {
    const data = await this.getAll();
    const updated: ObservationData = { ...data, customTags: tags };
    await this.repository.saveObservations(updated);
  }

  async deleteByClassId(classId: string): Promise<void> {
    const data = await this.getAll();
    const updated: ObservationData = {
      ...data,
      records: data.records.filter((r) => r.classId !== classId),
    };
    await this.repository.saveObservations(updated);
  }
}
