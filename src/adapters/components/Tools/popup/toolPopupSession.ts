import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { PopupToolId } from '@domain/entities/ToolPopup';

/**
 * 쌤도구 팝업 — 창 사이로 실행 상태를 옮기는 계약.
 *
 * 도구는 `useToolPopupInitial` 로 넘겨받은 상태를 읽고, `useToolPopupSlot` 으로
 * **정지+캡처** 와 **복원** 두 함수를 등록한다.
 *
 * ★ `capture()` 는 순수 함수가 아니다. 돌고 있는 타이머·애니메이션·예약 알람을
 *   **먼저 끄고** 나서 상태를 담아야 한다. 이 정지 책임을 계약 함수 안에 둔 이유는,
 *   "호출하는 쪽이 알아서 멈추겠지" 라는 주석 계약이 지켜지지 않아 같은 일이 두 번
 *   일어난 사고가 실제로 있었기 때문이다. 이렇게 하면 소유자가 언제나 창 하나뿐이다.
 *
 * 설계: docs/02-design/features/tool-popup.design.md §3
 */

/** 도구 한 조각의 상태를 담고 되돌리는 짝. */
export interface ToolHandoffHandlers<T> {
  /** 돌고 있는 것을 **먼저 멈추고** 지금 상태를 돌려준다. */
  capture(): T;
  /**
   * 스냅샷을 다시 적용한다. 필요하면 다시 돌린다.
   * `capturedAt` 은 스냅샷을 찍은 시각 — 그동안 흐른 시간을 반영하는 데 쓴다.
   */
  resume(snapshot: T, capturedAt: number): void;
}

/** 창을 넘어가는 스냅샷 봉투. 도구 안 여러 조각이 각자 칸을 쓴다. */
export interface ToolPopupSnapshotEnvelope {
  readonly version: 1;
  readonly capturedAt: number;
  readonly slots: Readonly<Record<string, unknown>>;
}

export type ToolPopupPlacement = 'main' | 'popup';

export interface ToolPopupSessionValue {
  readonly placement: ToolPopupPlacement;
  readonly toolId: PopupToolId;
  /** 첫 렌더에 쓸 복원 스냅샷. 새로 시작한 창이면 null. */
  readonly initialSnapshot: ToolPopupSnapshotEnvelope | null;
  /** 도구 조각이 자기 칸을 등록한다. 반환값을 호출하면 등록이 풀린다. */
  registerSlot(slotId: string, handlers: ToolHandoffHandlers<unknown>): () => void;
  /** 본문 → 팝업으로 옮기기. */
  moveToPopup(): void;
  /** 팝업 → 본문으로 가져오기. */
  returnToMain(): void;
  /** 팝업 창 닫기(= 이 실행 종료). */
  closePopup(): void;
  readonly alwaysOnTop: boolean;
  toggleAlwaysOnTop(): void;
  readonly supportsAlwaysOnTop: boolean;
  /** 옮기는 중이면 true — 버튼을 잠가 두 번 눌리는 것을 막는다. */
  readonly busy: boolean;
}

export const ToolPopupSessionContext = createContext<ToolPopupSessionValue | null>(null);

export function useToolPopupSession(): ToolPopupSessionValue | null {
  return useContext(ToolPopupSessionContext);
}

/** 등록된 칸들을 모아 봉투 하나로 만들고, 봉투를 다시 칸별로 풀어 준다. */
export class ToolPopupSlotRegistry {
  private readonly slots = new Map<string, ToolHandoffHandlers<unknown>>();

  register(slotId: string, handlers: ToolHandoffHandlers<unknown>): () => void {
    this.slots.set(slotId, handlers);
    return () => {
      if (this.slots.get(slotId) === handlers) this.slots.delete(slotId);
    };
  }

  /** 등록된 모든 칸을 멈추고 담는다. */
  capture(now: number): ToolPopupSnapshotEnvelope {
    const slots: Record<string, unknown> = {};
    for (const [slotId, handlers] of this.slots) {
      slots[slotId] = handlers.capture();
    }
    return { version: 1, capturedAt: now, slots };
  }

  /** 봉투를 칸별로 되돌린다. 지금 화면에 없는 칸은 건너뛴다. */
  resume(envelope: ToolPopupSnapshotEnvelope | null): void {
    if (envelope === null) return;
    for (const [slotId, handlers] of this.slots) {
      if (!Object.prototype.hasOwnProperty.call(envelope.slots, slotId)) continue;
      handlers.resume(envelope.slots[slotId], envelope.capturedAt);
    }
  }
}

/** 넘겨받은 값이 우리가 만든 봉투인지 확인한다. 아니면 새로 시작한다. */
export function asSnapshotEnvelope(value: unknown): ToolPopupSnapshotEnvelope | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Partial<ToolPopupSnapshotEnvelope>;
  if (candidate.version !== 1) return null;
  if (typeof candidate.capturedAt !== 'number' || !Number.isFinite(candidate.capturedAt))
    return null;
  if (typeof candidate.slots !== 'object' || candidate.slots === null) return null;
  return { version: 1, capturedAt: candidate.capturedAt, slots: candidate.slots };
}

export interface ToolHandoffInitial<T> {
  readonly data: T;
  /** 스냅샷을 찍은 시각. 흐른 시간을 더해 복원할 때 쓴다. */
  readonly capturedAt: number;
}

/**
 * 넘겨받은 스냅샷 중 이 칸의 값을 읽는다. **첫 렌더에** 쓰라고 있는 훅이다.
 *
 * `const [x, setX] = useState(() => initial?.data.x ?? 기본값)`
 */
export function useToolPopupInitial<T>(slotId: string): ToolHandoffInitial<T> | null {
  const session = useToolPopupSession();
  // 상태로 굳혀 둔다 — 두 번 복원되지 않는다.
  const [initial] = useState<ToolHandoffInitial<T> | null>(() => {
    const envelope = session?.initialSnapshot ?? null;
    if (envelope === null) return null;
    if (!Object.prototype.hasOwnProperty.call(envelope.slots, slotId)) return null;
    return { data: envelope.slots[slotId] as T, capturedAt: envelope.capturedAt };
  });
  return initial;
}

/**
 * 이 칸을 팝업 이관에 등록한다. 상태·콜백을 다 만든 **뒤에** 부른다.
 * 팝업을 지원하지 않는 자리(병렬 보기 슬롯 등)에서는 아무 일도 하지 않는다.
 */
export function useToolPopupSlot<T>(slotId: string, handlers: ToolHandoffHandlers<T>): void {
  const session = useToolPopupSession();
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (session === null) return;
    return session.registerSlot(slotId, {
      capture: () => handlersRef.current.capture(),
      resume: (snapshot, capturedAt) => handlersRef.current.resume(snapshot as T, capturedAt),
    });
  }, [session, slotId]);
}
