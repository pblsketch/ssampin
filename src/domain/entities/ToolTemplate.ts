import type { MultiSurveyQuestionType } from './MultiSurvey';

export type ToolTemplateType = 'poll' | 'survey' | 'multi-survey' | 'wordcloud' | 'discussion';

/** 각 도구별 문항 설계 데이터 */
export type PollTemplateQuestion = {
  readonly question: string;
  readonly options: readonly string[];
};

export type PollTemplateConfig = {
  readonly type: 'poll';
  readonly questions: readonly PollTemplateQuestion[];
  /** 실시간 답변 확인 토글 (옵션, 기본 false). 누락 시 false로 fallback. */
  readonly realtimeResponseView?: boolean;
};

export type SurveyTemplateConfig = {
  readonly type: 'survey';
  readonly question: string;
  readonly maxLength: number;
  /** 실시간 답변 확인 토글 (옵션, 기본 false). 누락 시 false로 fallback. */
  readonly realtimeResponseView?: boolean;
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
  /** 실시간 답변 확인 토글 (옵션, 기본 false, 세션 단위). 누락 시 false로 fallback. */
  readonly realtimeResponseView?: boolean;
};

export type WordCloudTemplateConfig = {
  readonly type: 'wordcloud';
  readonly question: string;
  readonly maxSubmissions: number;
};

export type DiscussionTemplateConfig = {
  readonly type: 'discussion';
  readonly toolType: 'valueline' | 'trafficlight';
  readonly topics: readonly string[];
};

export type ToolTemplateConfig =
  | PollTemplateConfig
  | SurveyTemplateConfig
  | MultiSurveyTemplateConfig
  | WordCloudTemplateConfig
  | DiscussionTemplateConfig;

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
