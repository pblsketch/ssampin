import { create } from 'zustand';
import type { PopupToolId } from '@domain/entities/ToolPopup';
import { getToolPopupBridge } from '@adapters/components/Tools/popup/toolPopupBridge';
import type { ToolPopupSnapshotEnvelope } from '@adapters/components/Tools/popup/toolPopupSession';
import { asSnapshotEnvelope } from '@adapters/components/Tools/popup/toolPopupSession';

/**
 * "지금 팝업 창으로 열려 있는 쌤도구" 목록과, 팝업에서 돌아온 스냅샷 보관함.
 *
 * 창마다 상태가 따로 놀지 않도록 main 이 보내 주는 변화 알림으로만 갱신한다.
 * 본문 화면은 이 목록을 보고 도구를 중복으로 그리지 않는다.
 */
interface ReturnedSnapshot {
  readonly toolId: PopupToolId;
  readonly envelope: ToolPopupSnapshotEnvelope;
}

interface ToolPopupState {
  readonly openToolIds: readonly PopupToolId[];
  /** 팝업에서 본문으로 돌아온 스냅샷. 해당 도구 화면이 1회 가져간다. */
  readonly returned: ReturnedSnapshot | null;
  subscribed: boolean;
  subscribe: () => void;
  putReturned: (toolId: PopupToolId, snapshot: unknown) => void;
  consumeReturned: (toolId: PopupToolId) => ToolPopupSnapshotEnvelope | null;
  refresh: () => Promise<void>;
}

export const useToolPopupStore = create<ToolPopupState>((set, get) => ({
  openToolIds: [],
  returned: null,
  subscribed: false,

  subscribe: () => {
    if (get().subscribed) return;
    set({ subscribed: true });
    const bridge = getToolPopupBridge();
    bridge.onChanged((openToolIds) => set({ openToolIds: [...openToolIds] }));
    void get().refresh();
  },

  putReturned: (toolId, snapshot) => {
    const envelope = asSnapshotEnvelope(snapshot);
    if (envelope === null) {
      set({ returned: null });
      return;
    }
    set({ returned: { toolId, envelope } });
  },

  consumeReturned: (toolId) => {
    const returned = get().returned;
    if (returned === null || returned.toolId !== toolId) return null;
    set({ returned: null });
    return returned.envelope;
  },

  refresh: async () => {
    const openToolIds = await getToolPopupBridge().list();
    set({ openToolIds: [...openToolIds] });
  },
}));
