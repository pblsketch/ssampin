/**
 * 발제 피드백 프리셋 — 교사가 사례나눔·발제·활동 소감을 1클릭으로 시작하는 시나리오.
 *
 * 이 파일은 시스템 기본 제공 프리셋이며, 사용자가 저장한 템플릿(useToolTemplateStore)과는 별개.
 * Plan §3 Feature 3 참고.
 */
import type { MultiSurveyQuestionType } from '@domain/entities/MultiSurvey';

export interface FeedbackPresetQuestion {
  readonly type: MultiSurveyQuestionType;
  readonly question: string;
  readonly options?: readonly string[];
  readonly required: boolean;
  readonly maxLength?: number;
  readonly scaleMin?: number;
  readonly scaleMax?: number;
  readonly scaleMinLabel?: string;
  readonly scaleMaxLabel?: string;
}

export interface FeedbackPreset {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly questions: readonly FeedbackPresetQuestion[];
}

export const FEEDBACK_PRESETS: readonly FeedbackPreset[] = [
  {
    id: 'presentation-quick-feedback',
    label: '발제 퀵 피드백',
    description: '사례나눔·발제 직후 1분 피드백',
    questions: [
      { type: 'text', question: '발제를 보고 떠오르는 키워드는?', required: true, maxLength: 50 },
      { type: 'text', question: '발제 내용 중 가장 인상 깊었던 점은?', required: true, maxLength: 200 },
      {
        type: 'scale',
        question: '발제 내용의 이해도는?',
        required: true,
        scaleMin: 1,
        scaleMax: 5,
        scaleMinLabel: '이해 어려움',
        scaleMaxLabel: '완전히 이해',
      },
      { type: 'text', question: '발제자에게 질문이 있다면?', required: false, maxLength: 200 },
    ],
  },
  {
    id: 'case-sharing-reflection',
    label: '사례나눔 리플렉션',
    description: '수업 사례·교수법 공유 후 성찰',
    questions: [
      { type: 'text', question: '이 사례에서 배울 수 있는 점은?', required: true, maxLength: 200 },
      { type: 'text', question: '나의 수업에 적용해보고 싶은 아이디어는?', required: true, maxLength: 200 },
      {
        type: 'scale',
        question: '사례 공유에 대한 만족도',
        required: true,
        scaleMin: 1,
        scaleMax: 5,
        scaleMinLabel: '매우 불만족',
        scaleMaxLabel: '매우 만족',
      },
      { type: 'text', question: '추가로 나누고 싶은 이야기', required: false, maxLength: 300 },
    ],
  },
  {
    id: 'field-trip-reflection',
    label: '소풍 활동 소감',
    description: '체험학습·활동 후 한줄 소감',
    questions: [
      { type: 'text', question: '오늘 활동에서 떠오르는 단어 3가지', required: true, maxLength: 50 },
      { type: 'text', question: '가장 기억에 남는 순간은?', required: true, maxLength: 200 },
      {
        type: 'scale',
        question: '활동 만족도',
        required: true,
        scaleMin: 1,
        scaleMax: 5,
        scaleMinLabel: '별로였음',
        scaleMaxLabel: '정말 좋았음',
      },
      { type: 'text', question: '다음에 해보고 싶은 활동은?', required: false, maxLength: 200 },
    ],
  },
];
