import type { Memo } from '@domain/entities/Memo';
import type { MemoShareBoard, MemoShareItemLink } from '@domain/entities/MemoShareBoard';
import type { IMemoShareClient } from '@domain/ports/IMemoShareClient';
import {
  buildBoardFile,
  buildShareUrl,
  computeItemHash,
  extractImageUploads,
} from '@domain/rules/memoShareRules';

/**
 * 공유 보드 생성 UseCase (plan.md v2 B-2).
 *
 * 선택된 memo[] → 이미지 업로드 목록 추출(dataUrl) → buildBoardFile →
 * `IMemoShareClient.createBoard` → 로컬 보드(MemoShareBoard) 반환.
 *
 * 로컬 보드의 영속(storage 저장)·UI 갱신은 store(useMemoShareStore) 책임.
 */
export class CreateShareBoard {
  constructor(private readonly client: IMemoShareClient) {}

  async execute(
    memos: readonly Memo[],
    title: string,
    now: string = new Date().toISOString(),
  ): Promise<MemoShareBoard> {
    if (memos.length === 0) {
      throw new Error('공유할 포스트잇을 1개 이상 선택해 주세요.');
    }

    // MAX_ITEMS 초과는 buildBoardFile이 검출하여 throw
    const boardFile = buildBoardFile(memos, title, now);
    const images = extractImageUploads(memos);

    const result = await this.client.createBoard(boardFile, images);

    const items: MemoShareItemLink[] = memos.map((memo, index) => {
      const imageFileId = result.imageFileIds[memo.id];
      return {
        memoId: memo.id,
        ...(imageFileId !== undefined ? { imageFileId } : {}),
        sortOrder: index,
        lastSyncedAt: result.createdAt,
        lastSyncedHash: computeItemHash(memo),
      };
    });

    return {
      id: result.fileId,
      title,
      shareUrl: buildShareUrl(result.fileId),
      items,
      createdAt: result.createdAt,
      updatedAt: result.createdAt,
    };
  }
}
