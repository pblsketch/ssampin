/**
 * v1 survey 4종 + v2 quiz 5종 + v2 의견 수집 2종 합집합 11종 union.
 * Q11 결정(경로 ①) 반영 — Open Questions Q11 참조.
 *
 * v1 타입(survey):    정답 없음, formatVersion 1 보존용.
 * v2 타입(quiz):      정답·점수·포디움 메카닉, formatVersion 2 신규.
 * v2 타입(의견 수집): 정답 없음. 반 전체의 응답을 한 화면에 모아 보여주는 용도.
 *                     formatVersion은 2를 유지한다(올리지 않는다).
 */
import type { AdvancedQuestion, AdvancedQuestionType } from './AdvancedQuestion';
import { ADVANCED_TYPES } from './AdvancedQuestion';

export type QuestionType =
  | AdvancedQuestionType
  // v1 survey (정답 없음)
  | 'single-choice'
  | 'multi-choice'
  | 'text'
  | 'scale'
  // v2 quiz (정답 있음)
  | 'ox'
  | 'multiple'
  | 'short'
  | 'blank'
  | 'description'
  // v2 의견 수집 (정답 없음)
  | 'wordcloud'
  | 'qna';

/**
 * 퀴즈 메카닉(정답·점수·포디움)을 적용할 수 있는 v2 타입 narrowing.
 * DN-08: isAutoAdvanceEnabled 조건에도 사용.
 */
export type QuizQuestionType = 'ox' | 'multiple' | 'short' | 'blank' | 'description';

/** t가 quiz 타입인지 narrowing — 설문 타입(v1 4종)은 false */
export function isQuizType(t: QuestionType): t is QuizQuestionType {
  return t === 'ox' || t === 'multiple' || t === 'short' || t === 'blank' || t === 'description';
}

/** 모든 Question 공통 필드 */
export interface QuestionBase {
  readonly presentation?: 'trafficlight' | 'valueline';
  readonly collectReason?: boolean;
  readonly id: string;
  readonly type: QuestionType;
  readonly text: string;
  /** 보기 이미지 URL (Phase B 이후 인앱 그리기 별도) */
  readonly mediaUrl?: string;
  readonly explanation?: string;
  /** 문항 제한 시간(초). 기본 20 */
  readonly timerSeconds: number;
  /** 문항 점수. 기본 10. 설문 타입은 0 */
  readonly score: number;
}

/** 객관식 선택지 */
export interface Choice {
  readonly imageUrl?: string;
  readonly id: string;
  readonly text: string;
}

// ──────────────────────────────────────────────
// v1 survey 4종
// ──────────────────────────────────────────────

/** 단일 선택 (v1) — 정답 없음 */
export interface SingleChoiceQuestion extends QuestionBase {
  readonly type: 'single-choice';
  readonly options: readonly Choice[];
}

/** 복수 선택 (v1) — 정답 없음 */
export interface MultiChoiceQuestion extends QuestionBase {
  readonly type: 'multi-choice';
  readonly options: readonly Choice[];
}

/** 단답 주관식 (v1) — 정답 없음 */
export interface TextQuestion extends QuestionBase {
  readonly type: 'text';
  readonly maxLength?: number;
}

/** 척도 (v1) — 정답 없음 */
export interface ScaleQuestion extends QuestionBase {
  readonly type: 'scale';
  readonly scaleMin: number;
  readonly scaleMax: number;
  readonly scaleMinLabel?: string;
  readonly scaleMaxLabel?: string;
}

// ──────────────────────────────────────────────
// v2 quiz 5종
// ──────────────────────────────────────────────

/** OX 퀴즈 (v2) */
export interface OXQuestion extends QuestionBase {
  readonly type: 'ox';
  readonly correctAnswer: 'O' | 'X';
}

/** 객관식 퀴즈 — 최대 5개 선택지, 복수 정답 가능 (v2) */
export interface MultipleQuestion extends QuestionBase {
  readonly allowMultiple?: boolean;
  readonly type: 'multiple';
  /** 최대 5개 */
  readonly choices: readonly Choice[];
  /** 복수 정답 허용 (체크박스 방식) */
  readonly correctChoiceIds: readonly string[];
}

