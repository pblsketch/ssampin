/**
 * 이름 학습 화면의 연출 규칙.
 *
 * **판단은 여기 순수 함수에만 둔다.** 실제 애니메이션은 `useLearningMotion`이 실행하는데,
 * 그건 jsdom에서 돌지 않아(`element.animate`가 없다) 테스트로 지킬 수 없다. 그래서
 * "언제 무엇을 보여줄지"는 여기서 정하고 화면은 `data-learning-motion`으로 그 값을 드러낸다.
 * 그러면 동작 줄이기 설정을 지키는지 같은 **중요한 규칙을 실제로 검사**할 수 있다.
 *
 * 연출 방향 — **한 문제에 하나의 뚜렷한 박자.**
 * 잔 움직임을 여기저기 뿌리면 수업 중 반복할 때 산만해진다. 기억에 남아야 하는 순간은
 * 두 개뿐이다: 카드가 넘어가는 순간과, 맞았는지 틀렸는지 아는 순간.
 */
import { MOTION_DURATION_MS } from '@adapters/motion';

/** 화면에 실제로 실행할 연출 */
export type LearningMotion =
  /** 아무것도 하지 않는다 (동작 줄이기 설정이거나 보여줄 일이 없을 때) */
  | 'none'
  /** 맞았다 — 살짝 커졌다 제자리로. 위로 튀어오르는 느낌 */
  | 'pop'
  /** 틀렸다 — 좌우로 짧게 흔든다. 사람이 고개를 젓는 것과 같은 방향 */
  | 'shake'
  /** 카드가 열린다 — 세로축으로 돌아가며 앞면이 드러난다 */
  | 'reveal'
  /** 다음 문제가 오른쪽에서 들어온다 */
  | 'enter';

export interface LearningMotionInput {
  /** 채점 결과. 아직 안 풀었으면 undefined */
  readonly answerState?: 'correct' | 'wrong';
  /** 카드가 공개 상태인가 */
  readonly revealed: boolean;
  /** OS의 "동작 줄이기" 설정 */
  readonly reducedMotion: boolean;
}

/**
 * 카드 하나가 지금 보여줄 연출을 고른다.
 *
 * 채점 결과가 공개보다 **먼저**다. 맞고 틀린 것을 아는 일이 카드가 열리는 일보다
 * 중요하고, 둘을 같이 실행하면 서로 상쇄돼 아무것도 안 한 것처럼 보인다.
 */
export function resolveLearningMotion({
  answerState,
  revealed,
  reducedMotion,
}: LearningMotionInput): LearningMotion {
  if (reducedMotion) return 'none';
  if (answerState === 'correct') return 'pop';
  if (answerState === 'wrong') return 'shake';
  if (revealed) return 'reveal';
  return 'none';
}

/** 연출별 지속 시간 — 전부 기존 모션 토큰에서 가져온다 */
export const LEARNING_MOTION_MS: Readonly<Record<Exclude<LearningMotion, 'none'>, number>> = {
  pop: MOTION_DURATION_MS.deliberate,
  shake: MOTION_DURATION_MS.slow,
  reveal: MOTION_DURATION_MS.deliberate,
  enter: MOTION_DURATION_MS.slow,
};

/**
 * 결과 요약에서 못 외운 학생 이름이 차례로 나타나는 간격.
 *
 * 한꺼번에 뜨면 몇 명인지 눈으로 세어야 하는데, 차례로 나타나면 세지 않아도 양이 느껴진다.
 * 다만 명수가 많으면 마지막 이름까지 너무 오래 걸리므로 전체 400ms 안에서 끝낸다.
 */
export function staggerDelayMs(index: number, total: number): number {
  if (total <= 1) return 0;
  const step = Math.min(40, Math.floor(400 / total));
  return index * step;
}
