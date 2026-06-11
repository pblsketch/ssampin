import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Memo } from '@domain/entities/Memo';
import type { MemoImage } from '@domain/valueObjects/MemoImage';
import type { MemoShareBoard, MemoShareItemLink } from '@domain/entities/MemoShareBoard';
import type { IMemoShareClient, UpdateBoardResult } from '@domain/ports/IMemoShareClient';
import { computeItemHash } from '@domain/rules/memoShareRules';
import { SyncShareBoard } from '../SyncShareBoard';

const NOW = '2026-06-11T09:00:00.000Z';
const LATER = '2026-06-11T09:05:00.000Z';

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

function mkLink(memo: Memo, overrides: Partial<MemoShareItemLink> = {}): MemoShareItemLink {
  return {
    memoId: memo.id,
    sortOrder: 0,
    lastSyncedAt: NOW,
    lastSyncedHash: computeItemHash(memo),
    ...overrides,
  };
}

function mkBoard(items: readonly MemoShareItemLink[]): MemoShareBoard {
  return {
    id: 'drive-json-id',
    title: '우리 반 메모',
    shareUrl: 'https://ssampin.com/memo/drive-json-id',
    items,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function mkClient(
  updateResult: UpdateBoardResult = { imageFileIds: {}, updatedAt: LATER },
): IMemoShareClient {
  return {
    createBoard: vi.fn(),
    updateBoard: vi.fn().mockResolvedValue(updateResult),
    deleteBoard: vi.fn(),
  };
}

describe('SyncShareBoard', () => {
  let client: IMemoShareClient;

  beforeEach(() => {
    client = mkClient();
  });

  it('다중 항목 변경도 updateBoard 1회 호출로 묶는다', async () => {
    const m1 = mkMemo({ id: 'm1' });
    const m2 = mkMemo({ id: 'm2', content: '둘째' });
    const m3 = mkMemo({ id: 'm3', content: '셋째' });
    const board = mkBoard([
      mkLink(m1, { sortOrder: 0 }),
      mkLink(m2, { sortOrder: 1 }),
      mkLink(m3, { sortOrder: 2 }),
    ]);
    // 3개 모두 내용 변경
    const edited = [
      mkMemo({ id: 'm1', content: '수정 1' }),
      mkMemo({ id: 'm2', content: '수정 2' }),
      mkMemo({ id: 'm3', content: '수정 3' }),
    ];

    await new SyncShareBoard(client).execute(board, edited, undefined, LATER);

    expect(client.updateBoard).toHaveBeenCalledTimes(1);
    const [fileId, boardFile] = vi.mocked(client.updateBoard).mock.calls[0]!;
    expect(fileId).toBe('drive-json-id');
    expect(boardFile.items.map((item) => item.content)).toEqual(['수정 1', '수정 2', '수정 3']);
  });

  it('해시 동일(변경 없음) 시 포트를 호출하지 않고 보드를 그대로 반환한다', async () => {
    const memo = mkMemo({ id: 'm1' });
    const board = mkBoard([mkLink(memo, { sortOrder: 0 })]);

    const result = await new SyncShareBoard(client).execute(board, [memo], undefined, LATER);

    expect(client.updateBoard).not.toHaveBeenCalled();
    expect(result).toBe(board);
  });

  it('위치(x/y)·rotation만 변경 시에도 포트를 호출하지 않는다', async () => {
    const memo = mkMemo({ id: 'm1' });
    const board = mkBoard([mkLink(memo, { sortOrder: 0 })]);
    const moved = mkMemo({ id: 'm1', x: 999, y: 888, rotation: -3 });

    const result = await new SyncShareBoard(client).execute(board, [moved], undefined, LATER);

    expect(client.updateBoard).not.toHaveBeenCalled();
    expect(result).toBe(board);
  });

  it('이미지 추가 → 업로드 목록, 항목 제거 → 삭제 목록으로 전달한다', async () => {
    client = mkClient({ imageFileIds: { m3: 'img-file-3' }, updatedAt: LATER });
    const kept = mkMemo({ id: 'm1' });
    const removed = mkMemo({ id: 'm2', image: mkImage() });
    const board = mkBoard([
      mkLink(kept, { sortOrder: 0 }),
      mkLink(removed, { sortOrder: 1, imageFileId: 'img-file-2' }),
    ]);
    const added = mkMemo({ id: 'm3', image: mkImage() });

    const result = await new SyncShareBoard(client).execute(board, [kept, added], undefined, LATER);

    const [, , imagesToUpload, imageFileIdsToDelete] = vi.mocked(client.updateBoard).mock.calls[0]!;
    expect(imagesToUpload).toEqual([
      { itemId: 'm3', dataUrl: 'data:image/png;base64,QUFBQQ==', mime: 'image/png' },
    ]);
    expect(imageFileIdsToDelete).toEqual(['img-file-2']);

    // 갱신된 로컬 보드: 새 이미지 fileId 매핑 + 제거 항목 링크 소멸
    expect(result.items).toEqual([
      {
        memoId: 'm1',
        sortOrder: 0,
        lastSyncedAt: LATER,
        lastSyncedHash: computeItemHash(kept),
      },
      {
        memoId: 'm3',
        imageFileId: 'img-file-3',
        sortOrder: 1,
        lastSyncedAt: LATER,
        lastSyncedHash: computeItemHash(added),
      },
    ]);
    expect(result.updatedAt).toBe(LATER);
  });

  it('재업로드하지 않는 기존 이미지는 보드 JSON에 기존 fileId를 채워 전달한다', async () => {
    const withImage = mkMemo({ id: 'm1', image: mkImage() });
    const board = mkBoard([mkLink(withImage, { sortOrder: 0, imageFileId: 'img-keep' })]);
    // 텍스트만 변경 — 이미지는 그대로
    const edited = mkMemo({ id: 'm1', image: mkImage(), content: '텍스트 수정' });

    const result = await new SyncShareBoard(client).execute(board, [edited], undefined, LATER);

    const [, boardFile, imagesToUpload] = vi.mocked(client.updateBoard).mock.calls[0]!;
    expect(imagesToUpload).toEqual([]);
    expect(boardFile.items[0]!.image).toEqual({ fileId: 'img-keep', width: 400, height: 300 });
    // 링크에도 기존 fileId 유지
    expect(result.items[0]!.imageFileId).toBe('img-keep');
  });

  it('제목 변경만으로도 JSON을 재업로드한다', async () => {
    const memo = mkMemo({ id: 'm1' });
    const board = mkBoard([mkLink(memo, { sortOrder: 0 })]);

    const result = await new SyncShareBoard(client).execute(board, [memo], '새 제목', LATER);

    expect(client.updateBoard).toHaveBeenCalledTimes(1);
    const [, boardFile] = vi.mocked(client.updateBoard).mock.calls[0]!;
    expect(boardFile.title).toBe('새 제목');
    expect(result.title).toBe('새 제목');
  });

  it('포트 실패 시 그대로 reject한다 (store가 큐 보존 후 flush·재시도 책임)', async () => {
    vi.mocked(client.updateBoard).mockRejectedValue(new Error('네트워크 오류'));
    const memo = mkMemo({ id: 'm1' });
    const board = mkBoard([mkLink(memo, { sortOrder: 0 })]);
    const edited = mkMemo({ id: 'm1', content: '수정' });

    await expect(
      new SyncShareBoard(client).execute(board, [edited], undefined, LATER),
    ).rejects.toThrow('네트워크 오류');
    // 실패해도 입력 board는 변형되지 않는다 (재시도 시 같은 diff 재산출 가능)
    expect(board.items[0]!.lastSyncedHash).toBe(computeItemHash(memo));
  });
});
