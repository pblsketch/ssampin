import type {
  MultiSurveyV2,
  ResponseOpts,
  DisplayOpts,
} from '../entities/multiSurvey/MultiSurveyV2';
import {
  isQuizType,
  type Question,
  type SingleChoiceQuestion,
  type MultiChoiceQuestion,
  type OXQuestion,
  type MultipleQuestion,
  type ShortQuestion,
  type BlankQuestion,
  type DescriptionQuestion,
} from '../entities/multiSurvey/Question';
import type { Response } from '../entities/multiSurvey/Response';

// ──────────────────────────────────────────────
// normalizeHangulInitial
// ──────────────────────────────────────────────

/**
 * 초성 변환에 필요한 상수.
 * signatureNameSearch.ts의 로직을 domain 레이어에 복제 (의존성 역방향 위반 방지).
 * 19자 초성 목록 (ㄱ~ㅎ), HANGUL_BASE 0xAC00, 음절당 588개.
 */
const _CHOSUNG_LIST = [
  'ㄱ',
  'ㄲ',
  'ㄴ',
  'ㄷ',
  'ㄸ',
  'ㄹ',
  'ㅁ',
  'ㅂ',
  'ㅃ',
  'ㅅ',
  'ㅆ',
  'ㅇ',
  'ㅈ',
  'ㅉ',
  'ㅊ',
  'ㅋ',
  'ㅌ',
  'ㅍ',
  'ㅎ',
] as const;

const _HANGUL_BASE = 0xac00;
const _HANGUL_LAST = 0xd7a3;
/** 한 초성당 음절 개수 (중성 21 × 종성 28) */
const _SYLLABLES_PER_CHOSUNG = 588;

/**
 * 완성형 한글 문자열을 초성 시퀀스로 변환.
 * 예: "한국" → "ㅎㄱ", "안녕하세요" → "ㅇㄴㅎㅅㅇ".
 * 비한글 문자(영문·숫자·기호)는 그대로 통과.
 * 이미 초성인 문자(ㄱ~ㅎ)도 그대로 통과.
 */
export function normalizeHangulInitial(s: string): string {
  return [...s]
    .map((char) => {
      const code = char.charCodeAt(0);
      // 완성형 한글 음절 범위(AC00~D7A3)만 초성으로 변환
      if (code < _HANGUL_BASE || code > _HANGUL_LAST) return char;
      return _CHOSUNG_LIST[Math.floor((code - _HANGUL_BASE) / _SYLLABLES_PER_CHOSUNG)] ?? char;
    })
    .join('');
}

// ──────────────────────────────────────────────
// validateSession
// ──────────────────────────────────────────────

/**
 * MultiSurveyV2 세션 유효성 검사.
 * - title 비어있으면 오류
 * - questions ≥ 1
 * - 각 문항: timerSeconds > 0, score ≥ 0, type별 shape 유효
 */
