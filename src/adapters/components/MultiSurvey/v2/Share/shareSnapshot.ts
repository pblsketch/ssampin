/**
 * shareSnapshot.ts — LiveSession + MultiSurveyV2 → ShareSnapshot 순수 변환기.
 *
 * IPC를 통해 별도 BrowserWindow(Share view)에 전달되므로
 * JSON-직렬화 가능한 순수 값만 포함한다 (클래스 인스턴스·함수·Date 객체 불가).
 *
 * remainingSeconds 는 의도적으로 제외:
 * ClassroomShareView 가 question.timerSeconds 기반 자체 setInterval 카운트다운을 갖고 있어
 * IPC 전송 없이도 올바르게 동작한다.
 */

import type { LivePhase } from '@domain/entities/multiSurvey/LiveSession';
import type { StudentProfile } from '@domain/entities/multiSurvey/LiveSession';
import type { Response } from '@domain/entities/multiSurvey/Response';
import type { Question } from '@domain/entities/multiSurvey/Question';
import type { LiveSession } from '@domain/entities/multiSurvey/LiveSession';
import type { MultiSurveyV2 } from '@domain/entities/multiSurvey/MultiSurveyV2';
import {
  answerLabel,
  correctAnswerLabel,
  participationStandings,
  questionHasAnswer,
} from '@domain/rules/participationRules';
import {
  mayShowAnswer,
  mayShowResults,
  participationStage,
} from '@domain/rules/participationStage';
import type { EntryAccessKind } from '@domain/rules/participationEntry';

/**
 * 교실 화면 창으로 보내기 전에 **정답을 도려낸다.**
 *
 * 화면이 그리지 않더라도 자료가 그 창에 있으면 개발자 도구·화면 녹화·확장 프로그램으로
 * 샐 수 있다. 실제로 응답을 받는 중에도 `correctChoiceIds` 가 통째로 실려 나가고 있었다.
 * 정답을 공개하기 전까지는 **보낼 필요가 없는 값은 보내지 않는다.**
 */
function withoutAnswer(question: Question): Question {
  const stripped = { ...(question as unknown as Record<string, unknown>) };
  // 배열 자리는 **지우지 말고 비운다.** 없애 버리면 그것을 읽는 화면이 터진다
  // (교실 화면의 결과 그림이 `correctChoiceIds.includes(...)` 로 정답 표시를 고른다).
  if ('correctChoiceIds' in stripped) stripped['correctChoiceIds'] = [];
  if ('acceptedAnswers' in stripped) stripped['acceptedAnswers'] = [];
  delete stripped['correctAnswer'];
  delete stripped['solution'];
  delete stripped['explanation'];
  return stripped as unknown as Question;
}

/**
 * Share window에 IPC로 전달되는 스냅샷.
 * liveSession(메모리 전용)이 별도 BrowserWindow에서는 null이므로
 * 필요한 필드를 평탄화해 직렬화 가능한 구조로 전달한다.
 */
export interface ShareSnapshot {
  readonly participation?: {
    readonly title: string;
    readonly purpose: 'quiz' | 'discussion' | 'activity';
    readonly ranking: readonly { nickname: string; rank: number; score: number }[];
    readonly answer?: string;
    readonly explanation?: string;
    readonly opinions: readonly { answer: string; reason?: string }[];
    readonly votes?: readonly import('@domain/entities/multiSurvey/ParticipationVote').ParticipationVote[];
    readonly answeredCount: number;
    /** 진행 단계 — 교실 화면이 마감·공개를 구분해 그리는 기준 */
    readonly stage: import('@domain/rules/participationStage').ParticipationStage;
  };
  /** 렌더러 6단계 phase */
  readonly phase: LivePhase;
  /** 현재 문항 (없으면 null) */
  readonly currentQuestion: Question | null;
  /** 현재 문항 번호 (1-based) */
  readonly questionNumber: number;
  /** 전체 문항 수 */
  readonly totalQuestions: number;
  /** 현재 문항에 대한 응답만 필터링 */
  readonly responsesForCurrent: readonly Response[];
  /** 전체 응답 (round_result/podium 순위 계산용) */
  readonly allResponses: readonly Response[];
  /** 진행 단계 (참여 활동이 아닐 때도 채운다) */
  readonly stage: import('@domain/rules/participationStage').ParticipationStage;
  /** 현재 문항이 정답을 쓰는 문항인가 (정답을 도려낸 뒤에도 판단할 수 있게) */
  readonly currentQuestionScored: boolean;
  /** 입장한 학생 목록 */
  readonly students: readonly StudentProfile[];
  /** T02: 해설 노출 여부 */
  readonly revealExplanation: boolean;
  /** T03: 재입장 가능 여부 (진행 중 입장 코드 배너 표시 결정) */
  readonly allowReentry: boolean;
  /** 학생 입장 URL (QR 대상) */
  readonly entryUrl: string;
  /**
   * 짧은 입장 코드. 없으면 null(짧은 주소 발급 실패 → 같은 Wi-Fi 주소만 안내).
   * 2026-06-12에 "코드 폐기, QR+URL 전용"으로 정했던 것을 되돌린 값이다 —
   * QR을 못 찍는 학생이 긴 주소를 타이핑해야 하는 문제가 실제로 있었다.
   */
  readonly entryCode: string | null;
  /**
   * 지금 안내하는 주소의 종류. 교실 화면도 이걸 알아야 한다 —
   * 아직 주소가 없는데 빈 칸을 띄우거나, 같은 Wi-Fi 주소를 인터넷 주소인 양
   * 보여 주면 학생이 못 들어온다. (설계: domain/rules/participationEntry.ts)
   */
  readonly entryKind: EntryAccessKind;
  /**
   * 현재 문항에서 교사가 숨긴 단어(정규화된 키).
   * 워드클라우드 문항에서만 의미가 있다.
   */
  readonly hiddenWords: readonly string[];
}

