// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const resolveConflictMock = vi.fn<(choice: 'local' | 'remote') => Promise<void>>();
const resolveAllConflictsFromCloudMock = vi.fn<
  (onProgress?: (current: number) => void) => Promise<void>
>();

const driveState = {
  state: 'conflict',
  progress: 0,
  error: null,
  conflict: {
    filename: 'events',
    localModified: 'content-mismatch',
    remoteModified: '2026-08-08T11:00:00.000Z',
    localDeviceName: '현재 폰',
    remoteDeviceName: 'PC',
  },
  lastSyncedAt: null,
  syncToCloud: vi.fn(async () => undefined),
  syncFromCloud: vi.fn(async () => undefined),
  resolveConflict: (choice: 'local' | 'remote') => resolveConflictMock(choice),
  resolveAllConflictsFromCloud: (onProgress?: (current: number) => void) =>
    resolveAllConflictsFromCloudMock(onProgress),
  isAuthenticated: true,
  lastSyncResult: {
    direction: 'download',
    timestamp: '2026-08-08T11:00:00.000Z',
    downloaded: [],
    skipped: [],
    conflicts: ['events', 'todos', 'student-records', 'attendance'],
  },
};

vi.mock('@mobile/stores/useMobileDriveSyncStore', () => ({
  useMobileDriveSyncStore: () => driveState,
}));

vi.mock('@mobile/stores/useMobileSettingsStore', () => ({
  useMobileSettingsStore: (selector: (state: unknown) => unknown) =>
    selector({
      settings: { sync: { autoSyncInterval: 5 } },
      setAutoSyncInterval: vi.fn(async () => undefined),
    }),
}));

vi.mock('@mobile/contexts/GoogleAuthContext', () => ({
  useGoogleAuthContext: () => ({
    isAuthenticated: true,
    email: 'teacher@example.com',
    startLogin: vi.fn(),
    logout: vi.fn(async () => undefined),
  }),
}));

import { SyncStatus } from './SyncStatus';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  driveState.lastSyncResult.conflicts = ['events', 'todos', 'student-records', 'attendance'];
  resolveConflictMock.mockReset();
  resolveConflictMock.mockResolvedValue(undefined);
  resolveAllConflictsFromCloudMock.mockReset();
  resolveAllConflictsFromCloudMock.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe('모바일 동기화 충돌 카드', () => {
  it('원시 파일명과 이질적인 하드코딩 색상 대신 앱 토큰으로 일정 충돌을 안내한다', () => {
    const { container } = render(<SyncStatus />);

    expect(screen.getByText('일정 동기화 내용을 선택해 주세요')).toBeInTheDocument();
    expect(screen.queryByText(/\bevents\b/)).not.toBeInTheDocument();

    const notice = screen.getByRole('alert');
    expect(notice).toHaveClass('border-sp-border');
    expect(notice).toHaveClass('bg-sp-bg');
    expect(container.innerHTML).not.toContain('yellow-950');
    expect(container.innerHTML).not.toContain('gray-700');
    expect(container.innerHTML).not.toContain('blue-600');
    expect(screen.getByRole('button', { name: '이 기기 내용 유지' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '클라우드에서 복구' })).toBeInTheDocument();
  });

  it('충돌이 하나뿐이면 중복되는 일괄 복구 버튼을 숨긴다', () => {
    const original = driveState.lastSyncResult.conflicts;
    driveState.lastSyncResult.conflicts = ['events'];
    render(<SyncStatus />);
    expect(screen.queryByRole('button', { name: /모두 클라우드에서 복구/ })).not.toBeInTheDocument();
    driveState.lastSyncResult.conflicts = original;
  });

  it('클라우드 복구를 누르면 선택 박스를 즉시 진행 안내로 바꾼다', async () => {
    const pending = deferred<void>();
    resolveConflictMock.mockReturnValueOnce(pending.promise);
    render(<SyncStatus />);

    fireEvent.click(screen.getByRole('button', { name: '클라우드에서 복구' }));

    await waitFor(() => {
      expect(screen.getByText('일정: 클라우드 복구 중')).toBeInTheDocument();
    });
    expect(screen.queryByText('일정 동기화 내용을 선택해 주세요')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '클라우드에서 복구' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');

    await act(async () => {
      pending.resolve(undefined);
      await pending.promise;
    });
  });

  it('여러 충돌을 한 번에 클라우드에서 복구할 수 있다', async () => {
    const pending = deferred<void>();
    let reportProgress: ((current: number) => void) | undefined;
    resolveAllConflictsFromCloudMock.mockImplementationOnce(async (onProgress) => {
      reportProgress = onProgress;
      onProgress?.(1);
      return pending.promise;
    });
    render(<SyncStatus />);

    fireEvent.click(screen.getByRole('button', { name: '모두 클라우드에서 복구 (4개)' }));

    expect(resolveAllConflictsFromCloudMock).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByText('1/4 항목: 클라우드 복구 중')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: '이 기기 내용 유지' })).not.toBeInTheDocument();

    act(() => reportProgress?.(2));
    expect(screen.getByText('2/4 항목: 클라우드 복구 중')).toBeInTheDocument();

    await act(async () => {
      pending.resolve(undefined);
      await pending.promise;
    });
    expect(screen.getByRole('button', { name: '이 기기 내용 유지' })).toBeInTheDocument();
  });
});
