// @vitest-environment jsdom
/**
 * '동기화 충돌' 창 — 실패 안내·처리 중 잠금·시각 표시.
 *
 * 신고(2026-10-23): 어느 단추를 눌러도 아무 일도 일어나지 않았다. store 쪽 원인은
 * driveSyncResolveConflict.test.ts 가 잠그고, 여기서는 그 결과가 화면에 닿는지를 본다.
 * 시각을 알 수 없는 충돌(장부에 기준이 없는 파일)이 "Invalid Date"로 찍히던 것도 함께 잠근다.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { DriveSyncConflict } from '@domain/entities/DriveSyncState';
import { DriveSyncConflictModal } from './DriveSyncConflictModal';

const conflict: DriveSyncConflict = {
  filename: 'events',
  localModified: 'unknown',
  remoteModified: '2026-11-08T13:43:01.092Z',
  localDeviceName: '이 PC',
  remoteDeviceName: '다른 PC',
  kind: 'json',
  baselineChecksum: null,
  localChecksum: 'local',
  remoteChecksum: 'remote',
};

afterEach(() => cleanup());

describe('DriveSyncConflictModal', () => {
  it('시각을 알 수 없는 충돌은 Invalid Date 대신 알 수 없다고 적는다', () => {
    render(<DriveSyncConflictModal conflicts={[conflict]} onResolve={vi.fn()} onClose={vi.fn()} />);

    expect(screen.queryByText(/Invalid Date/)).toBeNull();
    expect(screen.getByText('시각 알 수 없음')).toBeTruthy();
  });

  it('단추를 누르면 고른 쪽으로 해결을 요청한다', () => {
    const onResolve = vi.fn();
    render(
      <DriveSyncConflictModal conflicts={[conflict]} onResolve={onResolve} onClose={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '이 기기 유지' }));
    fireEvent.click(screen.getByRole('button', { name: '클라우드로 대체' }));

    expect(onResolve).toHaveBeenNthCalledWith(1, conflict, 'local');
    expect(onResolve).toHaveBeenNthCalledWith(2, conflict, 'remote');
  });

  it('실패 안내가 있으면 창 안에 보여 준다', () => {
    render(
      <DriveSyncConflictModal
        conflicts={[conflict]}
        onResolve={vi.fn()}
        onClose={vi.fn()}
        error="고르는 사이에 자료가 바뀌어 최신 상태로 다시 확인했어요. 아래에서 다시 골라 주세요."
      />,
    );

    expect(screen.getByRole('alert').textContent).toContain('다시 골라 주세요');
  });

  it('처리 중에는 두 단추를 잠그고 진행 중임을 적는다', () => {
    const onResolve = vi.fn();
    render(
      <DriveSyncConflictModal
        conflicts={[conflict]}
        onResolve={onResolve}
        onClose={vi.fn()}
        resolvingFilename="events"
      />,
    );

    const busy = screen.getByRole('button', { name: '처리 중…' });
    const other = screen.getByRole('button', { name: '클라우드로 대체' });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    expect((other as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(busy);
    fireEvent.click(other);
    expect(onResolve).not.toHaveBeenCalled();
  });
});
