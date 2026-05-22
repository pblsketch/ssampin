/**
 * AC4 — WidgetCard: 이미 열린 모달(A)이 있을 때 다른 카드(B)를 클릭하면
 * A 모달이 유지되고 B 모달은 열리지 않으며 flash가 트리거된다.
 *
 * @vitest-environment jsdom
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import React from 'react';
import { WidgetCard } from '../WidgetCard';
import { useWidgetModalStore } from '../../stores/useWidgetModalStore';
import type { WidgetDefinition } from '../../types';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                          */
/* ------------------------------------------------------------------ */

function makeDefinition(id: string): WidgetDefinition {
  return {
    id,
    name: `위젯 ${id}`,
    icon: 'apps',
    description: 'test fixture',
    category: 'info',
    defaultSize: { w: 1, h: 1 },
    minSize: { w: 1, h: 1 },
    availableFor: {
      schoolLevel: ['elementary', 'middle', 'high'],
      role: ['homeroom', 'subject', 'admin'],
    },
    component: () =>
      React.createElement('div', { 'data-testid': `content-${id}` }, `content-${id}`),
    // modalMode 있어야 클릭 시 모달 열림
    modalMode: 'expanded',
    modalSize: 'md',
  };
}

const DEF_A = makeDefinition('card-a');
const DEF_B = makeDefinition('card-b');

/* ------------------------------------------------------------------ */
/*  하네스                                                            */
/* ------------------------------------------------------------------ */

interface Ctx {
  container: HTMLDivElement;
  root: Root;
}

function setup(): Ctx {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  return { container, root };
}

function teardown(ctx: Ctx) {
  act(() => {
    ctx.root.unmount();
  });
  ctx.container.remove();
  // 스토어 초기화 — 테스트 간 누수 방지
  useWidgetModalStore.setState({ openId: null, flashKey: 0 });
}

async function flushMicrotasks() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/* ------------------------------------------------------------------ */
/*  테스트                                                            */
/* ------------------------------------------------------------------ */

describe('AC4 — WidgetCard 모달 단일 개방 + flash', () => {
  let ctx: Ctx;

  beforeEach(() => {
    ctx = setup();
    // 스토어 초기 상태 보장
    useWidgetModalStore.setState({ openId: null, flashKey: 0 });
    // ModalCoordinator는 WidgetModal 내부에서만 사용 — 여기선 스토어 직접 검사
  });

  afterEach(() => {
    teardown(ctx);
  });

  it('카드 A를 클릭하면 useWidgetModalStore.openId가 A의 id로 설정된다', async () => {
    act(() => {
      ctx.root.render(
        React.createElement('div', null, React.createElement(WidgetCard, { definition: DEF_A })),
      );
    });

    const cardA = ctx.container.querySelector<HTMLDivElement>('[class*="cursor-pointer"]');
    expect(cardA).not.toBeNull();

    await act(async () => {
      cardA!.click();
      await flushMicrotasks();
    });

    expect(useWidgetModalStore.getState().openId).toBe('card-a');
  });

  it('A 열린 상태에서 B 클릭 → openId는 A 유지, flashKey 증가, B 모달 미표시', async () => {
    act(() => {
      ctx.root.render(
        React.createElement(
          'div',
          null,
          React.createElement(WidgetCard, { definition: DEF_A }),
          React.createElement(WidgetCard, { definition: DEF_B }),
        ),
      );
    });

    // 커서 포인터 div들을 찾아 순서대로 A, B 매핑
    const clickTargets = ctx.container.querySelectorAll<HTMLDivElement>(
      '[class*="cursor-pointer"]',
    );
    // 두 WidgetCard 각각에 cursor-pointer div가 있음
    const [clickA, clickB] = Array.from(clickTargets);
    expect(clickA).not.toBeNull();
    expect(clickB).not.toBeNull();

    // Step 1: A 클릭 — 모달 오픈
    await act(async () => {
      clickA!.click();
      await flushMicrotasks();
    });
    expect(useWidgetModalStore.getState().openId).toBe('card-a');
    const flashKeyBefore = useWidgetModalStore.getState().flashKey;

    // Step 2: B 클릭 — A가 열려 있으므로 flash만 트리거
    await act(async () => {
      clickB!.click();
      await flushMicrotasks();
    });

    const stateAfter = useWidgetModalStore.getState();

    // openId는 A 그대로 유지
    expect(stateAfter.openId).toBe('card-a');

    // flashKey가 증가해야 함 (attention flash 트리거)
    expect(stateAfter.flashKey).toBeGreaterThan(flashKeyBefore);

    // DOM에 B 모달이 없어야 함 (B의 widgetId를 가진 backdrop 없음)
    const bBackdrop = document.querySelector('[data-widget-id="card-b"]');
    expect(bBackdrop).toBeNull();
  });

  it('A 모달 닫기 → openId null로 초기화된다', async () => {
    act(() => {
      ctx.root.render(React.createElement(WidgetCard, { definition: DEF_A }));
    });

    const cardA = ctx.container.querySelector<HTMLDivElement>('[class*="cursor-pointer"]');
    await act(async () => {
      cardA!.click();
      await flushMicrotasks();
    });
    expect(useWidgetModalStore.getState().openId).toBe('card-a');

    // ✕ 닫기 버튼 클릭
    const closeBtn = document.querySelector<HTMLButtonElement>('[data-widget-modal-close]');
    expect(closeBtn).not.toBeNull();
    await act(async () => {
      closeBtn!.click();
      await flushMicrotasks();
    });

    expect(useWidgetModalStore.getState().openId).toBeNull();
  });

  it('A 닫힌 후 B 클릭 → B 모달이 정상적으로 열린다', async () => {
    act(() => {
      ctx.root.render(
        React.createElement(
          'div',
          null,
          React.createElement(WidgetCard, { definition: DEF_A }),
          React.createElement(WidgetCard, { definition: DEF_B }),
        ),
      );
    });

    const clickTargets = ctx.container.querySelectorAll<HTMLDivElement>(
      '[class*="cursor-pointer"]',
    );
    const [clickA, clickB] = Array.from(clickTargets);

    // A 열고
    await act(async () => {
      clickA!.click();
      await flushMicrotasks();
    });
    expect(useWidgetModalStore.getState().openId).toBe('card-a');

    // A 닫고
    const closeBtn = document.querySelector<HTMLButtonElement>('[data-widget-modal-close]');
    await act(async () => {
      closeBtn!.click();
      await flushMicrotasks();
    });
    expect(useWidgetModalStore.getState().openId).toBeNull();

    // B 열기
    await act(async () => {
      clickB!.click();
      await flushMicrotasks();
    });
    expect(useWidgetModalStore.getState().openId).toBe('card-b');
  });
});
