// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import { useSheetBackButton } from '@mobile/routing/useSheetBackButton';

/** 시트 한 개를 나타내는 최소 컴포넌트 */
function Sheet({ onClose }: { onClose: () => void }) {
  useSheetBackButton(onClose);
  return null;
}

/**
 * 하드웨어 뒤로가기를 모사한다.
 *
 * jsdom 의 `history.back()` 은 popstate 를 발화시키지 않아 그대로 쓸 수 없다.
 * 그래서 **명세가 정한 순서**를 직접 재현한다 — 히스토리 상태가 먼저 복원되고,
 * 그 다음 popstate 가 발화한다.
 *
 * 이 순서가 중요한 이유: 훅이 popstate 안에서 `history.state` 를 읽어 "내 층이 아직
 * 살아 있는가"를 판단한다. 옛 버전처럼 back() 직후 popstate 를 그냥 쏘면 아직 갱신되지
 * 않은 상태를 읽게 되어 실제 브라우저와 다르게 동작한다.
 */
function pressBackButton() {
  const cur = (window.history.state ?? {}) as Record<string, unknown>;
  const restored = { ...cur, sheet: Math.max(0, ((cur.sheet as number | undefined) ?? 0) - 1) };
  act(() => {
    window.history.replaceState(restored, '', window.location.href);
    window.dispatchEvent(new PopStateEvent('popstate', { state: restored }));
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
  it('뒤로가기 한 번에 위쪽 시트만 닫힌다 (안쪽만 닫히고 바깥은 남는다)', () => {
    const outer = vi.fn();
    const inner = vi.fn();
    render(<Sheet onClose={outer} />);
    render(<Sheet onClose={inner} />);
    expect(sheetDepth()).toBe(2);

    pressBackButton();

    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });

  it('중첩 상태에서 뒤로가기를 두 번 하면 바깥 시트까지 닫힌다', () => {
    const outer = vi.fn();
    const inner = vi.fn();
    render(<Sheet onClose={outer} />);
    render(<Sheet onClose={inner} />);

    pressBackButton();
    expect(outer).not.toHaveBeenCalled();

    pressBackButton();
    expect(outer).toHaveBeenCalledTimes(1);
  });
});
