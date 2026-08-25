/**
 * useOneClickPortalLauncher 단위 테스트 — 카드를 눌렀을 때 어느 갈래로 가는가.
 *
 * @vitest-environment jsdom
 *
 * 이 훅은 "설치됐나 · 버전이 되나 · 지금 켜져 있나 · 안내를 본 적 있나" 네 가지를 보고
 * 갈래를 정한다. 갈래를 잘못 타면 **눌렀는데 아무 일도 안 일어나거나**(옆핀 위젯에는
 * 토스트가 없어 더 심하다) 구버전에서 **되지도 않을 업무 목록**을 보여주게 된다.
 *
 * 실기 검증(2026-08-26)에서 확인한 실제 동작을 기준으로 삼았다 —
 * v0.1.14 는 supportsTasks=false, v0.1.15 는 true 이고 이미 떠 있어도 업무를 보내면
 * 그 창이 받는다(창이 두 개 되지 않는다).
 */

// React 18 act 환경 플래그
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOneClickPortalLauncher } from './useOneClickPortalLauncher';

const GUIDE_KEY = 'ssampin:oneclick-portal-guide-dismissed';

const showToast = vi.fn();
vi.mock('@adapters/components/common/Toast', () => ({
  useToastStore: (selector: (s: { show: typeof showToast }) => unknown) =>
    selector({ show: showToast }),
}));

interface StatusShape {
  supported: boolean;
  installed: boolean;
  running: boolean;
  version: string | null;
  supportsTasks: boolean;
}

const getStatus = vi.fn<() => Promise<StatusShape>>();
const launch = vi.fn<(task?: string) => Promise<{ outcome: string; message?: string }>>();
const openExternal = vi.fn();

/** 상태를 정해 두고 electronAPI 를 심는다. `null` 이면 브라우저 모드(= API 없음). */
function setEnv(status: StatusShape | null) {
  if (status === null) {
    (window as unknown as { electronAPI?: unknown }).electronAPI = { openExternal };
    return;
  }
  getStatus.mockResolvedValue(status);
  (window as unknown as { electronAPI?: unknown }).electronAPI = {
    openExternal,
    oneclickPortal: { getStatus, launch },
  };
}

const OLD: StatusShape = {
  supported: true,
  installed: true,
  running: false,
  version: '0.1.14',
  supportsTasks: false,
};
const NEW: StatusShape = { ...OLD, version: '0.1.15', supportsTasks: true };

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  launch.mockResolvedValue({ outcome: 'launched' });
});

afterEach(() => {
  delete (window as unknown as { electronAPI?: unknown }).electronAPI;
});

async function clickCard(status: StatusShape | null) {
  setEnv(status);
  const hook = renderHook(() => useOneClickPortalLauncher());
  await act(async () => {
    await hook.result.current.handleCardClick();
  });
  return hook;
}

describe('설치·플랫폼 갈래', () => {
  it('설치되지 않았으면 설치 안내 모달', async () => {
    const { result } = await clickCard({ ...OLD, installed: false });
    expect(result.current.modalMode).toBe('not-installed');
    expect(launch).not.toHaveBeenCalled();
  });

  it('윈도우가 아니면 안내만 하고 모달을 띄우지 않는다', async () => {
    const { result } = await clickCard({ ...OLD, supported: false, installed: false });
    expect(result.current.modalMode).toBeNull();
    expect(showToast).toHaveBeenCalledWith(
      '원클릭업무포털은 윈도우에서만 사용할 수 있어요.',
      'error',
    );
  });

  it('브라우저 모드(전용 통로 없음)에서는 설치 안내만 한다', async () => {
    const { result } = await clickCard(null);
    expect(result.current.modalMode).toBe('not-installed');
  });
});

describe('구버전(v0.1.14) — 업무 목록을 감춘다', () => {
  it('첫 회에는 안내 모달을 띄우고 업무 고르기는 띄우지 않는다', async () => {
    const { result } = await clickCard(OLD);
    expect(result.current.modalMode).toBe('first-run');
    expect(result.current.showNotice).toBe(true);
  });

  it('안내를 본 적 있으면 바로 실행한다 (업무 인자 없이)', async () => {
    localStorage.setItem(GUIDE_KEY, 'true');
    const { result } = await clickCard(OLD);
    expect(result.current.modalMode).toBeNull();
    expect(launch).toHaveBeenCalledWith(undefined);
  });

  it('이미 켜져 있으면 다시 켜지 않고 어디를 볼지 알려 준다', async () => {
    const { result } = await clickCard({ ...OLD, running: true });
    expect(result.current.modalMode).toBeNull();
    expect(launch).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('이미 실행 중'), 'info');
  });
});

