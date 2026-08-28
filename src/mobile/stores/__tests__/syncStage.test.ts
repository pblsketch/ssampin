import { describe, expect, it, vi } from 'vitest';
import type { IDriveSyncPort } from '@domain/ports/IDriveSyncPort';
import {
  isForwardStage,
  stalledSyncMessage,
  SYNC_STAGE_LABEL,
  withStageReporting,
  type SyncStage,
} from '../syncStage';

describe('동기화 단계 기록', () => {
  it('앞 단계로만 전진한다 — 되돌아가면 가장 멀리 간 지점이 지워진다', () => {
    expect(isForwardStage(null, 'settings')).toBe(true);
    expect(isForwardStage('settings', 'token')).toBe(true);
    expect(isForwardStage('list', 'files')).toBe(true);
    // 장부 쓰기는 파일 루프 뒤에 오는 마무리 단계다. 'manifest' 로 묶으면 전진 규칙에
    // 막혀 "파일 주고받기에서 멈춤" 으로 잘못 안내된다.
    expect(isForwardStage('files', 'commit')).toBe(true);
    // 업로드는 파일을 올린 뒤 장부를 다시 손대고, 요청마다 토큰을 먼저 확인한다.
    expect(isForwardStage('files', 'manifest')).toBe(false);
    expect(isForwardStage('list', 'token')).toBe(false);
    expect(isForwardStage('files', 'files')).toBe(false);
  });

  it('정체 안내에 멈춘 단계와 다음 행동이 함께 담긴다', () => {
    const message = stalledSyncMessage('list');

    expect(message).toContain(SYNC_STAGE_LABEL.list);
    expect(message).toContain('다시 시도');
    expect(message).toContain('앱을 완전히 닫았다가 다시 열어주세요');
  });

  it('단계를 모르면 준비 중으로 안내한다', () => {
    expect(stalledSyncMessage(null)).toContain('준비 중');
  });

  it('단계 이름에 개인정보가 될 수 있는 값이 없다 — 고정 리터럴만', () => {
    const labels = Object.values(SYNC_STAGE_LABEL);

    expect(labels).toHaveLength(7);
    for (const label of labels) {
      expect(label).not.toMatch(/@|\d{3,}|token|Bearer/i);
    }
  });
});

describe('withStageReporting', () => {
  function createPort(): { port: IDriveSyncPort; listSyncFiles: ReturnType<typeof vi.fn> } {
    const listSyncFiles = vi.fn(async () => []);
    const port = {
      getOrCreateSyncFolder: vi.fn(async () => ({ id: 'folder-1', name: '쌤핀 동기화' })),
      listSyncFiles,
      updateSyncManifest: vi.fn(async () => undefined),
      deleteSyncFolder: vi.fn(async () => undefined),
    } as unknown as IDriveSyncPort;
    return { port, listSyncFiles };
  }

  it('감싼 메서드를 부를 때 해당 단계를 보고한다', async () => {
    const { port } = createPort();
    const reported: SyncStage[] = [];
    const wrapped = withStageReporting(port, (stage) => reported.push(stage));

    await wrapped.getOrCreateSyncFolder();
    await wrapped.listSyncFiles('folder-1');
    await wrapped.updateSyncManifest('folder-1', {
      version: 2,
      lastSyncedAt: '',
      deviceId: '',
      deviceName: '',
      files: {},
    });

    expect(reported).toEqual(['folder', 'list', 'commit']);
  });

  it('원래 반환값과 인자를 그대로 통과시킨다', async () => {
    const { port, listSyncFiles } = createPort();
    const wrapped = withStageReporting(port, () => undefined);

    const folder = await wrapped.getOrCreateSyncFolder();
    await wrapped.listSyncFiles('folder-42');

    expect(folder.id).toBe('folder-1');
    expect(listSyncFiles).toHaveBeenCalledWith('folder-42');
  });

  it('표에 없는 메서드는 단계를 바꾸지 않는다', async () => {
    const { port } = createPort();
    const reported: SyncStage[] = [];
    const wrapped = withStageReporting(port, (stage) => reported.push(stage));

    await wrapped.deleteSyncFolder('folder-1');

    expect(reported).toEqual([]);
  });
});
