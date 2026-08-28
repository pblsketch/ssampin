/**
 * @vitest-environment jsdom
 *
 * DriveSyncIndicator — [클라우드 백업 다시 만들기] 노출 조건.
 *
 * 배경(사용자 신고): 사이드바에 "클라우드 events 파일과 동기화 장부가 일치하지 않습니다.
 * 클라우드 데이터를 다시 구성해 주세요." 가 떴는데, 정작 그 이름의 단추가 앱에 없었다.
 * 실제 복구 경로는 설정 네 겹 안쪽이라 선생님이 도달할 수 없었다.
 *
 * 이 파일이 잠그는 것은 **노출 조건**이다. 두 방향 모두 사고다:
 *  - 안 뜨면: 신고 상황이 그대로 재현된다(고칠 방법이 화면에 없다).
 *  - 아무 오류에나 뜨면: 기다리면 풀릴 일시적 실패에도 클라우드를 통째 다시 만들게 된다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DriveSyncIndicator } from './DriveSyncIndicator';
import { useDriveSyncStore } from '@adapters/stores/useDriveSyncStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { GOOGLE_AUTH_BLOCKED_MESSAGE } from '@domain/rules/calendarSyncRules';
import { buildManifestMismatchMessage } from '@domain/rules/driveSyncRecovery';

const REBUILD_LABEL = '클라우드 백업 다시 만들기';

/** 신고에 실제로 찍힌 문구 */
const MISMATCH_ERROR = buildManifestMismatchMessage('events');

function enableSync(): void {
  const settings = useSettingsStore.getState().settings;
  useSettingsStore.setState({
    settings: {
      ...settings,
      sync: {
        enabled: true,
        autoSyncOnStart: false,
        autoSyncOnSave: false,
        autoSyncIntervalMin: 0,
        conflictPolicy: 'latest',
        lastSyncedAt: null,
        deviceId: 'test-device',
      },
    },
  });
}

function setError(message: string): void {
  useDriveSyncStore.setState({ status: 'error', error: message, progress: null, conflicts: [] });
}

beforeEach(() => {
  enableSync();
  useDriveSyncStore.setState({
    status: 'idle',
    error: null,
    progress: null,
    conflicts: [],
    lastSyncedAt: null,
  });
});

afterEach(() => cleanup());

describe('DriveSyncIndicator — 복구 단추 노출 조건', () => {
  it('장부 불일치 오류에는 뜬다 (신고 재현)', () => {
    setError(MISMATCH_ERROR);
    render(<DriveSyncIndicator />);
    expect(screen.getByRole('button', { name: new RegExp(REBUILD_LABEL) })).toBeTruthy();
  });

  it('일반 네트워크 실패에는 뜨지 않는다', () => {
    setError('네트워크 연결을 확인해주세요.');
    render(<DriveSyncIndicator />);
    expect(screen.queryByText(REBUILD_LABEL)).toBeNull();
  });

  it('구글 인증 차단에는 뜨지 않는다 (해법이 재연결이지 재구성이 아니다)', () => {
    setError(GOOGLE_AUTH_BLOCKED_MESSAGE);
    render(<DriveSyncIndicator />);
    expect(screen.queryByText(REBUILD_LABEL)).toBeNull();
  });

  // ★ 가장 중요한 단언 — 여기서 단추가 뜨면 원본 기기의 자료를 이 기기가 지운다.
  it('원본 기기에서 고쳐야 하는 오류에는 뜨지 않는다', () => {
    setError(
      '다른 기기가 올린 클라우드 obs-attachments/a.png 파일을 찾지 못했습니다. 원본 기기에서 클라우드 데이터를 다시 구성해 주세요.',
    );
    render(<DriveSyncIndicator />);
    expect(screen.queryByText(REBUILD_LABEL)).toBeNull();
  });

  it('오류가 아닌 상태에는 뜨지 않는다', () => {
    render(<DriveSyncIndicator />);
    expect(screen.queryByText(REBUILD_LABEL)).toBeNull();
  });

  it('사이드바가 접힌 모드에서는 기존 아이콘 하나만 유지한다', () => {
    setError(MISMATCH_ERROR);
    render(<DriveSyncIndicator collapsed />);
    expect(screen.queryByText(REBUILD_LABEL)).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});

describe('DriveSyncIndicator — 복구 흐름', () => {
  it('단추를 눌러도 바로 실행하지 않고 확인 모달을 먼저 띄운다', () => {
    const rebuildCloudData = vi.fn(async () => {});
    useDriveSyncStore.setState({ rebuildCloudData });
    setError(MISMATCH_ERROR);
    render(<DriveSyncIndicator />);

    fireEvent.click(screen.getByRole('button', { name: new RegExp(REBUILD_LABEL) }));

    expect(rebuildCloudData).not.toHaveBeenCalled();
    expect(screen.getByText(/이 컴퓨터에 있는 자료는 하나도 지워지지 않아요/)).toBeTruthy();
  });

  it('모달에서 확정해야 실제로 다시 만든다', () => {
    const rebuildCloudData = vi.fn(async () => {});
    useDriveSyncStore.setState({ rebuildCloudData });
    setError(MISMATCH_ERROR);
    render(<DriveSyncIndicator />);

    fireEvent.click(screen.getByRole('button', { name: new RegExp(REBUILD_LABEL) }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: '다시 만들기' }));

    expect(rebuildCloudData).toHaveBeenCalledTimes(1);
  });

  it('기존 재시도 줄은 그대로 남는다', () => {
    setError(MISMATCH_ERROR);
    render(<DriveSyncIndicator />);
    expect(screen.getByRole('button', { name: new RegExp(MISMATCH_ERROR) })).toBeTruthy();
  });
});
