/**
 * liveBridge — MultiSurvey v2 라이브 진행용 순수 변환 헬퍼.
 *
 * 책임:
 *  - v2 9종 Question union → 학생 페이지 HTML 4종 payload 매핑
 *    (electron/ipc/liveMultiSurveyHTML.ts 의 MultiSurveyQuestionForHTML 은
 *     v1 4종(single-choice/multi-choice/text/scale)만 지원 — quiz 5종은 다운매핑)
 *  - 학생 답변 IPC payload(optionIds/text/scale) → 도메인 Response 변환
 *    (정답 판정·점수 계산은 domain/rules/multiSurveyRules 위임)
 *
 * NOT 책임:
 *  - IPC 호출/구독 — LiveConsoleContainer 가 담당
 *  - phase 전이 — useMultiSurveyV2Store 가 담당
 */

import { isKnownQuestionType, type Question } from '@domain/entities/multiSurvey/Question';
import type { Response } from '@domain/entities/multiSurvey/Response';
import { isAnswerCorrect, calcScore } from '@domain/rules/multiSurveyRules';
import { splitWordInput } from '@domain/rules/wordCloudTally';
import {
  isAdvancedType,
  type AdvancedQuestion,
  type AdvancedPublicQuestion,
} from '@domain/entities/multiSurvey/AdvancedQuestion';
import { parseAdvancedAnswer } from '@domain/rules/advancedQuestionRules';

/**
 * 알 수 없는 문항 유형을 만났을 때 보여줄 안내 문구.
 * 옛 버전 앱이 새 유형을 만나는 경우처럼, 모르는 유형 때문에 화면이 깨지지 않게 한다.
 */
export const UNSUPPORTED_QUESTION_NOTICE = '이 문항은 최신 버전의 쌤핀에서 볼 수 있어요.';

/** 화면이 이해하지 못하는 문항인지 판단 (알 수 없는 유형 관용 처리용) */
export function isSupportedQuestionType(type: string): boolean {
  return isKnownQuestionType(type);
}

/** 학생 페이지 HTML 이 이해하는 4종 문항 payload (global.d.ts startLiveMultiSurvey 와 동일 shape) */
export interface LiveHTMLQuestion {
  interaction?: AdvancedPublicQuestion;
  scored?: boolean;
  allowVoting?: boolean;
  presentation?: 'trafficlight' | 'valueline';
  collectReason?: boolean;
  id: string;
  type: 'single-choice' | 'multi-choice' | 'text' | 'scale';
  question: string;
  required: boolean;
  options?: Array<{ id: string; text: string; imageUrl?: string }>;
  scaleMin?: number;
  scaleMax?: number;
  scaleMinLabel?: string;
  scaleMaxLabel?: string;
  maxLength?: number;
}

/** 학생 답변 IPC payload (electron/ipc/liveMultiSurvey.ts PerAnswer 와 동일 shape) */
export interface LiveAnswerPayload {
  reason?: string;
  attempt?: number;
  submittedAt?: string;
  optionIds?: string[];
  text?: string;
  scale?: number;
}

/** OX 문항을 single-choice 로 다운매핑할 때 쓰는 고정 선택지 id (domain 정답 'O'|'X' 와 일치) */
export const OX_OPTIONS: ReadonlyArray<{ id: string; text: string }> = [
  { id: 'O', text: 'O 맞아요' },
  { id: 'X', text: 'X 아니에요' },
];

/** 단답(short)·빈칸(blank) 퀴즈의 학생 입력 최대 길이 */
const SHORT_ANSWER_MAX_LENGTH = 100;

/**
 * v2 9종 문항을 학생 페이지 HTML 4종 payload 로 매핑.
 *
 * 다운매핑 규칙 (quiz 5종 → v1 4종):
 *  - ox          → single-choice (O/X 고정 선택지, id 가 곧 정답 비교 키)
 *  - multiple    → multi-choice  (choices 의 id 보존 → correctChoiceIds 비교 가능)
 *  - short/blank → text (maxLength 100)
 *  - description → text (maxLength = 문항 maxLength)
 *
 * 정답 판정은 교사 콘솔(renderer)에서 domain rules 로 수행하므로
 * 학생 페이지에는 정답 정보가 전혀 전송되지 않는다 (유출 0).
 */
