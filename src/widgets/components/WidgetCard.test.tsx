/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { WidgetDefinition } from '../types';
import { useWidgetModalStore } from '../stores/useWidgetModalStore';
import { WidgetCard } from './WidgetCard';

// React 18 act 환경 플래그
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

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
  document.body.innerHTML = '';
  useWidgetModalStore.setState({ openId: null, flashKey: 0 });
}

function createDefinition(component: WidgetDefinition['component']): WidgetDefinition {
  return {
    id: 'interactive-widget',
    name: '인터랙티브 위젯',
    icon: 'apps',
    description: 'widget card regression fixture',
    category: 'info',
    defaultSize: { w: 1, h: 1 },
    minSize: { w: 1, h: 1 },
    availableFor: {
      schoolLevel: ['elementary', 'middle', 'high', 'custom'],
      role: ['homeroom', 'subject', 'admin'],
    },
    component,
    modalMode: 'view+edit',
    modalSize: 'md',
  };
}

describe('WidgetCard interactive child click guard', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    useWidgetModalStore.setState({ openId: null, flashKey: 0 });
    vi.restoreAllMocks();
  });

  it('button/input 등 위젯 내부 컨트롤 클릭은 카드 확장 모달을 열지 않는다', () => {
    const onChildClick = vi.fn();
    const definition = createDefinition(() => (
      <div>
        <button type="button" onClick={onChildClick}>
          바로 실행
        </button>
      </div>
    ));
    const ctx = setup();

    act(() => {
      ctx.root.render(<WidgetCard definition={definition} />);
    });
    const button = ctx.container.querySelector('button')!;

    act(() => {
      button.click();
    });

    expect(onChildClick).toHaveBeenCalledTimes(1);
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();

    teardown(ctx);
  });

  it('data-widget-interactive 영역 클릭도 카드 확장 모달을 열지 않는다', () => {
    const onInteractiveClick = vi.fn();
    const definition = createDefinition(() => (
      <div data-widget-interactive="true" onClick={onInteractiveClick}>
        커스텀 인터랙션 영역
      </div>
    ));
    const ctx = setup();

    act(() => {
      ctx.root.render(<WidgetCard definition={definition} />);
    });
    const interactiveArea = ctx.container.querySelector('[data-widget-interactive="true"]')!;

    act(() => {
      interactiveArea.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onInteractiveClick).toHaveBeenCalledTimes(1);
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();

    teardown(ctx);
  });

  it('빈 카드 영역 클릭은 기존처럼 확장 모달을 연다', () => {
    const definition = createDefinition(() => <div>요약 콘텐츠</div>);
    const ctx = setup();

    act(() => {
      ctx.root.render(<WidgetCard definition={definition} />);
    });

    act(() => {
      ctx.container.firstElementChild?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();

    teardown(ctx);
  });
});