/** 단답 정답 퀴즈 (v2) */
export interface ShortQuestion extends QuestionBase {
  readonly type: 'short';
  readonly acceptedAnswers: readonly string[];
  readonly caseSensitive: boolean;
}

/**
 * 빈칸 채우기 퀴즈 (v2).
 * isHangulInitial: 초성 입력 모드.
 * TODO(Phase B): 초성 비교 helper 구현 — Phase B에서 normalizeHangulInitial() 추가.
 */
export interface BlankQuestion extends QuestionBase {
  readonly type: 'blank';
  readonly acceptedAnswers: readonly string[];
  readonly isHangulInitial: boolean;
}

/** 서술형 퀴즈 — 최소/최대 글자 수 기준 (v2) */
export interface DescriptionQuestion extends QuestionBase {
  readonly type: 'description';
  readonly minLength: number;
  readonly maxLength: number;
}

// ──────────────────────────────────────────────
// v2 의견 수집 2종 (정답·점수 없음)
// ──────────────────────────────────────────────

/** 워드클라우드 기본값 — 메이커 UI와 학생 입력 상한이 같은 값을 쓴다. */
export const WORDCLOUD_DEFAULT_MAX_WORDS = 3;
export const WORDCLOUD_MAX_WORDS_LIMIT = 5;
export const WORDCLOUD_DEFAULT_MAX_WORD_LENGTH = 10;
/** 질문 받기 기본 최대 글자 수 */
export const QNA_DEFAULT_MAX_LENGTH = 100;
/**
 * 의견 수집 문항의 기본 제한 시간(초).
 * `validateSession`이 모든 문항에 timerSeconds > 0을 요구하므로 값이 필요하다.
 * 실제 카운트다운은 자동 넘김이 켜져 있을 때만 돈다.
 */
export const OPINION_DEFAULT_TIMER_SECONDS = 60;

/**
 * 워드클라우드 (v2 의견 수집).
 * 학생이 낸 단어를 빈도에 따라 글자 크기를 키워 한 화면에 모아 보여준다.
 * 정답·점수·순위 개념이 없다.
 */
export interface WordCloudQuestion extends QuestionBase {
  readonly type: 'wordcloud';
  /** 한 학생이 낼 수 있는 최대 단어 수 (1~WORDCLOUD_MAX_WORDS_LIMIT) */
  readonly maxWords: number;
  /** 단어 하나의 최대 글자 수 */
  readonly maxWordLength: number;
}

/**
 * 질문 받기 (v2 의견 수집).
 * 학생이 익명으로 질문을 낸다. 교실 화면에는 이름을 표시하지 않고,
 * 교사 콘솔에서만 누가 냈는지 보인다(표시 책임은 adapters).
 */
export interface QnaQuestion extends QuestionBase {
  readonly type: 'qna';
  readonly maxLength: number;
}

/** v1 4종 + v2 quiz 5종 + v2 의견 수집 2종 합집합 11종 Question union */
export type Question =
  | AdvancedQuestion
  | SingleChoiceQuestion
  | MultiChoiceQuestion
  | TextQuestion
  | ScaleQuestion
  | OXQuestion
  | MultipleQuestion
  | ShortQuestion
  | BlankQuestion
  | DescriptionQuestion
  | WordCloudQuestion
  | QnaQuestion;

/** 의견 수집 타입 narrowing — 정답·점수가 없고 응답을 모아 보여주는 유형 */
export type OpinionQuestionType = 'wordcloud' | 'qna';

export function isOpinionType(t: QuestionType): t is OpinionQuestionType {
  return t === 'wordcloud' || t === 'qna';
}

/** 이 버전이 아는 문항 유형 전체 (11종) */
export const KNOWN_QUESTION_TYPES: readonly QuestionType[] = [
  ...ADVANCED_TYPES,
  'single-choice',
  'multi-choice',
  'text',
  'scale',
  'ox',
  'multiple',
  'short',
  'blank',
  'description',
  'wordcloud',
  'qna',
];

/**
 * 저장된 데이터의 유형 문자열이 이 버전이 아는 유형인지 판단.
 * 더 새 버전에서 만든 문항을 만나도 화면이 깨지지 않게 하는 관용 처리의 기준점이다.
 */
export function isKnownQuestionType(type: string): type is QuestionType {
  return (KNOWN_QUESTION_TYPES as readonly string[]).includes(type);
}
