import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IConsultationRepository } from '@domain/repositories/IConsultationRepository';
import type { ConsultationsData } from '@domain/entities/Consultation';

export class JsonConsultationRepository implements IConsultationRepository {
  constructor(private readonly storage: IStoragePort) {}

  load(): Promise<ConsultationsData | null> {
    return this.storage.read<ConsultationsData>('consultations');
  }

  save(data: ConsultationsData): Promise<void> {
    return this.storage.write('consultations', data);
  }
}
