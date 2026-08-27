import { PointerSensor } from '@dnd-kit/core';
import type { PointerEvent as ReactPointerEvent } from 'react';

/**
 * 대시보드 위젯 전용 포인터 센서
 *
 * 왜 만들었나 (2026-08-27 사용자 피드백 "대시보드 화면 위에 마우스 블럭 씌워지는 거"):
 * 예전에는 드래그 리스너가 ⋮ 손잡이 버튼에만 붙어 있었다. 그런데 손잡이는 카드에
 * 마우스를 300ms 올리고 기다려야 나타나므로, 선생님들은 그걸 기다리지 않고 카드 본문을
 * 바로 잡고 끈다. 그러면 위젯은 꿈쩍도 않고 대신 브라우저 기본 동작인 "글자 긁기"만
 * 일어나 시간표 셀·할 일이 통째로 파랗게 선택됐다(실측: 카드 본문 80자).
 *
 * 그래서 카드 본문 어디를 잡아도 위젯이 옮겨지게 한다. 다만 예전에 한 번 crash 낸 방식
 * (카드 위에 투명 hover zone 을 덮어 안쪽 버튼 클릭을 삼킨 사고, SortableWidget 주석 참고)
 * 을 되풀이하지 않으려고 **DOM 을 새로 덮지 않고 센서 단계에서 걸러낸다.**
 *
 * 걸러내는 것:
 * 1. 버튼·링크·입력칸 위에서 시작한 누름 → 드래그로 삼키지 않는다(클릭이 그대로 살아야 함)
 * 2. 스크롤바를 잡은 누름 → 목록을 스크롤하려던 것이지 위젯을 옮기려던 게 아니다
 * 3. ⋮ 손잡이는 1번의 예외 — 버튼이지만 이건 드래그가 본업이다
 *
 * 카드를 "톡" 누르는 것(모달 열기)은 그대로 산다. DndContext 의 activationConstraint
 * distance 8 이 8px 미만 움직임을 클릭으로 넘겨주기 때문이다.
 */

/** 드래그 손잡이임을 표시하는 속성 — 이게 붙은 요소는 인터랙티브 제외 규칙을 건너뛴다 */
export const WIDGET_DRAG_HANDLE_ATTR = 'data-widget-drag-handle';

const INTERACTIVE_SELECTOR = [
  'button',
  'a',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[contenteditable="true"]',
  '[data-widget-interactive="true"]',
].join(', ');

/**
 * 누른 지점이 "위젯을 옮기려는 의도"로 볼 수 있는 곳인지 판정한다.
 * WidgetCard 의 클릭 무시 목록과 같은 기준을 쓴다 — 한쪽만 바뀌면 클릭은 되는데 드래그는
 * 안 되는(혹은 그 반대) 엇갈림이 생긴다.
 */
export function shouldStartWidgetDrag(event: PointerEvent): boolean {
  if (!event.isPrimary || event.button !== 0) return false;

  const target = event.target;
  if (!(target instanceof Element)) return true;

  // 스크롤바를 잡은 경우 — 내용 영역(clientWidth/Height) 밖을 누른 것으로 판별한다.
  // 이걸 빼면 긴 목록 위젯의 스크롤바를 끌 때 위젯이 통째로 딸려 나온다.
  if (target instanceof HTMLElement) {
    const onVerticalScrollbar =
      target.clientWidth > 0 &&
      event.offsetX > target.clientWidth &&
      target.scrollHeight > target.clientHeight;
    const onHorizontalScrollbar =
      target.clientHeight > 0 &&
      event.offsetY > target.clientHeight &&
      target.scrollWidth > target.clientWidth;
    if (onVerticalScrollbar || onHorizontalScrollbar) return false;
  }

  // ⋮ 손잡이는 버튼이지만 드래그가 본업 — 인터랙티브 제외보다 먼저 통과시킨다
  if (target.closest(`[${WIDGET_DRAG_HANDLE_ATTR}]`)) return true;

  // 버튼·링크·입력칸 위에서 시작했으면 그건 누르려던 것이지 옮기려던 게 아니다
  if (target.closest(INTERACTIVE_SELECTOR)) return false;

  return true;
}

export class WidgetPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: ({ nativeEvent: event }: ReactPointerEvent): boolean => shouldStartWidgetDrag(event),
    },
  ];
}
