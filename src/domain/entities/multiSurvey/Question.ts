/**
 * v1 survey 4종 + v2 quiz 5종 합집합 9종 union.
 * Q11 결정(경로 ①) 반영 — Open Questions Q11 참조.
 *
 * v1 타입(survey): 정답 없음, formatVersion 1 보존용.
 * v2 타입(quiz):   정답·점수·포디움 메카닉, formatVersion 2 신규.
 */
export type QuestionType =
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
  | 'description';

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

/** v1 4종 + v2 5종 합집합 9종 Question union */
export type Question =
  | SingleChoiceQuestion
  | MultiChoiceQuestion
  | TextQuestion
  | ScaleQuestion
  | OXQuestion
  | MultipleQuestion
  | ShortQuestion
  | BlankQuestion
  | DescriptionQuestion;
