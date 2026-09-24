import type { TimerDisplayStyle } from '@domain/entities/Settings';
import { computeTimerGeometry, MAX_DIAMETER, type TimerGeometry } from './timerGeometry';
import { useElementSize } from './useElementSize';

/**
 * 스테이지(원+숫자만 차지하는 빈 공간) 크기를 재서 원·숫자 크기를 돌려준다(설계 1-2).
 * 스테이지는 남는 공간 전부를 받는 요소(flex-1 min-h-0)에 붙인다.
 */
export function useTimerStageSize(
  displayStyle: TimerDisplayStyle,
  maxDiameter: number = MAX_DIAMETER,
): {
  readonly stageRef: (node: HTMLElement | null) => void;
  readonly geometry: TimerGeometry;
  readonly stageSize: { readonly width: number; readonly height: number };
} {
  const { ref, size } = useElementSize({ width: 320, height: 320 });
  return {
    stageRef: ref,
    geometry: computeTimerGeometry(size, displayStyle, maxDiameter),
    stageSize: size,
  };
}
