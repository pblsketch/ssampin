/**
 * REGRESSION #72 (2026-09-08) — 위젯 카드 안 입력칸에서 스페이스가 삼켜지던 문제.
 *
 * 2026-08-28 `ee23ce55` 가 끌기 리스너를 카드 전체에 붙이면서(마우스 끌기 편의),
 * dnd-kit 키보드 감지기(Space·Enter = 끌기 시작)까지 카드 전체로 번졌다. 그래서
 * 할 일 위젯의 확장 모달 입력칸, 북마크·연락처·D-Day 입력칸에서 스페이스를 누르면
 * 글자 대신 "위젯 끌기"가 시작되고 화살표 키까지 위젯 이동으로 먹혔다(사용자 제보).
 *
 * 지켜야 할 선:
 *  1) 카드 안 입력칸과 확장 모달 안 입력칸의 Space 는 preventDefault 되지 않는다.
 *  2) ⋮ 손잡이 버튼의 Space 는 여전히 끌기 시작(preventDefault) — 키보드 순서 바꾸기 유지.
 *
 * @vitest-environment jsdom
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import React from 'react';
import { DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { SortableWidget } from '../SortableWidget';
import { useWidgetModalStore } from '../../stores/useWidgetModalStore';
import type { WidgetDefinition, WidgetInstance } from '../../types';

const DEF: WidgetDefinition = {
  id: 'kbd-input-widget',
  name: '입력칸 위젯',
  icon: 'apps',
  description: 'test fixture',
  category: 'info',
  defaultSize: { w: 1, h: 1 },
  minSize: { w: 1, h: 1 },
  availableFor: {
    schoolLevel: ['elementary', 'middle', 'high'],
    role: ['homeroom', 'subject', 'admin'],
  },
  // 컴팩트(카드)와 확장(모달) 양쪽에 입력칸을 하나씩 둔다 — 할 일 위젯(TodoEditor)과 같은 구조
  component: ({ isCompactMode = true }: { isCompactMode?: boolean }) =>
    React.createElement('input', {
      'data-testid': isCompactMode ? 'compact-input' : 'modal-input',
    }),
  modalMode: 'expanded',
  modalSize: 'md',
};

const INSTANCE: WidgetInstance = {
  widgetId: DEF.id,
  visible: true,
  order: 0,
  colSpan: 1,
  rowSpan: 1,
};

function Harness() {
  // WidgetGrid 와 같은 감지기 구성(키보드 감지기 포함)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  return React.createElement(
    DndContext,
    { sensors },
    React.createElement(SortableContext, {
      items: [DEF.id],
      children: React.createElement(SortableWidget, {
        instance: INSTANCE,
        definition: DEF,
        onHide: () => {},
        onResize: () => {},
        onResizeHeight: () => {},
      }),
    }),
  );
}

/** Space keydown 을 보내고 브라우저 기본 동작(글자 입력)이 막혔는지 돌려준다 */
function spaceIsSwallowed(el: Element): boolean {
  const ev = new KeyboardEvent('keydown', {
    key: ' ',
    code: 'Space',
    bubbles: true,
    cancelable: true,
  });
  let allowed = true;
  act(() => {
    allowed = el.dispatchEvent(ev);
  });
  return !allowed;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
  }
  container?.remove();
  root = null;
  container = null;
  useWidgetModalStore.setState({ openId: null, flashKey: 0 });
});

async function mount(): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(React.createElement(Harness));
  });
}

describe('REGRESSION #72 — 위젯 입력칸의 스페이스는 글자여야 한다', () => {
  it('카드 안 입력칸에서 누른 Space 는 끌기로 먹히지 않는다', async () => {
    await mount();
    const input = document.querySelector('[data-testid="compact-input"]');
    expect(input).not.toBeNull();
    expect(spaceIsSwallowed(input!)).toBe(false);
  });

  it('확장 모달 안 입력칸에서 누른 Space 도 끌기로 먹히지 않는다 (portal 이어도 이벤트는 카드로 올라온다)', async () => {
    await mount();
    const compact = document.querySelector('[data-testid="compact-input"]')!;
    const cardBody = compact.closest('.cursor-pointer') as HTMLElement | null;
    expect(cardBody).not.toBeNull();
    await act(async () => {
      cardBody!.click();
    });
    const modalInput = document.querySelector('[data-testid="modal-input"]');
    expect(modalInput).not.toBeNull();
    expect(spaceIsSwallowed(modalInput!)).toBe(false);
  });

  it('⋮ 손잡이 버튼에서 누른 Space 는 여전히 키보드 끌기를 시작한다', async () => {
    await mount();
    const handle = document.querySelector('button[aria-label="드래그하여 순서 변경"]');
    expect(handle).not.toBeNull();
    expect(spaceIsSwallowed(handle!)).toBe(true);
  });
});
