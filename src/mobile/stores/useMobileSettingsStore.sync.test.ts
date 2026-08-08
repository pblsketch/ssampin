// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const repositoryMocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  saveSettings: vi.fn(),
}));

vi.mock('@mobile/di/container', () => ({
  settingsRepository: repositoryMocks,
}));

import { useMobileSettingsStore } from './useMobileSettingsStore';
import { computeSyncChecksum } from '@usecases/sync/SyncToCloud';

describe('모바일 설정 동기화 고정점', () => {
  beforeEach(() => {
    repositoryMocks.getSettings.mockReset();
    repositoryMocks.saveSettings.mockReset();
    localStorage.clear();
    useMobileSettingsStore.setState({ loaded: false });
  });

  it('클라우드 설정의 데스크톱 deviceId를 load 과정에서 다시 저장하지 않는다', async () => {
    const persisted = {
      schoolName: '테스트중학교',
      teacherName: '교사',
      className: '1학년 1반',
      periodTimes: [],
      teacherRoles: [],
      neis: { atptCode: '', schoolCode: '' },
      sync: { deviceId: 'desktop-device', autoSyncInterval: 0 },
    };
    repositoryMocks.getSettings.mockResolvedValue(persisted);
    const before = await computeSyncChecksum(JSON.stringify(persisted));

    await useMobileSettingsStore.getState().load();
    await useMobileSettingsStore.getState().reload();
    const after = await computeSyncChecksum(JSON.stringify(persisted));

    expect(repositoryMocks.saveSettings).not.toHaveBeenCalled();
    expect(after).toBe(before);
  });
});
