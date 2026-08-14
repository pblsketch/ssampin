/** @vitest-environment jsdom */
import { act, cleanup, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { SIDE_PIN_CLOSE_ANIMATION_MS } from '@domain/services/resolveSidePinTransition';
import {
  SIDE_PIN_CLOSE_MOTION_MS,
  SIDE_PIN_OPEN_ANIMATION_MS,
  useSidePinMotion,
} from './useSidePinMotion';

const animeMocks = vi.hoisted(() => ({ animate: vi.fn() }));

vi.mock('animejs/waapi', () => ({ waapi: { animate: animeMocks.animate } }));

interface AnimationMock {
  cancel: ReturnType<typeof vi.fn>;
}

function createAnimationMock(): AnimationMock {
  return { cancel: vi.fn() };
}

function stubReducedMotion(initialMatches: boolean): (matches: boolean) => void {
  let matches = initialMatches;
  let listener: ((event: MediaQueryListEvent) => void) | null = null;
  const query = {
    get matches() {
      return matches;
    },
    addEventListener: (_type: 'change', next: (event: MediaQueryListEvent) => void) => {
      listener = next;
    },
    removeEventListener: (_type: 'change', next: (event: MediaQueryListEvent) => void) => {
      if (listener === next) listener = null;
    },
  } as unknown as MediaQueryList;
  window.matchMedia = vi.fn().mockReturnValue(query) as unknown as typeof window.matchMedia;

  return (nextMatches) => {
    matches = nextMatches;
    listener?.({ matches: nextMatches } as MediaQueryListEvent);
  };
}

function MotionHarness({ leaving }: { readonly leaving: boolean }) {
  const ref = useSidePinMotion(leaving);
  return (
    <section ref={ref} style={{ transform: 'scale(1)', opacity: 0.9 }}>
      옆핀
    </section>
  );
}

const originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: vi.fn() });
});

afterAll(() => {
  if (originalAnimate === undefined)
    delete (HTMLElement.prototype as { animate?: unknown }).animate;
  else Object.defineProperty(HTMLElement.prototype, 'animate', originalAnimate);
});

let animations: AnimationMock[];

beforeEach(() => {
  animations = [];
  animeMocks.animate.mockReset();
  animeMocks.animate.mockImplementation(() => {
    const animation = createAnimationMock();
    animations.push(animation);
    return animation;
  });
  stubReducedMotion(false);
});

afterEach(cleanup);

describe('옆핀 열림·닫힘 모션', () => {
  test('첫 열림은 Anime.js WAAPI로 화면 가장자리에서 시작한다', () => {
    render(<MotionHarness leaving={false} />);

    expect(animeMocks.animate).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        transform: ['translate3d(100%, 0, 0)', 'translate3d(0, 0, 0)'],
        duration: SIDE_PIN_OPEN_ANIMATION_MS,
        ease: 'out(4)',
        persist: true,
      }),
    );
  });

  test('닫힘 중 다시 열면 현재 값을 확정하고 새 목표만 지정해 이어 간다', () => {
    const view = render(<MotionHarness leaving={false} />);

    view.rerender(<MotionHarness leaving />);
    expect(SIDE_PIN_CLOSE_MOTION_MS).toBeLessThan(SIDE_PIN_CLOSE_ANIMATION_MS);
    expect(animations[0]?.cancel).toHaveBeenCalledOnce();
    expect(animeMocks.animate).toHaveBeenNthCalledWith(
      2,
      expect.any(HTMLElement),
      expect.objectContaining({
        transform: 'translate3d(100%, 0, 0)',
        duration: SIDE_PIN_CLOSE_MOTION_MS,
        ease: 'in(3)',
      }),
    );

    view.rerender(<MotionHarness leaving={false} />);
    expect(animations[1]?.cancel).toHaveBeenCalledOnce();
    expect(animeMocks.animate).toHaveBeenNthCalledWith(
      3,
      expect.any(HTMLElement),
      expect.objectContaining({
        transform: 'translate3d(0, 0, 0)',
        duration: SIDE_PIN_OPEN_ANIMATION_MS,
        ease: 'out(4)',
      }),
    );
  });

  test('제거 시 재생 자원을 정리하고 최초 인라인 스타일을 복원한다', () => {
    const view = render(<MotionHarness leaving={false} />);
    const panel = view.getByText('옆핀');
    panel.style.transform = 'matrix(1, 0, 0, 1, 120, 0)';
    panel.style.opacity = '0.5';

    view.unmount();

    expect(animations[0]?.cancel).toHaveBeenCalledOnce();
    expect(panel.style.transform).toBe('scale(1)');
    expect(panel.style.opacity).toBe('0.9');
  });

  test('움직임 줄이기를 켠 사용자는 패널을 즉시 표시한다', () => {
    stubReducedMotion(true);
    const view = render(<MotionHarness leaving={false} />);

    expect(animeMocks.animate).not.toHaveBeenCalled();
    expect(view.getByText('옆핀').style.transform).toBe('translate3d(0, 0, 0)');
  });

  test('실행 중 움직임 줄이기를 켜도 현재와 이후 전환에 즉시 반영한다', () => {
    const changeReducedMotion = stubReducedMotion(false);
    const view = render(<MotionHarness leaving={false} />);
    const panel = view.getByText('옆핀');

    act(() => changeReducedMotion(true));
    expect(animations[0]?.cancel).toHaveBeenCalledOnce();
    expect(panel.style.transform).toBe('translate3d(0, 0, 0)');

    view.rerender(<MotionHarness leaving />);
    expect(animeMocks.animate).toHaveBeenCalledOnce();
    expect(panel.style.transform).toBe('translate3d(100%, 0, 0)');

    act(() => changeReducedMotion(false));
    view.rerender(<MotionHarness leaving={false} />);
    expect(animeMocks.animate).toHaveBeenCalledTimes(2);
    expect(animeMocks.animate).toHaveBeenLastCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ transform: 'translate3d(0, 0, 0)' }),
    );
  });
});
