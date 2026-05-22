/**
 * WidgetModal 단위 테스트.
 *
 * @vitest-environment jsdom
 *
 * G001 Foundation (ralplan Step 1). createPortal + useEffect + ModalCoordinator
 * 통합 동작이라 SSR(renderToString)으로는 검증 불가 → jsdom 환경에서 실제 DOM에 마운트.
 *
 * 검사 범위:
 *   1. createSaveAndClose pure 함수 — onAutoSave→onClose 직렬화, 에러 흡수
 *   2. 마운트/언마운트 — isOpen 토글 시 portal 내용 노출/제거
 *   3. backdrop / ESC / ✕ 경로 → onAutoSave + onClose
 *   4. requiresExplicitCancel — "취소" 버튼이 onAutoSave 없이 onClose만 호출
 *   5. AC20 시스템 모달 preempt — SECURITY_UPDATE 등록 시 자동 저장+닫기
 *   6. ARIA 접근성 (role/aria-modal/aria-label)
 *   7. 사이즈 클래스 매핑 (sm/md/lg/fullscreen)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { useModalCoordinatorStore } from '@adapters/stores/useModalCoordinatorStore';
import { WidgetModal, createSaveAndClose, type WidgetModalSize } from './WidgetModal';
import type { WidgetDefinition } from '../types';

// React 18 act 환경 플래그 — react-dom/client + act 경고 제거.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/* ------------------------------------------------------------------ */
/*  Fixtures                                                          */
/* ------------------------------------------------------------------ */

/** PIN 보호와 무관한 가짜 위젯 — DashboardPinGuard 우회. */
const FAKE_DEF: WidgetDefinition = {
  id: 'test-widget',
  name: '테스트 위젯',
  icon: 'apps',
  description: 'unit test fixture',
  category: 'info',
  defaultSize: { w: 1, h: 1 },
  minSize: { w: 1, h: 1 },
  availableFor: {
    schoolLevel: ['elementary', 'middle', 'high'],
    role: ['homeroom', 'subject', 'admin'],
  },
  // 본 테스트에서는 component를 직접 렌더하지 않음 — children prop이 우선.
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
  // 다음 케이스 누수 차단 — ModalCoordinator entries 초기화.
  useModalCoordinatorStore.setState({ entries: [] });
}

/**
 * 마이크로태스크 큐를 완전히 drain — `Promise.resolve().then().catch().finally()` 직렬화 흐름,
 * 그리고 React effect commit 이후 발화되는 onPreempt 콜백까지 모두 처리 완료시킨다.
 *
 * setTimeout(resolve, 0) 한 번 호출이면 모든 pending microtask가 macrotask 직전에 비워진다 —
 * 가장 안전한 단일 flush 방법.
 */
async function flushMicrotasks() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/* ------------------------------------------------------------------ */
/*  createSaveAndClose — pure 함수 단위 검증                          */
/* ------------------------------------------------------------------ */

