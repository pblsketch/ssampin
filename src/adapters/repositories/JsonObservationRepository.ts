import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IObservationRepository } from '@domain/repositories/IObservationRepository';
import type { ObservationData } from '@domain/entities/Observation';

export class JsonObservationRepository implements IObservationRepository {
  constructor(private readonly storage: IStoragePort) {}

  getObservations(): Promise<ObservationData | null> {
    return this.storage.read<ObservationData>('observations');
  }

  saveObservations(data: ObservationData): Promise<void> {
    return this.storage.write('observations', data);
  }
}
