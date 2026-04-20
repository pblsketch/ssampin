/**
 * BoardFilePersistence — 보드 메타·Y.Doc 바이너리의 파일시스템 저장 유틸
 *
 * Electron `userData/data/boards/` 하위:
 *   - `{boardId}.json` : 메타데이터 (Board 엔티티)
 *   - `{boardId}.ybin` : Y.Doc 바이너리 (Y.encodeStateAsUpdate)
 *
 * FileBoardRepository(adapters 레이어)가 사용. Design §3.2-bis before-quit
 * 동기 저장을 위해 sync 버전 함수도 노출.
 */
import fs from 'fs';
import path from 'path';

import type { Board } from '@domain/entities/Board';
import type { BoardId } from '@domain/valueObjects/BoardId';

import {
  BOARDS_DIR_NAME,
  SNAPSHOT_FILE_EXT,
  META_FILE_EXT,
} from './constants';

export class BoardFilePersistence {
  private readonly boardsDir: string;

  constructor(userDataDir: string) {
    this.boardsDir = path.join(userDataDir, 'data', BOARDS_DIR_NAME);
    if (!fs.existsSync(this.boardsDir)) {
      fs.mkdirSync(this.boardsDir, { recursive: true });
    }
  }

  private snapshotPath(id: BoardId): string {
    return path.join(this.boardsDir, `${id}${SNAPSHOT_FILE_EXT}`);
  }

  private metaPath(id: BoardId): string {
    return path.join(this.boardsDir, `${id}${META_FILE_EXT}`);
  }

  async listAllMeta(): Promise<Board[]> {
    const files = await fs.promises.readdir(this.boardsDir);
    const metaFiles = files.filter((f) => f.endsWith(META_FILE_EXT));
    const boards: Board[] = [];
    for (const f of metaFiles) {
      try {
        const raw = await fs.promises.readFile(path.join(this.boardsDir, f), 'utf8');
        const meta = JSON.parse(raw) as Board;
        const snapshotExists = fs.existsSync(this.snapshotPath(meta.id));
        boards.push({ ...meta, hasSnapshot: snapshotExists });
      } catch {
        // 손상된 메타는 skip
      }
    }
    boards.sort((a, b) => b.updatedAt - a.updatedAt);
    return boards;
  }

  async getMeta(id: BoardId): Promise<Board | null> {
    const p = this.metaPath(id);
    if (!fs.existsSync(p)) return null;
    const raw = await fs.promises.readFile(p, 'utf8');
    const meta = JSON.parse(raw) as Board;
    return { ...meta, hasSnapshot: fs.existsSync(this.snapshotPath(id)) };
  }

  async saveMeta(board: Board): Promise<void> {
    await fs.promises.writeFile(this.metaPath(board.id), JSON.stringify(board, null, 2), 'utf8');
  }

  async deleteAll(id: BoardId): Promise<void> {
    for (const p of [this.metaPath(id), this.snapshotPath(id)]) {
      if (fs.existsSync(p)) {
        await fs.promises.unlink(p);
      }
    }
  }

  async saveSnapshot(id: BoardId, update: Uint8Array): Promise<void> {
    await fs.promises.writeFile(this.snapshotPath(id), Buffer.from(update));
  }

  async loadSnapshot(id: BoardId): Promise<Uint8Array | null> {
    const p = this.snapshotPath(id);
    if (!fs.existsSync(p)) return null;
    const buf = await fs.promises.readFile(p);
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  /** before-quit 동기 저장 — Design §3.2-bis */
  saveSnapshotSync(id: BoardId, update: Uint8Array): void {
    fs.writeFileSync(this.snapshotPath(id), Buffer.from(update));
  }

  saveMetaSync(board: Board): void {
    fs.writeFileSync(this.metaPath(board.id), JSON.stringify(board, null, 2), 'utf8');
  }
}
