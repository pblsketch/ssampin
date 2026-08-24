// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const driveState = {
  state: 'conflict',
  progress: 0,
  error: null,
  errorKind: null,
  conflict: {
    filename: 'curriculum-progress',
    localModified: 'content-mismatch',
    remoteModified: '2026-08-24T07:00:00.000Z',
    localDeviceName: '휴대폰',
    remoteDeviceName: 'PC',
  },
  lastSyncedAt: null,
  isAuthenticated: true,
  syncFromCloud: vi.fn(async () => undefined),
};

vi.mock('@mobile/stores/useMobileDriveSyncStore', () => ({
  useMobileDriveSyncStore: (selector: (state: typeof driveState) => unknown) =>
    selector(driveState),
}));

vi.mock('@mobile/contexts/GoogleAuthContext', () => ({
  useGoogleAuthContext: () => ({ startLogin: vi.fn() }),
}));

import { SyncStatusBanner } from './SyncStatusBanner';

beforeEach(() => {
  driveState.state = 'conflict';
});

afterEach(cleanup);

describe('모바일 전역 동기화 충돌 안내', () => {
  it('진도 화면이 오래된 이유를 알리고 해결 화면으로 이동시킨다', () => {
    const onOpenSyncSettings = vi.fn();

    render(<SyncStatusBanner onOpenSyncSettings={onOpenSyncSettings} />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'PC와 휴대폰의 진도 관리가 모두 변경됐어요',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('이전 내용이 표시될 수 있어요');

    fireEvent.click(screen.getByRole('button', { name: '동기화 내용 선택하기' }));
    expect(onOpenSyncSettings).toHaveBeenCalledTimes(1);
  });

  it('이전 상태 배너를 닫았어도 새 충돌은 다시 표시한다', async () => {
    driveState.state = 'syncing';
    const { rerender } = render(<SyncStatusBanner onOpenSyncSettings={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    driveState.state = 'conflict';
    rerender(<SyncStatusBanner onOpenSyncSettings={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
