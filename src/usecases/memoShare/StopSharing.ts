import type { MemoShareBoard } from '@domain/entities/MemoShareBoard';
import type { IMemoShareClient } from '@domain/ports/IMemoShareClient';

/**
 * 공유 중지 UseCase (plan.md v2 B-2).
 *
 * `IMemoShareClient.deleteBoard`로 이미지 전부 + 보드 JSON을 Drive에서
 * **영구 삭제**(휴지통 미경유)한다 — 공유 중지 = 즉시 소멸(개인정보 잔존 방지).
 *
 * 로컬 보드 제거(storage·상태)는 store(useMemoShareStore) 책임.
 */
export class StopSharing {
  constructor(private readonly client: IMemoShareClient) {}

  async execute(board: MemoShareBoard): Promise<void> {
    const imageFileIds = board.items
      .map((link) => link.imageFileId)
      .filter((fileId): fileId is string => fileId !== undefined && fileId.length > 0);

    await this.client.deleteBoard(board.id, imageFileIds);
  }
}
