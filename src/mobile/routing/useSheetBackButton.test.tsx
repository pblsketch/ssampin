// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import { useSheetBackButton } from '@mobile/routing/useSheetBackButton';

/** 시트 한 개를 나타내는 최소 컴포넌트 */
function Sheet({ onClose }: { onClose: () => void }) {
  useSheetBackButton(onClose);
  return null;
}

/** jsdom 의 history 는 실제로 동작하므로, popstate 만 수동으로 흉내 낸다. */
function pressBackButton() {
  act(() => {
    window.history.back();
    // jsdom 은 back() 후 popstate 를 비동기로 던진다. 테스트에서는 즉시 발화시킨다.
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  });
}

function sheetDepth(): number {
  const s = (window.history.state ?? {}) as { sheet?: number };
  return s.sheet ?? 0;
}

describe('useSheetBackButton', () => {
  beforeEach(() => {
    cleanup();
    window.history.replaceState({ depth: 0 }, '', '/');
  });

  it('시트가 열리면 히스토리 항목을 쌓는다 (주소는 바꾸지 않는다)', () => {
    const before = window.location.pathname;
    render(<Sheet onClose={() => {}} />);
    expect(sheetDepth()).toBe(1);
    expect(window.location.pathname).toBe(before);
  });

  it('뒤로가기를 누르면 시트가 닫힌다', () => {
    const onClose = vi.fn();
    render(<Sheet onClose={onClose} />);
    pressBackButton();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('화면 이동 깊이(depth)를 흔들지 않는다', () => {
    window.history.replaceState({ depth: 3 }, '', '/');
    render(<Sheet onClose={() => {}} />);
    const s = window.history.state as { depth: number; sheet: number };
    expect(s.depth).toBe(3);
    expect(s.sheet).toBe(1);
  });

  /**
   * jsdom 의 히스토리 스택은 같은 파일 안의 테스트끼리 공유되고 back() 도 비동기라,
   * "닫은 뒤 sheet 값" 을 직접 재면 앞선 테스트가 쌓아둔 항목에 오염된다.
   * 그래서 결과 상태 대신 **정리 동작이 실제로 일어나는지**를 본다.
   */
  it('X·바깥클릭으로 닫으면 쌓아둔 항목을 되돌린다 (뒤로가기 한 번을 삼키지 않도록)', () => {
    const backSpy = vi.spyOn(window.history, 'back');
    const { unmount } = render(<Sheet onClose={() => {}} />);

    act(() => {
      unmount();
    });

    expect(backSpy).toHaveBeenCalledTimes(1);
    backSpy.mockRestore();
  });

  it('뒤로가기로 닫힌 경우에는 되돌리지 않는다 (두 번 뒤로 가면 화면까지 넘어간다)', () => {
    const backSpy = vi.spyOn(window.history, 'back');
    const { unmount } = render(<Sheet onClose={() => {}} />);

    pressBackButton();
    backSpy.mockClear();

    act(() => {
      unmount();
    });

    expect(backSpy).not.toHaveBeenCalled();
    backSpy.mockRestore();
  });

  it('중첩 시트는 각자 항목을 쌓는다', () => {
    render(<Sheet onClose={vi.fn()} />);
    expect(sheetDepth()).toBe(1);
    render(<Sheet onClose={vi.fn()} />);
    expect(sheetDepth()).toBe(2);
  });

  /**
   * ⚠️ 알려진 한계 — 뒤로가기 한 번에 중첩 시트가 **함께** 닫힌다.
   *
   * popstate 는 window 전역 브로드캐스트라 열려 있는 시트가 모두 듣는다.
   * "위쪽 하나만 닫힌다"를 만들려면 시트마다 리스너를 다는 대신 App 최상위 리스너
   * 하나 + 시트 스택(useMobileBottomSheetStore 확장)으로 바꿔야 한다.
   *
   * 지금 껍데기를 쓰는 시트가 ActionSheet 하나뿐이라 실제 사용자 영향은 없지만,
   * 나머지 14개 시트를 껍데기로 옮기기 **전에** 반드시 해결해야 한다.
   * 이 테스트는 한계를 문서화하고, 고쳐지면 실패해서 알려주는 역할을 한다.
   */
  it('[알려진 한계] 뒤로가기 한 번에 중첩 시트가 함께 닫힌다 — 시트 스택 전환 시 이 단언을 뒤집을 것', () => {
    const outer = vi.fn();
    const inner = vi.fn();
    render(<Sheet onClose={outer} />);
    render(<Sheet onClose={inner} />);

    pressBackButton();

    expect(inner).toHaveBeenCalled();
    // 이상적으로는 outer 가 호출되지 않아야 한다. 현재 구조에서는 호출된다.
    expect(outer).toHaveBeenCalled();
  });
});
