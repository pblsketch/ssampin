import type { Memo } from '@domain/entities/Memo';
import type { MemoShareBoard, MemoShareItemLink } from '@domain/entities/MemoShareBoard';
import type { MemoShareBoardFile } from '@domain/entities/MemoShareItem';
import type { IMemoShareClient } from '@domain/ports/IMemoShareClient';
import { buildBoardFile, computeItemHash, diffForSync } from '@domain/rules/memoShareRules';

/**
 * 공유 보드 동기화 UseCase (plan.md v2 B-2).
 *
 * 마지막 동기화 상태(lastSyncedHash)와 현재 메모를 비교(`diffForSync`)해
 * 이미지 증분 업로드/삭제 + 보드 JSON 전체 재업로드(`updateBoard`)를 수행한다.
 *
 * - 변경 없음(해시 동일·순서 동일·제목 동일)이면 포트를 호출하지 않고 board를 그대로 반환
 * - 위치(x/y)·rotation 변경은 해시에 미포함 → 자연 skip
 * - debounce(1.5s 큐 묶음)·오프라인 큐·재시도는 store(useMemoShareStore) 책임 —
 *   본 usecase는 실패 시 그대로 reject하여 store가 큐를 보존·재시도할 수 있게 한다
 */
export class SyncShareBoard {
  constructor(private readonly client: IMemoShareClient) {}

  async execute(
    board: MemoShareBoard,
    currentMemos: readonly Memo[],
    title?: string,
    now: string = new Date().toISOString(),
  ): Promise<MemoShareBoard> {
    const nextTitle = title ?? board.title;
    const diff = diffForSync(board, currentMemos);
    const titleChanged = nextTitle !== board.title;

    // 변경 없음 — 포트 미호출 skip
    if (!diff.needsJsonUpload && !titleChanged) {
      return board;
    }

    const boardFile = this.buildFileWithKnownImageIds(
      board,
      currentMemos,
      nextTitle,
      now,
      diff.imagesToUpload,
    );

    const result = await this.client.updateBoard(
      board.id,
      boardFile,
      diff.imagesToUpload,
      diff.imageFileIdsToDelete,
    );

    const linkByMemoId = new Map(board.items.map((link) => [link.memoId, link]));
    const items: MemoShareItemLink[] = currentMemos.map((memo, index) => {
      // 이번에 업로드된 이미지가 있으면 새 fileId, 없으면(이미지 불변) 기존 fileId 유지
      const uploadedFileId = result.imageFileIds[memo.id];
      const existingFileId = linkByMemoId.get(memo.id)?.imageFileId;
      const imageFileId = memo.image ? (uploadedFileId ?? existingFileId) : undefined;
      return {
        memoId: memo.id,
        ...(imageFileId !== undefined ? { imageFileId } : {}),
        sortOrder: index,
        lastSyncedAt: result.updatedAt,
        lastSyncedHash: computeItemHash(memo),
      };
    });

    return {
      ...board,
      title: nextTitle,
      items,
      updatedAt: result.updatedAt,
    };
  }

  /**
   * buildBoardFile은 모든 image.fileId를 ''로 두지만, 이번에 재업로드하지 않는
   * 이미지는 infra가 fileId를 알 수 없으므로 기존 링크의 fileId를 채워 넣는다.
   * (업로드 대상 항목만 ''로 남겨 infra가 치환)
   */
  private buildFileWithKnownImageIds(
    board: MemoShareBoard,
    currentMemos: readonly Memo[],
    title: string,
    now: string,
    imagesToUpload: readonly { itemId: string }[],
  ): MemoShareBoardFile {
    const base = buildBoardFile(currentMemos, title, now);
    const uploadIds = new Set(imagesToUpload.map((upload) => upload.itemId));
    const linkByMemoId = new Map(board.items.map((link) => [link.memoId, link]));

    const items = base.items.map((item) => {
      if (!item.image || uploadIds.has(item.id)) return item;
      const existingFileId = linkByMemoId.get(item.id)?.imageFileId;
      if (existingFileId === undefined) return item;
      return { ...item, image: { ...item.image, fileId: existingFileId } };
    });

    return { ...base, items };
  }
}
