/**
 * Unit test: installDropGuard()가 dragover/drop을 bubble 단계에서 preventDefault한다.
 *
 * Vitest 환경(node)에는 jsdom이 없으므로 window/DragEvent 모의 객체를 직접 구성한다.
 * 실제 동작은 packaged Electron 빌드에서 수동 회귀 테스트(RG-01~RG-03)로 검증.
 *
 * Design 문서: docs/02-design/features/desktop-organize-drop-crash-fix.design.md §3.6.1
 */
import { afterEach, describe, expect, test, vi } from 'vitest';

describe('installDropGuard', () => {
  // window mock 복원용
  const originalWindow = (globalThis as { window?: unknown }).window;

  afterEach(() => {
    if (originalWindow !== undefined) {
      (globalThis as { window?: unknown }).window = originalWindow;
    } else {
      delete (globalThis as { window?: unknown }).window;
    }
    vi.restoreAllMocks();
  });

  test('dragover와 drop 이벤트를 bubble 단계(useCapture=false)에 등록한다', async () => {
    // window.addEventListener mock 구성
    const listeners: Array<{ event: string; handler: EventListener; useCapture: boolean }> = [];
    const mockWindow = {
      addEventListener: (event: string, handler: EventListener, useCapture?: boolean) => {
        listeners.push({ event, handler, useCapture: useCapture ?? false });
      },
    };
    (globalThis as { window?: unknown }).window = mockWindow;

    // 동적 import — 모듈 로드 시점에 globalThis.window가 mock으로 셋업되어 있어야 함
    const { installDropGuard } = await import('./security-guards');
    installDropGuard();

    const dragoverListener = listeners.find((l) => l.event === 'dragover');
    const dropListener = listeners.find((l) => l.event === 'drop');

    expect(dragoverListener, 'dragover listener가 등록되지 않았다').toBeDefined();
    expect(dropListener, 'drop listener가 등록되지 않았다').toBeDefined();

    expect(
      dragoverListener?.useCapture,
      'dragover는 React 핸들러 우선을 위해 bubble 단계(useCapture=false)에 등록되어야 한다',
    ).toBe(false);
    expect(
      dropListener?.useCapture,
      'drop은 React 핸들러 우선을 위해 bubble 단계(useCapture=false)에 등록되어야 한다',
    ).toBe(false);
  });

  test('등록된 핸들러가 이벤트의 preventDefault를 호출한다', async () => {
    const listeners: Array<{ event: string; handler: EventListener }> = [];
    (globalThis as { window?: unknown }).window = {
      addEventListener: (event: string, handler: EventListener) => {
        listeners.push({ event, handler });
      },
    };

    // vi.resetModules로 캐시된 import 초기화 — installDropGuard 재로드 강제
    vi.resetModules();
    const { installDropGuard } = await import('./security-guards');
    installDropGuard();

    const dragoverHandler = listeners.find((l) => l.event === 'dragover')?.handler;
    expect(dragoverHandler).toBeDefined();

    // 모의 이벤트
    const preventDefault = vi.fn();
    const fakeEvent = { preventDefault } as unknown as Event;
    dragoverHandler?.(fakeEvent);
    expect(preventDefault).toHaveBeenCalledOnce();
  });
});
