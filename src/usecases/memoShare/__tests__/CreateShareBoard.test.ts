import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Memo } from '@domain/entities/Memo';
import type { MemoImage } from '@domain/valueObjects/MemoImage';
import type { IMemoShareClient, CreateBoardResult } from '@domain/ports/IMemoShareClient';
import { computeItemHash } from '@domain/rules/memoShareRules';
import { CreateShareBoard } from '../CreateShareBoard';

const NOW = '2026-06-11T09:00:00.000Z';

function mkImage(overrides: Partial<MemoImage> = {}): MemoImage {
  return {
    dataUrl: 'data:image/png;base64,QUFBQQ==',
    fileName: 'photo.png',
    mimeType: 'image/png',
    width: 400,
    height: 300,
    originalSize: 1234,
    ...overrides,
  };
}

function mkMemo(overrides: Partial<Memo> = {}): Memo {
  return {
    id: 'memo-1',
    content: '내일 준비물: 색연필',
    color: 'yellow',
    x: 100,
    y: 200,
    width: 280,
    height: 220,
    rotation: 1,
    createdAt: '2026-06-10T00:00:00.000Z',
    updatedAt: '2026-06-11T00:00:00.000Z',
    archived: false,
    fontSize: 'base',
    ...overrides,
  };
}

function mkClient(createResult: CreateBoardResult): IMemoShareClient {
  return {
    createBoard: vi.fn().mockResolvedValue(createResult),
    updateBoard: vi.fn(),
    deleteBoard: vi.fn(),
  };
}

describe('CreateShareBoard', () => {
  let client: IMemoShareClient;

  beforeEach(() => {
    client = mkClient({
      fileId: 'drive-json-id',
      imageFileIds: { m1: 'img-file-1' },
      createdAt: NOW,
    });
  });

  it('이미지 dataUrl → 업로드 목록을 추출해 포트에 전달한다', async () => {
    const memos = [mkMemo({ id: 'm1', image: mkImage() }), mkMemo({ id: 'm2' })];
    await new CreateShareBoard(client).execute(memos, '우리 반 메모', NOW);

    expect(client.createBoard).toHaveBeenCalledTimes(1);
    const [, images] = vi.mocked(client.createBoard).mock.calls[0]!;
    expect(images).toEqual([
      { itemId: 'm1', dataUrl: 'data:image/png;base64,QUFBQQ==', mime: 'image/png' },
    ]);
  });

  it('포트 호출 인자: 보드 파일(version=1·fileId 빈 자리) + 이미지 목록', async () => {
    const memos = [mkMemo({ id: 'm1', image: mkImage() })];
    await new CreateShareBoard(client).execute(memos, '우리 반 메모', NOW);

    const [boardFile] = vi.mocked(client.createBoard).mock.calls[0]!;
    expect(boardFile.version).toBe(1);
    expect(boardFile.title).toBe('우리 반 메모');
    expect(boardFile.updatedAt).toBe(NOW);
    expect(boardFile.items[0]!.image).toEqual({ fileId: '', width: 400, height: 300 });
    // 보드 JSON에는 이미지 원본(dataUrl)이 포함되지 않는다
    expect(JSON.stringify(boardFile)).not.toContain('base64');
  });

  it('imageFileIds 매핑으로 로컬 보드(MemoShareBoard)를 구성한다', async () => {
    const withImage = mkMemo({ id: 'm1', image: mkImage() });
    const textOnly = mkMemo({ id: 'm2', content: '텍스트만' });
    const board = await new CreateShareBoard(client).execute(
      [withImage, textOnly],
      '우리 반 메모',
      NOW,
    );

    expect(board.id).toBe('drive-json-id');
    expect(board.title).toBe('우리 반 메모');
    expect(board.shareUrl).toBe('https://ssampin.com/memo/drive-json-id');
    expect(board.createdAt).toBe(NOW);
    expect(board.updatedAt).toBe(NOW);
    expect(board.items).toEqual([
      {
        memoId: 'm1',
        imageFileId: 'img-file-1',
        sortOrder: 0,
        lastSyncedAt: NOW,
        lastSyncedHash: computeItemHash(withImage),
      },
      {
        memoId: 'm2',
        sortOrder: 1,
        lastSyncedAt: NOW,
        lastSyncedHash: computeItemHash(textOnly),
      },
    ]);
  });

  it('items 0개는 거부한다 (포트 미호출)', async () => {
    await expect(new CreateShareBoard(client).execute([], '우리 반 메모', NOW)).rejects.toThrow();
    expect(client.createBoard).not.toHaveBeenCalled();
  });

  it('MAX_ITEMS(50) 초과는 거부한다 (포트 미호출)', async () => {
    const memos = Array.from({ length: 51 }, (_, i) => mkMemo({ id: `m${i}` }));
    await expect(new CreateShareBoard(client).execute(memos, '제목', NOW)).rejects.toThrow();
    expect(client.createBoard).not.toHaveBeenCalled();
  });
});
