// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { useTimerLocalStore } from './useTimerLocalStore';

const KEY = 'ssampin_timer-local';

beforeEach(() => {
  localStorage.clear();
  useTimerLocalStore.setState({
    state: { lastDurationSeconds: null, recentActivityNames: [], presentationRoster: null },
    loaded: false,
  });
});

describe('useTimerLocalStore — 이 기기에만 저장 (spec 6-2)', () => {
  it('마지막 시간을 저장하고 다시 읽는다', async () => {
    await useTimerLocalStore.getState().setLastDuration(420);
    useTimerLocalStore.setState({ loaded: false });
    await useTimerLocalStore.getState().load();
    expect(useTimerLocalStore.getState().state.lastDurationSeconds).toBe(420);
  });

  it('쓸 때 저장된 값을 다시 읽어 다른 창이 쓴 칸을 덮지 않는다', async () => {
    // 이 창의 메모리 속 값은 비어 있다.
    await useTimerLocalStore.getState().load();
    // 다른 창(팝업)이 최근 이름을 썼다.
    localStorage.setItem(
      KEY,
      JSON.stringify({
        lastDurationSeconds: 60,
        recentActivityNames: ['모둠 토의'],
        presentationRoster: null,
      }),
    );
    // 이 창이 마지막 시간만 고친다.
    await useTimerLocalStore.getState().setLastDuration(300);
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as {
      recentActivityNames: string[];
      lastDurationSeconds: number;
    };
    expect(saved.recentActivityNames).toEqual(['모둠 토의']);
    expect(saved.lastDurationSeconds).toBe(300);
  });

  it('★기다리지 않고 연달아 써도 앞의 칸을 되돌리지 않는다(시작할 때 시간·이름을 함께 쓴다)', async () => {
    await useTimerLocalStore.getState().load();
    const a = useTimerLocalStore.getState().setLastDuration(420);
    const b = useTimerLocalStore.getState().rememberActivityName('모둠 토의');
    await Promise.all([a, b]);
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as {
      lastDurationSeconds: number;
      recentActivityNames: string[];
    };
    expect(saved.lastDurationSeconds).toBe(420);
    expect(saved.recentActivityNames).toEqual(['모둠 토의']);
  });

  it('저장값을 읽지 못하면 빈 값으로 덮지 않고 이 창의 값에서 고친다', async () => {
    await useTimerLocalStore.getState().rememberActivityName('조용히 읽기');
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('읽기 실패');
    };
    try {
      await useTimerLocalStore.getState().setLastDuration(300);
    } finally {
      Storage.prototype.getItem = original;
    }
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as {
      lastDurationSeconds: number;
      recentActivityNames: string[];
    };
    expect(saved.recentActivityNames).toEqual(['조용히 읽기']);
    expect(saved.lastDurationSeconds).toBe(300);
  });

  it('최근 활동 이름은 앞에 쌓인다', async () => {
    await useTimerLocalStore.getState().rememberActivityName('조용히 읽기');
    await useTimerLocalStore.getState().rememberActivityName('모둠 토의');
    expect(useTimerLocalStore.getState().state.recentActivityNames).toEqual([
      '모둠 토의',
      '조용히 읽기',
    ]);
  });

  it('다른 창이 바꾸면 reload 로 따라간다', async () => {
    await useTimerLocalStore.getState().load();
    localStorage.setItem(KEY, JSON.stringify({ lastDurationSeconds: 90 }));
    await useTimerLocalStore.getState().reload();
    expect(useTimerLocalStore.getState().state.lastDurationSeconds).toBe(90);
  });
});
