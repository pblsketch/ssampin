import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  useSnackbarStore,
  showSnackbar,
  SNACKBAR_AUTO_DISMISS_MS,
} from '@mobile/stores/useMobileSnackbarStore';

describe('useSnackbarStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useSnackbarStore.getState().dismiss();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('show 하면 메시지가 뜨고, 자동 닫힘 시간이 지나면 사라진다', () => {
    showSnackbar('메모 1개를 삭제했습니다');
    expect(useSnackbarStore.getState().message).toBe('메모 1개를 삭제했습니다');

    vi.advanceTimersByTime(SNACKBAR_AUTO_DISMISS_MS - 1);
    expect(useSnackbarStore.getState().message).toBe('메모 1개를 삭제했습니다');

    vi.advanceTimersByTime(1);
    expect(useSnackbarStore.getState().message).toBeNull();
  });

  it('되돌리기 콜백을 넘기면 onUndo 로 노출된다', () => {
    const undo = vi.fn();
    showSnackbar('삭제했습니다', undo);
    expect(useSnackbarStore.getState().onUndo).toBe(undo);
  });

  it('dismiss 하면 즉시 닫히고, 남아 있던 자동 닫힘 타이머가 정리된다', () => {
    showSnackbar('첫 번째');
    useSnackbarStore.getState().dismiss();
    expect(useSnackbarStore.getState().message).toBeNull();

    // 정리되지 않았다면 이 시점에 옛 타이머가 깨어나 새 메시지를 지웠을 것이다.
    showSnackbar('두 번째');
    vi.advanceTimersByTime(SNACKBAR_AUTO_DISMISS_MS - 1);
    expect(useSnackbarStore.getState().message).toBe('두 번째');
  });

  it('새 메시지가 들어오면 이전 것을 교체하고, 이전 타이머가 새 것을 조기에 닫지 않는다', () => {
    showSnackbar('이전');
    vi.advanceTimersByTime(SNACKBAR_AUTO_DISMISS_MS - 100);

    showSnackbar('최신');
    expect(useSnackbarStore.getState().message).toBe('최신');

    // 이전 타이머가 살아 있었다면 여기서 '최신'이 지워졌을 것이다.
    vi.advanceTimersByTime(200);
    expect(useSnackbarStore.getState().message).toBe('최신');

    // 최신 것의 제 시간에는 정상적으로 닫힌다.
    vi.advanceTimersByTime(SNACKBAR_AUTO_DISMISS_MS);
    expect(useSnackbarStore.getState().message).toBeNull();
  });

  it('토큰은 show 마다 증가한다 (진행바 애니메이션 재시작 키)', () => {
    const before = useSnackbarStore.getState().token;
    showSnackbar('a');
    showSnackbar('b');
    expect(useSnackbarStore.getState().token).toBe(before + 2);
  });
});