export function validateSession(
  session: MultiSurveyV2,
): { ok: true } | { ok: false; errors: readonly string[] } {
  const errors: string[] = [];

  if (!session.title || session.title.trim().length === 0) {
    errors.push('title이 비어 있습니다.');
  }

  if (!session.questions || session.questions.length === 0) {
    errors.push('문항이 1개 이상 필요합니다.');
  } else {
    session.questions.forEach((q, i) => {
      const prefix = `[문항 ${i + 1}(${q.id})]`;

      if (q.timerSeconds <= 0) {
        errors.push(`${prefix} timerSeconds는 0보다 커야 합니다.`);
      }
      if (q.score < 0) {
        errors.push(`${prefix} score는 0 이상이어야 합니다.`);
      }
      if (!q.text || q.text.trim().length === 0) {
        errors.push(`${prefix} text가 비어 있습니다.`);
      }

      // type-specific shape validation
      switch (q.type) {
        case 'single-choice':
        case 'multi-choice': {
          const cq = q as SingleChoiceQuestion | MultiChoiceQuestion;
          if (!cq.options || cq.options.length === 0) {
            errors.push(`${prefix} options가 1개 이상 필요합니다.`);
          }
          break;
        }
        case 'ox': {
          const oq = q as OXQuestion;
          if (oq.correctAnswer !== 'O' && oq.correctAnswer !== 'X') {
            errors.push(`${prefix} correctAnswer는 'O' 또는 'X'여야 합니다.`);
          }
          break;
        }
        case 'multiple': {
          const mq = q as MultipleQuestion;
          if (!mq.choices || mq.choices.length === 0) {
            errors.push(`${prefix} choices가 1개 이상 필요합니다.`);
          }
          if (mq.choices && mq.choices.length > 5) {
            errors.push(`${prefix} choices는 최대 5개입니다.`);
          }
          if (!mq.correctChoiceIds || mq.correctChoiceIds.length === 0) {
            errors.push(`${prefix} correctChoiceIds가 1개 이상 필요합니다.`);
          }
          break;
        }
        case 'short': {
          const sq = q as ShortQuestion;
          if (!sq.acceptedAnswers || sq.acceptedAnswers.length === 0) {
            errors.push(`${prefix} acceptedAnswers가 1개 이상 필요합니다.`);
          }
          break;
        }
        case 'blank': {
          const bq = q as BlankQuestion;
          if (!bq.acceptedAnswers || bq.acceptedAnswers.length === 0) {
            errors.push(`${prefix} acceptedAnswers가 1개 이상 필요합니다.`);
          }
          break;
        }
        case 'description': {
          const dq = q as DescriptionQuestion;
          if (dq.minLength < 0) {
            errors.push(`${prefix} minLength는 0 이상이어야 합니다.`);
          }
          if (dq.maxLength < dq.minLength) {
            errors.push(`${prefix} maxLength는 minLength 이상이어야 합니다.`);
          }
          break;
        }
        // 'text' | 'scale' — 별도 shape 검증 없음
      }
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true };
}

// ──────────────────────────────────────────────
// isAnswerCorrect
// ──────────────────────────────────────────────

/**
 * 응답이 정답인지 판단.
 * - survey 타입(single-choice/multi-choice/text/scale): undefined 반환
 * - quiz 타입(ox/multiple/short/blank/description): boolean 반환
 */
export function isAnswerCorrect(
  question: Question,
  answer: Response['answer'],
): boolean | undefined {
  if (!isQuizType(question.type)) {
    // v1 survey 4종 — 정답 개념 없음
    return undefined;
  }

  switch (question.type) {
    case 'ox': {
      return typeof answer === 'string' && answer === question.correctAnswer;
    }
    case 'multiple': {
      if (!Array.isArray(answer)) return false;
      const submitted = new Set(answer as string[]);
      const correct = new Set(question.correctChoiceIds);
      if (submitted.size !== correct.size) return false;
      for (const id of submitted) {
        if (!correct.has(id)) return false;
      }
      return true;
    }
    case 'short': {
      if (typeof answer !== 'string') return false;
      const normalized = question.caseSensitive ? answer : answer.toLowerCase();
      return question.acceptedAnswers.some((a) => {
        const accepted = question.caseSensitive ? a : a.toLowerCase();
        return normalized === accepted;
      });
    }
    case 'blank': {
      if (typeof answer !== 'string') return false;
      // isHangulInitial === true: 초성 정규화 후 비교.
      // 양쪽(학생 답·acceptedAnswers)을 공백 제거 후 초성으로 변환해 일치 여부 확인.
      // 완성형 입력("한국")도 초성화되므로 "ㅎㄱ"과 "한국" 모두 정답 처리됨.
      if (question.isHangulInitial) {
        const normAnswer = normalizeHangulInitial(answer.replace(/\s+/g, ''));
        return question.acceptedAnswers.some(
          (a) => normalizeHangulInitial(a.replace(/\s+/g, '')) === normAnswer,
        );
      }
      return question.acceptedAnswers.some((a) => answer === a);
    }
    case 'description': {
      if (typeof answer !== 'string') return false;
      return answer.length >= question.minLength && answer.length <= question.maxLength;
    }
  }
}

// ──────────────────────────────────────────────
// calcScore
// ──────────────────────────────────────────────

/**
 * 문항·응답 기준 획득 점수 계산.
 * - survey 타입: 0
 * - quiz 타입: 정답이면 question.score, 오답이면 0
 *
 * TODO: streakBonus / fastSolveBonus / randomBonus는 세션 컨텍스트(누적 상태·제출 시각)가
 * 필요하므로 Phase B에서 세션 레벨 calcSessionScore()로 분리 구현.
 */
export function calcScore(question: Question, response: Response): number {
  if (!isQuizType(question.type)) {
    return 0;
  }
  const correct = isAnswerCorrect(question, response.answer);
  return correct === true ? question.score : 0;
}

// ──────────────────────────────────────────────
// isAutoAdvanceEnabled
// ──────────────────────────────────────────────

/**
 * 자동 진행 활성 여부 (DN-08, Q11 결정 반영).
 *
 * 조건: autoAdvance ON && showPerQuestionScore OFF && timerSeconds > 0 && quiz 타입
 * - survey 타입(v1 4종)은 정답 개념이 없어 자동 진행 설문(퀴즈) 메카닉과 무관.
 */
export function isAutoAdvanceEnabled(
  opts: { autoAdvance: boolean; showPerQuestionScore: boolean },
  question: Question,
): boolean {
  return (
    opts.autoAdvance &&
    !opts.showPerQuestionScore &&
    question.timerSeconds > 0 &&
    isQuizType(question.type)
  );
}

// ──────────────────────────────────────────────
// groupResponsesByChoice
// ──────────────────────────────────────────────

/**
 * 선택지별 응답 집계 (DN-05).
 * choice 타입(single-choice / multi-choice / ox / multiple)에만 의미 있음.
 * 그 외 타입은 빈 배열 반환.
 *
 * 반환: { choiceId, count, ratio }[]
 * ratio = count / totalResponses (totalResponses === 0이면 0)
 */
export function groupResponsesByChoice(
  responses: readonly Response[],
  question: Question,
): readonly { choiceId: string; count: number; ratio: number }[] {
  // choice 타입만 처리
  if (
    question.type !== 'single-choice' &&
    question.type !== 'multi-choice' &&
    question.type !== 'ox' &&
    question.type !== 'multiple'
  ) {
    return [];
  }

  // choiceId 목록 수집
  let choiceIds: readonly string[];
  if (question.type === 'ox') {
    choiceIds = ['O', 'X'] as const;
  } else if (question.type === 'single-choice' || question.type === 'multi-choice') {
    choiceIds = (question as SingleChoiceQuestion | MultiChoiceQuestion).options.map((o) => o.id);
  } else {
    // multiple
    choiceIds = (question as MultipleQuestion).choices.map((c) => c.id);
  }

  const counts = new Map<string, number>();
  for (const id of choiceIds) {
    counts.set(id, 0);
  }

  // 응답 집계
  for (const r of responses) {
    const ans = r.answer;
    if (Array.isArray(ans)) {
      for (const id of ans as string[]) {
        if (counts.has(id)) {
          counts.set(id, (counts.get(id) ?? 0) + 1);
        }
      }
    } else if (typeof ans === 'string') {
      if (counts.has(ans)) {
        counts.set(ans, (counts.get(ans) ?? 0) + 1);
      }
    }
  }

  const total = responses.length;

  return choiceIds.map((id) => {
    const count = counts.get(id) ?? 0;
    return {
      choiceId: id,
      count,
      ratio: total > 0 ? count / total : 0,
    };
  });
}

// ──────────────────────────────────────────────
// calcAccuracy
// ──────────────────────────────────────────────

/**
 * 정답률 계산 (DN-02).
 * isCorrect === undefined인 응답(설문 타입)은 분모에서 제외.
 * quiz 응답이 0건이면 0 반환.
 */
export function calcAccuracy(responses: readonly Response[]): number {
  const quizResponses = responses.filter((r) => r.isCorrect !== undefined);
  if (quizResponses.length === 0) return 0;
  const correctCount = quizResponses.filter((r) => r.isCorrect === true).length;
  return correctCount / quizResponses.length;
}

// ──────────────────────────────────────────────
// calcSessionScore
// ──────────────────────────────────────────────

/**
 * 세션 점수 계산 컨텍스트 — 호출자(adapter)가 누적 상태를 주입.
 * domain 규칙: Date.now()/Math.random() 직접 호출 금지. rng·시각은 주입식.
 */
export interface SessionScoreContext {
  readonly question: Question;
  /** isCorrect 이미 계산된 Response */
  readonly response: Response;
  /** 문항 open 시각 (ISO 8601) — 빠른 풀이 측정 기준 */
  readonly questionOpenedAt: string;
  /** 직전까지 연속 정답 수 (이번 문항 정답 전 누적) */
  readonly currentStreak: number;
  /** 응답 설정 토글 — fastSolveBonus/streakBonus/randomBonus 확인용 */
  readonly opts: ResponseOpts;
  /**
   * 랜덤 보너스용 주입식 rng. 0~1 반환.
   * 미지정 시 () => 0 처리 → random 보너스 0 (테스트 결정성 보장).
   */
  readonly rng?: () => number;
}

/** 세션 점수 분해 내역 */
export interface SessionScoreBreakdown {
  /** 정답이면 question.score, 아니면 0 */
  readonly base: number;
  /** 빠른 풀이 보너스 (opts.fastSolveBonus ON 시) */
  readonly fastSolve: number;
  /** 연속 정답 보너스 (opts.streakBonus ON 시) */
  readonly streak: number;
  /** 랜덤 보너스 (opts.randomBonus ON 시) */
  readonly random: number;
  readonly total: number;
}

/**
 * 세션 점수 계산 (Phase B 작업 3).
 *
 * 산식:
 * - base: 정답이면 question.score, 오답/survey 타입이면 0. 오답이면 보너스 전부 0 조기 반환.
 * - fastSolve (opts.fastSolveBonus ON):
 *     elapsed = (submittedAt - questionOpenedAt) / 1000 (초)
 *     ratio   = clamp(1 - elapsed / timerSeconds, 0, 1)
 *     결과    = round(question.score × 0.5 × ratio)  ← 최대 base의 50%
 *     timerSeconds ≤ 0이면 0
 * - streak (opts.streakBonus ON): min(currentStreak, 5) × 2  ← 최대 +10
 * - random (opts.randomBonus ON): floor((rng() ?? 0) × 6) → 0~5점
 * - total: base + fastSolve + streak + random
 */
export function calcSessionScore(ctx: SessionScoreContext): SessionScoreBreakdown {
  const { question, response, questionOpenedAt, currentStreak, opts, rng } = ctx;

  // survey 타입이거나 오답이면 보너스 포함 전부 0
  if (!isQuizType(question.type) || response.isCorrect !== true) {
    return { base: 0, fastSolve: 0, streak: 0, random: 0, total: 0 };
  }

  const base = question.score;

  // ── fastSolve ──────────────────────────────
  let fastSolve = 0;
  if (opts.fastSolveBonus && question.timerSeconds > 0) {
    const openedMs = Date.parse(questionOpenedAt);
    const submittedMs = Date.parse(response.submittedAt);
    if (!isNaN(openedMs) && !isNaN(submittedMs)) {
      // elapsed(초), ratio: 0초 경과 → 1.0, timer 초과 → 0
      const elapsed = (submittedMs - openedMs) / 1000;
      const ratio = Math.max(0, Math.min(1, 1 - elapsed / question.timerSeconds));
      fastSolve = Math.round(question.score * 0.5 * ratio);
    }
    // openedAt 파싱 실패(NaN)면 fastSolve 0 유지
  }

  // ── streak ────────────────────────────────
  // currentStreak는 이번 정답 직전까지 누적. 상한 5회(최대 +10점)
  const streak = opts.streakBonus ? Math.min(currentStreak, 5) * 2 : 0;

  // ── random ────────────────────────────────
  // rng 미지정 시 0 → random 0 (테스트 결정성)
  const random = opts.randomBonus ? Math.floor((rng?.() ?? 0) * 6) : 0;

  const total = base + fastSolve + streak + random;
  return { base, fastSolve, streak, random, total };
}

// Re-export helpers needed by consumers
export { isQuizType } from '../entities/multiSurvey/Question';
export type { ResponseOpts, DisplayOpts };
