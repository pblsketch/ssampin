/**
 * ModalCoordinator — 동시 노출 가능한 모달들을 우선순위 큐로 직렬화한다.
 *
 * notification-modal-stacking-fix Phase 2 (Plan v1.1, Design v1.1).
 *
 * 배경:
 * z-50 / z-sp-modal + fixed inset-0 패턴을 가진 6개 모달(UpdateNotification,
 * EventPopup, FirstSyncConfirmModal, DriveSyncConflictModal, OAuthModalsProvider 3종,
 * SharePromptOverlay)이 같은 z 평면에 공존하며 DOM 순서로만 스태킹이 결정되어,
 * 첫 실행 시 동시 노출되면 위 모달이 아래 모달의 X 버튼을 가리는 버그가 발생했다.
 *
 * 본 store는 각 모달이 마운트 시 `register`로 자기 자신을 큐에 등록하고,
 * `getHeadId` 로 자기가 head인지 판정해 head일 때만 렌더하도록 하는 인프라.
 * 컴포넌트는 `useRegisterModal` 훅으로 한 줄에 사용한다.
 */
import { create } from 'zustand';
import { generateUUID } from '@infrastructure/utils/uuid';

export type ModalPriority =
  | 'SECURITY_UPDATE'
  | 'FIRST_SYNC'
  | 'DRIVE_CONFLICT'
  | 'WIDGET_MODE_FALLBACK'
  | 'OAUTH_FLOW'
  | 'NORMAL_UPDATE'
  | 'WIDGET_EXPAND'
  | 'EVENT_ALERT'
  | 'WIDGET_MODE_COACH'
  | 'SHARE_PROMPT';

/**
 * 우선순위 숫자가 낮을수록 위(앞)에 노출.
 * 정책 출처: docs/02-design/features/notification-modal-stacking-fix.design.md §3.1.
 *
 * SECURITY_UPDATE: 보안 패치 강제 노출 — 다른 모든 모달 후순위 밀어냄
 * FIRST_SYNC: 신규 기기 첫 동기화 — 사용자 결정 전 데이터 안전 우선
 * DRIVE_CONFLICT: 클라우드 충돌 — resolve 전 다른 모달 차단
 * WIDGET_MODE_FALLBACK: 바탕화면 모드 적용 실패 — 사용자 행동 가이드 필요 (v2.1.x widget-mode-discovery, 2.5)
 * OAUTH_FLOW: OAuth 흐름 — 사용자 결정 (2026-05-21) 도중 알림 모두 대기
 * NORMAL_UPDATE: 일반 업데이트 안내
 * WIDGET_EXPAND: 위젯 확장 모달 — 업데이트 안내와 행사 알림 사이 (4.5)
 * EVENT_ALERT: 오늘 행사 알림
 * WIDGET_MODE_COACH: 위젯 모드 첫 진입 코치 투어 — 교육 성격, 알림보다 후순위 (v2.1.x, 5.5)
 * SHARE_PROMPT: 충성 사용자 공유 권유 — 마케팅 성격, 가장 후순위
 */
export const PRIORITY_ORDER: Record<ModalPriority, number> = {
  SECURITY_UPDATE: 0,
  FIRST_SYNC: 1,
  DRIVE_CONFLICT: 2,
  WIDGET_MODE_FALLBACK: 2.5,
  OAUTH_FLOW: 3,
  NORMAL_UPDATE: 4,
  WIDGET_EXPAND: 4.5,
  EVENT_ALERT: 5,
  WIDGET_MODE_COACH: 5.5,
  SHARE_PROMPT: 6,
};

export interface ModalEntry {
  /** stable id — 컴포넌트 마운트 시 uuid 생성, unmount 시 unregister */
  readonly id: string;
  readonly priority: ModalPriority;
  /** 컴포넌트가 자기 자신이 "표시 가능 상태"라고 판단할 때 true */
  readonly isOpen: boolean;
  /** 마운트 시각 — 같은 priority 안에서 LIFO tiebreaker (높은 값이 우선) */
  readonly registeredAt: number;
  /**
   * 이 entry가 head를 빼앗겼을 때 호출되는 콜백.
   * register로 새 entry가 head가 될 때만 발화 — unregister 시에는 절대 발화하지 않음.
   * (unregister → onPreempt → onClose → unregister 무한 루프 방지)
   */
  readonly onPreempt?: (reason: 'system_modal' | 'higher_priority') => void;
}

export interface ModalCoordinatorState {
  readonly entries: readonly ModalEntry[];
  /** 마운트 시 1회 호출. id 반환 → cleanup에서 unregister에 전달 */
  register: (
    priority: ModalPriority,
    isOpen: boolean,
    options?: { onPreempt?: ModalEntry['onPreempt'] },
  ) => string;
  unregister: (id: string) => void;
  /** isOpen 상태 갱신 (컴포넌트의 showPopup/status 등 변화 반영) */
  updateIsOpen: (id: string, isOpen: boolean) => void;
  /** head 후보가 없으면 null. open=true 중 우선순위 가장 높고, 동률이면 LIFO */
  getHeadId: () => string | null;
}

/**
 * 순수 함수 — entries로부터 head id를 결정.
 * 테스트 용이성을 위해 별도 export.
 */
export function selectHead(entries: readonly ModalEntry[]): string | null {
  const openEntries = entries.filter((e) => e.isOpen);
  if (openEntries.length === 0) return null;

  let best: ModalEntry = openEntries[0]!;
  for (let i = 1; i < openEntries.length; i++) {
    const candidate = openEntries[i]!;
    const candP = PRIORITY_ORDER[candidate.priority];
    const bestP = PRIORITY_ORDER[best.priority];
    if (candP < bestP) {
      best = candidate;
      continue;
    }
    if (candP === bestP && candidate.registeredAt > best.registeredAt) {
      // LIFO: 나중에 등록된 것이 우선
      best = candidate;
    }
  }
  return best.id;
}

export const useModalCoordinatorStore = create<ModalCoordinatorState>((set, get) => ({
  entries: [],
  register: (priority, isOpen, options) => {
    const id = generateUUID();
    // performance.now()는 페이지 로드 후 monotonically increasing — Date.now()와 달리
    // 시스템 시계 변경에 영향 받지 않아 LIFO tiebreaker로 안전
    const registeredAt =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();

    // onPreempt는 register로 인한 head 전환 시에만 발화한다.
    // unregister 시에는 절대 발화하지 않음 — 무한 루프 방지:
    //   onPreempt → onClose → unregister → onPreempt → ...
    const prevHead = selectHead(get().entries);

    set((s) => ({
      entries: [
        ...s.entries,
        { id, priority, isOpen, registeredAt, onPreempt: options?.onPreempt },
      ],
    }));

    const newHead = selectHead(get().entries);
    if (prevHead && prevHead !== newHead) {
      const prevEntry = get().entries.find((e) => e.id === prevHead);
      if (prevEntry?.onPreempt) {
        const newEntry = newHead ? get().entries.find((e) => e.id === newHead) : null;
        const reason: 'system_modal' | 'higher_priority' =
          newEntry && PRIORITY_ORDER[newEntry.priority] < PRIORITY_ORDER[prevEntry.priority]
            ? 'higher_priority'
            : 'system_modal';
        prevEntry.onPreempt(reason);
      }
    }

    return id;
  },
  unregister: (id) => {
    set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
  },
  updateIsOpen: (id, isOpen) => {
    set((s) => ({
      entries: s.entries.map((e) => (e.id === id ? { ...e, isOpen } : e)),
    }));
  },
  getHeadId: () => selectHead(get().entries),
}));
