import { useEffect, useState } from 'react';

/**
 * v2.1 Phase C-C1 — 모바일 viewport 검출 훅 (Design v2.1 §5.3 / Plan FR-C1).
 *
 * `(max-width: 768px)` matchMedia 쿼리 사용. 변경 이벤트도 구독해
 * 화면 회전·창 크기 변경 시 자동 갱신.
 *
 * 책임:
 *   - Freeform 자기 카드 드래그 readOnly 강제 (페2 high-2 — 모바일 실수 방지).
 *
 * v2.1 Phase C 버그 fix (2026-04-24):
 *   - Kanban 모바일 차단은 제거됨. Plan §FR-C2가 Kanban 모바일 readOnly를 요구하지 않으며,
 *     Padlet도 모바일 Kanban 컬럼 이동을 허용. 이전 차단으로 학생 휴대폰에서 컬럼 이동
 *     불가 버그가 발생했었음.
 *
 * SSR/Node 환경에서는 false 반환 (window 부재).
 *
 * 회귀 위험 #6 무관 — 키보드 단축키 코드 절대 추가 X.
 */
const MOBILE_QUERY = '(max-width: 768px)';

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    try {
      return window.matchMedia(MOBILE_QUERY).matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    let mql: MediaQueryList;
    try {
      mql = window.matchMedia(MOBILE_QUERY);
    } catch {
      return;
    }

    const onChange = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
    };

    // Safari < 14는 addEventListener 미지원 → addListener fallback
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange);
    } else if (typeof (mql as unknown as { addListener?: (cb: (e: MediaQueryListEvent) => void) => void }).addListener === 'function') {
      (mql as unknown as { addListener: (cb: (e: MediaQueryListEvent) => void) => void }).addListener(onChange);
    }

    // 초기 sync (mount 직후 query 결과가 다를 수 있음 — hydration race)
    setIsMobile(mql.matches);

    return () => {
      if (typeof mql.removeEventListener === 'function') {
        mql.removeEventListener('change', onChange);
      } else if (typeof (mql as unknown as { removeListener?: (cb: (e: MediaQueryListEvent) => void) => void }).removeListener === 'function') {
        (mql as unknown as { removeListener: (cb: (e: MediaQueryListEvent) => void) => void }).removeListener(onChange);
      }
    };
  }, []);

  return isMobile;
}
