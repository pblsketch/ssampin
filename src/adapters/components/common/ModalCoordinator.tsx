/**
 * ModalCoordinator — App tree에 단 한 번 마운트되는 모달 큐 인프라 시그널.
 *
 * notification-modal-stacking-fix Phase 2 (Plan v1.1, Design v1.1).
 *
 * 의도적으로 비어있는 컴포넌트다. 실제 렌더는 각 모달 컴포넌트가
 * `useRegisterModal` 훅으로 자기가 head인지 판정해 처리한다.
 *
 * 본 컴포넌트가 존재하는 이유:
 * 1. App.tsx 렌더 트리에 "큐 인프라가 마운트되었음" 시그널 — 메타테스트(Phase 4)에서
 *    `<ModalCoordinator />` 존재를 검증해 인프라 누락 방지
 * 2. 추후 큐 상태 디버깅 패널·dev tools 연결점 확보
 *
 * 사용 위치: [src/App.tsx](../../../App.tsx) `<UpdateNotification />` 직전.
 */
export function ModalCoordinator(): null {
  return null;
}
