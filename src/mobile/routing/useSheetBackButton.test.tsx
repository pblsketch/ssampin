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
 * 하드웨어 뒤로가기를 모사한다 — 명세가 정한 순서(상태 복원 → popstate 발화)를 재현.
 *
 * 이 순서가 중요한 이유: 훅이 popstate 안에서 `history.state` 를 읽어 "내 층이 아직
 * 살아 있는가"를 판단한다. back() 직후 popstate 를 그냥 쏘면 아직 갱신되지 않은 상태를
 * 읽게 되어 실제 브라우저와 다르게 동작한다.
 *
 * ⚠️ 알려진 약점 — 이건 **모사**다. 복원될 상태를 테스트가 직접 만들어내므로,
 * 구현이 세운 가정을 테스트가 그대로 베껴 쓰는 구조다. 구현과 실제 히스토리 의미가
 * 어긋나도 잡아내지 못한다.
 *
 * 진짜 `history.back()` 을 쓰는 편이 엄격하게 더 강하다. jsdom 도 popstate 를 정상
 * 발화시킨다(동기가 아니라 다음 태스크에서 — 이걸 몰라 한때 "발화하지 않는다"고
 * 잘못 판단했었다). 다만 같은 파일 안 테스트끼리 히스토리 스택을 공유하고, 앞선
 * 테스트의 정리용 back() 이 비동기로 흘러들어 격리가 무너진다. 전환하려면 테스트별
 * 히스토리 격리가 먼저다. → progress.txt "후속" 항목.
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
   * popstate 는 window 전역 브로드캐스트라 열려 있는 시트가 전부 듣는다.
   * 각 시트가 자기 층(myLevel)을 기억하고 "현재 sheet 값이 내 층 이상이면 내 항목은
   * 아직 살아 있다"고 판단해 무시하게 만들어, 위쪽 하나만 닫히게 한다.
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
