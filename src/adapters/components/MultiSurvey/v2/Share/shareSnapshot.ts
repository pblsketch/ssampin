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
): ShareSnapshot {
  const question = survey.questions[liveSession.currentQuestionIndex] ?? null;
  const responsesForCurrent = question
    ? liveSession.responses.filter((r) => r.questionId === question.id)
    : [];

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
            ...(liveSession.phase === 'revealed' && question && questionHasAnswer(question)
              ? {
                  answer: correctAnswerLabel(question),
                  explanation: survey.presentationOpts.revealExplanation
                    ? question.explanation
                    : undefined,
                }
              : {}),
            opinions:
              liveSession.phase === 'revealed' && question && !questionHasAnswer(question)
                ? responsesForCurrent.map((r) => ({
                    answer: answerLabel(question, r.answer),
                    reason: r.reason,
                  }))
                : [],
            votes:
              question && liveSession.phase === 'revealed'
                ? liveSession.votesByQuestion?.[question.id]
                : undefined,
            answeredCount: responsesForCurrent.length,
          },
        }
      : {}),
    phase: liveSession.phase,
    currentQuestion: question,
    questionNumber: liveSession.currentQuestionIndex + 1,
    totalQuestions: survey.questions.length,
    responsesForCurrent,
    allResponses: survey.purpose ? [] : liveSession.responses,
    students: survey.purpose
      ? liveSession.students.map((s) => ({ ...s, pin4: '' }))
      : liveSession.students,
    revealExplanation: survey.presentationOpts.revealExplanation,
    allowReentry: survey.presentationOpts.allowReentry,
    entryUrl,
    entryCode,
    hiddenWords: question ? (liveSession.hiddenWordsByQuestion[question.id] ?? []) : [],
  };
}
