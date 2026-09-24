import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  moveGuardedToolsBeforeHide,
  useLeaveGuardStore,
  type LeaveGuard,
} from './useLeaveGuardStore';

/** 화면 이동 안내(ADR-139, spec 5-3·5-4) — 고른 대로만 움직이고, 옮기기 실패면 머무른다. */

function guard(overrides: Partial<LeaveGuard> = {}): LeaveGuard {
  return {
    id: 'timer',
    canMoveToPopup: () => true,
    moveToPopup: async () => true,
    ...overrides,
  };
}

beforeEach(() => {
  useLeaveGuardStore.setState({ guards: [], pending: null, working: false });
});

describe('requestLeave', () => {
  it('진행 중인 도구가 없으면 묻지 않고 바로 이동한다', () => {
    const proceed = vi.fn();
    useLeaveGuardStore.getState().requestLeave('navigate', proceed);
    expect(proceed).toHaveBeenCalledTimes(1);
    expect(useLeaveGuardStore.getState().pending).toBeNull();
  });

  it('끝났는데 확인 전인 타이머(blocksNavigation false)는 이동을 막지 않는다', () => {
    useLeaveGuardStore.getState().register(guard({ blocksNavigation: false }));
    const proceed = vi.fn();
    useLeaveGuardStore.getState().requestLeave('navigate', proceed);
    expect(proceed).toHaveBeenCalledTimes(1);
  });

  it('진행 중이면 묻고, [머무르기]는 취소를 부른다', async () => {
    useLeaveGuardStore.getState().register(guard());
    const proceed = vi.fn();
    const cancel = vi.fn();
    useLeaveGuardStore.getState().requestLeave('navigate', proceed, { cancel });
    expect(proceed).not.toHaveBeenCalled();
    expect(useLeaveGuardStore.getState().pending?.allowPopup).toBe(true);

    await useLeaveGuardStore.getState().choose('stay');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(proceed).not.toHaveBeenCalled();
    expect(useLeaveGuardStore.getState().pending).toBeNull();
  });

  it('[끄고 이동]은 옮기지 않고 이동한다', async () => {
    const moveToPopup = vi.fn(async () => true);
    useLeaveGuardStore.getState().register(guard({ moveToPopup }));
    const proceed = vi.fn();
    useLeaveGuardStore.getState().requestLeave('navigate', proceed);
    await useLeaveGuardStore.getState().choose('stop');
    expect(proceed).toHaveBeenCalledTimes(1);
    expect(moveToPopup).not.toHaveBeenCalled();
  });

  it('[팝업으로 옮기고 이동] — 옮긴 뒤에만 이동하고, 실패하면 머무른다', async () => {
    const proceed = vi.fn();
    const cancel = vi.fn();
    const moveToPopup = vi.fn(async () => true);
    const unregister = useLeaveGuardStore.getState().register(guard({ moveToPopup }));
    useLeaveGuardStore.getState().requestLeave('navigate', proceed, { cancel });
    await useLeaveGuardStore.getState().choose('popup');
    expect(moveToPopup).toHaveBeenCalledTimes(1);
    expect(proceed).toHaveBeenCalledTimes(1);
    unregister();

    useLeaveGuardStore.getState().register(guard({ moveToPopup: async () => false }));
    useLeaveGuardStore.getState().requestLeave('navigate', proceed, { cancel });
    await useLeaveGuardStore.getState().choose('popup');
    expect(proceed).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(useLeaveGuardStore.getState().pending).toBeNull();
  });

  it('팝업으로 옮길 수 없으면(병렬 모드) [팝업으로…]를 보이지 않는다', () => {
    useLeaveGuardStore.getState().register(guard({ canMoveToPopup: () => false }));
    useLeaveGuardStore.getState().requestLeave('navigate', () => {});
    expect(useLeaveGuardStore.getState().pending?.allowPopup).toBe(false);
  });

  it('병렬 칸 닫기는 [끄고 닫기]/[머무르기]만 묻는다', () => {
    const slotGuard = guard();
    useLeaveGuardStore.getState().requestLeave('closeSlot', () => {}, { guards: [slotGuard] });
    expect(useLeaveGuardStore.getState().pending?.kind).toBe('closeSlot');
    expect(useLeaveGuardStore.getState().pending?.allowPopup).toBe(false);
  });

  it('새로 물으면 앞의 물음은 머무르기로 끝난다', () => {
    useLeaveGuardStore.getState().register(guard());
    const firstCancel = vi.fn();
    useLeaveGuardStore.getState().requestLeave('navigate', () => {}, { cancel: firstCancel });
    useLeaveGuardStore.getState().requestLeave('returnTool', () => {});
    expect(firstCancel).toHaveBeenCalledTimes(1);
    expect(useLeaveGuardStore.getState().pending?.kind).toBe('returnTool');
  });
});

describe('moveGuardedToolsBeforeHide (창 X·트레이 숨김)', () => {
  it('옮길 것이 없으면 곧바로 none', async () => {
    const onStart = vi.fn();
    expect(await moveGuardedToolsBeforeHide(onStart)).toBe('none');
    expect(onStart).not.toHaveBeenCalled();
  });

  it('끝났는데 확인 전인 타이머도 옮긴다', async () => {
    const moveToPopup = vi.fn(async () => true);
    useLeaveGuardStore.getState().register(guard({ blocksNavigation: false, moveToPopup }));
    const onStart = vi.fn();
    expect(await moveGuardedToolsBeforeHide(onStart)).toBe('moved');
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(moveToPopup).toHaveBeenCalledTimes(1);
  });

  it('옮기지 못하면 failed — 창을 숨기지 않는다', async () => {
    useLeaveGuardStore.getState().register(guard({ moveToPopup: async () => false }));
    expect(await moveGuardedToolsBeforeHide(() => {})).toBe('failed');
  });

  it('병렬 모드처럼 옮길 수 없는 도구는 건드리지 않는다', async () => {
    useLeaveGuardStore.getState().register(guard({ canMoveToPopup: () => false }));
    expect(await moveGuardedToolsBeforeHide(() => {})).toBe('none');
  });
});
