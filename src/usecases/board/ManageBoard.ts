/**
 * ManageBoard — 협업 보드 목록 CRUD 유스케이스
 *
 * Design §3.5 — 목록/생성/이름 변경/삭제.
 * FileBoardRepository 구현이 id 부여 및 파일 저장을 담당.
 */
import type { Board } from '@domain/entities/Board';
import type { BoardId } from '@domain/valueObjects/BoardId';
import type { IBoardRepository } from '@domain/repositories/IBoardRepository';

export class ManageBoard {
  constructor(private readonly repo: IBoardRepository) {}

  /** 저장된 보드 전체 (최신순) */
  async listAll(): Promise<Board[]> {
    return this.repo.listAll();
  }

  /**
   * 새 보드 생성. 기본 이름 "협업 보드 N"
   * (N = 현재 목록 개수 + 1). repo가 id 부여.
   */
  async create(name?: string): Promise<Board> {
    const resolvedName = name?.trim() ? name.trim() : await this.nextDefaultName();
    return this.repo.create({ name: resolvedName });
  }

  async rename(id: BoardId, name: string): Promise<Board> {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new Error('보드 이름은 비워둘 수 없습니다.');
    }
    return this.repo.rename(id, trimmed);
  }

  /**
   * 보드 삭제 — 세션 실행 중 여부는 상위(유스케이스 호출자)가 체크한 뒤 호출.
   * Design §3.5: "세션 실행 중이면 거부".
   * 본 유스케이스는 세션 상태를 모르므로 호출 측(electron/ipc/board.ts)에서
   * `YDocBoardServer.getActiveBoardId()` 체크 후 이 메서드 호출.
   */
  async delete(id: BoardId): Promise<void> {
    await this.repo.delete(id);
  }

  private async nextDefaultName(): Promise<string> {
    const existing = await this.repo.listAll();
    return `협업 보드 ${existing.length + 1}`;
  }
}
