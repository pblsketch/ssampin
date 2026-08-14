import { useLayoutEffect, useRef } from 'react';
import { waapi, type WAAPIAnimation } from 'animejs/waapi';
import { MOTION_DURATION_MS, MOTION_EASING, useReducedMotion } from '@adapters/motion';

export const SIDE_PIN_OPEN_ANIMATION_MS = MOTION_DURATION_MS.deliberate;
/** Electron의 180ms 창 축소 마감보다 먼저 끝내 IPC·렌더 지연 여유를 남긴다. */
export const SIDE_PIN_CLOSE_MOTION_MS = 150;
export const SIDE_PIN_HIDDEN_TRANSFORM = 'translate3d(100%, 0, 0)';
export const SIDE_PIN_HIDDEN_OPACITY = 0.82;

function applySettledState(panel: HTMLElement, leaving: boolean): void {
  panel.style.transform = leaving ? SIDE_PIN_HIDDEN_TRANSFORM : 'translate3d(0, 0, 0)';
  panel.style.opacity = leaving ? String(SIDE_PIN_HIDDEN_OPACITY) : '1';
}

/**
 * 닫히는 중 다시 열리면 이전 모션의 현재 화면 값을 인라인 스타일로 확정한 뒤 새 목표만 준다.
 * 그래서 새 모션은 100% 위치에서 다시 시작하지 않고, 사용자가 보고 있던 바로 그 위치에서
 * 이어진다. 컴포넌트가 사라질 때는 최초 인라인 스타일을 복원한다.
 */
export function useSidePinMotion(leaving: boolean, active = true) {
  const reducedMotion = useReducedMotion();
  const panelRef = useRef<HTMLElement>(null);
  const animationRef = useRef<WAAPIAnimation | null>(null);
  const previousLeavingRef = useRef(leaving);
  const leavingRef = useRef(leaving);
  const reducedMotionRef = useRef(reducedMotion);
  const previousReducedMotionRef = useRef(reducedMotion);
  const previousActiveRef = useRef(active);
  const activeRef = useRef(active);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (panel === null) return;

    const originalTransform = panel.style.transform;
    const originalOpacity = panel.style.opacity;
    if (!activeRef.current) {
      applySettledState(panel, true);
    } else if (reducedMotionRef.current || typeof panel.animate !== 'function') {
      applySettledState(panel, leavingRef.current);
    } else {
      animationRef.current = waapi.animate(panel, {
        transform: [SIDE_PIN_HIDDEN_TRANSFORM, 'translate3d(0, 0, 0)'],
        opacity: [SIDE_PIN_HIDDEN_OPACITY, 1],
        duration: SIDE_PIN_OPEN_ANIMATION_MS,
        ease: MOTION_EASING.enter,
        persist: true,
      });
    }

    return () => {
      animationRef.current?.cancel();
      animationRef.current = null;
      panel.style.transform = originalTransform;
      panel.style.opacity = originalOpacity;
    };
  }, []);

  useLayoutEffect(() => {
    activeRef.current = active;
    if (previousActiveRef.current === active) return;
    previousActiveRef.current = active;

    const panel = panelRef.current;
    if (panel === null) return;
    animationRef.current?.cancel();
    animationRef.current = null;
    if (!active) {
      applySettledState(panel, true);
      return;
    }
    if (reducedMotionRef.current || typeof panel.animate !== 'function') {
      applySettledState(panel, leavingRef.current);
      return;
    }
    animationRef.current = waapi.animate(panel, {
      transform: leavingRef.current ? SIDE_PIN_HIDDEN_TRANSFORM : 'translate3d(0, 0, 0)',
      opacity: leavingRef.current ? SIDE_PIN_HIDDEN_OPACITY : 1,
      duration: leavingRef.current ? SIDE_PIN_CLOSE_MOTION_MS : SIDE_PIN_OPEN_ANIMATION_MS,
      ease: leavingRef.current ? MOTION_EASING.exit : MOTION_EASING.enter,
      persist: true,
    });
  }, [active]);

  useLayoutEffect(() => {
    reducedMotionRef.current = reducedMotion;
    if (previousReducedMotionRef.current === reducedMotion) return;
    previousReducedMotionRef.current = reducedMotion;
    if (!reducedMotion) return;

    const panel = panelRef.current;
    if (panel === null) return;
    if (!activeRef.current) {
      applySettledState(panel, true);
      return;
    }
    animationRef.current?.cancel();
    animationRef.current = null;
    applySettledState(panel, leavingRef.current);
  }, [reducedMotion]);

  useLayoutEffect(() => {
    if (previousLeavingRef.current === leaving) return;
    previousLeavingRef.current = leaving;
    leavingRef.current = leaving;

    const panel = panelRef.current;
    if (panel === null) return;
    if (!activeRef.current) {
      applySettledState(panel, true);
      return;
    }
    if (reducedMotionRef.current || typeof panel.animate !== 'function') {
      applySettledState(panel, leaving);
      return;
    }

    // Anime.js의 cancel은 현재 화면 값을 commitStyles한 뒤 이전 재생 자원을 해제한다.
    animationRef.current?.cancel();
    animationRef.current = waapi.animate(panel, {
      transform: leaving ? SIDE_PIN_HIDDEN_TRANSFORM : 'translate3d(0, 0, 0)',
      opacity: leaving ? SIDE_PIN_HIDDEN_OPACITY : 1,
      duration: leaving ? SIDE_PIN_CLOSE_MOTION_MS : SIDE_PIN_OPEN_ANIMATION_MS,
      ease: leaving ? MOTION_EASING.exit : MOTION_EASING.enter,
      persist: true,
    });
  }, [leaving]);

  return panelRef;
}
