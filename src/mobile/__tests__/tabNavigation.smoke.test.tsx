// @vitest-environment jsdom
/**
 * 하단 탭바 스모크 테스트.
 *
 * 왜 필요한가 — 라우터 도입 때 `setMoreSub` 의 의미가 "상태 지우기"에서
 * "뒤로가기 실행"으로 바뀌었는데, 탭바에 남아 있던 `setMoreSub(null)` 한 줄이
 * 탭 이동을 즉시 되돌려 **홈·학생·일정 탭이 먹통**이 됐다.
 *
 * 그때 tsc·lint·vitest 4395개·regression-check 39개가 전부 초록불이었다.
 * 어떤 자동 검증도 "탭을 눌렀을 때 그 탭에 머무는가"를 보지 않았기 때문이다.
 * 이 테스트가 그 그물이다.
 *
 * App 전체를 띄우면 스토어·동기화까지 딸려와 무거우므로, 주소 모델 수준에서
 * 탭 이동이 성립하는지를 본다(App 이 파생하는 값과 같은 규칙).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRoute } from '@mobile/routing/useRoute';
import { HOME_ROUTE, tabOf, type MobileTab, type MobileRoute } from '@mobile/routing/routes';

/** App.tsx 의 setActiveTab 과 같은 규칙 — 탭을 누르면 그 탭의 첫 화면으로. */
function routeForTab(tab: MobileTab): MobileRoute {
  if (tab === 'home') return HOME_ROUTE;
  if (tab === 'students') return { kind: 'students', seg: 'homeroom' };
  if (tab === 'schedule') return { kind: 'schedule', seg: 'schedule' };
  return { kind: 'more' };
}

const ALL_TABS: readonly MobileTab[] = ['home', 'students', 'schedule', 'more'];

describe('하단 탭바 — 누른 탭에 머무른다', () => {
  beforeEach(() => {
    window.history.replaceState({ depth: 0 }, '', '/');
  });

  it.each(ALL_TABS)('%s 탭을 누르면 그 탭 화면에 남는다', (tab) => {
    const { result } = renderHook(() => useRoute());

    act(() => {
      result.current.navigate(routeForTab(tab));
    });

    expect(tabOf(result.current.route)).toBe(tab);
  });

  it('더보기 하위로 들어갔다가 다른 탭을 눌러도 되돌아가지 않는다', () => {
    const { result } = renderHook(() => useRoute());

    act(() => {
      result.current.navigate({ kind: 'moreSection', section: 'settings' });
    });
    expect(tabOf(result.current.route)).toBe('more');

    // 탭 이동은 navigate 한 번으로 끝나야 한다.
    // 예전처럼 goBack 성격의 호출을 덧붙이면 여기서 'more' 로 튕긴다.
    act(() => {
      result.current.navigate(routeForTab('students'));
    });

    expect(tabOf(result.current.route)).toBe('students');
    expect(result.current.route).toEqual({ kind: 'students', seg: 'homeroom' });
  });

  it('탭을 연달아 눌러도 각 탭에 정확히 머무른다', () => {
    const { result } = renderHook(() => useRoute());

    for (const tab of ['students', 'schedule', 'more', 'home'] as const) {
      act(() => {
        result.current.navigate(routeForTab(tab));
      });
      expect(tabOf(result.current.route), `${tab} 탭에서 튕김`).toBe(tab);
    }
  });

  it('같은 탭을 두 번 눌러도 히스토리가 쌓이지 않는다 (뒤로가기 횟수 보존)', () => {
    const { result } = renderHook(() => useRoute());

    act(() => {
      result.current.navigate(routeForTab('students'));
    });
    const depthAfterFirst = (window.history.state as { depth: number }).depth;

    act(() => {
      result.current.navigate(routeForTab('students'));
    });
    const depthAfterSecond = (window.history.state as { depth: number }).depth;

    expect(depthAfterSecond).toBe(depthAfterFirst);
  });
});
