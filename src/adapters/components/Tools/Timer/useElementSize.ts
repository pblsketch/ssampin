import { useCallback, useRef, useState } from 'react';

/**
 * 요소 크기를 잰다(ResizeObserver). 콜백 ref 라 나중에 붙는 요소도 놓치지 않는다.
 * 처음 값은 `initial` — 재기 전 한 프레임 동안 쓴다.
 */
export function useElementSize(initial: { readonly width: number; readonly height: number }): {
  readonly ref: (node: HTMLElement | null) => void;
  readonly size: { readonly width: number; readonly height: number };
} {
  const [size, setSize] = useState(initial);
  const observerRef = useRef<ResizeObserver | null>(null);

  const ref = useCallback((node: HTMLElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (node === null) return;
    const measure = (): void => {
      const rect = node.getBoundingClientRect();
      setSize((prev) =>
        Math.abs(prev.width - rect.width) < 1 && Math.abs(prev.height - rect.height) < 1
          ? prev
          : { width: rect.width, height: rect.height },
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  // 감시 해제는 ref(null)(요소가 빠질 때)에서만 한다. 효과 정리 함수에서 끊으면 개발 모드의 StrictMode 가
  // 효과만 한 번 더 돌릴 때(ref 는 다시 붙이지 않는다) 감시가 영영 꺼져 크기가 처음 값에 멈춘다.
  return { ref, size };
}
