/**
 * useFocusTrap 단위 테스트.
 *
 * @vitest-environment jsdom
 *
 * G001 Foundation (ralplan Step 1). 자체 구현 focus-trap (~30 LoC)으로
 * focus-trap-react 의존성을 줄이기 위함. Tab/Shift+Tab 사이클 + 첫 포커스 +
 * 언마운트 시 prevFocus 복원을 검증한다.
 *
 * 주의: jsdom은 레이아웃을 계산하지 않아 모든 HTMLElement의 `offsetParent`가 null이다.
 * useFocusTrap은 보이는 노드만 포커스 후보로 두기 위해 offsetParent 필터를 사용하므로,
 * 테스트에서는 prototype을 패치해 보이는(=DOM에 attach된) 모든 노드를 통과시킨다.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { useFocusTrap } from './useFocusTrap';

// React 18 act 환경 플래그 — react-dom/client + act 경고 제거.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * jsdom 환경에서 offsetParent를 흉내내기 — 부모 노드가 있으면 그걸 반환.
 * 이렇게 하면 `el.offsetParent !== null` 필터가 attach된 모든 노드를 통과시킨다.
 * (실제 브라우저에서는 visibility:hidden / display:none 인 노드만 제외되는데, 본
 * 단위 테스트는 그 경계 동작이 아니라 트랩 사이클 자체를 본다.)
 */
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get(this: HTMLElement) {
      return this.parentElement;
    },
  });
});

interface RenderContext {
  container: HTMLDivElement;
  root: Root;
}

function setup(): RenderContext {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  return { container, root };
}

function teardown(ctx: RenderContext) {
  act(() => {
    ctx.root.unmount();
  });
  ctx.container.remove();
}

interface HarnessProps {
  active: boolean;
}

/** 트랩 적용 대상 — 3개의 포커스 가능 버튼 + 비활성 버튼 1개. */
function TestHarness({ active }: HarnessProps) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, active);
  return (
    <div ref={ref} data-testid="trap-root">
      <button data-testid="first">first</button>
      <button data-testid="middle">middle</button>
      <button data-testid="disabled" disabled>
        disabled
      </button>
      <button data-testid="last">last</button>
    </div>
  );
}

function byTestId(id: string): HTMLElement {
  const el = document.querySelector(`[data-testid="${id}"]`);
  if (!el) throw new Error(`Element [data-testid="${id}"] not found`);
  return el as HTMLElement;
}

describe('useFocusTrap', () => {
  let ctx: RenderContext;
  beforeEach(() => {
    ctx = setup();
  });
  afterEach(() => {
    teardown(ctx);
  });

  it('active=true 마운트 시 첫 포커스 가능 요소(=first)에 focus', () => {
    act(() => {
      ctx.root.render(<TestHarness active />);
    });
    expect(document.activeElement).toBe(byTestId('first'));
  });

  it('active=false 일 때는 자동 focus 이동 없음', () => {
    // body 자체 또는 기존 active를 유지.
    const originalActive = document.activeElement;
    act(() => {
      ctx.root.render(<TestHarness active={false} />);
    });
    // 트랩 미활성 — first에 강제 focus 하지 않음.
    expect(document.activeElement).not.toBe(byTestId('first'));
    // 단, jsdom에서 unrelated focus 가 변할 일은 없다.
    expect(document.activeElement).toBe(originalActive);
  });

  it('Tab on last → first 로 wrap', () => {
    act(() => {
      ctx.root.render(<TestHarness active />);
    });
    const last = byTestId('last');
    last.focus();
    expect(document.activeElement).toBe(last);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(byTestId('first'));
  });

  it('Shift+Tab on first → last 로 wrap', () => {
    act(() => {
      ctx.root.render(<TestHarness active />);
    });
    const first = byTestId('first');
    first.focus();
    expect(document.activeElement).toBe(first);
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }),
    );
    expect(document.activeElement).toBe(byTestId('last'));
  });

  it('비활성(disabled) 버튼은 트랩 후보에서 제외 — last는 disabled 다음의 "last" 버튼', () => {
    act(() => {
      ctx.root.render(<TestHarness active />);
    });
    byTestId('last').focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    // wrap 결과는 first(=첫 트랩 후보). disabled 가 트랩 후보면 wrap 못 함.
    expect(document.activeElement).toBe(byTestId('first'));
  });

  it('중간 노드에서 Tab → 트랩이 가로채지 않음 (브라우저 기본 Tab 흐름에 위임)', () => {
    act(() => {
      ctx.root.render(<TestHarness active />);
    });
    const middle = byTestId('middle');
    middle.focus();
    // middle은 first도 last도 아니라서 useFocusTrap 핸들러는 preventDefault 하지 않는다.
    // jsdom은 실제 포커스 이동을 시뮬레이션하지 않으므로 activeElement는 middle 유지.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(middle);
  });

  it('언마운트 시 listener 해제 — 이후 Tab 키는 트랩 wrap을 수행하지 않음', () => {
    act(() => {
      ctx.root.render(<TestHarness active />);
    });
    const last = byTestId('last');
    last.focus();

    // 언마운트 직전: prevFocus 복원이 작동하므로, focus를 body로 옮긴 뒤 언마운트가
    // 다시 prevFocus(=last)로 옮기지 않도록 body로 명시 이동.
    (document.body as HTMLElement).focus();

    act(() => {
      ctx.root.unmount();
    });

    // 언마운트 후 다른 컨테이너 + 노드 dispatch 해도 wrap 동작이 없어야 한다.
    const newContainer = document.createElement('div');
    document.body.appendChild(newContainer);
    const btn = document.createElement('button');
    btn.textContent = 'orphan';
    newContainer.appendChild(btn);
    btn.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(btn);

    // 정리.
    newContainer.remove();
    ctx.container.remove();
    // teardown afterEach 가 또 root.unmount 호출하지 않도록 새 root/container 마련.
    ctx.container = document.createElement('div');
    document.body.appendChild(ctx.container);
    ctx.root = createRoot(ctx.container);
  });

  it('포커스 가능 노드가 없으면 Tab 키 처리 시 throw 없이 무동작', () => {
    function EmptyHarness({ active }: { active: boolean }) {
      const ref = useRef<HTMLDivElement>(null);
      useFocusTrap(ref, active);
      return <div ref={ref} data-testid="empty-root" />;
    }
    act(() => {
      ctx.root.render(<EmptyHarness active />);
    });
    expect(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    }).not.toThrow();
  });

  it('Tab 이외의 키는 무시', () => {
    act(() => {
      ctx.root.render(<TestHarness active />);
    });
    const last = byTestId('last');
    last.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    // Tab이 아니므로 wrap 발생하지 않고 last 유지.
    expect(document.activeElement).toBe(last);
  });

  it('active=true → false 전환: 이후 Tab 키 wrap 동작 없음', () => {
    act(() => {
      ctx.root.render(<TestHarness active />);
    });
    byTestId('last').focus();
    // 트랩 비활성화.
    act(() => {
      ctx.root.render(<TestHarness active={false} />);
    });
    // 비활성화된 후 Tab 키는 wrap 동작을 트리거하지 않아야 한다.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).not.toBe(byTestId('first'));
  });
});
