/**
 * useRegisterModal — 모달 컴포넌트가 ModalCoordinator 큐에 자기 자신을
 * 선언적으로 등록하는 React hook.
 *
 * notification-modal-stacking-fix Phase 2 (Plan v1.1, Design v1.1).
 *
 * 사용 패턴:
 * ```tsx
 * export function EventPopup() {
 *   const { showPopup, alertResult, dismissPopup } = useEventsStore();
 *   const isHead = useRegisterModal('EVENT_ALERT', showPopup && !!alertResult);
 *   if (!isHead) return null;
 *   return <Modal onClose={dismissPopup}>...</Modal>;
 * }
 * ```
 *
 * 라이프사이클:
 * - mount: store.register(priority, isOpen) → id 받음
 * - isOpen 변화: store.updateIsOpen(id, isOpen)
 * - unmount: store.unregister(id)
 *
 * 반환값: 자기가 현재 head인지 — head이면 true, 아니면 false (null 반환 가드용)
 */
import { useEffect, useRef } from 'react';
import {
  useModalCoordinatorStore,
  selectHead,
  type ModalPriority,
} from '@adapters/stores/useModalCoordinatorStore';

export function useRegisterModal(priority: ModalPriority, isOpen: boolean): boolean {
  const idRef = useRef<string | null>(null);

  // 마운트 시 1회 등록, unmount 시 해제.
  // priority는 컴포넌트 라이프타임 내 불변 가정 (대부분의 경우 상수).
  // 동적 priority(예: isSecurity에 따라 SECURITY_UPDATE vs NORMAL_UPDATE)는
  // 컴포넌트가 분기 점에서 unmount/remount 하거나, 별도 hook 호출로 처리.
  useEffect(() => {
    const id = useModalCoordinatorStore.getState().register(priority, isOpen);
    idRef.current = id;
    return () => {
      const currentId = idRef.current;
      if (currentId) {
        useModalCoordinatorStore.getState().unregister(currentId);
        idRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // isOpen 변화 → store 동기화
  useEffect(() => {
    if (idRef.current) {
      useModalCoordinatorStore.getState().updateIsOpen(idRef.current, isOpen);
    }
  }, [isOpen]);

  // 자기가 head인지 — store 변화 시 자동 재계산
  const headId = useModalCoordinatorStore((s) => selectHead(s.entries));
  return idRef.current !== null && headId === idRef.current;
}