/**
 * LiveSession + MultiSurveyV2 + entryUrl → ShareSnapshot 변환.
 *
 * 순수 함수 — 사이드이펙트 없음, 동일 입력 시 동일 출력.
 */
export function buildShareSnapshot(
  liveSession: LiveSession,
  survey: MultiSurveyV2,
  entryUrl: string,
  entryCode: string | null = null,
  entryKind: EntryAccessKind = 'internet',
): ShareSnapshot {
  const question = survey.questions[liveSession.currentQuestionIndex] ?? null;
  const stage = participationStage(liveSession);
  const scored = !!question && questionHasAnswer(question);
  /**
   * 마감·공개를 나눈 것은 **퀴즈·설문·토론 활동**(`purpose` 가 있는 것)뿐이다.
   * 옛 멀티설문 v2 경로는 `phase` 하나로 돌아가므로 건드리지 않는다.
   */
  const participationMode = !!survey.purpose;
  const answerVisible = participationMode
    ? mayShowAnswer(stage, question)
    : liveSession.phase === 'revealed';
  const resultsVisible = participationMode ? mayShowResults(stage, question) : true;
  const allResponsesForCurrent = question
    ? liveSession.responses.filter((r) => r.questionId === question.id)
    : [];
  // 공개하기 전에는 응답 원문도 보내지 않는다 — 뒷자리에서 안 보여도 창 안에는 남는다.
  const responsesForCurrent = participationMode && !resultsVisible ? [] : allResponsesForCurrent;

  return {
    ...(survey.purpose
      ? {
          participation: {
            title: survey.title,
            purpose: survey.purpose,
            ranking:
              survey.competitionMode && liveSession.rankingVisible
                ? participationStandings(liveSession)
                    .filter((r) => r.rank <= 3)
                    .map(({ nickname, rank, score }) => ({ nickname, rank, score }))
                : [],
            ...(answerVisible && question
              ? {
                  answer: correctAnswerLabel(question),
                  explanation: survey.presentationOpts.revealExplanation
                    ? question.explanation
                    : undefined,
                }
              : {}),
            opinions:
              resultsVisible && question && !questionHasAnswer(question)
                ? responsesForCurrent.map((r) => ({
                    answer: answerLabel(question, r.answer),
                    reason: r.reason,
                  }))
                : [],
            votes:
              question && resultsVisible && stage !== 'collecting'
                ? liveSession.votesByQuestion?.[question.id]
                : undefined,
            // 응답 현황은 공개 여부와 무관하게 보여 준다 — 몇 명이 냈는지는 정답이 아니다.
            answeredCount: allResponsesForCurrent.length,
            stage,
          },
        }
      : {}),
    phase: liveSession.phase,
    currentQuestion:
      question && participationMode && !answerVisible ? withoutAnswer(question) : question,
    /**
     * 이 문항이 정답을 쓰는 문항인가. `currentQuestion` 에서 정답을 도려내면
     * `questionHasAnswer()` 가 더는 판단하지 못하므로 따로 실어 보낸다.
     */
    currentQuestionScored: scored,
    questionNumber: liveSession.currentQuestionIndex + 1,
    totalQuestions: survey.questions.length,
    responsesForCurrent,
    allResponses: survey.purpose ? [] : liveSession.responses,
    stage,
    students: survey.purpose
      ? liveSession.students.map((s) => ({ ...s, pin4: '' }))
      : liveSession.students,
    revealExplanation: survey.presentationOpts.revealExplanation,
    allowReentry: survey.presentationOpts.allowReentry,
    entryUrl,
    entryCode,
    entryKind,
    hiddenWords: question ? (liveSession.hiddenWordsByQuestion[question.id] ?? []) : [],
  };
}
