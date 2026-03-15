export type SurveyMode = 'teacher' | 'student';

/** 학생 번호(1-indexed) → 4자리 PIN 매핑 */
export type StudentPinMap = Readonly<Record<number, string>>;

export type QuestionType = 'yesno' | 'choice' | 'text';

export interface SurveyQuestion {
  readonly id: string;
  readonly label: string;
  readonly type: QuestionType;
  readonly options?: readonly string[];
  readonly required: boolean;
}

export interface Survey {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly questions: readonly SurveyQuestion[];
  readonly mode: SurveyMode;
  readonly shareUrl?: string;
  readonly shortUrl?: string;
  readonly dueDate?: string;
  readonly categoryColor: string;
  readonly classId?: string;
  readonly isArchived: boolean;
  readonly targetCount?: number;
  readonly adminKey?: string;
  readonly pinProtection?: boolean;
  readonly studentPins?: StudentPinMap;
  readonly createdAt: string;
}

export interface SurveyResponse {
  readonly id: string;
  readonly surveyId: string;
  readonly studentNumber: number;
  readonly answers: ReadonlyArray<{ readonly questionId: string; readonly value: string | boolean }>;
  readonly submittedAt: string;
}

export interface SurveyLocalEntry {
  readonly studentId: string;
  readonly questionId: string;
  readonly value: string | boolean;
  readonly updatedAt: string;
}

export interface SurveyLocalData {
  readonly surveyId: string;
  readonly entries: readonly SurveyLocalEntry[];
  readonly studentMemos?: Readonly<Record<string, string>>;
}

export type SurveysData = {
  surveys: readonly Survey[];
  localData: readonly SurveyLocalData[];
};
