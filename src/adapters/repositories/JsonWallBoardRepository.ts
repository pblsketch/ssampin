/**
 * JsonWallBoardRepository — IWallBoardRepository 구현
 *
 * IStoragePort를 주입받아 `wall-boards-index.json`과 `wall-boards/{id}`
 * 파일 두 계층으로 저장한다. 목록(listAllMeta)은 index 한 번 read로 끝나고,
 * 재열기(load)만 per-board 파일을 read. Design §3.2.
 *
 * 기존 `JsonXxxRepository` 패턴(IStoragePort만 주입)을 그대로 따른다.
 *
 * 주요 규칙:
 *   - 저장(save) 시 index entry도 함께 갱신하여 목록 일관성 유지
 *   - load 시 posts에 `migratePostFields` 적용 (likes → teacherHearts 호환)
 *   - shortCode는 호출자가 주입 (Repository는 주입받은 값만 저장, 재발급 안 함)
 */
import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IWallBoardRepository } from '@domain/repositories/IWallBoardRepository';
import type {
  RealtimeWallPost,
  WallBoard,
  WallBoardId,
  WallBoardMeta,
} from '@domain/entities/RealtimeWall';
import { normalizePostForPadletMode, toWallBoardMeta } from '@domain/rules/realtimeWallRules';

const INDEX_FILE = 'wall-boards-index';
/**
 * 저장 파일명 prefix. 평면(flat) 네임스페이스로 저장한다.
 *
 * 설계 결정: Electron `data:write` IPC가 서브디렉토리를 자동 생성하지 않아
 * `wall-boards/{id}.json` 경로는 실패한다. 따라서 `wall-board-{id}` 형태로
 * 같은 `data/` 디렉토리 안에 평면 배치한다 (collab-board는 별도 저장 경로라
 * 충돌 없음, realtime-wall 용 보드만 이 prefix를 공유).
 */
const BOARD_FILE_PREFIX = 'wall-board-';

function boardFile(id: WallBoardId): string {
  return `${BOARD_FILE_PREFIX}${id}`;
}

interface WallBoardIndex {
  readonly version: 1;
  readonly boards: readonly WallBoardMeta[];
}

/**
 * posts 하위 호환 마이그레이션.
 *
 * 기존 로컬 테스트 데이터에서 `likes` 필드로 저장된 경우를 `teacherHearts`로
 * 변환. v1.13.1에서 제거 예정 (Design §2.5 step 1).
 *
 * v1.14 (padlet mode)에서 `likes`/`likedBy`/`comments`가 학생 좋아요·댓글 필드로
 * 도입되었으므로, v1.14 형태를 구 v1.13.0 포맷으로 오인해 `likes`를 `teacherHearts`로
 * 이관하는 사고를 막기 위해 판정 조건을 강화한다:
 *   - `likedBy` 또는 `comments` 필드가 존재하면 v1.14 데이터 → 레거시 remap skip
 *   - `teacherHearts`가 이미 정의되어 있으면 skip (v1.13.1 이후 데이터)
 */
export function migratePostFields(post: unknown): RealtimeWallPost {
  if (typeof post !== 'object' || post === null) {
    // 타입이 틀어진 데이터는 그대로 반환 — 호출자가 방어
    return post as RealtimeWallPost;
  }
  const raw = post as RealtimeWallPost & { likes?: number };
  const isV14Data = raw.likedBy !== undefined || raw.comments !== undefined;
  if (
    raw.likes !== undefined &&
    raw.teacherHearts === undefined &&
    !isV14Data
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { likes, ...rest } = raw;
    return { ...rest, teacherHearts: likes };
  }
  return raw;
}

function migrateBoard(board: WallBoard): WallBoard {
  // 1) v1.13.0 호환: likes → teacherHearts 필드 이관
  // 2) v1.14 padlet mode: likes/likedBy/comments 기본값 주입 (Design §8)
  return {
    ...board,
    posts: board.posts.map((p) => normalizePostForPadletMode(migratePostFields(p))),
  };
}

export class JsonWallBoardRepository implements IWallBoardRepository {
  constructor(private readonly storage: IStoragePort) {}

  async listAllMeta(): Promise<readonly WallBoardMeta[]> {
    const idx = await this.readIndex();
    return idx.boards;
  }

  async load(id: WallBoardId): Promise<WallBoard | null> {
    const raw = await this.storage.read<WallBoard>(boardFile(id));
    if (raw === null) return null;
    return migrateBoard(raw);
  }

  async getByShortCode(shortCode: string): Promise<WallBoard | null> {
    const idx = await this.readIndex();
    const meta = idx.boards.find((b) => b.shortCode === shortCode);
    if (!meta) return null;
    return this.load(meta.id);
  }

  async save(board: WallBoard): Promise<void> {
    await this.storage.write<WallBoard>(boardFile(board.id), board);
    await this.upsertIndexEntry(board);
  }

  async delete(id: WallBoardId): Promise<void> {
    await this.storage.remove(boardFile(id));
    await this.removeIndexEntry(id);
  }

  // =====================================================================
  // internal — index.json helpers
  // =====================================================================

  private async readIndex(): Promise<WallBoardIndex> {
    const raw = await this.storage.read<WallBoardIndex>(INDEX_FILE);
    if (raw === null || typeof raw !== 'object') {
      return { version: 1, boards: [] };
    }
    if (!Array.isArray(raw.boards)) {
      return { version: 1, boards: [] };
    }
    return raw;
  }

  private async writeIndex(idx: WallBoardIndex): Promise<void> {
    await this.storage.write<WallBoardIndex>(INDEX_FILE, idx);
  }

  private async upsertIndexEntry(board: WallBoard): Promise<void> {
    const idx = await this.readIndex();
    const meta = toWallBoardMeta(board);
    const existing = idx.boards.findIndex((b) => b.id === board.id);
    const nextBoards =
      existing >= 0
        ? idx.boards.map((b, i) => (i === existing ? meta : b))
        : [...idx.boards, meta];
    await this.writeIndex({ version: 1, boards: nextBoards });
  }

  private async removeIndexEntry(id: WallBoardId): Promise<void> {
    const idx = await this.readIndex();
    const nextBoards = idx.boards.filter((b) => b.id !== id);
    await this.writeIndex({ version: 1, boards: nextBoards });
  }
}
