/**
 * questionTypeStyle — 참여교실 문항 유형의 시각 언어(색·아이콘·무리 이름) 한 곳.
 *
 * 왜 한 곳인가: 유형 선택 모달과 편집 화면 문항 목록이 **같은 색·같은 아이콘**을 써야
 * 선생님이 "아까 고른 그것"을 목록에서 바로 찾는다. 두 군데에 각각 적으면 곧 갈라진다.
 *
 * 색은 퀴즈·토론·설문 세 무리로만 나눈다. 15가지 색을 쓰면 아무것도 구분되지 않는다.
 * `sp-error`(파괴적 액션)와 `sp-muted`(비활성)는 뜻이 정해져 있어 쓰지 않는다.
 *
 * ⚠️ `bg-sp-accent/10` 같은 투명도 수식은 이 저장소에서 **클래스가 생성되지 않는다**.
 *    틴트가 필요하면 단색 토큰이나 opacity 유틸을 쓴다.
 */

import type { ParticipationFormat } from './questionCatalog';
import type { Question, QuestionType } from '@domain/entities/multiSurvey/Question';

export type QuestionGroupKey = 'quiz' | 'debate' | 'survey';

export interface QuestionGroupStyle {
  readonly key: QuestionGroupKey;
  /** 선생님에게 보이는 무리 이름 */
  readonly label: string;
  /** 그 무리로 무엇을 하는지 한 줄 */
  readonly hint: string;
  /** 글자·아이콘 색 */
  readonly text: string;
  /** 채운 배지 배경 */
  readonly fill: string;
  /** 테두리 색 */
  readonly border: string;
}

export const QUESTION_GROUPS: Readonly<Record<QuestionGroupKey, QuestionGroupStyle>> = {
  quiz: {
    key: 'quiz',
    label: '퀴즈',
    hint: '정답을 맞혀요',
    text: 'text-sp-accent',
    fill: 'bg-sp-accent',
    border: 'border-sp-accent',
  },
  debate: {
    key: 'debate',
    label: '토론',
    hint: '입장을 정하고 생각을 나눠요',
    text: 'text-sp-success',
    fill: 'bg-sp-success',
    border: 'border-sp-success',
  },
  survey: {
    key: 'survey',
    label: '설문',
    hint: '의견을 모아 봐요',
    text: 'text-sp-info',
    fill: 'bg-sp-info',
    border: 'border-sp-info',
  },
};

/** Material Symbols 이름. 학생 페이지에는 쓰지 않는다(외부 폰트를 싣지 않는다). */
const FORMAT_ICON: Readonly<Record<ParticipationFormat, string>> = {
  'single-choice': 'radio_button_checked',
  'multi-choice': 'check_box',
  ox: 'rule',
  trafficlight: 'traffic',
  multiple: 'radio_button_checked',
  short: 'short_text',
  blank: 'space_bar',
  text: 'notes',
  description: 'notes',
  numeric: 'calculate',
  valueline: 'linear_scale',
  quadrant: 'scatter_plot',
  scale: 'linear_scale',
  matrix: 'grid_on',
  rating: 'linear_scale',
  pin: 'pin_drop',
  order: 'reorder',
  ranking: 'leaderboard',
  allocation: 'pie_chart',
  brainstorm: 'lightbulb',
  qna: 'lightbulb',
  wordcloud: 'cloud',
};

/**
 * 무엇을 하려는 문항인가로 나눈다. 선생님이 실제로 하는 고민이 "지금 퀴즈를 내려는 건가,
 * 의견을 모으려는 건가, 입장을 나누려는 건가"이기 때문이다.
 *
 * 가르는 기준은 **돌려받고 싶은 것**이다 —
 *   퀴즈: 맞았는지와 점수 · 설문: 몇 명이 무엇을 골랐는지(분포) · 토론: 서로 읽고 견줄 글과 입장.
 */
const FORMAT_GROUP: Readonly<Record<ParticipationFormat, QuestionGroupKey>> = {
  multiple: 'quiz',
  ox: 'quiz',
  short: 'quiz',
  blank: 'quiz',
  description: 'quiz',
  order: 'quiz',
  pin: 'quiz',
  numeric: 'quiz',
  valueline: 'debate',
  quadrant: 'debate',
  scale: 'debate',
  trafficlight: 'debate',
  brainstorm: 'debate',
  qna: 'debate',
  text: 'debate',
  wordcloud: 'debate',
  'single-choice': 'survey',
  'multi-choice': 'survey',
  ranking: 'survey',
  allocation: 'survey',
  matrix: 'survey',
  rating: 'survey',
};

/** 모르는 유형이 와도 화면이 깨지지 않게 하는 기본값 */
const FALLBACK: QuestionGroupStyle = QUESTION_GROUPS.quiz;

export function groupOfFormat(format: ParticipationFormat): QuestionGroupStyle {
  return QUESTION_GROUPS[FORMAT_GROUP[format] ?? 'quiz'] ?? FALLBACK;
}

export function iconOfFormat(format: ParticipationFormat): string {
  return FORMAT_ICON[format] ?? 'help';
}

/**
 * 저장된 문항의 무리.
 * `presentation` 이 붙은 문항(신호등·옛 가치수직선)도 본래 유형을 따른다.
 */
export function groupOfQuestion(question: Question): QuestionGroupStyle {
  // 신호등·옛 가치수직선은 저장될 때 single-choice·scale 로 눕지만 본래 무리는 토론이다.
  if (question.presentation === 'trafficlight') return groupOfFormat('trafficlight');
  if (question.presentation === 'valueline') return groupOfFormat('valueline');
  return groupOfFormat(question.type as ParticipationFormat);
}

export function iconOfQuestion(question: Question): string {
  if (question.presentation === 'trafficlight') return FORMAT_ICON.trafficlight;
  if (question.presentation === 'valueline') return FORMAT_ICON.valueline;
  return iconOfFormat(question.type as ParticipationFormat);
}

/** 유형 문자열이 아는 것인지 — 테스트에서 표가 비지 않았는지 확인할 때 쓴다. */
export function hasStyleFor(type: QuestionType | ParticipationFormat): boolean {
  return type in FORMAT_GROUP && type in FORMAT_ICON;
}
