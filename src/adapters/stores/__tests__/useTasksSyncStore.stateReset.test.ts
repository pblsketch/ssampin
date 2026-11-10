/**
 * 연동 상태 파일(`tasks-sync-state`)이 깨져 격리·초기화된 뒤의 시작 동작을 고정한다.
 *
 * 메인 프로세스는 깨진 상태 파일을 옆으로 치우고 "없음"을 돌려준다(`electron/dataFileRead.ts`).
 * 예전에는 읽기 오류를 콘솔에만 남겨 연동이 **알림 없이 꺼진 채** 남았다 — 이제 한 번 알린다.
 *
 * 알림은 실행당 한 번(모듈 변수)이라 테스트마다 모듈을 새로 읽는다.
 *
 *
 * ★`initialize()` 두 개를 `Promise.all` 로 **같은 순간에** 부르지 않는다. 두 호출이 가짜로 바꿔 둔
 *   모듈(`@adapters/di/container`)을 동시에 `import()` 하면 vitest 가 둘째 호출에는 가짜가 아니라
 *   **진짜 모듈**을 읽어 준다(재 보니 둘째 호출의 충돌 기록 읽기가 가짜 저장소를 거치지 않았고,
 *   진짜 조립 모듈을 통째로 변환하느라 4~16초가 걸렸다) — 그래서 이 파일의 첫 테스트만 5초 한도를
 *   넘겼다. 두 호출이 겹치는 자리는 "격리됐는지" 답을 기다리는 곳 하나로 직접 만든다.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  storageRead: vi.fn(),
  toastShow: vi.fn(),
  getQuarantinedDataFiles: vi.fn(),
}));

vi.mock('@adapters/di/container', () => ({
  storage: { read: mocks.storageRead, write: vi.fn(), remove: vi.fn() },
}));
vi.mock('@adapters/components/common/Toast', () => ({
  useToastStore: { getState: () => ({ show: mocks.toastShow }) },
}));

const NOTICE =
  '구글 할 일 연동 설정을 읽지 못해 연동이 꺼졌어요. 할 일은 그대로예요. 설정에서 다시 켜 주세요.';

type Store = (typeof import('../useTasksSyncStore'))['useTasksSyncStore'];

async function freshStore(): Promise<Store> {
  vi.resetModules();
  return (await import('../useTasksSyncStore')).useTasksSyncStore;
}

/** 저장소 파일 흉내 — 키별 내용. 없는 키는 null(파일 없음). */
let files: Map<string, unknown>;

// 스토어 모듈을 처음 읽는 값을 테스트 밖에서 치른다(한도 넉넉히). 여기서 읽은 모듈 인스턴스는
// 쓰지 않는다 — 각 테스트는 `freshStore()` 로 새로 읽는다.
beforeAll(async () => {
  await import('../useTasksSyncStore');
}, 60_000);

