/**
 * participationStage — 퀴즈·설문·토론 진행 단계를 **한 곳에서** 계산한다.
 *
 * 왜 있나: 진행이 세 축으로 나뉘었기 때문이다.
 *   ① 응답을 받는 중인가 / 마감했는가   (`phase`)
 *   ② 응답 분포를 공개했는가            (`resultsPublished`)
 *   ③ 정답·해설을 공개했는가            (`answerPublished`)
 *
 * 교사 콘솔·교실 화면·교실 화면 스냅샷이 각자 이 셋을 조합하면 곧 어긋난다.
 * (실제로 옛 구조에서는 "마감"이 곧 "공개"였고, 교실 화면 자료에 정답이 실려 나갔다.)
 *
 * `phase === 'revealed'` 는 **"응답 마감됨"** 을 뜻한다. 이름은 옛 자료·12개 화면이
 * 쓰고 있어 그대로 두고, 사람에게 보이는 말은 이 파일의 `stageLabel` 로 통일한다.
 */

import type { LivePhase, LiveSession } from '../entities/multiSurvey/LiveSession';
import type { Question } from '../entities/multiSurvey/Question';
import { questionHasAnswer } from './participationRules';

/** 교사·학생·교실 화면이 함께 쓰는 진행 단계 */
export type ParticipationStage =
  /** 학생 입장 대기 */
  | 'lobby'
  /** 응답 받는 중 */
  | 'collecting'
  /** 응답 마감 · 아직 아무것도 공개하지 않음 */
  | 'closed'
  /** 응답 분포 공개 */
  | 'results'
  /** 정답·해설까지 공개 */
  | 'answer'
  /** 활동 종료 */
  | 'finished';

interface StageInput {
  readonly phase: LivePhase;
  readonly resultsPublished?: boolean;
  readonly answerPublished?: boolean;
}

/** 진행 단계 계산. 정답 공개는 결과 공개보다 위다(정답을 공개하면 결과도 본다). */
export function participationStage(live: StageInput): ParticipationStage {
  if (live.phase === 'lobby') return 'lobby';
  if (live.phase === 'end' || live.phase === 'podium') return 'finished';
  if (live.phase === 'open') return 'collecting';
  // revealed | round_result — 마감 이후
  if (live.answerPublished) return 'answer';
  if (live.resultsPublished) return 'results';
  return 'closed';
}

/** 교사 화면에 그대로 쓰는 한국어 이름 */
export function stageLabel(stage: ParticipationStage): string {
  switch (stage) {
    case 'lobby':
      return '학생 입장 대기';
    case 'collecting':
      return '응답 받는 중';
    case 'closed':
      return '응답 마감됨';
    case 'results':
      return '결과 공개 중';
    case 'answer':
      return '정답까지 공개';
    case 'finished':
      return '활동 종료';
  }
}

/** 응답 분포를 학생·교실 화면에 보여도 되는가. */
export function mayShowResults(stage: ParticipationStage, question: Question | null): boolean {
  if (stage === 'results' || stage === 'answer' || stage === 'finished') return true;
  // 정답이 없는 의견 문항은 모이는 대로 보여 주는 것이 교실 화면의 쓸모다.
  return stage === 'collecting' && !!question && !questionHasAnswer(question);
}

/** 정답·해설을 학생·교실 화면에 보여도 되는가. */
export function mayShowAnswer(stage: ParticipationStage, question: Question | null): boolean {
  if (!question || !questionHasAnswer(question)) return false;
  return stage === 'answer' || stage === 'finished';
}

/** 지금 교사가 할 수 있는 조작 */
export interface StageActions {
  /** 응답을 마감할 수 있는가 */
  readonly canClose: boolean;
  /** 결과를 공개할 수 있는가 */
  readonly canPublishResults: boolean;
  /** 정답·해설을 공개할 수 있는가 */
  readonly canPublishAnswer: boolean;
  /** 같은 질문에 다시 받을 수 있는가 */
  readonly canReopen: boolean;
  /** 다음 문항으로 갈 수 있는가 */
  readonly canAdvance: boolean;
}

export function stageActions(stage: ParticipationStage, question: Question | null): StageActions {
  const closedLike = stage === 'closed' || stage === 'results' || stage === 'answer';
  const scored = !!question && questionHasAnswer(question);
  return {
    canClose: stage === 'collecting',
    // 결과 공개는 마감 직후 한 번만 — 이미 공개했으면 다시 누를 일이 없다.
    canPublishResults: stage === 'closed',
    // 정답은 결과를 건너뛰고 바로 공개해도 된다(직선 절차로 가두지 않는다).
    canPublishAnswer: closedLike && scored && stage !== 'answer',
    canReopen: closedLike,
    canAdvance: closedLike,
  };
}

/**
 * 이번 문항의 응답 현황. 수치의 뜻을 헷갈리지 않게 **입장 인원**과
 * **이번 문항 응답 수**를 따로 돌려준다. 입장 인원은 학급 전체 인원이 아니다.
 */
export interface ResponseTally {
  /** 입장한 학생 수 (학급 전체 인원이 아니다) */
  readonly joined: number;
  /** 이번 문항·이번 차수에 응답한 수 */
  readonly answered: number;
  /** 아직 내지 않은 수 */
  readonly pending: number;
  /** 아직 내지 않은 학생 별명 — 교사 화면 전용 */
  readonly pendingNames: readonly string[];
}

export function responseTally(live: LiveSession, question: Question | null): ResponseTally {
  const joined = live.students.length;
  if (!question) return { joined, answered: 0, pending: joined, pendingNames: [] };
  const answeredIds = new Set(
    live.responses.filter((r) => r.questionId === question.id).map((r) => r.studentId),
  );
  const pendingNames = live.students
    .filter((s) => !answeredIds.has(s.studentId))
    .map((s) => s.nickname);
  return {
    joined,
    answered: answeredIds.size,
    pending: pendingNames.length,
    pendingNames,
  };
}