describe('createSaveAndClose', () => {
  it('onAutoSave 정상 종료 → onClose 호출', async () => {
    const onAutoSave = vi.fn(() => Promise.resolve());
    const onClose = vi.fn();
    createSaveAndClose(onAutoSave, onClose)();
    await flushMicrotasks();
    expect(onAutoSave).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('onAutoSave 동기 throw → 흡수 후 onClose 항상 호출 (AC20)', async () => {
    const onAutoSave = vi.fn(() => {
      throw new Error('save 실패');
    });
    const onClose = vi.fn();
    createSaveAndClose(onAutoSave, onClose)();
    await flushMicrotasks();
    expect(onAutoSave).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('onAutoSave async reject → 흡수 후 onClose 호출 (AC20 데이터 손실 방지)', async () => {
    const onAutoSave = vi.fn(() => Promise.reject(new Error('네트워크 오류')));
    const onClose = vi.fn();
    createSaveAndClose(onAutoSave, onClose)();
    await flushMicrotasks();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('onAutoSave undefined → onClose만 호출', async () => {
    const onClose = vi.fn();
    createSaveAndClose(undefined, onClose)();
    await flushMicrotasks();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('sync 반환(void) onAutoSave → onClose 호출', async () => {
    const onAutoSave = vi.fn(() => {
      /* sync no-op */
    });
    const onClose = vi.fn();
    createSaveAndClose(onAutoSave, onClose)();
    await flushMicrotasks();
    expect(onAutoSave).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------ */
/*  렌더링 / 라이프사이클 — jsdom + createRoot                        */
/* ------------------------------------------------------------------ */

describe('WidgetModal — 렌더링', () => {
  let ctx: RenderContext;
  beforeEach(() => {
    ctx = setup();
  });
  afterEach(() => {
    teardown(ctx);
  });

  it('isOpen=false → portal 내용 미렌더', () => {
    act(() => {
      ctx.root.render(
        <WidgetModal
          widgetId="test-widget"
          definition={FAKE_DEF}
          isOpen={false}
          onClose={() => {}}
          size="md"
        >
          <p>body</p>
        </WidgetModal>,
      );
    });
    expect(document.querySelector('[data-widget-modal-backdrop]')).toBeNull();
  });

  it('isOpen=true → backdrop + body + 제목 + ✕ 버튼 노출', () => {
    act(() => {
      ctx.root.render(
        <WidgetModal
          widgetId="test-widget"
          definition={FAKE_DEF}
          isOpen
          onClose={() => {}}
          size="md"
        >
          <p>body</p>
        </WidgetModal>,
      );
    });
    const backdrop = document.querySelector('[data-widget-modal-backdrop]');
    expect(backdrop).not.toBeNull();
    expect(backdrop?.getAttribute('data-widget-id')).toBe('test-widget');
    const body = document.querySelector('[data-widget-modal-body]');
    expect(body).not.toBeNull();
    expect(body?.getAttribute('role')).toBe('dialog');
    expect(body?.getAttribute('aria-modal')).toBe('true');
    expect(body?.getAttribute('aria-label')).toBe('테스트 위젯');
    expect(document.querySelector('[data-widget-modal-close]')).not.toBeNull();
    expect(backdrop?.textContent).toContain('body');
  });

  it.each<{ size: WidgetModalSize; cls: string }>([
    { size: 'sm', cls: 'max-w-md' },
    { size: 'md', cls: 'max-w-2xl' },
    { size: 'lg', cls: 'max-w-4xl' },
    { size: 'fullscreen', cls: 'w-screen' },
  ])('사이즈 $size → $cls 클래스 적용', ({ size, cls }) => {
    act(() => {
      ctx.root.render(
        <WidgetModal
          widgetId="test-widget"
          definition={FAKE_DEF}
          isOpen
          onClose={() => {}}
          size={size}
        >
          <p>body</p>
        </WidgetModal>,
      );
    });
    const body = document.querySelector('[data-widget-modal-body]') as HTMLElement;
    expect(body.className).toContain(cls);
  });

  it('requiresExplicitCancel=true → "취소" 버튼 노출', () => {
    act(() => {
      ctx.root.render(
        <WidgetModal
          widgetId="test-widget"
          definition={FAKE_DEF}
          isOpen
          onClose={() => {}}
          size="lg"
          requiresExplicitCancel
        >
          <p>body</p>
        </WidgetModal>,
      );
    });
    const cancel = document.querySelector('[data-widget-modal-cancel]') as HTMLButtonElement;
    expect(cancel).not.toBeNull();
    expect(cancel.textContent).toContain('취소');
  });

  it('기본(requiresExplicitCancel=false) → "취소" 버튼 미노출', () => {
    act(() => {
      ctx.root.render(
        <WidgetModal
          widgetId="test-widget"
          definition={FAKE_DEF}
          isOpen
          onClose={() => {}}
          size="md"
        >
          <p>body</p>
        </WidgetModal>,
      );
    });
    expect(document.querySelector('[data-widget-modal-cancel]')).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  상호작용 — backdrop / ESC / ✕ / 취소                              */
/* ------------------------------------------------------------------ */

describe('WidgetModal — 닫기 경로', () => {
  let ctx: RenderContext;
  beforeEach(() => {
    ctx = setup();
  });
  afterEach(() => {
    teardown(ctx);
  });

  it('backdrop mousedown → onAutoSave + onClose', async () => {
    const onAutoSave = vi.fn(() => Promise.resolve());
    const onClose = vi.fn();
    act(() => {
      ctx.root.render(
        <WidgetModal
          widgetId="test-widget"
          definition={FAKE_DEF}
          isOpen
          onClose={onClose}
          size="md"
          onAutoSave={onAutoSave}
        >
          <p>body</p>
        </WidgetModal>,
      );
    });
    const backdrop = document.querySelector('[data-widget-modal-backdrop]') as HTMLDivElement;
    // dispatch mousedown with target === backdrop 자체
    await act(async () => {
      backdrop.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await flushMicrotasks();
    });
    expect(onAutoSave).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('본체 mousedown은 backdrop 닫기를 트리거하지 않는다', async () => {
    const onAutoSave = vi.fn();
    const onClose = vi.fn();
    act(() => {
      ctx.root.render(
        <WidgetModal
          widgetId="test-widget"
          definition={FAKE_DEF}
          isOpen
          onClose={onClose}
          size="md"
          onAutoSave={onAutoSave}
        >
          <p data-testid="inner">body</p>
        </WidgetModal>,
      );
    });
    const inner = document.querySelector('[data-testid="inner"]') as HTMLElement;
    await act(async () => {
      inner.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await flushMicrotasks();
    });
    expect(onAutoSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ESC 키 → onAutoSave + onClose', async () => {
    const onAutoSave = vi.fn();
    const onClose = vi.fn();
    act(() => {
      ctx.root.render(
        <WidgetModal
          widgetId="test-widget"
          definition={FAKE_DEF}
          isOpen
          onClose={onClose}
          size="md"
          onAutoSave={onAutoSave}
        >
          <p>body</p>
        </WidgetModal>,
      );
    });
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await flushMicrotasks();
    });
    expect(onAutoSave).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('✕ 버튼 → onAutoSave + onClose', async () => {
    const onAutoSave = vi.fn();
    const onClose = vi.fn();
    act(() => {
      ctx.root.render(
        <WidgetModal
          widgetId="test-widget"
          definition={FAKE_DEF}
          isOpen
          onClose={onClose}
          size="md"
          onAutoSave={onAutoSave}
        >
          <p>body</p>
        </WidgetModal>,
      );
    });
    const closeBtn = document.querySelector('[data-widget-modal-close]') as HTMLButtonElement;
    await act(async () => {
      closeBtn.click();
      await flushMicrotasks();
    });
    expect(onAutoSave).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('명시 "취소" 버튼 → onAutoSave 호출 없이 onClose만 (파괴적 작업 보호)', async () => {
    const onAutoSave = vi.fn();
    const onClose = vi.fn();
    act(() => {
      ctx.root.render(
        <WidgetModal
          widgetId="test-widget"
          definition={FAKE_DEF}
          isOpen
          onClose={onClose}
          size="lg"
          onAutoSave={onAutoSave}
          requiresExplicitCancel
        >
          <p>body</p>
        </WidgetModal>,
      );
    });
    const cancel = document.querySelector('[data-widget-modal-cancel]') as HTMLButtonElement;
    await act(async () => {
      cancel.click();
      await flushMicrotasks();
    });
    expect(onAutoSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------ */
/*  AC20 — 시스템 모달 preempt                                        */
/* ------------------------------------------------------------------ */

describe('WidgetModal — AC20 시스템 모달 preempt', () => {
  let ctx: RenderContext;
  beforeEach(() => {
    ctx = setup();
  });
  afterEach(() => {
    teardown(ctx);
  });

  it('SECURITY_UPDATE 모달이 등록되면 위젯 모달은 자동 저장 후 닫힘', async () => {
    const onAutoSave = vi.fn(() => Promise.resolve());
    const onClose = vi.fn();
    act(() => {
      ctx.root.render(
        <WidgetModal
          widgetId="test-widget"
          definition={FAKE_DEF}
          isOpen
          onClose={onClose}
          size="md"
          onAutoSave={onAutoSave}
        >
          <p>body</p>
        </WidgetModal>,
      );
    });
    // mount 직후 effect로 ModalCoordinator 등록 완료. head 확인.
    const stateBefore = useModalCoordinatorStore.getState();
    expect(stateBefore.entries.some((e) => e.priority === 'WIDGET_EXPAND')).toBe(true);

    // 시스템 모달 등록 → onPreempt 발화 → saveAndClose 실행.
    act(() => {
      useModalCoordinatorStore.getState().register('SECURITY_UPDATE', true);
    });
    await flushMicrotasks();

    expect(onAutoSave).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('onAutoSave가 실패해도 preempt 흐름에서 onClose는 반드시 호출 (데이터 손실보다 닫힘 우선)', async () => {
    const onAutoSave = vi.fn(() => Promise.reject(new Error('IndexedDB 쓰기 실패')));
    const onClose = vi.fn();
    act(() => {
      ctx.root.render(
        <WidgetModal
          widgetId="test-widget"
          definition={FAKE_DEF}
          isOpen
          onClose={onClose}
          size="md"
          onAutoSave={onAutoSave}
        >
          <p>body</p>
        </WidgetModal>,
      );
    });
    act(() => {
      useModalCoordinatorStore.getState().register('SECURITY_UPDATE', true);
    });
    await flushMicrotasks();
    expect(onAutoSave).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
