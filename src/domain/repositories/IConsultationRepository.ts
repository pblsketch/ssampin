import type { ConsultationsData } from '../entities/Consultation';

export interface IConsultationRepository {
  load(): Promise<ConsultationsData | null>;
  save(data: ConsultationsData): Promise<void>;
}
