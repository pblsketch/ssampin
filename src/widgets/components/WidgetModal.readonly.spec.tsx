/**
 * WidgetModal readOnly 모드 단위 테스트 — G009-electron-readonly-shim.
 *
 * @vitest-environment jsdom
 *
 * 검사 범위:
 *   1. readOnly=true → "이 위젯은 메인 앱에서 편집하세요" 배너 노출
 *   2. readOnly=true → 본문이 <fieldset disabled>로 감싸짐
 *   3. readOnly=false (기본) → 배너 없음, disabled 래퍼 없음
 *   4. readOnly=true + ESC/backdrop → onClose 호출 (onAutoSave 없이)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { useModalCoordinatorStore } from '@adapters/stores/useModalCoordinatorStore';
import { WidgetModal } from './WidgetModal';
import type { WidgetDefinition } from '../types';

// React 18 act 환경 플래그
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const FAKE_DEF: WidgetDefinition = {
  id: 'test-readonly-widget',
  name: '읽기전용 테스트 위젯',
  icon: 'apps',
  description: 'readonly unit test fixture',
  category: 'info',
  defaultSize: { w: 1, h: 1 },
  minSize: { w: 1, h: 1 },
  availableFor: {
    schoolLevel: ['elementary', 'middle', 'high'],
    role: ['homeroom', 'subject', 'admin'],
  },
  component: () => null,
};

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
  useModalCoordinatorStore.setState({ entries: [] });
}

async function flushMicrotasks() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/* ------------------------------------------------------------------ */
/*  readOnly=true 렌더링 검증                                          */
/* ------------------------------------------------------------------ */

describe('WidgetModal — readOnly=true', () => {
  let ctx: RenderContext;
  beforeEach(() => {
    ctx = setup();
  });
  afterEach(() => {
    teardown(ctx);
  });

  it('배너("이 위젯은 메인 앱에서 편집하세요")가 노출된다', () => {
    act(() => {
      ctx.root.render(
        <WidgetModal
          widgetId="test-readonly-widget"
          definition={FAKE_DEF}
          isOpen
          onClose={() => {}}
          size="md"
          readOnly
        >
          <input type="text" defaultValue="수정 불가" />
        </WidgetModal>,
      );
    });
    const banner = document.querySelector('[data-widget-modal-readonly-banner]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('이 위젯은 메인 앱에서 편집하세요');
  });

  it('본문이 <fieldset disabled>로 감싸진다', () => {
    act(() => {
      ctx.root.render(
        <WidgetModal
          widgetId="test-readonly-widget"
          definition={FAKE_DEF}
          isOpen
          onClose={() => {}}
          size="md"
          readOnly
        >
          <input type="text" defaultValue="수정 불가" />
        </WidgetModal>,
      );
    });
    const readonlyBody = document.querySelector('[data-widget-modal-readonly-body]');
    expect(readonlyBody).not.toBeNull();
    expect(readonlyBody?.tagName.toLowerCase()).toBe('fieldset');
    expect((readonlyBody as HTMLFieldSetElement)?.disabled).toBe(true);
  });

  it('requiresExplicitCancel=true여도 readOnly 시 취소 버튼이 숨김 처리된다', () => {
    act(() => {
      ctx.root.render(
        <WidgetModal
          widgetId="test-readonly-widget"
          definition={FAKE_DEF}
          isOpen
          onClose={() => {}}
          size="md"
          readOnly
          requiresExplicitCancel
        >
          <p>내용</p>
        </WidgetModal>,
      );
    });
    expect(document.querySelector('[data-widget-modal-cancel]')).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  readOnly=false (기본) — 배너/disabled 없음                        */
/* ------------------------------------------------------------------ */

describe('WidgetModal — readOnly=false(기본)', () => {
  let ctx: RenderContext;
  beforeEach(() => {
    ctx = setup();
  });
  afterEach(() => {
    teardown(ctx);
  });

  it('배너 미노출', () => {
    act(() => {
      ctx.root.render(
        <WidgetModal
          widgetId="test-readonly-widget"
          definition={FAKE_DEF}
          isOpen
          onClose={() => {}}
          size="md"
        >
          <p>일반 모드</p>
        </WidgetModal>,
      );
    });
    expect(document.querySelector('[data-widget-modal-readonly-banner]')).toBeNull();
  });

  it('fieldset disabled 래퍼 미노출', () => {
    act(() => {
      ctx.root.render(
        <WidgetModal
          widgetId="test-readonly-widget"
          definition={FAKE_DEF}
          isOpen
          onClose={() => {}}
          size="md"
        >
          <p>일반 모드</p>
        </WidgetModal>,
      );
    });
    expect(document.querySelector('[data-widget-modal-readonly-body]')).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  readOnly=true 닫기 경로 — onClose 호출 확인                       */
/* ------------------------------------------------------------------ */

describe('WidgetModal — readOnly=true 닫기 경로', () => {
  let ctx: RenderContext;
  beforeEach(() => {
    ctx = setup();
  });
  afterEach(() => {
    teardown(ctx);
  });

  it('ESC → onClose 호출 (onAutoSave 생략)', async () => {
    const onAutoSave = vi.fn();
    const onClose = vi.fn();
    act(() => {
      ctx.root.render(
        <WidgetModal
          widgetId="test-readonly-widget"
          definition={FAKE_DEF}
          isOpen
          onClose={onClose}
          size="md"
          onAutoSave={onAutoSave}
          readOnly
        >
          <p>내용</p>
        </WidgetModal>,
      );
    });
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await flushMicrotasks();
    });
    // readOnly 모드에서는 onAutoSave 건너뛰고 onClose만 호출
    expect(onAutoSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('backdrop mousedown → onClose 호출 (onAutoSave 생략)', async () => {
    const onAutoSave = vi.fn();
    const onClose = vi.fn();
    act(() => {
      ctx.root.render(
        <WidgetModal
          widgetId="test-readonly-widget"
          definition={FAKE_DEF}
          isOpen
          onClose={onClose}
          size="md"
          onAutoSave={onAutoSave}
          readOnly
        >
          <p>내용</p>
        </WidgetModal>,
      );
    });
    const backdrop = document.querySelector('[data-widget-modal-backdrop]') as HTMLDivElement;
    await act(async () => {
      backdrop.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await flushMicrotasks();
    });
    expect(onAutoSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