beforeEach(() => {
  vi.clearAllMocks();
  files = new Map();
  mocks.storageRead.mockImplementation(async (key: string) => files.get(key) ?? null);
  mocks.getQuarantinedDataFiles.mockResolvedValue([]);
  vi.stubGlobal('window', {
    electronAPI: { getQuarantinedDataFiles: mocks.getQuarantinedDataFiles },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('initialize — 연동 상태 파일이 초기화된 뒤', () => {
  it('상태 파일이 초기화되면 꺼진 상태로 시작하고 한 번 알린다', async () => {
    // 개발 모드(StrictMode)처럼 두 호출이 겹친다: 둘 다 "격리됐는지" 답을 기다리는 중이다.
    // 답을 우리가 쥐고 있다가 한꺼번에 돌려준다(타이머 없이 순서를 고정한다).
    const answers: ((files: string[]) => void)[] = [];
    let asked: () => void = () => undefined;
    const untilAsked = () =>
      new Promise<void>((resolve) => {
        asked = resolve;
      });
    mocks.getQuarantinedDataFiles.mockImplementation(
      () =>
        new Promise<string[]>((resolve) => {
          answers.push(resolve);
          asked();
        }),
    );
    const store = await freshStore();

    const firstAsked = untilAsked();
    const first = store.getState().initialize();
    await firstAsked;
    const secondAsked = untilAsked();
    const second = store.getState().initialize();
    await secondAsked;
    expect(answers).toHaveLength(2); // 둘 다 답을 기다리고 있다(아직 아무도 알리지 않았다)
    expect(mocks.toastShow).not.toHaveBeenCalled();
    // 첫 호출이 답을 받아 알린 뒤에 둘째 호출이 답을 받는다 — 둘째는 "이미 알렸다"를 다시 보고 멈춰야 한다.
    // (둘의 답을 한꺼번에 돌려주면 두 호출이 Toast 를 동시에 import 해 위 ★의 함정에 다시 빠진다:
    //  둘째가 진짜 Toast 를 받아 가짜 호출 횟수에 안 잡히므로, 다시 보기가 빠져도 통과해 버린다.)
    answers[0]?.(['tasks-sync-state']);
    await first;
    expect(mocks.toastShow).toHaveBeenCalledTimes(1);
    answers[1]?.(['tasks-sync-state']);
    await second;

    // 그 뒤 또 불려도
    mocks.getQuarantinedDataFiles.mockResolvedValue(['tasks-sync-state']);
    await store.getState().initialize();

    expect(store.getState().isEnabled).toBe(false);
    expect(store.getState().taskListId).toBeNull();
    expect(mocks.toastShow).toHaveBeenCalledTimes(1);
    expect(mocks.toastShow.mock.calls[0]?.[0]).toBe(NOTICE);
    expect(mocks.toastShow.mock.calls[0]?.[1]).toBe('info');
  });

  it('처음 쓰는 PC(파일이 원래 없음)에서는 알리지 않는다', async () => {
    const store = await freshStore();
    await store.getState().initialize();
    expect(store.getState().isEnabled).toBe(false);
    expect(mocks.toastShow).not.toHaveBeenCalled();
  });

  it('다른 파일이 격리된 것은 할 일 연동 알림이 아니다', async () => {
    mocks.getQuarantinedDataFiles.mockResolvedValue(['drive-sync-device-state']);
    const store = await freshStore();
    await store.getState().initialize();
    expect(mocks.toastShow).not.toHaveBeenCalled();
  });

  it('초기화된 뒤 선생님이 다시 켰다면(설정이 다시 저장됨) 알리지 않고 그 설정으로 시작한다', async () => {
    mocks.getQuarantinedDataFiles.mockResolvedValue(['tasks-sync-state']);
    files.set('tasks-sync-state', {
      isEnabled: true,
      taskListId: 'list-2',
      taskListName: '새 목록',
      lastSyncedAt: null,
      pendingDeleteIds: [],
    });
    const store = await freshStore();
    await store.getState().initialize();
    expect(store.getState()).toMatchObject({ isEnabled: true, taskListId: 'list-2' });
    expect(mocks.toastShow).not.toHaveBeenCalled();
  });

  it('격리 여부를 알 수 없는 환경(옛 preload·브라우저)에서는 조용히 꺼진 상태로 시작한다', async () => {
    vi.stubGlobal('window', { electronAPI: {} });
    const withoutApi = await freshStore();
    await withoutApi.getState().initialize();

    vi.unstubAllGlobals(); // window 자체가 없다
    const withoutWindow = await freshStore();
    await withoutWindow.getState().initialize();

    mocks.getQuarantinedDataFiles.mockRejectedValue(new Error('No handler registered'));
    vi.stubGlobal('window', {
      electronAPI: { getQuarantinedDataFiles: mocks.getQuarantinedDataFiles },
    });
    const failing = await freshStore();
    await failing.getState().initialize();

    expect(failing.getState().isEnabled).toBe(false);
    expect(mocks.toastShow).not.toHaveBeenCalled();
  });
});
