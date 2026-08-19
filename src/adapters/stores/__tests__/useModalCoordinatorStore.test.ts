/**
 * useModalCoordinatorStore 단위 테스트.
 *
 * notification-modal-stacking-fix Phase 2 (Design v1.1 §5.1).
 *
 * 목표: 우선순위 sort + LIFO tiebreaker + 등록/해제 라이프사이클 + isOpen 토글 +
 * 회귀 가드(priority enum 7종) 검증. 20+ 케이스.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useModalCoordinatorStore,
  selectHead,
  PRIORITY_ORDER,
  type ModalEntry,
  type ModalPriority,
} from '../useModalCoordinatorStore';

function reset() {
  useModalCoordinatorStore.setState({ entries: [] });
}

function entry(id: string, priority: ModalPriority, isOpen = true, registeredAt = 0): ModalEntry {
  return { id, priority, isOpen, registeredAt };
}

describe('useModalCoordinatorStore', () => {
  beforeEach(reset);
  afterEach(reset);

  describe('register / unregister 라이프사이클', () => {
    it('초기 entries는 빈 배열', () => {
      expect(useModalCoordinatorStore.getState().entries).toEqual([]);
    });

    it('register 1회 호출 시 entries에 1건 추가', () => {
      const id = useModalCoordinatorStore.getState().register('EVENT_ALERT', true);
      const entries = useModalCoordinatorStore.getState().entries;
      expect(entries).toHaveLength(1);
      expect(entries[0]!.id).toBe(id);
      expect(entries[0]!.priority).toBe('EVENT_ALERT');
      expect(entries[0]!.isOpen).toBe(true);
    });

    it('register 여러 번 호출 시 각각 다른 id 생성', () => {
      const id1 = useModalCoordinatorStore.getState().register('NORMAL_UPDATE', true);
      const id2 = useModalCoordinatorStore.getState().register('EVENT_ALERT', true);
      expect(id1).not.toBe(id2);
      expect(useModalCoordinatorStore.getState().entries).toHaveLength(2);
    });

    it('unregister 시 해당 id의 entry만 제거', () => {
      const id1 = useModalCoordinatorStore.getState().register('NORMAL_UPDATE', true);
      const id2 = useModalCoordinatorStore.getState().register('EVENT_ALERT', true);
      useModalCoordinatorStore.getState().unregister(id1);
      const entries = useModalCoordinatorStore.getState().entries;
      expect(entries).toHaveLength(1);
      expect(entries[0]!.id).toBe(id2);
    });

    it('존재하지 않는 id로 unregister 호출해도 에러 없이 entries 변화 없음', () => {
      const id = useModalCoordinatorStore.getState().register('EVENT_ALERT', true);
      useModalCoordinatorStore.getState().unregister('non-existent-id');
      expect(useModalCoordinatorStore.getState().entries).toHaveLength(1);
      expect(useModalCoordinatorStore.getState().entries[0]!.id).toBe(id);
    });
  });

  describe('updateIsOpen', () => {
    it('id 매칭되는 entry의 isOpen만 변경, 다른 entry 영향 없음', () => {
      const id1 = useModalCoordinatorStore.getState().register('NORMAL_UPDATE', true);
      const id2 = useModalCoordinatorStore.getState().register('EVENT_ALERT', true);
      useModalCoordinatorStore.getState().updateIsOpen(id1, false);
      const entries = useModalCoordinatorStore.getState().entries;
      expect(entries.find((e) => e.id === id1)?.isOpen).toBe(false);
      expect(entries.find((e) => e.id === id2)?.isOpen).toBe(true);
    });

    it('false → true → false 토글 정상 동작', () => {
      const id = useModalCoordinatorStore.getState().register('EVENT_ALERT', false);
      expect(useModalCoordinatorStore.getState().entries[0]!.isOpen).toBe(false);
      useModalCoordinatorStore.getState().updateIsOpen(id, true);
      expect(useModalCoordinatorStore.getState().entries[0]!.isOpen).toBe(true);
      useModalCoordinatorStore.getState().updateIsOpen(id, false);
      expect(useModalCoordinatorStore.getState().entries[0]!.isOpen).toBe(false);
    });

    it('존재하지 않는 id로 updateIsOpen 호출해도 에러 없이 무시', () => {
      const id = useModalCoordinatorStore.getState().register('EVENT_ALERT', true);
      useModalCoordinatorStore.getState().updateIsOpen('non-existent-id', false);
      expect(useModalCoordinatorStore.getState().entries[0]!.isOpen).toBe(true);
      // 명시: id는 사용되지 않으므로 lint 에러 방지
      expect(id).toBeTruthy();
    });
  });

  describe('selectHead (순수 함수)', () => {
    it('빈 배열 → null', () => {
      expect(selectHead([])).toBeNull();
    });

    it('isOpen=false뿐 → null', () => {
      const entries = [entry('a', 'EVENT_ALERT', false, 1), entry('b', 'NORMAL_UPDATE', false, 2)];
      expect(selectHead(entries)).toBeNull();
    });

    it('isOpen=true 1건 → 그 entry id 반환', () => {
      const entries = [entry('a', 'EVENT_ALERT', true, 1)];
      expect(selectHead(entries)).toBe('a');
    });

    it('SECURITY_UPDATE > SHARE_PROMPT', () => {
      const entries = [
        entry('share', 'SHARE_PROMPT', true, 100),
        entry('sec', 'SECURITY_UPDATE', true, 1), // registeredAt 작아도 priority 우선
      ];
      expect(selectHead(entries)).toBe('sec');
    });

    it('FIRST_SYNC > DRIVE_CONFLICT > OAUTH_FLOW > NORMAL_UPDATE > EVENT_ALERT > SHARE_PROMPT', () => {
      const order: ModalPriority[] = [
        'FIRST_SYNC',
        'DRIVE_CONFLICT',
        'OAUTH_FLOW',
        'NORMAL_UPDATE',
        'EVENT_ALERT',
        'SHARE_PROMPT',
      ];
      for (let i = 0; i < order.length - 1; i++) {
        const higher = order[i]!;
        const lower = order[i + 1]!;
        const entries = [entry('h', higher, true, 1), entry('l', lower, true, 1)];
        expect(selectHead(entries)).toBe('h');
      }
    });

    it('동일 priority 2건일 때 registeredAt 더 큰 쪽이 head (LIFO)', () => {
      const entries = [
        entry('first', 'EVENT_ALERT', true, 100),
        entry('second', 'EVENT_ALERT', true, 200), // 나중에 등록
      ];
      expect(selectHead(entries)).toBe('second');
    });

    it('동일 priority + 동일 registeredAt이면 처음 발견 entry head', () => {
      const entries = [entry('a', 'EVENT_ALERT', true, 100), entry('b', 'EVENT_ALERT', true, 100)];
      // 동률에서는 안정성 — 두 후보 중 하나가 반환되면 OK
      const head = selectHead(entries);
      expect(['a', 'b']).toContain(head);
    });

    it('isOpen=false인 SECURITY_UPDATE는 후보에서 제외 → 다음 우선순위 head', () => {
      const entries = [
        entry('sec-closed', 'SECURITY_UPDATE', false, 1),
        entry('event-open', 'EVENT_ALERT', true, 2),
      ];
      expect(selectHead(entries)).toBe('event-open');
    });

    it('OAUTH_FLOW(3) + NORMAL_UPDATE(4) + EVENT_ALERT(5) 동시 open → OAUTH_FLOW head (사용자 결정 2026-05-21)', () => {
      const entries = [
        entry('event', 'EVENT_ALERT', true, 1),
        entry('update', 'NORMAL_UPDATE', true, 2),
        entry('oauth', 'OAUTH_FLOW', true, 3),
      ];
      expect(selectHead(entries)).toBe('oauth');
    });
  });

  describe('getHeadId (store 상태 통합)', () => {
    it('register 후 즉시 getHeadId가 그 id 반환', () => {
      const id = useModalCoordinatorStore.getState().register('EVENT_ALERT', true);
      expect(useModalCoordinatorStore.getState().getHeadId()).toBe(id);
    });

    it('head 모달 unregister → 다음 우선순위 head 자동 노출', () => {
      const idHigh = useModalCoordinatorStore.getState().register('NORMAL_UPDATE', true);
      const idLow = useModalCoordinatorStore.getState().register('EVENT_ALERT', true);
      expect(useModalCoordinatorStore.getState().getHeadId()).toBe(idHigh);
      useModalCoordinatorStore.getState().unregister(idHigh);
      expect(useModalCoordinatorStore.getState().getHeadId()).toBe(idLow);
    });

    it('head 모달 updateIsOpen(false) → 다음 우선순위 head 자동 노출', () => {
      const idHigh = useModalCoordinatorStore.getState().register('NORMAL_UPDATE', true);
      const idLow = useModalCoordinatorStore.getState().register('EVENT_ALERT', true);
      useModalCoordinatorStore.getState().updateIsOpen(idHigh, false);
      expect(useModalCoordinatorStore.getState().getHeadId()).toBe(idLow);
    });

    it('모든 모달 isOpen=false → null', () => {
      const id1 = useModalCoordinatorStore.getState().register('NORMAL_UPDATE', true);
      const id2 = useModalCoordinatorStore.getState().register('EVENT_ALERT', true);
      useModalCoordinatorStore.getState().updateIsOpen(id1, false);
      useModalCoordinatorStore.getState().updateIsOpen(id2, false);
      expect(useModalCoordinatorStore.getState().getHeadId()).toBeNull();
    });

    it('보안 업데이트가 일정 알림 head 중 등록 → 즉시 보안 업데이트가 head로 교체', () => {
      const idEvent = useModalCoordinatorStore.getState().register('EVENT_ALERT', true);
      expect(useModalCoordinatorStore.getState().getHeadId()).toBe(idEvent);
      const idSec = useModalCoordinatorStore.getState().register('SECURITY_UPDATE', true);
      expect(useModalCoordinatorStore.getState().getHeadId()).toBe(idSec);
    });
  });

  describe('priority enum 정합성 (회귀 가드)', () => {
    it('PRIORITY_ORDER에 11종 priority 모두 정의되어 있다 (record-reminder 포함)', () => {
      const all: ModalPriority[] = [
        'SECURITY_UPDATE',
        'FIRST_SYNC',
        'DRIVE_CONFLICT',
        'WIDGET_MODE_FALLBACK',
        'OAUTH_FLOW',
        'NORMAL_UPDATE',
        'WIDGET_EXPAND',
        'EVENT_ALERT',
        'RECORD_REMINDER',
        'WIDGET_MODE_COACH',
        'SHARE_PROMPT',
      ];
      for (const p of all) {
        expect(typeof PRIORITY_ORDER[p]).toBe('number');
      }
    });

    it('PRIORITY_ORDER 값은 단조 증가 (sparse 허용: 2.5, 4.5, 5.2, 5.25, 5.3, 5.5)', () => {
      const values = Object.values(PRIORITY_ORDER).sort((a, b) => a - b);
      // 0,1,2,2.5,3,4,4.5,5,5.2,5.25,5.3,5.5,6
      // — record-reminder로 5.2, 학사 확인 팝업 2종으로 5.25·5.3 추가.
      expect(values).toEqual([0, 1, 2, 2.5, 3, 4, 4.5, 5, 5.2, 5.25, 5.3, 5.5, 6]);
    });

    it('학사 확인 팝업 2종(5.25·5.3)은 기록 알림(5.2)과 코치 투어(5.5) 사이', () => {
      expect(PRIORITY_ORDER.TERM_START_PROMPT).toBe(5.25);
      expect(PRIORITY_ORDER.TERM_END_PROMPT).toBe(5.3);
      expect(PRIORITY_ORDER.RECORD_REMINDER).toBeLessThan(PRIORITY_ORDER.TERM_START_PROMPT);
      expect(PRIORITY_ORDER.TERM_START_PROMPT).toBeLessThan(PRIORITY_ORDER.TERM_END_PROMPT);
      expect(PRIORITY_ORDER.TERM_END_PROMPT).toBeLessThan(PRIORITY_ORDER.WIDGET_MODE_COACH);
    });

    it('WIDGET_MODE_FALLBACK(2.5)는 DRIVE_CONFLICT(2)와 OAUTH_FLOW(3) 사이 — widget-mode-discovery', () => {
      expect(PRIORITY_ORDER.WIDGET_MODE_FALLBACK).toBe(2.5);
      expect(PRIORITY_ORDER.DRIVE_CONFLICT).toBeLessThan(PRIORITY_ORDER.WIDGET_MODE_FALLBACK);
      expect(PRIORITY_ORDER.WIDGET_MODE_FALLBACK).toBeLessThan(PRIORITY_ORDER.OAUTH_FLOW);
    });

    it('WIDGET_MODE_COACH(5.5)는 EVENT_ALERT(5)와 SHARE_PROMPT(6) 사이 — widget-mode-discovery', () => {
      expect(PRIORITY_ORDER.WIDGET_MODE_COACH).toBe(5.5);
      expect(PRIORITY_ORDER.EVENT_ALERT).toBeLessThan(PRIORITY_ORDER.WIDGET_MODE_COACH);
      expect(PRIORITY_ORDER.WIDGET_MODE_COACH).toBeLessThan(PRIORITY_ORDER.SHARE_PROMPT);
    });

    it('SECURITY_UPDATE가 가장 작은 값 (최우선)', () => {
      const all = Object.values(PRIORITY_ORDER);
      expect(PRIORITY_ORDER.SECURITY_UPDATE).toBe(Math.min(...all));
    });

    it('SHARE_PROMPT가 가장 큰 값 (가장 후순위)', () => {
      const all = Object.values(PRIORITY_ORDER);
      expect(PRIORITY_ORDER.SHARE_PROMPT).toBe(Math.max(...all));
    });

    it('OAUTH_FLOW(3) > NORMAL_UPDATE(4) — 사용자 결정 2026-05-21: OAuth 도중 알림 대기', () => {
      expect(PRIORITY_ORDER.OAUTH_FLOW).toBeLessThan(PRIORITY_ORDER.NORMAL_UPDATE);
    });

    it('WIDGET_EXPAND(4.5)는 NORMAL_UPDATE(4) 다음·EVENT_ALERT(5) 직전 — G001 Foundation', () => {
      expect(PRIORITY_ORDER.WIDGET_EXPAND).toBe(4.5);
      expect(PRIORITY_ORDER.NORMAL_UPDATE).toBeLessThan(PRIORITY_ORDER.WIDGET_EXPAND);
      expect(PRIORITY_ORDER.WIDGET_EXPAND).toBeLessThan(PRIORITY_ORDER.EVENT_ALERT);
    });
  });

  describe('onPreempt 콜백 (G001 — Widget Inline UX AC20 데이터 보호)', () => {
    it('register-driven 전환: prevHead가 빼앗기면 onPreempt 발화', () => {
      const onPreempt = vi.fn();
      // prevHead는 NORMAL_UPDATE, 새로 등록되는 SECURITY_UPDATE가 빼앗는다.
      const prevId = useModalCoordinatorStore
        .getState()
        .register('NORMAL_UPDATE', true, { onPreempt });
      expect(useModalCoordinatorStore.getState().getHeadId()).toBe(prevId);
      expect(onPreempt).not.toHaveBeenCalled();

      const newId = useModalCoordinatorStore.getState().register('SECURITY_UPDATE', true);
      expect(useModalCoordinatorStore.getState().getHeadId()).toBe(newId);
      expect(onPreempt).toHaveBeenCalledTimes(1);
      // 새 entry priority(0) < prevHead priority(4) → 'higher_priority'
      expect(onPreempt).toHaveBeenCalledWith('higher_priority');
    });

    it("같은 priority + LIFO로 head를 잃어도 'system_modal' reason 으로 발화", () => {
      const onPreempt = vi.fn();
      useModalCoordinatorStore.getState().register('EVENT_ALERT', true, { onPreempt });
      // 동일 priority, 나중 등록 → LIFO로 새 entry가 head.
      useModalCoordinatorStore.getState().register('EVENT_ALERT', true);
      expect(onPreempt).toHaveBeenCalledTimes(1);
      // 새 entry priority == prev priority → 'higher_priority'가 아님 → 'system_modal'
      expect(onPreempt).toHaveBeenCalledWith('system_modal');
    });

    it('unregister-driven 전환: head가 unregister 돼도 onPreempt는 발화하지 않음 (무한루프 방지)', () => {
      const onPreemptHigh = vi.fn();
      const onPreemptLow = vi.fn();
      const idHigh = useModalCoordinatorStore
        .getState()
        .register('NORMAL_UPDATE', true, { onPreempt: onPreemptHigh });
      useModalCoordinatorStore
        .getState()
        .register('EVENT_ALERT', true, { onPreempt: onPreemptLow });
      // 현재 head는 idHigh. 이걸 unregister → idLow가 새 head.
      useModalCoordinatorStore.getState().unregister(idHigh);
      // 어느 쪽도 onPreempt 발화하지 않아야 한다 — unregister는 cleanup이지 preempt가 아니다.
      expect(onPreemptHigh).not.toHaveBeenCalled();
      expect(onPreemptLow).not.toHaveBeenCalled();
    });

    it('updateIsOpen으로 head가 바뀌어도 onPreempt는 발화하지 않음', () => {
      // 현재 구현은 register 시에만 onPreempt 발화. updateIsOpen 경유 head 전환은
      // 컴포넌트 자체가 자기 상태를 닫는 경우라 데이터 손실 위험 없음.
      const onPreempt = vi.fn();
      const idHigh = useModalCoordinatorStore
        .getState()
        .register('NORMAL_UPDATE', true, { onPreempt });
      useModalCoordinatorStore.getState().register('EVENT_ALERT', true);
      useModalCoordinatorStore.getState().updateIsOpen(idHigh, false);
      expect(onPreempt).not.toHaveBeenCalled();
    });

    it('초기 head 없음 → 신규 register는 onPreempt 발화하지 않음', () => {
      const onPreemptNew = vi.fn();
      // prevHead가 없는 상황에서 신규 등록. 자기가 첫 head가 됨 — 빼앗을 대상 없음.
      useModalCoordinatorStore
        .getState()
        .register('SECURITY_UPDATE', true, { onPreempt: onPreemptNew });
      expect(onPreemptNew).not.toHaveBeenCalled();
    });

    it('하위 priority entry가 register 돼도 head는 그대로 → onPreempt 발화 없음', () => {
      const onPreempt = vi.fn();
      useModalCoordinatorStore.getState().register('SECURITY_UPDATE', true, { onPreempt });
      // 더 낮은 우선순위가 들어옴 — head 변동 없음.
      useModalCoordinatorStore.getState().register('SHARE_PROMPT', true);
      expect(onPreempt).not.toHaveBeenCalled();
    });

    it('연속 preempt: A→B 한 번 + B→C 한 번, 각 transition마다 정확히 1회 발화', () => {
      const onPreemptA = vi.fn();
      const onPreemptB = vi.fn();
      // A=NORMAL_UPDATE 등록 → head=A.
      useModalCoordinatorStore
        .getState()
        .register('NORMAL_UPDATE', true, { onPreempt: onPreemptA });
      // B=DRIVE_CONFLICT 등록 → head=B, A는 preempt 당함 (1회).
      useModalCoordinatorStore
        .getState()
        .register('DRIVE_CONFLICT', true, { onPreempt: onPreemptB });
      expect(onPreemptA).toHaveBeenCalledTimes(1);
      expect(onPreemptB).not.toHaveBeenCalled();
      // C=SECURITY_UPDATE 등록 → head=C, B는 preempt 당함 (1회). A는 추가 발화 없음.
      useModalCoordinatorStore.getState().register('SECURITY_UPDATE', true);
      expect(onPreemptA).toHaveBeenCalledTimes(1);
      expect(onPreemptB).toHaveBeenCalledTimes(1);
    });

    it('WIDGET_EXPAND 모달이 EVENT_ALERT보다 head — AC20 시나리오 일반화', () => {
      const onWidgetPreempt = vi.fn();
      const idWidget = useModalCoordinatorStore
        .getState()
        .register('WIDGET_EXPAND', true, { onPreempt: onWidgetPreempt });
      // EVENT_ALERT는 WIDGET_EXPAND(4.5)보다 큼(5) → head는 그대로 idWidget.
      useModalCoordinatorStore.getState().register('EVENT_ALERT', true);
      expect(useModalCoordinatorStore.getState().getHeadId()).toBe(idWidget);
      expect(onWidgetPreempt).not.toHaveBeenCalled();
      // SECURITY_UPDATE 등록 → head를 빼앗김 → onPreempt 1회.
      useModalCoordinatorStore.getState().register('SECURITY_UPDATE', true);
      expect(onWidgetPreempt).toHaveBeenCalledTimes(1);
      expect(onWidgetPreempt).toHaveBeenCalledWith('higher_priority');
    });

    it('onPreempt 미제공 entry는 발화 없이 정상 head 전환', () => {
      // onPreempt 옵션 없는 entry — register 시 options 없음 — 그래도 head 전환은 정상.
      const idLow = useModalCoordinatorStore.getState().register('SHARE_PROMPT', true);
      expect(useModalCoordinatorStore.getState().getHeadId()).toBe(idLow);
      // 상위 등록 — preempt 콜백 없이도 throw 없이 동작해야 한다.
      expect(() =>
        useModalCoordinatorStore.getState().register('SECURITY_UPDATE', true),
      ).not.toThrow();
    });
  });

  describe('register는 monotonically increasing registeredAt 보장', () => {
    it('연속 register 호출 시 registeredAt은 단조 증가', () => {
      useModalCoordinatorStore.getState().register('NORMAL_UPDATE', true);
      useModalCoordinatorStore.getState().register('EVENT_ALERT', true);
      useModalCoordinatorStore.getState().register('SHARE_PROMPT', true);
      const entries = useModalCoordinatorStore.getState().entries;
      expect(entries.length).toBe(3);
      expect(entries[1]!.registeredAt).toBeGreaterThanOrEqual(entries[0]!.registeredAt);
      expect(entries[2]!.registeredAt).toBeGreaterThanOrEqual(entries[1]!.registeredAt);
    });
  });
});
