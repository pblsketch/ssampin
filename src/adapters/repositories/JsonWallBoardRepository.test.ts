import { beforeEach, describe, expect, it } from 'vitest';
import type { IStoragePort } from '@domain/ports/IStoragePort';
import type {
  RealtimeWallColumn,
  RealtimeWallPost,
  WallBoard,
  WallBoardId,
} from '@domain/entities/RealtimeWall';
import { createWallBoard } from '@domain/rules/realtimeWallRules';
import { JsonWallBoardRepository, migratePostFields } from './JsonWallBoardRepository';

/**
 * In-memory IStoragePort for Repository integration testing.
 *
 * 실제 ElectronStorageAdapter는 userData/data/{filename}.json 파일을 다루지만,
 * unit test에서는 fs I/O 없이 Map 기반으로 대체한다. 주요 계약:
 *   - `read<T>(filename)` → 없으면 null
 *   - `write<T>(filename, data)` → JSON 왕복(structured clone) 시뮬레이션
 */
class FakeStorage implements IStoragePort {
  private store = new Map<string, string>();

  async read<T>(filename: string): Promise<T | null> {
    const raw = this.store.get(filename);
    if (raw === undefined) return null;
    return JSON.parse(raw) as T;
  }

  async write<T>(filename: string, data: T): Promise<void> {
    this.store.set(filename, JSON.stringify(data));
  }

  async remove(filename: string): Promise<void> {
    this.store.delete(filename);
  }

  // 바이너리 메서드는 WallBoard 저장에 사용되지 않음 — no-op stubs.
  async readBinary(): Promise<Uint8Array | null> { return null; }
  async writeBinary(): Promise<void> { /* noop */ }
  async removeBinary(): Promise<void> { /* noop */ }
  async listBinary(): Promise<readonly string[]> { return []; }

  has(filename: string): boolean {
    return this.store.has(filename);
  }

  get size(): number {
    return this.store.size;
  }
}

const columns: RealtimeWallColumn[] = [
  { id: 'column-1', title: '생각', order: 0 },
  { id: 'column-2', title: '질문', order: 1 },
];

function mkBoard(id: string, overrides?: Partial<WallBoard>): WallBoard {
  const base = createWallBoard({
    id: id as WallBoardId,
    title: `Board ${id}`,
    layoutMode: 'kanban',
    columns,
    now: 1000,
  });
  return { ...base, ...overrides };
}

function mkPost(id: string, overrides?: Partial<RealtimeWallPost>): RealtimeWallPost {
  return {
    id,
    nickname: `n-${id}`,
    text: `text-${id}`,
    status: 'approved',
    pinned: false,
    submittedAt: Number(id),
    kanban: { columnId: 'column-1', order: 0 },
    freeform: { x: 0, y: 0, w: 260, h: 180, zIndex: 0 },
    ...overrides,
  };
}

