import { useCallback, useRef, useState } from 'react';

/**
 * 마우스가 컨테이너의 오른쪽/아래 가장자리 N px 이내에 있는지 감지하는 React hook.
 *
 * macOS overlay 스크롤바처럼 "스크롤바 트랙 영역 근처에 마우스가 갔을 때만"
 * 스크롤바를 표시하기 위해 사용한다. CSS의 `:hover`는 컨테이너 전체에 발동하므로
 * 트랙 영역만 정확히 감지하려면 mouse 좌표 추적이 필요하다.
 *
 * @param margin 가장자리에서 몇 px 이내일 때 near=true로 칠지 (기본 12, macOS 관습)
 * @returns
 *  - `ref`: 감지 대상 컨테이너 div에 부착할 ref
 *  - `near`: 마우스가 가장자리 근처에 있는지 (boolean)
 *  - `handlers`: `{ onMouseMove, onMouseLeave }` 컨테이너에 spread
 *
 * @example
 * const scroll = useNearScrollbar(12);
 * <div ref={scroll.ref} className={scroll.near ? 'is-near-scrollbar' : ''} {...scroll.handlers} />
 */
export function useNearScrollbar(margin = 12) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const rafRef = useRef<number | null>(null);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // 진입 guard: 이미 큐잉된 RAF가 있으면 스킵 (frame당 1회로 throttle)
    if (rafRef.current !== null) return;
    const clientX = e.clientX;
    const clientY = e.clientY;
    rafRef.current = requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) {
        rafRef.current = null;
        return;
      }
      const rect = el.getBoundingClientRect();
      const dr = rect.right - clientX;
      const db = rect.bottom - clientY;
      const isNear = (dr >= 0 && dr <= margin) || (db >= 0 && db <= margin);
      setNear((prev) => (prev !== isNear ? isNear : prev));
      // null 초기화는 setNear 이후 — 빠른 mouseMove 폭주 시 throttle 보장
      rafRef.current = null;
    });
  }, [margin]);

  const onMouseLeave = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setNear(false);
  }, []);

  return { ref, near, handlers: { onMouseMove, onMouseLeave } };
}
