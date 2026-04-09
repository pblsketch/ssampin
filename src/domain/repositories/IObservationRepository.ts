import type { ObservationData } from '../entities/Observation';

export interface IObservationRepository {
  getObservations(): Promise<ObservationData | null>;
  saveObservations(data: ObservationData): Promise<void>;
}
