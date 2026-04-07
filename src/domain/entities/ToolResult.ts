import type { MultiSurveyTemplateQuestion } from './ToolTemplate';

export type ToolResultType = 'poll' | 'survey' | 'multi-survey' | 'wordcloud';

export type PollResultData = {
  readonly type: 'poll';
  readonly question: string;
  readonly options: readonly { readonly text: string; readonly votes: number; readonly color: string }[];
  readonly totalVotes: number;
};

export type SurveyResultData = {
  readonly type: 'survey';
  readonly question: string;
  readonly responses: readonly { readonly text: string; readonly submittedAt: number }[];
};

export type MultiSurveyResultData = {
  readonly type: 'multi-survey';
  readonly title: string;
  readonly questions: readonly MultiSurveyTemplateQuestion[];
  readonly submissions: readonly {
    readonly id: string;
    readonly answers: readonly { readonly questionId: string; readonly value: string | string[] | number }[];
    readonly submittedAt: number;
  }[];
};

export type WordCloudResultData = {
  readonly type: 'wordcloud';
  readonly question: string;
  readonly words: readonly { readonly word: string; readonly count: number }[];
  readonly totalSubmissions: number;
};

export type ToolResultData =
  | PollResultData
  | SurveyResultData
  | MultiSurveyResultData
  | WordCloudResultData;

export interface ToolResult {
  readonly id: string;
  readonly name: string;
  readonly toolType: ToolResultType;
  readonly data: ToolResultData;
  readonly savedAt: string;
}

export interface ToolResultsData {
  readonly results: readonly ToolResult[];
}
