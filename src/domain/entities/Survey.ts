export interface SurveyResponse {
  readonly id: string;
  readonly text: string;
  readonly submittedAt: number;
}

export interface Survey {
  readonly id: string;
  readonly question: string;
  readonly maxLength: number;
  readonly responses: SurveyResponse[];
  readonly isOpen: boolean;
  readonly createdAt: number;
}
