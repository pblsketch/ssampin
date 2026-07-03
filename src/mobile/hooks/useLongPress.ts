import { useRef } from 'react';
import type { MutableRefObject } from 'react';
import { haptic } from '@mobile/utils/haptic';

interface UseLongPressOptions {
  /** 롱프레스 인식 시간(ms). 기본 500. */
  ms?: number;
  /** 발동 시 햅틱(짧은 진동) 피드백 여부. 기본 false. */
  haptic?: boolean;
}

interface UseLongPressHandlers<T> {
  /** 누르기 시작(예: onTouchStart). 발동 시 `onLongPress(arg)` 를 호출한다. */
  start: (arg: T) => void;
  /** 타이머 취소(예: onTouchEnd/onTouchMove/onTouchCancel). */
  cancel: () => void;
  /** 롱프레스가 발동됐는지 나타내는 ref (발동 직전 false 로 초기화). */
  firedRef: MutableRefObject<boolean>;
}

/**
 * 롱프레스(길게 누르기) 타이머 훅.
 *
 * `ClassProgressEntryItem`(500ms + 햅틱 + fired ref)와 `MemoPage`(500ms, 햅틱·fired 없음)에서
 * 각각 반복되던 타이머 로직을 옵션으로 흡수한다. 두 호출부의 기존 동작을 그대로 보존한다.
 *
 * - `start(arg)` 호출 시 `firedRef.current` 를 false 로 리셋하고 타이머를 건다.
 * - `ms` 경과 시 `firedRef.current = true`, (옵션이면) 햅틱, `onLongPress(arg)` 실행.
 * - `cancel()` 은 대기 중인 타이머를 지운다.
 */
export function useLongPress<T = void>(
  onLongPress: (arg: T) => void,
  options: UseLongPressOptions = {},
): UseLongPressHandlers<T> {
  const { ms = 500, haptic: enableHaptic = false } = options;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);

  const start = (arg: T) => {
    firedRef.current = false;
    timer.current = setTimeout(() => {
      firedRef.current = true;
      if (enableHaptic) haptic();
      onLongPress(arg);
    }, ms);
  };

  const cancel = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  return { start, cancel, firedRef };
}
