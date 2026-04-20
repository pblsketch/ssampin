/**
 * SaveBoardSnapshot — Design §3.4 수동/자동 저장 공통 유스케이스
 *
 * - 교사 수동 저장 버튼
 * - 자동 저장 타이머(StartBoardSession 내부에서 직접 Repository 호출하므로
 *   이 유스케이스는 수동 경로 전용, IPC `collab-board:save-snapshot` 핸들러에 연결)
 * - before-quit 경로는 동기 저장이라 별도 (BoardFilePersistence.saveSnapshotSync)
 */
import type { BoardId } from '@domain/valueObjects/BoardId';
import type { IBoardRepository } from '@domain/repositories/IBoardRepository';
import type { BoardServerHandle } from '@domain/ports/IBoardServerPort';

export interface SaveSnapshotResult {
  readonly savedAt: number;
}

export class SaveBoardSnapshot {
  constructor(private readonly repo: IBoardRepository) {}

  /**
   * 활성 세션의 Y.Doc 상태를 즉시 저장.
   *
   * @param handle 현재 활성 세션의 서버 핸들 — 호출자가 활성 세션 보유 여부를 검증한 뒤 넘김
   */
  async execute(boardId: BoardId, handle: BoardServerHandle): Promise<SaveSnapshotResult> {
    const update = handle.encodeState();
    await this.repo.saveSnapshot(boardId, update);
    return { savedAt: Date.now() };
  }
}