export function mapQuestionsForLiveHTML(questions: readonly Question[]): LiveHTMLQuestion[] {
  return questions
    .map((q): LiveHTMLQuestion => {
      if (isAdvancedType(q.type)) {
        const advanced = q as AdvancedQuestion;
        return {
          id: q.id,
          type: 'text',
          question: q.text,
          required: true,
          maxLength: 16000,
          interaction: {
            type: advanced.type,
            settings: {
              ...advanced.settings,
              items:
                advanced.type === 'order'
                  ? [...advanced.settings.items].sort((a, b) => a.text.localeCompare(b.text, 'ko'))
                  : advanced.settings.items,
            },
          },
          scored: !!advanced.solution,
          // 아이디어 모으기는 문항 설정으로 투표(공감)를 끌 수 있다.
          // 옛 자료에는 설정이 없으므로 그때는 받는 것으로 본다.
          allowVoting: advanced.type === 'brainstorm' && advanced.settings.allowVoting !== false,
        };
      }
      switch (q.type) {
        case 'single-choice':
        case 'multi-choice':
          return {
            id: q.id,
            type: q.type,
            question: q.text,
            required: true,
            options: q.options.map((o) => ({
              id: o.id,
              text: o.text,
              ...(o.imageUrl ? { imageUrl: o.imageUrl } : {}),
            })),
          };
        case 'text':
          return {
            id: q.id,
            type: 'text',
            question: q.text,
            required: true,
            maxLength: q.maxLength,
          };
        case 'scale':
          return {
            id: q.id,
            type: 'scale',
            question: q.text,
            required: true,
            scaleMin: q.scaleMin,
            scaleMax: q.scaleMax,
            scaleMinLabel: q.scaleMinLabel,
            scaleMaxLabel: q.scaleMaxLabel,
          };
        case 'ox':
          return {
            id: q.id,
            type: 'single-choice',
            question: q.text,
            required: true,
            options: OX_OPTIONS.map((o) => ({ id: o.id, text: o.text })),
          };
        case 'multiple':
          return {
            id: q.id,
            type: q.allowMultiple === false ? 'single-choice' : 'multi-choice',
            question: q.text,
            required: true,
            options: q.choices.map((c) => ({
              id: c.id,
              text: c.text,
              ...(c.imageUrl ? { imageUrl: c.imageUrl } : {}),
            })),
          };
        case 'short':
        case 'blank':
          return {
            id: q.id,
            type: 'text',
            question: q.text,
            required: true,
            maxLength: SHORT_ANSWER_MAX_LENGTH,
          };
        case 'description':
          return {
            id: q.id,
            type: 'text',
            question: q.text,
            required: true,
            maxLength: q.maxLength,
          };
        case 'wordcloud':
          return {
            id: q.id,
            type: 'text',
            question: `${q.text} (쉼표로 구분해 최대 ${q.maxWords}개)`,
            required: true,
            // 단어 상한 × 글자 상한 + 구분자("， ") 여유
            maxLength: q.maxWords * (q.maxWordLength + 2),
          };
        case 'qna':
          return {
            id: q.id,
            type: 'text',
            question: q.text,
            required: true,
            maxLength: q.maxLength,
          };
        default:
          // 알 수 없는 유형(예: 더 새 버전에서 만든 문항) — 깨지지 않고 넘어간다.
          // **배열에서 빼지 않는다**: 학생 페이지는 문항을 인덱스로 가리키고
          // (LiveConsoleContainer 의 questionIndex ↔ survey.questions[i]),
          // 여기서 빼면 그 대응이 어긋나 다른 문항에 답이 붙는다.
          // 그래서 길이를 유지한 채 "볼 수 없는 문항" 안내로 대체한다.
          return {
            id: (q as { id: string }).id,
            type: 'text',
            question: UNSUPPORTED_QUESTION_NOTICE,
            required: false,
            maxLength: 1,
          };
      }
    })
    .map((q, index) => ({
      ...q,
      scored:
        q.scored ?? ['ox', 'multiple', 'short', 'blank'].includes(questions[index]?.type ?? ''),
      allowVoting: q.allowVoting ?? questions[index]?.type === 'qna',
      ...(questions[index]?.presentation ? { presentation: questions[index]?.presentation } : {}),
      ...(questions[index]?.collectReason ? { collectReason: true } : {}),
    }));
}

/**
 * 학생 답변 IPC payload → 도메인 Response.answer 변환.
 * 문항 타입과 payload shape 가 어긋나면 null (무시).
 */
export function mapStudentAnswerToDomain(
  question: Question,
  payload: LiveAnswerPayload,
): Response['answer'] | null {
  if (isAdvancedType(question.type)) {
    const parsed = parseAdvancedAnswer(question as AdvancedQuestion, payload.text);
    return parsed === null ? null : JSON.stringify(parsed);
  }
  switch (question.type) {
    case 'single-choice':
    case 'multi-choice':
    case 'multiple':
      return payload.optionIds && payload.optionIds.length > 0 ? payload.optionIds : null;
    case 'ox': {
      const first = payload.optionIds?.[0];
      return first === 'O' || first === 'X' ? first : null;
    }
    case 'text':
    case 'short':
    case 'blank':
    case 'description':
      return typeof payload.text === 'string' && payload.text.trim().length > 0
        ? payload.text
        : null;
    case 'scale':
      return typeof payload.scale === 'number' && Number.isFinite(payload.scale)
        ? payload.scale
        : null;
    case 'qna':
      return typeof payload.text === 'string' && payload.text.trim().length > 0
        ? payload.text.trim()
        : null;
    case 'wordcloud': {
      if (typeof payload.text !== 'string') return null;
      const words = splitWordInput(payload.text, {
        maxWords: question.maxWords,
        maxWordLength: question.maxWordLength,
      });
      return words.length > 0 ? words : null;
    }
    default:
      // 알 수 없는 유형 — 응답을 만들지 않는다(집계에 섞이지 않게).
      return null;
  }
}

/**
 * 학생 답변 payload 로 도메인 Response 엔티티 생성.
 * 정답 여부(isCorrect)·획득 점수(scoreEarned)는 domain rules 로 계산.
 * payload 가 문항 타입과 어긋나면 null.
 */
export function buildResponseFromLiveAnswer(args: {
  readonly question: Question;
  readonly studentId: string;
  readonly payload: LiveAnswerPayload;
  /** 테스트 주입용. 미지정 시 new Date() */
  readonly now?: () => Date;
}): Response | null {
  const { question, studentId, payload } = args;
  const answer = mapStudentAnswerToDomain(question, payload);
  if (answer === null) return null;

  const submittedAt = payload.submittedAt ?? (args.now ?? (() => new Date()))().toISOString();
  const isCorrect = isAnswerCorrect(question, answer);
  const provisional: Response = {
    id: `${studentId}:${question.id}`,
    studentId,
    questionId: question.id,
    ...(payload.reason ? { reason: payload.reason.slice(0, 500) } : {}),
    ...(payload.attempt ? { attempt: payload.attempt } : {}),
    answer,
    submittedAt,
    isCorrect,
    scoreEarned: 0,
  };
  return { ...provisional, scoreEarned: calcScore(question, provisional) };
}
