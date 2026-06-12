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

/**
 * Share window에 IPC로 전달되는 스냅샷.
 * liveSession(메모리 전용)이 별도 BrowserWindow에서는 null이므로
 * 필요한 필드를 평탄화해 직렬화 가능한 구조로 전달한다.
 */
export interface ShareSnapshot {
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
  /** 학생 입장 URL (QR 대상). entryCode 는 폐기 — QR+URL 전용 */
  readonly entryUrl: string;
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
): ShareSnapshot {
  const question = survey.questions[liveSession.currentQuestionIndex] ?? null;
  const responsesForCurrent = question
    ? liveSession.responses.filter((r) => r.questionId === question.id)
    : [];

  return {
    phase: liveSession.phase,
    currentQuestion: question,
    questionNumber: liveSession.currentQuestionIndex + 1,
    totalQuestions: survey.questions.length,
    responsesForCurrent,
    allResponses: liveSession.responses,
    students: liveSession.students,
    revealExplanation: survey.presentationOpts.revealExplanation,
    allowReentry: survey.presentationOpts.allowReentry,
    entryUrl,
  };
}