describe('신버전(v0.1.15) — 업무 고르기', () => {
  it('업무 고르기 모달을 띄운다', async () => {
    const { result } = await clickCard(NEW);
    expect(result.current.modalMode).toBe('task-picker');
    expect(result.current.showNotice).toBe(true); // 첫 회
  });

  it('★이미 켜져 있어도 업무 고르기를 띄운다 (그 창이 요청을 받는다)', async () => {
    // 구버전과 갈리는 지점이다. 여기서 already-running 토스트로 빠지면
    // 켜 둔 선생님은 업무 바로가기를 영영 쓸 수 없다.
    const { result } = await clickCard({ ...NEW, running: true });
    expect(result.current.modalMode).toBe('task-picker');
  });

  it('안내를 본 적 있으면 고지 배너 없이 목록만 보여 준다', async () => {
    localStorage.setItem(GUIDE_KEY, 'true');
    const { result } = await clickCard(NEW);
    expect(result.current.modalMode).toBe('task-picker');
    expect(result.current.showNotice).toBe(false);
  });

  it('업무를 고르면 그 이름으로 실행하고 안내를 본 것으로 기록한다', async () => {
    const { result } = await clickCard(NEW);
    await act(async () => {
      result.current.handleSelectTask('leave');
    });
    expect(launch).toHaveBeenCalledWith('leave');
    expect(result.current.modalMode).toBeNull();
    expect(localStorage.getItem(GUIDE_KEY)).toBe('true');
  });

  it("'프로그램만 열기'는 업무 없이 실행한다", async () => {
    const { result } = await clickCard(NEW);
    await act(async () => {
      result.current.handleSelectTask();
    });
    expect(launch).toHaveBeenCalledWith(undefined);
  });
});

describe('실행 결과 안내', () => {
  it('떠 있던 창이 요청을 받으면 그 업무 이름으로 알려 준다', async () => {
    launch.mockResolvedValue({ outcome: 'task-sent' });
    const { result } = await clickCard({ ...NEW, running: true });
    await act(async () => {
      result.current.handleSelectTask('leave');
    });
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('복무'), 'success');
  });

  it('업무를 열면 그 업무 이름을 넣어 알려 준다', async () => {
    launch.mockResolvedValue({ outcome: 'launched' });
    const { result } = await clickCard(NEW);
    await act(async () => {
      result.current.handleSelectTask('edufine');
    });
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('에듀파인'), 'success');
  });

  it('실행 직전에 구버전으로 드러나면 업데이트를 안내한다', async () => {
    launch.mockResolvedValue({ outcome: 'task-unsupported' });
    const { result } = await clickCard(NEW);
    await act(async () => {
      result.current.handleSelectTask('nice');
    });
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('업데이트'), 'info');
  });

  it('실행에 실패하면 이유를 함께 보여 준다', async () => {
    launch.mockResolvedValue({ outcome: 'failed', message: '접근이 거부되었습니다' });
    const { result } = await clickCard(NEW);
    await act(async () => {
      result.current.handleSelectTask('trip');
    });
    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining('접근이 거부되었습니다'),
      'error',
    );
  });

  it('실행했더니 지워져 있었다면 설치 안내 모달로 돌아간다', async () => {
    launch.mockResolvedValue({ outcome: 'not-installed' });
    const { result } = await clickCard(NEW);
    await act(async () => {
      result.current.handleSelectTask('draft');
    });
    expect(result.current.modalMode).toBe('not-installed');
  });
});

describe('localStorage 를 못 쓰는 환경에서도 막히지 않는다', () => {
  it('읽기가 막히면 안내를 한 번 더 보여 주는 쪽으로 기운다', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = await clickCard(NEW);
    expect(result.current.showNotice).toBe(true);
    spy.mockRestore();
  });

  it('쓰기가 막혀도 실행 자체는 된다', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = await clickCard(NEW);
    await act(async () => {
      result.current.handleSelectTask('purchase');
    });
    expect(launch).toHaveBeenCalledWith('purchase');
    spy.mockRestore();
  });
});
