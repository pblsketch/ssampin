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
  /** 대상 인원수(진행률 분모). 응답 가능 번호는 `targetNumbers` 를 본다. */
  readonly targetCount?: number;
  /**
   * 응답할 수 있는 **실제 출석번호 목록**(오름차순).
   *
   * 예전에는 인원수만 저장하고 학생 화면이 `1..인원수` 버튼을 그렸다. 33번까지 있는 반에서 2명이
   * 결번이면 32·33번 학생은 자기 번호가 없어 응답을 못 하고, 결번 번호는 반대로 남았다
   * (2026-09-08 검토 D). 없으면 구형 설문이므로 `1..targetCount` 로 되돌아간다.
   */
  readonly targetNumbers?: readonly number[];
  readonly adminKey?: string;
  readonly pinProtection?: boolean;
  readonly studentPins?: StudentPinMap;
  readonly createdAt: string;
}

export interface SurveyResponse {
  readonly id: string;
  readonly surveyId: string;
  readonly studentNumber: number;
  readonly answers: ReadonlyArray<{
    readonly questionId: string;
    readonly value: string | boolean;
  }>;
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
