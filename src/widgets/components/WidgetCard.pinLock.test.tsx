/**
 * @vitest-environment jsdom
 *
 * WidgetCard PIN 잠금 회귀 테스트.
 *
 * 배경(사용자 신고): 메모 위젯을 PIN 잠금 대상으로 지정해도 위젯 카드(타일)에는
 * 내용이 그대로 노출됐다. PIN 게이트가 클릭-확장 모달(WidgetModal)에만 있었고
 * 카드 본문(<definition.component/>)은 무방비였기 때문. 대시보드/바탕화면 위젯 모드
 * 모두 이 카드 본문을 공유하므로 두 화면 다 노출됐다.
 *
 * 이 테스트는 PIN_FEATURE_MAP에 매핑된 위젯의 카드 본문이 잠금 시
 * 내용 대신 잠금 카드를 렌더하고, 잠금 해제 시 내용을 렌더함을 검증한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { WidgetDefinition } from '../types';

// React 18 act 환경 플래그
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// usePinStore를 제어 가능한 mock으로 대체 — 실제 Settings 저장소 부작용 없이
// isProtected/isAccessible/lastUnlockedAt만 주입한다.
const pinMock: {
  isProtected: (feature: string) => boolean;
  isAccessible: (feature: string) => boolean;
  checkAutoLock: () => void;
  lastUnlockedAt: number | null;
} = {
  isProtected: (feature) => feature === 'memo',
  isAccessible: () => false,
  checkAutoLock: () => {},
  lastUnlockedAt: null,
};

vi.mock('@adapters/stores/usePinStore', () => ({
  usePinStore: (selector: (s: typeof pinMock) => unknown) => selector(pinMock),
}));

import { WidgetCard } from './WidgetCard';
import { useWidgetModalStore } from '../stores/useWidgetModalStore';

const MEMO_CONTENT = '비밀 메모 내용 XYZ';

function MemoLike() {
  return <div data-testid="memo-body">{MEMO_CONTENT}</div>;
}

function makeDef(id: string): WidgetDefinition {
  return {
    id,
    name: '메모',
    icon: '📝',
    description: 'pin-lock fixture',
    category: 'info',
    defaultSize: { w: 1, h: 5 },
    minSize: { w: 1, h: 2 },
    availableFor: {
      schoolLevel: ['elementary', 'middle', 'high', 'custom'],
      role: ['homeroom', 'subject', 'admin'],
    },
    component: MemoLike,
    modalMode: 'view+edit',
    modalSize: 'lg',
  };
}

interface Ctx {
  container: HTMLDivElement;
  root: Root;
}

function setup(): Ctx {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

function teardown(ctx: Ctx) {
  act(() => ctx.root.unmount());
  ctx.container.remove();
  document.body.innerHTML = '';
  useWidgetModalStore.setState({ openId: null, flashKey: 0 });
}

describe('WidgetCard — PIN 잠금 시 카드 본문 가림', () => {
  let ctx: Ctx;

  beforeEach(() => {
    ctx = setup();
    // 케이스 간 mock 상태 초기화
    pinMock.isProtected = (f) => f === 'memo';
    pinMock.isAccessible = () => false;
    pinMock.lastUnlockedAt = null;
  });

  afterEach(() => teardown(ctx));

  it('memo 위젯 잠금 상태 → 내용을 숨기고 잠금 카드를 표시한다', () => {
    act(() => {
      ctx.root.render(<WidgetCard definition={makeDef('memo')} />);
    });

    expect(ctx.container.querySelector('[data-testid="memo-body"]')).toBeNull();
    expect(ctx.container.textContent).not.toContain(MEMO_CONTENT);
    expect(ctx.container.textContent).toContain('잠금됨');
  });

  it('memo 위젯 잠금 해제(isAccessible) 상태 → 내용을 표시한다', () => {
    pinMock.isAccessible = () => true;

    act(() => {
      ctx.root.render(<WidgetCard definition={makeDef('memo')} />);
    });

    expect(ctx.container.querySelector('[data-testid="memo-body"]')).not.toBeNull();
    expect(ctx.container.textContent).toContain(MEMO_CONTENT);
  });

  it('PIN_FEATURE_MAP에 없는 위젯 → 잠금 설정과 무관하게 내용을 표시한다', () => {
    // 전역적으로 보호/미접근 상태여도 매핑이 없으면 가드로 감싸지 않는다.
    pinMock.isProtected = () => true;
    pinMock.isAccessible = () => false;

    act(() => {
      ctx.root.render(<WidgetCard definition={makeDef('non-pin-widget')} />);
    });

    expect(ctx.container.querySelector('[data-testid="memo-body"]')).not.toBeNull();
    expect(ctx.container.textContent).toContain(MEMO_CONTENT);
  });
});
