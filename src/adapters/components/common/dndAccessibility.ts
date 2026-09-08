/**
 * dnd-kit 화면낭독(스크린리더) 문구 — 한국어.
 *
 * dnd-kit 은 끌기 시작·이동·놓기·취소를 `role="status"` 영역에 **영어로** 알린다
 * ("Draggable item x was dropped over droppable area y"). 앱의 모든 글자는 한국어여야 하고,
 * 화면낭독을 쓰는 선생님에게 영어 문장이 갑자기 읽히는 건 고장처럼 들린다
 * (2026-09-08 실기기 대행 QA R-9). 모든 `DndContext` 에 이 값을 `accessibility` 로 넘긴다.
 */
import type { Announcements, ScreenReaderInstructions } from '@dnd-kit/core';

const announcements: Announcements = {
  onDragStart: ({ active }) => `${String(active.id)} 항목을 집었어요.`,
  onDragOver: ({ active, over }) =>
    over
      ? `${String(active.id)} 항목이 ${String(over.id)} 위에 있어요.`
      : `${String(active.id)} 항목을 놓을 자리가 없어요.`,
  onDragEnd: ({ active, over }) =>
    over
      ? `${String(active.id)} 항목을 ${String(over.id)} 에 놓았어요.`
      : `${String(active.id)} 항목을 놓았어요.`,
  onDragCancel: ({ active }) => `${String(active.id)} 항목 끌기를 취소했어요.`,
};

const screenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    '끌 수 있는 항목이에요. 스페이스로 집고 화살표로 옮긴 뒤 다시 스페이스로 놓아요. Esc 로 취소해요.',
};

/** `<DndContext accessibility={DND_KO_ACCESSIBILITY}>` */
export const DND_KO_ACCESSIBILITY = { announcements, screenReaderInstructions } as const;
