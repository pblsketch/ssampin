import { describe, it, expect, beforeEach } from 'vitest';
import { useBottomSheetStore } from './useBottomSheetStore';

describe('useBottomSheetStore', () => {
  beforeEach(() => {
    useBottomSheetStore.setState({ openCount: 0 });
  });

  it('initial openCount 은 0', () => {
    expect(useBottomSheetStore.getState().openCount).toBe(0);
  });

  it('push 는 카운터를 +1, pop 은 -1', () => {
    const { push, pop } = useBottomSheetStore.getState();
    push();
    expect(useBottomSheetStore.getState().openCount).toBe(1);
    push();
    expect(useBottomSheetStore.getState().openCount).toBe(2);
    pop();
    expect(useBottomSheetStore.getState().openCount).toBe(1);
    pop();
    expect(useBottomSheetStore.getState().openCount).toBe(0);
  });

  it('pop 은 음수로 떨어지지 않는다 (방어 코드)', () => {
    const { pop } = useBottomSheetStore.getState();
    pop();
    pop();
    pop();
    expect(useBottomSheetStore.getState().openCount).toBe(0);
  });

  it('여러 시트가 동시에 열려도 카운터가 누적된다', () => {
    const { push, pop } = useBottomSheetStore.getState();
    push(); // sheet A
    push(); // sheet B (위에 떠 있음 — coachmark 등)
    expect(useBottomSheetStore.getState().openCount).toBe(2);
    pop(); // sheet B close — A 는 여전히 열려 있음
    expect(useBottomSheetStore.getState().openCount).toBe(1);
    pop();
    expect(useBottomSheetStore.getState().openCount).toBe(0);
  });
});