describe('JsonWallBoardRepository', () => {
  let storage: FakeStorage;
  let repo: JsonWallBoardRepository;

  beforeEach(() => {
    storage = new FakeStorage();
    repo = new JsonWallBoardRepository(storage);
  });

  describe('save + load 왕복', () => {
    it('빈 보드 저장 후 load로 동일 값 복원', async () => {
      const board = mkBoard('b1');
      await repo.save(board);
      const loaded = await repo.load('b1' as WallBoardId);
      expect(loaded).toEqual(board);
    });

    it('posts 포함 보드 저장 후 load로 posts 복원', async () => {
      const board: WallBoard = {
        ...mkBoard('b2'),
        posts: [mkPost('1'), mkPost('2', { status: 'pending' })],
      };
      await repo.save(board);
      const loaded = await repo.load('b2' as WallBoardId);
      expect(loaded).not.toBeNull();
      expect(loaded!.posts).toHaveLength(2);
      expect(loaded!.posts[0]!.id).toBe('1');
      expect(loaded!.posts[1]!.status).toBe('pending');
    });

    it('미존재 id는 null 반환', async () => {
      const loaded = await repo.load('nope' as WallBoardId);
      expect(loaded).toBeNull();
    });
  });

  describe('listAllMeta', () => {
    it('저장 시 index 자동 갱신 — 여러 보드 메타 조회', async () => {
      await repo.save(mkBoard('b1'));
      await repo.save(mkBoard('b2'));
      await repo.save(mkBoard('b3'));
      const metas = await repo.listAllMeta();
      expect(metas).toHaveLength(3);
      const ids = metas.map((m) => m.id).sort();
      expect(ids).toEqual(['b1', 'b2', 'b3']);
    });

    it('저장된 보드 없으면 빈 배열', async () => {
      const metas = await repo.listAllMeta();
      expect(metas).toEqual([]);
    });

    it('previewPosts에 approved posts 상위 6개 반영', async () => {
      const posts: RealtimeWallPost[] = Array.from({ length: 10 }, (_, i) =>
        mkPost(String(i + 1), { submittedAt: i + 1 }),
      );
      const board: WallBoard = { ...mkBoard('b1'), posts };
      await repo.save(board);
      const metas = await repo.listAllMeta();
      expect(metas).toHaveLength(1);
      expect(metas[0]!.postCount).toBe(10);
      expect(metas[0]!.approvedCount).toBe(10);
      expect(metas[0]!.previewPosts).toHaveLength(6);
    });
  });

  describe('delete', () => {
    it('파일 + index entry 제거', async () => {
      await repo.save(mkBoard('b1'));
      await repo.save(mkBoard('b2'));
      expect(storage.has('wall-board-b1')).toBe(true);

      await repo.delete('b1' as WallBoardId);
      expect(storage.has('wall-board-b1')).toBe(false);

      const metas = await repo.listAllMeta();
      expect(metas.map((m) => m.id)).toEqual(['b2']);
    });

    it('미존재 id 삭제는 조용히 성공 (no-op)', async () => {
      await expect(repo.delete('nope' as WallBoardId)).resolves.not.toThrow();
    });
  });

  describe('getByShortCode', () => {
    it('shortCode로 보드 역조회 성공', async () => {
      const board = { ...mkBoard('b1'), shortCode: 'ABC123' };
      await repo.save(board);
      const found = await repo.getByShortCode('ABC123');
      expect(found?.id).toBe('b1');
    });

    it('미등록 shortCode는 null', async () => {
      await repo.save(mkBoard('b1'));
      const found = await repo.getByShortCode('XYZ999');
      expect(found).toBeNull();
    });
  });

  describe('likes → teacherHearts 마이그레이션 (Design §2.5)', () => {
    it('load 시 legacy `likes` 필드를 `teacherHearts`로 변환', async () => {
      // 직접 legacy 포맷으로 저장 (실제로는 과거 WIP 빌드에서 쓰일 수 있음)
      const legacyBoard = {
        ...mkBoard('b1'),
        posts: [
          {
            id: '1',
            nickname: 'n',
            text: 't',
            status: 'approved',
            pinned: false,
            submittedAt: 1,
            likes: 7, // legacy field
            kanban: { columnId: 'column-1', order: 0 },
            freeform: { x: 0, y: 0, w: 260, h: 180, zIndex: 0 },
          },
        ],
      };
      await storage.write('wall-board-b1', legacyBoard);

      const loaded = await repo.load('b1' as WallBoardId);
      expect(loaded).not.toBeNull();
      expect(loaded!.posts[0]!.teacherHearts).toBe(7);
      expect((loaded!.posts[0] as { likes?: number }).likes).toBeUndefined();
    });

    it('teacherHearts가 이미 있으면 likes는 무시', async () => {
      const post = {
        id: '1',
        nickname: 'n',
        text: 't',
        status: 'approved' as const,
        pinned: false,
        submittedAt: 1,
        teacherHearts: 3,
        likes: 7, // 무시되어야 함
        kanban: { columnId: 'column-1', order: 0 },
        freeform: { x: 0, y: 0, w: 260, h: 180, zIndex: 0 },
      };
      const migrated = migratePostFields(post);
      expect(migrated.teacherHearts).toBe(3);
    });
  });
});
