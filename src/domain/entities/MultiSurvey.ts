export type MultiSurveyQuestionType = 'single-choice' | 'multi-choice' | 'text' | 'scale';

export interface MultiSurveyQuestion {
  readonly id: string;
  readonly type: MultiSurveyQuestionType;
  readonly question: string;
  readonly required: boolean;
  // For single-choice and multi-choice
  readonly options?: readonly { readonly id: string; readonly text: string }[];
  // For scale
  readonly scaleMin?: number;
  readonly scaleMax?: number;
  readonly scaleMinLabel?: string;
  readonly scaleMaxLabel?: string;
  // For text
  readonly maxLength?: number;
}

export interface MultiSurveyAnswer {
  readonly questionId: string;
  // text → string, single-choice → string (option id), multi-choice → string[], scale → number
  readonly value: string | string[] | number;
}

export interface MultiSurveySubmission {
  readonly id: string;
  readonly answers: readonly MultiSurveyAnswer[];
  readonly submittedAt: number;
}

export interface MultiSurvey {
  readonly id: string;
  readonly title: string;
  readonly questions: readonly MultiSurveyQuestion[];
  readonly submissions: readonly MultiSurveySubmission[];
  readonly isOpen: boolean;
  readonly createdAt: number;
}
