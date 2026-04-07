import type { MultiSurveyQuestionType } from './MultiSurvey';

export type ToolTemplateType = 'poll' | 'survey' | 'multi-survey' | 'wordcloud';

/** 각 도구별 문항 설계 데이터 */
export type PollTemplateQuestion = {
  readonly question: string;
  readonly options: readonly string[];
};

export type PollTemplateConfig = {
  readonly type: 'poll';
  readonly questions: readonly PollTemplateQuestion[];
};

export type SurveyTemplateConfig = {
  readonly type: 'survey';
  readonly question: string;
  readonly maxLength: number;
};

export type MultiSurveyTemplateQuestion = {
  readonly id: string;
  readonly type: MultiSurveyQuestionType;
  readonly question: string;
  readonly required: boolean;
  readonly options: readonly { readonly id: string; readonly text: string }[];
  readonly maxLength: number;
  readonly scaleMin: number;
  readonly scaleMax: number;
  readonly scaleMinLabel: string;
  readonly scaleMaxLabel: string;
};

export type MultiSurveyTemplateConfig = {
  readonly type: 'multi-survey';
  readonly title: string;
  readonly questions: readonly MultiSurveyTemplateQuestion[];
  readonly stepMode: boolean;
  readonly useStopwords: boolean;
};

export type WordCloudTemplateConfig = {
  readonly type: 'wordcloud';
  readonly question: string;
  readonly maxSubmissions: number;
};

export type ToolTemplateConfig =
  | PollTemplateConfig
  | SurveyTemplateConfig
  | MultiSurveyTemplateConfig
  | WordCloudTemplateConfig;

export interface ToolTemplate {
  readonly id: string;
  readonly name: string;
  readonly toolType: ToolTemplateType;
  readonly config: ToolTemplateConfig;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ToolTemplatesData {
  readonly templates: readonly ToolTemplate[];
}
