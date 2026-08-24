// @vitest-environment jsdom
/**
 * "등록 후보 쪽지" 알림 배너 테스트.
 *
 * 잠그는 계약:
 *   - 설정이 꺼져 있으면 아무것도 안 뜬다
 *   - 후보가 없으면 조용하다 (평소에 거슬리지 않아야 한다)
 *   - 쪽지함을 못 읽어도 오류를 들이밀지 않는다 (배너는 거들 뿐이다)
 *   - 날짜 없는 쪽지는 세지 않는다
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CoolMessage } from '@domain/entities/CoolMessage';

const settingsState = {
  settings: { coolMessengerImportEnabled: true } as Record<string, unknown>,
};

const MESSAGES: CoolMessage[] = [
  {
    key: 1,
    sender: '교무부',
    receivedAt: new Date(2026, 7, 20, 9, 0).toISOString(),
    title: '학폭위 심의',
    body: '8월 27일(목) 14:00 회의실',
    isUnread: true,
  },
  {
    key: 2,
    sender: '교장',
    receivedAt: new Date(2026, 7, 19, 9, 0).toISOString(),
    title: '인사말',
    body: '한 학기 수고 많으셨습니다.',
    isUnread: false,
  },
];

let listImpl: () => Promise<CoolMessage[]> = () => Promise.resolve(MESSAGES);

vi.mock('@adapters/stores/useSettingsStore', () => ({
  useSettingsStore: (selector: (s: typeof settingsState) => unknown) => selector(settingsState),
}));
vi.mock('@adapters/stores/useEventsStore', () => ({
  useEventsStore: (selector: (s: { addEvent: unknown }) => unknown) =>
    selector({ addEvent: vi.fn() }),
}));
vi.mock('@adapters/stores/useTodoStore', () => ({
  useTodoStore: (selector: (s: { addTodo: unknown }) => unknown) => selector({ addTodo: vi.fn() }),
}));
vi.mock('@adapters/stores/useStudentStore', () => ({
  useStudentStore: (selector: (s: { students: unknown[] }) => unknown) =>
    selector({ students: [] }),
}));

const historyState = {
  history: { records: [] as unknown[] },
  loaded: true,
  load: vi.fn(() => Promise.resolve()),
  remember: vi.fn(() => Promise.resolve()),
  isImported: () => false,
  hasImportedFrom: () => false,
  bannerDismissed: false,
  dismissBanner: vi.fn(() => {
    historyState.bannerDismissed = true;
  }),
};
vi.mock('@adapters/stores/useCoolImportHistoryStore', () => ({
  useCoolImportHistoryStore: Object.assign(
    (selector: (s: typeof historyState) => unknown) => selector(historyState),
    { getState: () => historyState },
  ),
}));

const { CoolImportBanner, resetCoolImportBannerSessionCache } = await import('./CoolImportBanner');

beforeEach(() => {
  resetCoolImportBannerSessionCache(); // 세션당 1회 캐시 — 테스트끼리는 격리한다
  settingsState.settings = { coolMessengerImportEnabled: true };
  historyState.history = { records: [] };
  historyState.bannerDismissed = false; // 앞 테스트의 '나중에'가 남지 않게
  listImpl = () => Promise.resolve(MESSAGES);
  (window as unknown as { electronAPI: unknown }).electronAPI = {
    coolMessenger: {
      isAvailable: () => Promise.resolve(true),
      list: () => listImpl(),
      get: (k: number) => Promise.resolve(MESSAGES.find((m) => m.key === k) ?? null),
      members: () => Promise.resolve([]),
    },
  };
});

afterEach(() => {
  cleanup();
  vi.resetModules();
});

describe('노출 규칙', () => {
  it('날짜가 든 쪽지가 있으면 후보 수를 알려 준다 (인사말은 안 센다)', async () => {
    render(<CoolImportBanner />);
    expect(await screen.findByText(/등록 후보 쪽지 1건/)).toBeTruthy();
  });

  it('★ 설정이 꺼져 있으면 아무것도 안 뜬다', async () => {
    settingsState.settings = { coolMessengerImportEnabled: false };
    const { container } = render(<CoolImportBanner />);
    await waitFor(() => expect(container.innerHTML).toBe(''));
  });

  it('★ 후보가 없으면 조용하다', async () => {
    listImpl = () => Promise.resolve([MESSAGES[1]!]); // 인사말만
    const { container } = render(<CoolImportBanner />);
    await waitFor(() => expect(container.innerHTML).toBe(''));
  });

  it('★ 쪽지함을 못 읽어도 오류를 들이밀지 않는다', async () => {
    listImpl = () => Promise.reject(new Error('쪽지함 없음'));
    const { container } = render(<CoolImportBanner />);
    await waitFor(() => expect(container.innerHTML).toBe(''));
  });
});

describe('조작', () => {
  it('"나중에"를 누르면 접으라고 알린다', async () => {
    const user = userEvent.setup();
    render(<CoolImportBanner />);
    await screen.findByText(/등록 후보 쪽지 1건/);
    await user.click(screen.getByRole('button', { name: '나중에' }));
    expect(historyState.dismissBanner).toHaveBeenCalled();
  });

  it('★ 접힌 상태면 처음부터 안 뜬다 (껐다 켜기 전까지)', async () => {
    historyState.bannerDismissed = true;
    const { container } = render(<CoolImportBanner />);
    await waitFor(() => expect(container.innerHTML).toBe(''));
  });

  it('"살펴보기"를 누르면 가져오기 창이 열린다', async () => {
    const user = userEvent.setup();
    render(<CoolImportBanner />);
    await screen.findByText(/등록 후보 쪽지 1건/);
    await user.click(screen.getByRole('button', { name: '살펴보기' }));
    expect(await screen.findByText('학폭위 심의')).toBeTruthy();
  });

  it('★ 창을 [취소]로 그냥 닫으면 배너를 접지 않는다 (오너 결정 2026-08-24)', async () => {
    // 지금 볼 시간이 없어 닫았는데 알림까지 사라지면 잊어버린다.
    // 접는 것은 등록하고 나왔을 때와 [나중에]를 눌렀을 때뿐이다.
    historyState.dismissBanner.mockClear(); // 앞 테스트('나중에')의 호출이 남아 있다
    const user = userEvent.setup();
    render(<CoolImportBanner />);
    await screen.findByText(/등록 후보 쪽지 1건/);
    await user.click(screen.getByRole('button', { name: '살펴보기' }));
    await screen.findByText('학폭위 심의');
    await user.click(screen.getByRole('button', { name: '취소' }));
    expect(historyState.dismissBanner).not.toHaveBeenCalled();
    expect(screen.getByText(/등록 후보 쪽지 1건/)).toBeTruthy();
  });
});
