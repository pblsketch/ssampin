import type { SurveysData } from '../entities/Survey';

export interface ISurveyRepository {
  load(): Promise<SurveysData | null>;
  save(data: SurveysData): Promise<void>;
}
