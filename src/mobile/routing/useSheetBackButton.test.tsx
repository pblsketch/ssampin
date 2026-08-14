// @vitest-environment jsdom
import { StrictMode } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import { useSheetBackButton, __resetSheetStackForTest } from '@mobile/routing/useSheetBackButton';

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
    __resetSheetStackForTest();
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
  it('X·바깥클릭으로 닫으면 쌓아둔 항목을 되돌린다 (뒤로가기 한 번을 삼키지 않도록)', async () => {
    const backSpy = vi.spyOn(window.history, 'back');
    const { unmount } = render(<Sheet onClose={() => {}} />);

    act(() => {
      unmount();
    });

    // 되돌리기는 한 박자 미뤄져 있다 — 그 사이 다른 시트가 마운트되면 항목을 물려주기
    // 위해서다(StrictMode 재마운트·시트 교체). 여기서는 아무도 안 받으므로 실제로 나간다.
    await act(async () => {
      await Promise.resolve();
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

  /**
   * StrictMode(개발 모드) 재현.
   *
   * React 는 effect 를 **마운트 → 정리 → 재마운트** 로 두 번 돌린다. 정리가 부르는
   * back() 은 비동기라, 재마운트가 새 항목을 쌓은 **뒤에** 도착한다. 그 popstate 를
   * 사용자 조작으로 오해하면 시트가 열리자마자 닫힌다.
   *
   * 이 테스트가 그 순서를 그대로 재현한다. 고쳐지기 전에는 onClose 가 호출됐다.
   */
  it('닫은 뒤 곧 다른 시트를 열면, 늦게 도착한 자체 back 이 그 시트를 닫지 않는다', async () => {
    const onClose = vi.fn();

    // 1) 시트 A 를 열고 X 로 닫는다 — 되돌리기가 예약된다.
    const first = render(<Sheet onClose={() => {}} />);
    expect(sheetDepth()).toBe(1);
    act(() => {
      first.unmount();
    });
    // 2) 예약이 실제로 나가게 둔다(아무도 물려받지 않았다).
    await act(async () => {
      await Promise.resolve();
    });

    // 3) 그 back 의 popstate 가 도착하기 전에 시트 B 를 연다.
    render(<Sheet onClose={onClose} />);

    // 4) 이제서야 A 의 자체 back 이 도착한다 — 이건 사용자 조작이 아니다.
    pressBackButton();

    expect(
      onClose,
      '앞 시트가 남긴 자체 back 을 사용자 조작으로 오해해 새 시트를 닫았습니다.',
    ).not.toHaveBeenCalled();
  });

  /**
   * ⚠️ 이 테스트는 **회귀를 잡는 그물이 아니다.** 가드를 꺼도 통과하는 것을 확인했다.
   * jsdom 에서는 StrictMode 이중 호출의 타이밍이 실제 브라우저와 달라 실패가 재현되지
   * 않는다. 위의 "정리→재마운트" 수동 재현 테스트가 실제 그물이고(가드를 끄면 빨간불),
   * 이건 "StrictMode 로 렌더해도 터지지 않는다" 정도의 연기 감지기다.
   *
   * 진짜 검증은 개발 서버에서 시트를 열어보는 것이다.
   */
  it('[연기감지] StrictMode 로 렌더해도 시트가 스스로 닫히지 않는다 (회귀 그물 아님)', async () => {
    const onClose = vi.fn();

    render(
      <StrictMode>
        <Sheet onClose={onClose} />
      </StrictMode>,
    );

    // 정리 단계에서 예약된 자체 back 이 도착할 시간을 준다.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(onClose, 'StrictMode 렌더만으로 시트가 닫혔습니다.').not.toHaveBeenCalled();
    // 항목은 정확히 하나만 남아야 한다(이중 마운트가 두 개를 쌓으면 안 된다).
    expect(sheetDepth()).toBe(1);
  });

  /**
   * StrictMode 이중 실행 경합 — 실화면에서 잡은 진짜 버그.
   *
   * 정리 단계의 `history.back()` 은 비동기다. 예전에는 정리에서 곧바로 back() 을 불렀는데,
   * StrictMode 는 마운트 → 정리 → 재마운트를 연달아 돌아서 재마운트의 pushState 가 먼저
   * 실행되고 back() 이 **뒤늦게** 도착했다. 계측하면 이렇게 찍혔다.
   *
   *   push {sheet:1} → back() → push {sheet:1} → (뒤늦게) popstate → state={depth:1}
   *
   * 결과: 시트는 열려 있는데 현재 항목은 시트 이전 것이라, 뒤로가기가 시트를 닫는 대신
   * **화면을 넘겨버렸다**. sheetDepth 만 보면 1 이라 위 테스트는 통과한다 —
   * 문제는 깊이가 아니라 "푸시를 몇 번 했는가"였다.
   */
  it('StrictMode 이중 실행에서 히스토리 푸시는 정확히 1회다 (되돌리기 경합)', async () => {
    const pushSpy = vi.spyOn(window.history, 'pushState');
    const backSpy = vi.spyOn(window.history, 'back');

    render(
      <StrictMode>
        <Sheet onClose={vi.fn()} />
      </StrictMode>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(
      pushSpy.mock.calls.length,
      '두 번 쌓으면, 뒤늦게 도착하는 back() 이 그중 하나를 도로 까서 ' +
        '"시트는 열려 있는데 현재 항목은 시트 이전"이 된다 → 뒤로가기가 화면을 넘긴다.',
    ).toBe(1);
    expect(backSpy, '재마운트가 항목을 물려받았으므로 되돌릴 것이 없다.').not.toHaveBeenCalled();

    pushSpy.mockRestore();
    backSpy.mockRestore();
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
