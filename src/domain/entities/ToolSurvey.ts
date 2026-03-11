export interface ToolSurveyResponse {
  readonly id: string;
  readonly text: string;
  readonly submittedAt: number;
}

export interface ToolSurvey {
  readonly id: string;
  readonly question: string;
  readonly maxLength: number;
  readonly responses: ToolSurveyResponse[];
  readonly isOpen: boolean;
  readonly createdAt: number;
}
