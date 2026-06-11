import { describe, it, expect, vi } from 'vitest';
import type { IMemoShareClient } from '@domain/ports/IMemoShareClient';
import type { MemoShareBoard } from '@domain/entities/MemoShareBoard';
import { StopSharing } from '../StopSharing';

const NOW = '2026-06-11T09:00:00.000Z';

function mkClient(): IMemoShareClient {
  return {
    createBoard: vi.fn(),
    updateBoard: vi.fn(),
    deleteBoard: vi.fn().mockResolvedValue(undefined),
  };
}

function mkBoard(items: MemoShareBoard['items']): MemoShareBoard {
  return {
    id: 'drive-json-id',
    title: '우리 반 메모',
    shareUrl: 'https://ssampin.com/memo/drive-json-id',
    items,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe('StopSharing', () => {
  it('deleteBoard(fileId, 전체 imageFileIds)를 호출한다', async () => {
    const client = mkClient();
    const board = mkBoard([
      { memoId: 'm1', imageFileId: 'img-1', sortOrder: 0, lastSyncedAt: NOW, lastSyncedHash: 'h1' },
      { memoId: 'm2', sortOrder: 1, lastSyncedAt: NOW, lastSyncedHash: 'h2' },
      { memoId: 'm3', imageFileId: 'img-3', sortOrder: 2, lastSyncedAt: NOW, lastSyncedHash: 'h3' },
    ]);

    await new StopSharing(client).execute(board);

    expect(client.deleteBoard).toHaveBeenCalledTimes(1);
    expect(client.deleteBoard).toHaveBeenCalledWith('drive-json-id', ['img-1', 'img-3']);
  });

  it('이미지 없는 보드는 빈 imageFileIds로 호출한다', async () => {
    const client = mkClient();
    const board = mkBoard([
      { memoId: 'm1', sortOrder: 0, lastSyncedAt: NOW, lastSyncedHash: 'h1' },
    ]);

    await new StopSharing(client).execute(board);

    expect(client.deleteBoard).toHaveBeenCalledWith('drive-json-id', []);
  });

  it('포트 삭제 실패 시 그대로 reject한다 (로컬 보드 제거는 store가 성공 후 수행)', async () => {
    const client = mkClient();
    vi.mocked(client.deleteBoard).mockRejectedValue(new Error('404'));
    const board = mkBoard([]);

    await expect(new StopSharing(client).execute(board)).rejects.toThrow('404');
  });
});
