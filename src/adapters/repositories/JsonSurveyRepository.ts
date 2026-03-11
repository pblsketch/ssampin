import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { ISurveyRepository } from '@domain/repositories/ISurveyRepository';
import type { SurveysData } from '@domain/entities/Survey';

export class JsonSurveyRepository implements ISurveyRepository {
  constructor(private readonly storage: IStoragePort) {}

  load(): Promise<SurveysData | null> {
    return this.storage.read<SurveysData>('surveys');
  }

  save(data: SurveysData): Promise<void> {
    return this.storage.write('surveys', data);
  }
}
