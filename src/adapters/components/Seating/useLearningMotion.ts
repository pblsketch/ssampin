/**
 * 이름 학습 화면의 연출 실행기.
 *
 * 무엇을 보여줄지는 `learningMotion.ts`가 정하고, 여기서는 그것을 실제로 움직인다.
 * 옆핀 펼침 연출과 같은 방식(`animejs/waapi`)을 쓴다 — 이 저장소에 이미 있는 길이다.
 *
 * jsdom에는 `element.animate`가 없어 테스트에서는 조용히 건너뛴다. 그래서 규칙 검사는
 * 순수 함수 쪽에서 하고, 여기서는 **화면이 깨지지 않는 것**만 책임진다.
 */
import { useLayoutEffect, useRef } from 'react';
import { waapi } from 'animejs/waapi';
import { MOTION_EASING } from '@adapters/motion';
import { LEARNING_MOTION_MS, type LearningMotion } from './learningMotion';

/** 연출별 keyframe. transform 하나만 건드려 레이아웃을 다시 계산시키지 않는다. */
function keyframesFor(motion: Exclude<LearningMotion, 'none'>): Record<string, unknown> {
  switch (motion) {
    case 'pop':
      // 살짝 지나쳤다 돌아온다. 정확히 1로 끝나야 다음 연출이 어긋나지 않는다.
      return {
        transform: ['scale(1)', 'scale(1.08)', 'scale(0.98)', 'scale(1)'],
        ease: MOTION_EASING.enter,
      };
    case 'shake':
      // 좌우 폭을 점점 줄인다. 같은 폭으로 흔들면 진동으로 보여 "아니다"가 안 읽힌다.
      return {
        transform: [
          'translateX(0px)',
          'translateX(-10px)',
          'translateX(9px)',
          'translateX(-6px)',
          'translateX(3px)',
          'translateX(0px)',
        ],
        ease: MOTION_EASING.linear,
      };
    case 'reveal':
      // 세로축으로 돌아 앞면이 드러난다. perspective 를 함께 줘야 평면 회전이 아니라
      // 카드가 넘어가는 것으로 보인다.
      return {
        transform: [
          'perspective(900px) rotateY(-72deg) scale(0.96)',
          'perspective(900px) rotateY(0deg) scale(1)',
        ],
        opacity: [0.55, 1],
        ease: MOTION_EASING.enter,
      };
    case 'enter':
      // 오른쪽에서 들어온다 — 다음 문제로 넘어간다는 방향을 몸으로 알려 준다.
      return {
        transform: ['translateX(32px)', 'translateX(0px)'],
        opacity: [0, 1],
        ease: MOTION_EASING.enter,
      };
  }
}

/**
 * `motion` 값이 바뀔 때마다 그 연출을 한 번 실행한다.
 *
 * @param trigger 같은 연출을 다시 실행해야 할 때 바꾸는 값(예: 문제 번호).
 *                이게 없으면 연달아 두 번 맞혔을 때 두 번째가 조용히 넘어간다.
 */
export function useLearningMotion<T extends HTMLElement>(
  motion: LearningMotion,
  trigger: string | number = '',
) {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    if (motion === 'none') return;
    // jsdom·구형 환경에는 이 함수가 없다. 연출만 없을 뿐 화면은 정상이어야 한다.
    if (typeof element.animate !== 'function') return;

    const animation = waapi.animate(element, {
      ...keyframesFor(motion),
      duration: LEARNING_MOTION_MS[motion],
    });

    return () => {
      animation.cancel();
      // 연출 도중 다음 문제로 넘어가면 기운 카드가 그대로 남는다. 원래 자리로 되돌린다.
      element.style.transform = '';
      element.style.opacity = '';
    };
  }, [motion, trigger]);

  return ref;
}
