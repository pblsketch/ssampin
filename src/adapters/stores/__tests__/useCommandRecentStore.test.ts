import { describe, expect, it, beforeEach } from 'vitest';
import { useCommandRecentStore, MAX_RECENT_COMMANDS } from '../useCommandRecentStore';

describe('useCommandRecentStore', () => {
  beforeEach(() => useCommandRecentStore.getState().clear());

  it('record는 id를 맨 앞에 추가 (최신 우선)', () => {
    useCommandRecentStore.getState().record('a');
    useCommandRecentStore.getState().record('b');
    expect(useCommandRecentStore.getState().recentIds).toEqual(['b', 'a']);
  });

  it('이미 있는 id를 다시 record하면 맨 앞으로 이동(중복 제거)', () => {
    const { record } = useCommandRecentStore.getState();
    record('a');
    record('b');
    record('a');
    expect(useCommandRecentStore.getState().recentIds).toEqual(['a', 'b']);
  });

  it('최대 MAX_RECENT_COMMANDS개로 제한하고 오래된 항목을 버린다', () => {
    const { record } = useCommandRecentStore.getState();
    for (let i = 0; i < MAX_RECENT_COMMANDS + 3; i++) record(`id-${i}`);
    const ids = useCommandRecentStore.getState().recentIds;
    expect(ids).toHaveLength(MAX_RECENT_COMMANDS);
    expect(ids[0]).toBe(`id-${MAX_RECENT_COMMANDS + 2}`); // 가장 최근
    expect(ids).not.toContain('id-0'); // 가장 오래된 것은 버려짐
  });

  it('clear는 전체를 비운다', () => {
    useCommandRecentStore.getState().record('a');
    useCommandRecentStore.getState().clear();
    expect(useCommandRecentStore.getState().recentIds).toEqual([]);
  });

  it('record는 첫 사용 안내(hintDismissed)도 닫는다 — 한 번 썼으면 안내 불필요', () => {
    expect(useCommandRecentStore.getState().hintDismissed).toBe(false);
    useCommandRecentStore.getState().record('a');
    expect(useCommandRecentStore.getState().hintDismissed).toBe(true);
  });

  it('dismissHint는 안내만 닫고 recentIds는 건드리지 않는다', () => {
    useCommandRecentStore.getState().dismissHint();
    expect(useCommandRecentStore.getState().hintDismissed).toBe(true);
    expect(useCommandRecentStore.getState().recentIds).toEqual([]);
  });

  it('clear는 안내 상태도 초기화한다', () => {
    useCommandRecentStore.getState().dismissHint();
    useCommandRecentStore.getState().clear();
    expect(useCommandRecentStore.getState().hintDismissed).toBe(false);
  });
});
